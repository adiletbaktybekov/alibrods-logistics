'use client';

import * as React from 'react';
import Link from 'next/link';
import { useActionState } from 'react';
import { registerAction } from '@/app/actions/auth';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

export default function RegisterPage() {
  const [state, formAction, isPending] = useActionState(registerAction, null);

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-slate-900 tracking-tight">Регистрация селлера</h2>
        <p className="text-sm text-slate-500 mt-1">
          Создайте аккаунт вашей компании для отправки товаров на склады WB и Ozon
        </p>
      </div>

      {state?.error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-xs font-medium text-red-700">
          {state.error}
        </div>
      )}

      <form action={formAction} className="space-y-4">
        <div>
          <Label htmlFor="companyName" required>
            Название компании / ИП / ОсОО
          </Label>
          <Input
            id="companyName"
            name="companyName"
            placeholder="ИП Смирнов А.В. или ОсОО «Трейд»"
            required
          />
        </div>

        <div>
          <Label htmlFor="contactPerson" required>
            Контактное лицо (ФИО)
          </Label>
          <Input
            id="contactPerson"
            name="contactPerson"
            placeholder="Иванов Иван Иванович"
            required
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label htmlFor="phone" required>
              Телефон
            </Label>
            <Input
              id="phone"
              name="phone"
              type="tel"
              placeholder="+996555123456"
              required
            />
          </div>

          <div>
            <Label htmlFor="inn">
              ИНН компании
            </Label>
            <Input
              id="inn"
              name="inn"
              placeholder="10-14 цифр"
            />
          </div>
        </div>

        <div>
          <Label htmlFor="email">
            Email (для уведомлений)
          </Label>
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="seller@example.com"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label htmlFor="password" required>
              Пароль
            </Label>
            <Input
              id="password"
              name="password"
              type="password"
              placeholder="Минимум 8 символов"
              required
            />
            <p className="mt-1 text-xs text-slate-500">Минимум 8 символов</p>
          </div>

          <div>
            <Label htmlFor="confirmPassword" required>
              Повторите пароль
            </Label>
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              placeholder="Повторите пароль"
              required
            />
          </div>
        </div>

        <Button type="submit" variant="primary" className="w-full mt-2" isLoading={isPending}>
          Зарегистрироваться
        </Button>
      </form>

      <div className="mt-6 pt-6 border-t border-slate-200 text-center text-xs text-slate-600">
        Уже зарегистрированы?{' '}
        <Link href="/login" className="font-semibold text-brand-600 hover:text-brand-700">
          Войти в кабинет
        </Link>
      </div>
    </div>
  );
}
