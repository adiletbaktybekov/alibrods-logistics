import { describe, it, expect } from 'vitest';
import {
  validatePhoneNumber,
  normalizePhoneNumber,
  formatPhoneNumber,
  formatNationalDigits,
  isValidPhoneNumber,
  phoneSchema,
} from '@/lib/phone';

describe('Strict Phone Validation and Formatting (+7 Russian Numbers)', () => {
  it('accepts valid 10-digit national numbers and normalizes to +7XXXXXXXXXX', () => {
    const res = validatePhoneNumber('9551234567');
    expect(res.isValid).toBe(true);
    expect(res.normalized).toBe('+79551234567');
    expect(res.nationalPart).toBe('9551234567');
  });

  it('accepts valid formatted Russian number (+7 955 123-45-67)', () => {
    const res = validatePhoneNumber('+7 955 123-45-67');
    expect(res.isValid).toBe(true);
    expect(res.normalized).toBe('+79551234567');
    expect(res.nationalPart).toBe('9551234567');
  });

  it('accepts valid 11-digit number starting with 8 and normalizes to +7', () => {
    const res = validatePhoneNumber('89551234567');
    expect(res.isValid).toBe(true);
    expect(res.normalized).toBe('+79551234567');
  });

  it('strictly rejects +996 numbers and does NOT silently rewrite them to +7', () => {
    const resPlus = validatePhoneNumber('+996 550 33-77-76');
    expect(resPlus.isValid).toBe(false);
    expect(resPlus.error).toContain('+996');

    const resRaw = validatePhoneNumber('996550337776');
    expect(resRaw.isValid).toBe(false);
    expect(resRaw.error).toContain('+996');
  });

  it('strictly rejects numbers starting with 0', () => {
    const res = validatePhoneNumber('0555123456');
    expect(res.isValid).toBe(false);
    expect(res.error).toContain('Номер не может начинаться с 0');

    const resPlus70 = validatePhoneNumber('+7 055 123-45-67');
    expect(resPlus70.isValid).toBe(false);
    expect(resPlus70.error).toContain('Номер не может начинаться с 0');
  });

  it('strictly rejects duplicate country codes (+77, +78, +7+7)', () => {
    const res = validatePhoneNumber('+7 79991234567');
    expect(res.isValid).toBe(false);
    expect(res.error).toContain('повторно');

    const resTwoPluses = validatePhoneNumber('+7+79551234567');
    expect(resTwoPluses.isValid).toBe(false);
  });

  it('strictly rejects numbers with invalid length (short or too long)', () => {
    const tooShort = validatePhoneNumber('95512345');
    expect(tooShort.isValid).toBe(false);
    expect(tooShort.error).toContain('Неполный номер');

    const tooLong = validatePhoneNumber('+7 955 123-45-67890');
    expect(tooLong.isValid).toBe(false);
    expect(tooLong.error).toContain('Номер должен содержать ровно 10 цифр');
  });

  it('preserves historical +996 numbers already stored in DB in normalizePhoneNumber', () => {
    const historical = '+996550337776';
    expect(normalizePhoneNumber(historical)).toBe(historical);
  });

  it('formats display mask correctly', () => {
    expect(formatNationalDigits('9551234567')).toBe('955 123-45-67');
    expect(formatPhoneNumber('+79551234567')).toBe('+7 955 123-45-67');
    expect(formatPhoneNumber('+79551234567', false)).toBe('955 123-45-67');
  });

  it('phoneSchema parses valid numbers and rejects invalid numbers with clear error message', () => {
    const valid = phoneSchema.safeParse('955 123-45-67');
    expect(valid.success).toBe(true);
    if (valid.success) {
      expect(valid.data).toBe('+79551234567');
    }

    const invalid996 = phoneSchema.safeParse('+996 550 33-77-76');
    expect(invalid996.success).toBe(false);
    if (!invalid996.success) {
      expect(invalid996.error.errors[0].message).toContain('+996');
    }

    const invalidZero = phoneSchema.safeParse('0555 123-45-67');
    expect(invalidZero.success).toBe(false);
    if (!invalidZero.success) {
      expect(invalidZero.error.errors[0].message).toContain('0');
    }
  });
});
