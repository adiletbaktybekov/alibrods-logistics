'use server';

import { getCurrentUser } from './auth';
import { OrdersService } from '@/modules/orders/orders.service';
import { DriversService } from '@/modules/drivers/drivers.service';
import { ClientsService } from '@/modules/clients/clients.service';
import { registerDriverSchema } from '@/modules/drivers/drivers.dto';
import { OrderStatus, UserRole, AuditAction } from '@prisma/client';
import { ForbiddenError, UnauthorizedError } from '@/lib/errors';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { prisma } from '@/database/prisma';
import { sanitizePaginationParams } from '@/lib/pagination';
import { hashPassword, verifyPassword, validatePasswordComplexity } from '@/lib/security/password';
import { RateLimiter } from '@/lib/security/rate-limit';
import { AuditService } from '@/modules/audit/audit.service';
import { signAuthToken } from '@/lib/security/jwt';

const passwordChangeRateLimiter = new RateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 5,
});

const STAFF_ROLES: UserRole[] = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT'];

export async function requireStaffUser() {
  const user = await getCurrentUser();
  if (!user) {
    throw new UnauthorizedError('Требуется авторизация сотрудника');
  }
  if (!STAFF_ROLES.includes(user.role)) {
    throw new ForbiddenError('Доступ к административной панели запрещён для данной роли');
  }
  return user;
}

export async function getAdminDashboardStatsAction() {
  await requireStaffUser();
  return OrdersService.getAdminDashboardStats();
}

export interface GetAdminOrdersParams {
  search?: string;
  status?: OrderStatus;
  warehouseId?: string;
  date?: string;
  page?: number;
  pageSize?: number;
}

export async function getAdminOrdersAction(params: GetAdminOrdersParams = {}) {
  await requireStaffUser();

  const { page, pageSize, skip } = sanitizePaginationParams(params.page, params.pageSize);

  if (!process.env.DATABASE_URL) {
    return { items: [], total: 0, page, pageSize, totalPages: 1 };
  }

  try {
    const where: Record<string, unknown> = {};

    if (params.status) {
      where.status = params.status;
    }

    if (params.warehouseId) {
      where.OR = [
        { warehouseId: params.warehouseId },
        { destinations: { some: { warehouseId: params.warehouseId } } },
      ];
    }

    if (params.date) {
      const startOfDay = new Date(params.date);
      startOfDay.setUTCHours(0, 0, 0, 0);
      const endOfDay = new Date(params.date);
      endOfDay.setUTCHours(23, 59, 59, 999);

      where.scheduledPickupAt = {
        gte: startOfDay,
        lte: endOfDay,
      };
    }

    if (params.search) {
      where.OR = [
        { orderNumber: { contains: params.search, mode: 'insensitive' } },
        { client: { companyName: { contains: params.search, mode: 'insensitive' } } },
        { client: { contactPerson: { contains: params.search, mode: 'insensitive' } } },
        { client: { contactPhone: { contains: params.search, mode: 'insensitive' } } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.order.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          warehouse: true,
          destinations: {
            include: { warehouse: true },
            orderBy: { createdAt: 'asc' },
          },
          client: true,
          assignments: {
            include: {
              driver: true,
            },
          },
        },
      }),
      prisma.order.count({ where }),
    ]);

    const totalPages = total > 0 ? Math.ceil(total / pageSize) : 1;

    return {
      items,
      total,
      page,
      pageSize,
      totalPages,
    };
  } catch {
    return { items: [], total: 0, page, pageSize, totalPages: 1 };
  }
}

export async function getAdminOrderDetailAction(orderId: string) {
  const user = await requireStaffUser();
  return OrdersService.getById(user, orderId);
}

export async function confirmOrderAction(orderId: string, comment?: string) {
  const user = await requireStaffUser();
  try {
    await OrdersService.confirmOrder(user, orderId, comment);
    revalidatePath(`/admin/orders/${orderId}`);
    revalidatePath('/admin/orders');
    revalidatePath('/admin');
    return { success: true };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Не удалось подтвердить заявку',
    };
  }
}

