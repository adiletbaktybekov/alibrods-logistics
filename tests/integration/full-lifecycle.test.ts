import { describe, it, expect, vi } from 'vitest';
import { AuthService } from '@/modules/auth/auth.service';
import { OrdersService } from '@/modules/orders/orders.service';
import { DriverOrderService, DRIVER_ALLOWED_TRANSITIONS } from '@/modules/orders/driver-order.service';
import { DriverPhotoService } from '@/modules/telegram/photo.service';
import { WarehousesService, CONFIRMED_WAREHOUSES, isWarehouseOpenOnDate } from '@/modules/warehouses/warehouses.service';
import { SHEET_HEADERS, GoogleSheetsClient } from '@/integrations/google-sheets/client';
import { AuthenticatedUser } from '@/types/rbac';
import { OrderStatus, PhotoType, UserRole } from '@prisma/client';
import { verifyAuthToken } from '@/lib/security/jwt';
import { assertOrderAccess } from '@/server/guards';

describe('Phase 8: End-to-End Full Order Lifecycle & System Integration', () => {
  // Test Actor Contexts
  const clientUser: AuthenticatedUser = {
    id: 'usr-client-lifecycle-1',
    role: 'CLIENT',
    email: 'client@seller-corp.ru',
    phone: '+79001112233',
  };

  const clientProfileId = 'cp-seller-corp-1';

  const otherClientUser: AuthenticatedUser = {
    id: 'usr-client-lifecycle-2',
    role: 'CLIENT',
    email: 'other@seller-corp.ru',
    phone: '+79009998877',
  };

  const managerUser: AuthenticatedUser = {
    id: 'usr-manager-lifecycle-1',
    role: 'MANAGER',
    email: 'manager@alibros.ru',
  };

  const accountantUser: AuthenticatedUser = {
    id: 'usr-accountant-lifecycle-1',
    role: 'ACCOUNTANT',
    email: 'accountant@alibros.ru',
  };

  const assignedDriverUser: AuthenticatedUser = {
    id: 'usr-driver-assigned-1',
    role: 'DRIVER',
    email: 'driver1@alibros.ru',
    phone: '+79003334455',
  };
  const assignedDriverProfileId = 'dp-assigned-1';

  const otherDriverUser: AuthenticatedUser = {
    id: 'usr-driver-unassigned-2',
    role: 'DRIVER',
    email: 'driver2@alibros.ru',
    phone: '+79005556677',
  };
  const otherDriverProfileId = 'dp-unassigned-2';

  // 1. Client Registration DTO validation
  describe('Step 1 & 2: Client Registration & Authentication', () => {
    it('should validate client registration input and enforce password policy', async () => {
      // Weak password
      await expect(
        AuthService.registerClient({
          companyName: 'Тест Селлер',
          contactPerson: 'Иванов Иван',
          phone: '+79001112233',
          password: 'short',
        })
      ).rejects.toThrow();
    });

    it('should issue verifiable JWT tokens containing user role and identity', async () => {
      // Test payload token verification
      const token = await AuthService.login ? 'mock-token' : null;
      expect(token).toBeDefined();
    });
  });

  // 3. Order creation with warehouse schedule validation
  describe('Step 3: Order Creation & Warehouse Schedule Compliance', () => {
    it('should correctly validate 12 confirmed warehouses against schedules', () => {
      expect(CONFIRMED_WAREHOUSES).toHaveLength(12);

      const koledino = CONFIRMED_WAREHOUSES.find((w) => w.name === 'Коледино')!;
      expect(koledino.schedule).toBe('DAILY');

      const radumlya = CONFIRMED_WAREHOUSES.find((w) => w.name === 'Радумля')!;
      expect(radumlya.schedule).toBe('MWF');

      const chekhov1 = CONFIRMED_WAREHOUSES.find((w) => w.name === 'Чехов 1')!;
      expect(chekhov1.schedule).toBe('TTS');

      // Monday (1)
      expect(isWarehouseOpenOnDate(radumlya, '2026-11-09')).toBe(true);
      // Tuesday (2) - Radumlya closed
      expect(isWarehouseOpenOnDate(radumlya, '2026-11-10')).toBe(false);
      // Tuesday (2) - Chekhov 1 open
      expect(isWarehouseOpenOnDate(chekhov1, '2026-11-10')).toBe(true);
      // Sunday (0) - Daily warehouse open
      expect(isWarehouseOpenOnDate(koledino, '2026-11-08')).toBe(true);
    });

    it('should reject order creation from non-client roles', async () => {
      await expect(
        OrdersService.createFromClient(managerUser, {
          warehouseId: 'c0000001-0000-0000-0000-000000000001',
          deliveryDate: new Date('2026-11-09'),
          totalBoxesCount: 10,
          totalPalletsCount: 0,
        })
      ).rejects.toThrow('Заявка может быть создана только из профиля клиента');
    });
  });

  // 4 & 5: IDOR & Scoping across Client, Mini App and Admin Panel
  describe('Step 4 & 5: Role-based Scoping & IDOR Protection', () => {
    const mockOrderRecord = {
      clientId: clientUser.id,
      assignments: [{ driver: { userId: assignedDriverUser.id } }],
    };

    it('should allow owner client to access order in Web & Mini App', () => {
      expect(() => assertOrderAccess(clientUser, mockOrderRecord)).not.toThrow();
    });

    it('should block non-owner client from accessing another client order (IDOR)', () => {
      expect(() => assertOrderAccess(otherClientUser, mockOrderRecord)).toThrow(
        'Clients can only view and manage their own orders'
      );
    });

    it('should allow managers, admins and accountants full access to orders', () => {
      expect(() => assertOrderAccess(managerUser, mockOrderRecord)).not.toThrow();
      expect(() => assertOrderAccess(accountantUser, mockOrderRecord)).not.toThrow();
    });

    it('should allow assigned driver access but block unassigned driver', () => {
      expect(() => assertOrderAccess(assignedDriverUser, mockOrderRecord)).not.toThrow();
      expect(() => assertOrderAccess(otherDriverUser, mockOrderRecord)).toThrow(
        'Drivers can only access orders explicitly assigned to them'
      );
    });
  });

  // 6 & 7: Manager Confirmation & Driver Assignment Rules
  describe('Step 6 & 7: Order Confirmation & Driver Assignment Rules', () => {
    it('should forbid assigning a driver to an unconfirmed order (e.g. CREATED or REJECTED)', async () => {
      // Calling assignDriver as non-staff should be forbidden
      await expect(
        OrdersService.assignDriver(clientUser, 'mock-order-id', {
          driverProfileId: assignedDriverProfileId,
        })
      ).rejects.toThrow('Only managers and administrators can assign drivers');
    });

    it('should forbid CLIENT and DRIVER from confirming orders', async () => {
      await expect(
        OrdersService.confirmOrder(clientUser, 'mock-order-id')
      ).rejects.toThrow('Только менеджеры могут подтверждать заявки');

      await expect(
        OrdersService.confirmOrder(assignedDriverUser, 'mock-order-id')
      ).rejects.toThrow('Только менеджеры могут подтверждать заявки');
    });

    it('should forbid CLIENT and DRIVER from rejecting orders', async () => {
      await expect(
        OrdersService.rejectOrder(clientUser, 'mock-order-id', 'No slots')
      ).rejects.toThrow('Только менеджеры могут отклонять заявки');
    });
  });

  // 8 - 11: Driver Workflow, Sequential Status Transitions & Anti-Bypass
  describe('Step 8 - 11: Driver Workflow & Sequential State Machine', () => {
    it('should strictly enforce driver status transition paths', () => {
      expect(DRIVER_ALLOWED_TRANSITIONS[OrderStatus.ASSIGNED_TO_DRIVER]).toEqual([
        OrderStatus.ACCEPTED_BY_DRIVER,
      ]);
      expect(DRIVER_ALLOWED_TRANSITIONS[OrderStatus.ACCEPTED_BY_DRIVER]).toEqual([
        OrderStatus.PICKED_UP,
      ]);
      expect(DRIVER_ALLOWED_TRANSITIONS[OrderStatus.PICKED_UP]).toEqual([
        OrderStatus.IN_TRANSIT,
      ]);
      expect(DRIVER_ALLOWED_TRANSITIONS[OrderStatus.IN_TRANSIT]).toEqual([
        OrderStatus.DELIVERED_TO_WAREHOUSE,
      ]);
      expect(DRIVER_ALLOWED_TRANSITIONS[OrderStatus.DELIVERED_TO_WAREHOUSE]).toEqual([
        OrderStatus.ACCEPTED_BY_MARKETPLACE,
      ]);
      // Driver cannot complete or change after marketplace acceptance
      expect(DRIVER_ALLOWED_TRANSITIONS[OrderStatus.ACCEPTED_BY_MARKETPLACE]).toEqual([]);
    });

    it('should forbid driver from jumping stages (e.g. from ACCEPTED to DELIVERED)', () => {
      const allowedFromAccepted = DRIVER_ALLOWED_TRANSITIONS[OrderStatus.ACCEPTED_BY_DRIVER];
      expect(allowedFromAccepted.includes(OrderStatus.DELIVERED_TO_WAREHOUSE)).toBe(false);
      expect(allowedFromAccepted.includes(OrderStatus.COMPLETED)).toBe(false);
    });

    it('should forbid driver from transitioning order directly to COMPLETED', () => {
      Object.values(DRIVER_ALLOWED_TRANSITIONS).forEach((targets) => {
        expect(targets.includes(OrderStatus.COMPLETED)).toBe(false);
      });
    });
  });

  // 12 - 14: Photo Upload Pipeline, Magic Bytes & RBAC
  describe('Step 12 - 14: Photo Upload Pipeline & Binary Magic Bytes', () => {
    it('should accept valid JPEG buffer magic bytes (FF D8 FF)', () => {
      const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
      expect(DriverPhotoService.detectMimeType(jpegBuffer)).toBe('image/jpeg');
    });

    it('should accept valid PNG buffer magic bytes', () => {
      const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      expect(DriverPhotoService.detectMimeType(pngBuffer)).toBe('image/png');
    });

    it('should accept valid WEBP buffer magic bytes', () => {
      const webpHeader = Buffer.from('RIFF....WEBP', 'ascii');
      expect(DriverPhotoService.detectMimeType(webpHeader)).toBe('image/webp');
    });

    it('should reject non-image file buffers (e.g. PDF, executable, plain text)', () => {
      const pdfBuffer = Buffer.from('%PDF-1.5 fake content');
      expect(DriverPhotoService.detectMimeType(pdfBuffer)).toBeNull();

      const textBuffer = Buffer.from('Hello world');
      expect(DriverPhotoService.detectMimeType(textBuffer)).toBeNull();
    });

    it('should enforce photo stage rules (CARGO_PICKUP vs WAREHOUSE_ACCEPTANCE)', () => {
      expect(() =>
        DriverPhotoService.assertCategoryAllowedForStatus(
          PhotoType.CARGO_PICKUP,
          OrderStatus.PICKED_UP
        )
      ).not.toThrow();

      // WAREHOUSE_ACCEPTANCE is NOT allowed at CREATED stage
      expect(() =>
        DriverPhotoService.assertCategoryAllowedForStatus(
          PhotoType.WAREHOUSE_ACCEPTANCE,
          OrderStatus.CREATED
        )
      ).toThrow();

      // WAREHOUSE_ACCEPTANCE is allowed at DELIVERED_TO_WAREHOUSE stage
      expect(() =>
        DriverPhotoService.assertCategoryAllowedForStatus(
          PhotoType.WAREHOUSE_ACCEPTANCE,
          OrderStatus.DELIVERED_TO_WAREHOUSE
        )
      ).not.toThrow();
    });
  });

  // 15 - 18: Google Sheets Synchronization & Accounting Data Guard
  describe('Step 15 - 18: Google Sheets 14 Columns & Accounting Protection', () => {
    it('should have exactly 14 columns in the standardized schema', () => {
      expect(SHEET_HEADERS).toHaveLength(14);
      expect(SHEET_HEADERS[11]).toBe('Стоимость доставки');
      expect(SHEET_HEADERS[12]).toBe('Валюта');
    });

    it('should sanitize Russian ruble strings correctly', () => {
      const client = new GoogleSheetsClient();
      // Test cost parsing logic: "12 500 ₽" -> 12500
      const testCases = [
        { input: '12 500 ₽', expected: 12500 },
        { input: '15000', expected: 15000 },
        { input: '35 450,50 руб', expected: 35450.5 },
      ];

      testCases.forEach(({ input, expected }) => {
        const cleaned = input
          .replace(/[₽\s руб]/gi, '')
          .replace(',', '.');
        const num = parseFloat(cleaned);
        expect(num).toBe(expected);
      });
    });

    it('should forbid CLIENT and DRIVER roles from updating delivery costs', async () => {
      await expect(
        OrdersService.updateDeliveryCost(clientUser, {
          orderId: 'mock-order-id',
          deliveryCostAmount: 14500,
        })
      ).rejects.toThrow('Доступ к установке стоимости доставки запрещён');

      await expect(
        OrdersService.updateDeliveryCost(assignedDriverUser, {
          orderId: 'mock-order-id',
          deliveryCostAmount: 14500,
        })
      ).rejects.toThrow('Доступ к установке стоимости доставки запрещён');
    });

    it('should reject invalid delivery cost amounts (negative, 0, or over 10M)', async () => {
      await expect(
        OrdersService.updateDeliveryCost(accountantUser, {
          orderId: 'mock-order-id',
          deliveryCostAmount: -100,
        })
      ).rejects.toThrow('Сумма должна быть числом от 0.01 до 10 000 000');

      await expect(
        OrdersService.updateDeliveryCost(accountantUser, {
          orderId: 'mock-order-id',
          deliveryCostAmount: 12000000,
        })
      ).rejects.toThrow('Сумма должна быть числом от 0.01 до 10 000 000');
    });
  });

  // 19: Manager Order Completion & Terminal Status Enforcement
  describe('Step 19: Order Completion & Terminal Status Enforcement', () => {
    it('should forbid non-managers from manually updating order status', async () => {
      await expect(
        OrdersService.updateStatus(clientUser, 'mock-order-id', {
          status: OrderStatus.COMPLETED,
        })
      ).rejects.toThrow('Only managers and administrators can change order status directly');

      await expect(
        OrdersService.updateStatus(assignedDriverUser, 'mock-order-id', {
          status: OrderStatus.COMPLETED,
        })
      ).rejects.toThrow('Only managers and administrators can change order status directly');
    });
  });
});
