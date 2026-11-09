import { getManagerTelegramBotClient } from '@/integrations/telegram/client';
import { logger, safeLogError } from '@/lib/logger';
import { OrderStatus } from '@prisma/client';

export type TelegramGroupEventType =
  | 'ORDER_CREATED'
  | 'ORDER_CONFIRMED'
  | 'ORDER_REJECTED'
  | 'DRIVER_ASSIGNED'
  | 'DRIVER_ACCEPTED'
  | 'CARGO_PICKED_UP'
  | 'DELIVERED_TO_WAREHOUSE'
  | 'ACCEPTED_BY_MARKETPLACE'
  | 'ORDER_COMPLETED'
  | 'COST_CALCULATED';

export interface TelegramOrderNotificationPayload {
  orderId: string;
  orderNumber: string;
  marketplace: string;
  warehouseName: string;
  scheduledPickupAt?: Date | string | null;
  totalBoxesCount: number;
  totalPalletsCount: number;
  status?: OrderStatus | string;
  driverName?: string;
  rejectionReason?: string;
  managerComment?: string;
  costAmount?: number;
  currency?: string;
}

export interface TelegramNotificationResult {
  sent: boolean;
  duplicate?: boolean;
  skippedReason?: string;
  error?: string;
}

// In-memory sliding window deduplication cache (10 min TTL)
const DEDUPLICATION_TTL_MS = 10 * 60 * 1000;
const deduplicationCache = new Map<string, number>();

function isDuplicate(key: string): boolean {
  const now = Date.now();

  // Periodic cleanup if map grows
  if (deduplicationCache.size > 500) {
    for (const [k, timestamp] of deduplicationCache.entries()) {
      if (now - timestamp > DEDUPLICATION_TTL_MS) {
        deduplicationCache.delete(k);
      }
    }
  }

  const existingTimestamp = deduplicationCache.get(key);
  if (existingTimestamp && now - existingTimestamp < DEDUPLICATION_TTL_MS) {
    return true;
  }

  deduplicationCache.set(key, now);
  return false;
}

export class TelegramNotificationService {
  /**
   * Clears deduplication cache (used for unit tests)
   */
  public static _clearDeduplicationCacheForTesting(): void {
    deduplicationCache.clear();
  }

  /**
   * Formats cargo description (boxes and pallets)
   */
  public static formatCargo(boxesCount: number, palletsCount: number): string {
    const boxes = `${boxesCount || 0} кор.`;
    if (palletsCount && palletsCount > 0) {
      return `${boxes}, ${palletsCount} палл.`;
    }
    return boxes;
  }

