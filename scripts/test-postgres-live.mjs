#!/usr/bin/env node
/**
 * Great Homes V2 — Live PostgreSQL Integration Test Suite
 *
 * Release Gate Verification for Customer 360 & Visitor Telemetry:
 *  - PG-MIG-1: Migrations (0000–0003) & constraint verification (schema isolation enforced)
 *  - PG-SCHEMA-1: Schema idempotency under repeated ensureSchemaUpdates() runs
 *  - PG-ENQ-FK-1: Enquiry attribution pre-creation, opt-out, and foreign-key integrity
 *  - PG-CONC-1: 20 concurrent identical event ingestions, atomic deduplication, single counter increment
 *  - PG-CONC-2: Distinct search/filter/floor-plan events preservation within 3s, retry dedup, no PII leakage
 *  - PG-CONC-3: Conflicting customer links under simultaneous requests
 *  - PG-RET-1: Bounded batch retention purge, cascade deletion, ON DELETE SET NULL on enquiries
 *
 * MANDATORY SAFETY REQUIREMENTS:
 *  1. Never connects to or modifies the production database.
 *  2. Rejects production compute endpoints and poolers via strict hostname validation.
 *  3. Allows legitimate Neon branch logical database names (e.g. 'greathomes-production').
 *  4. Requires ALLOW_DISPOSABLE_DB_TESTS=1 acknowledgment.
 *  5. Never prints or leaks database credentials.
 *  6. Executes using real PostgreSQL repositories; never silently falls back to in-memory mode.
 */

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { validateTestDatabaseUrl, redactDatabaseUrl } from './lib/db-safety-validation.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// -----------------------------------------------------------------------------
// 1. Mandatory Safety & Isolation Guardrails
// -----------------------------------------------------------------------------
console.log('================================================================================');
console.log('GREAT HOMES V2 — LIVE POSTGRESQL INTEGRATION TEST SUITE');
console.log('================================================================================\n');

let testDatabaseUrl = process.env.TEST_DATABASE_URL?.trim();
try {
  const fsSync = await import('node:fs');
  if (fsSync.existsSync('/app/.dev.env.json')) {
    const devEnv = JSON.parse(fsSync.readFileSync('/app/.dev.env.json', 'utf8'));
    if (devEnv.TEST_DATABASE_URL) {
      testDatabaseUrl = devEnv.TEST_DATABASE_URL.trim();
      process.env.TEST_DATABASE_URL = testDatabaseUrl;
    }
  }
} catch {}

const currentDatabaseUrl = process.env.DATABASE_URL?.trim();
const allowDisposableTests = process.env.ALLOW_DISPOSABLE_DB_TESTS?.trim();

const validation = validateTestDatabaseUrl({
  testUrl: testDatabaseUrl,
  prodUrl: currentDatabaseUrl,
  allowDisposable: allowDisposableTests,
});

if (!validation.valid) {
  if (validation.code === 2) {
    console.log(`\x1b[33m[BLOCKED]\x1b[0m ${validation.error}\n`);
    console.log('Safety Mandate Enforced:');
    console.log('  Live PostgreSQL integration tests require an isolated disposable Neon branch');
    console.log('  or temporary PostgreSQL instance.');
    console.log('  Testing against the primary or production database is strictly prohibited.\n');
    console.log('How to run this test suite against an isolated disposable database:');
    console.log('  1. Create a disposable Neon branch (e.g. "customer360-integration-test")');
    console.log('  2. Run the test suite with the safety acknowledgment flag:');
    console.log('     TEST_DATABASE_URL="postgres://user:pass@host:5432/greathomes-production" \\');
    console.log('     ALLOW_DISPOSABLE_DB_TESTS=1 npm run test:postgres-live\n');
    console.log('Exit Code: 2 (Blocked — isolated test database unavailable)');
    console.log('================================================================================');
    process.exit(2);
  } else {
    console.error(`\x1b[31m[FATAL SAFETY VIOLATION]\x1b[0m ${validation.error}`);
    console.error('Connecting to or running tests against production is strictly prohibited.');
    process.exit(1);
  }
}

console.log(`[SAFEGUARD ACTIVE] Target Database : ${validation.redactedUrl}`);
console.log(`[SAFEGUARD ACTIVE] Compute Host    : ${validation.parsed.hostname}`);
console.log(`[SAFEGUARD ACTIVE] Production Check: PASSED (isolated compute endpoint verified)`);
console.log(`[SAFEGUARD ACTIVE] Mode            : Real PostgreSQL (in-memory mode disabled)\n`);

