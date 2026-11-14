import {
  getDriverTelegramBotClient,
  getClientTelegramBotClient,
  getManagerTelegramBotClient,
} from '@/integrations/telegram/client';
import {
  DriverPairingService,
  ClientPairingService,
  ManagerPairingService,
} from './pairing.service';
import { DriverOrderService } from '@/modules/orders/driver-order.service';
import { DriverPhotoService } from './photo.service';
import { STATUS_LABELS } from '@/components/ui/status-badge';
import { AuditAction, NotificationChannel, NotificationType, OrderStatus, PhotoType } from '@prisma/client';
import { prisma } from '@/database/prisma';
import { logger } from '@/lib/logger';
import { AuditService } from '@/modules/audit/audit.service';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { TelegramNotificationService } from './notification.service';
import { GoogleSheetsSyncService } from '@/modules/integrations/google-sheets-sync.service';
import { getCanonicalAppUrl } from '@/config/site';

export interface TelegramIncomingUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from: {
      id: number;
      is_bot?: boolean;
      first_name: string;
      last_name?: string;
      username?: string;
      language_code?: string;
    };
    chat: {
      id: number;
      type: string;
    };
    date: number;
    text?: string;
    photo?: Array<{
      file_id: string;
      file_unique_id: string;
      file_size?: number;
      width: number;
      height: number;
    }>;
    caption?: string;
  };
  callback_query?: {
    id: string;
    from: {
      id: number;
      first_name: string;
      last_name?: string;
      username?: string;
    };
    message?: {
      message_id: number;
      chat: { id: number };
      text?: string;
    };
    data?: string;
  };
}

export class TelegramBotService {
  /**
   * Main menu keyboard buttons for authorized driver
   */
  public static getMainKeyboard() {
    return {
      keyboard: [
        [{ text: '📦 Мои активные заявки' }, { text: '📜 История доставок' }],
        [{ text: '👤 Мой профиль' }, { text: 'ℹ️ Помощь' }],
      ],
      resize_keyboard: true,
      one_time_keyboard: false,
    };
  }

  /**
   * Handles incoming update from Telegram Webhook for Driver, Client, or Manager Bot
   */
  public static async handleUpdate(
    update: TelegramIncomingUpdate,
    botType: 'driver' | 'client' | 'manager' = 'driver'
  ): Promise<void> {
    if (botType === 'client') {
      await this.handleClientBotUpdate(update);
      return;
    }

    if (botType === 'manager') {
      await this.handleManagerBotUpdate(update);
      return;
    }

    const client = getDriverTelegramBotClient();

    // 1. Handle Callback Query
    if (update.callback_query) {
      const cb = update.callback_query;
      const tgId = cb.from.id;
      const data = cb.data || '';

      // Immediately answer callback query to stop Telegram loading spinner
      await client.answerCallbackQuery(cb.id);

      const driver = await DriverPairingService.getDriverByTelegramId(tgId);
      if (!driver) {
        await client.sendMessage({
          chatId: tgId,
          text: '❌ Доступ запрещён. Ваш аккаунт не привязан к системе AliBros Logistics. Отправьте код привязки для авторизации.',
        });
        return;
      }

      await this.handleCallbackData(driver.id, tgId, data);
      return;
    }

    // 2. Handle Message
    if (update.message) {
      const msg = update.message;
      const tgId = msg.from.id;
      const text = msg.text?.trim() || '';

      const driver = await DriverPairingService.getDriverByTelegramId(tgId);

      // Handle unlinked user
      if (!driver) {
        await this.handleUnlinkedUserMessage(msg);
        return;
      }

      // Handle linked driver photo upload
      if (msg.photo && msg.photo.length > 0) {
        await this.handleDriverPhotoMessage(driver.id, tgId, msg);
        return;
      }

      // Handle linked driver commands / text
      await this.handleLinkedDriverMessage(driver, tgId, text);
    }
  }

