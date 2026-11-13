import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as webhookPost } from '@/app/api/telegram/webhook/route';
import { TelegramBotService } from '@/modules/telegram/bot.service';
import { TelegramDeduplicationService } from '@/modules/telegram/deduplication.service';
import {
  DriverPairingService,
  ClientPairingService,
  ManagerPairingService,
} from '@/modules/telegram/pairing.service';
import {
  TelegramNotificationService,
  TelegramGroupEventType,
} from '@/modules/telegram/notification.service';
import { TelegramBotClient } from '@/integrations/telegram/client';
import { DriverPhotoService, MAX_PHOTO_SIZE_BYTES } from '@/modules/telegram/photo.service';
import {
  DRIVER_ALLOWED_TRANSITIONS,
  ACTIVE_DRIVER_STATUSES,
  COMPLETED_DRIVER_STATUSES,
} from '@/modules/orders/driver-order.service';
import { validateTelegramInitData } from '@/lib/security/telegram';
import { DatabaseRateLimiter, RateLimiter } from '@/lib/security/rate-limit';
import { OrderStatus, PhotoType, UserRole, TelegramUpdateStatus } from '@prisma/client';
import crypto from 'crypto';

// Setup Mock Prisma for unit tests
vi.mock('@/database/prisma', async () => {
  const { createMockPrisma } = await import('../mocks/mock-prisma');
  const mockPrisma = createMockPrisma();
  return {
    prisma: mockPrisma.mockClient,
  };
});

