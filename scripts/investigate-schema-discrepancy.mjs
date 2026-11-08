/**
 * Great Homes V2 — Read-Only Schema Discrepancy Investigation
 *
 * Strictly executes read-only inspection queries against TEST_DATABASE_URL
 * targeting 'greathomes_blank_test' only.
 */

import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateTestDatabaseUrl } from './lib/db-safety-validation.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

async function investigate() {
  console.log('================================================================================');
  console.log('GREAT HOMES V2 — READ-ONLY SCHEMA DISCREPANCY INVESTIGATION');
  console.log('================================================================================\n');

  let testDatabaseUrl = process.env.TEST_DATABASE_URL?.trim();
  try {
    if (fs.existsSync('/app/.dev.env.json')) {
      const devEnv = JSON.parse(fs.readFileSync('/app/.dev.env.json', 'utf8'));
      if (devEnv.TEST_DATABASE_URL) {
        testDatabaseUrl = devEnv.TEST_DATABASE_URL.trim();
        process.env.TEST_DATABASE_URL = testDatabaseUrl;
      }
    }
  } catch {}

  const currentDatabaseUrl = process.env.DATABASE_URL?.trim();
  const allowDisposableTests = process.env.ALLOW_DISPOSABLE_DB_TESTS?.trim() || '1';

  const validation = validateTestDatabaseUrl({
    testUrl: testDatabaseUrl,
    prodUrl: currentDatabaseUrl,
    allowDisposable: allowDisposableTests,
  });

  if (!validation.valid) {
    console.error(`[SAFETY VIOLATION] ${validation.error}`);
    process.exit(1);
  }

  const { Client } = pg;
  const client = new Client({ connectionString: testDatabaseUrl });

  try {
    await client.connect();

    // 1. Connection & Safety verification
    const dbInfo = await client.query('SELECT current_database(), current_user, version();');
    console.log('--- 1. CONNECTION VERIFICATION ---');
    console.log(`current_database() : ${dbInfo.rows[0].current_database}`);
    console.log(`current_user       : ${dbInfo.rows[0].current_user}`);
    console.log(`Compute host       : ${validation.parsed.hostname} (ISOLATED TEST ENDPOINT)`);
    console.log(`PostgreSQL Version : ${dbInfo.rows[0].version.split(' on ')[0]}`);

    if (dbInfo.rows[0].current_database !== 'greathomes_blank_test') {
      throw new Error(`Target database is not greathomes_blank_test! Aborting.`);
    }

    // 2. Objects in public schema by table_type
    console.log('\n--- 2. PUBLIC SCHEMA OBJECTS BY TYPE ---');
    const typeRes = await client.query(`
      SELECT table_type, count(*)::int AS count
      FROM information_schema.tables
      WHERE table_schema = 'public'
      GROUP BY table_type
      ORDER BY table_type;
    `);
    for (const r of typeRes.rows) {
      console.log(`  Table Type '${r.table_type}': ${r.count}`);
    }

    // List all base tables in public schema
    const baseTablesRes = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);
    console.log(`\nBase Tables in 'public' (${baseTablesRes.rows.length}):`);
    baseTablesRes.rows.forEach((r, i) => console.log(`  ${(i + 1).toString().padStart(2)}. ${r.table_name}`));

    // List views in public schema
    const viewsRes = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'VIEW'
      ORDER BY table_name;
    `);
    console.log(`\nViews in 'public' (${viewsRes.rows.length}):`);
    viewsRes.rows.forEach((r, i) => console.log(`  ${(i + 1).toString().padStart(2)}. ${r.table_name}`));

    // 3. Tables and views in other non-system schemas
    console.log('\n--- 3. OBJECTS IN OTHER NON-SYSTEM SCHEMAS ---');
    const otherSchemasRes = await client.query(`
      SELECT table_schema, table_type, count(*)::int AS count
      FROM information_schema.tables
      WHERE table_schema NOT IN ('information_schema', 'pg_catalog')
      GROUP BY table_schema, table_type
      ORDER BY table_schema, table_type;
    `);
    for (const r of otherSchemasRes.rows) {
      console.log(`  Schema: '${r.table_schema}', Type: '${r.table_type}', Count: ${r.count}`);
    }

    const drizzleTablesRes = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'drizzle'
      ORDER BY table_name;
    `);
    console.log(`\nTables in 'drizzle' schema (${drizzleTablesRes.rows.length}):`);
    drizzleTablesRes.rows.forEach((r, i) => console.log(`  ${(i + 1).toString().padStart(2)}. ${r.table_name}`));

    // 4. PostgreSQL Enums in public schema
    console.log('\n--- 4. ENUMS IN PUBLIC SCHEMA ---');
    const enumsRes = await client.query(`
      SELECT typname, count(enumlabel)::int AS label_count
      FROM pg_type t
      JOIN pg_namespace n ON n.oid = t.typnamespace
      JOIN pg_enum e ON e.enumtypid = t.oid
      WHERE n.nspname = 'public' AND t.typtype = 'e'
      GROUP BY typname
      ORDER BY typname;
    `);
    console.log(`Total Enums in 'public': ${enumsRes.rows.length}`);
    for (const r of enumsRes.rows) {
      console.log(`  Enum '${r.typname}' (${r.label_count} values)`);
    }

    // 5. Installed extensions
    console.log('\n--- 5. INSTALLED EXTENSIONS ---');
    const extRes = await client.query(`
      SELECT extname, extversion, extnamespace::regnamespace::text AS schema
      FROM pg_extension
      ORDER BY extname;
    `);
    console.log(`Extensions installed (${extRes.rows.length}):`);
    extRes.rows.forEach((r) => console.log(`  - ${r.extname} (v${r.extversion}, schema: ${r.schema})`));

    // 6. Migration journal verification in drizzle.__drizzle_migrations
    console.log('\n--- 6. MIGRATION JOURNAL IN DRIZZLE.__DRIZZLE_MIGRATIONS ---');
    const journalRes = await client.query(`
      SELECT id, hash, created_at
      FROM drizzle.__drizzle_migrations
      ORDER BY id ASC;
    `);
    console.log(`Recorded Migrations (${journalRes.rows.length}):`);
    for (const r of journalRes.rows) {
      console.log(`  - Entry #${r.id}: hash=${r.hash.substring(0, 16)}..., created_at=${new Date(Number(r.created_at)).toISOString()}`);
    }

    // 7. Customer 360 integrity verification
    console.log('\n--- 7. CUSTOMER 360 INTEGRITY VERIFICATION ---');
    const fkRes = await client.query(`
      SELECT conname, confdeltype, confrelid::regclass::text AS target_table
      FROM pg_constraint
      WHERE conname IN (
        'enquiries_visitor_id_visitors_id_fk',
        'enquiries_session_id_visitor_sessions_id_fk',
        'enquiries_customer_id_customers_id_fk'
      );
    `);
    console.log(`Foreign Key Constraints on enquiries (${fkRes.rows.length}):`);
    for (const r of fkRes.rows) {
      const action = r.confdeltype === 'n' ? 'SET NULL' : r.confdeltype === 'c' ? 'CASCADE' : r.confdeltype;
      console.log(`  - ${r.conname}: references ${r.target_table} ON DELETE ${action} (confdeltype='${r.confdeltype}')`);
    }

    const idxRes = await client.query(`
      SELECT tablename, indexname, indexdef
      FROM pg_indexes
      WHERE tablename IN ('visitor_events', 'visitors', 'visitor_sessions', 'enquiries')
        AND (indexname LIKE '%visitor%' OR indexname LIKE '%client_event%')
      ORDER BY tablename, indexname;
    `);
    console.log(`\nKey Customer 360 Indexes (${idxRes.rows.length}):`);
    for (const r of idxRes.rows) {
      console.log(`  - ${r.tablename}.${r.indexname}`);
    }

    // 8. Codebase comparison: inspect src/db/schema.ts and drizzle SQL files
    console.log('\n--- 8. DRIZZLE MIGRATION SQL DEFINITIONS BREAKDOWN ---');
    const d0000 = fs.readFileSync(path.join(projectRoot, 'drizzle', '0000_adorable_unus.sql'), 'utf-8');
    const d0001 = fs.readFileSync(path.join(projectRoot, 'drizzle', '0001_project_coordinates.sql'), 'utf-8');
    const d0002 = fs.readFileSync(path.join(projectRoot, 'drizzle', '0002_customer_auth_otp.sql'), 'utf-8');
    const d0003 = fs.readFileSync(path.join(projectRoot, 'drizzle', '0003_visitor_customer_360.sql'), 'utf-8');

    function extractCreatedTables(sql) {
      const matches = [...sql.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:["']?public["']?\.)?["']?([a-zA-Z0-9_]+)["']?/gi)];
      return matches.map(m => m[1]);
    }

    const t0 = extractCreatedTables(d0000);
    const t1 = extractCreatedTables(d0001);
    const t2 = extractCreatedTables(d0002);
    const t3 = extractCreatedTables(d0003);

    console.log(`Tables defined in 0000_adorable_unus.sql      : ${t0.length}`);
    console.log(`Tables defined in 0001_project_coordinates.sql : ${t1.length} (ALTER TABLE only)`);
    console.log(`Tables defined in 0002_customer_auth_otp.sql   : ${t2.length} (${t2.join(', ')})`);
    console.log(`Tables defined in 0003_visitor_customer_360.sql: ${t3.length} (${t3.join(', ')})`);

    const allMigrationTables = new Set([...t0, ...t1, ...t2, ...t3]);
    console.log(`Total unique tables defined in migrations 0000–0003: ${allMigrationTables.size}`);

    // Diff between migration tables and actual public base tables
    const actualBaseTableNames = new Set(baseTablesRes.rows.map(r => r.table_name));
    const missingInDb = [...allMigrationTables].filter(t => !actualBaseTableNames.has(t));
    const extraInDb = [...actualBaseTableNames].filter(t => !allMigrationTables.has(t));

    console.log(`\nComparison between Migration Files and greathomes_blank_test:`);
    console.log(`  - Tables defined in migrations: ${allMigrationTables.size}`);
    console.log(`  - Base tables in public schema: ${actualBaseTableNames.size}`);
    console.log(`  - Missing in DB from migrations: ${missingInDb.length === 0 ? 'NONE' : missingInDb.join(', ')}`);
    console.log(`  - Extra in DB not in migrations: ${extraInDb.length === 0 ? 'NONE' : extraInDb.join(', ')}`);

  } finally {
    await client.end();
  }
}

investigate().catch((err) => {
  console.error('Investigation error:', err.message);
  process.exit(1);
});
