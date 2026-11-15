import { describe, it, expect } from 'vitest';
import {
  validatePhoneNumber,
  normalizePhoneNumber,
  formatPhoneNumber,
  formatNationalDigits,
  isValidPhoneNumber,
  phoneSchema,
  optionalPhoneSchema,
} from '@/lib/phone';

describe('International Phone Validation and Formatting (Default KG +996)', () => {
  it('accepts valid Kyrgyzstan numbers in international format (+996 550 33-77-76)', () => {
    const res = validatePhoneNumber('+996 550 33-77-76');
    expect(res.isValid).toBe(true);
    expect(res.normalized).toBe('+996550337776');
    expect(res.country).toBe('KG');
  });

  it('accepts valid Kyrgyzstan numbers with leading 0 in national format (0550 337 776)', () => {
    const res = validatePhoneNumber('0550 337 776', 'KG');
    expect(res.isValid).toBe(true);
    expect(res.normalized).toBe('+996550337776');
    expect(res.country).toBe('KG');
  });

  it('accepts valid Russian numbers (+7 955 123-45-67)', () => {
    const res = validatePhoneNumber('+7 955 123-45-67');
    expect(res.isValid).toBe(true);
    expect(res.normalized).toBe('+79551234567');
    expect(res.country).toBe('RU');
  });

  it('accepts valid 11-digit Russian numbers starting with 8', () => {
    const res = validatePhoneNumber('89551234567');
    expect(res.isValid).toBe(true);
    expect(res.normalized).toBe('+79551234567');
    expect(res.country).toBe('RU');
  });

  it('accepts valid Kazakhstan numbers (+7 701 123 4567)', () => {
    const res = validatePhoneNumber('+7 701 123 4567');
    expect(res.isValid).toBe(true);
    expect(res.normalized).toBe('+77011234567');
    expect(res.country).toBe('KZ');
  });

  it('accepts valid Germany numbers (+49 151 23456789)', () => {
    const res = validatePhoneNumber('+49 151 23456789');
    expect(res.isValid).toBe(true);
    expect(res.normalized).toBe('+4915123456789');
    expect(res.country).toBe('DE');
  });

  it('accepts valid USA numbers (+1 202 555 0123)', () => {
    const res = validatePhoneNumber('+1 202 555 0123');
    expect(res.isValid).toBe(true);
    expect(res.normalized).toBe('+12025550123');
    expect(res.country).toBe('US');
  });

  it('rejects multiple plus signs', () => {
    const res = validatePhoneNumber('+7+79551234567');
    expect(res.isValid).toBe(false);
    expect(res.error).toContain('несколько кодов');
  });

  it('rejects invalid short numbers', () => {
    const res = validatePhoneNumber('12345');
    expect(res.isValid).toBe(false);
  });

  it('normalizes various formats to canonical E.164', () => {
    expect(normalizePhoneNumber('+996 550 33-77-76')).toBe('+996550337776');
    expect(normalizePhoneNumber('0550 337 776')).toBe('+996550337776');
    expect(normalizePhoneNumber('+7 955 123-45-67')).toBe('+79551234567');
    expect(normalizePhoneNumber('89551234567')).toBe('+79551234567');
    expect(normalizePhoneNumber('+49 151 23456789')).toBe('+4915123456789');
  });

  it('formats display numbers correctly', () => {
    expect(formatPhoneNumber('+996550337776')).toContain('996');
    expect(formatPhoneNumber('+79551234567')).toContain('955');
    expect(formatPhoneNumber(null)).toBe('—');
    expect(formatPhoneNumber('')).toBe('—');
  });

  it('phoneSchema parses valid numbers from Kyrgyzstan, Russia, and Germany', () => {
    const validKg = phoneSchema.safeParse('+996 550 33-77-76');
    expect(validKg.success).toBe(true);
    if (validKg.success) {
      expect(validKg.data).toBe('+996550337776');
    }

    const validRu = phoneSchema.safeParse('+7 (955) 123-45-67');
    expect(validRu.success).toBe(true);
    if (validRu.success) {
      expect(validRu.data).toBe('+79551234567');
    }

    const validDe = phoneSchema.safeParse('+49 151 23456789');
    expect(validDe.success).toBe(true);
    if (validDe.success) {
      expect(validDe.data).toBe('+4915123456789');
    }

    const invalid = phoneSchema.safeParse('not-a-phone');
    expect(invalid.success).toBe(false);
  });

  it('optionalPhoneSchema handles null and undefined safely', () => {
    expect(optionalPhoneSchema.safeParse(null).success).toBe(true);
    expect(optionalPhoneSchema.safeParse('').success).toBe(true);
    expect(optionalPhoneSchema.safeParse(undefined).success).toBe(true);
  });
});
