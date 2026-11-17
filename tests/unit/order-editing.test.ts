import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OrderStatus, UserRole } from '@prisma/client';
import { OrdersService } from '@/modules/orders/orders.service';
import { prisma } from '@/database/prisma';
import { ForbiddenError, ValidationError } from '@/lib/errors';
import { AuditService } from '@/modules/audit/audit.service';
import { GoogleSheetsSyncService } from '@/modules/integrations/google-sheets-sync.service';

vi.mock('@/database/prisma', () => ({
  prisma: {
    order: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    orderDestination: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    orderStatusHistory: {
      create: vi.fn(),
    },
    warehouse: {
      findUnique: vi.fn().mockResolvedValue({ id: 'wh-1', marketplace: 'WILDBERRIES' }),
    },
    $transaction: vi.fn((callback) => callback(prisma)),
  },
}));

vi.mock('@/modules/audit/audit.service', () => ({
  AuditService: {
    log: vi.fn().mockResolvedValue(true),
  },
}));

vi.mock('@/modules/integrations/google-sheets-sync.service', () => ({
  GoogleSheetsSyncService: {
    syncOrder: vi.fn().mockResolvedValue({ success: true }),
  },
}));

describe('Order Editing Logic (Admin & Client)', () => {
  const clientUser = {
    id: 'user-client-1',
    role: UserRole.CLIENT,
    email: 'client1@alibros.ru',
  };

  const otherClientUser = {
    id: 'user-client-2',
    role: UserRole.CLIENT,
    email: 'client2@alibros.ru',
  };

  const adminUser = {
    id: 'user-admin-1',
    role: UserRole.ADMIN,
    email: 'admin@alibros.ru',
  };

  const sampleOrder = {
    id: 'order-123',
    orderNumber: 'AB-261117-099',
    clientId: 'client-profile-1',
    status: OrderStatus.CONFIRMED,
    totalPalletsCount: 1,
    totalBoxesCount: 5,
    pickupAddress: 'ул. Ленина 10',
    clientComment: 'Старый комментарий',
    client: {
      id: 'client-profile-1',
      userId: 'user-client-1',
    },
    destinations: [
      {
        id: 'dest-1',
        warehouseId: 'wh-1',
        customWarehouseName: null,
        deliveryDate: new Date('2026-11-20'),
        palletsCount: 1,
        boxesCount: 5,
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows client to edit own order in CONFIRMED status before driver pickup', async () => {
    (prisma.order.findUnique as any).mockResolvedValue(sampleOrder);
    (prisma.orderDestination.deleteMany as any).mockResolvedValue({ count: 1 });
    (prisma.orderDestination.createMany as any).mockResolvedValue({ count: 2 });
    (prisma.order.update as any).mockImplementation(({ data }: any) => ({
      ...sampleOrder,
      ...data,
      destinations: [],
    }));
    (prisma.orderStatusHistory.create as any).mockResolvedValue({});

    const updateDto = {
      pickupAddress: 'Новый склад ул. Чуй 100',
      clientComment: 'Обновлённый комментарий',
      destinations: [
        {
          warehouseId: '80123456-789a-bcde-f012-3456789abc01',
          deliveryDate: new Date('2026-11-22'),
          palletsCount: 2,
          boxesCount: 10,
        },
        {
          warehouseId: '80123456-789a-bcde-f012-3456789abc02',
          deliveryDate: new Date('2026-11-23'),
          palletsCount: 1,
          boxesCount: 15,
        },
      ],
    };

    const result = await OrdersService.updateOrder(clientUser as any, 'order-123', updateDto as any);

    expect(prisma.orderDestination.deleteMany).toHaveBeenCalledWith({ where: { orderId: 'order-123' } });
    expect(prisma.orderDestination.createMany).toHaveBeenCalled();
    expect(prisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'order-123' },
        data: expect.objectContaining({
          totalPalletsCount: 3,
          totalBoxesCount: 25,
          pickupAddress: 'Новый склад ул. Чуй 100',
          clientComment: 'Обновлённый комментарий',
        }),
      })
    );
    expect(AuditService.log).toHaveBeenCalled();
    expect(GoogleSheetsSyncService.syncOrder).toHaveBeenCalledWith('order-123');
  });

  it('blocks client from editing another client order (IDOR Protection)', async () => {
    (prisma.order.findUnique as any).mockResolvedValue(sampleOrder);

    const updateDto = {
      destinations: [
        {
          warehouseId: '80123456-789a-bcde-f012-3456789abc01',
          deliveryDate: new Date('2026-11-22'),
          palletsCount: 1,
          boxesCount: 2,
        },
      ],
    };

    await expect(
      OrdersService.updateOrder(otherClientUser as any, 'order-123', updateDto as any)
    ).rejects.toThrow(ForbiddenError);
  });

  it('blocks client from editing once order status is PICKED_UP or later', async () => {
    (prisma.order.findUnique as any).mockResolvedValue({
      ...sampleOrder,
      status: OrderStatus.PICKED_UP,
    });

    const updateDto = {
      destinations: [
        {
          warehouseId: '80123456-789a-bcde-f012-3456789abc01',
          deliveryDate: new Date('2026-11-22'),
          palletsCount: 1,
          boxesCount: 2,
        },
      ],
    };

    await expect(
      OrdersService.updateOrder(clientUser as any, 'order-123', updateDto as any)
    ).rejects.toThrow(ValidationError);
  });

  it('allows admin to edit order parameters and logs changes with staff user id', async () => {
    (prisma.order.findUnique as any).mockResolvedValue(sampleOrder);
    (prisma.orderDestination.deleteMany as any).mockResolvedValue({ count: 1 });
    (prisma.orderDestination.createMany as any).mockResolvedValue({ count: 1 });
    (prisma.order.update as any).mockImplementation(({ data }: any) => ({
      ...sampleOrder,
      ...data,
    }));

    const updateDto = {
      pickupAddress: 'Администратор скорректировал адрес',
      destinations: [
        {
          warehouseId: '80123456-789a-bcde-f012-3456789abc01',
          deliveryDate: new Date('2026-11-25'),
          palletsCount: 4,
          boxesCount: 20,
        },
      ],
    };

    const res = await OrdersService.updateOrder(adminUser as any, 'order-123', updateDto as any);
    expect(res).toBeDefined();
    expect(AuditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: adminUser.id,
        action: 'UPDATE',
        resource: 'Order',
        resourceId: 'order-123',
      })
    );
  });
});
