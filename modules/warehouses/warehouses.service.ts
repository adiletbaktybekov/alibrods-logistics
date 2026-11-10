import { prisma } from '@/database/prisma';
import { NotFoundError, ValidationError } from '@/lib/errors';
import { MarketplaceType } from '@prisma/client';
import { CreateWarehouseDto } from './warehouses.dto';
import {
  type WarehouseSchedule,
  type WarehouseItem,
  RUSSIAN_DAY_NAMES,
  SCHEDULE_DAYS,
  CONFIRMED_WAREHOUSES,
  getDayOfWeekFromDate,
  isWarehouseOpenOnDate,
} from './warehouses.types';

export {
  type WarehouseSchedule,
  type WarehouseItem,
  RUSSIAN_DAY_NAMES,
  SCHEDULE_DAYS,
  CONFIRMED_WAREHOUSES,
  getDayOfWeekFromDate,
  isWarehouseOpenOnDate,
};

export class WarehousesService {
  private static seedingPromise: Promise<void> | null = null;

  /**
   * Обеспечивает наличие 12 подтверждённых складов с детерминированными UUID в БД.
   * Идемпотентно: если склады уже есть в БД, ничего не перезаписывает.
   * Защищено от параллельного выполнения через in-flight promise deduplication.
   */
  public static async ensureConfirmedWarehouses(): Promise<void> {
    if (!process.env.DATABASE_URL) return;

    if (this.seedingPromise) {
      return this.seedingPromise;
    }

    this.seedingPromise = (async () => {
      try {
        const totalCount = await prisma.warehouse.count();
        if (totalCount > 0) {
          return;
        }

        for (const wh of CONFIRMED_WAREHOUSES) {
          await prisma.warehouse.upsert({
            where: { code: wh.code },
            update: {}, // Не перезаписываем пользовательские изменения
            create: {
              id: wh.id,
              name: wh.name,
              code: wh.code,
              marketplace: wh.marketplace,
              operatingHours: wh.scheduleDescription,
              address: wh.address || wh.name,
              city: wh.city || 'Москва и МО',
              isActive: wh.isActive,
            },
          });
        }
      } catch {
        // Non-fatal fallback to in-memory catalog
      } finally {
        this.seedingPromise = null;
      }
    })();

    return this.seedingPromise;
  }

  /**
   * Возвращает подтверждённые склады
   */
  public static async list(marketplace?: MarketplaceType): Promise<WarehouseItem[]> {
    if (process.env.DATABASE_URL) {
      try {
        let records = await prisma.warehouse.findMany({
          where: {
            isActive: true,
            ...(marketplace ? { marketplace } : {}),
          },
          orderBy: { name: 'asc' },
        });

        // Самовосстановление срабатывает ТОЛЬКО если таблица складов в БД полностью пуста
        if (records.length === 0) {
          const totalCount = await prisma.warehouse.count();
          if (totalCount === 0) {
            await this.ensureConfirmedWarehouses();
            records = await prisma.warehouse.findMany({
              where: {
                isActive: true,
                ...(marketplace ? { marketplace } : {}),
              },
              orderBy: { name: 'asc' },
            });
          }
        }

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
        let wh = await prisma.warehouse.findUnique({ where: { id } });
        if (!wh) {
          const confirmedMatch = CONFIRMED_WAREHOUSES.find((c) => c.id === id);
          if (confirmedMatch) {
            await this.ensureConfirmedWarehouses();
            wh = await prisma.warehouse.findUnique({ where: { id } });
          }
        }

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
