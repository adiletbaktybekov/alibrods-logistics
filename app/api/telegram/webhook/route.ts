import { NextRequest, NextResponse } from 'next/server';
import { TelegramBotService, TelegramIncomingUpdate } from '@/modules/telegram/bot.service';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

// Sliding-window rate limiter per telegram user ID (max 40 requests/min)
const rateLimitMap = new Map<number, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 40;

// Deduplication store for callback queries (TTL 5 minutes)
const processedCallbacks = new Map<string, number>();

function isRateLimited(userId: number): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);

  if (!entry || entry.resetAt < now) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  entry.count++;
  return entry.count > MAX_REQUESTS_PER_WINDOW;
}

function isDuplicateCallback(callbackId: string): boolean {
  const now = Date.now();

  // Cleanup old entries periodically
  if (processedCallbacks.size > 1000) {
    for (const [id, timestamp] of processedCallbacks.entries()) {
      if (now - timestamp > 5 * 60 * 1000) {
        processedCallbacks.delete(id);
      }
    }
  }

  if (processedCallbacks.has(callbackId)) {
    return true;
  }

  processedCallbacks.set(callbackId, now);
  return false;
}

export async function POST(req: NextRequest) {
  // 1. Verify Telegram Webhook Secret Token (mandatory in production)
  const secretHeader = req.headers.get('x-telegram-bot-api-secret-token');
  const configuredSecret =
    process.env.TELEGRAM_BOT_WEBHOOK_SECRET || process.env.TELEGRAM_WEBHOOK_SECRET;

  if (process.env.NODE_ENV === 'production') {
    if (!configuredSecret) {
      logger.error('TELEGRAM_BOT_WEBHOOK_SECRET is not configured in production environment');
      return NextResponse.json(
        { error: 'Webhook secret is not configured on server' },
        { status: 500 }
      );
    }
    if (!secretHeader || secretHeader !== configuredSecret) {
      logger.warn({ receivedHeader: secretHeader }, 'Invalid or missing Telegram webhook secret token in production');
      return NextResponse.json({ error: 'Unauthorized webhook request' }, { status: 403 });
    }
  } else if (configuredSecret && secretHeader !== configuredSecret) {
    logger.warn({ receivedHeader: secretHeader }, 'Invalid Telegram webhook secret token');
    return NextResponse.json({ error: 'Unauthorized webhook request' }, { status: 403 });
  }

  try {
    const update = (await req.json()) as TelegramIncomingUpdate;

    if (!update || (!update.message && !update.callback_query)) {
      return NextResponse.json({ ok: true, skipped: 'No message or callback_query' });
    }

    const fromUserId = update.message?.from?.id || update.callback_query?.from?.id;

    // 2. Check Rate Limit
    if (fromUserId && isRateLimited(fromUserId)) {
      logger.warn({ fromUserId }, 'Telegram user rate limited on webhook');
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
    }

    // 3. Callback Deduplication
    if (update.callback_query) {
      if (isDuplicateCallback(update.callback_query.id)) {
        logger.info({ callbackId: update.callback_query.id }, 'Ignoring duplicate callback query');
        return NextResponse.json({ ok: true, duplicate: true });
      }
    }

    // 4. Dispatch to Bot Service
    await TelegramBotService.handleUpdate(update);

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    logger.error({ err }, 'Error processing Telegram webhook request');
    // Return 200 to prevent Telegram from looping retries indefinitely
    return NextResponse.json({ ok: true, errorHandled: true });
  }
}
