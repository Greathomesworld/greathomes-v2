import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/src/db/client';
import { staffRepository } from '@/src/domain/auth/repositories/staffRepository';
import { createStaffSessionToken, STAFF_SESSION_COOKIE, verifyInternalStaff, StaffUserRecord } from '@/src/domain/auth/authorizationBoundary';
import { hashStaffPassword, verifyStaffPassword } from '@/src/domain/auth/password';
import type { StaffUserEntity } from '@/src/domain/auth/entities/staffUserEntity';
import { buildStaffContext } from '@/src/lib/adminAuth';
import { isProductionDeployment } from '@/src/lib/config';
import {
  checkRateLimit,
  createRateLimitResponse,
  createRateLimitUnavailableResponse,
  isRateLimitUnavailableError,
} from '@/src/lib/rateLimit';
import { extractRequestContext, withCorrelationHeaders } from '@/src/lib/requestContext';
import { auditService } from '@/src/domain/audit/auditService';

export const dynamic = 'force-dynamic';
const NO_STORE = { 'Cache-Control': 'no-store, max-age=0' };

function hashRateLimitIdentifier(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex').slice(0, 32);
}

function validBootstrapToken(supplied: unknown): boolean {
  const configured = process.env.GH_SUPER_ADMIN_BOOTSTRAP_TOKEN;
  if (typeof supplied !== 'string' || !configured || configured.length < 32) return false;
  const expected = Buffer.from(configured, 'utf8');
  const actual = Buffer.from(supplied, 'utf8');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function signedInResponse(staff: StaffUserRecord, requestId?: string) {
  const token = createStaffSessionToken(staff.id, staff.sessionVersion ?? 0);
  const context = { ...buildStaffContext(staff.role), displayName: staff.name || buildStaffContext(staff.role).displayName };
  const response = NextResponse.json({ success: true, authenticated: true, role: staff.role, context }, { headers: NO_STORE });
  response.cookies.set(STAFF_SESSION_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 8 * 60 * 60, sameSite: 'lax' });
  for (const oldCookie of ['gh_staff_role', 'gh_staff_token']) response.cookies.set(oldCookie, '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 0, expires: new Date(0), sameSite: 'lax' });
  return requestId ? withCorrelationHeaders(response, requestId) : response;
}

export async function GET(req: NextRequest) {
  const auth = await verifyInternalStaff(req);
  if (!auth.authorized || !auth.role || !auth.staff) {
    return NextResponse.json({ authenticated: false, error: auth.error || 'Unauthorized' }, { status: auth.statusCode || 401, headers: NO_STORE });
  }
  const context = { ...buildStaffContext(auth.role), displayName: auth.staff.name || buildStaffContext(auth.role).displayName };
  return NextResponse.json({ authenticated: true, context }, { headers: NO_STORE });
}

export async function POST(req: NextRequest) {
  const { requestId, ipAddress } = extractRequestContext(req);
  const ipBucket = ipAddress || 'anonymous';

  try {
    const sessionSecret = process.env.GH_STAFF_SESSION_SECRET;
    if (!sessionSecret || sessionSecret.length < 32) {
      return withCorrelationHeaders(
        NextResponse.json({ error: 'Staff authentication is not configured.' }, { status: 503, headers: NO_STORE }),
        requestId
      );
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      return withCorrelationHeaders(
        NextResponse.json({ error: 'Invalid JSON request payload.' }, { status: 400, headers: NO_STORE }),
        requestId
      );
    }

    const mode = typeof body?.mode === 'string' ? body.mode.trim().toLowerCase() : 'login';

    // Distributed fail-closed rate limiting for staff auth / recovery endpoints
    try {
      if (mode === 'reset' || mode === 'bootstrap') {
        const recoveryLimit = await checkRateLimit(
          `staff_auth_recovery_ip_${ipBucket}`,
          ipAddress ? 5 : 3,
          15 * 60 * 1000
        );
        if (!recoveryLimit.allowed) {
          return createRateLimitResponse(requestId, recoveryLimit);
        }
      } else {
        const ipLimit = await checkRateLimit(
          `staff_auth_login_ip_${ipBucket}`,
          ipAddress ? 20 : 12,
          15 * 60 * 1000
        );
        if (!ipLimit.allowed) {
          return createRateLimitResponse(requestId, ipLimit);
        }
      }
    } catch (err) {
      if (isRateLimitUnavailableError(err)) {
        return createRateLimitUnavailableResponse(requestId);
      }
      throw err;
    }

    if (mode === 'reset') {
      // Preview-only recovery for the designated first Super Admin. Strictly blocked on Production across all platforms.
      if (isProductionDeployment()) {
        return withCorrelationHeaders(
          NextResponse.json({ error: 'Super Admin password recovery is blocked on Production.' }, { status: 403, headers: NO_STORE }),
          requestId
        );
      }
      const bootstrapEnabled = process.env.GH_STAFF_BOOTSTRAP_ENABLED?.trim().toLowerCase() === 'true';
      if (!bootstrapEnabled) {
        return withCorrelationHeaders(
          NextResponse.json({ error: 'Password recovery is disabled: enable GH_STAFF_BOOTSTRAP_ENABLED for this Preview environment.' }, { status: 403, headers: NO_STORE }),
          requestId
        );
      }
      if (!validBootstrapToken(body.bootstrapToken)) {
        return withCorrelationHeaders(
          NextResponse.json({ error: 'Invalid or unconfigured bootstrap token.' }, { status: 401, headers: NO_STORE }),
          requestId
        );
      }
      const db = getDb();
      if (!db) {
        return withCorrelationHeaders(
          NextResponse.json({ error: 'Staff database is unavailable.' }, { status: 503, headers: NO_STORE }),
          requestId
        );
      }
      const requiredEmail = (process.env.GH_SUPER_ADMIN_EMAIL || 'superadmin@greathomes.co.in').trim().toLowerCase();
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      if (email !== requiredEmail) {
        return withCorrelationHeaders(
          NextResponse.json({ error: 'Password recovery is limited to the configured first Super Admin email.' }, { status: 400, headers: NO_STORE }),
          requestId
        );
      }
      if (typeof body.password !== 'string' || body.password.length < 12 || body.password.length > 256) {
        return withCorrelationHeaders(
          NextResponse.json({ error: 'New password must contain between 12 and 256 characters.' }, { status: 400, headers: NO_STORE }),
          requestId
        );
      }
      const existing = await staffRepository.findByEmail(requiredEmail);
      if (!existing || !existing.passwordHash) {
        return withCorrelationHeaders(
          NextResponse.json({ error: 'The Super Admin account is not initialized yet. Use First-time Super Admin setup instead.' }, { status: 404, headers: NO_STORE }),
          requestId
        );
      }
      if (existing.role !== 'SUPER_ADMIN') {
        return withCorrelationHeaders(
          NextResponse.json({ error: 'The configured account is not assigned the SUPER_ADMIN role. Contact the application owner.' }, { status: 409, headers: NO_STORE }),
          requestId
        );
      }
      if (!existing.enabled) {
        return withCorrelationHeaders(
          NextResponse.json({ error: 'The Super Admin account is disabled. Password recovery will not reactivate a disabled account.' }, { status: 403, headers: NO_STORE }),
          requestId
        );
      }
      const passwordHash = await hashStaffPassword(body.password);
      await staffRepository.update(existing.id, { passwordHash, sessionVersion: (existing.sessionVersion ?? 0) + 1 });
      await auditService.record(req, { id: existing.id, role: existing.role }, {
        action: 'STAFF_SUPER_ADMIN_PASSWORD_RESET',
        resourceType: 'STAFF_USER',
        resourceId: existing.id,
        success: true,
        metadata: { mode: 'reset' },
      });
      const response = NextResponse.json({ success: true, passwordReset: true, authenticated: false }, { headers: NO_STORE });
      for (const name of [STAFF_SESSION_COOKIE, 'gh_staff_role', 'gh_staff_token']) response.cookies.set(name, '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 0, expires: new Date(0), sameSite: 'lax' });
      return withCorrelationHeaders(response, requestId);
    }

    if (mode === 'bootstrap') {
      // Strictly blocked on Production across Vercel, Cloud Run, Docker, and generic NODE_ENV=production.
      if (isProductionDeployment()) {
        return withCorrelationHeaders(
          NextResponse.json(
            { error: 'Initial Super Admin setup is blocked on Production.' },
            { status: 403, headers: NO_STORE }
          ),
          requestId
        );
      }
      const bootstrapEnabled = process.env.GH_STAFF_BOOTSTRAP_ENABLED?.trim().toLowerCase() === 'true';
      if (!bootstrapEnabled) {
        return withCorrelationHeaders(
          NextResponse.json(
            { error: 'Bootstrap is disabled: GH_STAFF_BOOTSTRAP_ENABLED is missing or is not set to true for this Preview environment.' },
            { status: 403, headers: NO_STORE }
          ),
          requestId
        );
      }
      if (!validBootstrapToken(body.bootstrapToken)) {
        return withCorrelationHeaders(
          NextResponse.json({ error: 'Invalid or unconfigured bootstrap token.' }, { status: 401, headers: NO_STORE }),
          requestId
        );
      }
      const db = getDb();
      if (!db) {
        return withCorrelationHeaders(
          NextResponse.json({ error: 'Staff database is unavailable.' }, { status: 503, headers: NO_STORE }),
          requestId
        );
      }
      const requiredEmail = (process.env.GH_SUPER_ADMIN_EMAIL || 'superadmin@greathomes.co.in').trim().toLowerCase();
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      if (email !== requiredEmail) {
        return withCorrelationHeaders(
          NextResponse.json({ error: 'Bootstrap email does not match the configured Super Admin email.' }, { status: 400, headers: NO_STORE }),
          requestId
        );
      }
      if (typeof body.password !== 'string' || body.password.length < 12 || body.password.length > 256) {
        return withCorrelationHeaders(
          NextResponse.json({ error: 'Password must contain between 12 and 256 characters.' }, { status: 400, headers: NO_STORE }),
          requestId
        );
      }
      const passwordHash = await hashStaffPassword(body.password);
      const existing = await staffRepository.findByEmail(requiredEmail);
      let staff: StaffUserEntity;
      if (existing) {
        if (existing.passwordHash) {
          return withCorrelationHeaders(
            NextResponse.json({ error: 'This Super Admin account has already been initialized.' }, { status: 409, headers: NO_STORE }),
            requestId
          );
        }
        staff = await staffRepository.update(existing.id, { name: process.env.GH_SUPER_ADMIN_NAME || 'Great Homes Super Admin', role: 'SUPER_ADMIN', enabled: true, passwordHash, sessionVersion: (existing.sessionVersion ?? 0) + 1 });
      } else {
        staff = await staffRepository.create({ id: randomUUID(), email: requiredEmail, name: process.env.GH_SUPER_ADMIN_NAME || 'Great Homes Super Admin', role: 'SUPER_ADMIN', enabled: true, passwordHash, sessionVersion: 0, avatarUrl: null });
      }
      await auditService.record(req, { id: staff.id, role: staff.role }, {
        action: 'STAFF_SUPER_ADMIN_BOOTSTRAP',
        resourceType: 'STAFF_USER',
        resourceId: staff.id,
        success: true,
        metadata: { mode: 'bootstrap' },
      });
      // Do not issue an authenticated session during bootstrap. The new Super Admin must
      // complete a separate email/password sign-in after account creation.
      const response = NextResponse.json({ success: true, accountCreated: true, authenticated: false }, { headers: NO_STORE });
      for (const name of [STAFF_SESSION_COOKIE, 'gh_staff_role', 'gh_staff_token']) response.cookies.set(name, '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 0, expires: new Date(0), sameSite: 'lax' });
      return withCorrelationHeaders(response, requestId);
    }

    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body?.password === 'string' ? body.password : '';
    if (!email || !password || email.length > 254 || password.length > 256) {
      return withCorrelationHeaders(
        NextResponse.json({ error: 'Email and password are required.' }, { status: 400, headers: NO_STORE }),
        requestId
      );
    }

    // Per-account distributed rate limit (temporary window, no permanent lockout)
    try {
      const emailLimit = await checkRateLimit(
        `staff_auth_login_email_${hashRateLimitIdentifier(email)}`,
        8,
        15 * 60 * 1000
      );
      if (!emailLimit.allowed) {
        return createRateLimitResponse(requestId, emailLimit);
      }
    } catch (err) {
      if (isRateLimitUnavailableError(err)) {
        return createRateLimitUnavailableResponse(requestId);
      }
      throw err;
    }

    const db = getDb();
    if (!db && process.env.NODE_ENV !== 'test') {
      return withCorrelationHeaders(
        NextResponse.json({ error: 'Staff database is unavailable.' }, { status: 503, headers: NO_STORE }),
        requestId
      );
    }

    const staff = await staffRepository.findByEmail(email);
    const validPassword = await verifyStaffPassword(password, staff?.passwordHash);
    if (!staff || !staff.enabled || !validPassword) {
      await auditService.record(req, staff ? { id: staff.id, role: staff.role } : null, {
        action: 'STAFF_LOGIN_FAILED',
        resourceType: 'STAFF_SESSION',
        resourceId: staff?.id || null,
        success: false,
        metadata: { emailHash: hashRateLimitIdentifier(email) },
      });
      return withCorrelationHeaders(
        NextResponse.json({ error: 'Invalid email or password.' }, { status: 401, headers: NO_STORE }),
        requestId
      );
    }
    await auditService.record(req, { id: staff.id, role: staff.role }, {
      action: 'STAFF_LOGIN_SUCCESS',
      resourceType: 'STAFF_SESSION',
      resourceId: staff.id,
      success: true,
    });
    return signedInResponse(
      { id: staff.id, email: staff.email, name: staff.name, role: staff.role, enabled: staff.enabled, sessionVersion: staff.sessionVersion ?? 0 },
      requestId
    );
  } catch (err) {
    if (isRateLimitUnavailableError(err)) {
      return createRateLimitUnavailableResponse(requestId);
    }
    return withCorrelationHeaders(
      NextResponse.json({ error: 'Staff authentication is not configured or temporarily unavailable.' }, { status: 503, headers: NO_STORE }),
      requestId
    );
  }
}

export async function DELETE(req: NextRequest) {
  let revocationFailed = false;
  try {
    const auth = await verifyInternalStaff(req);
    if (auth.statusCode === 503) revocationFailed = true;
    if (auth.authorized && auth.staff) {
      const staff = await staffRepository.findById(auth.staff.id);
      if (staff) {
        await staffRepository.update(staff.id, { sessionVersion: (staff.sessionVersion ?? 0) + 1 });
        await auditService.record(req, { id: staff.id, role: staff.role }, {
          action: 'STAFF_LOGOUT',
          resourceType: 'STAFF_SESSION',
          resourceId: staff.id,
          success: true,
        });
      }
    }
  } catch {
    revocationFailed = true;
  }
  const response = NextResponse.json({ success: !revocationFailed, authenticated: false, ...(revocationFailed ? { error: 'Local logout completed, but server-side session revocation could not be confirmed.' } : {}) }, { status: revocationFailed ? 503 : 200, headers: NO_STORE });
  for (const name of [STAFF_SESSION_COOKIE, 'gh_staff_role', 'gh_staff_token']) response.cookies.set(name, '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 0, expires: new Date(0), sameSite: 'lax' });
  return response;
}