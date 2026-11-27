import { NextRequest } from 'next/server';
import { handleTelegramRelayRequest } from '@/integrations/telegram/relay';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  return handleTelegramRelayRequest(request);
}
