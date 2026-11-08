import crypto from 'crypto';
import type { NextRequest } from 'next/server';
import { sql } from 'drizzle-orm';
import { getDb, ensureSchemaUpdates } from '../../db/client.ts';

export function getCustomerAuthSecret(): string {
  const secret = process.env.CUSTOMER_AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw Object.assign(new Error('Customer authentication is not configured. Please configure CUSTOMER_AUTH_SECRET.'), { statusCode: 503 });
  }
  return secret;
}
const TOKEN_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Hashes a plain password with a secure salt using scrypt
 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, 64);
  return `${salt}:${derivedKey.toString('hex')}`;
}

/**
 * Verifies a plain password against a stored salt:hash string
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  if (!password || !storedHash) return false;
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, hash] = parts;
  try {
    const derivedKey = crypto.scryptSync(password, salt, 64);
    const keyBuffer = Buffer.from(derivedKey.toString('hex'), 'hex');
    const storedBuffer = Buffer.from(hash, 'hex');
    if (keyBuffer.length !== storedBuffer.length) return false;
    return crypto.timingSafeEqual(keyBuffer, storedBuffer);
  } catch {
    return false;
  }
}

/**
 * Creates a signed customer session token
 * Format: base64(customerId):timestamp:signature
 */
export function createCustomerToken(customerId: string): string {
  const secret = getCustomerAuthSecret();
  const timestamp = Date.now().toString();
  const payload = `${Buffer.from(customerId).toString('base64url')}:${timestamp}`;
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}:${signature}`;
}

/**
 * Verifies a customer session token and returns the customer ID if valid
 */
export function verifyCustomerToken(token: string): string | null {
  if (!token || typeof token !== 'string') return null;

  // Explicitly reject staff tokens to enforce strict boundary separation.
  if (token.startsWith('gh-internal-staff') || token.startsWith('internal-dev') || token.includes('staff')) {
    return null;
  }

  try {
    const secret = getCustomerAuthSecret();
    const parts = token.split(':');
    if (parts.length !== 3) return null;

    const [encodedId, timestampStr, signature] = parts;
    if (!encodedId || !/^\d+$/.test(timestampStr) || !signature) return null;

    const timestamp = Number(timestampStr);
    const now = Date.now();
    if (!Number.isSafeInteger(timestamp) || timestamp > now + 60_000 || now - timestamp > TOKEN_MAX_AGE_MS) {
      return null;
    }

    const payload = `${encodedId}:${timestampStr}`;
    const expected = crypto.createHmac('sha256', secret).update(payload).digest();
    const supplied = Buffer.from(signature, 'base64url');
    if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) return null;

    const customerId = Buffer.from(encodedId, 'base64url').toString('utf8');
    return customerId || null;
  } catch {
    return null;
  }
}

/**
 * Creates an opaque, random customer session. Only the SHA-256 hash is stored in PostgreSQL.
 * The raw token is returned solely to the route so it can be set in an HttpOnly cookie.
 */
export async function createCustomerSession(customerId: string): Promise<string> {
  const db = getDb();
  if (!db) throw Object.assign(new Error('Customer session storage is unavailable.'), { statusCode: 503 });
  await ensureSchemaUpdates(db);

  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const result: any = await db.execute(sql`
    INSERT INTO customer_auth_sessions (token_hash, customer_id, expires_at, revoked_at, created_at, last_seen_at)
    SELECT ${tokenHash}, id, now() + interval '30 days', NULL, now(), now()
    FROM customers
    WHERE id = ${customerId} AND status = 'ACTIVE'
    RETURNING token_hash
  `);
  if (!Array.isArray(result?.rows) || result.rows.length !== 1) {
    throw Object.assign(new Error('Could not establish a customer session.'), { statusCode: 503 });
  }
  return token;
}

/** Revoke a single opaque customer session at logout. */
export async function revokeCustomerSession(token: string | null): Promise<void> {
  if (!token) return;
  const db = getDb();
  if (!db) return;
  await ensureSchemaUpdates(db);
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  await db.execute(sql`
    UPDATE customer_auth_sessions
    SET revoked_at = COALESCE(revoked_at, now())
    WHERE token_hash = ${tokenHash} AND revoked_at IS NULL
  `);
}

export interface CustomerAuthResult {
  authorized: boolean;
  customerId?: string;
  statusCode?: 401 | 403 | 503;
  error?: string;
}

/**
 * Extracts and verifies customer credentials from an incoming Request or NextRequest.
 * Rejects staff headers or staff tokens.
 */
export async function verifyCustomerAuth(request: Request | NextRequest): Promise<CustomerAuthResult> {
  // Keep staff and customer credentials strictly separated.
  if (request.headers.get('x-staff-role')) {
    return {
      authorized: false,
      statusCode: 403,
      error: 'Staff credentials cannot access customer endpoints.',
    };
  }

  let token: string | null = null;
  const authHeader = request.headers.get('authorization');
  if (authHeader && /^Bearer\s+/i.test(authHeader)) {
    token = authHeader.replace(/^Bearer\s+/i, '').trim();
  }
  if (!token) token = request.headers.get('x-customer-token');

  if (!token) {
    if ('cookies' in request && typeof (request as any).cookies?.get === 'function') {
      token = (request as NextRequest).cookies.get('gh_customer_token')?.value || null;
    } else {
      const cookieHeader = request.headers.get('cookie') || '';
      const match = cookieHeader.match(/(?:^|;\s*)gh_customer_token=([^;]+)/);
      if (match) {
        try {
          token = decodeURIComponent(match[1]);
        } catch {
          token = null;
        }
      }
    }
  }

  if (!token || token.length > 512) {
    return {
      authorized: false,
      statusCode: 401,
      error: 'Customer authentication required. Please sign in to your Great Homes account.',
    };
  }

  try {
    const db = getDb();
    if (!db) {
      return { authorized: false, statusCode: 503, error: 'Customer authentication is temporarily unavailable.' };
    }
    await ensureSchemaUpdates(db);
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const result: any = await db.execute(sql`
      SELECT s.customer_id
      FROM customer_auth_sessions s
      INNER JOIN customers c ON c.id = s.customer_id
      WHERE s.token_hash = ${tokenHash}
        AND s.revoked_at IS NULL
        AND s.expires_at > now()
        AND c.status = 'ACTIVE'
      LIMIT 1
    `);
    const rows = Array.isArray(result?.rows) ? result.rows : [];
    if (rows.length !== 1 || !rows[0]?.customer_id) {
      return {
        authorized: false,
        statusCode: 401,
        error: 'Invalid or expired customer session. Please sign in again.',
      };
    }

    // Keep last-seen writes bounded; a read-only protected request need not update on every call.
    await db.execute(sql`
      UPDATE customer_auth_sessions
      SET last_seen_at = now()
      WHERE token_hash = ${tokenHash}
        AND (last_seen_at IS NULL OR last_seen_at < now() - interval '5 minutes')
    `);
    return { authorized: true, customerId: String(rows[0].customer_id) };
  } catch {
    return {
      authorized: false,
      statusCode: 503,
      error: 'Customer authentication is temporarily unavailable.',
    };
  }
}
