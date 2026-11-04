import { prisma } from '@/database/prisma';
import { NotFoundError } from '@/lib/errors';
import { CreateManagerProfileDto } from './managers.dto';

export class ManagersService {
  public static async getByUserId(userId: string) {
    const manager = await prisma.managerProfile.findUnique({
      where: { userId },
      include: { user: { select: { email: true, phone: true } } },
    });
    if (!manager) throw new NotFoundError('ManagerProfile for user', userId);
    return manager;
  }

  public static async create(dto: CreateManagerProfileDto) {
    return prisma.managerProfile.create({ data: dto });
  }
}
