import * as React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getAdminOrderDetailAction, getDriversListAction } from '@/app/actions/admin';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge, STATUS_LABELS } from '@/components/ui/status-badge';
import { Badge } from '@/components/ui/badge';
import { formatDateTime } from '@/lib/utils';
import { OrderActions } from './order-actions';
import { PhotoGallery } from '@/components/orders/photo-gallery';

export const dynamic = 'force-dynamic';

interface AdminOrderDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminOrderDetailPage({ params }: AdminOrderDetailPageProps) {
  const { id } = await params;

  let order;
  try {
    order = await getAdminOrderDetailAction(id);
  } catch {
    notFound();
  }

  if (!order) {
    notFound();
  }

  const drivers = await getDriversListAction();
  const currentAssignment = order.assignments?.[0];
  const assignedDriver = currentAssignment?.driver;

  const client = order.client;

  return (
    <div className="space-y-6">
      {/* Breadcrumb & Navigation */}
      <div>
        <div className="flex items-center gap-2 text-xs text-slate-500 mb-2">
          <Link href="/admin/orders" className="hover:text-brand-600 transition-colors">
            Реестр заявок
          </Link>
          <span>/</span>
          <span className="font-mono text-slate-900 font-medium">{order.orderNumber}</span>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold font-mono tracking-tight text-slate-900">
                {order.orderNumber}
              </h1>
              <StatusBadge status={order.status} />
              <Badge variant={order.marketplace === 'WILDBERRIES' ? 'default' : 'warning'}>
                {order.marketplace}
              </Badge>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Создана {formatDateTime(order.createdAt)} • Забор/Доставка: {order.scheduledPickupAt ? formatDateTime(order.scheduledPickupAt) : 'не указана'}
            </p>
          </div>

          <div>
            <Link href="/admin/orders">
              <Button variant="outline" size="sm">
                ← Назад к списку
              </Button>
            </Link>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Client & Cargo Parameters (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Client Information Card */}
          <Card className="border-slate-200 shadow-sm bg-white">
            <CardHeader className="pb-3 border-b border-slate-100 flex flex-row items-center justify-between">
              <CardTitle className="text-base text-slate-900">Информация о клиенте</CardTitle>
              {client?.id && (
                <Link
                  href={`/admin/clients/${client.id}`}
                  className="text-xs font-semibold text-brand-600 hover:text-brand-700"
                >
                  Карточка клиента →
                </Link>
              )}
            </CardHeader>
            <CardContent className="pt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-slate-500 block">Компания:</span>
                <span className="font-semibold text-slate-900 text-sm">
                  {client?.companyName || '—'}
                </span>
                {client?.legalName && (
                  <span className="text-[11px] text-slate-500 block mt-0.5">
                    {client.legalName}
                  </span>
                )}
              </div>

              <div>
                <span className="text-slate-500 block">ИНН:</span>
                <span className="font-mono text-slate-800">
                  {client?.inn || 'Не указан'}
                </span>
              </div>

              <div>
                <span className="text-slate-500 block">Контактное лицо:</span>
                <span className="font-medium text-slate-900">
                  {client?.contactPerson || '—'}
                </span>
              </div>

              <div>
                <span className="text-slate-500 block">Телефон:</span>
                {client?.contactPhone ? (
                  <a
                    href={`tel:${client.contactPhone}`}
                    className="font-mono font-medium text-brand-600 hover:underline"
                  >
                    {client.contactPhone}
                  </a>
                ) : (
                  <span className="text-slate-400">—</span>
                )}
              </div>

              {client?.contactEmail && (
                <div className="sm:col-span-2">
                  <span className="text-slate-500 block">Email:</span>
                  <a
                    href={`mailto:${client.contactEmail}`}
                    className="font-mono text-brand-600 hover:underline"
                  >
                    {client.contactEmail}
                  </a>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Cargo & Destination Details */}
          <Card className="border-slate-200 shadow-sm bg-white">
            <CardHeader className="pb-3 border-b border-slate-100">
              <CardTitle className="text-base text-slate-900">Параметры груза и маршрут</CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-4 text-xs">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div>
                  <span className="text-slate-500 block">Склад назначения:</span>
                  <span className="font-semibold text-slate-900 text-sm">
                    {order.warehouse?.name || '—'}
                  </span>
                  <span className="text-[11px] text-slate-500 block">
                    {order.warehouse?.marketplace}
                  </span>
                </div>

                <div>
                  <span className="text-slate-500 block">Объём партии:</span>
                  <div className="font-semibold text-slate-900 text-sm mt-0.5">
                    {order.totalPalletsCount > 0 ? (
                      <span className="text-indigo-600">{order.totalPalletsCount} палл.</span>
                    ) : (
                      <span>{order.totalBoxesCount} кор.</span>
                    )}
                  </div>
                </div>

                <div>
                  <span className="text-slate-500 block">Стоимость доставки:</span>
                  <span className="font-semibold text-slate-900 text-sm">
                    {order.deliveryCostAmount != null
                      ? `${Number(order.deliveryCostAmount).toLocaleString()} ₽`
                      : 'Не рассчитана'}
                  </span>
                </div>
              </div>

              <div className="border-t border-slate-100 pt-3">
                <span className="text-slate-500 block font-medium mb-1">Адрес забора груза:</span>
                <p className="text-slate-900 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                  {order.pickupCity ? `${order.pickupCity}, ` : ''}{order.pickupAddress}
                </p>
                {(order.pickupContactName || order.pickupContactPhone) && (
                  <div className="mt-1.5 text-[11px] text-slate-600">
                    Контакт на заборе: <span className="font-medium text-slate-800">{order.pickupContactName || '—'}</span>
                    {order.pickupContactPhone && ` • тел: ${order.pickupContactPhone}`}
                  </div>
                )}
              </div>

              {order.clientComment && (
                <div className="border-t border-slate-100 pt-3">
                  <span className="text-slate-500 block font-medium mb-1">Комментарий клиента к заказу:</span>
                  <div className="text-slate-700 bg-amber-50/50 border border-amber-200 rounded-lg p-2.5 text-xs italic">
                    «{order.clientComment}»
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Cargo Breakdown / Boxes Table */}
          {order.items && order.items.length > 0 && (
            <Card className="border-slate-200 shadow-sm bg-white overflow-hidden">
              <CardHeader className="pb-3 border-b border-slate-100">
                <CardTitle className="text-sm font-bold text-slate-900">
                  Спецификация мест ({order.items.length})
                </CardTitle>
              </CardHeader>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider text-[10px] border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3 font-semibold">№</th>
                      <th className="py-2.5 px-3 font-semibold">Штрихкод</th>
                      <th className="py-2.5 px-3 font-semibold">Габариты (Д×Ш×В)</th>
                      <th className="py-2.5 px-3 font-semibold">Вес</th>
                      <th className="py-2.5 px-3 font-semibold">Товар / Описание</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {order.items.map((item, idx) => (
                      <tr key={item.id} className="hover:bg-slate-50/50">
                        <td className="py-2 px-3 font-medium text-slate-900">{item.boxNumber || idx + 1}</td>
                        <td className="py-2 px-3 font-mono text-[11px]">{item.boxBarcode || '—'}</td>
                        <td className="py-2 px-3 whitespace-nowrap">
                          {item.lengthCm && item.widthCm && item.heightCm
                            ? `${item.lengthCm}×${item.widthCm}×${item.heightCm} см`
                            : '—'}
                        </td>
                        <td className="py-2 px-3 whitespace-nowrap">
                          {item.weightKg ? `${item.weightKg} кг` : '—'}
                        </td>
                        <td className="py-2 px-3">
                          {item.productName || item.cargoDescription || item.article || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* Photo Reports */}
          <Card className="border-slate-200 shadow-sm bg-white">
            <CardHeader className="pb-3 border-b border-slate-100 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-bold text-slate-900">
                Фотоотчёты приёмки и сдачи
                {order.photos && order.photos.length > 0 && (
                  <span className="ml-2 text-xs font-normal text-slate-500">
                    ({order.photos.length})
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <PhotoGallery
                orderId={order.id}
                isAdmin={true}
                photos={(order.photos || []).map((p) => ({
                  ...p,
                  uploadedBy: p.uploadedBy
                    ? {
                        fullName:
                          p.uploadedBy.driverProfile?.fullName ||
                          p.uploadedBy.managerProfile?.fullName ||
                          p.uploadedBy.email,
                        email: p.uploadedBy.email,
                      }
                    : null,
                }))}
              />
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Actions, Driver Assignment, Timeline (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Interactive Management Controls */}
          <OrderActions
            orderId={order.id}
            status={order.status}
            initialManagerNotes={order.managerNotes}
            assignedDriverId={assignedDriver?.id}
            drivers={drivers.map((d) => ({
              id: d.id,
              fullName: d.fullName,
              phone: d.user?.phone,
              vehicleModel: d.vehicleModel,
              vehiclePlateNumber: d.vehiclePlateNumber,
            }))}
          />

          {/* Assigned Driver Card */}
          {assignedDriver && (
            <Card className="border-slate-200 shadow-sm bg-white">
              <CardHeader className="pb-3 border-b border-slate-100">
                <CardTitle className="text-sm font-bold text-slate-900">
                  Назначенный водитель
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">ФИО:</span>
                  <span className="font-semibold text-slate-900">{assignedDriver.fullName}</span>
                </div>
                {assignedDriver.vehicleModel && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Автомобиль:</span>
                    <span className="font-medium text-slate-800">
                      {assignedDriver.vehicleModel} {assignedDriver.vehiclePlateNumber ? `(${assignedDriver.vehiclePlateNumber})` : ''}
                    </span>
                  </div>
                )}
                {currentAssignment?.notes && (
                  <div className="border-t border-slate-100 pt-2 text-slate-600">
                    <span className="text-slate-500 block">Инструкция водителю:</span>
                    <p className="italic mt-0.5">{currentAssignment.notes}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Chronological Status History */}
          <Card className="border-slate-200 shadow-sm bg-white">
            <CardHeader className="pb-3 border-b border-slate-100">
              <CardTitle className="text-sm font-bold text-slate-900">
                История изменений статуса
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              {order.statusHistory && order.statusHistory.length > 0 ? (
                <div className="space-y-4">
                  {order.statusHistory.map((h, i) => (
                    <div key={h.id || i} className="flex items-start gap-3 text-xs">
                      <div className="w-2 h-2 rounded-full bg-brand-500 mt-1.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-semibold text-slate-900">
                            {STATUS_LABELS[h.toStatus] || h.toStatus}
                          </span>
                          <span className="text-[10px] text-slate-400 whitespace-nowrap">
                            {formatDateTime(h.createdAt)}
                          </span>
                        </div>
                        {h.fromStatus && (
                          <div className="text-[10px] text-slate-400">
                            Из: {STATUS_LABELS[h.fromStatus] || h.fromStatus}
                          </div>
                        )}
                        {h.comment && (
                          <p className="mt-1 text-slate-600 bg-slate-50 p-2 rounded border border-slate-100">
                            {h.comment}
                          </p>
                        )}
                        {h.changedBy && (
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            Автор: {h.changedBy.role} ({h.changedBy.email || h.changedBy.phone || 'система'})
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400">Нет записей истории</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
