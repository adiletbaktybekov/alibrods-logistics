'use client';

import * as React from 'react';
import { toggleNewsNotificationsAction } from '@/app/actions/news';

export function NewsNotificationToggle({ initialEnabled = true }: { initialEnabled?: boolean }) {
  const [enabled, setEnabled] = React.useState(initialEnabled);
  const [loading, setLoading] = React.useState(false);

  const handleToggle = async () => {
    const next = !enabled;
    setEnabled(next);
    setLoading(true);
    try {
      const res = await toggleNewsNotificationsAction(next);
      if (!res.success) {
        setEnabled(!next);
      }
    } catch {
      setEnabled(!next);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-between py-2">
      <div className="pr-4">
        <span className="text-xs font-semibold text-slate-800 block">
          Оповещения о новостях и регламентах
        </span>
        <span className="text-[11px] text-slate-400 block mt-0.5">
          Получать важные новости складов, изменения графиков и тарифов в Telegram
        </span>
      </div>
      <button
        type="button"
        disabled={loading}
        onClick={handleToggle}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
          enabled ? 'bg-brand-600' : 'bg-slate-200'
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
            enabled ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}
