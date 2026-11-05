'use client';

import * as React from 'react';
import Link from 'next/link';
import { useActionState } from 'react';
import { createOrderAction } from '@/app/actions/orders';
import { WarehouseItem } from '@/modules/warehouses/warehouses.service';
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
  const [selectedWarehouseId, setSelectedWarehouseId] = React.useState<string>(
    warehouses[0]?.id || ''
  );
  const [pallets, setPallets] = React.useState<number>(0);
  const [boxes, setBoxes] = React.useState<number>(1);

  const selectedWarehouse = warehouses.find((w) => w.id === selectedWarehouseId);

  // Default to tomorrow's date
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const minDateString = tomorrow.toISOString().split('T')[0];

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
          {/* Warehouse Selection */}
          <div>
            <Label htmlFor="warehouseId" required>
              Склад приёмки маркетплейса
            </Label>
            <Select
              id="warehouseId"
              name="warehouseId"
              value={selectedWarehouseId}
              onChange={(e) => setSelectedWarehouseId(e.target.value)}
              required
            >
              <optgroup label="Wildberries">
                {warehouses
                  .filter((w) => w.marketplace === 'WILDBERRIES')
                  .map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} — {w.city}
                    </option>
                  ))}
              </optgroup>
              <optgroup label="Ozon">
                {warehouses
                  .filter((w) => w.marketplace === 'OZON')
                  .map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} — {w.city}
                    </option>
                  ))}
              </optgroup>
            </Select>

            {selectedWarehouse && (
              <div className="mt-2.5 p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600 space-y-1">
                <div>
                  <span className="font-semibold text-slate-700">Адрес склада:</span>{' '}
                  {selectedWarehouse.address}
                </div>
                <div>
                  <span className="font-semibold text-slate-700">График работы:</span>{' '}
                  {selectedWarehouse.operatingHours || 'Круглосуточно (24/7)'}
                </div>
              </div>
            )}
          </div>

          {/* Delivery Date */}
          <div>
            <Label htmlFor="deliveryDate" required>
              Желаемая дата доставки на склад
            </Label>
            <Input
              id="deliveryDate"
              name="deliveryDate"
              type="date"
              min={minDateString}
              defaultValue={minDateString}
              required
            />
            <p className="mt-1 text-xs text-slate-500">
              Логистический рейс формируется накануне выбранной даты доставки
            </p>
          </div>

          {/* Cargo Quantities */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="totalBoxesCount" required>
                Количество коробок
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
              <p className="mt-1 text-xs text-slate-500">Общее число грузовых мест</p>
            </div>

            <div>
              <Label htmlFor="totalPalletsCount">
                Количество паллет
              </Label>
              <Input
                id="totalPalletsCount"
                name="totalPalletsCount"
                type="number"
                min="0"
                max="100"
                value={pallets}
                onChange={(e) => setPallets(Math.max(0, parseInt(e.target.value || '0', 10)))}
              />
              <p className="mt-1 text-xs text-slate-500">0 если отгрузка россыпью в коробах</p>
            </div>
          </div>

          {/* Client Comment */}
          <div>
            <Label htmlFor="clientComment">
              Комментарий к заявке
            </Label>
            <Textarea
              id="clientComment"
              name="clientComment"
              placeholder="Укажите особенности груза, контакты на объекте забора или специальные инструкции..."
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
          <Button type="submit" variant="primary" size="lg" isLoading={isPending} className="shadow-sm">
            Отправить заявку в работу
          </Button>
        </div>
      </div>

      {/* Side Summary Card */}
      <div className="lg:col-span-4">
        <div className="sticky top-24 space-y-4">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-3 border-b border-slate-100">
              <CardTitle className="text-base text-slate-900">Сводка по заявке</CardTitle>
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
                <span className="text-slate-500">Выбранный склад:</span>
                <div className="font-semibold text-slate-900 mt-0.5 text-sm">
                  {selectedWarehouse?.name || '—'}
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
                <span className="font-bold">Правила оформления:</span> После отправки заявка попадает операционным логистам для проверки и назначения водителя на рейс. Изменение параметров заявки после отправки блокируется.
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </form>
  );
}
