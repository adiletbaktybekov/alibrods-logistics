import { z } from 'zod';
import { UserRole } from '@prisma/client';

export const loginSchema = z.object({
  login: z.string().min(3, 'Email or phone required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const registerClientSchema = z.object({
  email: z.string().email('Invalid email address').optional(),
  phone: z.string().regex(/^\+?[1-9]\d{7,14}$/, 'Invalid international phone number format'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  companyName: z.string().min(2, 'Company name is required'),
  contactPerson: z.string().min(2, 'Contact person name is required'),
  inn: z.string().regex(/^\d{10,14}$/, 'INN must be 10, 12, or 14 digits').optional(),
});

export const telegramAuthSchema = z.object({
  initData: z.string().min(10, 'Valid Telegram initData is required'),
  expectedRole: z.nativeEnum(UserRole).optional(),
});

export type LoginDto = z.infer<typeof loginSchema>;
export type RegisterClientDto = z.infer<typeof registerClientSchema>;
export type TelegramAuthDto = z.infer<typeof telegramAuthSchema>;
