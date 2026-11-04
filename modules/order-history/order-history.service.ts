import { prisma } from '@/database/prisma';

export class OrderHistoryService {
  public static async getByOrderId(orderId: string) {
    return prisma.orderStatusHistory.findMany({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
      include: {
        changedBy: { select: { id: true, email: true, role: true } },
      },
    });
  }
}
