import { createHmac, timingSafeEqual } from 'node:crypto';

import { ALLOWED_STAFF_ROLES } from './roles';
import type { StaffRole } from './roles';
export { ALLOWED_STAFF_ROLES } from './roles';
export type { StaffRole } from './roles';
export const STAFF_SESSION_COOKIE = 'gh_staff_session';
const SESSION_ISSUER = 'greathomes-admin';
const SESSION_TTL_SECONDS = 8 * 60 * 60;

export interface StaffUserRecord { id: string; email?: string; name?: string; role: StaffRole; enabled: boolean; sessionVersion?: number; }
export interface AuthResult { authorized: boolean; authenticated: boolean; role?: StaffRole; staff?: StaffUserRecord; statusCode?: number; status?: number; error?: string; }
interface SessionClaims { sub: string; ver: number; iat: number; exp: number; iss: string; }

function sessionSecret(): string | null {
  const value = process.env.GH_STAFF_SESSION_SECRET;
  return value && value.length >= 32 ? value : null;
}

export function createStaffSessionToken(staffId: string, sessionVersion = 0): string {
  const secret = sessionSecret();
  if (!secret) throw new Error('GH_STAFF_SESSION_SECRET must be configured with at least 32 characters.');
  const now = Math.floor(Date.now() / 1000);
  const claims: SessionClaims = { sub: staffId, ver: sessionVersion, iat: now, exp: now + SESSION_TTL_SECONDS, iss: SESSION_ISSUER };
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function decodeSession(token: string): SessionClaims | null {
  const secret = sessionSecret();
  if (!secret || !token || token.length > 4096) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, signature] = parts;
  const expected = createHmac('sha256', secret).update(payload).digest();
  let actual: Buffer;
  try { actual = Buffer.from(signature, 'base64url'); } catch { return null; }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as SessionClaims;
    const now = Math.floor(Date.now() / 1000);
    if (!claims || claims.iss !== SESSION_ISSUER || typeof claims.sub !== 'string' || !claims.sub || !Number.isInteger(claims.ver) || claims.ver < 0 || !Number.isInteger(claims.exp) || claims.exp <= now || !Number.isInteger(claims.iat) || claims.iat > now + 60) return null;
    return claims;
  } catch { return null; }
}

function readSessionToken(request: Request): string | null {
  const authHeader = request.headers.get('authorization');
  const bearer = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (bearer) return bearer;
  const cookieHeader = request.headers.get('cookie') || '';
  for (const cookie of cookieHeader.split(';')) {
    const separator = cookie.indexOf('=');
    if (separator >= 0 && cookie.slice(0, separator).trim() === STAFF_SESSION_COOKIE) return cookie.slice(separator + 1).trim();
  }
  return null;
}

/** Signed cookie authentication with live database role/account checks on every protected request. */
export async function verifyInternalStaff(request: Request): Promise<AuthResult> {
  // Synthetic staff authentication is ONLY permitted for local/CI test runners when
  // the test runner secret is established and matched via x-staff-test-token.
  // External HTTP requests without the pre-shared secret are strictly rejected.
  if (process.env.NODE_ENV !== 'production') {
    const { getActiveTestRunnerSecret } = await import('@/src/lib/testIsolationContext');
    const activeSecret = getActiveTestRunnerSecret();
    if (activeSecret && activeSecret.length >= 32) {
      const suppliedToken = request.headers.get('x-staff-test-token')?.trim();
      if (suppliedToken && suppliedToken === activeSecret) {
      const testRole = request.headers.get('x-staff-role')?.trim().toUpperCase();
      const testDisabled = request.headers.get('x-staff-disabled') === 'true';
      if (testRole) {
        if (testDisabled) {
          return { authorized: false, authenticated: false, statusCode: 401, status: 401, error: 'Staff account is disabled or this session has been invalidated.' };
        }
        if (!ALLOWED_STAFF_ROLES.includes(testRole as StaffRole)) {
          return { authorized: false, authenticated: false, statusCode: 403, status: 403, error: 'Staff account has an invalid role.' };
        }
        const staffId = request.headers.get('x-staff-user')?.trim() || 'super-admin-user';
        const email = request.headers.get('x-staff-email')?.trim() || 'superadmin@greathomes.in';
        return {
          authorized: true,
          authenticated: true,
          role: testRole as StaffRole,
          staff: {
            id: staffId,
            email,
            name: staffId,
            role: testRole as StaffRole,
            enabled: true,
            sessionVersion: 0,
          },
        };
      }
    }
  }
  }
  const token = readSessionToken(request);
  if (!token) return { authorized: false, authenticated: false, statusCode: 401, status: 401, error: 'Authentication required.' };
  const claims = decodeSession(token);
  if (!claims) return { authorized: false, authenticated: false, statusCode: 401, status: 401, error: 'Your staff session is invalid or has expired. Please sign in again.' };
  try {
    const { staffRepository } = await import('./repositories/staffRepository');
    const staff = await staffRepository.findById(claims.sub);
    if (!staff || !staff.enabled || (staff.sessionVersion ?? 0) !== claims.ver) return { authorized: false, authenticated: false, statusCode: 401, status: 401, error: 'Staff account is disabled or this session has been invalidated.' };
    if (!ALLOWED_STAFF_ROLES.includes(staff.role)) return { authorized: false, authenticated: false, statusCode: 403, status: 403, error: 'Staff account has an invalid role.' };
    return { authorized: true, authenticated: true, role: staff.role, staff: { id: staff.id, email: staff.email, name: staff.name, role: staff.role, enabled: staff.enabled, sessionVersion: staff.sessionVersion ?? 0 } };
  } catch {
    return { authorized: false, authenticated: false, statusCode: 503, status: 503, error: 'Staff authentication is temporarily unavailable.' };
  }
}

export function isStaffRole(value: unknown): value is StaffRole {
  return typeof value === 'string' && ALLOWED_STAFF_ROLES.includes(value as StaffRole);
}