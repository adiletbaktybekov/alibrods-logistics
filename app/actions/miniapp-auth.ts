'use server';

import { cookies } from 'next/headers';
import { validateTelegramInitData } from '@/lib/security/telegram';
import { prisma } from '@/database/prisma';
import { signAuthToken } from '@/lib/security/jwt';
import { AuthService } from '@/modules/auth/auth.service';
import { TelegramService } from '@/modules/telegram/telegram.service';
import { UserRole } from '@prisma/client';
import { getCurrentUser } from './auth';

const COOKIE_NAME = 'alibros_token';

export async function verifyMiniAppDataAction(initData: string) {
  const botToken =
    process.env.TELEGRAM_CLIENT_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || '';
  const validation = validateTelegramInitData(initData, botToken);

  async function getSafeCurrentUser() {
    try {
      return await getCurrentUser();
    } catch {
      return null;
    }
  }

  if (!validation.isValid || !validation.user) {
    // If not in Telegram WebApp or invalid signature, check if already authenticated via cookie
    const currentUser = await getSafeCurrentUser();
    if (currentUser && currentUser.role === UserRole.CLIENT) {
      return {
        success: true,
        isLinked: true,
        user: currentUser,
      };
    }

    return {
      success: false,
      error: validation.error || 'Недействительная подпись Telegram WebApp (initData).',
    };
  }

  const tgUser = validation.user;
  const telegramIdBigInt = BigInt(tgUser.id);

  if (!process.env.DATABASE_URL) {
    const currentUser = await getSafeCurrentUser();
    if (currentUser && currentUser.role === UserRole.CLIENT) {
      return { success: true, isLinked: true, user: currentUser };
    }
    return {
      success: true,
      isLinked: false,
      telegramId: tgUser.id,
      telegramUser: tgUser,
    };
  }

  try {
    const account = await prisma.telegramAccount.findUnique({
      where: { telegramId: telegramIdBigInt },
      include: {
        user: {
          include: {
            clientProfile: true,
          },
        },
      },
    });

    if (account && account.user && account.user.role === UserRole.CLIENT && account.user.isActive) {
      // Issue session cookie
      const token = await signAuthToken({
        userId: account.user.id,
        role: account.user.role,
        email: account.user.email,
        phone: account.user.phone,
      });

      const cookieStore = await cookies();
      cookieStore.set(COOKIE_NAME, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 7 * 24 * 60 * 60,
      });

      return {
        success: true,
        isLinked: true,
        user: {
          id: account.user.id,
          role: account.user.role,
          email: account.user.email,
          phone: account.user.phone,
        },
        client: account.user.clientProfile,
      };
    }

    // Account exists but is not linked yet
    return {
      success: true,
      isLinked: false,
      telegramId: tgUser.id,
      telegramUser: tgUser,
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Ошибка проверки базы данных',
    };
  }
}

export async function linkMiniAppAccountAction(
  initData: string,
  loginInput: string,
  passwordInput: string
) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN || '';
  const validation = validateTelegramInitData(initData, botToken);

  if (!validation.isValid || !validation.user) {
    return {
      success: false,
      error: 'Недействительная подпись Telegram WebApp. Перезапустите Mini App.',
    };
  }

  const tgUser = validation.user;
  const telegramIdBigInt = BigInt(tgUser.id);

  try {
    const loginResult = await AuthService.login({
      login: loginInput.trim(),
      password: passwordInput,
    });

    if (loginResult.user.role !== UserRole.CLIENT) {
      return {
        success: false,
        error: 'Вход разрешён только для учётных записей клиентов (селлеров).',
      };
    }

    // Link Telegram Account to this Client User
    if (process.env.DATABASE_URL) {
      await TelegramService.linkAccount({
        userId: loginResult.user.id,
        telegramId: telegramIdBigInt,
        username: tgUser.username,
        firstName: tgUser.first_name,
        lastName: tgUser.last_name,
        languageCode: tgUser.language_code,
      });
    }

    // Set auth cookie
    const cookieStore = await cookies();
    cookieStore.set(COOKIE_NAME, loginResult.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60,
    });

    return { success: true };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Неверный логин или пароль клиента',
    };
  }
}
