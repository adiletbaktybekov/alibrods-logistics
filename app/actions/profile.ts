'use server';

import { getCurrentUser } from './auth';
import { prisma } from '@/database/prisma';
import { updateClientProfileSchema } from '@/modules/clients/clients.dto';
import { revalidatePath } from 'next/cache';

export async function updateClientProfileAction(prevState: unknown, formData: FormData) {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: 'Не авторизован' };

  const companyName = formData.get('companyName')?.toString();
  const contactPerson = formData.get('contactPerson')?.toString();
  const contactPhone = formData.get('contactPhone')?.toString();
  const contactEmail = formData.get('contactEmail')?.toString() || undefined;
  const inn = formData.get('inn')?.toString() || undefined;
  const defaultWarehouseId = formData.get('defaultWarehouseId')?.toString() || undefined;

  const parsed = updateClientProfileSchema.safeParse({
    companyName,
    contactPerson,
    contactPhone,
    contactEmail: contactEmail || undefined,
    inn: inn || undefined,
    defaultWarehouseId: defaultWarehouseId || undefined,
  });

  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0]?.message || 'Ошибка валидации' };
  }

  try {
    await prisma.clientProfile.update({
      where: { userId: user.id },
      data: parsed.data,
    });

    revalidatePath('/profile');
    return { success: true, message: 'Профиль успешно обновлён' };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Ошибка обновления профиля',
    };
  }
}

export interface SerializedTelegramAccount {
  id: string;
  telegramId: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  authDate: string | null;
  createdAt: string;
}

export interface ActiveTelegramPairingCode {
  code: string;
  expiresAt: string;
  deepLink: string;
}

export interface ClientTelegramConnectionInfo {
  telegramAccount: SerializedTelegramAccount | null;
  activePairingCode: ActiveTelegramPairingCode | null;
  botUsername: string;
}

export async function getClientTelegramInfoAction(): Promise<{
  success: boolean;
  data?: ClientTelegramConnectionInfo;
  error?: string;
}> {
  const user = await getCurrentUser();
  if (!user || user.role !== 'CLIENT') {
    return { success: false, error: 'Доступ разрешён только авторизованным клиентам' };
  }

  const botUsername = process.env.TELEGRAM_CLIENT_BOT_USERNAME || 'AliBrosClientBot';

  try {
    const [telegramAccount, activeCode] = await Promise.all([
      prisma.telegramAccount.findUnique({
        where: { userId: user.id },
      }),
      prisma.telegramPairingCode.findFirst({
        where: {
          userId: user.id,
          usedAt: null,
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const serializedAccount: SerializedTelegramAccount | null = telegramAccount
      ? {
          id: telegramAccount.id,
          telegramId: telegramAccount.telegramId.toString(),
          username: telegramAccount.username,
          firstName: telegramAccount.firstName,
          lastName: telegramAccount.lastName,
          authDate: telegramAccount.authDate ? new Date(telegramAccount.authDate).toISOString() : null,
          createdAt: telegramAccount.createdAt ? new Date(telegramAccount.createdAt).toISOString() : new Date().toISOString(),
        }
      : null;

    const serializedCode: ActiveTelegramPairingCode | null = activeCode
      ? {
          code: activeCode.code,
          expiresAt: activeCode.expiresAt.toISOString(),
          deepLink: `https://t.me/${botUsername}?start=${activeCode.code}`,
        }
      : null;

    return {
      success: true,
      data: {
        telegramAccount: serializedAccount,
        activePairingCode: serializedCode,
        botUsername,
      },
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Ошибка загрузки статуса Telegram',
    };
  }
}

export async function generateClientPairingCodeAction(): Promise<{
  success: boolean;
  code?: string;
  expiresAt?: string;
  deepLink?: string;
  error?: string;
}> {
  const user = await getCurrentUser();
  if (!user || user.role !== 'CLIENT') {
    return { success: false, error: 'Доступ разрешён только авторизованным клиентам' };
  }

  try {
    const client = await prisma.clientProfile.findUnique({
      where: { userId: user.id },
    });

    if (!client) {
      return { success: false, error: 'Профиль клиента не найден' };
    }

    const { ClientPairingService } = await import('@/modules/telegram/pairing.service');
    const result = await ClientPairingService.generatePairingCode(client.id, user.id);
    revalidatePath('/profile');

    return {
      success: true,
      code: result.code,
      expiresAt: result.expiresAt.toISOString(),
      deepLink: result.deepLink,
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Не удалось сформировать код привязки',
    };
  }
}

export async function unlinkClientTelegramAction(): Promise<{
  success: boolean;
  error?: string;
}> {
  const user = await getCurrentUser();
  if (!user || user.role !== 'CLIENT') {
    return { success: false, error: 'Доступ разрешён только авторизованным клиентам' };
  }

  try {
    const client = await prisma.clientProfile.findUnique({
      where: { userId: user.id },
    });

    if (!client) {
      return { success: false, error: 'Профиль клиента не найден' };
    }

    const { ClientPairingService } = await import('@/modules/telegram/pairing.service');
    await ClientPairingService.unlinkClient(client.id, user.id);
    revalidatePath('/profile');

    return { success: true };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Не удалось отвязать Telegram',
    };
  }
}
