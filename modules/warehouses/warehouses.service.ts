import { prisma } from '@/database/prisma';
import { NotFoundError, ValidationError } from '@/lib/errors';
import { MarketplaceType } from '@prisma/client';
import { CreateWarehouseDto } from './warehouses.dto';

export type WarehouseSchedule = 'DAILY' | 'MWF' | 'TTS';

export interface WarehouseItem {
  id: string;
  name: string;
  code: string;
  marketplace: MarketplaceType;
  schedule: WarehouseSchedule;
  scheduleDescription: string;
  address?: string;
  city?: string;
  isActive: boolean;
}

export const RUSSIAN_DAY_NAMES: Record<number, string> = {
  0: 'Воскресенье',
  1: 'Понедельник',
  2: 'Вторник',
  3: 'Среда',
  4: 'Четверг',
  5: 'Пятница',
  6: 'Суббота',
};

// 0 = Sunday, 1 = Monday, 2 = Tuesday, 3 = Wednesday, 4 = Thursday, 5 = Friday, 6 = Saturday
export const SCHEDULE_DAYS: Record<WarehouseSchedule, number[]> = {
  DAILY: [0, 1, 2, 3, 4, 5, 6], // Ежедневно
  MWF: [1, 3, 5],               // Понедельник / среда / пятница
  TTS: [2, 4, 6],               // Вторник / четверг / суббота
};

/**
 * 12 подтверждённых складов AliBros Logistics
 * Без вымышленных адресов и координат.
 */
export const CONFIRMED_WAREHOUSES: WarehouseItem[] = [
  // Ежедневно
  {
    id: 'c0000001-0000-0000-0000-000000000001',
    name: 'Коледино',
    code: 'WB_KOLEDINO',
    marketplace: MarketplaceType.WILDBERRIES,
    schedule: 'DAILY',
    scheduleDescription: 'Ежедневно',
    isActive: true,
  },
  {
    id: 'c0000001-0000-0000-0000-000000000002',
    name: 'СК Вешки',
    code: 'WB_VESHKI',
    marketplace: MarketplaceType.WILDBERRIES,
    schedule: 'DAILY',
    scheduleDescription: 'Ежедневно',
    isActive: true,
  },
  {
    id: 'c0000001-0000-0000-0000-000000000003',
    name: 'Подольск',
    code: 'WB_PODOLSK',
    marketplace: MarketplaceType.WILDBERRIES,
    schedule: 'DAILY',
    scheduleDescription: 'Ежедневно',
    isActive: true,
  },
  {
    id: 'c0000001-0000-0000-0000-000000000004',
    name: 'Подольск 4',
    code: 'WB_PODOLSK_4',
    marketplace: MarketplaceType.WILDBERRIES,
    schedule: 'DAILY',
    scheduleDescription: 'Ежедневно',
    isActive: true,
  },
  {
    id: 'c0000001-0000-0000-0000-000000000005',
    name: 'ВБ Щербинка',
    code: 'WB_SCHERBINKA',
    marketplace: MarketplaceType.WILDBERRIES,
    schedule: 'DAILY',
    scheduleDescription: 'Ежедневно',
    isActive: true,
  },
  {
    id: 'c0000001-0000-0000-0000-000000000006',
    name: 'Озон Щербинка',
    code: 'OZON_SCHERBINKA',
    marketplace: MarketplaceType.OZON,
    schedule: 'DAILY',
    scheduleDescription: 'Ежедневно',
    isActive: true,
  },
  {
    id: 'c0000001-0000-0000-0000-000000000007',
    name: 'Озон Гривно',
    code: 'OZON_GRIVNO',
    marketplace: MarketplaceType.OZON,
    schedule: 'DAILY',
    scheduleDescription: 'Ежедневно',
    isActive: true,
  },

  // Понедельник / среда / пятница
  {
    id: 'c0000001-0000-0000-0000-000000000008',
    name: 'Радумля',
    code: 'WB_RADUMLYA',
    marketplace: MarketplaceType.WILDBERRIES,
    schedule: 'MWF',
    scheduleDescription: 'Понедельник / среда / пятница',
    isActive: true,
  },
  {
    id: 'c0000001-0000-0000-0000-000000000009',
    name: 'Обухово',
    code: 'WB_OBUKHOVO',
    marketplace: MarketplaceType.WILDBERRIES,
    schedule: 'MWF',
    scheduleDescription: 'Понедельник / среда / пятница',
    isActive: true,
  },

  // Вторник / четверг / суббота
  {
    id: 'c0000001-0000-0000-0000-000000000010',
    name: 'Чашниково',
    code: 'WB_CHASHNIKOVO',
    marketplace: MarketplaceType.WILDBERRIES,
    schedule: 'TTS',
    scheduleDescription: 'Вторник / четверг / суббота',
    isActive: true,
  },
  {
    id: 'c0000001-0000-0000-0000-000000000011',
    name: 'Чехов 1',
    code: 'WB_CHEKHOV_1',
    marketplace: MarketplaceType.WILDBERRIES,
    schedule: 'TTS',
    scheduleDescription: 'Вторник / четверг / суббота',
    isActive: true,
  },
  {
    id: 'c0000001-0000-0000-0000-000000000012',
    name: 'Чехов 2',
    code: 'WB_CHEKHOV_2',
    marketplace: MarketplaceType.WILDBERRIES,
    schedule: 'TTS',
    scheduleDescription: 'Вторник / четверг / суббота',
    isActive: true,
  },
];

