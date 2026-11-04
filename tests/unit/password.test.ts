import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '@/lib/security/password';

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
