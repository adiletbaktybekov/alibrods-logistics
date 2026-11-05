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

export class ClientsService {
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
