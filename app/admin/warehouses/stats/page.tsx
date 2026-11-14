import * as React from 'react';
import { requireStaffUser } from '@/app/actions/admin';
import { OrdersService } from '@/modules/orders/orders.service';
import { prisma } from '@/database/prisma';
import { WarehouseStatsClient } from './stats-client';
import { redirect } from 'next/navigation';
import { isExpectedAuthError } from '@/lib/errors';

export const dynamic = 'force-dynamic';

export default async function AdminWarehouseStatsPage() {
  try {
    await requireStaffUser();
  } catch (err: unknown) {
    if (isExpectedAuthError(err)) {
      redirect('/login');
    }
    throw err;
  }

  const [initialStats, warehousesCatalog] = await Promise.all([
    OrdersService.getWarehouseStats({ period: '7d' }),
    prisma.warehouse.findMany({
      where: { isActive: true },
      select: { id: true, name: true, marketplace: true, city: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  return (
    <WarehouseStatsClient
      initialStats={initialStats}
      warehousesCatalog={warehousesCatalog}
    />
  );
}
