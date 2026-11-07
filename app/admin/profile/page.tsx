import * as React from 'react';
import { requireStaffUser, getStaffProfileAction } from '@/app/actions/admin';
import { logoutAction } from '@/app/actions/auth';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { UserRole } from '@prisma/client';
import { formatDateTime } from '@/lib/utils';
import { PasswordChangeForm } from './password-form';

export const dynamic = 'force-dynamic';

export default async function AdminProfilePage() {
  const staff = await requireStaffUser();
  const dbUser = await getStaffProfileAction();

  const roleNames: Record<UserRole, string> = {
    SUPER_ADMIN: 'Главный администратор (Superadmin)',
    ADMIN: 'Администратор системы',
    MANAGER: 'Операционный менеджер',
    ACCOUNTANT: 'Бухгалтер / Финансист',
    DRIVER: 'Водитель',
    CLIENT: 'Клиент',
  };

  const roleDescriptions: Record<UserRole, string> = {
    SUPER_ADMIN: 'Полный доступ ко всем модулям, назначению ролей, аудиту безопасности и системным настройкам.',
    ADMIN: 'Управление заявками, водителями, клиентами, расписанием складов и просмотр журнала аудита.',
    MANAGER: 'Оперативное подтверждение и отклонение заявок, диспетчеризация рейсов, назначение водителей.',
    ACCOUNTANT: 'Просмотр завершённых заявок, финансовая сверка, отчётность по взаиморасчётам.',
    DRIVER: 'Мобильный интерфейс водителя.',
    CLIENT: 'Клиентский кабинет оформления поставок.',
  };

  const currentRole = dbUser?.role || staff.role;
  const fullName = dbUser?.managerProfile?.fullName || 'Не указано';
  const department = dbUser?.managerProfile?.department || 'Не указан';
  const email = dbUser?.email || staff.email || 'Не указан';
  const phone = dbUser?.phone || dbUser?.managerProfile?.workPhone || staff.phone || 'Не указан';
  const userId = dbUser?.id || staff.id;
  const lastLogin = dbUser?.lastLoginAt ? formatDateTime(dbUser.lastLoginAt) : 'Текущая сессия';

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="pb-2 border-b border-slate-200">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Профиль сотрудника
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Служебные параметры учётной записи и уровень доступа
        </p>
      </div>

      {/* Account Info Card */}
      <Card className="border-slate-200 shadow-sm bg-white">
        <CardHeader className="pb-3 border-b border-slate-100 flex flex-row items-center justify-between">
          <CardTitle className="text-base text-slate-900">Данные аккаунта</CardTitle>
          <Badge variant="outline" className="text-xs bg-brand-50 text-brand-700 border-brand-200">
            {currentRole}
          </Badge>
        </CardHeader>
        <CardContent className="pt-4 space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <span className="text-slate-500 block">ФИО сотрудника:</span>
              <span className="font-semibold text-slate-900 text-sm">
                {fullName}
              </span>
            </div>

            <div>
              <span className="text-slate-500 block">Подразделение / Отдел:</span>
              <span className="font-semibold text-slate-900 text-sm">
                {department}
              </span>
            </div>

            <div>
              <span className="text-slate-500 block">Роль в системе:</span>
              <span className="font-semibold text-slate-900 text-sm">
                {roleNames[currentRole] || currentRole}
              </span>
              <p className="text-[11px] text-slate-500 mt-1">
                {roleDescriptions[currentRole]}
              </p>
            </div>

            <div>
              <span className="text-slate-500 block">ID пользователя:</span>
              <span className="font-mono text-slate-700 bg-slate-50 px-2 py-1 rounded border border-slate-200 inline-block mt-0.5 text-[11px]">
                {userId}
              </span>
            </div>

            <div>
              <span className="text-slate-500 block">Рабочий Email:</span>
              <span className="font-mono font-medium text-slate-900 text-sm">
                {email}
              </span>
            </div>

            <div>
              <span className="text-slate-500 block">Номер телефона:</span>
              <span className="font-mono font-medium text-slate-900 text-sm">
                {phone}
              </span>
            </div>

            <div>
              <span className="text-slate-500 block">Последний вход:</span>
              <span className="text-slate-700 text-xs">
                {lastLogin}
              </span>
            </div>

            <div>
              <span className="text-slate-500 block">Статус учётной записи:</span>
              <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded text-xs mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                {dbUser?.isActive !== false ? 'Активен' : 'Заблокирован'}
              </span>
            </div>
          </div>

            <div className="border-t border-slate-100 pt-3">
            <span className="text-slate-500 block">Политика безопасности:</span>
            <p className="text-slate-600 mt-0.5">
              Все действия сотрудника в административной панели логируются в неизменяемый журнал аудита (`AuditLog`) с фиксацией IP-адреса, времени и исходного/нового состояния объектов.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Password Change Form */}
      <PasswordChangeForm />

      {/* Session Management */}
      <Card className="border-slate-200 shadow-sm bg-white">
        <CardHeader className="pb-3 border-b border-slate-100">
          <CardTitle className="text-base text-slate-900">Завершение сеанса</CardTitle>
        </CardHeader>
        <CardContent className="pt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 text-xs">
          <div>
            <span className="font-semibold text-slate-900 block">Выход из аккаунта</span>
            <span className="text-slate-500">
              Сброс сессионного JWT токена и перенаправление на страницу входа
            </span>
          </div>
          <form action={logoutAction}>
            <Button
              type="submit"
              variant="danger"
              size="sm"
              className="w-full sm:w-auto"
            >
              Завершить сеанс
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

