import { logger } from '@/lib/logger';

export interface GoogleSheetsSyncRecord {
  orderNumber: string;
  clientName: string;
  marketplace: string;
  status: string;
  boxesCount: number;
  palletsCount?: number;
  warehouseName: string;
  createdAt: string;
}

export interface GoogleSheetsCostUpdate {
  orderNumber: string;
  deliveryCostAmount: number;
  currency?: string;
  updatedAt?: string;
}

export interface IGoogleSheetsClient {
  appendOrderRow(spreadsheetId: string, record: GoogleSheetsSyncRecord): Promise<boolean>;
  syncOrdersBatch(spreadsheetId: string, records: GoogleSheetsSyncRecord[]): Promise<boolean>;
  fetchOrderCosts(spreadsheetId: string): Promise<GoogleSheetsCostUpdate[]>;
}

export class GoogleSheetsClient implements IGoogleSheetsClient {
  public async appendOrderRow(
    spreadsheetId: string,
    record: GoogleSheetsSyncRecord
  ): Promise<boolean> {
    logger.info(
      { spreadsheetId, orderNumber: record.orderNumber },
      'Google Sheets integration contract invoked: appendOrderRow'
    );
    return true;
  }

  public async syncOrdersBatch(
    spreadsheetId: string,
    records: GoogleSheetsSyncRecord[]
  ): Promise<boolean> {
    logger.info(
      { spreadsheetId, count: records.length },
      'Google Sheets integration contract invoked: syncOrdersBatch'
    );
    return true;
  }

  /**
   * Архитектурный контракт: получение стоимости заказа из Google Sheets по уникальному orderNumber.
   * База данных PostgreSQL остаётся единственным источником правды о заказе.
   */
  public async fetchOrderCosts(spreadsheetId: string): Promise<GoogleSheetsCostUpdate[]> {
    logger.info(
      { spreadsheetId },
      'Google Sheets integration contract invoked: fetchOrderCosts'
    );
    return [];
  }
}
