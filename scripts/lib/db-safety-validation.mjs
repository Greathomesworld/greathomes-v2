/**
 * Great Homes V2 — Database Safety & Isolation Validation Module
 *
 * Enforces strict compute-host-level validation to guarantee that test suites
 * never connect to the production PostgreSQL instance, while correctly supporting
 * Neon branch databases that share the logical database name 'greathomes-production'.
 */

export const KNOWN_PRODUCTION_COMPUTE_IDS = [
  'ep-royal-smoke-b3uti4fv',
];

/**
 * Redacts username and password from database connection strings.
 */
export function redactDatabaseUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return '[empty-url]';
  try {
    const parsed = new URL(rawUrl.trim());
    const auth = parsed.username ? '***:***@' : '';
    return `${parsed.protocol}//${auth}${parsed.hostname}${parsed.port ? `:${parsed.port}` : ''}${parsed.pathname}`;
  } catch {
    return '[malformed-url]';
  }
}

/**
 * Validates TEST_DATABASE_URL against strict safety and compute-isolation rules.
 *
 * Rules:
 *  1. TEST_DATABASE_URL must be set and valid postgres/postgresql URL.
 *  2. ALLOW_DISPOSABLE_DB_TESTS=1 must be provided.
 *  3. The test compute hostname MUST NOT match the known production compute ID or pooler.
 *  4. The test compute hostname MUST NOT match the DATABASE_URL compute hostname.
 *  5. The database name 'greathomes-production' or the word 'production' in the path
 *     is PERMITTED on distinct preview/integration compute hosts (Neon branching model).
 *  6. Credentials are never leaked in error messages.
 */
export function validateTestDatabaseUrl({
  testUrl,
  prodUrl,
  allowDisposable,
}) {
  if (!testUrl || typeof testUrl !== 'string' || testUrl.trim() === '') {
    return {
      valid: false,
      code: 2,
      error: 'TEST_DATABASE_URL is not configured. Set TEST_DATABASE_URL to an isolated disposable database.',
    };
  }

  if (allowDisposable !== '1') {
    return {
      valid: false,
      code: 2,
      error: 'ALLOW_DISPOSABLE_DB_TESTS=1 flag is required to confirm the target database is disposable.',
    };
  }

  let parsedTest;
  try {
    parsedTest = new URL(testUrl.trim());
  } catch (err) {
    return {
      valid: false,
      code: 1,
      error: `TEST_DATABASE_URL is not a valid URL: ${err.message}`,
    };
  }

  if (parsedTest.protocol !== 'postgres:' && parsedTest.protocol !== 'postgresql:') {
    return {
      valid: false,
      code: 1,
      error: `Invalid protocol "${parsedTest.protocol}". Expected postgres: or postgresql:`,
    };
  }

  const testHostname = parsedTest.hostname.toLowerCase();

  // 1. Host-based production blocklist check
  for (const prodId of KNOWN_PRODUCTION_COMPUTE_IDS) {
    if (testHostname.includes(prodId.toLowerCase())) {
      return {
        valid: false,
        code: 1,
        error: `FATAL SAFETY VIOLATION: TEST_DATABASE_URL compute host "${testHostname}" matches production endpoint pattern "${prodId}".`,
      };
    }
  }

  // 2. Dynamic check against the application's current DATABASE_URL
  if (prodUrl && typeof prodUrl === 'string' && prodUrl.trim() !== '') {
    try {
      const parsedProd = new URL(prodUrl.trim());
      const prodHostname = parsedProd.hostname.toLowerCase();

      // Direct host match
      if (testHostname === prodHostname) {
        return {
          valid: false,
          code: 1,
          error: `FATAL SAFETY VIOLATION: TEST_DATABASE_URL hostname matches application DATABASE_URL hostname (${testHostname}).`,
        };
      }

      // Compute endpoint base match (ignoring '-pooler' suffix)
      const baseTest = testHostname.replace(/-pooler(\.|$)/, '$1');
      const baseProd = prodHostname.replace(/-pooler(\.|$)/, '$1');
      if (baseTest === baseProd) {
        return {
          valid: false,
          code: 1,
          error: `FATAL SAFETY VIOLATION: TEST_DATABASE_URL shares the base compute endpoint with DATABASE_URL (${baseProd}).`,
        };
      }
    } catch {
      // If DATABASE_URL is malformed, proceed with static production compute checks
    }
  }

  return {
    valid: true,
    code: 0,
    parsed: parsedTest,
    redactedUrl: redactDatabaseUrl(testUrl),
  };
}
