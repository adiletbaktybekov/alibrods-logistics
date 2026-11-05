'use client';

import * as React from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { verifyMiniAppDataAction } from '@/app/actions/miniapp-auth';

interface TelegramWebAppData {
  initData: string;
  initDataUnsafe?: {
    query_id?: string;
    user?: {
      id: number;
      first_name: string;
      last_name?: string;
      username?: string;
      language_code?: string;
    };
    auth_date?: string;
    hash?: string;
  };
  colorScheme?: 'light' | 'dark';
  themeParams?: Record<string, string>;
  isExpanded?: boolean;
  viewportHeight?: number;
  viewportStableHeight?: number;
  ready: () => void;
  expand: () => void;
  close: () => void;
  HapticFeedback?: {
    impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
    notificationOccurred: (type: 'error' | 'success' | 'warning') => void;
    selectionChanged: () => void;
  };
  BackButton?: {
    isVisible: boolean;
    show: () => void;
    hide: () => void;
    onClick: (cb: () => void) => void;
    offClick: (cb: () => void) => void;
  };
}

declare global {
  interface Window {
    Telegram?: {
      WebApp?: TelegramWebAppData;
    };
  }
}

interface TelegramContextValue {
  isReady: boolean;
  initData: string;
  isCheckingAuth: boolean;
  isLinked: boolean;
  telegramUser: { id: number; first_name: string; username?: string } | null;
  theme: 'light' | 'dark';
  recheckAuth: () => Promise<void>;
  triggerHaptic: (type?: 'impact' | 'success' | 'error') => void;
}

const TelegramContext = React.createContext<TelegramContextValue>({
  isReady: false,
  initData: '',
  isCheckingAuth: true,
  isLinked: true,
  telegramUser: null,
  theme: 'light',
  recheckAuth: async () => {},
  triggerHaptic: () => {},
});

export function TelegramWebAppProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const [isReady, setIsReady] = React.useState(false);
  const [initData, setInitData] = React.useState('');
  const [isCheckingAuth, setIsCheckingAuth] = React.useState(true);
  const [isLinked, setIsLinked] = React.useState(true);
  const [telegramUser, setTelegramUser] = React.useState<{ id: number; first_name: string; username?: string } | null>(null);
  const [theme, setTheme] = React.useState<'light' | 'dark'>('light');

  const checkAuth = React.useCallback(async (dataString: string) => {
    setIsCheckingAuth(true);
    try {
      const res = await verifyMiniAppDataAction(dataString);
      if (res.success) {
        setIsLinked(Boolean(res.isLinked));
        if (res.telegramUser) {
          setTelegramUser(res.telegramUser);
        }
        if (!res.isLinked && pathname !== '/miniapp/link') {
          router.replace('/miniapp/link');
        }
      } else {
        // Fallback for non-telegram environments
        setIsLinked(true);
      }
    } catch {
      setIsLinked(true);
    } finally {
      setIsCheckingAuth(false);
    }
  }, [pathname, router]);

  React.useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (tg) {
      try {
        tg.ready();
        tg.expand();
        if (tg.colorScheme) {
          setTheme(tg.colorScheme);
        }
        const data = tg.initData || '';
        setInitData(data);
        setIsReady(true);
        checkAuth(data);
      } catch {
        setIsReady(true);
        setIsCheckingAuth(false);
      }
    } else {
      // Running in browser outside Telegram
      setIsReady(true);
      setIsCheckingAuth(false);
    }
  }, [checkAuth]);

  // BackButton management
  React.useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (!tg?.BackButton) return;

    if (pathname !== '/miniapp') {
      tg.BackButton.show();
      const handleBack = () => router.back();
      tg.BackButton.onClick(handleBack);
      return () => {
        tg.BackButton?.offClick(handleBack);
        tg.BackButton?.hide();
      };
    } else {
      tg.BackButton.hide();
    }
  }, [pathname, router]);

  const triggerHaptic = React.useCallback((type: 'impact' | 'success' | 'error' = 'impact') => {
    const tg = window.Telegram?.WebApp?.HapticFeedback;
    if (!tg) return;
    try {
      if (type === 'impact') tg.impactOccurred('medium');
      else if (type === 'success') tg.notificationOccurred('success');
      else if (type === 'error') tg.notificationOccurred('error');
    } catch {
      // ignore
    }
  }, []);

  return (
    <TelegramContext.Provider
      value={{
        isReady,
        initData,
        isCheckingAuth,
        isLinked,
        telegramUser,
        theme,
        recheckAuth: () => checkAuth(initData),
        triggerHaptic,
      }}
    >
      {children}
    </TelegramContext.Provider>
  );
}

export function useTelegramWebApp() {
  return React.useContext(TelegramContext);
}
