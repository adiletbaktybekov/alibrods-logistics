import { UserRole } from '@prisma/client';
import { SecurityContext, AuthenticatedUser } from '@/types/rbac';
import { Permission, hasPermission } from '@/config/permissions';
import { UnauthorizedError, ForbiddenError } from '@/lib/errors';

export function requireAuth(context: SecurityContext): AuthenticatedUser {
  if (!context.user) {
    throw new UnauthorizedError('Authentication is required to perform this action');
  }
  return context.user;
}

export function requireRole(context: SecurityContext, allowedRoles: UserRole[]): AuthenticatedUser {
  const user = requireAuth(context);
  if (!allowedRoles.includes(user.role)) {
    throw new ForbiddenError(`Role "${user.role}" does not have access to this resource`);
  }
  return user;
}

export function requirePermission(context: SecurityContext, permission: Permission): AuthenticatedUser {
  const user = requireAuth(context);
  if (!hasPermission(user.role, permission)) {
    throw new ForbiddenError(`Missing required permission: "${permission}"`);
  }
  return user;
}

/**
 * IDOR Protection for Order Resources:
 * - SUPER_ADMIN, ADMIN, MANAGER, ACCOUNTANT: permitted
 * - CLIENT: only permitted if order.clientId matches user's client profile ID
 * - DRIVER: only permitted if driver is assigned to the order
 */
export function assertOrderAccess(
  user: AuthenticatedUser,
  order: { clientId: string; assignments?: { driver: { userId: string } }[] }
): void {
  // Elevated roles have broader visibility
  if (['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT'].includes(user.role)) {
    return;
  }

  // Client verification
  if (user.role === 'CLIENT') {
    if (order.clientId !== user.id) {
      throw new ForbiddenError('Clients can only view and manage their own orders');
    }
    return;
  }

  // Driver verification
  if (user.role === 'DRIVER') {
    const isAssigned = order.assignments?.some((a) => a.driver.userId === user.id);
    if (!isAssigned) {
      throw new ForbiddenError('Drivers can only access orders explicitly assigned to them');
    }
    return;
  }

  throw new ForbiddenError('Access to order denied');
}
