import { z } from 'zod';

export const linkTelegramAccountSchema = z.object({
  userId: z.string().uuid(),
  telegramId: z.coerce.bigint(),
  username: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  languageCode: z.string().optional(),
  photoUrl: z.string().url().optional(),
});

export type LinkTelegramAccountDto = z.infer<typeof linkTelegramAccountSchema>;
