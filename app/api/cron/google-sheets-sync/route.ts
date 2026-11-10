import { NextRequest, NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/security/cron-auth';
import { GoogleSheetsSyncService } from '@/modules/integrations/google-sheets-sync.service';
import { logger, safeLogError } from '@/lib/logger';
import { UserRole } from '@prisma/client';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Automated Cron Route for Google Sheets Bidirectional Accounting Sync.
 * Can be triggered on a schedule (e.g. every 15 minutes) via external scheduler (cron-job.org).
 *
 * Security:
 * Requires authorization header: `Authorization: Bearer <CRON_SECRET>`
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const isProdOrStaging =
    process.env.NODE_ENV === 'production' ||
    process.env.VERCEL === '1' ||
    !!process.env.VERCEL ||
    process.env.STAGING === 'true' ||
    process.env.VERCEL_ENV === 'preview' ||
    process.env.VERCEL_ENV === 'production';

  if (!cronSecret) {
    if (isProdOrStaging) {
      logger.error('CRON_SECRET is not configured in production or staging environment');
      return NextResponse.json(
        { error: 'CRON_SECRET environment variable is required in production and staging environments' },
        { status: 500 }
      );
    }
    logger.warn('CRON_SECRET is not configured; rejecting request');
    return NextResponse.json(
      { error: 'CRON_SECRET environment variable is not configured' },
      { status: 500 }
    );
  }

  const authHeader = request.headers.get('authorization');

  if (!isCronAuthorized(authHeader, cronSecret)) {
    logger.warn(
      { ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') },
      'Unauthorized cron sync request: invalid or missing Bearer token'
    );
    return NextResponse.json({ error: 'Unauthorized: invalid or missing cron secret' }, { status: 401 });
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
    safeLogError(error, 'Unhandled error in cron Google Sheets sync');
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
