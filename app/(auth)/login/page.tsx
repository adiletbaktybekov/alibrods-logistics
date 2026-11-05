'use client';

import * as React from 'react';
import Link from 'next/link';
import { useActionState } from 'react';
import { loginAction } from '@/app/actions/auth';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

export default function LoginPage() {
  const [state, formAction, isPending] = useActionState(loginAction, null);

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-slate-900 tracking-tight">Вход в личный кабинет</h2>
        <p className="text-sm text-slate-500 mt-1">
          Введите ваш email или номер телефона для доступа к заявкам
        </p>
      </div>

      {state?.error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-xs font-medium text-red-700">
          {state.error}
        </div>
      )}

      <form action={formAction} className="space-y-4">
        <div>
          <Label htmlFor="login" required>
            Email или телефон
          </Label>
          <Input
            id="login"
            name="login"
            type="text"
            placeholder="seller@example.com или +996555123456"
            autoComplete="username"
            required
          />
        </div>

        <div>
          <div className="flex items-center justify-between">
            <Label htmlFor="password" required>
              Пароль
            </Label>
          </div>
          <Input
            id="password"
            name="password"
            type="password"
            placeholder="••••••••"
            autoComplete="current-password"
            required
          />
        </div>

        <Button type="submit" variant="primary" className="w-full mt-2" isLoading={isPending}>
          Войти в кабинет
        </Button>
      </form>

      <div className="mt-6 pt-6 border-t border-slate-200 text-center text-xs text-slate-600">
        Впервые в AliBros Logistics?{' '}
        <Link href="/register" className="font-semibold text-brand-600 hover:text-brand-700">
          Зарегистрировать компанию
        </Link>
      </div>
    </div>
  );
}
