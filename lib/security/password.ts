import argon2 from 'argon2';

/**
 * Argon2id configuration following OWASP recommendations:
 * - Type: Argon2id (hybrid resistant to both side-channel and GPU cracking)
 * - Memory cost: 64 MB (65536 KB)
 * - Time cost: 3 iterations
 * - Parallelism: 4 threads
 */
export async function hashPassword(password: string): Promise<string> {
  if (!password || password.length < 8) {
    throw new Error('Password must be at least 8 characters long');
  }
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
    raw: false,
  });
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (!password || !hash) return false;
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}
