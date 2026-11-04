import { z } from 'zod';

export const systemMaintenanceSchema = z.object({
  maintenanceMode: z.boolean(),
  reason: z.string().optional(),
});

export type SystemMaintenanceDto = z.infer<typeof systemMaintenanceSchema>;
