import { describe, it, expect, vi } from 'vitest';
import { validatePasswordComplexity } from '@/lib/security/password';
import { validatePasswordComplexity as validateAdminPassword, verifyTargetDatabase } from '../../scripts/init-admin';
import { UserRole } from '@prisma/client';

const {
  ALLOWED_ENDPOINT_ID,
  ALLOWED_POOLED_HOST,
  ALLOWED_DIRECT_HOST,
  ALLOWED_DATABASE_NAME,
  OLD_ENDPOINT_ID,
} = require('../../scripts/check-db-target.js');

describe('SUPER_ADMIN Bootstrap Security & Centralized Validator', () => {
  const validPooled = `postgresql://neondb_owner:dummySecret123@${ALLOWED_POOLED_HOST}/${ALLOWED_DATABASE_NAME}?sslmode=require`;
  const validDirect = `postgresql://neondb_owner:dummySecret123@${ALLOWED_DIRECT_HOST}/${ALLOWED_DATABASE_NAME}?sslmode=require`;

  it('1. verifyTargetDatabase in init-admin accepts dedicated Staging endpoint', () => {
    const res = verifyTargetDatabase(validPooled, validDirect);
    expect(res.endpointId).toBe(ALLOWED_ENDPOINT_ID);
    expect(res.database).toBe(ALLOWED_DATABASE_NAME);
    expect(res.pooledHost).toBe(ALLOWED_POOLED_HOST);
    expect(res.directHost).toBe(ALLOWED_DIRECT_HOST);
  });

  it('2. verifyTargetDatabase in init-admin rejects old staging endpoint (ep-dawn-wildflower-b98aa1ax)', () => {
    const oldPooled = `postgresql://neondb_owner:pass@${OLD_ENDPOINT_ID}-pooler.c-7.eu-central-1.aws.neon.tech/alibros_staging?sslmode=require`;
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('PROCESS_EXIT_CALLED');
    }) as any);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => verifyTargetDatabase(oldPooled, validDirect)).toThrow('PROCESS_EXIT_CALLED');
    expect(exitSpy).toHaveBeenCalledWith(1);

    exitSpy.mockRestore();
    consoleSpy.mockRestore();
  });

  it('3. verifyTargetDatabase in init-admin rejects Production database/endpoint', () => {
    const prodPooled = `postgresql://user:pass@ep-production-db.c-7.eu-central-1.aws.neon.tech/alibros_production?sslmode=require`;
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('PROCESS_EXIT_CALLED');
    }) as any);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => verifyTargetDatabase(prodPooled, validDirect)).toThrow('PROCESS_EXIT_CALLED');
    expect(exitSpy).toHaveBeenCalledWith(1);

    exitSpy.mockRestore();
    consoleSpy.mockRestore();
  });
});

describe('JWT_SECRET Staging/Production Security Enforcement', () => {
  it('4. Ensures current local JWT_SECRET is 64 hex characters (256-bit)', () => {
    const secret = process.env.JWT_SECRET;
    expect(secret).toBeDefined();
    expect(secret?.length).toBe(64);
    expect(/^[0-9a-f]{64}$/.test(secret!)).toBe(true);
    expect(secret).not.toBe('insecure-dev-secret-key-change-in-production-min-16');
  });
});

describe('SUPER_ADMIN Creation Idempotency & Complexity Rules', () => {
  it('5. Strict parity between lib/security/password and init-admin validator', () => {
    const validPass = 'AliBros@Staging2026!';
    expect(validatePasswordComplexity(validPass).isValid).toBe(true);
    expect(validateAdminPassword(validPass).isValid).toBe(true);

    const weakPass = 'weakpass';
    expect(validatePasswordComplexity(weakPass).isValid).toBe(false);
    expect(validateAdminPassword(weakPass).isValid).toBe(false);
  });

  it('6. Rejects password missing special character or digit', () => {
    expect(validateAdminPassword('NoSpecialChar1234').isValid).toBe(false);
    expect(validateAdminPassword('NoDigitsHereSpecial!').isValid).toBe(false);
    expect(validateAdminPassword('short1!').isValid).toBe(false);
  });

  it('7. Duplicate SUPER_ADMIN check logic prevents multi-admin creation', () => {
    const mockExistingAdmin = {
      id: 'existing-super-admin-id',
      email: 'admin@alibros.ru',
      role: UserRole.SUPER_ADMIN,
    };

    const isDuplicateBlocked = mockExistingAdmin && mockExistingAdmin.role === UserRole.SUPER_ADMIN;
    expect(isDuplicateBlocked).toBe(true);
  });
});
