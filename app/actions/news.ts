'use server';

import { getCurrentUser } from './auth';
import { requireStaffUser } from './admin';
import { NewsService } from '@/modules/news/news.service';
import { NewsStatus } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/database/prisma';

export async function createNewsAction(dto: {
  title: string;
  content: string;
  imageUrl?: string;
}) {
  const staff = await requireStaffUser();
  if (!['SUPER_ADMIN', 'ADMIN', 'MANAGER'].includes(staff.role)) {
    return { success: false, error: 'Недостаточно прав для создания новости' };
  }

  if (!dto.title || !dto.title.trim()) {
    return { success: false, error: 'Заголовок новости обязателен' };
  }
  if (!dto.content || !dto.content.trim()) {
    return { success: false, error: 'Текст новости обязателен' };
  }

  try {
    const article = await NewsService.create({
      title: dto.title,
      content: dto.content,
      imageUrl: dto.imageUrl,
      authorId: staff.id,
    });

    revalidatePath('/admin/news');
    return { success: true, data: article };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Не удалось создать новость',
    };
  }
}

export async function updateNewsAction(
  id: string,
  dto: {
    title?: string;
    content?: string;
    imageUrl?: string;
    status?: NewsStatus;
  }
) {
  const staff = await requireStaffUser();
  if (!['SUPER_ADMIN', 'ADMIN', 'MANAGER'].includes(staff.role)) {
    return { success: false, error: 'Недостаточно прав' };
  }

  try {
    const updated = await NewsService.update(id, dto);
    revalidatePath('/admin/news');
    revalidatePath(`/miniapp/news/${id}`);
    revalidatePath('/miniapp/news');
    return { success: true, data: updated };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Не удалось обновить новость',
    };
  }
}

export async function publishNewsAction(id: string) {
  const staff = await requireStaffUser();
  if (!['SUPER_ADMIN', 'ADMIN'].includes(staff.role)) {
    return {
      success: false,
      sentCount: 0,
      failedCount: 0,
      error: 'Публикация новостей разрешена только администраторам',
    };
  }

  try {
    const res = await NewsService.publish(id);
    revalidatePath('/admin/news');
    revalidatePath('/miniapp/news');
    revalidatePath(`/miniapp/news/${id}`);
    return res;
  } catch (err: unknown) {
    return {
      success: false,
      sentCount: 0,
      failedCount: 0,
      error: err instanceof Error ? err.message : 'Ошибка при публикации новости',
    };
  }
}

export async function archiveNewsAction(id: string) {
  const staff = await requireStaffUser();
  if (!['SUPER_ADMIN', 'ADMIN', 'MANAGER'].includes(staff.role)) {
    return { success: false, error: 'Недостаточно прав' };
  }

  try {
    await NewsService.archive(id);
    revalidatePath('/admin/news');
    revalidatePath('/miniapp/news');
    return { success: true };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Не удалось архивировать новость',
    };
  }
}

export async function deleteNewsAction(id: string) {
  const staff = await requireStaffUser();
  if (!['SUPER_ADMIN', 'ADMIN'].includes(staff.role)) {
    return { success: false, error: 'Удаление новостей разрешено только администраторам' };
  }

  try {
    await NewsService.delete(id);
    revalidatePath('/admin/news');
    revalidatePath('/miniapp/news');
    return { success: true };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Не удалось удалить новость',
    };
  }
}

export async function toggleNewsNotificationsAction(enabled: boolean) {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: 'Требуется авторизация' };
  }

  try {
    await prisma.user.update({
      where: { id: user.id },
      data: { allowNewsNotifications: enabled },
    });
    revalidatePath('/profile');
    revalidatePath('/miniapp/profile');
    return { success: true };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Не удалось сохранить настройку',
    };
  }
}
