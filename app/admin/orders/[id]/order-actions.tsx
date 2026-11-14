'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  confirmOrderAction,
  rejectOrderAction,
  assignDriverAction,
  saveManagerNotesAction,
  updateDriverWorkflowStatusAction,
} from '@/app/actions/admin';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { OrderStatus } from '@prisma/client';

interface DriverOption {
  id: string;
  fullName: string;
  phone?: string | null;
  vehicleModel?: string | null;
  vehiclePlateNumber?: string | null;
}

interface OrderActionsProps {
  orderId: string;
  status: OrderStatus;
  initialManagerNotes?: string | null;
  assignedDriverId?: string;
  drivers: DriverOption[];
}

export function OrderActions({
  orderId,
  status,
  initialManagerNotes,
  assignedDriverId,
  drivers,
}: OrderActionsProps) {
  const router = useRouter();

  // Internal Notes State
  const [managerNotes, setManagerNotes] = React.useState(initialManagerNotes || '');
  const [isSavingNotes, setIsSavingNotes] = React.useState(false);
  const [notesMessage, setNotesMessage] = React.useState<string | null>(null);

  // Status Actions State
  const [isConfirming, setIsConfirming] = React.useState(false);
  const [showRejectForm, setShowRejectForm] = React.useState(false);
  const [rejectReason, setRejectReason] = React.useState('');
  const [isRejecting, setIsRejecting] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = React.useState<string | null>(null);

  // Driver Assignment State
  const [selectedDriverId, setSelectedDriverId] = React.useState(assignedDriverId || '');
  const [assignmentNotes, setAssignmentNotes] = React.useState('');
  const [isAssigningDriver, setIsAssigningDriver] = React.useState(false);

  // Driver Workflow Status State (Manager manual override)
  const [isUpdatingDriverStatus, setIsUpdatingDriverStatus] = React.useState(false);
  const [driverStatusComment, setDriverStatusComment] = React.useState('');
  const [showDriverCommentField, setShowDriverCommentField] = React.useState(false);

  const isFinalStatus =
    status === OrderStatus.COMPLETED ||
    status === OrderStatus.CANCELLED ||
    status === OrderStatus.REJECTED_BY_MANAGER;

  // Handle Driver Workflow Stage Update by Manager
  async function handleDriverStatusUpdate(targetStatus: OrderStatus) {
    setIsUpdatingDriverStatus(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await updateDriverWorkflowStatusAction(
        orderId,
        targetStatus,
        driverStatusComment.trim() || undefined
      );
      if (res.success) {
        setActionSuccess('Статус водительского этапа успешно обновлён менеджером');
        setDriverStatusComment('');
        setShowDriverCommentField(false);
        router.refresh();
      } else {
        setActionError(res.error || 'Не удалось обновить статус водительского этапа');
      }
    } catch {
      setActionError('Ошибка сети при обновлении статуса водителя');
    } finally {
      setIsUpdatingDriverStatus(false);
    }
  }

  // Handle Save Notes
  async function handleSaveNotes() {
    setIsSavingNotes(true);
    setNotesMessage(null);
    try {
      const res = await saveManagerNotesAction(orderId, managerNotes);
      if (res.success) {
        setNotesMessage('Заметка сохранена');
        setTimeout(() => setNotesMessage(null), 3000);
      } else {
        setNotesMessage(res.error || 'Ошибка при сохранении');
      }
    } catch {
      setNotesMessage('Ошибка сети при сохранении');
    } finally {
      setIsSavingNotes(false);
    }
  }

  // Handle Confirm Order
  async function handleConfirm() {
    setIsConfirming(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await confirmOrderAction(orderId, 'Заявка проверена и подтверждена менеджером');
      if (res.success) {
        setActionSuccess('Заявка успешно подтверждена');
        router.refresh();
      } else {
        setActionError(res.error || 'Не удалось подтвердить заявку');
      }
    } catch {
      setActionError('Ошибка сети при подтверждении');
    } finally {
      setIsConfirming(false);
    }
  }

  // Handle Reject Order
  async function handleReject(e: React.FormEvent) {
    e.preventDefault();
    if (!rejectReason.trim()) {
      setActionError('Пожалуйста, укажите обязательную причину отклонения');
      return;
    }

    setIsRejecting(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await rejectOrderAction(orderId, rejectReason.trim());
      if (res.success) {
        setActionSuccess('Заявка отклонена');
        setShowRejectForm(false);
        router.refresh();
      } else {
        setActionError(res.error || 'Не удалось отклонить заявку');
      }
    } catch {
      setActionError('Ошибка сети при отклонении');
    } finally {
      setIsRejecting(false);
    }
  }

  // Handle Assign Driver
  async function handleAssignDriver(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedDriverId) {
      setActionError('Выберите водителя из списка');
      return;
    }

    setIsAssigningDriver(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await assignDriverAction(
        orderId,
        selectedDriverId,
        assignmentNotes.trim() || undefined
      );
      if (res.success) {
        if (res.warning) {
          setActionSuccess(`Водитель назначен. ⚠️ ${res.warning}`);
        } else {
          setActionSuccess('Водитель успешно назначен на заявку');
        }
        router.refresh();
      } else {
        setActionError(res.error || 'Не удалось назначить водителя');
      }
    } catch {
      setActionError('Ошибка сети при назначении');
    } finally {
      setIsAssigningDriver(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Global Action Messages */}
      {actionSuccess && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-800 flex items-center gap-2">
          <svg className="w-4 h-4 text-emerald-600 shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          <span>{actionSuccess}</span>
        </div>
      )}

      {actionError && (
        <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800 flex items-center gap-2">
          <svg className="w-4 h-4 text-rose-600 shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <span>{actionError}</span>
        </div>
      )}

      {/* Decision Buttons (Confirm / Reject) */}
      {!isFinalStatus && (
        <Card className="border-slate-200 shadow-sm bg-white">
          <CardHeader className="pb-3 border-b border-slate-100">
            <CardTitle className="text-sm font-bold text-slate-900">
              Решение менеджера по заявке
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 space-y-4">
            {status !== OrderStatus.CONFIRMED && (
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  onClick={handleConfirm}
                  disabled={isConfirming || isRejecting}
                  variant="primary"
                  size="md"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-sm"
                >
                  {isConfirming ? 'Подтверждение...' : '✓ Подтвердить заявку'}
                </Button>

                {!showRejectForm && (
                  <Button
                    onClick={() => setShowRejectForm(true)}
                    disabled={isConfirming || isRejecting}
                    variant="outline"
                    size="md"
                    className="border-rose-300 text-rose-700 hover:bg-rose-50"
                  >
                    ✕ Отклонить заявку...
                  </Button>
                )}
              </div>
            )}

            {status === OrderStatus.CONFIRMED && (
              <div className="flex items-center gap-2 text-xs text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-lg p-2.5">
                <span className="font-semibold">Статус:</span> Заявка подтверждена. Назначьте водителя для выполнения забора и рейса.
              </div>
            )}

            {/* Reject Form Modal / In-place */}
            {showRejectForm && (
              <form onSubmit={handleReject} className="p-3 bg-rose-50/60 rounded-xl border border-rose-200 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-rose-900">
                    Укажите обязательную причину отклонения
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setShowRejectForm(false);
                      setRejectReason('');
                    }}
                    className="text-slate-400 hover:text-slate-600 text-xs"
                  >
                    Отмена
                  </button>
                </div>
                <Textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Например: Некорректно указан адрес склада клиента, нет пропускной способности..."
                  rows={2}
                  className="text-xs bg-white border-rose-300 focus:border-rose-500"
                  required
                />
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setShowRejectForm(false);
                      setRejectReason('');
                    }}
                  >
                    Отменить
                  </Button>
                  <Button
                    type="submit"
                    disabled={isRejecting || !rejectReason.trim()}
                    variant="danger"
                    size="sm"
                  >
                    {isRejecting ? 'Отклонение...' : 'Подтвердить отклонение'}
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      )}

      {/* Driver Assignment Card */}
      {!isFinalStatus && (
        <Card className="border-slate-200 shadow-sm bg-white">
          <CardHeader className="pb-3 border-b border-slate-100">
            <CardTitle className="text-sm font-bold text-slate-900 flex items-center justify-between">
              <span>Назначение водителя</span>
              {assignedDriverId && (
                <span className="text-[11px] font-normal text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
                  Водитель назначен
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <form onSubmit={handleAssignDriver} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Выберите водителя из базы
                </label>
                <select
                  value={selectedDriverId}
                  onChange={(e) => setSelectedDriverId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  <option value="">-- Выбрать водителя --</option>
                  {drivers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.fullName} {d.phone ? `(${d.phone})` : ''} {d.vehicleModel ? `• ${d.vehicleModel} ${d.vehiclePlateNumber || ''}` : ''}
                    </option>
                  ))}
                </select>
                {drivers.length === 0 && (
                  <p className="text-[11px] text-amber-600 mt-1">
                    В базе нет зарегистрированных водителей. Сначала добавьте водителя в разделе «Водители».
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Инструкция / Заметка для водителя (необязательно)
                </label>
                <input
                  type="text"
                  value={assignmentNotes}
                  onChange={(e) => setAssignmentNotes(e.target.value)}
                  placeholder="Номер ворот, особый пропуск, контакт на рампе..."
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>

              <div className="pt-1">
                <Button
                  type="submit"
                  disabled={isAssigningDriver || !selectedDriverId}
                  variant="primary"
                  size="sm"
                  className="w-full"
                >
                  {isAssigningDriver ? 'Назначение...' : assignedDriverId ? 'Изменить водителя' : 'Назначить на рейс'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Manager Controls: Driver Workflow Stage */}
      {assignedDriverId && !isFinalStatus && (
        <Card className="border-indigo-100 shadow-sm bg-gradient-to-br from-white to-indigo-50/20">
          <CardHeader className="pb-3 border-b border-indigo-100/60 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <span>🚗 Статус водительского этапа</span>
            </CardTitle>
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
              {status === OrderStatus.ASSIGNED_TO_DRIVER && 'Ожидает принятия водителем'}
              {status === OrderStatus.ACCEPTED_BY_DRIVER && 'Принят водителем'}
              {status === OrderStatus.PICKED_UP && 'Груз забран водителем'}
              {status === OrderStatus.IN_TRANSIT && 'В пути на склад'}
              {status === OrderStatus.DELIVERED_TO_WAREHOUSE && 'Доставлен на склад'}
              {status === OrderStatus.ACCEPTED_BY_MARKETPLACE && 'Принят маркетплейсом'}
              {!['ASSIGNED_TO_DRIVER', 'ACCEPTED_BY_DRIVER', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED_TO_WAREHOUSE', 'ACCEPTED_BY_MARKETPLACE'].includes(status) && status}
            </span>
          </CardHeader>
          <CardContent className="pt-4 space-y-3">
            <p className="text-xs text-slate-600">
              Менеджер может вручную продвинуть этап водителя, если водитель сообщил о выполнении по телефону или возникли сложности с ботом.
            </p>

            <div className="flex flex-wrap gap-2 pt-1">
              {status === OrderStatus.ASSIGNED_TO_DRIVER && (
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  disabled={isUpdatingDriverStatus}
                  onClick={() => handleDriverStatusUpdate(OrderStatus.ACCEPTED_BY_DRIVER)}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs"
                >
                  {isUpdatingDriverStatus ? 'Сохранение...' : '✓ Отметить как «Принято водителем»'}
                </Button>
              )}

              {status === OrderStatus.ACCEPTED_BY_DRIVER && (
                <>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    disabled={isUpdatingDriverStatus}
                    onClick={() => handleDriverStatusUpdate(OrderStatus.PICKED_UP)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                  >
                    {isUpdatingDriverStatus ? 'Сохранение...' : '📦 Отметить как «Груз забран»'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isUpdatingDriverStatus}
                    onClick={() => handleDriverStatusUpdate(OrderStatus.ASSIGNED_TO_DRIVER)}
                    className="text-xs text-slate-600 border-slate-300 hover:bg-slate-50"
                  >
                    ↩️ Вернуть к «Назначен»
                  </Button>
                </>
              )}

              {status === OrderStatus.PICKED_UP && (
                <>
                  <div className="w-full text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-2.5 flex items-center gap-2">
                    <span>✓ Груз успешно забран у отправителя. Заказ перемещён в историю водителя.</span>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isUpdatingDriverStatus}
                    onClick={() => handleDriverStatusUpdate(OrderStatus.ACCEPTED_BY_DRIVER)}
                    className="text-xs text-slate-600 border-slate-300 hover:bg-slate-50"
                  >
                    ↩️ Вернуть к «Принято»
                  </Button>
                </>
              )}
            </div>

            <div className="pt-2 border-t border-indigo-100/40">
              {!showDriverCommentField ? (
                <button
                  type="button"
                  onClick={() => setShowDriverCommentField(true)}
                  className="text-[11px] text-indigo-600 hover:underline"
                >
                  + Добавить примечание к смене статуса
                </button>
              ) : (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <span>Примечание к изменению:</span>
                    <button
                      type="button"
                      onClick={() => setShowDriverCommentField(false)}
                      className="text-slate-400 hover:text-slate-600"
                    >
                      Скрыть
                    </button>
                  </div>
                  <input
                    type="text"
                    value={driverStatusComment}
                    onChange={(e) => setDriverStatusComment(e.target.value)}
                    placeholder="Например: подтверждено по рации / звонку..."
                    className="w-full rounded border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}


      {/* Internal Manager Notes */}
      <Card className="border-slate-200 shadow-sm bg-white">
        <CardHeader className="pb-3 border-b border-slate-100 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-bold text-slate-900">
            Внутренние заметки менеджера
          </CardTitle>
          {notesMessage && (
            <span className="text-xs text-emerald-600 font-medium">
              {notesMessage}
            </span>
          )}
        </CardHeader>
        <CardContent className="pt-4 space-y-3">
          <Textarea
            value={managerNotes}
            onChange={(e) => setManagerNotes(e.target.value)}
            placeholder="Служебная информация (клиент просил перезвонить за час, оплата по безналу, согласована скидка)..."
            rows={3}
            className="text-xs text-slate-900"
          />
          <div className="flex justify-end">
            <Button
              type="button"
              onClick={handleSaveNotes}
              disabled={isSavingNotes}
              variant="outline"
              size="sm"
              className="text-xs"
            >
              {isSavingNotes ? 'Сохранение...' : 'Сохранить заметку'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
