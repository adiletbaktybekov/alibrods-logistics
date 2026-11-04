import { prisma } from '@/database/prisma';
import { NotFoundError } from '@/lib/errors';
import { AuditService } from '@/modules/audit/audit.service';
import { AuditAction, UserRole } from '@prisma/client';

export class UsersService {
  public static async getById(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        clientProfile: true,
        driverProfile: true,
        managerProfile: true,
        telegramAccount: true,
      },
    });

    if (!user) {
      throw new NotFoundError('User', userId);
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash, ...sanitized } = user;
    return sanitized;
  }

  public static async updateRole(
    targetUserId: string,
    newRole: UserRole,
    performedByUserId: string,
    ipAddress?: string
  ) {
    const target = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!target) {
      throw new NotFoundError('User', targetUserId);
    }

    const updated = await prisma.user.update({
      where: { id: targetUserId },
      data: { role: newRole },
    });

    await AuditService.log({
      userId: performedByUserId,
      action: AuditAction.ROLE_CHANGE,
      resource: 'User',
      resourceId: targetUserId,
      oldValue: { role: target.role },
      newValue: { role: newRole },
      ipAddress,
    });

    return updated;
  }
}
