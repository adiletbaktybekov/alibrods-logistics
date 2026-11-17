import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TelegramNotificationService } from '@/modules/telegram/notification.service';
import { prisma } from '@/database/prisma';
import { getManagerTelegramBotClient } from '@/integrations/telegram/client';

vi.mock('@/database/prisma', () => ({
  prisma: {
    telegramAccount: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock('@/integrations/telegram/client', () => ({
  getManagerTelegramBotClient: vi.fn(() => ({
    sendMessage: vi.fn().mockResolvedValue(true),
  })),
}));

describe('Telegram Client Warehouse Address Integration', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = {
      ...originalEnv,
      DATABASE_URL: 'postgresql://mock:mock@localhost:5432/mock',
    };
    TelegramNotificationService._clearDeduplicationCacheForTesting();
  });

  it('includes client warehouse address in ORDER_CONFIRMED group message', () => {
    const payload = {
      orderId: 'order-1',
      orderNumber: 'AB-261117-001',
      warehouseName: 'Коледино WB',
      clientCompanyName: 'ООО Селлер Плюс',
      clientContactPerson: 'Алексей',
      clientPhone: '+996555123456',
      clientWarehouseAddress: 'г. Бишкек, ул. Льва Толстого, 19/2',
      totalBoxesCount: 15,
      totalPalletsCount: 2,
    };

    const msg = TelegramNotificationService.buildGroupMessage('ORDER_CONFIRMED', payload);
    expect(msg).toContain('Адрес склада: <b>г. Бишкек, ул. Льва Толстого, 19/2</b>');
  });

  it('outputs "Адрес склада не указан" fallback when warehouse address is empty or null', () => {
    const payload = {
      orderId: 'order-2',
      orderNumber: 'AB-261117-002',
      warehouseName: 'Электросталь WB',
      clientCompanyName: 'ИП Смирнов',
      clientContactPerson: 'Иван',
      clientWarehouseAddress: null,
      totalBoxesCount: 10,
      totalPalletsCount: 0,
    };

    const msg = TelegramNotificationService.buildGroupMessage('ORDER_CONFIRMED', payload);
    expect(msg).toContain('Адрес склада: <b>Адрес склада не указан</b>');
  });

  it('includes client warehouse address in formatClientOrderCreatedMessage for Client Bot', () => {
    const orderWithAddress = {
      orderNumber: 'AB-261117-003',
      warehouseName: 'Подольск WB',
      scheduledPickupAt: '2026-11-20',
      totalPalletsCount: 1,
      totalBoxesCount: 5,
      clientWarehouseAddress: 'г. Ош, ул. Ленина, 45',
    };

    const clientMsg = TelegramNotificationService.formatClientOrderCreatedMessage(orderWithAddress);
    expect(clientMsg).toContain('Адрес склада клиента: <b>г. Ош, ул. Ленина, 45</b>');

    const orderWithoutAddress = {
      orderNumber: 'AB-261117-004',
      warehouseName: 'Подольск WB',
      scheduledPickupAt: '2026-11-20',
      totalPalletsCount: 0,
      totalBoxesCount: 8,
      clientWarehouseAddress: null,
    };

    const clientMsgFallback = TelegramNotificationService.formatClientOrderCreatedMessage(orderWithoutAddress);
    expect(clientMsgFallback).toContain('Адрес склада клиента: <b>Адрес склада не указан</b>');
  });

  it('includes client warehouse address in Manager Approval direct card', async () => {
    const mockManagerTg = {
      telegramId: BigInt(123456789),
      user: {
        id: 'u-mgr-1',
        role: 'MANAGER',
        isActive: true,
      },
    };
    (prisma.telegramAccount.findMany as any).mockResolvedValue([mockManagerTg]);

    const mockSend = vi.fn().mockResolvedValue(true);
    (getManagerTelegramBotClient as any).mockReturnValue({
      sendMessage: mockSend,
    });

    await TelegramNotificationService.notifyManagersOrderPendingApproval({
      orderId: 'order-mgr-1',
      orderNumber: 'AB-261117-005',
      marketplace: 'Wildberries',
      warehouseName: 'Коледино WB',
      totalBoxesCount: 12,
      totalPalletsCount: 1,
      clientCompanyName: 'ОсОО Бишкек Карго',
      clientWarehouseAddress: 'г. Бишкек, промзона Чолпон-Ата 4',
    });

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: '123456789',
        text: expect.stringContaining('Адрес склада: <b>г. Бишкек, промзона Чолпон-Ата 4</b>'),
      })
    );
  });
});
