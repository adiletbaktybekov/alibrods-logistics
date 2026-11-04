import { z } from 'zod';
import { MarketplaceType } from '@prisma/client';

export const createWarehouseSchema = z.object({
  name: z.string().min(2),
  code: z.string().min(2).toUpperCase(),
  marketplace: z.nativeEnum(MarketplaceType),
  address: z.string().min(5),
  city: z.string().min(2),
  region: z.string().optional(),
  geoLatitude: z.number().optional(),
  geoLongitude: z.number().optional(),
  operatingHours: z.string().optional(),
  contactPhone: z.string().optional(),
});

export type CreateWarehouseDto = z.infer<typeof createWarehouseSchema>;
