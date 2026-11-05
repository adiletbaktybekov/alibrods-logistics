import * as React from 'react';
import { getDriversListAction } from '@/app/actions/admin';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { DriverModal } from './driver-modal';

export const dynamic = 'force-dynamic';

export default async function AdminDriversPage() {
  const drivers = await getDriversListAction();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Водительский состав
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Всего водителей в базе: <span className="font-semibold text-slate-800">{drivers.length}</span>
          </p>
        </div>
        <div>
          <DriverModal />
        </div>
      </div>

      {/* Drivers Table */}
      <Card className="border-slate-200 shadow-sm overflow-hidden bg-white">
        {drivers.length > 0 ? (
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {drivers.map((driver) => {
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
                            <span className="font-medium text-slate-900">{driver.vehicleModel || 'Автомобиль'}</span>
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
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <h3 className="text-sm font-semibold text-slate-900">В системе пока нет водителей</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-4">
              Добавьте водителей для распределения и назначения заявок на перевозку.
            </p>
            <DriverModal />
          </div>
        )}
      </Card>
    </div>
  );
}
