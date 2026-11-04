import { UserRole } from '@prisma/client';
import { Permission } from '@/config/permissions';

export interface AuthenticatedUser {
  id: string;
  role: UserRole;
  email?: string | null;
  phone?: string | null;
}

export interface SecurityContext {
  user: AuthenticatedUser | null;
  ipAddress?: string;
  userAgent?: string;
  requestId: string;
}

export type { Permission };
