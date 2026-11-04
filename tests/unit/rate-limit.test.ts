import { describe, it, expect } from 'vitest';
import { RateLimiter } from '@/lib/security/rate-limit';

describe('Rate Limiter (Sliding Window)', () => {
  it('should allow requests within threshold', () => {
    const limiter = new RateLimiter({ windowMs: 1000, maxRequests: 3 });
    const ip = '192.168.1.1';

    const r1 = limiter.check(ip);
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(2);

    const r2 = limiter.check(ip);
    expect(r2.allowed).toBe(true);
    expect(r2.remaining).toBe(1);

    const r3 = limiter.check(ip);
    expect(r3.allowed).toBe(true);
    expect(r3.remaining).toBe(0);

    const r4 = limiter.check(ip);
    expect(r4.allowed).toBe(false);
  });
});
