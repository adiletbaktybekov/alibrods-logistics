import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/telegram/webhook/route';
import { logger } from '@/lib/logger';

vi.mock('@/database/prisma', async () => {
  const { sharedMockPrisma } = await import('../mocks/mock-prisma');
  return {
    prisma: sharedMockPrisma.mockClient,
  };
});

vi.mock('@/modules/telegram/bot.service', () => ({
  TelegramBotService: {
    handleUpdate: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@/modules/telegram/deduplication.service', () => ({
  TelegramDeduplicationService: {
    claimUpdate: vi.fn().mockResolvedValue({ canProcess: true, reason: 'CLAIMED' }),
    markCompleted: vi.fn().mockResolvedValue(undefined),
    markFailed: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@/lib/security/rate-limit', () => ({
  DatabaseRateLimiter: {
    consume: vi.fn().mockResolvedValue({ allowed: true, remaining: 39 }),
  },
}));

describe('Telegram Webhook Security & Secret Sanitization', () => {
  const originalEnv = { ...process.env };
  const mockSecret = 'super-secret-telegram-webhook-token-1234567890';

  let loggerWarnSpy: ReturnType<typeof vi.spyOn>;
  let loggerErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.TELEGRAM_BOT_WEBHOOK_SECRET = mockSecret;
    loggerWarnSpy = vi.spyOn(logger, 'warn');
    loggerErrorSpy = vi.spyOn(logger, 'error');
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it('rejects requests with missing secret token in production (403) without logging secrets', async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';

    const req = new NextRequest('https://staging.alibros.com/api/telegram/webhook?bot=driver', {
      method: 'POST',
      headers: {},
      body: JSON.stringify({ update_id: 100 }),
    });

    const res = await POST(req);
    expect(res.status).toBe(403);

    const body = await res.json();
    expect(body.error).toBe('Unauthorized webhook request');

    // Ensure logger never logged secret
    expect(loggerWarnSpy).toHaveBeenCalled();
    for (const call of loggerWarnSpy.mock.calls) {
      const logPayload = JSON.stringify(call);
      expect(logPayload).not.toContain(mockSecret);
      expect(logPayload).not.toContain('receivedHeader');
    }
  });

  it('rejects requests with invalid secret token (403) and sanitizes logs', async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
    const fakeSecret = 'malicious-injected-token-attempt';

    const req = new NextRequest('https://staging.alibros.com/api/telegram/webhook?bot=driver', {
      method: 'POST',
      headers: {
        'x-telegram-bot-api-secret-token': fakeSecret,
      },
      body: JSON.stringify({ update_id: 100 }),
    });

    const res = await POST(req);
    expect(res.status).toBe(403);

    // Verify logger sanitization: only metadata (hasHeader, headerLength), never actual tokens
    expect(loggerWarnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        hasHeader: true,
        headerLength: fakeSecret.length,
      }),
      expect.stringContaining('Invalid or missing Telegram webhook secret token')
    );

    for (const call of loggerWarnSpy.mock.calls) {
      const logPayload = JSON.stringify(call);
      expect(logPayload).not.toContain(fakeSecret);
      expect(logPayload).not.toContain(mockSecret);
      expect(logPayload).not.toContain('receivedHeader');
    }
  });

  it('accepts valid secret token and processes update (200)', async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';

    const req = new NextRequest('https://staging.alibros.com/api/telegram/webhook?bot=driver', {
      method: 'POST',
      headers: {
        'x-telegram-bot-api-secret-token': mockSecret,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        update_id: 999123,
        message: {
          message_id: 1,
          from: { id: 1234567 },
          chat: { id: 1234567, type: 'private' },
          text: '/start',
        },
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it('handles length mismatch securely without throwing or leaking in timingSafeEqual', async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
    const shortSecret = 'short';

    const req = new NextRequest('https://staging.alibros.com/api/telegram/webhook?bot=driver', {
      method: 'POST',
      headers: {
        'x-telegram-bot-api-secret-token': shortSecret,
      },
      body: JSON.stringify({ update_id: 100 }),
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
  });
});
