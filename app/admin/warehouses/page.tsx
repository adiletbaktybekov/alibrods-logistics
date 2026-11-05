import * as React from 'react';
import { CONFIRMED_WAREHOUSES, WarehouseSchedule } from '@/modules/warehouses/warehouses.service';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export const dynamic = 'force-dynamic';

export default function AdminWarehousesPage() {
  const groups: {
    schedule: WarehouseSchedule;
    title: string;
    description: string;
    badgeColor: string;
  }[] = [
    {
      schedule: 'DAILY',
      title: 'Ежедневные склады (7)',
      description: 'Приём и доставка осуществляются каждый день, включая выходные',
      badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    },
    {
      schedule: 'MWF',
      title: 'Понедельник / Среда / Пятница (2)',
      description: 'Рейсы выполняются 3 раза в неделю по нечётным дням',
      badgeColor: 'bg-blue-50 text-blue-700 border-blue-200',
    },
    {
      schedule: 'TTS',
      title: 'Вторник / Четверг / Суббота (3)',
      description: 'Рейсы выполняются 3 раза в неделю по чётным дням',
      badgeColor: 'bg-amber-50 text-amber-700 border-amber-200',
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
            Официальный подтверждённый перечень 12 складов маркетплейсов WB и Ozon
          </p>
        </div>
        <div>
          <Badge variant="outline" className="text-xs bg-slate-50 text-slate-700 border-slate-300">
            Строгая валидация дат активна
          </Badge>
        </div>
      </div>

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
      <div className="space-y-6">
        {groups.map((group) => {
          const warehouses = CONFIRMED_WAREHOUSES.filter((w) => w.schedule === group.schedule);

          return (
            <Card key={group.schedule} className="border-slate-200 shadow-sm bg-white overflow-hidden">
              <CardHeader className="pb-3 border-b border-slate-100 bg-slate-50/50">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <CardTitle className="text-base text-slate-900">{group.title}</CardTitle>
                    <p className="text-xs text-slate-500 mt-0.5">{group.description}</p>
                  </div>
                  <Badge variant="outline" className={`text-xs ${group.badgeColor}`}>
                    {warehouses.length} склада
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {warehouses.map((wh) => (
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
          );
        })}
      </div>
    </div>
  );
}
