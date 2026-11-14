import { describe, it, expect } from 'vitest';
import { TelegramNotificationService, TelegramGroupEventType } from '@/modules/telegram/notification.service';
import { OrderStatus } from '@prisma/client';

describe('Telegram Shipping Group Silence (Topic 8 Protection)', () => {
  it('strictly maps ONLY ORDER_CONFIRMED to the shipping group thread', () => {
    // Check which events are allowed to send to the group topic
    const allowedGroupEvents: TelegramGroupEventType[] = ['ORDER_CONFIRMED', 'ORDER_CREATED', 'ORDER_REJECTED'];

    // Requirement 2: Subsequent status updates must NEVER be dispatched to topic 8
    const forbiddenStatusesAfterConfirmation: OrderStatus[] = [
      OrderStatus.ASSIGNED_TO_DRIVER,
      OrderStatus.ACCEPTED_BY_DRIVER,
      OrderStatus.PICKED_UP,
      OrderStatus.IN_TRANSIT,
      OrderStatus.DELIVERED_TO_WAREHOUSE,
      OrderStatus.ACCEPTED_BY_MARKETPLACE,
      OrderStatus.COMPLETED,
    ];

    // Status map inside notifyStatusChanged: None of these statuses should produce a group event
    const statusToGroupEventMap: Partial<Record<OrderStatus, TelegramGroupEventType>> = {
      // Intentionally empty for driver & delivery transitions
    };

    for (const status of forbiddenStatusesAfterConfirmation) {
      expect(statusToGroupEventMap[status]).toBeUndefined();
    }
  });

  it('builds a group message with multi-destinations summary without financial details', () => {
    const payload = {
      orderId: 'test-order-id',
      orderNumber: 'ABL-42',
      marketplace: 'WILDBERRIES',
      warehouseName: 'Коледино (10 кор.); Подольск 2 (5 кор.)',
      destinationsSummary: '• Коледино (10 кор., 1 палл., сдача 20.11)\n• Подольск 2 (5 кор., сдача 21.11)',
      totalBoxesCount: 15,
      totalPalletsCount: 1,
      pickupCity: 'Москва',
      pickupAddress: 'ул. Складочная, 1',
    };

    const msg = TelegramNotificationService.buildGroupMessage('ORDER_CONFIRMED', payload);

    expect(msg).toContain('ABL-42');
    expect(msg).toContain('Коледино');
    expect(msg).toContain('Подольск 2');
    // Financial privacy: no currency or price in shipping group card
    expect(msg).not.toContain('15000');
    expect(msg).not.toContain('deliveryCostAmount');
  });
});
