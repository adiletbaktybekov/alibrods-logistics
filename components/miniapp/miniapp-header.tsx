'use client';

import * as React from 'react';
import Link from 'next/link';

export function MiniAppHeader({ title, subtitle }: { title?: string; subtitle?: string }) {
  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-100 px-4 py-3 flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-lg bg-brand-600 flex items-center justify-center text-white text-xs font-black shadow-xs">
          AB
        </div>
        <div>
          <h1 className="text-sm font-bold text-slate-900 leading-tight">
            {title || 'AliBros Logistics'}
          </h1>
          {subtitle && (
            <p className="text-[10px] text-slate-400 leading-none mt-0.5">{subtitle}</p>
          )}
        </div>
      </div>
      <Link
        href="/miniapp/profile"
        className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 hover:bg-slate-200 text-xs"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      </Link>
    </header>
  );
}
