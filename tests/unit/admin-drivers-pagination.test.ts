import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/database/prisma', async () => {
  const { createMockPrisma } = await import('../mocks/mock-prisma');
  const mockPrisma = createMockPrisma();
  return {
    prisma: mockPrisma.mockClient,
  };
});

import { buildDriversPaginationUrl } from '@/lib/pagination';
import { DriverPairingService } from '@/modules/telegram/pairing.service';

describe('Admin Drivers & Pairing Security (Unit Tests)', () => {
  beforeEach(async () => {
    await DriverPairingService._clearAllCodesForTesting();
  });
  describe('1. URL Search Params & Filter Preservation (buildDriversPaginationUrl)', () => {
    it('should return /admin/drivers when targetPage is 1 and no filters are present', () => {
      const url = buildDriversPaginationUrl(1, {});
      expect(url).toBe('/admin/drivers');
    });

    it('should include page parameter when targetPage > 1', () => {
      const url = buildDriversPaginationUrl(2, {});
      expect(url).toBe('/admin/drivers?page=2');
    });

    it('should preserve all active filters (search, isAvailable, isActive) across navigation', () => {
      const url = buildDriversPaginationUrl(3, {
        search: 'Иванов',
        isAvailable: 'true',
        isActive: 'true',
      });

      const parsedUrl = new URL(url, 'http://localhost:3000');
      expect(parsedUrl.pathname).toBe('/admin/drivers');
      expect(parsedUrl.searchParams.get('page')).toBe('3');
      expect(parsedUrl.searchParams.get('search')).toBe('Иванов');
      expect(parsedUrl.searchParams.get('isAvailable')).toBe('true');
      expect(parsedUrl.searchParams.get('isActive')).toBe('true');
    });

    it('should omit empty filter strings from generated URL', () => {
      const url = buildDriversPaginationUrl(2, {
        search: '',
        isAvailable: undefined,
        isActive: '',
      });
      expect(url).toBe('/admin/drivers?page=2');
    });
  });

  describe('2. Telegram Pairing Code Security', () => {
    it('should generate an ABL-XXXXXX pairing code with 30-minute expiration', async () => {
      const driverProfileId = 'mock-driver-1';
      const beforeTime = Date.now();
      const result = await DriverPairingService.generatePairingCode(driverProfileId, 'admin-user-1');

      expect(result.code).toMatch(/^ABL-[A-F0-9]{6}$/);
      expect(result.deepLink).toContain(result.code);

      const expiresMs = result.expiresAt.getTime();
      const expectedTtl = 30 * 60 * 1000;
      expect(expiresMs).toBeGreaterThanOrEqual(beforeTime + expectedTtl - 2000);
      expect(expiresMs).toBeLessThanOrEqual(Date.now() + expectedTtl + 2000);
    });

    it('should enforce single-use consumption of pairing codes', async () => {
      const driverProfileId = 'mock-driver-single-use';
      const { code } = await DriverPairingService.generatePairingCode(driverProfileId, 'admin-user-1');

      // First verification should succeed
      const verify1 = await DriverPairingService.verifyAndLinkDriver(9988776655n, code, {
        username: 'driver_telegram',
      });
      expect(verify1.success).toBe(true);

      // Immediate second verification of same code must fail
      const verify2 = await DriverPairingService.verifyAndLinkDriver(9988776655n, code, {
        username: 'driver_telegram',
      });
      expect(verify2.success).toBe(false);
      expect(verify2.error).toContain('Неверный или устаревший код');
    });

    it('should reject invalid or fabricated pairing codes', async () => {
      const result = await DriverPairingService.verifyAndLinkDriver(1122334455n, 'ABL-FABRICATED', {
        username: 'fake_driver',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Неверный или устаревший код');
    });
  });
});
