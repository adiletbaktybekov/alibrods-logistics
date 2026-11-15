import { z } from 'zod';

/**
 * Normalizes a raw phone input into canonical E.164 +7 format: +7XXXXXXXXXX (11 digits).
 * Handles inputs with spaces, parentheses, dashes, leading 8, 7 without +, or 10 digits starting with 9.
 */
export function normalizePhoneNumber(raw?: string | null): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';

  // Extract digits and leading plus
  let digits = trimmed.replace(/\D/g, '');

  // If starts with 8 and has 11 digits (Russian local trunk) -> replace 8 with 7
  if (digits.length === 11 && digits.startsWith('8')) {
    digits = '7' + digits.slice(1);
  } else if (digits.length === 10 && digits.startsWith('9')) {
    // 10 digits starting with 9 (e.g. 9551234567) -> prefix 7
    digits = '7' + digits;
  } else if (digits.length === 11 && digits.startsWith('7')) {
    // already 11 digits with 7
  }

  // If standard Russian 11 digits starting with 7
  if (digits.length === 11 && digits.startsWith('7')) {
    return `+${digits}`;
  }

  // Fallback: if already starts with +, keep + and digits
  if (trimmed.startsWith('+')) {
    return `+${digits}`;
  }

  return digits ? `+${digits}` : '';
}

/**
 * Formats a phone number for UI display in the unified +7 format:
 * Example: "+7 955 123-45-67"
 */
export function formatPhoneNumber(phone?: string | null): string {
  if (!phone) return '—';
  const normalized = normalizePhoneNumber(phone);
  if (!normalized) return '—';

  const digits = normalized.replace(/\D/g, '');

  // Standard Russian number +7 (11 digits)
  if (digits.length === 11 && digits.startsWith('7')) {
    const code = digits.slice(1, 4);
    const p1 = digits.slice(4, 7);
    const p2 = digits.slice(7, 9);
    const p3 = digits.slice(9, 11);
    return `+7 ${code} ${p1}-${p2}-${p3}`;
  }

  // Fallback for other lengths
  return normalized;
}

/**
 * Validates whether the given phone number is a valid +7 number (11 digits total).
 */
export function isValidPhoneNumber(phone?: string | null): boolean {
  if (!phone) return false;
  const normalized = normalizePhoneNumber(phone);
  return /^\+7\d{10}$/.test(normalized);
}

/**
 * Reusable Zod schema for +7 Telegram phone numbers with automatic normalization.
 */
export const phoneSchema = z
  .string({ required_error: 'Номер Telegram обязателен' })
  .min(1, 'Номер Telegram обязателен')
  .transform((val) => normalizePhoneNumber(val))
  .refine(
    (val) => isValidPhoneNumber(val),
    {
      message: 'Укажите корректный номер в формате +7 9XX XXX-XX-XX',
    }
  );

/**
 * Optional phone schema (allows undefined, null, or empty string).
 */
export const optionalPhoneSchema = z
  .string()
  .optional()
  .nullable()
  .transform((val) => (val ? normalizePhoneNumber(val) : undefined))
  .refine(
    (val) => !val || isValidPhoneNumber(val),
    {
      message: 'Укажите корректный номер в формате +7 9XX XXX-XX-XX',
    }
  );
