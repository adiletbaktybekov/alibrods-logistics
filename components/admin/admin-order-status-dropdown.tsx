'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { OrderStatus } from '@prisma/client';
import { updateOrderStatusFromListAction } from '@/app/actions/admin';
import {
  STATUS_LABELS,
  STATUS_VARIANTS,
  StatusBadge,
  getAllowedStatusTransitions,
  getCriticalTransitionInfo,
  CriticalTransitionInfo,
} from '@/components/ui/status-badge';
import { cn } from '@/lib/utils';

interface AdminOrderStatusDropdownProps {
  orderId: string;
  orderNumber: string;
  currentStatus: OrderStatus;
  hasAssignedDriver: boolean;
  canChangeStatus?: boolean;
}

const VARIANT_CLASSES: Record<
  'default' | 'success' | 'warning' | 'destructive' | 'outline',
  string
> = {
  default: 'bg-brand-100 text-brand-800 hover:bg-brand-200/80 border-brand-200',
  success: 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200/80 border-emerald-200',
  warning: 'bg-amber-100 text-amber-800 hover:bg-amber-200/80 border-amber-200',
  destructive: 'bg-red-100 text-red-800 hover:bg-red-200/80 border-red-200',
  outline: 'bg-white text-slate-700 hover:bg-slate-100 border-slate-300',
};

const DOT_CLASSES: Record<
  'default' | 'success' | 'warning' | 'destructive' | 'outline',
  string
> = {
  default: 'bg-brand-600',
  success: 'bg-emerald-600',
  warning: 'bg-amber-500',
  destructive: 'bg-red-600',
  outline: 'bg-slate-400',
};

