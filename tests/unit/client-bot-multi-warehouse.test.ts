import { describe, it, expect } from 'vitest';
import { TelegramNotificationService } from '@/modules/telegram/notification.service';

describe('Client Bot Order Creation Formatting', () => {
  it('formats single warehouse order creation notification according to exact specification', () => {
    const singleOrder = {
      orderNumber: 'AO-1001',
      marketplace: 'WILDBERRIES',
      clientComment: 'Позвонить водителю за час',
      destinations: [
        {
          warehouseName: 'Коледино',
          marketplace: 'WILDBERRIES',
          deliveryDate: '15.01.2025',
          palletsCount: 2,
          boxesCount: 15,
        },
      ],
    };

    const message = TelegramNotificationService.formatClientOrderCreatedMessage(singleOrder);

    expect(message).toContain('📦 <b>Ваша заявка принята и отправлена на согласование!</b>');
    expect(message).toContain('Номер заявки: <code>#AO-1001</code>');
    expect(message).toContain('Склад назначения: <b>Коледино</b>');
    expect(message).toContain('Планируемая дата: <b>15.01.2025</b>');
    expect(message).toContain('Объём поставки:');
    expect(message).toContain('Паллеты: <b>2</b>');
    expect(message).toContain('Коробки: <b>15</b>');
    expect(message).toContain('💬 <b>Комментарий:</b> <i>Позвонить водителю за час</i>');
    expect(message).toContain('<i>Заявка передана менеджерам AliBros Logistics. Мы сразу уведомим вас о результатах согласования и назначении водителя.</i>');

    // Pallets must strictly precede boxes
    expect(message.indexOf('Паллеты: <b>2</b>')).toBeLessThan(message.indexOf('Коробки: <b>15</b>'));
  });

  it('formats multi-warehouse order creation notification (3 warehouses) with marketplaces and totals', () => {
    const multiOrder = {
      orderNumber: 'AO-2002',
      marketplace: 'WILDBERRIES',
      destinations: [
        {
          warehouseName: 'Коледино',
          marketplace: 'WILDBERRIES',
          deliveryDate: '15.01.2025',
          palletsCount: 2,
          boxesCount: 15,
        },
        {
          warehouseName: 'Электросталь',
          marketplace: 'WILDBERRIES',
          deliveryDate: '15.01.2025',
          palletsCount: 1,
          boxesCount: 10,
        },
        {
          warehouseName: 'Подольск',
          marketplace: 'WILDBERRIES',
          deliveryDate: '16.01.2025',
          palletsCount: 0,
          boxesCount: 25,
        },
      ],
    };

    const message = TelegramNotificationService.formatClientOrderCreatedMessage(multiOrder);

    expect(message).toContain('📦 <b>Ваша заявка принята и отправлена на согласование!</b>');
    expect(message).toContain('Номер заявки: <code>#AO-2002</code>');
    expect(message).toContain('Склады назначения:');

    // Warehouse 1
    expect(message).toContain('• <b>Коледино</b>');
    expect(message).toContain('Маркетплейс: Wildberries');
    expect(message).toContain('Дата: 15.01.2025');
    expect(message).toContain('Паллеты: 2');
    expect(message).toContain('Коробки: 15');

    // Warehouse 2
    expect(message).toContain('• <b>Электросталь</b>');
    expect(message).toContain('Паллеты: 1');
    expect(message).toContain('Коробки: 10');

    // Warehouse 3
    expect(message).toContain('• <b>Подольск</b>');
    expect(message).toContain('Дата: 16.01.2025');
    expect(message).toContain('Паллеты: 0');
    expect(message).toContain('Коробки: 25');

    // Totals block
    expect(message).toContain('Итого:');
    expect(message).toContain('Паллеты: 3');
    expect(message).toContain('Коробки: 50');

    // Totals order: Pallets before Boxes
    const itogoIdx = message.indexOf('Итого:');
    const palletsIdx = message.indexOf('Паллеты: 3', itogoIdx);
    const boxesIdx = message.indexOf('Коробки: 50', itogoIdx);
    expect(palletsIdx).toBeLessThan(boxesIdx);

    expect(message).toContain('<i>Заявка передана менеджерам AliBros Logistics. Мы сразу уведомим вас о результатах согласования и назначении водителя.</i>');
  });

  it('formats custom warehouses correctly with marketplace and custom name', () => {
    const orderWithCustom = {
      orderNumber: 'AO-3003',
      marketplace: 'OZON',
      destinations: [
        {
          isCustomWarehouse: true,
          customWarehouseName: 'ТК Деловые Линии (Юг)',
          marketplace: 'OZON',
          deliveryDate: '18.01.2025',
          palletsCount: 4,
          boxesCount: 0,
          comment: 'Ворота №3',
        },
        {
          warehouseName: 'Хоругвино',
          marketplace: 'OZON',
          deliveryDate: '19.01.2025',
          palletsCount: 1,
          boxesCount: 30,
        },
      ],
    };

    const message = TelegramNotificationService.formatClientOrderCreatedMessage(orderWithCustom);

    expect(message).toContain('• <b>ТК Деловые Линии (Юг)</b>');
    expect(message).toContain('Маркетплейс: Ozon');
    expect(message).toContain('Примечание: <i>Ворота №3</i>');
    expect(message).toContain('• <b>Хоругвино</b>');
    expect(message).toContain('Итого:\nПаллеты: 5\nКоробки: 30');
  });
});
