import { z } from 'zod';
import { MarketplaceType, OrderStatus } from '@prisma/client';

export const reportQuerySchema = z.object({
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  marketplace: z.nativeEnum(MarketplaceType).optional(),
  status: z.nativeEnum(OrderStatus).optional(),
});

export type ReportQueryDto = z.infer<typeof reportQuerySchema>;