export function AdminOrderStatusDropdown({
  orderId,
  orderNumber,
  currentStatus,
  hasAssignedDriver,
  canChangeStatus = true,
}: AdminOrderStatusDropdownProps) {
  const router = useRouter();
  const [status, setStatus] = React.useState<OrderStatus>(currentStatus);
  const [isOpen, setIsOpen] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  const [menuPos, setMenuPos] = React.useState<{ top: number; left: number; openUp: boolean }>({
    top: 0,
    left: 0,
    openUp: false,
  });

  // Critical transition confirmation modal state
  const [pendingConfirm, setPendingConfirm] = React.useState<{
    targetStatus: OrderStatus;
    info: CriticalTransitionInfo;
  } | null>(null);
  const [confirmReason, setConfirmReason] = React.useState('');

  // Inline feedback toast state
  const [feedback, setFeedback] = React.useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  const inFlightRef = React.useRef(false);
  const feedbackTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    setMounted(true);
    return () => {
      if (feedbackTimerRef.current) {
        clearTimeout(feedbackTimerRef.current);
      }
    };
  }, []);

  React.useEffect(() => {
    if (!inFlightRef.current) {
      setStatus(currentStatus);
    }
  }, [currentStatus]);

  const allowedTransitions = React.useMemo(
    () => getAllowedStatusTransitions(status, { hasAssignedDriver }),
    [status, hasAssignedDriver]
  );

  const showFeedback = React.useCallback((type: 'success' | 'error', message: string) => {
    if (feedbackTimerRef.current) {
      clearTimeout(feedbackTimerRef.current);
    }
    setFeedback({ type, message });
    feedbackTimerRef.current = setTimeout(
      () => {
        setFeedback(null);
      },
      type === 'error' ? 6000 : 3000
    );
  }, []);

  const updateMenuPosition = React.useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const menuWidth = 248;
    const estimatedHeight = Math.min(340, (allowedTransitions.length + 2) * 44 + 48);

    let left = rect.left;
    if (left + menuWidth > window.innerWidth - 12) {
      left = Math.max(12, window.innerWidth - menuWidth - 12);
    }
    if (left < 12) {
      left = 12;
    }

    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < estimatedHeight && rect.top > estimatedHeight;
    const top = openUp ? Math.max(12, rect.top - 6) : Math.min(window.innerHeight - 12, rect.bottom + 6);

    setMenuPos({ top, left, openUp });
  }, [allowedTransitions.length]);

  React.useEffect(() => {
    if (!isOpen) return;

    updateMenuPosition();

    const handleOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (
        triggerRef.current &&
        triggerRef.current.contains(target)
      ) {
        return;
      }
      if (menuRef.current && menuRef.current.contains(target)) {
        return;
      }
      setIsOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    const handleViewportChange = () => {
      setIsOpen(false);
    };

    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside, { passive: true });
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);

    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
    };
  }, [isOpen, updateMenuPosition]);

  const executeStatusChange = React.useCallback(
    async (targetStatus: OrderStatus, comment?: string) => {
      if (inFlightRef.current) return;
      if (targetStatus === status) {
        setIsOpen(false);
        return;
      }

      const previousStatus = status;
      inFlightRef.current = true;
      setIsLoading(true);
      setIsOpen(false);
      setPendingConfirm(null);
      setConfirmReason('');

      // Optimistic update
      setStatus(targetStatus);

      try {
        const res = await updateOrderStatusFromListAction(orderId, targetStatus, {
          expectedCurrentStatus: previousStatus,
          comment: comment?.trim() || undefined,
        });

        if (res.success && res.status) {
          setStatus(res.status);
          const label = STATUS_LABELS[res.status] || res.status;
          showFeedback('success', `Заявка ${orderNumber}: статус «${label}»`);
          router.refresh();
        } else {
          setStatus(previousStatus);
          showFeedback('error', res.error || 'Не удалось изменить статус заявки');
        }
      } catch {
        setStatus(previousStatus);
        showFeedback('error', 'Ошибка сети при сохранении статуса');
      } finally {
        inFlightRef.current = false;
        setIsLoading(false);
      }
    },
    [orderId, orderNumber, router, showFeedback, status]
  );

  const handleSelectOption = (e: React.MouseEvent, targetStatus: OrderStatus) => {
    e.stopPropagation();
    e.preventDefault();

    if (inFlightRef.current || isLoading) return;
    if (targetStatus === status) {
      setIsOpen(false);
      return;
    }

    const criticalInfo = getCriticalTransitionInfo(status, targetStatus, hasAssignedDriver);
    if (criticalInfo) {
      setIsOpen(false);
      setConfirmReason('');
      setPendingConfirm({ targetStatus, info: criticalInfo });
      return;
    }

    void executeStatusChange(targetStatus);
  };

  if (!canChangeStatus) {
    return <StatusBadge status={status} />;
  }

  const currentVariant = STATUS_VARIANTS[status] || 'default';
  const currentLabel = STATUS_LABELS[status] || status;

  return (
    <div
      className="relative inline-block"
      onClick={(e) => {
        e.stopPropagation();
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        disabled={isLoading}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={`Изменить статус заявки ${orderNumber}. Текущий статус: ${currentLabel}`}
        title="Нажмите, чтобы изменить статус"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          if (isLoading || inFlightRef.current) return;
          setIsOpen((prev) => !prev);
        }}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-all select-none',
          'focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:ring-offset-1',
          'min-h-[30px] whitespace-nowrap cursor-pointer active:scale-[0.98]',
          VARIANT_CLASSES[currentVariant],
          isLoading && 'opacity-75 cursor-wait'
        )}
      >
        <span>{currentLabel}</span>
        {isLoading ? (
          <svg
            className="w-3 h-3 animate-spin shrink-0 opacity-80"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
        ) : (
          <span
            aria-hidden="true"
            className={cn(
              'text-[9px] leading-none opacity-70 transition-transform duration-150',
              isOpen && 'rotate-180'
            )}
          >
            ▼
          </span>
        )}
      </button>

      {/* Dropdown Menu via Portal (never clipped by table overflow) */}
      {mounted &&
        isOpen &&
        createPortal(
          <div
            ref={menuRef}
            role="listbox"
            aria-label={`Выбор статуса для заявки ${orderNumber}`}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed',
              top: menuPos.top,
              left: menuPos.left,
              transform: menuPos.openUp ? 'translateY(-100%)' : undefined,
              zIndex: 9999,
            }}
            className="w-[248px] rounded-xl border border-slate-200 bg-white shadow-xl ring-1 ring-slate-900/5 py-1.5 animate-in fade-in-0 zoom-in-95 duration-100"
          >
            <div className="px-3 py-1.5 border-b border-slate-100 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Статус • {orderNumber}
              </span>
            </div>

            {/* Current status indicator */}
            <div className="px-3 py-2 flex items-center justify-between bg-slate-50/80 text-xs font-semibold text-slate-800 border-b border-slate-100">
              <span className="flex items-center gap-2 min-w-0">
                <span className={cn('w-2 h-2 rounded-full shrink-0', DOT_CLASSES[currentVariant])} />
                <span className="truncate">{currentLabel}</span>
              </span>
              <span className="text-brand-600 text-xs font-bold ml-2 shrink-0" aria-hidden="true">
                ✓
              </span>
            </div>

            {/* Allowed transitions */}
            <div className="py-1 max-h-[260px] overflow-y-auto">
              {allowedTransitions.length > 0 ? (
                allowedTransitions.map((target) => {
                  const targetVariant = STATUS_VARIANTS[target] || 'default';
                  const targetLabel = STATUS_LABELS[target] || target;
                  const isCritical = Boolean(
                    getCriticalTransitionInfo(status, target, hasAssignedDriver)
                  );

                  return (
                    <button
                      key={target}
                      type="button"
                      role="option"
                      aria-selected={false}
                      onClick={(e) => handleSelectOption(e, target)}
                      className={cn(
                        'w-full px-3 py-2.5 min-h-[40px] text-left text-xs font-medium flex items-center justify-between gap-2 transition-colors',
                        'hover:bg-slate-50 active:bg-slate-100 focus:outline-none focus:bg-slate-50',
                        targetVariant === 'destructive'
                          ? 'text-red-700 hover:bg-red-50/70'
                          : 'text-slate-700'
                      )}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <span
                          className={cn('w-2 h-2 rounded-full shrink-0', DOT_CLASSES[targetVariant])}
                        />
                        <span className="truncate">{targetLabel}</span>
                      </span>
                      {isCritical && (
                        <span
                          className="text-[10px] text-slate-400 shrink-0"
                          title="Потребуется подтверждение"
                        >
                          •••
                        </span>
                      )}
                    </button>
                  );
                })
              ) : (
                <div className="px-3 py-2.5 text-xs text-slate-400 text-center">
                  Нет доступных переходов
                </div>
              )}
            </div>

            {status === OrderStatus.CONFIRMED && !hasAssignedDriver && (
              <div className="px-3 py-1.5 border-t border-slate-100 text-[10px] leading-snug text-slate-400 bg-slate-50/50 rounded-b-xl">
                Для назначения водителя откройте карточку заявки.
              </div>
            )}
          </div>,
          document.body
        )}

      {/* Critical Transition Confirmation Modal */}
      {mounted &&
        pendingConfirm &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={`confirm-status-title-${orderId}`}
            onClick={(e) => {
              e.stopPropagation();
              if (!isLoading) {
                setPendingConfirm(null);
              }
            }}
            className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-900/50 backdrop-blur-[1px] p-4"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-2xl bg-white shadow-2xl border border-slate-200 p-5 space-y-4"
            >
              <div className="space-y-1.5">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Заявка {orderNumber}
                </div>
                <h3
                  id={`confirm-status-title-${orderId}`}
                  className="text-base font-bold text-slate-900"
                >
                  {pendingConfirm.info.title}
                </h3>
                <p className="text-xs leading-relaxed text-slate-600">
                  {pendingConfirm.info.description}
                </p>
              </div>

              <div className="flex items-center flex-wrap gap-2 rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5">
                <StatusBadge status={status} />
                <span className="text-slate-400 text-xs font-bold">→</span>
                <StatusBadge status={pendingConfirm.targetStatus} />
              </div>

              {pendingConfirm.info.requireReason && (
                <div className="space-y-1.5">
                  <label
                    htmlFor={`reject-reason-${orderId}`}
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Причина отклонения (необязательно)
                  </label>
                  <input
                    id={`reject-reason-${orderId}`}
                    type="text"
                    value={confirmReason}
                    onChange={(e) => setConfirmReason(e.target.value)}
                    placeholder="Например: Некорректный адрес или дата..."
                    maxLength={250}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  disabled={isLoading}
                  onClick={(e) => {
                    e.stopPropagation();
                    setPendingConfirm(null);
                    setConfirmReason('');
                  }}
                  className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Отмена
                </button>
                <button
                  type="button"
                  disabled={isLoading}
                  onClick={(e) => {
                    e.stopPropagation();
                    void executeStatusChange(
                      pendingConfirm.targetStatus,
                      confirmReason.trim() || undefined
                    );
                  }}
                  className={cn(
                    'rounded-lg px-3.5 py-2 text-xs font-semibold text-white shadow-sm disabled:opacity-50 transition-colors',
                    pendingConfirm.targetStatus === OrderStatus.REJECTED_BY_MANAGER ||
                      pendingConfirm.targetStatus === OrderStatus.CANCELLED
                      ? 'bg-red-600 hover:bg-red-700'
                      : pendingConfirm.targetStatus === OrderStatus.COMPLETED
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : 'bg-brand-600 hover:bg-brand-700'
                  )}
                >
                  {isLoading ? 'Сохранение...' : pendingConfirm.info.confirmLabel}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Floating Feedback Toast */}
      {mounted &&
        feedback &&
        createPortal(
          <div
            role={feedback.type === 'error' ? 'alert' : 'status'}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              'fixed bottom-4 right-4 left-4 sm:left-auto sm:max-w-md z-[10001] flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-xs font-medium shadow-lg',
              feedback.type === 'error'
                ? 'bg-red-50 border-red-200 text-red-900'
                : 'bg-emerald-50 border-emerald-200 text-emerald-900'
            )}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="shrink-0 font-bold" aria-hidden="true">
                {feedback.type === 'error' ? '⚠️' : '✓'}
              </span>
              <span className="break-words">{feedback.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              aria-label="Закрыть уведомление"
              className="shrink-0 text-current opacity-60 hover:opacity-100 px-1"
            >
              ✕
            </button>
          </div>,
          document.body
        )}
    </div>
  );
}
