import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { siteConfig } from '@/config/site';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Generates an enterprise-grade order tracking number:
 * Format: ABL-YYYY-XXXXXX (e.g., ABL-2026-A8F9B2)
 */
export function generateOrderNumber(date: Date = new Date()): string {
  const year = date.getFullYear();
  const randomSuffix = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `${siteConfig.orderPrefix}-${year}-${randomSuffix}`;
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
