import { prisma } from '@/database/prisma';
import { NotFoundError, ConflictError, ForbiddenError } from '@/lib/errors';
import { Prisma, UserRole, OrderStatus, AuditAction } from '@prisma/client';
import { AuditService } from '@/modules/audit/audit.service';
import { UpdateClientProfileDto } from './clients.dto';

export type ClientListItem = Prisma.ClientProfileGetPayload<{
  include: {
    user: {
      select: {
        id: true;
        email: true;
        phone: true;
        isActive: true;
        lastLoginAt: true;
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
        orders: true;
      };
    };
  };
}>;

export type ClientDetail = Prisma.ClientProfileGetPayload<{
  include: {
    user: {
      select: {
        id: true;
        email: true;
        phone: true;
        isActive: true;
        createdAt: true;
        telegramAccount: {
          select: {
            telegramId: true;
            username: true;
          };
        };
      };
    };
    defaultWarehouse: true;
    orders: {
      include: { warehouse: true };
    };
  };
}>;

import { sanitizePaginationParams } from '@/lib/pagination';

export interface ListClientsParams {
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface PaginatedClientsResult {
  items: ClientListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export class ClientsService {
  public static async listWithPagination(
    params: ListClientsParams = {}
  ): Promise<PaginatedClientsResult> {
    const { page, pageSize, skip } = sanitizePaginationParams(params.page, params.pageSize);

    if (!process.env.DATABASE_URL) {
      return { items: [], total: 0, page, pageSize, totalPages: 1 };
    }

    try {
      const where: Prisma.ClientProfileWhereInput = {};

      if (params.search && params.search.trim() !== '') {
        const query = params.search.trim();
        where.OR = [
          { companyName: { contains: query, mode: 'insensitive' } },
          { legalName: { contains: query, mode: 'insensitive' } },
          { inn: { contains: query, mode: 'insensitive' } },
          { contactPerson: { contains: query, mode: 'insensitive' } },
          { contactPhone: { contains: query, mode: 'insensitive' } },
          { contactEmail: { contains: query, mode: 'insensitive' } },
          { user: { phone: { contains: query, mode: 'insensitive' } } },
          { user: { email: { contains: query, mode: 'insensitive' } } },
        ];
      }

      const [items, total] = await Promise.all([
        prisma.clientProfile.findMany({
          where,
          skip,
          take: pageSize,
          orderBy: { createdAt: 'desc' },
          include: {
            user: {
              select: {
                id: true,
                email: true,
                phone: true,
                isActive: true,
                lastLoginAt: true,
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
                orders: true,
              },
            },
          },
        }),
        prisma.clientProfile.count({ where }),
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

  public static async listAll(): Promise<ClientListItem[]> {
    if (!process.env.DATABASE_URL) return [] as ClientListItem[];
    try {
      return await prisma.clientProfile.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              phone: true,
              isActive: true,
              lastLoginAt: true,
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
              orders: true,
            },
          },
        },
      });
    } catch {
      return [] as ClientListItem[];
    }
  }

  public static async getById(clientId: string): Promise<ClientDetail> {
    if (!process.env.DATABASE_URL) throw new NotFoundError('ClientProfile', clientId);
    const profile = await prisma.clientProfile.findUnique({
      where: { id: clientId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            phone: true,
            isActive: true,
            createdAt: true,
            telegramAccount: {
              select: {
                telegramId: true,
                username: true,
              },
            },
          },
        },
        defaultWarehouse: true,
        orders: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: { warehouse: true },
        },
      },
    });
    if (!profile) throw new NotFoundError('ClientProfile', clientId);
    return profile;
  }

  public static async getByUserId(userId: string) {
    if (!process.env.DATABASE_URL) throw new NotFoundError('ClientProfile for user', userId);
    const profile = await prisma.clientProfile.findUnique({
      where: { userId },
      include: { defaultWarehouse: true },
    });
    if (!profile) {
      throw new NotFoundError('ClientProfile for user', userId);
    }
    return profile;
  }

  public static async update(userId: string, dto: UpdateClientProfileDto) {
    return prisma.clientProfile.update({
      where: { userId },
      data: dto,
    });
  }

  public static async updateByAdmin(
    clientId: string,
    data: { warehouseAddress?: string; notes?: string }
  ) {
    return prisma.clientProfile.update({
      where: { id: clientId },
      data: {
        ...(data.warehouseAddress !== undefined ? { warehouseAddress: data.warehouseAddress } : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
      },
    });
  }

  public static async deleteClient(
    clientId: string,
    performedByUserId: string,
    ipAddress?: string
  ): Promise<{ success: boolean; message: string }> {
    if (!process.env.DATABASE_URL) throw new Error('Database not configured');

    const client = await prisma.clientProfile.findUnique({
      where: { id: clientId },
      include: {
        user: {
          include: {
            telegramAccount: true,
          },
        },
        orders: {
          select: {
            id: true,
            status: true,
            orderNumber: true,
          },
        },
      },
    });

    if (!client) {
      throw new NotFoundError('ClientProfile', clientId);
    }

    if (client.user.role === UserRole.SUPER_ADMIN) {
      throw new ForbiddenError('Удаление супер-администратора строго запрещено');
    }

    if (client.userId === performedByUserId) {
      throw new ForbiddenError('Нельзя удалить свой собственный аккаунт');
    }

    // 1. Check for active orders
    const activeOrders = client.orders.filter(
      (o) =>
        !(
          [
            OrderStatus.COMPLETED,
            OrderStatus.CANCELLED,
            OrderStatus.REJECTED_BY_MANAGER,
          ] as OrderStatus[]
        ).includes(o.status)
    );

    if (activeOrders.length > 0) {
      const activeNumbers = activeOrders.map((o) => `#${o.orderNumber}`).slice(0, 5).join(', ');
      throw new ConflictError(
        `Невозможно удалить клиента: найдено ${activeOrders.length} активных заказов (${activeNumbers}). Завершите или отмените их перед удалением.`
      );
    }

    const totalOrdersCount = client.orders.length;
    const clientPhone = client.contactPhone || client.user.phone || '';
    const companyName = client.companyName;

    if (totalOrdersCount === 0) {
      // Clean delete: client has zero orders
      await prisma.$transaction(async (tx) => {
        await tx.telegramPairingCode.deleteMany({ where: { userId: client.userId } });
        await tx.telegramAccount.deleteMany({ where: { userId: client.userId } });
        await tx.clientProfile.delete({ where: { id: client.id } });
        await tx.user.delete({ where: { id: client.userId } });
      });

      await AuditService.log({
        userId: performedByUserId,
        action: AuditAction.DELETE,
        resource: 'ClientProfile',
        resourceId: client.id,
        ipAddress,
        metadata: {
          companyName,
          phone: clientPhone,
          mode: 'HARD_DELETE_ZERO_ORDERS',
        },
      });

      return {
        success: true,
        message: `Аккаунт клиента «${companyName}» успешно и полностью удалён.`,
      };
    } else {
      // Safe archival delete: client has historical orders
      const archivedPhone = `del_${Date.now()}_${client.user.phone || client.id}`;
      const archivedEmail = client.user.email ? `del_${Date.now()}_${client.user.email}` : null;

      await prisma.$transaction(async (tx) => {
        await tx.telegramPairingCode.deleteMany({ where: { userId: client.userId } });
        await tx.telegramAccount.deleteMany({ where: { userId: client.userId } });

        await tx.clientProfile.update({
          where: { id: client.id },
          data: {
            companyName: companyName.includes('[Удалён]') ? companyName : `${companyName} [Удалён]`,
            notes: `${client.notes ? `${client.notes} | ` : ''}Аккаунт удалён администратором ${new Date().toISOString()}`,
          },
        });

        await tx.user.update({
          where: { id: client.userId },
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
        resource: 'ClientProfile',
        resourceId: client.id,
        ipAddress,
        metadata: {
          companyName,
          phone: clientPhone,
          mode: 'SAFE_ARCHIVE_WITH_HISTORY',
          historicalOrdersCount: totalOrdersCount,
        },
      });

      return {
        success: true,
        message: `Аккаунт клиента «${companyName}» удалён, сессия отозвана, привязка Telegram снята. История ${totalOrdersCount} завершённых заказов сохранена в архиве.`,
      };
    }
  }
}

