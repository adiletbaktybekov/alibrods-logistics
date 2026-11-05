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
