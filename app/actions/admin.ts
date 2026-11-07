'use server';

import { getCurrentUser } from './auth';
import { OrdersService } from '@/modules/orders/orders.service';
import { DriversService } from '@/modules/drivers/drivers.service';
import { ClientsService } from '@/modules/clients/clients.service';
import { registerDriverSchema } from '@/modules/drivers/drivers.dto';
import { OrderStatus, UserRole } from '@prisma/client';
import { ForbiddenError, UnauthorizedError } from '@/lib/errors';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/database/prisma';
import { sanitizePaginationParams } from '@/lib/pagination';

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
      where.warehouseId = params.warehouseId;
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
    await OrdersService.assignDriver(user, orderId, { driverProfileId, notes });
    revalidatePath(`/admin/orders/${orderId}`);
    revalidatePath('/admin/orders');
    return { success: true };
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

export async function getDriversListAction() {
  await requireStaffUser();
  return DriversService.listAll();
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

export async function getClientsListAction() {
  await requireStaffUser();
  return ClientsService.listAll();
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


