import { prisma } from '@/database/prisma';
import { logger } from '@/lib/logger';
import { generateOrderNumber } from '@/lib/utils';
import { NotFoundError, ForbiddenError, ValidationError } from '@/lib/errors';
import { assertOrderAccess } from '@/server/guards';
import { AuthenticatedUser } from '@/types/rbac';
import { AuditService } from '@/modules/audit/audit.service';
import { AuditAction, AssignmentStatus, MarketplaceType, OrderStatus, Prisma, UserRole } from '@prisma/client';
import { WarehousesService, isWarehouseOpenOnDate } from '@/modules/warehouses/warehouses.service';
import {
  CreateOrderDto,
  CreateClientOrderDto,
  UpdateOrderStatusDto,
  AssignDriverDto,
  WarehouseStatsFilter,
  WarehouseStatsResult,
  WarehouseRankingItem,
  WarehouseDailyTrendPoint,
} from './orders.dto';
import { NotificationDispatcherService } from '@/modules/notifications/dispatcher.service';
import { GoogleSheetsSyncService } from '@/modules/integrations/google-sheets-sync.service';
import { IdempotencyService } from '@/lib/security/idempotency.service';

import { siteConfig } from '@/config/site';

export interface AdminDashboardDailyPoint {
  date: string;
  label: string;
  count: number;
  wbCount: number;
  ozonCount: number;
}

export interface AdminDashboardStatusPoint {
  status: OrderStatus;
  label: string;
  count: number;
  percentage: number;
  color: string;
}

export interface AdminDashboardStats {
  total: number;
  created: number;
  pendingConfirmation: number;
  confirmed: number;
  inDelivery: number;
  completed: number;
  rejected: number;
  totalBoxes: number;
  totalPallets: number;
  marketplaces: {
    wildberries: number;
    ozon: number;
    wbPercentage: number;
    ozonPercentage: number;
  };
  dailyTrend: AdminDashboardDailyPoint[];
  statusDistribution: AdminDashboardStatusPoint[];
  recentOrders: any[];
}

export class OrdersService {
  /**
   * Creates an order from the client portal interface with multi-destination support
   */
  public static async createFromClient(
    user: AuthenticatedUser,
    dto: CreateClientOrderDto,
    ipAddress?: string
  ) {
    if (user.role !== 'CLIENT') {
      throw new ForbiddenError('Заявка может быть создана только из профиля клиента');
    }

    const client = await prisma.clientProfile.findUnique({ where: { userId: user.id } });
    if (!client) throw new ValidationError('Профиль клиента не найден');

    const rawDestinations =
      dto.destinations && dto.destinations.length > 0
        ? dto.destinations
        : dto.warehouseId
        ? [
            {
              warehouseId: dto.warehouseId,
              isCustomWarehouse: false,
              customWarehouseName: null,
              deliveryDate: dto.deliveryDate!,
              boxesCount: dto.totalBoxesCount || 0,
              palletsCount: dto.totalPalletsCount || 0,
              comment: null,
            },
          ]
        : [];

    if (rawDestinations.length === 0) {
      throw new ValidationError('Заявка должна содержать хотя бы один склад назначения');
    }

    // Resolve and validate warehouses
    let primaryWarehouseId: string | null = null;
    let primaryMarketplace: MarketplaceType = MarketplaceType.WILDBERRIES;

    for (const dest of rawDestinations) {
      if (!dest.isCustomWarehouse && dest.warehouseId) {
        const wh = await WarehousesService.getById(dest.warehouseId);
        if (!wh) {
          throw new NotFoundError('Warehouse', dest.warehouseId);
        }
        if (!primaryWarehouseId) {
          primaryWarehouseId = wh.id;
          primaryMarketplace = wh.marketplace;
        }

        const isStandardScheduleDay = isWarehouseOpenOnDate(wh, dest.deliveryDate);
        if (!isStandardScheduleDay) {
          logger.info(
            {
              event: 'WAREHOUSE_NON_STANDARD_SCHEDULE_ORDER',
              warehouseId: wh.id,
              warehouseName: wh.name,
              deliveryDate: dest.deliveryDate,
              scheduleDescription: wh.scheduleDescription,
            },
            'Client created order with delivery date outside standard warehouse schedule; order submitted for manager moderation'
          );
        }
      }
    }

    const totalBoxesCount = rawDestinations.reduce((acc, d) => acc + (d.boxesCount || 0), 0);
    const totalPalletsCount = rawDestinations.reduce((acc, d) => acc + (d.palletsCount || 0), 0);
    const scheduledPickupAt =
      rawDestinations
        .map((d) => new Date(d.deliveryDate))
        .sort((a, b) => a.getTime() - b.getTime())[0] || new Date();

    const idempotencyPayload = {
      clientId: client.id,
      destinations: rawDestinations.map((d) => ({
        warehouseId: d.warehouseId,
        isCustom: d.isCustomWarehouse,
        name: d.customWarehouseName,
        date: d.deliveryDate,
        boxes: d.boxesCount,
        pallets: d.palletsCount,
      })),
      totalBoxesCount,
      totalPalletsCount,
      clientComment: dto.clientComment,
    };

    const { result } = await IdempotencyService.runWithIdempotency(
      {
        key: dto.idempotencyKey,
        userId: user.id,
        action: 'CREATE_CLIENT_ORDER',
        payload: idempotencyPayload,
      },
      async (tx) => {
        let orderNumber = dto.orderNumber;
        if (!orderNumber) {
          try {
            if (typeof (tx as any).$queryRaw === 'function') {
              const nextSeq = await (tx as any).$queryRaw<{ nextval: bigint }[]>`SELECT nextval('order_number_seq')`;
              const seqNum = nextSeq[0]?.nextval ?? 1n;
              orderNumber = `${siteConfig.orderPrefix}-${seqNum}`;
            } else {
              orderNumber = generateOrderNumber();
            }
          } catch {
            orderNumber = generateOrderNumber();
          }
        }

        const itemsCount = Math.max(1, totalBoxesCount);
        const itemsData = Array.from({ length: itemsCount }, (_, idx) => ({
          boxNumber: idx + 1,
          quantity: 1,
          cargoDescription: `Грузовое место (коробка) №${idx + 1}`,
        }));

        const destinationsCreateData = rawDestinations.map((d) => ({
          warehouseId: d.isCustomWarehouse ? null : d.warehouseId,
          isCustomWarehouse: Boolean(d.isCustomWarehouse),
          customWarehouseName: d.isCustomWarehouse
            ? d.customWarehouseName?.trim() || 'Индивидуальный склад'
            : null,
          deliveryDate: d.deliveryDate,
          boxesCount: d.boxesCount || 0,
          palletsCount: d.palletsCount || 0,
          comment: d.comment || null,
        }));

        const order = await tx.order.create({
          data: {
            orderNumber,
            clientId: client.id,
            warehouseId: primaryWarehouseId,
            marketplace: primaryMarketplace,
            status: OrderStatus.CREATED,
            scheduledPickupAt,
            totalBoxesCount,
            totalPalletsCount,
            clientComment: dto.clientComment,
            destinations: {
              create: destinationsCreateData,
            },
            items: {
              create: itemsData,
            },
            statusHistory: {
              create: {
                toStatus: OrderStatus.CREATED,
                changedById: user.id,
                comment: 'Заявка оформлена через личный кабинет клиента',
              },
            },
          },
          include: {
            warehouse: true,
            destinations: {
              include: { warehouse: true },
            },
            items: true,
          },
        });

        return order;
      }
    );

    // Audit log & notifications execute safely after atomic transaction COMMIT
    await AuditService.log({
      userId: user.id,
      action: AuditAction.CREATE,
      resource: 'Order',
      resourceId: result.id,
      ipAddress,
      metadata: { orderNumber: result.orderNumber, marketplace: result.marketplace },
    });

    logger.info({
      event: 'ORDER_CREATED_TRIGGERED',
      orderId: result.id,
      orderNumber: result.orderNumber,
      marketplace: result.marketplace,
      totalBoxesCount: result.totalBoxesCount,
      totalPalletsCount: result.totalPalletsCount,
      source: 'CLIENT_PORTAL',
    });

    try {
      await NotificationDispatcherService.notifyOrderCreated(result.id);
    } catch (notifErr: unknown) {
      logger.error({
        event: 'ORDER_NOTIFICATION_ERROR',
        orderId: result.id,
        orderNumber: result.orderNumber,
        error: notifErr instanceof Error ? notifErr.message : 'Notification failed',
      });
    }

    return result;
  }

