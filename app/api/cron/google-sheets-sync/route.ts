import { NextRequest, NextResponse } from 'next/server';
import { GoogleSheetsSyncService } from '@/modules/integrations/google-sheets-sync.service';
import { logger } from '@/lib/logger';
import { UserRole } from '@prisma/client';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Automated Cron Route for Google Sheets Bidirectional Accounting Sync.
 * Can be triggered on a schedule (e.g. every 15-30 minutes) via Vercel Cron,
 * external scheduler, or GitHub Actions.
 *
 * Security:
 * Requires authorization header: `Authorization: Bearer <CRON_SECRET>`
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');

  if (cronSecret) {
    if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
      logger.warn({ ip: request.headers.get('x-forwarded-for') }, 'Unauthorized cron sync request');
      return NextResponse.json({ error: 'Unauthorized: invalid cron secret' }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === 'production') {
    logger.error('CRON_SECRET is not configured in production environment');
    return NextResponse.json(
      { error: 'CRON_SECRET environment variable is required in production' },
      { status: 500 }
    );
  }

  try {
    const syncUser = {
      id: 'cron-scheduler',
      role: UserRole.ACCOUNTANT,
      email: 'cron-sync@alibros.internal',
    };

    const result = await GoogleSheetsSyncService.runFullSync(syncUser);

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      ...result,
    });
  } catch (error) {
    logger.error({ err: error }, 'Unhandled error in cron Google Sheets sync');
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error during sync',
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
