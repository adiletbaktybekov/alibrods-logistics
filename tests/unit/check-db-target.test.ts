import { describe, it, expect } from 'vitest';
const {
  ALLOWED_ENDPOINT_ID,
  ALLOWED_POOLED_HOST,
  ALLOWED_DIRECT_HOST,
  ALLOWED_DATABASE_NAME,
  OLD_ENDPOINT_ID,
  inspectUrl,
  verifyTargetDatabase,
} = require('../../scripts/check-db-target.js');

describe('Target Database Security Validator (check-db-target.js)', () => {
  const validPooled = `postgresql://neondb_owner:dummySecret123@${ALLOWED_POOLED_HOST}/${ALLOWED_DATABASE_NAME}?sslmode=require`;
  const validDirect = `postgresql://neondb_owner:dummySecret123@${ALLOWED_DIRECT_HOST}/${ALLOWED_DATABASE_NAME}?sslmode=require`;

  it('should accept valid pooled DATABASE_URL and direct DIRECT_URL for new staging endpoint', () => {
    const result = verifyTargetDatabase(validPooled, validDirect);
    expect(result.success).toBe(true);
    expect(result.endpointId).toBe(ALLOWED_ENDPOINT_ID);
    expect(result.database).toBe(ALLOWED_DATABASE_NAME);
    expect(result.pooledHost).toBe(ALLOWED_POOLED_HOST);
    expect(result.directHost).toBe(ALLOWED_DIRECT_HOST);
  });

  it('should reject old staging endpoint (ep-dawn-wildflower-b98aa1ax)', () => {
    const oldPooled = `postgresql://neondb_owner:pass@${OLD_ENDPOINT_ID}-pooler.c-7.eu-central-1.aws.neon.tech/alibros_staging?sslmode=require`;
    expect(() => inspectUrl('DATABASE_URL', oldPooled, false)).toThrow(/OLD staging endpoint/);
  });

  it('should reject production database name', () => {
    const prodDb = `postgresql://user:pass@${ALLOWED_POOLED_HOST}/alibros_production?sslmode=require`;
    expect(() => inspectUrl('DATABASE_URL', prodDb, false)).toThrow(/production flags/);
  });

  it('should reject production hostname', () => {
    const prodHost = `postgresql://user:pass@ep-prod-database-1234.c-7.eu-central-1.aws.neon.tech/neondb?sslmode=require`;
    expect(() => inspectUrl('DATABASE_URL', prodHost, false)).toThrow(/production flags/);
  });

  it('should reject non-Neon database', () => {
    const rds = `postgresql://user:pass@mydb.rds.amazonaws.com/neondb?sslmode=require`;
    expect(() => inspectUrl('DATABASE_URL', rds, false)).toThrow(/not a Neon Cloud database/);
  });

  it('should reject wrong endpoint ID', () => {
    const wrongEndpoint = `postgresql://user:pass@ep-random-name-12345678-pooler.c-7.eu-central-1.aws.neon.tech/neondb?sslmode=require`;
    expect(() => inspectUrl('DATABASE_URL', wrongEndpoint, false)).toThrow(/does not match the allowed staging endpoint/);
  });

  it('should reject swap of pooled and direct hosts', () => {
    expect(() => inspectUrl('DATABASE_URL', validDirect, false)).toThrow(/hostname mismatch/);
    expect(() => inspectUrl('DIRECT_URL', validPooled, true)).toThrow(/hostname mismatch/);
  });

  it('should reject database other than neondb', () => {
    const wrongDb = `postgresql://user:pass@${ALLOWED_POOLED_HOST}/alibros_staging?sslmode=require`;
    expect(() => inspectUrl('DATABASE_URL', wrongDb, false)).toThrow(/database name 'alibros_staging' is invalid. Expected 'neondb'/);
  });

  it('should reject missing sslmode=require', () => {
    const noSsl = `postgresql://user:pass@${ALLOWED_POOLED_HOST}/${ALLOWED_DATABASE_NAME}`;
    expect(() => inspectUrl('DATABASE_URL', noSsl, false)).toThrow(/missing mandatory 'sslmode=require'/);
  });
});