  /**
   * Handles incoming updates for Client Bot (@AliBrosClientBot)
   */
  public static async handleClientBotUpdate(update: TelegramIncomingUpdate): Promise<void> {
    const clientBot = getClientTelegramBotClient();

    if (update.callback_query) {
      await clientBot.answerCallbackQuery(update.callback_query.id);
      return;
    }

    if (update.message) {
      const msg = update.message;
      const tgId = msg.from.id;
      const text = msg.text?.trim() || '';
      const appUrl = getCanonicalAppUrl();

      // 1. Check if client sent pairing code, e.g. "/start ABL-123456" or "ABL-123456"
      let pairingCode: string | null = null;
      const startMatch = text.match(/^\/start(?:@\w+)?(?:\s+|=)(.+)$/i);
      if (startMatch && startMatch[1]) {
        pairingCode = startMatch[1].trim();
      } else if (text.toUpperCase().startsWith('ABL-') || (text.length === 10 && text.includes('-'))) {
        pairingCode = text.trim();
      }

      if (pairingCode) {
        const result = await ClientPairingService.verifyAndLinkClient(tgId, pairingCode, {
          username: msg.from.username,
          firstName: msg.from.first_name,
          lastName: msg.from.last_name,
          languageCode: msg.from.language_code,
        });

        if (result.success) {
          await clientBot.sendMessage({
            chatId: tgId,
            text: [
              `✅ <b>Авторизация клиента успешна!</b>`,
              ``,
              `Здравствуйте, <b>${result.companyName}</b>!`,
              `Ваш Telegram-аккаунт успешно привязан к системе AliBros Logistics.`,
              `Теперь вы будете получать уведомления о статусах ваших доставок и фотоотчёты.`,
            ].join('\n'),
            parseMode: 'HTML',
            replyMarkup: {
              inline_keyboard: [
                [
                  {
                    text: '📱 Открыть кабинет селлера (Mini App)',
                    web_app: { url: `${appUrl}/miniapp` },
                  },
                ],
              ],
            },
          });
          return;
        } else {
          await clientBot.sendMessage({
            chatId: tgId,
            text: `❌ <b>Ошибка привязки:</b>\n${result.error}`,
            parseMode: 'HTML',
          });
          return;
        }
      }

      // 2. Check if client is already linked
      const client = await ClientPairingService.getClientByTelegramId(tgId);

      if (client) {
        // Linked client: check if requesting orders
        if (text === '/orders' || text === '📦 Мои заявки' || text.toLowerCase().includes('заявк')) {
          const activeOrders = await prisma.order.findMany({
            where: {
              clientId: client.id,
              status: {
                notIn: [
                  OrderStatus.COMPLETED,
                  OrderStatus.CANCELLED,
                  OrderStatus.REJECTED_BY_MANAGER,
                ],
              },
            },
            include: { warehouse: true },
            orderBy: { createdAt: 'desc' },
            take: 5,
          });

          if (activeOrders.length === 0) {
            await clientBot.sendMessage({
              chatId: tgId,
              text: `📦 <b>У вас нет активных заявок.</b>\nОформить новую поставку можно в личном кабинете.`,
              parseMode: 'HTML',
              replyMarkup: {
                inline_keyboard: [
                  [
                    {
                      text: '📱 Оформить заявку (Mini App)',
                      web_app: { url: `${appUrl}/miniapp` },
                    },
                  ],
                ],
              },
            });
            return;
          }

          const lines = [
            `📦 <b>Ваши активные поставки (${activeOrders.length}):</b>`,
            ``,
          ];

          for (const ord of activeOrders) {
            const statusLabel = STATUS_LABELS[ord.status] || ord.status;
            const cargo =
              ord.totalPalletsCount > 0
                ? `${ord.totalBoxesCount} кор., ${ord.totalPalletsCount} палл.`
                : `${ord.totalBoxesCount} кор.`;
            lines.push(
              `• <code>${ord.orderNumber}</code> → <b>${ord.warehouse.name}</b> (${ord.marketplace})\n  Статус: <b>${statusLabel}</b> (${cargo})\n`
            );
          }

          await clientBot.sendMessage({
            chatId: tgId,
            text: lines.join('\n'),
            parseMode: 'HTML',
            replyMarkup: {
              inline_keyboard: [
                [
                  {
                    text: '📱 Открыть подробности (Mini App)',
                    web_app: { url: `${appUrl}/miniapp` },
                  },
                ],
              ],
            },
          });
          return;
        }

        // Linked client general welcome/menu
        await clientBot.sendMessage({
          chatId: tgId,
          text: [
            `👋 Здравствуйте, <b>${client.companyName}</b>!`,
            ``,
            `Ваш Telegram-аккаунт привязан к кабинету AliBros Logistics.`,
            `Используйте /orders для просмотра активных поставок или откройте Mini App.`,
          ].join('\n'),
          parseMode: 'HTML',
          replyMarkup: {
            inline_keyboard: [
              [
                {
                  text: '📱 Открыть кабинет селлера (Mini App)',
                  web_app: { url: `${appUrl}/miniapp` },
                },
              ],
            ],
          },
        });
        return;
      }

      // Unlinked client welcome
      await clientBot.sendMessage({
        chatId: tgId,
        text: [
          `👋 <b>Добро пожаловать в AliBros Logistics!</b>`,
          ``,
          `Этот бот предназначен для клиентов и селлеров маркетплейсов.`,
          `• Для привязки аккаунта введите одноразовый код (например, <code>ABL-A1B2C3</code>).`,
          `• Или нажмите кнопку ниже, чтобы открыть мобильный личный кабинет селлера.`,
        ].join('\n'),
        parseMode: 'HTML',
        replyMarkup: {
          inline_keyboard: [
            [
              {
                text: '📱 Открыть кабинет селлера (Mini App)',
                web_app: { url: `${appUrl}/miniapp` },
              },
            ],
          ],
        },
      });
    }
  }

