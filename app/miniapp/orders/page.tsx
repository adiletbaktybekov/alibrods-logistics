import * as React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentClientProfile } from '@/app/actions/auth';
import { getClientOrders } from '@/app/actions/orders';
import { MiniAppHeader } from '@/components/miniapp/miniapp-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { Badge } from '@/components/ui/badge';
import { OrderStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

interface MiniAppOrdersPageProps {
  searchParams: Promise<{
    tab?: string;
  }>;
}

export default async function MiniAppOrdersPage({ searchParams }: MiniAppOrdersPageProps) {
  const profile = await getCurrentClientProfile();

  if (!profile?.user) {
    redirect('/miniapp/link');
  }

  const params = await searchParams;
  const currentTab = params.tab || 'all';

  let statusFilter: OrderStatus | undefined;
  if (currentTab === 'processing') {
    statusFilter = OrderStatus.CONFIRMED; // or inProcessing
  }

  const { items } = await getClientOrders(statusFilter);

  // Client-side partition for fast UI tabs
  const filteredItems = items.filter((order) => {
    if (currentTab === 'processing') {
      return (
        order.status !== OrderStatus.COMPLETED &&
        order.status !== OrderStatus.ACCEPTED_BY_MARKETPLACE &&
        order.status !== OrderStatus.CANCELLED &&
        order.status !== OrderStatus.REJECTED_BY_MANAGER
      );
    }
    if (currentTab === 'completed') {
      return (
        order.status === OrderStatus.COMPLETED ||
        order.status === OrderStatus.ACCEPTED_BY_MARKETPLACE
      );
    }
    return true;
  });

  const tabs = [
    { id: 'all', label: 'Все' },
    { id: 'processing', label: 'В обработке' },
    { id: 'completed', label: 'Завершены' },
  ];

  return (
    <div className="space-y-4">
      <MiniAppHeader title="Мои заявки" subtitle={`Найдено: ${filteredItems.length}`} />

      <div className="px-4 space-y-3">
        {/* Filter Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          {tabs.map((tab) => {
            const isActive = currentTab === tab.id;
            return (
              <Link
                key={tab.id}
                href={tab.id === 'all' ? '/miniapp/orders' : `/miniapp/orders?tab=${tab.id}`}
                className={`py-1.5 px-3 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
                  isActive
                    ? 'bg-brand-600 text-white shadow-xs'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>

        {/* Orders List */}
        {filteredItems.length > 0 ? (
          <div className="space-y-2.5">
            {filteredItems.map((order) => {
              const wh = order.warehouse;
              const dateStr = order.scheduledPickupAt
                ? new Date(order.scheduledPickupAt).toLocaleDateString('ru-RU', {
                    day: 'numeric',
                    month: 'short',
                  })
                : 'не указана';

              return (
                <Link
                  key={order.id}
                  href={`/miniapp/orders/${order.id}`}
                  className="block rounded-2xl border border-slate-200 bg-white p-4 shadow-xs active:scale-99 transition-all hover:border-brand-300"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-xs font-bold text-slate-900">
                      {order.orderNumber}
                    </span>
                    <StatusBadge status={order.status} className="text-[10px] px-2 py-0.5" />
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-700 pt-1 border-t border-slate-100">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-slate-900">{wh?.name || 'Склад'}</span>
                      {wh?.marketplace && (
                        <Badge variant="outline" className="text-[9px] px-1 py-0">
                          {wh.marketplace === 'WILDBERRIES' ? 'WB' : wh.marketplace}
                        </Badge>
                      )}
                    </div>
                    <span className="text-[11px] text-slate-500">Доставка: {dateStr}</span>
                  </div>

                  <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500 bg-slate-50 px-2.5 py-1.5 rounded-lg">
                    <span>
                      {order.totalPalletsCount > 0 ? (
                        <strong className="text-indigo-600 font-semibold">{order.totalPalletsCount} палл.</strong>
                      ) : (
                        <span>{order.totalBoxesCount} кор.</span>
                      )}
                    </span>
                    <span className="text-brand-600 font-semibold">Подробнее →</span>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center bg-white space-y-2">
            <div className="text-2xl">🔍</div>
            <h4 className="text-xs font-bold text-slate-800">Заявок не найдено</h4>
            <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
              В выбранной категории нет заявок.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
