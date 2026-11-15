import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TelegramService } from '@/modules/telegram/telegram.service';
import { prisma } from '@/database/prisma';

vi.mock('@/database/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
    telegramAccount: {
      findUnique: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    $transaction: vi.fn(async (cb) => {
      return cb(prisma);
    }),
  },
}));

describe('TelegramService.linkAccountSafe — Idempotent and Collision-Proof Telegram Linking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns friendly error when user does not exist in DB', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null);

    const res = await TelegramService.linkAccountSafe({
      userId: 'non-existent-user-id',
      telegramId: BigInt(123456789),
    });

    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error).toBe('Пользователь не найден');
    }
  });

  it('idempotently succeeds when telegramId is already linked to the same userId', async () => {
    const userId = 'user-1';
    const tgId = BigInt(123456789);

    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({ id: userId } as any);
    vi.mocked(prisma.telegramAccount.findUnique).mockResolvedValueOnce({
      id: 'tg-acc-1',
      userId,
      telegramId: tgId,
    } as any);

    vi.mocked(prisma.telegramAccount.update).mockResolvedValueOnce({
      id: 'tg-acc-1',
      userId,
      telegramId: tgId,
      username: 'seller_tg',
    } as any);

    const res = await TelegramService.linkAccountSafe({
      userId,
      telegramId: tgId,
      username: 'seller_tg',
    });

    expect(res.success).toBe(true);
    expect(prisma.telegramAccount.update).toHaveBeenCalled();
  });

  it('returns friendly error when telegramId is linked to a different userId (no SQL/Prisma leak)', async () => {
    const currentUserId = 'user-2';
    const otherUserId = 'user-1';
    const tgId = BigInt(123456789);

    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({ id: currentUserId } as any);
    vi.mocked(prisma.telegramAccount.findUnique).mockResolvedValueOnce({
      id: 'tg-acc-1',
      userId: otherUserId,
      telegramId: tgId,
      user: { id: otherUserId },
    } as any);

    const res = await TelegramService.linkAccountSafe({
      userId: currentUserId,
      telegramId: tgId,
    });

    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error).toContain('уже привязан к другой учётной записи');
      expect(res.error).not.toContain('prisma');
      expect(res.error).not.toContain('P2002');
    }
  });

  it('returns friendly error when userId already has another telegramId linked', async () => {
    const userId = 'user-1';
    const newTgId = BigInt(999999999);
    const existingTgId = BigInt(111111111);

    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({ id: userId } as any);
    // 1st findUnique: telegramId not found
    vi.mocked(prisma.telegramAccount.findUnique).mockResolvedValueOnce(null);
    // 2nd findUnique: userId has existingTgId
    vi.mocked(prisma.telegramAccount.findUnique).mockResolvedValueOnce({
      id: 'tg-acc-old',
      userId,
      telegramId: existingTgId,
    } as any);

    const res = await TelegramService.linkAccountSafe({
      userId,
      telegramId: newTgId,
    });

    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error).toContain('привязан другой Telegram-аккаунт');
    }
  });

  it('successfully creates new link when no collisions exist', async () => {
    const userId = 'user-new';
    const tgId = BigInt(555555555);

    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({ id: userId } as any);
    vi.mocked(prisma.telegramAccount.findUnique).mockResolvedValueOnce(null); // by tgId
    vi.mocked(prisma.telegramAccount.findUnique).mockResolvedValueOnce(null); // by userId

    vi.mocked(prisma.telegramAccount.create).mockResolvedValueOnce({
      id: 'new-account-id',
      userId,
      telegramId: tgId,
    } as any);

    const res = await TelegramService.linkAccountSafe({
      userId,
      telegramId: tgId,
      username: 'brand_new_user',
    });

    expect(res.success).toBe(true);
    expect(prisma.telegramAccount.create).toHaveBeenCalled();
  });
});
