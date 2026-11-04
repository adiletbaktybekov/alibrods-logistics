import { z } from 'zod';

export const createManagerProfileSchema = z.object({
  userId: z.string().uuid(),
  fullName: z.string().min(2),
  department: z.string().optional(),
  workPhone: z.string().optional(),
  notes: z.string().optional(),
});

export type CreateManagerProfileDto = z.infer<typeof createManagerProfileSchema>;
