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

/**
 * Validates staff password complexity (SUPER_ADMIN, ADMIN, MANAGER, ACCOUNTANT)
 * against 5 strict criteria:
 * 1. Min 12 chars
 * 2. At least 1 uppercase letter (A-Z)
 * 3. At least 1 lowercase letter (a-z)
 * 4. At least 1 digit (0-9)
 * 5. At least 1 special character
 */
export function validatePasswordComplexity(password: string): { isValid: boolean; error?: string } {
  if (!password || password.length < 12) {
    return { isValid: false, error: 'Пароль должен содержать как минимум 12 символов' };
  }
  if (!/[A-Z]/.test(password)) {
    return { isValid: false, error: 'Пароль должен содержать хотя бы одну заглавную латинскую букву (A-Z)' };
  }
  if (!/[a-z]/.test(password)) {
    return { isValid: false, error: 'Пароль должен содержать хотя бы одну строчную латинскую букву (a-z)' };
  }
  if (!/[0-9]/.test(password)) {
    return { isValid: false, error: 'Пароль должен содержать хотя бы одну цифру (0-9)' };
  }
  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(password)) {
    return { isValid: false, error: 'Пароль должен содержать хотя бы один специальный символ (!@#$%^&*()_+-=[]{};\':"\\|,.<>/?)' };
  }
  return { isValid: true };
}

// Alias for explicit staff validation clarity
export const validateStaffPasswordComplexity = validatePasswordComplexity;

/**
 * Validates client / seller registration password:
 * 1. Minimum 8 characters.
 * No requirements for uppercase, lowercase, digits, or special characters.
 */
export function validateClientPassword(password: string): { isValid: boolean; error?: string } {
  if (!password || password.length < 8) {
    return { isValid: false, error: 'Пароль должен содержать как минимум 8 символов' };
  }
  return { isValid: true };
}

