import * as React from 'react';
import { redirect } from 'next/navigation';
import { getAdminWarehousesAction } from '@/app/actions/admin';
import { CONFIRMED_WAREHOUSES, WarehouseSchedule } from '@/modules/warehouses/warehouses.service';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Warehouse } from '@prisma/client';
import { isExpectedAuthError } from '@/lib/errors';

export const dynamic = 'force-dynamic';

interface EnrichedWarehouse extends Warehouse {
  schedule: WarehouseSchedule;
  scheduleDescription: string;
}

function resolveWarehouseSchedule(wh: Warehouse): {
  schedule: WarehouseSchedule;
  scheduleDescription: string;
} {
  const confirmed = CONFIRMED_WAREHOUSES.find((c) => c.code === wh.code || c.name === wh.name);
  if (confirmed) {
    return {
      schedule: confirmed.schedule,
      scheduleDescription: confirmed.scheduleDescription,
    };
  }

  const hours = (wh.operatingHours || '').toLowerCase();
  if (hours.includes('вторник') || hours.includes('четверг') || hours.includes('суббота')) {
    return { schedule: 'TTS', scheduleDescription: 'Вторник / четверг / суббота' };
  }
  if (hours.includes('понедельник') || hours.includes('среда') || hours.includes('пятница')) {
    return { schedule: 'MWF', scheduleDescription: 'Понедельник / среда / пятница' };
  }
  return { schedule: 'DAILY', scheduleDescription: 'Ежедневно' };
}

export default async function AdminWarehousesPage() {
  let warehouses: Warehouse[] = [];
  let fetchError: string | null = null;

  try {
    warehouses = await getAdminWarehousesAction();
  } catch (err: unknown) {
    if (isExpectedAuthError(err)) {
      redirect('/login');
    }
    fetchError = err instanceof Error ? err.message : 'Не удалось загрузить справочник складов';
  }

  const enrichedWarehouses: EnrichedWarehouse[] = warehouses
    .filter((w) => w.isActive)
    .map((w) => {
      const scheduleInfo = resolveWarehouseSchedule(w);
      return {
        ...w,
        ...scheduleInfo,
      };
    });

  const dailyWarehouses = enrichedWarehouses.filter((w) => w.schedule === 'DAILY');
  const mwfWarehouses = enrichedWarehouses.filter((w) => w.schedule === 'MWF');
  const ttsWarehouses = enrichedWarehouses.filter((w) => w.schedule === 'TTS');

  const groups: {
    schedule: WarehouseSchedule;
    title: string;
    description: string;
    badgeColor: string;
    items: EnrichedWarehouse[];
  }[] = [
    {
      schedule: 'DAILY',
      title: `Ежедневные склады (${dailyWarehouses.length})`,
      description: 'Приём и доставка осуществляются каждый день, включая выходные',
      badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      items: dailyWarehouses,
    },
    {
      schedule: 'MWF',
      title: `Понедельник / Среда / Пятница (${mwfWarehouses.length})`,
      description: 'Рейсы выполняются 3 раза в неделю по нечётным дням',
      badgeColor: 'bg-blue-50 text-blue-700 border-blue-200',
      items: mwfWarehouses,
    },
    {
      schedule: 'TTS',
      title: `Вторник / Четверг / Суббота (${ttsWarehouses.length})`,
      description: 'Рейсы выполняются 3 раза в неделю по чётным дням',
      badgeColor: 'bg-amber-50 text-amber-700 border-amber-200',
      items: ttsWarehouses,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Склады и графики поставок
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Подтверждённые склады маркетплейсов WB и Ozon в базе данных ({enrichedWarehouses.length})
          </p>
        </div>
        <div>
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
          <span className="font-semibold">Бизнес-правило приёмки:</span> Клиентский портал и административный API сверяют день недели выбранной даты доставки со строгим расписанием складов. Оформление заявки на склад в нерабочий день блокируется серверной валидацией.
        </div>
      </div>

      {/* Warehouse Groups */}
      {enrichedWarehouses.length === 0 && !fetchError ? (
        <Card className="border-slate-200 shadow-sm bg-white p-12 text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <h3 className="text-sm font-semibold text-slate-900">Склады не найдены</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
            В базе данных пока нет активных складов маркетплейсов.
          </p>
        </Card>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <Card key={group.schedule} className="border-slate-200 shadow-sm bg-white overflow-hidden">
              <CardHeader className="pb-3 border-b border-slate-100 bg-slate-50/50">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <CardTitle className="text-base text-slate-900">{group.title}</CardTitle>
                    <p className="text-xs text-slate-500 mt-0.5">{group.description}</p>
                  </div>
                  <Badge variant="outline" className={`text-xs ${group.badgeColor}`}>
                    {group.items.length} склада
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {group.items.map((wh) => (
                    <div
                      key={wh.id}
                      className="rounded-xl border border-slate-200 p-4 hover:border-brand-300 hover:shadow-xs transition-all bg-white flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <span className="font-bold text-slate-900 text-sm">
                            {wh.name}
                          </span>
                          <Badge
                            variant={wh.marketplace === 'WILDBERRIES' ? 'default' : 'warning'}
                            className="text-[10px]"
                          >
                            {wh.marketplace}
                          </Badge>
                        </div>
                        <div className="font-mono text-[11px] text-slate-400">
                          Код: {wh.code}
                        </div>
                        {wh.city && (
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            {wh.city}
                          </div>
                        )}
                      </div>

                      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                        <span className="text-slate-500">График:</span>
                        <span className="font-medium text-slate-800">{wh.scheduleDescription}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

