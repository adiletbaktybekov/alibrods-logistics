import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST } from '@/app/api/cron/google-sheets-sync/route';
import { isCronAuthorized } from '@/lib/security/cron-auth';
import { GoogleSheetsSyncService } from '@/modules/integrations/google-sheets-sync.service';

describe('Google Sheets Cron Route Security & Authorization', () => {
  const TEST_SECRET = 'a1b2c3d4e5f67890123456789012345678901234567890123456789012345678';
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, CRON_SECRET: TEST_SECRET };
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('isCronAuthorized timing-safe validator', () => {
    it('should return true for matching Bearer token', () => {
      expect(isCronAuthorized(`Bearer ${TEST_SECRET}`, TEST_SECRET)).toBe(true);
    });

    it('should return false if header is null or undefined', () => {
      expect(isCronAuthorized(null, TEST_SECRET)).toBe(false);
      expect(isCronAuthorized(undefined as any, TEST_SECRET)).toBe(false);
    });

    it('should return false if expectedSecret is undefined or empty', () => {
      expect(isCronAuthorized(`Bearer ${TEST_SECRET}`, undefined)).toBe(false);
      expect(isCronAuthorized(`Bearer ${TEST_SECRET}`, '')).toBe(false);
    });

    it('should return false if header does not start with Bearer', () => {
      expect(isCronAuthorized(`Basic ${TEST_SECRET}`, TEST_SECRET)).toBe(false);
      expect(isCronAuthorized(TEST_SECRET, TEST_SECRET)).toBe(false);
    });

    it('should return false if token length does not match', () => {
      expect(isCronAuthorized(`Bearer ${TEST_SECRET}extra`, TEST_SECRET)).toBe(false);
      expect(isCronAuthorized(`Bearer short`, TEST_SECRET)).toBe(false);
    });

    it('should return false if token content differs', () => {
      const wrongSecret = TEST_SECRET.slice(0, -1) + (TEST_SECRET.endsWith('a') ? 'b' : 'a');
      expect(isCronAuthorized(`Bearer ${wrongSecret}`, TEST_SECRET)).toBe(false);
    });
  });

  describe('HTTP Handler (GET & POST)', () => {
    it('should reject request with 401 when Authorization header is missing', async () => {
      const req = new NextRequest('https://alibros.test/api/cron/google-sheets-sync', {
        method: 'GET',
      });

      const res = await GET(req);
      expect(res.status).toBe(401);

      const json = await res.json();
      expect(json.error).toContain('Unauthorized');
    });

    it('should reject request with 401 when Bearer token is invalid', async () => {
      const req = new NextRequest('https://alibros.test/api/cron/google-sheets-sync', {
        method: 'GET',
        headers: {
          authorization: 'Bearer wrong-secret-key-1234567890',
        },
      });

      const res = await GET(req);
      expect(res.status).toBe(401);

      const json = await res.json();
      expect(json.error).toContain('Unauthorized');
    });

    it('should reject with 500 when CRON_SECRET is not configured in environment', async () => {
      delete process.env.CRON_SECRET;

      const req = new NextRequest('https://alibros.test/api/cron/google-sheets-sync', {
        method: 'GET',
        headers: {
          authorization: `Bearer ${TEST_SECRET}`,
        },
      });

      const res = await GET(req);
      expect(res.status).toBe(500);

      const json = await res.json();
      expect(json.error).toContain('CRON_SECRET environment variable');
    });

    it('should execute full sync and return 200 when Bearer token matches CRON_SECRET', async () => {
      const runFullSyncSpy = vi.spyOn(GoogleSheetsSyncService, 'runFullSync').mockResolvedValueOnce({
        success: true,
        isConfigured: true,
        exportedCount: 5,
        updatedCount: 2,
        importedCostsCount: 1,
        message: 'Sync completed',
      });

      const req = new NextRequest('https://alibros.test/api/cron/google-sheets-sync', {
        method: 'GET',
        headers: {
          authorization: `Bearer ${TEST_SECRET}`,
        },
      });

      const res = await GET(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.exportedCount).toBe(5);
      expect(json.updatedCount).toBe(2);
      expect(json.importedCostsCount).toBe(1);
      expect(json.timestamp).toBeDefined();
      expect(runFullSyncSpy).toHaveBeenCalled();
    });

    it('POST handler behaves identically to GET', async () => {
      vi.spyOn(GoogleSheetsSyncService, 'runFullSync').mockResolvedValueOnce({
        success: true,
        isConfigured: true,
        exportedCount: 0,
        updatedCount: 0,
        importedCostsCount: 0,
        message: 'Post sync completed',
      });

      const req = new NextRequest('https://alibros.test/api/cron/google-sheets-sync', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${TEST_SECRET}`,
        },
      });

      const res = await POST(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.message).toBe('Post sync completed');
    });

    it('should return controlled response when sync is already in progress (concurrency lock)', async () => {
      vi.spyOn(GoogleSheetsSyncService, 'runFullSync').mockResolvedValueOnce({
        success: false,
        isConfigured: true,
        exportedCount: 0,
        updatedCount: 0,
        importedCostsCount: 0,
        message: 'Синхронизация уже выполняется другим процессом.',
      });

      const req = new NextRequest('https://alibros.test/api/cron/google-sheets-sync', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${TEST_SECRET}`,
        },
      });

      const res = await POST(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.message).toContain('уже выполняется другим процессом');
    });
  });
});