  /**
   * Formats delivery date nicely
   */
  public static formatDeliveryDate(date?: Date | string | null): string {
    if (!date) return 'не указана';
    try {
      const d = typeof date === 'string' ? new Date(date) : date;
      return d.toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'long',
      });
    } catch {
      return 'не указана';
    }
  }

  /**
   * Builds the standard HTML message for group dispatch for all 10 lifecycle events.
   */
  public static buildGroupMessage(
    eventType: TelegramGroupEventType,
    payload: TelegramOrderNotificationPayload
  ): string {
    const cargo = this.formatCargo(payload.totalBoxesCount, payload.totalPalletsCount);
    const dateStr = this.formatDeliveryDate(payload.scheduledPickupAt);

    let eventTitle = '';
    let statusText = '';
    let extraLine = '';

    switch (eventType) {
      case 'ORDER_CREATED':
        eventTitle = `📦 Новая заявка #${payload.orderNumber}`;
        statusText = 'Ожидает подтверждения менеджером.';
        break;

      case 'ORDER_CONFIRMED':
        eventTitle = `✅ Заявка #${payload.orderNumber} подтверждена`;
        statusText = 'Подтверждена менеджером. Поиск и назначение водителя.';
        if (payload.managerComment) {
          extraLine = `Комментарий: <i>${payload.managerComment}</i>`;
        }
        break;

      case 'ORDER_REJECTED':
        eventTitle = `❌ Заявка #${payload.orderNumber} отклонена`;
        statusText = 'Отклонена менеджером.';
        if (payload.rejectionReason) {
          extraLine = `Причина: <i>${payload.rejectionReason}</i>`;
        }
        break;

      case 'DRIVER_ASSIGNED':
        eventTitle = `🚛 Назначен водитель: #${payload.orderNumber}`;
        statusText = payload.driverName
          ? `Водитель: <b>${payload.driverName}</b>. Ожидание подтверждения рейса.`
          : 'Водитель назначен. Ожидание подтверждения рейса.';
        break;

      case 'DRIVER_ACCEPTED':
        eventTitle = `👌 Водитель принял рейс: #${payload.orderNumber}`;
        statusText = payload.driverName
          ? `Водитель <b>${payload.driverName}</b> принял заявку. Выезд на забор груза.`
          : 'Водитель принял заявку. Выезд на забор груза.';
        break;

      case 'CARGO_PICKED_UP':
        eventTitle = `📦 Груз забран: #${payload.orderNumber}`;
        statusText = 'Груз забран у селлера. Подготовка к отправке / в пути.';
        break;

      case 'DELIVERED_TO_WAREHOUSE':
        eventTitle = `🏢 Груз прибыл на склад: #${payload.orderNumber}`;
        statusText = `Прибыл на склад маркетплейса (${payload.warehouseName}). Ожидание разгрузки.`;
        break;

      case 'ACCEPTED_BY_MARKETPLACE':
        eventTitle = `📋 Груз сдан маркетплейсу: #${payload.orderNumber}`;
        statusText = 'Партия успешно принята маркетплейсом на воротах.';
        break;

      case 'ORDER_COMPLETED':
        eventTitle = `🎉 Заявка #${payload.orderNumber} завершена`;
        statusText = 'Рейс полностью завершён. Все отчётные документы сформированы.';
        break;

      case 'COST_CALCULATED': {
        eventTitle = `💰 Рассчитана стоимость доставки: #${payload.orderNumber}`;
        const currency = payload.currency || 'RUB';
        const formattedCost = payload.costAmount ? payload.costAmount.toLocaleString('ru-RU') : '0';
        statusText = `Стоимость: <b>${formattedCost} ${currency}</b>`;
        break;
      }
    }

    const lines: string[] = [
      `<b>AliBros Logistics</b>`,
      `<b>${eventTitle}</b>`,
      `Маркетплейс: <b>${payload.marketplace}</b>`,
      `Склад: <b>${payload.warehouseName}</b>`,
      `Дата доставки: ${dateStr}`,
      `Груз: ${cargo}`,
      `Статус: ${statusText}`,
    ];

    if (extraLine) {
      lines.push(extraLine);
    }

    return lines.join('\n');
  }

  /**
   * Dispatches an event notification to the shared manager Telegram group.
   * Ensures deduplication, feature-flag compliance, and safe error handling.
   */
  public static async notifyGroupEvent(
    eventType: TelegramGroupEventType,
    payload: TelegramOrderNotificationPayload
  ): Promise<TelegramNotificationResult> {
    // 1. Check feature toggle
    if (process.env.TELEGRAM_ENABLE_GROUP_NOTIFICATIONS === 'false') {
      logger.debug({ eventType, orderId: payload.orderId }, 'Group notifications disabled via config');
      return { sent: false, skippedReason: 'GROUP_NOTIFICATIONS_DISABLED' };
    }

    // 2. Check group chat ID configuration
    const groupChatId =
      process.env.TELEGRAM_MANAGER_GROUP_CHAT_ID ||
      process.env.TELEGRAM_GROUP_CHAT_ID;

    if (!groupChatId) {
      logger.debug(
        { eventType, orderId: payload.orderId },
        'TELEGRAM_MANAGER_GROUP_CHAT_ID not configured. Skipping group notification.'
      );
      return { sent: false, skippedReason: 'CHAT_ID_NOT_CONFIGURED' };
    }

    // 3. Deduplication check
    const dedupSubKey =
      eventType === 'COST_CALCULATED'
        ? `${payload.costAmount}:${payload.currency}`
        : eventType === 'ORDER_REJECTED'
        ? (payload.rejectionReason || '').slice(0, 20)
        : '';
    const dedupKey = `${eventType}:${payload.orderId}:${dedupSubKey}`;

    if (isDuplicate(dedupKey)) {
      logger.info(
        { eventType, orderId: payload.orderId, dedupKey },
        'Skipping duplicate Telegram group notification'
      );
      return { sent: false, duplicate: true };
    }

    // 4. Render message
    const text = this.buildGroupMessage(eventType, payload);

    const groupTopicId =
      process.env.TELEGRAM_MANAGER_GROUP_TOPIC_ID ||
      process.env.TELEGRAM_GROUP_TOPIC_ID;

    // 5. Send via Manager Bot Client with retry
    try {
      const managerBot = getManagerTelegramBotClient();
      const success = await managerBot.sendMessageWithRetry({
        chatId: groupChatId,
        text,
        parseMode: 'HTML',
        ...(groupTopicId ? { messageThreadId: groupTopicId } : {}),
      });

      if (success) {
        logger.info(
          { eventType, orderId: payload.orderId, orderNumber: payload.orderNumber },
          'Successfully dispatched notification to manager group'
        );
      } else {
        logger.warn(
          { eventType, orderId: payload.orderId },
          'Failed to dispatch message to manager group (bot API returned false)'
        );
      }

      return { sent: success };
    } catch (err: unknown) {
      safeLogError(err, 'Unexpected error sending Telegram group notification');
      // Never throw - graceful error recovery
      return { sent: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  }
}
