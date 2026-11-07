import * as React from 'react';
import Link from 'next/link';
import { getClientsListAction } from '@/app/actions/admin';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { formatDateTime } from '@/lib/utils';
import { buildClientsPaginationUrl, calculateDisplayRange } from '@/lib/pagination';
import { PaginatedClientsResult } from '@/modules/clients/clients.service';

export const dynamic = 'force-dynamic';

interface AdminClientsPageProps {
  searchParams: Promise<{
    search?: string;
    page?: string;
  }>;
}

export default async function AdminClientsPage({ searchParams }: AdminClientsPageProps) {
  const params = await searchParams;
  const search = params.search || '';
  const rawPage = Number(params.page);
  const requestedPage = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;

  let result: PaginatedClientsResult = { items: [], total: 0, page: 1, pageSize: 25, totalPages: 1 };
  let fetchError: string | null = null;

  try {
    result = await getClientsListAction({
      search: search || undefined,
      page: requestedPage,
      pageSize: 25,
    });
  } catch (err: unknown) {
    fetchError = err instanceof Error ? err.message : 'Не удалось загрузить реестр клиентов';
  }

  const { items, total, page, pageSize, totalPages } = result;
  const { fromRecord, toRecord } = calculateDisplayRange(page, pageSize, items.length, total);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            База клиентов
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
      </div>

      {fetchError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800">
          ⚠️ {fetchError}. Пожалуйста, обновите страницу.
        </div>
      )}

      {/* Search Bar */}
      <Card className="p-4 border-slate-200 bg-white shadow-sm">
        <form method="GET" action="/admin/clients" className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <label htmlFor="search" className="block text-xs font-semibold text-slate-700 mb-1">
              Поиск (компания, ИНН, контактное лицо, телефон)
            </label>
            <input
              id="search"
              name="search"
              type="text"
              defaultValue={search}
              placeholder="ООО Вектор, 7701234567, Иванов, +7999..."
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
          <div className="flex items-end gap-2">
            <Button type="submit" variant="primary" size="sm" className="px-5">
              Найти
            </Button>
            {search && (
              <Link href="/admin/clients">
                <Button variant="outline" size="sm">
                  Сбросить
                </Button>
              </Link>
            )}
          </div>
        </form>
      </Card>

      {/* Clients Table */}
      <Card className="border-slate-200 shadow-sm overflow-hidden bg-white">
        {items.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Компания</TableHead>
                    <TableHead>ИНН</TableHead>
                    <TableHead>Контактное лицо</TableHead>
                    <TableHead>Телефон</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead className="text-center">Заявок</TableHead>
                    <TableHead>Регистрация</TableHead>
                    <TableHead className="text-right">Действие</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((client) => {
                    const ordersCount = client._count?.orders ?? 0;

                    return (
                      <TableRow key={client.id} className="hover:bg-slate-50/80">
                        <TableCell className="font-semibold text-slate-900 text-xs">
                          <Link
                            href={`/admin/clients/${client.id}`}
                            className="hover:text-brand-600 transition-colors"
                          >
                            {client.companyName}
                          </Link>
                          {client.legalName && (
                            <div className="text-[10px] text-slate-400 font-normal">
                              {client.legalName}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-slate-700">
                          {client.inn || '—'}
                        </TableCell>
                        <TableCell className="text-xs text-slate-900 font-medium">
                          {client.contactPerson}
                        </TableCell>
                        <TableCell className="text-xs font-mono text-slate-700">
                          {client.contactPhone ? (
                            <a href={`tel:${client.contactPhone}`} className="hover:text-brand-600">
                              {client.contactPhone}
                            </a>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-slate-700">
                          {client.contactEmail ? (
                            <a href={`mailto:${client.contactEmail}`} className="hover:text-brand-600 font-mono text-[11px]">
                              {client.contactEmail}
                            </a>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center text-xs font-bold text-slate-900">
                          {ordersCount}
                        </TableCell>
                        <TableCell className="text-xs text-slate-500 whitespace-nowrap">
                          {formatDateTime(client.createdAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Link href={`/admin/clients/${client.id}`}>
                            <Button variant="outline" size="sm" className="text-xs">
                              Профиль
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
                <span className="font-semibold text-slate-700">{total}</span> клиентов
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-600">
                  Страница <span className="font-semibold text-slate-900">{page}</span> из{' '}
                  <span className="font-semibold text-slate-900">{totalPages}</span>
                </span>
                <div className="flex items-center gap-1.5">
                  {page > 1 ? (
                    <Link href={buildClientsPaginationUrl(page - 1, { search })}>
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
                    <Link href={buildClientsPaginationUrl(page + 1, { search })}>
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
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <h3 className="text-sm font-semibold text-slate-900">
              {search ? 'Клиентов по заданным критериям не найдено' : 'Клиентов пока нет'}
            </h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
              {search
                ? 'Попробуйте изменить поисковый запрос (название компании, ИНН или телефон).'
                : 'Зарегистрированные селлеры отобразятся в этом реестре автоматически.'}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
              {page > 1 && (
                <Link href={buildClientsPaginationUrl(1, { search })}>
                  <Button variant="outline" size="sm">
                    На первую страницу
                  </Button>
                </Link>
              )}
              {search && (
                <Link href="/admin/clients">
                  <Button variant="outline" size="sm">
                    Сбросить поиск
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
