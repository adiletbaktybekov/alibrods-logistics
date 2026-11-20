import { describe, it, expect } from 'vitest';
import {
  ACTIVE_ORDER_STATUSES,
  ACTIVE_STATUS_LABELS,
  STATUS_LABELS,
} from '@/components/ui/status-badge';
import { OrderStatus } from '@prisma/client';
import { StatusAccordion } from '@/components/ui/status-accordion';

describe('Simplified Order Statuses and StatusAccordion', () => {
  it('strictly excludes retired statuses from ACTIVE_ORDER_STATUSES', () => {
    expect(ACTIVE_ORDER_STATUSES).not.toContain('IN_TRANSIT');
    expect(ACTIVE_ORDER_STATUSES).not.toContain('DELIVERED_TO_WAREHOUSE');
    expect(ACTIVE_ORDER_STATUSES).not.toContain('ACCEPTED_BY_MARKETPLACE');

    // Exactly 9 operational statuses
    expect(ACTIVE_ORDER_STATUSES).toHaveLength(9);
    expect(ACTIVE_ORDER_STATUSES).toEqual([
      OrderStatus.CREATED,
      OrderStatus.PENDING_CONFIRMATION,
      OrderStatus.CONFIRMED,
      OrderStatus.ASSIGNED_TO_DRIVER,
      OrderStatus.ACCEPTED_BY_DRIVER,
      OrderStatus.PICKED_UP,
      OrderStatus.COMPLETED,
      OrderStatus.REJECTED_BY_MANAGER,
      OrderStatus.CANCELLED,
    ]);
  });

  it('excludes retired statuses from ACTIVE_STATUS_LABELS', () => {
    expect(ACTIVE_STATUS_LABELS).not.toHaveProperty('IN_TRANSIT');
    expect(ACTIVE_STATUS_LABELS).not.toHaveProperty('DELIVERED_TO_WAREHOUSE');
    expect(ACTIVE_STATUS_LABELS).not.toHaveProperty('ACCEPTED_BY_MARKETPLACE');

    // All active statuses have user-friendly Russian labels
    for (const status of ACTIVE_ORDER_STATUSES) {
      expect(ACTIVE_STATUS_LABELS[status]).toBeDefined();
      expect(typeof ACTIVE_STATUS_LABELS[status]).toBe('string');
      expect(ACTIVE_STATUS_LABELS[status].length).toBeGreaterThan(0);
    }
  });

  it('preserves historical labels in STATUS_LABELS for backward compatibility', () => {
    expect(STATUS_LABELS['IN_TRANSIT']).toBe('В пути');
    expect(STATUS_LABELS['DELIVERED_TO_WAREHOUSE']).toBe('Прибыла на склад');
    expect(STATUS_LABELS['ACCEPTED_BY_MARKETPLACE']).toBe('Принята маркетплейсом');
  });

  it('exports StatusAccordion component properly', () => {
    expect(StatusAccordion).toBeDefined();
    expect(typeof StatusAccordion).toBe('function');
  });
});
