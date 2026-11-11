import { prisma } from '@/database/prisma';
import { TelegramUpdateStatus } from '@prisma/client';
import { logger } from '@/lib/logger';

export interface UpdateClaimResult {
  canProcess: boolean;
  retryable?: boolean;
  reason?:
    | 'ALREADY_PROCESSED'
    | 'IN_FLIGHT_OTHER_INSTANCE'
    | 'MAX_ATTEMPTS_EXCEEDED'
    | 'PREVIOUSLY_FAILED'
    | 'CLAIMED'
    | 'RETRY_STALE_LOCK'
    | 'INFRASTRUCTURE_ERROR'
    | 'FALLBACK';
}

const IN_FLIGHT_LOCK_TIMEOUT_MS = 30 * 1000; // 30 seconds
const MAX_PROCESSING_ATTEMPTS = 3;
const RETENTION_DAYS = 7;

function isUniqueConstraintViolation(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  return (err as { code?: string }).code === 'P2002';
}

export class TelegramDeduplicationService {
  /**
   * Atomically claims a Telegram update for processing by a serverless instance.
   * Prevents duplicate execution across multiple Vercel instances and handles stale lock recovery.
   */
  public static async claimUpdate(
    botType: string,
    updateIdInput: bigint | number | string
  ): Promise<UpdateClaimResult> {
    if (!process.env.DATABASE_URL) {
      return { canProcess: true, reason: 'FALLBACK' };
    }

    let updateId: bigint;
    try {
      updateId = BigInt(updateIdInput.toString());
    } catch {
      return { canProcess: true, reason: 'FALLBACK' };
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + RETENTION_DAYS * 24 * 60 * 60 * 1000);

    try {
      const existing = await prisma.telegramProcessedUpdate.findUnique({
        where: {
          botType_updateId: {
            botType,
            updateId,
          },
        },
      });

      if (existing) {
        // 1. Already completed successfully
        if (existing.status === TelegramUpdateStatus.PROCESSED) {
          logger.info(
            { botType, updateId: updateId.toString() },
            'Telegram update already processed. Skipping duplicate delivery.'
          );
          return { canProcess: false, retryable: false, reason: 'ALREADY_PROCESSED' };
        }

        // 2. Currently being processed by another instance
        if (existing.status === TelegramUpdateStatus.PROCESSING) {
          const lockAgeMs = now.getTime() - existing.updatedAt.getTime();

          if (lockAgeMs < IN_FLIGHT_LOCK_TIMEOUT_MS) {
            logger.info(
              { botType, updateId: updateId.toString(), lockAgeMs },
              'Telegram update is actively in-flight on another instance. Skipping concurrent attempt.'
            );
            return { canProcess: false, retryable: false, reason: 'IN_FLIGHT_OTHER_INSTANCE' };
          }

          // Lock is stale (> 30s) — previous instance likely died or timed out
          if (existing.attempts >= MAX_PROCESSING_ATTEMPTS) {
            logger.warn(
              { botType, updateId: updateId.toString(), attempts: existing.attempts },
              'Telegram update exceeded maximum retry attempts. Marking as permanently FAILED.'
            );
            await prisma.telegramProcessedUpdate.update({
              where: { id: existing.id },
              data: {
                status: TelegramUpdateStatus.FAILED,
                error: 'Превышено максимальное число попыток обработки (3)',
                updatedAt: now,
              },
            });
            return { canProcess: false, retryable: false, reason: 'MAX_ATTEMPTS_EXCEEDED' };
          }

          // Safe atomic CAS recovery: claim stale lock and increment attempts
          const claimResult = await prisma.telegramProcessedUpdate.updateMany({
            where: {
              id: existing.id,
              updatedAt: existing.updatedAt,
            },
            data: {
              attempts: existing.attempts + 1,
              updatedAt: now,
            },
          });

          if (claimResult.count === 0) {
            // Another instance won the race to claim this stale lock
            return { canProcess: false, retryable: false, reason: 'IN_FLIGHT_OTHER_INSTANCE' };
          }

          return { canProcess: true, reason: 'RETRY_STALE_LOCK' };
        }

        // 3. Previously failed
        if (existing.status === TelegramUpdateStatus.FAILED) {
          if (existing.attempts >= MAX_PROCESSING_ATTEMPTS) {
            return { canProcess: false, retryable: false, reason: 'PREVIOUSLY_FAILED' };
          }

          const claimResult = await prisma.telegramProcessedUpdate.updateMany({
            where: {
              id: existing.id,
              updatedAt: existing.updatedAt,
            },
            data: {
              status: TelegramUpdateStatus.PROCESSING,
              attempts: existing.attempts + 1,
              updatedAt: now,
            },
          });

          if (claimResult.count === 0) {
            return { canProcess: false, retryable: false, reason: 'IN_FLIGHT_OTHER_INSTANCE' };
          }

          return { canProcess: true, reason: 'RETRY_STALE_LOCK' };
        }
      }

      // 4. New update — atomic insert
      await prisma.telegramProcessedUpdate.create({
        data: {
          botType,
          updateId,
          status: TelegramUpdateStatus.PROCESSING,
          attempts: 1,
          expiresAt,
        },
      });

      return { canProcess: true, reason: 'CLAIMED' };
    } catch (err: unknown) {
      // 5. Handle parallel insert race condition (P2002 Unique Constraint Violation)
      if (isUniqueConstraintViolation(err)) {
        try {
          const recheck = await prisma.telegramProcessedUpdate.findUnique({
            where: {
              botType_updateId: {
                botType,
                updateId,
              },
            },
          });
          if (recheck && recheck.status === TelegramUpdateStatus.PROCESSED) {
            return { canProcess: false, retryable: false, reason: 'ALREADY_PROCESSED' };
          }
        } catch {
          // If recheck query fails due to DB error, P2002 still guarantees another instance inserted it
        }

        logger.info(
          { botType, updateId: updateId.toString() },
          'Parallel insert race condition detected (P2002). Update claimed by concurrent instance.'
        );
        return { canProcess: false, retryable: false, reason: 'IN_FLIGHT_OTHER_INSTANCE' };
      }

      // 6. Infrastructure or Database error (connection failure, pool timeout, offline DB)
      logger.error(
        {
          botType,
          updateId: updateId.toString(),
          errType: err instanceof Error ? err.name : typeof err,
          errMsg: err instanceof Error ? err.message : String(err),
        },
        'Database infrastructure error during Telegram update claim. Failing with retryable=true for HTTP 503 retry.'
      );

      return {
        canProcess: false,
        retryable: true,
        reason: 'INFRASTRUCTURE_ERROR',
      };
    }
  }

