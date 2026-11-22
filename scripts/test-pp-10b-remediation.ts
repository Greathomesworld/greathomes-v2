import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { NextRequest } from 'next/server';

(process.env as Record<string, string | undefined>).NODE_ENV = 'test';
process.env.PERSISTENCE_PROVIDER = 'memory';

import {
  PersistenceUnavailableError,
  isPersistenceUnavailableError,
} from '../src/lib/persistenceGuard.ts';
import {
  GuardedResaleListingRepository,
  resaleListingRepository,
  ResaleListingRepositoryMemory,
} from '../src/domain/projects/repositories/resaleRepository.ts';
import {
  GuardedRentalListingRepository,
  rentalListingRepository,
  RentalListingRepositoryMemory,
} from '../src/domain/projects/repositories/rentalRepository.ts';
import { ResaleListingRepositoryPostgres } from '../src/infrastructure/repositories/postgres/resaleRepositoryPostgres.ts';
import { RentalListingRepositoryPostgres } from '../src/infrastructure/repositories/postgres/rentalRepositoryPostgres.ts';
import { EnquiryRepositoryPostgres } from '../src/infrastructure/repositories/postgres/enquiryRepositoryPostgres.ts';
import { EnquiryService } from '../src/domain/enquiry/services/enquiryService.ts';
import { enquiryRepository, EnquiryRepositoryMemory } from '../src/domain/enquiry/repositories/enquiryRepository.ts';
import { siteVisitRepository } from '../src/infrastructure/repositories/postgres/siteVisitRepositoryPostgres.ts';
import { notificationRepository } from '../src/domain/customer/repositories/index.ts';
import {
  extractRequestContext,
  extractTrustedClientIp,
  normalizeAndValidateIp,
} from '../src/lib/requestContext.ts';
import {
  checkRateLimit,
  createRateLimitResponse,
  createRateLimitUnavailableResponse,
  enableTestMemoryRateLimit,
  hashRateLimitKey,
  isRateLimitUnavailableError,
  resetRateLimitStoreForTesting,
  setRateLimitBucketExecutorForTesting,
  type RateLimitBucketExecutor,
} from '../src/lib/rateLimit.ts';
import { GET as getResaleRoute } from '../app/api/resale/route.ts';
import { GET as getResaleByIdRoute } from '../app/api/resale/[id]/route.ts';
import { GET as getRentRoute } from '../app/api/rent/route.ts';
import { GET as getRentByIdRoute } from '../app/api/rent/[id]/route.ts';
import { POST as postEnquiriesRoute } from '../app/api/enquiries/route.ts';
import { GET as getSearchRoute } from '../app/api/search/route.ts';
import { POST as postSiteVisitsRoute } from '../app/api/site-visits/route.ts';
import { POST as postTelemetryRoute } from '../app/api/telemetry/events/route.ts';
import { GET as getPlacesNearbyRoute } from '../app/api/places/nearby/route.ts';

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    passed++;
    console.log(`\x1b[32m✓\x1b[0m ${name}`);
  } catch (err: any) {
    failed++;
    console.error(`\x1b[31m✗\x1b[0m ${name}`);
    console.error('  ', err?.stack || err?.message || err);
  }
}

async function withEnv(
  overrides: Record<string, string | undefined>,
  fn: () => Promise<void> | void
) {
  const saved: Record<string, string | undefined> = {};
  for (const key of Object.keys(overrides)) {
    saved[key] = process.env[key];
    const val = overrides[key];
    if (val === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = val;
    }
  }
  try {
    await fn();
  } finally {
    for (const key of Object.keys(overrides)) {
      const val = saved[key];
      if (val === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = val;
      }
    }
  }
}

async function expectPersistenceUnavailable(fn: () => Promise<unknown>, context: string) {
  let caught: unknown = null;
  try {
    await fn();
  } catch (err) {
    caught = err;
  }
  assert.ok(caught, `Expected PersistenceUnavailableError (${context}), but operation resolved`);
  assert.equal(
    isPersistenceUnavailableError(caught),
    true,
    `Expected PersistenceUnavailableError (${context}), got ${(caught as any)?.name}: ${(caught as any)?.message}`
  );
  assert.equal((caught as PersistenceUnavailableError).statusCode, 503);
}

/**
 * Stateful simulated PostgreSQL transaction + partial unique index executor
 * for testing EnquiryRepositoryPostgres.createIdempotent across simulated instances.
 */
