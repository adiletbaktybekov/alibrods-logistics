import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SHEET_HEADERS, GoogleSheetsClient, GoogleSheetsSyncRecord } from '@/integrations/google-sheets/client';

describe('Google Sheets Staging Integration — Lifecycle, 14 Columns & Deduplication', () => {
  let client: GoogleSheetsClient;
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.restoreAllMocks();
    global.fetch = mockFetch;

    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = 'alibros-sheets-sync@alibros-logistics.iam.gserviceaccount.com';
    process.env.GOOGLE_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC...\n-----END PRIVATE KEY-----\n';
    process.env.GOOGLE_SHEETS_SPREADSHEET_ID = 'test-staging-spreadsheet-id-e2e';
    process.env.GOOGLE_SHEETS_SHEET_NAME = 'Заявки_TEST';

    client = new GoogleSheetsClient();
    vi.spyOn(client, 'getAccessToken').mockResolvedValue('mock-google-access-token');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // 1 & 2. 14-Column Header Structure and Matching
  it('1 & 2. Verifies 14-column layout and creates header row', async () => {
    expect(SHEET_HEADERS).toHaveLength(14);
    expect(SHEET_HEADERS).toEqual([
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
    ]);

    // Mock ensureHeaderRow PUT request
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ updatedRange: 'Заявки_TEST!A1:N1' }),
    });

    const headerResult = await client.ensureHeaderRow();
    expect(headerResult).toBe(true);

    const putCall = mockFetch.mock.calls[0];
    expect(putCall[0]).toContain('/values/%D0%97%D0%B0%D1%8F%D0%B2%D0%BA%D0%B8_TEST!A1%3AN1');
    const sentBody = JSON.parse(putCall[1].body);
    expect(sentBody.values[0]).toEqual(SHEET_HEADERS);
    expect(sentBody.values[0]).toHaveLength(14);
  });

  // 1, 4 & 5. Export Test Orders & Prevent Duplicate Rows
  it('1, 4 & 5. Exports test order and prevents duplicate rows on repeated sync', async () => {
    const testOrder1: GoogleSheetsSyncRecord = {
      orderId: 'e2e-order-uuid-001',
      orderNumber: 'ABL-2026-E2E001',
      createdAt: '2026-11-12 12:00:00',
      clientCompany: 'E2E TEST ОсОО Селлер',
      contactPerson: 'Тест Контакт',
      contactPhone: '+79991234567',
      warehouseName: 'Коледино',
      scheduledPickupDate: '2026-11-14',
      boxesCount: 10,
      palletsCount: 1,
      status: 'Подтверждён',
      deliveryCostAmount: null,
      currency: 'RUB',
      updatedAt: '2026-11-12 12:00:00',
    };

    // First sync: Sheet currently only contains headers (row 1)
    mockFetch.mockImplementation(async (url: string, opts: any) => {
      if (opts?.method === 'POST') {
        // append call
        return {
          ok: true,
          status: 200,
          json: async () => ({ updates: { updatedRows: 1 } }),
        };
      }
      // readAllRows call: headers only
      return {
        ok: true,
        status: 200,
        json: async () => ({ values: [SHEET_HEADERS] }),
      };
    });

    const firstSync = await client.exportOrders([testOrder1]);
    expect(firstSync.exported).toBe(1);
    expect(firstSync.updated).toBe(0);

    // Second sync: Sheet now already contains testOrder1 at row 2
    mockFetch.mockImplementation(async (url: string, opts: any) => {
      if (opts?.method === 'PUT') {
        // update single row call
        return {
          ok: true,
          status: 200,
          json: async () => ({ updatedCells: 14 }),
        };
      }
      // readAllRows returns header + existing row
      return {
        ok: true,
        status: 200,
        json: async () => ({
          values: [
            SHEET_HEADERS,
            [
              testOrder1.orderId,
              testOrder1.orderNumber,
              testOrder1.createdAt,
              testOrder1.clientCompany,
              testOrder1.contactPerson,
              testOrder1.contactPhone,
              testOrder1.warehouseName,
              testOrder1.scheduledPickupDate,
              '10',
              '1',
              'Подтверждён',
              '5500', // Already has tariff entered by accountant
              'RUB',
              testOrder1.updatedAt,
            ],
          ],
        }),
      };
    });

    // Update order status from operational DB (e.g. delivered)
    const updatedTestOrder = {
      ...testOrder1,
      status: 'Сдан на склад',
      boxesCount: 10,
      updatedAt: '2026-11-12 14:00:00',
    };

    const secondSync = await client.exportOrders([updatedTestOrder]);
    // NO NEW ROWS APPENDED! Existing row updated in place, preventing duplicates.
    expect(secondSync.exported).toBe(0);
    expect(secondSync.updated).toBe(1);

    // Check that PUT request targeted exact row index 2 and preserved accountant tariff 5500
    const putCalls = mockFetch.mock.calls.filter((c: any) => c[1]?.method === 'PUT');
    expect(putCalls.length).toBeGreaterThanOrEqual(1);
    const lastPut = putCalls[putCalls.length - 1];
    expect(lastPut[0]).toContain('A2%3AN2');
    const updatedRow = JSON.parse(lastPut[1].body).values[0];
    expect(updatedRow[10]).toBe('Сдан на склад'); // Status updated
    expect(updatedRow[11]).toBe('5500'); // Tariff preserved!
    expect(updatedRow[12]).toBe('RUB');
  });

  // 3. Import of Test Tariffs from Column 12
  it('3. Imports accountant delivery costs from Column 12 into PostgreSQL format', async () => {
    // Mock sheet rows with tariffs entered in Column 12 (index 11)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        values: [
          SHEET_HEADERS,
          [
            'e2e-order-uuid-001',
            'ABL-2026-E2E001',
            '2026-11-12 12:00:00',
            'E2E TEST ОсОО Селлер',
            'Тест',
            '+79991234567',
            'Коледино',
            '2026-11-14',
            '10',
            '1',
            'Сдан на склад',
            '12 500,50', // Accountant entered Russian-formatted decimal
            'RUB',
            '2026-11-12 14:00:00',
          ],
          [
            'e2e-order-uuid-002',
            'ABL-2026-E2E002',
            '2026-11-12 12:00:00',
            'E2E TEST Селлер 2',
            'Иван',
            '+79997654321',
            'Электросталь',
            '2026-11-15',
            '5',
            '0',
            'В пути',
            '3500', // Integer amount
            'KGS',
            '2026-11-12 14:00:00',
          ],
        ],
      }),
    });

    const costUpdates = await client.fetchOrderCosts();
    expect(costUpdates).toHaveLength(2);
    expect(costUpdates[0]).toEqual({
      orderId: 'e2e-order-uuid-001',
      orderNumber: 'ABL-2026-E2E001',
      deliveryCostAmount: 12500.5,
      currency: 'RUB',
    });
    expect(costUpdates[1]).toEqual({
      orderId: 'e2e-order-uuid-002',
      orderNumber: 'ABL-2026-E2E002',
      deliveryCostAmount: 3500,
      currency: 'KGS',
    });
  });

  // 6. Google API Error Handling & Retries
  it('6. Handles Google API transient errors with exponential backoff retry', async () => {
    // First 2 calls fail with 503 Service Unavailable, 3rd call succeeds
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        text: async () => 'Backend Error',
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        text: async () => 'Rate limit exceeded',
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ values: [SHEET_HEADERS] }),
      });

    const rows = await client.readAllRows();
    expect(rows).toEqual([SHEET_HEADERS]);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });
});
