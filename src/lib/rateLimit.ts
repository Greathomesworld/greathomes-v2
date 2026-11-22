import crypto from 'node:crypto';
import { sql } from 'drizzle-orm';
import { getDb } from '@/src/db/client';
import {
  isPreviewOrProductionEnvironment,
  isStrictTestEnvironment,
} from '@/src/lib/persistenceGuard';

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetMs: number;
}

export class RateLimitUnavailableError extends Error {
  public readonly statusCode: number = 503;
  public readonly code: string = 'RATE_LIMIT_UNAVAILABLE';

  constructor(
    message: string = 'Rate limiting service is temporarily unavailable. Please try again later.'
  ) {
    super(message);
    this.name = 'RateLimitUnavailableError';
  }
}

export function isRateLimitUnavailableError(
  err: unknown
): err is RateLimitUnavailableError {
  if (err instanceof RateLimitUnavailableError) {
    return true;
  }
  if (
    err &&
    typeof err === 'object' &&
    'code' in err &&
    (err as { code?: unknown }).code === 'RATE_LIMIT_UNAVAILABLE'
  ) {
    return true;
  }
  return false;
}

interface RateLimitStoreEntry {
  count: number;
  resetTime: number;
}

export interface RateLimitBucketExecutor {
  consumeBucket(
    bucketId: string,
    limit: number,
    windowMs: number
  ): Promise<{ requestCount: number; expiresAtMs: number }>;
  cleanupExpired?(): Promise<void>;
}

const rateLimitStore = new Map<string, RateLimitStoreEntry>();
let testMemoryRateLimitEnabled = false;
let testBucketExecutor: RateLimitBucketExecutor | null = null;
let testDbResolver: (() => ReturnType<typeof getDb> | null) | null = null;

/**
 * Hashes raw rate limit keys (which often include IP addresses) with SHA-256
 * so raw PII / IP values are never stored in PostgreSQL or emitted in logs.
 */
export function hashRateLimitKey(rawKey: string): string {
  return `rl_${crypto.createHash('sha256').update(rawKey).digest('hex')}`;
}

export function enableTestMemoryRateLimit(enabled: boolean = true): void {
  if (!isStrictTestEnvironment()) {
    testMemoryRateLimitEnabled = false;
    return;
  }
  testMemoryRateLimitEnabled = enabled;
}

export function setRateLimitBucketExecutorForTesting(
  executor: RateLimitBucketExecutor | null
): void {
  testBucketExecutor = executor;
}

export function setRateLimitDbResolverForTesting(
  resolver: (() => ReturnType<typeof getDb> | null) | null
): void {
  testDbResolver = resolver;
}

export function resetRateLimitStoreForTesting(): void {
  rateLimitStore.clear();
  testMemoryRateLimitEnabled = false;
  testBucketExecutor = null;
  testDbResolver = null;
}

