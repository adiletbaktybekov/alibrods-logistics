import * as React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAdminWarehousesAction } from '@/app/actions/admin';
import { resolveWarehouseSchedule } from '@/modules/warehouses/warehouses.service';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Warehouse } from '@prisma/client';
import { isExpectedAuthError } from '@/lib/errors';
import { WarehousesClient } from './warehouses-client';

export const dynamic = 'force-dynamic';

export default async function AdminWarehousesPage() {
  let warehouses: Warehouse[] = [];
  let fetchError: string | null = null;

  try {
    warehouses = await getAdminWarehousesAction(true);
  } catch (err: unknown) {
    if (isExpectedAuthError(err)) {
      redirect('/login');
    }
    fetchError = err instanceof Error ? err.message : 'Не удалось загрузить справочник складов';
  }

  const enrichedWarehouses = warehouses.map((w) => {
    const scheduleInfo = resolveWarehouseSchedule(w);
    return {
      ...w,
      schedule: scheduleInfo.schedule,
      scheduleDescription: scheduleInfo.scheduleDescription,
    };
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Управление складами
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Справочник складов маркетплейсов WB и Ozon, адреса и графики приёмки ({enrichedWarehouses.length})
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/admin/warehouses/stats">
            <Button variant="outline" size="sm" className="text-slate-700">
              📊 Аналитика грузопотока
            </Button>
          </Link>
          <Badge variant="outline" className="text-xs bg-slate-50 text-slate-700 border-slate-300">
            Строгая валидация дат активна
          </Badge>
        </div>
      </div>

      {fetchError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800">
          ⚠️ {fetchError}. Пожалуйста, обновите страницу.
        </div>
      )}

      {/* Info Callout */}
      <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-4 text-xs text-blue-900 flex items-start gap-3">
        <div className="mt-0.5 text-blue-600 shrink-0">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div>
          <span className="font-semibold">Правила работы справочника складов:</span> Активные склады мгновенно становятся доступны селлерам при оформлении поставок. Удаление склада разрешено только при отсутствии связанных с ним заказов. Если склад использовался в заказах — используйте деактивацию.
        </div>
      </div>

      {/* Client-side Interactive Manager */}
      <WarehousesClient initialWarehouses={enrichedWarehouses} />
    </div>
  );
}


