import pino from 'pino';
import { env } from '@/config/env';

const isProduction = env.NODE_ENV === 'production';

export const logger = pino({
  level: env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => ({ level: label.toUpperCase() }),
  },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'password',
      'passwordHash',
      'token',
      'secret',
      'initData',
    ],
    censor: '[REDACTED]',
  },
  transport: !isProduction
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          ignore: 'pid,hostname',
          translateTime: 'yyyy-mm-dd HH:MM:ss.l',
        },
      }
    : undefined,
});

export type Logger = typeof logger;

/**
 * Safely logs errors without triggering false-alarm critical alerts for expected
 * authentication redirects, expired sessions, or insufficient permissions.
 */
export function safeLogError(
  err: unknown,
  contextMessage: string,
  extraMeta?: Record<string, unknown>
): void {
  if (typeof err === 'object' && err !== null) {
    // Check if error is an expected redirect or auth challenge
    const digest = (err as { digest?: unknown }).digest;
    if (typeof digest === 'string' && (digest.startsWith('NEXT_REDIRECT') || digest.startsWith('NEXT_NOT_FOUND'))) {
      // Next.js intentional control flow: do not log as error
      logger.debug({ digest, ...extraMeta }, `${contextMessage} (Next.js navigation redirect)`);
      return;
    }

    const name = (err as Error).name;
    const code = (err as { code?: unknown }).code;
    if (
      name === 'UnauthorizedError' ||
      name === 'ForbiddenError' ||
      code === 'UNAUTHORIZED' ||
      code === 'FORBIDDEN'
    ) {
      logger.warn(
        {
          errName: name,
          errMessage: (err as Error).message,
          ...extraMeta,
        },
        `${contextMessage}: access challenge`
      );
      return;
    }
  }

  logger.error({ err, ...extraMeta }, contextMessage);
}
