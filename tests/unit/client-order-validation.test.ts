import { describe, it, expect } from 'vitest';
import { createClientOrderSchema } from '@/modules/orders/orders.dto';

describe('Client Order Form Zod Validation', () => {
  const validData = {
    warehouseId: 'e0123456-789a-bcde-f012-3456789abc01',
    deliveryDate: '2026-11-10',
    totalBoxesCount: 15,
    totalPalletsCount: 2,
    clientComment: 'Бережная транспортировка, коробки промаркированы',
  };

  it('validates a correct client order payload', () => {
    const parsed = createClientOrderSchema.safeParse(validData);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.totalBoxesCount).toBe(15);
      expect(parsed.data.totalPalletsCount).toBe(2);
      expect(parsed.data.warehouseId).toBe('e0123456-789a-bcde-f012-3456789abc01');
    }
  });

  it('defaults totalPalletsCount to 0 when omitted', () => {
    const withoutPallets = {
      warehouseId: 'e0123456-789a-bcde-f012-3456789abc01',
      deliveryDate: '2026-11-10',
      totalBoxesCount: 5,
    };
    const parsed = createClientOrderSchema.safeParse(withoutPallets);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.totalPalletsCount).toBe(0);
    }
  });

  it('rejects an order with 0 boxes', () => {
    const invalid = { ...validData, totalBoxesCount: 0 };
    const parsed = createClientOrderSchema.safeParse(invalid);
    expect(parsed.success).toBe(false);
  });

  it('rejects an order with negative pallets', () => {
    const invalid = { ...validData, totalPalletsCount: -1 };
    const parsed = createClientOrderSchema.safeParse(invalid);
    expect(parsed.success).toBe(false);
  });

  it('rejects an invalid warehouse UUID', () => {
    const invalid = { ...validData, warehouseId: 'invalid-id' };
    const parsed = createClientOrderSchema.safeParse(invalid);
    expect(parsed.success).toBe(false);
  });

  it('rejects an invalid delivery date format', () => {
    const invalid = { ...validData, deliveryDate: 'not-a-date' };
    const parsed = createClientOrderSchema.safeParse(invalid);
    expect(parsed.success).toBe(false);
  });
});
