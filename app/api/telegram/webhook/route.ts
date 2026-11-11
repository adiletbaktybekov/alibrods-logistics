import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { TelegramBotService, TelegramIncomingUpdate } from '@/modules/telegram/bot.service';
import { TelegramDeduplicationService } from '@/modules/telegram/deduplication.service';
import { DatabaseRateLimiter } from '@/lib/security/rate-limit';
import { logger, safeLogError } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 40;

function isValidSecretToken(received: string | null, expected?: string): boolean {
  if (!received || !expected) return false;
  const a = Buffer.from(received, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
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
    if (!isValidSecretToken(secretHeader, configuredSecret)) {
      logger.warn(
        { hasHeader: Boolean(secretHeader), headerLength: secretHeader?.length ?? 0 },
        'Invalid or missing Telegram webhook secret token in production'
      );
      return NextResponse.json({ error: 'Unauthorized webhook request' }, { status: 403 });
    }
  } else if (configuredSecret && !isValidSecretToken(secretHeader, configuredSecret)) {
    logger.warn(
      { hasHeader: Boolean(secretHeader), headerLength: secretHeader?.length ?? 0 },
      'Invalid Telegram webhook secret token'
    );
    return NextResponse.json({ error: 'Unauthorized webhook request' }, { status: 403 });
  }

  try {
    const update = (await req.json()) as TelegramIncomingUpdate;

    if (!update || (!update.message && !update.callback_query)) {
      return NextResponse.json({ ok: true, skipped: 'No message or callback_query' });
    }

    const fromUserId = update.message?.from?.id || update.callback_query?.from?.id;

    // 2. Distributed Rate Limiting across Vercel serverless instances
    if (fromUserId) {
      const rateLimitKey = `tg:user:${fromUserId}`;
      const rateLimitResult = await DatabaseRateLimiter.consume(
        rateLimitKey,
        MAX_REQUESTS_PER_WINDOW,
        RATE_LIMIT_WINDOW_MS
      );

      if (!rateLimitResult.allowed) {
        logger.warn({ fromUserId }, 'Telegram user rate limited on webhook');
        return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
      }
    }

    // 3. Determine target bot (driver, client, manager)
    const botParam = req.nextUrl.searchParams.get('bot');
    const botType = botParam === 'client' ? 'client' : botParam === 'manager' ? 'manager' : 'driver';

    // 4. Distributed Deduplication on Update ID across Vercel serverless instances
    const updateId = update.update_id ?? (update.callback_query?.id ? BigInt(update.callback_query.id) : null);

    if (updateId !== null && updateId !== undefined) {
      const claim = await TelegramDeduplicationService.claimUpdate(botType, updateId);
      if (!claim.canProcess) {
        if (claim.retryable || claim.reason === 'INFRASTRUCTURE_ERROR') {
          logger.warn(
            { botType, updateId: updateId.toString(), reason: claim.reason },
            'Database infrastructure error during claimUpdate. Returning HTTP 503 for Telegram retry.'
          );
          return NextResponse.json(
            { error: 'Service temporarily unavailable' },
            { status: 503 }
          );
        }

        logger.info(
          { botType, updateId: updateId.toString(), reason: claim.reason },
          'Telegram update already processed or in-flight on another instance. Skipping duplicate.'
        );
        return NextResponse.json({ ok: true, duplicate: true, reason: claim.reason });
      }
    }

    // 5. Dispatch to Bot Service
    try {
      await TelegramBotService.handleUpdate(update, botType);

      if (updateId !== null && updateId !== undefined) {
        await TelegramDeduplicationService.markCompleted(botType, updateId);
      }

      return NextResponse.json({ ok: true });
    } catch (dispatchError: unknown) {
      if (updateId !== null && updateId !== undefined) {
        const errorMsg = dispatchError instanceof Error ? dispatchError.message : String(dispatchError);
        await TelegramDeduplicationService.markFailed(botType, updateId, errorMsg);
      }
      throw dispatchError;
    }
  } catch (err: unknown) {
    safeLogError(err, 'Error processing Telegram webhook request');
    // Return 200 to prevent Telegram from looping retries indefinitely
    return NextResponse.json({ ok: true, errorHandled: true });
  }
}
