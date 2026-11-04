import { z } from 'zod';

export const createDriverProfileSchema = z.object({
  userId: z.string().uuid(),
  fullName: z.string().min(3),
  licenseNumber: z.string().optional(),
  vehicleModel: z.string().optional(),
  vehiclePlateNumber: z.string().optional(),
  vehicleCapacityM3: z.number().positive().optional(),
  vehiclePayloadKg: z.number().positive().optional(),
  notes: z.string().optional(),
});

export const updateDriverAvailabilitySchema = z.object({
  isAvailable: z.boolean(),
});

export type CreateDriverProfileDto = z.infer<typeof createDriverProfileSchema>;
export type UpdateDriverAvailabilityDto = z.infer<typeof updateDriverAvailabilitySchema>;
