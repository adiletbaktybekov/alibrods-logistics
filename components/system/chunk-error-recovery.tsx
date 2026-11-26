'use client';

import * as React from 'react';

export const CHUNK_RELOAD_STORAGE_KEY = 'alibros_chunk_reload_at';
export const CHUNK_RELOAD_COOLDOWN_MS = 30_000;

export function isChunkLoadErrorMessage(message?: string | null): boolean {
  if (!message) return false;
  const text = String(message);
  return (
    /ChunkLoadError/i.test(text) ||
    /Loading chunk [\w-]+ failed/i.test(text) ||
    /Loading CSS chunk [\w-]+ failed/i.test(text) ||
    /Failed to fetch dynamically imported module/i.test(text) ||
    /Importing a module script failed/i.test(text) ||
    /error loading dynamically imported module/i.test(text)
  );
}

export function canAttemptAutoReload(
  storage: Pick<Storage, 'getItem' | 'setItem'> | null | undefined,
  now = Date.now()
): boolean {
  if (!storage) return false;
  try {
    const raw = storage.getItem(CHUNK_RELOAD_STORAGE_KEY);
    if (raw) {
      const last = Number(raw);
      if (Number.isFinite(last) && now - last < CHUNK_RELOAD_COOLDOWN_MS) {
        return false;
      }
    }
    storage.setItem(CHUNK_RELOAD_STORAGE_KEY, String(now));
    return true;
  } catch {
    return false;
  }
}

function isNextStaticAssetTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== 'object') return false;
  const el = target as { tagName?: string; src?: string; href?: string };
  const tag = (el.tagName || '').toUpperCase();
  if (tag === 'SCRIPT' && typeof el.src === 'string' && el.src.includes('/_next/static/')) {
    return true;
  }
  if (tag === 'LINK' && typeof el.href === 'string' && el.href.includes('/_next/static/')) {
    return true;
  }
  return false;
}

export function ChunkErrorRecovery() {
  const [hasAssetError, setHasAssetError] = React.useState(false);

  React.useEffect(() => {
    const handleChunkFailure = () => {
      if (canAttemptAutoReload(typeof window !== 'undefined' ? window.sessionStorage : null)) {
        window.location.reload();
        return;
      }
      setHasAssetError(true);
    };

    const onError = (event: ErrorEvent) => {
      if (isNextStaticAssetTarget(event.target)) {
        handleChunkFailure();
        return;
      }
      const msg = event.message || event.error?.message || event.error?.name;
      if (isChunkLoadErrorMessage(msg)) {
        handleChunkFailure();
      }
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const msg =
        typeof reason === 'string'
          ? reason
          : reason?.message || reason?.name || '';
      if (isChunkLoadErrorMessage(msg)) {
        handleChunkFailure();
      }
    };

    window.addEventListener('error', onError, true);
    window.addEventListener('unhandledrejection', onUnhandledRejection);

    return () => {
      window.removeEventListener('error', onError, true);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
    };
  }, []);

  if (!hasAssetError) {
    return null;
  }

  return (
    <div
      role="alert"
      style={{
        position: 'fixed',
        bottom: '16px',
        left: '16px',
        right: '16px',
        maxWidth: '460px',
        margin: '0 auto',
        zIndex: 2147483647,
        backgroundColor: '#ffffff',
        color: '#0f172a',
        border: '1px solid #fecdd3',
        borderRadius: '14px',
        padding: '14px 16px',
        boxShadow: '0 10px 30px rgba(15, 23, 42, 0.16)',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        fontSize: '13px',
        lineHeight: 1.45,
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: '4px', color: '#9f1239' }}>
        Не удалось загрузить часть интерфейса
      </div>
      <div style={{ color: '#475569', marginBottom: '12px' }}>
        Возможно, обновилась версия сайта или нестабильно интернет-соединение. Нажмите кнопку ниже,
        чтобы перезагрузить страницу.
      </div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => {
            try {
              window.sessionStorage.removeItem(CHUNK_RELOAD_STORAGE_KEY);
            } catch {
              // ignore
            }
            window.location.reload();
          }}
          style={{
            backgroundColor: '#6C38CC',
            color: '#ffffff',
            border: 'none',
            borderRadius: '8px',
            padding: '8px 14px',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Обновить страницу
        </button>
        <button
          type="button"
          onClick={() => setHasAssetError(false)}
          style={{
            backgroundColor: '#f1f5f9',
            color: '#334155',
            border: '1px solid #cbd5e1',
            borderRadius: '8px',
            padding: '8px 12px',
            fontSize: '12px',
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          Закрыть
        </button>
      </div>
    </div>
  );
}
