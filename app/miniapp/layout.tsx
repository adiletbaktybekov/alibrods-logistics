import * as React from 'react';
import Script from 'next/script';
import { TelegramWebAppProvider } from '@/components/miniapp/telegram-webapp-provider';
import { MiniAppNav } from '@/components/miniapp/miniapp-nav';

export const dynamic = 'force-dynamic';

export default function MiniAppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
      <TelegramWebAppProvider>
        <div className="min-h-screen bg-slate-50 text-slate-900 font-sans antialiased flex flex-col justify-between selection:bg-brand-500 selection:text-white">
          <div className="flex-1 max-w-md w-full mx-auto pb-24">
            {children}
          </div>
          <MiniAppNav />
        </div>
      </TelegramWebAppProvider>
    </>
  );
}
