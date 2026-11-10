import { z } from 'zod';
import { UserRole } from '@prisma/client';

export const loginSchema = z.object({
  login: z.string().min(3, 'Email or phone required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const registerClientSchema = z.object({
  email: z.string().email('Некорректный email адрес').optional().or(z.literal('')),
  phone: z.string().regex(/^\+?[1-9]\d{7,14}$/, 'Неверный формат международного номера телефона'),
  password: z.string().min(8, 'Пароль должен содержать как минимум 8 символов'),
  companyName: z.string().min(2, 'Название компании обязательно'),
  contactPerson: z.string().min(2, 'Контактное лицо обязательно'),
  inn: z.string().regex(/^\d{10,14}$/, 'ИНН должен содержать от 10 до 14 цифр').optional().or(z.literal('')),
});

export const telegramAuthSchema = z.object({
  initData: z.string().min(10, 'Valid Telegram initData is required'),
  expectedRole: z.nativeEnum(UserRole).optional(),
});

export type LoginDto = z.infer<typeof loginSchema>;
export type RegisterClientDto = z.infer<typeof registerClientSchema>;
export type TelegramAuthDto = z.infer<typeof telegramAuthSchema>;
