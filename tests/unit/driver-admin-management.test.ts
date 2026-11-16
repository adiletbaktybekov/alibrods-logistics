import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/database/prisma', async () => {
  const { createMockPrisma } = await import('../mocks/mock-prisma');
  const mockPrisma = createMockPrisma();
  return {
    prisma: mockPrisma.mockClient,
    __mockPrismaContext: mockPrisma,
  };
 });

import { DriversService } from '@/modules/drivers/drivers.service';
import { ConflictError, NotFoundError } from '@/lib/errors';

const validAdminUserId = '11111111-2222-3333-4444-555555555555';

describe('DriversService: Admin Driver Management & Telegram Unlinking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
  });

  describe('updateDriverByAdmin', () => {
    it('successfully updates driver details (fullName, phone, vehicle, availability)', async () => {
      const result = await DriversService.updateDriverByAdmin(
        'driver-uuid-1',
        {
          fullName: 'Иванов Иван Иванович',
          phone: '+7 (999) 111-22-33',
          vehicleModel: 'Газель Next 2023',
          vehiclePlateNumber: 'A123BC77',
          notes: 'Проверенный водитель',
          isAvailable: true,
          isActive: true,
        },
        validAdminUserId,
        '127.0.0.1'
      );

      expect(result.success).toBe(true);
      expect(result.message).toContain('Иванов Иван Иванович');
    });

    it('rejects update when fullName is too short', async () => {
      await expect(
        DriversService.updateDriverByAdmin(
          'driver-uuid-1',
          {
            fullName: 'A',
            phone: '+79991112233',
          },
          validAdminUserId
        )
      ).rejects.toThrow('ФИО водителя должно содержать минимум 2 символа');
    });

    it('rejects update when phone is invalid', async () => {
      await expect(
        DriversService.updateDriverByAdmin(
          'driver-uuid-1',
          {
            fullName: 'Иванов Иван',
            phone: 'not-a-phone',
          },
          validAdminUserId
        )
      ).rejects.toThrow('Укажите корректный номер телефона');
    });

    it('rejects update if phone is already taken by another user', async () => {
      // +79992223344 is taken by driver-uuid-2
      await expect(
        DriversService.updateDriverByAdmin(
          'driver-uuid-1',
          {
            fullName: 'Иванов Иван',
            phone: '+79992223344',
          },
          validAdminUserId
        )
      ).rejects.toBeInstanceOf(ConflictError);
    });

    it('throws NotFoundError for non-existent driver', async () => {
      const { prisma } = await import('@/database/prisma');
      (prisma.driverProfile.findUnique as any).mockResolvedValueOnce(null);

      await expect(
        DriversService.updateDriverByAdmin(
          'non-existent-uuid',
          {
            fullName: 'Тестовый',
            phone: '+79998887766',
          },
          validAdminUserId
        )
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('unlinkTelegram', () => {
    it('safely unlinks Telegram account and removes pairing codes', async () => {
      const result = await DriversService.unlinkTelegram(
        'driver-uuid-1',
        validAdminUserId,
        '127.0.0.1'
      );

      expect(result.success).toBe(true);
      expect(result.message).toContain('успешно отвязан');
    });

    it('throws NotFoundError when trying to unlink non-existent driver', async () => {
      const { prisma } = await import('@/database/prisma');
      (prisma.driverProfile.findUnique as any).mockResolvedValueOnce(null);

      await expect(
        DriversService.unlinkTelegram('non-existent-driver', validAdminUserId)
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });
});
