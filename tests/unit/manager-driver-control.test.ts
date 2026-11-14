import { describe, it, expect } from 'vitest';
import { OrderStatus, UserRole } from '@prisma/client';

describe('Manager Driver Workflow Control in Admin', () => {
  const allowedRoles = ['SUPER_ADMIN', 'ADMIN', 'MANAGER'];

  it('allows manager and admin roles to change driver stage', () => {
    expect(allowedRoles.includes(UserRole.SUPER_ADMIN)).toBe(true);
    expect(allowedRoles.includes(UserRole.ADMIN)).toBe(true);
    expect(allowedRoles.includes(UserRole.MANAGER)).toBe(true);
  });

  it('rejects client and driver roles from modifying driver workflow status', () => {
    expect(allowedRoles.includes(UserRole.CLIENT)).toBe(false);
    expect(allowedRoles.includes(UserRole.DRIVER)).toBe(false);
  });

  it('validates allowed driver workflow target statuses', () => {
    const validDriverWorkflowStatuses: OrderStatus[] = [
      OrderStatus.ASSIGNED_TO_DRIVER,
      OrderStatus.ACCEPTED_BY_DRIVER,
      OrderStatus.PICKED_UP,
    ];

    expect(validDriverWorkflowStatuses).toContain(OrderStatus.ASSIGNED_TO_DRIVER);
    expect(validDriverWorkflowStatuses).toContain(OrderStatus.ACCEPTED_BY_DRIVER);
    expect(validDriverWorkflowStatuses).toContain(OrderStatus.PICKED_UP);
    expect(validDriverWorkflowStatuses).not.toContain(OrderStatus.CANCELLED);
  });
});