export async function rejectOrderAction(orderId: string, reason: string) {
  const user = await requireStaffUser();
  try {
    await OrdersService.rejectOrder(user, orderId, reason);
    revalidatePath(`/admin/orders/${orderId}`);
    revalidatePath('/admin/orders');
    revalidatePath('/admin');
    return { success: true };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Не удалось отклонить заявку',
    };
  }
}

export async function assignDriverAction(
  orderId: string,
  driverProfileId: string,
  notes?: string
) {
  const user = await requireStaffUser();
  try {
    const assignment = await OrdersService.assignDriver(user, orderId, { driverProfileId, notes });
    revalidatePath(`/admin/orders/${orderId}`);
    revalidatePath('/admin/orders');
    return {
      success: true,
      warning:
        'notificationWarning' in assignment && typeof assignment.notificationWarning === 'string'
          ? assignment.notificationWarning
          : undefined,
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Не удалось назначить водителя',
    };
  }
}

export async function saveManagerNotesAction(orderId: string, notes: string) {
  const user = await requireStaffUser();
  try {
    await OrdersService.saveManagerNotes(user, orderId, notes);
    revalidatePath(`/admin/orders/${orderId}`);
    return { success: true };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Не удалось сохранить заметку',
    };
  }
}

export async function getDriversListAction(params: {
  search?: string;
  isAvailable?: boolean;
  isActive?: boolean;
  page?: number;
  pageSize?: number;
} = {}) {
  await requireStaffUser();
  return DriversService.listWithPagination(params);
}

export async function createDriverAction(prevState: unknown, formData: FormData) {
  const user = await requireStaffUser();

  const fullName = formData.get('fullName')?.toString() || '';
  const phone = formData.get('phone')?.toString() || '';
  const vehicleModel = formData.get('vehicleModel')?.toString() || undefined;
  const vehiclePlateNumber = formData.get('vehiclePlateNumber')?.toString() || undefined;
  const notes = formData.get('notes')?.toString() || undefined;

  const parsed = registerDriverSchema.safeParse({
    fullName,
    phone,
    vehicleModel: vehicleModel || undefined,
    vehiclePlateNumber: vehiclePlateNumber || undefined,
    notes: notes || undefined,
  });

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.errors[0]?.message || 'Заполните обязательные поля водителя',
    };
  }

  try {
    await DriversService.registerDriver(parsed.data, user.id);
    revalidatePath('/admin/drivers');
    return { success: true, message: 'Водитель успешно добавлен' };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Ошибка при добавлении водителя',
    };
  }
}

export async function getClientsListAction(params: {
  search?: string;
  page?: number;
  pageSize?: number;
} = {}) {
  await requireStaffUser();
  return ClientsService.listWithPagination(params);
}

export async function getClientDetailAction(clientId: string) {
  await requireStaffUser();
  return ClientsService.getById(clientId);
}

export async function generateDriverLinkCodeAction(driverProfileId: string) {
  const user = await requireStaffUser();
  try {
    const { DriverPairingService } = await import('@/modules/telegram/pairing.service');
    const result = await DriverPairingService.generatePairingCode(driverProfileId, user.id);
    return {
      success: true,
      code: result.code,
      expiresAt: result.expiresAt,
      deepLink: result.deepLink,
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Не удалось сформировать код привязки',
    };
  }
}

export async function syncGoogleSheetsAction() {
  const user = await requireStaffUser();
  const { GoogleSheetsSyncService } = await import(
    '@/modules/integrations/google-sheets-sync.service'
  );
  const result = await GoogleSheetsSyncService.runFullSync(user);
  revalidatePath('/admin/integrations/google-sheets');
  revalidatePath('/admin/orders');
  return result;
}

export async function getGoogleSheetsStatusAction() {
  await requireStaffUser();
  const { GoogleSheetsSyncService } = await import(
    '@/modules/integrations/google-sheets-sync.service'
  );
  return GoogleSheetsSyncService.getStatus();
}

