'use client';

import * as React from 'react';
import { generateDriverLinkCodeAction } from '@/app/actions/admin';
import { Button } from '@/components/ui/button';

interface DriverCodeButtonProps {
  driverId: string;
  driverName: string;
  hasTelegram: boolean;
}

export function DriverCodeButton({ driverId, driverName, hasTelegram }: DriverCodeButtonProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [codeData, setCodeData] = React.useState<{
    code: string;
    expiresAt: Date;
    deepLink: string;
  } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    try {
      const res = await generateDriverLinkCodeAction(driverId);
      if (res.success && res.code && res.expiresAt && res.deepLink) {
        setCodeData({
          code: res.code,
          expiresAt: new Date(res.expiresAt),
          deepLink: res.deepLink,
        });
        setIsOpen(true);
      } else {
        setError(res.error || 'Ошибка при генерации кода');
      }
    } catch {
      setError('Ошибка сети при запросе кода');
    } finally {
      setLoading(false);
    }
  }

  function handleCopy() {
    if (codeData?.code) {
      navigator.clipboard.writeText(codeData.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <>
      <Button
        onClick={handleGenerate}
        disabled={loading}
        variant="outline"
        size="sm"
        className="text-[11px] h-7 px-2 border-slate-300 text-slate-700 hover:text-brand-600 hover:border-brand-400"
      >
        {loading ? '...' : hasTelegram ? 'Сброс/Код' : 'Код Telegram'}
      </Button>

      {error && (
        <span className="text-[10px] text-rose-600 block mt-1">{error}</span>
      )}

      {isOpen && codeData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">
                Код привязки Telegram для водителя
              </h3>
              <button
                onClick={() => setIsOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-sm leading-none"
              >
                ✕
              </button>
            </div>

            <div className="text-xs text-slate-600">
              Водитель: <span className="font-semibold text-slate-900">{driverName}</span>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-center space-y-2">
              <span className="text-xs text-slate-500 uppercase tracking-wider block">
                Одноразовый код (срок действия 30 мин):
              </span>
              <div className="text-2xl font-mono font-extrabold tracking-wider text-brand-600">
                {codeData.code}
              </div>
              <div className="flex justify-center gap-2 pt-1">
                <Button
                  type="button"
                  onClick={handleCopy}
                  variant="primary"
                  size="sm"
                  className="text-xs"
                >
                  {copied ? '✓ Скопировано' : 'Скопировать код'}
                </Button>
                <a
                  href={codeData.deepLink}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center px-3 py-1.5 rounded-lg border border-slate-300 text-xs text-slate-700 hover:bg-slate-100 font-medium"
                >
                  Открыть бота ↗
                </a>
              </div>
            </div>

            <div className="text-[11px] text-slate-500 bg-amber-50 border border-amber-200 p-2.5 rounded-lg">
              Передайте этот код водителю. Водитель отправляет код в Telegram-бот для мгновенной привязки аккаунта и доступа к рейсам. Код одноразовый.
            </div>

            <div className="flex justify-end pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsOpen(false)}
              >
                Закрыть
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
