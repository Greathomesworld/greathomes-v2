import { Pool } from 'pg';
import { execSync } from 'child_process';

async function verify() {
  const connectionString = process.env.DATABASE_URL;
  const pool = new Pool({ connectionString });
  
  try {
    console.log('=== FORENSIC AUDIT VERIFICATION ===');
    
    // 1. Database Check
    const dbRes = await pool.query(
      "SELECT id, name, status FROM developers WHERE slug = $1",
      ['merlin-group']
    );
    console.log('Database Result:', dbRes.rows[0]);
    
    // 2. API Check
    console.log('\n=== API CHECK (curl) ===');
    // Using curl to get headers and response
    const curlCmd = `curl -I -s "https://ais-dev-gplf76f5j6sat3wusaxbzb-118859849686.asia-southeast1.run.app/api/admin/developers?search=merlin"`;
    console.log('Command:', curlCmd);
    const output = execSync(curlCmd).toString();
    console.log('Headers:', output);

  } catch (err) {
    console.error('Audit failed:', err);
  } finally {
    await pool.end();
  }
}

verify();
