import * as React from 'react';
import { getCurrentClientProfile } from '@/app/actions/auth';
import { getClientTelegramInfoAction } from '@/app/actions/profile';
import { WarehousesService } from '@/modules/warehouses/warehouses.service';
import { ProfileForm } from './profile-form';
import { ClientTelegramCard } from './telegram-card';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const [profile, warehouses, telegramRes] = await Promise.all([
    getCurrentClientProfile(),
    WarehousesService.list(),
    getClientTelegramInfoAction(),
  ]);

  if (!profile || !profile.client) {
    return <div>Профиль не найден</div>;
  }

  const telegramInfo = telegramRes.data || {
    telegramAccount: null,
    activePairingCode: null,
    botUsername: process.env.TELEGRAM_CLIENT_BOT_USERNAME || 'AliBrosClientBot',
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="pb-2 border-b border-slate-200">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Профиль компании
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Управление реквизитами селлера, контактами и настройками доставки
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Column: Profile Summary Cards & Telegram */}
        <div className="md:col-span-1 space-y-4">
          <Card className="border-slate-200 shadow-sm p-4 text-center">
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-100 text-brand-700 font-bold text-xl mb-3">
              {profile.client.companyName ? profile.client.companyName.substring(0, 2).toUpperCase() : 'AB'}
            </div>
            <h2 className="font-bold text-slate-900 text-base">{profile.client.companyName}</h2>
            <p className="text-xs text-slate-500 mt-0.5">{profile.client.contactPerson}</p>
            <div className="mt-3 flex justify-center">
              <Badge variant="success">Клиент верифицирован</Badge>
            </div>
          </Card>

          <ClientTelegramCard initialInfo={telegramInfo} />
        </div>

        {/* Right Column: Editable Profile Form */}
        <div className="md:col-span-2">
          <ProfileForm client={profile.client} warehouses={warehouses} />
        </div>
      </div>
    </div>
  );
}
