'use client';

import * as React from 'react';
import {
  isChunkLoadErrorMessage,
  canAttemptAutoReload,
  CHUNK_RELOAD_STORAGE_KEY,
} from '@/components/system/chunk-error-recovery';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isChunkError = React.useMemo(
    () => isChunkLoadErrorMessage(error?.message || error?.name),
    [error]
  );

  React.useEffect(() => {
    if (isChunkError && canAttemptAutoReload(typeof window !== 'undefined' ? window.sessionStorage : null)) {
      window.location.reload();
      return;
    }
    console.error('Application route error:', error);
  }, [error, isChunkError]);

  const handleHardReload = () => {
    try {
      window.sessionStorage.removeItem(CHUNK_RELOAD_STORAGE_KEY);
    } catch {
      // ignore
    }
    window.location.reload();
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        backgroundColor: '#f1f5f9',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '420px',
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          border: '1px solid #e2e8f0',
          padding: '28px 24px',
          textAlign: 'center',
          boxShadow: '0 4px 16px rgba(15, 23, 42, 0.06)',
        }}
      >
        <div
          style={{
            width: '48px',
            height: '48px',
            borderRadius: '9999px',
            backgroundColor: '#fef3c7',
            color: '#b45309',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: '20px',
            margin: '0 auto 16px',
          }}
        >
          !
        </div>
        <h1
          style={{
            margin: '0 0 8px',
            fontSize: '18px',
            fontWeight: 700,
            color: '#0f172a',
          }}
        >
          {isChunkError ? 'Доступна обновлённая версия сайта' : 'Не удалось загрузить страницу'}
        </h1>
        <p
          style={{
            margin: '0 0 20px',
            fontSize: '13px',
            lineHeight: 1.5,
            color: '#475569',
          }}
        >
          {isChunkError
            ? 'Часть файлов интерфейса устарела или не загрузилась из-за нестабильного соединения. Обновите страницу, чтобы продолжить работу.'
            : 'Произошла временная ошибка при загрузке интерфейса. Попробуйте повторить попытку или обновить страницу.'}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button
            type="button"
            onClick={handleHardReload}
            style={{
              width: '100%',
              backgroundColor: '#6C38CC',
              color: '#ffffff',
              border: 'none',
              borderRadius: '10px',
              padding: '10px 16px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Обновить страницу
          </button>
          {!isChunkError && (
            <button
              type="button"
              onClick={() => reset()}
              style={{
                width: '100%',
                backgroundColor: '#ffffff',
                color: '#334155',
                border: '1px solid #cbd5e1',
                borderRadius: '10px',
                padding: '10px 16px',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Повторить попытку
            </button>
          )}
          <a
            href="/login"
            style={{
              marginTop: '4px',
              fontSize: '12px',
              fontWeight: 600,
              color: '#6C38CC',
              textDecoration: 'none',
            }}
          >
            Перейти на страницу входа
          </a>
        </div>
      </div>
    </div>
  );
}
