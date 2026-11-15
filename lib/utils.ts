import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Generates an enterprise-grade order tracking number.
 * Primary numbering is sequential (1, 2, 3...) via PostgreSQL sequence.
 * This helper provides a fallback sequential/numeric identifier.
 */
let fallbackCounter = 1;
export function generateOrderNumber(): string {
  return `${fallbackCounter++}`;
}

export function formatDateTime(date: Date | string | number): string {
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  return new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(d);
}

export function formatVolume(m3: number): string {
  return `${m3.toFixed(3)} м³`;
}

export function formatWeight(kg: number): string {
  return `${kg.toFixed(2)} кг`;
}
