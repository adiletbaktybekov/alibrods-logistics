/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ['argon2', 'pino', 'pino-pretty']
};

export default nextConfig;
