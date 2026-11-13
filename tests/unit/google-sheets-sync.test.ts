import { describe, it, expect, vi } from 'vitest';
import { SHEET_HEADERS, GoogleSheetsClient, resetGoogleSheetsClient } from '@/integrations/google-sheets/client';
import { OrdersService } from '@/modules/orders/orders.service';
import { GoogleSheetsSyncService } from '@/modules/integrations/google-sheets-sync.service';
import { AuthenticatedUser } from '@/types/rbac';
import { prisma } from '@/database/prisma';
import { OrderStatus } from '@prisma/client';

describe('Google Sheets Integration & Accounting Sync', () => {
  const accountantUser: AuthenticatedUser = {
    id: 'user-accountant-1',
    role: 'ACCOUNTANT',
  };

  const clientUser: AuthenticatedUser = {
    id: 'user-client-1',
    role: 'CLIENT',
  };

  const driverUser: AuthenticatedUser = {
    id: 'user-driver-1',
    role: 'DRIVER',
  };

  describe('14-Column Accounting Schema Specification', () => {
    it('should have exactly 14 columns defined in SHEET_HEADERS', () => {
      expect(SHEET_HEADERS).toHaveLength(14);
    });

    it('should match the exact accounting column order', () => {
      expect(SHEET_HEADERS[0]).toBe('ID заявки');
      expect(SHEET_HEADERS[1]).toBe('Номер заявки');
      expect(SHEET_HEADERS[2]).toBe('Дата создания');
      expect(SHEET_HEADERS[3]).toBe('Компания клиента');
      expect(SHEET_HEADERS[4]).toBe('Контактное лицо');
      expect(SHEET_HEADERS[5]).toBe('Телефон');
      expect(SHEET_HEADERS[6]).toBe('Склад назначения');
      expect(SHEET_HEADERS[7]).toBe('Дата доставки');
      expect(SHEET_HEADERS[8]).toBe('Количество коробок');
      expect(SHEET_HEADERS[9]).toBe('Количество паллет');
      expect(SHEET_HEADERS[10]).toBe('Текущий статус');
      expect(SHEET_HEADERS[11]).toBe('Стоимость доставки');
      expect(SHEET_HEADERS[12]).toBe('Валюта');
      expect(SHEET_HEADERS[13]).toBe('Дата последнего обновления');
    });
  });

  describe('GoogleSheetsClient Configuration', () => {
    it('should detect when credentials are missing or configured', () => {
      const client = new GoogleSheetsClient();
      const isConfigured = client.isConfigured();
      expect(typeof isConfigured).toBe('boolean');
    });

    it('should format config summary safely without exposing secret keys', () => {
      const client = new GoogleSheetsClient();
      const summary = client.getConfigSummary();
      expect(summary).toBeDefined();
      expect(summary.sheetName).toBeDefined();
      expect(typeof summary.isConfigured).toBe('boolean');
      // Must never contain private key strings
      expect(JSON.stringify(summary)).not.toContain('BEGIN PRIVATE KEY');
    });
  });

  describe('Delivery Cost RBAC Security', () => {
    it('should forbid CLIENT role from updating delivery cost', async () => {
      await expect(
        OrdersService.updateDeliveryCost(clientUser, {
          orderId: 'fake-order-id',
          deliveryCostAmount: 15000,
          currency: 'RUB',
        })
      ).rejects.toThrow('Доступ к установке стоимости доставки запрещён для данной роли');
    });

    it('should forbid DRIVER role from updating delivery cost', async () => {
      await expect(
        OrdersService.updateDeliveryCost(driverUser, {
          orderId: 'fake-order-id',
          deliveryCostAmount: 15000,
          currency: 'RUB',
        })
      ).rejects.toThrow('Доступ к установке стоимости доставки запрещён для данной роли');
    });

    it('should validate cost amount range (positive, <= 10,000,000)', async () => {
      await expect(
        OrdersService.updateDeliveryCost(accountantUser, {
          orderId: 'fake-order-id',
          deliveryCostAmount: -500,
          currency: 'RUB',
        })
      ).rejects.toThrow('Сумма должна быть числом от 0.01 до 10 000 000');

      await expect(
        OrdersService.updateDeliveryCost(accountantUser, {
          orderId: 'fake-order-id',
          deliveryCostAmount: 0,
          currency: 'RUB',
        })
      ).rejects.toThrow('Сумма должна быть числом от 0.01 до 10 000 000');

      await expect(
        OrdersService.updateDeliveryCost(accountantUser, {
          orderId: 'fake-order-id',
          deliveryCostAmount: 15000000,
          currency: 'RUB',
        })
      ).rejects.toThrow('Сумма должна быть числом от 0.01 до 10 000 000');
    });
  });

  describe('GoogleSheetsSyncService Safe Operation', () => {
    it('should report status and configuration state correctly', async () => {
      const status = await GoogleSheetsSyncService.getStatus();
      expect(status).toBeDefined();
      expect(status.spreadsheetId).toBeDefined();
      expect(typeof status.isConfigured).toBe('boolean');
    });

    it('should return safe status when running sync without configured credentials', async () => {
      const origEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
      try {
        delete process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
        resetGoogleSheetsClient();
        const result = await GoogleSheetsSyncService.runFullSync(accountantUser);
        expect(result).toBeDefined();
        expect(typeof result.success).toBe('boolean');
        expect(result.success).toBe(false);
        expect(result.isConfigured).toBe(false);
        expect(result.message).toContain('не настроена');
      } finally {
        if (origEmail !== undefined) {
          process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = origEmail;
        }
        resetGoogleSheetsClient();
      }
    });

    it('should skip CREATED orders from syncing to Google Sheets', async () => {
      process.env.DATABASE_URL = 'postgresql://mock:mock@localhost:5432/mock';
      vi.spyOn(GoogleSheetsClient.prototype, 'isConfigured').mockReturnValue(true);

      vi.spyOn(prisma.order, 'findUnique').mockResolvedValueOnce({
        id: 'order-created-1',
        orderNumber: 'AB-2026-CREATED',
        status: OrderStatus.CREATED,
        createdAt: new Date(),
        updatedAt: new Date(),
        totalBoxesCount: 5,
        totalPalletsCount: 0,
        client: { companyName: 'Тест Клиент' },
        warehouse: { name: 'Коледино' },
      } as any);

      const res = await GoogleSheetsSyncService.syncOrder('order-created-1');
      expect(res.success).toBe(false);
      expect(res.skippedReason).toBe('ORDER_NOT_CONFIRMED');
    });

    it('should export CONFIRMED order to Google Sheets successfully', async () => {
      process.env.DATABASE_URL = 'postgresql://mock:mock@localhost:5432/mock';
      vi.spyOn(GoogleSheetsClient.prototype, 'isConfigured').mockReturnValue(true);

      vi.spyOn(prisma.order, 'findUnique').mockResolvedValueOnce({
        id: 'order-confirmed-1',
        orderNumber: 'AB-2026-CONFIRMED',
        status: OrderStatus.CONFIRMED,
        createdAt: new Date(),
        updatedAt: new Date(),
        scheduledPickupAt: new Date(),
        totalBoxesCount: 10,
        totalPalletsCount: 1,
        deliveryCostAmount: null,
        currency: 'RUB',
        client: { companyName: 'ООО Селлер', contactPerson: 'Иван', contactPhone: '+79991112233' },
        warehouse: { name: 'Хоругвино' },
      } as any);

      const exportOrdersSpy = vi.spyOn(GoogleSheetsClient.prototype, 'exportOrders').mockResolvedValueOnce({
        exported: 1,
        updated: 0,
      });

      const res = await GoogleSheetsSyncService.syncOrder('order-confirmed-1');
      expect(res.success).toBe(true);
      expect(res.exported).toBe(true);
      expect(exportOrdersSpy).toHaveBeenCalledTimes(1);

      const syncPayload = exportOrdersSpy.mock.calls[0][0][0];
      expect(syncPayload.orderId).toBe('order-confirmed-1');
      expect(syncPayload.orderNumber).toBe('AB-2026-CONFIRMED');
      expect(syncPayload.warehouseName).toBe('Хоругвино');
      expect(syncPayload.status).toBe('Подтверждена');
    });

    it('should handle Google Sheets export failure gracefully without throwing', async () => {
      process.env.DATABASE_URL = 'postgresql://mock:mock@localhost:5432/mock';
      vi.spyOn(GoogleSheetsClient.prototype, 'isConfigured').mockReturnValue(true);

      vi.spyOn(prisma.order, 'findUnique').mockResolvedValueOnce({
        id: 'order-confirmed-err',
        orderNumber: 'AB-2026-ERR',
        status: OrderStatus.CONFIRMED,
        createdAt: new Date(),
        updatedAt: new Date(),
        totalBoxesCount: 2,
        totalPalletsCount: 0,
        client: { companyName: 'Тест' },
        warehouse: { name: 'Коледино' },
      } as any);

      vi.spyOn(GoogleSheetsClient.prototype, 'exportOrders').mockRejectedValueOnce(
        new Error('Google API quota exceeded')
      );

      const res = await GoogleSheetsSyncService.syncOrder('order-confirmed-err');
      expect(res.success).toBe(false);
      expect(res.error).toBe('Google API quota exceeded');
    });
  });
});