// -----------------------------------------------------------------------------
// Set up Environment for Real PostgreSQL Persistence
// -----------------------------------------------------------------------------
process.env.PERSISTENCE_PROVIDER = 'postgres';
process.env.DATABASE_URL = testDatabaseUrl;
process.env.NODE_ENV = 'development';
process.env.CUSTOMER_AUTH_SECRET = 'test-only-customer-secret-that-is-at-least-32-characters';
process.env.GH_STAFF_SESSION_SECRET = 'test-only-staff-session-secret-that-is-at-least-32-chars';

let passedCount = 0;
let failedCount = 0;
let blockedCount = 0;

function check(condition, id, message) {
  if (condition) {
    passedCount++;
    console.log(`\x1b[32m[PASS]\x1b[0m ${id}: ${message}`);
  } else {
    failedCount++;
    console.error(`\x1b[31m[FAIL]\x1b[0m ${id}: ${message}`);
  }
}

function markBlocked(id, reason) {
  blockedCount++;
  console.log(`\x1b[33m[BLOCKED]\x1b[0m ${id}: ${reason}`);
}

// -----------------------------------------------------------------------------
// Test Execution
// -----------------------------------------------------------------------------
async function runLivePostgresSuite() {
  const { Pool } = pg;
  const pool = new Pool({ connectionString: testDatabaseUrl });

  try {
    // Verify PostgreSQL connection
    const pingResult = await pool.query('SELECT 1 as connected, version() as pg_version;');
    console.log(`PostgreSQL Connected: ${pingResult.rows[0].connected === 1 ? 'YES' : 'NO'}`);
    console.log(`PostgreSQL Engine   : ${pingResult.rows[0].pg_version.split(' on ')[0]}\n`);

    // =========================================================================
    // GROUP 1: PG-MIG-1 — Migrations Execution & Schema Invariant Validation
    // =========================================================================
    console.log('--- GROUP 1: PG-MIG-1 — Migrations Execution & Schema Validation ---');

    // Inspect target database schema to detect if it is an existing schema-only clone
    const existingConstraintsRes = await pool.query(`
      SELECT conname, confdeltype 
      FROM pg_constraint 
      WHERE conname IN (
        'enquiries_visitor_id_visitors_id_fk',
        'enquiries_session_id_visitor_sessions_id_fk'
      );
    `);
    const existingFkMap = new Map(existingConstraintsRes.rows.map((r) => [r.conname, r.confdeltype]));
    const alreadyMigrated = existingFkMap.has('enquiries_visitor_id_visitors_id_fk');

    if (alreadyMigrated) {
      // The branch was cloned using Neon "Schema-only", so the Customer 360 schema and constraints
      // are already present in public.
      //
      // In accordance with Task 2:
      // 1. We MUST NOT drop constraints from the shared public schema and re-run 0003.
      // 2. We MUST NOT assume setting search_path is sufficient, because drizzle/0000_adorable_unus.sql
      //    hardcodes 'public' on all CREATE TYPE statements (e.g. CREATE TYPE "public"."customer_status")
      //    and drizzle/0003_visitor_customer_360.sql checks un-namespaced pg_constraint.
      // 3. Therefore, raw end-to-end migration execution from a pre-0003 state is explicitly marked BLOCKED
      //    requiring a clean/virgin disposable database instance, while schema invariants are verified below.
      markBlocked(
        'PG-MIG-1 (Execution Phase)',
        'Pre-migration DDL execution from scratch cannot be safely isolated in a schema-only branch because drizzle/0000_adorable_unus.sql contains hardcoded "public" schema qualifications and drizzle/0003_visitor_customer_360.sql queries global pg_constraint. End-to-end migration testing requires a virgin empty database (e.g. Neon branch created as Empty branch).'
      );

      // Verify that the existing schema on the branch correctly enforces all required invariants:
      check(
        existingFkMap.get('enquiries_visitor_id_visitors_id_fk') === 'n',
        'PG-MIG-1.1-SCHEMA',
        'Constraint enquiries_visitor_id_visitors_id_fk is active with ON DELETE SET NULL (confdeltype=n)'
      );
      check(
        existingFkMap.get('enquiries_session_id_visitor_sessions_id_fk') === 'n',
        'PG-MIG-1.2-SCHEMA',
        'Constraint enquiries_session_id_visitor_sessions_id_fk is active with ON DELETE SET NULL (confdeltype=n)'
      );

      const indexesRes = await pool.query(`
        SELECT indexname FROM pg_indexes WHERE tablename = 'visitor_events';
      `);
      const indexNames = new Set(indexesRes.rows.map((r) => r.indexname));
      check(
        indexNames.has('uq_visitor_events_visitor_client_event'),
        'PG-MIG-1.3-SCHEMA',
        'Unique index uq_visitor_events_visitor_client_event exists on visitor_events(visitor_id, client_event_id)'
      );
      check(
        !indexNames.has('idx_visitor_events_client_event'),
        'PG-MIG-1.4-SCHEMA',
        'Redundant index idx_visitor_events_client_event is absent from visitor_events'
      );
    } else {
      // Clean virgin database: apply migrations 0000 through 0003 in sequence
      async function applyMigrationSql(filePath) {
        const content = await fs.readFile(filePath, 'utf-8');
        const statements = content
          .split('--> statement-breakpoint')
          .map((s) => s.trim())
          .filter((s) => s.length > 0 && !s.startsWith('--'));

        for (const stmt of statements) {
          if (!stmt) continue;
          await pool.query(stmt);
        }
      }

      await applyMigrationSql(path.join(projectRoot, 'drizzle', '0000_adorable_unus.sql'));
      await applyMigrationSql(path.join(projectRoot, 'drizzle', '0001_project_coordinates.sql'));
      await applyMigrationSql(path.join(projectRoot, 'drizzle', '0002_customer_auth_otp.sql'));

      // Pre-migration orphan test in virgin database
      await pool.query(`
        ALTER TABLE enquiries
          ADD COLUMN IF NOT EXISTS customer_id text,
          ADD COLUMN IF NOT EXISTS visitor_id text,
          ADD COLUMN IF NOT EXISTS session_id text;
      `);

      const orphanEnquiryId = `test_pg_live_orphan_enq_${Date.now()}`;
      await pool.query(`
        INSERT INTO enquiries (
          id, context_type, buyer_name, buyer_phone, preferred_contact, status, priority,
          visitor_id, session_id, created_at, updated_at
        ) VALUES (
          $1, 'PROJECT', 'Orphan PreMigration Test', '+919999988888', 'WHATSAPP', 'NEW', 'NORMAL',
          'dangling_nonexistent_visitor_id', 'dangling_nonexistent_session_id', now(), now()
        );
      `, [orphanEnquiryId]);

      await applyMigrationSql(path.join(projectRoot, 'drizzle', '0003_visitor_customer_360.sql'));

      const orphanCheck = await pool.query(
        `SELECT id, buyer_name, visitor_id, session_id FROM enquiries WHERE id = $1`,
        [orphanEnquiryId]
      );
      const orphanRow = orphanCheck.rows[0];
      check(
        orphanRow && orphanRow.visitor_id === null && orphanRow.session_id === null,
        'PG-MIG-1.1',
        'Pre-migration orphan enquiry preserved and dangling references set to NULL'
      );
    }

    // =========================================================================
    // GROUP 2: PG-SCHEMA-1 — Runtime Schema Idempotency
    // =========================================================================
    console.log('\n--- GROUP 2: PG-SCHEMA-1 — Schema Idempotency Verification ---');

    const { getDbReady, resetSchemaInitializationStateForTesting, ensureSchemaUpdates } = await import(
      '../src/db/client.ts'
    );

    const db = await getDbReady();
    check(db !== null, 'PG-SCHEMA-1.1', 'PostgreSQL database client initialized via getDbReady()');

    // Run 1: ensureSchemaUpdates
    resetSchemaInitializationStateForTesting();
    let schemaRun1Ok = false;
    try {
      await ensureSchemaUpdates(db);
      schemaRun1Ok = true;
    } catch (e) {
      console.error('Schema run 1 error:', e);
    }
    check(schemaRun1Ok, 'PG-SCHEMA-1.2', 'First explicit ensureSchemaUpdates() completes without error');

    // Run 2: ensureSchemaUpdates (idempotency check)
    resetSchemaInitializationStateForTesting();
    let schemaRun2Ok = false;
    try {
      await ensureSchemaUpdates(db);
      schemaRun2Ok = true;
    } catch (e) {
      console.error('Schema run 2 error:', e);
    }
    check(schemaRun2Ok, 'PG-SCHEMA-1.3', 'Second consecutive ensureSchemaUpdates() runs cleanly and idempotently');

    // =========================================================================
    // GROUP 3: PG-ENQ-FK-1 — Enquiry Attribution & Foreign Key Safety
    // =========================================================================
    console.log('\n--- GROUP 3: PG-ENQ-FK-1 — Enquiry Foreign Key Attribution ---');

    const { VisitorIntelligenceRepositoryPostgres } = await import(
      '../src/domain/visitorIntelligence/repositories/visitorIntelligenceRepository.ts'
    );
    const { EnquiryRepositoryPostgres } = await import(
      '../src/infrastructure/repositories/postgres/enquiryRepositoryPostgres.ts'
    );
    const { customerIntelligenceService } = await import(
      '../src/domain/visitorIntelligence/services/customerIntelligenceService.ts'
    );

    const visRepo = new VisitorIntelligenceRepositoryPostgres();
    const enqRepo = new EnquiryRepositoryPostgres();

    // 1. Standard flow: Visitor and session exist in PostgreSQL before enquiry insertion
    const validVisId = `test_pg_live_vis_enq_${Date.now()}`;
    const validSessId = `test_pg_live_sess_enq_${Date.now()}`;

    await visRepo.upsertVisitor({
      id: validVisId,
      landingPath: '/projects/test-project',
      incrementSessionCount: false,
    });
    await visRepo.upsertSession({
      id: validSessId,
      visitorId: validVisId,
      entryPath: '/projects/test-project',
    });

    const validEnquiry = await enqRepo.create({
      contextType: 'PROJECT',
      visitorId: validVisId,
      sessionId: validSessId,
      buyerName: 'Valid Attribution Buyer',
      buyerPhone: '+919876500001',
      preferredContact: 'PHONE',
      message: 'Testing valid enquiry attribution',
    });

    check(
      validEnquiry.id && validEnquiry.visitorId === validVisId && validEnquiry.sessionId === validSessId,
      'PG-ENQ-FK-1.1',
      'Enquiry created with valid pre-existing visitorId and sessionId foreign keys'
    );

    // 2. Opt-out flow: Visitor has opted out of telemetry; visitorId and sessionId are null
    const optedOutEnquiry = await enqRepo.create({
      contextType: 'PROJECT',
      visitorId: null,
      sessionId: null,
      buyerName: 'Opted Out Buyer',
      buyerPhone: '+919876500002',
      preferredContact: 'WHATSAPP',
      message: 'Opted out enquiry test',
    });

    check(
      optedOutEnquiry.id && optedOutEnquiry.visitorId === null && optedOutEnquiry.sessionId === null,
      'PG-ENQ-FK-1.2',
      'Opt-out enquiry created successfully with NULL visitor_id and session_id'
    );

    // 3. Direct violation flow: Direct insert with non-existent foreign keys fails as expected
    let fkViolationCaught = false;
    try {
      await enqRepo.create({
        contextType: 'PROJECT',
        visitorId: 'nonexistent_vis_should_fail_fk',
        sessionId: 'nonexistent_sess_should_fail_fk',
        buyerName: 'Dangling Foreign Key Buyer',
        buyerPhone: '+919876500003',
        preferredContact: 'EMAIL',
      });
    } catch (fkErr) {
      if (fkErr.message?.includes('foreign key constraint') || fkErr.code === '23503') {
        fkViolationCaught = true;
      }
    }
    check(
      fkViolationCaught,
      'PG-ENQ-FK-1.3',
      'PostgreSQL foreign key constraints actively reject non-existent visitor_id references'
    );

    // 4. Safe resolution service test: resolveSafeEnquiryAttribution pre-provisions IDs in PostgreSQL
    const resolvedAttribution = await customerIntelligenceService.resolveSafeEnquiryAttribution({
      visitorId: `test_pg_live_unseen_vis_${Date.now()}`,
      sessionId: `test_pg_live_unseen_sess_${Date.now()}`,
      authenticatedCustomerId: null,
      sourcePage: '/projects/merlin-rise',
      ipAddress: '198.51.100.12',
    });

    const safeServiceEnquiry = await enqRepo.create({
      contextType: 'PROJECT',
      visitorId: resolvedAttribution.visitorId,
      sessionId: resolvedAttribution.sessionId,
      buyerName: 'Service Resolved Buyer',
      buyerPhone: '+919876500004',
      preferredContact: 'WHATSAPP',
    });

    check(
      safeServiceEnquiry.id && safeServiceEnquiry.visitorId === resolvedAttribution.visitorId,
      'PG-ENQ-FK-1.4',
      'customerIntelligenceService.resolveSafeEnquiryAttribution pre-provisions rows in PostgreSQL'
    );

    // =========================================================================
    // GROUP 4: PG-CONC-1 — 20 Concurrent Duplicate Events Ingestion
    // =========================================================================
    console.log('\n--- GROUP 4: PG-CONC-1 — 20 Concurrent Duplicate Events ---');

    const concVisId = `test_pg_live_vis_conc_${Date.now()}`;
    const concSessId = `test_pg_live_sess_conc_${Date.now()}`;
    const concClientEventId = `client_evt_conc_test_${Date.now()}`;

    await visRepo.upsertVisitor({
      id: concVisId,
      landingPath: '/projects/conc-test',
    });
    await visRepo.upsertSession({
      id: concSessId,
      visitorId: concVisId,
      entryPath: '/projects/conc-test',
    });

    // Fire 20 identical recordEvent calls concurrently
    const concurrentEventPromises = Array.from({ length: 20 }, (_, idx) =>
      visRepo.recordEvent({
        visitorId: concVisId,
        sessionId: concSessId,
        eventType: 'PROJECT_VIEW',
        pagePath: '/projects/conc-test',
        clientEventId: concClientEventId,
        metadata: { concurrencyTestIndex: idx, action: 'same_action' },
      })
    );

    const concurrentResults = await Promise.all(concurrentEventPromises);
    const nonDeduplicatedCount = concurrentResults.filter((r) => !r.deduplicated).length;
    const deduplicatedCount = concurrentResults.filter((r) => r.deduplicated).length;

    check(
      nonDeduplicatedCount === 1,
      'PG-CONC-1.1',
      `Exactly 1 event accepted as canonical across 20 concurrent requests (got ${nonDeduplicatedCount})`
    );
    check(
      deduplicatedCount === 19,
      'PG-CONC-1.2',
      `Exactly 19 events recognized as duplicates across 20 concurrent requests (got ${deduplicatedCount})`
    );

    // Verify PostgreSQL stored row count
    const storedEventsRes = await pool.query(
      `SELECT COUNT(*)::int as count FROM visitor_events WHERE visitor_id = $1 AND client_event_id = $2`,
      [concVisId, concClientEventId]
    );
    check(
      storedEventsRes.rows[0].count === 1,
      'PG-CONC-1.3',
      'PostgreSQL visitor_events table contains exactly 1 row for the concurrent duplicate burst'
    );

    // Verify session counter update with deduplication protection
    await visRepo.upsertSession({
      id: concSessId,
      visitorId: concVisId,
      incrementPageViews: true,
      incrementEvents: true,
    });
    const sessionAfter = await visRepo.findSessionById(concSessId);
    check(
      sessionAfter?.eventCount === 1 && sessionAfter?.pageViewCount === 1,
      'PG-CONC-1.4',
      'Session event_count incremented exactly once for the canonical event'
    );

    // =========================================================================
    // GROUP 5: PG-CONC-2 — Distinct Legitimate Events & Metadata Deduplication
    // =========================================================================
    console.log('\n--- GROUP 5: PG-CONC-2 — Distinct Legitimate Events & Deduplication ---');

    const distinctVisId = `test_pg_live_vis_distinct_${Date.now()}`;
    const distinctSessId = `test_pg_live_sess_distinct_${Date.now()}`;

    await visRepo.upsertVisitor({ id: distinctVisId, landingPath: '/search' });
    await visRepo.upsertSession({ id: distinctSessId, visitorId: distinctVisId, entryPath: '/search' });

    // 1. Two searches with different queries within the same second
    const search1 = await visRepo.recordEvent({
      visitorId: distinctVisId,
      sessionId: distinctSessId,
      eventType: 'SEARCH_EXECUTED',
      pagePath: '/search',
      metadata: { query: '2 BHK Rajarhat' },
    });

    const search2 = await visRepo.recordEvent({
      visitorId: distinctVisId,
      sessionId: distinctSessId,
      eventType: 'SEARCH_EXECUTED',
      pagePath: '/search',
      metadata: { query: '3 BHK New Town' },
    });

    check(
      !search1.deduplicated && !search2.deduplicated && search1.event.id !== search2.event.id,
      'PG-CONC-2.1',
      'Distinct search queries within 3s are preserved and both stored in PostgreSQL'
    );

    // 2. Two different filter selections within the same second
    const filter1 = await visRepo.recordEvent({
      visitorId: distinctVisId,
      sessionId: distinctSessId,
      eventType: 'FILTER_APPLIED',
      pagePath: '/projects',
      metadata: { filterName: 'budget', budgetMin: 5000000 },
    });

    const filter2 = await visRepo.recordEvent({
      visitorId: distinctVisId,
      sessionId: distinctSessId,
      eventType: 'FILTER_APPLIED',
      pagePath: '/projects',
      metadata: { filterName: 'budget', budgetMin: 8000000 },
    });

    check(
      !filter1.deduplicated && !filter2.deduplicated && filter1.event.id !== filter2.event.id,
      'PG-CONC-2.2',
      'Distinct filter selections within 3s are preserved and both stored in PostgreSQL'
    );

    // 3. Two different floor-plan interactions within the same second
    const floorPlan1 = await visRepo.recordEvent({
      visitorId: distinctVisId,
      sessionId: distinctSessId,
      eventType: 'FLOOR_PLAN_VIEW',
      pagePath: '/projects/merlin-rise',
      metadata: { unitConfigId: 'cfg-2bhk-type-a' },
    });

    const floorPlan2 = await visRepo.recordEvent({
      visitorId: distinctVisId,
      sessionId: distinctSessId,
      eventType: 'FLOOR_PLAN_VIEW',
      pagePath: '/projects/merlin-rise',
      metadata: { unitConfigId: 'cfg-3bhk-type-b' },
    });

    check(
      !floorPlan1.deduplicated && !floorPlan2.deduplicated && floorPlan1.event.id !== floorPlan2.event.id,
      'PG-CONC-2.3',
      'Distinct floor plan unit configuration views within 3s are preserved in PostgreSQL'
    );

    // 4. Retry of Search 1 with identical payload is deduplicated
    const search1Retry = await visRepo.recordEvent({
      visitorId: distinctVisId,
      sessionId: distinctSessId,
      eventType: 'SEARCH_EXECUTED',
      pagePath: '/search',
      metadata: { query: '2 BHK Rajarhat' },
    });

    check(
      search1Retry.deduplicated === true && search1Retry.event.id === search1.event.id,
      'PG-CONC-2.4',
      'Identical search query retry within window is correctly deduplicated'
    );

    // 5. Sensitive metadata exclusion check
    const piiEvent = await visRepo.recordEvent({
      visitorId: distinctVisId,
      sessionId: distinctSessId,
      eventType: 'CONTACT_FORM_INTERACTION',
      pagePath: '/contact',
      metadata: {
        buyerPhone: '+919876543210',
        buyerEmail: 'sensitive_test@example.com',
        otpToken: '984321',
        action: 'focus_input',
      },
    });

    const clientEventId = piiEvent.event.clientEventId || '';
    check(
      !clientEventId.includes('9876543210') &&
      !clientEventId.includes('sensitive_test') &&
      !clientEventId.includes('984321'),
      'PG-CONC-2.5',
      'Client event identity hash does NOT leak sensitive PII tokens into stored keys'
    );

    // =========================================================================
    // GROUP 6: PG-CONC-3 — Conflicting Customer Link Protection
    // =========================================================================
    console.log('\n--- GROUP 6: PG-CONC-3 — Conflicting Customer Links Protection ---');

    const { CustomerRepositoryPostgres } = await import(
      '../src/infrastructure/repositories/postgres/customerRepositoryPostgres.ts'
    );
    const custRepo = new CustomerRepositoryPostgres();

    const custAId = `test_pg_live_cust_a_${Date.now()}`;
    const custBId = `test_pg_live_cust_b_${Date.now()}`;

    await custRepo.create({
      id: custAId,
      email: `customer_a_${Date.now()}@example.com`,
      name: 'Customer A',
      phone: '+919876500010',
    });

    await custRepo.create({
      id: custBId,
      email: `customer_b_${Date.now()}@example.com`,
      name: 'Customer B',
      phone: '+919876500020',
    });

    const raceVisId = `test_pg_live_vis_race_${Date.now()}`;
    await visRepo.upsertVisitor({ id: raceVisId, landingPath: '/home' });

    // Simultaneous attempts to link the same visitor to Customer A and Customer B
    const linkPromises = [
      visRepo.linkVisitorToCustomer(raceVisId, custAId),
      visRepo.linkVisitorToCustomer(raceVisId, custBId),
    ];

    const linkResults = await Promise.all(linkPromises);
    const successLink = linkResults.find((r) => r.linked);
    const conflictLink = linkResults.find((r) => r.conflictDifferentCustomer);

    check(
      Boolean(successLink) && Boolean(conflictLink),
      'PG-CONC-3.1',
      'Under concurrent conflicting link attempts, exactly 1 succeeds and 1 reports conflict'
    );

    // Verify visitor record in PostgreSQL is permanently bound to the winner and NOT overwritten
    const linkedVisitor = await visRepo.findVisitorById(raceVisId);
    const winnerCustId = linkedVisitor?.customerId;
    check(
      winnerCustId === custAId || winnerCustId === custBId,
      'PG-CONC-3.2',
      `Visitor customer_id stably bound to winner (${winnerCustId}) without dirty overwrite`
    );

    // Subsequent link attempt with the other customer is rejected deterministically
    const losingCustId = winnerCustId === custAId ? custBId : custAId;
    const secondAttempt = await visRepo.linkVisitorToCustomer(raceVisId, losingCustId);
    check(
      secondAttempt.linked === false && secondAttempt.conflictDifferentCustomer === true,
      'PG-CONC-3.3',
      'Subsequent link attempt with different customer rejected with conflictDifferentCustomer=true'
    );

    // =========================================================================
    // GROUP 7: PG-RET-1 — Bounded Retention Purge & Cascade Deletion
    // =========================================================================
    console.log('\n--- GROUP 7: PG-RET-1 — Bounded Retention Purge & Cascade Deletion ---');

    // Create 3 expired anonymous visitors (100 days old)
    const oldDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000);
    const expVis1 = `test_pg_live_vis_exp1_${Date.now()}`;
    const expVis2 = `test_pg_live_vis_exp2_${Date.now()}`;
    const expVis3 = `test_pg_live_vis_exp3_${Date.now()}`;

    for (const expId of [expVis1, expVis2, expVis3]) {
      await pool.query(
        `INSERT INTO visitors (id, first_seen_at, last_seen_at, created_at, updated_at) VALUES ($1, $2, $2, $2, $2);`,
        [expId, oldDate]
      );
      const expSessId = `sess_${expId}`;
      await pool.query(
        `INSERT INTO visitor_sessions (id, visitor_id, started_at, last_activity_at, created_at, updated_at) VALUES ($1, $2, $3, $3, $3, $3);`,
        [expSessId, expId, oldDate]
      );
      await pool.query(
        `INSERT INTO visitor_events (id, visitor_id, session_id, event_type, occurred_at) VALUES ($1, $2, $3, 'PAGE_VIEW', $4);`,
        [`evt_${expId}`, expId, expSessId, oldDate]
      );
    }

    // Attach an enquiry to expired visitor 1 to test ON DELETE SET NULL foreign key constraint
    const enquiryWithExpiredAttribution = await enqRepo.create({
      contextType: 'PROJECT',
      visitorId: expVis1,
      sessionId: `sess_${expVis1}`,
      buyerName: 'Retention Enquiry Buyer',
      buyerPhone: '+919876599999',
      preferredContact: 'WHATSAPP',
    });

    // Create 1 active anonymous visitor (1 day old)
    const activeVis = `test_pg_live_vis_active_${Date.now()}`;
    await pool.query(
      `INSERT INTO visitors (id, first_seen_at, last_seen_at, created_at, updated_at) VALUES ($1, now(), now(), now(), now());`,
      [activeVis]
    );

    // Create 1 customer-linked visitor with old date (should NOT be purged because it is linked)
    const linkedOldVis = `test_pg_live_vis_linked_old_${Date.now()}`;
    await pool.query(
      `INSERT INTO visitors (id, customer_id, first_seen_at, last_seen_at, created_at, updated_at) VALUES ($1, $2, $3, $3, $3, $3);`,
      [linkedOldVis, custAId, oldDate]
    );

    // Run purge with batchSize=2 to test bounded batching
    const purgeBatch1 = await visRepo.purgeExpiredAnonymousTelemetry(90, 2);
    check(
      purgeBatch1.deletedVisitors === 2,
      'PG-RET-1.1',
      `Bounded batch retention purge deleted exactly 2 visitors in first batch (got ${purgeBatch1.deletedVisitors})`
    );

    // Run second batch to clean up remaining 1 expired visitor
    const purgeBatch2 = await visRepo.purgeExpiredAnonymousTelemetry(90, 2);
    check(
      purgeBatch2.deletedVisitors === 1,
      'PG-RET-1.2',
      `Second batch purge deleted remaining 1 expired visitor (got ${purgeBatch2.deletedVisitors})`
    );

    // Verify cascade deletion of sessions and events
    const remainingEventsRes = await pool.query(
      `SELECT COUNT(*)::int as count FROM visitor_events WHERE visitor_id IN ($1, $2, $3)`,
      [expVis1, expVis2, expVis3]
    );
    check(
      remainingEventsRes.rows[0].count === 0,
      'PG-RET-1.3',
      'Child visitor_events rows were automatically CASCADE deleted by PostgreSQL foreign key'
    );

    // Verify ON DELETE SET NULL on enquiries
    const updatedEnquiry = await enqRepo.findById(enquiryWithExpiredAttribution.id);
    check(
      updatedEnquiry !== null && updatedEnquiry.visitorId === null && updatedEnquiry.sessionId === null,
      'PG-RET-1.4',
      'Enquiry row preserved and foreign key fields safely SET NULL on visitor deletion'
    );

    // Verify active visitor and customer-linked visitor were preserved
    const activeCheck = await visRepo.findVisitorById(activeVis);
    const linkedOldCheck = await visRepo.findVisitorById(linkedOldVis);
    check(
      activeCheck !== null && linkedOldCheck !== null,
      'PG-RET-1.5',
      'Active unlinked visitors and customer-linked visitors are safely preserved from retention purge'
    );

    // =========================================================================
    // GROUP 8: PG-CUST360-ADMIN-1 — Fresh Schema Customer 360 Admin Service Verification
    // =========================================================================
    console.log('\n--- GROUP 8: PG-CUST360-ADMIN-1 — Customer 360 Admin Service on Fresh Schema ---');

    // 1. Overview succeeds on fresh schema without site_visits table
    const liveOverview = await customerIntelligenceService.getOverview({ canViewPii: true });
    check(
      liveOverview && typeof liveOverview.kpis.customersWithSiteVisits === 'number' && liveOverview.kpis.customersWithSiteVisits === 0,
      'PG-CUST360-ADMIN-1.1',
      'Customer 360 overview succeeds against fresh PostgreSQL database when site_visits is absent (customersWithSiteVisits=0)'
    );

    // 2. Customer list succeeds on fresh schema without site_visits table
    const liveCustList = await customerIntelligenceService.listCustomers(
      { limit: 10 },
      { staffId: 'staff-live-admin', role: 'ADMIN', canViewPii: true }
    );
    check(
      liveCustList && Array.isArray(liveCustList.items),
      'PG-CUST360-ADMIN-1.2',
      'Customer directory list succeeds against fresh PostgreSQL database when site_visits is absent'
    );

    // 3. Customer 360 detail succeeds on fresh schema without site_visits table
    const liveCustDetail = await customerIntelligenceService.getCustomer360(
      custAId,
      { staffId: 'staff-live-admin', role: 'ADMIN', canViewPii: true }
    );
    check(
      liveCustDetail && Array.isArray(liveCustDetail.siteVisits) && liveCustDetail.siteVisits.length === 0,
      'PG-CUST360-ADMIN-1.3',
      'Customer 360 profile succeeds against fresh PostgreSQL database when site_visits is absent (siteVisits=[])'
    );

    // =========================================================================
    // Clean up Test Fixtures (Strictly Scoped by 'test_pg_live_%' prefix)
    // =========================================================================
    await pool.query(`DELETE FROM enquiries WHERE id LIKE 'test_pg_live_%';`);
    await pool.query(`DELETE FROM visitor_events WHERE visitor_id LIKE 'test_pg_live_%';`);
    await pool.query(`DELETE FROM visitor_sessions WHERE visitor_id LIKE 'test_pg_live_%';`);
    await pool.query(`DELETE FROM visitors WHERE id LIKE 'test_pg_live_%';`);
    await pool.query(`DELETE FROM customers WHERE id LIKE 'test_pg_live_%';`);

    console.log('\n================================================================================');
    console.log(`LIVE POSTGRESQL VERIFICATION FINISHED: ${passedCount} PASSED, ${failedCount} FAILED, ${blockedCount} BLOCKED`);
    console.log('================================================================================');

    if (failedCount > 0) {
      process.exit(1);
    }
    process.exit(0);
  } finally {
    await pool.end();
  }
}

runLivePostgresSuite().catch((err) => {
  console.error('\n\x1b[31m[UNHANDLED ERROR IN LIVE POSTGRESQL SUITE]\x1b[0m', err);
  process.exit(1);
});
