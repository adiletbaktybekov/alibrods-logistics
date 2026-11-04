import { prisma } from '@/database/prisma';

export class AdminService {
  public static async getSystemMetrics() {
    const [usersCount, ordersCount, driversCount, warehousesCount] = await Promise.all([
      prisma.user.count(),
      prisma.order.count(),
      prisma.driverProfile.count(),
      prisma.warehouse.count(),
    ]);

    return {
      usersCount,
      ordersCount,
      driversCount,
      warehousesCount,
      timestamp: new Date().toISOString(),
    };
  }
}
