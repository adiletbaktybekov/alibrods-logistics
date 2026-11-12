import { NextResponse } from 'next/server';
import { prisma } from '@/database/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  const startTime = Date.now();
  let dbStatus = 'not_configured';

  if (process.env.DATABASE_URL) {
    try {
      // Light ping to check DB connectivity if configured
      await prisma.$queryRaw`SELECT 1`;
      dbStatus = 'connected';
    } catch {
      dbStatus = 'unavailable';
    }
  }

  const responseTimeMs = Date.now() - startTime;

  return NextResponse.json(
    {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      gitCommit: process.env.VERCEL_GIT_COMMIT_SHA || 'local',
      environment: process.env.NODE_ENV || 'development',
      services: {
        api: 'online',
        database: dbStatus,
      },
      performance: {
        responseTimeMs,
        memoryUsageMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      },
    },
    { status: 200 }
  );
}
