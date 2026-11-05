import { describe, it, expect } from 'vitest';
import { SHEET_HEADERS, GoogleSheetsClient } from '@/integrations/google-sheets/client';
import { OrdersService } from '@/modules/orders/orders.service';
import { GoogleSheetsSyncService } from '@/modules/integrations/google-sheets-sync.service';
import { AuthenticatedUser } from '@/types/rbac';

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
      const result = await GoogleSheetsSyncService.runFullSync(accountantUser);
      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
      expect(result.success).toBe(false);
      expect(result.isConfigured).toBe(false);
      expect(result.message).toContain('не настроена');
    });
  });
});
