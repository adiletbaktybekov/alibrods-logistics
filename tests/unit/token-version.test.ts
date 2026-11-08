import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getCurrentUser } from '@/app/actions/auth';
import { signAuthToken, verifyAuthToken } from '@/lib/security/jwt';
import { UserRole } from '@prisma/client';
import { SignJWT } from 'jose';
import { env } from '@/config/env';

// Mock cookies for getCurrentUser
vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}));

// Mock Prisma
vi.mock('@/database/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
  },
}));

import { cookies } from 'next/headers';
import { prisma } from '@/database/prisma';

describe('tokenVersion Architecture & Instant Session Revocation', () => {
  const secretKey = new TextEncoder().encode(env.JWT_SECRET);
  const testUserId = 'usr-test-token-version-1';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. Standard login with tokenVersion = 1 is accepted', async () => {
    const token = await signAuthToken({
      userId: testUserId,
      role: UserRole.CLIENT,
      email: 'client@seller.ru',
      phone: '+79001112233',
      tokenVersion: 1,
    });

    vi.mocked(cookies).mockResolvedValue({
      get: vi.fn().mockReturnValue({ value: token }),
    } as any);

    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: testUserId,
      role: UserRole.CLIENT,
      email: 'client@seller.ru',
      phone: '+79001112233',
      isActive: true,
      tokenVersion: 1,
    } as any);

    const user = await getCurrentUser();
    expect(user).not.toBeNull();
    expect(user?.id).toBe(testUserId);
    expect(user?.role).toBe(UserRole.CLIENT);
  });

  it('2. Rejects JWT without tokenVersion claim', async () => {
    // Craft legacy / untrusted token without tokenVersion
    const legacyToken = await new SignJWT({
      role: UserRole.CLIENT,
      email: 'client@seller.ru',
    })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(testUserId)
      .setIssuedAt()
      .setIssuer('alibros-logistics')
      .setAudience('alibros-users')
      .setExpirationTime('7d')
      .sign(secretKey);

    vi.mocked(cookies).mockResolvedValue({
      get: vi.fn().mockReturnValue({ value: legacyToken }),
    } as any);

    const user = await getCurrentUser();
    expect(user).toBeNull();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('3. Rejects JWT with incorrect / mismatched tokenVersion', async () => {
    const outdatedToken = await signAuthToken({
      userId: testUserId,
      role: UserRole.CLIENT,
      email: 'client@seller.ru',
      tokenVersion: 1,
    });

    vi.mocked(cookies).mockResolvedValue({
      get: vi.fn().mockReturnValue({ value: outdatedToken }),
    } as any);

    // Database has tokenVersion = 2
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: testUserId,
      role: UserRole.CLIENT,
      email: 'client@seller.ru',
      phone: null,
      isActive: true,
      tokenVersion: 2,
    } as any);

    const user = await getCurrentUser();
    expect(user).toBeNull();
  });

  it('4. Revokes old session after password change (v1 -> v2) while new session (v2) succeeds', async () => {
    const oldSessionToken = await signAuthToken({
      userId: testUserId,
      role: UserRole.SUPER_ADMIN,
      email: 'admin@alibros.ru',
      tokenVersion: 1,
    });

    const newSessionToken = await signAuthToken({
      userId: testUserId,
      role: UserRole.SUPER_ADMIN,
      email: 'admin@alibros.ru',
      tokenVersion: 2,
    });

    // DB after password change has tokenVersion = 2
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: testUserId,
      role: UserRole.SUPER_ADMIN,
      email: 'admin@alibros.ru',
      phone: null,
      isActive: true,
      tokenVersion: 2,
    } as any);

    // Check old device with v1
    vi.mocked(cookies).mockResolvedValue({
      get: vi.fn().mockReturnValue({ value: oldSessionToken }),
    } as any);
    const oldSessionResult = await getCurrentUser();
    expect(oldSessionResult).toBeNull();

    // Check current device with v2
    vi.mocked(cookies).mockResolvedValue({
      get: vi.fn().mockReturnValue({ value: newSessionToken }),
    } as any);
    const newSessionResult = await getCurrentUser();
    expect(newSessionResult).not.toBeNull();
    expect(newSessionResult?.id).toBe(testUserId);
    expect(newSessionResult?.role).toBe(UserRole.SUPER_ADMIN);
  });

  it('5. Rejects deactivated user (isActive = false) even with matching tokenVersion', async () => {
    const token = await signAuthToken({
      userId: testUserId,
      role: UserRole.CLIENT,
      tokenVersion: 1,
    });

    vi.mocked(cookies).mockResolvedValue({
      get: vi.fn().mockReturnValue({ value: token }),
    } as any);

    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: testUserId,
      role: UserRole.CLIENT,
      email: null,
      phone: null,
      isActive: false, // Deactivated account
      tokenVersion: 1,
    } as any);

    const user = await getCurrentUser();
    expect(user).toBeNull();
  });

  it('6. Dynamically verifies and returns updated role from database rather than trusting stale JWT claim', async () => {
    // Token was issued when user was CLIENT
    const token = await signAuthToken({
      userId: testUserId,
      role: UserRole.CLIENT,
      tokenVersion: 1,
    });

    vi.mocked(cookies).mockResolvedValue({
      get: vi.fn().mockReturnValue({ value: token }),
    } as any);

    // Later, the user was promoted in DB to MANAGER without changing tokenVersion
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: testUserId,
      role: UserRole.MANAGER, // Fresh DB role
      email: 'promoted@alibros.ru',
      phone: null,
      isActive: true,
      tokenVersion: 1,
    } as any);

    const user = await getCurrentUser();
    expect(user).not.toBeNull();
    expect(user?.role).toBe(UserRole.MANAGER); // Must be MANAGER, NOT CLIENT
  });
});
