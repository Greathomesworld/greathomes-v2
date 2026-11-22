import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { NextRequest } from 'next/server';

(process.env as Record<string, string | undefined>).NODE_ENV = 'test';
process.env.PERSISTENCE_PROVIDER = 'memory';
process.env.DATABASE_URL = '';

import {
  isPersistenceUnavailableError,
  PersistenceUnavailableError,
} from '../src/lib/persistenceGuard';
import {
  extractTrustedClientIp,
  getTrustedProxyCount,
  hasVerifiedCloudflareProvenance,
  hasVerifiedVercelProvenance,
  hasVerifiedGenericReverseProxyProvenance,
  normalizeAndValidateIp,
} from '../src/lib/requestContext';
import {
  enableTestMemoryRateLimit,
  hashRateLimitKey,
  resetRateLimitStoreForTesting,
} from '../src/lib/rateLimit';
import {
  EnquiryRepository,
  enquiryRepository,
  GuardedEnquiryRepository,
} from '../src/domain/enquiry/repositories/enquiryRepository';
import {
  deriveDeterministicSiteVisitId,
  GuardedSiteVisitRepository,
  siteVisitRepository,
  SiteVisitRepositoryPostgres,
} from '../src/infrastructure/repositories/postgres/siteVisitRepositoryPostgres';
import {
  deriveSiteVisitIdempotencyKey,
  siteVisitService,
} from '../src/domain/siteVisit/services/siteVisitService';
import { auditService } from '../src/domain/audit/auditService';
import { issueContinuationToken } from '../src/domain/enquiry/services/enquiryContinuationToken';
import { POST as postSiteVisitsRoute } from '../app/api/site-visits/route';

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ [PASS] ${name}`);
  } catch (err: any) {
    failed++;
    console.error(`  ✗ [FAIL] ${name}`);
    console.error(`    ${err?.stack || err?.message || err}`);
  }
}

async function withEnv<T>(
  overrides: Record<string, string | undefined>,
  fn: () => Promise<T> | T
): Promise<T> {
  const previous: Record<string, string | undefined> = {};
  for (const key of Object.keys(overrides)) {
    previous[key] = process.env[key];
    if (overrides[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = overrides[key];
    }
  }
  try {
    return await fn();
  } finally {
    for (const key of Object.keys(overrides)) {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    }
  }
}

/**
 * Simulated PostgreSQL backend (MOCK — explicitly labelled per PP-10C2 §2 & §7)
 * that models:
 * 1. Row-level locking on `enquiries` (`SELECT ... FOR UPDATE`) across independent repository instances
 * 2. Primary key uniqueness (`site_visits_pkey` on `id`)
 * 3. Partial unique index `uq_site_visits_active_enquiry_slot` on
 *    `(enquiry_id, preferred_date, preferred_time_window, visit_type) WHERE status <> 'CANCELLED'`
 * 4. Atomic transaction commit/rollback
 */
function createSimulatedPostgresSiteVisitCluster() {
  const enquiryRows = new Map<string, any>();
  const siteVisitRows = new Map<string, any>();
  const rowLocks = new Map<string, Promise<void>>();
  let selectForUpdateCount = 0;
  let failNextEnquiryUpdate = false;

  function findActiveSlotConflict(
    stagedVisits: Map<string, any>,
    candidate: {
      id: string;
      enquiryId: string;
      preferredDate: string;
      preferredTimeWindow: string;
      visitType: string;
      status: string;
    }
  ): any | null {
    if (candidate.status === 'CANCELLED') return null;
    for (const row of stagedVisits.values()) {
      if (
        row.id !== candidate.id &&
        row.status !== 'CANCELLED' &&
        row.enquiryId === candidate.enquiryId &&
        row.preferredDate === candidate.preferredDate &&
        row.preferredTimeWindow === candidate.preferredTimeWindow &&
        row.visitType === candidate.visitType
      ) {
        return row;
      }
    }
    return null;
  }

  function createConnection() {
    return {
      select() {
        return {
          from(table: any) {
            const isSvTable = 'visitType' in table;
            return {
              where() {
                const rows = isSvTable
                  ? Array.from(siteVisitRows.values())
                  : Array.from(enquiryRows.values());
                const promise: any = Promise.resolve(rows);
                promise.limit = async (n: number) => rows.slice(0, n);
                promise.orderBy = () => Promise.resolve(rows);
                return promise;
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
                    const updated: any[] = [];
                    for (const [id, row] of siteVisitRows.entries()) {
                      const next = { ...row, ...patch };
                      siteVisitRows.set(id, next);
                      updated.push(next);
                    }
                    return updated;
                  },
                };
              },
            };
          },
        };
      },
      async transaction(fn: (tx: any) => Promise<any>) {
        let releaseRowLock: (() => void) | null = null;

        const acquireEnquiryRowLock = async (lockId: string) => {
          while (rowLocks.has(lockId)) {
            await rowLocks.get(lockId);
          }
          let release!: () => void;
          const lockPromise = new Promise<void>((resolve) => {
            release = resolve;
          });
          rowLocks.set(lockId, lockPromise);
          releaseRowLock = () => {
            if (rowLocks.get(lockId) === lockPromise) {
              rowLocks.delete(lockId);
            }
            release();
          };
        };

        try {
          // Wait until any in-flight transaction holding the enquiry lock commits
          await acquireEnquiryRowLock('__enq_row_lock__');

          const stagedEnquiries = new Map<string, any>();
          for (const [k, v] of enquiryRows.entries()) stagedEnquiries.set(k, { ...v });
          const stagedVisits = new Map<string, any>();
          for (const [k, v] of siteVisitRows.entries()) stagedVisits.set(k, { ...v });

          const tx = {
            select() {
              return {
                from(table: any) {
                  const isSvTable = 'visitType' in table;
                  return {
                    where() {
                      const getRows = () =>
                        isSvTable
                          ? Array.from(stagedVisits.values())
                          : Array.from(stagedEnquiries.values());
                      const basePromise: any = Promise.resolve().then(() => getRows());
                      basePromise.limit = (n: number) => {
                        const limitPromise: any = Promise.resolve().then(() => getRows().slice(0, n));
                        limitPromise.for = async (mode: string) => {
                          if (mode === 'update' && !isSvTable) {
                            selectForUpdateCount++;
                          }
                          return getRows().slice(0, n);
                        };
                        return limitPromise;
                      };
                      return basePromise;
                    },
                  };
                },
              };
            },
            insert() {
              return {
                values(val: any) {
                  const executeInsert = async (doNothingOnConflict: boolean) => {
                    const pkConflict = stagedVisits.has(val.id);
                    const slotConflict = findActiveSlotConflict(stagedVisits, val);
                    if (pkConflict || slotConflict) {
                      if (doNothingOnConflict) {
                        return [];
                      }
                      const err: any = new Error(
                        pkConflict
                          ? 'duplicate key value violates unique constraint "site_visits_pkey"'
                          : 'duplicate key value violates unique constraint "uq_site_visits_active_enquiry_slot"'
                      );
                      err.code = '23505';
                      throw err;
                    }
                    const now = new Date();
                    const created = { ...val, createdAt: now, updatedAt: now };
                    stagedVisits.set(created.id, created);
                    return [created];
                  };

                  return {
                    onConflictDoNothing() {
                      return {
                        returning: () => executeInsert(true),
                      };
                    },
                    returning: () => executeInsert(false),
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
                          if (failNextEnquiryUpdate) {
                            throw new Error('Simulated enquiries UPDATE failure inside transaction');
                          }
                          const updated: any[] = [];
                          for (const [id, enq] of stagedEnquiries.entries()) {
                            const next = { ...enq, ...patch };
                            stagedEnquiries.set(id, next);
                            updated.push({ id: next.id });
                          }
                          return updated;
                        },
                      };
                    },
                  };
                },
              };
            },
          };

          const result = await fn(tx);

          // Commit staged changes atomically
          enquiryRows.clear();
          for (const [k, v] of stagedEnquiries.entries()) enquiryRows.set(k, v);
          siteVisitRows.clear();
          for (const [k, v] of stagedVisits.entries()) siteVisitRows.set(k, v);

          return result;
        } finally {
          if (releaseRowLock) {
            (releaseRowLock as () => void)();
          }
        }
      },
    };
  }

  return {
    enquiryRows,
    siteVisitRows,
    getSelectForUpdateCount: () => selectForUpdateCount,
    setFailNextEnquiryUpdate: (v: boolean) => {
      failNextEnquiryUpdate = v;
    },
    createConnection,
  };
}

async function runPP10C2Tests() {
  console.log('====================================================================');
  console.log('GREAT HOMES V2 — PP-10C2 CONCURRENCY & PROXY REMEDIATION TEST SUITE');
  console.log('====================================================================\n');

  enquiryRepository.enableTestMemoryPersistence(true);
  siteVisitRepository.enableTestMemoryPersistence(true);
  enableTestMemoryRateLimit(true);

  // --------------------------------------------------------------------------
  // SECTION 1: I-02-CONC — SITE-VISIT UNIQUENESS & CONCURRENCY PROTECTION
  // --------------------------------------------------------------------------
  console.log('--- Section 1: I-02-CONC — Site-Visit Concurrency & Slot Uniqueness ---');

  await test('I-02-CONC.1: Simultaneous requests with IDENTICAL idempotency keys create strictly 1 site visit and 1 audit event', async () => {
    enquiryRepository.clearMemoryForTesting();
    siteVisitRepository.clearMemoryForTesting();

    const { rawToken, record } = issueContinuationToken();
    const enq = await enquiryRepository.create({
      contextType: 'PROJECT',
      projectId: 'proj_c2_1',
      buyerName: 'Identical Key Buyer',
      buyerPhone: '+919830090001',
      preferredContact: 'WHATSAPP',
      requestSiteVisit: false,
      metadata: { _continuation: record },
    });

    const auditBefore = (await auditService.list({ resourceType: 'SITE_VISIT' })).total;

    const makeReq = () =>
      new NextRequest('http://localhost:3000/api/site-visits', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-enquiry-token': rawToken,
        },
        body: JSON.stringify({
          enquiryId: enq.id,
          projectId: 'proj_c2_1',
          visitType: 'IN_PERSON',
          preferredDate: '2026-12-20',
          preferredTimeWindow: '10:00 AM - 12:00 PM',
          idempotencyKey: 'same-key-c2-1',
        }),
      });

    const [r1, r2] = await Promise.all([
      postSiteVisitsRoute(makeReq()),
      postSiteVisitsRoute(makeReq()),
    ]);

    const [b1, b2] = await Promise.all([r1.json(), r2.json()]);
    assert.deepEqual([r1.status, r2.status].sort(), [200, 201]);
    assert.equal(b1.siteVisit.id, b2.siteVisit.id);
    assert.equal((await siteVisitRepository.list()).length, 1);

    const auditAfter = (await auditService.list({ resourceType: 'SITE_VISIT' })).total;
    assert.equal(auditAfter - auditBefore, 1);
  });

  await test('I-02-CONC.2: Simultaneous requests with DIFFERENT idempotency keys for the SAME enquiry and time slot create strictly 1 active site visit (route + simulated multi-connection PG)', async () => {
    enquiryRepository.clearMemoryForTesting();
    siteVisitRepository.clearMemoryForTesting();

    const { rawToken, record } = issueContinuationToken();
    const enq = await enquiryRepository.create({
      contextType: 'PROJECT',
      projectId: 'proj_c2_2',
      buyerName: 'Cross Key Buyer',
      buyerPhone: '+919830090002',
      preferredContact: 'WHATSAPP',
      requestSiteVisit: false,
      metadata: { _continuation: record },
    });

    const auditBefore = (await auditService.list({ resourceType: 'SITE_VISIT' })).total;

    const reqAlpha = new NextRequest('http://localhost:3000/api/site-visits', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-enquiry-token': rawToken,
      },
      body: JSON.stringify({
        enquiryId: enq.id,
        projectId: 'proj_c2_2',
        visitType: 'IN_PERSON',
        preferredDate: '2026-12-21',
        preferredTimeWindow: '11:00 AM - 1:00 PM',
        idempotencyKey: 'distinct-client-key-ALPHA',
      }),
    });

    const reqBeta = new NextRequest('http://localhost:3000/api/site-visits', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-enquiry-token': rawToken,
      },
      body: JSON.stringify({
        enquiryId: enq.id,
        projectId: 'proj_c2_2',
        visitType: 'IN_PERSON',
        preferredDate: '2026-12-21',
        preferredTimeWindow: '11:00 AM - 1:00 PM',
        idempotencyKey: 'distinct-client-key-BETA',
      }),
    });

    const [resAlpha, resBeta] = await Promise.all([
      postSiteVisitsRoute(reqAlpha),
      postSiteVisitsRoute(reqBeta),
    ]);

    const [bodyAlpha, bodyBeta] = await Promise.all([resAlpha.json(), resBeta.json()]);
    assert.deepEqual(
      [resAlpha.status, resBeta.status].sort(),
      [200, 201],
      'Exactly 1 request must return 201 Created and the concurrent different-key request for the same slot must return 200 OK'
    );
    assert.equal(
      bodyAlpha.siteVisit.id,
      bodyBeta.siteVisit.id,
      'Both requests must resolve to the single active siteVisit.id'
    );
    assert.equal(
      [bodyAlpha.deduplicated, bodyBeta.deduplicated].filter(Boolean).length,
      1,
      'Exactly one response must have deduplicated=true'
    );
    assert.equal((await siteVisitRepository.list()).length, 1);

    const auditAfter = (await auditService.list({ resourceType: 'SITE_VISIT' })).total;
    assert.equal(
      auditAfter - auditBefore,
      1,
      'Strictly 1 CREATE_SITE_VISIT audit event may be emitted across concurrent cross-key requests'
    );

    // Also verify across TWO independent SiteVisitRepositoryPostgres instances sharing simulated PG cluster (MOCK)
    const cluster = createSimulatedPostgresSiteVisitCluster();
    cluster.enquiryRows.set('enq_pg_cross_1', {
      id: 'enq_pg_cross_1',
      customerId: 'cust_1',
      projectId: 'proj_c2_2',
      status: 'NEW',
      siteVisitId: null,
    });

    const repoProcess1 = new SiteVisitRepositoryPostgres(() => cluster.createConnection() as any);
    const repoProcess2 = new SiteVisitRepositoryPostgres(() => cluster.createConnection() as any);

    const key1 = deriveSiteVisitIdempotencyKey({
      enquiryId: 'enq_pg_cross_1',
      visitType: 'IN_PERSON',
      preferredDate: '2026-12-21',
      preferredTimeWindow: '11:00 AM - 1:00 PM',
      clientKey: 'process-1-key-A',
    });
    const key2 = deriveSiteVisitIdempotencyKey({
      enquiryId: 'enq_pg_cross_1',
      visitType: 'IN_PERSON',
      preferredDate: '2026-12-21',
      preferredTimeWindow: '11:00 AM - 1:00 PM',
      clientKey: 'process-2-key-B',
    });
    assert.notEqual(key1, key2);

    const [pgRes1, pgRes2] = await Promise.all([
      repoProcess1.createStandaloneTransactional({
        enquiryId: 'enq_pg_cross_1',
        visitType: 'IN_PERSON',
        preferredDate: '2026-12-21',
        preferredTimeWindow: '11:00 AM - 1:00 PM',
        idempotencyKey: key1,
      }),
      repoProcess2.createStandaloneTransactional({
        enquiryId: 'enq_pg_cross_1',
        visitType: 'IN_PERSON',
        preferredDate: '2026-12-21',
        preferredTimeWindow: '11:00 AM - 1:00 PM',
        idempotencyKey: key2,
      }),
    ]);

    assert.equal(
      [pgRes1.created, pgRes2.created].filter(Boolean).length,
      1,
      'Across 2 independent repository instances with different keys, strictly 1 must have created=true'
    );
    assert.equal(pgRes1.siteVisit.id, pgRes2.siteVisit.id);
    assert.equal(cluster.siteVisitRows.size, 1);
    assert.ok(
      cluster.getSelectForUpdateCount() >= 2,
      'Parent enquiry row must be locked with SELECT ... FOR UPDATE in each transaction'
    );
  });

  await test('I-02-CONC.3: Two legitimate different time slots for the same enquiry both succeed and create separate appointments', async () => {
    enquiryRepository.clearMemoryForTesting();
    siteVisitRepository.clearMemoryForTesting();

    const { rawToken, record } = issueContinuationToken();
    const enq = await enquiryRepository.create({
      contextType: 'PROJECT',
      projectId: 'proj_c2_3',
      buyerName: 'Multi Slot Buyer',
      buyerPhone: '+919830090003',
      preferredContact: 'WHATSAPP',
      requestSiteVisit: false,
      metadata: { _continuation: record },
    });

    const reqSlot1 = new NextRequest('http://localhost:3000/api/site-visits', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-enquiry-token': rawToken,
      },
      body: JSON.stringify({
        enquiryId: enq.id,
        projectId: 'proj_c2_3',
        visitType: 'IN_PERSON',
        preferredDate: '2026-12-22',
        preferredTimeWindow: '10:00 AM - 12:00 PM',
        idempotencyKey: 'slot-1-key',
      }),
    });

    const reqSlot2 = new NextRequest('http://localhost:3000/api/site-visits', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-enquiry-token': rawToken,
      },
      body: JSON.stringify({
        enquiryId: enq.id,
        projectId: 'proj_c2_3',
        visitType: 'IN_PERSON',
        preferredDate: '2026-12-23',
        preferredTimeWindow: '3:00 PM - 5:00 PM',
        idempotencyKey: 'slot-2-key',
      }),
    });

    const [res1, res2] = await Promise.all([
      postSiteVisitsRoute(reqSlot1),
      postSiteVisitsRoute(reqSlot2),
    ]);

    const [b1, b2] = await Promise.all([res1.json(), res2.json()]);
    assert.equal(res1.status, 201);
    assert.equal(res2.status, 201);
    assert.notEqual(b1.siteVisit.id, b2.siteVisit.id);
    assert.equal((await siteVisitRepository.list()).length, 2);
  });

  await test('I-02-CONC.4 & I-02-CONC.5: Retry after success deduplicates; cancellation and rescheduling preserve lifecycle and allow re-booking a cancelled slot', async () => {
    enquiryRepository.clearMemoryForTesting();
    siteVisitRepository.clearMemoryForTesting();

    const enq = await enquiryRepository.create({
      contextType: 'PROJECT',
      projectId: 'proj_c2_5',
      customerId: 'cust_c2_5',
      buyerName: 'Lifecycle Buyer',
      buyerPhone: '+919830090005',
      preferredContact: 'WHATSAPP',
      requestSiteVisit: false,
    });

    // 1. Initial booking
    const first = await siteVisitService.createSiteVisitWithMeta(enq.id, {
      customerId: 'cust_c2_5',
      projectId: 'proj_c2_5',
      visitType: 'IN_PERSON',
      preferredDate: '2026-12-24',
      preferredTimeWindow: '10:00 AM - 12:00 PM',
      idempotencyKey: 'key-initial-24',
    });
    assert.equal(first.created, true);

    // 2. Retry after success with a DIFFERENT client key for the same active slot -> deduplicated
    const retryDifferentKey = await siteVisitService.createSiteVisitWithMeta(enq.id, {
      customerId: 'cust_c2_5',
      projectId: 'proj_c2_5',
      visitType: 'IN_PERSON',
      preferredDate: '2026-12-24',
      preferredTimeWindow: '10:00 AM - 12:00 PM',
      idempotencyKey: 'key-retry-24',
    });
    assert.equal(retryDifferentKey.created, false);
    assert.equal(retryDifferentKey.siteVisit.id, first.siteVisit.id);

    // 3. Customer requests reschedule to a new date/time window
    const rescheduled = await siteVisitService.customerRequestReschedule(
      'cust_c2_5',
      first.siteVisit.id,
      '2026-12-26',
      '2:00 PM - 4:00 PM',
      'Buyer requested afternoon slot'
    );
    assert.ok(rescheduled);
    assert.equal(rescheduled.status, 'RESCHEDULE_REQUESTED');
    assert.equal(rescheduled.preferredDate, '2026-12-26');

    // 4. Customer cancels the visit
    const cancelled = await siteVisitService.customerCancelVisit(
      'cust_c2_5',
      first.siteVisit.id,
      'Schedule change'
    );
    assert.ok(cancelled);
    assert.equal(cancelled.status, 'CANCELLED');

    // 5. Re-book the cancelled slot with a new key -> permitted because prior visit is CANCELLED
    const rebooked = await siteVisitService.createSiteVisitWithMeta(enq.id, {
      customerId: 'cust_c2_5',
      projectId: 'proj_c2_5',
      visitType: 'IN_PERSON',
      preferredDate: '2026-12-26',
      preferredTimeWindow: '2:00 PM - 4:00 PM',
      idempotencyKey: 'key-rebook-after-cancel',
    });
    assert.equal(rebooked.created, true);
    assert.notEqual(rebooked.siteVisit.id, first.siteVisit.id);
    assert.equal(rebooked.siteVisit.status, 'REQUESTED');
  });

  await test('I-02-CONC.6: Transaction failure during enquiry update rolls back site_visits insert completely and retry succeeds', async () => {
    const cluster = createSimulatedPostgresSiteVisitCluster();
    cluster.enquiryRows.set('enq_rollback_c2', {
      id: 'enq_rollback_c2',
      customerId: 'cust_rb',
      projectId: 'proj_rb',
      status: 'NEW',
      siteVisitId: null,
    });
    cluster.setFailNextEnquiryUpdate(true);

    const pgRepo = new SiteVisitRepositoryPostgres(() => cluster.createConnection() as any);
    const key = deriveSiteVisitIdempotencyKey({
      enquiryId: 'enq_rollback_c2',
      visitType: 'IN_PERSON',
      preferredDate: '2026-12-29',
      preferredTimeWindow: '4:00 PM - 6:00 PM',
      clientKey: 'rb-key-1',
    });

    await assert.rejects(
      () =>
        pgRepo.createStandaloneTransactional({
          enquiryId: 'enq_rollback_c2',
          visitType: 'IN_PERSON',
          preferredDate: '2026-12-29',
          preferredTimeWindow: '4:00 PM - 6:00 PM',
          idempotencyKey: key,
        }),
      (err) => isPersistenceUnavailableError(err)
    );

    assert.equal(cluster.siteVisitRows.size, 0, 'Rolled back transaction must leave 0 site_visits rows');
    assert.equal(cluster.enquiryRows.get('enq_rollback_c2')?.siteVisitId, null);

    // Retry after transient failure resolves
    cluster.setFailNextEnquiryUpdate(false);
    const recovered = await pgRepo.createStandaloneTransactional({
      enquiryId: 'enq_rollback_c2',
      visitType: 'IN_PERSON',
      preferredDate: '2026-12-29',
      preferredTimeWindow: '4:00 PM - 6:00 PM',
      idempotencyKey: key,
    });
    assert.equal(recovered.created, true);
    assert.equal(cluster.siteVisitRows.size, 1);
    assert.equal(cluster.enquiryRows.get('enq_rollback_c2')?.siteVisitId, recovered.siteVisit.id);
  });

  // --------------------------------------------------------------------------
  // SECTION 2: RL-01-ARCH & RL-01 — PROXY PROVENANCE & VERCEL HOP HANDLING
  // --------------------------------------------------------------------------
  console.log('\n--- Section 2: RL-01-ARCH & RL-01 — Trusted Proxy Provenance & Vercel Hop Handling ---');

  await test('RL-01-ARCH.1: Direct-origin spoofed cf-ray / x-vercel-id headers are REJECTED when ingress enforcement or shared secret is absent', async () => {
    // 1. Cloudflare TRUST_CLOUDFLARE_PROXY=true WITHOUT CLOUDFLARE_STRICT_ORIGIN_INGRESS_ENFORCED or secret -> rejected
    await withEnv(
      {
        TRUST_CLOUDFLARE_PROXY: 'true',
        CLOUDFLARE_STRICT_ORIGIN_INGRESS_ENFORCED: undefined,
        CLOUDFLARE_ORIGIN_SHARED_SECRET: undefined,
        ORIGIN_INGRESS_SHARED_SECRET: undefined,
        TRUSTED_PROXY_COUNT: '1',
      },
      () => {
        const spoofedCfHeaders = new Headers({
          'cf-ray': '8a1b2c3d4e5f0000-SIN',
          'cf-connecting-ip': '198.51.100.99',
          'x-forwarded-for': '198.51.100.99',
        });
        assert.equal(hasVerifiedCloudflareProvenance(spoofedCfHeaders), false);
        assert.equal(extractTrustedClientIp(spoofedCfHeaders), null);
      }
    );

    // 2. Vercel TRUST_VERCEL_PROXY=true, VERCEL=1, VERCEL_ENV=production WITHOUT VERCEL_EDGE_INGRESS_ENFORCED or secret -> rejected
    await withEnv(
      {
        TRUST_VERCEL_PROXY: 'true',
        VERCEL: '1',
        VERCEL_ENV: 'production',
        VERCEL_EDGE_INGRESS_ENFORCED: undefined,
        ORIGIN_INGRESS_SHARED_SECRET: undefined,
        TRUSTED_PROXY_COUNT: '1',
      },
      () => {
        const spoofedVercelHeaders = new Headers({
          'x-vercel-id': 'bom1::iad1::spoofed',
          'x-vercel-forwarded-for': '198.51.100.88',
          'x-forwarded-for': '198.51.100.88',
        });
        assert.equal(hasVerifiedVercelProvenance(spoofedVercelHeaders), false);
        assert.equal(extractTrustedClientIp(spoofedVercelHeaders), null);
      }
    );

    // 3. Generic reverse proxy TRUST_REVERSE_PROXY=true WITHOUT REVERSE_PROXY_INGRESS_ENFORCED or secret -> rejected
    await withEnv(
      {
        TRUST_REVERSE_PROXY: 'true',
        REVERSE_PROXY_INGRESS_ENFORCED: undefined,
        ORIGIN_INGRESS_SHARED_SECRET: undefined,
        TRUSTED_PROXY_COUNT: '1',
      },
      () => {
        const spoofedXffHeaders = new Headers({
          'x-forwarded-for': '198.51.100.77',
        });
        assert.equal(hasVerifiedGenericReverseProxyProvenance(spoofedXffHeaders), false);
        assert.equal(extractTrustedClientIp(spoofedXffHeaders), null);
      }
    );
  });

  await test('RL-01-ARCH.2: Origin shared secret verification enforces constant-time secret match and rejects mismatched cf-connecting-ip', async () => {
    const validSecret = 'cf_origin_pull_secret_2026_secure!';
    await withEnv(
      {
        TRUST_CLOUDFLARE_PROXY: 'true',
        CLOUDFLARE_ORIGIN_SHARED_SECRET: validSecret,
        TRUSTED_PROXY_COUNT: '1',
      },
      () => {
        // Missing secret header -> rejected
        assert.equal(
          extractTrustedClientIp(
            new Headers({
              'cf-ray': '8a1b2c3d4e5f0000-SIN',
              'cf-connecting-ip': '203.0.113.15',
              'x-forwarded-for': '203.0.113.15',
            })
          ),
          null
        );

        // Wrong secret header -> rejected
        assert.equal(
          extractTrustedClientIp(
            new Headers({
              'x-cloudflare-origin-secret': 'wrong_secret_value_0000000000000',
              'cf-ray': '8a1b2c3d4e5f0000-SIN',
              'cf-connecting-ip': '203.0.113.15',
              'x-forwarded-for': '203.0.113.15',
            })
          ),
          null
        );

        // Matching secret + consistent cf-connecting-ip & x-forwarded-for -> accepted
        assert.equal(
          extractTrustedClientIp(
            new Headers({
              'x-cloudflare-origin-secret': validSecret,
              'cf-ray': '8a1b2c3d4e5f0000-SIN',
              'cf-connecting-ip': '203.0.113.15',
              'x-forwarded-for': '1.1.1.1, 203.0.113.15',
            })
          ),
          '203.0.113.15'
        );

        // Matching secret BUT cf-connecting-ip disagrees with right-to-left hop in x-forwarded-for -> rejected (null)
        assert.equal(
          extractTrustedClientIp(
            new Headers({
              'x-cloudflare-origin-secret': validSecret,
              'cf-ray': '8a1b2c3d4e5f0000-SIN',
              'cf-connecting-ip': '1.1.1.1',
              'x-forwarded-for': '1.1.1.1, 203.0.113.15',
            })
          ),
          null
        );
      }
    );
  });

  await test('RL-01.1: Vercel proxy-hop handling walks x-vercel-forwarded-for using TRUSTED_PROXY_COUNT and NEVER falls back to x-forwarded-for or leftmost hop', async () => {
    await withEnv(
      {
        TRUST_VERCEL_PROXY: 'true',
        VERCEL: '1',
        VERCEL_ENV: 'production',
        VERCEL_EDGE_INGRESS_ENFORCED: 'true',
        TRUSTED_PROXY_COUNT: '2',
      },
      () => {
        // 1. Two trusted proxies on x-vercel-forwarded-for -> selects rawParts[length - 2]
        assert.equal(
          extractTrustedClientIp(
            new Headers({
              'x-vercel-id': 'bom1::iad1::999',
              'x-vercel-forwarded-for': '10.0.0.1, 198.51.100.42, 70.41.3.18',
            })
          ),
          '198.51.100.42'
        );

        // 2. Insufficient hop count (1 hop when TRUSTED_PROXY_COUNT=2) -> returns null (never clamps to index 0)
        assert.equal(
          extractTrustedClientIp(
            new Headers({
              'x-vercel-id': 'bom1::iad1::999',
              'x-vercel-forwarded-for': '198.51.100.42',
            })
          ),
          null
        );

        // 3. Missing x-vercel-forwarded-for when spoofed x-forwarded-for is present -> returns null (NO fall-through to x-forwarded-for!)
        assert.equal(
          extractTrustedClientIp(
            new Headers({
              'x-vercel-id': 'bom1::iad1::999',
              'x-forwarded-for': '10.0.0.1, 198.51.100.42, 70.41.3.18',
            })
          ),
          null,
          'Vercel provenance must never fall through to generic x-forwarded-for when x-vercel-forwarded-for is omitted'
        );

        // 4. Malformed hop in x-vercel-forwarded-for when x-forwarded-for and x-real-ip are present -> returns null
        assert.equal(
          extractTrustedClientIp(
            new Headers({
              'x-vercel-id': 'bom1::iad1::999',
              'x-vercel-forwarded-for': '198.51.100.42, bad_hop, 70.41.3.18',
              'x-forwarded-for': '10.0.0.1, 198.51.100.42, 70.41.3.18',
              'x-real-ip': '198.51.100.42',
            })
          ),
          null
        );

        // 5. Excessive hop count (client prepends forged leftmost hops) -> selects exact trusted boundary hop
        assert.equal(
          extractTrustedClientIp(
            new Headers({
              'x-vercel-id': 'bom1::iad1::999',
              'x-vercel-forwarded-for': '8.8.8.8, 9.9.9.9, 1.1.1.1, 203.0.113.77, 70.41.3.18',
            })
          ),
          '203.0.113.77'
        );

        // 6. IPv4-mapped IPv6 in x-vercel-forwarded-for normalizes to canonical IPv4
        assert.equal(
          extractTrustedClientIp(
            new Headers({
              'x-vercel-id': 'bom1::iad1::999',
              'x-vercel-forwarded-for': '::ffff:203.0.113.77, ::ffff:c000:0201',
            })
          ),
          '203.0.113.77'
        );
      }
    );
  });

  // --------------------------------------------------------------------------
  // SECTION 3: P-01 — CONSISTENT ASYNCHRONOUS REPOSITORY BEHAVIOUR
  // --------------------------------------------------------------------------
  console.log('\n--- Section 3: P-01 — Consistent Asynchronous Repository Error Propagation ---');

  await test('P-01-ASYNC.1: All GuardedSiteVisitRepository and GuardedEnquiryRepository methods return rejected Promises (never synchronous throws) when persistence is unavailable', async () => {
    await withEnv(
      {
        NODE_ENV: 'production',
        VERCEL_ENV: 'production',
        PERSISTENCE_PROVIDER: 'memory',
        DATABASE_URL: undefined,
      },
      async () => {
        const guardedSv = new GuardedSiteVisitRepository({ dbResolver: () => null });
        const guardedEnq = new GuardedEnquiryRepository({ dbResolver: () => null });

        const unawaitedCalls: Array<{ name: string; invoke: () => Promise<unknown> }> = [
          {
            name: 'siteVisitRepository.create',
            invoke: () =>
              guardedSv.create({
                enquiryId: 'e1',
                visitType: 'IN_PERSON',
                preferredDate: '2026-12-30',
                preferredTimeWindow: '10:00 AM - 12:00 PM',
                status: 'REQUESTED',
              } as any),
          },
          {
            name: 'siteVisitRepository.createStandaloneTransactional',
            invoke: () =>
              guardedSv.createStandaloneTransactional({
                enquiryId: 'e1',
                visitType: 'IN_PERSON',
                preferredDate: '2026-12-30',
                preferredTimeWindow: '10:00 AM - 12:00 PM',
                idempotencyKey: 'k1',
              }),
          },
          { name: 'siteVisitRepository.findById', invoke: () => guardedSv.findById('sv_1') },
          {
            name: 'siteVisitRepository.findByEnquiryId',
            invoke: () => guardedSv.findByEnquiryId('e1'),
          },
          {
            name: 'siteVisitRepository.findByCustomerId',
            invoke: () => guardedSv.findByCustomerId('c1'),
          },
          { name: 'siteVisitRepository.listAdmin', invoke: () => guardedSv.listAdmin() },
          {
            name: 'siteVisitRepository.update',
            invoke: () => guardedSv.update('sv_1', { status: 'CONFIRMED' }),
          },
          { name: 'siteVisitRepository.list', invoke: () => guardedSv.list() },
          {
            name: 'enquiryRepository.create',
            invoke: () =>
              guardedEnq.create({
                contextType: 'GENERAL',
                buyerName: 'Test',
                buyerPhone: '+919830000000',
                preferredContact: 'PHONE',
                requestSiteVisit: false,
              }),
          },
          { name: 'enquiryRepository.findById', invoke: () => guardedEnq.findById('e1') },
          {
            name: 'enquiryRepository.findByIdempotencyKey',
            invoke: () => guardedEnq.findByIdempotencyKey('k1'),
          },
          { name: 'enquiryRepository.list', invoke: () => guardedEnq.list({}) },
          { name: 'enquiryRepository.getMetrics', invoke: () => guardedEnq.getMetrics() },
        ];

        for (const entry of unawaitedCalls) {
          let returnedPromise: Promise<unknown> | null = null;
          let threwSynchronously = false;
          try {
            // Invoke WITHOUT await to verify it does not throw synchronously
            returnedPromise = entry.invoke();
          } catch {
            threwSynchronously = true;
          }
          assert.equal(
            threwSynchronously,
            false,
            `${entry.name} threw synchronously instead of returning a rejected Promise`
          );
          assert.ok(
            returnedPromise instanceof Promise,
            `${entry.name} must return a Promise instance`
          );
          await assert.rejects(
            () => returnedPromise!,
            (err) =>
              isPersistenceUnavailableError(err) &&
              (err as PersistenceUnavailableError).statusCode === 503,
            `${entry.name} Promise must reject with 503 PersistenceUnavailableError`
          );
        }
      }
    );
  });

  // --------------------------------------------------------------------------
  // SECTION 4: MIG-0010-IDX — STATIC SCHEMA & MIGRATION INDEX ALIGNMENT
  // --------------------------------------------------------------------------
  console.log('\n--- Section 4: MIG-0010-IDX — Migration & Schema Index Alignment ---');

  await test('MIG-0010-IDX.1: Schema, Migration 0010, Migration 0011, and Migration 0012 use consistent index names and partial predicates with zero runtime DDL in client.ts', () => {
    const root = process.cwd();
    const schemaText = fs.readFileSync(path.join(root, 'src/db/schema.ts'), 'utf8');
    const clientText = fs.readFileSync(path.join(root, 'src/db/client.ts'), 'utf8');
    const mig0010Text = fs.readFileSync(
      path.join(root, 'drizzle/0010_pp10b_enquiry_idempotency_and_rate_limits.sql'),
      'utf8'
    );
    const mig0011Text = fs.readFileSync(
      path.join(root, 'drizzle/0011_pp10c2_site_visit_active_slot_uniqueness_and_index_alignment.sql'),
      'utf8'
    );
    const mig0012Text = fs.readFileSync(
      path.join(root, 'drizzle/0012_post_property_phase1_full_parity.sql'),
      'utf8'
    );

    // 1. Canonical uq_enquiries_idempotency_key present in schema.ts, 0010, 0011, and 0012
    assert.match(schemaText, /uniqueIndex\('uq_enquiries_idempotency_key'\)/);
    assert.match(mig0010Text, /CREATE UNIQUE INDEX IF NOT EXISTS "uq_enquiries_idempotency_key"/);
    assert.match(mig0011Text, /CREATE UNIQUE INDEX IF NOT EXISTS "uq_enquiries_idempotency_key"/);
    assert.match(mig0012Text, /CREATE UNIQUE INDEX IF NOT EXISTS "uq_enquiries_idempotency_key"/);

    // 2. Duplicate uq_enquiries_idempotency_key_not_null is dropped in 0011 and never created in schema or client.ts
    assert.match(mig0011Text, /DROP INDEX IF EXISTS "uq_enquiries_idempotency_key_not_null"/);
    assert.ok(!schemaText.includes('uq_enquiries_idempotency_key_not_null'));
    assert.ok(!/CREATE UNIQUE INDEX/i.test(clientText));
    assert.ok(!clientText.includes('ensureSchemaUpdates'));

    // 3. Partial unique index uq_site_visits_active_enquiry_slot present in schema.ts, 0011, and 0012 with status <> 'CANCELLED'
    assert.match(schemaText, /uniqueIndex\('uq_site_visits_active_enquiry_slot'\)/);
    assert.match(mig0011Text, /CREATE UNIQUE INDEX IF NOT EXISTS "uq_site_visits_active_enquiry_slot"/);
    assert.match(mig0011Text, /WHERE "status" <> 'CANCELLED'/);
    assert.match(mig0012Text, /CREATE UNIQUE INDEX IF NOT EXISTS "uq_site_visits_active_enquiry_slot"/);
  });

  console.log('\n====================================================================');
  console.log(`PP-10C2 VERIFICATION SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('====================================================================');
  if (failed > 0) {
    process.exit(1);
  }
}

runPP10C2Tests().catch((err) => {
  console.error('PP-10C2 suite crashed:', err);
  process.exit(1);
});
