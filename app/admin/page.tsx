import * as React from 'react';
import Link from 'next/link';
import { getAdminDashboardStatsAction } from '@/app/actions/admin';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { formatDateTime } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

export const dynamic = 'force-dynamic';

export default async function AdminDashboardPage() {
  const stats = await getAdminDashboardStatsAction();

  const kpis = [
    {
      label: 'Всего заявок',
      value: stats.total,
      description: 'Все заявки в системе',
      color: 'text-slate-900',
      bgColor: 'bg-slate-50',
      borderColor: 'border-slate-200',
      href: '/admin/orders',
    },
    {
      label: 'Новые (Созданы)',
      value: stats.created,
      description: 'Поступили от клиентов',
      color: 'text-sky-700',
      bgColor: 'bg-sky-50/60',
      borderColor: 'border-sky-200',
      href: '/admin/orders?status=CREATED',
    },
    {
      label: 'Ожидают подтверждения',
      value: stats.pendingConfirmation,
      description: 'Требуют проверки менеджером',
      color: 'text-amber-700',
      bgColor: 'bg-amber-50/60',
      borderColor: 'border-amber-200',
      href: '/admin/orders?status=PENDING_CONFIRMATION',
    },
    {
      label: 'Подтверждённые',
      value: stats.confirmed,
      description: 'Готовы к назначению водителя',
      color: 'text-indigo-700',
      bgColor: 'bg-indigo-50/60',
      borderColor: 'border-indigo-200',
      href: '/admin/orders?status=CONFIRMED',
    },
    {
      label: 'В доставке',
      value: stats.inDelivery,
      description: 'Назначены, забраны или в пути',
      color: 'text-blue-700',
      bgColor: 'bg-blue-50/60',
      borderColor: 'border-blue-200',
      href: '/admin/orders',
    },
    {
      label: 'Завершено',
      value: stats.completed,
      description: 'Приняты маркетплейсом',
      color: 'text-emerald-700',
      bgColor: 'bg-emerald-50/60',
      borderColor: 'border-emerald-200',
      href: '/admin/orders?status=COMPLETED',
    },
    {
      label: 'Отклонено / Отменено',
      value: stats.rejected,
      description: 'Отклонены или сняты',
      color: 'text-rose-700',
      bgColor: 'bg-rose-50/60',
      borderColor: 'border-rose-200',
      href: '/admin/orders?status=REJECTED_BY_MANAGER',
    },
  ];

  return (
    <div className="space-y-8">
      {/* Top Banner / Heading */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              Диспетчерская панель
            </h1>
            <Badge variant="outline" className="text-xs bg-brand-50 text-brand-700 border-brand-200">
              Live Operations
            </Badge>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Централизованное управление логистическими потоками Wildberries &amp; Ozon
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin/orders">
            <Button variant="primary" size="md">
              Реестр заявок →
            </Button>
          </Link>
          <Link href="/admin/drivers">
            <Button variant="outline" size="md">
              Водители
            </Button>
          </Link>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {kpis.map((kpi) => (
          <Link key={kpi.label} href={kpi.href} className="block transition-transform hover:-translate-y-0.5">
            <Card className={`border ${kpi.borderColor} ${kpi.bgColor} shadow-sm hover:shadow transition-shadow h-full`}>
              <CardHeader className="pb-1 pt-4 px-4">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  {kpi.label}
                </span>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className={`text-2xl sm:text-3xl font-extrabold ${kpi.color}`}>
                  {kpi.value}
                </div>
                <p className="text-[11px] text-slate-500 mt-1 truncate">
                  {kpi.description}
                </p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Operational Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link
          href="/admin/orders"
          className="flex items-center justify-between p-4 rounded-xl border border-slate-200 bg-white hover:border-brand-500 hover:shadow-sm transition-all"
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-brand-50 text-brand-600">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <div>
              <div className="font-semibold text-slate-900 text-sm">Обработка заявок</div>
              <div className="text-xs text-slate-500">Подтверждение, отказ, назначение</div>
            </div>
          </div>
          <span className="text-slate-400">→</span>
        </Link>

        <Link
          href="/admin/drivers"
          className="flex items-center justify-between p-4 rounded-xl border border-slate-200 bg-white hover:border-brand-500 hover:shadow-sm transition-all"
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-emerald-50 text-emerald-600">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div>
              <div className="font-semibold text-slate-900 text-sm">Реестр водителей</div>
              <div className="text-xs text-slate-500">Добавление, доступность, автопарк</div>
            </div>
          </div>
          <span className="text-slate-400">→</span>
        </Link>

        <Link
          href="/admin/warehouses"
          className="flex items-center justify-between p-4 rounded-xl border border-slate-200 bg-white hover:border-brand-500 hover:shadow-sm transition-all"
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-purple-50 text-purple-600">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <div>
              <div className="font-semibold text-slate-900 text-sm">Склады и графики</div>
              <div className="text-xs text-slate-500">12 подтверждённых складов</div>
            </div>
          </div>
          <span className="text-slate-400">→</span>
        </Link>
      </div>

      {/* Recent Orders Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900 tracking-tight">
              Свежие поступившие заявки
            </h2>
            <p className="text-xs text-slate-500">
              Последние 10 заявок в очереди на обработку
            </p>
          </div>
          <Link href="/admin/orders" className="text-xs font-semibold text-brand-600 hover:text-brand-700">
            Перейти в полный реестр →
          </Link>
        </div>

        <Card className="border-slate-200 shadow-sm overflow-hidden bg-white">
          {stats.recentOrders && stats.recentOrders.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Номер</TableHead>
                    <TableHead>Клиент / Компания</TableHead>
                    <TableHead>Склад</TableHead>
                    <TableHead>Груз</TableHead>
                    <TableHead>Статус</TableHead>
                    <TableHead>Дата создания</TableHead>
                    <TableHead className="text-right">Действие</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.recentOrders.map((order) => {
                    const client = 'client' in order ? (order as { client?: { companyName?: string | null; contactPerson?: string | null; contactPhone?: string | null } }).client : null;
                    const warehouse = 'warehouse' in order ? (order as { warehouse?: { name?: string | null; marketplace?: string | null } }).warehouse : null;

                    return (
                      <TableRow key={order.id} className="hover:bg-slate-50/80">
                        <TableCell className="font-mono font-medium text-slate-900">
                          {order.orderNumber}
                        </TableCell>
                        <TableCell>
                          <div className="text-xs font-semibold text-slate-900">
                            {client?.companyName || client?.contactPerson || 'Клиент'}
                          </div>
                          {client?.contactPhone && (
                            <div className="text-[11px] text-slate-500 font-mono">
                              {client.contactPhone}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-medium text-slate-900">
                              {warehouse?.name || '—'}
                            </span>
                            {warehouse?.marketplace && (
                              <Badge variant="outline" className="text-[10px] px-1 py-0">
                                {warehouse.marketplace === 'WILDBERRIES' ? 'WB' : warehouse.marketplace}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-xs text-slate-700">
                            {order.totalPalletsCount > 0 ? (
                              <span className="font-semibold text-indigo-600">
                                {order.totalPalletsCount} палл.
                              </span>
                            ) : (
                              <span>{order.totalBoxesCount} кор.</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={order.status} />
                        </TableCell>
                        <TableCell className="text-xs text-slate-500 whitespace-nowrap">
                          {formatDateTime(order.createdAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Link href={`/admin/orders/${order.id}`}>
                            <Button variant="outline" size="sm" className="text-xs">
                              Управление
                            </Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="py-12 px-6 text-center">
              <div className="mx-auto w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-slate-900">Заявок пока нет</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                Новые заявки от клиентов появятся в этом списке автоматически в реальном времени.
              </p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
