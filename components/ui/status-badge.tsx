import * as React from 'react';
import { OrderStatus } from '@prisma/client';
import { Badge } from '@/components/ui/badge';

export const ACTIVE_ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.CREATED,
  OrderStatus.PENDING_CONFIRMATION,
  OrderStatus.CONFIRMED,
  OrderStatus.ASSIGNED_TO_DRIVER,
  OrderStatus.ACCEPTED_BY_DRIVER,
  OrderStatus.PICKED_UP,
  OrderStatus.COMPLETED,
  OrderStatus.REJECTED_BY_MANAGER,
  OrderStatus.CANCELLED,
];

export const ACTIVE_STATUS_LABELS: Record<string, string> = {
  [OrderStatus.CREATED]: 'Создана',
  [OrderStatus.PENDING_CONFIRMATION]: 'Ожидает подтверждения',
  [OrderStatus.CONFIRMED]: 'Подтверждена',
  [OrderStatus.ASSIGNED_TO_DRIVER]: 'Назначен водитель',
  [OrderStatus.ACCEPTED_BY_DRIVER]: 'Водитель принял заявку',
  [OrderStatus.PICKED_UP]: 'Забрана у клиента',
  [OrderStatus.COMPLETED]: 'Завершена',
  [OrderStatus.REJECTED_BY_MANAGER]: 'Отклонена менеджером',
  [OrderStatus.CANCELLED]: 'Отменена',
};

export const STATUS_LABELS: Record<OrderStatus, string> = {
  DRAFT: 'Черновик',
  CREATED: 'Создана',
  PENDING_CONFIRMATION: 'Ожидает подтверждения',
  CONFIRMED: 'Подтверждена',
  ASSIGNED_TO_DRIVER: 'Назначен водитель',
  ACCEPTED_BY_DRIVER: 'Водитель принял заявку',
  PICKED_UP: 'Забрана у клиента',
  IN_TRANSIT: 'В пути',
  DELIVERED_TO_WAREHOUSE: 'Прибыла на склад',
  ACCEPTED_BY_MARKETPLACE: 'Принята маркетплейсом',
  COMPLETED: 'Завершена',
  REJECTED_BY_MANAGER: 'Отклонена менеджером',
  CANCELLED: 'Отменена',
};

export const STATUS_VARIANTS: Record<OrderStatus, 'default' | 'success' | 'warning' | 'destructive' | 'outline'> = {
  DRAFT: 'outline',
  CREATED: 'default',
  PENDING_CONFIRMATION: 'warning',
  CONFIRMED: 'default',
  ASSIGNED_TO_DRIVER: 'warning',
  ACCEPTED_BY_DRIVER: 'warning',
  PICKED_UP: 'warning',
  IN_TRANSIT: 'warning',
  DELIVERED_TO_WAREHOUSE: 'success',
  ACCEPTED_BY_MARKETPLACE: 'success',
  COMPLETED: 'success',
  REJECTED_BY_MANAGER: 'destructive',
  CANCELLED: 'destructive',
};

export const ALLOWED_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.DRAFT]: [
    OrderStatus.CREATED,
    OrderStatus.CANCELLED,
  ],
  [OrderStatus.CREATED]: [
    OrderStatus.CONFIRMED,
    OrderStatus.REJECTED_BY_MANAGER,
    OrderStatus.CANCELLED,
  ],
  [OrderStatus.PENDING_CONFIRMATION]: [
    OrderStatus.CONFIRMED,
    OrderStatus.REJECTED_BY_MANAGER,
    OrderStatus.CANCELLED,
  ],
  [OrderStatus.CONFIRMED]: [
    OrderStatus.ASSIGNED_TO_DRIVER,
    OrderStatus.PENDING_CONFIRMATION,
    OrderStatus.REJECTED_BY_MANAGER,
    OrderStatus.CANCELLED,
  ],
  [OrderStatus.ASSIGNED_TO_DRIVER]: [
    OrderStatus.ACCEPTED_BY_DRIVER,
    OrderStatus.CONFIRMED,
    OrderStatus.CANCELLED,
  ],
  [OrderStatus.ACCEPTED_BY_DRIVER]: [
    OrderStatus.PICKED_UP,
    OrderStatus.ASSIGNED_TO_DRIVER,
    OrderStatus.CANCELLED,
  ],
  [OrderStatus.PICKED_UP]: [
    OrderStatus.COMPLETED,
    OrderStatus.ACCEPTED_BY_DRIVER,
    OrderStatus.CANCELLED,
  ],
  [OrderStatus.COMPLETED]: [
    OrderStatus.PICKED_UP,
    OrderStatus.CANCELLED,
  ],
  [OrderStatus.REJECTED_BY_MANAGER]: [
    OrderStatus.PENDING_CONFIRMATION,
    OrderStatus.CONFIRMED,
  ],
  [OrderStatus.CANCELLED]: [
    OrderStatus.PENDING_CONFIRMATION,
    OrderStatus.CONFIRMED,
  ],
  // Legacy / historical statuses (never returned as targets)
  [OrderStatus.IN_TRANSIT]: [
    OrderStatus.PICKED_UP,
    OrderStatus.COMPLETED,
  ],
  [OrderStatus.DELIVERED_TO_WAREHOUSE]: [
    OrderStatus.COMPLETED,
  ],
  [OrderStatus.ACCEPTED_BY_MARKETPLACE]: [
    OrderStatus.COMPLETED,
  ],
};