  /**
   * Creates an order with items and initial history log
   */
  public static async create(
    user: AuthenticatedUser,
    dto: CreateOrderDto,
    ipAddress?: string
  ) {
    // Determine clientProfileId
    let clientId: string;
    if (user.role === 'CLIENT') {
      const client = await prisma.clientProfile.findUnique({ where: { userId: user.id } });
      if (!client) throw new ValidationError('Client profile not found for this user account');
      clientId = client.id;
    } else {
      throw new ForbiddenError('Orders must be placed on behalf of a registered client account');
    }

    // Verify warehouse exists
    const warehouse = await WarehousesService.getById(dto.warehouseId);
    if (!warehouse) throw new NotFoundError('Warehouse', dto.warehouseId);

    // Calculate aggregate metrics
    let totalBoxesCount = dto.totalBoxesCount || 0;
    let totalWeightKg = 0;
    let totalVolumeM3 = 0;

    const itemsData = dto.items.map((item, index) => {
      totalBoxesCount += 1;
      const weight = item.weightKg || 0;
      totalWeightKg += weight;

      let volumeM3 = 0;
      if (item.lengthCm && item.widthCm && item.heightCm) {
        volumeM3 = (item.lengthCm * item.widthCm * item.heightCm) / 1_000_000;
        totalVolumeM3 += volumeM3;
      }

      return {
        boxNumber: item.boxNumber || index + 1,
        boxBarcode: item.boxBarcode,
        lengthCm: item.lengthCm,
        widthCm: item.widthCm,
        heightCm: item.heightCm,
        weightKg: item.weightKg,
        volumeM3: volumeM3 > 0 ? volumeM3 : undefined,
        article: item.article,
        productName: item.productName,
        quantity: item.quantity,
        cargoDescription: item.cargoDescription,
      };
    });

    let orderNumber: string;
    try {
      const seqResult = await prisma.$queryRaw<{ nextval: bigint }[]>`SELECT nextval('order_number_seq')`;
      const seqNum = seqResult[0]?.nextval ?? 1n;
      orderNumber = `${siteConfig.orderPrefix}-${seqNum}`;
    } catch {
      orderNumber = generateOrderNumber();
    }

    const order = await prisma.order.create({
      data: {
        orderNumber,
        clientId,
        warehouseId: dto.warehouseId,
        marketplace: dto.marketplace,
        status: OrderStatus.CREATED,
        pickupAddress: dto.pickupAddress,
        pickupCity: dto.pickupCity,
        pickupContactName: dto.pickupContactName,
        pickupContactPhone: dto.pickupContactPhone,
        scheduledPickupAt: dto.scheduledPickupAt,
        clientComment: dto.clientComment,
        totalBoxesCount,
        totalPalletsCount: dto.totalPalletsCount || 0,
        totalWeightKg: totalWeightKg > 0 ? totalWeightKg : undefined,
        totalVolumeM3: totalVolumeM3 > 0 ? totalVolumeM3 : undefined,
        destinations: {
          create: [
            {
              warehouseId: dto.warehouseId,
              isCustomWarehouse: false,
              deliveryDate: dto.scheduledPickupAt || new Date(),
              boxesCount: totalBoxesCount,
              palletsCount: dto.totalPalletsCount || 0,
            },
          ],
        },
        items: {
          create: itemsData,
        },
        statusHistory: {
          create: {
            toStatus: OrderStatus.CREATED,
            changedById: user.id,
            comment: 'Order registered by client',
          },
        },
      },
      include: {
        items: true,
        warehouse: true,
        destinations: {
          include: { warehouse: true },
        },
      },
    });

    await AuditService.log({
      userId: user.id,
      action: AuditAction.CREATE,
      resource: 'Order',
      resourceId: order.id,
      ipAddress,
      metadata: { orderNumber: order.orderNumber, marketplace: order.marketplace },
    });

    logger.info({
      event: 'ORDER_CREATED_TRIGGERED',
      orderId: order.id,
      orderNumber: order.orderNumber,
      marketplace: order.marketplace,
      totalBoxesCount: order.totalBoxesCount,
      totalPalletsCount: order.totalPalletsCount,
      source: 'ADMIN_OR_API',
    });

    try {
      await NotificationDispatcherService.notifyOrderCreated(order.id);
    } catch (notifErr: unknown) {
      logger.error({
        event: 'ORDER_NOTIFICATION_ERROR',
        orderId: order.id,
        orderNumber: order.orderNumber,
        error: notifErr instanceof Error ? notifErr.message : 'Notification failed',
      });
    }

    return order;
  }

