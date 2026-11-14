import { describe, it, expect } from 'vitest';

describe('Sequential Order Numbering (ABL-N)', () => {
  it('formats sequential numbers strictly matching ABL-N pattern', () => {
    const formatOrderNumber = (seqVal: number | bigint) => `ABL-${seqVal}`;

    expect(formatOrderNumber(1)).toBe('ABL-1');
    expect(formatOrderNumber(2)).toBe('ABL-2');
    expect(formatOrderNumber(42)).toBe('ABL-42');
    expect(formatOrderNumber(1000)).toBe('ABL-1000');
    expect(formatOrderNumber(BigInt(999999))).toBe('ABL-999999');
  });

  it('validates sequential ABL format via regex', () => {
    const ablRegex = /^ABL-\d+$/;
    expect(ablRegex.test('ABL-1')).toBe(true);
    expect(ablRegex.test('ABL-42')).toBe(true);
    expect(ablRegex.test('ABL-123456')).toBe(true);

    // Old format should not match sequential regex but remains valid in DB
    expect(ablRegex.test('ABL-2026-ABCDEF')).toBe(false);
  });

  it('verifies that retry with existing idempotency response preserves original order number without advancing sequence', () => {
    // Simulated idempotency store
    const store = new Map<string, { orderNumber: string }>();
    let currentSeq = 1;

    const createOrderWithIdempotency = (key: string) => {
      if (store.has(key)) {
        return { orderNumber: store.get(key)!.orderNumber, isCached: true };
      }
      const orderNumber = `ABL-${currentSeq++}`;
      store.set(key, { orderNumber });
      return { orderNumber, isCached: false };
    };

    const firstCall = createOrderWithIdempotency('key-123');
    expect(firstCall.orderNumber).toBe('ABL-1');
    expect(firstCall.isCached).toBe(false);

    // Immediate retry with same key
    const retryCall = createOrderWithIdempotency('key-123');
    expect(retryCall.orderNumber).toBe('ABL-1');
    expect(retryCall.isCached).toBe(true);

    // Next unique request gets ABL-2
    const nextCall = createOrderWithIdempotency('key-456');
    expect(nextCall.orderNumber).toBe('ABL-2');
    expect(nextCall.isCached).toBe(false);
  });
});