export async function getAdminWarehousesAction() {
  await requireStaffUser();
  if (!process.env.DATABASE_URL) {
    return [];
  }
  return prisma.warehouse.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
  });
}

export async function getStaffProfileAction() {
  const staff = await requireStaffUser();
  if (!process.env.DATABASE_URL) {
    return null;
  }
  return prisma.user.findUnique({
    where: { id: staff.id },
    select: {
      id: true,
      email: true,
      phone: true,
      role: true,
      isActive: true,
      isVerified: true,
      createdAt: true,
      lastLoginAt: true,
      managerProfile: {
        select: {
          fullName: true,
          department: true,
          workPhone: true,
          notes: true,
        },
      },
    },
  });
}

export async function changePasswordAction(prevState: unknown, formData: FormData) {
  const user = await requireStaffUser();

  const currentPassword = formData.get('currentPassword')?.toString() || '';
  const newPassword = formData.get('newPassword')?.toString() || '';
  const confirmPassword = formData.get('confirmPassword')?.toString() || '';

  // 1. Rate limiting check (max 5 attempts per 15 min per staff user)
  const rateLimit = passwordChangeRateLimiter.check(user.id);
  if (!rateLimit.allowed) {
    const minutesLeft = Math.max(1, Math.ceil((rateLimit.resetAt - Date.now()) / 60000));
    return {
      success: false,
      error: `Слишком много попыток смены пароля. Пожалуйста, подождите ${minutesLeft} мин.`,
    };
  }

  // 2. Presence checks
  if (!currentPassword || !newPassword || !confirmPassword) {
    return {
      success: false,
      error: 'Заполните все обязательные поля формы смены пароля',
    };
  }

  // 3. Confirmation check
  if (newPassword !== confirmPassword) {
    return {
      success: false,
      error: 'Новый пароль и подтверждение не совпадают',
    };
  }

  // 4. Distinction from current password
  if (newPassword === currentPassword) {
    return {
      success: false,
      error: 'Новый пароль не должен совпадать с текущим паролем',
    };
  }

  // 5. Complexity criteria validation (same 5 criteria as SUPER_ADMIN)
  const complexity = validatePasswordComplexity(newPassword);
  if (!complexity.isValid) {
    return {
      success: false,
      error: complexity.error || 'Пароль не отвечает требованиям безопасности',
    };
  }

  // 6. DB check
  if (!process.env.DATABASE_URL) {
    return {
      success: false,
      error: 'База данных недоступна',
    };
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      id: true,
      email: true,
      phone: true,
      role: true,
      passwordHash: true,
      isActive: true,
    },
  });

  if (!dbUser || !dbUser.isActive) {
    return {
      success: false,
      error: 'Учётная запись не найдена или деактивирована',
    };
  }

  if (!dbUser.passwordHash) {
    return {
      success: false,
      error: 'У данной учётной записи не установлен пароль',
    };
  }

  // 7. Verify current password
  const isCurrentValid = await verifyPassword(currentPassword, dbUser.passwordHash);
  if (!isCurrentValid) {
    return {
      success: false,
      error: 'Неверный текущий пароль',
    };
  }

  // 8. Hash new password with Argon2id
  const newHash = await hashPassword(newPassword);

  // 9. Update DB: atomically update hash and increment tokenVersion
  const updatedUser = await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: newHash,
      tokenVersion: { increment: 1 },
    },
    select: {
      id: true,
      role: true,
      email: true,
      phone: true,
      tokenVersion: true,
    },
  });

  // 10. Audit log entry
  await AuditService.log({
    userId: user.id,
    action: AuditAction.UPDATE,
    resource: 'User',
    resourceId: user.id,
    metadata: {
      event: 'PASSWORD_CHANGE',
      role: user.role,
      tokenVersion: updatedUser.tokenVersion,
    },
  });

  // 11. Refresh session cookie seamlessly with the updated tokenVersion
  try {
    const token = await signAuthToken({
      userId: updatedUser.id,
      role: updatedUser.role,
      email: updatedUser.email,
      phone: updatedUser.phone,
      tokenVersion: updatedUser.tokenVersion,
    });
    const cookieStore = await cookies();
    cookieStore.set('alibros_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60,
    });
  } catch {
    // Cookie refresh failure is non-blocking
  }

  revalidatePath('/admin/profile');

  return {
    success: true,
    message: 'Пароль успешно обновлён',
  };
}

