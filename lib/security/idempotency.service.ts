import crypto from 'crypto';
import { prisma } from '@/database/prisma';
import { Prisma } from '@prisma/client';
import { ConflictError } from '@/lib/errors';
import { logger } from '@/lib/logger';

export interface IdempotencyOptions {
  key?: string | null;
  userId: string;
  action: string;
  payload: unknown;
  ttlSeconds?: number;
  lockTimeoutMs?: number;
  maxRecoveryAttempts?: number;
}

export interface IdempotencyResult<T> {
  result: T;
  fromCache: boolean;
}

/**
 * Computes a deterministic SHA-256 hash for any serializable payload.
 * Recursively sorts object keys to ensure consistent hashes regardless of key order.
 */
export function computeCanonicalPayloadHash(data: unknown): string {
  function canonicalize(val: unknown): unknown {
    if (val === null || typeof val !== 'object') {
      return val;
    }
    if (val instanceof Date) {
      return val.toISOString();
    }
    if (Array.isArray(val)) {
      return val.map(canonicalize);
    }
    const sortedObj: Record<string, unknown> = {};
    const keys = Object.keys(val as Record<string, unknown>).sort();
    for (const k of keys) {
      sortedObj[k] = canonicalize((val as Record<string, unknown>)[k]);
    }
    return sortedObj;
  }

  const json = JSON.stringify(canonicalize(data) ?? {});
  return crypto.createHash('sha256').update(json).digest('hex');
}