  /**
   * Marks a claimed update as successfully processed.
   */
  public static async markCompleted(botType: string, updateIdInput: bigint | number | string): Promise<void> {
    if (!process.env.DATABASE_URL) return;

    try {
      const updateId = BigInt(updateIdInput.toString());
      await prisma.telegramProcessedUpdate.updateMany({
        where: {
          botType,
          updateId,
        },
        data: {
          status: TelegramUpdateStatus.PROCESSED,
          processedAt: new Date(),
          error: null,
          updatedAt: new Date(),
        },
      });
    } catch (err) {
      logger.error({ err, botType, updateId: updateIdInput.toString() }, 'Failed to mark Telegram update as completed');
    }
  }

  /**
   * Marks a claimed update as failed with an error message.
   */
  public static async markFailed(
    botType: string,
    updateIdInput: bigint | number | string,
    errorMessage: string
  ): Promise<void> {
    if (!process.env.DATABASE_URL) return;

    try {
      const updateId = BigInt(updateIdInput.toString());
      await prisma.telegramProcessedUpdate.updateMany({
        where: {
          botType,
          updateId,
        },
        data: {
          status: TelegramUpdateStatus.FAILED,
          error: errorMessage.slice(0, 500),
          updatedAt: new Date(),
        },
      });
    } catch (err) {
      logger.error({ err, botType, updateId: updateIdInput.toString() }, 'Failed to mark Telegram update as failed');
    }
  }
}
