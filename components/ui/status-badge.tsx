import * as React from 'react';
import { OrderStatus } from '@prisma/client';
import { Badge } from '@/components/ui/badge';

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

export function StatusBadge({ status, className }: { status: OrderStatus; className?: string }) {
  const label = STATUS_LABELS[status] || status;
  const variant = STATUS_VARIANTS[status] || 'default';

  return (
    <Badge variant={variant} className={className}>
      {label}
    </Badge>
  );
}