  /**
   * Handles incoming updates for Manager Bot (@AliBrosManagerBot)
   */
  public static async handleManagerBotUpdate(update: TelegramIncomingUpdate): Promise<void> {
    const managerBot = getManagerTelegramBotClient();

    if (update.callback_query) {
      await this.handleManagerCallbackQuery(update.callback_query);
      return;
    }

    if (update.message) {
      const msg = update.message;
      const tgId = msg.from.id;
      const text = msg.text?.trim() || '';
      const appUrl = getCanonicalAppUrl();

      logger.info({
        event: 'MANAGER_BOT_UPDATE_RECEIVED',
        isStartCommand: text.startsWith('/start'),
        textLength: text.length,
      });

      // 1. Check if manager sent pairing code
      let pairingCode: string | null = null;
      const startMatch = text.match(/^\/start(?:@\w+)?(?:\s+|=)(.+)$/i);
      if (startMatch && startMatch[1]) {
        pairingCode = startMatch[1].trim();
      } else if (text.toUpperCase().startsWith('ABL-') || (text.length === 10 && text.includes('-'))) {
        pairingCode = text.trim();
      }

      if (pairingCode) {
        logger.info({
          event: 'MANAGER_BOT_PAIRING_ATTEMPT',
          codePrefix: pairingCode.slice(0, 4),
        });

        const result = await ManagerPairingService.verifyAndLinkManager(tgId, pairingCode, {
          username: msg.from.username,
          firstName: msg.from.first_name,
          lastName: msg.from.last_name,
          languageCode: msg.from.language_code,
        });

        if (result.success) {
          logger.info({
            event: 'MANAGER_BOT_PAIRING_SUCCESS',
            managerProfileId: result.managerProfileId,
          });

          await managerBot.sendMessage({
            chatId: tgId,
            text: [
              `✅ <b>Авторизация менеджера успешна!</b>`,
              ``,
              `Здравствуйте, <b>${result.fullName}</b>!`,
              `Ваш аккаунт подтверждён для управления и согласования клиентских заявок AliBros.`,
              `Карточки новых заявок для модерации будут поступать прямо в этот чат.`,
            ].join('\n'),
            parseMode: 'HTML',
          });
          return;
        } else {
          logger.warn({
            event: 'MANAGER_BOT_PAIRING_FAILED',
            error: result.error,
          });

          await managerBot.sendMessage({
            chatId: tgId,
            text: `❌ <b>Ошибка привязки:</b>\n${result.error}`,
            parseMode: 'HTML',
          });
          return;
        }
      }

      // 2. Check if manager is linked
      const managerUser = await ManagerPairingService.getManagerByTelegramId(tgId);

      if (managerUser) {
        if (text === '/status' || text === '/orders' || text === '/stats') {
          const [pendingCount, inProgressCount] = await Promise.all([
            prisma.order.count({
              where: {
                status: {
                  in: [OrderStatus.CREATED, OrderStatus.PENDING_CONFIRMATION],
                },
              },
            }),
            prisma.order.count({
              where: {
                status: {
                  in: [
                    OrderStatus.CONFIRMED,
                    OrderStatus.ASSIGNED_TO_DRIVER,
                    OrderStatus.ACCEPTED_BY_DRIVER,
                    OrderStatus.PICKED_UP,
                    OrderStatus.IN_TRANSIT,
                    OrderStatus.DELIVERED_TO_WAREHOUSE,
                  ],
                },
              },
            }),
          ]);

          await managerBot.sendMessage({
            chatId: tgId,
            text: [
              `📊 <b>Оперативная сводка AliBros:</b>`,
              ``,
              `⏳ Ожидают подтверждения: <b>${pendingCount}</b>`,
              `🚚 В работе / на рейсе: <b>${inProgressCount}</b>`,
              ``,
              `🔗 <a href="${appUrl}/admin/orders">Открыть панель управления заявками</a>`,
            ].join('\n'),
            parseMode: 'HTML',
          });
          return;
        }

        await managerBot.sendMessage({
          chatId: tgId,
          text: [
            `🤖 <b>AliBros Manager Bot</b>`,
            ``,
            `Вы авторизованы как сотрудник AliBros Logistics.`,
            `• /status — сводка активных рейсов`,
            `• Оперативные события направляются в тему «Отгрузка» рабочей группы.`,
            ``,
            `🔗 <a href="${appUrl}/admin">Панель администратора</a>`,
          ].join('\n'),
          parseMode: 'HTML',
        });
        return;
      }

      // Unlinked user
      await managerBot.sendMessage({
        chatId: tgId,
        text: [
          `🤖 <b>AliBros Manager Bot</b>`,
          ``,
          `Бот оперативных уведомлений команды логистики AliBros.`,
          `Для привязки аккаунта отправьте код привязки от администратора системы.`,
          ``,
          `Для перехода в веб-панель управления откройте: <a href="${appUrl}/admin">Панель администратора</a>`,
        ].join('\n'),
        parseMode: 'HTML',
      });
    }
  }

