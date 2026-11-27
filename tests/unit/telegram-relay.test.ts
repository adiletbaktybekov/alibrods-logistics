import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as telegramRelayPost } from '@/app/api/internal/telegram-relay/route';
import { _resetTelegramRelayStateForTests } from '@/integrations/telegram/relay';
import {
  TelegramBotClient,
  getClientTelegramBotClient,
  getDriverTelegramBotClient,
  getManagerTelegramBotClient,
  resetTelegramBotClient,
} from '@/integrations/telegram/client';
import { logger } from '@/lib/logger';

const VALID_RELAY_SECRET = 'test-relay-secret-with-more-than-32-chars-0123456789';

function createRelayRequest(
  body: unknown,
  options?: {
    url?: string;
    authHeader?: string | null;
    timestamp?: string | null;
    idempotencyKey?: string | null;
    forwardedProto?: string | null;
  }
): NextRequest {
  const headers = new Headers({ 'content-type': 'application/json' });

  if (options?.authHeader !== null) {
    headers.set('authorization', options?.authHeader ?? `Bearer ${VALID_RELAY_SECRET}`);
  }
  if (options?.timestamp !== null) {
    headers.set('x-relay-timestamp', options?.timestamp ?? String(Date.now()));
  }
  if (options?.idempotencyKey !== null) {
    headers.set('x-idempotency-key', options?.idempotencyKey ?? 'idem-key-12345678');
  }
  if (options?.forwardedProto !== null && options?.forwardedProto !== undefined) {
    headers.set('x-forwarded-proto', options.forwardedProto);
  }

  return new NextRequest(options?.url ?? 'https://logistics.alibros.ru/api/internal/telegram-relay', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('Telegram Relay Security & Client Integration', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    _resetTelegramRelayStateForTests();
    resetTelegramBotClient();
    process.env = { ...originalEnv };
    delete process.env.DATABASE_URL;
    process.env.TELEGRAM_RELAY_SECRET = VALID_RELAY_SECRET;
    process.env.TELEGRAM_CLIENT_BOT_TOKEN = 'client-secret-token-xyz';
    process.env.TELEGRAM_DRIVER_BOT_TOKEN = 'driver-secret-token-xyz';
    process.env.TELEGRAM_MANAGER_BOT_TOKEN = 'manager-secret-token-xyz';
    process.env.TELEGRAM_RELAY_RATE_LIMIT_MAX = '100';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    _resetTelegramRelayStateForTests();
    resetTelegramBotClient();
  });

  it('fails closed with 503 when TELEGRAM_RELAY_SECRET is missing or too short', async () => {
    delete process.env.TELEGRAM_RELAY_SECRET;
    const req = createRelayRequest({ bot: 'client', method: 'getMe', params: {} });
    const res = await telegramRelayPost(req);
    expect(res.status).toBe(503);

    process.env.TELEGRAM_RELAY_SECRET = 'short-secret';
    const resShort = await telegramRelayPost(
      createRelayRequest({ bot: 'client', method: 'getMe', params: {} }, { authHeader: 'Bearer short-secret' })
    );
    expect(resShort.status).toBe(503);
  });

  it('rejects non-HTTPS requests with 403 in production', async () => {
    (process.env as Record<string, string>).NODE_ENV = 'production';
    const req = createRelayRequest(
      { bot: 'client', method: 'getMe', params: {} },
      { url: 'http://logistics.alibros.ru/api/internal/telegram-relay', forwardedProto: 'http' }
    );
    const res = await telegramRelayPost(req);
    expect(res.status).toBe(403);
  });

  it('rejects missing or invalid Bearer token with 401', async () => {
    const resMissing = await telegramRelayPost(
      createRelayRequest({ bot: 'client', method: 'getMe', params: {} }, { authHeader: null })
    );
    expect(resMissing.status).toBe(401);

    const resWrong = await telegramRelayPost(
      createRelayRequest(
        { bot: 'client', method: 'getMe', params: {} },
        { authHeader: 'Bearer wrong-secret-token-with-same-length-1234567890123' }
      )
    );
    expect(resWrong.status).toBe(401);
  });

  it('rejects stale or missing X-Relay-Timestamp to prevent replay attacks', async () => {
    const resMissing = await telegramRelayPost(
      createRelayRequest({ bot: 'client', method: 'getMe', params: {} }, { timestamp: null })
    );
    expect(resMissing.status).toBe(401);

    const tenMinutesAgo = String(Date.now() - 10 * 60 * 1000);
    const resStale = await telegramRelayPost(
      createRelayRequest({ bot: 'client', method: 'getMe', params: {} }, { timestamp: tenMinutesAgo })
    );
    expect(resStale.status).toBe(401);
  });

  it('blocks disallowed Telegram methods such as setWebhook and deleteWebhook', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch');

    for (const forbiddenMethod of ['setWebhook', 'deleteWebhook', 'getUpdates', 'logOut']) {
      const res = await telegramRelayPost(
        createRelayRequest({
          bot: 'client',
          method: forbiddenMethod,
          params: { url: 'https://evil.example/webhook' },
        })
      );
      expect(res.status).toBe(400);
    }

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('requires X-Idempotency-Key for mutating methods and deduplicates repeated sends', async () => {
    const resNoKey = await telegramRelayPost(
      createRelayRequest(
        { bot: 'manager', method: 'sendMessage', params: { chat_id: 123, text: 'Hello' } },
        { idempotencyKey: null }
      )
    );
    expect(resNoKey.status).toBe(400);

    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true, result: { message_id: 777 } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );

    const payload = { bot: 'manager', method: 'sendMessage', params: { chat_id: 123, text: 'Order #1' } };
    const first = await telegramRelayPost(createRelayRequest(payload, { idempotencyKey: 'order-1-notify-abc' }));
    expect(first.status).toBe(200);
    expect(first.headers.get('x-relay-replayed')).toBeNull();
    expect(await first.json()).toEqual({ ok: true, result: { message_id: 777 } });

    const second = await telegramRelayPost(createRelayRequest(payload, { idempotencyKey: 'order-1-notify-abc' }));
    expect(second.status).toBe(200);
    expect(second.headers.get('x-relay-replayed')).toBe('true');
    expect(await second.json()).toEqual({ ok: true, result: { message_id: 777 } });

    // Upstream Telegram API must be called only once despite duplicate retry
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.telegram.org/botmanager-secret-token-xyz/sendMessage',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('enforces rate limiting with 429 Too Many Requests', async () => {
    process.env.TELEGRAM_RELAY_RATE_LIMIT_MAX = '2';

    vi.spyOn(global, 'fetch').mockImplementation(async () =>
      new Response(JSON.stringify({ ok: true, result: { id: 1, is_bot: true, first_name: 'Bot' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );

    const r1 = await telegramRelayPost(
      createRelayRequest({ bot: 'driver', method: 'getMe', params: {} }, { idempotencyKey: 'rl-key-0001' })
    );
    const r2 = await telegramRelayPost(
      createRelayRequest({ bot: 'driver', method: 'getMe', params: {} }, { idempotencyKey: 'rl-key-0002' })
    );
    const r3 = await telegramRelayPost(
      createRelayRequest({ bot: 'driver', method: 'getMe', params: {} }, { idempotencyKey: 'rl-key-0003' })
    );

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r3.status).toBe(429);
    expect(r3.headers.get('retry-after')).toBeTruthy();
  });

  it('never leaks bot tokens, relay secrets, or message contents into structured logs', async () => {
    const infoSpy = vi.spyOn(logger, 'info');
    const errorSpy = vi.spyOn(logger, 'error');

    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, result: { message_id: 999 } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );

    const secretText = 'SUPER_PRIVATE_CLIENT_PHONE_+79991234567';
    await telegramRelayPost(
      createRelayRequest(
        { bot: 'client', method: 'sendMessage', params: { chat_id: 42, text: secretText } },
        { idempotencyKey: 'log-check-00001' }
      )
    );

    const serializedLogs = JSON.stringify([...infoSpy.mock.calls, ...errorSpy.mock.calls]);
    expect(serializedLogs).not.toContain(VALID_RELAY_SECRET);
    expect(serializedLogs).not.toContain('client-secret-token-xyz');
    expect(serializedLogs).not.toContain(secretText);
  });

  it('routes TelegramBotClient through relay without requiring local bot tokens when TELEGRAM_RELAY_URL is set', async () => {
    delete process.env.TELEGRAM_CLIENT_BOT_TOKEN;
    delete process.env.TELEGRAM_DRIVER_BOT_TOKEN;
    delete process.env.TELEGRAM_MANAGER_BOT_TOKEN;
    delete process.env.TELEGRAM_BOT_TOKEN;
    process.env.TELEGRAM_RELAY_URL = 'https://logistics.alibros.ru/api/internal/telegram-relay';
    process.env.TELEGRAM_RELAY_SECRET = VALID_RELAY_SECRET;

    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, result: { message_id: 555 } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );

    const clientBot = getClientTelegramBotClient();
    const ok = await clientBot.sendMessage({
      chatId: 123456,
      text: 'Test via relay',
      idempotencyKey: 'client-relay-test-01',
    });

    expect(ok).toBe(true);
    expect(clientBot.lastSentMessageId).toBe(555);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://logistics.alibros.ru/api/internal/telegram-relay');
    expect(init?.method).toBe('POST');
    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${VALID_RELAY_SECRET}`);
    expect(headers['X-Idempotency-Key']).toBe('client-relay-test-01');
    expect(headers['X-Relay-Timestamp']).toMatch(/^\d+$/);
    expect(JSON.parse(String(init?.body))).toEqual({
      bot: 'client',
      method: 'sendMessage',
      params: {
        chat_id: 123456,
        text: 'Test via relay',
        parse_mode: 'HTML',
        reply_markup: undefined,
      },
    });

    // Verify all three singletons expose their roles
    expect(getDriverTelegramBotClient().getBotRole()).toBe('driver');
    expect(getManagerTelegramBotClient().getBotRole()).toBe('manager');
    expect(new TelegramBotClient('direct-only').getBotRole()).toBeUndefined();
  });
});
