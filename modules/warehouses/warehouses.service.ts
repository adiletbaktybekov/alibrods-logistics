import { prisma } from '@/database/prisma';
import { NotFoundError } from '@/lib/errors';
import { MarketplaceType } from '@prisma/client';
import { CreateWarehouseDto } from './warehouses.dto';

export interface WarehouseItem {
  id: string;
  name: string;
  code: string;
  marketplace: MarketplaceType;
  address: string;
  city: string;
  region?: string | null;
  geoLatitude?: number | null;
  geoLongitude?: number | null;
  operatingHours?: string | null;
  contactPhone?: string | null;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export const OFFICIAL_WAREHOUSES: WarehouseItem[] = [
  {
    id: 'e0123456-789a-bcde-f012-3456789abc01',
    name: 'Коледино (Wildberries)',
    code: 'WB_KOLEDINO',
    marketplace: MarketplaceType.WILDBERRIES,
    address: 'Московская обл., г. Подольск, д. Коледино, ул. Троицкая, 20',
    city: 'Подольск',
    region: 'Московская область',
    operatingHours: 'Круглосуточно (24/7)',
    contactPhone: '+7 (495) 775-55-55',
    isActive: true,
  },
  {
    id: 'e0123456-789a-bcde-f012-3456789abc02',
    name: 'Электросталь (Wildberries)',
    code: 'WB_ELEKTROSTAL',
    marketplace: MarketplaceType.WILDBERRIES,
    address: 'Московская обл., г. Электросталь, пос. Случайный, массив 1, стр. 2',
    city: 'Электросталь',
    region: 'Московская область',
    operatingHours: 'Круглосуточно (24/7)',
    contactPhone: '+7 (495) 775-55-55',
    isActive: true,
  },
  {
    id: 'e0123456-789a-bcde-f012-3456789abc03',
    name: 'Подольск 3 (Wildberries)',
    code: 'WB_PODOLSK',
    marketplace: MarketplaceType.WILDBERRIES,
    address: 'Московская обл., г. Подольск, ул. Поливановская, 9',
    city: 'Подольск',
    region: 'Московская область',
    operatingHours: 'Круглосуточно (24/7)',
    contactPhone: '+7 (495) 775-55-55',
    isActive: true,
  },
  {
    id: 'e0123456-789a-bcde-f012-3456789abc04',
    name: 'Хоругвино (Ozon)',
    code: 'OZON_HORUGVINO',
    marketplace: MarketplaceType.OZON,
    address: 'Московская обл., Солнечногорский р-н, с/п Пешковское, д. Хоругвино, 32/2',
    city: 'Хоругвино',
    region: 'Московская область',
    operatingHours: 'Круглосуточно (24/7)',
    contactPhone: '+7 (495) 232-10-00',
    isActive: true,
  },
  {
    id: 'e0123456-789a-bcde-f012-3456789abc05',
    name: 'Софьино (Ozon)',
    code: 'OZON_SOFYINO',
    marketplace: MarketplaceType.OZON,
    address: 'Московская обл., Раменский р-н, с/п Софьинское, Логистический парк Софьино',
    city: 'Софьино',
    region: 'Московская область',
    operatingHours: 'Круглосуточно (24/7)',
    contactPhone: '+7 (495) 232-10-00',
    isActive: true,
  },
  {
    id: 'e0123456-789a-bcde-f012-3456789abc06',
    name: 'Петровское (Ozon)',
    code: 'OZON_PETROVSKOE',
    marketplace: MarketplaceType.OZON,
    address: 'Московская обл., г. Истра, с. Петровское',
    city: 'Истра',
    region: 'Московская область',
    operatingHours: 'Круглосуточно (24/7)',
    contactPhone: '+7 (495) 232-10-00',
    isActive: true,
  },
];

export class WarehousesService {
  public static async list(marketplace?: MarketplaceType): Promise<WarehouseItem[]> {
    try {
      const records = await prisma.warehouse.findMany({
        where: {
          isActive: true,
          ...(marketplace ? { marketplace } : {}),
        },
        orderBy: { name: 'asc' },
      });

      if (records.length > 0) {
        return records;
      }
    } catch {
      // Database connection offline or not yet seeded
    }

    return OFFICIAL_WAREHOUSES.filter(
      (wh) => wh.isActive && (!marketplace || wh.marketplace === marketplace)
    );
  }

  public static async getById(id: string): Promise<WarehouseItem> {
    try {
      const wh = await prisma.warehouse.findUnique({ where: { id } });
      if (wh) return wh;
    } catch {
      // Database connection offline
    }

    const official = OFFICIAL_WAREHOUSES.find((w) => w.id === id);
    if (official) return official;

    throw new NotFoundError('Warehouse', id);
  }

  public static async create(dto: CreateWarehouseDto) {
    return prisma.warehouse.create({ data: dto });
  }
}
