import { getDb } from '../src/db/client';
import { locations, projects, resaleListings, rentalListings, locationMarketSnapshots, locationWatchlists, notifications } from '../src/db/schema';
import { sql, eq, inArray } from 'drizzle-orm';
import { LOCATION_MASTER_RECORDS } from '../src/infrastructure/data/locations';
import { locationRepository } from '../src/infrastructure/repositories/locationProvider';
import { importLocationMasterData } from '../src/infrastructure/seed';
import fs from 'fs';
import path from 'path';

interface PreflightResult {
  passed: boolean;
  errors: string[];
  details: Record<string, any>;
}

async function runPreflight(): Promise<PreflightResult> {
  const errors: string[] = [];
  const details: Record<string, any> = {};

  // 1. Confirm PERSISTENCE_PROVIDER=postgres and active Neon database
  const provider = process.env.PERSISTENCE_PROVIDER;
  if (provider !== 'postgres') {
    errors.push(`PERSISTENCE_PROVIDER is '${provider}', expected 'postgres'`);
  }
  const db = getDb();
  if (!db) {
    errors.push('Database client could not be obtained');
  }
  details.provider = provider;
  details.dbConnected = !!db;

  // 2. Confirm backup file exists and has 14 records
  const backupPath = path.resolve('src/infrastructure/data/backups/locations-backup-pre-option-a.json');
  if (!fs.existsSync(backupPath)) {
    errors.push(`Backup file missing at ${backupPath}`);
  } else {
    try {
      const backupData = JSON.parse(fs.readFileSync(backupPath, 'utf-8'));
      if (!Array.isArray(backupData) || backupData.length !== 14) {
        errors.push(`Backup file has invalid row count: ${backupData.length}, expected 14`);
      }
      details.backupRows = backupData.length;
      details.backupPath = backupPath;
    } catch (e: any) {
      errors.push(`Failed to read backup file: ${e.message}`);
    }
  }

  // 2b. Check WAL LSN
  try {
    const lsnRes: any = await db.execute(sql`SELECT pg_current_wal_lsn() as lsn`);
    details.walLsn = lsnRes.rows?.[0]?.lsn;
  } catch (e: any) {
    details.walLsnError = e.message;
  }

  // 3. Recheck the three approved dummy locations and their dependencies
  const approvedCandidates = [
    { id: '5a323063-797f-4323-a9a1-1bf82a078641', slug: 'secret-sector-9', name: 'Secret Sector 9' },
    { id: '548e7d4b-6b2d-4393-b83d-3a208fb5b190', slug: 'old-industrial-zone', name: 'Old Industrial Zone' },
    { id: '24637e7e-b246-4ad5-b3c4-01f2fe4f34df', slug: 'disposable-test-loc-1791542849839', name: 'Disposable Test Loc' },
  ];

  details.candidates = [];
  for (const c of approvedCandidates) {
    const locRes: any = await db.execute(sql`SELECT id, slug, name, status FROM locations WHERE id = ${c.id}`);
    if (locRes.rows.length === 0) {
      errors.push(`Candidate ID ${c.id} not found in database`);
      continue;
    }
    const row = locRes.rows[0];
    if (row.slug !== c.slug) {
      errors.push(`Candidate ID ${c.id} slug mismatch: expected ${c.slug}, got ${row.slug}`);
    }

    // Check dependencies
    const [p, r, rent, snap, watch, notif, child]: any = await Promise.all([
      db.execute(sql`SELECT count(*) as c FROM projects WHERE location_id = ${c.id}`),
      db.execute(sql`SELECT count(*) as c FROM resale_listings WHERE location_id = ${c.id}`),
      db.execute(sql`SELECT count(*) as c FROM rental_listings WHERE location_id = ${c.id}`),
      db.execute(sql`SELECT count(*) as c FROM location_market_snapshots WHERE location_id = ${c.id}`),
      db.execute(sql`SELECT count(*) as c FROM location_watchlists WHERE location_id = ${c.id}`),
      db.execute(sql`SELECT count(*) as c FROM notifications WHERE location_id = ${c.id}`),
      db.execute(sql`SELECT count(*) as c FROM locations WHERE parent_id = ${c.id}`),
    ]);

    const totalDeps = 
      parseInt(p.rows[0].c, 10) +
      parseInt(r.rows[0].c, 10) +
      parseInt(rent.rows[0].c, 10) +
      parseInt(snap.rows[0].c, 10) +
      parseInt(watch.rows[0].c, 10) +
      parseInt(notif.rows[0].c, 10) +
      parseInt(child.rows[0].c, 10);

    if (totalDeps > 0) {
      errors.push(`Candidate ${c.slug} (${c.id}) has ${totalDeps} dependencies!`);
    }

    details.candidates.push({
      ...c,
      statusInDb: row.status,
      totalDependencies: totalDeps,
    });
  }

  // 4. Confirm master dataset contains exactly 163 records
  const masterCount = LOCATION_MASTER_RECORDS.length;
  if (masterCount !== 163) {
    errors.push(`Master dataset has ${masterCount} records, expected 163`);
  }
  details.masterCount = masterCount;

  return {
    passed: errors.length === 0,
    errors,
    details,
  };
}

