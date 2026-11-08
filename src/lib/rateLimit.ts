export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetMs: number;
}

interface RateLimitStoreEntry {
  count: number;
  resetTime: number;
}

// In-memory sliding window store for single instance deployments / dev / test
const rateLimitStore = new Map<string, RateLimitStoreEntry>();

/**
 * Checks rate limit for a given key (e.g. IP address + route action)
 */
export function checkRateLimit(
  key: string,
  limit: number = 60,
  windowMs: number = 60000
): RateLimitResult {
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || now > entry.resetTime) {
    const newEntry: RateLimitStoreEntry = {
      count: 1,
      resetTime: now + windowMs,
    };
    rateLimitStore.set(key, newEntry);
    return {
      allowed: true,
      limit,
      remaining: limit - 1,
      resetMs: windowMs,
    };
  }

  if (entry.count >= limit) {
    return {
      allowed: false,
      limit,
      remaining: 0,
      resetMs: entry.resetTime - now,
    };
  }

  entry.count += 1;
  return {
    allowed: true,
    limit,
    remaining: limit - entry.count,
    resetMs: entry.resetTime - now,
  };
}

/**
 * Helper to build an HTTP 429 Too Many Requests response
 */
export function createRateLimitResponse(requestId: string, result: RateLimitResult): Response {
  const retryAfterSeconds = Math.ceil(result.resetMs / 1000);
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
 * Cleanup expired rate limit entries periodically
 */
export function cleanupRateLimitStore(): void {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now > entry.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}
