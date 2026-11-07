export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(message: string, statusCode = 500, code = 'INTERNAL_ERROR', details?: unknown) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed', details?: unknown) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Access denied: insufficient permissions') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Resource', id?: string) {
    super(
      id ? `${resource} with id "${id}" was not found` : `${resource} not found`,
      404,
      'NOT_FOUND'
    );
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource already exists') {
    super(message, 409, 'CONFLICT');
  }
}

export class RateLimitExceededError extends AppError {
  constructor(message = 'Too many requests, please try again later') {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
  }
}

/**
 * Checks whether an error is a Next.js navigation redirect or notFound signal.
 */
export function isRedirectError(error: unknown): boolean {
  if (typeof error === 'object' && error !== null) {
    if ('digest' in error && typeof (error as { digest: unknown }).digest === 'string') {
      const digest = (error as { digest: string }).digest;
      return digest.startsWith('NEXT_REDIRECT') || digest.startsWith('NEXT_NOT_FOUND');
    }
  }
  return false;
}

/**
 * Checks whether an error is an expected authentication/authorization flow error
 * (e.g. unauthenticated redirect, session expiration, insufficient role)
 * rather than an unexpected 500 internal server crash.
 */
export function isExpectedAuthError(error: unknown): boolean {
  if (isRedirectError(error)) {
    return true;
  }
  if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
    return true;
  }
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code: unknown }).code;
    return code === 'UNAUTHORIZED' || code === 'FORBIDDEN';
  }
  return false;
}
