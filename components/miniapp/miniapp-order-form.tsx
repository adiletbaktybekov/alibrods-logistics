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

  const [deliveryDate, setDeliveryDate] = React.useState<string>(minDateString);
  const [boxesStr, setBoxesStr] = React.useState<string>('1');
  const [palletsStr, setPalletsStr] = React.useState<string>('0');

  const [selectedWarehouseId, setSelectedWarehouseId] = React.useState<string>(
    warehouses[0]?.id || ''
  );

  const selectedWarehouse = warehouses.find((w) => w.id === selectedWarehouseId);
  const dayOfWeekNumber = getDayOfWeekFromDate(deliveryDate);
  const dayOfWeekName = RUSSIAN_DAY_NAMES[dayOfWeekNumber] || '';
  const isWarehouseOpenToday = selectedWarehouse
    ? isWarehouseOpenOnDate(selectedWarehouse, deliveryDate)
    : true;

  const handleBoxesChange = (delta: number) => {
    const current = parseInt(boxesStr || '0', 10);
    const next = Math.max(1, current + delta);
    setBoxesStr(String(next));
  };

  const handlePalletsChange = (delta: number) => {
    const current = parseInt(palletsStr || '0', 10);
    const next = Math.max(0, current + delta);
    setPalletsStr(String(next));
  };

  return (
    <form
      action={formAction}
      onSubmit={() => triggerHaptic('impact')}
      className="space-y-4"
    >
      {state?.error && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800">
          {state.error}
        </div>
      )}

      {/* 1. Delivery Date */}
      <div className="rounded-xl bg-white border border-slate-200 p-4 shadow-2xs space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="deliveryDate" className="text-xs font-semibold text-slate-800">
            Дата доставки на склад *
          </Label>
          {dayOfWeekName && (
            <Badge variant="outline" className="text-[10px] text-brand-700 bg-brand-50 border-brand-200">
              {dayOfWeekName}
            </Badge>
          )}
        </div>
        <Input
          id="deliveryDate"
          name="deliveryDate"
          type="date"
          required
          min={minDateString}
          value={deliveryDate}
          onChange={(e) => setDeliveryDate(e.target.value)}
          className="text-xs py-2 bg-slate-50 border-slate-300"
        />
        <p className="text-[10px] text-slate-400">
          Выберите удобную дату забора/доставки груза
        </p>
      </div>

      {/* 2. Destination Warehouse */}
      <div className="rounded-xl bg-white border border-slate-200 p-4 shadow-2xs space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="warehouseId" className="text-xs font-semibold text-slate-800">
            Склад назначения *
          </Label>
          <span className="text-[10px] text-slate-400">
            Всего складов: {warehouses.length}
          </span>
        </div>

        <select
          id="warehouseId"
          name="warehouseId"
          required
          value={selectedWarehouseId}
          onChange={(e) => setSelectedWarehouseId(e.target.value)}
          className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        >
          {warehouses.map((wh) => (
            <option key={wh.id} value={wh.id}>
              {wh.name} ({wh.marketplace === 'WILDBERRIES' ? 'WB' : wh.marketplace}) — {wh.scheduleDescription}
            </option>
          ))}
        </select>

        {selectedWarehouse && (
          <div className="text-[11px] text-slate-500 pt-1 flex items-center justify-between">
            <span>График приёма:</span>
            <span className="font-medium text-slate-800">{selectedWarehouse.scheduleDescription}</span>
          </div>
        )}

        {selectedWarehouse && !isWarehouseOpenToday && (
          <div className="text-[11px] text-amber-800 bg-amber-50 rounded-lg p-2 border border-amber-200 mt-1">
            ℹ️ По стандартному графику склад «{selectedWarehouse.name}» работает: {selectedWarehouse.scheduleDescription}. Заявка на {deliveryDate} ({dayOfWeekName}) будет согласована логистом индивидуально.
          </div>
        )}
      </div>

      {/* 3. Cargo Volume (Boxes & Pallets) */}
      <div className="rounded-xl bg-white border border-slate-200 p-4 shadow-2xs space-y-3">
        <span className="text-xs font-semibold text-slate-800 block">
          Объём партии *
        </span>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="totalBoxesCount" className="text-[11px] text-slate-500">
              Коробок (шт.) *
            </Label>
            <div className="flex items-center gap-1.5 mt-1">
              <button
                type="button"
                onClick={() => handleBoxesChange(-1)}
                className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 font-bold text-sm active:bg-slate-200 flex items-center justify-center"
              >
                −
              </button>
              <input
                id="totalBoxesCount"
                name="totalBoxesCount"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                required
                value={boxesStr}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === '' || /^\d+$/.test(val)) {
                    setBoxesStr(val);
                  }
                }}
                onBlur={() => {
                  if (!boxesStr || parseInt(boxesStr, 10) < 1) {
                    setBoxesStr('1');
                  }
                }}
                className="w-full text-center rounded-lg border border-slate-300 py-1.5 text-xs font-semibold"
              />
              <button
                type="button"
                onClick={() => handleBoxesChange(1)}
                className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 font-bold text-sm active:bg-slate-200 flex items-center justify-center"
              >
                +
              </button>
            </div>
          </div>

          <div>
            <Label htmlFor="totalPalletsCount" className="text-[11px] text-slate-500">
              Паллет (шт.)
            </Label>
            <div className="flex items-center gap-1.5 mt-1">
              <button
                type="button"
                onClick={() => handlePalletsChange(-1)}
                className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 font-bold text-sm active:bg-slate-200 flex items-center justify-center"
              >
                −
              </button>
              <input
                id="totalPalletsCount"
                name="totalPalletsCount"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={palletsStr}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === '' || /^\d+$/.test(val)) {
                    setPalletsStr(val);
                  }
                }}
                onBlur={() => {
                  if (!palletsStr) {
                    setPalletsStr('0');
                  }
                }}
                className="w-full text-center rounded-lg border border-slate-300 py-1.5 text-xs font-semibold"
              />
              <button
                type="button"
                onClick={() => handlePalletsChange(1)}
                className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 font-bold text-sm active:bg-slate-200 flex items-center justify-center"
              >
                +
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Client Comment */}
      <div className="rounded-xl bg-white border border-slate-200 p-4 shadow-2xs space-y-2">
        <Label htmlFor="clientComment" className="text-xs font-semibold text-slate-800">
          Комментарий к поставке (необязательно)
        </Label>
        <Textarea
          id="clientComment"
          name="clientComment"
          rows={2}
          placeholder="Номер поставки в ЛК маркетплейса, пропуска, пожелания..."
          className="text-xs bg-slate-50"
        />
      </div>

      {/* Submit Button */}
      <div className="pt-2">
        <Button
          type="submit"
          disabled={isPending || !selectedWarehouseId}
          variant="primary"
          size="md"
          className="w-full py-3 text-xs font-bold shadow-sm"
        >
          {isPending ? 'Создание заявки...' : 'Подтвердить и отправить заявку'}
        </Button>
      </div>
    </form>
  );
}
