import * as React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentClientProfile } from '@/app/actions/auth';
import { getClientDashboardStats } from '@/app/actions/orders';
import { MiniAppHeader } from '@/components/miniapp/miniapp-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

export default async function MiniAppDashboardPage() {
  const profile = await getCurrentClientProfile();

  if (!profile?.user) {
    redirect('/miniapp/link');
  }

  const stats = await getClientDashboardStats();
  const companyName = profile.client?.companyName || profile.client?.contactPerson || 'Селлер';

  return (
    <div className="space-y-4">
      <MiniAppHeader title="Личный кабинет" subtitle="Поставки на WB и Ozon" />

      <div className="px-4 space-y-4">
        {/* Welcome & Fast CTA */}
        <div className="rounded-2xl bg-gradient-to-br from-brand-600 to-brand-800 p-5 text-white shadow-sm space-y-3">
          <div>
            <span className="text-[11px] font-medium text-brand-200 uppercase tracking-wider block">
              AliBros Logistics
            </span>
            <h2 className="text-lg font-bold leading-tight mt-0.5">
              Здравствуйте, {companyName}!
            </h2>
            <p className="text-xs text-brand-100 mt-1">
              Управляйте поставками на маркетплейсы прямо в Telegram
            </p>
          </div>
          <div>
            <Link
              href="/miniapp/orders/new"
              className="inline-flex items-center justify-center w-full rounded-xl bg-white text-brand-700 py-2.5 px-4 text-xs font-bold shadow-sm active:scale-98 transition-transform"
            >
              + Оформить поставку
            </Link>
          </div>
        </div>

        {/* 3 KPI Stats */}
        <div className="grid grid-cols-3 gap-2.5">
          <Card className="border-slate-200 bg-white shadow-xs p-3 text-center">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">
              Всего
            </span>
            <div className="text-xl font-extrabold text-slate-900 mt-0.5">
              {stats.total}
            </div>
          </Card>

          <Card className="border-amber-200 bg-amber-50/50 shadow-xs p-3 text-center">
            <span className="text-[10px] font-semibold text-amber-700 uppercase tracking-wider block">
              В рейсе
            </span>
            <div className="text-xl font-extrabold text-amber-600 mt-0.5">
              {stats.inProcessing}
            </div>
          </Card>

          <Card className="border-emerald-200 bg-emerald-50/50 shadow-xs p-3 text-center">
            <span className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wider block">
              Сдано
            </span>
            <div className="text-xl font-extrabold text-emerald-600 mt-0.5">
              {stats.completed}
            </div>
          </Card>
        </div>

        {/* Recent Orders */}
        <div className="space-y-2.5 pt-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">
              Последние заявки
            </h3>
            <Link
              href="/miniapp/orders"
              className="text-xs font-semibold text-brand-600 hover:text-brand-700"
            >
              Все заявки →
            </Link>
          </div>

          {stats.recentOrders && stats.recentOrders.length > 0 ? (
            <div className="space-y-2.5">
              {stats.recentOrders.map((order) => {
                const wh = order.warehouse;
                return (
                  <Link
                    key={order.id}
                    href={`/miniapp/orders/${order.id}`}
                    className="block rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs hover:border-brand-400 active:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-mono text-xs font-bold text-slate-900">
                        {order.orderNumber}
                      </span>
                      <StatusBadge status={order.status} className="text-[9px] px-1.5 py-0" />
                    </div>

                    <div className="flex items-center justify-between text-xs text-slate-600">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-slate-800">{wh?.name || 'Склад'}</span>
                        {wh?.marketplace && (
                          <Badge variant="outline" className="text-[9px] px-1 py-0">
                            {wh.marketplace === 'WILDBERRIES' ? 'WB' : wh.marketplace}
                          </Badge>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {order.totalPalletsCount > 0 ? `${order.totalPalletsCount} палл.` : `${order.totalBoxesCount} кор.`}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center bg-white space-y-2">
              <div className="text-2xl">📦</div>
              <h4 className="text-xs font-bold text-slate-800">У вас пока нет заявок</h4>
              <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
                Создайте первую заявку на доставку товаров на склад Wildberries или Ozon
              </p>
              <div className="pt-2">
                <Link
                  href="/miniapp/orders/new"
                  className="inline-block rounded-lg bg-brand-600 text-white text-xs font-semibold py-2 px-4 shadow-xs"
                >
                  Оформить заявку
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
