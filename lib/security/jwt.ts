import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { env } from '@/config/env';
import { UserRole } from '@prisma/client';

const secretKey = new TextEncoder().encode(env.JWT_SECRET);
const ISSUER = 'alibros-logistics';
const AUDIENCE = 'alibros-users';

export interface AuthTokenPayload extends JWTPayload {
  sub: string; // User UUID
  role: UserRole;
  email?: string | null;
  phone?: string | null;
  tokenVersion: number;
}

export async function signAuthToken(
  payload: {
    userId: string;
    role: UserRole;
    email?: string | null;
    phone?: string | null;
    tokenVersion: number;
  },
  expiresIn = env.JWT_EXPIRES_IN
): Promise<string> {
  return new SignJWT({
    role: payload.role,
    email: payload.email,
    phone: payload.phone,
    tokenVersion: payload.tokenVersion,
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(payload.userId)
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setExpirationTime(expiresIn)
    .sign(secretKey);
}

export async function verifyAuthToken(token: string): Promise<AuthTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey, {
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    return payload as AuthTokenPayload;
  } catch {
    return null;
  }
}
