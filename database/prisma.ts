import { PrismaClient } from '@prisma/client';
import { logger } from '@/lib/logger';
import { env } from '@/config/env';

declare global {
  // eslint-disable-next-line no-var
  var __globalPrismaClient: PrismaClient | undefined;
}

function createPrismaClient(): PrismaClient {
  const client = new PrismaClient({
    log:
      env.NODE_ENV === 'development'
        ? [
            { emit: 'event', level: 'query' },
            { emit: 'stdout', level: 'error' },
            { emit: 'stdout', level: 'warn' },
          ]
        : [{ emit: 'stdout', level: 'error' }],
  });

  if (env.NODE_ENV === 'development') {
    (client as unknown as { $on: (event: string, cb: (e: { query: string; duration: number }) => void) => void }).$on(
      'query',
      (e) => {
        logger.debug({ query: e.query, durationMs: e.duration }, 'Database query executed');
      }
    );
  }

  return client;
}

export const prisma = globalThis.__globalPrismaClient ?? createPrismaClient();

if (env.NODE_ENV !== 'production') {
  globalThis.__globalPrismaClient = prisma;
}
