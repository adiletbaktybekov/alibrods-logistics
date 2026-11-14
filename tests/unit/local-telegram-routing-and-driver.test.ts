import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TelegramNotificationService } from '@/modules/telegram/notification.service';
import { NotificationDispatcherService } from '@/modules/notifications/dispatcher.service';
import { TelegramBotClient, getDriverTelegramBotClient, getManagerTelegramBotClient } from '@/integrations/telegram/client';
import { TelegramBotService } from '@/modules/telegram/bot.service';
import { GoogleSheetsSyncService } from '@/modules/integrations/google-sheets-sync.service';
import { ManagerPairingService } from '@/modules/telegram/pairing.service';
import { OrderStatus, UserRole } from '@prisma/client';
import { DatabaseRateLimiter } from '@/lib/security/rate-limit';
import { prisma } from '@/database/prisma';

describe('Local Telegram Notification & Driver Dispatch Verification', () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalChatId = process.env.TELEGRAM_MANAGER_GROUP_CHAT_ID;
  const originalTopicId = process.env.TELEGRAM_MANAGER_GROUP_TOPIC_ID;
  const originalGroupChatId = process.env.TELEGRAM_GROUP_CHAT_ID;
  const originalGroupTopicId = process.env.TELEGRAM_GROUP_TOPIC_ID;
  const originalEnableGroup = process.env.TELEGRAM_ENABLE_GROUP_NOTIFICATIONS;
  const originalDriverToken = process.env.TELEGRAM_DRIVER_BOT_TOKEN;
  const originalManagerToken = process.env.TELEGRAM_MANAGER_BOT_TOKEN;

  beforeEach(() => {
    process.env.DATABASE_URL = 'postgresql://neondb_owner:secret@ep-restless-wave-b9k0ye9q-pooler.c-7.eu-central-1.aws.neon.tech/neondb';
    process.env.TELEGRAM_DRIVER_BOT_TOKEN = 'mock-driver-bot-token';
    process.env.TELEGRAM_MANAGER_BOT_TOKEN = 'mock-manager-bot-token';
    TelegramNotificationService._clearDeduplicationCacheForTesting();
    vi.spyOn(DatabaseRateLimiter, 'consume').mockResolvedValue({ allowed: true, remaining: 1, resetMs: 600000 } as any);
  });

  afterEach(() => {
    if (originalDatabaseUrl !== undefined) process.env.DATABASE_URL = originalDatabaseUrl;
    else delete process.env.DATABASE_URL;

    if (originalNodeEnv !== undefined) (process.env as any).NODE_ENV = originalNodeEnv;
    else delete (process.env as any).NODE_ENV;

    if (originalChatId !== undefined) process.env.TELEGRAM_MANAGER_GROUP_CHAT_ID = originalChatId;
    else delete process.env.TELEGRAM_MANAGER_GROUP_CHAT_ID;

    if (originalTopicId !== undefined) process.env.TELEGRAM_MANAGER_GROUP_TOPIC_ID = originalTopicId;
    else delete process.env.TELEGRAM_MANAGER_GROUP_TOPIC_ID;

    if (originalGroupChatId !== undefined) process.env.TELEGRAM_GROUP_CHAT_ID = originalGroupChatId;
    else delete process.env.TELEGRAM_GROUP_CHAT_ID;

    if (originalGroupTopicId !== undefined) process.env.TELEGRAM_GROUP_TOPIC_ID = originalGroupTopicId;
    else delete process.env.TELEGRAM_GROUP_TOPIC_ID;

    if (originalEnableGroup !== undefined) process.env.TELEGRAM_ENABLE_GROUP_NOTIFICATIONS = originalEnableGroup;
    else delete process.env.TELEGRAM_ENABLE_GROUP_NOTIFICATIONS;

    if (originalDriverToken !== undefined) process.env.TELEGRAM_DRIVER_BOT_TOKEN = originalDriverToken;
    else delete process.env.TELEGRAM_DRIVER_BOT_TOKEN;

    if (originalManagerToken !== undefined) process.env.TELEGRAM_MANAGER_BOT_TOKEN = originalManagerToken;
    else delete process.env.TELEGRAM_MANAGER_BOT_TOKEN;

    vi.restoreAllMocks();
  });

  describe('Problem 1: Group Routing Priority and Message Thread ID', () => {
    it('routes ORDER_CONFIRMED strictly to topic 8 of -1003893397086 even on Neon DB URL', async () => {
      // Simulate local development environment with Neon staging database
      (process.env as any).NODE_ENV = 'development';
      process.env.DATABASE_URL = 'postgresql://neondb_owner:secret@ep-restless-wave-b9k0ye9q-pooler.c-7.eu-central-1.aws.neon.tech/neondb';
      process.env.TELEGRAM_ENABLE_GROUP_NOTIFICATIONS = 'true';
      process.env.TELEGRAM_MANAGER_GROUP_CHAT_ID = '-1003893397086';
      process.env.TELEGRAM_MANAGER_GROUP_TOPIC_ID = '8';
      process.env.TELEGRAM_MANAGER_BOT_TOKEN = 'mock-manager-bot-token';

      let sentOptions: any = null;
      vi.spyOn(TelegramBotClient.prototype, 'sendMessage').mockImplementation(async (opts) => {
        sentOptions = opts;
        return true;
      });

      const res = await TelegramNotificationService.notifyGroupEvent('ORDER_CONFIRMED', {
        orderId: 'test-order-routing-1',
        orderNumber: 'AB-2026-CONFIRM-1',
        marketplace: 'Wildberries',
        warehouseName: 'Коледино',
        scheduledPickupAt: new Date('2026-11-20T10:00:00Z'),
        totalBoxesCount: 15,
        totalPalletsCount: 2,
        managerComment: 'Срочная отгрузка',
      });

      expect(res.sent).toBe(true);
      expect(sentOptions).not.toBeNull();
      // Target chat must be the working group
      expect(sentOptions.chatId).toBe('-1003893397086');
      // Topic ID must be 8
      expect(sentOptions.messageThreadId).toBe('8');
      expect(sentOptions.text).toContain('Заявка подтверждена: <code>#AB-2026-CONFIRM-1</code>');
      expect(sentOptions.text).toContain('Коледино');
      expect(sentOptions.text).toContain('Wildberries');
    });

    it('falls back to test group -1004425588766 only when TELEGRAM_MANAGER_GROUP_CHAT_ID is unset in staging', async () => {
      delete process.env.TELEGRAM_MANAGER_GROUP_CHAT_ID;
      delete process.env.TELEGRAM_GROUP_CHAT_ID;
      delete process.env.TELEGRAM_MANAGER_GROUP_TOPIC_ID;
      delete process.env.TELEGRAM_GROUP_TOPIC_ID;
      (process.env as any).NODE_ENV = 'development';
      process.env.DATABASE_URL = 'postgresql://neondb_owner:secret@ep-restless-wave-b9k0ye9q-pooler.c-7.eu-central-1.aws.neon.tech/neondb';
      process.env.TELEGRAM_ENABLE_GROUP_NOTIFICATIONS = 'true';
      process.env.TELEGRAM_MANAGER_BOT_TOKEN = 'mock-manager-bot-token';

      let sentOptions: any = null;
      vi.spyOn(TelegramBotClient.prototype, 'sendMessage').mockImplementation(async (opts) => {
        sentOptions = opts;
        return true;
      });

      const res = await TelegramNotificationService.notifyGroupEvent('ORDER_CONFIRMED', {
        orderId: 'test-order-routing-2',
        orderNumber: 'AB-2026-CONFIRM-2',
        marketplace: 'Ozon',
        warehouseName: 'Хоругвино',
        scheduledPickupAt: new Date('2026-11-20T10:00:00Z'),
        totalBoxesCount: 5,
        totalPalletsCount: 0,
      });

      expect(res.sent).toBe(true);
      expect(sentOptions.chatId).toBe('-1004425588766');
      expect(sentOptions.messageThreadId).toBeUndefined();
    });
  });

  describe('Problem 2: Driver Bot Notification Dispatch Chain', () => {
    it('returns a clear warning and logs warn when driver has no linked Telegram account', async () => {
      vi.spyOn(prisma.order, 'findUnique').mockResolvedValue({
        id: 'order-driver-test-1',
        orderNumber: 'AB-2026-DRV-1',
        marketplace: 'Ozon',
        scheduledPickupAt: new Date(),
        totalBoxesCount: 10,
        totalPalletsCount: 0,
        pickupAddress: 'ул. Складская, 5',
        warehouse: { name: 'Хоругвино' },
        client: null,
      } as any);

      vi.spyOn(prisma.driverProfile, 'findUnique').mockResolvedValue({
        id: 'driver-prof-1',
        fullName: 'Алексей Водителев',
        userId: 'user-drv-1',
        user: { telegramAccount: null },
      } as any);

      const res = await NotificationDispatcherService.notifyDriverOrderAssigned(
        'order-driver-test-1',
        'driver-prof-1'
      );

      expect(res.sent).toBe(false);
      expect(res.reason).toBe('NO_LINKED_TELEGRAM');
      expect(res.warning).toContain('не привязан Telegram');
    });

    it('returns a clear warning when driver has not started Driver Bot (chat not found / code 400)', async () => {
      vi.spyOn(prisma.order, 'findUnique').mockResolvedValue({
        id: 'order-driver-test-2',
        orderNumber: 'AB-2026-DRV-2',
        marketplace: 'Wildberries',
        scheduledPickupAt: new Date(),
        totalBoxesCount: 20,
        totalPalletsCount: 1,
        pickupAddress: 'г. Москва, ул. Промышленная, 10',
        pickupCity: 'Москва',
        pickupContactName: 'Иван Менеджер',
        pickupContactPhone: '+79990001122',
        clientComment: 'Ворота №3',
        warehouse: { name: 'Коледино' },
        client: null,
      } as any);

      vi.spyOn(prisma.driverProfile, 'findUnique').mockResolvedValue({
        id: 'driver-prof-2',
        fullName: 'Бахтияр Водитель',
        userId: 'user-drv-2',
        user: {
          telegramAccount: { telegramId: 123456789n },
        },
      } as any);

      // Mock Telegram Bot API returning 400 Bad Request: chat not found
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          ok: false,
          error_code: 400,
          description: 'Bad Request: chat not found',
        }),
      } as any);

      const res = await NotificationDispatcherService.notifyDriverOrderAssigned(
        'order-driver-test-2',
        'driver-prof-2'
      );

      expect(res.sent).toBe(false);
      expect(res.reason).toBe('CHAT_NOT_FOUND_NOT_STARTED');
      expect(res.warning).toContain('ещё не запустил Driver Bot (/start)');
    });

    it('returns a clear warning when driver blocked Driver Bot (code 403)', async () => {
      vi.spyOn(prisma.order, 'findUnique').mockResolvedValue({
        id: 'order-driver-test-3',
        orderNumber: 'AB-2026-DRV-3',
        marketplace: 'Ozon',
        scheduledPickupAt: new Date(),
        totalBoxesCount: 5,
        totalPalletsCount: 0,
        pickupAddress: 'ул. Ленина, 1',
        warehouse: { name: 'Хоругвино' },
        client: null,
      } as any);

      vi.spyOn(prisma.driverProfile, 'findUnique').mockResolvedValue({
        id: 'driver-prof-3',
        fullName: 'Сергей Доставщиков',
        userId: 'user-drv-3',
        user: {
          telegramAccount: { telegramId: 987654321n },
        },
      } as any);

      // Mock Telegram Bot API returning 403 Forbidden: bot was blocked by the user
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({
          ok: false,
          error_code: 403,
          description: 'Forbidden: bot was blocked by the user',
        }),
      } as any);

      const res = await NotificationDispatcherService.notifyDriverOrderAssigned(
        'order-driver-test-3',
        'driver-prof-3'
      );

      expect(res.sent).toBe(false);
      expect(res.reason).toBe('BOT_BLOCKED_BY_DRIVER');
      expect(res.warning).toContain('заблокировал Driver Bot');
    });

    it('sends order card with callback_data cb:accept:<orderId> strictly to the assigned driver', async () => {
      vi.spyOn(prisma.order, 'findUnique').mockResolvedValue({
        id: 'order-driver-test-4',
        orderNumber: 'AB-2026-DRV-4',
        marketplace: 'Wildberries',
        scheduledPickupAt: new Date('2026-11-25T08:00:00Z'),
        totalBoxesCount: 30,
        totalPalletsCount: 3,
        pickupAddress: 'г. Москва, шоссе Энтузиастов, 22',
        pickupCity: 'Москва',
        pickupContactName: 'Олег Отгрузчик',
        pickupContactPhone: '+79998887766',
        clientComment: 'Хрупкий груз',
        warehouse: { name: 'Электросталь' },
        client: null,
      } as any);

      vi.spyOn(prisma.driverProfile, 'findUnique').mockResolvedValue({
        id: 'driver-prof-4',
        fullName: 'Тимур Водитель',
        userId: 'user-drv-4',
        user: {
          telegramAccount: { telegramId: 555666777n },
        },
      } as any);

      let capturedBody: any = null;
      vi.spyOn(global, 'fetch').mockImplementation(async (url, init: any) => {
        if (init?.body) {
          capturedBody = JSON.parse(init.body);
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            result: { message_id: 12345 },
          }),
        } as any;
      });

      const res = await NotificationDispatcherService.notifyDriverOrderAssigned(
        'order-driver-test-4',
        'driver-prof-4'
      );

      expect(res.sent).toBe(true);
      expect(capturedBody).not.toBeNull();
      // Target chat ID must be the driver's telegram ID as string
      expect(capturedBody.chat_id).toBe('555666777');
      // Card content checks
      expect(capturedBody.text).toContain('AB-2026-DRV-4');
      expect(capturedBody.text).toContain('Электросталь');
      expect(capturedBody.text).toContain('Wildberries');
      expect(capturedBody.text).toContain('3 палл. (30 кор.)');
      expect(capturedBody.text).toContain('Олег Отгрузчик');
      expect(capturedBody.text).toContain('+79998887766');
      expect(capturedBody.text).toContain('Хрупкий груз');
      // Accept button check
      expect(capturedBody.reply_markup.inline_keyboard[0][0].callback_data).toBe(
        'cb:accept:order-driver-test-4'
      );
      expect(capturedBody.reply_markup.inline_keyboard[0][0].text).toBe('✅ Принять заявку');
    });
  });

  describe('Problem 3: Manager Approval Call Chain — confirmation -> save CONFIRMED -> Google Sheets -> Telegram group', () => {
    it('executes call chain in strict order: DB status save -> Google Sheets sync -> Telegram group dispatch', async () => {
      const callSequence: string[] = [];

      const mockManager = {
        id: 'user-mgr-sequence',
        email: 'manager@alibros.com',
        role: UserRole.MANAGER,
        isActive: true,
        managerProfile: { id: 'prof-seq-1', fullName: 'Данияр Менеджер' },
      };

      vi.spyOn(ManagerPairingService, 'getManagerByTelegramId').mockResolvedValue(mockManager as any);

      const mockOrder = {
        id: 'order-chain-test-1',
        orderNumber: 'AB-2026-CHAIN-1',
        status: OrderStatus.CREATED,
        marketplace: 'Wildberries',
        warehouse: { name: 'Коледино' },
        scheduledPickupAt: new Date('2026-11-20'),
        totalBoxesCount: 15,
        totalPalletsCount: 1,
        client: null,
      };

      vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
        const txMock = {
          order: {
            findUnique: vi.fn().mockResolvedValue(mockOrder),
            updateMany: vi.fn().mockImplementation(async () => {
              callSequence.push('DB_STATUS_UPDATE_CONFIRMED');
              return { count: 1 };
            }),
          },
          orderStatusHistory: {
            create: vi.fn().mockImplementation(async () => {
              callSequence.push('DB_HISTORY_CREATE');
              return { id: 'hist-seq-1' };
            }),
          },
        };
        return callback(txMock);
      });

      const sheetsSyncSpy = vi.spyOn(GoogleSheetsSyncService, 'syncOrder').mockImplementation(async () => {
        callSequence.push('GOOGLE_SHEETS_SYNC');
        return { success: true, exported: true };
      });

      const notifyGroupSpy = vi.spyOn(TelegramNotificationService, 'notifyGroupEvent').mockImplementation(async () => {
        callSequence.push('TELEGRAM_GROUP_NOTIFY');
        return { sent: true };
      });

      const managerBot = getManagerTelegramBotClient();
      vi.spyOn(managerBot, 'answerCallbackQuery').mockResolvedValue(true);
      vi.spyOn(managerBot, 'editMessageText').mockResolvedValue(true);

      await TelegramBotService.handleManagerCallbackQuery({
        id: 'cb-chain-1',
        from: { id: 999111, first_name: 'Данияр' },
        message: {
          message_id: 101,
          chat: { id: 999111 },
          text: '📦 Новая заявка на согласование: #AB-2026-CHAIN-1',
        },
        data: 'mg:accept:order-chain-test-1',
      });

      // Strict execution sequence verification
      expect(callSequence).toEqual([
        'DB_STATUS_UPDATE_CONFIRMED',
        'DB_HISTORY_CREATE',
        'GOOGLE_SHEETS_SYNC',
        'TELEGRAM_GROUP_NOTIFY',
      ]);

      expect(sheetsSyncSpy).toHaveBeenCalledWith('order-chain-test-1');
      expect(notifyGroupSpy).toHaveBeenCalledWith(
        'ORDER_CONFIRMED',
        expect.objectContaining({
          orderId: 'order-chain-test-1',
          orderNumber: 'AB-2026-CHAIN-1',
        })
      );
    });

    it('ensures Google Sheets error does NOT rollback confirmation or prevent Telegram group dispatch', async () => {
      const mockManager = {
        id: 'user-mgr-err',
        email: 'mgr-err@alibros.com',
        role: UserRole.MANAGER,
        isActive: true,
        managerProfile: { id: 'prof-err-1', fullName: 'Менеджер Тест' },
      };

      vi.spyOn(ManagerPairingService, 'getManagerByTelegramId').mockResolvedValue(mockManager as any);

      const mockOrder = {
        id: 'order-sheets-err-1',
        orderNumber: 'AB-2026-ERR-1',
        status: OrderStatus.CREATED,
        marketplace: 'Ozon',
        warehouse: { name: 'Хоругвино' },
        scheduledPickupAt: new Date(),
        totalBoxesCount: 5,
        totalPalletsCount: 0,
        client: null,
      };

      vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
        const txMock = {
          order: {
            findUnique: vi.fn().mockResolvedValue(mockOrder),
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          },
          orderStatusHistory: {
            create: vi.fn().mockResolvedValue({ id: 'hist-err-1' }),
          },
        };
        return callback(txMock);
      });

      // Google Sheets sync fails
      vi.spyOn(GoogleSheetsSyncService, 'syncOrder').mockRejectedValueOnce(
        new Error('Google Sheets API Network Timeout')
      );

      // Telegram group dispatch still succeeds
      const notifyGroupSpy = vi.spyOn(TelegramNotificationService, 'notifyGroupEvent').mockResolvedValue({ sent: true });

      const managerBot = getManagerTelegramBotClient();
      const answerSpy = vi.spyOn(managerBot, 'answerCallbackQuery').mockResolvedValue(true);
      vi.spyOn(managerBot, 'editMessageText').mockResolvedValue(true);

      await TelegramBotService.handleManagerCallbackQuery({
        id: 'cb-err-1',
        from: { id: 999222, first_name: 'Менеджер' },
        message: {
          message_id: 102,
          chat: { id: 999222 },
          text: '📦 Заявка на согласование: #AB-2026-ERR-1',
        },
        data: 'mg:accept:order-sheets-err-1',
      });

      // Group notification MUST still be dispatched
      expect(notifyGroupSpy).toHaveBeenCalledWith(
        'ORDER_CONFIRMED',
        expect.objectContaining({ orderId: 'order-sheets-err-1' })
      );

      // Callback query answered with success (DB was committed)
      expect(answerSpy).toHaveBeenCalledWith('cb-err-1', expect.stringContaining('подтверждена'));
    });
  });
});
