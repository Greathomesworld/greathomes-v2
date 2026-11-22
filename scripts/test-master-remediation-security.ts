/**
 * Great Homes V2 — Master Remediation & Production-Safety Isolated Test Suite
 *
 * Strictly executes in isolated / mocked test mode (NODE_ENV=test, memory/mocked backends).
 * NEVER connects to Production Neon PostgreSQL or Production Cloudflare R2.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { NextRequest } from 'next/server';

(process.env as Record<string, string | undefined>).NODE_ENV = 'test';
process.env.PERSISTENCE_PROVIDER = 'memory';
process.env.ALLOW_DEV_MEMORY_RATE_LIMIT = 'true';
process.env.CUSTOMER_AUTH_SECRET = 'isolated-test-customer-auth-secret-32-chars-minimum';
process.env.GH_STAFF_SESSION_SECRET = 'isolated-test-staff-session-secret-32-chars-minimum';

let passed = 0;
let failed = 0;

async function runTest(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    passed++;
    console.log(`[PASS] ${name}`);
  } catch (err: any) {
    failed++;
    console.error(`[FAIL] ${name}`);
    console.error(`       ${err?.stack || err?.message || err}`);
  }
}

async function main() {
  console.log('========================================================================');
  console.log('GREAT HOMES V2 — MASTER REMEDIATION ISOLATED SECURITY & QUALITY SUITE');
  console.log('========================================================================\n');

  // ---------------------------------------------------------------------------
  // 1. Secret Hygiene & Brochure Token Fail-Closed Security
  // ---------------------------------------------------------------------------
  await runTest('SEC-01: app/.dev.env.json removed and ignored in .gitignore', () => {
    const devEnvPath = path.resolve(process.cwd(), 'app', '.dev.env.json');
    assert.equal(fs.existsSync(devEnvPath), false, 'app/.dev.env.json must not exist in workspace');
    const gitignore = fs.readFileSync(path.resolve(process.cwd(), '.gitignore'), 'utf8');
    assert.ok(gitignore.includes('.dev.env.json'), '.gitignore must ignore .dev.env.json');
  });

  await runTest('SEC-02: brochureToken fails closed in Production when secrets are missing', async () => {
    const { createBrochureDownloadToken, verifyBrochureDownloadToken } = await import(
      '../src/lib/brochureToken'
    );
    const savedEnv = {
      VERCEL_ENV: process.env.VERCEL_ENV,
      APP_ENV: process.env.APP_ENV,
      BROCHURE_TOKEN_SECRET: process.env.BROCHURE_TOKEN_SECRET,
      CUSTOMER_AUTH_SECRET: process.env.CUSTOMER_AUTH_SECRET,
      GH_STAFF_SESSION_SECRET: process.env.GH_STAFF_SESSION_SECRET,
      CUSTOMER_SESSION_SECRET: process.env.CUSTOMER_SESSION_SECRET,
      ADMIN_JWT_SECRET: process.env.ADMIN_JWT_SECRET,
    };

    try {
      process.env.APP_ENV = 'production';
      delete process.env.VERCEL_ENV;
      delete process.env.BROCHURE_TOKEN_SECRET;
      delete process.env.CUSTOMER_AUTH_SECRET;
      delete process.env.GH_STAFF_SESSION_SECRET;
      delete process.env.CUSTOMER_SESSION_SECRET;
      delete process.env.ADMIN_JWT_SECRET;

      assert.throws(
        () => createBrochureDownloadToken({ projectId: 'proj-1', brochureId: 'bro-1' }),
        /not configured/i,
        'Production must fail closed without a >=32 char signing secret'
      );

      // Configured secret succeeds and enforces project binding & tamper resistance
      process.env.BROCHURE_TOKEN_SECRET = 'prod-brochure-hmac-secret-at-least-32-chars-long';
      const token = createBrochureDownloadToken({ projectId: 'proj-1', brochureId: 'bro-1' }, 300);
      const valid = verifyBrochureDownloadToken(token, 'proj-1');
      assert.equal(valid.valid, true);
      assert.equal(valid.payload?.brochureId, 'bro-1');

      const wrongProject = verifyBrochureDownloadToken(token, 'proj-2');
      assert.equal(wrongProject.valid, false);

      const tampered = verifyBrochureDownloadToken(`${token}x`, 'proj-1');
      assert.equal(tampered.valid, false);
    } finally {
      for (const [k, v] of Object.entries(savedEnv)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });

  // ---------------------------------------------------------------------------
  // 2. Path Traversal & Upload Static Route Hardening
  // ---------------------------------------------------------------------------
  await runTest('SEC-03: /uploads/[...path] rejects traversal, dotfiles, and private originals', async () => {
    const { resolveSafeUploadPath } = await import('../src/lib/uploadPathSafety');

    const unsafeCases: string[][] = [
      ['..', '..', 'etc', 'passwd'],
      ['%2e%2e', '%2e%2e', 'package.json'],
      ['media', '..', '..', '.env'],
      ['.env'],
      ['originals', 'project', 'raw.png'],
      ['private', 'brochure.pdf'],
      ['media', 'project', 'original_master.jpg'],
      ['media\\..\\..\\secret.txt'],
      ['media', 'file.webp\0.png'],
      [],
    ];

    for (const segments of unsafeCases) {
      const res = resolveSafeUploadPath(segments);
      assert.equal(res.ok, false, `Expected unsafe segments ${JSON.stringify(segments)} to be rejected`);
    }

    const valid = resolveSafeUploadPath(['media', 'project', 'abc-123', 'public_wm.webp']);
    assert.equal(valid.ok, true);
    if (valid.ok) {
      assert.ok(valid.filePath.includes(path.join('public', 'uploads', 'media', 'project', 'abc-123', 'public_wm.webp')));
    }
  });

  // ---------------------------------------------------------------------------
  // 3. XSS & JSON-LD Script Breakout Prevention
  // ---------------------------------------------------------------------------
  await runTest('SEC-04: safeJsonLd prevents </script> breakout and preserves valid JSON', async () => {
    const { safeJsonLd } = await import('../src/lib/safeJsonLd');
    const malicious = {
      name: 'Luxury Home </script><script>alert("xss")</script> & more',
      lineSep: 'a\u2028b\u2029c',
    };
    const serialized = safeJsonLd(malicious);
    assert.equal(serialized.includes('</script>'), false, 'Serialized JSON-LD must not contain raw </script>');
    assert.equal(serialized.includes('<script>'), false, 'Serialized JSON-LD must not contain raw <script>');
    assert.equal(serialized.includes('\u2028'), false);
    assert.equal(serialized.includes('\u2029'), false);
    const parsed = JSON.parse(serialized);
    assert.equal(parsed.name, malicious.name);
  });

  await runTest('SEC-05: SafeEditorialBody parses headings/paragraphs safely as inert text blocks', async () => {
    const { parseEditorialBlocks } = await import('../src/components/editorial/SafeEditorialBody');
    const blocks = parseEditorialBlocks(
      '## Market Overview\n\n<img src=x onerror=alert(1)> Kolkata demand.\n\n### Key Takeaway\nSafe text.'
    );
    assert.equal(blocks.length, 4);
    assert.deepEqual(blocks[0], { type: 'h2', text: 'Market Overview' });
    assert.equal(blocks[1].type, 'p');
    assert.ok(blocks[1].text.includes('<img src=x onerror=alert(1)>'));
    assert.deepEqual(blocks[2], { type: 'h3', text: 'Key Takeaway' });
    assert.deepEqual(blocks[3], { type: 'p', text: 'Safe text.' });
  });

  // ---------------------------------------------------------------------------
  // 4. Multi-Platform Environment Classification & Test-Auth Guards
  // ---------------------------------------------------------------------------
  await runTest('SEC-06: Multi-platform environment guards classify Vercel/Cloud Run/Docker/Node safely', async () => {
    const { isProductionDeployment } = await import('../src/lib/config');
    const { isPreviewOrProductionEnvironment, isStrictTestEnvironment } = await import(
      '../src/lib/persistenceGuard'
    );

    assert.equal(isProductionDeployment({ NODE_ENV: 'production' } as any), true);
    assert.equal(isProductionDeployment({ NODE_ENV: 'development', APP_ENV: 'production' } as any), true);
    assert.equal(isProductionDeployment({ NODE_ENV: 'development', GH_DEPLOYMENT_ENV: 'production' } as any), true);
    assert.equal(isProductionDeployment({ NODE_ENV: 'production', APP_ENV: 'preview' } as any), false);
    assert.equal(isProductionDeployment({ NODE_ENV: 'production', VERCEL_ENV: 'preview' } as any), false);
    assert.equal(isProductionDeployment({ NODE_ENV: 'test' } as any), false);

    const prevAppEnv = process.env.APP_ENV;
    try {
      process.env.APP_ENV = 'preview';
      assert.equal(isPreviewOrProductionEnvironment(), true);
      assert.equal(isStrictTestEnvironment(), false);
      delete process.env.APP_ENV;
      assert.equal(isStrictTestEnvironment(), true);
    } finally {
      if (prevAppEnv === undefined) delete process.env.APP_ENV;
      else process.env.APP_ENV = prevAppEnv;
    }
  });

  await runTest('SEC-07: Test isolation & synthetic staff auth strictly blocked in Production', async () => {
    const { isTestIsolationActive } = await import('../src/lib/testIsolationContext');
    const { verifyInternalStaff } = await import('../src/domain/auth/authorizationBoundary');

    const prevAppEnv = process.env.APP_ENV;
    const prevSecret = process.env.GH_STAFF_TEST_SHARED_SECRET;
    try {
      const secret = 'a'.repeat(40);
      process.env.GH_STAFF_TEST_SHARED_SECRET = secret;
      process.env.APP_ENV = 'production';

      const prodReq = new Request('http://localhost:3000/api/admin/enquiries', {
        headers: {
          'x-test-isolated': 'true',
          'x-staff-test-token': secret,
          'x-staff-role': 'SUPER_ADMIN',
        },
      });
      assert.equal(isTestIsolationActive(prodReq), false, 'x-test-isolated must be blocked in Production');
      const authRes = await verifyInternalStaff(prodReq);
      assert.equal(authRes.authorized, false, 'Synthetic staff test auth must be blocked in Production');

      // Non-production rejects wrong token
      delete process.env.APP_ENV;
      const badTokenReq = new Request('http://localhost:3000/api/admin/enquiries', {
        headers: {
          'x-test-isolated': 'true',
          'x-staff-test-token': 'b'.repeat(40),
          'x-staff-role': 'SUPER_ADMIN',
        },
      });
      assert.equal(isTestIsolationActive(badTokenReq), false);
      const badAuthRes = await verifyInternalStaff(badTokenReq);
      assert.equal(badAuthRes.authorized, false);
    } finally {
      if (prevAppEnv === undefined) delete process.env.APP_ENV;
      else process.env.APP_ENV = prevAppEnv;
      if (prevSecret === undefined) delete process.env.GH_STAFF_TEST_SHARED_SECRET;
      else process.env.GH_STAFF_TEST_SHARED_SECRET = prevSecret;
    }
  });

  // ---------------------------------------------------------------------------
  // 5. RBAC Capability Matrix Verification Across All 6 Roles
  // ---------------------------------------------------------------------------
  await runTest('SEC-08: RBAC matrix enforces least privilege across all 6 staff roles', async () => {
    const { hasCapability } = await import('../src/domain/auth/capabilityModel');

    // SUPER_ADMIN & ADMIN
    assert.equal(hasCapability('SUPER_ADMIN', 'location.create'), true);
    assert.equal(hasCapability('SUPER_ADMIN', 'developer.create'), true);
    assert.equal(hasCapability('SUPER_ADMIN', 'enquiry.delete'), true);
    assert.equal(hasCapability('ADMIN', 'location.create'), true);
    assert.equal(hasCapability('ADMIN', 'developer.create'), true);
    assert.equal(hasCapability('ADMIN', 'rental.create'), true);
    assert.equal(hasCapability('ADMIN', 'resale.create'), true);
    assert.equal(hasCapability('ADMIN', 'enquiry.manageSiteVisit'), true);

    // SALES_MANAGER
    assert.equal(hasCapability('SALES_MANAGER', 'enquiry.manageSiteVisit'), true);
    assert.equal(hasCapability('SALES_MANAGER', 'rental.create'), true);
    assert.equal(hasCapability('SALES_MANAGER', 'resale.create'), true);
    assert.equal(hasCapability('SALES_MANAGER', 'location.create'), false);
    assert.equal(hasCapability('SALES_MANAGER', 'developer.create'), false);
    assert.equal(hasCapability('SALES_MANAGER', 'enquiry.delete'), false);

    // SALES_EXECUTIVE
    assert.equal(hasCapability('SALES_EXECUTIVE', 'enquiry.manageSiteVisit'), true);
    assert.equal(hasCapability('SALES_EXECUTIVE', 'location.create'), false);
    assert.equal(hasCapability('SALES_EXECUTIVE', 'developer.create'), false);
    assert.equal(hasCapability('SALES_EXECUTIVE', 'enquiry.delete'), false);

    // TELECALLER (calling & follow-up only — explicitly lacks site-visit management, assign, listings, master data)
    assert.equal(hasCapability('TELECALLER', 'enquiry.read'), true);
    assert.equal(hasCapability('TELECALLER', 'enquiry.manageFollowUp'), true);
    assert.equal(hasCapability('TELECALLER', 'enquiry.manageSiteVisit'), false);
    assert.equal(hasCapability('TELECALLER', 'enquiry.assign'), false);
    assert.equal(hasCapability('TELECALLER', 'location.create'), false);
    assert.equal(hasCapability('TELECALLER', 'developer.create'), false);
    assert.equal(hasCapability('TELECALLER', 'rental.create'), false);
    assert.equal(hasCapability('TELECALLER', 'resale.create'), false);

    // CONTENT_MANAGER & PROPERTY_MANAGER
    assert.equal(hasCapability('CONTENT_MANAGER', 'location.create'), true);
    assert.equal(hasCapability('CONTENT_MANAGER', 'developer.create'), true);
    assert.equal(hasCapability('CONTENT_MANAGER', 'enquiry.delete'), false);
    assert.equal(hasCapability('PROPERTY_MANAGER', 'rental.create'), true);
    assert.equal(hasCapability('PROPERTY_MANAGER', 'resale.create'), true);
    assert.equal(hasCapability('PROPERTY_MANAGER', 'rental.publish'), false);
    assert.equal(hasCapability('PROPERTY_MANAGER', 'enquiry.delete'), false);

    // ANALYST (strictly read-only intelligence & catalog)
    assert.equal(hasCapability('ANALYST', 'customer_intelligence.read'), true);
    assert.equal(hasCapability('ANALYST', 'project.read'), true);
    assert.equal(hasCapability('ANALYST', 'enquiry.manageSiteVisit'), false);
    assert.equal(hasCapability('ANALYST', 'location.create'), false);
    assert.equal(hasCapability('ANALYST', 'developer.create'), false);
    assert.equal(hasCapability('ANALYST', 'rental.create'), false);
    assert.equal(hasCapability('ANALYST', 'resale.create'), false);
    assert.equal(hasCapability('ANALYST', 'enquiry.delete'), false);
  });

  // ---------------------------------------------------------------------------
  // 6. POST /api/site-visits Auth, Anti-IDOR, State Guard & Idempotency
  // ---------------------------------------------------------------------------
  await runTest('SEC-09: POST /api/site-visits enforces auth, anti-IDOR, forged customerId block, and idempotency', async () => {
    const { enquiryRepository } = await import('../src/domain/enquiry/repositories/enquiryRepository');
    const { siteVisitRepository } = await import(
      '../src/infrastructure/repositories/postgres/siteVisitRepositoryPostgres'
    );
    const { issueContinuationToken } = await import(
      '../src/domain/enquiry/services/enquiryContinuationToken'
    );
    const { enableTestMemoryRateLimit, resetRateLimitStoreForTesting } = await import(
      '../src/lib/rateLimit'
    );
    const { POST: postSiteVisit } = await import('../app/api/site-visits/route');

    resetRateLimitStoreForTesting();
    enableTestMemoryRateLimit(true);
    enquiryRepository.enableTestMemoryPersistence(true);
    enquiryRepository.clearMemoryForTesting();
    siteVisitRepository.enableTestMemoryPersistence(true);
    siteVisitRepository.clearMemoryForTesting();

    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const { rawToken: plainToken, record: storedRecord } = issueContinuationToken();
    const expiredRecord = { ...storedRecord, expiresAt: new Date(Date.now() - 60_000).toISOString() };

    const activeEnquiry = await enquiryRepository.create({
      contextType: 'PROJECT',
      projectId: 'proj-test-1',
      customerId: 'cust-owner-1',
      buyerName: 'Test Buyer',
      buyerPhone: '+919876543210',
      preferredContact: 'WHATSAPP',
      requestSiteVisit: false,
      metadata: { _continuation: storedRecord },
    });

    const expiredEnquiry = await enquiryRepository.create({
      contextType: 'PROJECT',
      projectId: 'proj-test-1',
      buyerName: 'Expired Buyer',
      buyerPhone: '+919876543211',
      preferredContact: 'PHONE',
      requestSiteVisit: false,
      metadata: { _continuation: expiredRecord },
    });

    const closedEnquiry = await enquiryRepository.create({
      contextType: 'PROJECT',
      projectId: 'proj-test-1',
      buyerName: 'Closed Buyer',
      buyerPhone: '+919876543212',
      preferredContact: 'PHONE',
      requestSiteVisit: false,
      status: 'CLOSED',
      metadata: { _continuation: storedRecord },
    });

    // 1. Unauthenticated request -> 401
    const unauthRes = await postSiteVisit(
      new NextRequest('http://localhost:3000/api/site-visits', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          enquiryId: activeEnquiry.id,
          preferredDate: futureDate,
          preferredTimeWindow: '10:00 AM - 12:00 PM',
        }),
      })
    );
    assert.equal(unauthRes.status, 401, 'Unauthenticated site-visit booking must return 401');

    // 2. Non-existent enquiry with bogus token -> uniform 403 (prevents enumeration)
    const missingRes = await postSiteVisit(
      new NextRequest('http://localhost:3000/api/site-visits', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-enquiry-token': plainToken,
        },
        body: JSON.stringify({
          enquiryId: 'enq-does-not-exist',
          preferredDate: futureDate,
          preferredTimeWindow: '10:00 AM - 12:00 PM',
        }),
      })
    );
    assert.equal(missingRes.status, 403, 'Unknown enquiry ID for non-staff must return uniform 403');

    // 3. Wrong token -> 403
    const wrongTokRes = await postSiteVisit(
      new NextRequest('http://localhost:3000/api/site-visits', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-enquiry-token': 'forged_token_value',
        },
        body: JSON.stringify({
          enquiryId: activeEnquiry.id,
          preferredDate: futureDate,
          preferredTimeWindow: '10:00 AM - 12:00 PM',
        }),
      })
    );
    assert.equal(wrongTokRes.status, 403, 'Forged continuation token must return 403');

    // 4. Expired token -> 401
    const expTokRes = await postSiteVisit(
      new NextRequest('http://localhost:3000/api/site-visits', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-enquiry-token': plainToken,
        },
        body: JSON.stringify({
          enquiryId: expiredEnquiry.id,
          preferredDate: futureDate,
          preferredTimeWindow: '10:00 AM - 12:00 PM',
        }),
      })
    );
    assert.equal(expTokRes.status, 401, 'Expired continuation token must return 401');

    // 5. Forged customerId spoofing -> 403
    const spoofRes = await postSiteVisit(
      new NextRequest('http://localhost:3000/api/site-visits', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-enquiry-token': plainToken,
        },
        body: JSON.stringify({
          enquiryId: activeEnquiry.id,
          customerId: 'cust-victim-999',
          preferredDate: futureDate,
          preferredTimeWindow: '10:00 AM - 12:00 PM',
        }),
      })
    );
    assert.equal(spoofRes.status, 403, 'Forged customerId override must return 403');

    // 6. Terminal CLOSED enquiry -> 409
    const closedRes = await postSiteVisit(
      new NextRequest('http://localhost:3000/api/site-visits', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-enquiry-token': plainToken,
        },
        body: JSON.stringify({
          enquiryId: closedEnquiry.id,
          preferredDate: futureDate,
          preferredTimeWindow: '10:00 AM - 12:00 PM',
        }),
      })
    );
    assert.equal(closedRes.status, 409, 'Terminal enquiry must return 409');

    // 7. Valid booking -> 201, and idempotent retry -> 200 deduplicated
    const validRes1 = await postSiteVisit(
      new NextRequest('http://localhost:3000/api/site-visits', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-enquiry-token': plainToken,
          'x-idempotency-key': 'idem-key-sv-001',
        },
        body: JSON.stringify({
          enquiryId: activeEnquiry.id,
          preferredDate: futureDate,
          preferredTimeWindow: '10:00 AM - 12:00 PM',
          visitType: 'IN_PERSON',
        }),
      })
    );
    assert.equal(validRes1.status, 201);
    const body1 = await validRes1.json();
    assert.equal(body1.success, true);
    assert.equal(body1.deduplicated, false);
    assert.equal(body1.siteVisit.projectId, 'proj-test-1');

    const validRes2 = await postSiteVisit(
      new NextRequest('http://localhost:3000/api/site-visits', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-enquiry-token': plainToken,
          'x-idempotency-key': 'idem-key-sv-001',
        },
        body: JSON.stringify({
          enquiryId: activeEnquiry.id,
          preferredDate: futureDate,
          preferredTimeWindow: '10:00 AM - 12:00 PM',
          visitType: 'IN_PERSON',
        }),
      })
    );
    assert.equal(validRes2.status, 200);
    const body2 = await validRes2.json();
    assert.equal(body2.deduplicated, true);
    assert.equal(body2.siteVisit.id, body1.siteVisit.id);
  });

  // ---------------------------------------------------------------------------
  // 7. safeFetchJson & createApiErrorResponse Classification
  // ---------------------------------------------------------------------------
  await runTest('API-01: safeFetchJson classifies 400-504, nested error objects, and warmup HTML cleanly', async () => {
    const { safeFetchJson } = await import('../src/lib/safeApiFetch');
    const origFetch = globalThis.fetch;

    try {
      const statusCases: Array<{ status: number; body: any; expectedCategory: string; expectedMsg?: string }> = [
        { status: 400, body: { error: { code: 'VALIDATION_ERROR', message: 'Invalid field' } }, expectedCategory: 'validation', expectedMsg: 'Invalid field' },
        { status: 401, body: { error: 'Unauthorized' }, expectedCategory: 'authentication' },
        { status: 403, body: { error: 'Forbidden' }, expectedCategory: 'authorization' },
        { status: 404, body: { error: 'Not found' }, expectedCategory: 'not_found' },
        { status: 409, body: { error: 'Duplicate' }, expectedCategory: 'conflict' },
        { status: 429, body: { error: 'Too many requests' }, expectedCategory: 'rate_limited' },
        { status: 500, body: { error: 'Server failed' }, expectedCategory: 'server' },
        { status: 502, body: { error: 'Bad gateway' }, expectedCategory: 'server' },
        { status: 503, body: { code: 'PERSISTENCE_UNAVAILABLE', error: 'DB unavailable' }, expectedCategory: 'persistence_unavailable' },
        { status: 504, body: { error: 'Gateway timeout' }, expectedCategory: 'server' },
      ];

      for (const tc of statusCases) {
        globalThis.fetch = (async () =>
          new Response(JSON.stringify(tc.body), {
            status: tc.status,
            headers: { 'content-type': 'application/json' },
          })) as any;

        const res = await safeFetchJson('/api/test');
        assert.equal(res.ok, false);
        assert.equal(res.errorCategory, tc.expectedCategory, `Status ${tc.status} mismatch`);
        if (tc.expectedMsg) {
          assert.equal(res.error, tc.expectedMsg);
        }
      }

      // HTTP 200 warmup HTML (Nginx proxy intercept) -> classified as persistence_unavailable, never throws
      globalThis.fetch = (async () =>
        new Response('<!doctype html><html><head><title>Starting Server...</title></head><body>Warming up</body></html>', {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        })) as any;

      const warmupRes = await safeFetchJson('/api/test');
      assert.equal(warmupRes.ok, false);
      assert.equal(warmupRes.isHtmlResponse, true);
      assert.equal(warmupRes.errorCategory, 'persistence_unavailable');
      assert.equal(warmupRes.status, 503);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  await runTest('API-02: createApiErrorResponse handles 503, no-store, and redacts SQL errors', async () => {
    const { createApiErrorResponse } = await import('../src/lib/apiError');
    const { PersistenceUnavailableError } = await import('../src/lib/persistenceGuard');

    const r503 = createApiErrorResponse(new PersistenceUnavailableError(), 'req-test-503');
    assert.equal(r503.status, 503);
    assert.equal(r503.headers.get('Cache-Control'), 'no-store, max-age=0');
    const j503 = await r503.json();
    assert.equal(j503.error.code, 'SERVICE_UNAVAILABLE');

    const sqlErr = new Error('SELECT * FROM customers WHERE phone = $1 failed: postgres ECONNREFUSED');
    const r500 = createApiErrorResponse(sqlErr, 'req-test-500');
    assert.equal(r500.status, 500);
    const j500 = await r500.json();
    assert.equal(j500.error.message.includes('SELECT'), false, 'Raw SQL must never leak in API error responses');
  });

  // ---------------------------------------------------------------------------
  // 8. S3 / R2 Storage Key Traversal Protection (Isolated — Zero Live R2 Calls)
  // ---------------------------------------------------------------------------
  await runTest('R2-01: S3StorageProvider blocks key traversal on put/delete/exists/read/getSignedUrl', async () => {
    const { S3StorageProvider } = await import('../src/domain/media/storage/storageProvider');
    const savedEnv = {
      S3_ENDPOINT: process.env.S3_ENDPOINT,
      S3_BUCKET: process.env.S3_BUCKET,
      S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID,
      S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY,
    };

    try {
      process.env.S3_ENDPOINT = 'https://isolated-mock.r2.invalid';
      process.env.S3_BUCKET = 'isolated-mock-bucket';
      process.env.S3_ACCESS_KEY_ID = 'mock-access-key';
      process.env.S3_SECRET_ACCESS_KEY = 'mock-secret-key';

      const provider = new S3StorageProvider();
      let sentCalls = 0;
      (provider as any).client = {
        send: async () => {
          sentCalls++;
          return {};
        },
      };

      await assert.rejects(
        () => provider.put('../escape.jpg', Buffer.from('x'), { contentType: 'image/jpeg' }),
        /path traversal/i
      );
      await assert.rejects(
        () => provider.put('media/ok\0bad.jpg', Buffer.from('x'), { contentType: 'image/jpeg' }),
        /Invalid storage key/i
      );
      assert.equal(await provider.delete('../../production-asset.webp'), false);
      assert.equal(await provider.exists('../secret'), false);
      assert.equal(await provider.read('../secret'), null);
      await assert.rejects(() => provider.getSignedUrl('../secret.pdf'), /path traversal/i);
      assert.equal(sentCalls, 0, 'No S3 command should be dispatched for invalid/traversal keys');
    } finally {
      for (const [k, v] of Object.entries(savedEnv)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });

  // ---------------------------------------------------------------------------
  // 9. SEO & Internal Debug Route Guards
  // ---------------------------------------------------------------------------
  await runTest('SEO-01: robots.ts disallows private, transactional, and internal debug routes', async () => {
    const { default: robots } = await import('../app/robots');
    const config = robots();
    const rules = Array.isArray(config.rules) ? config.rules : [config.rules];
    const disallow = rules[0]?.disallow;
    assert.ok(Array.isArray(disallow));
    for (const expected of ['/api/', '/admin/', '/account/', '/my-properties', '/post-property', '/compression-gallery', '/compare']) {
      assert.ok(disallow.includes(expected), `robots.ts must disallow ${expected}`);
    }
  });

  console.log('\n========================================================================');
  console.log(`ISOLATED SECURITY & REMEDIATION SUITE: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Unhandled suite failure:', err);
  process.exit(1);
});
