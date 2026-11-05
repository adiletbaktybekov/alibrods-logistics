import { describe, it, expect } from 'vitest';
import { hasPermission } from '@/config/permissions';
import { assertOrderAccess } from '@/server/guards';
import { AuthenticatedUser } from '@/types/rbac';

describe('RBAC & Permission Matrix', () => {
  it('SUPER_ADMIN should have all permissions', () => {
    expect(hasPermission('SUPER_ADMIN', 'users:manage-roles')).toBe(true);
    expect(hasPermission('SUPER_ADMIN', 'orders:delete')).toBe(true);
    expect(hasPermission('SUPER_ADMIN', 'integrations:manage')).toBe(true);
    expect(hasPermission('SUPER_ADMIN', 'reports:read-financial')).toBe(true);
  });

  it('CLIENT should only have client-scoped permissions', () => {
    expect(hasPermission('CLIENT', 'orders:create')).toBe(true);
    expect(hasPermission('CLIENT', 'orders:read-own')).toBe(true);
    expect(hasPermission('CLIENT', 'orders:read-all')).toBe(false);
    expect(hasPermission('CLIENT', 'orders:update-own')).toBe(false);
    expect(hasPermission('CLIENT', 'orders:update-status')).toBe(false);
    expect(hasPermission('CLIENT', 'orders:delete')).toBe(false);
    expect(hasPermission('CLIENT', 'drivers:manage')).toBe(false);
    expect(hasPermission('CLIENT', 'reports:read-financial')).toBe(false);
  });

  it('DRIVER should only have driver-scoped permissions', () => {
    expect(hasPermission('DRIVER', 'orders:read-assigned')).toBe(true);
    expect(hasPermission('DRIVER', 'orders:update-status')).toBe(true);
    expect(hasPermission('DRIVER', 'orders:read-all')).toBe(false);
    expect(hasPermission('DRIVER', 'orders:create')).toBe(false);
  });

  it('ACCOUNTANT should have financial read access but not driver management', () => {
    expect(hasPermission('ACCOUNTANT', 'reports:read-financial')).toBe(true);
    expect(hasPermission('ACCOUNTANT', 'orders:read-all')).toBe(true);
    expect(hasPermission('ACCOUNTANT', 'drivers:manage')).toBe(false);
  });
});

describe('IDOR Protection (assertOrderAccess)', () => {
  const clientUser: AuthenticatedUser = {
    id: 'client-user-1111',
    role: 'CLIENT',
  };

  const driverUser: AuthenticatedUser = {
    id: 'driver-user-2222',
    role: 'DRIVER',
  };

  const managerUser: AuthenticatedUser = {
    id: 'manager-user-3333',
    role: 'MANAGER',
  };

  const orderMock = {
    clientId: 'client-user-1111',
    assignments: [
      { driver: { userId: 'driver-user-2222' } },
    ],
  };

  it('allows client to access their own order', () => {
    expect(() => assertOrderAccess(clientUser, orderMock)).not.toThrow();
  });

  it('blocks client from accessing another client order (IDOR attempt)', () => {
    const maliciousClient: AuthenticatedUser = {
      id: 'attacker-client-9999',
      role: 'CLIENT',
    };
    expect(() => assertOrderAccess(maliciousClient, orderMock)).toThrow('only view and manage their own');
  });

  it('allows assigned driver to access order', () => {
    expect(() => assertOrderAccess(driverUser, orderMock)).not.toThrow();
  });

  it('blocks unassigned driver from accessing order', () => {
    const otherDriver: AuthenticatedUser = {
      id: 'other-driver-7777',
      role: 'DRIVER',
    };
    expect(() => assertOrderAccess(otherDriver, orderMock)).toThrow('only access orders explicitly assigned');
  });

  it('allows manager to access any order', () => {
    expect(() => assertOrderAccess(managerUser, orderMock)).not.toThrow();
  });
});