/**
 * Извлекает день недели (0 = Вс, 1 = Пн, ..., 6 = Сб) без искажений часовых поясов.
 */
export function getDayOfWeekFromDate(input: string | Date): number {
  if (typeof input === 'string') {
    const match = input.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      const year = parseInt(match[1], 10);
      const month = parseInt(match[2], 10) - 1;
      const day = parseInt(match[3], 10);
      const utcDate = new Date(Date.UTC(year, month, day));
      return utcDate.getUTCDay();
    }
    const d = new Date(input);
    return d.getUTCDay();
  }
  return input.getUTCDay();
}

/**
 * Проверяет, работает ли склад в указанную дату
 */
export function isWarehouseOpenOnDate(warehouse: WarehouseItem, dateInput: string | Date): boolean {
  const dayOfWeek = getDayOfWeekFromDate(dateInput);
  const openDays = SCHEDULE_DAYS[warehouse.schedule] || SCHEDULE_DAYS.DAILY;
  return openDays.includes(dayOfWeek);
}

export class WarehousesService {
  /**
   * Возвращает подтверждённые склады
   */
  public static async list(marketplace?: MarketplaceType): Promise<WarehouseItem[]> {
    if (process.env.DATABASE_URL) {
      try {
        const records = await prisma.warehouse.findMany({
          where: {
            isActive: true,
            ...(marketplace ? { marketplace } : {}),
          },
          orderBy: { name: 'asc' },
        });

        if (records.length > 0) {
          // Обогащаем данными расписания по коду
          return records.map((r) => {
            const confirmed = CONFIRMED_WAREHOUSES.find((c) => c.code === r.code || c.name === r.name);
            return {
              id: r.id,
              name: r.name,
              code: r.code,
              marketplace: r.marketplace,
              schedule: confirmed?.schedule || 'DAILY',
              scheduleDescription: confirmed?.scheduleDescription || 'Ежедневно',
              address: r.address || undefined,
              city: r.city || undefined,
              isActive: r.isActive,
            };
          });
        }
      } catch {
        // База данных не подключена
      }
    }

    return CONFIRMED_WAREHOUSES.filter(
      (wh) => wh.isActive && (!marketplace || wh.marketplace === marketplace)
    );
  }

  /**
   * Возвращает склады, работающие в выбранную дату
   */
  public static async listAvailableForDate(
    dateInput: string | Date,
    marketplace?: MarketplaceType
  ): Promise<WarehouseItem[]> {
    const all = await this.list(marketplace);
    return all.filter((w) => isWarehouseOpenOnDate(w, dateInput));
  }

  public static async getById(id: string): Promise<WarehouseItem> {
    if (process.env.DATABASE_URL) {
      try {
        const wh = await prisma.warehouse.findUnique({ where: { id } });
        if (wh) {
          const confirmed = CONFIRMED_WAREHOUSES.find((c) => c.code === wh.code || c.name === wh.name);
          return {
            id: wh.id,
            name: wh.name,
            code: wh.code,
            marketplace: wh.marketplace,
            schedule: confirmed?.schedule || 'DAILY',
            scheduleDescription: confirmed?.scheduleDescription || 'Ежедневно',
            address: wh.address || undefined,
            city: wh.city || undefined,
            isActive: wh.isActive,
          };
        }
      } catch {
        // База данных не подключена
      }
    }

    const confirmed = CONFIRMED_WAREHOUSES.find((w) => w.id === id);
    if (confirmed) return confirmed;

    throw new NotFoundError('Warehouse', id);
  }

  /**
   * Серверная валидация: проверяет, что склад открыт в указанную дату.
   * Выбрасывает ValidationError, если склад закрыт.
   */
  public static assertWarehouseAvailable(warehouse: WarehouseItem, dateInput: string | Date): void {
    if (!isWarehouseOpenOnDate(warehouse, dateInput)) {
      const dayNum = getDayOfWeekFromDate(dateInput);
      const dayName = RUSSIAN_DAY_NAMES[dayNum] || 'выбранный день';
      throw new ValidationError(
        `Склад «${warehouse.name}» не работает в ${dayName.toLowerCase()}. График работы склада: ${warehouse.scheduleDescription}`
      );
    }
  }

  public static async create(dto: CreateWarehouseDto) {
    return prisma.warehouse.create({ data: dto });
  }
}
