import crypto from 'node:crypto';

/**
 * Validates the Authorization Bearer header using constant-time comparison
 * to prevent timing attack vulnerabilities.
 */
export function isCronAuthorized(authHeader: string | null, expectedSecret: string | undefined): boolean {
  if (!authHeader || !expectedSecret) return false;

  const prefix = 'Bearer ';
  if (!authHeader.startsWith(prefix)) return false;

  const providedToken = authHeader.slice(prefix.length).trim();
  const tokenBuf = Buffer.from(providedToken, 'utf8');
  const secretBuf = Buffer.from(expectedSecret, 'utf8');

  if (tokenBuf.length !== secretBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(tokenBuf, secretBuf);
}
