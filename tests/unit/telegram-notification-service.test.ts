import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  TelegramNotificationService,
  TelegramOrderNotificationPayload,
  TelegramGroupEventType,
} from '@/modules/telegram/notification.service';
import {
  TelegramBotClient,
  getDriverTelegramBotClient,
  getClientTelegramBotClient,
  getManagerTelegramBotClient,
  resetTelegramBotClient,
} from '@/integrations/telegram/client';
import { TelegramBotService } from '@/modules/telegram/bot.service';

describe('Telegram 3-Bot Architecture & Shared Group Notification Service', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    resetTelegramBotClient();
    TelegramNotificationService._clearDeduplicationCacheForTesting();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    resetTelegramBotClient();
  });

  describe('1. TelegramBotClient & getMe Method', () => {
    it('should return null when bot token is not configured', async () => {
      const client = new TelegramBotClient('');
      const info = await client.getMe();
      expect(info).toBeNull();
    });

    it('should return bot identity when Telegram API returns 200 ok', async () => {
      const mockResult = {
        id: 987654321,
        is_bot: true,
        first_name: 'AliBros Driver',
        username: 'AliBrosDriverBot',
      };

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, result: mockResult }),
      } as Response);

      const client = new TelegramBotClient('mock-token-123');
      const info = await client.getMe();

      expect(fetchSpy).toHaveBeenCalledWith('https://api.telegram.org/botmock-token-123/getMe', {
        method: 'GET',
      });
      expect(info).toEqual(mockResult);
    });

    it('should handle Telegram API error without throwing', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        json: async () => ({ ok: false, description: 'Unauthorized' }),
      } as Response);

      const client = new TelegramBotClient('invalid-token');
      const info = await client.getMe();

      expect(info).toBeNull();
    });

    it('should handle network fetch error gracefully without throwing', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Connection timeout'));

      const client = new TelegramBotClient('mock-token-network');
      const info = await client.getMe();

      expect(info).toBeNull();
    });
  });

  describe('2. Multi-Bot Client Isolation', () => {
    it('should instantiate separate clients for Driver, Client, and Manager bots', () => {
      process.env.TELEGRAM_DRIVER_BOT_TOKEN = 'token-driver-bot';
      process.env.TELEGRAM_CLIENT_BOT_TOKEN = 'token-client-bot';
      process.env.TELEGRAM_MANAGER_BOT_TOKEN = 'token-manager-bot';

      const driverBot = getDriverTelegramBotClient();
      const clientBot = getClientTelegramBotClient();
      const managerBot = getManagerTelegramBotClient();

      expect(driverBot).toBeInstanceOf(TelegramBotClient);
      expect(clientBot).toBeInstanceOf(TelegramBotClient);
      expect(managerBot).toBeInstanceOf(TelegramBotClient);

      // Verify they are distinct singleton instances
      expect(driverBot).not.toBe(clientBot);
      expect(driverBot).not.toBe(managerBot);
      expect(clientBot).not.toBe(managerBot);
    });
  });

  describe('3. Standard HTML Message Formatting for all 10 Lifecycle Events', () => {
    const basePayload: TelegramOrderNotificationPayload = {
      orderId: 'order-uuid-101',
      orderNumber: 'ABL-2026-001',
      marketplace: 'Wildberries',
      warehouseName: 'Коледино',
      scheduledPickupAt: '2026-11-12T09:00:00.000Z',
      totalBoxesCount: 15,
      totalPalletsCount: 2,
    };

    const allEvents: TelegramGroupEventType[] = [
      'ORDER_CREATED',
      'ORDER_CONFIRMED',
      'ORDER_REJECTED',
      'DRIVER_ASSIGNED',
      'DRIVER_ACCEPTED',
      'CARGO_PICKED_UP',
      'DELIVERED_TO_WAREHOUSE',
      'ACCEPTED_BY_MARKETPLACE',
      'ORDER_COMPLETED',
      'COST_CALCULATED',
    ];

    it.each(allEvents)('should format valid HTML for event %s with required fields', (eventType) => {
      const payload: TelegramOrderNotificationPayload = {
        ...basePayload,
        driverName: 'Иванов Иван',
        rejectionReason: 'Некорректный адрес склада',
        managerComment: 'Срочный рейс',
        costAmount: 18500,
        currency: 'RUB',
      };

      const msg = TelegramNotificationService.buildGroupMessage(eventType, payload);

      // Must include header and orderNumber
      expect(msg).toContain('<b>AliBros Logistics</b>');
      expect(msg).toContain(payload.orderNumber);
      expect(msg).toContain(payload.marketplace);
      expect(msg).toContain(payload.warehouseName);
      expect(msg).toContain('15 кор., 2 палл.');
      expect(msg).toContain('Статус:');

      // Security check: must NEVER contain passwords, tokens, or personal phone numbers
      expect(msg).not.toContain('password');
      expect(msg).not.toContain('token');
      expect(msg).not.toContain('+79');
    });

    it('should include rejection reason in ORDER_REJECTED message', () => {
      const msg = TelegramNotificationService.buildGroupMessage('ORDER_REJECTED', {
        ...basePayload,
        rejectionReason: 'Отсутствуют штрихкоды коробов',
      });

      expect(msg).toContain('❌ Заявка #ABL-2026-001 отклонена');
      expect(msg).toContain('Причина: <i>Отсутствуют штрихкоды коробов</i>');
    });

    it('should include calculated cost in COST_CALCULATED message', () => {
      const msg = TelegramNotificationService.buildGroupMessage('COST_CALCULATED', {
        ...basePayload,
        costAmount: 24500,
        currency: 'RUB',
      });

      expect(msg).toContain('💰 Рассчитана стоимость доставки: #ABL-2026-001');
      expect(msg).toContain('24 500 RUB');
    });
  });

  describe('4. Group Notification Dispatch & Deduplication', () => {
    const payload: TelegramOrderNotificationPayload = {
      orderId: 'order-101',
      orderNumber: 'ABL-2026-001',
      marketplace: 'Ozon',
      warehouseName: 'Хоругвино',
      scheduledPickupAt: new Date(),
      totalBoxesCount: 5,
      totalPalletsCount: 0,
    };

    it('should skip sending when TELEGRAM_ENABLE_GROUP_NOTIFICATIONS is false', async () => {
      process.env.TELEGRAM_ENABLE_GROUP_NOTIFICATIONS = 'false';
      process.env.TELEGRAM_MANAGER_GROUP_CHAT_ID = '-1003893397086';

      const res = await TelegramNotificationService.notifyGroupEvent('ORDER_CREATED', payload);

      expect(res.sent).toBe(false);
      expect(res.skippedReason).toBe('GROUP_NOTIFICATIONS_DISABLED');
    });

    it('should skip sending when TELEGRAM_MANAGER_GROUP_CHAT_ID is missing', async () => {
      delete process.env.TELEGRAM_MANAGER_GROUP_CHAT_ID;
      delete process.env.TELEGRAM_GROUP_CHAT_ID;
      process.env.TELEGRAM_ENABLE_GROUP_NOTIFICATIONS = 'true';

      const res = await TelegramNotificationService.notifyGroupEvent('ORDER_CREATED', payload);

      expect(res.sent).toBe(false);
      expect(res.skippedReason).toBe('CHAT_ID_NOT_CONFIGURED');
    });

    it('should send notification to the group chat ID using Manager Bot client', async () => {
      process.env.TELEGRAM_ENABLE_GROUP_NOTIFICATIONS = 'true';
      process.env.TELEGRAM_MANAGER_GROUP_CHAT_ID = '-1003893397086';
      process.env.TELEGRAM_MANAGER_BOT_TOKEN = 'manager-bot-token-secret';

      const sendSpy = vi
        .spyOn(TelegramBotClient.prototype, 'sendMessage')
        .mockResolvedValueOnce(true);

      const res = await TelegramNotificationService.notifyGroupEvent('ORDER_CREATED', payload);

      expect(res.sent).toBe(true);
      expect(sendSpy).toHaveBeenCalledTimes(1);
      const callArg = sendSpy.mock.calls[0][0];
      expect(callArg.chatId).toBe('-1003893397086');
      expect(callArg.text).toContain('ABL-2026-001');
      expect(callArg.parseMode).toBe('HTML');
    });

    it('should deduplicate and prevent duplicate dispatch for the same event and order within 10 minutes', async () => {
      process.env.TELEGRAM_ENABLE_GROUP_NOTIFICATIONS = 'true';
      process.env.TELEGRAM_MANAGER_GROUP_CHAT_ID = '-1003893397086';
      process.env.TELEGRAM_MANAGER_BOT_TOKEN = 'manager-bot-token-secret';

      const sendSpy = vi
        .spyOn(TelegramBotClient.prototype, 'sendMessage')
        .mockResolvedValue(true);

      // First dispatch -> sent
      const firstRes = await TelegramNotificationService.notifyGroupEvent('ORDER_CREATED', payload);
      expect(firstRes.sent).toBe(true);
      expect(sendSpy).toHaveBeenCalledTimes(1);

      // Immediate second dispatch for identical event & order -> deduplicated
      const secondRes = await TelegramNotificationService.notifyGroupEvent('ORDER_CREATED', payload);
      expect(secondRes.sent).toBe(false);
      expect(secondRes.duplicate).toBe(true);
      // sendMessage must NOT have been called a second time
      expect(sendSpy).toHaveBeenCalledTimes(1);

      // Different event type on same order should be allowed
      const thirdRes = await TelegramNotificationService.notifyGroupEvent('ORDER_CONFIRMED', payload);
      expect(thirdRes.sent).toBe(true);
      expect(sendSpy).toHaveBeenCalledTimes(2);
    });

    it('should never throw when Telegram API returns failure or network error', async () => {
      process.env.TELEGRAM_ENABLE_GROUP_NOTIFICATIONS = 'true';
      process.env.TELEGRAM_MANAGER_GROUP_CHAT_ID = '-1003893397086';
      process.env.TELEGRAM_MANAGER_BOT_TOKEN = 'manager-bot-token-secret';

      vi.spyOn(TelegramBotClient.prototype, 'sendMessage').mockRejectedValueOnce(
        new Error('Telegram API connection reset by peer')
      );

      const res = await TelegramNotificationService.notifyGroupEvent('ORDER_CREATED', {
        ...payload,
        orderId: 'order-error-test',
      });

      expect(res.sent).toBe(false);
      expect(res.error).toBeDefined();
    });
  });

  describe('5. Bot Routing in TelegramBotService', () => {
    it('should route Client Bot /start to seller greeting with Mini App button', async () => {
      process.env.TELEGRAM_CLIENT_BOT_TOKEN = 'client-bot-token';
      const sendSpy = vi
        .spyOn(TelegramBotClient.prototype, 'sendMessage')
        .mockResolvedValueOnce(true);

      await TelegramBotService.handleUpdate(
        {
          update_id: 1,
          message: {
            message_id: 10,
            from: { id: 112233, first_name: 'Seller User' },
            chat: { id: 112233, type: 'private' },
            date: Math.floor(Date.now() / 1000),
            text: '/start',
          },
        },
        'client'
      );

      expect(sendSpy).toHaveBeenCalledTimes(1);
      const call = sendSpy.mock.calls[0][0];
      expect(call.chatId).toBe(112233);
      expect(call.text).toContain('селлеров маркетплейсов');
      expect(call.replyMarkup).toBeDefined();
    });

    it('should route Manager Bot /start to manager greeting', async () => {
      process.env.TELEGRAM_MANAGER_BOT_TOKEN = 'manager-bot-token';
      const sendSpy = vi
        .spyOn(TelegramBotClient.prototype, 'sendMessage')
        .mockResolvedValueOnce(true);

      await TelegramBotService.handleUpdate(
        {
          update_id: 2,
          message: {
            message_id: 11,
            from: { id: 998877, first_name: 'Logistics Manager' },
            chat: { id: 998877, type: 'private' },
            date: Math.floor(Date.now() / 1000),
            text: '/start',
          },
        },
        'manager'
      );

      expect(sendSpy).toHaveBeenCalledTimes(1);
      const call = sendSpy.mock.calls[0][0];
      expect(call.chatId).toBe(998877);
      expect(call.text).toContain('AliBros Manager Bot');
      expect(call.text).toContain('Панель администратора');
    });
  });
});
