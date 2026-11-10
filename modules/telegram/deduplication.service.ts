import { prisma } from '@/database/prisma';
import { TelegramUpdateStatus } from '@prisma/client';
import { logger } from '@/lib/logger';

export interface UpdateClaimResult {
  canProcess: boolean;
  reason?: 'ALREADY_PROCESSED' | 'IN_FLIGHT_OTHER_INSTANCE' | 'MAX_ATTEMPTS_EXCEEDED' | 'PREVIOUSLY_FAILED' | 'CLAIMED' | 'RETRY_STALE_LOCK' | 'FALLBACK';
}

const IN_FLIGHT_LOCK_TIMEOUT_MS = 30 * 1000; // 30 seconds
const MAX_PROCESSING_ATTEMPTS = 3;
const RETENTION_DAYS = 7;

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
          return { canProcess: false, reason: 'ALREADY_PROCESSED' };
        }

        // 2. Currently being processed by another instance
        if (existing.status === TelegramUpdateStatus.PROCESSING) {
          const lockAgeMs = now.getTime() - existing.updatedAt.getTime();

          if (lockAgeMs < IN_FLIGHT_LOCK_TIMEOUT_MS) {
            logger.info(
              { botType, updateId: updateId.toString(), lockAgeMs },
              'Telegram update is actively in-flight on another instance. Skipping concurrent attempt.'
            );
            return { canProcess: false, reason: 'IN_FLIGHT_OTHER_INSTANCE' };
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
            return { canProcess: false, reason: 'MAX_ATTEMPTS_EXCEEDED' };
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
            return { canProcess: false, reason: 'IN_FLIGHT_OTHER_INSTANCE' };
          }

          return { canProcess: true, reason: 'RETRY_STALE_LOCK' };
        }

        // 3. Previously failed
        if (existing.status === TelegramUpdateStatus.FAILED) {
          if (existing.attempts >= MAX_PROCESSING_ATTEMPTS) {
            return { canProcess: false, reason: 'PREVIOUSLY_FAILED' };
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
            return { canProcess: false, reason: 'IN_FLIGHT_OTHER_INSTANCE' };
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
      // Handle parallel insert race condition: recheck status
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
          return { canProcess: false, reason: 'ALREADY_PROCESSED' };
        }
      } catch {
        // Fall through
      }

      logger.warn(
        { err, botType, updateId: updateId.toString() },
        'Race condition or error during Telegram update claim. Skipping duplicate.'
      );
      return { canProcess: false, reason: 'IN_FLIGHT_OTHER_INSTANCE' };
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
