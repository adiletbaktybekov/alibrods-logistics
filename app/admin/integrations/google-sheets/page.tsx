import * as React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getGoogleSheetsStatusAction } from '@/app/actions/admin';
import { prisma } from '@/database/prisma';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatDateTime } from '@/lib/utils';
import { SyncButton } from './sync-button';
import { SHEET_HEADERS } from '@/integrations/google-sheets/client';
import { OrderStatus, Prisma } from '@prisma/client';
import { isExpectedAuthError } from '@/lib/errors';

export const dynamic = 'force-dynamic';

export default async function GoogleSheetsIntegrationPage() {
  let status;
  try {
    status = await getGoogleSheetsStatusAction();
  } catch (err: unknown) {
    if (isExpectedAuthError(err)) {
      redirect('/login');
    }
    throw err;
  }

  let recentOrders: Array<{
    id: string;
    orderNumber: string;
    status: OrderStatus;
    createdAt: Date;
    scheduledPickupAt: Date | null;
    totalBoxesCount: number;
    totalPalletsCount: number;
    deliveryCostAmount: Prisma.Decimal | number | null;
    currency: string;
    client: { companyName: string };
    warehouse: { name: string; marketplace: string } | null;
  }> = [];

  if (process.env.DATABASE_URL) {
    recentOrders = await prisma.order.findMany({
      take: 15,
      orderBy: { createdAt: 'desc' },
      include: {
        client: { select: { companyName: true } },
        warehouse: { select: { name: true, marketplace: true } },
      },
    });
  }

  const spreadsheetUrl = status.spreadsheetId
    ? `https://docs.google.com/spreadsheets/d/${status.spreadsheetId}/edit`
    : null;

  return (
    <div className="space-y-6">
      {/* Header and Breadcrumb */}
      <div>
        <nav className="flex items-center gap-2 text-xs text-slate-500 mb-2">
          <Link href="/admin" className="hover:text-slate-800">Админ-панель</Link>
          <span>/</span>
          <span className="text-slate-800 font-medium">Интеграции</span>
          <span>/</span>
          <span className="text-slate-800 font-medium">Google Таблицы</span>
        </nav>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Google Таблицы (Бухгалтерия)
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Двусторонняя синхронизация подтверждённых заявок и стоимости доставки с бухгалтерией
            </p>
          </div>
          {spreadsheetUrl && (
            <a
              href={spreadsheetUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-xs transition-colors"
            >
              <span>Открыть Google Таблицу</span>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          )}
        </div>
      </div>

      {/* KPI Status Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-slate-200 shadow-xs bg-white">
          <CardContent className="p-4">
            <span className="text-xs text-slate-500 font-medium block">Статус интеграции</span>
            <div className="mt-2 flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${status.isConfigured ? 'bg-emerald-500' : 'bg-amber-500'}`} />
              <span className="font-bold text-sm text-slate-900">
                {status.isConfigured ? 'Подключено' : 'Ожидает Service Account'}
              </span>
            </div>
            <span className="text-[11px] text-slate-400 mt-1 block">
              {status.isConfigured ? 'OAuth2 JWT активен' : 'Ключи не заданы в .env'}
            </span>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-xs bg-white">
          <CardContent className="p-4">
            <span className="text-xs text-slate-500 font-medium block">Последняя синхронизация</span>
            <div className="mt-2 font-bold text-sm text-slate-900">
              {status.lastSyncAt ? formatDateTime(status.lastSyncAt) : 'Ещё не выполнялась'}
            </div>
            <span className="text-[11px] text-slate-400 mt-1 block">
              {status.lastError ? '⚠️ Зафиксирована ошибка' : 'Ошибок нет'}
            </span>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-xs bg-white">
          <CardContent className="p-4">
            <span className="text-xs text-slate-500 font-medium block">Экспорт в таблицу</span>
            <div className="mt-2 font-bold text-xl text-brand-600">
              {status.totalOrdersSynced || status.lastExportedCount || 0}
            </div>
            <span className="text-[11px] text-slate-400 mt-1 block">
              подтверждённых заявок в Google Sheets
            </span>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-xs bg-white">
          <CardContent className="p-4">
            <span className="text-xs text-slate-500 font-medium block">Импорт стоимостей</span>
            <div className="mt-2 font-bold text-xl text-emerald-600">
              {status.lastImportedCostsCount || 0}
            </div>
            <span className="text-[11px] text-slate-400 mt-1 block">
              стоимостей получено от бухгалтерии
            </span>
          </CardContent>
        </Card>
      </div>

      {/* Manual Sync & Connection Details Card */}
      <Card className="border-slate-200 shadow-sm bg-white">
        <CardHeader className="pb-3 border-b border-slate-100 flex flex-row items-center justify-between">
          <CardTitle className="text-base text-slate-900">Управление синхронизацией</CardTitle>
          <Badge variant="outline" className="text-slate-600 text-xs">
            Лист: {status.sheetName}
          </Badge>
        </CardHeader>
        <CardContent className="pt-4 space-y-4 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <span className="text-slate-500 block font-medium">Сервисный аккаунт (Client Email):</span>
              <p className="mt-1 font-mono text-[11px] text-slate-800 bg-slate-50 p-2 rounded border border-slate-200 break-all">
                {status.serviceAccountEmail || 'Не настроен (GOOGLE_SERVICE_ACCOUNT_EMAIL)'}
              </p>
            </div>
            <div>
              <span className="text-slate-500 block font-medium">Идентификатор таблицы (Spreadsheet ID):</span>
              <p className="mt-1 font-mono text-[11px] text-slate-800 bg-slate-50 p-2 rounded border border-slate-200 break-all">
                {status.spreadsheetId || 'Не настроен (GOOGLE_SHEETS_SPREADSHEET_ID)'}
              </p>
            </div>
          </div>

          <div className="pt-2">
            <SyncButton isConfigured={status.isConfigured} />
          </div>
        </CardContent>
      </Card>

      {/* Accounting Column Architecture Card */}
      <Card className="border-slate-200 shadow-sm bg-white">
        <CardHeader className="pb-3 border-b border-slate-100">
          <CardTitle className="text-sm font-bold text-slate-900">
            Структура колонок Google Sheets (Правила для бухгалтерии)
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4 text-xs space-y-3">
          <p className="text-slate-600">
            Система автоматически выгружает подтверждённые заявки. Сопоставление строк выполняется строго по{' '}
            <span className="font-semibold text-slate-900">ID заявки</span> (Колонка A) или{' '}
            <span className="font-semibold text-slate-900">Номеру заявки</span> (Колонка B).
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 text-[11px]">
            {SHEET_HEADERS.map((header, idx) => (
              <div
                key={header}
                className={`p-2 rounded-lg border ${
                  idx === 11
                    ? 'bg-emerald-50/80 border-emerald-300 text-emerald-950 font-bold ring-1 ring-emerald-400'
                    : 'bg-slate-50 border-slate-200 text-slate-700'
                }`}
              >
                <div className="text-[10px] text-slate-400">Колонка {idx + 1} ({String.fromCharCode(65 + idx)})</div>
                <div>{header}</div>
                {idx === 11 && (
                  <div className="text-[9px] text-emerald-700 font-semibold mt-0.5">
                    ✏️ Редактирует бухгалтер
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-lg text-amber-900 text-[11px] space-y-1">
            <div className="font-bold">⚠️ Правила безопасности:</div>
            <div>• Бухгалтерия вносит стоимость доставки <b>только в колонку №12 («Стоимость доставки»)</b>.</div>
            <div>• PostgreSQL является единственным источником правды: случайные изменения других колонок игнорируются.</div>
            <div>• Принимаются положительные числовые значения в рублях (например: <code>15000</code> или <code>12 500 ₽</code>).</div>
          </div>
        </CardContent>
      </Card>

      {/* Recent Synchronized Orders Table */}
      <Card className="border-slate-200 shadow-sm bg-white">
        <CardHeader className="pb-3 border-b border-slate-100">
          <CardTitle className="text-sm font-bold text-slate-900">
            Заявки и финансовые данные ({recentOrders.length})
          </CardTitle>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider text-[10px] border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-3 font-semibold">№ Заявки</th>
                <th className="py-2.5 px-3 font-semibold">Дата</th>
                <th className="py-2.5 px-3 font-semibold">Клиент</th>
                <th className="py-2.5 px-3 font-semibold">Склад</th>
                <th className="py-2.5 px-3 font-semibold">Мест</th>
                <th className="py-2.5 px-3 font-semibold">Статус</th>
                <th className="py-2.5 px-3 font-semibold text-right">Стоимость доставки</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {recentOrders.length > 0 ? (
                recentOrders.map((o) => (
                  <tr key={o.id} className="hover:bg-slate-50/60">
                    <td className="py-2 px-3 font-mono font-bold text-slate-900">
                      <Link href={`/admin/orders/${o.id}`} className="hover:text-brand-600 hover:underline">
                        {o.orderNumber}
                      </Link>
                    </td>
                    <td className="py-2 px-3 text-[11px] text-slate-500 whitespace-nowrap">
                      {new Date(o.createdAt).toLocaleDateString('ru-RU')}
                    </td>
                    <td className="py-2 px-3 font-medium text-slate-800">
                      {o.client?.companyName || '—'}
                    </td>
                    <td className="py-2 px-3 whitespace-nowrap">
                      {o.warehouse ? `${o.warehouse.name} (${o.warehouse.marketplace})` : '—'}
                    </td>
                    <td className="py-2 px-3 whitespace-nowrap">
                      {o.totalPalletsCount > 0 ? `${o.totalPalletsCount} палл.` : `${o.totalBoxesCount} кор.`}
                    </td>
                    <td className="py-2 px-3">
                      <StatusBadge status={o.status} className="text-[10px]" />
                    </td>
                    <td className="py-2 px-3 text-right font-semibold whitespace-nowrap">
                      {o.deliveryCostAmount != null ? (
                        <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          {Number(o.deliveryCostAmount).toLocaleString()} {o.currency || '₽'}
                        </span>
                      ) : (
                        <span className="text-slate-400 italic text-[11px]">
                          Ожидает расчёта
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-slate-400 text-xs">
                    Заявок пока нет
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
