import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserRole } from '@prisma/client';

// Mock currentUser and requireStaffUser in auth / admin
let mockUser: any = null;

vi.mock('@/app/actions/auth', () => ({
  getCurrentUser: vi.fn(async () => mockUser),
  logoutAction: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

// Setup Mock Prisma for unit tests
vi.mock('@/database/prisma', async () => {
  const { createMockPrisma } = await import('../mocks/mock-prisma');
  const mockPrisma = createMockPrisma();
  return {
    prisma: mockPrisma.mockClient,
  };
});

describe('Telegram Pairing UI & Server Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = null;
    process.env.TELEGRAM_CLIENT_BOT_USERNAME = 'AliBrosClientBot';
    process.env.TELEGRAM_MANAGER_BOT_USERNAME = 'AliBrosManagerBot';
  });

  describe('Client Telegram Actions (/profile)', () => {
    it('getClientTelegramInfoAction rejects unauthenticated user', async () => {
      const { getClientTelegramInfoAction } = await import('@/app/actions/profile');
      mockUser = null;

      const res = await getClientTelegramInfoAction();
      expect(res.success).toBe(false);
      expect(res.error).toContain('Доступ разрешён только авторизованным клиентам');
    });

    it('getClientTelegramInfoAction rejects non-CLIENT role (IDOR / RBAC protection)', async () => {
      const { getClientTelegramInfoAction } = await import('@/app/actions/profile');
      mockUser = { id: 'driver-id', role: UserRole.DRIVER };

      const res = await getClientTelegramInfoAction();
      expect(res.success).toBe(false);
      expect(res.error).toContain('Доступ разрешён только авторизованным клиентам');
    });

    it('getClientTelegramInfoAction returns correct initial state when unlinked and no active code', async () => {
      const { getClientTelegramInfoAction } = await import('@/app/actions/profile');
      mockUser = { id: 'client-user-uuid-1', role: UserRole.CLIENT };

      const res = await getClientTelegramInfoAction();
      expect(res.success).toBe(true);
      expect(res.data?.telegramAccount).toBeNull();
      expect(res.data?.activePairingCode).toBeNull();
      expect(res.data?.botUsername).toBe('AliBrosClientBot');
    });

    it('generateClientPairingCodeAction successfully generates code with ABL- prefix and deep link', async () => {
      const { generateClientPairingCodeAction } = await import('@/app/actions/profile');
      mockUser = { id: 'client-user-uuid-1', role: UserRole.CLIENT };

      const res = await generateClientPairingCodeAction();
      expect(res.success).toBe(true);
      expect(res.code).toMatch(/^ABL-[A-Z0-9]{6}$/);
      expect(res.expiresAt).toBeDefined();
      expect(res.deepLink).toBe(`https://t.me/AliBrosClientBot?start=${res.code}`);
    });

    it('generateClientPairingCodeAction safely serializes to JSON without BigInt crash', async () => {
      const { generateClientPairingCodeAction, getClientTelegramInfoAction } = await import('@/app/actions/profile');
      const { prisma } = await import('@/database/prisma');
      mockUser = { id: 'client-user-uuid-1', role: UserRole.CLIENT };

      // Link a mock telegram account with BigInt telegramId
      await prisma.telegramAccount.upsert({
        where: { userId: mockUser.id },
        create: {
          userId: mockUser.id,
          telegramId: BigInt('9184334860'),
          username: 'test_client_seller',
          firstName: 'Тестовый',
        },
        update: {},
      });

      const res = await getClientTelegramInfoAction();
      expect(res.success).toBe(true);
      expect(typeof res.data?.telegramAccount?.telegramId).toBe('string');
      expect(res.data?.telegramAccount?.telegramId).toBe('9184334860');

      // Crucial check: verify JSON.stringify does NOT throw
      expect(() => JSON.stringify(res)).not.toThrow();
    });

    it('unlinkClientTelegramAction successfully unlinks telegram account', async () => {
      const { unlinkClientTelegramAction, getClientTelegramInfoAction } = await import('@/app/actions/profile');
      mockUser = { id: 'client-user-uuid-1', role: UserRole.CLIENT };

      const unlinkRes = await unlinkClientTelegramAction();
      expect(unlinkRes.success).toBe(true);

      const infoRes = await getClientTelegramInfoAction();
      expect(infoRes.data?.telegramAccount).toBeNull();
    });
  });

  describe('Manager / Staff Telegram Actions (/admin/profile)', () => {
    it('getManagerTelegramInfoAction rejects non-staff roles', async () => {
      const { getManagerTelegramInfoAction } = await import('@/app/actions/admin');
      mockUser = { id: 'client-user-uuid-1', role: UserRole.CLIENT };

      const res = await getManagerTelegramInfoAction();
      expect(res.success).toBe(false);
      expect(res.error).toContain('запрещён');
    });

    it('generateManagerPairingCodeAction generates code and links with AliBrosManagerBot', async () => {
      const { generateManagerPairingCodeAction } = await import('@/app/actions/admin');
      mockUser = { id: 'manager-user-uuid-1', role: UserRole.MANAGER, email: 'mgr@alibros.ru' };

      const res = await generateManagerPairingCodeAction();
      expect(res.success).toBe(true);
      expect(res.code).toMatch(/^ABL-[A-Z0-9]{6}$/);
      expect(res.deepLink).toBe(`https://t.me/AliBrosManagerBot?start=${res.code}`);
    });

    it('getManagerTelegramInfoAction returns serialized BigInt safely', async () => {
      const { getManagerTelegramInfoAction } = await import('@/app/actions/admin');
      const { prisma } = await import('@/database/prisma');
      mockUser = { id: 'manager-user-uuid-1', role: UserRole.SUPER_ADMIN, email: 'super@alibros.ru' };

      await prisma.telegramAccount.upsert({
        where: { userId: mockUser.id },
        create: {
          userId: mockUser.id,
          telegramId: BigInt('9155408641'),
          username: 'manager_admin',
          firstName: 'Admin',
        },
        update: {},
      });

      const res = await getManagerTelegramInfoAction();
      expect(res.success).toBe(true);
      expect(typeof res.data?.telegramAccount?.telegramId).toBe('string');
      expect(res.data?.telegramAccount?.telegramId).toBe('9155408641');
      expect(() => JSON.stringify(res)).not.toThrow();
    });

    it('unlinkManagerTelegramAction removes manager telegram link', async () => {
      const { unlinkManagerTelegramAction, getManagerTelegramInfoAction } = await import('@/app/actions/admin');
      mockUser = { id: 'manager-user-uuid-1', role: UserRole.SUPER_ADMIN };

      const unlinkRes = await unlinkManagerTelegramAction();
      expect(unlinkRes.success).toBe(true);

      const infoRes = await getManagerTelegramInfoAction();
      expect(infoRes.data?.telegramAccount).toBeNull();
    });
  });
});
