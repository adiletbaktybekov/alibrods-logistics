import { z } from 'zod';

export const updateClientProfileSchema = z.object({
  companyName: z.string().min(2).optional(),
  legalName: z.string().optional(),
  inn: z.string().regex(/^\d{10,14}$/, 'Invalid INN').optional(),
  kpp: z.string().optional(),
  ogrn: z.string().optional(),
  contactPerson: z.string().min(2).optional(),
  contactPhone: z.string().regex(/^\+?[1-9]\d{7,14}$/).optional(),
  contactEmail: z.string().email().optional(),
  defaultWarehouseId: z.string().uuid().optional(),
  notes: z.string().optional(),
});

export type UpdateClientProfileDto = z.infer<typeof updateClientProfileSchema>;
