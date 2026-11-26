import { z } from 'zod';
import {
  parsePhoneNumberFromString,
  AsYouType,
  getCountryCallingCode,
  getCountries,
  type CountryCode,
  type PhoneNumber,
} from 'libphonenumber-js';
import {
  POPULAR_COUNTRIES,
  RUSSIAN_COUNTRY_NAMES,
  getCountryFlag,
  type CountryInfo,
} from '@/lib/phone-client';

export type { CountryCode, CountryInfo };
export { POPULAR_COUNTRIES, getCountryFlag };

/**
 * Full sorted list of supported countries: popular first, then alphabetical.
 */
export function getAllCountries(): CountryInfo[] {
  const popularCodes = new Set(POPULAR_COUNTRIES.map((c) => c.code));
  const remainingCodes = getCountries().filter((c) => !popularCodes.has(c));

  const remaining: CountryInfo[] = remainingCodes.map((c) => {
    let callingCode = '';
    try {
      callingCode = `+${getCountryCallingCode(c)}`;
    } catch {
      callingCode = '';
    }
    const name = RUSSIAN_COUNTRY_NAMES[c] || c;
    return {
      code: c,
      name,
      callingCode,
      flag: getCountryFlag(c),
    };
  });

  remaining.sort((a, b) => a.name.localeCompare(b.name, 'ru'));

  return [...POPULAR_COUNTRIES, ...remaining];
}

export function getCountryCallingCodeSafe(country: CountryCode): string {
  try {
    return `+${getCountryCallingCode(country)}`;
  } catch {
    return '+996';
  }
}

export interface PhoneValidationResult {
  isValid: boolean;
  error?: string;
  normalized?: string;
  country?: CountryCode;
  nationalPart?: string;
  formattedInternational?: string;
  formattedNational?: string;
}

/**
 * Validates a raw phone input against international phone rules.
 * Default country is Kyrgyzstan ('KG', +996).
 * Accepts any valid international phone number.
 */
export function validatePhoneNumber(
  raw?: string | null,
  defaultCountry: CountryCode = 'KG'
): PhoneValidationResult {
  if (!raw || !raw.trim()) {
    return { isValid: false, error: 'Номер Telegram обязателен' };
  }

  const trimmed = raw.trim();

  // Reject duplicate plus signs
  const plusMatches = trimmed.match(/\+/g);
  if (plusMatches && plusMatches.length > 1) {
    return {
      isValid: false,
      error: 'Некорректный формат: обнаружено несколько кодов страны в номере',
    };
  }

  let parsed: PhoneNumber | undefined;

  // If number starts with +, parse internationally without forcing defaultCountry
  if (trimmed.startsWith('+')) {
    parsed = parsePhoneNumberFromString(trimmed);
  } else {
    // Try parsing with defaultCountry
    parsed = parsePhoneNumberFromString(trimmed, defaultCountry);

    // If unparsed, also check if it's an 11-digit Russian number starting with 8 or 7
    if (!parsed || !parsed.isValid()) {
      const cleanDigits = trimmed.replace(/\D/g, '');
      if (cleanDigits.length === 11 && (cleanDigits.startsWith('7') || cleanDigits.startsWith('8'))) {
        parsed = parsePhoneNumberFromString(cleanDigits, 'RU');
      } else if (cleanDigits.startsWith('996') && cleanDigits.length === 12) {
        parsed = parsePhoneNumberFromString(`+${cleanDigits}`);
      }
    }
  }

  if (!parsed || !parsed.isValid()) {
    return {
      isValid: false,
      error: 'Укажите корректный номер телефона (например, +996 555 123 456 или +7 999 123 45 67)',
    };
  }

  const normalized = parsed.number; // E.164, e.g. "+996550337776" or "+79551234567"

  return {
    isValid: true,
    normalized,
    country: parsed.country,
    nationalPart: parsed.nationalNumber,
    formattedInternational: parsed.formatInternational(),
    formattedNational: parsed.formatNational(),
  };
}

/**
 * Normalizes phone input into canonical E.164 format (+XXXXXXXXXXXX).
 * Preserves existing database numbers.
 */