export interface ManagerTelegramConnectionInfo {
  telegramAccount: {
    id: string;
    telegramId: string;
    username: string | null;
    firstName: string | null;
    lastName: string | null;
    authDate: string | null;
    createdAt: string;
  } | null;
  activePairingCode: {
    code: string;
    expiresAt: string;
    deepLink: string;
  } | null;
  botUsername: string;
}

export async function getManagerTelegramInfoAction(): Promise<{
  success: boolean;
  data?: ManagerTelegramConnectionInfo;
  error?: string;
}> {
  let staff;
  try {
    staff = await requireStaffUser();
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Требуется авторизация сотрудника',
    };
  }

  const botUsername = process.env.TELEGRAM_MANAGER_BOT_USERNAME || 'AliBrosManagerBot';

  try {
    const [telegramAccount, activeCode] = await Promise.all([
      prisma.telegramAccount.findUnique({
        where: { userId: staff.id },
      }),
      prisma.telegramPairingCode.findFirst({
        where: {
          userId: staff.id,
          usedAt: null,
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const serializedAccount = telegramAccount
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

    const serializedCode = activeCode
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

export async function generateManagerPairingCodeAction(): Promise<{
  success: boolean;
  code?: string;
  expiresAt?: string;
  deepLink?: string;
  error?: string;
}> {
  let staff;
  try {
    staff = await requireStaffUser();
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Требуется авторизация сотрудника',
    };
  }

  try {
    let manager = await prisma.managerProfile.findUnique({
      where: { userId: staff.id },
    });

    if (!manager) {
      manager = await prisma.managerProfile.create({
        data: {
          userId: staff.id,
          fullName: staff.email || staff.phone || 'Сотрудник AliBros',
          department: staff.role,
        },
      });
    }

    const { ManagerPairingService } = await import('@/modules/telegram/pairing.service');
    const result = await ManagerPairingService.generatePairingCode(manager.id, staff.id);
    revalidatePath('/admin/profile');

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

export async function unlinkManagerTelegramAction(): Promise<{
  success: boolean;
  error?: string;
}> {
  let staff;
  try {
    staff = await requireStaffUser();
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Требуется авторизация сотрудника',
    };
  }

  try {
    const manager = await prisma.managerProfile.findUnique({
      where: { userId: staff.id },
    });

    const { ManagerPairingService } = await import('@/modules/telegram/pairing.service');
    if (manager) {
      await ManagerPairingService.unlinkManager(manager.id, staff.id);
    } else {
      await prisma.telegramAccount.deleteMany({
        where: { userId: staff.id },
      });
    }

    revalidatePath('/admin/profile');
    return { success: true };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Не удалось отвязать Telegram',
    };
  }
}

export async function updateDriverWorkflowStatusAction(
  orderId: string,
  targetStatus: OrderStatus,
  comment?: string
) {
  const user = await requireStaffUser();
  try {
    await OrdersService.updateDriverWorkflowStatusByManager(user, orderId, targetStatus, comment);
    revalidatePath(`/admin/orders/${orderId}`);
    revalidatePath('/admin/orders');
    revalidatePath('/admin');
    return { success: true };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Не удалось обновить статус водительского этапа',
    };
  }
}

export async function getWarehouseStatsAction(params: {
  period?: string;
  fromDate?: string;
  toDate?: string;
  warehouseId?: string;
} = {}) {
  await requireStaffUser();
  try {
    const stats = await OrdersService.getWarehouseStats(params);
    return { success: true, data: stats };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Не удалось загрузить статистику складов',
    };
  }
}
