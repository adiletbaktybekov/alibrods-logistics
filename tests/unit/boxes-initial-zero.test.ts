import { describe, it, expect } from 'vitest';
import { destinationItemInputSchema, createClientOrderSchema } from '@/modules/orders/orders.dto';

describe('Initial Cargo Quantities Default to Zero (0)', () => {
  const validWhId = '80123456-789a-bcde-f012-3456789abc01';

  it('destinationItemInputSchema defaults boxesCount and palletsCount to 0', () => {
    // When only pallets are provided, boxesCount should default to 0 (never 1)
    const parsedWithPallets = destinationItemInputSchema.parse({
      warehouseId: validWhId,
      deliveryDate: '2026-11-20',
      palletsCount: 3,
    });
    expect(parsedWithPallets.palletsCount).toBe(3);
    expect(parsedWithPallets.boxesCount).toBe(0);

    // When only boxes are provided, palletsCount should default to 0
    const parsedWithBoxes = destinationItemInputSchema.parse({
      warehouseId: validWhId,
      deliveryDate: '2026-11-20',
      boxesCount: 5,
    });
    expect(parsedWithBoxes.boxesCount).toBe(5);
    expect(parsedWithBoxes.palletsCount).toBe(0);
  });

  it('createClientOrderSchema defaults totalBoxesCount and totalPalletsCount to 0', () => {
    const parsed = createClientOrderSchema.parse({
      warehouseId: validWhId,
      deliveryDate: '2026-11-20',
      destinations: [
        {
          warehouseId: validWhId,
          deliveryDate: '2026-11-20',
          boxesCount: 4,
          palletsCount: 0,
        },
      ],
    });

    expect(parsed.totalPalletsCount).toBe(0);
    expect(parsed.totalBoxesCount).toBe(0);
  });
});