async function consumePostgresBucket(
  db: NonNullable<ReturnType<typeof getDb>>,
  bucketId: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult> {
  try {
    const result = await db.execute(sql`
      INSERT INTO rate_limit_buckets (id, window_start, request_count, expires_at, updated_at)
      VALUES (${bucketId}, now(), 1, now() + (${windowMs} * interval '1 millisecond'), now())
      ON CONFLICT (id) DO UPDATE SET
        request_count = CASE
          WHEN rate_limit_buckets.expires_at <= now() THEN 1
          ELSE LEAST(rate_limit_buckets.request_count + 1, ${limit + 1})
        END,
        window_start = CASE
          WHEN rate_limit_buckets.expires_at <= now() THEN now()
          ELSE rate_limit_buckets.window_start
        END,
        expires_at = CASE
          WHEN rate_limit_buckets.expires_at <= now() THEN now() + (${windowMs} * interval '1 millisecond')
          ELSE rate_limit_buckets.expires_at
        END,
        updated_at = now()
      RETURNING request_count, expires_at
    `);

    const row = Array.isArray((result as any)?.rows) ? (result as any).rows[0] : null;
    if (!row) {
      throw new RateLimitUnavailableError();
    }

    // Probabilistic cleanup of expired buckets (~2% of calls)
    if (Math.random() < 0.02) {
      db.execute(sql`DELETE FROM rate_limit_buckets WHERE expires_at <= now()`).catch(() => {});
    }

    const requestCount = Number(row.request_count ?? row.requestCount ?? 1);
    const expiresAtMs = new Date(row.expires_at ?? row.expiresAt ?? Date.now() + windowMs).getTime();
    const resetMs = Math.max(0, expiresAtMs - Date.now());

    if (requestCount > limit) {
      return {
        allowed: false,
        limit,
        remaining: 0,
        resetMs,
      };
    }

    return {
      allowed: true,
      limit,
      remaining: Math.max(0, limit - requestCount),
      resetMs,
    };
  } catch (err) {
    if (isRateLimitUnavailableError(err)) {
      throw err;
    }
    throw new RateLimitUnavailableError(
      'Distributed rate limiter backend is unavailable. Please try again later.'
    );
  }
}

function consumeMemoryBucket(
  bucketId: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  const entry = rateLimitStore.get(bucketId);

  if (!entry || now >= entry.resetTime) {
    const newEntry: RateLimitStoreEntry = {
      count: 1,
      resetTime: now + windowMs,
    };
    rateLimitStore.set(bucketId, newEntry);
    return {
      allowed: true,
      limit,
      remaining: Math.max(0, limit - 1),
      resetMs: windowMs,
    };
  }

  if (entry.count >= limit) {
    return {
      allowed: false,
      limit,
      remaining: 0,
      resetMs: Math.max(0, entry.resetTime - now),
    };
  }

  entry.count += 1;
  return {
    allowed: true,
    limit,
    remaining: Math.max(0, limit - entry.count),
    resetMs: Math.max(0, entry.resetTime - now),
  };
}

/**
 * Checks distributed rate limit for a given key (e.g. IP address + route action).
 * Fails closed (503 RateLimitUnavailableError) in Preview/Production or when
 * PERSISTENCE_PROVIDER=postgres if PostgreSQL rate limiting is unavailable.
 */
export async function checkRateLimit(
  key: string,
  limit: number = 60,
  windowMs: number = 60000
): Promise<RateLimitResult> {
  const bucketId = hashRateLimitKey(key);
  const provider = (process.env.PERSISTENCE_PROVIDER || '').trim().toLowerCase();

  // 1. Custom test bucket executor (simulates distributed atomic PostgreSQL upsert)
  if (testBucketExecutor && provider !== 'memory') {
    try {
      const { requestCount, expiresAtMs } = await testBucketExecutor.consumeBucket(
        bucketId,
        limit,
        windowMs
      );
      const resetMs = Math.max(0, expiresAtMs - Date.now());
      if (requestCount > limit) {
        return {
          allowed: false,
          limit,
          remaining: 0,
          resetMs,
        };
      }
      return {
        allowed: true,
        limit,
        remaining: Math.max(0, limit - requestCount),
        resetMs,
      };
    } catch {
      // Fail closed — never fall back silently to process-local Map when shared backend fails
      throw new RateLimitUnavailableError(
        'Distributed rate limiter backend is unavailable. Please try again later.'
      );
    }
  }

  // 2. Active PostgreSQL backend
  let db: ReturnType<typeof getDb> | null = null;
  try {
    db = testDbResolver ? testDbResolver() : getDb();
  } catch {
    throw new RateLimitUnavailableError(
      'Distributed rate limiter backend is unavailable. Please try again later.'
    );
  }

  if (db && provider !== 'memory') {
    return await consumePostgresBucket(db, bucketId, limit, windowMs);
  }

  // 3. Enforce fail-closed policy in Preview / Production / explicit postgres mode
  if (isPreviewOrProductionEnvironment() || provider === 'postgres') {
    throw new RateLimitUnavailableError(
      'Rate limiting requires an active distributed PostgreSQL backend in this environment.'
    );
  }

  // 4. Isolated unit tests may explicitly opt in to in-memory rate limiting when NODE_ENV=test
  if (isStrictTestEnvironment()) {
    if (testMemoryRateLimitEnabled && provider !== 'postgres') {
      return consumeMemoryBucket(bucketId, limit, windowMs);
    }
    throw new RateLimitUnavailableError(
      'Rate limiting requires PostgreSQL or explicit test opt-in.'
    );
  }

  // 5. Local development requires explicit ALLOW_DEV_MEMORY_RATE_LIMIT=true opt-in when PostgreSQL is absent
  const allowDevMemory =
    process.env.ALLOW_DEV_MEMORY_RATE_LIMIT === 'true' &&
    !isPreviewOrProductionEnvironment() &&
    provider !== 'postgres';
  if (allowDevMemory) {
    return consumeMemoryBucket(bucketId, limit, windowMs);
  }

  throw new RateLimitUnavailableError(
    'Rate limiting requires an active PostgreSQL backend (or explicit ALLOW_DEV_MEMORY_RATE_LIMIT=true opt-in in local development).'
  );
}

/**
 * Helper to build an HTTP 429 Too Many Requests response
 */
export function createRateLimitResponse(requestId: string, result: RateLimitResult): Response {
  const retryAfterSeconds = Math.max(1, Math.ceil(result.resetMs / 1000));
  const response = Response.json(
    {
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many requests. Please slow down and try again later.',
        requestId,
      },
    },
    { status: 429 }
  );

  response.headers.set('x-request-id', requestId);
  response.headers.set('Retry-After', String(retryAfterSeconds));
  response.headers.set('X-RateLimit-Limit', String(result.limit));
  response.headers.set('X-RateLimit-Remaining', String(result.remaining));
  response.headers.set('X-RateLimit-Reset', String(Math.ceil((Date.now() + result.resetMs) / 1000)));

  return response;
}

/**
 * Helper to build an HTTP 503 Service Unavailable response when rate limiting fails closed
 */
export function createRateLimitUnavailableResponse(requestId: string): Response {
  const response = Response.json(
    {
      success: false,
      code: 'RATE_LIMIT_UNAVAILABLE',
      message: 'Service temporarily unavailable. Please try again later.',
      error: {
        code: 'RATE_LIMIT_UNAVAILABLE',
        message: 'Service temporarily unavailable. Please try again later.',
        requestId,
      },
    },
    { status: 503 }
  );
  response.headers.set('x-request-id', requestId);
  return response;
}

/**
 * Cleanup expired rate limit entries periodically
 */
export async function cleanupRateLimitStore(): Promise<void> {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now >= entry.resetTime) {
      rateLimitStore.delete(key);
    }
  }

  if (testBucketExecutor?.cleanupExpired) {
    await testBucketExecutor.cleanupExpired().catch(() => {});
  }

  try {
    const db = testDbResolver ? testDbResolver() : getDb();
    if (db) {
      await db.execute(sql`DELETE FROM rate_limit_buckets WHERE expires_at <= now()`);
    }
  } catch {
    // Non-blocking cleanup
  }
}
