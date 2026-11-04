import { logger } from '@/lib/logger';

export interface GoogleSheetsSyncRecord {
  orderNumber: string;
  clientName: string;
  marketplace: string;
  status: string;
  boxesCount: number;
  totalWeightKg?: number;
  totalVolumeM3?: number;
  warehouseName: string;
  createdAt: string;
}

export interface IGoogleSheetsClient {
  appendOrderRow(spreadsheetId: string, record: GoogleSheetsSyncRecord): Promise<boolean>;
  syncOrdersBatch(spreadsheetId: string, records: GoogleSheetsSyncRecord[]): Promise<boolean>;
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
    // Real implementation requires googleapis credentials in Phase 2
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
}
