import { prisma } from '@/database/prisma';
import { NotFoundError } from '@/lib/errors';
import { UpdateClientProfileDto } from './clients.dto';

export class ClientsService {
  public static async getByUserId(userId: string) {
    const profile = await prisma.clientProfile.findUnique({
      where: { userId },
      include: { defaultWarehouse: true },
    });
    if (!profile) {
      throw new NotFoundError('ClientProfile for user', userId);
    }
    return profile;
  }

  public static async update(userId: string, dto: UpdateClientProfileDto) {
    return prisma.clientProfile.update({
      where: { userId },
      data: dto,
    });
  }
}
