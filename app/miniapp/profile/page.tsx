import * as React from 'react';
import { redirect } from 'next/navigation';
import { getCurrentClientProfile, logoutAction } from '@/app/actions/auth';
import { MiniAppHeader } from '@/components/miniapp/miniapp-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { prisma } from '@/database/prisma';

export const dynamic = 'force-dynamic';

export default async function MiniAppProfilePage() {
  const profile = await getCurrentClientProfile();

  if (!profile?.user) {
    redirect('/miniapp/link');
  }

  const { user, client } = profile;

  // Check Telegram link status
  let tgAccount = null;
  if (process.env.DATABASE_URL) {
    tgAccount = await prisma.telegramAccount.findUnique({
      where: { userId: user.id },
    });
  }

  return (
    <div className="space-y-4">
      <MiniAppHeader title="Профиль" subtitle="Данные селлера" />

      <div className="px-4 space-y-4">
        {/* Company Card */}
        <Card className="rounded-2xl border-slate-200 bg-white shadow-xs p-4 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                {client?.companyName || 'Компания селлера'}
              </h2>
              {client && 'legalName' in client && client.legalName && (
                <span className="text-[11px] text-slate-400 block mt-0.5">
                  {client.legalName}
                </span>
              )}
            </div>
            <Badge variant="outline" className="text-[10px] text-emerald-700 bg-emerald-50 border-emerald-200">
              Клиент
            </Badge>
          </div>

          <div className="space-y-2.5 text-xs">
            <div>
              <span className="text-[11px] text-slate-400 block">ИНН:</span>
              <span className="font-mono font-semibold text-slate-800">
                {client?.inn || 'Не указан'}
              </span>
            </div>

            <div>
              <span className="text-[11px] text-slate-400 block">Контактное лицо:</span>
              <span className="font-medium text-slate-800">
                {client?.contactPerson || '—'}
              </span>
            </div>

            <div>
              <span className="text-[11px] text-slate-400 block">Телефон:</span>
              <span className="font-mono font-medium text-slate-800">
                {client?.contactPhone || user.phone || '—'}
              </span>
            </div>

            <div>
              <span className="text-[11px] text-slate-400 block">Email:</span>
              <span className="font-mono text-slate-800">
                {client?.contactEmail || user.email || '—'}
              </span>
            </div>
          </div>
        </Card>

        {/* Telegram Integration Card */}
        <Card className="rounded-2xl border-slate-200 bg-white shadow-xs p-4 space-y-2.5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
            Интеграция с Telegram
          </h3>

          <div className="flex items-center justify-between pt-1">
            <span className="text-xs text-slate-600">Статус привязки:</span>
            {tgAccount ? (
              <Badge variant="success" className="text-[10px]">
                Подключен (@{tgAccount.username || tgAccount.telegramId.toString()})
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] text-slate-500">
                Активен в сессии Mini App
              </Badge>
            )}
          </div>
          <p className="text-[11px] text-slate-400">
            Уведомления о смене статусов доставки приходят в этот чат автоматически.
          </p>
        </Card>

        {/* Logout */}
        <div className="pt-2">
          <form action={logoutAction}>
            <Button
              type="submit"
              variant="outline"
              size="sm"
              className="w-full text-rose-600 border-rose-200 hover:bg-rose-50 text-xs py-2.5"
            >
              Выйти из аккаунта
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
