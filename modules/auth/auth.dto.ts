import { z } from 'zod';
import { UserRole } from '@prisma/client';

import { phoneSchema } from '@/lib/phone';

export const loginSchema = z.object({
  login: z.string().min(3, 'Укажите номер Telegram'),
  password: z.string().min(8, 'Пароль должен содержать как минимум 8 символов'),
});

export const registerClientSchema = z.object({
  email: z.string().email('Некорректный email адрес').optional().or(z.literal('')).nullable(),
  phone: phoneSchema,
  password: z.string().min(8, 'Пароль должен содержать как минимум 8 символов'),
  companyName: z.string().min(2, 'Название компании обязательно'),
  contactPerson: z.string().min(2, 'Контактное лицо обязательно'),
  warehouseAddress: z.string().min(5, 'Укажите полный адрес вашего склада'),
  inn: z.string().regex(/^\d{10,14}$/, 'ИНН должен содержать от 10 до 14 цифр').optional().or(z.literal('')).nullable(),
});

export const telegramAuthSchema = z.object({
  initData: z.string().min(10, 'Valid Telegram initData is required'),
  expectedRole: z.nativeEnum(UserRole).optional(),
});

export type LoginDto = z.infer<typeof loginSchema>;
export type RegisterClientDto = z.infer<typeof registerClientSchema>;
export type TelegramAuthDto = z.infer<typeof telegramAuthSchema>;
