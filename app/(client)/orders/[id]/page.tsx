import * as React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getOrderDetail } from '@/app/actions/orders';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { StatusBadge, STATUS_LABELS } from '@/components/ui/status-badge';
import { Badge } from '@/components/ui/badge';
import { formatDateTime } from '@/lib/utils';
import { PhotoGallery } from '@/components/orders/photo-gallery';

export const dynamic = 'force-dynamic';

interface OrderDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function OrderDetailPage({ params }: OrderDetailPageProps) {
  const { id } = await params;
  const order = await getOrderDetail(id);

  if (!order) {
    notFound();
  }

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

          <div>
            <Link href="/orders">
              <Button variant="outline" size="sm">
                ← Назад к списку
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Immutable Order Notice */}
      <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4 text-xs text-amber-900 flex items-start gap-3">
        <div className="mt-0.5 text-amber-600">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div>
          <span className="font-semibold">Информация об обработке:</span> Заявка принята логистической службой. Согласно регламенту, клиент не может самостоятельно редактировать или отменять отправленную заявку. Для внесения правок свяжитесь с вашим операционным менеджером.
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Order Parameters */}
        <div className="lg:col-span-7 space-y-6">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-3 border-b border-slate-100">
              <CardTitle className="text-base text-slate-900">Сведения о доставке</CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-4 text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-slate-500">Склад назначения</div>
                  <div className="font-semibold text-slate-900 mt-0.5">
                    {order.destinations && order.destinations.length > 0
                      ? order.destinations.map((d) => d.isCustomWarehouse ? (d.customWarehouseName || 'Инд. склад') : (d.warehouse?.name || 'Склад')).join(', ')
                      : order.warehouse?.name || '—'}
                  </div>
                  {order.warehouse?.address && (
                    <div className="text-xs text-slate-600 mt-1">{order.warehouse.address}</div>
                  )}
                </div>

                <div>
                  <div className="text-xs text-slate-500">Дата доставки</div>
                  <div className="font-semibold text-slate-900 mt-0.5">
                    {order.scheduledPickupAt ? formatDateTime(order.scheduledPickupAt) : 'По согласованию'}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-3 border-t border-slate-100 text-xs">
                <div>
                  <span className="text-slate-500">Количество коробок</span>
                  <div className="text-lg font-bold text-slate-900 mt-0.5">{order.totalBoxesCount} шт.</div>
                </div>
                <div>
                  <span className="text-slate-500">Количество паллет</span>
                  <div className="text-lg font-bold text-slate-900 mt-0.5">{order.totalPalletsCount || 0} шт.</div>
                </div>
                <div>
                  <span className="text-slate-500">Стоимость доставки</span>
                  <div className="text-base font-bold text-slate-900 mt-0.5">
                    {order.deliveryCostAmount != null ? (
                      <span className="text-emerald-700">
                        {Number(order.deliveryCostAmount).toLocaleString()} {order.currency || '₽'}
                      </span>
                    ) : (
                      <span className="text-slate-400 font-normal text-xs italic block mt-1">
                        Рассчитывается
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {order.clientComment && (
                <div className="pt-3 border-t border-slate-100">
                  <div className="text-xs text-slate-500">Комментарий селлера</div>
                  <p className="text-xs text-slate-800 mt-1 italic bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                    «{order.clientComment}»
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Photo Reports Section */}
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-3 border-b border-slate-100 flex flex-row items-center justify-between">
              <CardTitle className="text-base text-slate-900">
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
        <div className="lg:col-span-5">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-3 border-b border-slate-100">
              <CardTitle className="text-base text-slate-900">История движения заявки</CardTitle>
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
