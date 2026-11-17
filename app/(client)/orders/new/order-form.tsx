'use client';

import * as React from 'react';
import Link from 'next/link';
import { useActionState } from 'react';
import { createOrderAction } from '@/app/actions/orders';
import {
  WarehouseItem,
  isWarehouseOpenOnDate,
  getDayOfWeekFromDate,
  RUSSIAN_DAY_NAMES,
} from '@/modules/warehouses/warehouses.types';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface DestinationRow {
  id: string;
  warehouseId: string;
  marketplace: 'WILDBERRIES' | 'OZON';
  isCustomWarehouse: boolean;
  customWarehouseName: string;
  deliveryDate: string;
  palletsCount: number;
  boxesCount: number;
  comment: string;
}

interface OrderFormProps {
  warehouses: WarehouseItem[];
}

export function OrderForm({ warehouses }: OrderFormProps) {
  const [state, formAction, isPending] = useActionState(createOrderAction, null);

  // Default to tomorrow's date
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const minDateString = tomorrow.toISOString().split('T')[0];

  const [idempotencyKey] = React.useState<string>(() => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return `ik-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  });

  const wbWarehouses = React.useMemo(
    () => warehouses.filter((w) => w.marketplace === 'WILDBERRIES'),
    [warehouses]
  );
  const ozonWarehouses = React.useMemo(
    () => warehouses.filter((w) => w.marketplace === 'OZON'),
    [warehouses]
  );

  // Search filter states
  const [wbSearch, setWbSearch] = React.useState('');
  const [ozonSearch, setOzonSearch] = React.useState('');

  const filteredWbWarehouses = React.useMemo(() => {
    if (!wbSearch.trim()) return wbWarehouses;
    const q = wbSearch.toLowerCase();
    return wbWarehouses.filter(
      (w) => w.name.toLowerCase().includes(q) || Boolean(w.city?.toLowerCase().includes(q))
    );
  }, [wbWarehouses, wbSearch]);

  const filteredOzonWarehouses = React.useMemo(() => {
    if (!ozonSearch.trim()) return ozonWarehouses;
    const q = ozonSearch.toLowerCase();
    return ozonWarehouses.filter(
      (w) => w.name.toLowerCase().includes(q) || Boolean(w.city?.toLowerCase().includes(q))
    );
  }, [ozonWarehouses, ozonSearch]);

  // Initial destination defaults to first WB warehouse
  const initialWh = wbWarehouses[0] || warehouses[0];
  const [destinations, setDestinations] = React.useState<DestinationRow[]>([
    {
      id: 'dest-1',
      warehouseId: initialWh?.id || '',
      marketplace: (initialWh?.marketplace as 'WILDBERRIES' | 'OZON') || 'WILDBERRIES',
      isCustomWarehouse: false,
      customWarehouseName: '',
      deliveryDate: minDateString,
      palletsCount: 0,
      boxesCount: 0,
      comment: '',
    },
  ]);

  const [clientComment, setClientComment] = React.useState('');

  // Add destination to a specific marketplace
  const handleAddDestination = (
    marketplace: 'WILDBERRIES' | 'OZON',
    warehouseId?: string,
    isCustom = false
  ) => {
    const list = marketplace === 'WILDBERRIES' ? wbWarehouses : ozonWarehouses;
    const chosenWhId = warehouseId || list[0]?.id || '';
    setDestinations((prev) => [
      ...prev,
      {
        id: `dest-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        warehouseId: isCustom ? '' : chosenWhId,
        marketplace,
        isCustomWarehouse: isCustom,
        customWarehouseName: '',
        deliveryDate: minDateString,
        palletsCount: 0,
        boxesCount: 0,
        comment: '',
      },
    ]);
  };

  // Remove destination
  const handleRemoveDestination = (id: string) => {
    if (destinations.length <= 1) return;
    setDestinations((prev) => prev.filter((d) => d.id !== id));
  };

  // Update field in destination
  const updateDestination = <K extends keyof DestinationRow>(
    id: string,
    key: K,
    val: DestinationRow[K]
  ) => {
    setDestinations((prev) =>
      prev.map((d) => {
        if (d.id !== id) return d;
        const updated = { ...d, [key]: val };
        // If changing warehouseId, update marketplace to match warehouse
        if (key === 'warehouseId' && typeof val === 'string') {
          const wh = warehouses.find((w) => w.id === val);
          if (wh) {
            updated.marketplace = wh.marketplace as 'WILDBERRIES' | 'OZON';
          }
        }
        return updated;
      })
    );
  };

  // Calculations for total summary
  const totalPallets = destinations.reduce((sum, d) => sum + (Number(d.palletsCount) || 0), 0);
  const totalBoxes = destinations.reduce((sum, d) => sum + (Number(d.boxesCount) || 0), 0);

  // JSON payload serialized for backend action
  const destinationsPayload = React.useMemo(() => {
    return JSON.stringify(
      destinations.map((d) => ({
        warehouseId: d.isCustomWarehouse ? null : d.warehouseId || null,
        isCustomWarehouse: Boolean(d.isCustomWarehouse),
        customWarehouseName: d.isCustomWarehouse ? d.customWarehouseName.trim() : null,
        deliveryDate: d.deliveryDate,
        palletsCount: Number(d.palletsCount) || 0,
        boxesCount: Number(d.boxesCount) || 0,
        comment: d.comment ? d.comment.trim() : null,
      }))
    );
  }, [destinations]);

  // Primary warehouse and date for legacy fallback
  const firstDest = destinations[0];

  const wbDestinations = destinations.filter((d) => d.marketplace === 'WILDBERRIES');
  const ozonDestinations = destinations.filter((d) => d.marketplace === 'OZON');

  return (
    <form action={formAction} className="grid grid-cols-1 lg:grid-cols-12 gap-8">
      {/* Hidden Fields for Server Action */}
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <input type="hidden" name="destinations" value={destinationsPayload} />
      {/* Legacy fallback inputs */}
      <input type="hidden" name="warehouseId" value={firstDest?.warehouseId || ''} />
      <input type="hidden" name="deliveryDate" value={firstDest?.deliveryDate || minDateString} />
      <input type="hidden" name="totalPalletsCount" value={String(totalPallets)} />
      <input type="hidden" name="totalBoxesCount" value={String(totalBoxes)} />

      {/* Main Form Fields */}
      <div className="lg:col-span-8 space-y-6">
        {state?.error && (
          <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-sm font-medium text-red-700">
            {state.error}
          </div>
        )}

        {/* SECTION 1: WILDBERRIES WAREHOUSES */}
        <div className="rounded-2xl border-2 border-purple-200 bg-gradient-to-b from-purple-50/40 to-white p-5 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-purple-100">
            <div className="flex items-center gap-2.5">
              <span className="px-3 py-1 rounded-lg bg-[#cb11ab] text-white font-extrabold text-xs shadow-xs tracking-wide">
                WILDBERRIES
              </span>
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Склады назначения Wildberries
                </h2>
                <p className="text-xs text-slate-500">
                  Поставки на сортировочные центры и склады WB
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleAddDestination('WILDBERRIES')}
                className="border-purple-300 text-purple-700 hover:bg-purple-50 text-xs font-semibold"
              >
                + Добавить склад WB
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => handleAddDestination('WILDBERRIES', undefined, true)}
                className="text-purple-600 hover:bg-purple-100/60 text-xs"
              >
                + Инд. склад
              </Button>
            </div>
          </div>

          {/* Quick Search WB Warehouses */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={wbSearch}
              onChange={(e) => setWbSearch(e.target.value)}
              placeholder="🔍 Быстрый поиск по складам Wildberries (Коледино, Электросталь, Казань...)"
              className="w-full rounded-lg border border-purple-200 bg-white px-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
            />
            {wbSearch && (
              <button
                type="button"
                onClick={() => setWbSearch('')}
                className="text-xs text-slate-400 hover:text-slate-600 px-2"
              >
                ✕
              </button>
            )}
          </div>

          {/* WB Destinations List */}
          {wbDestinations.length > 0 ? (
            <div className="space-y-4">
              {wbDestinations.map((dest, idx) => {
                const wh = warehouses.find((w) => w.id === dest.warehouseId);
                const dayNum = getDayOfWeekFromDate(dest.deliveryDate);
                const dayName = RUSSIAN_DAY_NAMES[dayNum] || '';
                const isOpen = wh && !dest.isCustomWarehouse ? isWarehouseOpenOnDate(wh, dest.deliveryDate) : true;

                return (
                  <Card key={dest.id} className="border-purple-100 shadow-xs p-4 space-y-3 bg-white relative">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-purple-100 text-purple-800 font-bold text-xs flex items-center justify-center">
                          {idx + 1}
                        </span>
                        <span className="text-xs font-bold text-slate-900">
                          {dest.isCustomWarehouse
                            ? 'Индивидуальный склад WB'
                            : wh?.name || 'Склад Wildberries'}
                        </span>
                      </div>

                      {destinations.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveDestination(dest.id)}
                          className="text-xs text-rose-600 hover:text-rose-800 font-medium"
                        >
                          ✕ Удалить
                        </button>
                      )}
                    </div>

                    {/* Custom Warehouse Toggle */}
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id={`custom-${dest.id}`}
                        checked={dest.isCustomWarehouse}
                        onChange={(e) => updateDestination(dest.id, 'isCustomWarehouse', e.target.checked)}
                        className="rounded border-slate-300 text-purple-600 focus:ring-purple-500 w-4 h-4"
                      />
                      <label htmlFor={`custom-${dest.id}`} className="text-xs text-slate-700 font-medium cursor-pointer">
                        Индивидуальный склад (нет в каталоге)
                      </label>
                    </div>

                    {dest.isCustomWarehouse ? (
                      <div>
                        <Label htmlFor={`customName-${dest.id}`} required className="text-xs">
                          Название индивидуального склада WB
                        </Label>
                        <Input
                          id={`customName-${dest.id}`}
                          type="text"
                          placeholder="Например: WB Крёкшино транзит или склад поставщика"
                          value={dest.customWarehouseName}
                          onChange={(e) => updateDestination(dest.id, 'customWarehouseName', e.target.value)}
                          required={dest.isCustomWarehouse}
                          className="mt-1 text-xs"
                        />
                      </div>
                    ) : (
                      <div>
                        <Label htmlFor={`wh-${dest.id}`} required className="text-xs">
                          Выберите склад Wildberries
                        </Label>
                        <select
                          id={`wh-${dest.id}`}
                          value={dest.warehouseId}
                          onChange={(e) => updateDestination(dest.id, 'warehouseId', e.target.value)}
                          className="w-full mt-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                        >
                          {filteredWbWarehouses.map((w) => (
                            <option key={w.id} value={w.id}>
                              {w.name} {w.city ? `(${w.city})` : ''} — {w.scheduleDescription}
                            </option>
                          ))}
                        </select>
                        {wh && !isOpen && (
                          <div className="mt-2 p-2 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-900">
                            ℹ️ Склад «{wh.name}» работает: {wh.scheduleDescription}. Заявка будет согласована индивидуально.
                          </div>
                        )}
                      </div>
                    )}

                    {/* Delivery Date */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <Label htmlFor={`date-${dest.id}`} required className="text-xs">
                          Дата доставки на склад WB
                        </Label>
                        {dayName && (
                          <span className="text-[11px] font-semibold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-200">
                            {dayName}
                          </span>
                        )}
                      </div>
                      <Input
                        id={`date-${dest.id}`}
                        type="date"
                        min={minDateString}
                        value={dest.deliveryDate}
                        onChange={(e) => updateDestination(dest.id, 'deliveryDate', e.target.value)}
                        required
                        className="text-xs"
                      />
                    </div>

                    {/* Cargo Quantities: PALLETS FIRST, THEN BOXES */}
                    <div className="grid grid-cols-2 gap-4 pt-1">
                      <div>
                        <Label htmlFor={`pallets-${dest.id}`} required className="text-xs font-semibold text-slate-900">
                          Паллеты (шт.)
                        </Label>
                        <Input
                          id={`pallets-${dest.id}`}
                          type="number"
                          min="0"
                          value={dest.palletsCount}
                          onChange={(e) => updateDestination(dest.id, 'palletsCount', Math.max(0, parseInt(e.target.value, 10) || 0))}
                          required
                          className="mt-1 text-xs font-semibold"
                        />
                      </div>
                      <div>
                        <Label htmlFor={`boxes-${dest.id}`} required className="text-xs font-semibold text-slate-900">
                          Коробки (шт.)
                        </Label>
                        <Input
                          id={`boxes-${dest.id}`}
                          type="number"
                          min="0"
                          value={dest.boxesCount}
                          onChange={(e) => updateDestination(dest.id, 'boxesCount', Math.max(0, parseInt(e.target.value, 10) || 0))}
                          required
                          className="mt-1 text-xs font-semibold"
                        />
                      </div>
                    </div>

                    {/* Destination Comment */}
                    <div>
                      <Label htmlFor={`comm-${dest.id}`} className="text-xs text-slate-600">
                        Примечание по данному складу (необязательно)
                      </Label>
                      <input
                        id={`comm-${dest.id}`}
                        type="text"
                        placeholder="Особые ворота, транзит, время..."
                        value={dest.comment}
                        onChange={(e) => updateDestination(dest.id, 'comment', e.target.value)}
                        className="w-full mt-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-purple-500 focus:outline-none"
                      />
                    </div>
                  </Card>
                );
              })}
            </div>
          ) : (
            <div className="p-6 text-center rounded-xl bg-purple-50/50 border border-dashed border-purple-200">
              <p className="text-xs text-purple-900 font-medium">
                В этой заявке пока нет складов Wildberries.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleAddDestination('WILDBERRIES')}
                className="mt-2 text-xs border-purple-300 text-purple-700 hover:bg-purple-100"
              >
                + Добавить склад Wildberries
              </Button>
            </div>
          )}
        </div>

        {/* SECTION 2: OZON WAREHOUSES */}
        <div className="rounded-2xl border-2 border-blue-200 bg-gradient-to-b from-blue-50/40 to-white p-5 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-blue-100">
            <div className="flex items-center gap-2.5">
              <span className="px-3 py-1 rounded-lg bg-[#005bff] text-white font-extrabold text-xs shadow-xs tracking-wide">
                OZON
              </span>
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Склады назначения Ozon
                </h2>
                <p className="text-xs text-slate-500">
                  Поставки на фулфилмент-центры и хабы Ozon
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleAddDestination('OZON')}
                className="border-blue-300 text-blue-700 hover:bg-blue-50 text-xs font-semibold"
              >
                + Добавить склад Ozon
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => handleAddDestination('OZON', undefined, true)}
                className="text-blue-600 hover:bg-blue-100/60 text-xs"
              >
                + Инд. склад
              </Button>
            </div>
          </div>

          {/* Quick Search Ozon Warehouses */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={ozonSearch}
              onChange={(e) => setOzonSearch(e.target.value)}
              placeholder="🔍 Быстрый поиск по складам Ozon (Хоругвино, Грибки, Новая Рига, Тверь...)"
              className="w-full rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            {ozonSearch && (
              <button
                type="button"
                onClick={() => setOzonSearch('')}
                className="text-xs text-slate-400 hover:text-slate-600 px-2"
              >
                ✕
              </button>
            )}
          </div>

          {/* Ozon Destinations List */}
          {ozonDestinations.length > 0 ? (
            <div className="space-y-4">
              {ozonDestinations.map((dest, idx) => {
                const wh = warehouses.find((w) => w.id === dest.warehouseId);
                const dayNum = getDayOfWeekFromDate(dest.deliveryDate);
                const dayName = RUSSIAN_DAY_NAMES[dayNum] || '';
                const isOpen = wh && !dest.isCustomWarehouse ? isWarehouseOpenOnDate(wh, dest.deliveryDate) : true;

                return (
                  <Card key={dest.id} className="border-blue-100 shadow-xs p-4 space-y-3 bg-white relative">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-800 font-bold text-xs flex items-center justify-center">
                          {idx + 1}
                        </span>
                        <span className="text-xs font-bold text-slate-900">
                          {dest.isCustomWarehouse
                            ? 'Индивидуальный склад Ozon'
                            : wh?.name || 'Склад Ozon'}
                        </span>
                      </div>

                      {destinations.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveDestination(dest.id)}
                          className="text-xs text-rose-600 hover:text-rose-800 font-medium"
                        >
                          ✕ Удалить
                        </button>
                      )}
                    </div>

                    {/* Custom Warehouse Toggle */}
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id={`custom-${dest.id}`}
                        checked={dest.isCustomWarehouse}
                        onChange={(e) => updateDestination(dest.id, 'isCustomWarehouse', e.target.checked)}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4"
                      />
                      <label htmlFor={`custom-${dest.id}`} className="text-xs text-slate-700 font-medium cursor-pointer">
                        Индивидуальный склад (нет в каталоге)
                      </label>
                    </div>

                    {dest.isCustomWarehouse ? (
                      <div>
                        <Label htmlFor={`customName-${dest.id}`} required className="text-xs">
                          Название индивидуального склада Ozon
                        </Label>
                        <Input
                          id={`customName-${dest.id}`}
                          type="text"
                          placeholder="Например: Ozon Тверь РФЦ или сторонний кросс-док"
                          value={dest.customWarehouseName}
                          onChange={(e) => updateDestination(dest.id, 'customWarehouseName', e.target.value)}
                          required={dest.isCustomWarehouse}
                          className="mt-1 text-xs"
                        />
                      </div>
                    ) : (
                      <div>
                        <Label htmlFor={`wh-${dest.id}`} required className="text-xs">
                          Выберите склад Ozon
                        </Label>
                        <select
                          id={`wh-${dest.id}`}
                          value={dest.warehouseId}
                          onChange={(e) => updateDestination(dest.id, 'warehouseId', e.target.value)}
                          className="w-full mt-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        >
                          {filteredOzonWarehouses.map((w) => (
                            <option key={w.id} value={w.id}>
                              {w.name} {w.city ? `(${w.city})` : ''} — {w.scheduleDescription}
                            </option>
                          ))}
                        </select>
                        {wh && !isOpen && (
                          <div className="mt-2 p-2 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-900">
                            ℹ️ Склад «{wh.name}» работает: {wh.scheduleDescription}. Заявка будет согласована индивидуально.
                          </div>
                        )}
                      </div>
                    )}

                    {/* Delivery Date */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <Label htmlFor={`date-${dest.id}`} required className="text-xs">
                          Дата доставки на склад Ozon
                        </Label>
                        {dayName && (
                          <span className="text-[11px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                            {dayName}
                          </span>
                        )}
                      </div>
                      <Input
                        id={`date-${dest.id}`}
                        type="date"
                        min={minDateString}
                        value={dest.deliveryDate}
                        onChange={(e) => updateDestination(dest.id, 'deliveryDate', e.target.value)}
                        required
                        className="text-xs"
                      />
                    </div>

                    {/* Cargo Quantities: PALLETS FIRST, THEN BOXES */}
                    <div className="grid grid-cols-2 gap-4 pt-1">
                      <div>
                        <Label htmlFor={`pallets-${dest.id}`} required className="text-xs font-semibold text-slate-900">
                          Паллеты (шт.)
                        </Label>
                        <Input
                          id={`pallets-${dest.id}`}
                          type="number"
                          min="0"
                          value={dest.palletsCount}
                          onChange={(e) => updateDestination(dest.id, 'palletsCount', Math.max(0, parseInt(e.target.value, 10) || 0))}
                          required
                          className="mt-1 text-xs font-semibold"
                        />
                      </div>
                      <div>
                        <Label htmlFor={`boxes-${dest.id}`} required className="text-xs font-semibold text-slate-900">
                          Коробки (шт.)
                        </Label>
                        <Input
                          id={`boxes-${dest.id}`}
                          type="number"
                          min="0"
                          value={dest.boxesCount}
                          onChange={(e) => updateDestination(dest.id, 'boxesCount', Math.max(0, parseInt(e.target.value, 10) || 0))}
                          required
                          className="mt-1 text-xs font-semibold"
                        />
                      </div>
                    </div>

                    {/* Destination Comment */}
                    <div>
                      <Label htmlFor={`comm-${dest.id}`} className="text-xs text-slate-600">
                        Примечание по данному складу (необязательно)
                      </Label>
                      <input
                        id={`comm-${dest.id}`}
                        type="text"
                        placeholder="Особые ворота, тайм-слот..."
                        value={dest.comment}
                        onChange={(e) => updateDestination(dest.id, 'comment', e.target.value)}
                        className="w-full mt-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                  </Card>
                );
              })}
            </div>
          ) : (
            <div className="p-6 text-center rounded-xl bg-blue-50/50 border border-dashed border-blue-200">
              <p className="text-xs text-blue-900 font-medium">
                В этой заявке пока нет складов Ozon.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleAddDestination('OZON')}
                className="mt-2 text-xs border-blue-300 text-blue-700 hover:bg-blue-100"
              >
                + Добавить склад Ozon
              </Button>
            </div>
          )}
        </div>

        {/* Global Client Comment */}
        <Card className="border-slate-200 shadow-sm p-5 space-y-2">
          <Label htmlFor="clientComment">
            Общий комментарий к заявке (необязательно)
          </Label>
          <Textarea
            id="clientComment"
            name="clientComment"
            value={clientComment}
            onChange={(e) => setClientComment(e.target.value)}
            placeholder="Дополнительные пожелания или примечания для логистов и водителя..."
            rows={3}
          />
        </Card>

        {/* Submit Actions */}
        <div className="flex items-center justify-between gap-4 pt-2">
          <Link href="/orders">
            <Button type="button" variant="outline">
              Отмена
            </Button>
          </Link>
          <Button
            type="submit"
            variant="primary"
            size="lg"
            isLoading={isPending}
            disabled={isPending || (totalBoxes === 0 && totalPallets === 0)}
            className="shadow-sm"
          >
            Отправить заявку ({totalPallets} палл. • {totalBoxes} кор.)
          </Button>
        </div>
      </div>

      {/* Side Summary Card */}
      <div className="lg:col-span-4">
        <div className="sticky top-24 space-y-4">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-3 border-b border-slate-100">
              <CardTitle className="text-base text-slate-900">Итоговые параметры</CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-4 text-xs">
              <div>
                <span className="text-slate-500">Складов в заявке:</span>
                <div className="text-base font-bold text-slate-900 mt-0.5">
                  {destinations.length} {destinations.length === 1 ? 'направление' : 'направления'}
                </div>
              </div>

              <div>
                <span className="text-slate-500">Склады назначения:</span>
                <div className="space-y-1.5 mt-1">
                  {destinations.map((d, idx) => {
                    const wh = warehouses.find((w) => w.id === d.warehouseId);
                    const name = d.isCustomWarehouse
                      ? d.customWarehouseName || 'Инд. склад'
                      : wh?.name || '—';
                    return (
                      <div key={d.id} className="p-2 rounded bg-slate-50 border border-slate-100 flex items-center justify-between">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${d.marketplace === 'WILDBERRIES' ? 'bg-[#cb11ab]' : 'bg-[#005bff]'}`} />
                          <span className="font-medium text-slate-800 truncate">
                            {idx + 1}. {name}
                          </span>
                        </div>
                        <span className="font-mono text-slate-600 shrink-0 ml-2">
                          {d.palletsCount > 0 ? `${d.palletsCount} палл.` : ''}
                          {d.palletsCount > 0 && d.boxesCount > 0 ? ' • ' : ''}
                          {d.boxesCount > 0 || d.palletsCount === 0 ? `${d.boxesCount} кор.` : ''}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Strict Pallets first, then Boxes */}
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
                <div>
                  <span className="text-slate-500">Всего паллет:</span>
                  <div className="text-xl font-bold font-mono text-indigo-600 mt-0.5">
                    {totalPallets} шт.
                  </div>
                </div>
                <div>
                  <span className="text-slate-500">Всего коробок:</span>
                  <div className="text-xl font-bold font-mono text-slate-800 mt-0.5">
                    {totalBoxes} шт.
                  </div>
                </div>
              </div>

              <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-blue-900 text-[11px] leading-relaxed">
                <span className="font-bold">Регламент:</span> После отправки заявка поступает в обработку логистами AliBros. Все указанные склады формируются в единый путевой лист.
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </form>
  );
}
