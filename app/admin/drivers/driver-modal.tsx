'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { createDriverAction } from '@/app/actions/admin';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface ActionState {
  success?: boolean;
  error?: string;
  message?: string;
}

export function DriverModal() {
  const [isOpen, setIsOpen] = React.useState(false);
  const router = useRouter();

  const [state, formAction, isPending] = React.useActionState<ActionState | null, FormData>(
    async (prev, formData) => {
      const res = await createDriverAction(prev, formData);
      if (res.success) {
        setTimeout(() => {
          setIsOpen(false);
          router.refresh();
        }, 1200);
      }
      return res;
    },
    null
  );

  return (
    <>
      <Button
        onClick={() => setIsOpen(true)}
        variant="primary"
        size="md"
        className="shadow-sm"
      >
        + Добавить водителя
      </Button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl border border-slate-200">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-900">Регистрация водителя</h2>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-lg leading-none"
              >
                ✕
              </button>
            </div>

            {/* Messages */}
            {state?.error && (
              <div className="mt-4 rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800">
                {state.error}
              </div>
            )}

            {state?.success && (
              <div className="mt-4 rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-800">
                {state.message || 'Водитель успешно добавлен'}
              </div>
            )}

            {/* Form */}
            <form action={formAction} className="mt-4 space-y-4">
              <div>
                <Label htmlFor="fullName" className="text-xs font-semibold text-slate-700">
                  ФИО водителя *
                </Label>
                <Input
                  id="fullName"
                  name="fullName"
                  required
                  placeholder="Иванов Алексей Сергеевич"
                  className="mt-1 text-xs"
                />
              </div>

              <div>
                <Label htmlFor="phone" className="text-xs font-semibold text-slate-700">
                  Номер телефона *
                </Label>
                <Input
                  id="phone"
                  name="phone"
                  type="tel"
                  required
                  placeholder="+7 (999) 123-45-67"
                  className="mt-1 text-xs font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="vehicleModel" className="text-xs font-semibold text-slate-700">
                    Марка и модель авто
                  </Label>
                  <Input
                    id="vehicleModel"
                    name="vehicleModel"
                    placeholder="ГАЗель Next, Ford Transit"
                    className="mt-1 text-xs"
                  />
                </div>

                <div>
                  <Label htmlFor="vehiclePlateNumber" className="text-xs font-semibold text-slate-700">
                    Госномер автомобиля
                  </Label>
                  <Input
                    id="vehiclePlateNumber"
                    name="vehiclePlateNumber"
                    placeholder="А 123 ВС 777"
                    className="mt-1 text-xs font-mono uppercase"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="notes" className="text-xs font-semibold text-slate-700">
                  Служебные примечания
                </Label>
                <Input
                  id="notes"
                  name="notes"
                  placeholder="Пропуск в ТТК / СК, постоянный закреп"
                  className="mt-1 text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsOpen(false)}
                  disabled={isPending}
                >
                  Отмена
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={isPending}
                >
                  {isPending ? 'Сохранение...' : 'Зарегистрировать водителя'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
