import {
  getDriverTelegramBotClient,
  getClientTelegramBotClient,
  getManagerTelegramBotClient,
} from '@/integrations/telegram/client';
import { DriverPairingService } from './pairing.service';
import { DriverOrderService } from '@/modules/orders/driver-order.service';
import { DriverPhotoService } from './photo.service';
import { STATUS_LABELS } from '@/components/ui/status-badge';
import { OrderStatus, PhotoType } from '@prisma/client';
import { logger } from '@/lib/logger';

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
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'https://alibros.com';

      await clientBot.sendMessage({
        chatId: tgId,
        text: [
          `👋 <b>Добро пожаловать в AliBros Logistics!</b>`,
          ``,
          `Этот бот предназначен для клиентов и селлеров маркетплейсов.`,
          `Нажмите кнопку ниже, чтобы открыть личный кабинет (Telegram Mini App), рассчитать доставку, оформить заявку и отслеживать статус грузов.`,
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
      await managerBot.answerCallbackQuery(update.callback_query.id);
      return;
    }

    if (update.message) {
      const msg = update.message;
      const tgId = msg.from.id;
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'https://alibros.com';

      await managerBot.sendMessage({
        chatId: tgId,
        text: [
          `🤖 <b>AliBros Manager Bot</b>`,
          ``,
          `Бот оперативных уведомлений команды логистики AliBros.`,
          `Все события по заявкам и статусам отправляются в общую рабочую группу.`,
          ``,
          `Для перехода в веб-панель управления откройте: <a href="${appUrl}/admin">Панель администратора</a>`,
        ].join('\n'),
        parseMode: 'HTML',
      });
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
    if (text.startsWith('/start ')) {
      pairingCode = text.replace('/start ', '').trim();
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
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'https://alibros.com';

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

        DriverPhotoService.setPendingUploadSession(driverProfileId, targetOrderId, photoType);

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
    const session = DriverPhotoService.getPendingUploadSession(driverProfileId);

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

      DriverPhotoService.clearPendingUploadSession(driverProfileId);

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
