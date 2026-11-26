import { describe, it, expect } from 'vitest';
import {
  isChunkLoadErrorMessage,
  canAttemptAutoReload,
  CHUNK_RELOAD_COOLDOWN_MS,
  ChunkErrorRecovery,
} from '@/components/system/chunk-error-recovery';
import {
  POPULAR_COUNTRIES,
  formatNationalDigitsLite,
  normalizePhoneNumberLite,
  parseInitialPhoneLite,
  loadFullPhoneUtils,
} from '@/lib/phone-client';
import AppError from '@/app/error';
import GlobalError from '@/app/global-error';

describe('Resilience: ChunkLoadError recovery & Error Boundaries', () => {
  it('detects webpack / Next.js chunk and dynamic import errors accurately', () => {
    expect(isChunkLoadErrorMessage('ChunkLoadError: Loading chunk 7263 failed.')).toBe(true);
    expect(isChunkLoadErrorMessage('Loading CSS chunk 64ccf failed')).toBe(true);
    expect(isChunkLoadErrorMessage('TypeError: Failed to fetch dynamically imported module')).toBe(true);
    expect(isChunkLoadErrorMessage('Importing a module script failed.')).toBe(true);

    expect(isChunkLoadErrorMessage('Неверный логин или пароль')).toBe(false);
    expect(isChunkLoadErrorMessage('')).toBe(false);
    expect(isChunkLoadErrorMessage(null)).toBe(false);
  });

  it('prevents infinite reload loops using sessionStorage cooldown', () => {
    const store = new Map<string, string>();
    const mockStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
    };

    const t0 = 1_700_000_000_000;
    expect(canAttemptAutoReload(mockStorage, t0)).toBe(true);
    // Immediate retry within cooldown must be blocked
    expect(canAttemptAutoReload(mockStorage, t0 + 5_000)).toBe(false);
    expect(canAttemptAutoReload(mockStorage, t0 + CHUNK_RELOAD_COOLDOWN_MS - 1)).toBe(false);
    // After cooldown expires, another reload is allowed
    expect(canAttemptAutoReload(mockStorage, t0 + CHUNK_RELOAD_COOLDOWN_MS + 1)).toBe(true);
    // Missing storage fails safely without throwing
    expect(canAttemptAutoReload(null, t0)).toBe(false);
  });

  it('exports AppError, GlobalError, and ChunkErrorRecovery components', () => {
    expect(typeof AppError).toBe('function');
    expect(typeof GlobalError).toBe('function');
    expect(typeof ChunkErrorRecovery).toBe('function');
  });
});

describe('Optimized /login Phone Client Utilities (zero-zod, lazy libphonenumber-js)', () => {
  it('formats KG, RU, KZ, and UZ national digits synchronously before full library loads', () => {
    expect(formatNationalDigitsLite('555123456', 'KG')).toBe('555 123 456');
    expect(formatNationalDigitsLite('9991234567', 'RU')).toBe('999 123-45-67');
    expect(formatNationalDigitsLite('7011234567', 'KZ')).toBe('701 123-45-67');
    expect(formatNationalDigitsLite('901234567', 'UZ')).toBe('90 123 45 67');
  });

  it('normalizes common E.164 inputs synchronously without libphonenumber-js', () => {
    expect(normalizePhoneNumberLite('+996 555 123 456', 'KG')).toBe('+996555123456');
    expect(normalizePhoneNumberLite('89991234567', 'KG')).toBe('+79991234567');
    expect(normalizePhoneNumberLite('0555123456', 'KG')).toBe('+996555123456');
    expect(normalizePhoneNumberLite('555123456', 'KG')).toBe('+996555123456');
  });

  it('parses initial phone numbers including RU vs KZ disambiguation', () => {
    expect(parseInitialPhoneLite('+996555123456')).toEqual({
      country: 'KG',
      national: '555123456',
    });
    expect(parseInitialPhoneLite('+79991234567')).toEqual({
      country: 'RU',
      national: '9991234567',
    });
    expect(parseInitialPhoneLite('+77011234567')).toEqual({
      country: 'KZ',
      national: '7011234567',
    });
    expect(parseInitialPhoneLite('89161234567')).toEqual({
      country: 'RU',
      national: '9161234567',
    });
  });

  it('dynamically loads full libphonenumber-js with all 200+ countries and full parsing', async () => {
    const utils = await loadFullPhoneUtils();
    const countries = utils.getAllCountries();

    expect(countries.length).toBeGreaterThan(200);
    expect(countries.slice(0, POPULAR_COUNTRIES.length).map((c) => c.code)).toEqual(
      POPULAR_COUNTRIES.map((c) => c.code)
    );
    expect(utils.getCountryCallingCodeSafe('RU')).toBe('+7');
    expect(utils.getCountryCallingCodeSafe('KG')).toBe('+996');
    expect(utils.normalizePhoneNumber('+7 (999) 123-45-67', 'RU')).toBe('+79991234567');

    const parsed = utils.parsePhone('+4915123456789');
    expect(parsed?.isValid).toBe(true);
    expect(parsed?.country).toBe('DE');
    expect(parsed?.number).toBe('+4915123456789');
  });
});
