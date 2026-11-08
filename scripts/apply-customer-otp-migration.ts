import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { Client } from 'pg';

function fail(message: string): never {
  throw new Error(message);
}

async function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(`${question}: `)).trim();
  } finally {
    rl.close();
  }
}

/**
 * Explicit operator-run migration for the OTP tables.
 * This is never invoked by app startup and refuses to run unless the operator
 * confirms the exact PostgreSQL host and the operation phrase.
 */
async function main() {
  if (process.env.PERSISTENCE_PROVIDER !== 'postgres') {
    fail('Refusing to run: set PERSISTENCE_PROVIDER=postgres explicitly.');
  }
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) fail('DATABASE_URL is required and must point to the intended database.');

  let targetUrl: URL;
  try {
    targetUrl = new URL(connectionString);
  } catch {
    fail('DATABASE_URL is not a valid PostgreSQL connection URL.');
  }
  if (!['postgres:', 'postgresql:'].includes(targetUrl.protocol)) {
    fail('DATABASE_URL must use PostgreSQL.');
  }

  console.log('\nGreat Homes — customer OTP schema migration');
  console.log('Target PostgreSQL host:', targetUrl.hostname);
  console.log('Migration: drizzle/0002_customer_auth_otp.sql (idempotent, additive tables/indexes)');
  const host = await ask('Type the exact host above to confirm the database target');
  if (host !== targetUrl.hostname) fail('Database host confirmation did not match. No migration was applied.');

  const phrase = await ask('Type APPLY-CUSTOMER-OTP-MIGRATION to continue');
  if (phrase !== 'APPLY-CUSTOMER-OTP-MIGRATION') fail('Confirmation phrase did not match. No migration was applied.');

  const migrationPath = fileURLToPath(new URL('../drizzle/0002_customer_auth_otp.sql', import.meta.url));
  const migrationSql = await readFile(migrationPath, 'utf8');
  if (!migrationSql.includes('CREATE TABLE IF NOT EXISTS customer_otp_challenges') ||
      !migrationSql.includes('CREATE TABLE IF NOT EXISTS customer_auth_sessions')) {
    fail('Migration file did not contain the expected OTP/session table definitions.');
  }

  const client = new Client({ connectionString });
  let connected = false;
  let transactionOpen = false;
  try {
    await client.connect();
    connected = true;

    const prerequisite = await client.query<{ customers_table: string | null }>(
      `SELECT to_regclass('public.customers')::text AS customers_table`
    );
    if (!prerequisite.rows[0]?.customers_table) {
      fail('public.customers does not exist. This migration requires the customer schema to be installed first.');
    }

    await client.query('BEGIN');
    transactionOpen = true;
    await client.query(migrationSql);
    await client.query('COMMIT');
    transactionOpen = false;

    const verification = await client.query<{
      challenges: string | null;
      limits: string | null;
      sessions: string | null;
    }>(
      `SELECT
        to_regclass('public.customer_otp_challenges')::text AS challenges,
        to_regclass('public.customer_auth_rate_limits')::text AS limits,
        to_regclass('public.customer_auth_sessions')::text AS sessions`
    );
    const tables = verification.rows[0];
    if (!tables?.challenges || !tables?.limits || !tables?.sessions) {
      fail('Migration returned but one or more required tables could not be verified.');
    }
    console.log('OTP challenge, persistent rate-limit, and customer session tables verified.');
    console.log('Next: verify duplicate normalized customer phone numbers and confirm Preview smoke tests before production cutover.');
  } catch (error) {
    if (transactionOpen) {
      try { await client.query('ROLLBACK'); } catch { /* Preserve original error. */ }
    }
    throw error;
  } finally {
    if (connected) await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Customer OTP migration failed.');
  process.exitCode = 1;
});
