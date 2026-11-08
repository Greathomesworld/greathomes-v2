import { Pool } from 'pg';

async function run() {
  const connectionString = process.env.DATABASE_URL;
  const pool = new Pool({ connectionString });
  
  try {
    console.log('=== FORENSIC AUDIT: MERLIN GROUP ===');
    
    // 1. Find Developer
    const devRes = await pool.query("SELECT id, name, slug, status FROM developers WHERE name = 'Merlin Group'");
    const dev = devRes.rows[0];
    if (!dev) {
        console.log('Developer Merlin Group not found.');
        return;
    }
    console.log('Developer:', dev);

    // 2. Get associated projects
    const projRes = await pool.query(
        "SELECT id, name, slug, status, is_published FROM projects WHERE developer_id = $1", 
        [dev.id]
    );
    console.log('Associated Projects:', projRes.rows);

  } catch (e) {
    console.error(e);
  } finally {
    await pool.end();
  }
}

run();