  /**
   * Handles callback queries for Manager Bot (@AliBrosManagerBot).
   * Implements Stage 2 of the Two-Stage Approval Workflow:
   * - Validates manager authentication and RBAC permissions
   * - Atomically transitions order status (CREATED -> CONFIRMED / REJECTED_BY_MANAGER)
   * - Prevents race conditions and duplicate clicks
   * - Updates message in Telegram removing inline buttons
   * - Broadcasts CONFIRMED orders to the shipping group
   * - Notifies client via Client Bot
   * - Strictly ensures rejected orders NEVER reach the group chat
   */
  public static async handleManagerCallbackQuery(
    cb: NonNullable<TelegramIncomingUpdate['callback_query']>
  ): Promise<void> {
    const managerBot = getManagerTelegramBotClient();
    const tgId = cb.from.id;
    const data = cb.data || '';

    // Match action format: mg:accept:<orderId> or mg:reject:<orderId>
    const match = data.match(/^mg:(accept|reject):([a-zA-Z0-9_-]+)$/);
    if (!match) {
      await managerBot.answerCallbackQuery(cb.id);
      return;
    }

    const action = match[1] as 'accept' | 'reject';
    const orderId = match[2];

    // 1. RBAC Authentication
    const managerUser = await ManagerPairingService.getManagerByTelegramId(tgId);
    if (!managerUser) {
      await managerBot.answerCallbackQuery(
        cb.id,
        '❌ Доступ запрещён. Вы не авторизованы как сотрудник AliBros Logistics.',
        true
      );
      return;
    }

    const managerName = managerUser.managerProfile?.fullName || managerUser.email || 'Менеджер';

    // 2. Atomic Status Transition in PostgreSQL
    const targetStatus = action === 'accept' ? OrderStatus.CONFIRMED : OrderStatus.REJECTED_BY_MANAGER;
    const historyComment =
      action === 'accept'
        ? `Заявка подтверждена менеджером ${managerName} через Telegram Bot`
        : `Заявка отклонена менеджером ${managerName} через Telegram Bot`;

    let txResult: {
      outcome: 'SUCCESS' | 'NOT_FOUND' | 'ALREADY_PROCESSED';
      currentStatus?: OrderStatus;
      order?: any;
    };

    try {
      txResult = await prisma.$transaction(async (tx) => {
        const order = await tx.order.findUnique({
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
          return { outcome: 'NOT_FOUND' };
        }

        if (order.status !== OrderStatus.CREATED) {
          return { outcome: 'ALREADY_PROCESSED', currentStatus: order.status, order };
        }

        // Concurrency barrier: updateMany with strict WHERE status = CREATED
        const updateCount = await tx.order.updateMany({
          where: {
            id: orderId,
            status: OrderStatus.CREATED,
          },
          data: {
            status: targetStatus,
          },
        });

        if (updateCount.count === 0) {
          return { outcome: 'ALREADY_PROCESSED', currentStatus: order.status, order };
        }

        await tx.orderStatusHistory.create({
          data: {
            orderId,
            fromStatus: OrderStatus.CREATED,
            toStatus: targetStatus,
            changedById: managerUser.id,
            comment: historyComment,
          },
        });

        return { outcome: 'SUCCESS', currentStatus: targetStatus, order };
      }, { timeout: 15000, maxWait: 10000 });
    } catch (err: unknown) {
      logger.error({ err, orderId, action, tgId }, 'Database error during manager approval callback');
      await managerBot.answerCallbackQuery(cb.id, '❌ Произошла ошибка базы данных при обработке заявки.', true);
      return;
    }

    // 3. Handle Already Processed / Not Found
    if (txResult.outcome === 'NOT_FOUND') {
      await managerBot.answerCallbackQuery(cb.id, '❌ Заявка не найдена в системе.', true);
      return;
    }

    if (txResult.outcome === 'ALREADY_PROCESSED') {
      const statusLabel = STATUS_LABELS[txResult.currentStatus!] || txResult.currentStatus;

      await managerBot.answerCallbackQuery(
        cb.id,
        `ℹ️ Заявка уже была обработана ранее (текущий статус: ${statusLabel}).`,
        true
      );

      // Clean up buttons from manager's message to prevent further clicks
      if (cb.message?.message_id && cb.message.chat?.id) {
        const originalText = cb.message.text || '';
        const cleanedText = originalText
          .replace('Пожалуйста, подтвердите или отклоните заявку:', '')
          .trim();
        await managerBot.editMessageText({
          chatId: cb.message.chat.id,
          messageId: cb.message.message_id,
          text: `${cleanedText}\n\n<i>ℹ️ Заявка уже обработана ранее (текущий статус: ${statusLabel}).</i>`,
          parseMode: 'HTML',
        }).catch(() => {});
      }
      return;
    }

    const processedOrder = txResult.order!;

    // 4. Audit Log
    try {
      await AuditService.log({
        userId: managerUser.id,
        action: AuditAction.STATUS_CHANGE,
        resource: 'Order',
        resourceId: orderId,
        oldValue: { status: OrderStatus.CREATED },
        newValue: { status: targetStatus },
        metadata: {
          source: 'TELEGRAM_MANAGER_BOT',
          action,
          telegramId: tgId.toString(),
        },
      });
    } catch {
      // Safe non-blocking audit failure
    }

    // 5. Update Manager Telegram Message (remove buttons & display confirmation)
    if (cb.message?.message_id && cb.message.chat?.id) {
      const originalText = cb.message.text || '';
      const cleanedText = originalText
        .replace('Пожалуйста, подтвердите или отклоните заявку:', '')
        .trim();

      const statusBadge =
        action === 'accept'
          ? `✅ <b>Заявка подтверждена</b> менеджером <b>${managerName}</b>\n📤 Отправлена в оперативную группу отгрузки.`
          : `❌ <b>Заявка отклонена</b> менеджером <b>${managerName}</b>.`;

      await managerBot.editMessageText({
        chatId: cb.message.chat.id,
        messageId: cb.message.message_id,
        text: `${cleanedText}\n\n${statusBadge}`,
        parseMode: 'HTML',
      }).catch(() => {});
    }

    // 6. Action-Specific Dispatches
    if (action === 'accept') {
      // 6a. Answer callback query
      await managerBot.answerCallbackQuery(cb.id, '✅ Заявка подтверждена и опубликована в группе!');

      // 6b. Sync confirmed order to Google Sheets (Safe non-blocking)
      try {
        await GoogleSheetsSyncService.syncOrder(processedOrder.id);
      } catch (sheetsErr) {
        logger.error({ err: sheetsErr, orderId: processedOrder.id }, 'Failed to sync confirmed order to Google Sheets');
      }

      // 6c. Dispatch ORDER_CONFIRMED to the shipping group
      try {
        const groupRes = await TelegramNotificationService.notifyGroupEvent('ORDER_CONFIRMED', {
          orderId: processedOrder.id,
          orderNumber: processedOrder.orderNumber,
          marketplace: processedOrder.marketplace,
          warehouseName: processedOrder.warehouse?.name || 'Склад',
          scheduledPickupAt: processedOrder.scheduledPickupAt,
          totalBoxesCount: processedOrder.totalBoxesCount,
          totalPalletsCount: processedOrder.totalPalletsCount,
          managerComment: `Подтверждено: ${managerName}`,
        });

        await AuditService.log({
          userId: managerUser.id,
          action: AuditAction.UPDATE,
          resource: 'OrderNotification',
          resourceId: processedOrder.id,
          newValue: {
            eventType: 'ORDER_CONFIRMED',
            sent: groupRes.sent,
            messageId: groupRes.messageId ?? undefined,
            skippedReason: groupRes.skippedReason ?? undefined,
            error: groupRes.error ?? undefined,
          },
          metadata: {
            source: 'TELEGRAM_MANAGER_BOT',
            action: 'group_dispatch',
          },
        });
      } catch (e) {
        logger.error({ err: e }, 'Failed to dispatch group ORDER_CONFIRMED');
      }

      // 6c. Notify Client (In-App)
      if (processedOrder.client?.userId) {
        try {
          await NotificationsService.queue({
            userId: processedOrder.client.userId,
            type: NotificationType.ORDER_STATUS_CHANGED,
            channel: NotificationChannel.IN_APP,
            title: `Заявка #${processedOrder.orderNumber} подтверждена`,
            body: `Менеджер ${managerName} подтвердил вашу заявку на доставку в ${processedOrder.warehouse.name}.`,
            payload: { orderId: processedOrder.id, status: OrderStatus.CONFIRMED },
          });
        } catch {
          // Safe non-blocking in-app notification failure
        }

        // 6d. Notify Client (Client Bot DM)
        const clientTg = processedOrder.client.user?.telegramAccount;
        if (clientTg?.telegramId) {
          const clientBot = getClientTelegramBotClient();
          await clientBot.sendMessageWithRetry({
            chatId: clientTg.telegramId.toString(),
            text: [
              `✅ <b>Ваша заявка подтверждена</b>`,
              ``,
              `Заявка: <code>#${processedOrder.orderNumber}</code>`,
              `Склад: <b>${processedOrder.warehouse.name}</b> (${processedOrder.marketplace})`,
              `Статус: <b>Подтверждена</b>. Поиск водителя для забора груза.`,
            ].join('\n'),
            parseMode: 'HTML',
          }).catch(() => {});
        }
      }
    } else {
      // 6e. Rejection flow
      await managerBot.answerCallbackQuery(cb.id, '❌ Заявка отклонена.');

      // Notify Client (In-App)
      if (processedOrder.client?.userId) {
        try {
          await NotificationsService.queue({
            userId: processedOrder.client.userId,
            type: NotificationType.ORDER_STATUS_CHANGED,
            channel: NotificationChannel.IN_APP,
            title: `Заявка #${processedOrder.orderNumber} отклонена`,
            body: `Ваша заявка была отклонена менеджером.`,
            payload: { orderId: processedOrder.id, status: OrderStatus.REJECTED_BY_MANAGER },
          });
        } catch {
          // Safe non-blocking in-app notification failure
        }

        // Notify Client (Client Bot DM)
        const clientTg = processedOrder.client.user?.telegramAccount;
        if (clientTg?.telegramId) {
          const clientBot = getClientTelegramBotClient();
          await clientBot.sendMessageWithRetry({
            chatId: clientTg.telegramId.toString(),
            text: [
              `❌ <b>Ваша заявка отклонена</b>`,
              ``,
              `Заявка: <code>#${processedOrder.orderNumber}</code>`,
              `Склад: <b>${processedOrder.warehouse.name}</b> (${processedOrder.marketplace})`,
              `Статус: <b>Отклонена менеджером</b>.`,
              `Причина: <i>Параметры поставки не соответствуют регламенту или склад маркетплейса временно недоступен.</i>`,
              ``,
              `<i>Вы можете скорректировать заявку в личном кабинете или обратиться к менеджеру поддержки.</i>`,
            ].join('\n'),
            parseMode: 'HTML',
          }).catch(() => {});
        }
      }

      // STRICT REQUIREMENT: Rejected orders NEVER reach the group chat. No group notification dispatched.
      logger.info({
        event: 'MANAGER_APPROVAL_REJECTED',
        orderId: processedOrder.id,
        orderNumber: processedOrder.orderNumber,
        managerId: managerUser.id,
      }, 'Order rejected by manager. Group notification skipped per strict privacy/workflow requirement.');
    }
  }

  /**
   * Handles messages from users who have not yet linked their Telegram account.
   */
  private static async handleUnlinkedUserMessage(
    msg: NonNullable<TelegramIncomingUpdate['message']>
  ): Promise<void> {
    const client = getDriverTelegramBotClient();
    const tgId = msg.from.id;
    const text = msg.text?.trim() || '';

    // Check if message is /start with code, e.g. "/start ABL-123456"
    let pairingCode: string | null = null;
    const startMatch = text.match(/^\/start(?:@\w+)?(?:\s+|=)(.+)$/i);
    if (startMatch && startMatch[1]) {
      pairingCode = startMatch[1].trim();
    } else if (text.toUpperCase().startsWith('ABL-') || text.length === 10) {
      pairingCode = text.trim();
    }

    if (pairingCode) {
      const result = await DriverPairingService.verifyAndLinkDriver(tgId, pairingCode, {
        username: msg.from.username,
        firstName: msg.from.first_name,
        lastName: msg.from.last_name,
        languageCode: msg.from.language_code,
      });

      if (result.success) {
        await client.sendMessage({
          chatId: tgId,
          text: [
            `✅ <b>Авторизация успешна!</b>`,
            ``,
            `Добро пожаловать в логистическую систему AliBros, <b>${result.driverFullName}</b>.`,
            `Теперь вы будете получать назначенные рейсы и сможете оперативно отмечать этапы доставки прямо в этом чате.`,
          ].join('\n'),
          parseMode: 'HTML',
          replyMarkup: this.getMainKeyboard(),
        });
        return;
      } else {
        await client.sendMessage({
          chatId: tgId,
          text: `❌ <b>Ошибка авторизации:</b>\n${result.error}`,
          parseMode: 'HTML',
        });
        return;
      }
    }

    // Default welcome for unlinked user with Mini App button for sellers
    const appUrl = getCanonicalAppUrl();

    await client.sendMessage({
      chatId: tgId,
      text: [
        `👋 <b>Добро пожаловать в AliBros Logistics!</b>`,
        ``,
        `• <b>Для селлеров Wildberries и Ozon:</b> откройте мобильный личный кабинет для оформления и контроля поставок по кнопке ниже.`,
        `• <b>Для водителей автопарка:</b> отправьте полученный от диспетчера одноразовый код привязки (например, <code>ABL-A8B3C9</code>).`,
      ].join('\n'),
      parseMode: 'HTML',
      replyMarkup: {
        inline_keyboard: [
          [
            {
              text: '📱 Открыть кабинет селлера (Mini App)',
              web_app: { url: `${appUrl}/miniapp` },
            },
          ],
        ],
      },
    });
  }

  /**
   * Handles commands and text from an authorized driver.
   */
  private static async handleLinkedDriverMessage(
    driver: { id: string; fullName: string; vehicleModel?: string | null; vehiclePlateNumber?: string | null; isAvailable: boolean },
    tgId: number,
    text: string
  ): Promise<void> {
    const client = getDriverTelegramBotClient();

    if (text === '/start') {
      await client.sendMessage({
        chatId: tgId,
        text: `Здравствуйте, <b>${driver.fullName}</b>!\nВыберите необходимое действие в меню ниже:`,
        parseMode: 'HTML',
        replyMarkup: this.getMainKeyboard(),
      });
      return;
    }

    if (text === '📦 Мои активные заявки' || text === '/orders' || text === '/active') {
      await this.sendActiveOrdersList(driver.id, tgId);
      return;
    }

    if (text === '📜 История доставок' || text === '/history') {
      await this.sendCompletedOrdersList(driver.id, tgId);
      return;
    }

    if (text === '👤 Мой профиль' || text === '/profile') {
      const statusText = driver.isAvailable ? '🟢 Доступен для рейсов' : '🟡 На рейсе / Занят';
      await client.sendMessage({
        chatId: tgId,
        text: [
          `👤 <b>Карточка водителя:</b>`,
          ``,
          `ФИО: <b>${driver.fullName}</b>`,
          `Транспорт: <b>${driver.vehicleModel || 'Не указан'}</b> (${driver.vehiclePlateNumber || '—'})`,
          `Статус: <b>${statusText}</b>`,
        ].join('\n'),
        parseMode: 'HTML',
        replyMarkup: this.getMainKeyboard(),
      });
      return;
    }

    if (text === 'ℹ️ Помощь' || text === '/help') {
      await client.sendMessage({
        chatId: tgId,
        text: [
          `ℹ️ <b>Справка водителя AliBros Logistics</b>`,
          ``,
          `1. При назначении нового рейса диспетчером вам придёт мгновенное уведомление.`,
          `2. Нажмите <b>«Принять заявку»</b>, чтобы подтвердить выход на рейс.`,
          `3. Пошагово нажимайте кнопки статусов:`,
          `   • <b>«Забрал груз»</b> — при получении на складе селлера`,
          `   • <b>«В пути»</b> — при выезде к распределительному центру`,
          `   • <b>«Прибыл на склад»</b> — по прибытии на склад маркетплейса`,
          `   • <b>«Передал груз»</b> — после успешной сдачи партии на воротах`,
          `4. При необходимости прикрепите фотоотчёт кнопками <b>«Фото приёмки»</b> или <b>«Фото сдачи»</b>.`,
          ``,
          `📞 По экстренным вопросам связывайтесь с дежурным диспетчером AliBros.`,
        ].join('\n'),
        parseMode: 'HTML',
        replyMarkup: this.getMainKeyboard(),
      });
      return;
    }

    // Fallback response with main menu
    await client.sendMessage({
      chatId: tgId,
      text: 'Используйте кнопки меню для управления рейсами:',
      replyMarkup: this.getMainKeyboard(),
    });
  }

  /**
   * Sends the list of active orders with action buttons to the driver.
   */
  public static async sendActiveOrdersList(driverProfileId: string, tgId: number): Promise<void> {
    const client = getDriverTelegramBotClient();
    const orders = await DriverOrderService.listActiveOrders(driverProfileId);

    if (orders.length === 0) {
      await client.sendMessage({
        chatId: tgId,
        text: '📦 <b>У вас сейчас нет активных заявок.</b>\nКогда менеджер назначит рейс, вы сразу получите уведомление.',
        parseMode: 'HTML',
        replyMarkup: this.getMainKeyboard(),
      });
      return;
    }

    for (const order of orders) {
      const assignment = order.assignments[0];
      const deliveryDateStr = order.scheduledPickupAt
        ? new Date(order.scheduledPickupAt).toLocaleDateString('ru-RU')
        : 'не указана';

      const cargoStr =
        order.totalPalletsCount > 0
          ? `${order.totalPalletsCount} палл. (${order.totalBoxesCount} кор.)`
          : `${order.totalBoxesCount} кор.`;

      const lines = [
        `📦 <b>Заявка:</b> <code>${order.orderNumber}</code>`,
        `🏢 <b>Склад:</b> ${order.warehouse.name} (${order.marketplace})`,
        `🏢 <b>Клиент:</b> ${order.client.companyName}`,
        order.client.contactPhone ? `📞 <b>Телефон:</b> <code>${order.client.contactPhone}</code>` : '',
        `📅 <b>Дата:</b> ${deliveryDateStr}`,
        `📦 <b>Объём:</b> ${cargoStr}`,
        `📍 <b>Адрес:</b> ${order.pickupCity ? `${order.pickupCity}, ` : ''}${order.pickupAddress}`,
        assignment?.notes ? `💬 <b>Инструкция менеджера:</b> <i>${assignment.notes}</i>` : '',
        `📌 <b>Текущий статус:</b> <b>${STATUS_LABELS[order.status] || order.status}</b>`,
      ].filter(Boolean);

      const buttons: Array<Array<{ text: string; callback_data: string }>> = [];

      if (order.status === OrderStatus.ASSIGNED_TO_DRIVER) {
        buttons.push([{ text: '✅ Принять заявку', callback_data: `cb:accept:${order.id}` }]);
      } else if (order.status === OrderStatus.ACCEPTED_BY_DRIVER) {
        buttons.push([
          { text: '📦 Забрал груз', callback_data: `cb:picked:${order.id}` },
          { text: '📸 Фото приёмки', callback_data: `cb:photo:pickup:${order.id}` },
        ]);
      } else if (order.status === OrderStatus.PICKED_UP) {
        buttons.push([{ text: '🚚 В пути', callback_data: `cb:transit:${order.id}` }]);
      } else if (order.status === OrderStatus.IN_TRANSIT) {
        buttons.push([{ text: '🏢 Прибыл на склад', callback_data: `cb:delivered:${order.id}` }]);
      } else if (order.status === OrderStatus.DELIVERED_TO_WAREHOUSE) {
        buttons.push([
          { text: '📋 Передал груз', callback_data: `cb:handed:${order.id}` },
          { text: '📸 Фото сдачи', callback_data: `cb:photo:wh:${order.id}` },
        ]);
      }

      await client.sendMessage({
        chatId: tgId,
        text: lines.join('\n'),
        parseMode: 'HTML',
        replyMarkup: buttons.length > 0 ? { inline_keyboard: buttons } : undefined,
      });
    }
  }

  /**
   * Sends the history of completed orders.
   */
  private static async sendCompletedOrdersList(driverProfileId: string, tgId: number): Promise<void> {
    const client = getDriverTelegramBotClient();
    const orders = await DriverOrderService.listCompletedOrders(driverProfileId, 10);

    if (orders.length === 0) {
      await client.sendMessage({
        chatId: tgId,
        text: '📜 <b>История рейсов пуста.</b>\nЗавершённые рейсы появятся здесь автоматически.',
        parseMode: 'HTML',
        replyMarkup: this.getMainKeyboard(),
      });
      return;
    }

    const lines = [
      `📜 <b>История последних завершённых доставок (${orders.length}):</b>`,
      '',
    ];

    for (const o of orders) {
      const dateStr = new Date(o.updatedAt).toLocaleDateString('ru-RU');
      lines.push(
        `✓ <code>${o.orderNumber}</code> • ${o.warehouse.name} (${o.client.companyName}) • ${dateStr}`
      );
    }

    await client.sendMessage({
      chatId: tgId,
      text: lines.join('\n'),
      parseMode: 'HTML',
      replyMarkup: this.getMainKeyboard(),
    });
  }

  /**
   * Handles inline buttons callbacks (status changes and photo requests).
   */
  private static async handleCallbackData(
    driverProfileId: string,
    tgId: number,
    data: string
  ): Promise<void> {
    const client = getDriverTelegramBotClient();
    const parts = data.split(':');
    const prefix = parts[0];
    const action = parts[1];
    const orderId = parts[2];

    if (prefix !== 'cb' || !action || !orderId) return;

    try {
      if (action === 'accept') {
        const res = await DriverOrderService.updateDriverOrderStatus(
          driverProfileId,
          orderId,
          OrderStatus.ACCEPTED_BY_DRIVER
        );
        await client.sendMessage({
          chatId: tgId,
          text: res.isIdempotent
            ? `ℹ️ Заявка уже была принята ранее.`
            : `✅ Вы успешно приняли заявку в работу! Направляйтесь на склад селлера для забора груза.`,
          parseMode: 'HTML',
        });
        await this.sendActiveOrdersList(driverProfileId, tgId);
        return;
      }

      if (action === 'picked') {
        const res = await DriverOrderService.updateDriverOrderStatus(
          driverProfileId,
          orderId,
          OrderStatus.PICKED_UP
        );
        await client.sendMessage({
          chatId: tgId,
          text: res.isIdempotent
            ? `ℹ️ Заявка уже отмечена как забранная.`
            : `📦 Статус обновлён: <b>Груз забран у селлера</b>. При отправлении нажмите «В пути».`,
          parseMode: 'HTML',
        });
        await this.sendActiveOrdersList(driverProfileId, tgId);
        return;
      }

      if (action === 'transit') {
        const res = await DriverOrderService.updateDriverOrderStatus(
          driverProfileId,
          orderId,
          OrderStatus.IN_TRANSIT
        );
        await client.sendMessage({
          chatId: tgId,
          text: res.isIdempotent
            ? `ℹ️ Заявка уже в пути.`
            : `🚚 Статус обновлён: <b>В пути</b>. По прибытии на склад маркетплейса нажмите «Прибыл на склад».`,
          parseMode: 'HTML',
        });
        await this.sendActiveOrdersList(driverProfileId, tgId);
        return;
      }

      if (action === 'delivered') {
        const res = await DriverOrderService.updateDriverOrderStatus(
          driverProfileId,
          orderId,
          OrderStatus.DELIVERED_TO_WAREHOUSE
        );
        await client.sendMessage({
          chatId: tgId,
          text: res.isIdempotent
            ? `ℹ️ Заявка уже отмечена прибывшей на склад.`
            : `🏢 Статус обновлён: <b>Прибыл на склад</b>. После сдачи партии на воротах и подписания отгрузки нажмите «Передал груз».`,
          parseMode: 'HTML',
        });
        await this.sendActiveOrdersList(driverProfileId, tgId);
        return;
      }

      if (action === 'handed') {
        const res = await DriverOrderService.updateDriverOrderStatus(
          driverProfileId,
          orderId,
          OrderStatus.ACCEPTED_BY_MARKETPLACE
        );
        await client.sendMessage({
          chatId: tgId,
          text: res.isIdempotent
            ? `ℹ️ Заявка уже завершена.`
            : `🎉 <b>Груз успешно сдан!</b> Рейс завершён. Спасибо за отличную работу!`,
          parseMode: 'HTML',
        });
        await this.sendActiveOrdersList(driverProfileId, tgId);
        return;
      }

      // Photo upload requests: cb:photo:<category>:<orderId>
      if (action === 'photo') {
        const category = parts[2]; // 'pickup' or 'wh'
        const targetOrderId = parts[3];

        if (!targetOrderId) return;

        const photoType =
          category === 'wh' ? PhotoType.WAREHOUSE_ACCEPTANCE : PhotoType.CARGO_PICKUP;

        await DriverPhotoService.setPendingUploadSession(driverProfileId, targetOrderId, photoType);

        const label =
          photoType === PhotoType.CARGO_PICKUP
            ? 'фотографию забора груза у клиента'
            : 'фотографию сдачи груза на склад маркетплейса (акт/ворота)';

        await client.sendMessage({
          chatId: tgId,
          text: `📸 Пожалуйста, отправьте ${label} в ответ на это сообщение.\n(Формат: JPG/PNG/WEBP, размер до 10 МБ).`,
        });
        return;
      }
    } catch (err: unknown) {
      logger.error({ err, driverProfileId, data }, 'Error executing callback data');
      await client.sendMessage({
        chatId: tgId,
        text: `⚠️ <b>Ошибка при изменении статуса:</b>\n${err instanceof Error ? err.message : 'Не удалось выполнить операцию'}`,
        parseMode: 'HTML',
      });
    }
  }

  /**
   * Handles incoming photo messages from an authorized driver.
   */
  private static async handleDriverPhotoMessage(
    driverProfileId: string,
    tgId: number,
    msg: NonNullable<TelegramIncomingUpdate['message']>
  ): Promise<void> {
    const client = getDriverTelegramBotClient();
    const session = await DriverPhotoService.getPendingUploadSession(driverProfileId);

    if (!session) {
      await client.sendMessage({
        chatId: tgId,
        text: 'ℹ️ Чтобы прикрепить фотоотчёт, сначала нажмите кнопку «📸 Фото приёмки» или «📸 Фото сдачи» в карточке активной заявки.',
        replyMarkup: this.getMainKeyboard(),
      });
      return;
    }

    const photos = msg.photo || [];
    const largestPhoto = photos[photos.length - 1]; // Telegram provides photos in ascending resolution
    const fileSizeBytes = largestPhoto?.file_size || 0;

    try {
      let fileBuffer: Buffer | undefined;
      if (largestPhoto?.file_id) {
        const fileMeta = await client.getFile(largestPhoto.file_id);
        if (fileMeta?.file_path) {
          const downloaded = await client.downloadFile(fileMeta.file_path);
          if (downloaded) {
            fileBuffer = downloaded;
          }
        }
      }

      const res = await DriverPhotoService.processIncomingPhoto({
        driverProfileId,
        orderId: session.orderId,
        photoType: session.photoType,
        fileSizeBytes: fileBuffer ? fileBuffer.length : fileSizeBytes,
        mimeType: 'image/jpeg',
        fileUniqueId: largestPhoto?.file_unique_id,
        caption: msg.caption,
        fileBuffer,
      });

      await DriverPhotoService.clearPendingUploadSession(driverProfileId);

      await client.sendMessage({
        chatId: tgId,
        text: res.isConfigured
          ? `✅ <b>Фотоотчёт успешно принят и сохранён в облако S3!</b>`
          : `ℹ️ <b>Фото проверено:</b> ${res.message}`,
        parseMode: 'HTML',
        replyMarkup: this.getMainKeyboard(),
      });
    } catch (err: unknown) {
      await client.sendMessage({
        chatId: tgId,
        text: `⚠️ Ошибка при обработке фото: ${err instanceof Error ? err.message : 'Недопустимый файл'}`,
        replyMarkup: this.getMainKeyboard(),
      });
    }
  }
}
