import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';

const ADVISORY_LOCK_KEY = 625629901;

interface JournalEntry {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
}

interface JournalFile {
  version: string;
  dialect: string;
  entries: JournalEntry[];
}

function normalizeDatabaseUrl(rawUrl: string): string {
  if (
    rawUrl.includes('sslmode=') &&
    !rawUrl.includes('uselibpqcompat=') &&
    !rawUrl.includes('sslmode=verify-full')
  ) {
    return rawUrl.replace(/sslmode=(require|prefer|verify-ca)/g, 'sslmode=verify-full');
  }
  return rawUrl;
}

function splitMigrationStatements(sqlContent: string): string[] {
  return sqlContent
    .split(/-->\s*statement-breakpoint/g)
    .map((chunk) => chunk.trim())
    .filter((chunk) => {
      if (!chunk) return false;
      const withoutLineComments = chunk
        .split('\n')
        .filter((line) => !line.trim().startsWith('--'))
        .join('\n')
        .trim();
      return withoutLineComments.length > 0;
    });
}

function loadAndValidateJournal(drizzleDir: string): Array<JournalEntry & { filePath: string; sql: string; hash: string }> {
  const journalPath = path.join(drizzleDir, 'meta', '_journal.json');
  if (!fs.existsSync(journalPath)) {
    throw new Error(`Migration journal not found at ${journalPath}`);
  }
  const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8')) as JournalFile;
  if (!Array.isArray(journal.entries) || journal.entries.length === 0) {
    throw new Error('Migration journal has no entries.');
  }

  const seenIdx = new Set<number>();
  const seenTags = new Set<string>();
  let prevWhen = -1;

  return journal.entries.map((entry, position) => {
    if (typeof entry.idx !== 'number' || entry.idx !== position || seenIdx.has(entry.idx)) {
      throw new Error(`Invalid or non-contiguous journal idx at position ${position}: ${entry.idx}`);
    }
    seenIdx.add(entry.idx);

    if (typeof entry.tag !== 'string' || !entry.tag.trim() || seenTags.has(entry.tag)) {
      throw new Error(`Invalid or duplicate migration tag at idx ${entry.idx}: ${entry.tag}`);
    }
    seenTags.add(entry.tag);

    if (typeof entry.when !== 'number' || entry.when <= prevWhen) {
      throw new Error(`Non-increasing journal timestamp at idx ${entry.idx} (${entry.tag}): ${entry.when}`);
    }
    prevWhen = entry.when;

    const filePath = path.join(drizzleDir, `${entry.tag}.sql`);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Missing migration SQL file for journal entry ${entry.tag}`);
    }
    const sql = fs.readFileSync(filePath, 'utf8');
    const hash = crypto.createHash('sha256').update(sql).digest('hex');

    return {
      ...entry,
      filePath,
      sql,
      hash,
    };
  });
}

async function verifySchemaIntegrity(client: Client): Promise<void> {
  const requiredTables = [
    'customers',
    'customer_otp_challenges',
    'customer_auth_sessions',
    'customer_partner_profiles',
    'customer_partner_audit_history',
    'property_submissions',
    'property_submission_reviews',
    'partner_attestations',
    'property_submission_duplicate_flags',
    'property_submission_change_requests',
    'resale_listings',
    'rental_listings',
    'site_visits',
    'enquiries',
    'audit_logs',
    'media_assets',
    'notifications',
    'rate_limit_buckets',
  ];

  const tablesRes = await client.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = ANY($1::text[])`,
    [requiredTables]
  );
  const foundTables = new Set(tablesRes.rows.map((r) => r.tablename));
  const missingTables = requiredTables.filter((t) => !foundTables.has(t));
  if (missingTables.length > 0) {
    throw new Error(`Post-migration verification failed: missing tables: ${missingTables.join(', ')}`);
  }

  // Verify ON DELETE RESTRICT evidentiary FKs (confdeltype = 'r')
  const fkRes = await client.query<{ conname: string; relname: string; confdeltype: string }>(`
    SELECT c.conname, cls.relname, c.confdeltype::text AS confdeltype
    FROM pg_constraint c
    JOIN pg_class cls ON cls.oid = c.conrelid
    WHERE c.contype = 'f'
      AND cls.relname IN (
        'property_submissions',
        'property_submission_reviews',
        'partner_attestations',
        'customer_partner_profiles',
        'customer_partner_audit_history'
      )
  `);

  const restrictChecks: Array<{ table: string; pattern: string }> = [
    { table: 'property_submissions', pattern: 'submitter_customer_id' },
    { table: 'property_submission_reviews', pattern: 'submission_id' },
    { table: 'partner_attestations', pattern: 'fk_partner_attestation_ownership' },
    { table: 'customer_partner_profiles', pattern: 'customer_id' },
    { table: 'customer_partner_audit_history', pattern: 'customer_id' },
  ];

  for (const check of restrictChecks) {
    const matching = fkRes.rows.filter(
      (r) => r.relname === check.table && r.conname.includes(check.pattern)
    );
    if (matching.length === 0 || matching.some((r) => r.confdeltype !== 'r')) {
      throw new Error(
        `Post-migration verification failed: expected ON DELETE RESTRICT FK matching ${check.table}.${check.pattern}`
      );
    }
  }

  // Verify immutability triggers
  const trgRes = await client.query<{ tgname: string }>(`
    SELECT tgname
    FROM pg_trigger
    WHERE NOT tgisinternal
      AND tgname IN (
        'trg_partner_attestations_immutable',
        'trg_property_submission_reviews_immutable',
        'trg_customer_partner_audit_immutable',
        'trg_prevent_truncate_attestations',
        'trg_prevent_truncate_reviews',
        'trg_prevent_truncate_audit'
      )
  `);
  const foundTriggers = new Set(trgRes.rows.map((r) => r.tgname));
  if (foundTriggers.size < 6) {
    throw new Error(`Post-migration verification failed: expected 6 immutability triggers, found ${foundTriggers.size}`);
  }

  // Verify plot_area numeric(12,2) on resale_listings and rental_listings
  const plotColRes = await client.query<{
    table_name: string;
    data_type: string;
    numeric_precision: number | null;
    numeric_scale: number | null;
  }>(`
    SELECT table_name, data_type, numeric_precision, numeric_scale
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('resale_listings', 'rental_listings')
      AND column_name = 'plot_area'
  `);
  if (
    plotColRes.rows.length !== 2 ||
    plotColRes.rows.some(
      (r) => r.data_type !== 'numeric' || r.numeric_precision !== 12 || r.numeric_scale !== 2
    )
  ) {
    throw new Error('Post-migration verification failed: plot_area must be numeric(12,2) on resale_listings and rental_listings');
  }

  // Verify required unique indexes
  const requiredIndexes = [
    'idx_customers_canonical_phone_unique',
    'uq_resale_listings_slug_not_null',
    'uq_rental_listings_slug_not_null',
    'uq_site_visits_active_enquiry_slot',
    'uq_enquiries_idempotency_key',
  ];
  const idxRes = await client.query<{ indexname: string }>(
    `SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname = ANY($1::text[])`,
    [requiredIndexes]
  );
  const foundIndexes = new Set(idxRes.rows.map((r) => r.indexname));
  const missingIndexes = requiredIndexes.filter((i) => !foundIndexes.has(i));
  if (missingIndexes.length > 0) {
    throw new Error(`Post-migration verification failed: missing unique indexes: ${missingIndexes.join(', ')}`);
  }
}

export async function runMigrations(options?: { preflightOnly?: boolean }) {
  const preflightOnly = options?.preflightOnly ?? process.argv.includes('--preflight-only');

  if (!preflightOnly && process.env.ALLOW_DB_MIGRATIONS !== 'true') {
    throw new Error('MIGRATION ABORTED: ALLOW_DB_MIGRATIONS="true" is strictly required.');
  }

  const rawDatabaseUrl = process.env.DATABASE_URL?.trim();
  if (!rawDatabaseUrl) {
    throw new Error('MIGRATION ABORTED: DATABASE_URL environment variable is missing.');
  }

  const drizzleDir = path.resolve(process.cwd(), 'drizzle');
  const migrations = loadAndValidateJournal(drizzleDir);
  const client = new Client({ connectionString: normalizeDatabaseUrl(rawDatabaseUrl) });

  let advisoryLockAcquired = false;
  await client.connect();

  try {
    const metaRes = await client.query<{ db_name: string; db_user: string; pg_version: string }>(
      `SELECT current_database() AS db_name, current_user AS db_user, version() AS pg_version`
    );
    const meta = metaRes.rows[0];
    const dbName = String(meta?.db_name || '').trim();
    if (!dbName) {
      throw new Error('MIGRATION ABORTED: current_database() returned an empty identifier.');
    }

    const isProdDb = dbName.toLowerCase().includes('production');
    if (isProdDb && process.env.ALLOW_PRODUCTION_MIGRATIONS !== 'true' && !preflightOnly) {
      throw new Error(
        `MIGRATION ABORTED: Target database "${dbName}" is a production database and ALLOW_PRODUCTION_MIGRATIONS="true" is not set.`
      );
    }

    console.log(
      `[db:migrate] Target database: ${dbName} | user: ${meta?.db_user} | mode: ${preflightOnly ? 'PREFLIGHT_ONLY' : 'APPLY'}`
    );

    const lockRes = await client.query<{ locked: boolean }>(
      `SELECT pg_try_advisory_lock($1) AS locked`,
      [ADVISORY_LOCK_KEY]
    );
    if (!lockRes.rows[0]?.locked) {
      throw new Error('MIGRATION ABORTED: Another migration runner holds the PostgreSQL advisory lock.');
    }
    advisoryLockAcquired = true;

    const trackingExistsRes = await client.query<{ reg: string | null }>(
      `SELECT to_regclass('drizzle.__drizzle_migrations')::text AS reg`
    );
    const trackingTableExists = Boolean(trackingExistsRes.rows[0]?.reg);

    let appliedRows: Array<{ id: number; hash: string; created_at: string | number }> = [];
    if (trackingTableExists) {
      const res = await client.query<{ id: number; hash: string; created_at: string | number }>(
        `SELECT id, hash, created_at FROM "drizzle"."__drizzle_migrations" ORDER BY created_at ASC, id ASC`
      );
      appliedRows = res.rows;
    }

    // Verify applied history integrity and contiguous sequence
    const appliedByWhen = new Map<number, { id: number; hash: string }>();
    for (const row of appliedRows) {
      const whenNum = Number(row.created_at);
      if (appliedByWhen.has(whenNum)) {
        throw new Error(`MIGRATION ABORTED: Duplicate applied migration timestamp ${whenNum} in __drizzle_migrations.`);
      }
      appliedByWhen.set(whenNum, { id: row.id, hash: row.hash });
    }

    let seenPending = false;
    const pendingMigrations: typeof migrations = [];

    for (const entry of migrations) {
      const recorded = appliedByWhen.get(entry.when);
      if (recorded) {
        if (seenPending) {
          throw new Error(
            `MIGRATION ABORTED: Out-of-order migration history detected. Pending migration precedes applied migration ${entry.tag} (${entry.when}).`
          );
        }
        if (recorded.hash !== entry.hash) {
          throw new Error(
            `MIGRATION ABORTED: Checksum mismatch for already-applied migration ${entry.tag}. Expected ${entry.hash}, recorded ${recorded.hash}.`
          );
        }
        appliedByWhen.delete(entry.when);
      } else {
        seenPending = true;
        pendingMigrations.push(entry);
      }
    }

    if (appliedByWhen.size > 0) {
      const unknownTimestamps = Array.from(appliedByWhen.keys()).join(', ');
      throw new Error(
        `MIGRATION ABORTED: Database contains unknown migration record(s) not present in _journal.json: ${unknownTimestamps}`
      );
    }

    console.log(
      `[db:migrate] Journal entries: ${migrations.length} | Already applied: ${migrations.length - pendingMigrations.length} | Pending: ${pendingMigrations.length}`
    );

    if (preflightOnly) {
      console.log(
        `[db:migrate] Preflight passed. Pending migrations: ${pendingMigrations.map((m) => m.tag).join(', ') || 'NONE'}`
      );
      return { applied: 0, pending: pendingMigrations.map((m) => m.tag) };
    }

    if (!trackingTableExists) {
      await client.query(`CREATE SCHEMA IF NOT EXISTS "drizzle";`);
      await client.query(`
        CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
          id serial PRIMARY KEY,
          hash text NOT NULL,
          created_at bigint
        );
      `);
    }

    let appliedCount = 0;
    for (const migration of pendingMigrations) {
      console.log(`[db:migrate] Applying ${migration.tag} (${migration.when})...`);
      await client.query('BEGIN');
      try {
        await client.query(`SET LOCAL lock_timeout = '10s'`);

        if (migration.idx === 11) {
          await client.query(`
            DO $$
            BEGIN
              IF to_regclass('public.site_visits') IS NOT NULL THEN
                SET LOCAL lock_timeout = '5s';
                LOCK TABLE public.site_visits IN EXCLUSIVE MODE;
              END IF;
            END $$;
          `);
        }

        const statements = splitMigrationStatements(migration.sql);
        for (let i = 0; i < statements.length; i++) {
          await client.query(statements[i]);
        }

        await client.query(
          `INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at") VALUES ($1, $2)`,
          [migration.hash, migration.when]
        );

        await client.query('COMMIT');
        appliedCount++;
        console.log(`[db:migrate] Committed ${migration.tag}`);
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`Migration ${migration.tag} failed and was rolled back cleanly: ${msg}`);
      }
    }

    await verifySchemaIntegrity(client);
    console.log(`[db:migrate] All ${appliedCount} pending migration(s) applied and post-migration verification passed.`);
    return { applied: appliedCount, pending: pendingMigrations.map((m) => m.tag) };
  } finally {
    if (advisoryLockAcquired) {
      await client.query(`SELECT pg_advisory_unlock($1)`, [ADVISORY_LOCK_KEY]).catch(() => undefined);
    }
    await client.end().catch(() => undefined);
  }
}

const isCliEntry = process.argv[1] && path.resolve(process.argv[1]).endsWith('run-migrations.ts');
if (isCliEntry) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[db:migrate] ERROR:', err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
