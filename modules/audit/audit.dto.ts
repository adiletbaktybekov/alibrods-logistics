import { z } from 'zod';
import { AuditAction } from '@prisma/client';

export const createAuditLogSchema = z.object({
  userId: z.string().uuid().optional(),
  action: z.nativeEnum(AuditAction),
  resource: z.string().min(1).max(100),
  resourceId: z.string().optional(),
  ipAddress: z.string().optional(),
  userAgent: z.string().optional(),
  oldValue: z.record(z.unknown()).optional(),
  newValue: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type CreateAuditLogDto = z.infer<typeof createAuditLogSchema>;
