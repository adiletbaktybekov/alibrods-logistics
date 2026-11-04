import { z } from 'zod';
import { OrderStatus } from '@prisma/client';

export const orderStatusHistoryItemSchema = z.object({
  id: z.string().uuid(),
  orderId: z.string().uuid(),
  fromStatus: z.nativeEnum(OrderStatus).nullable(),
  toStatus: z.nativeEnum(OrderStatus),
  changedById: z.string().uuid().nullable(),
  comment: z.string().nullable(),
  createdAt: z.date(),
});

export type OrderStatusHistoryItem = z.infer<typeof orderStatusHistoryItemSchema>;
