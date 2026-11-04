import { prisma } from '@/database/prisma';
import { logger } from '@/lib/logger';
import { CreateNotificationDto } from './notifications.dto';

export class NotificationsService {
  public static async queue(dto: CreateNotificationDto) {
    try {
      return await prisma.notification.create({
        data: {
          userId: dto.userId,
          type: dto.type,
          channel: dto.channel,
          title: dto.title,
          body: dto.body,
          payload: dto.payload ? (dto.payload as object) : undefined,
        },
      });
    } catch (err) {
      logger.error({ err, dto }, 'Failed to queue notification');
      throw err;
    }
  }

  public static async listForUser(userId: string, unreadOnly = false) {
    return prisma.notification.findMany({
      where: {
        userId,
        ...(unreadOnly ? { isRead: false } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  public static async markAsRead(notificationId: string, userId: string) {
    return prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { isRead: true, readAt: new Date() },
    });
  }
}
