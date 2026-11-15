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

  public static async linkAccountSafe(dto: LinkTelegramAccountDto): Promise<
    { success: true; account: any } | { success: false; error: string }
  > {
    const existingUser = await prisma.user.findUnique({ where: { id: dto.userId } });
    if (!existingUser) {
      return { success: false, error: 'Пользователь не найден' };
    }

    try {
      return await prisma.$transaction(async (tx) => {
        // 1. Check if telegramId is already linked
        const existingByTg = await tx.telegramAccount.findUnique({
          where: { telegramId: dto.telegramId },
          include: { user: true },
        });

        if (existingByTg) {
          if (existingByTg.userId === dto.userId) {
            // Already linked to the same user: idempotent update of profile info
            const updated = await tx.telegramAccount.update({
              where: { telegramId: dto.telegramId },
              data: {
                username: dto.username,
                firstName: dto.firstName,
                lastName: dto.lastName,
                languageCode: dto.languageCode,
                photoUrl: dto.photoUrl,
                authDate: new Date(),
              },
            });
            return { success: true, account: updated };
          }

          // Linked to someone else
          return {
            success: false,
            error:
              'Этот Telegram-аккаунт уже привязан к другой учётной записи. Обратитесь к менеджеру для сброса привязки.',
          };
        }

        // 2. Check if the user already has a different Telegram ID linked
        const existingByUser = await tx.telegramAccount.findUnique({
          where: { userId: dto.userId },
        });

        if (existingByUser) {
          if (existingByUser.telegramId !== dto.telegramId) {
            return {
              success: false,
              error:
                'К вашей учётной записи уже привязан другой Telegram-аккаунт. Обратитесь к менеджеру для изменения.',
            };
          }
        }

        // 3. Create new link
        const created = await tx.telegramAccount.create({
          data: {
            userId: dto.userId,
            telegramId: dto.telegramId,
            username: dto.username,
            firstName: dto.firstName,
            lastName: dto.lastName,
            languageCode: dto.languageCode,
            photoUrl: dto.photoUrl,
            authDate: new Date(),
          },
        });

        return { success: true, account: created };
      });
    } catch (err: any) {
      if (err?.code === 'P2002') {
        return {
          success: false,
          error:
            'Этот Telegram-аккаунт уже связан. Пожалуйста, перезапустите Mini App.',
        };
      }
      return {
        success: false,
        error:
          'Не удалось связать аккаунт с Telegram. Попробуйте позже или обратитесь в поддержку.',
      };
    }
  }

  public static async linkAccount(dto: LinkTelegramAccountDto) {
    const res = await this.linkAccountSafe(dto);
    if (!res.success) {
      throw new Error(res.error);
    }
    return res.account;
  }
}
