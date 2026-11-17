import * as React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getOrderDetail } from '@/app/actions/orders';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { StatusBadge, STATUS_LABELS } from '@/components/ui/status-badge';
import { Badge } from '@/components/ui/badge';
import { formatDateTime } from '@/lib/utils';
import { formatPhoneNumber } from '@/lib/phone';
import { PhotoGallery } from '@/components/orders/photo-gallery';
import { ClientOrderEditModal } from './client-order-edit-modal';
import { WarehousesService } from '@/modules/warehouses/warehouses.service';

export const dynamic = 'force-dynamic';

interface OrderDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function OrderDetailPage({ params }: OrderDetailPageProps) {
  const { id } = await params;
  const [order, warehouses] = await Promise.all([
    getOrderDetail(id),
    WarehousesService.list(),
  ]);

  if (!order) {
    notFound();
  }

  const assignment = order.assignments?.[0];
  const driver = assignment?.driver;
  const destinations = order.destinations || [];

  const canClientEdit = [
    'CREATED',
    'PENDING_CONFIRMATION',
    'CONFIRMED',
    'ASSIGNED_TO_DRIVER',
  ].includes(order.status);

  return (
    <div className="space-y-6">
      {/* Breadcrumbs */}
      <div>
        <div className="flex items-center gap-2 text-xs text-slate-500 mb-2">
          <Link href="/orders" className="hover:text-brand-600 transition-colors">
            Мои заявки
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
              Создана {formatDateTime(order.createdAt)}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {canClientEdit && (
              <ClientOrderEditModal
                orderId={order.id}
                orderNumber={order.orderNumber}
                initialPickupAddress={order.pickupAddress}
                initialPickupCity={order.pickupCity}
                initialPickupContactName={order.pickupContactName}
                initialPickupContactPhone={order.pickupContactPhone}
                initialClientComment={order.clientComment}
                initialDestinations={order.destinations || []}
                warehouses={warehouses}
                canEdit={canClientEdit}
              />
            )}
            <Link href="/orders">
              <Button variant="outline" size="sm">
                ← Назад к списку
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Order Status Notice */}
      {canClientEdit ? (
        <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-4 text-xs text-blue-900 flex items-start gap-3">
          <div className="mt-0.5 text-blue-600">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <span className="font-semibold">Редактирование доступно:</span> Вы можете изменить склады, даты доставки, количество паллет и коробок, а также адрес забора груза до момента, пока водитель не заберёт груз.
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 text-xs text-slate-700 flex items-start gap-3">
          <div className="mt-0.5 text-slate-500">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m0 0v2m0-2h2m-2 0H8m13 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <span className="font-semibold">Информация:</span> Груз принят к транспортировке или доставлен. Самостоятельное редактирование клиентом заблокировано.
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Destinations, Driver, Pickup & Photos */}
        <div className="lg:col-span-7 space-y-6">
          {/* Assigned Driver Card (if assigned) */}
          {driver && (
            <Card className="border-indigo-200 shadow-sm bg-gradient-to-br from-white to-indigo-50/20 overflow-hidden">
              <CardHeader className="pb-3 border-b border-indigo-100 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <span>🚛 Назначенный водитель</span>
                </CardTitle>
                <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
                  Водитель на рейсе
                </span>
              </CardHeader>
              <CardContent className="pt-4 text-xs space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <span className="text-slate-500 block">ФИО водителя:</span>
                    <span className="font-semibold text-slate-900 text-sm mt-0.5 block">
                      {driver.fullName}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Телефон для связи:</span>
                    {driver.user?.phone ? (
                      <a
                        href={`tel:${driver.user.phone}`}
                        className="font-mono font-semibold text-brand-600 hover:underline text-sm mt-0.5 block"
                      >
                        {formatPhoneNumber(driver.user.phone)}
                      </a>
                    ) : (
                      <span className="text-slate-400 mt-0.5 block">—</span>
                    )}
                  </div>
                  <div>
                    <span className="text-slate-500 block">Автомобиль:</span>
                    <span className="font-medium text-slate-800 mt-0.5 block">
                      {driver.vehicleModel || 'Автомобиль'}
                      {driver.vehiclePlateNumber && (
                        <span className="ml-1.5 font-mono text-[11px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">
                          {driver.vehiclePlateNumber}
                        </span>
                      )}
                    </span>
                  </div>
                </div>

                {(assignment?.notes || driver.notes) && (
                  <div className="border-t border-indigo-100 pt-2 text-slate-600">
                    <span className="text-slate-500 font-medium block">Инструкция / Заметка:</span>
                    <p className="italic mt-0.5 text-xs text-slate-700 bg-white/80 p-2 rounded border border-indigo-100">
                      {assignment?.notes || driver.notes}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Detailed Destinations Breakdown Card */}
          <Card className="border-slate-200 shadow-sm bg-white overflow-hidden">
            <CardHeader className="pb-3 border-b border-slate-100 flex flex-row items-center justify-between">
              <CardTitle className="text-base text-slate-900 flex items-center gap-2">
                <span>Маршрут и склады назначения</span>
                {destinations.length > 1 && (
                  <span className="text-xs font-normal text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200">
                    Складов: {destinations.length}
                  </span>
                )}
              </CardTitle>
              <div className="text-xs font-semibold text-slate-700">
                Итого:{' '}
                <span className="text-indigo-600">
                  {order.totalPalletsCount > 0 && `${order.totalPalletsCount} палл. • `}
                  {order.totalBoxesCount} кор.
                </span>
              </div>
            </CardHeader>
            <CardContent className="pt-4 space-y-4 text-xs">
              {destinations.length > 0 ? (
                <div className="space-y-3">
                  <span className="text-slate-500 font-medium block">
                    {destinations.length > 1 ? 'Точки сдачи / склады назначения:' : 'Склад назначения:'}
                  </span>
                  <div className="space-y-2">
                    {destinations.map((d, idx) => (
                      <div
                        key={d.id || idx}
                        className="p-3 rounded-lg border border-slate-200 bg-slate-50/70 hover:bg-slate-50 transition-colors"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-[10px]">
                              {idx + 1}
                            </span>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-slate-900 text-sm">
                                  {d.isCustomWarehouse
                                    ? d.customWarehouseName || 'Индивидуальный склад'
                                    : d.warehouse?.name || 'Не указан'}
                                </span>
                                {d.isCustomWarehouse ? (
                                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                                    Индивидуальный склад
                                  </span>
                                ) : (
                                  d.warehouse?.marketplace && (
                                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                                      {d.warehouse.marketplace}
                                    </span>
                                  )
                                )}
                              </div>
                              {!d.isCustomWarehouse && d.warehouse?.city && (
                                <span className="text-[11px] text-slate-500 block">
                                  {d.warehouse.city}
                                  {d.warehouse.address ? ` • ${d.warehouse.address}` : ''}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-3 sm:text-right shrink-0">
                            <div>
                              <span className="text-slate-400 block text-[10px] uppercase">
                                Дата сдачи
                              </span>
                              <span className="font-medium text-slate-800 text-xs">
                                {d.deliveryDate ? formatDateTime(d.deliveryDate) : 'Не указана'}
                              </span>
                            </div>
                            <div className="border-l border-slate-200 pl-3">
                              <span className="text-slate-400 block text-[10px] uppercase">
                                Объём партии
                              </span>
                              <span className="font-bold text-slate-900 text-xs">
                                {d.palletsCount > 0 && `${d.palletsCount} палл. / `}
                                {d.boxesCount} кор.
                              </span>
                            </div>
                          </div>
                        </div>

                        {d.comment && (
                          <div className="mt-2 text-[11px] text-slate-600 bg-white/80 p-1.5 rounded border border-slate-200/60 italic">
                            Примечание: {d.comment}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
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
                        <span className="text-indigo-600">
                          {order.totalPalletsCount} палл.
                          {order.totalBoxesCount > 0 && ` / ${order.totalBoxesCount} кор.`}
                        </span>
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
              )}

              {/* Summary Totals Block */}
              <div className="border-t border-slate-100 pt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50/50 p-3 rounded-lg">
                <div>
                  <span className="text-slate-500 text-[11px] block">Всего складов</span>
                  <div className="text-base font-bold text-slate-900 mt-0.5">
                    {destinations.length > 0 ? destinations.length : 1}
                  </div>
                </div>
                <div>
                  <span className="text-slate-500 text-[11px] block">Всего паллет</span>
                  <div className="text-base font-bold text-indigo-700 mt-0.5">
                    {order.totalPalletsCount || 0} шт.
                  </div>
                </div>
                <div>
                  <span className="text-slate-500 text-[11px] block">Всего коробок</span>
                  <div className="text-base font-bold text-slate-900 mt-0.5">
                    {order.totalBoxesCount || 0} шт.
                  </div>
                </div>
                <div>
                  <span className="text-slate-500 text-[11px] block">Стоимость доставки</span>
                  <div className="text-base font-bold text-slate-900 mt-0.5">
                    {order.deliveryCostAmount != null ? (
                      <span className="text-emerald-700">
                        {Number(order.deliveryCostAmount).toLocaleString()} {order.currency || '₽'}
                      </span>
                    ) : (
                      <span className="text-slate-400 font-normal text-xs italic">
                        Рассчитывается
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Pickup Details Card */}
          <Card className="border-slate-200 shadow-sm bg-white">
            <CardHeader className="pb-3 border-b border-slate-100">
              <CardTitle className="text-sm font-bold text-slate-900">
                Адрес и контакт забора груза
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 text-xs space-y-3">
              <div>
                <span className="text-slate-500 block font-medium mb-1">Адрес забора груза:</span>
                <p className="text-slate-900 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                  {order.pickupCity ? `${order.pickupCity}, ` : ''}
                  {order.pickupAddress || 'Адрес не указан'}
                </p>
              </div>

              {(order.pickupContactName || order.pickupContactPhone) && (
                <div className="text-[11px] text-slate-600">
                  Контактное лицо на заборе:{' '}
                  <span className="font-semibold text-slate-900">
                    {order.pickupContactName || '—'}
                  </span>
                  {order.pickupContactPhone && (
                    <span className="ml-1 text-slate-700">
                      • тел: <a href={`tel:${order.pickupContactPhone}`} className="font-mono text-brand-600 hover:underline">{formatPhoneNumber(order.pickupContactPhone)}</a>
                    </span>
                  )}
                </div>
              )}

              {order.clientComment && (
                <div className="border-t border-slate-100 pt-3">
                  <span className="text-slate-500 block font-medium mb-1">
                    Комментарий селлера к заявке:
                  </span>
                  <div className="text-slate-800 bg-amber-50/60 border border-amber-200 rounded-lg p-2.5 text-xs italic">
                    «{order.clientComment}»
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Photo Reports Section */}
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
              <PhotoGallery orderId={order.id} photos={order.photos || []} />
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Status Change History Timeline */}
        <div className="lg:col-span-5 space-y-6">
          <Card className="border-slate-200 shadow-sm bg-white">
            <CardHeader className="pb-3 border-b border-slate-100">
              <CardTitle className="text-sm font-bold text-slate-900">История движения заявки</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              {order.statusHistory && order.statusHistory.length > 0 ? (
                <ol className="relative border-l border-slate-200 ml-3 space-y-6 py-2">
                  {order.statusHistory.map((history, idx) => (
                    <li key={history.id} className="ml-6">
                      <span className="absolute -left-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-white ring-4 ring-white border-2 border-brand-600">
                        <span className="h-2 w-2 rounded-full bg-brand-600" />
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-xs text-slate-900">
                          {STATUS_LABELS[history.toStatus] || history.toStatus}
                        </span>
                        {idx === 0 && (
                          <span className="text-[10px] bg-brand-100 text-brand-800 font-bold px-1.5 py-0.2 rounded">
                            Текущий
                          </span>
                        )}
                      </div>
                      <time className="block text-[11px] text-slate-500 mt-0.5">
                        {formatDateTime(history.createdAt)}
                      </time>
                      {history.comment && (
                        <p className="mt-1 text-xs text-slate-600 bg-slate-50 p-2 rounded border border-slate-100">
                          {history.comment}
                        </p>
                      )}
                    </li>
                  ))}
                </ol>
              ) : (
                <div className="text-center py-6 text-xs text-slate-500">
                  История изменений пока пуста
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
