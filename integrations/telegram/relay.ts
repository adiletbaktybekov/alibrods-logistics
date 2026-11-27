import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { DatabaseRateLimiter } from '@/lib/security/rate-limit';

export const ALLOWED_TELEGRAM_RELAY_BOTS = ['client', 'driver', 'manager'] as const;
export type TelegramRelayBotRole = (typeof ALLOWED_TELEGRAM_RELAY_BOTS)[number];

export const ALLOWED_TELEGRAM_RELAY_METHODS = [
  'sendMessage',
  'editMessageText',
  'sendPhoto',
  'answerCallbackQuery',
  'getMe',
  'getChat',
  'getChatMember',
  'getFile',
  'setChatMenuButton',
  'getChatMenuButton',
  'setMyCommands',
] as const;

export type TelegramRelayMethod = (typeof ALLOWED_TELEGRAM_RELAY_METHODS)[number];

const MUTATING_METHODS = new Set<TelegramRelayMethod>([
  'sendMessage',
  'editMessageText',
  'sendPhoto',
  'answerCallbackQuery',
  'setChatMenuButton',
  'setMyCommands',
]);

const relayRequestSchema = z.object({
  bot: z.enum(ALLOWED_TELEGRAM_RELAY_BOTS),
  method: z.enum(ALLOWED_TELEGRAM_RELAY_METHODS),
  params: z.record(z.unknown()).optional().default({}),
});

const IDEMPOTENCY_KEY_PATTERN = /^[a-zA-Z0-9._:-]{8,128}$/;
const REPLAY_WINDOW_MS = 5 * 60 * 1000; // ±5 minutes
const IDEMPOTENCY_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_IDEMPOTENCY_ENTRIES = 2000;
const UPSTREAM_TIMEOUT_MS = 10_000;
const DEFAULT_RATE_LIMIT_MAX = 120;
const DEFAULT_RATE_LIMIT_WINDOW_MS = 60_000;

interface IdempotencyCacheEntry {
  status: 'in_flight' | 'completed';
  httpStatus?: number;
  body?: unknown;
  expiresAt: number;
}

const idempotencyCache = new Map<string, IdempotencyCacheEntry>();

export function _resetTelegramRelayStateForTests(): void {
  idempotencyCache.clear();
}

function pruneIdempotencyCache(now: number): void {
  for (const [key, entry] of idempotencyCache.entries()) {
    if (entry.expiresAt <= now) {
      idempotencyCache.delete(key);
    }
  }
  if (idempotencyCache.size >= MAX_IDEMPOTENCY_ENTRIES) {
    const oldestKey = idempotencyCache.keys().next().value;
    if (oldestKey) {
      idempotencyCache.delete(oldestKey);
    }
  }
}

function timingSafeSecretEqual(provided: string, expected: string): boolean {
  const providedHash = crypto.createHash('sha256').update(provided).digest();
  const expectedHash = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(providedHash, expectedHash);
}

function isHttpsRequest(request: NextRequest): boolean {
  const forwardedProto = request.headers.get('x-forwarded-proto');
  if (forwardedProto) {
    const primaryProto = forwardedProto.split(',')[0]?.trim().toLowerCase();
    return primaryProto === 'https';
  }
  try {
    return new URL(request.url).protocol === 'https:';
  } catch {
    return false;
  }
}

function resolveBotToken(bot: TelegramRelayBotRole): string {
  switch (bot) {
    case 'client':
      return process.env.TELEGRAM_CLIENT_BOT_TOKEN?.trim() || '';
    case 'driver':
      return process.env.TELEGRAM_DRIVER_BOT_TOKEN?.trim() || '';
    case 'manager':
      return process.env.TELEGRAM_MANAGER_BOT_TOKEN?.trim() || '';
  }
}