  /**
   * Retrieves an order by ID with IDOR protection
   */
  public static async getById(user: AuthenticatedUser, orderId: string) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        client: {
          select: {
            id: true,
            userId: true,
            companyName: true,
            contactPerson: true,
            contactPhone: true,
            contactEmail: true,
            inn: true,
            legalName: true,
          },
        },
        warehouse: true,
        destinations: {
          include: { warehouse: true },
          orderBy: { createdAt: 'asc' },
        },
        items: { orderBy: { boxNumber: 'asc' } },
        assignments: {
          include: {
            driver: {
              select: {
                id: true,
                userId: true,
                fullName: true,
                vehicleModel: true,
                vehiclePlateNumber: true,
              },
            },
          },
        },
        statusHistory: {
          orderBy: { createdAt: 'desc' },
          include: {
            changedBy: { select: { id: true, role: true, email: true, phone: true } },
          },
        },
        photos: {
          orderBy: { createdAt: 'desc' },
          include: {
            uploadedBy: {
              select: {
                id: true,
                email: true,
                phone: true,
                driverProfile: { select: { fullName: true } },
                managerProfile: { select: { fullName: true } },
              },
            },
          },
        },
      },
    });

    if (!order) throw new NotFoundError('Order', orderId);

    // IDOR Check: Map internal client profile's userId for comparison
    assertOrderAccess(user, {
      clientId: order.client.userId,
      assignments: order.assignments.map((a) => ({
        driver: { userId: a.driver.userId },
      })),
    });

    return order;
  }

  /**
   * List orders with role-based scoping
   */
  public static async list(
    user: AuthenticatedUser,
    params: {
      page?: number;
      limit?: number;
      status?: OrderStatus;
      search?: string;
    }
  ) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.OrderWhereInput = {};

    if (params.status) {
      where.status = params.status;
    }

    if (params.search) {
      where.OR = [
        { orderNumber: { contains: params.search, mode: 'insensitive' } },
        { clientComment: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    // Role-based filtering
    if (user.role === 'CLIENT') {
      const client = await prisma.clientProfile.findUnique({ where: { userId: user.id } });
      if (!client) return { items: [], total: 0, page, limit };
      where.clientId = client.id;
    } else if (user.role === 'DRIVER') {
      const driver = await prisma.driverProfile.findUnique({ where: { userId: user.id } });
      if (!driver) return { items: [], total: 0, page, limit };
      where.assignments = { some: { driverId: driver.id } };
    }

    const [items, total] = await Promise.all([
      prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          warehouse: { select: { name: true, marketplace: true, code: true } },
          destinations: {
            include: { warehouse: true },
            orderBy: { createdAt: 'asc' },
          },
          client: { select: { companyName: true } },
        },
      }),
      prisma.order.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  /**
   * Client dashboard statistics
   */
  public static async getClientStats(user: AuthenticatedUser) {
    if (user.role !== 'CLIENT') {
      throw new ForbiddenError('Access denied: client only stats');
    }

    const client = await prisma.clientProfile.findUnique({ where: { userId: user.id } });
    if (!client) {
      return {
        total: 0,
        inProcessing: 0,
        completed: 0,
        recentOrders: [],
      };
    }

    const inProcessingStatuses: OrderStatus[] = [
      OrderStatus.CREATED,
      OrderStatus.PENDING_CONFIRMATION,
      OrderStatus.CONFIRMED,
      OrderStatus.ASSIGNED_TO_DRIVER,
      OrderStatus.ACCEPTED_BY_DRIVER,
      OrderStatus.PICKED_UP,
      OrderStatus.IN_TRANSIT,
      OrderStatus.DELIVERED_TO_WAREHOUSE,
    ];

    const completedStatuses: OrderStatus[] = [
      OrderStatus.ACCEPTED_BY_MARKETPLACE,
      OrderStatus.COMPLETED,
    ];

    const [total, inProcessing, completed, recentOrders] = await Promise.all([
      prisma.order.count({ where: { clientId: client.id } }),
      prisma.order.count({ where: { clientId: client.id, status: { in: inProcessingStatuses } } }),
      prisma.order.count({ where: { clientId: client.id, status: { in: completedStatuses } } }),
      prisma.order.findMany({
        where: { clientId: client.id },
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: {
          warehouse: { select: { name: true, marketplace: true } },
        },
      }),
    ]);

    return {
      total,
      inProcessing,
      completed,
      recentOrders,
    };
  }

  /**
   * Update order status with history tracking
   */
  public static async updateStatus(
    user: AuthenticatedUser,
    orderId: string,
    dto: UpdateOrderStatusDto,
    ipAddress?: string
  ) {
    if (!['SUPER_ADMIN', 'ADMIN', 'MANAGER'].includes(user.role)) {
      throw new ForbiddenError('Only managers and administrators can change order status directly');
    }

    const existing = await this.getById(user, orderId);

    // Terminal statuses protection: rejected or cancelled orders cannot proceed
    if (
      existing.status === OrderStatus.REJECTED_BY_MANAGER ||
      existing.status === OrderStatus.CANCELLED
    ) {
      throw new ValidationError(
        `Отклонённая или отменённая заявка не может менять статус (текущий статус: ${existing.status})`
      );
    }

    // Completion rule: COMPLETED must only come from ACCEPTED_BY_MARKETPLACE
    if (
      dto.status === OrderStatus.COMPLETED &&
      existing.status !== OrderStatus.ACCEPTED_BY_MARKETPLACE
    ) {
      throw new ValidationError(
        `Завершить заявку можно только после фактической сдачи маркетплейсу (текущий статус: ${existing.status})`
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      const order = await tx.order.update({
        where: { id: orderId },
        data: {
          status: dto.status,
          ...(dto.status === OrderStatus.DELIVERED_TO_WAREHOUSE ? { deliveredAt: new Date() } : {}),
        },
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId,
          fromStatus: existing.status,
          toStatus: dto.status,
          changedById: user.id,
          comment: dto.comment,
        },
      });

      return order;
    });

    await AuditService.log({
      userId: user.id,
      action: AuditAction.STATUS_CHANGE,
      resource: 'Order',
      resourceId: orderId,
      oldValue: { status: existing.status },
      newValue: { status: dto.status },
      ipAddress,
    });

    NotificationDispatcherService.notifyStatusChanged(
      orderId,
      existing.status,
      dto.status,
      user.id,
      dto.comment
    ).catch(() => {});

    return updated;
  }

  /**
   * Assign driver to an order atomically within a Prisma transaction
   */
  public static async assignDriver(
    user: AuthenticatedUser,
    orderId: string,
    dto: AssignDriverDto,
    ipAddress?: string
  ) {
    if (!['SUPER_ADMIN', 'ADMIN', 'MANAGER'].includes(user.role)) {
      throw new ForbiddenError('Only managers and administrators can assign drivers to orders');
    }

    const result = await prisma.$transaction(async (tx) => {
      // Concurrency control: Acquire exclusive row lock on the target order in PostgreSQL
      // to serialize concurrent assignDriver calls and prevent race conditions
      if (process.env.DATABASE_URL) {
        try {
          await tx.$queryRaw`
            SELECT id, status FROM "orders" WHERE id = ${orderId} FOR UPDATE
          `;
        } catch {
          // If running under mock or SQLite test environment, proceed gracefully
        }
      }

      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: {
          assignments: {
            where: {
              status: {
                in: [
                  AssignmentStatus.ASSIGNED,
                  AssignmentStatus.ACCEPTED,
                  AssignmentStatus.IN_PROGRESS,
                ],
              },
            },
          },
        },
      });
      if (!order) throw new NotFoundError('Order', orderId);

      // Rule: Driver can only be assigned to a confirmed order, or reassigned if already in ASSIGNED_TO_DRIVER
      if (
        order.status !== OrderStatus.CONFIRMED &&
        order.status !== OrderStatus.ASSIGNED_TO_DRIVER
      ) {
        throw new ValidationError(
          `Водитель может быть назначен только на подтверждённую заявку (текущий статус: ${order.status})`
        );
      }

      const driver = await tx.driverProfile.findUnique({
        where: { id: dto.driverProfileId },
        include: { user: true },
      });
      if (!driver) throw new NotFoundError('DriverProfile', dto.driverProfileId);

      if (driver.user && !driver.user.isActive) {
        throw new ValidationError('Учётная запись водителя деактивирована');
      }

      // Check if this driver is already actively assigned to this order
      const activeAssignment = order.assignments.find(
        (a) =>
          a.status === AssignmentStatus.ASSIGNED ||
          a.status === AssignmentStatus.ACCEPTED ||
          a.status === AssignmentStatus.IN_PROGRESS
      );

      if (activeAssignment && activeAssignment.driverId === dto.driverProfileId) {
        throw new ValidationError('Этот водитель уже назначен на данную заявку');
      }

      // Reassignment: cancel previous active assignment atomically
      if (activeAssignment) {
        await tx.orderAssignment.update({
          where: { id: activeAssignment.id },
          data: {
            status: AssignmentStatus.CANCELLED,
            notes: activeAssignment.notes
              ? `${activeAssignment.notes} (Отменено менеджером: переназначен на другого водителя)`
              : 'Отменено менеджером: переназначен на другого водителя',
          },
        });
      }

      // 1. Create new OrderAssignment
      const assignment = await tx.orderAssignment.create({
        data: {
          orderId,
          driverId: dto.driverProfileId,
          notes: dto.notes,
          status: AssignmentStatus.ASSIGNED,
        },
      });

      // 2. Update order status to ASSIGNED_TO_DRIVER
      await tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.ASSIGNED_TO_DRIVER },
      });

      // 3. Create OrderStatusHistory
      await tx.orderStatusHistory.create({
        data: {
          orderId,
          fromStatus: order.status,
          toStatus: OrderStatus.ASSIGNED_TO_DRIVER,
          changedById: user.id,
          comment: activeAssignment
            ? `Driver reassigned to ${driver.fullName}`
            : `Driver ${driver.fullName} assigned to order`,
        },
      });

      return {
        assignment,
        driverFullName: driver.fullName,
        previousDriverId: activeAssignment?.driverId,
      };
    }, { timeout: 15000, maxWait: 10000 });

    await AuditService.log({
      userId: user.id,
      action: AuditAction.ASSIGNMENT_CHANGE,
      resource: 'OrderAssignment',
      resourceId: result.assignment.id,
      metadata: {
        orderId,
        driverProfileId: dto.driverProfileId,
        previousDriverId: result.previousDriverId,
      },
      ipAddress,
    });

    // Notify driver via Telegram with detailed status capturing
    let notificationResult: { sent: boolean; warning?: string; reason?: string } | boolean = { sent: false };
    try {
      notificationResult = await NotificationDispatcherService.notifyDriverOrderAssigned(
        orderId,
        dto.driverProfileId
      );
    } catch (notifErr: unknown) {
      logger.error(
        {
          event: 'DRIVER_NOTIFICATION_DISPATCH_ERROR',
          orderId,
          driverProfileId: dto.driverProfileId,
          error: notifErr instanceof Error ? notifErr.message : 'Notification dispatch error',
        },
        'Unexpected error while dispatching driver notification'
      );
      notificationResult = {
        sent: false,
        warning: 'Не удалось отправить уведомление водителю из-за сетевой ошибки',
      };
    }

    const warning =
      typeof notificationResult === 'object' && notificationResult !== null && 'warning' in notificationResult
        ? notificationResult.warning
        : undefined;
    const sent =
      typeof notificationResult === 'object' && notificationResult !== null && 'sent' in notificationResult
        ? Boolean(notificationResult.sent)
        : Boolean(notificationResult);

    return Object.assign(result.assignment, {
      notificationWarning: warning,
      notificationSent: sent,
    });
  }

  /**
   * Confirm order by manager
   */
  public static async confirmOrder(
    user: AuthenticatedUser,
    orderId: string,
    comment = 'Заявка подтверждена менеджером',
    ipAddress?: string
  ) {
    if (!['SUPER_ADMIN', 'ADMIN', 'MANAGER'].includes(user.role)) {
      throw new ForbiddenError('Только менеджеры могут подтверждать заявки');
    }

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundError('Order', orderId);

    const updated = await prisma.$transaction(async (tx) => {
      const res = await tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.CONFIRMED },
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId,
          fromStatus: order.status,
          toStatus: OrderStatus.CONFIRMED,
          changedById: user.id,
          comment,
        },
      });

      return res;
    });

    await AuditService.log({
      userId: user.id,
      action: AuditAction.STATUS_CHANGE,
      resource: 'Order',
      resourceId: orderId,
      oldValue: { status: order.status },
      newValue: { status: OrderStatus.CONFIRMED },
      ipAddress,
    });

    // Synchronize to Google Sheets (Safe non-blocking)
    GoogleSheetsSyncService.syncOrder(orderId).catch((sheetsErr) => {
      logger.error({ err: sheetsErr, orderId }, 'Failed to sync confirmed order to Google Sheets');
    });

    NotificationDispatcherService.notifyOrderConfirmed(orderId, comment).catch(() => {});

    return updated;
  }

  /**
   * Reject order with mandatory reason
   */
  public static async rejectOrder(
    user: AuthenticatedUser,
    orderId: string,
    reason: string,
    ipAddress?: string
  ) {
    if (!['SUPER_ADMIN', 'ADMIN', 'MANAGER'].includes(user.role)) {
      throw new ForbiddenError('Только менеджеры могут отклонять заявки');
    }

    if (!reason || reason.trim().length === 0) {
      throw new ValidationError('Причина отклонения обязательна для заполнения');
    }

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundError('Order', orderId);

    const updated = await prisma.$transaction(async (tx) => {
      const res = await tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.REJECTED_BY_MANAGER },
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId,
          fromStatus: order.status,
          toStatus: OrderStatus.REJECTED_BY_MANAGER,
          changedById: user.id,
          comment: `Отклонено менеджером. Причина: ${reason.trim()}`,
        },
      });

      return res;
    });

    await AuditService.log({
      userId: user.id,
      action: AuditAction.STATUS_CHANGE,
      resource: 'Order',
      resourceId: orderId,
      oldValue: { status: order.status },
      newValue: { status: OrderStatus.REJECTED_BY_MANAGER },
      metadata: { reason: reason.trim() },
      ipAddress,
    });

    NotificationDispatcherService.notifyOrderRejected(orderId, reason.trim()).catch(() => {});

    return updated;
  }

  /**
   * Update internal manager notes
   */
  public static async saveManagerNotes(
    user: AuthenticatedUser,
    orderId: string,
    notes: string,
    ipAddress?: string
  ) {
    if (!['SUPER_ADMIN', 'ADMIN', 'MANAGER'].includes(user.role)) {
      throw new ForbiddenError('Недостаточно прав для редактирования заметок менеджера');
    }

    const order = await prisma.order.update({
      where: { id: orderId },
      data: { managerNotes: notes },
    });

    await AuditService.log({
      userId: user.id,
      action: AuditAction.UPDATE,
      resource: 'Order',
      resourceId: orderId,
      metadata: { field: 'managerNotes' },
      ipAddress,
    });

    return order;
  }

  /**
   * Admin dashboard statistics
   */
  public static async getAdminDashboardStats(): Promise<AdminDashboardStats> {
    const emptyStats: AdminDashboardStats = {
      total: 0,
      created: 0,
      pendingConfirmation: 0,
      confirmed: 0,
      inDelivery: 0,
      completed: 0,
      rejected: 0,
      totalBoxes: 0,
      totalPallets: 0,
      marketplaces: { wildberries: 0, ozon: 0, wbPercentage: 0, ozonPercentage: 0 },
      dailyTrend: [],
      statusDistribution: [],
      recentOrders: [],
    };

    if (!process.env.DATABASE_URL) {
      return emptyStats;
    }

    try {
      const inDeliveryStatuses: OrderStatus[] = [
        OrderStatus.ASSIGNED_TO_DRIVER,
        OrderStatus.ACCEPTED_BY_DRIVER,
        OrderStatus.PICKED_UP,
        OrderStatus.IN_TRANSIT,
        OrderStatus.DELIVERED_TO_WAREHOUSE,
      ];
      const completedStatuses: OrderStatus[] = [
        OrderStatus.ACCEPTED_BY_MARKETPLACE,
        OrderStatus.COMPLETED,
      ];
      const rejectedStatuses: OrderStatus[] = [
        OrderStatus.REJECTED_BY_MANAGER,
        OrderStatus.CANCELLED,
      ];

      // Last 7 days points
      const now = new Date();
      const pastDays: Date[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        d.setHours(0, 0, 0, 0);
        pastDays.push(d);
      }
      const sevenDaysAgo = pastDays[0];

      const [
        total,
        created,
        pendingConfirmation,
        confirmed,
        inDelivery,
        completed,
        rejected,
        wbCount,
        ozonCount,
        cargoAggregates,
        recentOrders,
        recentOrdersForTrend,
      ] = await Promise.all([
        prisma.order.count(),
        prisma.order.count({ where: { status: OrderStatus.CREATED } }),
        prisma.order.count({ where: { status: OrderStatus.PENDING_CONFIRMATION } }),
        prisma.order.count({ where: { status: OrderStatus.CONFIRMED } }),
        prisma.order.count({ where: { status: { in: inDeliveryStatuses } } }),
        prisma.order.count({ where: { status: { in: completedStatuses } } }),
        prisma.order.count({ where: { status: { in: rejectedStatuses } } }),
        prisma.order.count({ where: { marketplace: MarketplaceType.WILDBERRIES } }),
        prisma.order.count({ where: { marketplace: MarketplaceType.OZON } }),
        prisma.order.aggregate({
          _sum: {
            totalBoxesCount: true,
            totalPalletsCount: true,
          },
        }),
        prisma.order.findMany({
          take: 10,
          orderBy: { createdAt: 'desc' },
          include: {
            warehouse: { select: { name: true, marketplace: true } },
            client: { select: { companyName: true, contactPerson: true, contactPhone: true } },
          },
        }),
        prisma.order.findMany({
          where: { createdAt: { gte: sevenDaysAgo } },
          select: { createdAt: true, marketplace: true, status: true },
        }),
      ]);

      const totalBoxes = cargoAggregates._sum.totalBoxesCount || 0;
      const totalPallets = cargoAggregates._sum.totalPalletsCount || 0;

      const totalMarketplace = wbCount + ozonCount;
      const wbPercentage = totalMarketplace > 0 ? Math.round((wbCount / totalMarketplace) * 100) : 0;
      const ozonPercentage = totalMarketplace > 0 ? 100 - wbPercentage : 0;

      // Map daily trend for each of the 7 days
      const dailyTrend: AdminDashboardDailyPoint[] = pastDays.map((dayStart) => {
        const nextDay = new Date(dayStart);
        nextDay.setDate(nextDay.getDate() + 1);

        const ordersInDay = recentOrdersForTrend.filter(
          (o) => o.createdAt >= dayStart && o.createdAt < nextDay
        );
        const wb = ordersInDay.filter((o) => o.marketplace === MarketplaceType.WILDBERRIES).length;
        const ozon = ordersInDay.filter((o) => o.marketplace === MarketplaceType.OZON).length;

        const dayNum = String(dayStart.getDate()).padStart(2, '0');
        const monthNum = String(dayStart.getMonth() + 1).padStart(2, '0');

        return {
          date: dayStart.toISOString().split('T')[0],
          label: `${dayNum}.${monthNum}`,
          count: ordersInDay.length,
          wbCount: wb,
          ozonCount: ozon,
        };
      });

      // Status breakdown
      const statusMap: { status: OrderStatus; label: string; count: number; color: string }[] = [
        { status: OrderStatus.CREATED, label: 'Новые', count: created, color: 'bg-sky-500' },
        { status: OrderStatus.PENDING_CONFIRMATION, label: 'Ожидают', count: pendingConfirmation, color: 'bg-amber-500' },
        { status: OrderStatus.CONFIRMED, label: 'Подтверждены', count: confirmed, color: 'bg-indigo-500' },
        { status: OrderStatus.IN_TRANSIT, label: 'В доставке', count: inDelivery, color: 'bg-blue-600' },
        { status: OrderStatus.COMPLETED, label: 'Завершены', count: completed, color: 'bg-emerald-500' },
        { status: OrderStatus.REJECTED_BY_MANAGER, label: 'Отклонены', count: rejected, color: 'bg-rose-500' },
      ];

      const statusDistribution: AdminDashboardStatusPoint[] = statusMap.map((s) => ({
        ...s,
        percentage: total > 0 ? Math.round((s.count / total) * 100) : 0,
      }));

      return {
        total,
        created,
        pendingConfirmation,
        confirmed,
        inDelivery,
        completed,
        rejected,
        totalBoxes,
        totalPallets,
        marketplaces: {
          wildberries: wbCount,
          ozon: ozonCount,
          wbPercentage,
          ozonPercentage,
        },
        dailyTrend,
        statusDistribution,
        recentOrders,
      };
    } catch {
      return emptyStats;
    }
  }

  /**
   * Updates delivery cost of an order (e.g. from Google Sheets or Accounting)
   */
  public static async updateDeliveryCost(
    user: AuthenticatedUser,
    params: {
      orderId?: string;
      orderNumber?: string;
      deliveryCostAmount: number;
      currency?: string;
      source?: string;
    }
  ) {
    const allowedRoles: UserRole[] = [
      UserRole.SUPER_ADMIN,
      UserRole.ADMIN,
      UserRole.MANAGER,
      UserRole.ACCOUNTANT,
    ];

    if (!allowedRoles.includes(user.role)) {
      throw new ForbiddenError('Доступ к установке стоимости доставки запрещён для данной роли');
    }

    if (!params.orderId && !params.orderNumber) {
      throw new ValidationError('Необходимо указать orderId или orderNumber заявки');
    }

    const amount = Number(params.deliveryCostAmount);
    if (isNaN(amount) || !isFinite(amount) || amount <= 0 || amount > 10_000_000) {
      throw new ValidationError(
        `Некорректная сумма стоимости доставки (${params.deliveryCostAmount}). Сумма должна быть числом от 0.01 до 10 000 000.`
      );
    }

    const order = await prisma.order.findFirst({
      where: params.orderId
        ? { id: params.orderId }
        : { orderNumber: params.orderNumber },
    });

    if (!order) {
      throw new NotFoundError('Order', params.orderId || params.orderNumber || '');
    }

    const currency = (params.currency || 'RUB').trim().toUpperCase().slice(0, 5);

    // Loop & redundant update protection:
    // If existing deliveryCostAmount and currency match the new values, skip write
    const currentCost = order.deliveryCostAmount ? Number(order.deliveryCostAmount) : null;
    if (currentCost === amount && order.currency === currency) {
      return { order, isUpdated: false };
    }

    const updated = await prisma.order.update({
      where: { id: order.id },
      data: {
        deliveryCostAmount: amount,
        currency,
      },
    });

    // Record in AuditLog
    await AuditService.log({
      userId: user.id,
      action: AuditAction.UPDATE,
      resource: 'Order',
      resourceId: order.id,
      oldValue: {
        deliveryCostAmount: currentCost,
        currency: order.currency,
      },
      newValue: {
        deliveryCostAmount: amount,
        currency,
      },
      metadata: {
        source: params.source || 'GOOGLE_SHEETS',
        orderNumber: order.orderNumber,
      },
    });

    NotificationDispatcherService.notifyCostCalculated(order.id, amount, currency).catch(() => {});

    return { order: updated, isUpdated: true };
  }

  /**
   * Manager manually advances or rolls back driver workflow status
   * (e.g. ACCEPTED_BY_DRIVER, PICKED_UP, or rollback to ASSIGNED_TO_DRIVER)
   * Updates Order.status and OrderAssignment atomically, records OrderStatusHistory and AuditLog.
   * Dispatches client notification if needed, and synchronizes to Google Sheets.
   * Topic 8 (shipping group) is NEVER spammed.
   */
  public static async updateDriverWorkflowStatusByManager(
    user: AuthenticatedUser,
    orderId: string,
    targetStatus: OrderStatus,
    comment?: string,
    ipAddress?: string
  ) {
    if (!['SUPER_ADMIN', 'ADMIN', 'MANAGER'].includes(user.role)) {
      throw new ForbiddenError('Только менеджеры могут управлять статусом водительского этапа');
    }

    const validStatuses: OrderStatus[] = [
      OrderStatus.ASSIGNED_TO_DRIVER,
      OrderStatus.ACCEPTED_BY_DRIVER,
      OrderStatus.PICKED_UP,
    ];

    if (!validStatuses.includes(targetStatus)) {
      throw new ValidationError(`Недопустимый статус водительского этапа: ${targetStatus}`);
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        assignments: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!order) {
      throw new NotFoundError('Order', orderId);
    }

    const activeAssignment = order.assignments[0];
    const previousStatus = order.status;

    const actionText =
      targetStatus === OrderStatus.ACCEPTED_BY_DRIVER
        ? 'Водитель принял заказ (установлено менеджером)'
        : targetStatus === OrderStatus.PICKED_UP
        ? 'Водитель забрал груз (установлено менеджером)'
        : 'Возврат к этапу назначения водителя (установлено менеджером)';

    const historyComment = comment ? `${actionText}. Примечание: ${comment.trim()}` : actionText;

    const updated = await prisma.$transaction(async (tx) => {
      const updatedOrder = await tx.order.update({
        where: { id: orderId },
        data: { status: targetStatus },
      });

      if (activeAssignment) {
        let assignmentStatus: AssignmentStatus = AssignmentStatus.ASSIGNED;
        if (targetStatus === OrderStatus.ACCEPTED_BY_DRIVER) {
          assignmentStatus = AssignmentStatus.ACCEPTED;
        } else if (targetStatus === OrderStatus.PICKED_UP) {
          assignmentStatus = AssignmentStatus.IN_PROGRESS;
        }

        await tx.orderAssignment.update({
          where: { id: activeAssignment.id },
          data: {
            status: assignmentStatus,
            acceptedAt:
              targetStatus === OrderStatus.ACCEPTED_BY_DRIVER || targetStatus === OrderStatus.PICKED_UP
                ? activeAssignment.acceptedAt || new Date()
                : activeAssignment.acceptedAt,
          },
        });
      }

      await tx.orderStatusHistory.create({
        data: {
          orderId,
          fromStatus: previousStatus,
          toStatus: targetStatus,
          changedById: user.id,
          comment: historyComment,
        },
      });

      return updatedOrder;
    });

    await AuditService.log({
      userId: user.id,
      action: AuditAction.STATUS_CHANGE,
      resource: 'Order',
      resourceId: orderId,
      oldValue: { status: previousStatus },
      newValue: { status: targetStatus },
      metadata: {
        manualManagerOverride: true,
        assignmentId: activeAssignment?.id,
        comment: comment || null,
      },
      ipAddress,
    });

    // Sync to Google Sheets
    GoogleSheetsSyncService.syncOrder(orderId).catch((sheetsErr) => {
      logger.error({ err: sheetsErr, orderId }, 'Failed to sync status change to Google Sheets');
    });

    // Notify client (silenced for group topic 8)
    NotificationDispatcherService.notifyStatusChanged(
      orderId,
      previousStatus,
      targetStatus,
      comment
    ).catch(() => {});

    return updated;
  }

  /**
   * Warehouse Analytics with flexible period filters, KPI cards,
   * warehouse ranking by volume (boxes/pallets), and daily trend.
   */
  public static async getWarehouseStats(filter: WarehouseStatsFilter = {}): Promise<WarehouseStatsResult> {
    const period = filter.period || '7d';
    let fromDate: Date;
    let toDate: Date = new Date();
    toDate.setHours(23, 59, 59, 999);

    const now = new Date();

    switch (period) {
      case 'today':
        fromDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
        break;
      case 'yesterday': {
        const yest = new Date(now);
        yest.setDate(yest.getDate() - 1);
        fromDate = new Date(yest.getFullYear(), yest.getMonth(), yest.getDate(), 0, 0, 0, 0);
        toDate = new Date(yest.getFullYear(), yest.getMonth(), yest.getDate(), 23, 59, 59, 999);
        break;
      }
      case '30d':
        fromDate = new Date(now);
        fromDate.setDate(fromDate.getDate() - 29);
        fromDate.setHours(0, 0, 0, 0);
        break;
      case 'month':
        fromDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
        break;
      case 'custom':
        fromDate = filter.fromDate ? new Date(filter.fromDate) : new Date(now.getTime() - 7 * 86400000);
        fromDate.setHours(0, 0, 0, 0);
        if (filter.toDate) {
          toDate = new Date(filter.toDate);
          toDate.setHours(23, 59, 59, 999);
        }
        break;
      case '7d':
      default:
        fromDate = new Date(now);
        fromDate.setDate(fromDate.getDate() - 6);
        fromDate.setHours(0, 0, 0, 0);
        break;
    }

    const orderWhere: Record<string, any> = {
      createdAt: {
        gte: fromDate,
        lte: toDate,
      },
    };

    const destinations = await prisma.orderDestination.findMany({
      where: {
        order: orderWhere,
        ...(filter.warehouseId && filter.warehouseId !== 'all'
          ? filter.warehouseId === 'custom'
            ? { isCustomWarehouse: true }
            : { warehouseId: filter.warehouseId }
          : {}),
      },
      include: {
        warehouse: true,
        order: {
          select: {
            id: true,
            status: true,
            marketplace: true,
            createdAt: true,
          },
        },
      },
    });

    const uniqueOrderIds = new Set<string>();
    let totalBoxes = 0;
    let totalPallets = 0;
    let completedOrdersCount = 0;
    let inDeliveryOrdersCount = 0;

    const inDeliveryStatuses: OrderStatus[] = [
      OrderStatus.ASSIGNED_TO_DRIVER,
      OrderStatus.ACCEPTED_BY_DRIVER,
      OrderStatus.PICKED_UP,
      OrderStatus.IN_TRANSIT,
      OrderStatus.DELIVERED_TO_WAREHOUSE,
    ];
    const completedStatuses: OrderStatus[] = [
      OrderStatus.ACCEPTED_BY_MARKETPLACE,
      OrderStatus.COMPLETED,
    ];

    const marketCounts = {
      wb: { orders: new Set<string>(), boxes: 0, pallets: 0 },
      ozon: { orders: new Set<string>(), boxes: 0, pallets: 0 },
    };

    const warehouseMap = new Map<string, {
      warehouseId: string | null;
      warehouseName: string;
      marketplace: string;
      city: string;
      isCustom: boolean;
      ordersSet: Set<string>;
      boxesCount: number;
      palletsCount: number;
    }>();

    for (const d of destinations) {
      uniqueOrderIds.add(d.orderId);
      totalBoxes += d.boxesCount;
      totalPallets += d.palletsCount;

      if (d.order) {
        if (completedStatuses.includes(d.order.status)) {
          completedOrdersCount++;
        } else if (inDeliveryStatuses.includes(d.order.status)) {
          inDeliveryOrdersCount++;
        }

        if (d.order.marketplace === MarketplaceType.WILDBERRIES) {
          marketCounts.wb.orders.add(d.orderId);
          marketCounts.wb.boxes += d.boxesCount;
          marketCounts.wb.pallets += d.palletsCount;
        } else if (d.order.marketplace === MarketplaceType.OZON) {
          marketCounts.ozon.orders.add(d.orderId);
          marketCounts.ozon.boxes += d.boxesCount;
          marketCounts.ozon.pallets += d.palletsCount;
        }
      }

      const mapKey = d.isCustomWarehouse
        ? `custom:${(d.customWarehouseName || 'Индивидуальный склад').trim()}`
        : (d.warehouseId || 'unknown');

      const existing = warehouseMap.get(mapKey);
      const name = d.isCustomWarehouse
        ? (d.customWarehouseName || 'Индивидуальный склад')
        : (d.warehouse?.name || 'Не указан');
      const mp = d.warehouse?.marketplace || (d.order?.marketplace || 'WILDBERRIES');
      const city = d.warehouse?.city || '—';

      if (!existing) {
        warehouseMap.set(mapKey, {
          warehouseId: d.warehouseId,
          warehouseName: name,
          marketplace: mp,
          city,
          isCustom: d.isCustomWarehouse,
          ordersSet: new Set([d.orderId]),
          boxesCount: d.boxesCount,
          palletsCount: d.palletsCount,
        });
      } else {
        existing.ordersSet.add(d.orderId);
        existing.boxesCount += d.boxesCount;
        existing.palletsCount += d.palletsCount;
      }
    }

    const warehousesRanking: WarehouseRankingItem[] = Array.from(warehouseMap.values())
      .map((item) => ({
        warehouseId: item.warehouseId,
        warehouseName: item.warehouseName,
        marketplace: item.marketplace,
        city: item.city,
        isCustom: item.isCustom,
        ordersCount: item.ordersSet.size,
        boxesCount: item.boxesCount,
        palletsCount: item.palletsCount,
        boxesPercentage: totalBoxes > 0 ? Math.round((item.boxesCount / totalBoxes) * 100) : 0,
        palletsPercentage: totalPallets > 0 ? Math.round((item.palletsCount / totalPallets) * 100) : 0,
      }))
      .sort((a, b) => (b.boxesCount + b.palletsCount * 10) - (a.boxesCount + a.palletsCount * 10));

    const dailyTrend: WarehouseDailyTrendPoint[] = [];
    const curDate = new Date(fromDate);
    const dayEnd = new Date(toDate);

    while (curDate <= dayEnd && dailyTrend.length < 60) {
      const nextDate = new Date(curDate);
      nextDate.setDate(nextDate.getDate() + 1);

      const dayDests = destinations.filter((d) => {
        const orderDate = d.order?.createdAt || d.createdAt;
        return orderDate >= curDate && orderDate < nextDate;
      });

      const dayOrders = new Set(dayDests.map((d) => d.orderId));
      const dayBoxes = dayDests.reduce((sum, d) => sum + d.boxesCount, 0);
      const dayPallets = dayDests.reduce((sum, d) => sum + d.palletsCount, 0);

      const dStr = curDate.toISOString().split('T')[0];
      const dayNum = String(curDate.getDate()).padStart(2, '0');
      const monNum = String(curDate.getMonth() + 1).padStart(2, '0');

      dailyTrend.push({
        date: dStr,
        label: `${dayNum}.${monNum}`,
        ordersCount: dayOrders.size,
        boxesCount: dayBoxes,
        palletsCount: dayPallets,
      });

      curDate.setDate(curDate.getDate() + 1);
    }

    const totalOrdersCount = uniqueOrderIds.size;
    const totalCargoUnits = totalBoxes + totalPallets;

    return {
      period,
      fromDate: fromDate.toISOString().split('T')[0],
      toDate: toDate.toISOString().split('T')[0],
      kpi: {
        totalOrders: totalOrdersCount,
        totalBoxes,
        totalPallets,
        completedOrders: completedOrdersCount,
        inDeliveryOrders: inDeliveryOrdersCount,
        activeDestinations: destinations.length,
      },
      warehouses: warehousesRanking,
      dailyTrend,
      marketplaceBreakdown: {
        wb: {
          orders: marketCounts.wb.orders.size,
          boxes: marketCounts.wb.boxes,
          pallets: marketCounts.wb.pallets,
          percentage: totalCargoUnits > 0
            ? Math.round(((marketCounts.wb.boxes + marketCounts.wb.pallets) / totalCargoUnits) * 100)
            : 50,
        },
        ozon: {
          orders: marketCounts.ozon.orders.size,
          boxes: marketCounts.ozon.boxes,
          pallets: marketCounts.ozon.pallets,
          percentage: totalCargoUnits > 0
            ? Math.round(((marketCounts.ozon.boxes + marketCounts.ozon.pallets) / totalCargoUnits) * 100)
            : 50,
        },
      },
    };
  }
}
