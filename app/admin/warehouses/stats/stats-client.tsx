'use client';

import * as React from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getWarehouseStatsAction } from '@/app/actions/admin';
import type { WarehouseStatsResult } from '@/modules/orders/orders.dto';

interface StatsClientProps {
  initialStats: WarehouseStatsResult;
  warehousesCatalog: Array<{ id: string; name: string; marketplace: string; city: string }>;
}

export function WarehouseStatsClient({ initialStats, warehousesCatalog }: StatsClientProps) {
  const [stats, setStats] = React.useState<WarehouseStatsResult>(initialStats);
  const [period, setPeriod] = React.useState<string>(initialStats.period || '7d');
  const [fromDate, setFromDate] = React.useState<string>(initialStats.fromDate || '');
  const [toDate, setToDate] = React.useState<string>(initialStats.toDate || '');
  const [selectedWarehouseId, setSelectedWarehouseId] = React.useState<string>('all');
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Period presets
  const periods = [
    { key: 'today', label: 'Сегодня' },
    { key: 'yesterday', label: 'Вчера' },
    { key: '7d', label: '7 дней' },
    { key: '30d', label: '30 дней' },
    { key: 'month', label: 'Этот месяц' },
    { key: 'custom', label: 'Свой период' },
  ];

  async function fetchStats(
    p: string,
    wId: string,
    customFrom?: string,
    customTo?: string
  ) {
    setIsLoading(true);
    setError(null);
    try {
      const res = await getWarehouseStatsAction({
        period: p,
        warehouseId: wId !== 'all' ? wId : undefined,
        fromDate: p === 'custom' ? customFrom : undefined,
        toDate: p === 'custom' ? customTo : undefined,
      });

      if (res.success && res.data) {
        setStats(res.data);
      } else {
        setError(res.error || 'Не удалось загрузить аналитику');
      }
    } catch {
      setError('Ошибка сети при загрузке аналитики');
    } finally {
      setIsLoading(false);
    }
  }

  function handlePeriodChange(newPeriod: string) {
    setPeriod(newPeriod);
    if (newPeriod !== 'custom') {
      fetchStats(newPeriod, selectedWarehouseId);
    }
  }

  function handleWarehouseFilterChange(newWarehouseId: string) {
    setSelectedWarehouseId(newWarehouseId);
    fetchStats(period, newWarehouseId, fromDate, toDate);
  }

  function handleApplyCustomDates(e: React.FormEvent) {
    e.preventDefault();
    fetchStats('custom', selectedWarehouseId, fromDate, toDate);
  }

  const { kpi, warehouses, dailyTrend, marketplaceBreakdown } = stats;

  return (
    <div className="space-y-6">
      {/* Header and navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
            <Link href="/admin/warehouses" className="hover:text-brand-600 transition-colors">
              Склады
            </Link>
            <span>/</span>
            <span className="text-slate-900 font-medium">Аналитика</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Аналитика складов и грузопотока
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            Объёмы поставок по складам Wildberries, Ozon и индивидуальным направлениям
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link href="/admin/warehouses">
            <Button variant="outline" size="sm">
              ← Каталог складов
            </Button>
          </Link>
        </div>
      </div>

      {/* Filter Toolbar */}
      <Card className="border-slate-200 shadow-sm bg-white">
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            {/* Period selector */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-semibold text-slate-500 mr-2">Период:</span>
              {periods.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => handlePeriodChange(item.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    period === item.key
                      ? 'bg-brand-600 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {/* Warehouse Filter */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500 whitespace-nowrap">Склад:</span>
              <select
                value={selectedWarehouseId}
                onChange={(e) => handleWarehouseFilterChange(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-brand-500 focus:outline-none"
              >
                <option value="all">Все склады и направления</option>
                <option value="custom">🏷️ Только индивидуальные склады</option>
                <optgroup label="Каталог складов AliBros">
                  {warehousesCatalog.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({w.marketplace}) — {w.city}
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>
          </div>

          {/* Custom Date Form (only visible when period === 'custom') */}
          {period === 'custom' && (
            <form
              onSubmit={handleApplyCustomDates}
              className="pt-3 border-t border-slate-100 flex flex-wrap items-center gap-3 text-xs"
            >
              <div className="flex items-center gap-2">
                <span className="text-slate-500">С:</span>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="rounded border border-slate-300 px-2 py-1 text-xs"
                  required
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-slate-500">По:</span>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="rounded border border-slate-300 px-2 py-1 text-xs"
                  required
                />
              </div>
              <Button type="submit" variant="primary" size="sm" disabled={isLoading} className="text-xs">
                {isLoading ? 'Загрузка...' : 'Применить'}
              </Button>
            </form>
          )}

          {error && (
            <div className="text-xs text-rose-600 bg-rose-50 border border-rose-200 p-2 rounded">
              {error}
            </div>
          )}
        </CardContent>
      </Card>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card className="border-slate-200 shadow-sm bg-white">
          <CardContent className="p-4">
            <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block">
              Заявок в периоде
            </span>
            <div className="text-2xl font-bold font-mono text-slate-900 mt-1">
              {kpi.totalOrders}
            </div>
            <span className="text-[10px] text-slate-400 mt-0.5 block">
              Уникальных заказов
            </span>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm bg-white">
          <CardContent className="p-4">
            <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block">
              Всего коробок
            </span>
            <div className="text-2xl font-bold font-mono text-indigo-600 mt-1">
              {kpi.totalBoxes.toLocaleString()}
            </div>
            <span className="text-[10px] text-slate-400 mt-0.5 block">
              Коробок отгружено
            </span>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm bg-white">
          <CardContent className="p-4">
            <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block">
              Всего паллет
            </span>
            <div className="text-2xl font-bold font-mono text-brand-600 mt-1">
              {kpi.totalPallets.toLocaleString()}
            </div>
            <span className="text-[10px] text-slate-400 mt-0.5 block">
              Паллет отгружено
            </span>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm bg-white">
          <CardContent className="p-4">
            <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block">
              Сдано на склад
            </span>
            <div className="text-2xl font-bold font-mono text-emerald-600 mt-1">
              {kpi.completedOrders}
            </div>
            <span className="text-[10px] text-slate-400 mt-0.5 block">
              Успешно завершено
            </span>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm bg-white">
          <CardContent className="p-4">
            <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block">
              В доставке
            </span>
            <div className="text-2xl font-bold font-mono text-amber-600 mt-1">
              {kpi.inDeliveryOrders}
            </div>
            <span className="text-[10px] text-slate-400 mt-0.5 block">
              В пути / на этапе забора
            </span>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm bg-white">
          <CardContent className="p-4">
            <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block">
              Точек сдачи
            </span>
            <div className="text-2xl font-bold font-mono text-slate-700 mt-1">
              {kpi.activeDestinations}
            </div>
            <span className="text-[10px] text-slate-400 mt-0.5 block">
              Складских выгрузок
            </span>
          </CardContent>
        </Card>
      </div>

      {/* Marketplace Volume Share Card */}
      <Card className="border-slate-200 shadow-sm bg-white">
        <CardHeader className="pb-3 border-b border-slate-100">
          <CardTitle className="text-sm font-bold text-slate-900">
            Распределение объёма по маркетплейсам
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Wildberries */}
            <div className="p-3 rounded-lg border border-purple-100 bg-purple-50/40">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-purple-900 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-purple-600"></span>
                  Wildberries
                </span>
                <span className="font-mono font-bold text-purple-700">
                  {marketplaceBreakdown.wb.percentage}%
                </span>
              </div>
              <div className="w-full bg-purple-200/60 rounded-full h-2 mt-2">
                <div
                  className="bg-purple-600 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${marketplaceBreakdown.wb.percentage}%` }}
                ></div>
              </div>
              <div className="flex justify-between items-center text-[11px] text-slate-600 mt-2">
                <span>Заявок: {marketplaceBreakdown.wb.orders}</span>
                <span>
                  {marketplaceBreakdown.wb.boxes} кор. • {marketplaceBreakdown.wb.pallets} палл.
                </span>
              </div>
            </div>

            {/* Ozon */}
            <div className="p-3 rounded-lg border border-blue-100 bg-blue-50/40">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-blue-900 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-600"></span>
                  Ozon
                </span>
                <span className="font-mono font-bold text-blue-700">
                  {marketplaceBreakdown.ozon.percentage}%
                </span>
              </div>
              <div className="w-full bg-blue-200/60 rounded-full h-2 mt-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${marketplaceBreakdown.ozon.percentage}%` }}
                ></div>
              </div>
              <div className="flex justify-between items-center text-[11px] text-slate-600 mt-2">
                <span>Заявок: {marketplaceBreakdown.ozon.orders}</span>
                <span>
                  {marketplaceBreakdown.ozon.boxes} кор. • {marketplaceBreakdown.ozon.pallets} палл.
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Warehouse Ranking Table */}
      <Card className="border-slate-200 shadow-sm bg-white overflow-hidden">
        <CardHeader className="pb-3 border-b border-slate-100 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-bold text-slate-900">
            Рейтинг складов по объёму груза ({warehouses.length})
          </CardTitle>
          <span className="text-xs text-slate-400">
            Период: {stats.fromDate} — {stats.toDate}
          </span>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider text-[10px] border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-3 font-semibold text-center w-10">№</th>
                <th className="py-2.5 px-3 font-semibold">Склад / Направление</th>
                <th className="py-2.5 px-3 font-semibold">Город</th>
                <th className="py-2.5 px-3 font-semibold text-right">Заявок</th>
                <th className="py-2.5 px-3 font-semibold text-right">Коробок</th>
                <th className="py-2.5 px-3 font-semibold text-right">Паллет</th>
                <th className="py-2.5 px-4 font-semibold w-40">Доля по коробкам</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {warehouses.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400 text-xs">
                    Нет данных по поставкам за выбранный период
                  </td>
                </tr>
              ) : (
                warehouses.map((w, idx) => (
                  <tr key={w.warehouseId || `custom-${idx}`} className="hover:bg-slate-50/60">
                    <td className="py-3 px-3 font-mono text-center text-slate-400 font-medium">
                      {idx + 1}
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-900 text-sm">
                          {w.warehouseName}
                        </span>
                        {w.isCustom ? (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                            Индивидуальный
                          </span>
                        ) : (
                          <Badge variant={w.marketplace === 'WILDBERRIES' ? 'default' : 'warning'}>
                            {w.marketplace}
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-slate-600">{w.city}</td>
                    <td className="py-3 px-3 text-right font-mono font-medium text-slate-800">
                      {w.ordersCount}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-indigo-600">
                      {w.boxesCount.toLocaleString()}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-brand-600">
                      {w.palletsCount.toLocaleString()}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                          <div
                            className="bg-brand-600 h-1.5 rounded-full"
                            style={{ width: `${Math.min(100, Math.max(w.boxesPercentage, 2))}%` }}
                          ></div>
                        </div>
                        <span className="text-[10px] font-mono text-slate-500 w-8 text-right">
                          {w.boxesPercentage}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Daily Trend Overview */}
      {dailyTrend.length > 0 && (
        <Card className="border-slate-200 shadow-sm bg-white">
          <CardHeader className="pb-3 border-b border-slate-100">
            <CardTitle className="text-sm font-bold text-slate-900">
              Динамика поставок по дням
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 lg:grid-cols-10 gap-2">
              {dailyTrend.map((point) => (
                <div
                  key={point.date}
                  className="p-2 rounded-lg border border-slate-100 bg-slate-50/50 text-center hover:bg-slate-100 transition-colors"
                >
                  <span className="text-[10px] text-slate-400 block font-mono">{point.label}</span>
                  <span className="text-sm font-bold text-slate-900 block mt-0.5">
                    {point.ordersCount} <span className="text-[10px] font-normal text-slate-500">заяв.</span>
                  </span>
                  <div className="mt-1 text-[10px] text-indigo-600 font-mono">
                    {point.boxesCount} кор.
                  </div>
                  {point.palletsCount > 0 && (
                    <div className="text-[10px] text-brand-600 font-mono">
                      {point.palletsCount} палл.
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
