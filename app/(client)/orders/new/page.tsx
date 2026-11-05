import * as React from 'react';
import Link from 'next/link';
import { WarehousesService } from '@/modules/warehouses/warehouses.service';
import { OrderForm } from './order-form';

export const dynamic = 'force-dynamic';

export default async function NewOrderPage() {
  const warehouses = await WarehousesService.list();

  return (
    <div className="space-y-6">
      {/* Breadcrumbs & Header */}
      <div>
        <div className="flex items-center gap-2 text-xs text-slate-500 mb-2">
          <Link href="/orders" className="hover:text-brand-600 transition-colors">
            Заявки
          </Link>
          <span>/</span>
          <span className="text-slate-900 font-medium">Новая заявка</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Оформление заявки на доставку
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Заполните параметры груза для экспедирования на распределительный центр маркетплейса
        </p>
      </div>

      <OrderForm warehouses={warehouses} />
    </div>
  );
}