async function execute() {
  console.log('=== STEP A: PREFLIGHT VERIFICATION ===');
  const preflight = await runPreflight();
  console.log(JSON.stringify(preflight, null, 2));

  if (!preflight.passed) {
    console.error('PREFLIGHT FAILED. Aborting without database mutations.');
    process.exit(1);
  }

  console.log('\n=== STEP B: EXECUTION ===');
  const db = getDb();

  // B.1: Delete the 3 approved dummy locations inside a transaction
  console.log('B.1 Deleting 3 approved dummy locations via SQL transaction...');
  const deletedRecords: any[] = [];
  
  await db.transaction(async (tx) => {
    const idsToDelete = [
      '5a323063-797f-4323-a9a1-1bf82a078641', // secret-sector-9
      '548e7d4b-6b2d-4393-b83d-3a208fb5b190', // old-industrial-zone
      '24637e7e-b246-4ad5-b3c4-01f2fe4f34df', // disposable-test-loc-1791542849839
    ];

    for (const id of idsToDelete) {
      const res: any = await tx.execute(sql`DELETE FROM locations WHERE id = ${id} RETURNING id, slug, name, status`);
      if (res.rows.length > 0) {
        deletedRecords.push(res.rows[0]);
      }
    }
  });

  console.log('Successfully deleted dummy locations:', deletedRecords);

  // B.2: Run importLocationMasterData({ dryRun: false, protectCuratedFields: true })
  console.log('B.2 Executing importLocationMasterData({ dryRun: false, protectCuratedFields: true })...');
  const importResult = await importLocationMasterData({
    dryRun: false,
    protectCuratedFields: true,
  });
  console.log('Import Result Summary:', {
    totalSourceRecords: importResult.totalSourceRecords,
    preservedExistingCount: importResult.preservedExistingCount,
    createdCount: importResult.createdCount,
    updatedCount: importResult.updatedCount,
    unmodifiedCount: importResult.unmodifiedCount,
    hierarchyValid: importResult.hierarchyValid,
    errorCount: importResult.errors.length,
  });

  if (importResult.errors.length > 0) {
    console.warn('Import warnings/errors:', importResult.errors);
  }

  console.log('\n=== STEP C: LIVE DATABASE VERIFICATION ===');
  // C.1 Total records in locations table
  const totalRes: any = await db.execute(sql`SELECT count(*) as c FROM locations`);
  const totalCount = parseInt(totalRes.rows[0].c, 10);
  console.log('Total locations in DB:', totalCount, '(Expected: 167)');

  // C.2 Canonical master vs Retained test
  const canonicalRes: any = await db.execute(sql`SELECT count(*) as c FROM locations WHERE status = 'PUBLISHED'`);
  const publishedCount = parseInt(canonicalRes.rows[0].c, 10);
  console.log('Published locations in DB:', publishedCount, '(Expected: 163)');

  const archivedRes: any = await db.execute(sql`SELECT count(*) as c FROM locations WHERE status = 'ARCHIVED'`);
  const archivedCount = parseInt(archivedRes.rows[0].c, 10);
  console.log('Archived locations in DB:', archivedCount, '(Expected: 4)');

  const archivedRows: any = await db.execute(sql`SELECT id, slug, name, status FROM locations WHERE status = 'ARCHIVED'`);
  console.log('Retained Archived Locations:');
  console.table(archivedRows.rows);

  // C.3 Check snapshots rows for the 4 retained archived locations
  const snapRes: any = await db.execute(sql`SELECT location_id, count(*) as count FROM location_market_snapshots GROUP BY location_id`);
  console.log('Snapshot rows per location in DB:');
  console.table(snapRes.rows);
  const totalSnapshots: any = await db.execute(sql`SELECT count(*) as c FROM location_market_snapshots`);
  console.log('Total snapshots in DB:', totalSnapshots.rows[0].c, '(Expected: 40)');

  // C.4 Check the 3 deleted dummy locations are absent
  const deletedCheck: any = await db.execute(sql`SELECT id, slug FROM locations WHERE slug IN ('secret-sector-9', 'old-industrial-zone', 'disposable-test-loc-1791542849839')`);
  console.log('Check deleted dummies in DB (must be empty):', deletedCheck.rows);

  // C.5 Check duplicate slugs
  const dupeRes: any = await db.execute(sql`SELECT slug, count(*) as c FROM locations GROUP BY slug HAVING count(*) > 1`);
  console.log('Duplicate slugs in DB (must be empty):', dupeRes.rows);

  // C.6 Check orphaned parents (parent_id is set but does not exist in locations table)
  const orphanRes: any = await db.execute(sql`
    SELECT l.id, l.slug, l.name, l.parent_id 
    FROM locations l 
    LEFT JOIN locations p ON l.parent_id = p.id 
    WHERE l.parent_id IS NOT NULL AND p.id IS NULL
  `);
  console.log('Orphaned parent references in DB (must be empty):', orphanRes.rows);

  // C.7 Check 7 baseline published locations and their project links
  const baselineRes: any = await db.execute(sql`
    SELECT l.id, l.slug, l.name, l.type, l.status, count(p.id) as project_count
    FROM locations l
    LEFT JOIN projects p ON p.location_id = l.id
    WHERE l.slug IN ('west-bengal', 'kolkata', 'rajarhat', 'new-town', 'salt-lake', 'em-bypass', 'kalipark')
    GROUP BY l.id, l.slug, l.name, l.type, l.status
    ORDER BY l.slug
  `);
  console.log('Baseline 7 locations status and project counts:');
  console.table(baselineRes.rows);

  // C.8 Breakdown of canonical records by tier
  const tierRes: any = await db.execute(sql`SELECT type, count(*) as c FROM locations WHERE status = 'PUBLISHED' GROUP BY type ORDER BY c DESC`);
  console.log('Canonical locations tier breakdown:');
  console.table(tierRes.rows);

  console.log('\n=== EXECUTION AND FORENSIC VERIFICATION COMPLETE ===');
  process.exit(0);
}

execute().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
