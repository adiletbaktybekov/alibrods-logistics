'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { AuthService } from '@/modules/auth/auth.service';
import { loginSchema, registerClientSchema } from '@/modules/auth/auth.dto';
import { verifyAuthToken } from '@/lib/security/jwt';
import { AuthenticatedUser } from '@/types/rbac';
import { prisma } from '@/database/prisma';

const COOKIE_NAME = 'alibros_token';

export async function getCurrentUser(): Promise<AuthenticatedUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const payload = await verifyAuthToken(token);
  if (!payload || !payload.sub || !payload.role || typeof payload.tokenVersion !== 'number') {
    return null;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        role: true,
        email: true,
        phone: true,
        isActive: true,
        tokenVersion: true,
      },
    });

    if (!user || !user.isActive || user.tokenVersion !== payload.tokenVersion) {
      return null;
    }

    return {
      id: user.id,
      role: user.role,
      email: user.email,
      phone: user.phone,
    };
  } catch {
    return null;
  }
}

export async function getCurrentClientProfile() {
  const user = await getCurrentUser();
  if (!user) return null;

  try {
    const client = await prisma.clientProfile.findUnique({
      where: { userId: user.id },
      include: {
        defaultWarehouse: true,
      },
    });
    return { user, client };
  } catch {
    // If DB is offline, return basic user session
    return {
      user,
      client: {
        companyName: 'AliBros Клиент',
        contactPerson: user.phone || user.email || 'Клиент',
        contactPhone: user.phone || '',
        contactEmail: user.email || '',
        inn: null,
      },
    };
  }
}

export async function loginAction(prevState: unknown, formData: FormData) {
  const rawLogin = formData.get('login')?.toString() || '';
  const rawPassword = formData.get('password')?.toString() || '';

  const parsed = loginSchema.safeParse({ login: rawLogin, password: rawPassword });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.errors[0]?.message || 'Заполните обязательные поля',
    };
  }

  let redirectPath = '/dashboard';
  try {
    const result = await AuthService.login(parsed.data);

    const cookieStore = await cookies();
    cookieStore.set(COOKIE_NAME, result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });

    if (['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT'].includes(result.user.role)) {
      redirectPath = '/admin';
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Ошибка авторизации';
    return { success: false, error: message };
  }

  redirect(redirectPath);
}

export async function registerAction(prevState: unknown, formData: FormData) {
  const companyName = formData.get('companyName')?.toString() || '';
  const contactPerson = formData.get('contactPerson')?.toString() || '';
  const phone = formData.get('phone')?.toString() || '';
  const email = formData.get('email')?.toString() || undefined;
  const inn = formData.get('inn')?.toString() || undefined;
  const password = formData.get('password')?.toString() || '';
  const confirmPassword = formData.get('confirmPassword')?.toString() || '';

  if (password.length < 8) {
    return { success: false, error: 'Пароль должен содержать как минимум 8 символов' };
  }

  if (password !== confirmPassword) {
    return { success: false, error: 'Пароли не совпадают' };
  }

  const parsed = registerClientSchema.safeParse({
    companyName,
    contactPerson,
    phone,
    email: email || undefined,
    inn: inn || undefined,
    password,
  });

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.errors[0]?.message || 'Ошибка валидации формы',
    };
  }

  try {
    const result = await AuthService.registerClient(parsed.data);

    const cookieStore = await cookies();
    cookieStore.set(COOKIE_NAME, result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Ошибка регистрации';
    return { success: false, error: message };
  }

  redirect('/dashboard');
}

export async function logoutAction() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
  redirect('/login');
}
