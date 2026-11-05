import * as React from 'react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '@/app/actions/auth';
import { getOrderDetail } from '@/app/actions/orders';
import { MiniAppHeader } from '@/components/miniapp/miniapp-header';
import { StatusBadge, STATUS_LABELS } from '@/components/ui/status-badge';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { formatDateTime } from '@/lib/utils';

export const dynamic = 'force-dynamic';

interface MiniAppOrderDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function MiniAppOrderDetailPage({ params }: MiniAppOrderDetailPageProps) {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/miniapp/link');
  }

  const { id } = await params;
  let order;
  try {
    order = await getOrderDetail(id);
  } catch {
    notFound();
  }

  if (!order) {
    notFound();
  }

  return (
    <div className="space-y-4">
      <MiniAppHeader title="Детали заявки" subtitle={order.orderNumber} />

      <div className="px-4 space-y-4">
        {/* Back Link */}
        <div>
          <Link
            href="/miniapp/orders"
            className="text-xs font-semibold text-brand-600 hover:text-brand-700 flex items-center gap-1"
          >
            ← Вернуться к заявкам
          </Link>
        </div>

        {/* Order Card Summary */}
        <Card className="rounded-2xl border-slate-200 bg-white shadow-xs p-4 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <div>
              <span className="font-mono text-sm font-extrabold text-slate-900 block">
                {order.orderNumber}
              </span>
              <span className="text-[10px] text-slate-400">
                {formatDateTime(order.createdAt)}
              </span>
            </div>
            <StatusBadge status={order.status} className="text-[10px]" />
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-[11px] text-slate-400 block">Склад маркетплейса:</span>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="font-bold text-slate-900">{order.warehouse?.name}</span>
                {order.warehouse?.marketplace && (
                  <Badge variant="outline" className="text-[9px] px-1 py-0">
                    {order.warehouse.marketplace === 'WILDBERRIES' ? 'WB' : order.warehouse.marketplace}
                  </Badge>
                )}
              </div>
            </div>

            <div>
              <span className="text-[11px] text-slate-400 block">Дата доставки:</span>
              <span className="font-semibold text-slate-900 mt-0.5 block">
                {order.scheduledPickupAt
                  ? new Date(order.scheduledPickupAt).toLocaleDateString('ru-RU')
                  : 'не указана'}
              </span>
            </div>

            <div>
              <span className="text-[11px] text-slate-400 block">Объём партии:</span>
              <span className="font-bold text-slate-900 mt-0.5 block">
                {order.totalPalletsCount > 0
                  ? `${order.totalPalletsCount} палл. (${order.totalBoxesCount} кор.)`
                  : `${order.totalBoxesCount} кор.`}
              </span>
            </div>

            <div>
              <span className="text-[11px] text-slate-400 block">Стоимость доставки:</span>
              <span className="font-bold text-slate-900 mt-0.5 block">
                {order.deliveryCostAmount != null
                  ? `${Number(order.deliveryCostAmount).toLocaleString()} ₽`
                  : 'Рассчитывается'}
              </span>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 text-xs">
            <span className="text-[11px] text-slate-400 block">Адрес забора:</span>
            <span className="text-slate-800 font-medium block mt-0.5">
              {order.pickupCity ? `${order.pickupCity}, ` : ''}{order.pickupAddress}
            </span>
          </div>

          {order.clientComment && (
            <div className="pt-2 border-t border-slate-100 text-xs">
              <span className="text-[11px] text-slate-400 block">Комментарий:</span>
              <p className="text-slate-700 italic bg-amber-50/50 p-2 rounded-lg border border-amber-200 mt-1">
                «{order.clientComment}»
              </p>
            </div>
          )}
        </Card>

        {/* Status Timeline */}
        <Card className="rounded-2xl border-slate-200 bg-white shadow-xs p-4 space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
            История доставки
          </h3>

          {order.statusHistory && order.statusHistory.length > 0 ? (
            <div className="space-y-3 pt-1">
              {order.statusHistory.map((h, i) => (
                <div key={h.id || i} className="flex items-start gap-2.5 text-xs">
                  <div className="w-2 h-2 rounded-full bg-brand-600 mt-1.5 shrink-0" />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900">
                        {STATUS_LABELS[h.toStatus] || h.toStatus}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {formatDateTime(h.createdAt)}
                      </span>
                    </div>
                    {h.comment && (
                      <p className="text-[11px] text-slate-600 mt-0.5">{h.comment}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400">История изменений пуста</p>
          )}
        </Card>

        {/* Photos if any */}
        {order.photos && order.photos.length > 0 && (
          <Card className="rounded-2xl border-slate-200 bg-white shadow-xs p-4 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Фотоотчёты ({order.photos.length})
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {order.photos.map((p) => (
                <div key={p.id} className="p-2 border border-slate-200 rounded-xl text-center bg-slate-50 text-xs">
                  <div className="font-semibold text-slate-800 text-[11px]">{p.type}</div>
                  <div className="text-[10px] text-slate-400">{formatDateTime(p.createdAt)}</div>
                  <a
                    href={p.photoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1.5 inline-block text-[11px] text-brand-600 font-semibold"
                  >
                    Смотреть ↗
                  </a>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
