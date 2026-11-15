import { z } from 'zod';
import { optionalPhoneSchema } from '@/lib/phone';

export const updateClientProfileSchema = z.object({
  companyName: z.string().min(2).optional(),
  legalName: z.string().optional(),
  inn: z.string().regex(/^\d{10,14}$/, 'ИНН должен содержать 10-14 цифр').optional().or(z.literal('')).nullable(),
  kpp: z.string().optional().nullable(),
  ogrn: z.string().optional().nullable(),
  contactPerson: z.string().min(2).optional(),
  contactPhone: optionalPhoneSchema,
  contactEmail: z.string().email().optional().or(z.literal('')).nullable(),
  defaultWarehouseId: z.string().uuid().optional().or(z.literal('')).nullable(),
  notes: z.string().optional().nullable(),
});

export type UpdateClientProfileDto = z.infer<typeof updateClientProfileSchema>;
