import { PHASE_DEVELOPMENT_SERVER } from 'next/constants.js';

/** @type {(phase: string, context?: { defaultConfig: import('next').NextConfig }) => import('next').NextConfig} */
export default (phase) => {
  const isDev = phase === PHASE_DEVELOPMENT_SERVER;

  return {
    distDir: isDev ? '.next-dev' : '.next',
    reactStrictMode: true,
    poweredByHeader: false,
    serverExternalPackages: ['argon2', 'pino', 'pino-pretty'],
  };
};
