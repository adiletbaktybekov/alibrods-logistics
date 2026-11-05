import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DATABASE_URL: z.string().url().optional(),
  DIRECT_URL: z.string().url().optional(),
  JWT_SECRET: z.string().min(16).default('insecure-dev-secret-key-change-in-production-min-16'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  TELEGRAM_CLIENT_BOT_TOKEN: z.string().optional(),
  TELEGRAM_DRIVER_BOT_TOKEN: z.string().optional(),
  TELEGRAM_MANAGER_BOT_TOKEN: z.string().optional(),
  TELEGRAM_BOT_WEBHOOK_SECRET: z.string().optional(),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(100),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
}).superRefine((data, ctx) => {
  // In production/staging (e.g. Vercel deployment), DATABASE_URL and DIRECT_URL are mandatory
  if (
    data.NODE_ENV === 'production' &&
    (process.env.VERCEL || process.env.STAGING || process.env.REQUIRE_DB_ENV === 'true')
  ) {
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
  }
});

export type Env = z.infer<typeof envSchema>;

let parsedEnv: Env;

try {
  parsedEnv = envSchema.parse(process.env);
} catch (error) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`Environment validation failed: ${JSON.stringify((error as z.ZodError).format())}`);
  }
  // In development/test, provide defaults
  parsedEnv = envSchema.parse({});
}

export const env = parsedEnv;
