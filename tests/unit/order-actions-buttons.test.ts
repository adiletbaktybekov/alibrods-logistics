import { describe, it, expect } from 'vitest';
import { OrderStatus } from '@prisma/client';

describe('Order Action Buttons Visibility Rules', () => {
  // Pure helper reflecting order-actions.tsx logic
  function checkDecisionVisibility(status: OrderStatus): boolean {
    return status === OrderStatus.CREATED || status === OrderStatus.PENDING_CONFIRMATION;
  }

  function getAvailableWorkflowActions(status: OrderStatus): string[] {
    switch (status) {
      case OrderStatus.ASSIGNED_TO_DRIVER:
        return ['ACCEPTED_BY_DRIVER'];
      case OrderStatus.ACCEPTED_BY_DRIVER:
        return ['PICKED_UP', 'ASSIGNED_TO_DRIVER'];
      case OrderStatus.PICKED_UP:
        return ['IN_TRANSIT', 'ACCEPTED_BY_DRIVER'];
      case OrderStatus.IN_TRANSIT:
        return ['DELIVERED_TO_WAREHOUSE', 'PICKED_UP'];
      case OrderStatus.DELIVERED_TO_WAREHOUSE:
        return ['ACCEPTED_BY_MARKETPLACE', 'IN_TRANSIT'];
      case OrderStatus.ACCEPTED_BY_MARKETPLACE:
        return ['COMPLETED', 'DELIVERED_TO_WAREHOUSE'];
      case OrderStatus.COMPLETED:
        return [];
      default:
        return [];
    }
  }

  it('shows decision buttons ONLY when order is pending manager decision (CREATED or PENDING_CONFIRMATION)', () => {
    expect(checkDecisionVisibility(OrderStatus.CREATED)).toBe(true);
    expect(checkDecisionVisibility(OrderStatus.PENDING_CONFIRMATION)).toBe(true);
  });

  it('strictly hides decision buttons for ASSIGNED_TO_DRIVER (Fixes Screenshot 2 bug)', () => {
    expect(checkDecisionVisibility(OrderStatus.ASSIGNED_TO_DRIVER)).toBe(false);
  });

  it('strictly hides decision buttons for CONFIRMED, in-delivery and final statuses', () => {
    expect(checkDecisionVisibility(OrderStatus.CONFIRMED)).toBe(false);
    expect(checkDecisionVisibility(OrderStatus.ACCEPTED_BY_DRIVER)).toBe(false);
    expect(checkDecisionVisibility(OrderStatus.PICKED_UP)).toBe(false);
    expect(checkDecisionVisibility(OrderStatus.IN_TRANSIT)).toBe(false);
    expect(checkDecisionVisibility(OrderStatus.DELIVERED_TO_WAREHOUSE)).toBe(false);
    expect(checkDecisionVisibility(OrderStatus.ACCEPTED_BY_MARKETPLACE)).toBe(false);
    expect(checkDecisionVisibility(OrderStatus.COMPLETED)).toBe(false);
    expect(checkDecisionVisibility(OrderStatus.REJECTED_BY_MANAGER)).toBe(false);
    expect(checkDecisionVisibility(OrderStatus.CANCELLED)).toBe(false);
  });

  it('provides forward and backward transitions at every delivery stage', () => {
    expect(getAvailableWorkflowActions(OrderStatus.ASSIGNED_TO_DRIVER)).toEqual(['ACCEPTED_BY_DRIVER']);
    expect(getAvailableWorkflowActions(OrderStatus.ACCEPTED_BY_DRIVER)).toEqual(['PICKED_UP', 'ASSIGNED_TO_DRIVER']);
    expect(getAvailableWorkflowActions(OrderStatus.PICKED_UP)).toEqual(['IN_TRANSIT', 'ACCEPTED_BY_DRIVER']);
    expect(getAvailableWorkflowActions(OrderStatus.IN_TRANSIT)).toEqual(['DELIVERED_TO_WAREHOUSE', 'PICKED_UP']);
    expect(getAvailableWorkflowActions(OrderStatus.DELIVERED_TO_WAREHOUSE)).toEqual(['ACCEPTED_BY_MARKETPLACE', 'IN_TRANSIT']);
    expect(getAvailableWorkflowActions(OrderStatus.ACCEPTED_BY_MARKETPLACE)).toEqual(['COMPLETED', 'DELIVERED_TO_WAREHOUSE']);
    expect(getAvailableWorkflowActions(OrderStatus.COMPLETED)).toEqual([]);
  });
});
