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

export const createClientOrderSchema = z.object({
  orderNumber: z.string().optional(),
  warehouseId: z.string().uuid('Выберите склад назначения'),
  deliveryDate: z.coerce.date({ invalid_type_error: 'Укажите корректную дату доставки' }),
  totalPalletsCount: z.coerce.number().int().min(0, 'Количество паллет не может быть меньше 0').default(0),
  totalBoxesCount: z.coerce.number().int().min(1, 'Укажите количество коробок (минимум 1)'),
  clientComment: z.string().max(1000, 'Комментарий не может превышать 1000 символов').optional(),
  idempotencyKey: z.string().optional(),
});

export const updateOrderStatusSchema = z.object({
  status: z.nativeEnum(OrderStatus),
  comment: z.string().max(500).optional(),
});

export const assignDriverSchema = z.object({
  driverProfileId: z.string().uuid(),
  notes: z.string().max(500).optional(),
});

export type OrderItemInput = z.infer<typeof orderItemInputSchema>;
export type CreateOrderDto = z.infer<typeof createOrderSchema>;
export type CreateClientOrderDto = z.infer<typeof createClientOrderSchema>;
export type UpdateOrderStatusDto = z.infer<typeof updateOrderStatusSchema>;
export type AssignDriverDto = z.infer<typeof assignDriverSchema>;
