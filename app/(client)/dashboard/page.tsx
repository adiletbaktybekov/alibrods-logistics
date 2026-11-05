import * as React from 'react';
import Link from 'next/link';
import { getCurrentClientProfile } from '@/app/actions/auth';
import { getClientDashboardStats } from '@/app/actions/orders';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatDateTime } from '@/lib/utils';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const profile = await getCurrentClientProfile();
  const stats = await getClientDashboardStats();

  const greetingName =
    profile?.client?.companyName || profile?.client?.contactPerson || profile?.user?.phone || 'Партнёр';

  return (
    <div className="space-y-8">
      {/* Welcome & Primary Action Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Здравствуйте, {greetingName}!
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Личный кабинет логистического сервиса AliBros. Отслеживайте и оформляйте поставки на склады WB и Ozon.
          </p>
        </div>
        <div>
          <Link href="/orders/new">
            <Button variant="primary" size="lg" className="w-full sm:w-auto shadow-sm">
              + Создать заявку
            </Button>
          </Link>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="pb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Всего заявок
            </span>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-extrabold text-slate-900">{stats.total}</div>
            <p className="text-xs text-slate-500 mt-1">Все поставки с момента регистрации</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="pb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-600">
              В обработке
            </span>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-extrabold text-amber-600">{stats.inProcessing}</div>
            <p className="text-xs text-slate-500 mt-1">Приёмка, погрузка, рейс или сдача на склад</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="pb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-600">
              Завершено
            </span>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-extrabold text-emerald-600">{stats.completed}</div>
            <p className="text-xs text-slate-500 mt-1">Успешно приняты маркетплейсом</p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Orders Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900 tracking-tight">Последние заявки</h2>
          <Link href="/orders" className="text-xs font-semibold text-brand-600 hover:text-brand-700">
            Смотреть все заявки →
          </Link>
        </div>

        <Card className="border-slate-200 shadow-sm overflow-hidden">
          {stats.recentOrders && stats.recentOrders.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Номер</TableHead>
                  <TableHead>Склад маркетплейса</TableHead>
                  <TableHead>Дата создания</TableHead>
                  <TableHead>Коробок / Паллет</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead className="text-right">Действие</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.recentOrders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-mono font-medium text-brand-700">
                      <Link href={`/orders/${order.id}`} className="hover:underline">
                        {order.orderNumber}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-slate-900">{order.warehouse.name}</div>
                      <div className="text-xs text-slate-500">{order.warehouse.marketplace}</div>
                    </TableCell>
                    <TableCell className="text-slate-600 text-xs">
                      {formatDateTime(order.createdAt)}
                    </TableCell>
                    <TableCell className="text-slate-700">
                      {order.totalBoxesCount} кор. {order.totalPalletsCount ? `/ ${order.totalPalletsCount} палл.` : ''}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={order.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Link href={`/orders/${order.id}`}>
                        <Button variant="outline" size="sm" className="text-xs">
                          Открыть
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="p-12 text-center">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400 mb-3">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="text-base font-semibold text-slate-900">У вас пока нет созданных заявок</h3>
              <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
                Создайте первую заявку на доставку груза на склад Wildberries или Ozon, и логисты AliBros оперативно примут её в работу.
              </p>
              <div className="mt-5">
                <Link href="/orders/new">
                  <Button variant="primary" size="sm">
                    + Создать первую заявку
                  </Button>
                </Link>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
