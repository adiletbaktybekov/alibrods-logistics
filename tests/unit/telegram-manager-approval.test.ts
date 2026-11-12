import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TelegramBotClient, getManagerTelegramBotClient, getClientTelegramBotClient, resetTelegramBotClient } from '@/integrations/telegram/client';
import { TelegramNotificationService } from '@/modules/telegram/notification.service';
import { NotificationDispatcherService } from '@/modules/notifications/dispatcher.service';
import { TelegramBotService } from '@/modules/telegram/bot.service';
import { ManagerPairingService } from '@/modules/telegram/pairing.service';
import { prisma } from '@/database/prisma';
import { OrderStatus, UserRole } from '@prisma/client';
import { NotificationsService } from '@/modules/notifications/notifications.service';

vi.mock('@/database/prisma', () => ({
  prisma: {
    telegramAccount: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    order: {
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    orderStatusHistory: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('@/modules/telegram/pairing.service', () => ({
  ManagerPairingService: {
    getManagerByTelegramId: vi.fn(),
  },
}));

vi.mock('@/modules/notifications/notifications.service', () => ({
  NotificationsService: {
    queue: vi.fn().mockResolvedValue({ id: 'mock-notif-id' }),
  },
}));

vi.mock('@/modules/audit/audit.service', () => ({
  AuditService: {
    log: vi.fn().mockResolvedValue(undefined),
  },
}));

describe('Two-Stage Telegram Order Approval Workflow', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    resetTelegramBotClient();
    TelegramNotificationService._clearDeduplicationCacheForTesting();
    process.env = {
      ...originalEnv,
      DATABASE_URL: 'postgresql://mock:mock@localhost:5432/mock',
      TELEGRAM_MANAGER_BOT_TOKEN: 'mock-manager-token',
      TELEGRAM_CLIENT_BOT_TOKEN: 'mock-client-token',
      TELEGRAM_MANAGER_GROUP_CHAT_ID: '-1004425588766',
      TELEGRAM_ENABLE_GROUP_NOTIFICATIONS: 'true',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    resetTelegramBotClient();
  });

  describe('1. TelegramBotClient.editMessageText', () => {
    it('should send correct POST request to /editMessageText', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, result: { message_id: 42 } }),
      } as Response);

      const client = new TelegramBotClient('mock-token');
      const success = await client.editMessageText({
        chatId: 123456,
        messageId: 42,
        text: 'Updated message text',
        parseMode: 'HTML',
      });

      expect(success).toBe(true);
      expect(fetchSpy).toHaveBeenCalledWith('https://api.telegram.org/botmock-token/editMessageText', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: 123456,
          message_id: 42,
          text: 'Updated message text',
          parse_mode: 'HTML',
        }),
      });
    });

    it('should return false if botToken is missing', async () => {
      const client = new TelegramBotClient('');
      const success = await client.editMessageText({
        chatId: 123456,
        messageId: 42,
        text: 'Updated text',
      });
      expect(success).toBe(false);
    });
  });

  describe('2. Stage 1: notifyOrderCreated and notifyManagersOrderPendingApproval', () => {
    it('should send direct message with inline keyboard to all linked managers and NOT to the group', async () => {
      const mockOrder = {
        id: 'ord-123',
        orderNumber: 'ABL-2026-TEST01',
        marketplace: 'WILDBERRIES',
        warehouse: { name: 'Коледино' },
        scheduledPickupAt: new Date('2026-11-15T10:00:00Z'),
        totalBoxesCount: 15,
        totalPalletsCount: 1,
        clientComment: 'Осторожно, хрупкое',
        client: {
          companyName: 'ИП Тестов',
          contactPerson: 'Иван',
          contactPhone: '+79991234567',
        },
      };

      vi.mocked(prisma.order.findUnique).mockResolvedValueOnce(mockOrder as any);

      const mockManagers = [
        {
          telegramId: BigInt(777111),
          user: {
            id: 'mgr-1',
            role: UserRole.MANAGER,
            isActive: true,
            managerProfile: { fullName: 'Менеджер 1' },
          },
        },
        {
          telegramId: BigInt(777222),
          user: {
            id: 'mgr-2',
            role: UserRole.ADMIN,
            isActive: true,
            managerProfile: { fullName: 'Админ 1' },
          },
        },
      ];

      vi.mocked(prisma.telegramAccount.findMany).mockResolvedValueOnce(mockManagers as any);

      const notifyGroupSpy = vi.spyOn(TelegramNotificationService, 'notifyGroupEvent');
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, result: { message_id: 101 } }),
      } as Response);

      const sent = await NotificationDispatcherService.notifyOrderCreated('ord-123');

      expect(sent).toBe(true);
      // STRICT REQUIREMENT: Order created must NOT trigger group notification
      expect(notifyGroupSpy).not.toHaveBeenCalled();

      // Must send DMs to both linked managers
      expect(fetchSpy).toHaveBeenCalledTimes(2);

      const firstCallBody = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
      expect(firstCallBody.chat_id).toBe('777111');
      expect(firstCallBody.text).toContain('Новая заявка на согласование');
      expect(firstCallBody.text).toContain('Номер заявки: <code>#ABL-2026-TEST01</code>');
      expect(firstCallBody.text).toContain('Коледино');
      expect(firstCallBody.text).toContain('Количество коробок: <b>15 шт.</b>');
      expect(firstCallBody.text).toContain('Количество паллет: <b>1 шт.</b>');
      expect(firstCallBody.text).toContain('Текущий статус: <b>CREATED');
      expect(firstCallBody.reply_markup.inline_keyboard[0][0].text).toContain('Подтвердить');
      expect(firstCallBody.reply_markup.inline_keyboard[0][0].callback_data).toBe('mg:accept:ord-123');
      expect(firstCallBody.reply_markup.inline_keyboard[0][1].text).toContain('Отклонить');
      expect(firstCallBody.reply_markup.inline_keyboard[0][1].callback_data).toBe('mg:reject:ord-123');
    });

    it('should log warning and gracefully return if no managers are linked', async () => {
      vi.mocked(prisma.order.findUnique).mockResolvedValueOnce({
        id: 'ord-no-mgr',
        orderNumber: 'ABL-2026-NOMGR',
        marketplace: 'OZON',
        warehouse: { name: 'Хоругвино' },
        totalBoxesCount: 5,
        totalPalletsCount: 0,
        client: null,
      } as any);

      vi.mocked(prisma.telegramAccount.findMany).mockResolvedValueOnce([]);

      const notifyGroupSpy = vi.spyOn(TelegramNotificationService, 'notifyGroupEvent');
      const sent = await NotificationDispatcherService.notifyOrderCreated('ord-no-mgr');

      expect(sent).toBe(false);
      expect(notifyGroupSpy).not.toHaveBeenCalled();
    });
  });

  describe('3. Stage 2: Manager Callback Queries', () => {
    it('should reject callback query from unauthorized Telegram ID', async () => {
      vi.mocked(ManagerPairingService.getManagerByTelegramId).mockResolvedValueOnce(null);

      const managerBot = getManagerTelegramBotClient();
      const answerSpy = vi.spyOn(managerBot, 'answerCallbackQuery').mockResolvedValue(true);

      await TelegramBotService.handleManagerCallbackQuery({
        id: 'cb-unauth-1',
        from: { id: 999999, first_name: 'Hacker' },
        data: 'mg:accept:ord-123',
      });

      expect(answerSpy).toHaveBeenCalledWith(
        'cb-unauth-1',
        expect.stringContaining('Доступ запрещён'),
        true
      );
    });

    it('should approve order on mg:accept: transitions CREATED -> CONFIRMED, updates DM, notifies group and client', async () => {
      const mockManager = {
        id: 'user-mgr-1',
        email: 'manager@alibros.com',
        role: UserRole.MANAGER,
        isActive: true,
        managerProfile: { id: 'prof-1', fullName: 'Айбек Менеджер' },
      };

      vi.mocked(ManagerPairingService.getManagerByTelegramId).mockResolvedValueOnce(mockManager as any);

      const mockOrder = {
        id: 'ord-accept-1',
        orderNumber: 'ABL-2026-ACC01',
        status: OrderStatus.CREATED,
        marketplace: 'WILDBERRIES',
        warehouse: { name: 'Коледино' },
        scheduledPickupAt: new Date('2026-11-20'),
        totalBoxesCount: 20,
        totalPalletsCount: 2,
        client: {
          userId: 'client-user-1',
          user: {
            telegramAccount: {
              telegramId: BigInt(888111),
            },
          },
        },
      };

      // Mock transaction execution
      vi.mocked(prisma.$transaction).mockImplementationOnce(async (callback: any) => {
        const txMock = {
          order: {
            findUnique: vi.fn().mockResolvedValue(mockOrder),
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          },
          orderStatusHistory: {
            create: vi.fn().mockResolvedValue({ id: 'hist-1' }),
          },
        };
        return callback(txMock);
      });

      const notifyGroupSpy = vi.spyOn(TelegramNotificationService, 'notifyGroupEvent').mockResolvedValue({ sent: true });
      const managerBot = getManagerTelegramBotClient();
      const answerSpy = vi.spyOn(managerBot, 'answerCallbackQuery').mockResolvedValue(true);
      const editSpy = vi.spyOn(managerBot, 'editMessageText').mockResolvedValue(true);

      const clientBot = getClientTelegramBotClient();
      const clientSendSpy = vi.spyOn(clientBot, 'sendMessageWithRetry').mockResolvedValue(true);

      await TelegramBotService.handleManagerCallbackQuery({
        id: 'cb-acc-1',
        from: { id: 777111, first_name: 'Айбек' },
        message: {
          message_id: 55,
          chat: { id: 777111 },
          text: '📦 Новая заявка на согласование: #ABL-2026-ACC01\nПожалуйста, подтвердите или отклоните заявку:',
        },
        data: 'mg:accept:ord-accept-1',
      });

      // Answer callback with success
      expect(answerSpy).toHaveBeenCalledWith('cb-acc-1', expect.stringContaining('подтверждена'));

      // Edit message in manager DM
      expect(editSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          chatId: 777111,
          messageId: 55,
          text: expect.stringContaining('Заявка подтверждена'),
        })
      );

      // Group notification MUST be dispatched on confirmation
      expect(notifyGroupSpy).toHaveBeenCalledWith('ORDER_CONFIRMED', expect.objectContaining({
        orderId: 'ord-accept-1',
        orderNumber: 'ABL-2026-ACC01',
      }));

      // Client notification MUST be dispatched to Client Bot
      expect(clientSendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          chatId: '888111',
          text: expect.stringContaining('Ваша заявка подтверждена'),
        })
      );
    });

    it('should reject order on mg:reject: transitions CREATED -> REJECTED_BY_MANAGER, notifies client, NEVER reaches group', async () => {
      const mockManager = {
        id: 'user-mgr-2',
        email: 'manager2@alibros.com',
        role: UserRole.MANAGER,
        isActive: true,
        managerProfile: { id: 'prof-2', fullName: 'Данияр Менеджер' },
      };

      vi.mocked(ManagerPairingService.getManagerByTelegramId).mockResolvedValueOnce(mockManager as any);

      const mockOrder = {
        id: 'ord-rej-1',
        orderNumber: 'ABL-2026-REJ01',
        status: OrderStatus.CREATED,
        marketplace: 'OZON',
        warehouse: { name: 'Хоругвино' },
        scheduledPickupAt: new Date('2026-11-20'),
        totalBoxesCount: 5,
        totalPalletsCount: 0,
        client: {
          userId: 'client-user-2',
          user: {
            telegramAccount: {
              telegramId: BigInt(888222),
            },
          },
        },
      };

      vi.mocked(prisma.$transaction).mockImplementationOnce(async (callback: any) => {
        const txMock = {
          order: {
            findUnique: vi.fn().mockResolvedValue(mockOrder),
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          },
          orderStatusHistory: {
            create: vi.fn().mockResolvedValue({ id: 'hist-2' }),
          },
        };
        return callback(txMock);
      });

      const notifyGroupSpy = vi.spyOn(TelegramNotificationService, 'notifyGroupEvent');
      const managerBot = getManagerTelegramBotClient();
      const answerSpy = vi.spyOn(managerBot, 'answerCallbackQuery').mockResolvedValue(true);
      const editSpy = vi.spyOn(managerBot, 'editMessageText').mockResolvedValue(true);

      const clientBot = getClientTelegramBotClient();
      const clientSendSpy = vi.spyOn(clientBot, 'sendMessageWithRetry').mockResolvedValue(true);

      await TelegramBotService.handleManagerCallbackQuery({
        id: 'cb-rej-1',
        from: { id: 777222, first_name: 'Данияр' },
        message: {
          message_id: 66,
          chat: { id: 777222 },
          text: '📦 Новая заявка на согласование: #ABL-2026-REJ01\nПожалуйста, подтвердите или отклоните заявку:',
        },
        data: 'mg:reject:ord-rej-1',
      });

      // Answer callback
      expect(answerSpy).toHaveBeenCalledWith('cb-rej-1', expect.stringContaining('отклонена'));

      // Edit message in manager DM
      expect(editSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          chatId: 777222,
          messageId: 66,
          text: expect.stringContaining('Заявка отклонена'),
        })
      );

      // STRICT REQUIREMENT: Rejected order must NEVER be sent to the group
      expect(notifyGroupSpy).not.toHaveBeenCalled();

      // Client notification MUST be dispatched to Client Bot
      expect(clientSendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          chatId: '888222',
          text: expect.stringContaining('Ваша заявка отклонена'),
        })
      );
    });

    it('should safely handle double-click / concurrent clicks when order is already processed', async () => {
      const mockManager = {
        id: 'user-mgr-1',
        role: UserRole.MANAGER,
        isActive: true,
        managerProfile: { fullName: 'Айбек Менеджер' },
      };

      vi.mocked(ManagerPairingService.getManagerByTelegramId).mockResolvedValueOnce(mockManager as any);

      // Order is already CONFIRMED
      const mockAlreadyConfirmedOrder = {
        id: 'ord-dup-1',
        orderNumber: 'ABL-2026-DUP01',
        status: OrderStatus.CONFIRMED,
        warehouse: { name: 'Коледино' },
      };

      vi.mocked(prisma.$transaction).mockImplementationOnce(async (callback: any) => {
        const txMock = {
          order: {
            findUnique: vi.fn().mockResolvedValue(mockAlreadyConfirmedOrder),
          },
        };
        return callback(txMock);
      });

      const notifyGroupSpy = vi.spyOn(TelegramNotificationService, 'notifyGroupEvent');
      const managerBot = getManagerTelegramBotClient();
      const answerSpy = vi.spyOn(managerBot, 'answerCallbackQuery').mockResolvedValue(true);
      const editSpy = vi.spyOn(managerBot, 'editMessageText').mockResolvedValue(true);

      await TelegramBotService.handleManagerCallbackQuery({
        id: 'cb-dup-1',
        from: { id: 777111, first_name: 'Айбек' },
        message: {
          message_id: 77,
          chat: { id: 777111 },
          text: '📦 Новая заявка на согласование: #ABL-2026-DUP01',
        },
        data: 'mg:accept:ord-dup-1',
      });

      // Must notify manager that order was already processed
      expect(answerSpy).toHaveBeenCalledWith(
        'cb-dup-1',
        expect.stringContaining('уже была обработана ранее'),
        true
      );

      // Message should be updated to remove buttons and show processed state
      expect(editSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          chatId: 777111,
          messageId: 77,
          text: expect.stringContaining('уже обработана ранее'),
        })
      );

      // No redundant group notifications
      expect(notifyGroupSpy).not.toHaveBeenCalled();
    });
  });
});
