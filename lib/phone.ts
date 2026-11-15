import { z } from 'zod';

export interface PhoneValidationResult {
  isValid: boolean;
  error?: string;
  normalized?: string;
  nationalPart?: string;
}

/**
 * Validates a raw phone input against strict rules:
 * - Fixed +7 country code.
 * - Exactly 10 digits after +7.
 * - First national digit cannot be 0 (e.g. mobile 9XX).
 * - Disallow +996 / 996.
 * - Disallow duplicate +7 (+7+7, +7 7...).
 * - Do NOT silently rewrite invalid country codes into +7.
 */
export function validatePhoneNumber(raw?: string | null): PhoneValidationResult {
  if (!raw || !raw.trim()) {
    return { isValid: false, error: 'Номер Telegram обязателен' };
  }

  const trimmed = raw.trim();

  // 1. Check for forbidden Kyrgyzstan prefix (+996 or 996)
  if (trimmed.startsWith('+996') || trimmed.startsWith('996')) {
    return {
      isValid: false,
      error: 'Номера с кодом +996 не поддерживаются. Пожалуйста, укажите номер с кодом +7',
    };
  }

  // 2. Check for duplicate country code in raw string
  const plusMatches = trimmed.match(/\+/g);
  if (plusMatches && plusMatches.length > 1) {
    return {
      isValid: false,
      error: 'Некорректный формат: обнаружено несколько кодов страны в номере',
    };
  }

  // Extract all digits
  const allDigits = trimmed.replace(/\D/g, '');

  // Check if user entered duplicate 7s at start like "77955..." or "+77..."
  if (trimmed.startsWith('+77') || trimmed.startsWith('+7 7') || trimmed.startsWith('77') && allDigits.length === 12) {
    return {
      isValid: false,
      error: 'Некорректный формат: код страны +7 указан повторно',
    };
  }

  let nationalDigits = '';

  if (trimmed.startsWith('+7')) {
    nationalDigits = allDigits.slice(1);
  } else if (allDigits.length === 11 && (allDigits.startsWith('7') || allDigits.startsWith('8'))) {
    nationalDigits = allDigits.slice(1);
  } else if (allDigits.length === 10) {
    nationalDigits = allDigits;
  } else {
    // If digits count is less or more
    if (allDigits.length < 10) {
      return {
        isValid: false,
        error: 'Неполный номер: после +7 должно быть ровно 10 цифр',
      };
    }
    return {
      isValid: false,
      error: 'Некорректная длина номера: после +7 должно быть ровно 10 цифр',
    };
  }

  // 3. National part must be exactly 10 digits
  if (nationalDigits.length !== 10) {
    return {
      isValid: false,
      error: `Номер должен содержать ровно 10 цифр после +7 (введено ${nationalDigits.length})`,
    };
  }

  // 4. First digit of national part cannot be 0
  if (nationalDigits.startsWith('0')) {
    return {
      isValid: false,
      error: 'Номер не может начинаться с 0. Первая цифра номера должна быть от 1 до 9 (обычно 9)',
    };
  }

  const normalized = `+7${nationalDigits}`;
  return {
    isValid: true,
    normalized,
    nationalPart: nationalDigits,
  };
}

/**
 * Normalizes phone input into canonical E.164 +7 format: +7XXXXXXXXXX.
 * Throws or returns empty if invalid; preserves existing historical numbers starting with +996 if already stored.
 */
export function normalizePhoneNumber(raw?: string | null): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';

  // Preserve existing historical DB numbers starting with +996 if they are already in DB
  if (trimmed.startsWith('+996') && trimmed.replace(/\D/g, '').length >= 11) {
    return trimmed;
  }

  const validation = validatePhoneNumber(raw);
  if (validation.isValid && validation.normalized) {
    return validation.normalized;
  }

  // Fallback cleanup if already starts with +7 and 10 digits
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('7') && digits[1] !== '0') {
    return `+${digits}`;
  }
  if (digits.length === 10 && digits[0] !== '0') {
    return `+7${digits}`;
  }

  return trimmed;
}

/**
 * Formats a phone number for UI display:
 * Example: "+7 955 123-45-67"
 * Or national 10 digits without +7: "955 123-45-67"
 */
export function formatPhoneNumber(phone?: string | null, includeCountryCode = true): string {
  if (!phone) return '—';
  const trimmed = phone.trim();
  if (!trimmed) return '—';

  // Historical +996 support
  if (trimmed.startsWith('+996')) {
    const digits = trimmed.replace(/\D/g, '');
    if (digits.length === 12) {
      return `+996 ${digits.slice(3, 6)} ${digits.slice(6, 9)}-${digits.slice(9, 12)}`;
    }
    return trimmed;
  }

  const digits = trimmed.replace(/\D/g, '');

  let national = '';
  if (digits.length === 11 && (digits.startsWith('7') || digits.startsWith('8'))) {
    national = digits.slice(1);
  } else if (digits.length === 10) {
    national = digits;
  }

  if (national.length === 10) {
    const code = national.slice(0, 3);
    const p1 = national.slice(3, 6);
    const p2 = national.slice(6, 8);
    const p3 = national.slice(8, 10);
    const formattedNational = `${code} ${p1}-${p2}-${p3}`;
    return includeCountryCode ? `+7 ${formattedNational}` : formattedNational;
  }

  return trimmed;
}

/**
 * Formats raw 10 national digits into live mask: "955 123-45-67"
 */
export function formatNationalDigits(digits: string): string {
  const clean = digits.replace(/\D/g, '').slice(0, 10);
  if (!clean) return '';

  let res = clean.slice(0, 3);
  if (clean.length > 3) {
    res += ' ' + clean.slice(3, 6);
  }
  if (clean.length > 6) {
    res += '-' + clean.slice(6, 8);
  }
  if (clean.length > 8) {
    res += '-' + clean.slice(8, 10);
  }
  return res;
}

/**
 * Validates whether the given phone number is a valid +7 number.
 */
export function isValidPhoneNumber(phone?: string | null): boolean {
  if (!phone) return false;
  return validatePhoneNumber(phone).isValid;
}

/**
 * Reusable Zod schema for +7 Telegram phone numbers with automatic normalization.
 */
export const phoneSchema = z
  .string({ required_error: 'Номер Telegram обязателен' })
  .min(1, 'Номер Telegram обязателен')
  .superRefine((val, ctx) => {
    const validation = validatePhoneNumber(val);
    if (!validation.isValid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: validation.error || 'Укажите корректный номер в формате +7 9XX XXX-XX-XX',
      });
    }
  })
  .transform((val) => {
    const validation = validatePhoneNumber(val);
    return validation.normalized || val;
  });

/**
 * Optional phone schema.
 */
export const optionalPhoneSchema = z
  .string()
  .optional()
  .nullable()
  .superRefine((val, ctx) => {
    if (!val || !val.trim()) return;
    const validation = validatePhoneNumber(val);
    if (!validation.isValid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: validation.error || 'Укажите корректный номер в формате +7 9XX XXX-XX-XX',
      });
    }
  })
  .transform((val) => {
    if (!val || !val.trim()) return undefined;
    const validation = validatePhoneNumber(val);
    return validation.normalized || val;
  });
