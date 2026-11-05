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
} from '@/modules/warehouses/warehouses.service';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface OrderFormProps {
  warehouses: WarehouseItem[];
}

export function OrderForm({ warehouses }: OrderFormProps) {
  const [state, formAction, isPending] = useActionState(createOrderAction, null);

  // Default to tomorrow's date
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const minDateString = tomorrow.toISOString().split('T')[0];

  const [deliveryDate, setDeliveryDate] = React.useState<string>(minDateString);
  const [pallets, setPallets] = React.useState<number>(0);
  const [boxes, setBoxes] = React.useState<number>(1);

  // Filter warehouses based on delivery date schedule
  const availableWarehouses = React.useMemo(() => {
    return warehouses.filter((w) => isWarehouseOpenOnDate(w, deliveryDate));
  }, [warehouses, deliveryDate]);

  const [selectedWarehouseId, setSelectedWarehouseId] = React.useState<string>(
    availableWarehouses[0]?.id || ''
  );

  // If selected warehouse is not available on new date, switch to first available
  React.useEffect(() => {
    if (availableWarehouses.length > 0) {
      const exists = availableWarehouses.some((w) => w.id === selectedWarehouseId);
      if (!exists) {
        setSelectedWarehouseId(availableWarehouses[0].id);
      }
    } else {
      setSelectedWarehouseId('');
    }
  }, [availableWarehouses, selectedWarehouseId]);

  const selectedWarehouse = warehouses.find((w) => w.id === selectedWarehouseId);
  const dayOfWeekNumber = getDayOfWeekFromDate(deliveryDate);
  const dayOfWeekName = RUSSIAN_DAY_NAMES[dayOfWeekNumber] || '';

  return (
    <form action={formAction} className="grid grid-cols-1 lg:grid-cols-12 gap-8">
      {/* Main Form Fields */}
      <div className="lg:col-span-8 space-y-6">
        {state?.error && (
          <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-sm font-medium text-red-700">
            {state.error}
          </div>
        )}

        <Card className="border-slate-200 shadow-sm p-6 space-y-5">
          {/* Step 1: Delivery Date */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <Label htmlFor="deliveryDate" required>
                1. Желаемая дата доставки на склад
              </Label>
              {dayOfWeekName && (
                <span className="text-xs font-semibold text-brand-700 bg-brand-50 px-2.5 py-0.5 rounded-full">
                  День недели: {dayOfWeekName}
                </span>
              )}
            </div>
            <Input
              id="deliveryDate"
              name="deliveryDate"
              type="date"
              min={minDateString}
              value={deliveryDate}
              onChange={(e) => setDeliveryDate(e.target.value)}
              required
            />
            <p className="mt-1 text-xs text-slate-500">
              Список доступных складов автоматически обновляется в соответствии с их графиком работы
            </p>
          </div>

          {/* Step 2: Warehouse Selection */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <Label htmlFor="warehouseId" required>
                2. Склад приёмки (работает в {dayOfWeekName.toLowerCase() || 'выбранный день'})
              </Label>
              <span className="text-xs text-slate-500 font-medium">
                Доступно: {availableWarehouses.length} из {warehouses.length}
              </span>
            </div>

            {availableWarehouses.length > 0 ? (
              <Select
                id="warehouseId"
                name="warehouseId"
                value={selectedWarehouseId}
                onChange={(e) => setSelectedWarehouseId(e.target.value)}
                required
              >
                <optgroup label="Wildberries">
                  {availableWarehouses
                    .filter((w) => w.marketplace === 'WILDBERRIES')
                    .map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name} — ({w.scheduleDescription})
                      </option>
                    ))}
                </optgroup>
                <optgroup label="Ozon">
                  {availableWarehouses
                    .filter((w) => w.marketplace === 'OZON')
                    .map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name} — ({w.scheduleDescription})
                      </option>
                    ))}
                </optgroup>
              </Select>
            ) : (
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
                В выбранный день недели ({dayOfWeekName}) нет доступных складов. Пожалуйста, выберите другую дату.
              </div>
            )}

            {selectedWarehouse && (
              <div className="mt-2.5 p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700 flex items-center justify-between">
                <div>
                  <span className="font-semibold text-slate-900">Выбранный склад:</span> {selectedWarehouse.name}
                </div>
                <div className="text-slate-500">
                  <span className="font-semibold text-slate-900">График:</span> {selectedWarehouse.scheduleDescription}
                </div>
              </div>
            )}
          </div>

          {/* Step 3: Cargo Quantities */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
            <div>
              <Label htmlFor="totalBoxesCount" required>
                3. Количество коробок
              </Label>
              <Input
                id="totalBoxesCount"
                name="totalBoxesCount"
                type="number"
                min="1"
                max="5000"
                value={boxes}
                onChange={(e) => setBoxes(Math.max(1, parseInt(e.target.value || '1', 10)))}
                required
              />
              <p className="mt-1 text-xs text-slate-500">Количество коробов (минимум 1)</p>
            </div>

            <div>
              <Label htmlFor="totalPalletsCount" required>
                4. Количество паллет
              </Label>
              <Input
                id="totalPalletsCount"
                name="totalPalletsCount"
                type="number"
                min="0"
                max="100"
                value={pallets}
                onChange={(e) => setPallets(Math.max(0, parseInt(e.target.value || '0', 10)))}
                required
              />
              <p className="mt-1 text-xs text-slate-500">Укажите 0, если отгрузка россыпью в коробах</p>
            </div>
          </div>

          {/* Step 4: Client Comment (Optional) */}
          <div className="pt-2 border-t border-slate-100">
            <Label htmlFor="clientComment">
              5. Комментарий к заявке (необязательно)
            </Label>
            <Textarea
              id="clientComment"
              name="clientComment"
              placeholder="Дополнительные пожелания или примечания для логистов..."
              rows={3}
            />
          </div>
        </Card>

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
            disabled={availableWarehouses.length === 0}
            className="shadow-sm"
          >
            Отправить заявку в работу
          </Button>
        </div>
      </div>

      {/* Side Summary Card */}
      <div className="lg:col-span-4">
        <div className="sticky top-24 space-y-4">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-3 border-b border-slate-100">
              <CardTitle className="text-base text-slate-900">Параметры заявки</CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-4 text-xs">
              <div>
                <span className="text-slate-500">Маркетплейс:</span>
                <div className="mt-1 font-semibold text-slate-900">
                  <Badge variant={selectedWarehouse?.marketplace === 'WILDBERRIES' ? 'default' : 'warning'}>
                    {selectedWarehouse?.marketplace || 'Не выбран'}
                  </Badge>
                </div>
              </div>

              <div>
                <span className="text-slate-500">Склад приёмки:</span>
                <div className="font-semibold text-slate-900 mt-0.5 text-sm">
                  {selectedWarehouse?.name || '—'}
                </div>
                {selectedWarehouse && (
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    График: {selectedWarehouse.scheduleDescription}
                  </div>
                )}
              </div>

              <div>
                <span className="text-slate-500">Дата доставки:</span>
                <div className="font-semibold text-slate-900 mt-0.5 text-sm">
                  {deliveryDate} ({dayOfWeekName})
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
                <div>
                  <span className="text-slate-500">Коробок:</span>
                  <div className="text-base font-bold text-slate-900 mt-0.5">{boxes} шт.</div>
                </div>
                <div>
                  <span className="text-slate-500">Паллет:</span>
                  <div className="text-base font-bold text-slate-900 mt-0.5">{pallets} шт.</div>
                </div>
              </div>

              <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-blue-900 text-[11px] leading-relaxed">
                <span className="font-bold">Регламент:</span> После отправки заявка поступает в обработку логистами AliBros. Самостоятельное редактирование или отмена заявки после подтверждения блокируется.
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </form>
  );
}
