import { describe, it, expect } from 'vitest';
import { createOrderSchema } from '@/modules/orders/orders.dto';

describe('Order Zod Validation Schemas', () => {
  const validPayload = {
    warehouseId: 'b7b64f3e-436f-4d6b-b4a8-6f6a73c1d53e',
    marketplace: 'WILDBERRIES',
    pickupAddress: 'г. Бишкек, ул. Киевская 100',
    pickupContactPhone: '+996555123456',
    items: [
      {
        boxNumber: 1,
        boxBarcode: 'WB-BOX-100234',
        lengthCm: 60,
        widthCm: 40,
        heightCm: 40,
        weightKg: 12.5,
        quantity: 1,
        cargoDescription: 'Одежда детская',
      },
    ],
  };

  it('validates a compliant order payload', () => {
    const parsed = createOrderSchema.safeParse(validPayload);
    expect(parsed.success).toBe(true);
  });

  it('rejects an order without items', () => {
    const invalid = { ...validPayload, items: [] };
    const parsed = createOrderSchema.safeParse(invalid);
    expect(parsed.success).toBe(false);
  });

  it('rejects an invalid warehouse UUID', () => {
    const invalid = { ...validPayload, warehouseId: 'not-a-uuid' };
    const parsed = createOrderSchema.safeParse(invalid);
    expect(parsed.success).toBe(false);
  });

  it('rejects an invalid phone format', () => {
    const invalid = { ...validPayload, pickupContactPhone: 'invalid-phone-abc' };
    const parsed = createOrderSchema.safeParse(invalid);
    expect(parsed.success).toBe(false);
  });
});
