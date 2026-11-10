import crypto from 'crypto';
import { logger } from '@/lib/logger';

export interface GoogleSheetsSyncRecord {
  orderId: string;
  orderNumber: string;
  createdAt: string;
  clientCompany: string;
  contactPerson: string;
  contactPhone: string;
  warehouseName: string;
  scheduledPickupDate: string;
  boxesCount: number;
  palletsCount: number;
  status: string;
  deliveryCostAmount?: number | null;
  currency?: string;
  updatedAt: string;
}

export interface GoogleSheetsCostUpdate {
  orderId?: string;
  orderNumber: string;
  deliveryCostAmount: number;
  currency: string;
}

export interface SyncResult {
  success: boolean;
  isConfigured: boolean;
  exportedCount: number;
  updatedCount: number;
  importedCostsCount: number;
  costUpdates: GoogleSheetsCostUpdate[];
  message?: string;
  error?: string;
}

export const SHEET_HEADERS = [
  'ID заявки',
  'Номер заявки',
  'Дата создания',
  'Компания клиента',
  'Контактное лицо',
  'Телефон',
  'Склад назначения',
  'Дата доставки',
  'Количество коробок',
  'Количество паллет',
  'Текущий статус',
  'Стоимость доставки',
  'Валюта',
  'Дата последнего обновления',
];

export class GoogleSheetsClient {
  private readonly serviceAccountEmail?: string;
  private readonly privateKey?: string;
  private readonly spreadsheetId?: string;
  private readonly sheetName: string;

  private cachedAccessToken: string | null = null;
  private tokenExpiresAt = 0;

  constructor() {
    this.serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    this.privateKey = process.env.GOOGLE_PRIVATE_KEY;
    this.spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    this.sheetName = process.env.GOOGLE_SHEETS_SHEET_NAME || 'Заявки';
  }

  public isConfigured(): boolean {
    return Boolean(
      this.serviceAccountEmail &&
        this.privateKey &&
        this.spreadsheetId
    );
  }

  public getConfigSummary() {
    return {
      isConfigured: this.isConfigured(),
      serviceAccountEmail: this.serviceAccountEmail || null,
      spreadsheetId: this.spreadsheetId || null,
      sheetName: this.sheetName,
    };
  }

