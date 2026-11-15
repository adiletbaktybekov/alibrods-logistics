import { describe, it, expect } from 'vitest';
import {
  normalizePhoneNumber,
  formatPhoneNumber,
  isValidPhoneNumber,
  phoneSchema,
} from '@/lib/phone';

describe('Unified Phone Utilities (International & KG Default)', () => {
  describe('normalizePhoneNumber', () => {
    it('normalizes Kyrgyzstan numbers', () => {
      expect(normalizePhoneNumber('+996 550 33-77-76')).toBe('+996550337776');
      expect(normalizePhoneNumber('0550 337 776')).toBe('+996550337776');
      expect(normalizePhoneNumber('550337776')).toBe('+996550337776');
    });

    it('normalizes standard +7 with spaces and dashes', () => {
      expect(normalizePhoneNumber('+7 955 123-45-67')).toBe('+79551234567');
    });

    it('normalizes standard 8 prefix (Russian trunk)', () => {
      expect(normalizePhoneNumber('8 (955) 123-45-67')).toBe('+79551234567');
      expect(normalizePhoneNumber('89551234567')).toBe('+79551234567');
    });

    it('normalizes international numbers (Germany, USA)', () => {
      expect(normalizePhoneNumber('+49 151 23456789')).toBe('+4915123456789');
      expect(normalizePhoneNumber('+1 202 555 0123')).toBe('+12025550123');
    });

    it('handles empty or null safely', () => {
      expect(normalizePhoneNumber('')).toBe('');
      expect(normalizePhoneNumber(null)).toBe('');
      expect(normalizePhoneNumber(undefined)).toBe('');
    });
  });

  describe('formatPhoneNumber', () => {
    it('formats normalized Kyrgyzstan number', () => {
      expect(formatPhoneNumber('+996550337776')).toContain('996');
    });

    it('formats normalized number to +7 9XX XXX-XX-XX', () => {
      expect(formatPhoneNumber('+79551234567')).toBe('+7 955 123 45 67');
    });

    it('returns dash for empty values', () => {
      expect(formatPhoneNumber(null)).toBe('—');
      expect(formatPhoneNumber('')).toBe('—');
    });
  });

  describe('isValidPhoneNumber', () => {
    it('validates KG and international numbers', () => {
      expect(isValidPhoneNumber('+996550337776')).toBe(true);
      expect(isValidPhoneNumber('+79551234567')).toBe(true);
      expect(isValidPhoneNumber('+7 955 123-45-67')).toBe(true);
      expect(isValidPhoneNumber('89551234567')).toBe(true);
      expect(isValidPhoneNumber('+49 151 23456789')).toBe(true);
    });

    it('rejects invalid numbers', () => {
      expect(isValidPhoneNumber('12345')).toBe(false);
      expect(isValidPhoneNumber('')).toBe(false);
      expect(isValidPhoneNumber('+7999')).toBe(false);
    });
  });

  describe('phoneSchema', () => {
    it('parses and normalizes valid phone', () => {
      const res = phoneSchema.safeParse('+7 (955) 123-45-67');
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data).toBe('+79551234567');
      }

      const resKg = phoneSchema.safeParse('+996 550 33-77-76');
      expect(resKg.success).toBe(true);
      if (resKg.success) {
        expect(resKg.data).toBe('+996550337776');
      }
    });

    it('fails for too short or invalid phone', () => {
      const res = phoneSchema.safeParse('123');
      expect(res.success).toBe(false);
    });
  });
});
