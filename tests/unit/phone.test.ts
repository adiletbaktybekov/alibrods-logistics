import { describe, it, expect } from 'vitest';
import {
  normalizePhoneNumber,
  formatPhoneNumber,
  isValidPhoneNumber,
  phoneSchema,
} from '@/lib/phone';

describe('Unified Phone Utilities (+7)', () => {
  describe('normalizePhoneNumber', () => {
    it('normalizes standard +7 with spaces and dashes', () => {
      expect(normalizePhoneNumber('+7 955 123-45-67')).toBe('+79551234567');
    });

    it('normalizes standard 8 prefix (Russian trunk)', () => {
      expect(normalizePhoneNumber('8 (955) 123-45-67')).toBe('+79551234567');
      expect(normalizePhoneNumber('89551234567')).toBe('+79551234567');
    });

    it('normalizes 10 digits starting with 9', () => {
      expect(normalizePhoneNumber('9551234567')).toBe('+79551234567');
      expect(normalizePhoneNumber('955 123 45 67')).toBe('+79551234567');
    });

    it('normalizes 7 without plus', () => {
      expect(normalizePhoneNumber('79551234567')).toBe('+79551234567');
    });

    it('handles empty or null safely', () => {
      expect(normalizePhoneNumber('')).toBe('');
      expect(normalizePhoneNumber(null)).toBe('');
      expect(normalizePhoneNumber(undefined)).toBe('');
    });
  });

  describe('formatPhoneNumber', () => {
    it('formats normalized number to +7 9XX XXX-XX-XX', () => {
      expect(formatPhoneNumber('+79551234567')).toBe('+7 955 123-45-67');
    });

    it('formats raw number with leading 8', () => {
      expect(formatPhoneNumber('89551234567')).toBe('+7 955 123-45-67');
    });

    it('returns dash for empty values', () => {
      expect(formatPhoneNumber(null)).toBe('—');
      expect(formatPhoneNumber('')).toBe('—');
    });
  });

  describe('isValidPhoneNumber', () => {
    it('validates 11-digit +7 numbers', () => {
      expect(isValidPhoneNumber('+79551234567')).toBe(true);
      expect(isValidPhoneNumber('+7 955 123-45-67')).toBe(true);
      expect(isValidPhoneNumber('89551234567')).toBe(true);
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
    });

    it('fails for too short or invalid phone', () => {
      const res = phoneSchema.safeParse('123');
      expect(res.success).toBe(false);
    });
  });
});
