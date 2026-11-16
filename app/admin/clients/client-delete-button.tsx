'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { deleteClientAction } from '@/app/actions/admin';
import { Button } from '@/components/ui/button';
import { formatPhoneNumber } from '@/lib/phone';

interface ClientDeleteButtonProps {
  clientId: string;
  companyName: string;
  contactPerson?: string | null;
  contactPhone?: string | null;
  ordersCount?: number;
  redirectTo?: string;
  className?: string;
}

export function ClientDeleteButton({
  clientId,
  companyName,
  contactPerson,
  contactPhone,
  ordersCount = 0,
  redirectTo,
  className,
}: ClientDeleteButtonProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleDelete() {
    setLoading(true);
    setError(null);
    try {
      const res = await deleteClientAction(clientId);
      if (res.success) {
        setIsOpen(false);
        if (redirectTo) {
          router.push(redirectTo);
        } else {
          router.refresh();
        }
      } else {
        setError(res.error || 'Ошибка при удалении клиента');
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
        className={className || "text-xs text-rose-600 border-rose-200 hover:bg-rose-50 hover:text-rose-700"}
      >
        Удалить
      </Button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <span className="text-rose-500">⚠️</span> Удаление аккаунта клиента
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
                <span className="text-slate-500 block">Компания:</span>
                <span className="font-semibold text-slate-900 text-sm">{companyName}</span>
              </div>
              {contactPerson && (
                <div>
                  <span className="text-slate-500 block">Контактное лицо:</span>
                  <span className="font-medium text-slate-800">{contactPerson}</span>
                </div>
              )}
              {contactPhone && (
                <div>
                  <span className="text-slate-500 block">Номер Telegram / Телефон:</span>
                  <span className="font-mono text-slate-800">{formatPhoneNumber(contactPhone)}</span>
                </div>
              )}
              <div>
                <span className="text-slate-500 block">Всего заявок в системе:</span>
                <span className="font-semibold text-slate-800">{ordersCount}</span>
              </div>
            </div>

            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900">
              <p className="font-semibold mb-1">Правила безопасности:</p>
              <ul className="list-disc list-inside space-y-0.5 text-[11px] text-amber-800">
                <li>Если есть незавершённые заявки, система заблокирует удаление.</li>
                <li>Завершённые заявки и финансовая история сохраняются в архиве.</li>
                <li>Доступ клиента в кабинет и Telegram-привязка аннулируются.</li>
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
                {loading ? 'Удаление...' : 'Да, удалить аккаунт'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
