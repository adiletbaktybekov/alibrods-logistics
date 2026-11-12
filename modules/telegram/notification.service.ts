import { prisma } from '@/database/prisma';
import { getManagerTelegramBotClient } from '@/integrations/telegram/client';
import { logger, safeLogError } from '@/lib/logger';
import { DatabaseRateLimiter } from '@/lib/security/rate-limit';
import { OrderStatus, UserRole } from '@prisma/client';
import { getDayOfWeekFromDate, RUSSIAN_DAY_NAMES } from '@/modules/warehouses/warehouses.types';

export interface ManagerApprovalNotificationPayload {
  orderId: string;
  orderNumber: string;
  marketplace: string;
  warehouseName: string;
  scheduledPickupAt?: Date | string | null;
  totalBoxesCount: number;
  totalPalletsCount: number;
  clientCompanyName?: string | null;
  clientContactPerson?: string | null;
  clientPhone?: string | null;
  clientComment?: string | null;
  currentStatus?: string;
  scheduleNote?: string | null;
}

export type TelegramGroupEventType =
  | 'ORDER_CREATED'
  | 'ORDER_CONFIRMED'
  | 'ORDER_REJECTED'
  | 'DRIVER_ASSIGNED'
  | 'DRIVER_ACCEPTED'
  | 'CARGO_PICKED_UP'
  | 'IN_TRANSIT'
  | 'DELIVERED_TO_WAREHOUSE'
  | 'ACCEPTED_BY_MARKETPLACE'
  | 'ORDER_COMPLETED'
  | 'COST_CALCULATED'
  | 'PHOTO_UPLOADED'
  | 'ORDER_PROBLEM';

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
  comment?: string;
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
        eventTitle = `📦 Новая заявка: <code>#${payload.orderNumber}</code>`;
        statusText = 'Ожидает подтверждения менеджером.';
        break;

      case 'ORDER_CONFIRMED':
        eventTitle = `✅ Заявка подтверждена: <code>#${payload.orderNumber}</code>`;
        statusText = 'Подтверждена менеджером. Поиск и назначение водителя.';
        if (payload.managerComment) {
          extraLine = `Комментарий: <i>${payload.managerComment}</i>`;
        }
        break;

      case 'ORDER_REJECTED':
        eventTitle = `❌ Заявка отклонена: <code>#${payload.orderNumber}</code>`;
        statusText = 'Отклонена менеджером.';
        if (payload.rejectionReason) {
          extraLine = `Причина: <i>${payload.rejectionReason}</i>`;
        }
        break;

      case 'DRIVER_ASSIGNED':
        eventTitle = `🚛 Назначен водитель: <code>#${payload.orderNumber}</code>`;
        statusText = payload.driverName
          ? `Водитель: <b>${payload.driverName}</b>. Ожидание подтверждения рейса.`
          : 'Водитель назначен. Ожидание подтверждения рейса.';
        break;

      case 'DRIVER_ACCEPTED':
        eventTitle = `👌 Водитель принял рейс: <code>#${payload.orderNumber}</code>`;
        statusText = payload.driverName
          ? `Водитель <b>${payload.driverName}</b> принял заявку. Выезд на забор груза.`
          : 'Водитель принял заявку. Выезд на забор груза.';
        break;

      case 'CARGO_PICKED_UP':
        eventTitle = `📦 Груз забран: <code>#${payload.orderNumber}</code>`;
        statusText = 'Груз забран у селлера. Подготовка к отправке / в пути.';
        break;

      case 'IN_TRANSIT':
        eventTitle = `🚚 Груз в пути: <code>#${payload.orderNumber}</code>`;
        statusText = `Груз направляется на склад назначения (${payload.warehouseName}).`;
        if (payload.driverName) {
          extraLine = `Водитель: <b>${payload.driverName}</b>`;
        }
        break;

      case 'DELIVERED_TO_WAREHOUSE':
        eventTitle = `🏢 Груз прибыл на склад: <code>#${payload.orderNumber}</code>`;
        statusText = `Прибыл на склад маркетплейса (${payload.warehouseName}). Ожидание разгрузки.`;
        break;

      case 'ACCEPTED_BY_MARKETPLACE':
        eventTitle = `📋 Партия успешно принята маркетплейсом: <code>#${payload.orderNumber}</code>`;
        statusText = 'Партия успешно принята маркетплейсом на воротах склада.';
        break;

      case 'ORDER_COMPLETED':
        eventTitle = `🎉 Заявка полностью завершена: <code>#${payload.orderNumber}</code>`;
        statusText = 'Заявка закрыта. Услуга логистики успешно оказана в полном объёме.';
        break;

      case 'PHOTO_UPLOADED':
        eventTitle = `📸 Загружен фотоотчёт: <code>#${payload.orderNumber}</code>`;
        statusText = payload.comment || 'Водитель прикрепил подтверждающую фотографию к заявке.';
        if (payload.driverName) {
          extraLine = `Водитель: <b>${payload.driverName}</b>`;
        }
        break;

      case 'ORDER_PROBLEM':
        eventTitle = `⚠️ Внимание: проблема по заявке: <code>#${payload.orderNumber}</code>`;
        statusText = payload.comment || 'Зафиксировано обращение или проблема при доставке.';
        break;

      case 'COST_CALCULATED': {
        // Strict privacy rule: Never output delivery cost or amount to group chats
        eventTitle = `ℹ️ Заявка обработана: <code>#${payload.orderNumber}</code>`;
        statusText = 'Тарифы и расчёт заявки зафиксированы во внутренней системе.';
        break;
      }
    }

    const lines: string[] = [
      `<b>AliBros Logistics</b>`,
      `<b>${eventTitle}</b>`,
      `Маркетплейс: <b>${payload.marketplace}</b>`,
      `Склад назначения: <b>${payload.warehouseName}</b>`,
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
   * Dispatches direct messages with inline approval buttons to all active linked managers.
   * This is Stage 1 of the two-stage approval workflow.
   */
  public static async notifyManagersOrderPendingApproval(
    payload: ManagerApprovalNotificationPayload
  ): Promise<{ sent: boolean; count?: number; duplicate?: boolean; skippedReason?: string }> {
    if (!process.env.DATABASE_URL) {
      return { sent: false, skippedReason: 'DATABASE_NOT_CONFIGURED' };
    }

    const dedupKey = `tg:manager:approval:${payload.orderId}`;
    if (isDuplicate(dedupKey)) {
      logger.info(
        { event: 'MANAGER_APPROVAL_NOTIFICATION_SKIPPED', reason: 'DUPLICATE', orderId: payload.orderId },
        'Skipping duplicate manager approval notification'
      );
      return { sent: false, duplicate: true };
    }

    try {
      const linkedManagers = await prisma.telegramAccount.findMany({
        where: {
          user: {
            role: { in: [UserRole.MANAGER, UserRole.ADMIN, UserRole.SUPER_ADMIN] },
            isActive: true,
          },
        },
        include: {
          user: {
            include: {
              managerProfile: true,
            },
          },
        },
      });

      if (linkedManagers.length === 0) {
        logger.warn(
          {
            event: 'NO_MANAGERS_LINKED_TO_TELEGRAM',
            orderId: payload.orderId,
            orderNumber: payload.orderNumber,
          },
          'No active managers or administrators have linked Telegram accounts. Approval notification skipped.'
        );
        return { sent: false, count: 0, skippedReason: 'NO_MANAGERS_LINKED' };
      }

      const dateStr = this.formatDeliveryDate(payload.scheduledPickupAt);
      let dayOfWeekName = '';
      if (payload.scheduledPickupAt) {
        try {
          const dayNum = getDayOfWeekFromDate(payload.scheduledPickupAt);
          dayOfWeekName = RUSSIAN_DAY_NAMES[dayNum] || '';
        } catch {}
      }
      const dateDisplay = dayOfWeekName ? `${dateStr} (${dayOfWeekName})` : dateStr;
      const clientName = payload.clientCompanyName || payload.clientContactPerson || 'Клиент';
      const clientInfo = payload.clientPhone ? `${clientName} (тел: ${payload.clientPhone})` : clientName;

      const messageLines = [
        `📦 <b>Новая заявка на согласование</b>`,
        ``,
        `Номер заявки: <code>#${payload.orderNumber}</code>`,
        `Клиент: <b>${clientInfo}</b>`,
        `Маркетплейс: <b>${payload.marketplace}</b>`,
        `Склад назначения: <b>${payload.warehouseName}</b>`,
        `Дата доставки: <b>${dateDisplay}</b>`,
        `Количество коробок: <b>${payload.totalBoxesCount} шт.</b>`,
        `Количество паллет: <b>${payload.totalPalletsCount} шт.</b>`,
        `Текущий статус: <b>${payload.currentStatus || 'CREATED (Ожидает подтверждения)'}</b>`,
      ];

      if (payload.clientComment) {
        messageLines.push(`Комментарий: <i>${payload.clientComment}</i>`);
      }

      if (payload.scheduleNote) {
        messageLines.push(``, `⚠️ <i>${payload.scheduleNote}</i>`);
      }

      messageLines.push(``, `<i>Пожалуйста, подтвердите или отклоните заявку:</i>`);

      const replyMarkup = {
        inline_keyboard: [
          [
            {
              text: '✅ Подтвердить заявку',
              callback_data: `mg:accept:${payload.orderId}`,
            },
            {
              text: '❌ Отклонить заявку',
              callback_data: `mg:reject:${payload.orderId}`,
            },
          ],
        ],
      };

      const managerBot = getManagerTelegramBotClient();
      let sentCount = 0;

      for (const mgr of linkedManagers) {
        const success = await managerBot.sendMessage({
          chatId: mgr.telegramId.toString(),
          text: messageLines.join('\n'),
          parseMode: 'HTML',
          replyMarkup,
        });
        if (success) sentCount++;
      }

      logger.info(
        {
          event: 'MANAGERS_APPROVAL_NOTIFICATION_DISPATCHED',
          orderId: payload.orderId,
          orderNumber: payload.orderNumber,
          totalManagers: linkedManagers.length,
          sentCount,
        },
        'Dispatched approval request to linked managers'
      );

      return { sent: sentCount > 0, count: sentCount };
    } catch (err) {
      safeLogError(err, 'Failed to dispatch manager approval notification');
      deduplicationCache.delete(dedupKey);
      return { sent: false, skippedReason: 'ERROR' };
    }
  }

  /**
   * Dispatches an event notification to the shared manager Telegram group.
   * Ensures deduplication, feature-flag compliance, strict cost exclusion, and safe error handling.
   */
  public static async notifyGroupEvent(
    eventType: TelegramGroupEventType,
    payload: TelegramOrderNotificationPayload
  ): Promise<TelegramNotificationResult> {
    // 1. Strict financial privacy rule: NEVER dispatch cost or accounting figures to group chats
    if (eventType === 'COST_CALCULATED') {
      logger.warn(
        { event: 'TELEGRAM_GROUP_NOTIFICATION_SKIPPED', reason: 'COST_NOTIFICATIONS_PROHIBITED_IN_GROUP', eventType, orderId: payload.orderId },
        'Blocked attempt to dispatch COST_CALCULATED to manager group (financial privacy rule)'
      );
      return { sent: false, skippedReason: 'COST_NOTIFICATIONS_PROHIBITED_IN_GROUP' };
    }

    // 2. Check feature toggle
    if (process.env.TELEGRAM_ENABLE_GROUP_NOTIFICATIONS === 'false') {
      logger.info(
        { event: 'TELEGRAM_GROUP_NOTIFICATION_SKIPPED', reason: 'GROUP_NOTIFICATIONS_DISABLED', eventType, orderId: payload.orderId },
        'Group notifications disabled via config'
      );
      return { sent: false, skippedReason: 'GROUP_NOTIFICATIONS_DISABLED' };
    }

    // 3. Check group chat ID configuration
    const groupChatId =
      process.env.TELEGRAM_MANAGER_GROUP_CHAT_ID ||
      process.env.TELEGRAM_GROUP_CHAT_ID;

    if (!groupChatId) {
      logger.warn(
        { event: 'TELEGRAM_GROUP_NOTIFICATION_SKIPPED', reason: 'CHAT_ID_NOT_CONFIGURED', eventType, orderId: payload.orderId },
        'TELEGRAM_MANAGER_GROUP_CHAT_ID not configured. Skipping group notification.'
      );
      return { sent: false, skippedReason: 'CHAT_ID_NOT_CONFIGURED' };
    }

    // 4. Deduplication check (Layer 1: Local in-memory sliding cache)
    const dedupSubKey =
      eventType === 'ORDER_REJECTED'
        ? (payload.rejectionReason || '').slice(0, 20)
        : '';
    const dedupKey = `tg:group:event:${eventType}:${payload.orderId}${dedupSubKey ? `:${dedupSubKey}` : ''}`;

    if (isDuplicate(dedupKey)) {
      logger.info(
        { event: 'TELEGRAM_GROUP_NOTIFICATION_SKIPPED', reason: 'DUPLICATE_LOCAL_CACHE', eventType, orderId: payload.orderId, dedupKey },
        'Skipping duplicate Telegram group notification (local memory cache)'
      );
      return { sent: false, duplicate: true };
    }

    // Layer 2: Cross-instance distributed deduplication backed by PostgreSQL
    let consumedDbRateLimit = false;
    if (process.env.DATABASE_URL) {
      try {
        const rateLimitRes = await DatabaseRateLimiter.consume(dedupKey, 1, DEDUPLICATION_TTL_MS);
        if (!rateLimitRes.allowed) {
          logger.info(
            { event: 'TELEGRAM_GROUP_NOTIFICATION_SKIPPED', reason: 'DUPLICATE_DISTRIBUTED_LOCK', eventType, orderId: payload.orderId, dedupKey },
            'Skipping duplicate Telegram group notification (distributed DB lock)'
          );
          return { sent: false, duplicate: true };
        }
        consumedDbRateLimit = true;
      } catch {
        // Fail-open for external service: continue with local in-memory deduplication if DB uninitialized or in test mode
      }
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
          { eventType, orderId: payload.orderId, error: 'Telegram sendMessage returned false' },
          'Failed to dispatch message to manager group (bot API returned false)'
        );
        // Release locks on delivery failure to allow retries
        deduplicationCache.delete(dedupKey);
        if (consumedDbRateLimit) {
          await DatabaseRateLimiter.release(dedupKey).catch(() => {});
        }
      }

      return { sent: success };
    } catch (err: unknown) {
      safeLogError(err, 'Unexpected error sending Telegram group notification');
      deduplicationCache.delete(dedupKey);
      if (consumedDbRateLimit) {
        await DatabaseRateLimiter.release(dedupKey).catch(() => {});
      }
      return { sent: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  }
}
