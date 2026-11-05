'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTelegramWebApp } from '@/components/miniapp/telegram-webapp-provider';
import { linkMiniAppAccountAction } from '@/app/actions/miniapp-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function MiniAppLinkPage() {
  const router = useRouter();
  const { initData, telegramUser, triggerHaptic, recheckAuth } = useTelegramWebApp();

  const [login, setLogin] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleLink(e: React.FormEvent) {
    e.preventDefault();
    if (!login || !password) {
      setError('Заполните логин и пароль');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await linkMiniAppAccountAction(initData, login, password);
      if (res.success) {
        triggerHaptic('success');
        await recheckAuth();
        router.replace('/miniapp');
      } else {
        triggerHaptic('error');
        setError(res.error || 'Неверный логин или пароль');
      }
    } catch {
      triggerHaptic('error');
      setError('Ошибка сети при авторизации');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-4 pt-8 space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="w-14 h-14 rounded-2xl bg-brand-600 mx-auto flex items-center justify-center text-white text-xl font-black shadow-md">
          AB
        </div>
        <h1 className="text-xl font-bold text-slate-900 tracking-tight">
          Вход в кабинет селлера
        </h1>
        <p className="text-xs text-slate-500 max-w-xs mx-auto">
          {telegramUser?.first_name ? `${telegramUser.first_name}, для ` : 'Для '}
          доступа к поставкам привяжите ваш аккаунт AliBros к Telegram
        </p>
      </div>

      {error && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800">
          {error}
        </div>
      )}

      {/* Form */}
      <div className="rounded-2xl bg-white border border-slate-200 p-5 shadow-sm space-y-4">
        <form onSubmit={handleLink} className="space-y-4">
          <div>
            <Label htmlFor="login" className="text-xs font-semibold text-slate-700">
              Телефон или Email *
            </Label>
            <Input
              id="login"
              type="text"
              required
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              placeholder="+7 (999) 000-00-00"
              className="mt-1 text-xs"
            />
          </div>

          <div>
            <Label htmlFor="password" className="text-xs font-semibold text-slate-700">
              Пароль от кабинета *
            </Label>
            <Input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="mt-1 text-xs"
            />
          </div>

          <div className="pt-2">
            <Button
              type="submit"
              disabled={loading}
              variant="primary"
              size="md"
              className="w-full text-xs font-semibold py-2.5 shadow-sm"
            >
              {loading ? 'Проверка данных...' : 'Войти и связать с Telegram'}
            </Button>
          </div>
        </form>
      </div>

      <div className="text-center text-[11px] text-slate-400">
        У вас ещё нет аккаунта?{' '}
        <a
          href="/register"
          target="_blank"
          rel="noreferrer"
          className="text-brand-600 font-semibold hover:underline"
        >
          Зарегистрироваться на сайте ↗
        </a>
      </div>
    </div>
  );
}
