import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OrdersService } from '@/modules/orders/orders.service';
import { prisma } from '@/database/prisma';
import { OrderStatus, MarketplaceType } from '@prisma/client';

describe('Stage 7: Admin Dashboard Analytics & Polling', () => {
  const originalDb = process.env.DATABASE_URL;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
  });

  describe('OrdersService.getAdminDashboardStats', () => {
    it('returns safe zero metrics and 7 daily trend points on empty database', async () => {
      // Mock prisma counts to 0
      vi.spyOn(prisma.order, 'count').mockResolvedValue(0);
      vi.spyOn(prisma.order, 'aggregate').mockResolvedValue({
        _sum: { totalBoxesCount: null, totalPalletsCount: null },
      } as any);
      vi.spyOn(prisma.order, 'findMany').mockResolvedValue([]);

      const stats = await OrdersService.getAdminDashboardStats();

      expect(stats.total).toBe(0);
      expect(stats.created).toBe(0);
      expect(stats.completed).toBe(0);
      expect(stats.totalBoxes).toBe(0);
      expect(stats.totalPallets).toBe(0);
      expect(stats.marketplaces.wbPercentage).toBe(0);
      expect(stats.marketplaces.ozonPercentage).toBe(0);
      expect(stats.dailyTrend).toHaveLength(7);
      expect(stats.statusDistribution.length).toBeGreaterThan(0);
      expect(stats.recentOrders).toEqual([]);
    });

    it('calculates marketplace split and cargo aggregates accurately', async () => {
      vi.spyOn(prisma.order, 'count').mockImplementation(((args?: any) => {
        if (!args || !args.where) return Promise.resolve(10); // total
        if (args.where.status === OrderStatus.CREATED) return Promise.resolve(2);
        if (args.where.status === OrderStatus.PENDING_CONFIRMATION) return Promise.resolve(1);
        if (args.where.status === OrderStatus.CONFIRMED) return Promise.resolve(2);
        if (args.where.status?.in?.includes(OrderStatus.ASSIGNED_TO_DRIVER)) return Promise.resolve(2);
        if (args.where.status?.in?.includes(OrderStatus.COMPLETED)) return Promise.resolve(2);
        if (args.where.status?.in?.includes(OrderStatus.CANCELLED)) return Promise.resolve(1);
        if (args.where.marketplace === MarketplaceType.WILDBERRIES) return Promise.resolve(6);
        if (args.where.marketplace === MarketplaceType.OZON) return Promise.resolve(4);
        return Promise.resolve(0);
      }) as any);

      vi.spyOn(prisma.order, 'aggregate').mockResolvedValue({
        _sum: { totalBoxesCount: 45, totalPalletsCount: 8 },
      } as any);

      const today = new Date();
      vi.spyOn(prisma.order, 'findMany').mockImplementation(((args?: any) => {
        if (args?.take === 10) {
          return Promise.resolve([
            {
              id: 'ord-1',
              orderNumber: 'ALB-10001',
              status: OrderStatus.CREATED,
              totalBoxesCount: 5,
              totalPalletsCount: 0,
              createdAt: today,
              warehouse: { name: 'Коледино', marketplace: 'WILDBERRIES' },
              client: { companyName: 'ООO Тест', contactPerson: 'Иван', contactPhone: '+79990001122' },
            },
          ]);
        }
        // Trend data: 2 orders today
        return Promise.resolve([
          { createdAt: today, marketplace: MarketplaceType.WILDBERRIES, status: OrderStatus.CREATED },
          { createdAt: today, marketplace: MarketplaceType.OZON, status: OrderStatus.CONFIRMED },
        ]);
      }) as any);

      const stats = await OrdersService.getAdminDashboardStats();

      expect(stats.total).toBe(10);
      expect(stats.created).toBe(2);
      expect(stats.completed).toBe(2);
      expect(stats.totalBoxes).toBe(45);
      expect(stats.totalPallets).toBe(8);
      expect(stats.marketplaces.wildberries).toBe(6);
      expect(stats.marketplaces.ozon).toBe(4);
      expect(stats.marketplaces.wbPercentage).toBe(60);
      expect(stats.marketplaces.ozonPercentage).toBe(40);

      // Verify today point in trend
      const todayPoint = stats.dailyTrend[stats.dailyTrend.length - 1];
      expect(todayPoint.count).toBe(2);
      expect(todayPoint.wbCount).toBe(1);
      expect(todayPoint.ozonCount).toBe(1);

      expect(stats.recentOrders).toHaveLength(1);
      expect(stats.recentOrders[0].orderNumber).toBe('ALB-10001');
    });

    it('returns fallback empty stats when DATABASE_URL is not configured', async () => {
      const originalDbUrl = process.env.DATABASE_URL;
      delete process.env.DATABASE_URL;

      try {
        const stats = await OrdersService.getAdminDashboardStats();
        expect(stats.total).toBe(0);
        expect(stats.recentOrders).toEqual([]);
      } finally {
        process.env.DATABASE_URL = originalDbUrl;
      }
    });
  });
});
