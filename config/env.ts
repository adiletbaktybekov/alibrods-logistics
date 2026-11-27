import { z } from 'zod';

export const INSECURE_DEFAULT_JWT_SECRET = 'insecure-dev-secret-key-change-in-production-min-16';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DATABASE_URL: z.string().url().optional(),
  DIRECT_URL: z.string().url().optional(),
  JWT_SECRET: z.string().min(16).default(INSECURE_DEFAULT_JWT_SECRET),
  JWT_EXPIRES_IN: z.string().default('7d'),
  TELEGRAM_CLIENT_BOT_TOKEN: z.string().optional(),
  TELEGRAM_DRIVER_BOT_TOKEN: z.string().optional(),
  TELEGRAM_MANAGER_BOT_TOKEN: z.string().optional(),
  TELEGRAM_MANAGER_GROUP_CHAT_ID: z.string().optional(),
  TELEGRAM_MANAGER_GROUP_TOPIC_ID: z.string().optional(),
  TELEGRAM_ENABLE_GROUP_NOTIFICATIONS: z.coerce.boolean().default(true),
  TELEGRAM_BOT_WEBHOOK_SECRET: z.string().optional(),
  TELEGRAM_RELAY_URL: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().url().optional()
  ),
  TELEGRAM_RELAY_SECRET: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().min(24).optional()
  ),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(100),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
}).superRefine((data, ctx) => {
  const isBuildPhase =
    process.env.NEXT_PHASE === 'phase-production-build' ||
    process.env.SKIP_ENV_VALIDATION === 'true';

  if (isBuildPhase) {
    return;
  }

  const isProdOrStaging =
    data.NODE_ENV === 'production' ||
    process.env.VERCEL === '1' ||
    !!process.env.VERCEL ||
    process.env.STAGING === 'true' ||
    process.env.REQUIRE_DB_ENV === 'true' ||
    process.env.VERCEL_ENV === 'preview' ||
    process.env.VERCEL_ENV === 'production';

  if (isProdOrStaging) {
    if (!data.DATABASE_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'DATABASE_URL is required in production and staging environments',
        path: ['DATABASE_URL'],
      });
    }
    if (!data.DIRECT_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'DIRECT_URL is required in production and staging environments',
        path: ['DIRECT_URL'],
      });
    }
    if (!process.env.JWT_SECRET || data.JWT_SECRET === INSECURE_DEFAULT_JWT_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'JWT_SECRET is required and must not use the insecure default dev key in production and staging environments',
        path: ['JWT_SECRET'],
      });
    }
  }
});

export type Env = z.infer<typeof envSchema>;

let parsedEnv: Env;

try {
  parsedEnv = envSchema.parse(process.env);
} catch (error) {
  const isBuildPhase =
    process.env.NEXT_PHASE === 'phase-production-build' ||
    process.env.SKIP_ENV_VALIDATION === 'true';

  const isProdOrStaging =
    !isBuildPhase &&
    (process.env.NODE_ENV === 'production' ||
      process.env.VERCEL === '1' ||
      !!process.env.VERCEL ||
      process.env.STAGING === 'true' ||
      process.env.REQUIRE_DB_ENV === 'true' ||
      process.env.VERCEL_ENV === 'preview' ||
      process.env.VERCEL_ENV === 'production');

  if (isProdOrStaging) {
    throw new Error(`Environment validation failed: ${JSON.stringify((error as z.ZodError).format())}`);
  }
  // In development/test/build phase, provide defaults
  parsedEnv = envSchema.parse({});
}

export const env = parsedEnv;

