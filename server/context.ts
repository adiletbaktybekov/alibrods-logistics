import { NextRequest } from 'next/server';
import { SecurityContext } from '@/types/rbac';
import { verifyAuthToken } from '@/lib/security/jwt';

export async function extractSecurityContext(request: Request | NextRequest): Promise<SecurityContext> {
  const requestId = request.headers.get('x-request-id') || crypto.randomUUID();
  const ipAddress =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    undefined;
  const userAgent = request.headers.get('user-agent') || undefined;

  let token: string | null = null;
  const authHeader = request.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  }

  // Fallback to cookie if present
  if (!token && 'cookies' in request) {
    const nextReq = request as NextRequest;
    token = nextReq.cookies.get('alibros_token')?.value || null;
  }

  if (!token) {
    return { user: null, ipAddress, userAgent, requestId };
  }

  const payload = await verifyAuthToken(token);
  if (!payload || !payload.sub || !payload.role) {
    return { user: null, ipAddress, userAgent, requestId };
  }

  return {
    user: {
      id: payload.sub,
      role: payload.role,
      email: payload.email,
      phone: payload.phone,
    },
    ipAddress,
    userAgent,
    requestId,
  };
}
