import { prisma } from '@/database/prisma';
import { generateOrderNumber } from '@/lib/utils';
import { NotFoundError, ForbiddenError, ValidationError } from '@/lib/errors';
import { assertOrderAccess } from '@/server/guards';
import { AuthenticatedUser } from '@/types/rbac';
import { AuditService } from '@/modules/audit/audit.service';
import { AuditAction, MarketplaceType, OrderStatus, Prisma, UserRole } from '@prisma/client';
import { WarehousesService } from '@/modules/warehouses/warehouses.service';
import { CreateOrderDto, CreateClientOrderDto, UpdateOrderStatusDto, AssignDriverDto } from './orders.dto';
import { NotificationDispatcherService } from '@/modules/notifications/dispatcher.service';

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
   * Creates an order from the client portal interface
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

    const warehouse = await WarehousesService.getById(dto.warehouseId);
    if (!warehouse) throw new NotFoundError('Warehouse', dto.warehouseId);

    // Server-side schedule validation
    WarehousesService.assertWarehouseAvailable(warehouse, dto.deliveryDate);

    const orderNumber = generateOrderNumber();

    const itemsData = Array.from({ length: dto.totalBoxesCount }, (_, idx) => ({
      boxNumber: idx + 1,
      quantity: 1,
      cargoDescription: `Грузовое место (коробка) №${idx + 1}`,
    }));

    const order = await prisma.order.create({
      data: {
        orderNumber,
        clientId: client.id,
        warehouseId: warehouse.id,
        marketplace: warehouse.marketplace,
        status: OrderStatus.CREATED,
        scheduledPickupAt: dto.deliveryDate,
        totalBoxesCount: dto.totalBoxesCount,
        totalPalletsCount: dto.totalPalletsCount,
        clientComment: dto.clientComment,
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
        items: true,
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

    return order;
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

    const orderNumber = generateOrderNumber();

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

    return updated;
  }

  /**
   * Assign driver to an order
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

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundError('Order', orderId);

    // Rule: Driver can only be assigned to a confirmed order
    if (order.status !== OrderStatus.CONFIRMED) {
      throw new ValidationError(
        `Водитель может быть назначен только на подтверждённую заявку (текущий статус: ${order.status})`
      );
    }

    const driver = await prisma.driverProfile.findUnique({ where: { id: dto.driverProfileId } });
    if (!driver) throw new NotFoundError('DriverProfile', dto.driverProfileId);

    const assignment = await prisma.orderAssignment.create({
      data: {
        orderId,
        driverId: dto.driverProfileId,
        notes: dto.notes,
      },
    });

    // Update order status to ASSIGNED_TO_DRIVER
    await prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.ASSIGNED_TO_DRIVER },
    });

    await prisma.orderStatusHistory.create({
      data: {
        orderId,
        fromStatus: order.status,
        toStatus: OrderStatus.ASSIGNED_TO_DRIVER,
        changedById: user.id,
        comment: `Driver ${driver.fullName} assigned to order`,
      },
    });

    await AuditService.log({
      userId: user.id,
      action: AuditAction.ASSIGNMENT_CHANGE,
      resource: 'OrderAssignment',
      resourceId: assignment.id,
      metadata: { orderId, driverProfileId: dto.driverProfileId },
      ipAddress,
    });

    // Notify driver via Telegram in background
    NotificationDispatcherService.notifyDriverOrderAssigned(orderId, dto.driverProfileId).catch(() => {});

    return assignment;
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

    return { order: updated, isUpdated: true };
  }
}