function createSimulatedPostgresEnquiryDb(options?: {
  failSiteVisitInsert?: boolean;
  force23505OnConflict?: boolean;
}) {
  const enquiryRows = new Map<string, any>();
  const siteVisitRows = new Map<string, any>();

  const clone = <T>(v: T): T => structuredClone(v);

  function extractColumnConditionValue(whereExpr: any): { field: 'id' | 'idempotencyKey' | null; value: string | null } {
    const chunks = whereExpr?.queryChunks;
    if (!Array.isArray(chunks)) return { field: null, value: null };
    let field: 'id' | 'idempotencyKey' | null = null;
    let value: string | null = null;
    for (const c of chunks) {
      if (c && typeof c === 'object' && 'name' in c) {
        if (c.name === 'idempotency_key') field = 'idempotencyKey';
        if (c.name === 'id') field = 'id';
      } else if (c && typeof c === 'object' && 'value' in c && !Array.isArray(c.value)) {
        value = String(c.value);
      }
    }
    return { field, value };
  }

  function makeExecutor(
    stageEnquiries: Map<string, any>,
    stageSiteVisits: Map<string, any>
  ) {
    return {
      select() {
        return {
          from(table: any) {
            return {
              where(expr: any) {
                const cond = extractColumnConditionValue(expr);
                const matches = () => {
                  const list = table === undefined ? [] : Array.from((stageSiteVisits && cond.field === 'id' && Array.from(stageSiteVisits.values()).some((s) => s.id === cond.value) ? stageSiteVisits : stageEnquiries).values());
                  if (cond.field === 'idempotencyKey') {
                    return Array.from(stageEnquiries.values())
                      .filter((r) => r.idempotencyKey === cond.value)
                      .map(clone);
                  }
                  if (cond.field === 'id') {
                    const sv = stageSiteVisits.get(cond.value || '');
                    if (sv) return [clone(sv)];
                    const enq = stageEnquiries.get(cond.value || '');
                    return enq ? [clone(enq)] : [];
                  }
                  return list.map(clone);
                };
                return {
                  limit(n: number) {
                    return Promise.resolve(matches().slice(0, n));
                  },
                  then(resolve: any, reject: any) {
                    return Promise.resolve(matches()).then(resolve, reject);
                  },
                };
              },
            };
          },
        };
      },
      insert(table: any) {
        return {
          values(vals: any) {
            const isSiteVisitTable = Boolean(vals && 'enquiryId' in vals && 'visitType' in vals);
            let onConflictMode = false;

            const executeInsert = async () => {
              if (isSiteVisitTable) {
                if (options?.failSiteVisitInsert) {
                  throw new Error('Simulated site_visits constraint failure');
                }
                const now = new Date();
                const row = { ...vals, createdAt: now, updatedAt: now };
                stageSiteVisits.set(row.id, clone(row));
                return [clone(row)];
              }

              // Enquiries table with partial unique index uq_enquiries_idempotency_key
              if (vals.idempotencyKey !== null && vals.idempotencyKey !== undefined) {
                const duplicate = Array.from(stageEnquiries.values()).find(
                  (r) => r.idempotencyKey === vals.idempotencyKey
                );
                if (duplicate) {
                  if (options?.force23505OnConflict || !onConflictMode) {
                    const err: any = new Error(
                      'duplicate key value violates unique constraint "uq_enquiries_idempotency_key"'
                    );
                    err.code = '23505';
                    throw err;
                  }
                  return [];
                }
              }

              const now = new Date();
              const row = { ...vals, createdAt: now, updatedAt: now };
              stageEnquiries.set(row.id, clone(row));
              return [clone(row)];
            };

            const chain: any = {
              onConflictDoNothing() {
                onConflictMode = true;
                return chain;
              },
              returning() {
                return executeInsert();
              },
              then(resolve: any, reject: any) {
                return executeInsert().then(resolve, reject);
              },
            };
            return chain;
          },
        };
      },
      update() {
        return {
          set(patch: any) {
            return {
              where(expr: any) {
                const cond = extractColumnConditionValue(expr);
                const runUpdate = async () => {
                  const target = cond.value ? stageEnquiries.get(cond.value) : null;
                  if (!target) return [];
                  const updated = { ...target, ...patch };
                  stageEnquiries.set(updated.id, clone(updated));
                  return [clone(updated)];
                };
                return {
                  returning() {
                    return runUpdate();
                  },
                  then(resolve: any, reject: any) {
                    return runUpdate().then(resolve, reject);
                  },
                };
              },
            };
          },
        };
      },
    };
  }

  let txChain = Promise.resolve();

  const dbApi: any = {
    ...makeExecutor(enquiryRows, siteVisitRows),
    transaction(fn: (tx: any) => Promise<any>) {
      // Serialize transaction execution cleanly with snapshot rollback on failure
      const run = txChain.then(async () => {
        const txEnq = new Map<string, any>();
        for (const [k, v] of enquiryRows.entries()) txEnq.set(k, clone(v));
        const txSv = new Map<string, any>();
        for (const [k, v] of siteVisitRows.entries()) txSv.set(k, clone(v));
        const txExec = makeExecutor(txEnq, txSv);
        const result = await fn(txExec);
        // Commit only if fn resolves without throwing
        enquiryRows.clear();
        for (const [k, v] of txEnq.entries()) enquiryRows.set(k, v);
        siteVisitRows.clear();
        for (const [k, v] of txSv.entries()) siteVisitRows.set(k, v);
        return result;
      });
      txChain = run.then(
        () => undefined,
        () => undefined
      );
      return run;
    },
    _enquiryRows: enquiryRows,
    _siteVisitRows: siteVisitRows,
  };

  return dbApi;
}

