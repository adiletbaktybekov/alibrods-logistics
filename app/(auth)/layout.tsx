import * as React from 'react';
import { AliBrosLogo } from '@/components/ui/logo';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-100 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center flex flex-col items-center">
        <AliBrosLogo variant="full" href="/login" priority className="h-16 justify-center" />
        <p className="mt-3 text-xs uppercase tracking-wider font-semibold text-slate-500">
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
