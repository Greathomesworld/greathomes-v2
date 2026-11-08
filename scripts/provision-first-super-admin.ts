import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { Client } from 'pg';
import { hashStaffPassword } from '../src/domain/auth/password.js';

function fail(message: string): never {
  throw new Error(message);
}

async function askVisible(question: string, defaultValue?: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question(defaultValue ? `${question} [${defaultValue}]: ` : `${question}: `)).trim();
    return answer || defaultValue || '';
  } finally {
    rl.close();
  }
}

async function askPasswordHidden(question: string): Promise<string> {
  const input = process.stdin;
  if (!input.isTTY || typeof input.setRawMode !== 'function') {
    fail('Run this provisioning command in an interactive terminal so the password can be entered without echo.');
  }

  return new Promise((resolve, reject) => {
    let value = '';
    const wasRaw = input.isRaw;
    process.stdout.write(question);

    const finish = (error?: Error) => {
      input.off('data', onData);
      input.setRawMode(Boolean(wasRaw));
      input.pause();
      process.stdout.write('\n');
      if (error) reject(error);
      else resolve(value);
    };

    const onData = (chunk: Buffer) => {
      for (const character of chunk.toString('utf8')) {
        if (character === '\u0003') {
          finish(new Error('Provisioning cancelled.'));
          return;
        }
        if (character === '\r' || character === '\n') {
          finish();
          return;
        }
        if (character === '\u0008' || character === '\u007f') {
          if (value.length > 0) {
            value = value.slice(0, -1);
            process.stdout.write('\b \b');
          }
          continue;
        }
        if (character >= ' ' && character !== '\u007f') {
          value += character;
          process.stdout.write('*');
        }
      }
    };

    input.setRawMode(true);
    input.resume();
    input.on('data', onData);
  });
}

/**
 * One-time, operator-run provisioning for the first production SUPER_ADMIN.
 * This script never runs automatically and never prints the supplied password or DATABASE_URL.
 */
async function main() {
  if (process.env.PERSISTENCE_PROVIDER !== 'postgres') {
    fail('Refusing to run: set PERSISTENCE_PROVIDER=postgres explicitly.');
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) fail('DATABASE_URL is required and must point to the intended production database.');

  const staffSessionSecret = process.env.GH_STAFF_SESSION_SECRET;
  if (!staffSessionSecret || staffSessionSecret.length < 32) {
    fail('GH_STAFF_SESSION_SECRET must be configured in this shell with at least 32 characters, matching Vercel Production.');
  }

  let targetUrl: URL;
  try {
    targetUrl = new URL(connectionString);
  } catch {
    fail('DATABASE_URL is not a valid PostgreSQL connection URL.');
  }
  if (!['postgres:', 'postgresql:'].includes(targetUrl.protocol)) {
    fail('DATABASE_URL must use PostgreSQL.');
  }

  console.log('\nGreat Homes — one-time first Super Admin provisioning');
  console.log('Target PostgreSQL host:', targetUrl.hostname);
  console.log('No schema changes will be applied by this script.');
  const typedHost = await askVisible('Type the exact host above to confirm the database target');
  if (typedHost !== targetUrl.hostname) fail('Database host confirmation did not match. No account was created.');

  const phrase = await askVisible('Type CREATE-FIRST-PRODUCTION-SUPER-ADMIN to continue');
  if (phrase !== 'CREATE-FIRST-PRODUCTION-SUPER-ADMIN') fail('Confirmation phrase did not match. No account was created.');

  const email = (await askVisible('First Super Admin email', process.env.GH_SUPER_ADMIN_EMAIL || 'superadmin@greathomes.co.in')).toLowerCase().trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('A valid email address is required.');
  const name = (await askVisible('Full name', process.env.GH_SUPER_ADMIN_NAME || 'Great Homes Super Admin')).trim();
  if (name.length < 2 || name.length > 120) fail('Name must contain between 2 and 120 characters.');
  const password = await askPasswordHidden('Enter a new password (12–256 characters): ');
  if (password.length < 12 || password.length > 256) fail('Password must contain between 12 and 256 characters.');

  const client = new Client({ connectionString });
  let connected = false;
  let transactionOpen = false;
  try {
    await client.connect();
    connected = true;

    const tableCheck = await client.query<{ table_name: string | null }>(
      `SELECT to_regclass('public.staff_users')::text AS table_name`
    );
    if (!tableCheck.rows[0]?.table_name) {
      fail('public.staff_users does not exist. Apply the reviewed schema/migrations first; this script does not create tables.');
    }

    const columnCheck = await client.query<{ column_name: string }>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'staff_users'`
    );
    const columns = new Set(columnCheck.rows.map((row) => row.column_name));
    for (const column of ['id', 'email', 'name', 'role', 'password_hash', 'session_version', 'enabled', 'avatar_url', 'created_at', 'updated_at']) {
      if (!columns.has(column)) fail(`public.staff_users is missing required column "${column}". No account was created.`);
    }

    await client.query('BEGIN');
    transactionOpen = true;
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['greathomes:first-super-admin-provisioning']);

    const activeAdmins = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM staff_users WHERE role = 'SUPER_ADMIN' AND enabled = TRUE`
    );
    if (Number(activeAdmins.rows[0]?.count || 0) > 0) {
      fail('At least one active SUPER_ADMIN already exists. This script will not add or reset accounts.');
    }

    const existingEmail = await client.query<{ id: string }>(
      `SELECT id FROM staff_users WHERE LOWER(email) = LOWER($1) LIMIT 1`,
      [email]
    );
    if (existingEmail.rowCount) {
      fail('A staff account already uses that email. This script will not overwrite or reactivate it; review the account manually.');
    }

    const passwordHash = await hashStaffPassword(password);
    await client.query(
      `INSERT INTO staff_users
        (id, email, name, role, password_hash, session_version, enabled, avatar_url, created_at, updated_at)
       VALUES ($1, $2, $3, 'SUPER_ADMIN', $4, 0, TRUE, NULL, NOW(), NOW())`,
      [randomUUID(), email, name, passwordHash]
    );
    await client.query('COMMIT');
    transactionOpen = false;
    console.log(`Created one active SUPER_ADMIN account for ${email}. The password was not printed or stored in plaintext.`);
    console.log('Next: sign in through the live Admin UI and verify access. Remove the temporary shell environment variables.');
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
  console.error(error instanceof Error ? error.message : 'Super Admin provisioning failed.');
  process.exitCode = 1;
});
