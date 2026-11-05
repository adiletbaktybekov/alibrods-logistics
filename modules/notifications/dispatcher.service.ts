import { prisma } from '@/database/prisma';
import { logger } from '@/lib/logger';
import { getTelegramBotClient } from '@/integrations/telegram/client';
import { OrderStatus, NotificationType, NotificationChannel } from '@prisma/client';
import { STATUS_LABELS } from '@/components/ui/status-badge';
import { NotificationsService } from './notifications.service';

export class NotificationDispatcherService {
  /**
   * Notifies a driver when a new order is assigned to them.
   */
  public static async notifyDriverOrderAssigned(
    orderId: string,
    driverProfileId: string
  ): Promise<boolean> {
    if (!process.env.DATABASE_URL) return false;

    try {
      const [order, driver] = await Promise.all([
        prisma.order.findUnique({
          where: { id: orderId },
          include: {
            warehouse: true,
            client: true,
          },
        }),
        prisma.driverProfile.findUnique({
          where: { id: driverProfileId },
          include: {
            user: {
              include: {
                telegramAccount: true,
              },
            },
          },
        }),
      ]);

      if (!order || !driver) return false;

      // Queue in-app notification
      await NotificationsService.queue({
        userId: driver.userId,
        type: NotificationType.DRIVER_ASSIGNED,
        channel: NotificationChannel.TELEGRAM,
        title: `Назначен рейс: ${order.orderNumber}`,
        body: `Склад: ${order.warehouse.name}. Груз: ${order.totalBoxesCount} кор., ${order.totalPalletsCount} палл.`,
        payload: { orderId, orderNumber: order.orderNumber },
      }).catch((e) => logger.warn({ err: e }, 'Could not record driver notification in DB'));

      const tgAccount = driver.user?.telegramAccount;
      if (!tgAccount || !tgAccount.telegramId) {
        logger.info(
          { driverProfileId },
          'Driver has no linked Telegram account. Skipping Telegram message dispatch.'
        );
        return false;
      }

      const client = getTelegramBotClient();
      const pickupDateStr = order.scheduledPickupAt
        ? new Date(order.scheduledPickupAt).toLocaleDateString('ru-RU')
        : 'не указана';

      const cargoStr =
        order.totalPalletsCount > 0
          ? `${order.totalPalletsCount} палл. (${order.totalBoxesCount} кор.)`
          : `${order.totalBoxesCount} кор.`;

      const text = [
        `🚛 <b>Вам назначен новый рейс!</b>`,
        ``,
        `📦 <b>Заявка:</b> <code>${order.orderNumber}</code>`,
        `🏢 <b>Склад:</b> ${order.warehouse.name} (${order.marketplace})`,
        `📅 <b>Дата:</b> ${pickupDateStr}`,
        `📦 <b>Груз:</b> ${cargoStr}`,
        `📍 <b>Адрес забора:</b> ${order.pickupCity ? `${order.pickupCity}, ` : ''}${order.pickupAddress}`,
        order.pickupContactName ? `👤 <b>Контакт:</b> ${order.pickupContactName} (${order.pickupContactPhone || ''})` : '',
        order.clientComment ? `💬 <b>Заметка селлера:</b> <i>${order.clientComment}</i>` : '',
      ]
        .filter(Boolean)
        .join('\n');

      const replyMarkup = {
        inline_keyboard: [
          [
            {
              text: '✅ Принять заявку',
              callback_data: `cb:accept:${order.id}`,
            },
          ],
        ],
      };

      return await client.sendMessageWithRetry({
        chatId: tgAccount.telegramId.toString(),
        text,
        parseMode: 'HTML',
        replyMarkup,
      });
    } catch (err) {
      logger.error({ err, orderId, driverProfileId }, 'Error in notifyDriverOrderAssigned');
      return false;
    }
  }

  /**
   * Notifies managers and client when an order changes status.
   */
  public static async notifyStatusChanged(
    orderId: string,
    fromStatus: OrderStatus,
    toStatus: OrderStatus,
    changedByUserId?: string
  ): Promise<void> {
    if (!process.env.DATABASE_URL) return;

    try {
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
          client: {
            include: {
              user: {
                include: {
                  telegramAccount: true,
                },
              },
            },
          },
          warehouse: true,
        },
      });

      if (!order) return;

      const newStatusLabel = STATUS_LABELS[toStatus] || toStatus;
      const title = `Заявка ${order.orderNumber}: статус обновлён`;
      const body = `Новый статус: ${newStatusLabel}`;

      // Notify Client (In-App)
      if (order.client?.userId) {
        await NotificationsService.queue({
          userId: order.client.userId,
          type: NotificationType.ORDER_STATUS_CHANGED,
          channel: NotificationChannel.IN_APP,
          title,
          body,
          payload: { orderId, fromStatus, toStatus, orderNumber: order.orderNumber },
        }).catch((e) => logger.warn({ err: e }, 'Could not record client in-app notification'));

        // If client has Telegram linked, send a notification
        const clientTg = order.client.user?.telegramAccount;
        if (clientTg?.telegramId) {
          const clientMsg = [
            `📦 <b>Статус доставки обновлён</b>`,
            ``,
            `Заявка: <code>${order.orderNumber}</code>`,
            `Склад: <b>${order.warehouse.name}</b>`,
            `Текущий статус: <b>${newStatusLabel}</b>`,
          ].join('\n');

          const clientBot = getTelegramBotClient();
          await clientBot.sendMessageWithRetry({
            chatId: clientTg.telegramId.toString(),
            text: clientMsg,
            parseMode: 'HTML',
          }).catch((e) => logger.warn({ err: e }, 'Client Telegram dispatch failed'));
        }
      }

      logger.info(
        { orderId, fromStatus, toStatus, changedByUserId },
        'Dispatched status change notifications'
      );
    } catch (err) {
      logger.error({ err, orderId, fromStatus, toStatus }, 'Error in notifyStatusChanged');
    }
  }
}
