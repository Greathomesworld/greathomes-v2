import pkg from 'pg';
import { validateTestDatabaseUrl } from './lib/db-safety-validation.mjs';

const { Pool } = pkg;

if (process.env.ALLOW_DB_MIGRATIONS !== 'true') {
  console.error('[ABORT] ALLOW_DB_MIGRATIONS=true is required before running DDL constraint verification.');
  process.exit(2);
}

const testDbUrl = process.env.TEST_DATABASE_URL?.trim() || '';
const validation = validateTestDatabaseUrl({
  testUrl: testDbUrl,
  prodUrl: process.env.DATABASE_URL,
  allowDisposable: process.env.ALLOW_DISPOSABLE_DB_TESTS,
});

if (!validation.valid) {
  console.error(`[ABORT] ${validation.error}`);
  console.error(
    'Required environment variables: TEST_DATABASE_URL=<isolated_disposable_db_url>, ALLOW_DISPOSABLE_DB_TESTS=1, and ALLOW_DB_MIGRATIONS=true'
  );
  process.exit(validation.code || 1);
}

async function verifyConstraint() {
  const pool = new Pool({ connectionString: testDbUrl });
  try {
    console.log('1. Executing ensureSchemaUpdates equivalent DDL against test branch...');
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_canonical_phone_unique 
        ON customers (('+91' || right(regexp_replace(coalesce(phone, ''), '\\D', '', 'g'), 10))) 
        WHERE phone IS NOT NULL AND trim(phone) != '';
    `);

    const indexRes = await pool.query(`
      SELECT indexname, indexdef 
      FROM pg_indexes 
      WHERE tablename = 'customers' AND indexname = 'idx_customers_canonical_phone_unique';
    `);

    if (indexRes.rows.length === 0) {
      console.error('FAIL: idx_customers_canonical_phone_unique does not exist on customers table.');
      process.exit(1);
    }
    console.log('PASS: Found index:', indexRes.rows[0].indexdef);

    console.log('\n2. Testing database-level unique enforcement with rollback transaction...');
    const client = await pool.connect();
    try {
      await client.query('BEGIN;');

      // Insert test customer 1
      await client.query(`
        INSERT INTO customers (id, email, phone, name, status, created_at, updated_at)
        VALUES ('cust_test_1', 'test1@greathomes.invalid', '9830012345', 'Test One', 'ACTIVE', now(), now())
        ON CONFLICT DO NOTHING;
      `);

      // Try inserting duplicate with different formatting ('+91 98300-12345')
      let caughtUniqueError = false;
      try {
        await client.query(`
          INSERT INTO customers (id, email, phone, name, status, created_at, updated_at)
          VALUES ('cust_test_2', 'test2@greathomes.invalid', '+91 98300-12345', 'Test Two', 'ACTIVE', now(), now());
        `);
      } catch (err) {
        if (err.code === '23505') {
          caughtUniqueError = true;
          console.log('PASS: PostgreSQL successfully rejected duplicate insert with unique violation error code 23505:', err.message);
        } else {
          throw err;
        }
      }

      if (!caughtUniqueError) {
        console.error('FAIL: PostgreSQL allowed duplicate canonical phone insert!');
        process.exit(1);
      }

      await client.query('ROLLBACK;');
      console.log('PASS: Rollback transaction completed cleanly.');
    } catch (err) {
      await client.query('ROLLBACK;');
      throw err;
    } finally {
      client.release();
    }

    console.log('\nAll database constraint verification checks PASSED successfully.');
  } catch (err) {
    console.error('Verification failed:', err instanceof Error ? err.message : 'Unexpected database error');
    process.exit(1);
  } finally {
    await pool.end();
  }
}

verifyConstraint();
