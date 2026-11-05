import { UserRole } from '@prisma/client';

export type Permission =
  // User & Profile
  | 'users:read'
  | 'users:write'
  | 'users:manage-roles'
  // Orders
  | 'orders:create'
  | 'orders:read-own'
  | 'orders:read-assigned'
  | 'orders:read-all'
  | 'orders:update-own'
  | 'orders:update-assigned'
  | 'orders:update-all'
  | 'orders:delete'
  | 'orders:assign-driver'
  | 'orders:update-status'
  // Drivers
  | 'drivers:read'
  | 'drivers:manage'
  // Clients
  | 'clients:read-own'
  | 'clients:manage'
  // Warehouses
  | 'warehouses:read'
  | 'warehouses:manage'
  // Reports & Financials
  | 'reports:read-financial'
  | 'reports:read-operational'
  | 'reports:export'
  // Integrations & System
  | 'integrations:manage'
  | 'audit:read'
  | 'system:settings';

export const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  SUPER_ADMIN: [
    'users:read',
    'users:write',
    'users:manage-roles',
    'orders:create',
    'orders:read-own',
    'orders:read-assigned',
    'orders:read-all',
    'orders:update-own',
    'orders:update-assigned',
    'orders:update-all',
    'orders:delete',
    'orders:assign-driver',
    'orders:update-status',
    'drivers:read',
    'drivers:manage',
    'clients:read-own',
    'clients:manage',
    'warehouses:read',
    'warehouses:manage',
    'reports:read-financial',
    'reports:read-operational',
    'reports:export',
    'integrations:manage',
    'audit:read',
    'system:settings',
  ],
  ADMIN: [
    'users:read',
    'users:write',
    'orders:create',
    'orders:read-all',
    'orders:update-all',
    'orders:assign-driver',
    'orders:update-status',
    'drivers:read',
    'drivers:manage',
    'clients:read-own',
    'clients:manage',
    'warehouses:read',
    'warehouses:manage',
    'reports:read-financial',
    'reports:read-operational',
    'reports:export',
    'integrations:manage',
    'audit:read',
  ],
  MANAGER: [
    'orders:create',
    'orders:read-all',
    'orders:update-all',
    'orders:assign-driver',
    'orders:update-status',
    'drivers:read',
    'clients:read-own',
    'clients:manage',
    'warehouses:read',
    'reports:read-operational',
    'reports:export',
  ],
  ACCOUNTANT: [
    'orders:read-all',
    'reports:read-financial',
    'reports:read-operational',
    'reports:export',
    'clients:read-own',
    'integrations:manage',
  ],
  DRIVER: [
    'orders:read-assigned',
    'orders:update-assigned',
    'orders:update-status',
    'warehouses:read',
  ],
  CLIENT: [
    'orders:create',
    'orders:read-own',
    'clients:read-own',
    'warehouses:read',
  ],
};

export function hasPermission(role: UserRole, permission: Permission): boolean {
  const permissions = ROLE_PERMISSIONS[role];
  if (!permissions) return false;
  return permissions.includes(permission);
}

export function hasAnyPermission(role: UserRole, permissions: Permission[]): boolean {
  return permissions.some((perm) => hasPermission(role, perm));
}

export function hasAllPermissions(role: UserRole, permissions: Permission[]): boolean {
  return permissions.every((perm) => hasPermission(role, perm));
}
