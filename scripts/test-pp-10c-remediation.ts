import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';

(process.env as Record<string, string | undefined>).NODE_ENV = 'test';
process.env.PERSISTENCE_PROVIDER = 'memory';

import {
  PersistenceUnavailableError,
  isPersistenceUnavailableError,
} from '../src/lib/persistenceGuard.ts';
import { isPostgresRequired, getDb } from '../src/db/client.ts';
import {
  enquiryRepository,
  EnquiryRepositoryMemory,
  GuardedEnquiryRepository,
} from '../src/domain/enquiry/repositories/enquiryRepository.ts';
import { EnquiryRepositoryPostgres } from '../src/infrastructure/repositories/postgres/enquiryRepositoryPostgres.ts';
import {
  siteVisitRepository,
  SiteVisitRepositoryMemory,
  SiteVisitRepositoryPostgres,
  GuardedSiteVisitRepository,
  deriveDeterministicSiteVisitId,
} from '../src/infrastructure/repositories/postgres/siteVisitRepositoryPostgres.ts';
import {
  SiteVisitService,
  deriveSiteVisitIdempotencyKey,
} from '../src/domain/siteVisit/services/siteVisitService.ts';
import { auditService } from '../src/domain/audit/auditService.ts';
import {
  extractRequestContext,
  extractTrustedClientIp,
  getTrustedProxyCount,
  normalizeAndValidateIp,
} from '../src/lib/requestContext.ts';
import {
  checkRateLimit,
  enableTestMemoryRateLimit,
  hashRateLimitKey,
  isRateLimitUnavailableError,
  resetRateLimitStoreForTesting,
} from '../src/lib/rateLimit.ts';
import { initializeTestRunnerSecret } from '../src/lib/testIsolationContext.ts';
import { POST as postSiteVisitsRoute } from '../app/api/site-visits/route.ts';
import { POST as postResaleStatusRoute } from '../app/api/resale/[id]/status/route.ts';
import { POST as postRentStatusRoute } from '../app/api/rent/[id]/status/route.ts';
import {
  GET as getResaleMediaRoute,
  POST as postResaleMediaRoute,
  PATCH as patchResaleMediaRoute,
} from '../app/api/resale/[id]/media/route.ts';
import {
  GET as getRentMediaRoute,
  POST as postRentMediaRoute,
  PATCH as patchRentMediaRoute,
} from '../app/api/rent/[id]/media/route.ts';
import {
  GET as getResaleAmenitiesRoute,
  POST as postResaleAmenitiesRoute,
  DELETE as deleteResaleAmenitiesRoute,
} from '../app/api/resale/[id]/amenities/route.ts';
import {
  GET as getRentAmenitiesRoute,
  POST as postRentAmenitiesRoute,
  DELETE as deleteRentAmenitiesRoute,
} from '../app/api/rent/[id]/amenities/route.ts';
import { PATCH as patchRentLifecycleRoute } from '../app/api/rent/[id]/lifecycle/route.ts';
import { PATCH as patchRentVerificationRoute } from '../app/api/rent/[id]/verification/route.ts';
import {
  GET as getProjectResaleRoute,
  POST as postProjectResaleRoute,
} from '../app/api/projects/[id]/resale/route.ts';
import {
  GET as getProjectRentRoute,
  POST as postProjectRentRoute,
} from '../app/api/projects/[id]/rent/route.ts';
import { GET as getDiscoveryBuyRoute } from '../app/api/discovery/buy/route.ts';
import { GET as getDiscoveryRentRoute } from '../app/api/discovery/rent/route.ts';

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } catch (err: any) {
    failed++;
    console.error(`  \x1b[31m✗\x1b[0m ${name}`);
    console.error(`    ${err?.stack || err?.message || err}`);
  }
}

