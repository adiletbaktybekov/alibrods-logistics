'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTelegramWebApp } from './telegram-webapp-provider';

export function MiniAppNav() {
  const pathname = usePathname();
  const { triggerHaptic } = useTelegramWebApp();

  // Don't render nav on the linking screen
  if (pathname === '/miniapp/link') return null;

  const tabs = [
    {
      href: '/miniapp',
      label: 'Главная',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      ),
    },
    {
      href: '/miniapp/orders',
      label: 'Заявки',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
      ),
    },
    {
      href: '/miniapp/orders/new',
      label: 'Создать',
      isPrimary: true,
      icon: (
        <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
        </svg>
      ),
    },
    {
      href: '/miniapp/profile',
      label: 'Профиль',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      ),
    },
  ];

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-1 px-4">
      <div className="flex items-center justify-around max-w-md mx-auto">
        {tabs.map((tab) => {
          const isActive =
            tab.href === '/miniapp'
              ? pathname === '/miniapp'
              : pathname === tab.href || pathname.startsWith(tab.href + '/');

          if (tab.isPrimary) {
            return (
              <Link
                key={tab.href}
                href={tab.href}
                onClick={() => triggerHaptic('impact')}
                className="flex flex-col items-center -mt-4 focus:outline-none"
              >
                <div className="w-12 h-12 rounded-full bg-brand-600 shadow-md flex items-center justify-center text-white active:scale-95 transition-transform">
                  {tab.icon}
                </div>
                <span className="text-[10px] font-semibold text-brand-600 mt-1">
                  {tab.label}
                </span>
              </Link>
            );
          }

          return (
            <Link
              key={tab.href}
              href={tab.href}
              onClick={() => triggerHaptic('impact')}
              className={`flex flex-col items-center py-1 px-3 rounded-lg transition-colors ${
                isActive ? 'text-brand-600 font-semibold' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <div>{tab.icon}</div>
              <span className="text-[10px] mt-0.5">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
