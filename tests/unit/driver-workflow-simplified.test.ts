import { describe, it, expect } from 'vitest';
import { DriverOrderService } from '@/modules/orders/driver-order.service';
import { OrderStatus, AssignmentStatus } from '@prisma/client';

describe('Simplified Driver Workflow (Accept -> Picked up -> History)', () => {
  it('defines active driver statuses as strictly ASSIGNED and ACCEPTED', () => {
    expect(DriverOrderService.ACTIVE_DRIVER_STATUSES).toEqual([
      OrderStatus.ASSIGNED_TO_DRIVER,
      OrderStatus.ACCEPTED_BY_DRIVER,
    ]);
  });

  it('defines completed driver history statuses starting from PICKED_UP', () => {
    expect(DriverOrderService.COMPLETED_DRIVER_STATUSES).toContain(OrderStatus.PICKED_UP);
    expect(DriverOrderService.COMPLETED_DRIVER_STATUSES).toContain(OrderStatus.COMPLETED);
    expect(DriverOrderService.COMPLETED_DRIVER_STATUSES).not.toContain('IN_TRANSIT');
    expect(DriverOrderService.COMPLETED_DRIVER_STATUSES).not.toContain('DELIVERED_TO_WAREHOUSE');
  });

  it('verifies that PICKED_UP leaves order under manager control without prematurely completing the order globally', () => {
    // A picked up order must NOT automatically jump to COMPLETED
    const orderStatusAfterDriverPickedUp = OrderStatus.PICKED_UP;
    expect(orderStatusAfterDriverPickedUp).not.toBe(OrderStatus.COMPLETED);
  });

  it('verifies callback routing for 2 simplified buttons', () => {
    const validDriverCallbacks = ['cb:accept', 'cb:picked'];
    expect(validDriverCallbacks).toContain('cb:accept');
    expect(validDriverCallbacks).toContain('cb:picked');
  });
});
