'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { syncGoogleSheetsAction } from '@/app/actions/admin';

interface SyncButtonProps {
  isConfigured: boolean;
}

export function SyncButton({ isConfigured }: SyncButtonProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    success?: boolean;
    message?: string;
    error?: string;
  } | null>(null);

  const handleSync = async () => {
    setLoading(true);
    setResult(null);
    try {
      const res = await syncGoogleSheetsAction();
      setResult(res);
    } catch (err: unknown) {
      setResult({
        success: false,
        error: err instanceof Error ? err.message : 'Ошибка при вызове синхронизации',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={handleSync}
          disabled={loading || !isConfigured}
          className="bg-brand-600 hover:bg-brand-700 text-white font-semibold text-xs px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
        >
          {loading ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              <span>Синхронизация...</span>
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span>Синхронизировать сейчас</span>
            </>
          )}
        </Button>

        {!isConfigured && (
          <span className="text-xs text-amber-600 font-medium bg-amber-50 px-2.5 py-1 rounded-md border border-amber-200">
            ⚠️ Ожидается настройка сервисного аккаунта в .env
          </span>
        )}
      </div>

      {result && (
        <div
          className={`p-3.5 rounded-xl border text-xs animate-in fade-in ${
            result.success
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <div className="font-semibold flex items-center gap-1.5">
            {result.success ? '✅ Синхронизация завершена' : '⚠️ Ошибка синхронизации'}
          </div>
          <p className="mt-1 text-slate-700">{result.message || result.error}</p>
        </div>
      )}
    </div>
  );
}
