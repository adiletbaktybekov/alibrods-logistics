import { prisma } from '@/database/prisma';
import { NotFoundError, ForbiddenError, ValidationError } from '@/lib/errors';
import { OrderStatus, AssignmentStatus, AuditAction, Prisma } from '@prisma/client';
import { AuditService } from '@/modules/audit/audit.service';
import { NotificationDispatcherService } from '@/modules/notifications/dispatcher.service';
import { logger } from '@/lib/logger';

export const DRIVER_ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  DRAFT: [],
  CREATED: [],
  PENDING_CONFIRMATION: [],
  CONFIRMED: [],
  ASSIGNED_TO_DRIVER: [OrderStatus.ACCEPTED_BY_DRIVER],
  ACCEPTED_BY_DRIVER: [OrderStatus.PICKED_UP],
  PICKED_UP: [OrderStatus.IN_TRANSIT],
  IN_TRANSIT: [OrderStatus.DELIVERED_TO_WAREHOUSE],
  DELIVERED_TO_WAREHOUSE: [OrderStatus.ACCEPTED_BY_MARKETPLACE],
  ACCEPTED_BY_MARKETPLACE: [],
  COMPLETED: [],
  REJECTED_BY_MANAGER: [],
  CANCELLED: [],
};

export const ACTIVE_DRIVER_STATUSES: OrderStatus[] = [
  OrderStatus.ASSIGNED_TO_DRIVER,
  OrderStatus.ACCEPTED_BY_DRIVER,
  OrderStatus.PICKED_UP,
  OrderStatus.IN_TRANSIT,
  OrderStatus.DELIVERED_TO_WAREHOUSE,
];

export const COMPLETED_DRIVER_STATUSES: OrderStatus[] = [
  OrderStatus.ACCEPTED_BY_MARKETPLACE,
  OrderStatus.COMPLETED,
];

export class DriverOrderService {
  /**
   * Lists all active orders assigned to a specific driver.
   */
  public static async listActiveOrders(driverProfileId: string) {
    if (!process.env.DATABASE_URL) return [];

    try {
      return await prisma.order.findMany({
        where: {
          status: { in: ACTIVE_DRIVER_STATUSES },
          assignments: {
            some: { driverId: driverProfileId },
          },
        },
        orderBy: { scheduledPickupAt: 'asc' },
        include: {
          warehouse: true,
          client: {
            select: {
              companyName: true,
              contactPerson: true,
              contactPhone: true,
            },
          },
          assignments: {
            where: { driverId: driverProfileId },
            take: 1,
          },
        },
      });
    } catch {
      return [];
    }
  }

  /**
   * Lists completed orders for this driver.
   */
  public static async listCompletedOrders(driverProfileId: string, limit = 10) {
    if (!process.env.DATABASE_URL) return [];

    try {
      return await prisma.order.findMany({
        where: {
          status: { in: COMPLETED_DRIVER_STATUSES },
          assignments: {
            some: { driverId: driverProfileId },
          },
        },
        orderBy: { updatedAt: 'desc' },
        take: limit,
        include: {
          warehouse: true,
          client: {
            select: {
              companyName: true,
            },
          },
        },
      });
    } catch {
      return [];
    }
  }

