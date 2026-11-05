import * as React from 'react';
import { OrderStatus } from '@prisma/client';
import { Badge } from '@/components/ui/badge';

export const STATUS_LABELS: Record<OrderStatus, string> = {
  DRAFT: 'Черновик',
  CREATED: 'Создана',
  CONFIRMED: 'Подтверждена',
  ASSIGNED_TO_DRIVER: 'Назначен водитель',
  PICKED_UP: 'Груз принят',
  IN_TRANSIT: 'В пути',
  DELIVERED_TO_WAREHOUSE: 'Доставлен на склад',
  ACCEPTED_BY_MARKETPLACE: 'Принят маркетплейсом',
  COMPLETED: 'Завершён',
  CANCELLED: 'Отменён',
};

export const STATUS_VARIANTS: Record<OrderStatus, 'default' | 'success' | 'warning' | 'destructive' | 'outline'> = {
  DRAFT: 'outline',
  CREATED: 'default',
  CONFIRMED: 'default',
  ASSIGNED_TO_DRIVER: 'warning',
  PICKED_UP: 'warning',
  IN_TRANSIT: 'warning',
  DELIVERED_TO_WAREHOUSE: 'success',
  ACCEPTED_BY_MARKETPLACE: 'success',
  COMPLETED: 'success',
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
