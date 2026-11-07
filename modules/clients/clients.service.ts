import { prisma } from '@/database/prisma';
import { NotFoundError } from '@/lib/errors';
import { Prisma } from '@prisma/client';
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
    user: { select: { id: true; email: true; phone: true; isActive: true; createdAt: true } };
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
        user: { select: { id: true, email: true, phone: true, isActive: true, createdAt: true } },
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
}
