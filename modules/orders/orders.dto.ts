import { z } from 'zod';
import { MarketplaceType, OrderStatus } from '@prisma/client';

export const orderItemInputSchema = z.object({
  boxNumber: z.number().int().positive().optional(),
  boxBarcode: z.string().optional(),
  lengthCm: z.number().positive().optional(),
  widthCm: z.number().positive().optional(),
  heightCm: z.number().positive().optional(),
  weightKg: z.number().positive().optional(),
  article: z.string().optional(),
  productName: z.string().optional(),
  quantity: z.number().int().positive().default(1),
  cargoDescription: z.string().optional(),
});

export const createOrderSchema = z.object({
  warehouseId: z.string().uuid('Valid warehouse ID is required'),
  marketplace: z.nativeEnum(MarketplaceType),
  pickupAddress: z.string().min(3).optional(),
  pickupCity: z.string().optional(),
  pickupContactName: z.string().optional(),
  pickupContactPhone: z.string().regex(/^\+?[1-9]\d{7,14}$/).optional(),
  scheduledPickupAt: z.coerce.date().optional(),
  clientComment: z.string().max(1000).optional(),
  totalBoxesCount: z.number().int().min(0).optional(),
  totalPalletsCount: z.number().int().min(0).optional(),
  items: z.array(orderItemInputSchema).min(1, 'Order must contain at least one item or box'),
  idempotencyKey: z.string().optional(),
});

export const destinationItemInputSchema = z
  .object({
    warehouseId: z.string().uuid('Выберите корректный склад из списка').optional().nullable(),
    isCustomWarehouse: z.boolean().default(false),
    customWarehouseName: z.string().max(200, 'Название склада не должно превышать 200 символов').optional().nullable(),
    deliveryDate: z.coerce.date({ invalid_type_error: 'Укажите корректную дату доставки' }),
    boxesCount: z.coerce.number().int().min(0, 'Количество коробок не может быть меньше 0').default(0),
    palletsCount: z.coerce.number().int().min(0, 'Количество паллет не может быть меньше 0').default(0),
    comment: z.string().max(500, 'Комментарий не может превышать 500 символов').optional().nullable(),
  })
  .refine(
    (data) => {
      if (data.isCustomWarehouse) {
        return Boolean(data.customWarehouseName && data.customWarehouseName.trim().length >= 2);
      }
      return Boolean(data.warehouseId && data.warehouseId.trim().length > 0);
    },
    {
      message: 'Для каждой позиции выберите склад из списка или укажите название индивидуального склада (от 2 символов)',
      path: ['warehouseId'],
    }
  )
  .refine(
    (data) => data.boxesCount > 0 || data.palletsCount > 0,
    {
      message: 'Укажите количество коробок или паллет (минимум 1 единица груза для каждого склада)',
      path: ['boxesCount'],
    }
  );

export const createClientOrderSchema = z
  .object({
    orderNumber: z.string().optional(),
    destinations: z.array(destinationItemInputSchema).min(1, 'Добавьте хотя бы один склад назначения').optional(),
    // Backward-compatibility fields:
    warehouseId: z.string().uuid('Выберите склад назначения').optional().nullable(),
    deliveryDate: z.coerce.date({ invalid_type_error: 'Укажите корректную дату доставки' }).optional().nullable(),
    totalPalletsCount: z.coerce.number().int().min(0, 'Количество паллет не может быть меньше 0').default(0),
    totalBoxesCount: z.coerce.number().int().min(0).default(0),
    clientComment: z.string().max(1000, 'Комментарий не может превышать 1000 символов').optional().nullable(),
    idempotencyKey: z.string().optional(),
  })
  .refine(
    (data) => {
      if (data.destinations && data.destinations.length > 0) {
        return true;
      }
      // Legacy fallback validation
      return Boolean(data.warehouseId && data.deliveryDate && data.totalBoxesCount > 0);
    },
    {
      message: 'Укажите склад назначения, дату доставки и количество коробок (минимум 1)',
      path: ['totalBoxesCount'],
    }
  );

export const updateOrderStatusSchema = z.object({
  status: z.nativeEnum(OrderStatus),
  comment: z.string().max(500).optional(),
});

export const assignDriverSchema = z.object({
  driverProfileId: z.string().uuid(),
  notes: z.string().max(500).optional(),
});

export type OrderItemInput = z.infer<typeof orderItemInputSchema>;
export type DestinationItemInput = z.infer<typeof destinationItemInputSchema>;
export type CreateOrderDto = z.infer<typeof createOrderSchema>;
export type CreateClientOrderDto = z.infer<typeof createClientOrderSchema>;
export type UpdateOrderStatusDto = z.infer<typeof updateOrderStatusSchema>;
export type AssignDriverDto = z.infer<typeof assignDriverSchema>;

export interface WarehouseStatsFilter {
  period?: 'today' | 'yesterday' | '7d' | '30d' | 'month' | 'custom' | string;
  fromDate?: string;
  toDate?: string;
  warehouseId?: string;
}

export interface WarehouseRankingItem {
  warehouseId: string | null;
  warehouseName: string;
  marketplace: string;
  city: string;
  isCustom: boolean;
  ordersCount: number;
  boxesCount: number;
  palletsCount: number;
  boxesPercentage: number;
  palletsPercentage: number;
}

export interface WarehouseDailyTrendPoint {
  date: string;
  label: string;
  ordersCount: number;
  boxesCount: number;
  palletsCount: number;
}

export interface WarehouseStatsResult {
  period: string;
  fromDate: string;
  toDate: string;
  kpi: {
    totalOrders: number;
    totalBoxes: number;
    totalPallets: number;
    completedOrders: number;
    inDeliveryOrders: number;
    activeDestinations: number;
  };
  warehouses: WarehouseRankingItem[];
  dailyTrend: WarehouseDailyTrendPoint[];
  marketplaceBreakdown: {
    wb: { orders: number; boxes: number; pallets: number; percentage: number };
    ozon: { orders: number; boxes: number; pallets: number; percentage: number };
  };
}
