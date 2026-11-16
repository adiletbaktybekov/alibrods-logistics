import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserRole, OrderStatus, AssignmentStatus } from '@prisma/client';
import { ConflictError, ForbiddenError, NotFoundError } from '@/lib/errors';

// Mock prisma for unit tests
const mockFindUniqueClient = vi.fn();
const mockFindUniqueDriver = vi.fn();
const mockTransaction = vi.fn();
const mockAuditLog = vi.fn();

vi.mock('@/database/prisma', () => ({
  prisma: {
    clientProfile: {
      findUnique: (...args: any[]) => mockFindUniqueClient(...args),
    },
    driverProfile: {
      findUnique: (...args: any[]) => mockFindUniqueDriver(...args),
    },
    $transaction: (fn: any) => mockTransaction(fn),
  },
}));

vi.mock('@/modules/audit/audit.service', () => ({
  AuditService: {
    log: (...args: any[]) => mockAuditLog(...args),
  },
}));

import { ClientsService } from '@/modules/clients/clients.service';
import { DriversService } from '@/modules/drivers/drivers.service';

describe('Account Deletion Service (Clients & Drivers)', () => {
  const originalEnv = process.env.DATABASE_URL;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
  });

  describe('1. ClientsService.deleteClient', () => {
    it('should throw NotFoundError if client does not exist', async () => {
      mockFindUniqueClient.mockResolvedValueOnce(null);

      await expect(
        ClientsService.deleteClient('non-existent-id', 'admin-id')
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw ForbiddenError if trying to delete a SUPER_ADMIN', async () => {
      mockFindUniqueClient.mockResolvedValueOnce({
        id: 'client-1',
        userId: 'user-superadmin',
        companyName: 'Super Admin Co',
        user: { role: UserRole.SUPER_ADMIN },
        orders: [],
      });

      await expect(
        ClientsService.deleteClient('client-1', 'admin-id')
      ).rejects.toThrow(ForbiddenError);
    });

    it('should throw ForbiddenError if trying to delete own account', async () => {
      mockFindUniqueClient.mockResolvedValueOnce({
        id: 'client-1',
        userId: 'user-admin-self',
        companyName: 'Self Admin Co',
        user: { role: UserRole.ADMIN },
        orders: [],
      });

      await expect(
        ClientsService.deleteClient('client-1', 'user-admin-self')
      ).rejects.toThrow('Нельзя удалить свой собственный аккаунт');
    });

    it('should throw ConflictError if client has active (non-terminal) orders', async () => {
      mockFindUniqueClient.mockResolvedValueOnce({
        id: 'client-1',
        userId: 'user-client-1',
        companyName: 'Active Client Co',
        user: { role: UserRole.CLIENT, phone: '+79991112233' },
        orders: [
          { id: 'order-1', orderNumber: 'AB-1001', status: OrderStatus.CONFIRMED },
          { id: 'order-2', orderNumber: 'AB-1002', status: OrderStatus.COMPLETED },
        ],
      });

      await expect(
        ClientsService.deleteClient('client-1', 'admin-id')
      ).rejects.toThrow(ConflictError);
    });

    it('should perform hard delete when client has 0 orders', async () => {
      mockFindUniqueClient.mockResolvedValueOnce({
        id: 'client-zero',
        userId: 'user-client-zero',
        companyName: 'Zero Orders Co',
        contactPhone: '+79990000000',
        user: { role: UserRole.CLIENT, phone: '+79990000000', email: 'zero@example.com' },
        orders: [],
      });

      const mockTx = {
        telegramPairingCode: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
        telegramAccount: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
        clientProfile: { delete: vi.fn().mockResolvedValue({}) },
        user: { delete: vi.fn().mockResolvedValue({}) },
      };

      mockTransaction.mockImplementationOnce(async (callback: any) => {
        return callback(mockTx);
      });

      const res = await ClientsService.deleteClient('client-zero', 'admin-id');

      expect(res.success).toBe(true);
      expect(mockTx.clientProfile.delete).toHaveBeenCalledWith({ where: { id: 'client-zero' } });
      expect(mockTx.user.delete).toHaveBeenCalledWith({ where: { id: 'user-client-zero' } });
      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          resource: 'ClientProfile',
          resourceId: 'client-zero',
          metadata: expect.objectContaining({ mode: 'HARD_DELETE_ZERO_ORDERS' }),
        })
      );
    });

    it('should perform safe archival when client has only completed/cancelled orders', async () => {
      mockFindUniqueClient.mockResolvedValueOnce({
        id: 'client-archival',
        userId: 'user-client-archival',
        companyName: 'Archival Co',
        contactPhone: '+79998887766',
        user: { role: UserRole.CLIENT, phone: '+79998887766', email: 'archive@test.ru' },
        orders: [
          { id: 'order-1', orderNumber: 'AB-2001', status: OrderStatus.COMPLETED },
          { id: 'order-2', orderNumber: 'AB-2002', status: OrderStatus.CANCELLED },
        ],
      });

      const mockTx = {
        telegramPairingCode: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
        telegramAccount: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
        clientProfile: { update: vi.fn().mockResolvedValue({}) },
        user: { update: vi.fn().mockResolvedValue({}) },
      };

      mockTransaction.mockImplementationOnce(async (callback: any) => {
        return callback(mockTx);
      });

      const res = await ClientsService.deleteClient('client-archival', 'admin-id');

      expect(res.success).toBe(true);
      expect(res.message).toContain('сохранена в архиве');
      expect(mockTx.telegramAccount.deleteMany).toHaveBeenCalled();
      expect(mockTx.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-client-archival' },
          data: expect.objectContaining({
            isActive: false,
            passwordHash: null,
          }),
        })
      );
      expect(mockTx.clientProfile.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'client-archival' },
          data: expect.objectContaining({
            companyName: expect.stringContaining('[Удалён]'),
          }),
        })
      );
      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          resource: 'ClientProfile',
          metadata: expect.objectContaining({ mode: 'SAFE_ARCHIVE_WITH_HISTORY' }),
        })
      );
    });
  });

  describe('2. DriversService.deleteDriver', () => {
    it('should throw NotFoundError if driver does not exist', async () => {
      mockFindUniqueDriver.mockResolvedValueOnce(null);

      await expect(
        DriversService.deleteDriver('non-existent-driver', 'admin-id')
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw ForbiddenError if driver user is SUPER_ADMIN', async () => {
      mockFindUniqueDriver.mockResolvedValueOnce({
        id: 'driver-1',
        userId: 'user-superadmin-driver',
        fullName: 'Super Driver',
        user: { role: UserRole.SUPER_ADMIN },
        assignments: [],
      });

      await expect(
        DriversService.deleteDriver('driver-1', 'admin-id')
      ).rejects.toThrow(ForbiddenError);
    });

    it('should throw ConflictError if driver has active assignments', async () => {
      mockFindUniqueDriver.mockResolvedValueOnce({
        id: 'driver-active',
        userId: 'user-driver-active',
        fullName: 'Active Driver',
        user: { role: UserRole.DRIVER, phone: '+79993334455' },
        assignments: [
          {
            id: 'asg-1',
            status: AssignmentStatus.ASSIGNED,
            order: { orderNumber: 'AB-3001' },
          },
        ],
      });

      await expect(
        DriversService.deleteDriver('driver-active', 'admin-id')
      ).rejects.toThrow(ConflictError);
    });

    it('should perform hard delete when driver has 0 assignments', async () => {
      mockFindUniqueDriver.mockResolvedValueOnce({
        id: 'driver-zero',
        userId: 'user-driver-zero',
        fullName: 'Zero Assignments Driver',
        user: { role: UserRole.DRIVER, phone: '+79995556677' },
        assignments: [],
      });

      const mockTx = {
        telegramPairingCode: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
        telegramAccount: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
        driverProfile: { delete: vi.fn().mockResolvedValue({}) },
        user: { delete: vi.fn().mockResolvedValue({}) },
      };

      mockTransaction.mockImplementationOnce(async (callback: any) => {
        return callback(mockTx);
      });

      const res = await DriversService.deleteDriver('driver-zero', 'admin-id');

      expect(res.success).toBe(true);
      expect(mockTx.driverProfile.delete).toHaveBeenCalledWith({ where: { id: 'driver-zero' } });
      expect(mockTx.user.delete).toHaveBeenCalledWith({ where: { id: 'user-driver-zero' } });
      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          resource: 'DriverProfile',
          metadata: expect.objectContaining({ mode: 'HARD_DELETE_ZERO_ASSIGNMENTS' }),
        })
      );
    });

    it('should perform safe archival when driver has historical completed/cancelled assignments', async () => {
      mockFindUniqueDriver.mockResolvedValueOnce({
        id: 'driver-historical',
        userId: 'user-driver-historical',
        fullName: 'Historical Driver',
        user: { role: UserRole.DRIVER, phone: '+79997778899', email: 'driver@test.ru' },
        assignments: [
          {
            id: 'asg-1',
            status: AssignmentStatus.COMPLETED,
            order: { orderNumber: 'AB-4001' },
          },
        ],
      });

      const mockTx = {
        telegramPairingCode: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
        telegramAccount: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
        driverProfile: { update: vi.fn().mockResolvedValue({}) },
        user: { update: vi.fn().mockResolvedValue({}) },
      };

      mockTransaction.mockImplementationOnce(async (callback: any) => {
        return callback(mockTx);
      });

      const res = await DriversService.deleteDriver('driver-historical', 'admin-id');

      expect(res.success).toBe(true);
      expect(mockTx.driverProfile.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'driver-historical' },
          data: expect.objectContaining({
            isAvailable: false,
            fullName: expect.stringContaining('[Удалён]'),
          }),
        })
      );
      expect(mockTx.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-driver-historical' },
          data: expect.objectContaining({
            isActive: false,
            passwordHash: null,
          }),
        })
      );
      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          resource: 'DriverProfile',
          metadata: expect.objectContaining({ mode: 'SAFE_ARCHIVE_WITH_HISTORY' }),
        })
      );
    });
  });
});
