import pkg from 'pg';
import { validateTestDatabaseUrl } from './lib/db-safety-validation.mjs';

const { Pool } = pkg;

const testDbUrl = process.env.TEST_DATABASE_URL?.trim() || '';
const validation = validateTestDatabaseUrl({
  testUrl: testDbUrl,
  prodUrl: process.env.DATABASE_URL,
  allowDisposable: process.env.ALLOW_DISPOSABLE_DB_TESTS,
});

if (!validation.valid) {
  console.error(`[ABORT] ${validation.error}`);
  console.error(
    'Required environment variables: TEST_DATABASE_URL=<isolated_disposable_db_url> and ALLOW_DISPOSABLE_DB_TESTS=1'
  );
  process.exit(validation.code || 1);
}

async function checkDuplicates() {
  const pool = new Pool({ connectionString: testDbUrl });
  try {
    const res = await pool.query(`
      SELECT 
        '+91' || right(regexp_replace(coalesce(phone, ''), '\\D', '', 'g'), 10) AS canonical_phone,
        count(*) as cnt,
        array_agg(id) as customer_ids
      FROM customers
      WHERE phone IS NOT NULL AND trim(phone) != ''
      GROUP BY canonical_phone
      HAVING count(*) > 1;
    `);

    if (res.rows.length > 0) {
      console.log('Found legacy duplicate canonical phone numbers:');
      for (const row of res.rows) {
        console.log(`Canonical Phone: [REDACTED], Count: ${row.cnt}, Customer IDs: ${row.customer_ids.join(', ')}`);
      }
    } else {
      console.log('No legacy duplicate canonical phone numbers found in test database.');
    }
  } catch (err) {
    console.error('Error checking duplicates:', err instanceof Error ? err.message : 'Unexpected database error');
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

checkDuplicates();
