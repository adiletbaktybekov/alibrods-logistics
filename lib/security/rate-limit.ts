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
 * In-memory sliding window rate limiter
 * Implements a clean, decoupled interface ready for Redis/Upstash adapter in Phase 2
 */
export class RateLimiter {
  private records = new Map<string, RateLimitRecord>();
  private readonly windowMs: number;
  private readonly maxRequests: number;

  constructor(options: RateLimiterOptions = {}) {
    this.windowMs = options.windowMs || 60000; // 1 minute
    this.maxRequests = options.maxRequests || 100;
  }

  public check(identifier: string): { allowed: boolean; remaining: number; resetAt: number } {
    const now = Date.now();
    const record = this.records.get(identifier);

    // If no existing record or window expired, reset
    if (!record || now > record.resetAt) {
      const resetAt = now + this.windowMs;
      this.records.set(identifier, { count: 1, resetAt });
      return { allowed: true, remaining: this.maxRequests - 1, resetAt };
    }

    // Within window
    if (record.count >= this.maxRequests) {
      return { allowed: false, remaining: 0, resetAt: record.resetAt };
    }

    record.count += 1;
    return { allowed: true, remaining: this.maxRequests - record.count, resetAt: record.resetAt };
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

// Global API rate limiter singleton
export const apiRateLimiter = new RateLimiter({
  windowMs: 60000,
  maxRequests: 100,
});
