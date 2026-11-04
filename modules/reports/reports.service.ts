import { prisma } from '@/database/prisma';
import { ReportQueryDto } from './reports.dto';

export class ReportsService {
  public static async getOperationalSummary(query: ReportQueryDto) {
    const where = {
      ...(query.marketplace ? { marketplace: query.marketplace } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.startDate || query.endDate
        ? {
            createdAt: {
              ...(query.startDate ? { gte: query.startDate } : {}),
              ...(query.endDate ? { lte: query.endDate } : {}),
            },
          }
        : {}),
    };

    const [totalOrders, statusCounts, aggregates] = await Promise.all([
      prisma.order.count({ where }),
      prisma.order.groupBy({
        by: ['status'],
        where,
        _count: { id: true },
      }),
      prisma.order.aggregate({
        where,
        _sum: {
          totalBoxesCount: true,
          totalWeightKg: true,
          totalVolumeM3: true,
        },
      }),
    ]);

    return {
      totalOrders,
      statusCounts: statusCounts.map((s) => ({ status: s.status, count: s._count.id })),
      aggregates: {
        totalBoxes: aggregates._sum.totalBoxesCount || 0,
        totalWeightKg: aggregates._sum.totalWeightKg || 0,
        totalVolumeM3: aggregates._sum.totalVolumeM3 || 0,
      },
    };
  }
}
