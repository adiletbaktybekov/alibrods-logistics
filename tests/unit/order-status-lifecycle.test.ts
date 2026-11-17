import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OrderStatus, AssignmentStatus, UserRole } from '@prisma/client';
import { OrdersService } from '@/modules/orders/orders.service';
import { prisma } from '@/database/prisma';
import { ForbiddenError, ValidationError } from '@/lib/errors';

vi.mock('@/database/prisma', () => ({
  prisma: {
    order: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    orderAssignment: {
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    orderStatusHistory: {
      create: vi.fn(),
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

vi.mock('@/modules/notifications/dispatcher.service', () => ({
  NotificationDispatcherService: {
    notifyStatusChanged: vi.fn().mockResolvedValue(true),
  },
}));

describe('Order Status Lifecycle & Full Pipeline Execution', () => {
  const managerUser = {
    id: 'user-manager-1',
    role: UserRole.MANAGER,
    email: 'manager@alibros.ru',
    fullName: 'Операционный Менеджер',
  };

  const clientUser = {
    id: 'user-client-1',
    role: UserRole.CLIENT,
    email: 'seller@client.com',
    fullName: 'Селлер ИП Иванов',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects status changes from client users', async () => {
    await expect(
      OrdersService.updateDriverWorkflowStatusByManager(
        clientUser as any,
        'order-1',
        OrderStatus.ACCEPTED_BY_DRIVER
      )
    ).rejects.toThrow(ForbiddenError);
  });

  it('rejects invalid workflow target statuses like CANCELLED or CREATED', async () => {
    await expect(
      OrdersService.updateDriverWorkflowStatusByManager(
        managerUser as any,
        'order-1',
        OrderStatus.CANCELLED
      )
    ).rejects.toThrow(ValidationError);

    await expect(
      OrdersService.updateDriverWorkflowStatusByManager(
        managerUser as any,
        'order-1',
        OrderStatus.CREATED
      )
    ).rejects.toThrow(ValidationError);
  });

  it('allows manager to transition through all operational stages from ASSIGNED_TO_DRIVER up to COMPLETED', async () => {
    const mockOrder = {
      id: 'order-1',
      orderNumber: 'AB-261117-001',
      status: OrderStatus.ASSIGNED_TO_DRIVER,
      deliveredAt: null,
      completedAt: null,
      assignments: [
        {
          id: 'assign-1',
          status: AssignmentStatus.ASSIGNED,
          acceptedAt: null,
          completedAt: null,
        },
      ],
    };

    (prisma.order.findUnique as any).mockResolvedValue(mockOrder);
    (prisma.order.update as any).mockImplementation(({ data }: any) => ({
      ...mockOrder,
      ...data,
    }));
    (prisma.orderAssignment.update as any).mockResolvedValue({});
    (prisma.orderStatusHistory.create as any).mockResolvedValue({});

    // 1. Advance to ACCEPTED_BY_DRIVER
    const resAccepted = await OrdersService.updateDriverWorkflowStatusByManager(
      managerUser as any,
      'order-1',
      OrderStatus.ACCEPTED_BY_DRIVER
    );
    expect(resAccepted.status).toBe(OrderStatus.ACCEPTED_BY_DRIVER);

    // 2. Advance to PICKED_UP
    const resPickedUp = await OrdersService.updateDriverWorkflowStatusByManager(
      managerUser as any,
      'order-1',
      OrderStatus.PICKED_UP
    );
    expect(resPickedUp.status).toBe(OrderStatus.PICKED_UP);

    // 3. Advance to IN_TRANSIT
    const resTransit = await OrdersService.updateDriverWorkflowStatusByManager(
      managerUser as any,
      'order-1',
      OrderStatus.IN_TRANSIT
    );
    expect(resTransit.status).toBe(OrderStatus.IN_TRANSIT);

    // 4. Advance to DELIVERED_TO_WAREHOUSE
    const resDelivered = await OrdersService.updateDriverWorkflowStatusByManager(
      managerUser as any,
      'order-1',
      OrderStatus.DELIVERED_TO_WAREHOUSE
    );
    expect(resDelivered.status).toBe(OrderStatus.DELIVERED_TO_WAREHOUSE);
    expect(prisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: OrderStatus.DELIVERED_TO_WAREHOUSE,
          deliveredAt: expect.any(Date),
        }),
      })
    );

    // 5. Advance to ACCEPTED_BY_MARKETPLACE
    const resMp = await OrdersService.updateDriverWorkflowStatusByManager(
      managerUser as any,
      'order-1',
      OrderStatus.ACCEPTED_BY_MARKETPLACE
    );
    expect(resMp.status).toBe(OrderStatus.ACCEPTED_BY_MARKETPLACE);

    // 6. Complete the order (COMPLETED)
    const resCompleted = await OrdersService.updateDriverWorkflowStatusByManager(
      managerUser as any,
      'order-1',
      OrderStatus.COMPLETED
    );
    expect(resCompleted.status).toBe(OrderStatus.COMPLETED);
    expect(prisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: OrderStatus.COMPLETED,
          deliveredAt: expect.any(Date),
        }),
      })
    );
    expect(prisma.orderAssignment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'COMPLETED',
          completedAt: expect.any(Date),
        }),
      })
    );
  });
});
