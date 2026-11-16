'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { deleteDriverAction } from '@/app/actions/admin';
import { Button } from '@/components/ui/button';
import { formatPhoneNumber } from '@/lib/phone';

interface DriverDeleteButtonProps {
  driverId: string;
  driverName: string;
  driverPhone?: string | null;
  assignmentsCount?: number;
  redirectTo?: string;
  className?: string;
}

export function DriverDeleteButton({
  driverId,
  driverName,
  driverPhone,
  assignmentsCount = 0,
  redirectTo,
  className,
}: DriverDeleteButtonProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleDelete() {
    setLoading(true);
    setError(null);
    try {
      const res = await deleteDriverAction(driverId);
      if (res.success) {
        setIsOpen(false);
        if (redirectTo) {
          router.push(redirectTo);
        } else {
          router.refresh();
        }
      } else {
        setError(res.error || 'Ошибка при удалении водителя');
      }
    } catch {
      setError('Произошла непредвиденная ошибка');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          setError(null);
          setIsOpen(true);
        }}
        className={className || "text-[11px] h-7 px-2 border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700"}
      >
        Удалить
      </Button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <span className="text-rose-500">⚠️</span> Удаление аккаунта водителя
              </h3>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-sm leading-none"
              >
                ✕
              </button>
            </div>

            <div className="text-xs space-y-2 text-slate-700 bg-slate-50 p-3 rounded-lg border border-slate-200">
              <div>
                <span className="text-slate-500 block">ФИО водителя:</span>
                <span className="font-semibold text-slate-900 text-sm">{driverName}</span>
              </div>
              {driverPhone && (
                <div>
                  <span className="text-slate-500 block">Номер Telegram / Телефон:</span>
                  <span className="font-mono text-slate-800">{formatPhoneNumber(driverPhone)}</span>
                </div>
              )}
              <div>
                <span className="text-slate-500 block">Всего назначений / рейсов:</span>
                <span className="font-semibold text-slate-800">{assignmentsCount}</span>
              </div>
            </div>

            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900">
              <p className="font-semibold mb-1">Правила безопасности:</p>
              <ul className="list-disc list-inside space-y-0.5 text-[11px] text-amber-800">
                <li>Если есть незавершённые рейсы, система заблокирует удаление.</li>
                <li>История выполненных доставок и фотоотчёты сохраняются в архиве.</li>
                <li>Telegram-бот и доступ водителя немедленно блокируются.</li>
              </ul>
            </div>

            {error && (
              <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsOpen(false)}
                disabled={loading}
              >
                Отмена
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleDelete}
                disabled={loading}
                className="bg-rose-600 hover:bg-rose-700 text-white"
              >
                {loading ? 'Удаление...' : 'Да, удалить водителя'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
