import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TelegramDeduplicationService } from '@/modules/telegram/deduplication.service';
import { DatabaseRateLimiter, RateLimiter } from '@/lib/security/rate-limit';
import { TelegramUpdateStatus } from '@prisma/client';

vi.mock('@/database/prisma', async () => {
  const { sharedMockPrisma } = await import('../mocks/mock-prisma');
  return {
    prisma: sharedMockPrisma.mockClient,
  };
});

import { sharedMockPrisma } from '../mocks/mock-prisma';
const { mockClient, telegramProcessedUpdates } = sharedMockPrisma;


describe('P1 Reliability Fixes: Distributed Telegram Deduplication & Rate Limiting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
    telegramProcessedUpdates.clear();
  });

  // ==========================================================================
  // P1-3: Telegram Distributed Deduplication Tests
  // ==========================================================================
  describe('P1-3: Telegram Webhook Distributed Deduplication (PostgreSQL-backed)', () => {
    it('1. Первичное получение: успешно резервирует статус PROCESSING', async () => {
      const claim = await TelegramDeduplicationService.claimUpdate('driver', 12345678n);
      expect(claim.canProcess).toBe(true);
      expect(claim.reason).toBe('CLAIMED');

      const compositeKey = 'driver:12345678';
      const stored = telegramProcessedUpdates.get(compositeKey);
      expect(stored).toBeDefined();
      expect(stored.status).toBe(TelegramUpdateStatus.PROCESSING);
      expect(stored.attempts).toBe(1);
    });

    it('2. Параллельный дубликат (in-flight): второй инстанс отклоняет выполнение', async () => {
      // Instance A claims update
      const claimA = await TelegramDeduplicationService.claimUpdate('driver', 99887766n);
      expect(claimA.canProcess).toBe(true);

      // Instance B receives duplicate while Instance A is still processing (<30s)
      const claimB = await TelegramDeduplicationService.claimUpdate('driver', 99887766n);
      expect(claimB.canProcess).toBe(false);
      expect(claimB.reason).toBe('IN_FLIGHT_OTHER_INSTANCE');
    });

    it('3. Повторная доставка после завершения: отклоняется со статусом ALREADY_PROCESSED', async () => {
      const updateId = 55443322n;

      // 1. Claim
      await TelegramDeduplicationService.claimUpdate('driver', updateId);

      // 2. Complete processing
      await TelegramDeduplicationService.markCompleted('driver', updateId);

      // 3. Telegram resends update after timeout
      const duplicateClaim = await TelegramDeduplicationService.claimUpdate('driver', updateId);
      expect(duplicateClaim.canProcess).toBe(false);
      expect(duplicateClaim.reason).toBe('ALREADY_PROCESSED');
    });

    it('4. Восстановление зависшей блокировки (> 30 сек): разрешает повторную обработку', async () => {
      const updateId = 88776655n;
      const compositeKey = `driver:${updateId}`;

      // Simulate an update stuck in PROCESSING from 45 seconds ago
      telegramProcessedUpdates.set(compositeKey, {
        id: 'tg-stuck-1',
        botType: 'driver',
        updateId,
        status: TelegramUpdateStatus.PROCESSING,
        attempts: 1,
        updatedAt: new Date(Date.now() - 45 * 1000), // 45s ago
        expiresAt: new Date(Date.now() + 86400 * 1000),
      });

      const recoveryClaim = await TelegramDeduplicationService.claimUpdate('driver', updateId);
      expect(recoveryClaim.canProcess).toBe(true);
      expect(recoveryClaim.reason).toBe('RETRY_STALE_LOCK');

      // Verify attempts incremented
      const updated = telegramProcessedUpdates.get(compositeKey);
      expect(updated.attempts).toBe(2);
    });

    it('5. Превышение лимита попыток (3): перманентно помечает как FAILED и прекращает ретраи', async () => {
      const updateId = 77665544n;
      const compositeKey = `driver:${updateId}`;

      // Simulate 3 prior failed attempts
      telegramProcessedUpdates.set(compositeKey, {
        id: 'tg-exhausted-1',
        botType: 'driver',
        updateId,
        status: TelegramUpdateStatus.PROCESSING,
        attempts: 3,
        updatedAt: new Date(Date.now() - 45 * 1000),
        expiresAt: new Date(Date.now() + 86400 * 1000),
      });

      const exhaustedClaim = await TelegramDeduplicationService.claimUpdate('driver', updateId);
      expect(exhaustedClaim.canProcess).toBe(false);
      expect(exhaustedClaim.reason).toBe('MAX_ATTEMPTS_EXCEEDED');

      const finalRecord = telegramProcessedUpdates.get(compositeKey);
      expect(finalRecord.status).toBe(TelegramUpdateStatus.FAILED);
    });

    it('6. Изоляция типов ботов: одинаковый updateId в разных ботах обрабатывается раздельно', async () => {
      const updateId = 11223344n;

      const driverClaim = await TelegramDeduplicationService.claimUpdate('driver', updateId);
      const managerClaim = await TelegramDeduplicationService.claimUpdate('manager', updateId);

      expect(driverClaim.canProcess).toBe(true);
      expect(managerClaim.canProcess).toBe(true);
    });
  });

  // ==========================================================================
  // P1-4: Distributed Rate Limiting Tests
  // ==========================================================================
  describe('P1-4: Distributed Rate Limiting', () => {
    it('1. Атомарный подсчёт: разрешает запросы в пределах лимита и декрементирует remaining', () => {
      const limiter = new RateLimiter({ windowMs: 60000, maxRequests: 5 });
      const key = 'test-user-1';

      for (let i = 1; i <= 5; i++) {
        const res = limiter.check(key);
        expect(res.allowed).toBe(true);
        expect(res.remaining).toBe(5 - i);
      }

      // 6th request must be blocked
      const blocked = limiter.check(key);
      expect(blocked.allowed).toBe(false);
      expect(blocked.remaining).toBe(0);
    });

    it('2. Очистка окна: после истечения windowMs лимит сбрасывается', () => {
      const limiter = new RateLimiter({ windowMs: 1000, maxRequests: 2 });
      const key = 'test-user-reset';

      limiter.check(key);
      limiter.check(key);
      expect(limiter.check(key).allowed).toBe(false);

      // Advance time beyond window
      vi.useFakeTimers();
      vi.advanceTimersByTime(1500);

      const resetCheck = limiter.check(key);
      expect(resetCheck.allowed).toBe(true);
      expect(resetCheck.remaining).toBe(1);

      vi.useRealTimers();
    });

    it('3. Изоляция разных ключей: лимит одного пользователя не влияет на другого', () => {
      const limiter = new RateLimiter({ windowMs: 60000, maxRequests: 2 });

      limiter.check('user-A');
      limiter.check('user-A');
      expect(limiter.check('user-A').allowed).toBe(false);

      // User B must still be allowed
      expect(limiter.check('user-B').allowed).toBe(true);
    });

    it('4. DatabaseRateLimiter.consume: работает корректно с базой данных', async () => {
      const res = await DatabaseRateLimiter.consume('tg:user:777123', 40, 60000);
      expect(res.allowed).toBe(true);
      expect(res.remaining).toBeLessThanOrEqual(40);
    });
  });
});
