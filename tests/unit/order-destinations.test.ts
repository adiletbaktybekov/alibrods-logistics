import { describe, it, expect } from 'vitest';
import { createClientOrderSchema, destinationItemInputSchema } from '@/modules/orders/orders.dto';

describe('Order Destinations & Custom Warehouse Validation', () => {
  const validWhId = 'e0123456-789a-bcde-f012-3456789abc01';

  it('validates a standard catalog warehouse destination item', () => {
    const item = {
      warehouseId: validWhId,
      isCustomWarehouse: false,
      deliveryDate: '2026-11-20',
      boxesCount: 10,
      palletsCount: 1,
      comment: 'Ворота 4',
    };
    const parsed = destinationItemInputSchema.safeParse(item);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.warehouseId).toBe(validWhId);
      expect(parsed.data.isCustomWarehouse).toBe(false);
      expect(parsed.data.boxesCount).toBe(10);
      expect(parsed.data.palletsCount).toBe(1);
    }
  });

  it('validates an individual (custom) warehouse destination item', () => {
    const customItem = {
      isCustomWarehouse: true,
      customWarehouseName: 'ТК Деловые Линии (Восток)',
      deliveryDate: '2026-11-22',
      boxesCount: 25,
      palletsCount: 0,
      comment: 'Особый пропуск',
    };
    const parsed = destinationItemInputSchema.safeParse(customItem);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.isCustomWarehouse).toBe(true);
      expect(parsed.data.customWarehouseName).toBe('ТК Деловые Линии (Восток)');
      expect(parsed.data.boxesCount).toBe(25);
    }
  });

  it('rejects an individual warehouse with empty or single-character name', () => {
    const emptyName = {
      isCustomWarehouse: true,
      customWarehouseName: ' ',
      deliveryDate: '2026-11-20',
      boxesCount: 10,
    };
    const parsed = destinationItemInputSchema.safeParse(emptyName);
    expect(parsed.success).toBe(false);

    const singleChar = {
      isCustomWarehouse: true,
      customWarehouseName: 'A',
      deliveryDate: '2026-11-20',
      boxesCount: 10,
    };
    const parsed2 = destinationItemInputSchema.safeParse(singleChar);
    expect(parsed2.success).toBe(false);
  });

  it('rejects a destination item with 0 boxes AND 0 pallets', () => {
    const zeroCargo = {
      warehouseId: validWhId,
      isCustomWarehouse: false,
      deliveryDate: '2026-11-20',
      boxesCount: 0,
      palletsCount: 0,
    };
    const parsed = destinationItemInputSchema.safeParse(zeroCargo);
    expect(parsed.success).toBe(false);
  });

  it('validates a multi-destination client order with mixed catalog and custom warehouses', () => {
    const orderPayload = {
      destinations: [
        {
          warehouseId: validWhId,
          isCustomWarehouse: false,
          deliveryDate: '2026-11-20',
          boxesCount: 10,
          palletsCount: 2,
        },
        {
          isCustomWarehouse: true,
          customWarehouseName: 'Склад поставщика Люблино',
          deliveryDate: '2026-11-21',
          boxesCount: 5,
          palletsCount: 0,
          comment: 'Контакт на воротах +79990001122',
        },
      ],
      clientComment: 'Два адреса разгрузки',
    };

    const parsed = createClientOrderSchema.safeParse(orderPayload);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.destinations).toHaveLength(2);
      expect(parsed.data.destinations![0].boxesCount).toBe(10);
      expect(parsed.data.destinations![1].customWarehouseName).toBe('Склад поставщика Люблино');
    }
  });

  it('preserves backwards compatibility with legacy single-warehouse format', () => {
    const legacyPayload = {
      warehouseId: validWhId,
      deliveryDate: '2026-11-20',
      totalBoxesCount: 8,
      totalPalletsCount: 1,
      clientComment: 'Старый формат',
    };

    const parsed = createClientOrderSchema.safeParse(legacyPayload);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.warehouseId).toBe(validWhId);
      expect(parsed.data.totalBoxesCount).toBe(8);
      expect(parsed.data.totalPalletsCount).toBe(1);
    }
  });
});