describe('AliBros Logistics: Complete Telegram 3-Bot Integration Unit Tests', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    TelegramNotificationService._clearDeduplicationCacheForTesting();
    process.env.TELEGRAM_BOT_WEBHOOK_SECRET = 'test-secret-token-xyz';
    process.env.TELEGRAM_WEBHOOK_SECRET = 'test-secret-token-xyz';
    process.env.TELEGRAM_ENABLE_GROUP_NOTIFICATIONS = 'false';
  });

  // ============================================================================
  // 1. Webhook Security & Request Routing (Phase 2)
  // ============================================================================
  describe('Phase 2 — Webhook Security & Routing', () => {
    it('should reject webhook request if secret token header is missing or invalid', async () => {
      const req = new NextRequest('http://localhost:3000/api/telegram/webhook?bot=driver', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-telegram-bot-api-secret-token': 'wrong-secret',
        },
        body: JSON.stringify({ update_id: 1001, message: { text: 'hi' } }),
      });

      const res = await webhookPost(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toBe('Unauthorized webhook request');
    });

    it('should accept valid secret token and route properly to driver bot', async () => {
      const handleUpdateSpy = vi.spyOn(TelegramBotService, 'handleUpdate').mockResolvedValueOnce();

      const req = new NextRequest('http://localhost:3000/api/telegram/webhook?bot=driver', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-telegram-bot-api-secret-token': 'test-secret-token-xyz',
        },
        body: JSON.stringify({
          update_id: 1002,
          message: {
            message_id: 1,
            from: { id: 555001, first_name: 'Driver' },
            chat: { id: 555001, type: 'private' },
            date: Math.floor(Date.now() / 1000),
            text: '/start',
          },
        }),
      });

      const res = await webhookPost(req);
      expect(res.status).toBe(200);
      expect(handleUpdateSpy).toHaveBeenCalledWith(expect.anything(), 'driver');
    });

    it('should route to client bot when ?bot=client is specified', async () => {
      const handleUpdateSpy = vi.spyOn(TelegramBotService, 'handleUpdate').mockResolvedValueOnce();

      const req = new NextRequest('http://localhost:3000/api/telegram/webhook?bot=client', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-telegram-bot-api-secret-token': 'test-secret-token-xyz',
        },
        body: JSON.stringify({
          update_id: 1003,
          message: {
            message_id: 2,
            from: { id: 555002, first_name: 'Client' },
            chat: { id: 555002, type: 'private' },
            date: Math.floor(Date.now() / 1000),
            text: '/start',
          },
        }),
      });

      const res = await webhookPost(req);
      expect(res.status).toBe(200);
      expect(handleUpdateSpy).toHaveBeenCalledWith(expect.anything(), 'client');
    });

    it('should route to manager bot when ?bot=manager is specified', async () => {
      const handleUpdateSpy = vi.spyOn(TelegramBotService, 'handleUpdate').mockResolvedValueOnce();

      const req = new NextRequest('http://localhost:3000/api/telegram/webhook?bot=manager', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-telegram-bot-api-secret-token': 'test-secret-token-xyz',
        },
        body: JSON.stringify({
          update_id: 1004,
          message: {
            message_id: 3,
            from: { id: 555003, first_name: 'Manager' },
            chat: { id: 555003, type: 'private' },
            date: Math.floor(Date.now() / 1000),
            text: '/status',
          },
        }),
      });

      const res = await webhookPost(req);
      expect(res.status).toBe(200);
      expect(handleUpdateSpy).toHaveBeenCalledWith(expect.anything(), 'manager');
    });

    it('should gracefully handle unsupported or empty update payloads without crashing', async () => {
      const req = new NextRequest('http://localhost:3000/api/telegram/webhook?bot=driver', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-telegram-bot-api-secret-token': 'test-secret-token-xyz',
        },
        body: JSON.stringify({ update_id: 1005 }), // no message or callback_query
      });

      const res = await webhookPost(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.skipped).toContain('No message or callback_query');
    });
  });

  // ============================================================================
  // 2. Driver Bot (Phase 3)
  // ============================================================================
  describe('Phase 3 — Driver Bot Functionality', () => {
    it('should generate pairing code formatted as ABL-XXXXXX with 30m TTL', async () => {
      const { code, expiresAt, deepLink } = await DriverPairingService.generatePairingCode(
        'drv-prof-1',
        'mgr-user-1'
      );

      expect(code).toMatch(/^ABL-[A-F0-9]{6}$/);
      expect(expiresAt.getTime()).toBeGreaterThan(Date.now() + 28 * 60 * 1000);
      expect(deepLink).toContain(code);
    });

    it('should enforce single-use pairing code consumption', async () => {
      const { code } = await DriverPairingService.generatePairingCode('drv-prof-1', 'mgr-user-1');

      const firstAttempt = await DriverPairingService.verifyAndLinkDriver(
        777111,
        code,
        { username: 'driver_john' }
      );
      expect(firstAttempt.success).toBe(true);

      // Re-use must fail immediately
      const secondAttempt = await DriverPairingService.verifyAndLinkDriver(
        777111,
        code,
        { username: 'driver_john' }
      );
      expect(secondAttempt.success).toBe(false);
      expect(secondAttempt.error).toContain('Неверный или устаревший код');
    });

    it('should enforce driver linear status transitions', () => {
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

      // Forbidden jumps
      expect(DRIVER_ALLOWED_TRANSITIONS[OrderStatus.ASSIGNED_TO_DRIVER]).not.toContain(
        OrderStatus.DELIVERED_TO_WAREHOUSE
      );
    });

    it('should validate driver photo binary magic bytes and size limits', () => {
      // JPEG magic bytes
      const jpegBuf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
      expect(DriverPhotoService.detectMimeType(jpegBuf)).toBe('image/jpeg');

      // PNG magic bytes
      const pngBuf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      expect(DriverPhotoService.detectMimeType(pngBuf)).toBe('image/png');

      // Fake file claiming to be JPEG
      const fakeBuf = Buffer.from([0x00, 0x01, 0x02, 0x03]);
      expect(() =>
        DriverPhotoService.validatePhoto(1000, 'image/jpeg', fakeBuf)
      ).toThrow('Недопустимый бинарный формат');

      // Exceeding 10MB
      expect(() =>
        DriverPhotoService.validatePhoto(MAX_PHOTO_SIZE_BYTES + 10, 'image/jpeg', jpegBuf)
      ).toThrow('превышает лимит 10 МБ');
    });
  });

  // ============================================================================
  // 3. Client Bot & Mini App (Phase 4)
  // ============================================================================
  describe('Phase 4 — Client Bot & Mini App', () => {
    it('should generate and verify client pairing code', async () => {
      const { code, expiresAt, deepLink } = await ClientPairingService.generatePairingCode(
        'client-prof-1',
        'mgr-user-1'
      );

      expect(code).toMatch(/^ABL-[A-F0-9]{6}$/);
      expect(expiresAt.getTime()).toBeGreaterThan(Date.now() + 28 * 60 * 1000);
      expect(deepLink).toContain('AliBrosClientBot');

      const result = await ClientPairingService.verifyAndLinkClient(888111, code, {
        username: 'seller_ivan',
      });
      expect(result.success).toBe(true);
      expect(result.companyName).toBeDefined();

      // Second attempt must fail
      const reuse = await ClientPairingService.verifyAndLinkClient(888111, code, {
        username: 'seller_ivan',
      });
      expect(reuse.success).toBe(false);
    });

    it('should validate Telegram Mini App initData cryptographic HMAC-SHA256 signature', () => {
      const testToken = '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11';
      const authDate = Math.floor(Date.now() / 1000).toString();
      const userJson = JSON.stringify({ id: 987654, first_name: 'ClientSeller', username: 'seller' });

      // Generate valid hash
      const dataCheckString = `auth_date=${authDate}\nuser=${userJson}`;
      const secretKey = crypto.createHmac('sha256', 'WebAppData').update(testToken).digest();
      const validHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

      const validInitData = `auth_date=${authDate}&user=${encodeURIComponent(userJson)}&hash=${validHash}`;

      const res = validateTelegramInitData(validInitData, testToken);
      expect(res.isValid).toBe(true);
      expect(res.user?.id).toBe(987654);

      // Corrupted signature
      const corruptedInitData = `auth_date=${authDate}&user=${encodeURIComponent(userJson)}&hash=invalidhash1234567890`;
      const corruptedRes = validateTelegramInitData(corruptedInitData, testToken);
      expect(corruptedRes.isValid).toBe(false);
      expect(corruptedRes.error).toContain('mismatch');
    });
  });

  // ============================================================================
  // 4. Manager Bot (Phase 5)
  // ============================================================================
  describe('Phase 5 — Manager Bot & RBAC', () => {
    it('should generate and verify manager pairing code', async () => {
      const { code, deepLink } = await ManagerPairingService.generatePairingCode(
        'mgr-prof-1',
        'admin-user-1'
      );

      expect(code).toMatch(/^ABL-[A-F0-9]{6}$/);
      expect(deepLink).toContain('AliBrosManagerBot');

      const res = await ManagerPairingService.verifyAndLinkManager(999111, code, {
        username: 'manager_anna',
      });
      expect(res.success).toBe(true);
      expect(res.fullName).toBeDefined();

      // Reuse must fail
      const reuse = await ManagerPairingService.verifyAndLinkManager(999111, code, {
        username: 'manager_anna',
      });
      expect(reuse.success).toBe(false);
    });
  });

  // ============================================================================
  // 5. Group Notifications (Phase 6)
  // ============================================================================
  describe('Phase 6 — Group Notifications & Formatting', () => {
    it('should format all group event types cleanly', () => {
      const samplePayload = {
        orderId: 'ord-1',
        orderNumber: 'AB-20261109-9999',
        marketplace: 'WILDBERRIES',
        warehouseName: 'Коледино',
        totalBoxesCount: 15,
        totalPalletsCount: 2,
        driverName: 'Иванов Иван',
        scheduledPickupAt: new Date('2026-11-15'),
      };

      const events: TelegramGroupEventType[] = [
        'ORDER_CREATED',
        'ORDER_CONFIRMED',
        'ORDER_REJECTED',
        'DRIVER_ASSIGNED',
        'DRIVER_ACCEPTED',
        'CARGO_PICKED_UP',
        'IN_TRANSIT',
        'DELIVERED_TO_WAREHOUSE',
        'ACCEPTED_BY_MARKETPLACE',
        'ORDER_COMPLETED',
        'PHOTO_UPLOADED',
        'ORDER_PROBLEM',
        'COST_CALCULATED',
      ];

      for (const evt of events) {
        const msg = TelegramNotificationService.buildGroupMessage(evt, samplePayload);
        expect(msg).toContain('AliBros Logistics');
        expect(msg).toContain(samplePayload.orderNumber);
        expect(msg).toContain('Коледино');
      }
    });

    it('should respect TELEGRAM_ENABLE_GROUP_NOTIFICATIONS=false and skip sending', async () => {
      process.env.TELEGRAM_ENABLE_GROUP_NOTIFICATIONS = 'false';

      const res = await TelegramNotificationService.notifyGroupEvent('ORDER_CREATED', {
        orderId: 'ord-disabled',
        orderNumber: 'AB-001',
        marketplace: 'OZON',
        warehouseName: 'Хоругвино',
        totalBoxesCount: 5,
        totalPalletsCount: 0,
      });

      expect(res.sent).toBe(false);
      expect(res.skippedReason).toBe('GROUP_NOTIFICATIONS_DISABLED');
    });

    it('should prevent duplicate group notifications using 10m sliding window dedup', async () => {
      process.env.TELEGRAM_ENABLE_GROUP_NOTIFICATIONS = 'true';
      process.env.TELEGRAM_ENABLE_GROUP_NOTIFICATIONS = 'true';
      process.env.TELEGRAM_MANAGER_GROUP_CHAT_ID = '-1003893397086';
      process.env.TELEGRAM_MANAGER_BOT_TOKEN = 'mock-manager-bot-token';

      const sendSpy = vi.spyOn(TelegramBotClient.prototype, 'sendMessage').mockResolvedValue(true);

      const payload = {
        orderId: 'ord-dedup-test',
        orderNumber: 'AB-DEDUP-001',
        marketplace: 'WILDBERRIES',
        warehouseName: 'Электросталь',
        totalBoxesCount: 10,
        totalPalletsCount: 1,
      };

      // First call (mocking successful send)
      const firstRes = await TelegramNotificationService.notifyGroupEvent('ORDER_CREATED', payload);
      expect(firstRes.duplicate).toBeFalsy();
      expect(firstRes.sent).toBe(true);

      // Immediate second call with identical payload must be recognized as duplicate
      const secondRes = await TelegramNotificationService.notifyGroupEvent('ORDER_CREATED', payload);
      expect(secondRes.sent).toBe(false);
      expect(secondRes.duplicate).toBe(true);
      sendSpy.mockRestore();
    });
  });

  // ============================================================================
  // 6. Reliability & Concurrency (Phase 8)
  // ============================================================================
  describe('Phase 8 — Reliability, Rate Limiting & Fail-Open', () => {
    it('RateLimiter should correctly limit requests in window and reset', () => {
      const limiter = new RateLimiter({ windowMs: 1000, maxRequests: 3 });
      expect(limiter.check('user-1').allowed).toBe(true);
      expect(limiter.check('user-1').allowed).toBe(true);
      expect(limiter.check('user-1').allowed).toBe(true);
      expect(limiter.check('user-1').allowed).toBe(false); // 4th request rejected
    });

    it('DatabaseRateLimiter should fall back to memory when DB errors (fail-open for app availability)', async () => {
      const originalUrl = process.env.DATABASE_URL;
      delete process.env.DATABASE_URL;

      const res = await DatabaseRateLimiter.consume('key-fallback-test', 5, 60000);
      expect(res.allowed).toBe(true);
      expect(res.remaining).toBe(4);

      process.env.DATABASE_URL = originalUrl;
    });
  });
});
