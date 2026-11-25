import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OrderStatus, AssignmentStatus, UserRole } from '@prisma/client';
import {
  ALLOWED_STATUS_TRANSITIONS,
  getAllowedStatusTransitions,
  getCriticalTransitionInfo,
} from '@/components/ui/status-badge';
import { OrdersService } from '@/modules/orders/orders.service';
import { prisma } from '@/database/prisma';
import { AuditService } from '@/modules/audit/audit.service';
import { GoogleSheetsSyncService } from '@/modules/integrations/google-sheets-sync.service';
import { NotificationDispatcherService } from '@/modules/notifications/dispatcher.service';
import { ForbiddenError, ValidationError } from '@/lib/errors';

vi.mock('@/database/prisma', () => ({
  prisma: {
    $queryRaw: vi.fn().mockResolvedValue([]),
    order: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    orderAssignment: {
      update: vi.fn(),
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
    syncOrder: vi.fn().mockResolvedValue(true),
  },
}));

vi.mock('@/modules/notifications/dispatcher.service', () => ({
  NotificationDispatcherService: {
    notifyOrderConfirmed: vi.fn().mockResolvedValue(true),
    notifyOrderRejected: vi.fn().mockResolvedValue(true),
    notifyStatusChanged: vi.fn().mockResolvedValue(undefined),
  },
}));

describe('Inline Admin Order Status Transitions & Service', () => {
  const managerUser = {
    id: 'mgr-1',
    role: UserRole.MANAGER,
    email: 'manager@alibros.ru',
    isActive: true,
    tokenVersion: 1,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('ALLOWED_STATUS_TRANSITIONS & Critical Transition Metadata', () => {
    it('never exposes retired statuses as allowed transition targets', () => {
      const retired = [
        OrderStatus.IN_TRANSIT,
        OrderStatus.DELIVERED_TO_WAREHOUSE,
        OrderStatus.ACCEPTED_BY_MARKETPLACE,
      ];

      for (const targets of Object.values(ALLOWED_STATUS_TRANSITIONS)) {
        for (const removed of retired) {
          expect(targets).not.toContain(removed);
        }
      }
    });

    it('hides ASSIGNED_TO_DRIVER from CONFIRMED when no driver is assigned', () => {
      const withoutDriver = getAllowedStatusTransitions(OrderStatus.CONFIRMED, {
        hasAssignedDriver: false,
      });
      expect(withoutDriver).not.toContain(OrderStatus.ASSIGNED_TO_DRIVER);
      expect(withoutDriver).toContain(OrderStatus.REJECTED_BY_MANAGER);
      expect(withoutDriver).toContain(OrderStatus.CANCELLED);

      const withDriver = getAllowedStatusTransitions(OrderStatus.CONFIRMED, {
        hasAssignedDriver: true,
      });
      expect(withDriver).toContain(OrderStatus.ASSIGNED_TO_DRIVER);
    });

    it('identifies critical transitions that impact delivery completion or driver stages', () => {
      expect(
        getCriticalTransitionInfo(OrderStatus.PICKED_UP, OrderStatus.COMPLETED, true)?.isCritical
      ).toBe(true);
      expect(
        getCriticalTransitionInfo(OrderStatus.COMPLETED, OrderStatus.PICKED_UP, true)?.isCritical
      ).toBe(true);
      expect(
        getCriticalTransitionInfo(OrderStatus.CREATED, OrderStatus.REJECTED_BY_MANAGER, false)
          ?.requireReason
      ).toBe(true);
      expect(
        getCriticalTransitionInfo(OrderStatus.ASSIGNED_TO_DRIVER, OrderStatus.CONFIRMED, true)
          ?.isCritical
      ).toBe(true);
      expect(
        getCriticalTransitionInfo(OrderStatus.ACCEPTED_BY_DRIVER, OrderStatus.CANCELLED, true)
          ?.isCritical
      ).toBe(true);

      // Standard forward transitions do not require critical modal confirmation
      expect(
        getCriticalTransitionInfo(OrderStatus.CREATED, OrderStatus.CONFIRMED, false)
      ).toBeNull();
      expect(
        getCriticalTransitionInfo(
          OrderStatus.ASSIGNED_TO_DRIVER,
          OrderStatus.ACCEPTED_BY_DRIVER,
          true
        )
      ).toBeNull();
    });
  });

  describe('OrdersService.updateOrderStatusByStaff', () => {
    it('blocks CLIENT, DRIVER, and ACCOUNTANT roles with ForbiddenError', async () => {
      for (const role of [UserRole.CLIENT, UserRole.DRIVER, UserRole.ACCOUNTANT]) {
        await expect(
          OrdersService.updateOrderStatusByStaff(
            { ...managerUser, role },
            'order-1',
            OrderStatus.CONFIRMED
          )
        ).rejects.toThrow(ForbiddenError);
      }
    });

    it('rejects retired statuses with ValidationError', async () => {
      for (const retired of [
        OrderStatus.IN_TRANSIT,
        OrderStatus.DELIVERED_TO_WAREHOUSE,
        OrderStatus.ACCEPTED_BY_MARKETPLACE,
      ]) {
        await expect(
          OrdersService.updateOrderStatusByStaff(managerUser, 'order-1', retired)
        ).rejects.toThrow(ValidationError);
      }
    });

    it('rejects disallowed transition jumps (e.g. CREATED -> COMPLETED)', async () => {
      vi.mocked(prisma.order.findUnique).mockResolvedValueOnce({
        id: 'order-1',
        status: OrderStatus.CREATED,
        deliveredAt: null,
        assignments: [],
      } as any);

      await expect(
        OrdersService.updateOrderStatusByStaff(managerUser, 'order-1', OrderStatus.COMPLETED)
      ).rejects.toThrow(ValidationError);
      expect(prisma.order.update).not.toHaveBeenCalled();
    });

    it('rejects stale concurrent edits when expectedCurrentStatus mismatches DB', async () => {
      vi.mocked(prisma.order.findUnique).mockResolvedValueOnce({
        id: 'order-1',
        status: OrderStatus.CONFIRMED,
        deliveredAt: null,
        assignments: [],
      } as any);

      await expect(
        OrdersService.updateOrderStatusByStaff(managerUser, 'order-1', OrderStatus.CANCELLED, {
          expectedCurrentStatus: OrderStatus.CREATED,
        })
      ).rejects.toThrow(ValidationError);
      expect(prisma.order.update).not.toHaveBeenCalled();
    });

    it('is a silent no-op without Telegram notifications when selecting the same status', async () => {
      vi.mocked(prisma.order.findUnique).mockResolvedValueOnce({
        id: 'order-1',
        status: OrderStatus.CONFIRMED,
        deliveredAt: null,
        assignments: [],
      } as any);

      const res = await OrdersService.updateOrderStatusByStaff(
        managerUser,
        'order-1',
        OrderStatus.CONFIRMED
      );

      expect(res.changed).toBe(false);
      expect(prisma.order.update).not.toHaveBeenCalled();
      expect(AuditService.log).not.toHaveBeenCalled();
      expect(GoogleSheetsSyncService.syncOrder).not.toHaveBeenCalled();
      expect(NotificationDispatcherService.notifyOrderConfirmed).not.toHaveBeenCalled();
      expect(NotificationDispatcherService.notifyStatusChanged).not.toHaveBeenCalled();
    });

    it('confirms order from list, dispatches group card, client notification, history, and Google Sheets sync', async () => {
      vi.mocked(prisma.order.findUnique).mockResolvedValueOnce({
        id: 'order-1',
        status: OrderStatus.CREATED,
        deliveredAt: null,
        assignments: [],
      } as any);

      vi.mocked(prisma.order.update).mockResolvedValueOnce({
        id: 'order-1',
        status: OrderStatus.CONFIRMED,
      } as any);

      const res = await OrdersService.updateOrderStatusByStaff(
        managerUser,
        'order-1',
        OrderStatus.CONFIRMED,
        { expectedCurrentStatus: OrderStatus.CREATED }
      );

      expect(res.changed).toBe(true);
      expect(res.order.status).toBe(OrderStatus.CONFIRMED);
      expect(prisma.orderStatusHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            orderId: 'order-1',
            fromStatus: OrderStatus.CREATED,
            toStatus: OrderStatus.CONFIRMED,
            changedById: managerUser.id,
          }),
        })
      );
      expect(AuditService.log).toHaveBeenCalledTimes(1);
      expect(GoogleSheetsSyncService.syncOrder).toHaveBeenCalledWith('order-1');
      expect(NotificationDispatcherService.notifyOrderConfirmed).toHaveBeenCalledTimes(1);
      expect(NotificationDispatcherService.notifyStatusChanged).toHaveBeenCalledTimes(1);
    });

    it('completes order from PICKED_UP, updates assignment and deliveredAt without spamming group confirmation', async () => {
      vi.mocked(prisma.order.findUnique).mockResolvedValueOnce({
        id: 'order-2',
        status: OrderStatus.PICKED_UP,
        deliveredAt: null,
        assignments: [
          {
            id: 'assign-1',
            status: AssignmentStatus.IN_PROGRESS,
            acceptedAt: new Date('2026-11-20T10:00:00Z'),
            completedAt: null,
          },
        ],
      } as any);

      vi.mocked(prisma.order.update).mockResolvedValueOnce({
        id: 'order-2',
        status: OrderStatus.COMPLETED,
      } as any);

      const res = await OrdersService.updateOrderStatusByStaff(
        managerUser,
        'order-2',
        OrderStatus.COMPLETED,
        { expectedCurrentStatus: OrderStatus.PICKED_UP }
      );

      expect(res.changed).toBe(true);
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
          where: { id: 'assign-1' },
          data: expect.objectContaining({
            status: AssignmentStatus.COMPLETED,
            completedAt: expect.any(Date),
          }),
        })
      );
      expect(NotificationDispatcherService.notifyOrderConfirmed).not.toHaveBeenCalled();
      expect(NotificationDispatcherService.notifyStatusChanged).toHaveBeenCalledTimes(1);
      expect(GoogleSheetsSyncService.syncOrder).toHaveBeenCalledWith('order-2');
    });
  });
});
