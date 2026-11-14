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
  isCustomWarehouse: boolean;
  customWarehouseName: string;
  deliveryDate: string;
  boxesCount: number;
  palletsCount: number;
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

  const [destinations, setDestinations] = React.useState<DestinationRow[]>([
    {
      id: 'dest-1',
      warehouseId: warehouses[0]?.id || '',
      isCustomWarehouse: false,
      customWarehouseName: '',
      deliveryDate: minDateString,
      boxesCount: 1,
      palletsCount: 0,
      comment: '',
    },
  ]);

  const [clientComment, setClientComment] = React.useState('');

  const handleAddDestination = () => {
    triggerHaptic?.('impact');
    setDestinations((prev) => [
      ...prev,
      {
        id: `dest-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        warehouseId: warehouses[0]?.id || '',
        isCustomWarehouse: false,
        customWarehouseName: '',
        deliveryDate: minDateString,
        boxesCount: 1,
        palletsCount: 0,
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
      prev.map((d) => (d.id === id ? { ...d, [key]: val } : d))
    );
  };

  const totalBoxes = destinations.reduce((sum, d) => sum + (Number(d.boxesCount) || 0), 0);
  const totalPallets = destinations.reduce((sum, d) => sum + (Number(d.palletsCount) || 0), 0);

  const destinationsPayload = React.useMemo(() => {
    return JSON.stringify(
      destinations.map((d) => ({
        warehouseId: d.isCustomWarehouse ? null : d.warehouseId || null,
        isCustomWarehouse: Boolean(d.isCustomWarehouse),
        customWarehouseName: d.isCustomWarehouse ? d.customWarehouseName.trim() : null,
        deliveryDate: d.deliveryDate,
        boxesCount: Number(d.boxesCount) || 0,
        palletsCount: Number(d.palletsCount) || 0,
        comment: d.comment ? d.comment.trim() : null,
      }))
    );
  }, [destinations]);

  const firstDest = destinations[0];

  return (
    <form
      action={formAction}
      onSubmit={() => triggerHaptic?.('impact')}
      className="space-y-4"
    >
      {/* Hidden inputs */}
      <input type="hidden" name="destinations" value={destinationsPayload} />
      <input type="hidden" name="warehouseId" value={firstDest?.warehouseId || ''} />
      <input type="hidden" name="deliveryDate" value={firstDest?.deliveryDate || minDateString} />
      <input type="hidden" name="totalBoxesCount" value={String(totalBoxes)} />
      <input type="hidden" name="totalPalletsCount" value={String(totalPallets)} />

      {state?.error && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800">
          {state.error}
        </div>
      )}

      {/* Header and Add Button */}
      <div className="flex items-center justify-between pt-1">
        <div>
          <span className="text-xs font-bold text-slate-800 block">
            Склады назначения ({destinations.length})
          </span>
          <span className="text-[10px] text-slate-400">
            Итого: {totalBoxes} кор. {totalPallets > 0 ? `• ${totalPallets} палл.` : ''}
          </span>
        </div>
        <button
          type="button"
          onClick={handleAddDestination}
          className="text-xs font-semibold text-brand-600 bg-brand-50 px-2.5 py-1 rounded-lg border border-brand-200 active:bg-brand-100"
        >
          + Склад
        </button>
      </div>

      {/* Destination Cards */}
      {destinations.map((dest, idx) => {
        const wh = warehouses.find((w) => w.id === dest.warehouseId);
        const dayNum = getDayOfWeekFromDate(dest.deliveryDate);
        const dayName = RUSSIAN_DAY_NAMES[dayNum] || '';
        const isOpen = wh && !dest.isCustomWarehouse ? isWarehouseOpenOnDate(wh, dest.deliveryDate) : true;

        return (
          <div
            key={dest.id}
            className="rounded-xl bg-white border border-slate-200 p-4 shadow-2xs space-y-3"
          >
            <div className="flex items-center justify-between pb-1 border-b border-slate-100">
              <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <span className="w-4 h-4 rounded-full bg-brand-100 text-brand-700 text-[10px] flex items-center justify-center font-bold">
                  {idx + 1}
                </span>
                Склад #{idx + 1}
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
                className="rounded border-slate-300 text-brand-600 focus:ring-brand-500 w-4 h-4"
              />
              <label htmlFor={`mini-custom-${dest.id}`} className="text-xs text-slate-700 font-medium cursor-pointer">
                Индивидуальный склад (нет в списке)
              </label>
            </div>

            {/* Warehouse select or custom name */}
            {dest.isCustomWarehouse ? (
              <div>
                <Label htmlFor={`mini-custom-name-${dest.id}`} className="text-[11px] text-slate-600">
                  Название индивидуального склада *
                </Label>
                <Input
                  id={`mini-custom-name-${dest.id}`}
                  type="text"
                  placeholder="ТК Деловые Линии, склад клиента..."
                  value={dest.customWarehouseName}
                  onChange={(e) => updateDestination(dest.id, 'customWarehouseName', e.target.value)}
                  className="text-xs mt-1 bg-slate-50 border-slate-300"
                  required={dest.isCustomWarehouse}
                />
              </div>
            ) : (
              <div>
                <Label htmlFor={`mini-wh-${dest.id}`} className="text-[11px] text-slate-600">
                  Выберите склад *
                </Label>
                <select
                  id={`mini-wh-${dest.id}`}
                  value={dest.warehouseId}
                  onChange={(e) => updateDestination(dest.id, 'warehouseId', e.target.value)}
                  className="w-full mt-1 rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-2 text-xs text-slate-900 focus:border-brand-500 focus:outline-none"
                >
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({w.marketplace === 'WILDBERRIES' ? 'WB' : w.marketplace}) — {w.scheduleDescription}
                    </option>
                  ))}
                </select>
                {wh && !isOpen && (
                  <p className="text-[10px] text-amber-700 bg-amber-50 p-1.5 rounded mt-1 border border-amber-200">
                    ℹ️ Склад работает: {wh.scheduleDescription}. Заявка будет согласована логистом индивидуально.
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
                  <Badge variant="outline" className="text-[9px] text-brand-700 bg-brand-50 border-brand-200">
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

            {/* Cargo volume */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <Label className="text-[11px] text-slate-600">Коробок (шт.)</Label>
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

              <div>
                <Label className="text-[11px] text-slate-600">Паллет (шт.)</Label>
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
            </div>

            {/* Optional destination note */}
            <div>
              <input
                type="text"
                placeholder="Примечание к этому складу (опционально)..."
                value={dest.comment}
                onChange={(e) => updateDestination(dest.id, 'comment', e.target.value)}
                className="w-full rounded border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-800 placeholder:text-slate-400"
              />
            </div>
          </div>
        );
      })}

      {/* Global Client Comment */}
      <div className="rounded-xl bg-white border border-slate-200 p-4 shadow-2xs space-y-2">
        <Label htmlFor="clientComment" className="text-xs font-semibold text-slate-800">
          Комментарий к заявке (необязательно)
        </Label>
        <Textarea
          id="clientComment"
          name="clientComment"
          rows={2}
          value={clientComment}
          onChange={(e) => setClientComment(e.target.value)}
          placeholder="Номер поставки, пропуска, особые пожелания..."
          className="text-xs bg-slate-50"
        />
      </div>

      {/* Submit Button */}
      <div className="pt-2">
        <Button
          type="submit"
          disabled={isPending || (totalBoxes === 0 && totalPallets === 0)}
          variant="primary"
          size="md"
          className="w-full py-3 text-xs font-bold shadow-sm bg-brand-600 hover:bg-brand-700 text-white"
        >
          {isPending
            ? 'Создание заявки...'
            : `Отправить заявку (${totalBoxes} кор. • ${totalPallets} палл.)`}
        </Button>
      </div>
    </form>
  );
}