export function getAllowedStatusTransitions(
  currentStatus: OrderStatus,
  options?: { hasAssignedDriver?: boolean }
): OrderStatus[] {
  const base = ALLOWED_STATUS_TRANSITIONS[currentStatus] || [];
  if (currentStatus === OrderStatus.CONFIRMED && options?.hasAssignedDriver === false) {
    return base.filter((s) => s !== OrderStatus.ASSIGNED_TO_DRIVER);
  }
  return base;
}

export interface CriticalTransitionInfo {
  isCritical: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  requireReason?: boolean;
}

export function getCriticalTransitionInfo(
  fromStatus: OrderStatus,
  toStatus: OrderStatus,
  hasAssignedDriver?: boolean
): CriticalTransitionInfo | null {
  if (toStatus === OrderStatus.COMPLETED) {
    return {
      isCritical: true,
      title: 'Завершить доставку?',
      description:
        'Заявка будет закрыта со статусом «Завершена», время доставки зафиксируется, а активное назначение водителя закроется.',
      confirmLabel: 'Да, завершить',
    };
  }

  if (fromStatus === OrderStatus.COMPLETED) {
    return {
      isCritical: true,
      title: 'Вернуть завершённую заявку в работу?',
      description:
        'Заявка уже имеет статус «Завершена». Изменение статуса вернёт её обратно в операционный процесс.',
      confirmLabel: 'Подтвердить возврат',
    };
  }

  if (toStatus === OrderStatus.REJECTED_BY_MANAGER) {
    return {
      isCritical: true,
      title: 'Отклонить заявку?',
      description: hasAssignedDriver
        ? 'Заявка будет отклонена, активное назначение водителя отменится, а клиент получит уведомление.'
        : 'Заявка будет отклонена, клиент получит уведомление.',
      confirmLabel: 'Отклонить заявку',
      requireReason: true,
    };
  }

  if (toStatus === OrderStatus.CANCELLED) {
    return {
      isCritical: true,
      title: 'Отменить заявку?',
      description: hasAssignedDriver
        ? 'Заявка будет отменена, а активное назначение водителя снимется.'
        : 'Заявка будет переведена в статус «Отменена».',
      confirmLabel: 'Да, отменить',
    };
  }

  const isDriverStageRollback =
    (fromStatus === OrderStatus.ASSIGNED_TO_DRIVER && toStatus === OrderStatus.CONFIRMED) ||
    (fromStatus === OrderStatus.ACCEPTED_BY_DRIVER && toStatus === OrderStatus.ASSIGNED_TO_DRIVER) ||
    (fromStatus === OrderStatus.PICKED_UP && toStatus === OrderStatus.ACCEPTED_BY_DRIVER);

  if (isDriverStageRollback) {
    return {
      isCritical: true,
      title: 'Откатить этап водителя?',
      description:
        'Изменение вернёт заявку на предыдущий этап и обновит статус назначения водителя.',
      confirmLabel: 'Подтвердить откат',
    };
  }

  return null;
}

export function StatusBadge({ status, className }: { status: OrderStatus; className?: string }) {
  const label = STATUS_LABELS[status] || status;
  const variant = STATUS_VARIANTS[status] || 'default';

  return (
    <Badge variant={variant} className={className}>
      {label}
    </Badge>
  );
}
