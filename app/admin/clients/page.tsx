import * as React from 'react';
import Link from 'next/link';
import { getClientsListAction } from '@/app/actions/admin';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { formatDateTime } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function AdminClientsPage() {
  const clients = await getClientsListAction();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            База клиентов
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Зарегистрированных партнёров: <span className="font-semibold text-slate-800">{clients.length}</span>
          </p>
        </div>
      </div>

      {/* Clients Table */}
      <Card className="border-slate-200 shadow-sm overflow-hidden bg-white">
        {clients.length > 0 ? (
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
                {clients.map((client) => {
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
        ) : (
          <div className="py-12 px-6 text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <h3 className="text-sm font-semibold text-slate-900">Клиентов пока нет</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
              Зарегистрированные селлеры отобразятся в этом реестре автоматически.
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
