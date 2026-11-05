import { prisma } from '@/database/prisma';
import { getGoogleSheetsClient, GoogleSheetsSyncRecord } from '@/integrations/google-sheets/client';
import { OrdersService } from '@/modules/orders/orders.service';
import { logger } from '@/lib/logger';
import { AuthenticatedUser } from '@/types/rbac';
import { OrderStatus, UserRole } from '@prisma/client';
import { STATUS_LABELS } from '@/components/ui/status-badge';

export interface FullSyncResult {
  success: boolean;
  isConfigured: boolean;
  exportedCount: number;
  updatedCount: number;
  importedCostsCount: number;
  message?: string;
  error?: string;
  lastSyncAt?: Date;
}

export class GoogleSheetsSyncService {
  /**
   * Performs full bi-directional sync:
   * 1. PostgreSQL -> Google Sheets: export/update confirmed orders
   * 2. Google Sheets -> PostgreSQL: import delivery costs
   * 3. Record metrics in IntegrationSettings
   */
  public static async runFullSync(user?: AuthenticatedUser): Promise<FullSyncResult> {
    const client = getGoogleSheetsClient();
    const configSummary = client.getConfigSummary();

    if (!client.isConfigured()) {
      logger.warn('Google Sheets sync invoked but integration is not configured with credentials');
      return {
        success: false,
        isConfigured: false,
        exportedCount: 0,
        updatedCount: 0,
        importedCostsCount: 0,
        message:
          'Интеграция Google Sheets не настроена. Укажите GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY и GOOGLE_SHEETS_SPREADSHEET_ID в переменных окружения.',
      };
    }

    if (!process.env.DATABASE_URL) {
      return {
        success: false,
        isConfigured: true,
        exportedCount: 0,
        updatedCount: 0,
        importedCostsCount: 0,
        error: 'База данных PostgreSQL не подключена.',
      };
    }

    const actingUser: AuthenticatedUser = user || {
      id: 'system-sync',
      role: UserRole.ACCOUNTANT,
      email: 'system-sync@alibros.internal',
    };

    const startTime = Date.now();

    try {
      // 1. Export confirmed orders from PostgreSQL to Google Sheets
      const orders = await prisma.order.findMany({
        where: {
          status: {
            notIn: [OrderStatus.CREATED, OrderStatus.CANCELLED],
          },
        },
        include: {
          client: true,
          warehouse: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      const syncRecords: GoogleSheetsSyncRecord[] = orders.map((o) => ({
        orderId: o.id,
        orderNumber: o.orderNumber,
        createdAt: o.createdAt.toISOString().slice(0, 19).replace('T', ' '),
        clientCompany: o.client.companyName || '—',
        contactPerson: o.client.contactPerson || o.pickupContactName || '—',
        contactPhone: o.client.contactPhone || o.pickupContactPhone || '—',
        warehouseName: o.warehouse.name,
        scheduledPickupDate: o.scheduledPickupAt
          ? o.scheduledPickupAt.toISOString().slice(0, 10)
          : 'По согласованию',
        boxesCount: o.totalBoxesCount,
        palletsCount: o.totalPalletsCount,
        status: STATUS_LABELS[o.status] || o.status,
        deliveryCostAmount: o.deliveryCostAmount ? Number(o.deliveryCostAmount) : null,
        currency: o.currency || 'RUB',
        updatedAt: o.updatedAt.toISOString().slice(0, 19).replace('T', ' '),
      }));

      const { exported, updated } = await client.exportOrders(syncRecords);

      // 2. Import delivery costs from Google Sheets column 12 into PostgreSQL
      const costUpdates = await client.fetchOrderCosts();
      let importedCostsCount = 0;

      for (const costUpdate of costUpdates) {
        try {
          const res = await OrdersService.updateDeliveryCost(actingUser, {
            orderId: costUpdate.orderId,
            orderNumber: costUpdate.orderNumber,
            deliveryCostAmount: costUpdate.deliveryCostAmount,
            currency: costUpdate.currency,
            source: 'GOOGLE_SHEETS_SYNC',
          });

          if (res.isUpdated) {
            importedCostsCount++;
          }
        } catch (updateErr) {
          logger.warn(
            { updateErr, orderNumber: costUpdate.orderNumber },
            'Failed to apply cost update for order from Google Sheets'
          );
        }
      }

      const durationMs = Date.now() - startTime;
      const lastSyncAt = new Date();

      // 3. Persist integration sync state in IntegrationSettings
      await prisma.integrationSettings.upsert({
        where: { key: 'google_sheets' },
        create: {
          key: 'google_sheets',
          name: 'Google Таблицы (Бухгалтерия)',
          description: 'Двусторонняя синхронизация заявок и стоимости доставки с бухгалтерией',
          isEnabled: true,
          lastSyncAt,
          config: {
            isConfigured: true,
            serviceAccountEmail: configSummary.serviceAccountEmail,
            spreadsheetId: configSummary.spreadsheetId,
            sheetName: configSummary.sheetName,
            lastExportedCount: exported,
            lastUpdatedCount: updated,
            lastImportedCostsCount: importedCostsCount,
            totalOrdersSynced: syncRecords.length,
            durationMs,
            lastError: null,
          },
        },
        update: {
          lastSyncAt,
          isEnabled: true,
          config: {
            isConfigured: true,
            serviceAccountEmail: configSummary.serviceAccountEmail,
            spreadsheetId: configSummary.spreadsheetId,
            sheetName: configSummary.sheetName,
            lastExportedCount: exported,
            lastUpdatedCount: updated,
            lastImportedCostsCount: importedCostsCount,
            totalOrdersSynced: syncRecords.length,
            durationMs,
            lastError: null,
          },
        },
      }).catch((e) => logger.warn({ err: e }, 'Failed to update IntegrationSettings table'));

      logger.info(
        { exported, updated, importedCostsCount, durationMs },
        'Google Sheets full synchronization completed successfully'
      );

      return {
        success: true,
        isConfigured: true,
        exportedCount: exported,
        updatedCount: updated,
        importedCostsCount,
        lastSyncAt,
        message: `Синхронизация успешно завершена. Новых строк добавлено: ${exported}, обновлено: ${updated}, импортировано стоимостей: ${importedCostsCount}.`,
      };
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error({ err }, 'Google Sheets synchronization failed');

      // Update IntegrationSettings with lastError
      await prisma.integrationSettings.upsert({
        where: { key: 'google_sheets' },
        create: {
          key: 'google_sheets',
          name: 'Google Таблицы (Бухгалтерия)',
          isEnabled: true,
          config: {
            isConfigured: true,
            lastError: errorMessage,
          },
        },
        update: {
          config: {
            isConfigured: true,
            lastError: errorMessage,
          },
        },
      }).catch(() => null);

      return {
        success: false,
        isConfigured: true,
        exportedCount: 0,
        updatedCount: 0,
        importedCostsCount: 0,
        error: `Ошибка синхронизации с Google Sheets: ${errorMessage}`,
      };
    }
  }

  /**
   * Retrieves current status and metrics of Google Sheets integration
   */
  public static async getStatus() {
    const client = getGoogleSheetsClient();
    const configSummary = client.getConfigSummary();

    let settings = null;
    if (process.env.DATABASE_URL) {
      settings = await prisma.integrationSettings.findUnique({
        where: { key: 'google_sheets' },
      }).catch(() => null);
    }

    const settingsConfig = (settings?.config as Record<string, unknown>) || {};

    return {
      isConfigured: configSummary.isConfigured,
      serviceAccountEmail: configSummary.serviceAccountEmail,
      spreadsheetId: configSummary.spreadsheetId,
      sheetName: configSummary.sheetName,
      lastSyncAt: settings?.lastSyncAt || null,
      lastError: (settingsConfig.lastError as string) || null,
      lastExportedCount: (settingsConfig.lastExportedCount as number) || 0,
      lastUpdatedCount: (settingsConfig.lastUpdatedCount as number) || 0,
      lastImportedCostsCount: (settingsConfig.lastImportedCostsCount as number) || 0,
      totalOrdersSynced: (settingsConfig.totalOrdersSynced as number) || 0,
    };
  }
}
