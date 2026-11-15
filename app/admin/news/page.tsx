import * as React from 'react';
import { redirect } from 'next/navigation';
import { requireStaffUser } from '@/app/actions/admin';
import { NewsService } from '@/modules/news/news.service';
import { NewsClient } from './news-client';
import { isExpectedAuthError } from '@/lib/errors';

export const dynamic = 'force-dynamic';

export default async function AdminNewsPage() {
  try {
    await requireStaffUser();
  } catch (err: unknown) {
    if (isExpectedAuthError(err)) {
      redirect('/login');
    }
  }

  const news = await NewsService.listAdmin();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Новости для клиентов
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Публикация новостей, оповещений и регламентов работы для клиентов в Telegram Client Bot и Mini App
          </p>
        </div>
      </div>

      {/* Safety Notice */}
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 text-xs text-emerald-900 flex items-start gap-3">
        <div className="mt-0.5 text-emerald-600 shrink-0">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div>
          <span className="font-semibold">Адресная доставка селлерам:</span> Новости отправляются исключительно зарегистрированным клиентам через Client Bot. Доставка в менеджерскую группу «Отгрузка» исключена системной фильтрацией.
        </div>
      </div>

      <NewsClient initialNews={news} />
    </div>
  );
}
