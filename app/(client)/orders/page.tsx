import * as React from 'react';
import Link from 'next/link';
import { getClientOrders } from '@/app/actions/orders';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { StatusBadge, STATUS_LABELS } from '@/components/ui/status-badge';
import { formatDateTime } from '@/lib/utils';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { OrderStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

interface OrdersPageProps {
  searchParams: Promise<{
    status?: string;
    search?: string;
  }>;
}

export default async function OrdersPage({ searchParams }: OrdersPageProps) {
  const { status, search } = await searchParams;

  const validStatus = status && Object.values(OrderStatus).includes(status as OrderStatus)
    ? (status as OrderStatus)
    : undefined;

  const result = await getClientOrders(validStatus, search);
  const orders = result.items || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Мои заявки
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Реестр всех ваших поставок на склады маркетплейсов Wildberries и Ozon
          </p>
        </div>
        <div>
          <Link href="/orders/new">
            <Button variant="primary" size="md" className="shadow-sm">
              + Создать заявку
            </Button>
          </Link>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <Card className="p-4 border-slate-200 shadow-sm">
        <form method="GET" className="grid grid-cols-1 sm:grid-cols-12 gap-3">
          <div className="sm:col-span-6 md:col-span-7">
            <input
              type="text"
              name="search"
              defaultValue={search || ''}
              placeholder="Поиск по номеру заявки (например: ABL-2026-X)"
              className="flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            />
          </div>

          <div className="sm:col-span-4 md:col-span-3">
            <select
              name="status"
              defaultValue={status || ''}
              className="flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <option value="">Все статусы</option>
              {Object.entries(STATUS_LABELS).map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2 md:col-span-2 flex gap-2">
            <Button type="submit" variant="secondary" className="w-full">
              Найти
            </Button>
            {(search || status) && (
              <Link href="/orders">
                <Button type="button" variant="outline" title="Сбросить фильтры">
                  ✕
                </Button>
              </Link>
            )}
          </div>
        </form>
      </Card>

      {/* Orders Table */}
      <Card className="border-slate-200 shadow-sm overflow-hidden">
        {orders.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Номер заявки</TableHead>
                <TableHead>Дата создания</TableHead>
                <TableHead>Дата доставки</TableHead>
                <TableHead>Склад маркетплейса</TableHead>
                <TableHead>Количество мест</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead className="text-right">Действие</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="font-mono font-medium text-brand-700">
                    <Link href={`/orders/${order.id}`} className="hover:underline">
                      {order.orderNumber}
                    </Link>
                  </TableCell>
                  <TableCell className="text-slate-600 text-xs">
                    {formatDateTime(order.createdAt)}
                  </TableCell>
                  <TableCell className="text-slate-900 text-xs font-medium">
                    {order.scheduledPickupAt ? formatDateTime(order.scheduledPickupAt) : 'По согласованию'}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium text-slate-900">{order.warehouse.name}</div>
                    <div className="text-xs text-slate-500">{order.warehouse.marketplace}</div>
                  </TableCell>
                  <TableCell className="text-slate-700 text-sm">
                    {order.totalBoxesCount} кор. {order.totalPalletsCount ? `/ ${order.totalPalletsCount} палл.` : ''}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={order.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Link href={`/orders/${order.id}`}>
                      <Button variant="outline" size="sm" className="text-xs">
                        Детали
                      </Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="p-12 text-center">
            <h3 className="text-base font-semibold text-slate-900">Заявки не найдены</h3>
            <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
              {search || status
                ? 'По вашему запросу ничего не найдено. Попробуйте сбросить фильтры поиска.'
                : 'У вас пока нет оформленных заявок на доставку.'}
            </p>
            <div className="mt-4">
              {search || status ? (
                <Link href="/orders">
                  <Button variant="outline" size="sm">
                    Сбросить фильтры
                  </Button>
                </Link>
              ) : (
                <Link href="/orders/new">
                  <Button variant="primary" size="sm">
                    + Создать первую заявку
                  </Button>
                </Link>
              )}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
