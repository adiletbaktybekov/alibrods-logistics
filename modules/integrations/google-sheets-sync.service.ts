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

export interface SingleOrderSyncResult {
  success: boolean;
  exported?: boolean;
  updated?: boolean;
  skippedReason?: string;
  error?: string;
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

    // Concurrency lease lock check (prevent overlapping executions)
    const existingSettings = await prisma.integrationSettings
      .findUnique({ where: { key: 'google_sheets' } })
      .catch(() => null);

    const existingConfig = (existingSettings?.config as Record<string, unknown>) || {};
    const syncInProgress = existingConfig.syncInProgress === true;
    const syncStartedAt =
      typeof existingConfig.syncStartedAt === 'number' ? existingConfig.syncStartedAt : 0;
    const LOCK_TIMEOUT_MS = 120_000; // 2 min lease timeout

    if (syncInProgress && Date.now() - syncStartedAt < LOCK_TIMEOUT_MS) {
      logger.warn('Google Sheets sync already in progress by another worker. Skipping overlapping execution.');
      return {
        success: false,
        isConfigured: true,
        exportedCount: 0,
        updatedCount: 0,
        importedCostsCount: 0,
        message: 'Синхронизация уже выполняется другим процессом.',
      };
    }

    // Acquire lease lock
    await prisma.integrationSettings
      .upsert({
        where: { key: 'google_sheets' },
        create: {
          key: 'google_sheets',
          name: 'Google Таблицы (Бухгалтерия)',
          description: 'Двусторонняя синхронизация заявок и стоимости доставки с бухгалтерией',
          isEnabled: true,
          config: {
            ...existingConfig,
            syncInProgress: true,
            syncStartedAt: startTime,
          },
        },
        update: {
          config: {
            ...existingConfig,
            syncInProgress: true,
            syncStartedAt: startTime,
          },
        },
      })
      .catch((e) => logger.warn({ err: e }, 'Failed to acquire sync lease lock'));

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
            syncInProgress: false,
            syncStartedAt: null,
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
            syncInProgress: false,
            syncStartedAt: null,
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

      // Update IntegrationSettings with lastError and release lock
      await prisma.integrationSettings.upsert({
        where: { key: 'google_sheets' },
        create: {
          key: 'google_sheets',
          name: 'Google Таблицы (Бухгалтерия)',
          isEnabled: true,
          config: {
            isConfigured: true,
            lastError: errorMessage,
            syncInProgress: false,
            syncStartedAt: null,
          },
        },
        update: {
          config: {
            ...existingConfig,
            isConfigured: true,
            lastError: errorMessage,
            syncInProgress: false,
            syncStartedAt: null,
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

  /**
   * Synchronizes a single order to Google Sheets:
   * - CREATED and CANCELLED orders are ignored (only CONFIRMED or later)
   * - Idempotent: appends new row or updates existing row
   * - Preserves accountant's delivery cost and currency
   * - Safe non-blocking execution (does not fail caller transaction)
   */
  public static async syncOrder(orderId: string): Promise<SingleOrderSyncResult> {
    const client = getGoogleSheetsClient();
    if (!client.isConfigured()) {
      return { success: false, skippedReason: 'NOT_CONFIGURED' };
    }

    if (!process.env.DATABASE_URL) {
      return { success: false, skippedReason: 'DATABASE_NOT_CONFIGURED' };
    }

    try {
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
          client: true,
          warehouse: true,
        },
      });

      if (!order) {
        return { success: false, skippedReason: 'ORDER_NOT_FOUND' };
      }

      // Rule 1: CREATED and CANCELLED orders are NOT exported to Google Sheets
      if (order.status === OrderStatus.CREATED || order.status === OrderStatus.CANCELLED) {
        return { success: false, skippedReason: 'ORDER_NOT_CONFIRMED' };
      }

      const syncRecord: GoogleSheetsSyncRecord = {
        orderId: order.id,
        orderNumber: order.orderNumber,
        createdAt: order.createdAt.toISOString().slice(0, 19).replace('T', ' '),
        clientCompany: order.client?.companyName || '—',
        contactPerson: order.client?.contactPerson || order.pickupContactName || '—',
        contactPhone: order.client?.contactPhone || order.pickupContactPhone || '—',
        warehouseName: order.warehouse?.name || '—',
        scheduledPickupDate: order.scheduledPickupAt
          ? order.scheduledPickupAt.toISOString().slice(0, 10)
          : 'По согласованию',
        boxesCount: order.totalBoxesCount,
        palletsCount: order.totalPalletsCount,
        status: STATUS_LABELS[order.status] || order.status,
        deliveryCostAmount: order.deliveryCostAmount ? Number(order.deliveryCostAmount) : null,
        currency: order.currency || 'RUB',
        updatedAt: order.updatedAt.toISOString().slice(0, 19).replace('T', ' '),
      };

      const { exported, updated } = await client.exportOrders([syncRecord]);

      logger.info(
        {
          event: 'GOOGLE_SHEETS_ORDER_SYNCED',
          orderId: order.id,
          orderNumber: order.orderNumber,
          status: order.status,
          exported: exported > 0,
          updated: updated > 0,
        },
        'Single order synchronized to Google Sheets'
      );

      return {
        success: true,
        exported: exported > 0,
        updated: updated > 0,
      };
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      logger.error(
        {
          event: 'GOOGLE_SHEETS_ORDER_SYNC_FAILED',
          orderId,
          error,
        },
        'Failed to sync single order to Google Sheets'
      );
      return { success: false, error };
    }
  }
}
