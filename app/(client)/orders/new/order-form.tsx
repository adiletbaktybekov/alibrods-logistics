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
  isCustomWarehouse: boolean;
  customWarehouseName: string;
  deliveryDate: string;
  boxesCount: number;
  palletsCount: number;
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

  // Add destination
  const handleAddDestination = () => {
    setDestinations((prev) => [
      ...prev,
      {
        id: `dest-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
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
      prev.map((d) => (d.id === id ? { ...d, [key]: val } : d))
    );
  };

  // Calculations for total summary
  const totalBoxes = destinations.reduce((sum, d) => sum + (Number(d.boxesCount) || 0), 0);
  const totalPallets = destinations.reduce((sum, d) => sum + (Number(d.palletsCount) || 0), 0);

  // JSON payload serialized for backend action
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

  // Primary warehouse and date for legacy fallback
  const firstDest = destinations[0];

  return (
    <form action={formAction} className="grid grid-cols-1 lg:grid-cols-12 gap-8">
      {/* Hidden Fields for Server Action */}
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <input type="hidden" name="destinations" value={destinationsPayload} />
      {/* Legacy fallback inputs */}
      <input type="hidden" name="warehouseId" value={firstDest?.warehouseId || ''} />
      <input type="hidden" name="deliveryDate" value={firstDest?.deliveryDate || minDateString} />
      <input type="hidden" name="totalBoxesCount" value={String(totalBoxes)} />
      <input type="hidden" name="totalPalletsCount" value={String(totalPallets)} />

      {/* Main Form Fields */}
      <div className="lg:col-span-8 space-y-6">
        {state?.error && (
          <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-sm font-medium text-red-700">
            {state.error}
          </div>
        )}

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Склады назначения и партии груза
              </h2>
              <p className="text-xs text-slate-500">
                Вы можете указать один или несколько складов в рамках одной заявки
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddDestination}
              className="border-brand-200 text-brand-700 hover:bg-brand-50 text-xs"
            >
              + Добавить склад
            </Button>
          </div>

          {destinations.map((dest, idx) => {
            const wh = warehouses.find((w) => w.id === dest.warehouseId);
            const dayNum = getDayOfWeekFromDate(dest.deliveryDate);
            const dayName = RUSSIAN_DAY_NAMES[dayNum] || '';
            const isOpen = wh && !dest.isCustomWarehouse ? isWarehouseOpenOnDate(wh, dest.deliveryDate) : true;

            return (
              <Card key={dest.id} className="border-slate-200 shadow-sm p-5 space-y-4 relative">
                {/* Destination Item Header */}
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-brand-100 text-brand-700 font-bold text-xs flex items-center justify-center">
                      {idx + 1}
                    </span>
                    <span className="text-sm font-bold text-slate-900">
                      Склад назначения #{idx + 1}
                    </span>
                  </div>

                  {destinations.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveDestination(dest.id)}
                      className="text-xs text-rose-600 hover:text-rose-800 font-medium"
                    >
                      ✕ Удалить склад
                    </button>
                  )}
                </div>

                {/* Custom Warehouse Checkbox */}
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id={`custom-${dest.id}`}
                    checked={dest.isCustomWarehouse}
                    onChange={(e) => updateDestination(dest.id, 'isCustomWarehouse', e.target.checked)}
                    className="rounded border-slate-300 text-brand-600 focus:ring-brand-500 w-4 h-4"
                  />
                  <label htmlFor={`custom-${dest.id}`} className="text-xs text-slate-700 font-medium cursor-pointer">
                    Индивидуальный склад (нет в стандартном каталоге)
                  </label>
                </div>

                {/* Warehouse Selector OR Custom Name Input */}
                {dest.isCustomWarehouse ? (
                  <div>
                    <Label htmlFor={`customName-${dest.id}`} required>
                      Название индивидуального склада
                    </Label>
                    <Input
                      id={`customName-${dest.id}`}
                      type="text"
                      placeholder="Например: ТК Деловые Линии (Восток) или Склад поставщика Люблино"
                      value={dest.customWarehouseName}
                      onChange={(e) => updateDestination(dest.id, 'customWarehouseName', e.target.value)}
                      required={dest.isCustomWarehouse}
                      className="mt-1"
                    />
                    <p className="mt-1 text-[11px] text-amber-700">
                      ℹ️ Индивидуальный склад будет отмечен для логиста и не добавится в общий каталог.
                    </p>
                  </div>
                ) : (
                  <div>
                    <Label htmlFor={`wh-${dest.id}`} required>
                      Склад из каталога
                    </Label>
                    <select
                      id={`wh-${dest.id}`}
                      value={dest.warehouseId}
                      onChange={(e) => updateDestination(dest.id, 'warehouseId', e.target.value)}
                      className="w-full mt-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                    >
                      <optgroup label="Wildberries">
                        {warehouses
                          .filter((w) => w.marketplace === 'WILDBERRIES')
                          .map((w) => (
                            <option key={w.id} value={w.id}>
                              {w.name} — ({w.scheduleDescription})
                            </option>
                          ))}
                      </optgroup>
                      <optgroup label="Ozon">
                        {warehouses
                          .filter((w) => w.marketplace === 'OZON')
                          .map((w) => (
                            <option key={w.id} value={w.id}>
                              {w.name} — ({w.scheduleDescription})
                            </option>
                          ))}
                      </optgroup>
                    </select>

                    {wh && !isOpen && (
                      <div className="mt-2 p-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900">
                        ℹ️ Склад «{wh.name}» работает по графику: {wh.scheduleDescription}. Заявка на выбранный день будет согласована логистом индивидуально.
                      </div>
                    )}
                  </div>
                )}

                {/* Delivery Date for this destination */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <Label htmlFor={`date-${dest.id}`} required>
                      Дата доставки на данный склад
                    </Label>
                    {dayName && (
                      <span className="text-[11px] font-semibold text-brand-700 bg-brand-50 px-2 py-0.5 rounded-full">
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
                  />
                </div>

                {/* Cargo Quantities (Boxes & Pallets) */}
                <div className="grid grid-cols-2 gap-4 pt-1">
                  <div>
                    <Label htmlFor={`boxes-${dest.id}`} required>
                      Коробок
                    </Label>
                    <Input
                      id={`boxes-${dest.id}`}
                      type="number"
                      min="0"
                      value={dest.boxesCount}
                      onChange={(e) => updateDestination(dest.id, 'boxesCount', Math.max(0, parseInt(e.target.value, 10) || 0))}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor={`pallets-${dest.id}`} required>
                      Паллет
                    </Label>
                    <Input
                      id={`pallets-${dest.id}`}
                      type="number"
                      min="0"
                      value={dest.palletsCount}
                      onChange={(e) => updateDestination(dest.id, 'palletsCount', Math.max(0, parseInt(e.target.value, 10) || 0))}
                      required
                    />
                  </div>
                </div>

                {/* Destination Comment */}
                <div>
                  <Label htmlFor={`comm-${dest.id}`}>
                    Комментарий по данному складу (необязательно)
                  </Label>
                  <input
                    id={`comm-${dest.id}`}
                    type="text"
                    placeholder="Например: номер ворот, пропуск, особые требования к выгрузке..."
                    value={dest.comment}
                    onChange={(e) => updateDestination(dest.id, 'comment', e.target.value)}
                    className="w-full mt-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-brand-500 focus:outline-none"
                  />
                </div>
              </Card>
            );
          })}
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
            Отправить заявку ({totalBoxes} кор. • {totalPallets} палл.)
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
                <span className="text-slate-500">Склады:</span>
                <div className="space-y-1.5 mt-1">
                  {destinations.map((d, idx) => {
                    const wh = warehouses.find((w) => w.id === d.warehouseId);
                    const name = d.isCustomWarehouse
                      ? d.customWarehouseName || 'Инд. склад'
                      : wh?.name || '—';
                    return (
                      <div key={d.id} className="p-2 rounded bg-slate-50 border border-slate-100 flex items-center justify-between">
                        <span className="font-medium text-slate-800">
                          {idx + 1}. {name}
                        </span>
                        <span className="font-mono text-slate-600">
                          {d.boxesCount} кор.{d.palletsCount > 0 ? ` / ${d.palletsCount} палл.` : ''}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
                <div>
                  <span className="text-slate-500">Всего коробок:</span>
                  <div className="text-xl font-bold font-mono text-indigo-600 mt-0.5">
                    {totalBoxes} шт.
                  </div>
                </div>
                <div>
                  <span className="text-slate-500">Всего паллет:</span>
                  <div className="text-xl font-bold font-mono text-brand-600 mt-0.5">
                    {totalPallets} шт.
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
