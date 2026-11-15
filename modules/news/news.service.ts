import { prisma } from '@/database/prisma';
import { getClientTelegramBotClient } from '@/integrations/telegram/client';
import { logger } from '@/lib/logger';
import { NewsStatus } from '@prisma/client';

export class NewsService {
  public static async create(dto: {
    title: string;
    content: string;
    imageUrl?: string | null;
    authorId?: string;
  }) {
    return prisma.newsArticle.create({
      data: {
        title: dto.title.trim(),
        content: dto.content.trim(),
        imageUrl: dto.imageUrl?.trim() || null,
        status: NewsStatus.DRAFT,
        authorId: dto.authorId,
      },
    });
  }

  public static async update(
    id: string,
    dto: {
      title?: string;
      content?: string;
      imageUrl?: string | null;
      status?: NewsStatus;
    }
  ) {
    return prisma.newsArticle.update({
      where: { id },
      data: {
        ...(dto.title ? { title: dto.title.trim() } : {}),
        ...(dto.content ? { content: dto.content.trim() } : {}),
        ...(dto.imageUrl !== undefined ? { imageUrl: dto.imageUrl ? dto.imageUrl.trim() : null } : {}),
        ...(dto.status ? { status: dto.status } : {}),
      },
    });
  }

  public static async delete(id: string) {
    return prisma.newsArticle.delete({ where: { id } });
  }

  public static async archive(id: string) {
    return prisma.newsArticle.update({
      where: { id },
      data: { status: NewsStatus.ARCHIVED },
    });
  }

  public static async listAdmin(status?: NewsStatus) {
    if (!process.env.DATABASE_URL) return [];
    return prisma.newsArticle.findMany({
      where: status ? { status } : {},
      orderBy: { createdAt: 'desc' },
      include: {
        author: {
          select: { id: true, email: true, phone: true },
        },
        _count: {
          select: { deliveries: true },
        },
      },
    });
  }

  public static async listPublished(take = 20) {
    if (!process.env.DATABASE_URL) return [];
    return prisma.newsArticle.findMany({
      where: { status: NewsStatus.PUBLISHED },
      orderBy: { publishedAt: 'desc' },
      take,
    });
  }

  public static async getById(id: string) {
    if (!process.env.DATABASE_URL) return null;
    return prisma.newsArticle.findUnique({
      where: { id },
      include: {
        author: {
          select: { id: true, email: true, phone: true },
        },
        _count: {
          select: { deliveries: true },
        },
      },
    });
  }

  public static async publish(id: string): Promise<{
    success: boolean;
    sentCount: number;
    failedCount: number;
    error?: string;
  }> {
    const article = await prisma.newsArticle.findUnique({ where: { id } });
    if (!article) {
      return { success: false, sentCount: 0, failedCount: 0, error: 'Новость не найдена' };
    }

    // Set status to PUBLISHED and set publishedAt
    await prisma.newsArticle.update({
      where: { id },
      data: {
        status: NewsStatus.PUBLISHED,
        publishedAt: article.publishedAt || new Date(),
      },
    });

    // Find eligible clients (strictly client role, with bot unblocked and notifications enabled)
    const clients = await prisma.user.findMany({
      where: {
        role: 'CLIENT',
        isActive: true,
        allowNewsNotifications: true,
        telegramAccount: {
          isBotBlocked: false,
        },
      },
      include: {
        telegramAccount: true,
      },
    });

    const clientBot = getClientTelegramBotClient();
    const FORBIDDEN_GROUP_ID = '-1003893397086';
    let sentCount = 0;
    let failedCount = 0;

    for (const client of clients) {
      if (!client.telegramAccount) continue;
      const tgId = client.telegramAccount.telegramId;
      const tgIdStr = tgId.toString();

      // STRICT PROTECTION: Never send to manager group or service chat
      if (
        tgIdStr === FORBIDDEN_GROUP_ID ||
        tgIdStr === process.env.TELEGRAM_MANAGER_GROUP_CHAT_ID ||
        tgIdStr.startsWith('-')
      ) {
        continue;
      }

      // Check if already delivered (idempotency / deduplication)
      const alreadyDelivered = await prisma.newsDelivery.findUnique({
        where: {
          newsId_userId: {
            newsId: article.id,
            userId: client.id,
          },
        },
      });

      if (alreadyDelivered && alreadyDelivered.status === 'DELIVERED') {
        continue;
      }

      const miniAppUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.alibros.ru';
      const webAppUrl = `${miniAppUrl}/miniapp/news/${article.id}`;

      const messageText =
        `📰 <b>${escapeHtml(article.title)}</b>\n\n` +
        `${escapeHtml(article.content.length > 500 ? article.content.slice(0, 500) + '...' : article.content)}\n\n` +
        `<i>AliBros Logistics</i>`;

      const replyMarkup = {
        inline_keyboard: [
          [
            {
              text: '📖 Читать полностью',
              web_app: { url: webAppUrl },
            },
          ],
        ],
      };

      try {
        let sent = false;
        if (article.imageUrl && article.imageUrl.startsWith('http')) {
          sent = await clientBot.sendPhoto({
            chatId: tgIdStr,
            photo: article.imageUrl,
            caption: messageText,
            parseMode: 'HTML',
            replyMarkup,
          });
        }

        if (!sent) {
          sent = await clientBot.sendMessage({
            chatId: tgIdStr,
            text: messageText,
            parseMode: 'HTML',
            replyMarkup,
          });
        }

        if (sent) {
          sentCount++;
          await prisma.newsDelivery.upsert({
            where: {
              newsId_userId: {
                newsId: article.id,
                userId: client.id,
              },
            },
            create: {
              newsId: article.id,
              userId: client.id,
              telegramId: tgId,
              status: 'DELIVERED',
              sentAt: new Date(),
            },
            update: {
              status: 'DELIVERED',
              sentAt: new Date(),
              errorMessage: null,
            },
          });
        } else {
          failedCount++;
          await prisma.newsDelivery.upsert({
            where: {
              newsId_userId: {
                newsId: article.id,
                userId: client.id,
              },
            },
            create: {
              newsId: article.id,
              userId: client.id,
              telegramId: tgId,
              status: 'FAILED',
              errorMessage: clientBot.lastError?.description || 'Failed to send message',
              sentAt: new Date(),
            },
            update: {
              status: 'FAILED',
              errorMessage: clientBot.lastError?.description || 'Failed to send message',
            },
          });
        }
      } catch (sendErr: any) {
        failedCount++;
        logger.error({ sendErr, userId: client.id }, 'Error sending news to client telegram');
      }
    }

    return { success: true, sentCount, failedCount };
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
