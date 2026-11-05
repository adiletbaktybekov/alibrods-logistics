import * as React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getClientDetailAction } from '@/app/actions/admin';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { formatDateTime } from '@/lib/utils';

export const dynamic = 'force-dynamic';

interface AdminClientDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminClientDetailPage({ params }: AdminClientDetailPageProps) {
  const { id } = await params;

  let client;
  try {
    client = await getClientDetailAction(id);
  } catch {
    notFound();
  }

  if (!client) {
    notFound();
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb & Navigation */}
      <div>
        <div className="flex items-center gap-2 text-xs text-slate-500 mb-2">
          <Link href="/admin/clients" className="hover:text-brand-600 transition-colors">
            База клиентов
          </Link>
          <span>/</span>
          <span className="text-slate-900 font-medium">{client.companyName}</span>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-200">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              {client.companyName}
            </h1>
            <p className="mt-1 text-xs text-slate-500">
              Клиент зарегистрирован {formatDateTime(client.createdAt)}
            </p>
          </div>

          <div>
            <Link href="/admin/clients">
              <Button variant="outline" size="sm">
                ← Назад к списку клиентов
              </Button>
            </Link>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Client Profile Details (4 cols) */}
        <div className="lg:col-span-4 space-y-6">
          <Card className="border-slate-200 shadow-sm bg-white">
            <CardHeader className="pb-3 border-b border-slate-100">
              <CardTitle className="text-sm font-bold text-slate-900">
                Карточка реквизитов
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-3 text-xs">
              <div>
                <span className="text-slate-500 block">Юридическое наименование:</span>
                <span className="font-semibold text-slate-900">
                  {client.legalName || client.companyName}
                </span>
              </div>

              <div>
                <span className="text-slate-500 block">ИНН:</span>
                <span className="font-mono text-slate-900 font-medium">
                  {client.inn || 'Не указан'}
                </span>
              </div>

              {client.kpp && (
                <div>
                  <span className="text-slate-500 block">КПП:</span>
                  <span className="font-mono text-slate-800">{client.kpp}</span>
                </div>
              )}

              {client.ogrn && (
                <div>
                  <span className="text-slate-500 block">ОГРН/ОГРНИП:</span>
                  <span className="font-mono text-slate-800">{client.ogrn}</span>
                </div>
              )}

              <div className="border-t border-slate-100 pt-3">
                <span className="text-slate-500 block">Контактное лицо:</span>
                <span className="font-medium text-slate-900">{client.contactPerson}</span>
              </div>

              <div>
                <span className="text-slate-500 block">Телефон:</span>
                {client.contactPhone ? (
                  <a href={`tel:${client.contactPhone}`} className="text-brand-600 font-mono hover:underline">
                    {client.contactPhone}
                  </a>
                ) : (
                  '—'
                )}
              </div>

              <div>
                <span className="text-slate-500 block">Email:</span>
                {client.contactEmail ? (
                  <a href={`mailto:${client.contactEmail}`} className="text-brand-600 font-mono hover:underline">
                    {client.contactEmail}
                  </a>
                ) : (
                  '—'
                )}
              </div>

              {client.defaultWarehouse && (
                <div className="border-t border-slate-100 pt-3">
                  <span className="text-slate-500 block">Предпочитаемый склад:</span>
                  <span className="font-medium text-slate-900">
                    {client.defaultWarehouse.name} ({client.defaultWarehouse.marketplace})
                  </span>
                </div>
              )}

              {client.notes && (
                <div className="border-t border-slate-100 pt-3">
                  <span className="text-slate-500 block">Заметки о клиенте:</span>
                  <p className="text-slate-700 italic mt-0.5">{client.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Client Orders History (8 cols) */}
        <div className="lg:col-span-8 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900 tracking-tight">
              История заявок клиента ({client.orders?.length || 0})
            </h2>
            <Link
              href={`/admin/orders?search=${encodeURIComponent(client.companyName)}`}
              className="text-xs font-semibold text-brand-600 hover:text-brand-700"
            >
              Фильтровать в реестре →
            </Link>
          </div>

          <Card className="border-slate-200 shadow-sm overflow-hidden bg-white">
            {client.orders && client.orders.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Номер</TableHead>
                      <TableHead>Склад</TableHead>
                      <TableHead>Груз</TableHead>
                      <TableHead>Статус</TableHead>
                      <TableHead>Дата создания</TableHead>
                      <TableHead className="text-right">Действие</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {client.orders.map((order) => (
                      <TableRow key={order.id} className="hover:bg-slate-50/80">
                        <TableCell className="font-mono font-medium text-slate-900">
                          <Link href={`/admin/orders/${order.id}`} className="hover:text-brand-600">
                            {order.orderNumber}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-medium text-slate-900">
                              {order.warehouse?.name || '—'}
                            </span>
                            {order.warehouse?.marketplace && (
                              <Badge variant="outline" className="text-[10px] px-1 py-0">
                                {order.warehouse.marketplace === 'WILDBERRIES' ? 'WB' : order.warehouse.marketplace}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs">
                          {order.totalPalletsCount > 0 ? (
                            <span className="font-semibold text-indigo-700">
                              {order.totalPalletsCount} палл.
                            </span>
                          ) : (
                            <span>{order.totalBoxesCount} кор.</span>
                          )}
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
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="py-12 px-6 text-center text-xs text-slate-500">
                У данного клиента пока нет оформленных заявок.
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
