import * as React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getDriversListAction } from '@/app/actions/admin';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { DriverModal } from './driver-modal';
import { DriverCodeButton } from './driver-code-button';
import { buildDriversPaginationUrl, calculateDisplayRange } from '@/lib/pagination';
import { PaginatedDriversResult } from '@/modules/drivers/drivers.service';
import { isExpectedAuthError } from '@/lib/errors';

export const dynamic = 'force-dynamic';

interface AdminDriversPageProps {
  searchParams: Promise<{
    search?: string;
    isAvailable?: string;
    isActive?: string;
    page?: string;
  }>;
}

export default async function AdminDriversPage({ searchParams }: AdminDriversPageProps) {
  const params = await searchParams;
  const search = params.search || '';
  const isAvailableParam = params.isAvailable;
  const isActiveParam = params.isActive;
  const rawPage = Number(params.page);
  const requestedPage = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;

  let isAvailable: boolean | undefined = undefined;
  if (isAvailableParam === 'true') isAvailable = true;
  if (isAvailableParam === 'false') isAvailable = false;

  let isActive: boolean | undefined = undefined;
  if (isActiveParam === 'true') isActive = true;
  if (isActiveParam === 'false') isActive = false;

  let result: PaginatedDriversResult = { items: [], total: 0, page: 1, pageSize: 25, totalPages: 1 };
  let fetchError: string | null = null;

  try {
    result = await getDriversListAction({
      search: search || undefined,
      isAvailable,
      isActive,
      page: requestedPage,
      pageSize: 25,
    });
  } catch (err: unknown) {
    if (isExpectedAuthError(err)) {
      redirect('/login');
    }
    fetchError = err instanceof Error ? err.message : 'Не удалось загрузить список водителей';
  }

  const { items, total, page, pageSize, totalPages } = result;
  const { fromRecord, toRecord } = calculateDisplayRange(page, pageSize, items.length, total);

  const hasActiveFilters = Boolean(search || isAvailableParam || isActiveParam);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Водительский состав
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
        <div>
          <DriverModal />
        </div>
      </div>

      {fetchError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800">
          ⚠️ {fetchError}. Пожалуйста, обновите страницу.
        </div>
      )}

      {/* Filter / Search Bar */}
      <Card className="p-4 border-slate-200 bg-white shadow-sm">
        <form method="GET" action="/admin/drivers" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Text Search */}
          <div className="sm:col-span-2">
            <label htmlFor="search" className="block text-xs font-semibold text-slate-700 mb-1">
              Поиск (ФИО, телефон, авто)
            </label>
            <input
              id="search"
              name="search"
              type="text"
              defaultValue={search}
              placeholder="Иванов, +7999..., ГАЗель, В123ВВ..."
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          {/* Availability Filter */}
          <div>
            <label htmlFor="isAvailable" className="block text-xs font-semibold text-slate-700 mb-1">
              Доступность
            </label>
            <select
              id="isAvailable"
              name="isAvailable"
              defaultValue={isAvailableParam || ''}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              <option value="">Все статусы</option>
              <option value="true">Доступен</option>
              <option value="false">На рейсе / Занят</option>
            </select>
          </div>

          {/* Account Activity Filter & Actions */}
          <div>
            <label htmlFor="isActive" className="block text-xs font-semibold text-slate-700 mb-1">
              Активность
            </label>
            <div className="flex gap-2">
              <select
                id="isActive"
                name="isActive"
                defaultValue={isActiveParam || ''}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value="">Все</option>
                <option value="true">Активен</option>
                <option value="false">Заблокирован</option>
              </select>
              <Button type="submit" variant="primary" size="sm" className="px-4">
                Найти
              </Button>
              {hasActiveFilters && (
                <Link href="/admin/drivers">
                  <Button variant="outline" size="sm">
                    Сбросить
                  </Button>
                </Link>
              )}
            </div>
          </div>
        </form>
      </Card>

      {/* Drivers Table */}
      <Card className="border-slate-200 shadow-sm overflow-hidden bg-white">
        {items.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ФИО водителя</TableHead>
                    <TableHead>Телефон</TableHead>
                    <TableHead>Транспорт</TableHead>
                    <TableHead>Статус</TableHead>
                    <TableHead>Telegram</TableHead>
                    <TableHead className="text-center">Рейсов</TableHead>
                    <TableHead>Заметки</TableHead>
                    <TableHead className="text-right">Привязка</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((driver) => {
                    const tg = driver.user?.telegramAccount;
                    const assignmentsCount = driver._count?.assignments ?? 0;

                    return (
                      <TableRow key={driver.id} className="hover:bg-slate-50/80">
                        <TableCell className="font-semibold text-slate-900 text-xs">
                          {driver.fullName}
                        </TableCell>
                        <TableCell className="text-xs font-mono text-slate-700">
                          {driver.user?.phone ? (
                            <a href={`tel:${driver.user.phone}`} className="hover:text-brand-600">
                              {driver.user.phone}
                            </a>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-slate-700">
                          {driver.vehicleModel || driver.vehiclePlateNumber ? (
                            <div>
                              <span className="font-medium text-slate-900">
                                {driver.vehicleModel || 'Автомобиль'}
                              </span>
                              {driver.vehiclePlateNumber && (
                                <span className="ml-1.5 font-mono text-[11px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">
                                  {driver.vehiclePlateNumber}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400 italic">Не указан</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {driver.isAvailable ? (
                            <Badge variant="success" className="text-[10px]">
                              Доступен
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] text-slate-500">
                              На рейсе / Занят
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">
                          {tg ? (
                            <Badge variant="outline" className="text-[10px] border-sky-300 text-sky-700 bg-sky-50">
                              @{tg.username || tg.telegramId}
                            </Badge>
                          ) : (
                            <span className="text-[11px] text-slate-400">Не подключен</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center text-xs font-semibold text-slate-800">
                          {assignmentsCount}
                        </TableCell>
                        <TableCell className="text-xs text-slate-500 max-w-xs truncate">
                          {driver.notes || '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          <DriverCodeButton
                            driverId={driver.id}
                            driverName={driver.fullName}
                            hasTelegram={Boolean(tg)}
                          />
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
                <span className="font-semibold text-slate-700">{total}</span> водителей
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-600">
                  Страница <span className="font-semibold text-slate-900">{page}</span> из{' '}
                  <span className="font-semibold text-slate-900">{totalPages}</span>
                </span>
                <div className="flex items-center gap-1.5">
                  {page > 1 ? (
                    <Link
                      href={buildDriversPaginationUrl(page - 1, {
                        search,
                        isAvailable: isAvailableParam,
                        isActive: isActiveParam,
                      })}
                    >
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
                    <Link
                      href={buildDriversPaginationUrl(page + 1, {
                        search,
                        isAvailable: isAvailableParam,
                        isActive: isActiveParam,
                      })}
                    >
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
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <h3 className="text-sm font-semibold text-slate-900">
              {hasActiveFilters ? 'Водителей по заданным критериям не найдено' : 'В системе пока нет водителей'}
            </h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-4">
              {hasActiveFilters
                ? 'Попробуйте изменить поисковый запрос или сбросить фильтры доступности.'
                : 'Добавьте водителей для распределения и назначения заявок на перевозку.'}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {page > 1 && (
                <Link
                  href={buildDriversPaginationUrl(1, {
                    search,
                    isAvailable: isAvailableParam,
                    isActive: isActiveParam,
                  })}
                >
                  <Button variant="outline" size="sm">
                    На первую страницу
                  </Button>
                </Link>
              )}
              {hasActiveFilters && (
                <Link href="/admin/drivers">
                  <Button variant="outline" size="sm">
                    Сбросить все фильтры
                  </Button>
                </Link>
              )}
              {!hasActiveFilters && <DriverModal />}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
