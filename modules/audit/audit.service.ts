import { prisma } from '@/database/prisma';
import { logger } from '@/lib/logger';
import { CreateAuditLogDto, createAuditLogSchema } from './audit.dto';

export class AuditService {
  public static async log(dto: CreateAuditLogDto): Promise<void> {
    const validated = createAuditLogSchema.parse(dto);
    try {
      await prisma.auditLog.create({
        data: {
          userId: validated.userId,
          action: validated.action,
          resource: validated.resource,
          resourceId: validated.resourceId,
          ipAddress: validated.ipAddress,
          userAgent: validated.userAgent,
          oldValue: validated.oldValue ? (validated.oldValue as object) : undefined,
          newValue: validated.newValue ? (validated.newValue as object) : undefined,
          metadata: validated.metadata ? (validated.metadata as object) : undefined,
        },
      });
    } catch (err) {
      // Audit failure must be logged to pino but not crash the primary flow
      logger.error({ err, auditDto: validated }, 'Failed to persist audit log entry to database');
    }
  }
}
