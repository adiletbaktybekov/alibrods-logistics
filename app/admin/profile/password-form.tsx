'use client';

import * as React from 'react';
import { useActionState, useState } from 'react';
import { changePasswordAction } from '@/app/actions/admin';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface ActionState {
  success?: boolean;
  error?: string;
  message?: string;
}

export function PasswordChangeForm() {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    changePasswordAction,
    {}
  );

  const [newPassword, setNewPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Complexity rules checks
  const hasMinLength = newPassword.length >= 12;
  const hasUpper = /[A-Z]/.test(newPassword);
  const hasLower = /[a-z]/.test(newPassword);
  const hasDigit = /[0-9]/.test(newPassword);
  const hasSpecial = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(newPassword);

  return (
    <Card className="border-slate-200 shadow-sm bg-white">
      <CardHeader className="pb-3 border-b border-slate-100">
        <CardTitle className="text-base text-slate-900">
          Смена пароля учётной записи
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4">
        {state.success && (
          <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 flex items-center gap-2">
            <span>✅</span>
            <span>{state.message || 'Пароль успешно обновлён'}</span>
          </div>
        )}

        {state.error && (
          <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 flex items-center gap-2">
            <span>⚠️</span>
            <span>{state.error}</span>
          </div>
        )}

        <form action={formAction} className="space-y-4 max-w-md">
          {/* Current Password */}
          <div>
            <label
              htmlFor="currentPassword"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              Текущий пароль
            </label>
            <div className="relative">
              <input
                id="currentPassword"
                name="currentPassword"
                type={showCurrent ? 'text' : 'password'}
                required
                autoComplete="current-password"
                placeholder="••••••••••••"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 pr-10 text-xs text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
              <button
                type="button"
                onClick={() => setShowCurrent(!showCurrent)}
                tabIndex={-1}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600 text-xs"
              >
                {showCurrent ? 'Скрыть' : 'Показать'}
              </button>
            </div>
          </div>

          {/* New Password */}
          <div>
            <label
              htmlFor="newPassword"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              Новый пароль
            </label>
            <div className="relative">
              <input
                id="newPassword"
                name="newPassword"
                type={showNew ? 'text' : 'password'}
                required
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 pr-10 text-xs text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                tabIndex={-1}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600 text-xs"
              >
                {showNew ? 'Скрыть' : 'Показать'}
              </button>
            </div>

            {/* Complexity Indicator */}
            {newPassword.length > 0 && (
              <div className="mt-2 p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-[11px] space-y-1">
                <div className="font-semibold text-slate-700 mb-1">
                  Требования к безопасности пароля:
                </div>
                <div className={hasMinLength ? 'text-emerald-700' : 'text-slate-400'}>
                  {hasMinLength ? '✓' : '○'} Не менее 12 символов
                </div>
                <div className={hasUpper ? 'text-emerald-700' : 'text-slate-400'}>
                  {hasUpper ? '✓' : '○'} Заглавная латинская буква (A-Z)
                </div>
                <div className={hasLower ? 'text-emerald-700' : 'text-slate-400'}>
                  {hasLower ? '✓' : '○'} Строчная латинская буква (a-z)
                </div>
                <div className={hasDigit ? 'text-emerald-700' : 'text-slate-400'}>
                  {hasDigit ? '✓' : '○'} Цифра (0-9)
                </div>
                <div className={hasSpecial ? 'text-emerald-700' : 'text-slate-400'}>
                  {hasSpecial ? '✓' : '○'} Специальный символ (!@#$%^&*...)
                </div>
              </div>
            )}
          </div>

          {/* Confirm New Password */}
          <div>
            <label
              htmlFor="confirmPassword"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              Подтверждение нового пароля
            </label>
            <div className="relative">
              <input
                id="confirmPassword"
                name="confirmPassword"
                type={showConfirm ? 'text' : 'password'}
                required
                autoComplete="new-password"
                placeholder="••••••••••••"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 pr-10 text-xs text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                tabIndex={-1}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600 text-xs"
              >
                {showConfirm ? 'Скрыть' : 'Показать'}
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <div className="pt-2">
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={isPending}
              className="w-full sm:w-auto"
            >
              {isPending ? 'Сохранение...' : 'Обновить пароль'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
