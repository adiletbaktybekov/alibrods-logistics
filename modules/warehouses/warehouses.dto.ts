import { z } from 'zod';
import { MarketplaceType } from '@prisma/client';

export const createWarehouseSchema = z.object({
  name: z.string().min(2, 'Название должно быть не менее 2 символов'),
  code: z.string().min(2, 'Код должен быть не менее 2 символов').toUpperCase(),
  marketplace: z.nativeEnum(MarketplaceType),
  address: z.string().min(3, 'Укажите адрес склада'),
  city: z.string().min(2, 'Укажите город'),
  region: z.string().optional(),
  geoLatitude: z.number().optional(),
  geoLongitude: z.number().optional(),
  operatingHours: z.string().optional(),
  contactPhone: z.string().optional(),
});

export type CreateWarehouseDto = z.infer<typeof createWarehouseSchema>;

export const updateWarehouseSchema = createWarehouseSchema.partial();
export type UpdateWarehouseDto = z.infer<typeof updateWarehouseSchema>;

