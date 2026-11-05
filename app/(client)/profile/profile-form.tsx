'use client';

import * as React from 'react';
import { useActionState } from 'react';
import { updateClientProfileAction } from '@/app/actions/profile';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { WarehouseItem } from '@/modules/warehouses/warehouses.service';

interface ProfileFormProps {
  client: {
    companyName: string;
    contactPerson: string;
    contactPhone: string;
    contactEmail?: string | null;
    inn?: string | null;
    defaultWarehouseId?: string | null;
  };
  warehouses: WarehouseItem[];
}

export function ProfileForm({ client, warehouses }: ProfileFormProps) {
  const [state, formAction, isPending] = useActionState(updateClientProfileAction, null);

  return (
    <form action={formAction} className="space-y-6">
      {state?.error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-sm font-medium text-red-700">
          {state.error}
        </div>
      )}

      {state?.success && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-sm font-medium text-emerald-800">
          {state.message || 'Профиль успешно сохранён'}
        </div>
      )}

      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="pb-3 border-b border-slate-100">
          <CardTitle className="text-base text-slate-900">Данные компании и реквизиты</CardTitle>
        </CardHeader>
        <CardContent className="pt-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="companyName" required>
                Название компании / Бренд
              </Label>
              <Input
                id="companyName"
                name="companyName"
                defaultValue={client.companyName}
                required
              />
            </div>

            <div>
              <Label htmlFor="inn">
                ИНН компании
              </Label>
              <Input
                id="inn"
                name="inn"
                defaultValue={client.inn || ''}
                placeholder="10-14 цифр"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="contactPerson" required>
                Контактное лицо
              </Label>
              <Input
                id="contactPerson"
                name="contactPerson"
                defaultValue={client.contactPerson}
                required
              />
            </div>

            <div>
              <Label htmlFor="contactPhone" required>
                Телефон для связи
              </Label>
              <Input
                id="contactPhone"
                name="contactPhone"
                defaultValue={client.contactPhone}
                required
              />
            </div>
          </div>

          <div>
            <Label htmlFor="contactEmail">
              Email для отчётов и уведомлений
            </Label>
            <Input
              id="contactEmail"
              name="contactEmail"
              type="email"
              defaultValue={client.contactEmail || ''}
            />
          </div>

          <div>
            <Label htmlFor="defaultWarehouseId">
              Предпочтительный склад сдачи по умолчанию
            </Label>
            <Select
              id="defaultWarehouseId"
              name="defaultWarehouseId"
              defaultValue={client.defaultWarehouseId || ''}
            >
              <option value="">Не выбран (выбирать при каждой заявке)</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} ({w.city})
                </option>
              ))}
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" variant="primary" isLoading={isPending} className="shadow-sm">
          Сохранить изменения
        </Button>
      </div>
    </form>
  );
}
