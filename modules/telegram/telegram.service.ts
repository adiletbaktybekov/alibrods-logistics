import { prisma } from '@/database/prisma';
import { NotFoundError } from '@/lib/errors';
import { LinkTelegramAccountDto } from './telegram.dto';

export class TelegramService {
  public static async getByTelegramId(telegramId: bigint) {
    const account = await prisma.telegramAccount.findUnique({
      where: { telegramId },
      include: {
        user: {
          include: {
            clientProfile: true,
            driverProfile: true,
            managerProfile: true,
          },
        },
      },
    });
    return account;
  }

  public static async linkAccount(dto: LinkTelegramAccountDto) {
    const existingUser = await prisma.user.findUnique({ where: { id: dto.userId } });
    if (!existingUser) throw new NotFoundError('User', dto.userId);

    return prisma.telegramAccount.upsert({
      where: { userId: dto.userId },
      create: {
        userId: dto.userId,
        telegramId: dto.telegramId,
        username: dto.username,
        firstName: dto.firstName,
        lastName: dto.lastName,
        languageCode: dto.languageCode,
        photoUrl: dto.photoUrl,
        authDate: new Date(),
      },
      update: {
        telegramId: dto.telegramId,
        username: dto.username,
        firstName: dto.firstName,
        lastName: dto.lastName,
        languageCode: dto.languageCode,
        photoUrl: dto.photoUrl,
      },
    });
  }
}
