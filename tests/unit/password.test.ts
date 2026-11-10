import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword, validatePasswordComplexity, validateClientPassword } from '@/lib/security/password';
import { validatePasswordComplexity as validateAdminPassword } from '../../scripts/init-admin';

describe('Password Security (Argon2id)', () => {
  it('should successfully hash a valid password', async () => {
    const password = 'StrongPassword123!';
    const hash = await hashPassword(password);

    expect(hash).toBeDefined();
    expect(hash).toContain('$argon2id$');
  });

  it('should verify a correct password against hash', async () => {
    const password = 'CorrectHorseBatteryStaple!';
    const hash = await hashPassword(password);

    const isMatch = await verifyPassword(password, hash);
    expect(isMatch).toBe(true);
  });

  it('should reject an incorrect password', async () => {
    const password = 'ActualPassword123!';
    const hash = await hashPassword(password);

    const isMatch = await verifyPassword('WrongPassword999!', hash);
    expect(isMatch).toBe(false);
  });

  it('should throw an error for passwords shorter than 8 characters', async () => {
    await expect(hashPassword('short')).rejects.toThrow('at least 8 characters');
  });
});

describe('Admin Password Complexity Validation', () => {
  it('should verify parity between lib/security/password and init-admin validator', () => {
    const testCases = [
      'AliBros@Staging2026!',
      'short',
      'nouppercase123456789!',
      'NOLOWERCASE123456789!',
      'NoDigitsHereSpecialChars!!',
      'NoSpecialCharsHere12345678',
    ];
    for (const tc of testCases) {
      expect(validatePasswordComplexity(tc).isValid).toBe(validateAdminPassword(tc).isValid);
    }
  });
  it('should accept a compliant password (>=12 chars, uppercase, lowercase, number, special char)', () => {
    const result = validatePasswordComplexity('AliBros@Staging2026!');
    expect(result.isValid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('should reject passwords shorter than 12 characters', () => {
    const result = validatePasswordComplexity('Ab1!short');
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('12 символов');
  });

  it('should reject passwords missing uppercase characters', () => {
    const result = validatePasswordComplexity('alibros@staging2026!');
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('заглавную');
  });

  it('should reject passwords missing lowercase characters', () => {
    const result = validatePasswordComplexity('ALIBROS@STAGING2026!');
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('строчную');
  });

  it('should reject passwords missing digits', () => {
    const result = validatePasswordComplexity('AliBros@StagingNoDigit!');
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('цифру');
  });

  it('should reject passwords missing special characters', () => {
    const result = validatePasswordComplexity('AliBrosStaging2026NoSpecial');
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('специальный');
  });
});

describe('Client / Seller Registration Password Policy (Simplified)', () => {
  it('should reject passwords shorter than 8 characters (7 chars -> error)', () => {
    const result = validateClientPassword('1234567');
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('Пароль должен содержать как минимум 8 символов');
  });

  it('should accept passwords with exactly 8 characters', () => {
    const result = validateClientPassword('password');
    expect(result.isValid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('should accept passwords with 12 characters', () => {
    const result = validateClientPassword('twelvecharss');
    expect(result.isValid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('should accept passwords without uppercase letters (no uppercase required)', () => {
    const result = validateClientPassword('alllowercase8');
    expect(result.isValid).toBe(true);
  });

  it('should accept passwords without special characters (no special char required)', () => {
    const result = validateClientPassword('alphanumeric123');
    expect(result.isValid).toBe(true);
  });

  it('should accept passwords without digits (no digits required)', () => {
    const result = validateClientPassword('onlylettershere');
    expect(result.isValid).toBe(true);
  });

  it('should maintain strict separation: client-valid password is rejected by staff policy', () => {
    const clientPass = 'simplepass8';
    expect(validateClientPassword(clientPass).isValid).toBe(true);
    expect(validatePasswordComplexity(clientPass).isValid).toBe(false);
  });
});