export function normalizePhoneNumber(
  raw?: string | null,
  defaultCountry: CountryCode = 'KG'
): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';

  const validation = validatePhoneNumber(trimmed, defaultCountry);
  if (validation.isValid && validation.normalized) {
    return validation.normalized;
  }

  // Graceful fallback for numbers with standard digits
  const cleanDigits = trimmed.replace(/\D/g, '');
  if (trimmed.startsWith('+') && cleanDigits.length >= 7) {
    return `+${cleanDigits}`;
  }
  if (cleanDigits.startsWith('996') && cleanDigits.length === 12) {
    return `+${cleanDigits}`;
  }
  if (cleanDigits.length === 11 && (cleanDigits.startsWith('7') || cleanDigits.startsWith('8'))) {
    return `+7${cleanDigits.slice(1)}`;
  }
  if (cleanDigits.length === 9) {
    // 9 digits in KG (e.g. 555123456)
    return `+996${cleanDigits}`;
  }
  if (cleanDigits.length === 10 && cleanDigits.startsWith('0')) {
    // 10 digits in KG starting with 0 (e.g. 0555123456)
    return `+996${cleanDigits.slice(1)}`;
  }

  return trimmed;
}

/**
 * Formats a phone number for UI display:
 * Defaults to international format (e.g. "+996 550 337 776", "+7 955 123 45 67").
 */
export function formatPhoneNumber(
  phone?: string | null,
  formatOrIncludeCountryCode: 'INTERNATIONAL' | 'NATIONAL' | boolean = 'INTERNATIONAL'
): string {
  if (!phone) return '—';
  const trimmed = phone.trim();
  if (!trimmed) return '—';

  const isNational =
    formatOrIncludeCountryCode === 'NATIONAL' || formatOrIncludeCountryCode === false;

  const parsed = parsePhoneNumberFromString(trimmed, 'KG');
  if (parsed && parsed.isValid()) {
    return isNational ? parsed.formatNational() : parsed.formatInternational();
  }

  // Fallback if parsing didn't mark valid but starts with +
  if (trimmed.startsWith('+')) {
    const cleanDigits = trimmed.replace(/\D/g, '');
    if (cleanDigits.startsWith('996') && cleanDigits.length === 12) {
      const p1 = cleanDigits.slice(3, 6);
      const p2 = cleanDigits.slice(6, 9);
      const p3 = cleanDigits.slice(9, 12);
      return isNational ? `0${p1} ${p2} ${p3}` : `+996 ${p1} ${p2} ${p3}`;
    }
    if (cleanDigits.startsWith('7') && cleanDigits.length === 11) {
      const code = cleanDigits.slice(1, 4);
      const p1 = cleanDigits.slice(4, 7);
      const p2 = cleanDigits.slice(7, 9);
      const p3 = cleanDigits.slice(9, 11);
      return isNational ? `${code} ${p1}-${p2}-${p3}` : `+7 ${code} ${p1}-${p2}-${p3}`;
    }
  }

  return trimmed;
}

/**
 * Formats live digits as user types using AsYouType for the given country.
 */
export function formatNationalDigits(digits: string, country: CountryCode = 'KG'): string {
  if (!digits) return '';
  const ayt = new AsYouType(country);
  return ayt.input(digits);
}

/**
 * Validates whether the given phone number is valid.
 */
export function isValidPhoneNumber(
  phone?: string | null,
  defaultCountry: CountryCode = 'KG'
): boolean {
  if (!phone) return false;
  return validatePhoneNumber(phone, defaultCountry).isValid;
}

/**
 * Reusable Zod schema for international Telegram phone numbers with automatic E.164 normalization.
 */
export const phoneSchema = z
  .string({ required_error: 'Номер Telegram обязателен' })
  .min(1, 'Номер Telegram обязателен')
  .superRefine((val, ctx) => {
    const validation = validatePhoneNumber(val);
    if (!validation.isValid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: validation.error || 'Укажите корректный номер телефона',
      });
    }
  })
  .transform((val) => {
    return normalizePhoneNumber(val);
  });

/**
 * Optional phone schema with automatic E.164 normalization.
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
        message: validation.error || 'Укажите корректный номер телефона',
      });
    }
  })
  .transform((val) => {
    if (!val || !val.trim()) return undefined;
    return normalizePhoneNumber(val);
  });