async function runTests() {
  console.log('====================================================================');
  console.log('GREAT HOMES V2 — PP-10B REMEDIATION VERIFICATION SUITE');
  console.log('====================================================================\n');

  // --------------------------------------------------------------------------
  // MIGRATION & SCHEMA ARTIFACT VERIFICATION
  // --------------------------------------------------------------------------
  await test('MIG.1: Forward-only SQL migration file 0010 exists and defines idempotency + rate limit DDL', () => {
    const migrationPath = path.resolve(
      process.cwd(),
      'drizzle/0010_pp10b_enquiry_idempotency_and_rate_limits.sql'
    );
    assert.ok(fs.existsSync(migrationPath), 'Expected forward-only SQL migration file 0010');
    const sqlText = fs.readFileSync(migrationPath, 'utf8');
    assert.match(sqlText, /ADD COLUMN IF NOT EXISTS "idempotency_key"/);
    assert.match(sqlText, /uq_enquiries_idempotency_key/);
    assert.match(sqlText, /WHERE "idempotency_key" IS NOT NULL/);
    assert.match(sqlText, /CREATE TABLE IF NOT EXISTS "rate_limit_buckets"/);
    assert.match(sqlText, /idx_rate_limit_buckets_expires_at/);
  });

  await test('MIG.2: .env.example documents TRUSTED_PROXY_COUNT', () => {
    const envExample = fs.readFileSync(path.resolve(process.cwd(), '.env.example'), 'utf8');
    assert.match(envExample, /TRUSTED_PROXY_COUNT=/);
  });

  // --------------------------------------------------------------------------
  // REMEDIATION A: FAIL-CLOSED PERSISTENCE GUARDS (RESALE & RENTAL)
  // --------------------------------------------------------------------------
  console.log('\n--- Remediation A: Fail-Closed Persistence Guards ---');

  await test('A.1: Unset PERSISTENCE_PROVIDER without DB fails closed with 503 in development and test (no silent memory fallback)', async () => {
    for (const envName of ['development', 'test']) {
      await withEnv(
        {
          NODE_ENV: envName,
          VERCEL_ENV: undefined,
          PERSISTENCE_PROVIDER: undefined,
          DATABASE_URL: undefined,
        },
        async () => {
          const rRepo = new GuardedResaleListingRepository({ dbResolver: () => null });
          const nRepo = new GuardedRentalListingRepository({ dbResolver: () => null });
          await expectPersistenceUnavailable(() => rRepo.findAll(), `resale/${envName}/unset`);
          await expectPersistenceUnavailable(() => nRepo.findAll(), `rental/${envName}/unset`);
        }
      );
    }
  });

  await test('A.2: Unsupported PERSISTENCE_PROVIDER="redis" rejects with 503', async () => {
    await withEnv({ NODE_ENV: 'test', PERSISTENCE_PROVIDER: 'redis', DATABASE_URL: undefined }, async () => {
      const rRepo = new GuardedResaleListingRepository({ dbResolver: () => null });
      const nRepo = new GuardedRentalListingRepository({ dbResolver: () => null });
      await expectPersistenceUnavailable(() => rRepo.findById('any'), 'resale/redis');
      await expectPersistenceUnavailable(() => nRepo.findById('any'), 'rental/redis');
    });
  });

  await test('A.3: PERSISTENCE_PROVIDER="memory" in NODE_ENV=test WITHOUT opt-in fails closed with 503', async () => {
    await withEnv({ NODE_ENV: 'test', PERSISTENCE_PROVIDER: 'memory', DATABASE_URL: undefined }, async () => {
      const rRepo = new GuardedResaleListingRepository({ dbResolver: () => null });
      const nRepo = new GuardedRentalListingRepository({ dbResolver: () => null });
      await expectPersistenceUnavailable(() => rRepo.findAll(), 'resale/no-opt-in');
      await expectPersistenceUnavailable(() => nRepo.findAll(), 'rental/no-opt-in');
    });
  });

  await test('A.4: Preview and Production reject memory persistence and disallow enableTestMemoryPersistence', async () => {
    for (const envCombo of [
      { NODE_ENV: 'production', VERCEL_ENV: 'preview', PERSISTENCE_PROVIDER: 'memory' },
      { NODE_ENV: 'production', VERCEL_ENV: 'production', PERSISTENCE_PROVIDER: 'memory' },
      { NODE_ENV: 'production', VERCEL_ENV: undefined, PERSISTENCE_PROVIDER: undefined },
      { NODE_ENV: 'test', VERCEL_ENV: 'preview', PERSISTENCE_PROVIDER: 'memory' },
    ]) {
      await withEnv({ ...envCombo, DATABASE_URL: undefined }, async () => {
        const rRepo = new GuardedResaleListingRepository({ dbResolver: () => null });
        const nRepo = new GuardedRentalListingRepository({ dbResolver: () => null });
        assert.throws(() => rRepo.enableTestMemoryPersistence(true), isPersistenceUnavailableError);
        assert.throws(() => nRepo.enableTestMemoryPersistence(true), isPersistenceUnavailableError);
        assert.throws(
          () => GuardedResaleListingRepository.createForTesting({ dbResolver: () => null }),
          isPersistenceUnavailableError
        );
        assert.throws(
          () => GuardedRentalListingRepository.createForTesting({ dbResolver: () => null }),
          isPersistenceUnavailableError
        );
        await expectPersistenceUnavailable(() => rRepo.findAll(), `resale/${JSON.stringify(envCombo)}`);
        await expectPersistenceUnavailable(() => nRepo.findAll(), `rental/${JSON.stringify(envCombo)}`);
      });
    }
  });

  await test('A.5: PERSISTENCE_PROVIDER="postgres" without DB fails closed 503 even if test memory opt-in enabled', async () => {
    await withEnv({ NODE_ENV: 'test', VERCEL_ENV: undefined, PERSISTENCE_PROVIDER: 'memory', DATABASE_URL: undefined }, async () => {
      const rRepo = GuardedResaleListingRepository.createForTesting({ dbResolver: () => null });
      const nRepo = GuardedRentalListingRepository.createForTesting({ dbResolver: () => null });

      process.env.PERSISTENCE_PROVIDER = 'postgres';
      await expectPersistenceUnavailable(() => rRepo.findAll(), 'resale/explicit-pg-no-db');
      await expectPersistenceUnavailable(() => nRepo.findAll(), 'rental/explicit-pg-no-db');
    });
  });

  await test('A.6: Direct ResaleListingRepositoryMemory / RentalListingRepositoryMemory constructor rejected outside NODE_ENV=test', async () => {
    await withEnv({ NODE_ENV: 'development', VERCEL_ENV: undefined, PERSISTENCE_PROVIDER: 'memory' }, async () => {
      assert.throws(() => new ResaleListingRepositoryMemory(), isPersistenceUnavailableError);
      assert.throws(() => new RentalListingRepositoryMemory(), isPersistenceUnavailableError);
    });
  });

  await test('A.7: Postgres repositories throw 503 when DB is null (never silent null/[]) and sanitize connection credentials', async () => {
    const nullResalePg = new ResaleListingRepositoryPostgres(() => null);
    const nullRentalPg = new RentalListingRepositoryPostgres(() => null);
    await expectPersistenceUnavailable(() => nullResalePg.findAll(), 'ResalePG.findAll');
    await expectPersistenceUnavailable(() => nullResalePg.findById('x'), 'ResalePG.findById');
    await expectPersistenceUnavailable(() => nullRentalPg.findAll(), 'RentalPG.findAll');
    await expectPersistenceUnavailable(() => nullRentalPg.findBySlug('x'), 'RentalPG.findBySlug');

    const secretThrowingDb: any = {
      select() {
        throw new Error('password authentication failed for postgres://admin:SuperSecretPass99@db.neon.tech/prod');
      },
    };
    const faultyResalePg = new ResaleListingRepositoryPostgres(() => secretThrowingDb);
    const faultyRentalPg = new RentalListingRepositoryPostgres(() => secretThrowingDb);

    for (const op of [() => faultyResalePg.findAll(), () => faultyRentalPg.findAll()]) {
      let caught: any = null;
      try {
        await op();
      } catch (e) {
        caught = e;
      }
      assert.equal(isPersistenceUnavailableError(caught), true);
      assert.equal(caught.statusCode, 503);
      assert.ok(!caught.message.includes('SuperSecretPass99'), 'Database secret leaked in error message');
      assert.ok(!caught.message.includes('postgres://'), 'Connection URI leaked in error message');
    }
  });

  await test('A.8: Public /api/resale and /api/rent routes return HTTP 503 when persistence is unavailable', async () => {
    await withEnv(
      { NODE_ENV: 'production', VERCEL_ENV: 'preview', PERSISTENCE_PROVIDER: 'postgres', DATABASE_URL: undefined },
      async () => {
        const res1 = await getResaleRoute(new NextRequest('http://localhost:3000/api/resale'));
        assert.equal(res1.status, 503);
        const body1 = await res1.json();
        assert.equal(body1.code, 'PERSISTENCE_UNAVAILABLE');

        const res2 = await getResaleByIdRoute(
          new NextRequest('http://localhost:3000/api/resale/some-slug'),
          { params: Promise.resolve({ id: 'some-slug' }) }
        );
        assert.equal(res2.status, 503);

        const res3 = await getRentRoute(new NextRequest('http://localhost:3000/api/rent'));
        assert.equal(res3.status, 503);

        const res4 = await getRentByIdRoute(
          new NextRequest('http://localhost:3000/api/rent/some-slug'),
          { params: Promise.resolve({ id: 'some-slug' }) }
        );
        assert.equal(res4.status, 503);
      }
    );
  });

  await test('A.9: Explicit test opt-in works cleanly when NODE_ENV=test and PERSISTENCE_PROVIDER=memory', async () => {
    await withEnv({ NODE_ENV: 'test', VERCEL_ENV: undefined, PERSISTENCE_PROVIDER: 'memory' }, async () => {
      resaleListingRepository.enableTestMemoryPersistence(true);
      rentalListingRepository.enableTestMemoryPersistence(true);
      const list = await resaleListingRepository.findAll();
      assert.ok(Array.isArray(list));
      const rList = await rentalListingRepository.findAll();
      assert.ok(Array.isArray(rList));
    });
  });

  // --------------------------------------------------------------------------
  // REMEDIATION B: DURABLE ENQUIRY IDEMPOTENCY & TRANSACTIONAL SITE VISITS
  // --------------------------------------------------------------------------
  console.log('\n--- Remediation B: Durable DB-Level Enquiry Idempotency ---');

  await test('B.1: EnquiryService computes server-derived SHA-256 idempotency key & isolates actors/phones/targets', async () => {
    const memEnqRepo = new EnquiryRepositoryMemory();
    const svc = new EnquiryService(
      memEnqRepo,
      undefined,
      undefined,
      undefined,
      resaleListingRepository,
      rentalListingRepository
    );

    const r1 = await svc.submitEnquiry({
      contextType: 'GENERAL',
      name: 'Buyer One',
      phone: '9830011223',
      idempotencyKey: 'shared-client-key-001',
    });
    assert.equal(r1.success, true);
    assert.equal(r1.deduplicated, false);

    // Same actor/phone/target + same client key -> replay
    const r1Replay = await svc.submitEnquiry({
      contextType: 'GENERAL',
      name: 'Buyer One',
      phone: '9830011223',
      idempotencyKey: 'shared-client-key-001',
    });
    assert.equal(r1Replay.enquiryId, r1.enquiryId);
    assert.equal(r1Replay.referenceNumber, r1.referenceNumber);
    assert.equal(r1Replay.deduplicated, true);

    // Different phone using the EXACT SAME client key MUST NOT collide!
    const r2 = await svc.submitEnquiry({
      contextType: 'GENERAL',
      name: 'Buyer Two',
      phone: '9830099887',
      idempotencyKey: 'shared-client-key-001',
    });
    assert.notEqual(r2.enquiryId, r1.enquiryId);
    assert.equal(r2.deduplicated, false);

    // Stored idempotency key is a 64-char SHA-256 hex digest (not raw client string)
    const stored = await memEnqRepo.findById(r1.enquiryId!);
    assert.ok(stored?.idempotencyKey);
    assert.equal(stored!.idempotencyKey!.length, 64);
    assert.notEqual(stored!.idempotencyKey, 'shared-client-key-001');
  });

  await test('B.2: Multi-instance concurrent burst against PostgreSQL ON CONFLICT DO NOTHING produces strictly 1 enquiry, 1 site visit, and 1 notification', async () => {
    const simDb = createSimulatedPostgresEnquiryDb();
    const pgRepoA = new EnquiryRepositoryPostgres(async () => simDb as any);
    const pgRepoB = new EnquiryRepositoryPostgres(async () => simDb as any);
    const svcA = new EnquiryService(pgRepoA, undefined, undefined, undefined, resaleListingRepository, rentalListingRepository);
    const svcB = new EnquiryService(pgRepoB, undefined, undefined, undefined, resaleListingRepository, rentalListingRepository);

    const customerId = 'cust_pp10b_conc_' + Date.now();
    const beforeNotifs = (await notificationRepository.listByCustomer(customerId, { limit: 50 })).length;

    const dto = {
      contextType: 'GENERAL' as const,
      name: 'Concurrent Buyer',
      phone: '9831122334',
      customerId,
      requestSiteVisit: true,
      visitType: 'IN_PERSON' as const,
      preferredDate: '2026-12-20',
      preferredTimeWindow: '10:00 AM - 12:00 PM',
      idempotencyKey: 'burst-key-pp10b',
    };

    // Bypass local inFlight mutex by alternating two service instances + direct repo createIdempotent
    const [resA, resB, resC, resD] = await Promise.all([
      svcA.submitEnquiry(dto),
      svcB.submitEnquiry(dto),
      svcA.submitEnquiry(dto),
      svcB.submitEnquiry(dto),
    ]);

    const ids = new Set([resA.enquiryId, resB.enquiryId, resC.enquiryId, resD.enquiryId]);
    assert.equal(ids.size, 1, 'Expected all concurrent multi-instance calls to resolve to 1 enquiryId');
    assert.equal(simDb._enquiryRows.size, 1, 'Expected strictly 1 row in enquiries table');
    assert.equal(simDb._siteVisitRows.size, 1, 'Expected strictly 1 row in site_visits table');

    const createdFlags = [resA, resB, resC, resD].filter((r) => r.deduplicated === false);
    assert.equal(createdFlags.length, 1, 'Exactly one caller should observe created / deduplicated=false');

    const afterNotifs = (await notificationRepository.listByCustomer(customerId, { limit: 50 })).length;
    assert.equal(afterNotifs - beforeNotifs, 1, 'Expected strictly 1 customer notification across duplicate burst');
  });

  await test('B.3: PostgreSQL SQLSTATE 23505 race fallback recovers existing enquiry without creating duplicate', async () => {
    const simDb = createSimulatedPostgresEnquiryDb({ force23505OnConflict: true });
    const pgRepo = new EnquiryRepositoryPostgres(async () => simDb as any);

    const first = await pgRepo.createIdempotent(
      {
        contextType: 'GENERAL',
        buyerName: 'Race Tester',
        buyerPhone: '+919831000011',
        preferredContact: 'WHATSAPP',
        requestSiteVisit: false,
        idempotencyKey: 'race_sha256_key_1',
      },
      { siteVisit: null }
    );
    assert.equal(first.created, true);

    const second = await pgRepo.createIdempotent(
      {
        contextType: 'GENERAL',
        buyerName: 'Race Tester',
        buyerPhone: '+919831000011',
        preferredContact: 'WHATSAPP',
        requestSiteVisit: false,
        idempotencyKey: 'race_sha256_key_1',
      },
      { siteVisit: null }
    );
    assert.equal(second.created, false);
    assert.equal(second.enquiry.id, first.enquiry.id);
    assert.equal(simDb._enquiryRows.size, 1);
  });

  await test('B.4: Site visit insert failure rolls back entire PostgreSQL enquiry transaction (no orphaned idempotency_key) and retry succeeds', async () => {
    let shouldFail = true;
    const simDb = createSimulatedPostgresEnquiryDb();
    // Wrap tx insert dynamically to simulate transient failure on first attempt
    const origTx = simDb.transaction.bind(simDb);
    simDb.transaction = (fn: (tx: any) => Promise<any>) =>
      origTx(async (tx: any) => {
        const origInsert = tx.insert.bind(tx);
        tx.insert = (table: any) => {
          const builder = origInsert(table);
          const origValues = builder.values.bind(builder);
          builder.values = (vals: any) => {
            if (shouldFail && vals && 'enquiryId' in vals && 'visitType' in vals) {
              return {
                returning: async () => {
                  throw new Error('Simulated downstream site_visits failure');
                },
                then: (_res: any, rej: any) => Promise.reject(new Error('Simulated downstream site_visits failure')).then(_res, rej),
              };
            }
            return origValues(vals);
          };
          return builder;
        };
        return fn(tx);
      });

    const pgRepo = new EnquiryRepositoryPostgres(async () => simDb as any);
    const svc = new EnquiryService(pgRepo, undefined, undefined, undefined, resaleListingRepository, rentalListingRepository);
    const customerId = 'cust_pp10b_rollback_' + Date.now();

    await assert.rejects(() =>
      svc.submitEnquiry({
        contextType: 'GENERAL',
        name: 'Rollback Buyer',
        phone: '9831144556',
        customerId,
        requestSiteVisit: true,
        preferredDate: '2026-12-22',
        preferredTimeWindow: '2:00 PM - 4:00 PM',
        idempotencyKey: 'rollback-retry-key',
      })
    );

    assert.equal(simDb._enquiryRows.size, 0, 'Enquiry row must roll back completely on site visit failure');
    assert.equal(simDb._siteVisitRows.size, 0);
    assert.equal(
      (await notificationRepository.listByCustomer(customerId, { limit: 10 })).length,
      0,
      'Zero notifications should be emitted when transaction rolls back'
    );

    // Retry after transient fault resolves
    shouldFail = false;
    const retryRes = await svc.submitEnquiry({
      contextType: 'GENERAL',
      name: 'Rollback Buyer',
      phone: '9831144556',
      customerId,
      requestSiteVisit: true,
      preferredDate: '2026-12-22',
      preferredTimeWindow: '2:00 PM - 4:00 PM',
      idempotencyKey: 'rollback-retry-key',
    });
    assert.equal(retryRes.success, true);
    assert.equal(retryRes.deduplicated, false);
    assert.ok(retryRes.siteVisitId);
    assert.equal(simDb._enquiryRows.size, 1);
    assert.equal(simDb._siteVisitRows.size, 1);
  });

  await test('B.5: Historical enquiries with idempotencyKey=null coexist without partial index conflict', async () => {
    const simDb = createSimulatedPostgresEnquiryDb();
    const pgRepo = new EnquiryRepositoryPostgres(async () => simDb as any);

    const h1 = await pgRepo.create({
      contextType: 'GENERAL',
      buyerName: 'Historical 1',
      buyerPhone: '+919830000001',
      preferredContact: 'PHONE',
      requestSiteVisit: false,
      idempotencyKey: null,
    });
    const h2 = await pgRepo.create({
      contextType: 'GENERAL',
      buyerName: 'Historical 2',
      buyerPhone: '+919830000002',
      preferredContact: 'PHONE',
      requestSiteVisit: false,
      idempotencyKey: null,
    });
    assert.notEqual(h1.id, h2.id);
    assert.equal(simDb._enquiryRows.size, 2);
  });

  // --------------------------------------------------------------------------
  // REMEDIATION C: DISTRIBUTED RATE LIMITING & TRUSTED IP EXTRACTION
  // --------------------------------------------------------------------------
  console.log('\n--- Remediation C: Distributed Rate Limiting & Hardened IP Extraction ---');

  await test('C.1: extractTrustedClientIp ignores forged leftmost X-Forwarded-For under TRUSTED_PROXY_COUNT=1', async () => {
    await withEnv(
      {
        TRUSTED_PROXY_COUNT: '1',
        TRUST_VERCEL_PROXY: 'true',
        VERCEL: '1',
        VERCEL_ENV: 'preview',
        VERCEL_EDGE_INGRESS_ENFORCED: 'true',
      },
      () => {
        const headers = new Headers({
          'x-vercel-id': 'bom1::test',
          'x-vercel-forwarded-for': '1.2.3.4, 198.51.100.77',
        });
        assert.equal(extractTrustedClientIp(headers), '198.51.100.77');

        const twoProxyHeaders = new Headers({
          'x-vercel-id': 'bom1::test',
          'x-vercel-forwarded-for': '9.9.9.9, 203.0.113.55, 70.41.3.18',
        });
        process.env.TRUSTED_PROXY_COUNT = '2';
        assert.equal(extractTrustedClientIp(twoProxyHeaders), '203.0.113.55');
      }
    );
  });

  await test('C.2: TRUSTED_PROXY_COUNT=0 ignores proxy forwarding headers completely', async () => {
    await withEnv({ TRUSTED_PROXY_COUNT: '0' }, () => {
      const headers = new Headers({
        'x-forwarded-for': '203.0.113.195',
        'x-real-ip': '198.51.100.10',
      });
      assert.equal(extractTrustedClientIp(headers), null);
    });
  });

  await test('C.3: normalizeAndValidateIp rejects spoofed non-IP payloads and normalizes IPv4-mapped IPv6', () => {
    assert.equal(normalizeAndValidateIp('::ffff:198.51.100.25'), '198.51.100.25');
    assert.equal(normalizeAndValidateIp('2001:db8::1'), '2001:db8::1');
    assert.equal(normalizeAndValidateIp('spoofed<script>alert(1)</script>'), null);
    assert.equal(normalizeAndValidateIp('unknown'), null);
    assert.equal(normalizeAndValidateIp('999.999.999.999'), null);

    const req = new Request('http://localhost:3000/api/enquiries', {
      headers: { 'x-forwarded-for': 'spoofed<script>, not-an-ip' },
    });
    assert.equal(extractRequestContext(req).ipAddress, null);
  });

  await test('C.4: Raw rate-limit keys are SHA-256 hashed so raw IPs are never stored in bucket IDs', async () => {
    const rawKey = 'enquiry_post_198.51.100.88';
    const hashed = hashRateLimitKey(rawKey);
    assert.ok(hashed.startsWith('rl_'));
    assert.equal(hashed.length, 67);
    assert.ok(!hashed.includes('198.51.100.88'));

    const seenIds: string[] = [];
    const mockExecutor: RateLimitBucketExecutor = {
      async consumeBucket(bucketId, _limit, windowMs) {
        seenIds.push(bucketId);
        return { requestCount: 1, expiresAtMs: Date.now() + windowMs };
      },
    };
    resetRateLimitStoreForTesting();
    setRateLimitBucketExecutorForTesting(mockExecutor);
    try {
      await withEnv({ PERSISTENCE_PROVIDER: 'postgres' }, async () => {
        await checkRateLimit(rawKey, 100, 60000);
        assert.equal(seenIds[0], hashed);
      });
    } finally {
      resetRateLimitStoreForTesting();
    }
  });

  await test('C.5: Multi-instance concurrent 120-request burst against simulated shared atomic PG rate_limit_buckets allows strictly 100 and blocks 20', async () => {
    const sharedBuckets = new Map<string, { count: number; expiresAtMs: number }>();
    const atomicPgExecutor: RateLimitBucketExecutor = {
      async consumeBucket(bucketId, limit, windowMs) {
        const now = Date.now();
        const existing = sharedBuckets.get(bucketId);
        if (!existing || existing.expiresAtMs <= now) {
          const next = { count: 1, expiresAtMs: now + windowMs };
          sharedBuckets.set(bucketId, next);
          return { requestCount: next.count, expiresAtMs: next.expiresAtMs };
        }
        existing.count = Math.min(existing.count + 1, limit + 1);
        return { requestCount: existing.count, expiresAtMs: existing.expiresAtMs };
      },
    };

    resetRateLimitStoreForTesting();
    setRateLimitBucketExecutorForTesting(atomicPgExecutor);
    try {
      await withEnv({ PERSISTENCE_PROVIDER: 'postgres' }, async () => {
        const results = await Promise.all(
          Array.from({ length: 120 }).map(() => checkRateLimit('enquiry_post_203.0.113.50', 100, 60000))
        );
        const allowedCount = results.filter((r) => r.allowed).length;
        const blockedCount = results.filter((r) => !r.allowed).length;
        assert.equal(allowedCount, 100, `Expected 100 allowed requests, got ${allowedCount}`);
        assert.equal(blockedCount, 20, `Expected 20 blocked requests, got ${blockedCount}`);

        const res429 = createRateLimitResponse('req_pp10b_429', results[119]);
        assert.equal(res429.status, 429);
        assert.equal(res429.headers.get('X-RateLimit-Limit'), '100');
        assert.equal(res429.headers.get('X-RateLimit-Remaining'), '0');
        assert.ok(Number(res429.headers.get('Retry-After')) >= 1);
      });
    } finally {
      resetRateLimitStoreForTesting();
    }
  });

  await test('C.6: Rate limit window expiry resets counter cleanly in shared store', async () => {
    const sharedBuckets = new Map<string, { count: number; expiresAtMs: number }>();
    const atomicPgExecutor: RateLimitBucketExecutor = {
      async consumeBucket(bucketId, limit, windowMs) {
        const now = Date.now();
        const existing = sharedBuckets.get(bucketId);
        if (!existing || existing.expiresAtMs <= now) {
          const next = { count: 1, expiresAtMs: now + windowMs };
          sharedBuckets.set(bucketId, next);
          return { requestCount: next.count, expiresAtMs: next.expiresAtMs };
        }
        existing.count = Math.min(existing.count + 1, limit + 1);
        return { requestCount: existing.count, expiresAtMs: existing.expiresAtMs };
      },
    };

    resetRateLimitStoreForTesting();
    setRateLimitBucketExecutorForTesting(atomicPgExecutor);
    try {
      await withEnv({ PERSISTENCE_PROVIDER: 'postgres' }, async () => {
        const r1 = await checkRateLimit('reset_test_ip', 1, 20);
        const r2 = await checkRateLimit('reset_test_ip', 1, 20);
        assert.equal(r1.allowed, true);
        assert.equal(r2.allowed, false);

        await new Promise((r) => setTimeout(r, 35));
        const r3 = await checkRateLimit('reset_test_ip', 1, 20);
        assert.equal(r3.allowed, true);
        assert.equal(r3.remaining, 0);
      });
    } finally {
      resetRateLimitStoreForTesting();
    }
  });

  await test('C.7: Rate limiter fails closed (HTTP 503) in Preview/Prod/explicit-postgres and on PG outage (never falls back to Map)', async () => {
    resetRateLimitStoreForTesting();
    // 1. Outage in shared PG executor -> fail closed
    setRateLimitBucketExecutorForTesting({
      async consumeBucket() {
        throw new Error('PG connection timeout');
      },
    });
    let err1: unknown = null;
    try {
      await checkRateLimit('outage_key', 100, 60000);
    } catch (e) {
      err1 = e;
    }
    assert.equal(isRateLimitUnavailableError(err1), true);
    resetRateLimitStoreForTesting();

    // 2. Preview/Production/explicit postgres without DB -> fail closed even if test memory flag toggled
    for (const envCombo of [
      { NODE_ENV: 'production', VERCEL_ENV: 'preview', PERSISTENCE_PROVIDER: 'postgres' },
      { NODE_ENV: 'production', VERCEL_ENV: 'production', PERSISTENCE_PROVIDER: 'postgres' },
      { NODE_ENV: 'test', VERCEL_ENV: undefined, PERSISTENCE_PROVIDER: 'postgres' },
    ]) {
      await withEnv({ ...envCombo, DATABASE_URL: undefined }, async () => {
        enableTestMemoryRateLimit(true);
        let caught: unknown = null;
        try {
          await checkRateLimit('fail_closed_key', 100, 60000);
        } catch (e) {
          caught = e;
        }
        assert.equal(
          isRateLimitUnavailableError(caught),
          true,
          `Expected 503 RateLimitUnavailableError for ${JSON.stringify(envCombo)}`
        );
      });
    }

    const r503 = createRateLimitUnavailableResponse('req_503');
    assert.equal(r503.status, 503);
    assert.equal((await r503.json()).code, 'RATE_LIMIT_UNAVAILABLE');
  });

  await test('C.8: All rate-limited API routes fail closed with HTTP 503 when distributed limiter fails', async () => {
    resetRateLimitStoreForTesting();
    setRateLimitBucketExecutorForTesting({
      async consumeBucket() {
        throw new Error('DB down');
      },
    });
    try {
      const rEnq = await postEnquiriesRoute(
        new NextRequest('http://localhost:3000/api/enquiries', {
          method: 'POST',
          body: JSON.stringify({ name: 'A', phone: '9830011223', contextType: 'GENERAL' }),
        })
      );
      assert.equal(rEnq.status, 503);

      const rSearch = await getSearchRoute(new NextRequest('http://localhost:3000/api/search?q=merlin'));
      assert.equal(rSearch.status, 503);

      const rVisit = await postSiteVisitsRoute(
        new NextRequest('http://localhost:3000/api/site-visits', {
          method: 'POST',
          body: JSON.stringify({}),
        })
      );
      assert.equal(rVisit.status, 503);

      const rTel = await postTelemetryRoute(
        new NextRequest('http://localhost:3000/api/telemetry/events', {
          method: 'POST',
          body: JSON.stringify({}),
        })
      );
      assert.equal(rTel.status, 503);

      const rPlaces = await getPlacesNearbyRoute(
        new NextRequest('http://localhost:3000/api/places/nearby?lat=22.57&lng=88.36')
      );
      assert.equal(rPlaces.status, 503);
    } finally {
      resetRateLimitStoreForTesting();
    }
  });

  console.log('\n====================================================================');
  console.log(`PP-10B VERIFICATION SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('====================================================================');
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('PP-10B suite crashed:', err);
  process.exit(1);
});
