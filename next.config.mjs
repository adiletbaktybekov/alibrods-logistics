import { PHASE_DEVELOPMENT_SERVER } from 'next/constants.js';

/** @type {(phase: string, context?: { defaultConfig: import('next').NextConfig }) => import('next').NextConfig} */
export default (phase) => {
  const isDev = phase === PHASE_DEVELOPMENT_SERVER;
  const isStandalone = process.env.NEXT_OUTPUT_STANDALONE === 'true';
  const unoptimizedImages = process.env.NEXT_IMAGE_UNOPTIMIZED === 'true';
  const allowedActionOrigins = (process.env.NEXT_ALLOWED_ACTION_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return {
    distDir: isDev ? '.next-dev' : '.next',
    ...(isStandalone ? { output: 'standalone' } : {}),
    reactStrictMode: true,
    poweredByHeader: false,
    images: {
      formats: ['image/avif', 'image/webp'],
      ...(unoptimizedImages ? { unoptimized: true } : {}),
    },
    ...(allowedActionOrigins.length > 0
      ? {
          experimental: {
            serverActions: {
              allowedOrigins: allowedActionOrigins,
            },
          },
        }
      : {}),
    serverExternalPackages: ['argon2', 'pino', 'pino-pretty'],
  };
};
