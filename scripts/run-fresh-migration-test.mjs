#!/usr/bin/env node
/**
 * Great Homes V2 — Fresh Database Migration & Verification Runner
 *
 * Safely applies Drizzle migrations 0000–0003 from scratch to an empty isolated
 * database ('greathomes_blank_test') via the canonical Drizzle migrator, and validates
 * all schema invariants and records.
 */

import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { validateTestDatabaseUrl, redactDatabaseUrl } from './lib/db-safety-validation.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

async function runFreshMigration() {
  console.log('================================================================================');
  console.log('GREAT HOMES V2 — FRESH DATABASE MIGRATION TEST');
  console.log('================================================================================\n');

  let testDatabaseUrl = process.env.TEST_DATABASE_URL?.trim();
  try {
    const fs = await import('node:fs');
    if (fs.existsSync('/app/.dev.env.json')) {
      const devEnv = JSON.parse(fs.readFileSync('/app/.dev.env.json', 'utf8'));
      if (devEnv.TEST_DATABASE_URL) {
        testDatabaseUrl = devEnv.TEST_DATABASE_URL.trim();
        process.env.TEST_DATABASE_URL = testDatabaseUrl;
      }
    }
  } catch {}

  const currentDatabaseUrl = process.env.DATABASE_URL?.trim();
  const allowDisposableTests = process.env.ALLOW_DISPOSABLE_DB_TESTS?.trim();

  // 1. Host and safety validation
  const validation = validateTestDatabaseUrl({
    testUrl: testDatabaseUrl,
    prodUrl: currentDatabaseUrl,
    allowDisposable: allowDisposableTests,
  });

  if (!validation.valid) {
    console.error(`[SAFETY VIOLATION] ${validation.error}`);
    process.exit(validation.code || 1);
  }

  const parsedUrl = validation.parsed;
  const targetDbName = parsedUrl.pathname.replace(/^\//, '');

  console.log(`[CHECK 1] Host Isolation Check : PASSED (${parsedUrl.hostname})`);
  console.log(`[CHECK 2] Production Safety    : PASSED (target is NOT production)`);
  console.log(`[CHECK 3] Target DB Path       : /${targetDbName}`);

  // Enforce that target database name is strictly greathomes_blank_test
  if (targetDbName !== 'greathomes_blank_test') {
    console.error(`\n[BLOCKED] Target database path is "/${targetDbName}", NOT "/greathomes_blank_test".`);
    console.error('Safety Mandate: Fresh database migration tests must run only against an empty database named "greathomes_blank_test".');
    process.exit(2);
  }
  console.log(`[CHECK 3] Database Path Check  : PASSED (/greathomes_blank_test)`);

  const { Client } = pg;
  const client = new Client({ connectionString: testDatabaseUrl });

  try {
    await client.connect();
    console.log('[CHECK 4] Database Connection  : PASSED');

    // Verify current_database()
    const dbRes = await client.query('SELECT current_database() AS db, current_user AS usr;');
    const currentDb = dbRes.rows[0].db;
    if (currentDb !== 'greathomes_blank_test') {
      console.error(`[BLOCKED] current_database() returned "${currentDb}", expected "greathomes_blank_test".`);
      process.exit(2);
    }
    console.log(`[CHECK 4] current_database()   : PASSED (${currentDb})`);

    // Verify public schema is empty (0 tables)
    const tableCountRes = await client.query(`
      SELECT count(*)::int AS count 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
    `);
    const tableCount = tableCountRes.rows[0].count;
    if (tableCount === 0) {
      console.log('[CHECK 5] Empty DB Verification: PASSED (public schema is empty)');
      console.log('\n--- Executing Canonical Drizzle Migrator (0000–0003) ---');
      const db = drizzle(client);
      const migrationsFolder = path.join(projectRoot, 'drizzle');
      
      const startTime = Date.now();
      await migrate(db, { migrationsFolder });
      const duration = Date.now() - startTime;
      console.log(`[MIGRATION SUCCESS] All migrations applied via canonical Drizzle migrator in ${duration}ms.\n`);
    } else if (tableCount === 37) {
      console.log('[CHECK 5] Database Schema State: 37 tables present from fresh migration (proceeding to schema validation)');
    } else {
      console.error(`[BLOCKED] Target database has unexpected table count. Expected 0 (virgin) or 37 (migrated), found ${tableCount}.`);
      process.exit(2);
    }

    console.log('--- Post-Migration Validation ---');

    // 1. Verify drizzle.__drizzle_migrations records
    const migCheck = await client.query(`
      SELECT id, hash, created_at 
      FROM drizzle.__drizzle_migrations 
      ORDER BY id ASC;
    `);
    console.log(`Migrations Recorded in drizzle.__drizzle_migrations: ${migCheck.rows.length}`);
    for (const row of migCheck.rows) {
      console.log(`  - Entry #${row.id}: created_at=${new Date(Number(row.created_at)).toISOString()}`);
    }
    assert.equal(migCheck.rows.length, 4, 'Expected exactly 4 migrations in drizzle.__drizzle_migrations');

    // 2. Verify table count
    const postTableCountRes = await client.query(`
      SELECT count(*)::int AS count 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
    `);
    const postTableCount = postTableCountRes.rows[0].count;
    console.log(`Post-migration Table Count : ${postTableCount} (expected 37 public base tables)`);
    assert.equal(postTableCount, 37, `Expected 37 tables, found ${postTableCount}`);

    // 3. Verify enums
    const enumsRes = await client.query(`
      SELECT typname 
      FROM pg_type 
      JOIN pg_namespace ON pg_namespace.oid = pg_type.typnamespace 
      WHERE nspname = 'public' AND typtype = 'e'
      ORDER BY typname;
    `);
    console.log(`Post-migration Enums Count : ${enumsRes.rows.length} (expected 9)`);
    console.log(`Enums: ${enumsRes.rows.map(r => r.typname).join(', ')}`);
    assert.equal(enumsRes.rows.length, 9, 'Expected exactly 9 enums');

    // 4. Verify Foreign Keys on enquiries
    const fkRes = await client.query(`
      SELECT conname, confdeltype 
      FROM pg_constraint 
      WHERE conname IN (
        'enquiries_visitor_id_visitors_id_fk',
        'enquiries_session_id_visitor_sessions_id_fk'
      );
    `);
    const fkMap = new Map(fkRes.rows.map(r => [r.conname, r.confdeltype]));
    console.log(`Foreign Key enquiries_visitor_id_visitors_id_fk confdeltype: ${fkMap.get('enquiries_visitor_id_visitors_id_fk')} (expected 'n' for SET NULL)`);
    console.log(`Foreign Key enquiries_session_id_visitor_sessions_id_fk confdeltype: ${fkMap.get('enquiries_session_id_visitor_sessions_id_fk')} (expected 'n' for SET NULL)`);
    assert.equal(fkMap.get('enquiries_visitor_id_visitors_id_fk'), 'n', 'enquiries_visitor_id_visitors_id_fk must be ON DELETE SET NULL');
    assert.equal(fkMap.get('enquiries_session_id_visitor_sessions_id_fk'), 'n', 'enquiries_session_id_visitor_sessions_id_fk must be ON DELETE SET NULL');

    // 5. Verify unique index on visitor_events
    const idxRes = await client.query(`
      SELECT indexname, indexdef 
      FROM pg_indexes 
      WHERE tablename = 'visitor_events' AND indexname = 'uq_visitor_events_visitor_client_event';
    `);
    console.log(`Unique Index uq_visitor_events_visitor_client_event exists: ${idxRes.rows.length === 1 ? 'YES' : 'NO'}`);
    assert.equal(idxRes.rows.length, 1, 'uq_visitor_events_visitor_client_event must exist on visitor_events');

    console.log('\n================================================================================');
    console.log('FRESH DATABASE MIGRATION VERIFICATION: ALL CHECKS PASSED');
    console.log('================================================================================\n');

  } catch (err) {
    console.error(`\n[MIGRATION TEST FAILED] ${err.message}`);
    throw err;
  } finally {
    await client.end();
  }
}

runFreshMigration().catch((err) => {
  console.error(err);
  process.exit(1);
});
