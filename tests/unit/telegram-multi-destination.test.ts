import { describe, it, expect } from 'vitest';
import {
  TelegramNotificationService,
  TelegramDestinationItem,
} from '@/modules/telegram/notification.service';

describe('Telegram Multi-Warehouse Destination Formatting', () => {
  it('should format multiple destinations with exact required structure: Pallets first, then Boxes, with totals', () => {
    const destinations: TelegramDestinationItem[] = [
      {
        warehouseName: 'Склад Бишкек',
        deliveryDate: '20.11.2026',
        palletsCount: 3,
        boxesCount: 15,
      },
      {
        warehouseName: 'Склад Москва',
        deliveryDate: '21.11.2026',
        palletsCount: 2,
        boxesCount: 10,
      },
    ];

    const formatted = TelegramNotificationService.formatTelegramDestinations(
      destinations,
      5,
      25
    );

    // Verify exact required blocks
    expect(formatted).toContain('СКЛАДЫ:');
    expect(formatted).toContain('<b>Склад Бишкек</b>');
    expect(formatted).toContain('Дата доставки: 20.11.2026');
    expect(formatted).toContain('Паллеты: 3');
    expect(formatted).toContain('Коробки: 15');

    expect(formatted).toContain('<b>Склад Москва</b>');
    expect(formatted).toContain('Дата доставки: 21.11.2026');
    expect(formatted).toContain('Паллеты: 2');
    expect(formatted).toContain('Коробки: 10');

    expect(formatted).toContain('ИТОГО:\nПаллеты: 5\nКоробки: 25');

    // Verify Pallets appears before Boxes inside each block
    const bishkekBlock = formatted.slice(formatted.indexOf('<b>Склад Бишкек</b>'), formatted.indexOf('<b>Склад Москва</b>'));
    expect(bishkekBlock.indexOf('Паллеты: 3')).toBeLessThan(bishkekBlock.indexOf('Коробки: 15'));

    // Verify Pallets appears before Boxes in ИТОГО
    const itogoBlock = formatted.slice(formatted.indexOf('ИТОГО:'));
    expect(itogoBlock.indexOf('Паллеты: 5')).toBeLessThan(itogoBlock.indexOf('Коробки: 25'));
  });

  it('should handle custom warehouses properly with note', () => {
    const destinations: TelegramDestinationItem[] = [
      {
        warehouseName: 'Коледино (WB)',
        deliveryDate: '25.11.2026',
        palletsCount: 1,
        boxesCount: 20,
      },
      {
        warehouseName: 'Электросталь',
        isCustomWarehouse: true,
        customWarehouseName: 'Электросталь (Инд. склад)',
        deliveryDate: '26.11.2026',
        palletsCount: 0,
        boxesCount: 40,
        comment: 'Ворота 4Б',
      },
    ];

    const formatted = TelegramNotificationService.formatTelegramDestinations(
      destinations,
      1,
      60
    );

    expect(formatted).toContain('<b>Электросталь (Инд. склад)</b>');
    expect(formatted).toContain('Примечание: <i>Ворота 4Б</i>');
    expect(formatted).toContain('ИТОГО:\nПаллеты: 1\nКоробки: 60');
  });

  it('should format single destination correctly', () => {
    const destinations: TelegramDestinationItem[] = [
      {
        warehouseName: 'Склад Казань (WB)',
        deliveryDate: '22.11.2026',
        palletsCount: 4,
        boxesCount: 80,
      },
    ];

    const formatted = TelegramNotificationService.formatTelegramDestinations(
      destinations,
      4,
      80
    );

    expect(formatted).toContain('СКЛАДЫ:');
    expect(formatted).toContain('<b>Склад Казань (WB)</b>');
    expect(formatted).toContain('Дата доставки: 22.11.2026');
    expect(formatted).toContain('Паллеты: 4');
    expect(formatted).toContain('Коробки: 80');
    expect(formatted).toContain('ИТОГО:\nПаллеты: 4\nКоробки: 80');
  });

  it('should calculate totals automatically if totalPallets and totalBoxes not explicitly passed', () => {
    const destinations: TelegramDestinationItem[] = [
      {
        warehouseName: 'Склад 1',
        palletsCount: 2,
        boxesCount: 10,
      },
      {
        warehouseName: 'Склад 2',
        palletsCount: 3,
        boxesCount: 15,
      },
      {
        warehouseName: 'Склад 3',
        palletsCount: 1,
        boxesCount: 5,
      },
    ];

    const formatted = TelegramNotificationService.formatTelegramDestinations(destinations);
    expect(formatted).toContain('ИТОГО:\nПаллеты: 6\nКоробки: 30');
  });
});