  /**
   * Generates a signed OAuth2 JWT and requests an access token from Google OAuth2 API.
   */
  public async getAccessToken(): Promise<string | null> {
    if (!this.isConfigured()) {
      return null;
    }

    const now = Math.floor(Date.now() / 1000);
    if (this.cachedAccessToken && this.tokenExpiresAt > now + 60) {
      return this.cachedAccessToken;
    }

    try {
      let key = this.privateKey!.trim();
      if (
        (key.startsWith('"') && key.endsWith('"')) ||
        (key.startsWith("'") && key.endsWith("'"))
      ) {
        key = key.slice(1, -1);
      }
      const formattedKey = key.replace(/\\n/g, '\n').trim();

      const header = Buffer.from(
        JSON.stringify({ alg: 'RS256', typ: 'JWT' })
      ).toString('base64url');

      const payload = Buffer.from(
        JSON.stringify({
          iss: this.serviceAccountEmail,
          scope: 'https://www.googleapis.com/auth/spreadsheets',
          aud: 'https://oauth2.googleapis.com/token',
          exp: now + 3600,
          iat: now,
        })
      ).toString('base64url');

      const signer = crypto.createSign('RSA-SHA256');
      signer.update(`${header}.${payload}`);
      const signature = signer.sign(formattedKey, 'base64url');
      const assertion = `${header}.${payload}.${signature}`;

      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
          assertion,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error(
          { status: response.status, errorText },
          'Google OAuth2 token request failed'
        );
        return null;
      }

      const data = await response.json();
      this.cachedAccessToken = data.access_token;
      this.tokenExpiresAt = now + (data.expires_in || 3600);

      return this.cachedAccessToken;
    } catch (err) {
      logger.error(
        { err: err instanceof Error ? err.message : String(err) },
        'Failed to generate Google Service Account OAuth2 token'
      );
      return null;
    }
  }

  /**
   * Safe fetch with retry on rate limit or server errors
   */
  private async fetchGoogleApi(url: string, options: RequestInit, retries = 2): Promise<Response> {
    let attempt = 0;
    while (attempt <= retries) {
      try {
        const res = await fetch(url, options);
        if (res.status === 429 || res.status >= 500) {
          if (attempt < retries) {
            attempt++;
            await new Promise((r) => setTimeout(r, 600 * attempt));
            continue;
          }
        }
        return res;
      } catch (err) {
        if (attempt < retries) {
          attempt++;
          await new Promise((r) => setTimeout(r, 600 * attempt));
          continue;
        }
        throw err;
      }
    }
    throw new Error('Google API request exceeded max retries');
  }

  /**
   * Reads all rows from the configured sheet.
   */
  public async readAllRows(): Promise<string[][]> {
    if (!this.isConfigured()) return [];

    const token = await this.getAccessToken();
    if (!token) return [];

    const range = encodeURIComponent(`${this.sheetName}!A:N`);
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}/values/${range}`;

    try {
      const response = await this.fetchGoogleApi(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        logger.error({ status: response.status }, 'Failed to fetch rows from Google Sheets');
        return [];
      }

      const data = await response.json();
      return (data.values as string[][]) || [];
    } catch (err) {
      logger.error({ err }, 'Error reading rows from Google Sheets');
      return [];
    }
  }

  /**
   * Ensures the header row (14 columns) exists on the sheet.
   */
  public async ensureHeaderRow(): Promise<boolean> {
    if (!this.isConfigured()) return false;

    const token = await this.getAccessToken();
    if (!token) return false;

    const range = encodeURIComponent(`${this.sheetName}!A1:N1`);
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}/values/${range}?valueInputOption=USER_ENTERED`;

    try {
      const response = await this.fetchGoogleApi(url, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          values: [SHEET_HEADERS],
        }),
      });

      return response.ok;
    } catch (err) {
      logger.error({ err }, 'Error writing header row to Google Sheets');
      return false;
    }
  }

  /**
   * Exports confirmed orders to Google Sheets:
   * - Appends new rows if order not yet present
   * - Updates existing rows (leaving column 12 delivery cost intact if entered by accountant)
   */
  public async exportOrders(
    orders: GoogleSheetsSyncRecord[]
  ): Promise<{ exported: number; updated: number }> {
    if (!this.isConfigured() || orders.length === 0) {
      return { exported: 0, updated: 0 };
    }

    const token = await this.getAccessToken();
    if (!token) return { exported: 0, updated: 0 };

    const existingRows = await this.readAllRows();

    // If table is completely empty, initialize header row
    if (existingRows.length === 0) {
      await this.ensureHeaderRow();
    }

    // Map existing rows by unique key: ID (Col 0) or orderNumber (Col 1)
    // Row index in sheet is 1-based (row 1 is header, row 2 is index 1 in existingRows)
    const rowMap = new Map<string, { rowIndex: number; existingRow: string[] }>();
    for (let i = 1; i < existingRows.length; i++) {
      const row = existingRows[i];
      const id = row[0]?.trim();
      const orderNumber = row[1]?.trim();
      if (id) rowMap.set(id, { rowIndex: i + 1, existingRow: row });
      if (orderNumber) rowMap.set(orderNumber, { rowIndex: i + 1, existingRow: row });
    }

    const toAppend: string[][] = [];
    let updatedCount = 0;

    for (const order of orders) {
      const found = rowMap.get(order.orderId) || rowMap.get(order.orderNumber);

      if (!found) {
        // New order -> append row
        const newRow: string[] = [
          order.orderId,
          order.orderNumber,
          order.createdAt,
          order.clientCompany,
          order.contactPerson,
          order.contactPhone,
          order.warehouseName,
          order.scheduledPickupDate,
          order.boxesCount.toString(),
          order.palletsCount.toString(),
          order.status,
          order.deliveryCostAmount != null ? order.deliveryCostAmount.toString() : '',
          order.currency || 'RUB',
          order.updatedAt,
        ];
        toAppend.push(newRow);
      } else {
        // Order exists -> update operational columns (Cols 1-11 and Col 14)
        // PRESERVE Col 12 (Стоимость доставки) entered by accountant!
        const existingCost = found.existingRow[11]?.trim() || '';
        const existingCurrency = found.existingRow[12]?.trim() || order.currency || 'RUB';

        const updatedRow: string[] = [
          order.orderId,
          order.orderNumber,
          order.createdAt,
          order.clientCompany,
          order.contactPerson,
          order.contactPhone,
          order.warehouseName,
          order.scheduledPickupDate,
          order.boxesCount.toString(),
          order.palletsCount.toString(),
          order.status,
          existingCost !== '' ? existingCost : order.deliveryCostAmount != null ? order.deliveryCostAmount.toString() : '',
          existingCurrency,
          order.updatedAt,
        ];

        // Update single row in Google Sheets
        const rowRange = encodeURIComponent(`${this.sheetName}!A${found.rowIndex}:N${found.rowIndex}`);
        const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}/values/${rowRange}?valueInputOption=USER_ENTERED`;

        try {
          const res = await this.fetchGoogleApi(updateUrl, {
            method: 'PUT',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ values: [updatedRow] }),
          });
          if (res.ok) updatedCount++;
        } catch (err) {
          logger.error({ err, orderId: order.orderId }, 'Failed to update row in Google Sheets');
        }
      }
    }

    if (toAppend.length > 0) {
      const appendRange = encodeURIComponent(`${this.sheetName}!A:N`);
      const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}/values/${appendRange}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

      try {
        await this.fetchGoogleApi(appendUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ values: toAppend }),
        });
      } catch (err) {
        logger.error({ err, count: toAppend.length }, 'Failed to append new rows to Google Sheets');
      }
    }

    return {
      exported: toAppend.length,
      updated: updatedCount,
    };
  }

  /**
   * Reads delivery costs from column 12 of Google Sheets.
   * Parses and validates numerical values.
   */
  public async fetchOrderCosts(): Promise<GoogleSheetsCostUpdate[]> {
    if (!this.isConfigured()) return [];

    const rows = await this.readAllRows();
    if (rows.length <= 1) return []; // Only header or empty

    const costUpdates: GoogleSheetsCostUpdate[] = [];

    // Row 0 is header. Rows start at index 1.
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const orderId = row[0]?.trim();
      const orderNumber = row[1]?.trim();
      const rawCost = row[11]?.trim(); // Column 12: Стоимость доставки
      const currency = row[12]?.trim() || 'RUB'; // Column 13: Валюта

      if (!orderNumber && !orderId) continue;
      if (!rawCost || rawCost === '') continue;

      // Clean up currency symbols, spaces (e.g., "12 500 ₽" -> "12500")
      const cleaned = rawCost
        .replace(/\s+/g, '')
        .replace(/,/g, '.')
        .replace(/[^\d.]/g, '');

      const amount = parseFloat(cleaned);

      // Validate positive and reasonable range
      if (isNaN(amount) || !isFinite(amount) || amount <= 0 || amount > 10_000_000) {
        logger.warn(
          { orderNumber, orderId, rawCost, rowNumber: i + 1 },
          'Invalid delivery cost format detected in Google Sheets; skipping'
        );
        continue;
      }

      costUpdates.push({
        orderId: orderId || undefined,
        orderNumber,
        deliveryCostAmount: Math.round(amount * 100) / 100, // Round to 2 decimals
        currency: currency.slice(0, 5),
      });
    }

    return costUpdates;
  }
}

let googleSheetsClientInstance: GoogleSheetsClient | null = null;

export function getGoogleSheetsClient(): GoogleSheetsClient {
  if (!googleSheetsClientInstance) {
    googleSheetsClientInstance = new GoogleSheetsClient();
  }
  return googleSheetsClientInstance;
}

export function resetGoogleSheetsClient(): void {
  googleSheetsClientInstance = null;
}

