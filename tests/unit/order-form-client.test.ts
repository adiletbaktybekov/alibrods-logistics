import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createClientOrderSchema } from '@/modules/orders/orders.dto';
import { OrdersService } from '@/modules/orders/orders.service';
import { WarehousesService, CONFIRMED_WAREHOUSES, isWarehouseOpenOnDate } from '@/modules/warehouses/warehouses.service';
import { prisma } from '@/database/prisma';
import { UserRole, OrderStatus } from '@prisma/client';

vi.mock('@/database/prisma', () => ({
  prisma: {
    clientProfile: {
      findUnique: vi.fn(),
    },
    warehouse: {
      findUnique: vi.fn(),
    },
    order: {
      create: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  },
}));

vi.mock('@/lib/security/idempotency.service', () => ({
  IdempotencyService: {
    runWithIdempotency: vi.fn().mockImplementation(async (_opts, fn) => {
      const txMock = {
        order: {
          create: vi.fn().mockResolvedValue({
            id: 'mock-order-uuid',
            orderNumber: 'ABL-2026-TESTNOV',
            marketplace: 'WILDBERRIES',
            status: OrderStatus.CREATED,
            scheduledPickupAt: new Date('2026-11-21'),
            totalBoxesCount: 21,
            totalPalletsCount: 0,
            warehouse: { id: 'wh-radumlya', name: 'Радумля' },
            items: [],
          }),
        },
      };
      const result = await fn(txMock);
      return { result, isNew: true };
    }),
  },
}));

vi.mock('@/modules/notifications/dispatcher.service', () => ({
  NotificationDispatcherService: {
    notifyOrderCreated: vi.fn().mockResolvedValue(true),
  },
}));

vi.mock('@/modules/audit/audit.service', () => ({
  AuditService: {
    log: vi.fn().mockResolvedValue(undefined),
  },
}));

describe('Client Order Form: Date Flexibility & Quantity Fields Validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Quantity Fields Validation (createClientOrderSchema)', () => {
    it('should successfully parse valid quantities: 12, 21, 45, 100', () => {
      const cases = [
        { boxes: '12', pallets: '0' },
        { boxes: '21', pallets: '2' },
        { boxes: '45', pallets: '5' },
        { boxes: '100', pallets: '10' },
      ];

      for (const c of cases) {
        const res = createClientOrderSchema.safeParse({
          warehouseId: 'c0000001-0000-0000-0000-000000000001',
          deliveryDate: '2026-11-21',
          totalBoxesCount: c.boxes,
          totalPalletsCount: c.pallets,
        });

        expect(res.success).toBe(true);
        if (res.success) {
          expect(res.data.totalBoxesCount).toBe(parseInt(c.boxes, 10));
          expect(res.data.totalPalletsCount).toBe(parseInt(c.pallets, 10));
        }
      }
    });

    it('should reject invalid values (0 boxes, negative numbers, non-digits)', () => {
      const invalidCases = [
        { totalBoxesCount: '0', totalPalletsCount: '0' }, // 0 boxes invalid
        { totalBoxesCount: '-5', totalPalletsCount: '0' }, // negative boxes
        { totalBoxesCount: '10', totalPalletsCount: '-1' }, // negative pallets
        { totalBoxesCount: 'abc', totalPalletsCount: '0' }, // NaN
      ];

      for (const c of invalidCases) {
        const res = createClientOrderSchema.safeParse({
          warehouseId: 'c0000001-0000-0000-0000-000000000001',
          deliveryDate: '2026-11-21',
          ...c,
        });
        expect(res.success).toBe(false);
      }
    });
  });

  describe('2. Delivery Date & Warehouse Schedule Flexibility (OrdersService.createFromClient)', () => {
    it('should NOT block order creation even on a non-operating schedule date (e.g. 21 November)', async () => {
      // 2026-11-21 is Saturday. Radumlya is Mon, Wed, Fri only.
      const radumlya = CONFIRMED_WAREHOUSES.find((w) => w.code === 'WB_RADUMLYA')!;
      expect(radumlya).toBeDefined();
      expect(isWarehouseOpenOnDate(radumlya, '2026-11-21')).toBe(false);

      vi.spyOn(WarehousesService, 'getById').mockResolvedValue(radumlya);
      vi.mocked(prisma.clientProfile.findUnique).mockResolvedValue({
        id: 'cp-123',
        userId: 'client-user-1',
      } as any);

      const clientUser = {
        id: 'client-user-1',
        email: 'seller@test.ru',
        role: UserRole.CLIENT,
        isActive: true,
      };

      // Execution MUST succeed and NOT throw ValidationError
      const order = await OrdersService.createFromClient(clientUser as any, {
        warehouseId: radumlya.id,
        deliveryDate: new Date('2026-11-21'),
        totalBoxesCount: 21,
        totalPalletsCount: 0,
        clientComment: 'Нужна доставка на субботу 21 ноября',
      });

      expect(order).toBeDefined();
      expect(order.status).toBe(OrderStatus.CREATED);
      expect(order.orderNumber).toBe('ABL-2026-TESTNOV');
    });
  });
});
