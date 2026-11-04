import { z } from 'zod';
import { UserRole } from '@prisma/client';

export const updateUserRoleSchema = z.object({
  role: z.nativeEnum(UserRole),
});

export const setUserActiveStatusSchema = z.object({
  isActive: z.boolean(),
});

export type UpdateUserRoleDto = z.infer<typeof updateUserRoleSchema>;
export type SetUserActiveStatusDto = z.infer<typeof setUserActiveStatusSchema>;
