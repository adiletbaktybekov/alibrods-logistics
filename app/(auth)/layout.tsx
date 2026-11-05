import * as React from 'react';
import Link from 'next/link';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-100 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <Link href="/login" className="inline-flex items-center gap-2">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 text-white font-extrabold text-xl shadow-md">
            AB
          </span>
          <span className="text-2xl font-extrabold text-slate-900 tracking-tight">
            AliBros Logistics
          </span>
        </Link>
        <p className="mt-2 text-xs uppercase tracking-wider font-semibold text-slate-500">
          Личный кабинет селлера Wildberries & Ozon
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 shadow-sm border border-slate-200 rounded-2xl sm:px-10">
          {children}
        </div>
      </div>
    </div>
  );
}
