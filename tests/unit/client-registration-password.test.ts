import { describe, it, expect } from 'vitest';
import { validateClientPassword, validatePasswordComplexity, validateStaffPasswordComplexity } from '@/lib/security/password';
import { registerClientSchema } from '@/modules/auth/auth.dto';
import { registerAction } from '@/app/actions/auth';

describe('STEP 7.9.1: Seller Registration Password Validation', () => {
  describe('1. validateClientPassword function', () => {
    it('rejects passwords with 7 characters (7 символов — отказ)', () => {
      const result = validateClientPassword('1234567');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Пароль должен содержать как минимум 8 символов');
    });

    it('accepts passwords with exactly 8 characters (8 символов — успешно)', () => {
      const result = validateClientPassword('password');
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('accepts passwords with 12 characters (12 символов — проходит)', () => {
      const result = validateClientPassword('twelvecharss');
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('does NOT require uppercase letters (пароль с заглавной буквой не обязателен)', () => {
      const result = validateClientPassword('nouppercasehere8');
      expect(result.isValid).toBe(true);
    });

    it('does NOT require special characters (пароль без специального символа допускается)', () => {
      const result = validateClientPassword('nospecialchar123');
      expect(result.isValid).toBe(true);
    });

    it('does NOT require digits', () => {
      const result = validateClientPassword('justplainletters');
      expect(result.isValid).toBe(true);
    });
  });

  describe('2. registerClientSchema (Zod validation)', () => {
    const validBaseData = {
      companyName: 'ОсОО «Тест Селлер»',
      contactPerson: 'Акылбеков Б.',
      phone: '+996555123456',
      email: 'seller@example.com',
    };

    it('fails Zod parse when password is 7 characters', () => {
      const parseResult = registerClientSchema.safeParse({
        ...validBaseData,
        password: 'short77',
      });
      expect(parseResult.success).toBe(false);
      if (!parseResult.success) {
        const passwordError = parseResult.error.errors.find((e) => e.path.includes('password'));
        expect(passwordError).toBeDefined();
        expect(passwordError?.message).toBe('Пароль должен содержать как минимум 8 символов');
      }
    });

    it('succeeds Zod parse when password is 8 characters with all lowercase and no special symbols', () => {
      const parseResult = registerClientSchema.safeParse({
        ...validBaseData,
        password: 'simple88',
      });
      expect(parseResult.success).toBe(true);
    });

    it('succeeds Zod parse when password is 12 characters', () => {
      const parseResult = registerClientSchema.safeParse({
        ...validBaseData,
        password: 'mytwelvelong',
      });
      expect(parseResult.success).toBe(true);
    });
  });

  describe('3. registerAction form validation & password matching', () => {
    it('returns error when passwords do not match (пароли не совпадают — отказ)', async () => {
      const formData = new FormData();
      formData.set('companyName', 'ОсОО «Али Селлер»');
      formData.set('contactPerson', 'Алибек А.');
      formData.set('phone', '+996555123456');
      formData.set('password', 'password123');
      formData.set('confirmPassword', 'different123');

      const result = await registerAction(null, formData);
      expect(result).toEqual({ success: false, error: 'Пароли не совпадают' });
    });

    it('returns error when password is less than 8 characters', async () => {
      const formData = new FormData();
      formData.set('companyName', 'ОсОО «Али Селлер»');
      formData.set('contactPerson', 'Алибек А.');
      formData.set('phone', '+996555123456');
      formData.set('password', 'short');
      formData.set('confirmPassword', 'short');

      const result = await registerAction(null, formData);
      expect(result).toEqual({
        success: false,
        error: 'Пароль должен содержать как минимум 8 символов',
      });
    });
  });

  describe('4. Strict Staff password policy isolation', () => {
    it('Staff password policy (validatePasswordComplexity / validateStaffPasswordComplexity) remains unchanged', () => {
      const validStaff = 'StaffP@ssw0rd2026!';
      expect(validatePasswordComplexity(validStaff).isValid).toBe(true);
      expect(validateStaffPasswordComplexity(validStaff).isValid).toBe(true);

      expect(validatePasswordComplexity('Short1!Aa').isValid).toBe(false);
      expect(validatePasswordComplexity('alllower123!special').isValid).toBe(false);
      expect(validatePasswordComplexity('NoSpecialChar1234').isValid).toBe(false);
      expect(validatePasswordComplexity('NoDigitsHereSpecial!').isValid).toBe(false);
    });

    it('Verifies clear divergence: a simple 8-char client password is valid for client but strictly forbidden for staff', () => {
      const simpleClientPassword = 'plainpassword8';
      expect(validateClientPassword(simpleClientPassword).isValid).toBe(true);
      expect(validateStaffPasswordComplexity(simpleClientPassword).isValid).toBe(false);
    });
  });
});
