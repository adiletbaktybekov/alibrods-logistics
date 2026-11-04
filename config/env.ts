import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DATABASE_URL: z.string().url().optional(),
  JWT_SECRET: z.string().min(16).default('insecure-dev-secret-key-change-in-production-min-16'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  TELEGRAM_CLIENT_BOT_TOKEN: z.string().optional(),
  TELEGRAM_DRIVER_BOT_TOKEN: z.string().optional(),
  TELEGRAM_MANAGER_BOT_TOKEN: z.string().optional(),
  TELEGRAM_BOT_WEBHOOK_SECRET: z.string().optional(),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(100),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
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