  /**
   * Fetches an order ensuring it is assigned to this driver.
   */
  public static async getOrderForDriver(driverProfileId: string, orderId: string) {
    if (!process.env.DATABASE_URL) {
      throw new NotFoundError('Order', orderId);
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        warehouse: true,
        client: {
          select: {
            companyName: true,
            contactPerson: true,
            contactPhone: true,
          },
        },
        assignments: {
          where: { driverId: driverProfileId },
          include: { driver: true },
        },
      },
    });

    if (!order) {
      throw new NotFoundError('Order', orderId);
    }

    const isAssigned = order.assignments.some((a) => a.driverId === driverProfileId);
    if (!isAssigned) {
      throw new ForbiddenError('Доступ запрещён: эта заявка не назначена данному водителю');
    }

    return order;
  }

  /**
   * Advances order status with state-machine validation, idempotency, and audit logging.
   */
  public static async updateDriverOrderStatus(
    driverProfileId: string,
    orderId: string,
    targetStatus: OrderStatus,
    comment?: string
  ) {
    if (!process.env.DATABASE_URL) {
      throw new Error('Database not configured');
    }

    const driver = await prisma.driverProfile.findUnique({
      where: { id: driverProfileId },
      include: { user: true },
    });
    if (!driver) throw new NotFoundError('DriverProfile', driverProfileId);

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        assignments: {
          where: { driverId: driverProfileId },
        },
      },
    });

    if (!order) throw new NotFoundError('Order', orderId);

    // Verify assignment
    const assignment = order.assignments[0];
    if (!assignment) {
      throw new ForbiddenError('Заявка не назначена данному водителю');
    }

    // Idempotent check: if already in the target status, return cleanly without duplicating records
    if (order.status === targetStatus) {
      logger.info(
        { orderId, targetStatus },
        'Idempotent status update: order is already in target status'
      );
      return { success: true, order, isIdempotent: true };
    }

    // State machine validation
    const allowedTargets = DRIVER_ALLOWED_TRANSITIONS[order.status] || [];
    if (!allowedTargets.includes(targetStatus)) {
      throw new ValidationError(
        `Недопустимый переход статуса: нельзя перевести заявку из «${order.status}» в «${targetStatus}»`
      );
    }

    // Determine AssignmentStatus
    let newAssignmentStatus: AssignmentStatus = assignment.status;
    let acceptedAtDate: Date | undefined;
    let completedAtDate: Date | undefined;

    if (targetStatus === OrderStatus.ACCEPTED_BY_DRIVER) {
      newAssignmentStatus = AssignmentStatus.ACCEPTED;
      acceptedAtDate = new Date();
    } else if (
      targetStatus === OrderStatus.PICKED_UP ||
      targetStatus === OrderStatus.IN_TRANSIT ||
      targetStatus === OrderStatus.DELIVERED_TO_WAREHOUSE
    ) {
      newAssignmentStatus = AssignmentStatus.IN_PROGRESS;
    } else if (
      targetStatus === OrderStatus.ACCEPTED_BY_MARKETPLACE ||
      targetStatus === OrderStatus.COMPLETED
    ) {
      newAssignmentStatus = AssignmentStatus.COMPLETED;
      completedAtDate = new Date();
    }

    const defaultComments: Record<OrderStatus, string> = {
      [OrderStatus.ACCEPTED_BY_DRIVER]: 'Водитель принял рейс в работу',
      [OrderStatus.PICKED_UP]: 'Водитель забрал груз у клиента',
      [OrderStatus.IN_TRANSIT]: 'Машина выехала в сторону склада маркетплейса',
      [OrderStatus.DELIVERED_TO_WAREHOUSE]: 'Машина прибыла на склад маркетплейса',
      [OrderStatus.ACCEPTED_BY_MARKETPLACE]: 'Груз сдан и принят маркетплейсом',
    } as Record<OrderStatus, string>;

    const statusComment = comment || defaultComments[targetStatus] || `Статус обновлён водителем: ${targetStatus}`;

    // Execute atomic transaction
    const updated = await prisma.$transaction(async (tx) => {
      const updatedOrder = await tx.order.update({
        where: { id: orderId },
        data: {
          status: targetStatus,
          ...(targetStatus === OrderStatus.DELIVERED_TO_WAREHOUSE ? { deliveredAt: new Date() } : {}),
        },
      });

      await tx.orderAssignment.update({
        where: { id: assignment.id },
        data: {
          status: newAssignmentStatus,
          ...(acceptedAtDate ? { acceptedAt: acceptedAtDate } : {}),
          ...(completedAtDate ? { completedAt: completedAtDate } : {}),
        },
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId,
          fromStatus: order.status,
          toStatus: targetStatus,
          changedById: driver.userId,
          comment: statusComment,
        },
      });

      return updatedOrder;
    });

    // Write Audit Log
    await AuditService.log({
      userId: driver.userId,
      action: AuditAction.STATUS_CHANGE,
      resource: 'Order',
      resourceId: orderId,
      oldValue: { status: order.status, assignmentStatus: assignment.status },
      newValue: { status: targetStatus, assignmentStatus: newAssignmentStatus },
      metadata: { driverProfileId, comment: statusComment },
    });

    // Dispatch notifications to managers and client
    NotificationDispatcherService.notifyStatusChanged(
      orderId,
      order.status,
      targetStatus,
      driver.userId
    ).catch(() => {});

    return { success: true, order: updated, isIdempotent: false };
  }
}
