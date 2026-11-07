import { describe, it, expect, vi, beforeEach } from 'vitest';
import { requireStaffUser } from '@/app/actions/admin';
import { assertOrderAccess, requireRole, requirePermission } from '@/server/guards';
import { isRedirectError, isExpectedAuthError, UnauthorizedError, ForbiddenError, AppError } from '@/lib/errors';
import { safeLogError, logger } from '@/lib/logger';
import { signAuthToken, verifyAuthToken } from '@/lib/security/jwt';
import { AuthenticatedUser } from '@/types/rbac';

// Mock cookies for getCurrentUser in admin.ts
vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}));

import { cookies } from 'next/headers';

describe('Stage 6: Authorization Security Audit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('requireStaffUser & RBAC Enforcement', () => {
    it('throws UnauthorizedError when session is missing / unauthenticated', async () => {
      vi.mocked(cookies).mockResolvedValue({
        get: vi.fn().mockReturnValue(undefined),
      } as any);

      await expect(requireStaffUser()).rejects.toThrow(UnauthorizedError);
      await expect(requireStaffUser()).rejects.toThrow('Требуется авторизация сотрудника');
    });

    it('throws ForbiddenError when user has CLIENT role', async () => {
      const clientToken = await signAuthToken({
        userId: 'client-user-id',
        role: 'CLIENT',
        email: 'client@example.com',
      });

      vi.mocked(cookies).mockResolvedValue({
        get: vi.fn().mockReturnValue({ value: clientToken }),
      } as any);

      await expect(requireStaffUser()).rejects.toThrow(ForbiddenError);
      await expect(requireStaffUser()).rejects.toThrow('запрещён для данной роли');
    });

    it('throws ForbiddenError when user has DRIVER role', async () => {
      const driverToken = await signAuthToken({
        userId: 'driver-user-id',
        role: 'DRIVER',
        phone: '+79991112233',
      });

      vi.mocked(cookies).mockResolvedValue({
        get: vi.fn().mockReturnValue({ value: driverToken }),
      } as any);

      await expect(requireStaffUser()).rejects.toThrow(ForbiddenError);
    });

    it('successfully returns authenticated user for SUPER_ADMIN', async () => {
      const adminToken = await signAuthToken({
        userId: 'super-admin-id',
        role: 'SUPER_ADMIN',
        email: 'admin@alibros.ru',
      });

      vi.mocked(cookies).mockResolvedValue({
        get: vi.fn().mockReturnValue({ value: adminToken }),
      } as any);

      const user = await requireStaffUser();
      expect(user).toBeDefined();
      expect(user.id).toBe('super-admin-id');
      expect(user.role).toBe('SUPER_ADMIN');
    });

    it('successfully returns authenticated user for MANAGER and ACCOUNTANT', async () => {
      for (const role of ['MANAGER', 'ACCOUNTANT', 'ADMIN'] as const) {
        const token = await signAuthToken({
          userId: `staff-${role.toLowerCase()}`,
          role,
        });

        vi.mocked(cookies).mockResolvedValue({
          get: vi.fn().mockReturnValue({ value: token }),
        } as any);

        const user = await requireStaffUser();
        expect(user.role).toBe(role);
      }
    });
  });

  describe('IDOR Protection (assertOrderAccess)', () => {
    const elevatedUsers: AuthenticatedUser[] = [
      { id: 'sa-1', role: 'SUPER_ADMIN' },
      { id: 'adm-1', role: 'ADMIN' },
      { id: 'mgr-1', role: 'MANAGER' },
      { id: 'acc-1', role: 'ACCOUNTANT' },
    ];

    const orderData = {
      clientId: 'client-profile-100',
      client: { userId: 'client-user-100' },
      assignments: [
        { driver: { userId: 'assigned-driver-user-200' } },
      ],
    };

    it('allows all elevated staff roles to access any order', () => {
      for (const staff of elevatedUsers) {
        expect(() => assertOrderAccess(staff, orderData)).not.toThrow();
      }
    });

    it('allows client to access order by clientId or client.userId', () => {
      const clientByProfile: AuthenticatedUser = {
        id: 'client-profile-100',
        role: 'CLIENT',
      };
      const clientByUser: AuthenticatedUser = {
        id: 'client-user-100',
        role: 'CLIENT',
      };

      expect(() => assertOrderAccess(clientByProfile, orderData)).not.toThrow();
      expect(() => assertOrderAccess(clientByUser, orderData)).not.toThrow();
    });

    it('strictly forbids other clients from accessing the order (IDOR block)', () => {
      const attackerClient: AuthenticatedUser = {
        id: 'attacker-client-666',
        role: 'CLIENT',
      };

      expect(() => assertOrderAccess(attackerClient, orderData)).toThrow(ForbiddenError);
      expect(() => assertOrderAccess(attackerClient, orderData)).toThrow('only view and manage their own orders');
    });

    it('allows assigned driver to access the order', () => {
      const assignedDriver: AuthenticatedUser = {
        id: 'assigned-driver-user-200',
        role: 'DRIVER',
      };

      expect(() => assertOrderAccess(assignedDriver, orderData)).not.toThrow();
    });

    it('strictly forbids unassigned driver from accessing the order (IDOR block)', () => {
      const otherDriver: AuthenticatedUser = {
        id: 'unassigned-driver-user-999',
        role: 'DRIVER',
      };

      expect(() => assertOrderAccess(otherDriver, orderData)).toThrow(ForbiddenError);
      expect(() => assertOrderAccess(otherDriver, orderData)).toThrow('only access orders explicitly assigned to them');
    });
  });

  describe('Error Classification & Safe Logging', () => {
    it('correctly identifies Next.js navigation redirect errors', () => {
      const redirectError = { digest: 'NEXT_REDIRECT;replace;/login;307' };
      const notFoundError = { digest: 'NEXT_NOT_FOUND' };
      const standardError = new Error('Database connection failed');

      expect(isRedirectError(redirectError)).toBe(true);
      expect(isRedirectError(notFoundError)).toBe(true);
      expect(isRedirectError(standardError)).toBe(false);
      expect(isRedirectError(null)).toBe(false);
      expect(isRedirectError(undefined)).toBe(false);
    });

    it('correctly distinguishes expected auth errors from unexpected 500 crashes', () => {
      const unauth = new UnauthorizedError('Please log in');
      const forbidden = new ForbiddenError('Access forbidden');
      const redirectError = { digest: 'NEXT_REDIRECT;replace;/login;307' };
      const serverCrash = new Error('Unexpected crash in worker');
      const genericAppError = new AppError('Server error', 500, 'INTERNAL_ERROR');

      expect(isExpectedAuthError(unauth)).toBe(true);
      expect(isExpectedAuthError(forbidden)).toBe(true);
      expect(isExpectedAuthError(redirectError)).toBe(true);
      expect(isExpectedAuthError(serverCrash)).toBe(false);
      expect(isExpectedAuthError(genericAppError)).toBe(false);
    });

    it('safeLogError routes redirects to debug and auth challenges to warn, preventing false-alarm critical errors', () => {
      const debugSpy = vi.spyOn(logger, 'debug').mockImplementation(() => logger);
      const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => logger);
      const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => logger);

      // 1. Next.js redirect
      safeLogError({ digest: 'NEXT_REDIRECT;replace;/login;307' }, 'Route handler redirect');
      expect(debugSpy).toHaveBeenCalled();
      expect(errorSpy).not.toHaveBeenCalled();

      // 2. Expected UnauthorizedError
      safeLogError(new UnauthorizedError('Token expired'), 'Page render');
      expect(warnSpy).toHaveBeenCalled();
      expect(errorSpy).not.toHaveBeenCalled();

      // 3. Unexpected 500 Server error
      safeLogError(new Error('Fatal Postgres connection reset'), 'Database query');
      expect(errorSpy).toHaveBeenCalled();
    });
  });

  describe('JWT Security & Edge Compatibility', () => {
    it('verifies cryptographic integrity of signed tokens with jose', async () => {
      const token = await signAuthToken({
        userId: 'user-crypto-test-1',
        role: 'SUPER_ADMIN',
        email: 'admin@alibros.ru',
      });

      const payload = await verifyAuthToken(token);
      expect(payload).not.toBeNull();
      expect(payload?.sub).toBe('user-crypto-test-1');
      expect(payload?.role).toBe('SUPER_ADMIN');
      expect(payload?.email).toBe('admin@alibros.ru');
    });

    it('rejects tampered or forged tokens', async () => {
      const token = await signAuthToken({
        userId: 'user-crypto-test-2',
        role: 'CLIENT',
      });

      // Tamper token payload
      const parts = token.split('.');
      const tampered = `${parts[0]}.${parts[1]}xyz.${parts[2]}`;

      const payload = await verifyAuthToken(tampered);
      expect(payload).toBeNull();
    });
  });
});
