import { prisma } from '@/database/prisma';
import { NotFoundError, ConflictError, ForbiddenError } from '@/lib/errors';
import { Prisma, UserRole, AuditAction } from '@prisma/client';
import { AuditService } from '@/modules/audit/audit.service';
import { normalizePhoneNumber, validatePhoneNumber } from '@/lib/phone';
import { CreateDriverProfileDto, RegisterDriverDto } from './drivers.dto';

export type DriverListItem = Prisma.DriverProfileGetPayload<{
  include: {
    user: {
      select: {
        id: true;
        phone: true;
        email: true;
        isActive: true;
        telegramAccount: {
          select: {
            telegramId: true;
            username: true;
          };
        };
      };
    };
    _count: {
      select: {
        assignments: true;
      };
    };
  };
}>;

import { sanitizePaginationParams } from '@/lib/pagination';

export interface ListDriversParams {
  search?: string;
  isAvailable?: boolean;
  isActive?: boolean;
  page?: number;
  pageSize?: number;
}

export interface PaginatedDriversResult {
  items: DriverListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export class DriversService {
  public static async listWithPagination(
    params: ListDriversParams = {}
  ): Promise<PaginatedDriversResult> {
    const { page, pageSize, skip } = sanitizePaginationParams(params.page, params.pageSize);

    if (!process.env.DATABASE_URL) {
      return { items: [], total: 0, page, pageSize, totalPages: 1 };
    }

    try {
      const where: Prisma.DriverProfileWhereInput = {};

      if (params.search && params.search.trim() !== '') {
        const query = params.search.trim();
        where.OR = [
          { fullName: { contains: query, mode: 'insensitive' } },
          { vehicleModel: { contains: query, mode: 'insensitive' } },
          { vehiclePlateNumber: { contains: query, mode: 'insensitive' } },
          { user: { phone: { contains: query, mode: 'insensitive' } } },
          { user: { email: { contains: query, mode: 'insensitive' } } },
        ];
      }

      if (typeof params.isAvailable === 'boolean') {
        where.isAvailable = params.isAvailable;
      }

      if (typeof params.isActive === 'boolean') {
        where.user = {
          isActive: params.isActive,
        };
      }

      const [items, total] = await Promise.all([
        prisma.driverProfile.findMany({
          where,
          skip,
          take: pageSize,
          orderBy: { createdAt: 'desc' },
          include: {
            user: {
              select: {
                id: true,
                phone: true,
                email: true,
                isActive: true,
                telegramAccount: {
                  select: {
                    telegramId: true,
                    username: true,
                  },
                },
              },
            },
            _count: {
              select: {
                assignments: true,
              },
            },
          },
        }),
        prisma.driverProfile.count({ where }),
      ]);

      const totalPages = total > 0 ? Math.ceil(total / pageSize) : 1;

      return {
        items,
        total,
        page,
        pageSize,
        totalPages,
      };
    } catch {
      return { items: [], total: 0, page, pageSize, totalPages: 1 };
    }
  }

  public static async listAll(): Promise<DriverListItem[]> {
    if (!process.env.DATABASE_URL) return [] as DriverListItem[];
    try {
      return await prisma.driverProfile.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              phone: true,
              email: true,
              isActive: true,
              telegramAccount: {
                select: {
                  telegramId: true,
                  username: true,
                },
              },
            },
          },
          _count: {
            select: {
              assignments: true,
            },
          },
        },
      });
    } catch {
      return [] as DriverListItem[];
    }
  }

  public static async getByUserId(userId: string) {
    if (!process.env.DATABASE_URL) throw new NotFoundError('DriverProfile for user', userId);
    const driver = await prisma.driverProfile.findUnique({
      where: { userId },
      include: { user: { select: { phone: true, email: true, isActive: true } } },
    });
    if (!driver) throw new NotFoundError('DriverProfile for user', userId);
    return driver;
  }

  public static async listAvailable() {
    if (!process.env.DATABASE_URL) return [];
    try {
      return await prisma.driverProfile.findMany({
        where: { isAvailable: true, user: { isActive: true } },
        include: { user: { select: { phone: true, email: true } } },
      });
    } catch {
      return [];
    }
  }

  public static async registerDriver(
    dto: RegisterDriverDto,
    performedByUserId: string,
    ipAddress?: string
  ) {
    const existing = await prisma.user.findFirst({
      where: { phone: dto.phone },
    });
    if (existing) {
      throw new ConflictError('Пользователь с таким номером телефона уже существует');
    }

    const user = await prisma.user.create({
      data: {
        phone: dto.phone,
        role: UserRole.DRIVER,
        isActive: true,
        driverProfile: {
          create: {
            fullName: dto.fullName,
            vehicleModel: dto.vehicleModel,
            vehiclePlateNumber: dto.vehiclePlateNumber,
            notes: dto.notes,
            isAvailable: true,
          },
        },
      },
      include: {
        driverProfile: true,
      },
    });

    await AuditService.log({
      userId: performedByUserId,
      action: AuditAction.CREATE,
      resource: 'DriverProfile',
      resourceId: user.driverProfile?.id,
      ipAddress,
      metadata: { phone: dto.phone, fullName: dto.fullName },
    });

    return user.driverProfile;
  }

  public static async create(dto: CreateDriverProfileDto) {
    return prisma.driverProfile.create({ data: dto });
  }

  public static async setAvailability(driverId: string, isAvailable: boolean) {
    return prisma.driverProfile.update({
      where: { id: driverId },
      data: { isAvailable },
    });
  }

  public static async deleteDriver(
    driverProfileId: string,
    performedByUserId: string,
    ipAddress?: string
  ): Promise<{ success: boolean; message: string }> {
    if (!process.env.DATABASE_URL) throw new Error('Database not configured');

    const driver = await prisma.driverProfile.findUnique({
      where: { id: driverProfileId },
      include: {
        user: {
          include: {
            telegramAccount: true,
          },
        },
        assignments: {
          include: {
            order: {
              select: {
                id: true,
                orderNumber: true,
                status: true,
              },
            },
          },
        },
      },
    });

    if (!driver) {
      throw new NotFoundError('DriverProfile', driverProfileId);
    }

    if (driver.user.role === UserRole.SUPER_ADMIN) {
      throw new ForbiddenError('Удаление супер-администратора строго запрещено');
    }

    if (driver.userId === performedByUserId) {
      throw new ForbiddenError('Нельзя удалить свой собственный аккаунт');
    }

    // 1. Check for active assignments
    const activeAssignments = driver.assignments.filter(
      (a) =>
        ['ASSIGNED', 'ACCEPTED', 'IN_PROGRESS'].includes(a.status) &&
        !['COMPLETED', 'CANCELLED', 'REJECTED_BY_MANAGER'].includes(a.order.status)
    );

    if (activeAssignments.length > 0) {
      const activeOrderNumbers = activeAssignments
        .map((a) => `#${a.order.orderNumber}`)
        .slice(0, 5)
        .join(', ');
      throw new ConflictError(
        `Невозможно удалить водителя: найдено ${activeAssignments.length} активных назначений на заказы (${activeOrderNumbers}). Завершите или снимите назначения перед удалением.`
      );
    }

    const totalAssignmentsCount = driver.assignments.length;
    const driverPhone = driver.user.phone || '';
    const driverName = driver.fullName;

    if (totalAssignmentsCount === 0) {
      // Clean delete: 0 assignments
      await prisma.$transaction(async (tx) => {
        await tx.telegramPairingCode.deleteMany({ where: { userId: driver.userId } });
        await tx.telegramAccount.deleteMany({ where: { userId: driver.userId } });
        if ('driverPhotoSession' in (tx as any)) {
          await (tx as any).driverPhotoSession.deleteMany({ where: { driverProfileId: driver.id } });
        }
        await tx.driverProfile.delete({ where: { id: driver.id } });
        await tx.user.delete({ where: { id: driver.userId } });
      });

      await AuditService.log({
        userId: performedByUserId,
        action: AuditAction.DELETE,
        resource: 'DriverProfile',
        resourceId: driver.id,
        ipAddress,
        metadata: {
          driverName,
          phone: driverPhone,
          mode: 'HARD_DELETE_ZERO_ASSIGNMENTS',
        },
      });

      return {
        success: true,
        message: `Водитель «${driverName}» успешно и полностью удалён.`,
      };
    } else {
      // Safe archival delete: has historical assignments
      const archivedPhone = `del_${Date.now()}_${driver.user.phone || driver.id}`;
      const archivedEmail = driver.user.email ? `del_${Date.now()}_${driver.user.email}` : null;

      await prisma.$transaction(async (tx) => {
        await tx.telegramPairingCode.deleteMany({ where: { userId: driver.userId } });
        await tx.telegramAccount.deleteMany({ where: { userId: driver.userId } });
        if ('driverPhotoSession' in (tx as any)) {
          await (tx as any).driverPhotoSession.deleteMany({ where: { driverProfileId: driver.id } });
        }

        await tx.driverProfile.update({
          where: { id: driver.id },
          data: {
            fullName: driverName.includes('[Удалён]') ? driverName : `${driverName} [Удалён]`,
            isAvailable: false,
            notes: `${driver.notes ? `${driver.notes} | ` : ''}Аккаунт удалён администратором ${new Date().toISOString()}`,
          },
        });

        await tx.user.update({
          where: { id: driver.userId },
          data: {
            isActive: false,
            passwordHash: null,
            phone: archivedPhone,
            email: archivedEmail,
            tokenVersion: { increment: 10 },
          },
        });
      });

      await AuditService.log({
        userId: performedByUserId,
        action: AuditAction.DELETE,
        resource: 'DriverProfile',
        resourceId: driver.id,
        ipAddress,
        metadata: {
          driverName,
          phone: driverPhone,
          mode: 'SAFE_ARCHIVE_WITH_HISTORY',
          historicalAssignmentsCount: totalAssignmentsCount,
        },
      });

      return {
        success: true,
        message: `Аккаунт водителя «${driverName}» удалён, сессия отозвана, Telegram отвязан. История ${totalAssignmentsCount} завершённых доставок сохранена в архиве.`,
      };
    }
  }

  /**
   * Updates driver profile and credentials by administrator
   */
  public static async updateDriverByAdmin(
    driverProfileId: string,
    data: {
      fullName: string;
      phone: string;
      vehicleModel?: string | null;
      vehiclePlateNumber?: string | null;
      notes?: string | null;
      isAvailable?: boolean;
      isActive?: boolean;
    },
    performedByUserId: string,
    ipAddress?: string
  ): Promise<{ success: boolean; message: string }> {
    if (!process.env.DATABASE_URL) throw new Error('Database not configured');

    const driver = await prisma.driverProfile.findUnique({
      where: { id: driverProfileId },
      include: {
        user: true,
      },
    });

    if (!driver) {
      throw new NotFoundError('DriverProfile', driverProfileId);
    }

    const trimmedName = data.fullName.trim();
    if (trimmedName.length < 2) {
      throw new Error('ФИО водителя должно содержать минимум 2 символа');
    }

    const phoneValidation = validatePhoneNumber(data.phone.trim(), 'RU');
    if (!phoneValidation.isValid) {
      throw new Error('Укажите корректный номер телефона водителя');
    }
    const normalizedPhone = phoneValidation.normalized || normalizePhoneNumber(data.phone.trim(), 'RU');
    if (!normalizedPhone) {
      throw new Error('Укажите корректный номер телефона водителя');
    }

    // Check if phone is already taken by another user
    if (normalizedPhone !== driver.user.phone) {
      const existingUser = await prisma.user.findFirst({
        where: {
          phone: normalizedPhone,
          id: { not: driver.userId },
        },
      });
      if (existingUser) {
        throw new ConflictError('Пользователь с таким номером телефона уже зарегистрирован в системе');
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: driver.userId },
        data: {
          phone: normalizedPhone,
          isActive: typeof data.isActive === 'boolean' ? data.isActive : undefined,
        },
      });

      await tx.driverProfile.update({
        where: { id: driverProfileId },
        data: {
          fullName: trimmedName,
          vehicleModel: data.vehicleModel !== undefined ? (data.vehicleModel?.trim() || null) : undefined,
          vehiclePlateNumber: data.vehiclePlateNumber !== undefined ? (data.vehiclePlateNumber?.trim() || null) : undefined,
          notes: data.notes !== undefined ? (data.notes?.trim() || null) : undefined,
          isAvailable: typeof data.isAvailable === 'boolean' ? data.isAvailable : undefined,
        },
      });
    });

    await AuditService.log({
      userId: performedByUserId,
      action: AuditAction.UPDATE,
      resource: 'DriverProfile',
      resourceId: driver.id,
      ipAddress,
      metadata: {
        driverName: trimmedName,
        phone: normalizedPhone,
        isAvailable: data.isAvailable,
        isActive: data.isActive,
      },
    });

    return {
      success: true,
      message: `Данные водителя «${trimmedName}» успешно обновлены`,
    };
  }

  /**
   * Safely unlinks driver's Telegram account so they can reconnect via Driver Bot
   */
  public static async unlinkTelegram(
    driverProfileId: string,
    performedByUserId: string,
    ipAddress?: string
  ): Promise<{ success: boolean; message: string }> {
    if (!process.env.DATABASE_URL) throw new Error('Database not configured');

    const driver = await prisma.driverProfile.findUnique({
      where: { id: driverProfileId },
      include: {
        user: {
          include: {
            telegramAccount: true,
          },
        },
      },
    });

    if (!driver) {
      throw new NotFoundError('DriverProfile', driverProfileId);
    }

    await prisma.$transaction(async (tx) => {
      await tx.telegramPairingCode.deleteMany({ where: { userId: driver.userId } });
      await tx.telegramAccount.deleteMany({ where: { userId: driver.userId } });
    });

    await AuditService.log({
      userId: performedByUserId,
      action: AuditAction.UPDATE,
      resource: 'DriverProfile',
      resourceId: driver.id,
      ipAddress,
      metadata: {
        driverName: driver.fullName,
        action: 'UNLINK_TELEGRAM',
      },
    });

    return {
      success: true,
      message: `Telegram аккаунт водителя «${driver.fullName}» успешно отвязан. Водитель может сгенерировать новый код и повторно привязать бота.`,
    };
  }
}

