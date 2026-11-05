import * as React from 'react';
import { redirect } from 'next/navigation';
import { getCurrentClientProfile } from '@/app/actions/auth';
import { WarehousesService } from '@/modules/warehouses/warehouses.service';
import { MiniAppHeader } from '@/components/miniapp/miniapp-header';
import { MiniAppOrderForm } from '@/components/miniapp/miniapp-order-form';

export const dynamic = 'force-dynamic';

export default async function MiniAppNewOrderPage() {
  const profile = await getCurrentClientProfile();

  if (!profile?.user) {
    redirect('/miniapp/link');
  }

  const warehouses = await WarehousesService.list();

  return (
    <div className="space-y-4">
      <MiniAppHeader title="Новая заявка" subtitle="Оформление доставки" />
      <div className="px-4">
        <MiniAppOrderForm warehouses={warehouses} />
      </div>
    </div>
  );
}
