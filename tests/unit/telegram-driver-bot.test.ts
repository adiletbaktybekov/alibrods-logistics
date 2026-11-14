import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/database/prisma', async () => {
  const { createMockPrisma } = await import('../mocks/mock-prisma');
  const mockPrisma = createMockPrisma();
  return {
    prisma: mockPrisma.mockClient,
  };
});

import { DriverPairingService } from '@/modules/telegram/pairing.service';
import {
  DRIVER_ALLOWED_TRANSITIONS,
  ACTIVE_DRIVER_STATUSES,
  COMPLETED_DRIVER_STATUSES,
} from '@/modules/orders/driver-order.service';
import { DriverPhotoService, MAX_PHOTO_SIZE_BYTES } from '@/modules/telegram/photo.service';
import { S3StorageProvider } from '@/modules/storage/storage.service';
import { TelegramBotClient } from '@/integrations/telegram/client';
import { OrderStatus, PhotoType } from '@prisma/client';

describe('Telegram Driver Bot & Pairing System', () => {
  beforeEach(async () => {
    process.env.DATABASE_URL = 'postgresql://mock:mock@localhost:5432/mock';
    await DriverPairingService._clearAllCodesForTesting();
  });

  describe('1. Driver Pairing & One-Time Code Verification', () => {
    it('should generate a code with prefix ABL- and 30-minute expiration', async () => {
      const { code, expiresAt, deepLink } = await DriverPairingService.generatePairingCode(
        'driver-uuid-1',
        'admin-uuid-1'
      );

      expect(code).toMatch(/^ABL-[A-F0-9]{6}$/);
      expect(expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * 60 * 1000);
      expect(expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 30 * 60 * 1000 + 1000);
      expect(deepLink).toContain(code);
    });

    it('should reject invalid or non-existent pairing code', async () => {
      const res = await DriverPairingService.verifyAndLinkDriver(
        123456789,
        'ABL-INVALID',
        { username: 'test_driver' }
      );

      expect(res.success).toBe(false);
      expect(res.error).toContain('Неверный или устаревший код');
    });

    it('should enforce single-use: code is invalidated immediately after first use', async () => {
      const { code } = await DriverPairingService.generatePairingCode(
        'driver-uuid-2',
        'admin-uuid-1'
      );

      // First attempt succeeds
      const firstRes = await DriverPairingService.verifyAndLinkDriver(
        987654321,
        code,
        { username: 'first_driver' }
      );
      expect(firstRes.success).toBe(true);

      // Second attempt with the same code must fail immediately
      const secondRes = await DriverPairingService.verifyAndLinkDriver(
        987654321,
        code,
        { username: 'first_driver' }
      );
      expect(secondRes.success).toBe(false);
      expect(secondRes.error).toContain('Неверный или устаревший код');
    });
  });

  describe('2. State Machine for Driver Status Transitions', () => {
    it('should only allow linear and valid delivery progression', () => {
      expect(DRIVER_ALLOWED_TRANSITIONS[OrderStatus.ASSIGNED_TO_DRIVER]).toEqual([
        OrderStatus.ACCEPTED_BY_DRIVER,
      ]);

      expect(DRIVER_ALLOWED_TRANSITIONS[OrderStatus.ACCEPTED_BY_DRIVER]).toEqual([
        OrderStatus.PICKED_UP,
      ]);

      expect(DRIVER_ALLOWED_TRANSITIONS[OrderStatus.PICKED_UP]).toEqual([
        OrderStatus.IN_TRANSIT,
      ]);

      expect(DRIVER_ALLOWED_TRANSITIONS[OrderStatus.IN_TRANSIT]).toEqual([
        OrderStatus.DELIVERED_TO_WAREHOUSE,
      ]);

      expect(DRIVER_ALLOWED_TRANSITIONS[OrderStatus.DELIVERED_TO_WAREHOUSE]).toEqual([
        OrderStatus.ACCEPTED_BY_MARKETPLACE,
      ]);
    });

    it('should prohibit illegal jumps and reverse transitions', () => {
      // Driver cannot jump from ASSIGNED_TO_DRIVER directly to DELIVERED_TO_WAREHOUSE
      expect(DRIVER_ALLOWED_TRANSITIONS[OrderStatus.ASSIGNED_TO_DRIVER]).not.toContain(
        OrderStatus.DELIVERED_TO_WAREHOUSE
      );

      // Driver cannot move from DELIVERED_TO_WAREHOUSE back to IN_TRANSIT
      expect(DRIVER_ALLOWED_TRANSITIONS[OrderStatus.DELIVERED_TO_WAREHOUSE]).not.toContain(
        OrderStatus.IN_TRANSIT
      );

      // Final statuses cannot be transitioned further by driver
      expect(DRIVER_ALLOWED_TRANSITIONS[OrderStatus.ACCEPTED_BY_MARKETPLACE]).toEqual([]);
      expect(DRIVER_ALLOWED_TRANSITIONS[OrderStatus.COMPLETED]).toEqual([]);
      expect(DRIVER_ALLOWED_TRANSITIONS[OrderStatus.CANCELLED]).toEqual([]);
      expect(DRIVER_ALLOWED_TRANSITIONS[OrderStatus.REJECTED_BY_MANAGER]).toEqual([]);
    });

    it('should correctly partition active vs completed driver statuses', () => {
      expect(ACTIVE_DRIVER_STATUSES).toContain(OrderStatus.ASSIGNED_TO_DRIVER);
      expect(ACTIVE_DRIVER_STATUSES).toContain(OrderStatus.ACCEPTED_BY_DRIVER);
      expect(ACTIVE_DRIVER_STATUSES).not.toContain(OrderStatus.PICKED_UP);
      expect(ACTIVE_DRIVER_STATUSES).not.toContain(OrderStatus.COMPLETED);

      expect(COMPLETED_DRIVER_STATUSES).toContain(OrderStatus.PICKED_UP);
      expect(COMPLETED_DRIVER_STATUSES).toContain(OrderStatus.IN_TRANSIT);
      expect(COMPLETED_DRIVER_STATUSES).toContain(OrderStatus.ACCEPTED_BY_MARKETPLACE);
      expect(COMPLETED_DRIVER_STATUSES).toContain(OrderStatus.COMPLETED);
      expect(COMPLETED_DRIVER_STATUSES).not.toContain(OrderStatus.ACCEPTED_BY_DRIVER);
    });
  });

  describe('3. Photo Validation and Storage Rules', () => {
    it('should allow valid image formats within size limit', () => {
      expect(() =>
        DriverPhotoService.validatePhoto(2 * 1024 * 1024, 'image/jpeg')
      ).not.toThrow();

      expect(() =>
        DriverPhotoService.validatePhoto(500 * 1024, 'image/png')
      ).not.toThrow();

      expect(() =>
        DriverPhotoService.validatePhoto(1 * 1024 * 1024, 'image/webp')
      ).not.toThrow();
    });

    it('should reject files exceeding 10 MB limit', () => {
      expect(() =>
        DriverPhotoService.validatePhoto(MAX_PHOTO_SIZE_BYTES + 1, 'image/jpeg')
      ).toThrow('превышает лимит 10 МБ');
    });

    it('should reject unauthorized file types (PDF, EXE, etc.)', () => {
      expect(() =>
        DriverPhotoService.validatePhoto(1024 * 100, 'application/pdf')
      ).toThrow('Разрешены только JPG, PNG и WEBP');

      expect(() =>
        DriverPhotoService.validatePhoto(1024 * 100, 'text/plain')
      ).toThrow('Разрешены только JPG, PNG и WEBP');
    });

    it('should manage pending driver photo upload sessions with TTL', async () => {
      await DriverPhotoService.setPendingUploadSession(
        'driver-123',
        'order-456',
        PhotoType.CARGO_PICKUP
      );

      const session = await DriverPhotoService.getPendingUploadSession('driver-123');
      expect(session).not.toBeNull();
      expect(session?.orderId).toBe('order-456');
      expect(session?.photoType).toBe(PhotoType.CARGO_PICKUP);

      await DriverPhotoService.clearPendingUploadSession('driver-123');
      expect(await DriverPhotoService.getPendingUploadSession('driver-123')).toBeNull();
    });

    it('S3StorageProvider should explicitly report inactive cloud storage when unconfigured', async () => {
      const provider = new S3StorageProvider();
      // In testing env without AWS_S3_BUCKET
      if (!provider.isConfigured()) {
        const res = await provider.uploadFile({
          key: 'test/photo.jpg',
          buffer: Buffer.from('test'),
          mimeType: 'image/jpeg',
          sizeBytes: 4,
        });

        expect(res.success).toBe(false);
        expect(res.isConfigured).toBe(false);
        expect(res.message).toContain('не подключено');
      }
    });
  });

  describe('4. Telegram Bot Client Robustness', () => {
    it('should gracefully handle empty botToken without crashing', async () => {
      const unconfiguredClient = new TelegramBotClient('');

      const sent = await unconfiguredClient.sendMessage({
        chatId: 12345,
        text: 'Test',
      });
      expect(sent).toBe(false);

      const answered = await unconfiguredClient.answerCallbackQuery('cb-123');
      expect(answered).toBe(false);
    });
  });
});