async function withEnv<T>(
  overrides: Record<string, string | undefined>,
  fn: () => Promise<T> | T
): Promise<T> {
  const saved: Record<string, string | undefined> = {};
  for (const key of Object.keys(overrides)) {
    saved[key] = process.env[key];
    const nextVal = overrides[key];
    if (nextVal === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = nextVal;
    }
  }
  try {
    return await fn();
  } finally {
    for (const key of Object.keys(overrides)) {
      if (saved[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = saved[key];
      }
    }
  }
}

async function runPP10CTests() {
  console.log('====================================================================');
  console.log('GREAT HOMES V2 — PP-10C SECURITY & PERSISTENCE REMEDIATION SUITE');
  console.log('====================================================================\n');

  // --------------------------------------------------------------------------
  // SECTION 1: P-01 — REMOVE UNAUTHORIZED MEMORY PERSISTENCE FALLBACKS
  // --------------------------------------------------------------------------
  console.log('--- P-01: Enquiry & Site Visit Repository Fail-Closed Persistence Guards ---');

  await test('P-01.1: src/db/client.ts isPostgresRequired() returns true in Preview and Production and getDb() rejects PERSISTENCE_PROVIDER=memory', async () => {
    await withEnv({ NODE_ENV: 'development', VERCEL_ENV: 'preview', PERSISTENCE_PROVIDER: 'memory' }, () => {
      assert.equal(isPostgresRequired(), true, 'isPostgresRequired() must be true when VERCEL_ENV=preview');
      assert.throws(
        () => getDb(),
        /PERSISTENCE_PROVIDER=memory is strictly prohibited in Preview and Production/,
        'getDb() must reject PERSISTENCE_PROVIDER=memory in Preview'
      );
    });

    await withEnv({ NODE_ENV: 'production', VERCEL_ENV: 'production', PERSISTENCE_PROVIDER: 'memory' }, () => {
      assert.equal(isPostgresRequired(), true);
      assert.throws(() => getDb(), /PERSISTENCE_PROVIDER=memory is strictly prohibited/);
    });
  });

  await test('P-01.2: Direct EnquiryRepositoryMemory & SiteVisitRepositoryMemory construction is rejected outside NODE_ENV=test or when PERSISTENCE_PROVIDER=postgres', async () => {
    for (const envCombo of [
      { NODE_ENV: 'development', VERCEL_ENV: undefined, PERSISTENCE_PROVIDER: 'memory' },
      { NODE_ENV: 'development', VERCEL_ENV: 'preview', PERSISTENCE_PROVIDER: 'memory' },
      { NODE_ENV: 'production', VERCEL_ENV: 'production', PERSISTENCE_PROVIDER: 'memory' },
      { NODE_ENV: 'test', VERCEL_ENV: 'preview', PERSISTENCE_PROVIDER: 'memory' },
      { NODE_ENV: 'test', VERCEL_ENV: undefined, PERSISTENCE_PROVIDER: 'postgres' },
    ]) {
      await withEnv(envCombo, () => {
        assert.throws(
          () => new EnquiryRepositoryMemory(),
          (err: unknown) => isPersistenceUnavailableError(err),
          `EnquiryRepositoryMemory must reject ${JSON.stringify(envCombo)}`
        );
        assert.throws(
          () => new SiteVisitRepositoryMemory(),
          (err: unknown) => isPersistenceUnavailableError(err),
          `SiteVisitRepositoryMemory must reject ${JSON.stringify(envCombo)}`
        );
      });
    }
  });

  await test('P-01.3: GuardedEnquiryRepository & GuardedSiteVisitRepository enforce 7-row fail-closed persistence matrix', async () => {
    const guardedEnq = new GuardedEnquiryRepository({
      dbResolver: () => null,
    });
    const guardedSv = new GuardedSiteVisitRepository({
      dbResolver: () => null,
    });

    // 1. NODE_ENV=test + PERSISTENCE_PROVIDER=memory WITHOUT opt-in -> 503
    await withEnv({ NODE_ENV: 'test', VERCEL_ENV: undefined, PERSISTENCE_PROVIDER: 'memory', DATABASE_URL: undefined }, async () => {
      guardedEnq.enableTestMemoryPersistence(false);
      guardedSv.enableTestMemoryPersistence(false);
      await assert.rejects(async () => await guardedEnq.list(), (e) => isPersistenceUnavailableError(e));
      await assert.rejects(async () => await guardedSv.list(), (e) => isPersistenceUnavailableError(e));
    });

    // 2. NODE_ENV=development + missing DATABASE_URL -> 503
    await withEnv({ NODE_ENV: 'development', VERCEL_ENV: undefined, PERSISTENCE_PROVIDER: undefined, DATABASE_URL: undefined }, async () => {
      await assert.rejects(async () => await guardedEnq.list(), (e) => isPersistenceUnavailableError(e));
      await assert.rejects(async () => await guardedSv.list(), (e) => isPersistenceUnavailableError(e));
    });

    // 3. NODE_ENV=development + PERSISTENCE_PROVIDER=memory -> 503
    await withEnv({ NODE_ENV: 'development', VERCEL_ENV: undefined, PERSISTENCE_PROVIDER: 'memory', DATABASE_URL: undefined }, async () => {
      assert.throws(() => guardedEnq.enableTestMemoryPersistence(true), (e) => isPersistenceUnavailableError(e));
      assert.throws(() => guardedSv.enableTestMemoryPersistence(true), (e) => isPersistenceUnavailableError(e));
      await assert.rejects(async () => await guardedEnq.list(), (e) => isPersistenceUnavailableError(e));
      await assert.rejects(async () => await guardedSv.list(), (e) => isPersistenceUnavailableError(e));
    });

    // 4. VERCEL_ENV=preview -> rejects memory and missing DB with 503
    await withEnv({ NODE_ENV: 'production', VERCEL_ENV: 'preview', PERSISTENCE_PROVIDER: 'memory', DATABASE_URL: undefined }, async () => {
      assert.throws(() => guardedEnq.enableTestMemoryPersistence(true), (e) => isPersistenceUnavailableError(e));
      assert.throws(() => guardedSv.enableTestMemoryPersistence(true), (e) => isPersistenceUnavailableError(e));
      await assert.rejects(async () => await guardedEnq.list(), (e) => isPersistenceUnavailableError(e));
      await assert.rejects(async () => await guardedSv.list(), (e) => isPersistenceUnavailableError(e));
    });

    // 5. VERCEL_ENV=production -> rejects memory and missing DB with 503
    await withEnv({ NODE_ENV: 'production', VERCEL_ENV: 'production', PERSISTENCE_PROVIDER: 'postgres', DATABASE_URL: undefined }, async () => {
      await assert.rejects(async () => await guardedEnq.list(), (e) => isPersistenceUnavailableError(e));
      await assert.rejects(async () => await guardedSv.list(), (e) => isPersistenceUnavailableError(e));
    });

    // 6. NODE_ENV=test + PERSISTENCE_PROVIDER=memory WITH opt-in -> allowed
    await withEnv({ NODE_ENV: 'test', VERCEL_ENV: undefined, PERSISTENCE_PROVIDER: 'memory', DATABASE_URL: undefined }, async () => {
      guardedEnq.enableTestMemoryPersistence(true);
      guardedSv.enableTestMemoryPersistence(true);
      const enqs = await guardedEnq.list();
      const svs = await guardedSv.list();
      assert.ok(Array.isArray(enqs.items));
      assert.ok(Array.isArray(svs));
    });
  });

  await test('P-01.4: SiteVisitRepositoryPostgres never falls back to memory on DB error and sanitizes credentials', async () => {
    const failingDb = {
      select() {
        throw new Error('connection to postgres://admin:super_secret_pw@ep-neon.aws.neon.tech/greathomes failed');
      },
    };
    const pgSvRepo = new SiteVisitRepositoryPostgres(() => failingDb as any);
    let caught: any = null;
    try {
      await pgSvRepo.list();
    } catch (err) {
      caught = err;
    }
    assert.equal(isPersistenceUnavailableError(caught), true);
    assert.ok(!caught.message.includes('super_secret_pw'), 'Credentials must never leak in error message');
    assert.ok(!caught.message.includes('postgres://'), 'Connection URI must never leak in error message');
  });

  // --------------------------------------------------------------------------
  // SECTION 2: RL-01 to RL-04 — PROXY PROVENANCE, HOP SELECTION & IP CANONICALIZATION
  // --------------------------------------------------------------------------
  console.log('\n--- RL-01..RL-04: Trusted Proxy Provenance, Right-to-Left Hop Selection & IP Canonicalization ---');

  await test('RL-01: Proxy headers (X-Forwarded-For, X-Real-IP, CF-Connecting-IP) are ignored without verified proxy provenance', async () => {
    await withEnv(
      {
        TRUST_VERCEL_PROXY: undefined,
        TRUST_CLOUDFLARE_PROXY: undefined,
        TRUST_REVERSE_PROXY: undefined,
        VERCEL: undefined,
        VERCEL_ENV: undefined,
        TRUSTED_PROXY_COUNT: '1',
      },
      () => {
        // Forged X-Forwarded-For without proxy provenance
        assert.equal(
          extractTrustedClientIp(new Headers({ 'x-forwarded-for': '203.0.113.10' })),
          null
        );
        // Forged X-Real-IP without TRUST_VERCEL_PROXY=true
        assert.equal(
          extractTrustedClientIp(new Headers({ 'x-real-ip': '198.51.100.10', 'x-vercel-id': 'bom1::123' })),
          null
        );
        // Forged CF-Connecting-IP without TRUST_CLOUDFLARE_PROXY=true
        assert.equal(
          extractTrustedClientIp(
            new Headers({
              'cf-connecting-ip': '198.51.100.20',
              'cf-ray': '8a1b2c3d4e5f-SIN',
              'x-forwarded-for': '198.51.100.20',
            })
          ),
          null
        );
      }
    );

    // Verified Cloudflare provenance (requires CLOUDFLARE_STRICT_ORIGIN_INGRESS_ENFORCED or shared secret)
    await withEnv(
      {
        TRUST_CLOUDFLARE_PROXY: 'true',
        CLOUDFLARE_STRICT_ORIGIN_INGRESS_ENFORCED: 'true',
        TRUSTED_PROXY_COUNT: '1',
      },
      () => {
        assert.equal(
          extractTrustedClientIp(
            new Headers({
              'cf-connecting-ip': '198.51.100.20',
              'cf-ray': '8a1b2c3d4e5f-SIN',
              'x-forwarded-for': '198.51.100.20',
            })
          ),
          '198.51.100.20'
        );
      }
    );

    // Verified Vercel provenance (requires VERCEL_EDGE_INGRESS_ENFORCED or shared secret)
    await withEnv(
      {
        TRUST_VERCEL_PROXY: 'true',
        VERCEL: '1',
        VERCEL_ENV: 'preview',
        VERCEL_EDGE_INGRESS_ENFORCED: 'true',
        TRUSTED_PROXY_COUNT: '1',
      },
      () => {
        assert.equal(
          extractTrustedClientIp(
            new Headers({
              'x-vercel-id': 'bom1::iad1::12345',
              'x-real-ip': '198.51.100.33',
            })
          ),
          '198.51.100.33'
        );
      }
    );
  });

  await test('RL-02: Strict TRUSTED_PROXY_COUNT parsing and right-to-left X-Forwarded-For hop selection without pre-filtering invalid hops', async () => {
    // 1. Malformed / negative / float / out-of-range TRUSTED_PROXY_COUNT values return 0
    for (const badVal of ['', '-1', '0', 'abc', '1.5', '11', '999', 'NaN']) {
      await withEnv({ TRUSTED_PROXY_COUNT: badVal }, () => {
        assert.equal(getTrustedProxyCount(), 0, `Expected 0 for TRUSTED_PROXY_COUNT="${badVal}"`);
      });
    }

    await withEnv(
      {
        TRUST_REVERSE_PROXY: 'true',
        REVERSE_PROXY_INGRESS_ENFORCED: 'true',
        TRUSTED_PROXY_COUNT: '2',
      },
      () => {
        // 2. Two trusted proxies: selects rawParts[length - 2]
        assert.equal(
          extractTrustedClientIp(
            new Headers({
              'x-forwarded-for': '1.1.1.1, 203.0.113.50, 70.41.3.18',
            })
          ),
          '203.0.113.50'
        );

        // 3. Fewer hops than TRUSTED_PROXY_COUNT=2 -> rejected (null), never clamps to index 0
        assert.equal(
          extractTrustedClientIp(
            new Headers({
              'x-forwarded-for': '203.0.113.50',
            })
          ),
          null
        );

        // 4. Invalid hop at target index or to its right -> rejected (null), never shifts trust boundary left
        assert.equal(
          extractTrustedClientIp(
            new Headers({
              'x-forwarded-for': '203.0.113.50, invalid-hop, 70.41.3.18',
            })
          ),
          null,
          'Invalid hop at target position must not shift selection to client-controlled leftmost hop'
        );
        assert.equal(
          extractTrustedClientIp(
            new Headers({
              'x-forwarded-for': '203.0.113.50, 198.51.100.1, not-an-ip',
            })
          ),
          null,
          'Invalid hop to the right of target must reject chain'
        );
      }
    );

    // 5. TRUSTED_PROXY_COUNT=1 with invalid rightmost hop -> null
    await withEnv(
      {
        TRUST_REVERSE_PROXY: 'true',
        REVERSE_PROXY_INGRESS_ENFORCED: 'true',
        TRUSTED_PROXY_COUNT: '1',
      },
      () => {
        assert.equal(
          extractTrustedClientIp(
            new Headers({
              'x-forwarded-for': '203.0.113.50, not-an-ip',
            })
          ),
          null
        );
      }
    );
  });

  await test('RL-03: All IPv4-mapped IPv6 forms normalize to canonical IPv4 and share the exact same rate-limit bucket', () => {
    const variants = [
      '192.0.2.1',
      '::ffff:192.0.2.1',
      '::FFFF:192.0.2.1',
      '0:0:0:0:0:ffff:192.0.2.1',
      '0000:0000:0000:0000:0000:ffff:192.0.2.1',
      '::ffff:c000:0201',
      '::FFFF:C000:0201',
      '0:0:0:0:0:ffff:c000:201',
    ];

    const expectedBucket = hashRateLimitKey('enquiry_post_192.0.2.1');
    for (const v of variants) {
      const normalized = normalizeAndValidateIp(v);
      assert.equal(normalized, '192.0.2.1', `Variant "${v}" must normalize to "192.0.2.1", got "${normalized}"`);
      assert.equal(hashRateLimitKey(`enquiry_post_${normalized}`), expectedBucket);
    }
  });

  await test('RL-04: Development memory rate limiter requires explicit ALLOW_DEV_MEMORY_RATE_LIMIT=true and is forbidden in Preview/Prod', async () => {
    resetRateLimitStoreForTesting();
    enableTestMemoryRateLimit(false);

    // 1. Development without ALLOW_DEV_MEMORY_RATE_LIMIT=true -> fails closed 503
    await withEnv(
      {
        NODE_ENV: 'development',
        VERCEL_ENV: undefined,
        PERSISTENCE_PROVIDER: undefined,
        DATABASE_URL: undefined,
        ALLOW_DEV_MEMORY_RATE_LIMIT: undefined,
      },
      async () => {
        await assert.rejects(
          () => checkRateLimit('dev_no_optin', 10, 60000),
          (err) => isRateLimitUnavailableError(err)
        );
      }
    );

    // 2. Development WITH ALLOW_DEV_MEMORY_RATE_LIMIT=true -> allowed
    await withEnv(
      {
        NODE_ENV: 'development',
        VERCEL_ENV: undefined,
        PERSISTENCE_PROVIDER: undefined,
        DATABASE_URL: undefined,
        ALLOW_DEV_MEMORY_RATE_LIMIT: 'true',
      },
      async () => {
        const res = await checkRateLimit('dev_with_optin', 10, 60000);
        assert.equal(res.allowed, true);
      }
    );

    // 3. Preview/Production WITH ALLOW_DEV_MEMORY_RATE_LIMIT=true -> still fails closed 503
    for (const prodEnv of [
      { NODE_ENV: 'development', VERCEL_ENV: 'preview' },
      { NODE_ENV: 'production', VERCEL_ENV: 'production' },
    ]) {
      await withEnv(
        {
          ...prodEnv,
          PERSISTENCE_PROVIDER: undefined,
          DATABASE_URL: undefined,
          ALLOW_DEV_MEMORY_RATE_LIMIT: 'true',
        },
        async () => {
          await assert.rejects(
            () => checkRateLimit('preview_prod_no_fallback', 10, 60000),
            (err) => isRateLimitUnavailableError(err)
          );
        }
      );
    }

    enableTestMemoryRateLimit(true);
  });

  // --------------------------------------------------------------------------
  // SECTION 3: P-02 — CONSISTENT 503 HANDLING ACROSS ALL 12 SECONDARY API ROUTES
  // --------------------------------------------------------------------------
  console.log('\n--- P-02: Consistent HTTP 503 PersistenceUnavailableError Handling Across 12 Secondary Routes ---');

  await test('P-02.1: All 12 secondary resale, rental, project, and discovery API routes return HTTP 503 when persistence is unavailable', async () => {
    const { projectRepository } = await import('../src/infrastructure/repositories/projectProvider.ts');
    const { developerRepository } = await import('../src/infrastructure/repositories/developerProvider.ts');
    const { locationRepository } = await import('../src/infrastructure/repositories/locationProvider.ts');

    const seededDev = await developerRepository.create({
      name: 'PP10C Test Developer',
      slug: `pp10c-dev-${Date.now()}`,
      isActive: true,
    } as any);
    const seededLoc = await locationRepository.create({
      name: 'PP10C Test Location',
      slug: `pp10c-loc-${Date.now()}`,
      type: 'LOCALITY',
      city: 'Kolkata',
      isActive: true,
    } as any);
    const seededProject = await projectRepository.create({
      name: 'PP10C Persistence Test Project',
      slug: `pp10c-test-proj-${Date.now()}`,
      developerId: seededDev.id,
      locationId: seededLoc.id,
      status: 'READY_TO_MOVE',
      propertyType: 'RESIDENTIAL',
      shortDescription: 'Test project',
      description: 'Test project description',
      isPublished: true,
      lifecycleStatus: 'PUBLISHED',
      priceOnRequest: false,
    } as any);

    const testSecret = initializeTestRunnerSecret();
    const staffHeaders = {
      'Content-Type': 'application/json',
      'x-staff-role': 'SUPER_ADMIN',
      'x-staff-user': 'super-admin-user',
      'x-staff-email': 'superadmin@greathomes.in',
      'x-staff-test-token': testSecret,
      'x-test-isolated': 'true',
    };
    const dummyContext = { params: Promise.resolve({ id: seededProject.id }) };

    await withEnv(
      {
        NODE_ENV: 'development',
        VERCEL_ENV: 'preview',
        PERSISTENCE_PROVIDER: 'postgres',
        DATABASE_URL: undefined,
        ENABLE_SEEDING: 'false',
      },
      async () => {
        const routeChecks: Array<{ name: string; run: () => Promise<Response> }> = [
          {
            name: 'POST /api/resale/[id]/status',
            run: () =>
              postResaleStatusRoute(
                new NextRequest('http://localhost:3000/api/resale/listing_test_123/status', {
                  method: 'POST',
                  headers: staffHeaders,
                  body: JSON.stringify({ action: 'transition', status: 'PUBLISHED' }),
                }),
                dummyContext
              ),
          },
          {
            name: 'POST /api/rent/[id]/status',
            run: () =>
              postRentStatusRoute(
                new NextRequest('http://localhost:3000/api/rent/listing_test_123/status', {
                  method: 'POST',
                  headers: staffHeaders,
                  body: JSON.stringify({ action: 'transition', status: 'PUBLISHED' }),
                }),
                dummyContext
              ),
          },
          {
            name: 'GET /api/resale/[id]/media',
            run: () =>
              getResaleMediaRoute(
                new NextRequest('http://localhost:3000/api/resale/listing_test_123/media'),
                dummyContext
              ),
          },
          {
            name: 'POST /api/resale/[id]/media',
            run: () =>
              postResaleMediaRoute(
                new NextRequest('http://localhost:3000/api/resale/listing_test_123/media', {
                  method: 'POST',
                  headers: staffHeaders,
                  body: JSON.stringify({ url: 'https://example.com/a.jpg' }),
                }),
                dummyContext
              ),
          },
          {
            name: 'PATCH /api/resale/[id]/media',
            run: () =>
              patchResaleMediaRoute(
                new NextRequest('http://localhost:3000/api/resale/listing_test_123/media', {
                  method: 'PATCH',
                  headers: staffHeaders,
                  body: JSON.stringify({ items: [{ id: 'm1', sortOrder: 1 }] }),
                }),
                dummyContext
              ),
          },
          {
            name: 'GET /api/rent/[id]/media',
            run: () =>
              getRentMediaRoute(
                new NextRequest('http://localhost:3000/api/rent/listing_test_123/media'),
                dummyContext
              ),
          },
          {
            name: 'POST /api/rent/[id]/media',
            run: () =>
              postRentMediaRoute(
                new NextRequest('http://localhost:3000/api/rent/listing_test_123/media', {
                  method: 'POST',
                  headers: staffHeaders,
                  body: JSON.stringify({ url: 'https://example.com/a.jpg' }),
                }),
                dummyContext
              ),
          },
          {
            name: 'PATCH /api/rent/[id]/media',
            run: () =>
              patchRentMediaRoute(
                new NextRequest('http://localhost:3000/api/rent/listing_test_123/media', {
                  method: 'PATCH',
                  headers: staffHeaders,
                  body: JSON.stringify({ items: [{ id: 'm1', sortOrder: 1 }] }),
                }),
                dummyContext
              ),
          },
          {
            name: 'GET /api/resale/[id]/amenities',
            run: () =>
              getResaleAmenitiesRoute(
                new NextRequest('http://localhost:3000/api/resale/listing_test_123/amenities'),
                dummyContext
              ),
          },
          {
            name: 'POST /api/resale/[id]/amenities',
            run: () =>
              postResaleAmenitiesRoute(
                new NextRequest('http://localhost:3000/api/resale/listing_test_123/amenities', {
                  method: 'POST',
                  headers: staffHeaders,
                  body: JSON.stringify({ amenityId: 'am_1' }),
                }),
                dummyContext
              ),
          },
          {
            name: 'DELETE /api/resale/[id]/amenities',
            run: () =>
              deleteResaleAmenitiesRoute(
                new NextRequest('http://localhost:3000/api/resale/listing_test_123/amenities?amenityId=am_1', {
                  method: 'DELETE',
                  headers: staffHeaders,
                }),
                dummyContext
              ),
          },
          {
            name: 'GET /api/rent/[id]/amenities',
            run: () =>
              getRentAmenitiesRoute(
                new NextRequest('http://localhost:3000/api/rent/listing_test_123/amenities'),
                dummyContext
              ),
          },
          {
            name: 'POST /api/rent/[id]/amenities',
            run: () =>
              postRentAmenitiesRoute(
                new NextRequest('http://localhost:3000/api/rent/listing_test_123/amenities', {
                  method: 'POST',
                  headers: staffHeaders,
                  body: JSON.stringify({ amenityId: 'am_1' }),
                }),
                dummyContext
              ),
          },
          {
            name: 'DELETE /api/rent/[id]/amenities',
            run: () =>
              deleteRentAmenitiesRoute(
                new NextRequest('http://localhost:3000/api/rent/listing_test_123/amenities?amenityId=am_1', {
                  method: 'DELETE',
                  headers: staffHeaders,
                }),
                dummyContext
              ),
          },
          {
            name: 'PATCH /api/rent/[id]/lifecycle',
            run: () =>
              patchRentLifecycleRoute(
                new NextRequest('http://localhost:3000/api/rent/listing_test_123/lifecycle', {
                  method: 'PATCH',
                  headers: staffHeaders,
                  body: JSON.stringify({ lifecycleStatus: 'PUBLISHED' }),
                }),
                dummyContext
              ),
          },
          {
            name: 'PATCH /api/rent/[id]/verification',
            run: () =>
              patchRentVerificationRoute(
                new NextRequest('http://localhost:3000/api/rent/listing_test_123/verification', {
                  method: 'PATCH',
                  headers: staffHeaders,
                  body: JSON.stringify({ verificationStatus: 'VERIFIED' }),
                }),
                dummyContext
              ),
          },
          {
            name: 'GET /api/projects/[id]/resale',
            run: () =>
              getProjectResaleRoute(
                new NextRequest(`http://localhost:3000/api/projects/${seededProject.id}/resale`),
                dummyContext
              ),
          },
          {
            name: 'POST /api/projects/[id]/resale',
            run: () =>
              postProjectResaleRoute(
                new NextRequest(`http://localhost:3000/api/projects/${seededProject.id}/resale`, {
                  method: 'POST',
                  headers: staffHeaders,
                  body: JSON.stringify({
                    propertyType: 'APARTMENT',
                    configuration: '3 BHK',
                    bedroomCount: 3,
                    askingPrice: 12500000,
                    listingPartyType: 'OWNER',
                  }),
                }),
                dummyContext
              ),
          },
          {
            name: 'GET /api/projects/[id]/rent',
            run: () =>
              getProjectRentRoute(
                new NextRequest(`http://localhost:3000/api/projects/${seededProject.id}/rent`),
                dummyContext
              ),
          },
          {
            name: 'POST /api/projects/[id]/rent',
            run: () =>
              postProjectRentRoute(
                new NextRequest(`http://localhost:3000/api/projects/${seededProject.id}/rent`, {
                  method: 'POST',
                  headers: staffHeaders,
                  body: JSON.stringify({
                    propertyType: 'APARTMENT',
                    configuration: '3 BHK',
                    bedroomCount: 3,
                    monthlyRent: 45000,
                    furnishing: 'SEMI_FURNISHED',
                    listingPartyType: 'OWNER',
                  }),
                }),
                dummyContext
              ),
          },
          {
            name: 'GET /api/discovery/buy',
            run: () => getDiscoveryBuyRoute(new NextRequest('http://localhost:3000/api/discovery/buy')),
          },
          {
            name: 'GET /api/discovery/rent',
            run: () => getDiscoveryRentRoute(new NextRequest('http://localhost:3000/api/discovery/rent')),
          },
        ];

        for (const check of routeChecks) {
          const res = await check.run();
          assert.equal(res.status, 503, `Expected HTTP 503 from ${check.name}, got ${res.status}`);
          const body = await res.json();
          assert.equal(body.code, 'PERSISTENCE_UNAVAILABLE', `Expected PERSISTENCE_UNAVAILABLE from ${check.name}`);
        }
      }
    );
  });

  // --------------------------------------------------------------------------
  // SECTION 4: I-02 — STANDALONE SITE VISIT ATOMICITY & DURABLE IDEMPOTENCY
  // --------------------------------------------------------------------------
  console.log('\n--- I-02: Standalone POST /api/site-visits Atomicity & Server-Derived Idempotency ---');

  enquiryRepository.enableTestMemoryPersistence(true);
  siteVisitRepository.enableTestMemoryPersistence(true);
  enableTestMemoryRateLimit(true);

  await test('I-02.1: POST /api/site-visits returns 404 ENQUIRY_NOT_FOUND when parent enquiry does not exist and creates no orphan site visit', async () => {
    siteVisitRepository.clearMemoryForTesting();
    const res = await postSiteVisitsRoute(
      new NextRequest('http://localhost:3000/api/site-visits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-test-isolated': 'true' },
        body: JSON.stringify({
          enquiryId: 'enq_non_existent_999',
          visitType: 'IN_PERSON',
          preferredDate: '2026-12-25',
          preferredTimeWindow: '10:00 AM - 12:00 PM',
        }),
      })
    );
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.code, 'ENQUIRY_NOT_FOUND');
    assert.equal((await siteVisitRepository.list()).length, 0);
  });

  await test('I-02.2: Concurrent & duplicate standalone POST /api/site-visits calls create strictly 1 site visit, update parent enquiry atomically, and emit 1 audit log', async () => {
    enquiryRepository.clearMemoryForTesting();
    siteVisitRepository.clearMemoryForTesting();

    const parentEnquiry = await enquiryRepository.create({
      contextType: 'PROJECT',
      projectId: 'proj_sv_test',
      buyerName: 'Site Visit Buyer',
      buyerPhone: '+919830055667',
      preferredContact: 'WHATSAPP',
      requestSiteVisit: false,
    });

    const auditBefore = (await auditService.list({ resourceType: 'SITE_VISIT' })).total;

    const makeReq = () =>
      new NextRequest('http://localhost:3000/api/site-visits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enquiryId: parentEnquiry.id,
          projectId: 'proj_sv_test',
          visitType: 'IN_PERSON',
          preferredDate: '2026-12-28',
          preferredTimeWindow: '11:00 AM - 1:00 PM',
          notes: 'Please arrange parking',
          idempotencyKey: 'client-sv-key-1',
        }),
      });

    const [r1, r2, r3] = await Promise.all([
      postSiteVisitsRoute(makeReq()),
      postSiteVisitsRoute(makeReq()),
      postSiteVisitsRoute(makeReq()),
    ]);

    const bodies = await Promise.all([r1.json(), r2.json(), r3.json()]);
    const statuses = [r1.status, r2.status, r3.status].sort();
    assert.deepEqual(statuses, [200, 200, 201], 'Exactly one call must return 201 Created and duplicates 200 OK');

    const siteVisitIds = new Set(bodies.map((b) => b.siteVisit.id));
    assert.equal(siteVisitIds.size, 1, 'All duplicate calls must return the exact same siteVisit.id');

    const deduplicatedCount = bodies.filter((b) => b.deduplicated === true).length;
    assert.equal(deduplicatedCount, 2, 'Two of the three concurrent calls must be marked deduplicated=true');

    const updatedEnquiry = await enquiryRepository.findById(parentEnquiry.id);
    assert.equal(updatedEnquiry?.siteVisitId, bodies[0].siteVisit.id);
    assert.equal(updatedEnquiry?.status, 'SITE_VISIT_SCHEDULED');

    const auditAfter = (await auditService.list({ resourceType: 'SITE_VISIT' })).total;
    assert.equal(auditAfter - auditBefore, 1, 'CREATE_SITE_VISIT audit event must be emitted strictly once');
  });

  await test('I-02.3: Simulated PostgreSQL standalone site-visit transaction rolls back site_visits insert if enquiry update fails, and retry succeeds', async () => {
    const enqRow: any = {
      id: 'enq_pg_tx_1',
      siteVisitId: null,
      status: 'NEW',
      updatedAt: new Date(),
    };
    const svRows = new Map<string, any>();
    let failEnquiryUpdate = true;

    const simPgDb = {
      async transaction(fn: (tx: any) => Promise<any>) {
        const stagedSv = new Map(svRows);
        let stagedEnq = { ...enqRow };
        const tx = {
          select() {
            return {
              from(table: any) {
                const isSvTable = 'visitType' in table;
                return {
                  where() {
                    const rowsPromise = Promise.resolve(
                      isSvTable ? Array.from(stagedSv.values()) : [stagedEnq]
                    );
                    (rowsPromise as any).limit = async () =>
                      isSvTable ? Array.from(stagedSv.values()).slice(0, 1) : [stagedEnq];
                    return rowsPromise;
                  },
                };
              },
            };
          },
          insert() {
            return {
              values(val: any) {
                return {
                  async returning() {
                    if (stagedSv.has(val.id)) {
                      const err: any = new Error('duplicate key value violates unique constraint');
                      err.code = '23505';
                      throw err;
                    }
                    const row = { ...val, createdAt: new Date(), updatedAt: new Date() };
                    stagedSv.set(val.id, row);
                    return [row];
                  },
                };
              },
            };
          },
          update() {
            return {
              set(patch: any) {
                return {
                  where() {
                    return {
                      async returning() {
                        if (failEnquiryUpdate) {
                          throw new Error('Simulated enquiries UPDATE failure inside transaction');
                        }
                        stagedEnq = { ...stagedEnq, ...patch };
                        return [{ id: stagedEnq.id }];
                      },
                    };
                  },
                };
              },
            };
          },
        };
        const result = await fn(tx);
        // Commit staged changes only if transaction callback succeeded
        svRows.clear();
        for (const [k, v] of stagedSv.entries()) svRows.set(k, v);
        Object.assign(enqRow, stagedEnq);
        return result;
      },
    };

    const pgSvRepo = new SiteVisitRepositoryPostgres(() => simPgDb as any);
    const idempKey = deriveSiteVisitIdempotencyKey({
      enquiryId: 'enq_pg_tx_1',
      visitType: 'IN_PERSON',
      preferredDate: '2026-12-30',
      preferredTimeWindow: '3:00 PM - 5:00 PM',
    });

    // 1. First attempt fails during enquiry update -> transaction rolls back site_visits insert
    await assert.rejects(() =>
      pgSvRepo.createStandaloneTransactional({
        enquiryId: 'enq_pg_tx_1',
        visitType: 'IN_PERSON',
        preferredDate: '2026-12-30',
        preferredTimeWindow: '3:00 PM - 5:00 PM',
        idempotencyKey: idempKey,
      })
    );
    assert.equal(svRows.size, 0, 'site_visits table must have 0 rows after transaction rollback');
    assert.equal(enqRow.siteVisitId, null, 'enquiries.site_visit_id must remain null after rollback');

    // 2. Retry succeeds atomically
    failEnquiryUpdate = false;
    const retryRes = await pgSvRepo.createStandaloneTransactional({
      enquiryId: 'enq_pg_tx_1',
      visitType: 'IN_PERSON',
      preferredDate: '2026-12-30',
      preferredTimeWindow: '3:00 PM - 5:00 PM',
      idempotencyKey: idempKey,
    });
    assert.equal(retryRes.created, true);
    assert.equal(retryRes.siteVisit.id, deriveDeterministicSiteVisitId(idempKey));
    assert.equal(svRows.size, 1);
    assert.equal(enqRow.siteVisitId, retryRes.siteVisit.id);
    assert.equal(enqRow.status, 'SITE_VISIT_SCHEDULED');
  });

  // --------------------------------------------------------------------------
  // SECTION 5: CRM-01 — CRM STATUS ALIAS COMPATIBILITY (RECEIVED/NEW, IN_REVIEW/QUALIFIED)
  // --------------------------------------------------------------------------
  console.log('\n--- CRM-01: CRM Status Filter & Metrics Alias Compatibility ---');

  await test('CRM-01.1: Filtering by NEW or RECEIVED returns both NEW and RECEIVED enquiries, and QUALIFIED or IN_REVIEW returns both QUALIFIED and IN_REVIEW without mutating stored statuses', async () => {
    enquiryRepository.clearMemoryForTesting();

    const eNew = await enquiryRepository.create({
      contextType: 'GENERAL',
      buyerName: 'Buyer New',
      buyerPhone: '+919830000101',
      preferredContact: 'PHONE',
      requestSiteVisit: false,
    });
    const eReceived = await enquiryRepository.create({
      contextType: 'GENERAL',
      buyerName: 'Buyer Received Legacy',
      buyerPhone: '+919830000102',
      preferredContact: 'PHONE',
      requestSiteVisit: false,
    });
    await enquiryRepository.update(eReceived.id, { status: 'RECEIVED' });

    const eQualified = await enquiryRepository.create({
      contextType: 'GENERAL',
      buyerName: 'Buyer Qualified',
      buyerPhone: '+919830000103',
      preferredContact: 'PHONE',
      requestSiteVisit: false,
    });
    await enquiryRepository.update(eQualified.id, { status: 'QUALIFIED' });

    const eInReview = await enquiryRepository.create({
      contextType: 'GENERAL',
      buyerName: 'Buyer In Review Legacy',
      buyerPhone: '+919830000104',
      preferredContact: 'PHONE',
      requestSiteVisit: false,
    });
    await enquiryRepository.update(eInReview.id, { status: 'IN_REVIEW' });

    const listNew = await enquiryRepository.list({ status: 'NEW' });
    const listReceived = await enquiryRepository.list({ status: 'RECEIVED' });
    assert.equal(listNew.items.length, 2, 'list({ status: "NEW" }) must include both NEW and RECEIVED');
    assert.equal(listReceived.items.length, 2, 'list({ status: "RECEIVED" }) must include both NEW and RECEIVED');

    const listQualified = await enquiryRepository.list({ status: 'QUALIFIED' });
    const listInReview = await enquiryRepository.list({ status: 'IN_REVIEW' });
    assert.equal(listQualified.items.length, 2, 'list({ status: "QUALIFIED" }) must include both QUALIFIED and IN_REVIEW');
    assert.equal(listInReview.items.length, 2, 'list({ status: "IN_REVIEW" }) must include both QUALIFIED and IN_REVIEW');

    // Stored statuses must remain unmutated
    assert.equal((await enquiryRepository.findById(eNew.id))?.status, 'NEW');
    assert.equal((await enquiryRepository.findById(eReceived.id))?.status, 'RECEIVED');
    assert.equal((await enquiryRepository.findById(eQualified.id))?.status, 'QUALIFIED');
    assert.equal((await enquiryRepository.findById(eInReview.id))?.status, 'IN_REVIEW');

    // Metrics must match filtered list counts
    const metrics = await enquiryRepository.getMetrics();
    assert.equal(metrics.newCount, listNew.total);
    assert.equal(metrics.qualifiedCount, listQualified.total);
  });

  console.log('\n====================================================================');
  console.log(`PP-10C VERIFICATION SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('====================================================================');
  if (failed > 0) {
    process.exit(1);
  }
}

runPP10CTests().catch((err) => {
  console.error('PP-10C suite crashed:', err);
  process.exit(1);
});
