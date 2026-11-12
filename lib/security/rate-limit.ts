import { prisma } from '@/database/prisma';
import { RateLimitExceededError } from '@/lib/errors';

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

export interface RateLimiterOptions {
  windowMs?: number;
  maxRequests?: number;
}

/**
 * Distributed rate limiter backed by PostgreSQL atomic upsert.
 * Ensures consistent rate limiting across multiple serverless / Vercel instances.
 */
export class DatabaseRateLimiter {
  /**
   * Atomically consumes one rate limit point for the specified key.
   * If DATABASE_URL is not configured or in fallback mode, falls back to in-memory.
   */
  public static async consume(
    key: string,
    maxRequests: number,
    windowMs: number
  ): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
    if (!process.env.DATABASE_URL) {
      return memoryFallbackLimiter.check(key, maxRequests, windowMs);
    }

    const windowSeconds = Math.max(1, Math.ceil(windowMs / 1000));

    try {
      // Atomic UPSERT in PostgreSQL: increments points within window, or resets if expired
      const rows = await prisma.$queryRaw<Array<{ points: number; expiresAt: Date }>>`
        INSERT INTO "rate_limit_entries" ("id", "key", "points", "expiresAt", "createdAt", "updatedAt")
        VALUES (
          gen_random_uuid(),
          ${key},
          1,
          NOW() + (${windowSeconds} || ' seconds')::interval,
          NOW(),
          NOW()
        )
        ON CONFLICT ("key") DO UPDATE
        SET "points" = CASE
          WHEN "rate_limit_entries"."expiresAt" <= NOW() THEN 1
          ELSE "rate_limit_entries"."points" + 1
        END,
        "expiresAt" = CASE
          WHEN "rate_limit_entries"."expiresAt" <= NOW() THEN NOW() + (${windowSeconds} || ' seconds')::interval
          ELSE "rate_limit_entries"."expiresAt"
        END,
        "updatedAt" = NOW()
        RETURNING "points", "expiresAt";
      `;

      if (rows && rows.length > 0) {
        const entry = rows[0];
        const points = Number(entry.points);
        const resetAt = new Date(entry.expiresAt).getTime();
        const allowed = points <= maxRequests;
        const remaining = Math.max(0, maxRequests - points);
        return { allowed, remaining, resetAt };
      }
    } catch {
      // Fallback on in-memory rate limiter if DB table does not exist yet or in unit tests
      return memoryFallbackLimiter.check(key, maxRequests, windowMs);
    }

    return memoryFallbackLimiter.check(key, maxRequests, windowMs);
  }

  /**
   * Removes expired rate limit entries to maintain lean table size.
   */
  public static async cleanupExpired(): Promise<number> {
    if (!process.env.DATABASE_URL) return 0;
    try {
      const res = await prisma.rateLimitEntry.deleteMany({
        where: { expiresAt: { lt: new Date() } },
      });
      return res.count;
    } catch {
      return 0;
    }
  }

  /**
   * Releases/clears a specific key so it can be retried immediately (e.g. on dispatch failure).
   */
  public static async release(key: string): Promise<void> {
    if (!process.env.DATABASE_URL) return;
    try {
      await prisma.rateLimitEntry.deleteMany({
        where: { key },
      });
    } catch {
      // Silent error recovery
    }
  }
}

/**
 * In-memory sliding window rate limiter (for fast local / unit test checks)
 */
export class RateLimiter {
  private records = new Map<string, RateLimitRecord>();
  private readonly windowMs: number;
  private readonly maxRequests: number;

  constructor(options: RateLimiterOptions = {}) {
    this.windowMs = options.windowMs || 60000; // 1 minute
    this.maxRequests = options.maxRequests || 100;
  }

  public check(identifier: string, maxReqs?: number, winMs?: number): { allowed: boolean; remaining: number; resetAt: number } {
    const max = maxReqs ?? this.maxRequests;
    const window = winMs ?? this.windowMs;
    const now = Date.now();
    const record = this.records.get(identifier);

    // If no existing record or window expired, reset
    if (!record || now > record.resetAt) {
      const resetAt = now + window;
      this.records.set(identifier, { count: 1, resetAt });
      return { allowed: true, remaining: max - 1, resetAt };
    }

    // Within window
    if (record.count >= max) {
      return { allowed: false, remaining: 0, resetAt: record.resetAt };
    }

    record.count += 1;
    return { allowed: true, remaining: max - record.count, resetAt: record.resetAt };
  }

  public async checkDistributed(identifier: string): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
    return DatabaseRateLimiter.consume(identifier, this.maxRequests, this.windowMs);
  }

  public assertAllowed(identifier: string): void {
    const { allowed } = this.check(identifier);
    if (!allowed) {
      throw new RateLimitExceededError();
    }
  }

  public cleanup(): void {
    const now = Date.now();
    for (const [key, record] of this.records.entries()) {
      if (now > record.resetAt) {
        this.records.delete(key);
      }
    }
  }
}

const memoryFallbackLimiter = new RateLimiter();

// Global API rate limiter singleton
export const apiRateLimiter = new RateLimiter({
  windowMs: 60000,
  maxRequests: 100,
});
