import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { TelegramDeduplicationService } from '@/modules/telegram/deduplication.service';
import { TelegramUpdateStatus } from '@prisma/client';
import { POST } from '@/app/api/telegram/webhook/route';
import { TelegramBotService } from '@/modules/telegram/bot.service';
import { DatabaseRateLimiter } from '@/lib/security/rate-limit';

vi.mock('@/database/prisma', async () => {
  const { sharedMockPrisma } = await import('../mocks/mock-prisma');
  return {
    prisma: sharedMockPrisma.mockClient,
  };
});

import { sharedMockPrisma } from '../mocks/mock-prisma';
const { mockClient, telegramProcessedUpdates } = sharedMockPrisma;

vi.mock('@/lib/security/rate-limit', () => ({
  DatabaseRateLimiter: {
    consume: vi.fn(),
  },
}));

describe('Telegram Deduplication Error Classification & Webhook Retry (Neon Failure Resilience)', () => {
  const originalEnv = { ...process.env };
  const mockWebhookSecret = 'test-secret-token-12345678901234567890';

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
    process.env.TELEGRAM_BOT_WEBHOOK_SECRET = mockWebhookSecret;
    vi.mocked(DatabaseRateLimiter.consume).mockResolvedValue({ allowed: true, remaining: 39 } as any);
    telegramProcessedUpdates.clear();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  // 1. Новый Update — обработка разрешена
  it('1. Новый Update: успешно резервирует статус PROCESSING и разрешает обработку', async () => {
    const claim = await TelegramDeduplicationService.claimUpdate('driver', 1001n);
    expect(claim.canProcess).toBe(true);
    expect(claim.reason).toBe('CLAIMED');
    expect(claim.retryable).toBeUndefined();

    const record = telegramProcessedUpdates.get('driver:1001');
    expect(record).toBeDefined();
    expect(record.status).toBe(TelegramUpdateStatus.PROCESSING);
    expect(record.attempts).toBe(1);
  });

  // 2. P2002 — HTTP 200, повторная обработка не запускается
  it('2. P2002 (Prisma Unique Constraint Violation): отклоняет как дубликат без ретрая', async () => {
    // Simulate first instance already claimed
    await TelegramDeduplicationService.claimUpdate('driver', 2002n);

    // Mock create to simulate simultaneous race condition throwing P2002
    const originalFindUnique = mockClient.telegramProcessedUpdate.findUnique;
    const originalCreate = mockClient.telegramProcessedUpdate.create;

    // Simulate findUnique missed it (race condition) but create hit P2002
    mockClient.telegramProcessedUpdate.findUnique = vi.fn().mockResolvedValueOnce(null);
    mockClient.telegramProcessedUpdate.create = vi.fn().mockRejectedValueOnce(
      Object.assign(new Error('Unique constraint failed on the fields: (`botType`,`updateId`)'), {
        code: 'P2002',
        name: 'PrismaClientKnownRequestError',
      })
    );

    const claim = await TelegramDeduplicationService.claimUpdate('driver', 2002n);
    expect(claim.canProcess).toBe(false);
    expect(claim.retryable).toBe(false);
    expect(claim.reason).toBe('IN_FLIGHT_OTHER_INSTANCE');

    // Restore
    mockClient.telegramProcessedUpdate.findUnique = originalFindUnique;
    mockClient.telegramProcessedUpdate.create = originalCreate;
  });

  // 3. Активный PROCESSING — HTTP 200
  it('3. Активный PROCESSING (<30 сек): отклоняет повторный запуск (in-flight)', async () => {
    // Claim first time
    await TelegramDeduplicationService.claimUpdate('driver', 3003n);

    // Concurrent delivery within 30s
    const concurrentClaim = await TelegramDeduplicationService.claimUpdate('driver', 3003n);
    expect(concurrentClaim.canProcess).toBe(false);
    expect(concurrentClaim.retryable).toBe(false);
    expect(concurrentClaim.reason).toBe('IN_FLIGHT_OTHER_INSTANCE');
  });

  // 4. Stale PROCESSING — только один экземпляр получает право на retry
  it('4. Stale PROCESSING (>30 сек): безопасный CAS позволяет ровно одному инстансу возобновить обработку', async () => {
    const updateId = 4004n;
    const staleDate = new Date(Date.now() - 45 * 1000); // 45 seconds ago

    telegramProcessedUpdates.set(`driver:${updateId}`, {
      id: 'stale-record-1',
      botType: 'driver',
      updateId,
      status: TelegramUpdateStatus.PROCESSING,
      attempts: 1,
      updatedAt: staleDate,
      expiresAt: new Date(Date.now() + 86400 * 1000),
    });

    // Instance 1 claims stale lock
    const claim1 = await TelegramDeduplicationService.claimUpdate('driver', updateId);
    expect(claim1.canProcess).toBe(true);
    expect(claim1.reason).toBe('RETRY_STALE_LOCK');

    // Instance 2 attempts immediately after Instance 1 updated the timestamp
    const claim2 = await TelegramDeduplicationService.claimUpdate('driver', updateId);
    expect(claim2.canProcess).toBe(false);
    expect(claim2.retryable).toBe(false);
    expect(claim2.reason).toBe('IN_FLIGHT_OTHER_INSTANCE');
  });

  // 5. Neon connection failure — HTTP 503
  it('5. Neon connection failure: claimUpdate классифицирует как INFRASTRUCTURE_ERROR с retryable=true', async () => {
    const originalFindUnique = mockClient.telegramProcessedUpdate.findUnique;
    mockClient.telegramProcessedUpdate.findUnique = vi.fn().mockRejectedValueOnce(
      new Error("Can't reach database server at `ep-restless-wave-b9k0ye9q-pooler.c-7.eu-central-1.aws.neon.tech:5432`")
    );

    const claim = await TelegramDeduplicationService.claimUpdate('driver', 5005n);
    expect(claim.canProcess).toBe(false);
    expect(claim.retryable).toBe(true);
    expect(claim.reason).toBe('INFRASTRUCTURE_ERROR');

    mockClient.telegramProcessedUpdate.findUnique = originalFindUnique;
  });

  // 6. Prisma initialization failure — HTTP 503
  it('6. Prisma initialization failure: классифицирует как INFRASTRUCTURE_ERROR с retryable=true', async () => {
    const originalFindUnique = mockClient.telegramProcessedUpdate.findUnique;
    const initError = Object.assign(
      new Error('PrismaClientInitializationError: Unable to connect to Neon database connection pool'),
      { name: 'PrismaClientInitializationError' }
    );
    mockClient.telegramProcessedUpdate.findUnique = vi.fn().mockRejectedValueOnce(initError);

    const claim = await TelegramDeduplicationService.claimUpdate('driver', 6006n);
    expect(claim.canProcess).toBe(false);
    expect(claim.retryable).toBe(true);
    expect(claim.reason).toBe('INFRASTRUCTURE_ERROR');

    mockClient.telegramProcessedUpdate.findUnique = originalFindUnique;
  });

  // 7. Неизвестная ошибка базы — безопасный HTTP 503
  it('7. Неизвестная ошибка базы данных: классифицирует как INFRASTRUCTURE_ERROR с retryable=true', async () => {
    const originalFindUnique = mockClient.telegramProcessedUpdate.findUnique;
    mockClient.telegramProcessedUpdate.findUnique = vi.fn().mockRejectedValueOnce(
      new Error('Socket timeout while reading from connection')
    );

    const claim = await TelegramDeduplicationService.claimUpdate('driver', 7007n);
    expect(claim.canProcess).toBe(false);
    expect(claim.retryable).toBe(true);
    expect(claim.reason).toBe('INFRASTRUCTURE_ERROR');

    mockClient.telegramProcessedUpdate.findUnique = originalFindUnique;
  });

  // 8. HTTP-ответ не содержит внутренних ошибок и секретов
  it('8. Webhook route возвращает HTTP 503 без утечки деталей базы данных или секретов', async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';

    // Mock claimUpdate to simulate infrastructure failure
    const claimSpy = vi.spyOn(TelegramDeduplicationService, 'claimUpdate').mockResolvedValueOnce({
      canProcess: false,
      retryable: true,
      reason: 'INFRASTRUCTURE_ERROR',
    });

    const req = new NextRequest('https://staging.alibros.com/api/telegram/webhook?bot=driver', {
      method: 'POST',
      headers: {
        'x-telegram-bot-api-secret-token': mockWebhookSecret,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        update_id: 8008,
        message: {
          message_id: 1,
          from: { id: 777123 },
          chat: { id: 777123, type: 'private' },
          text: '/start',
        },
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(503);

    const body = await res.json();
    expect(body.error).toBe('Service temporarily unavailable');

    // Ensure no internal details leaked
    const responseString = JSON.stringify(body);
    expect(responseString).not.toContain('prisma');
    expect(responseString).not.toContain('neon');
    expect(responseString).not.toContain('password');
    expect(responseString).not.toContain('database');
    expect(responseString).not.toContain(mockWebhookSecret);

    claimSpy.mockRestore();
  });

  // 9. Повторная доставка после восстановления БД не создаёт дублирующих бизнес-операций
  it('9. Повторная доставка после восстановления БД обрабатывается ровно 1 раз', async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';

    const handleUpdateSpy = vi.spyOn(TelegramBotService, 'handleUpdate').mockResolvedValue();

    const updatePayload = {
      update_id: 9009,
      message: {
        message_id: 42,
        from: { id: 777888 },
        chat: { id: 777888, type: 'private' },
        text: '/start',
      },
    };

    const makeRequest = () =>
      new NextRequest('https://staging.alibros.com/api/telegram/webhook?bot=driver', {
        method: 'POST',
        headers: {
          'x-telegram-bot-api-secret-token': mockWebhookSecret,
          'content-type': 'application/json',
        },
        body: JSON.stringify(updatePayload),
      });

    // Attempt 1: DB fails -> returns 503, handleUpdate is NOT called
    const originalFindUnique = mockClient.telegramProcessedUpdate.findUnique;
    mockClient.telegramProcessedUpdate.findUnique = vi.fn().mockRejectedValueOnce(
      new Error('Connection terminated unexpectedly')
    );

    const res1 = await POST(makeRequest());
    expect(res1.status).toBe(503);
    expect(handleUpdateSpy).not.toHaveBeenCalled();

    // Restore DB mock
    mockClient.telegramProcessedUpdate.findUnique = originalFindUnique;

    // Attempt 2: Telegram retries after DB recovers -> returns 200, handleUpdate called once
    const res2 = await POST(makeRequest());
    expect(res2.status).toBe(200);
    expect(await res2.json()).toEqual({ ok: true });
    expect(handleUpdateSpy).toHaveBeenCalledTimes(1);

    // Attempt 3: Telegram sends duplicate delivery -> returns 200 duplicate, handleUpdate NOT called again
    const res3 = await POST(makeRequest());
    expect(res3.status).toBe(200);
    const body3 = await res3.json();
    expect(body3.duplicate).toBe(true);
    expect(handleUpdateSpy).toHaveBeenCalledTimes(1); // Still 1!
  });
});
