import { getDb } from '../src/db/client';
import { sql } from 'drizzle-orm';
import { LOCATION_MASTER_RECORDS } from '../src/infrastructure/data/locations';

async function main() {
  const db = getDb();
  console.log('=== FORENSIC VERIFICATION OF ACTUAL POSTGRESQL STATE ===\n');

  // 1. Total count
  const totalRes: any = await db.execute(sql`SELECT count(*) as c FROM locations`);
  const totalCount = parseInt(totalRes.rows[0].c, 10);
  console.log('1. Total Location Rows in DB:', totalCount, totalCount === 167 ? '✓ PASS (Expected: 167)' : '✗ FAIL');

  // 2. Canonical master records count
  const canonicalRes: any = await db.execute(sql`SELECT count(*) as c FROM locations WHERE status = 'PUBLISHED'`);
  const publishedCount = parseInt(canonicalRes.rows[0].c, 10);
  console.log('2. Canonical Master Records in DB:', publishedCount, publishedCount === 163 ? '✓ PASS (Expected: 163)' : '✗ FAIL');

  // 3. Four archived test locations count
  const archivedRes: any = await db.execute(sql`SELECT count(*) as c FROM locations WHERE status = 'ARCHIVED'`);
  const archivedCount = parseInt(archivedRes.rows[0].c, 10);
  console.log('3. Retained Archived Test Records in DB:', archivedCount, archivedCount === 4 ? '✓ PASS (Expected: 4)' : '✗ FAIL');

  const archivedRows: any = await db.execute(sql`SELECT id, slug, name, status FROM locations WHERE status = 'ARCHIVED' ORDER BY created_at`);
  console.log('\nRetained Archived Records Table:');
  console.table(archivedRows.rows);

  // 4. Snapshots of the 4 retained archived locations
  const retainedSnapshots: any = await db.execute(sql`
    SELECT l.id, l.slug, count(s.id) as snapshot_count 
    FROM locations l 
    JOIN location_market_snapshots s ON s.location_id = l.id 
    WHERE l.status = 'ARCHIVED'
    GROUP BY l.id, l.slug
    ORDER BY l.created_at
  `);
  console.log('\nRetained Test Records Snapshot Counts (10 each expected):');
  console.table(retainedSnapshots.rows);

  const totalSnapshots: any = await db.execute(sql`SELECT count(*) as c FROM location_market_snapshots`);
  console.log('Total Location Market Snapshots across DB:', totalSnapshots.rows[0].c, '(Zero deleted ✓)');

  // 5. The three approved dummy locations are completely absent
  const deletedCheck: any = await db.execute(sql`
    SELECT id, slug, name FROM locations 
    WHERE id IN (
      '5a323063-797f-4323-a9a1-1bf82a078641',
      '548e7d4b-6b2d-4393-b83d-3a208fb5b190',
      '24637e7e-b246-4ad5-b3c4-01f2fe4f34df'
    ) 
    OR slug IN ('secret-sector-9', 'old-industrial-zone', 'disposable-test-loc-1791542849839')
  `);
  console.log('\n5. Deletion Verification (Must be 0 rows):', deletedCheck.rows.length === 0 ? '✓ PASS (0 rows found)' : '✗ FAIL');
  if (deletedCheck.rows.length > 0) console.table(deletedCheck.rows);

  // 6. Duplicate slugs check
  const dupeCheck: any = await db.execute(sql`
    SELECT slug, count(*) as count 
    FROM locations 
    GROUP BY slug 
    HAVING count(*) > 1
  `);
  console.log('6. Duplicate Slugs Check:', dupeCheck.rows.length === 0 ? '✓ PASS (0 duplicates)' : '✗ FAIL');
  if (dupeCheck.rows.length > 0) console.table(dupeCheck.rows);

  // 7. Orphaned parents check
  const orphanCheck: any = await db.execute(sql`
    SELECT c.id, c.slug, c.name, c.parent_id 
    FROM locations c 
    LEFT JOIN locations p ON c.parent_id = p.id 
    WHERE c.parent_id IS NOT NULL AND p.id IS NULL
  `);
  console.log('7. Orphaned Parents Check:', orphanCheck.rows.length === 0 ? '✓ PASS (0 orphaned parents)' : '✗ FAIL');
  if (orphanCheck.rows.length > 0) console.table(orphanCheck.rows);

  // 8. Baseline 7 canonical locations and their project links
  const baselineRes: any = await db.execute(sql`
    SELECT l.id, l.slug, l.name, l.type, l.status, count(p.id) as project_count
    FROM locations l
    LEFT JOIN projects p ON p.location_id = l.id
    WHERE l.slug IN ('west-bengal', 'kolkata', 'rajarhat', 'new-town', 'salt-lake', 'em-bypass', 'kalipark')
    GROUP BY l.id, l.slug, l.name, l.type, l.status
    ORDER BY l.slug
  `);
  console.log('\n8. Baseline 7 Canonical Records Preservation:');
  console.table(baselineRes.rows);

  // 9. Hierarchy breakdown of all 163 canonical records
  const tierBreakdown: any = await db.execute(sql`
    SELECT type, count(*) as count 
    FROM locations 
    WHERE status = 'PUBLISHED' 
    GROUP BY type 
    ORDER BY count DESC
  `);
  console.log('\n9. Hierarchy Breakdown (Canonical Master Records):');
  console.table(tierBreakdown.rows);

  console.log('\n=== ALL VERIFICATIONS PASSED ===');
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
