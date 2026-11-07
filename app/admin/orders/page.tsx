import * as React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAdminOrdersAction } from '@/app/actions/admin';
import { WarehousesService, WarehouseItem } from '@/modules/warehouses/warehouses.service';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge, STATUS_LABELS } from '@/components/ui/status-badge';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { formatDateTime } from '@/lib/utils';
import { OrderStatus } from '@prisma/client';
import { buildOrdersPaginationUrl, calculateDisplayRange } from '@/lib/pagination';
import { isExpectedAuthError } from '@/lib/errors';

type AdminOrdersResult = Awaited<ReturnType<typeof getAdminOrdersAction>>;
type AdminOrderItem = AdminOrdersResult['items'][number];

export const dynamic = 'force-dynamic';

interface AdminOrdersPageProps {
  searchParams: Promise<{
    search?: string;
    status?: string;
    warehouseId?: string;
    date?: string;
    page?: string;
  }>;
}

export default async function AdminOrdersPage({ searchParams }: AdminOrdersPageProps) {
  const params = await searchParams;
  const search = params.search || '';
  const status = (params.status as OrderStatus) || undefined;
  const warehouseId = params.warehouseId || '';
  const date = params.date || '';
  const rawPage = Number(params.page);
  const requestedPage = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;

  let items: AdminOrderItem[] = [];
  let total = 0;
  let page = 1;
  let pageSize = 25;
  let totalPages = 1;
  let warehouses: WarehouseItem[] = [];

  try {
    const [ordersResult, whList] = await Promise.all([
      getAdminOrdersAction({
        search: search || undefined,
        status: status || undefined,
        warehouseId: warehouseId || undefined,
        date: date || undefined,
        page: requestedPage,
        pageSize: 25,
      }),
      WarehousesService.list(),
    ]);
    items = ordersResult.items;
    total = ordersResult.total;
    page = ordersResult.page;
    pageSize = ordersResult.pageSize;
    totalPages = ordersResult.totalPages;
    warehouses = whList;
  } catch (err: unknown) {
    if (isExpectedAuthError(err)) {
      redirect('/login');
    }
  }

  const { fromRecord, toRecord } = calculateDisplayRange(page, pageSize, items.length, total);

  const statusOptions: { value: OrderStatus; label: string }[] = Object.entries(STATUS_LABELS).map(
    ([val, label]) => ({
      value: val as OrderStatus,
      label,
    })
  );

  const hasActiveFilters = Boolean(search || status || warehouseId || date);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Реестр заявок
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Всего найдено: <span className="font-semibold text-slate-800">{total}</span>
            {total > 0 && (
              <span className="text-xs text-slate-400 ml-2">
                (страница {page} из {totalPages})
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasActiveFilters && (
            <Link href="/admin/orders">
              <Button variant="outline" size="sm">
                Сбросить фильтры
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Filter / Search Bar */}
      <Card className="p-4 border-slate-200 bg-white shadow-sm">
        <form method="GET" action="/admin/orders" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Text Search */}
          <div>
            <label htmlFor="search" className="block text-xs font-semibold text-slate-700 mb-1">
              Поиск (номер, клиент, телефон)
            </label>
            <input
              id="search"
              name="search"
              type="text"
              defaultValue={search}
              placeholder="ABL-2026, ООО Ромашка..."
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          {/* Status Filter */}
          <div>
            <label htmlFor="status" className="block text-xs font-semibold text-slate-700 mb-1">
              Статус заявки
            </label>
            <select
              id="status"
              name="status"
              defaultValue={status || ''}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              <option value="">Все статусы</option>
              {statusOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Warehouse Filter */}
          <div>
            <label htmlFor="warehouseId" className="block text-xs font-semibold text-slate-700 mb-1">
              Склад маркетплейса
            </label>
            <select
              id="warehouseId"
              name="warehouseId"
              defaultValue={warehouseId}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              <option value="">Все 12 складов</option>
              {warehouses.map((wh) => (
                <option key={wh.id} value={wh.id}>
                  {wh.name} ({wh.marketplace === 'WILDBERRIES' ? 'WB' : wh.marketplace})
                </option>
              ))}
            </select>
          </div>

          {/* Date Filter & Submit */}
          <div>
            <label htmlFor="date" className="block text-xs font-semibold text-slate-700 mb-1">
              Дата доставки
            </label>
            <div className="flex gap-2">
              <input
                id="date"
                name="date"
                type="date"
                defaultValue={date}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
              <Button type="submit" variant="primary" size="sm" className="px-4">
                Найти
              </Button>
            </div>
          </div>
        </form>
      </Card>

      {/* Orders Table */}
      <Card className="border-slate-200 shadow-sm overflow-hidden bg-white">
        {items.length > 0 ? (
          <>
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Номер</TableHead>
                  <TableHead>Клиент / Контакт</TableHead>
                  <TableHead>Склад</TableHead>
                  <TableHead>Груз</TableHead>
                  <TableHead>Дата доставки</TableHead>
                  <TableHead>Водитель</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead className="text-right">Действие</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((order) => {
                  const client = order.client;
                  const warehouse = order.warehouse;
                  const currentAssignment = order.assignments?.[0];
                  const driverName = currentAssignment?.driver?.fullName;

                  return (
                    <TableRow key={order.id} className="hover:bg-slate-50/80">
                      <TableCell className="font-mono font-medium text-slate-900 whitespace-nowrap">
                        <Link
                          href={`/admin/orders/${order.id}`}
                          className="hover:text-brand-600 transition-colors font-bold"
                        >
                          {order.orderNumber}
                        </Link>
                        <div className="text-[10px] text-slate-400">
                          {formatDateTime(order.createdAt)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-xs font-semibold text-slate-900">
                          {client?.companyName || client?.contactPerson || '—'}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {client?.contactPerson && client?.companyName ? client.contactPerson : ''}
                          {client?.contactPhone ? ` • ${client.contactPhone}` : ''}
                        </div>
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
                      <TableCell className="text-xs">
                        {order.totalPalletsCount > 0 ? (
                          <span className="font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">
                            {order.totalPalletsCount} палл.
                          </span>
                        ) : (
                          <span className="text-slate-700 font-medium">
                            {order.totalBoxesCount} кор.
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-slate-700 whitespace-nowrap">
                        {order.scheduledPickupAt ? (
                          <span>
                            {new Date(order.scheduledPickupAt).toLocaleDateString('ru-RU', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        {driverName ? (
                          <span className="font-medium text-slate-900 bg-slate-100 px-2 py-0.5 rounded">
                            {driverName}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">Не назначен</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={order.status} />
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
          {/* Pagination Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50/50">
            <div className="text-xs text-slate-500">
              Показаны <span className="font-semibold text-slate-700">{fromRecord}–{toRecord}</span> из{' '}
              <span className="font-semibold text-slate-700">{total}</span> заявок
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-600">
                Страница <span className="font-semibold text-slate-900">{page}</span> из{' '}
                <span className="font-semibold text-slate-900">{totalPages}</span>
              </span>
              <div className="flex items-center gap-1.5">
                {page > 1 ? (
                  <Link href={buildOrdersPaginationUrl(page - 1, { search, status, warehouseId, date })}>
                    <Button variant="outline" size="sm" className="h-8 px-3 text-xs">
                      Предыдущая
                    </Button>
                  </Link>
                ) : (
                  <Button variant="outline" size="sm" className="h-8 px-3 text-xs" disabled>
                    Предыдущая
                  </Button>
                )}

                {page < totalPages ? (
                  <Link href={buildOrdersPaginationUrl(page + 1, { search, status, warehouseId, date })}>
                    <Button variant="outline" size="sm" className="h-8 px-3 text-xs">
                      Следующая
                    </Button>
                  </Link>
                ) : (
                  <Button variant="outline" size="sm" className="h-8 px-3 text-xs" disabled>
                    Следующая
                  </Button>
                )}
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="py-12 px-6 text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-sm font-semibold text-slate-900">Заявок по заданным критериям не найдено</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
            Попробуйте изменить поисковый запрос, сбросить фильтр по статусу или дате.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
            {page > 1 && (
              <Link href={buildOrdersPaginationUrl(1, { search, status, warehouseId, date })}>
                <Button variant="outline" size="sm">
                  На первую страницу
                </Button>
              </Link>
            )}
            {hasActiveFilters && (
              <Link href="/admin/orders">
                <Button variant="outline" size="sm">
                  Сбросить все фильтры
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
