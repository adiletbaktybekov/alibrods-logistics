import { prisma } from '@/database/prisma';
import { logger, safeLogError } from '@/lib/logger';
import { getDriverTelegramBotClient, getClientTelegramBotClient } from '@/integrations/telegram/client';
import { OrderStatus, NotificationType, NotificationChannel, AssignmentStatus } from '@prisma/client';
import { STATUS_LABELS } from '@/components/ui/status-badge';
import { NotificationsService } from './notifications.service';
import { TelegramNotificationService, TelegramGroupEventType } from '@/modules/telegram/notification.service';
import { GoogleSheetsSyncService } from '@/modules/integrations/google-sheets-sync.service';
import { isWarehouseOpenOnDate, CONFIRMED_WAREHOUSES } from '@/modules/warehouses/warehouses.service';

export interface DriverNotificationDispatchResult {
  sent: boolean;
  reason?: string;
  warning?: string;
}

export class NotificationDispatcherService {
  /**
   * Notifies the manager group when a new order is registered.
   */
  public static async notifyOrderCreated(orderId: string): Promise<boolean> {
    if (!process.env.DATABASE_URL) return false;

    try {
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
          warehouse: true,
          client: {
            include: {
              user: {
                include: {
                  telegramAccount: true,
                },
              },
            },
          },
        },
      });

      if (!order) {
        logger.warn({ event: 'ORDER_CREATED_DISPATCH_FINISHED', orderId, error: 'Order not found in database' });
        return false;
      }

      logger.info({
        event: 'ORDER_CREATED_DISPATCH_STARTED',
        orderId: order.id,
        orderNumber: order.orderNumber,
        marketplace: order.marketplace,
        warehouseName: order.warehouse.name,
      });

      // 1. Notify Client via Client Bot (@AliBrosClientBot) if linked
      const clientTg = order.client?.user?.telegramAccount;
      if (clientTg?.telegramId) {
        const clientBot = getClientTelegramBotClient();
        const pickupDateStr = order.scheduledPickupAt
          ? new Date(order.scheduledPickupAt).toLocaleDateString('ru-RU')
          : 'не указана';
        const cargoStr =
          order.totalPalletsCount > 0
            ? `${order.totalPalletsCount} палл. (${order.totalBoxesCount} кор.)`
            : `${order.totalBoxesCount} кор.`;

        const clientMsg = [
          `📦 <b>Ваша заявка принята и отправлена на согласование!</b>`,
          ``,
          `Номер заявки: <code>#${order.orderNumber}</code>`,
          `Маркетплейс: <b>${order.marketplace}</b>`,
          `Склад назначения: <b>${order.warehouse.name}</b>`,
          `Планируемая дата: <b>${pickupDateStr}</b>`,
          `Объём поставки: <b>${cargoStr}</b>`,
          ``,
          `<i>Заявка передана менеджерам AliBros Logistics. Мы сразу уведомим вас о результатах согласования и назначении водителя.</i>`,
        ].join('\n');

        await clientBot.sendMessageWithRetry({
          chatId: clientTg.telegramId.toString(),
          text: clientMsg,
          parseMode: 'HTML',
        }).catch((e) => logger.warn({ err: e }, 'Failed to dispatch order created client notification'));
      }

      const confirmedWh = CONFIRMED_WAREHOUSES.find(
        (c) => c.id === order.warehouseId || c.code === order.warehouse.code
      );
      const isStandardDay =
        confirmedWh && order.scheduledPickupAt
          ? isWarehouseOpenOnDate(confirmedWh, order.scheduledPickupAt)
          : true;
      const scheduleNote =
        !isStandardDay && confirmedWh
          ? `Дата вне стандартного графика склада (${confirmedWh.scheduleDescription}). Требуется подтверждение логиста.`
          : null;

      const res = await TelegramNotificationService.notifyManagersOrderPendingApproval({
        orderId: order.id,
        orderNumber: order.orderNumber,
        marketplace: order.marketplace,
        warehouseName: order.warehouse.name,
        scheduledPickupAt: order.scheduledPickupAt,
        totalBoxesCount: order.totalBoxesCount,
        totalPalletsCount: order.totalPalletsCount,
        clientCompanyName: order.client?.companyName,
        clientContactPerson: order.client?.contactPerson,
        clientPhone: order.client?.contactPhone,
        clientComment: order.clientComment,
        currentStatus: 'CREATED (Ожидает подтверждения)',
        scheduleNote,
      });

      logger.info({
        event: 'ORDER_CREATED_DISPATCH_FINISHED',
        orderId: order.id,
        orderNumber: order.orderNumber,
        sent: res.sent,
        duplicate: res.duplicate,
        skippedReason: res.skippedReason,
      });

      return res.sent;
    } catch (err: unknown) {
      logger.error({
        event: 'ORDER_CREATED_DISPATCH_FINISHED',
        orderId,
        error: err instanceof Error ? err.message : 'Unknown error during order notification dispatch',
      });
      safeLogError(err, 'Error in notifyOrderCreated');
      return false;
    }
  }

  /**
   * Notifies the manager group and client when an order is confirmed by manager.
   */
  public static async notifyOrderConfirmed(orderId: string, comment?: string): Promise<boolean> {
    if (!process.env.DATABASE_URL) return false;

    try {
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: { warehouse: true },
      });

      if (!order) return false;

      await TelegramNotificationService.notifyGroupEvent('ORDER_CONFIRMED', {
        orderId: order.id,
        orderNumber: order.orderNumber,
        marketplace: order.marketplace,
        warehouseName: order.warehouse.name,
        scheduledPickupAt: order.scheduledPickupAt,
        totalBoxesCount: order.totalBoxesCount,
        totalPalletsCount: order.totalPalletsCount,
        managerComment: comment,
      });

      return true;
    } catch (err: unknown) {
      safeLogError(err, 'Error in notifyOrderConfirmed');
      return false;
    }
  }

  /**
   * Notifies the manager group and client when an order is rejected by manager.
   */
  public static async notifyOrderRejected(orderId: string, reason: string): Promise<boolean> {
    if (!process.env.DATABASE_URL) return false;

    try {
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: { warehouse: true },
      });

      if (!order) return false;

      await TelegramNotificationService.notifyGroupEvent('ORDER_REJECTED', {
        orderId: order.id,
        orderNumber: order.orderNumber,
        marketplace: order.marketplace,
        warehouseName: order.warehouse.name,
        scheduledPickupAt: order.scheduledPickupAt,
        totalBoxesCount: order.totalBoxesCount,
        totalPalletsCount: order.totalPalletsCount,
        rejectionReason: reason,
      });

      return true;
    } catch (err: unknown) {
      safeLogError(err, 'Error in notifyOrderRejected');
      return false;
    }
  }

  /**
   * Dispatches notifications when a driver is assigned or reassigned to an order.
   * Returns dispatch status and user-facing warning if personal driver message could not be delivered.
   */
  public static async notifyDriverOrderAssigned(
    orderId: string,
    driverProfileId: string
  ): Promise<DriverNotificationDispatchResult> {
    if (!process.env.DATABASE_URL) return { sent: false, reason: 'DATABASE_NOT_CONFIGURED' };

    try {
      const [order, driver] = await Promise.all([
        prisma.order.findUnique({
          where: { id: orderId },
          include: {
            warehouse: true,
            client: {
              include: {
                user: {
                  include: {
                    telegramAccount: true,
                  },
                },
              },
            },
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

      if (!order || !driver) return { sent: false, reason: 'ORDER_OR_DRIVER_NOT_FOUND' };

      // 1. Queue in-app notification for driver
      await NotificationsService.queue({
        userId: driver.userId,
        type: NotificationType.DRIVER_ASSIGNED,
        channel: NotificationChannel.TELEGRAM,
        title: `Назначен рейс: ${order.orderNumber}`,
        body: `Склад: ${order.warehouse.name}. Груз: ${order.totalBoxesCount} кор., ${order.totalPalletsCount} палл.`,
        payload: { orderId, orderNumber: order.orderNumber },
      }).catch((e) => logger.warn({ err: e }, 'Could not record driver notification in DB'));

      // 2. Notify manager group about driver assignment
      await TelegramNotificationService.notifyGroupEvent('DRIVER_ASSIGNED', {
        orderId: order.id,
        orderNumber: order.orderNumber,
        marketplace: order.marketplace,
        warehouseName: order.warehouse.name,
        scheduledPickupAt: order.scheduledPickupAt,
        totalBoxesCount: order.totalBoxesCount,
        totalPalletsCount: order.totalPalletsCount,
        driverName: driver.fullName,
      }).catch((e) => safeLogError(e, 'Failed to dispatch DRIVER_ASSIGNED group notification'));

      // 3. Notify Client via Client Bot
      const clientTg = order.client?.user?.telegramAccount;
      if (clientTg?.telegramId) {
        const clientBot = getClientTelegramBotClient();
        const driverDetails = [
          `Водитель: <b>${driver.fullName}</b>`,
          driver.user?.phone ? `Телефон: <code>${driver.user.phone}</code>` : '',
          driver.vehicleModel || driver.vehiclePlateNumber
            ? `Автомобиль: <b>${driver.vehicleModel || ''} ${driver.vehiclePlateNumber ? `(${driver.vehiclePlateNumber})` : ''}</b>`.trim()
            : '',
        ]
          .filter(Boolean)
          .join('\n');

        const clientText = [
          `🚛 <b>На вашу заявку назначен водитель!</b>`,
          ``,
          `Заявка: <code>#${order.orderNumber}</code>`,
          `Склад: <b>${order.warehouse.name}</b> (${order.marketplace})`,
          ``,
          driverDetails,
          ``,
          `<i>Водитель прибудет по адресу забора груза в согласованное время.</i>`,
        ].join('\n');

        await clientBot.sendMessageWithRetry({
          chatId: clientTg.telegramId.toString(),
          text: clientText,
          parseMode: 'HTML',
        }).catch((e) => logger.warn({ err: e }, 'Failed to dispatch driver assignment to client bot'));
      }

      // 4. Send personal Telegram message to driver via Driver Bot
      const tgAccount = driver.user?.telegramAccount;
      if (!tgAccount || !tgAccount.telegramId) {
        logger.warn(
          {
            event: 'DRIVER_NOTIFICATION_SKIPPED',
            orderId: order.id,
            orderNumber: order.orderNumber,
            driverProfileId,
            reason: 'NO_LINKED_TELEGRAM',
          },
          'Driver has no linked Telegram account. Skipping Driver Bot card dispatch.'
        );
        return {
          sent: false,
          reason: 'NO_LINKED_TELEGRAM',
          warning: `У водителя ${driver.fullName} не привязан Telegram. Карточка заявки в Driver Bot не доставлена.`,
        };
      }

      const client = getDriverTelegramBotClient();
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

      const sent = await client.sendMessageWithRetry({
        chatId: tgAccount.telegramId.toString(),
        text,
        parseMode: 'HTML',
        replyMarkup,
      });

      if (!sent) {
        const lastErr = client.lastError;
        let warning = `Не удалось доставить карточку заявки водителю ${driver.fullName} в Driver Bot.`;
        let reason = 'TELEGRAM_SEND_FAILED';

        if (lastErr?.errorCode === 403 || lastErr?.description?.toLowerCase().includes('blocked')) {
          reason = 'BOT_BLOCKED_BY_DRIVER';
          warning = `Водитель ${driver.fullName} заблокировал Driver Bot. Карточка заявки не доставлена.`;
        } else if (
          lastErr?.errorCode === 400 ||
          lastErr?.description?.toLowerCase().includes('chat not found')
        ) {
          reason = 'CHAT_NOT_FOUND_NOT_STARTED';
          warning = `Водитель ${driver.fullName} ещё не запустил Driver Bot (/start). Карточка заявки не доставлена.`;
        }

        logger.warn(
          {
            event: 'DRIVER_NOTIFICATION_FAILED',
            orderId: order.id,
            orderNumber: order.orderNumber,
            driverProfileId,
            driverTelegramId: tgAccount.telegramId.toString(),
            reason,
            httpStatus: lastErr?.httpStatus,
            errorCode: lastErr?.errorCode,
            description: lastErr?.description,
          },
          'Driver Bot failed to deliver order card to driver'
        );

        return {
          sent: false,
          reason,
          warning,
        };
      }

      logger.info(
        {
          event: 'DRIVER_NOTIFICATION_SENT',
          orderId: order.id,
          orderNumber: order.orderNumber,
          driverProfileId,
          driverTelegramId: tgAccount.telegramId.toString(),
        },
        'Driver Bot successfully delivered order card to driver'
      );

      return { sent: true };
    } catch (err: unknown) {
      safeLogError(err, 'Error in notifyDriverOrderAssigned');
      return {
        sent: false,
        reason: 'UNEXPECTED_ERROR',
        warning: 'Внутренняя ошибка при отправке уведомления водителю',
      };
    }
  }

  /**
   * Notifies the manager group and client when delivery cost is calculated.
   */
  public static async notifyCostCalculated(
    orderId: string,
    costAmount: number,
    currency = 'RUB'
  ): Promise<boolean> {
    if (!process.env.DATABASE_URL) return false;

    try {
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
          warehouse: true,
          client: {
            include: {
              user: {
                include: {
                  telegramAccount: true,
                },
              },
            },
          },
        },
      });

      if (!order) return false;

      // Note: In accordance with AliBros Logistics financial privacy policy,
      // delivery costs and financial figures are NEVER dispatched to group Telegram chats.
      // Costs remain strictly internal and are sent exclusively to the authorized client via private DM.

      // 2. Notify client via Client Bot if telegram account linked
      const clientTg = order.client?.user?.telegramAccount;
      if (clientTg?.telegramId) {
        const clientBot = getClientTelegramBotClient();
        const formattedCost = costAmount.toLocaleString('ru-RU');
        const clientMsg = [
          `💰 <b>Рассчитана стоимость доставки</b>`,
          ``,
          `Заявка: <code>${order.orderNumber}</code>`,
          `Склад: <b>${order.warehouse.name}</b>`,
          `Итоговая стоимость: <b>${formattedCost} ${currency}</b>`,
        ].join('\n');

        await clientBot.sendMessageWithRetry({
          chatId: clientTg.telegramId.toString(),
          text: clientMsg,
          parseMode: 'HTML',
        }).catch((e) => logger.warn({ err: e }, 'Client Telegram cost notification failed'));
      }

      return true;
    } catch (err: unknown) {
      safeLogError(err, 'Error in notifyCostCalculated');
      return false;
    }
  }

  /**
   * Notifies managers, client, and team group when an order changes status.
   */
  public static async notifyStatusChanged(
    orderId: string,
    fromStatus: OrderStatus,
    toStatus: OrderStatus,
    changedByUserId?: string,
    comment?: string
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
          assignments: {
            where: {
              status: {
                in: [AssignmentStatus.ASSIGNED, AssignmentStatus.ACCEPTED, AssignmentStatus.IN_PROGRESS],
              },
            },
            include: { driver: true },
            take: 1,
          },
        },
      });

      if (!order) return;

      const newStatusLabel = STATUS_LABELS[toStatus] || toStatus;
      const title = `Заявка ${order.orderNumber}: статус обновлён`;
      const body = `Новый статус: ${newStatusLabel}`;

      // 1. Notify Client (In-App)
      if (order.client?.userId) {
        await NotificationsService.queue({
          userId: order.client.userId,
          type: NotificationType.ORDER_STATUS_CHANGED,
          channel: NotificationChannel.IN_APP,
          title,
          body,
          payload: { orderId, fromStatus, toStatus, orderNumber: order.orderNumber },
        }).catch((e) => logger.warn({ err: e }, 'Could not record client in-app notification'));

        // 2. Notify Client via Client Bot
        const clientTg = order.client.user?.telegramAccount;
        if (clientTg?.telegramId) {
          const statusDescriptions: Partial<Record<OrderStatus, string>> = {
            [OrderStatus.ACCEPTED_BY_DRIVER]: 'Водитель принял рейс в работу и выехал на забор груза.',
            [OrderStatus.PICKED_UP]: 'Груз забран у селлера. Подготовка к транспортировке на склад.',
            [OrderStatus.IN_TRANSIT]: `Машина с грузом в пути на склад маркетплейса (${order.warehouse.name}).`,
            [OrderStatus.DELIVERED_TO_WAREHOUSE]: `Груз доставлен на склад маркетплейса (${order.warehouse.name}). Ожидание разгрузки.`,
            [OrderStatus.ACCEPTED_BY_MARKETPLACE]: 'Партия успешно сдана и принята маркетплейсом на воротах склада!',
            [OrderStatus.COMPLETED]: 'Услуга доставки оказана в полном объёме. Заявка закрыта.',
            [OrderStatus.REJECTED_BY_MANAGER]: comment ? `Заявка отклонена: ${comment}` : 'Заявка отклонена менеджером.',
          };

          const extraStatusNote = statusDescriptions[toStatus] || comment || '';

          const clientMsg = [
            `📦 <b>Статус доставки обновлён</b>`,
            ``,
            `Заявка: <code>#${order.orderNumber}</code>`,
            `Склад назначения: <b>${order.warehouse.name}</b> (${order.marketplace})`,
            `Новый статус: <b>${newStatusLabel}</b>`,
            extraStatusNote ? `\n<i>${extraStatusNote}</i>` : '',
          ]
            .filter(Boolean)
            .join('\n');

          const clientBot = getClientTelegramBotClient();
          await clientBot.sendMessageWithRetry({
            chatId: clientTg.telegramId.toString(),
            text: clientMsg,
            parseMode: 'HTML',
          }).catch((e) => logger.warn({ err: e }, 'Client Telegram dispatch failed'));
        }
      }

      // 3. Map status to group lifecycle event
      // Requirement: Orders rejected prior to confirmation must NEVER reach the group chat.
      const statusToGroupEventMap: Partial<Record<OrderStatus, TelegramGroupEventType>> = {
        [OrderStatus.CONFIRMED]: 'ORDER_CONFIRMED',
        ...(fromStatus !== OrderStatus.CREATED ? { [OrderStatus.REJECTED_BY_MANAGER]: 'ORDER_REJECTED' as TelegramGroupEventType } : {}),
        [OrderStatus.ACCEPTED_BY_DRIVER]: 'DRIVER_ACCEPTED',
        [OrderStatus.PICKED_UP]: 'CARGO_PICKED_UP',
        [OrderStatus.IN_TRANSIT]: 'IN_TRANSIT',
        [OrderStatus.DELIVERED_TO_WAREHOUSE]: 'DELIVERED_TO_WAREHOUSE',
        [OrderStatus.ACCEPTED_BY_MARKETPLACE]: 'ACCEPTED_BY_MARKETPLACE',
        [OrderStatus.COMPLETED]: 'ORDER_COMPLETED',
      };

      const groupEventType = statusToGroupEventMap[toStatus];
      if (groupEventType) {
        const activeDriverName = order.assignments[0]?.driver?.fullName;
        await TelegramNotificationService.notifyGroupEvent(groupEventType, {
          orderId: order.id,
          orderNumber: order.orderNumber,
          marketplace: order.marketplace,
          warehouseName: order.warehouse.name,
          scheduledPickupAt: order.scheduledPickupAt,
          totalBoxesCount: order.totalBoxesCount,
          totalPalletsCount: order.totalPalletsCount,
          driverName: activeDriverName,
          managerComment: comment,
          rejectionReason: toStatus === OrderStatus.REJECTED_BY_MANAGER ? comment : undefined,
        }).catch((e) => safeLogError(e, 'Failed to dispatch status change group notification'));
      }

        logger.info(
        { orderId, fromStatus, toStatus, changedByUserId },
        'Dispatched status change notifications'
      );

      // 4. Synchronize status change to Google Sheets (Safe non-blocking)
      GoogleSheetsSyncService.syncOrder(orderId).catch((sheetsErr) => {
        logger.error({ err: sheetsErr, orderId, toStatus }, 'Failed to sync status change to Google Sheets');
      });
    } catch (err: unknown) {
      safeLogError(err, 'Error in notifyStatusChanged');
    }
  }
}
