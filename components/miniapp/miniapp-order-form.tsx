'use client';

import * as React from 'react';
import { useActionState } from 'react';
import { createMiniAppOrderAction } from '@/app/actions/orders';
import {
  WarehouseItem,
  isWarehouseOpenOnDate,
  getDayOfWeekFromDate,
  RUSSIAN_DAY_NAMES,
} from '@/modules/warehouses/warehouses.types';
import { useTelegramWebApp } from './telegram-webapp-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';

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

interface MiniAppOrderFormProps {
  warehouses: WarehouseItem[];
}

export function MiniAppOrderForm({ warehouses }: MiniAppOrderFormProps) {
  const [state, formAction, isPending] = useActionState(createMiniAppOrderAction, null);
  const { triggerHaptic } = useTelegramWebApp();

  // Tomorrow by default
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const minDateString = tomorrow.toISOString().split('T')[0];

  const wbWarehouses = React.useMemo(
    () => warehouses.filter((w) => w.marketplace === 'WILDBERRIES'),
    [warehouses]
  );
  const ozonWarehouses = React.useMemo(
    () => warehouses.filter((w) => w.marketplace === 'OZON'),
    [warehouses]
  );

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

  const handleAddDestination = (
    marketplace: 'WILDBERRIES' | 'OZON',
    warehouseId?: string,
    isCustom = false
  ) => {
    triggerHaptic?.('impact');
    const list = marketplace === 'WILDBERRIES' ? wbWarehouses : ozonWarehouses;
    const chosenWhId = warehouseId || list[0]?.id || '';
    setDestinations((prev) => [
      ...prev,
      {
        id: `dest-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
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

  const handleRemoveDestination = (id: string) => {
    if (destinations.length <= 1) return;
    triggerHaptic?.('impact');
    setDestinations((prev) => prev.filter((d) => d.id !== id));
  };

  const updateDestination = <K extends keyof DestinationRow>(
    id: string,
    key: K,
    val: DestinationRow[K]
  ) => {
    setDestinations((prev) =>
      prev.map((d) => {
        if (d.id !== id) return d;
        const updated = { ...d, [key]: val };
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

  const totalPallets = destinations.reduce((sum, d) => sum + (Number(d.palletsCount) || 0), 0);
  const totalBoxes = destinations.reduce((sum, d) => sum + (Number(d.boxesCount) || 0), 0);

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

  const firstDest = destinations[0];
  const wbDestinations = destinations.filter((d) => d.marketplace === 'WILDBERRIES');
  const ozonDestinations = destinations.filter((d) => d.marketplace === 'OZON');

  return (
    <form
      action={formAction}
      onSubmit={() => triggerHaptic?.('impact')}
      className="space-y-5"
    >
      {/* Hidden inputs */}
      <input type="hidden" name="destinations" value={destinationsPayload} />
      <input type="hidden" name="warehouseId" value={firstDest?.warehouseId || ''} />
      <input type="hidden" name="deliveryDate" value={firstDest?.deliveryDate || minDateString} />
      <input type="hidden" name="totalPalletsCount" value={String(totalPallets)} />
      <input type="hidden" name="totalBoxesCount" value={String(totalBoxes)} />

      {state?.error && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800">
          {state.error}
        </div>
      )}

      {/* Overview Totals Pill */}
      <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900 text-white shadow-xs">
        <div>
          <span className="text-[11px] text-slate-300 block">
            Складов в заявке: <span className="font-bold text-white">{destinations.length}</span>
          </span>
          <span className="text-xs font-semibold text-emerald-400">
            Итого: {totalPallets} палл. • {totalBoxes} кор.
          </span>
        </div>
        <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-1 rounded">
          {wbDestinations.length > 0 && ozonDestinations.length > 0
            ? 'WB + OZON'
            : wbDestinations.length > 0
            ? 'Wildberries'
            : 'Ozon'}
        </span>
      </div>

      {/* SECTION 1: WILDBERRIES */}
      <div className="rounded-2xl border-2 border-purple-200 bg-gradient-to-b from-purple-50/50 to-white p-3.5 space-y-3 shadow-2xs">
        <div className="flex items-center justify-between pb-2 border-b border-purple-100">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-md bg-[#cb11ab] text-white font-extrabold text-[11px]">
              WILDBERRIES
            </span>
            <span className="text-xs font-bold text-slate-900">
              Склады WB ({wbDestinations.length})
            </span>
          </div>
          <button
            type="button"
            onClick={() => handleAddDestination('WILDBERRIES')}
            className="text-[11px] font-semibold text-purple-700 bg-purple-50 px-2.5 py-1 rounded-lg border border-purple-200 active:bg-purple-100"
          >
            + Склад WB
          </button>
        </div>

        {/* WB Search */}
        <input
          type="text"
          value={wbSearch}
          onChange={(e) => setWbSearch(e.target.value)}
          placeholder="🔍 Поиск склада WB (Коледино, Электросталь...)"
          className="w-full rounded-lg border border-purple-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-purple-500 focus:outline-none"
        />

        {wbDestinations.map((dest, idx) => {
          const wh = warehouses.find((w) => w.id === dest.warehouseId);
          const dayNum = getDayOfWeekFromDate(dest.deliveryDate);
          const dayName = RUSSIAN_DAY_NAMES[dayNum] || '';
          const isOpen = wh && !dest.isCustomWarehouse ? isWarehouseOpenOnDate(wh, dest.deliveryDate) : true;

          return (
            <div
              key={dest.id}
              className="rounded-xl bg-white border border-purple-100 p-3.5 shadow-2xs space-y-3"
            >
              <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded-full bg-purple-100 text-purple-800 text-[10px] flex items-center justify-center font-bold">
                    {idx + 1}
                  </span>
                  {dest.isCustomWarehouse ? 'Индивидуальный склад WB' : wh?.name || 'Склад WB'}
                </span>
                {destinations.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveDestination(dest.id)}
                    className="text-[11px] text-rose-600 hover:text-rose-800 font-medium"
                  >
                    Удалить
                  </button>
                )}
              </div>

              {/* Custom warehouse toggle */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id={`mini-custom-${dest.id}`}
                  checked={dest.isCustomWarehouse}
                  onChange={(e) => updateDestination(dest.id, 'isCustomWarehouse', e.target.checked)}
                  className="rounded border-slate-300 text-purple-600 focus:ring-purple-500 w-4 h-4"
                />
                <label htmlFor={`mini-custom-${dest.id}`} className="text-xs text-slate-700 font-medium cursor-pointer">
                  Индивидуальный склад WB (нет в списке)
                </label>
              </div>

              {dest.isCustomWarehouse ? (
                <div>
                  <Label htmlFor={`mini-custom-name-${dest.id}`} className="text-[11px] text-slate-600">
                    Название склада WB *
                  </Label>
                  <Input
                    id={`mini-custom-name-${dest.id}`}
                    type="text"
                    placeholder="Например: WB Крёкшино транзит"
                    value={dest.customWarehouseName}
                    onChange={(e) => updateDestination(dest.id, 'customWarehouseName', e.target.value)}
                    className="text-xs mt-1 bg-slate-50 border-slate-300"
                    required={dest.isCustomWarehouse}
                  />
                </div>
              ) : (
                <div>
                  <Label htmlFor={`mini-wh-${dest.id}`} className="text-[11px] text-slate-600">
                    Выберите склад Wildberries *
                  </Label>
                  <select
                    id={`mini-wh-${dest.id}`}
                    value={dest.warehouseId}
                    onChange={(e) => updateDestination(dest.id, 'warehouseId', e.target.value)}
                    className="w-full mt-1 rounded-lg border border-purple-200 bg-slate-50 px-2.5 py-2 text-xs text-slate-900 focus:border-purple-500 focus:outline-none"
                  >
                    {filteredWbWarehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name} {w.city ? `(${w.city})` : ''} — {w.scheduleDescription}
                      </option>
                    ))}
                  </select>
                  {wh && !isOpen && (
                    <p className="text-[10px] text-amber-700 bg-amber-50 p-1.5 rounded mt-1 border border-amber-200">
                      ℹ️ График: {wh.scheduleDescription}. Заявка согласовывается индивидуально.
                    </p>
                  )}
                </div>
              )}

              {/* Delivery Date */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label htmlFor={`mini-date-${dest.id}`} className="text-[11px] text-slate-600">
                    Дата доставки на склад *
                  </Label>
                  {dayName && (
                    <Badge variant="outline" className="text-[9px] text-purple-700 bg-purple-50 border-purple-200">
                      {dayName}
                    </Badge>
                  )}
                </div>
                <Input
                  id={`mini-date-${dest.id}`}
                  type="date"
                  min={minDateString}
                  value={dest.deliveryDate}
                  onChange={(e) => updateDestination(dest.id, 'deliveryDate', e.target.value)}
                  className="text-xs py-1.5 bg-slate-50 border-slate-300"
                  required
                />
              </div>

              {/* Cargo volume: STRICTLY PALLETS FIRST, THEN BOXES */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <Label className="text-[11px] text-slate-600 font-semibold">Паллеты (шт.)</Label>
                  <div className="flex items-center gap-1 mt-1">
                    <button
                      type="button"
                      onClick={() => updateDestination(dest.id, 'palletsCount', Math.max(0, dest.palletsCount - 1))}
                      className="w-7 h-7 rounded bg-slate-100 text-slate-700 font-bold text-xs flex items-center justify-center active:bg-slate-200"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min="0"
                      value={dest.palletsCount}
                      onChange={(e) => updateDestination(dest.id, 'palletsCount', Math.max(0, parseInt(e.target.value, 10) || 0))}
                      className="w-full text-center rounded border border-slate-300 py-1 text-xs font-semibold"
                    />
                    <button
                      type="button"
                      onClick={() => updateDestination(dest.id, 'palletsCount', dest.palletsCount + 1)}
                      className="w-7 h-7 rounded bg-slate-100 text-slate-700 font-bold text-xs flex items-center justify-center active:bg-slate-200"
                    >
                      +
                    </button>
                  </div>
                </div>

                <div>
                  <Label className="text-[11px] text-slate-600 font-semibold">Коробок (шт.)</Label>
                  <div className="flex items-center gap-1 mt-1">
                    <button
                      type="button"
                      onClick={() => updateDestination(dest.id, 'boxesCount', Math.max(0, dest.boxesCount - 1))}
                      className="w-7 h-7 rounded bg-slate-100 text-slate-700 font-bold text-xs flex items-center justify-center active:bg-slate-200"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min="0"
                      value={dest.boxesCount}
                      onChange={(e) => updateDestination(dest.id, 'boxesCount', Math.max(0, parseInt(e.target.value, 10) || 0))}
                      className="w-full text-center rounded border border-slate-300 py-1 text-xs font-semibold"
                    />
                    <button
                      type="button"
                      onClick={() => updateDestination(dest.id, 'boxesCount', dest.boxesCount + 1)}
                      className="w-7 h-7 rounded bg-slate-100 text-slate-700 font-bold text-xs flex items-center justify-center active:bg-slate-200"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>

              {/* Comment */}
              <div>
                <input
                  type="text"
                  placeholder="Примечание к складу (необязательно)"
                  value={dest.comment}
                  onChange={(e) => updateDestination(dest.id, 'comment', e.target.value)}
                  className="w-full rounded border border-slate-200 px-2.5 py-1 text-xs bg-slate-50"
                />
              </div>
            </div>
          );
        })}

        {wbDestinations.length === 0 && (
          <p className="text-center text-[11px] text-slate-400 py-3">
            Склады Wildberries не выбраны
          </p>
        )}
      </div>

      {/* SECTION 2: OZON */}
      <div className="rounded-2xl border-2 border-blue-200 bg-gradient-to-b from-blue-50/50 to-white p-3.5 space-y-3 shadow-2xs">
        <div className="flex items-center justify-between pb-2 border-b border-blue-100">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-md bg-[#005bff] text-white font-extrabold text-[11px]">
              OZON
            </span>
            <span className="text-xs font-bold text-slate-900">
              Склады Ozon ({ozonDestinations.length})
            </span>
          </div>
          <button
            type="button"
            onClick={() => handleAddDestination('OZON')}
            className="text-[11px] font-semibold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200 active:bg-blue-100"
          >
            + Склад Ozon
          </button>
        </div>

        {/* Ozon Search */}
        <input
          type="text"
          value={ozonSearch}
          onChange={(e) => setOzonSearch(e.target.value)}
          placeholder="🔍 Поиск склада Ozon (Хоругвино, Грибки, Тверь...)"
          className="w-full rounded-lg border border-blue-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none"
        />

        {ozonDestinations.map((dest, idx) => {
          const wh = warehouses.find((w) => w.id === dest.warehouseId);
          const dayNum = getDayOfWeekFromDate(dest.deliveryDate);
          const dayName = RUSSIAN_DAY_NAMES[dayNum] || '';
          const isOpen = wh && !dest.isCustomWarehouse ? isWarehouseOpenOnDate(wh, dest.deliveryDate) : true;

          return (
            <div
              key={dest.id}
              className="rounded-xl bg-white border border-blue-100 p-3.5 shadow-2xs space-y-3"
            >
              <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded-full bg-blue-100 text-blue-800 text-[10px] flex items-center justify-center font-bold">
                    {idx + 1}
                  </span>
                  {dest.isCustomWarehouse ? 'Индивидуальный склад Ozon' : wh?.name || 'Склад Ozon'}
                </span>
                {destinations.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveDestination(dest.id)}
                    className="text-[11px] text-rose-600 hover:text-rose-800 font-medium"
                  >
                    Удалить
                  </button>
                )}
              </div>

              {/* Custom warehouse toggle */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id={`mini-custom-ozon-${dest.id}`}
                  checked={dest.isCustomWarehouse}
                  onChange={(e) => updateDestination(dest.id, 'isCustomWarehouse', e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4"
                />
                <label htmlFor={`mini-custom-ozon-${dest.id}`} className="text-xs text-slate-700 font-medium cursor-pointer">
                  Индивидуальный склад Ozon (нет в списке)
                </label>
              </div>

              {dest.isCustomWarehouse ? (
                <div>
                  <Label htmlFor={`mini-custom-name-${dest.id}`} className="text-[11px] text-slate-600">
                    Название склада Ozon *
                  </Label>
                  <Input
                    id={`mini-custom-name-${dest.id}`}
                    type="text"
                    placeholder="Например: Ozon Тверь РФЦ"
                    value={dest.customWarehouseName}
                    onChange={(e) => updateDestination(dest.id, 'customWarehouseName', e.target.value)}
                    className="text-xs mt-1 bg-slate-50 border-slate-300"
                    required={dest.isCustomWarehouse}
                  />
                </div>
              ) : (
                <div>
                  <Label htmlFor={`mini-wh-${dest.id}`} className="text-[11px] text-slate-600">
                    Выберите склад Ozon *
                  </Label>
                  <select
                    id={`mini-wh-${dest.id}`}
                    value={dest.warehouseId}
                    onChange={(e) => updateDestination(dest.id, 'warehouseId', e.target.value)}
                    className="w-full mt-1 rounded-lg border border-blue-200 bg-slate-50 px-2.5 py-2 text-xs text-slate-900 focus:border-blue-500 focus:outline-none"
                  >
                    {filteredOzonWarehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name} {w.city ? `(${w.city})` : ''} — {w.scheduleDescription}
                      </option>
                    ))}
                  </select>
                  {wh && !isOpen && (
                    <p className="text-[10px] text-amber-700 bg-amber-50 p-1.5 rounded mt-1 border border-amber-200">
                      ℹ️ График: {wh.scheduleDescription}. Заявка согласовывается индивидуально.
                    </p>
                  )}
                </div>
              )}

              {/* Delivery Date */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label htmlFor={`mini-date-${dest.id}`} className="text-[11px] text-slate-600">
                    Дата доставки на склад *
                  </Label>
                  {dayName && (
                    <Badge variant="outline" className="text-[9px] text-blue-700 bg-blue-50 border-blue-200">
                      {dayName}
                    </Badge>
                  )}
                </div>
                <Input
                  id={`mini-date-${dest.id}`}
                  type="date"
                  min={minDateString}
                  value={dest.deliveryDate}
                  onChange={(e) => updateDestination(dest.id, 'deliveryDate', e.target.value)}
                  className="text-xs py-1.5 bg-slate-50 border-slate-300"
                  required
                />
              </div>

              {/* Cargo volume: STRICTLY PALLETS FIRST, THEN BOXES */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <Label className="text-[11px] text-slate-600 font-semibold">Паллеты (шт.)</Label>
                  <div className="flex items-center gap-1 mt-1">
                    <button
                      type="button"
                      onClick={() => updateDestination(dest.id, 'palletsCount', Math.max(0, dest.palletsCount - 1))}
                      className="w-7 h-7 rounded bg-slate-100 text-slate-700 font-bold text-xs flex items-center justify-center active:bg-slate-200"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min="0"
                      value={dest.palletsCount}
                      onChange={(e) => updateDestination(dest.id, 'palletsCount', Math.max(0, parseInt(e.target.value, 10) || 0))}
                      className="w-full text-center rounded border border-slate-300 py-1 text-xs font-semibold"
                    />
                    <button
                      type="button"
                      onClick={() => updateDestination(dest.id, 'palletsCount', dest.palletsCount + 1)}
                      className="w-7 h-7 rounded bg-slate-100 text-slate-700 font-bold text-xs flex items-center justify-center active:bg-slate-200"
                    >
                      +
                    </button>
                  </div>
                </div>

                <div>
                  <Label className="text-[11px] text-slate-600 font-semibold">Коробок (шт.)</Label>
                  <div className="flex items-center gap-1 mt-1">
                    <button
                      type="button"
                      onClick={() => updateDestination(dest.id, 'boxesCount', Math.max(0, dest.boxesCount - 1))}
                      className="w-7 h-7 rounded bg-slate-100 text-slate-700 font-bold text-xs flex items-center justify-center active:bg-slate-200"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min="0"
                      value={dest.boxesCount}
                      onChange={(e) => updateDestination(dest.id, 'boxesCount', Math.max(0, parseInt(e.target.value, 10) || 0))}
                      className="w-full text-center rounded border border-slate-300 py-1 text-xs font-semibold"
                    />
                    <button
                      type="button"
                      onClick={() => updateDestination(dest.id, 'boxesCount', dest.boxesCount + 1)}
                      className="w-7 h-7 rounded bg-slate-100 text-slate-700 font-bold text-xs flex items-center justify-center active:bg-slate-200"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>

              {/* Comment */}
              <div>
                <input
                  type="text"
                  placeholder="Примечание к складу (необязательно)"
                  value={dest.comment}
                  onChange={(e) => updateDestination(dest.id, 'comment', e.target.value)}
                  className="w-full rounded border border-slate-200 px-2.5 py-1 text-xs bg-slate-50"
                />
              </div>
            </div>
          );
        })}

        {ozonDestinations.length === 0 && (
          <p className="text-center text-[11px] text-slate-400 py-3">
            Склады Ozon не выбраны
          </p>
        )}
      </div>

      {/* Comment */}
      <div className="space-y-1">
        <Label htmlFor="mini-comment" className="text-xs text-slate-700">
          Комментарий к заявке (необязательно)
        </Label>
        <Textarea
          id="mini-comment"
          name="clientComment"
          value={clientComment}
          onChange={(e) => setClientComment(e.target.value)}
          placeholder="Особые пожелания или требования..."
          rows={2}
          className="text-xs bg-white"
        />
      </div>

      {/* Submit Button */}
      <Button
        type="submit"
        variant="primary"
        size="lg"
        isLoading={isPending}
        disabled={isPending || (totalBoxes === 0 && totalPallets === 0)}
        className="w-full text-sm font-semibold shadow-md"
      >
        Оформить заявку ({totalPallets} палл. • {totalBoxes} кор.)
      </Button>
    </form>
  );
}