export async function handleTelegramRelayRequest(request: NextRequest): Promise<NextResponse> {
  const startedAt = Date.now();

  // 1. Enforce HTTPS in production
  if (process.env.NODE_ENV === 'production' && !isHttpsRequest(request)) {
    logger.warn({ event: 'TELEGRAM_RELAY_REJECTED', reason: 'https_required' });
    return NextResponse.json(
      { ok: false, description: 'HTTPS is required for Telegram relay' },
      { status: 403 }
    );
  }

  // 2. Fail closed if relay secret is not configured
  const expectedSecret = process.env.TELEGRAM_RELAY_SECRET?.trim() || '';
  if (expectedSecret.length < 24) {
    logger.warn({ event: 'TELEGRAM_RELAY_DISABLED', reason: 'secret_not_configured' });
    return NextResponse.json(
      { ok: false, description: 'Telegram relay is not enabled' },
      { status: 503 }
    );
  }

  // 3. Authenticate Bearer token using constant-time comparison
  const authHeader = request.headers.get('authorization') || '';
  const bearerMatch = /^Bearer\s+(.+)$/i.exec(authHeader);
  const providedSecret = bearerMatch?.[1]?.trim() || '';
  if (!providedSecret || !timingSafeSecretEqual(providedSecret, expectedSecret)) {
    logger.warn({ event: 'TELEGRAM_RELAY_UNAUTHORIZED', reason: 'invalid_bearer_token' });
    return NextResponse.json(
      { ok: false, description: 'Unauthorized' },
      { status: 401 }
    );
  }

  // 4. Validate timestamp to block stale replay attacks
  const rawTimestamp = request.headers.get('x-relay-timestamp')?.trim();
  if (!rawTimestamp || !/^\d{10,16}$/.test(rawTimestamp)) {
    logger.warn({ event: 'TELEGRAM_RELAY_REJECTED', reason: 'missing_or_invalid_timestamp' });
    return NextResponse.json(
      { ok: false, description: 'Missing or invalid X-Relay-Timestamp header' },
      { status: 401 }
    );
  }
  const timestampMs = Number(rawTimestamp);
  const now = Date.now();
  if (!Number.isFinite(timestampMs) || Math.abs(now - timestampMs) > REPLAY_WINDOW_MS) {
    logger.warn({ event: 'TELEGRAM_RELAY_REJECTED', reason: 'replay_window_exceeded' });
    return NextResponse.json(
      { ok: false, description: 'Request timestamp outside allowed replay window' },
      { status: 401 }
    );
  }

  // 5. Parse and validate JSON payload against strict bot & method allowlists
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, description: 'Invalid JSON payload' },
      { status: 400 }
    );
  }

  const parsed = relayRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    logger.warn({ event: 'TELEGRAM_RELAY_INVALID_PAYLOAD' });
    return NextResponse.json(
      { ok: false, description: 'Invalid bot or disallowed Telegram API method' },
      { status: 400 }
    );
  }

  const { bot, method, params } = parsed.data;

  // 6. Rate limiting
  const maxRequests = Math.max(
    1,
    Number(process.env.TELEGRAM_RELAY_RATE_LIMIT_MAX || DEFAULT_RATE_LIMIT_MAX) || DEFAULT_RATE_LIMIT_MAX
  );
  const rateLimit = await DatabaseRateLimiter.consume(
    `telegram-relay:${bot}`,
    maxRequests,
    DEFAULT_RATE_LIMIT_WINDOW_MS
  );
  if (!rateLimit.allowed) {
    const retryAfterSec = Math.max(1, Math.ceil((rateLimit.resetAt - Date.now()) / 1000));
    logger.warn({
      event: 'TELEGRAM_RELAY_RATE_LIMITED',
      bot,
      method,
      retryAfterSec,
    });
    return NextResponse.json(
      { ok: false, description: 'Rate limit exceeded' },
      {
        status: 429,
        headers: { 'Retry-After': String(retryAfterSec) },
      }
    );
  }

  // 7. Idempotency / duplicate delivery protection
  const idempotencyKey = request.headers.get('x-idempotency-key')?.trim() || '';
  if (MUTATING_METHODS.has(method) && !IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
    return NextResponse.json(
      { ok: false, description: 'Valid X-Idempotency-Key header is required for mutating methods' },
      { status: 400 }
    );
  }
  if (idempotencyKey && !IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
    return NextResponse.json(
      { ok: false, description: 'Invalid X-Idempotency-Key format' },
      { status: 400 }
    );
  }

  const cacheKey = idempotencyKey ? `${bot}:${method}:${idempotencyKey}` : '';
  if (cacheKey) {
    pruneIdempotencyCache(now);
    const existing = idempotencyCache.get(cacheKey);
    if (existing && existing.expiresAt > now) {
      if (existing.status === 'in_flight') {
        logger.warn({
          event: 'TELEGRAM_RELAY_DUPLICATE_IN_FLIGHT',
          bot,
          method,
          idempotencyKey,
        });
        return NextResponse.json(
          { ok: false, description: 'Duplicate request is already in progress' },
          { status: 409, headers: { 'Retry-After': '2' } }
        );
      }

      logger.info({
        event: 'TELEGRAM_RELAY_REPLAYED',
        bot,
        method,
        idempotencyKey,
        httpStatus: existing.httpStatus ?? 200,
        durationMs: Date.now() - startedAt,
      });
      return NextResponse.json(existing.body, {
        status: existing.httpStatus ?? 200,
        headers: { 'X-Relay-Replayed': 'true' },
      });
    }

    idempotencyCache.set(cacheKey, {
      status: 'in_flight',
      expiresAt: now + IDEMPOTENCY_TTL_MS,
    });
  }

  // 8. Resolve bot token strictly on relay side (tokens never leave relay host)
  const botToken = resolveBotToken(bot);
  if (!botToken) {
    if (cacheKey) {
      idempotencyCache.delete(cacheKey);
    }
    logger.error({
      event: 'TELEGRAM_RELAY_BOT_NOT_CONFIGURED',
      bot,
      method,
    });
    return NextResponse.json(
      { ok: false, description: `Bot token for '${bot}' is not configured on relay` },
      { status: 503 }
    );
  }

  // 9. Forward to Telegram Bot API with strict timeout and secret-free logging
  try {
    const upstreamResponse = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });

    const responseData = await upstreamResponse.json().catch(() => ({
      ok: false,
      description: 'Invalid JSON response from Telegram API',
    }));

    const durationMs = Date.now() - startedAt;
    const isSuccess = Boolean(upstreamResponse.ok && responseData?.ok);

    if (cacheKey) {
      if (isSuccess) {
        idempotencyCache.set(cacheKey, {
          status: 'completed',
          httpStatus: upstreamResponse.status,
          body: responseData,
          expiresAt: Date.now() + IDEMPOTENCY_TTL_MS,
        });
      } else {
        idempotencyCache.delete(cacheKey);
      }
    }

    logger.info({
      event: isSuccess ? 'TELEGRAM_RELAY_SUCCESS' : 'TELEGRAM_RELAY_UPSTREAM_ERROR',
      bot,
      method,
      idempotencyKey: idempotencyKey || undefined,
      httpStatus: upstreamResponse.status,
      ok: isSuccess,
      durationMs,
    });

    return NextResponse.json(responseData, { status: upstreamResponse.status });
  } catch (err: unknown) {
    if (cacheKey) {
      idempotencyCache.delete(cacheKey);
    }

    const isTimeout = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
    const durationMs = Date.now() - startedAt;

    logger.error({
      event: 'TELEGRAM_RELAY_NETWORK_ERROR',
      bot,
      method,
      idempotencyKey: idempotencyKey || undefined,
      timeout: isTimeout,
      errorName: err instanceof Error ? err.name : 'UnknownError',
      durationMs,
    });

    return NextResponse.json(
      {
        ok: false,
        description: isTimeout
          ? 'Upstream Telegram API request timed out'
          : 'Network error while forwarding to Telegram API',
      },
      { status: isTimeout ? 504 : 502 }
    );
  }
}
