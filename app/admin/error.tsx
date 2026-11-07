'use client';

import * as React from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    // Only log if not an expected auth redirection or challenge
    const name = error.name;
    if (name !== 'UnauthorizedError' && name !== 'ForbiddenError') {
      console.error('Admin route error:', error);
    }
  }, [error]);

  const isAuthError =
    error.name === 'UnauthorizedError' ||
    error.name === 'ForbiddenError' ||
    error.message?.includes('авторизац') ||
    error.message?.includes('Доступ');

  return (
    <div className="flex items-center justify-center min-h-[50vh] p-4">
      <Card className="w-full max-w-md border-slate-200 shadow-md bg-white">
        <CardContent className="p-6 text-center space-y-4">
          <div className="w-12 h-12 mx-auto rounded-full bg-amber-50 text-amber-600 flex items-center justify-center text-xl font-bold">
            !
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              {isAuthError ? 'Требуется авторизация сотрудника' : 'Ошибка при загрузке данных'}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {isAuthError
                ? 'Сессия истекла или у вашей учётной записи недостаточно прав для просмотра этого раздела.'
                : error.message || 'Произошла непредвиденная ошибка на сервере.'}
            </p>
          </div>
          <div className="pt-2 flex flex-col sm:flex-row gap-2 justify-center">
            {isAuthError ? (
              <Link href="/login" className="w-full sm:w-auto">
                <Button className="w-full bg-brand-600 hover:bg-brand-700 text-white">
                  Войти в систему
                </Button>
              </Link>
            ) : (
              <>
                <Button
                  onClick={() => reset()}
                  className="w-full sm:w-auto bg-brand-600 hover:bg-brand-700 text-white"
                >
                  Повторить попытку
                </Button>
                <Link href="/admin" className="w-full sm:w-auto">
                  <Button variant="outline" className="w-full">
                    На главную админки
                  </Button>
                </Link>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
