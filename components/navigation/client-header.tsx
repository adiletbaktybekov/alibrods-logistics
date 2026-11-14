'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { logoutAction } from '@/app/actions/auth';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AliBrosLogo } from '@/components/ui/logo';

interface ClientHeaderProps {
  user: {
    email?: string | null;
    phone?: string | null;
  };
  client?: {
    companyName?: string;
    contactPerson?: string;
  } | null;
}

export function ClientHeader({ user, client }: ClientHeaderProps) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  const navLinks = [
    { href: '/dashboard', label: 'Главная' },
    { href: '/orders', label: 'Мои заявки' },
    { href: '/orders/new', label: '+ Создать заявку' },
    { href: '/profile', label: 'Профиль' },
  ];

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200 bg-white shadow-sm">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand Logo */}
        <div className="flex items-center gap-8">
          <AliBrosLogo variant="compact" href="/dashboard" priority className="h-10" />

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center space-x-1">
            {navLinks.map((link) => {
              const isActive = pathname === link.href || (link.href !== '/dashboard' && pathname.startsWith(link.href));
              const isCreate = link.href === '/orders/new';

              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    'px-3.5 py-2 rounded-lg text-sm font-medium transition-colors',
                    isCreate
                      ? 'bg-brand-50 text-brand-700 hover:bg-brand-100 font-semibold'
                      : isActive
                      ? 'bg-slate-100 text-slate-950 font-semibold'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* User Info & Actions */}
        <div className="hidden md:flex items-center gap-4">
          <div className="text-right">
            <div className="text-sm font-semibold text-slate-900 leading-tight">
              {client?.companyName || 'Клиент'}
            </div>
            <div className="text-xs text-slate-500">
              {client?.contactPerson || user.phone || user.email || 'Селлер'}
            </div>
          </div>

          <form action={logoutAction}>
            <Button variant="outline" size="sm" type="submit" className="text-xs">
              Выйти
            </Button>
          </form>
        </div>

        {/* Mobile menu trigger */}
        <div className="flex md:hidden">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="inline-flex items-center justify-center rounded-md p-2 text-slate-700 hover:bg-slate-100 focus:outline-none"
            aria-label="Открыть меню"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              {mobileMenuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile menu dropdown */}
      {mobileMenuOpen && (
        <div className="border-b border-slate-200 bg-white md:hidden px-4 pt-2 pb-4 space-y-2">
          <div className="py-2 border-b border-slate-100 mb-2">
            <div className="font-semibold text-sm text-slate-900">{client?.companyName || 'Клиент'}</div>
            <div className="text-xs text-slate-500">{client?.contactPerson || user.phone || user.email}</div>
          </div>
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMobileMenuOpen(false)}
              className={cn(
                'block px-3 py-2 rounded-md text-base font-medium',
                pathname === link.href ? 'bg-slate-100 text-brand-600 font-bold' : 'text-slate-700 hover:bg-slate-50'
              )}
            >
              {link.label}
            </Link>
          ))}
          <form action={logoutAction} className="pt-2">
            <Button variant="outline" size="sm" type="submit" className="w-full justify-center">
              Выйти из аккаунта
            </Button>
          </form>
        </div>
      )}
    </header>
  );
}