export class IdempotencyService {
  /**
   * Executes an operation with strict server-side idempotency backed by PostgreSQL.
   *
   * Crash-Recovery & Concurrency Guarantees:
   * 1. lockToken (UUID): Each lease reservation or takeover is tagged with a unique token.
   * 2. Atomic interactive transaction: Business operation and IdempotencyKey responseBody
   *    are committed in the same database transaction.
   * 3. Row-level locking: SELECT ... FOR UPDATE verifies lockToken ownership inside tx.
   * 4. Conditional CAS cleanup: catch block ONLY cleans up if key still holds our lockToken
   *    AND responseBody is still null.
   * 5. TTL (expiresAt): Expired completed keys past 24h are safely purged and re-created.
   * 6. Recovery attempts limit: Prevents infinite recovery loops on permanently failing requests.
   */
  public static async runWithIdempotency<T>(
    options: IdempotencyOptions,
    operation: (tx: Prisma.TransactionClient) => Promise<T>
  ): Promise<IdempotencyResult<T>> {
    const rawKey = options.key?.trim();
    if (!rawKey) {
      // No idempotency key provided; execute un-idempotently
      const result = await operation(prisma);
      return { result, fromCache: false };
    }

    if (!process.env.DATABASE_URL) {
      const result = await operation(prisma);
      return { result, fromCache: false };
    }

    const ttlSeconds = options.ttlSeconds ?? 24 * 60 * 60; // 24 hours
    const lockTimeoutMs = options.lockTimeoutMs ?? 30000; // 30 seconds
    const maxRecoveryAttempts = options.maxRecoveryAttempts ?? 3;
    const requestHash = computeCanonicalPayloadHash(options.payload);
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    let activeLockToken = '';

    // 1. Check existing record
    const existing = await prisma.idempotencyKey.findUnique({
      where: { key: rawKey },
    });

    if (existing) {
      // Security check: Key must belong to the same user and action
      if (existing.userId !== options.userId || existing.action !== options.action) {
        throw new ConflictError('Ключ идемпотентности уже использован другим пользователем или операцией');
      }

      // Payload mismatch check: Reusing the same key with different payload is strictly prohibited
      if (existing.requestHash !== requestHash) {
        throw new ConflictError(
          'Ключ идемпотентности уже был использован с другими параметрами заявки. Повторная отправка с изменёнными данными отклонена.'
        );
      }

      // Completed response check
      if (existing.responseBody !== null && existing.responseBody !== undefined) {
        // TTL Expiration check
        const now = new Date();
        if (existing.expiresAt <= now) {
          logger.info(
            { key: rawKey, expiresAt: existing.expiresAt },
            'Idempotency key has expired past its TTL. Purging expired record for fresh execution.'
          );
          await prisma.idempotencyKey.deleteMany({
            where: { key: rawKey, expiresAt: { lte: now } },
          });
          // Proceed to fresh key creation below
        } else {
          logger.info(
            { key: rawKey, userId: options.userId, action: options.action },
            'Returning cached response from IdempotencyKey'
          );
          return {
            result: existing.responseBody as unknown as T,
            fromCache: true,
          };
        }
      } else {
        // In-flight concurrency check: If locked recently, reject concurrent duplicate attempt
        const lockAgeMs = Date.now() - existing.lockedAt.getTime();
        if (lockAgeMs < lockTimeoutMs) {
          throw new ConflictError(
            'Запрос с данным ключом уже находится в процессе обработки сервером. Пожалуйста, подождите завершения.'
          );
        }

        // Stale lock recovery: previous worker crashed or timed out (> lockTimeoutMs)
        if (existing.recoveryAttempts >= maxRecoveryAttempts) {
          throw new ConflictError(
            'Превышено максимальное количество попыток восстановления для данного ключа. Пожалуйста, создайте новый запрос.'
          );
        }

        // Atomic lease takeover with CAS (Compare-And-Swap)
        const newLockToken = crypto.randomUUID();
        const takeover = await prisma.idempotencyKey.updateMany({
          where: {
            key: rawKey,
            lockToken: existing.lockToken,
            responseBody: { equals: Prisma.DbNull },
            lockedAt: existing.lockedAt,
          },
          data: {
            lockToken: newLockToken,
            lockedAt: new Date(),
            recoveryAttempts: { increment: 1 },
            updatedAt: new Date(),
          },
        });

        if (takeover.count === 0) {
          // Another parallel instance won the takeover race or completed the operation
          const recheck = await prisma.idempotencyKey.findUnique({ where: { key: rawKey } });
          if (recheck?.responseBody !== null && recheck?.responseBody !== undefined) {
            return { result: recheck.responseBody as unknown as T, fromCache: true };
          }
          throw new ConflictError('Блокировка ключа была перехвачена параллельным процессом.');
        }

        activeLockToken = newLockToken;
      }
    }

    // 2. Reserve new key atomically if not already acquired during takeover
    if (!existing || existing.responseBody !== null) {
      activeLockToken = crypto.randomUUID();
      try {
        await prisma.idempotencyKey.create({
          data: {
            key: rawKey,
            userId: options.userId,
            action: options.action,
            requestHash,
            lockToken: activeLockToken,
            expiresAt,
            lockedAt: new Date(),
          },
        });
      } catch {
        // Race condition: another concurrent request just inserted this key
        const recheck = await prisma.idempotencyKey.findUnique({ where: { key: rawKey } });
        if (recheck) {
          if (recheck.requestHash !== requestHash) {
            throw new ConflictError('Параллельный запрос с тем же ключом идемпотентности имеет другие параметры.');
          }
          if (recheck.responseBody !== null && recheck.responseBody !== undefined) {
            return { result: recheck.responseBody as unknown as T, fromCache: true };
          }
        }
        throw new ConflictError('Запрос с данным ключом уже обрабатывается параллельным процессом.');
      }
    }

    // 3. Execute business operation and persist response in a SINGLE ATOMIC TRANSACTION
    try {
      const result = await prisma.$transaction(async (tx) => {
        // Verify that our lockToken is still active and valid under row lock
        const lockedRows = await tx.$queryRaw<
          Array<{ id: string; lockToken: string | null; responseBody: unknown }>
        >`
          SELECT "id", "lockToken", "responseBody"
          FROM "idempotency_keys"
          WHERE "key" = ${rawKey}
          FOR UPDATE
        `;

        if (!lockedRows || lockedRows.length === 0) {
          throw new ConflictError('Блокировка ключа идемпотентности не найдена.');
        }

        const currentLock = lockedRows[0];
        if (currentLock.responseBody !== null && currentLock.responseBody !== undefined) {
          // Completed by another worker before we obtained lock
          return currentLock.responseBody as T;
        }

        if (currentLock.lockToken !== activeLockToken) {
          throw new ConflictError('Блокировка ключа была перехвачена другим процессом (lease expired).');
        }

        // Execute operation passing transaction client
        const opResult = await operation(tx);

        // Save result in IdempotencyKey within the SAME transaction
        await tx.idempotencyKey.update({
          where: { key: rawKey },
          data: {
            responseStatus: 200,
            responseBody: (opResult as object) ?? {},
            updatedAt: new Date(),
          },
        });

        return opResult;
      }, {
        maxWait: 10000,
        timeout: 20000,
      });

      return { result, fromCache: false };
    } catch (opError) {
      // Safe conditional CAS rollback:
      // ONLY delete if key still has OUR lockToken AND responseBody is still null!
      // This prevents an outdated instance from deleting another instance's completed result or takeover.
      try {
        await prisma.idempotencyKey.deleteMany({
          where: {
            key: rawKey,
            lockToken: activeLockToken,
            responseBody: { equals: Prisma.DbNull },
          },
        });
      } catch {
        // Ignore cleanup deletion failure
      }
      throw opError;
    }
  }
}

