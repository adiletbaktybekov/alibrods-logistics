import * as React from 'react';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/app/actions/auth';
import { AdminSidebar } from '@/components/navigation/admin-sidebar';

export const dynamic = 'force-dynamic';

const STAFF_ROLES = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT'];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }

  if (!STAFF_ROLES.includes(user.role)) {
    // Client or Driver attempting to access admin
    redirect('/dashboard');
  }

  return (
    <div className="flex min-h-screen flex-col lg:flex-row bg-slate-100 text-slate-900 font-sans antialiased">
      <AdminSidebar user={user} />
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
        <footer className="border-t border-slate-200 bg-white py-3 px-6 text-center text-xs text-slate-500">
          AliBros Logistics Internal ERP © {new Date().getFullYear()} — Доступ строго для авторизованных сотрудников
        </footer>
      </div>
    </div>
  );
}
