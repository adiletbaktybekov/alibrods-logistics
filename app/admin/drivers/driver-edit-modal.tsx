'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { updateDriverAction, unlinkDriverTelegramAction } from '@/app/actions/admin';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PhoneInput } from '@/components/ui/phone-input';

interface DriverEditModalProps {
  driver: {
    id: string;
    fullName: string;
    phone: string;
    vehicleModel?: string | null;
    vehiclePlateNumber?: string | null;
    notes?: string | null;
    isAvailable: boolean;
    isActive: boolean;
    telegramUsername?: string | null;
    telegramId?: string | number | bigint | null;
  };
}

export function DriverEditModal({ driver }: DriverEditModalProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isUnlinking, setIsUnlinking] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);
  const router = useRouter();

  // Form states
  const [fullName, setFullName] = React.useState(driver.fullName);
  const [phone, setPhone] = React.useState(driver.phone || '');
  const [vehicleModel, setVehicleModel] = React.useState(driver.vehicleModel || '');
  const [vehiclePlateNumber, setVehiclePlateNumber] = React.useState(driver.vehiclePlateNumber || '');
  const [notes, setNotes] = React.useState(driver.notes || '');
  const [isAvailable, setIsAvailable] = React.useState(driver.isAvailable);
  const [isActive, setIsActive] = React.useState(driver.isActive);

  // Telegram account status
  const [hasTelegram, setHasTelegram] = React.useState(Boolean(driver.telegramId || driver.telegramUsername));

  const handleOpen = () => {
    setFullName(driver.fullName);
    setPhone(driver.phone || '');
    setVehicleModel(driver.vehicleModel || '');
    setVehiclePlateNumber(driver.vehiclePlateNumber || '');
    setNotes(driver.notes || '');
    setIsAvailable(driver.isAvailable);
    setIsActive(driver.isActive);
    setHasTelegram(Boolean(driver.telegramId || driver.telegramUsername));
    setError(null);
    setSuccess(null);
    setIsOpen(true);
  };

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await updateDriverAction(driver.id, {
        fullName: fullName.trim(),
        phone: phone.trim(),
        vehicleModel: vehicleModel.trim() || null,
        vehiclePlateNumber: vehiclePlateNumber.trim() || null,
        notes: notes.trim() || null,
        isAvailable,
        isActive,
      });

      if (res.success) {
        setSuccess(res.message || 'Данные водителя успешно сохранены');
        setTimeout(() => {
          setIsOpen(false);
          router.refresh();
        }, 1200);
      } else {
        setError(res.error || 'Ошибка при сохранении данных');
      }
    } catch {
      setError('Ошибка сети при сохранении данных');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUnlinkTelegram = async () => {
    if (!confirm(`Вы действительно хотите отвязать Telegram аккаунт водителя «${driver.fullName}»? Водитель сможет повторно привязать бота по коду.`)) {
      return;
    }

    setIsUnlinking(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await unlinkDriverTelegramAction(driver.id);
      if (res.success) {
        setHasTelegram(false);
        setSuccess(res.message || 'Telegram аккаунт успешно отвязан');
        router.refresh();
      } else {
        setError(res.error || 'Не удалось отвязать Telegram');
      }
    } catch {
      setError('Ошибка сети при отвязке Telegram');
    } finally {
      setIsUnlinking(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleOpen}
        className="text-xs text-slate-700 hover:text-slate-900 border-slate-300"
      >
        Редактировать
      </Button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Редактирование профиля водителя</h2>
                <p className="text-xs text-slate-500 mt-0.5">{driver.fullName}</p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-lg leading-none"
              >
                ✕
              </button>
            </div>

            {/* Notifications */}
            {success && (
              <div className="mt-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2">
                <span>✓</span> {success}
              </div>
            )}
            {error && (
              <div className="mt-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
                <span>⚠️</span> {error}
              </div>
            )}

            <form onSubmit={handleSave} className="mt-4 space-y-4">
              <div>
                <Label htmlFor={`edit-fullName-${driver.id}`} className="text-xs font-semibold text-slate-700">
                  ФИО водителя *
                </Label>
                <Input
                  id={`edit-fullName-${driver.id}`}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  placeholder="Иванов Алексей Сергеевич"
                  className="mt-1 text-xs"
                />
              </div>

              <div>
                <PhoneInput
                  id={`edit-phone-${driver.id}`}
                  name="phone"
                  label="Номер Telegram (Телефон) *"
                  defaultValue={phone}
                  onChange={(val) => setPhone(val)}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor={`edit-vehicleModel-${driver.id}`} className="text-xs font-semibold text-slate-700">
                    Модель автомобиля
                  </Label>
                  <Input
                    id={`edit-vehicleModel-${driver.id}`}
                    value={vehicleModel}
                    onChange={(e) => setVehicleModel(e.target.value)}
                    placeholder="ГАЗель NEXT / Ford Transit"
                    className="mt-1 text-xs"
                  />
                </div>
                <div>
                  <Label htmlFor={`edit-vehiclePlateNumber-${driver.id}`} className="text-xs font-semibold text-slate-700">
                    Госномер автомобиля
                  </Label>
                  <Input
                    id={`edit-vehiclePlateNumber-${driver.id}`}
                    value={vehiclePlateNumber}
                    onChange={(e) => setVehiclePlateNumber(e.target.value)}
                    placeholder="А 123 ВС 777"
                    className="mt-1 text-xs font-mono uppercase"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor={`edit-notes-${driver.id}`} className="text-xs font-semibold text-slate-700">
                  Служебные заметки / комментарий
                </Label>
                <Input
                  id={`edit-notes-${driver.id}`}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Особые пропуска, габариты будки, режим работы..."
                  className="mt-1 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
                <div>
                  <Label htmlFor={`edit-isAvailable-${driver.id}`} className="text-xs font-semibold text-slate-700">
                    Статус доступности
                  </Label>
                  <select
                    id={`edit-isAvailable-${driver.id}`}
                    value={isAvailable ? 'true' : 'false'}
                    onChange={(e) => setIsAvailable(e.target.value === 'true')}
                    className="w-full mt-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-brand-500 focus:outline-none"
                  >
                    <option value="true">Доступен для рейсов</option>
                    <option value="false">На рейсе / Занят</option>
                  </select>
                </div>
                <div>
                  <Label htmlFor={`edit-isActive-${driver.id}`} className="text-xs font-semibold text-slate-700">
                    Статус аккаунта
                  </Label>
                  <select
                    id={`edit-isActive-${driver.id}`}
                    value={isActive ? 'true' : 'false'}
                    onChange={(e) => setIsActive(e.target.value === 'true')}
                    className="w-full mt-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-brand-500 focus:outline-none"
                  >
                    <option value="true">Активен (доступ разрешён)</option>
                    <option value="false">Заблокирован</option>
                  </select>
                </div>
              </div>

              {/* Telegram Integration Management Box */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-2 text-xs">
                <span className="font-semibold text-slate-900 block">Интеграция с Telegram</span>
                {hasTelegram ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">
                        Привязан аккаунт:{' '}
                        <span className="font-semibold text-sky-700">
                          {driver.telegramUsername ? `@${driver.telegramUsername}` : `ID: ${driver.telegramId}`}
                        </span>
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={isUnlinking}
                        onClick={handleUnlinkTelegram}
                        className="text-xs text-rose-700 border-rose-200 hover:bg-rose-50"
                      >
                        {isUnlinking ? 'Отвязка...' : 'Отвязать Telegram'}
                      </Button>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Отвязка Telegram сбросит текущую сессию в Driver Bot. Водитель сможет заново привязать свой Telegram по сгенерированному коду.
                    </p>
                  </div>
                ) : (
                  <div className="text-slate-500 text-[11px]">
                    Telegram не привязан. Водитель может подключиться к Driver Bot, используя кнопку «Код для входа» в реестре.
                  </div>
                )}
              </div>

              {/* Form Footer */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsOpen(false)}
                  disabled={isSubmitting}
                >
                  Отмена
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Сохранение...' : 'Сохранить изменения'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
