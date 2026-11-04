import { z } from 'zod';
import { NotificationChannel, NotificationType } from '@prisma/client';

export const createNotificationSchema = z.object({
  userId: z.string().uuid(),
  type: z.nativeEnum(NotificationType),
  channel: z.nativeEnum(NotificationChannel).default(NotificationChannel.TELEGRAM),
  title: z.string().min(1),
  body: z.string().min(1),
  payload: z.record(z.unknown()).optional(),
});

export type CreateNotificationDto = z.infer<typeof createNotificationSchema>;
