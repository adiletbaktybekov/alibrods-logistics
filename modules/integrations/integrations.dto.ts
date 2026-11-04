import { z } from 'zod';

export const updateIntegrationSettingsSchema = z.object({
  key: z.string().min(2),
  name: z.string().min(2),
  description: z.string().optional(),
  isEnabled: z.boolean(),
  config: z.record(z.unknown()),
});

export type UpdateIntegrationSettingsDto = z.infer<typeof updateIntegrationSettingsSchema>;
