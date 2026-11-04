import { prisma } from '@/database/prisma';
import { NotFoundError } from '@/lib/errors';
import { MarketplaceType } from '@prisma/client';
import { CreateWarehouseDto } from './warehouses.dto';

export class WarehousesService {
  public static async list(marketplace?: MarketplaceType) {
    return prisma.warehouse.findMany({
      where: {
        isActive: true,
        ...(marketplace ? { marketplace } : {}),
      },
      orderBy: { name: 'asc' },
    });
  }

  public static async getById(id: string) {
    const wh = await prisma.warehouse.findUnique({ where: { id } });
    if (!wh) throw new NotFoundError('Warehouse', id);
    return wh;
  }

  public static async create(dto: CreateWarehouseDto) {
    return prisma.warehouse.create({ data: dto });
  }
}
