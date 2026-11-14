'use server';

import { redirect } from 'next/navigation';
import { getCurrentUser } from './auth';
import { OrdersService } from '@/modules/orders/orders.service';
import { createClientOrderSchema } from '@/modules/orders/orders.dto';
import { OrderStatus } from '@prisma/client';

export async function createOrderAction(prevState: unknown, formData: FormData) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'CLIENT') {
    return { success: false, error: 'Необходимо войти в систему как клиент' };
  }

  const destinationsRaw = formData.get('destinations')?.toString();
  let destinations: unknown = undefined;
  if (destinationsRaw) {
    try {
      destinations = JSON.parse(destinationsRaw);
    } catch {
      destinations = undefined;
    }
  }

  const warehouseId = formData.get('warehouseId')?.toString() || undefined;
  const deliveryDate = formData.get('deliveryDate')?.toString() || undefined;
  const totalPalletsCount = formData.get('totalPalletsCount')?.toString() || '0';
  const totalBoxesCount = formData.get('totalBoxesCount')?.toString() || '0';
  const clientComment = formData.get('clientComment')?.toString() || undefined;
  const idempotencyKey = formData.get('idempotencyKey')?.toString() || undefined;

  const parsed = createClientOrderSchema.safeParse({
    destinations: Array.isArray(destinations) ? destinations : undefined,
    warehouseId: warehouseId || undefined,
    deliveryDate: deliveryDate || undefined,
    totalPalletsCount,
    totalBoxesCount,
    clientComment: clientComment || undefined,
    idempotencyKey,
  });

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.errors[0]?.message || 'Проверьте корректность введённых данных',
    };
  }

  let createdId: string;
  try {
    const order = await OrdersService.createFromClient(user, parsed.data);
    createdId = order.id;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Ошибка при оформлении заявки';
    return { success: false, error: message };
  }

  redirect(`/orders/${createdId}`);
}

export async function createMiniAppOrderAction(prevState: unknown, formData: FormData) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'CLIENT') {
    return { success: false, error: 'Необходимо войти в систему как клиент' };
  }

  const destinationsRaw = formData.get('destinations')?.toString();
  let destinations: unknown = undefined;
  if (destinationsRaw) {
    try {
      destinations = JSON.parse(destinationsRaw);
    } catch {
      destinations = undefined;
    }
  }

  const warehouseId = formData.get('warehouseId')?.toString() || undefined;
  const deliveryDate = formData.get('deliveryDate')?.toString() || undefined;
  const totalPalletsCount = formData.get('totalPalletsCount')?.toString() || '0';
  const totalBoxesCount = formData.get('totalBoxesCount')?.toString() || '0';
  const clientComment = formData.get('clientComment')?.toString() || undefined;
  const idempotencyKey = formData.get('idempotencyKey')?.toString() || undefined;

  const parsed = createClientOrderSchema.safeParse({
    destinations: Array.isArray(destinations) ? destinations : undefined,
    warehouseId: warehouseId || undefined,
    deliveryDate: deliveryDate || undefined,
    totalPalletsCount,
    totalBoxesCount,
    clientComment: clientComment || undefined,
    idempotencyKey,
  });

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.errors[0]?.message || 'Проверьте корректность введённых данных',
    };
  }

  let createdId: string;
  try {
    const order = await OrdersService.createFromClient(user, parsed.data);
    createdId = order.id;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Ошибка при оформлении заявки';
    return { success: false, error: message };
  }

  redirect(`/miniapp/orders/${createdId}`);
}

export async function getClientOrders(status?: OrderStatus, search?: string) {
  const user = await getCurrentUser();
  if (!user) return { items: [], total: 0, error: 'Unauthorized' };

  try {
    return await OrdersService.list(user, {
      status,
      search,
      limit: 50,
    });
  } catch (err) {
    return {
      items: [],
      total: 0,
      error: err instanceof Error ? err.message : 'Не удалось загрузить заявки',
    };
  }
}

export async function getOrderDetail(orderId: string) {
  const user = await getCurrentUser();
  if (!user) return null;

  try {
    return await OrdersService.getById(user, orderId);
  } catch {
    return null;
  }
}

export async function getClientDashboardStats() {
  const user = await getCurrentUser();
  if (!user) {
    return {
      total: 0,
      inProcessing: 0,
      completed: 0,
      recentOrders: [],
    };
  }

  try {
    return await OrdersService.getClientStats(user);
  } catch {
    return {
      total: 0,
      inProcessing: 0,
      completed: 0,
      recentOrders: [],
    };
  }
}
