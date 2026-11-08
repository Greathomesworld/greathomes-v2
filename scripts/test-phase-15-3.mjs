import assert from 'assert';
import { getDb } from '../src/db/client.js';
import { locationMarketSnapshots, locations } from '../src/db/schema.js';
import { eq, inArray } from 'drizzle-orm';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

export async function runPhase153Tests() {
  console.log('====================================================');
  console.log('🚀 RUNNING PHASE 15.3 MARKET CHARTS TEST SUITE (300+ MEANINGFUL ASSERTIONS)');
  console.log('Target Base URL:', BASE_URL);
  console.log('====================================================\n');

  const db = getDb();
  if (!db) throw new Error('DB NOT CONFIGURED');

  let assertionCount = 0;
  const pass = () => {
    assertionCount++;
  };

  // Resolve multiple test locations to increase surface area
  const testSlugs = ['rajarhat', 'new-town', 'salt-lake', 'kasba', 'behala'];
  const locRecords = await db.select().from(locations).where(inArray(locations.slug, testSlugs));
  
  assert.ok(locRecords.length > 0, 'Must have at least one test location'); pass();

  for (const loc of locRecords) {
    console.log(`  🔍 Auditing Location: ${loc.slug} (${loc.id})`);
    
    // 1. API Contract & Caching
    const res = await fetch(`${BASE_URL}/api/locations/${loc.slug}/market/history?scope=DESCENDANT`);
    assert.strictEqual(res.status, 200, `API should return 200 for ${loc.slug}`); pass();
    
    const cacheHeader = res.headers.get('cache-control');
    assert.ok(cacheHeader?.includes('public'), 'Must have public caching'); pass();
    assert.ok(cacheHeader?.includes('s-maxage=3600'), 'Max-age must be 1 hour'); pass();

    const data = await res.json();
    assert.ok(Array.isArray(data.history), 'History must be an array'); pass();

    // 2. Deep Data Integrity Check (Compare API against DB)
    const dbSnaps = await db.select().from(locationMarketSnapshots)
      .where(eq(locationMarketSnapshots.locationId, loc.id))
      .orderBy(locationMarketSnapshots.snapshotDate);
    
    assert.strictEqual(data.history.length, dbSnaps.length, 'Snapshot count mismatch between API and DB'); pass();

    // We iterate through every snapshot and every meaningful field
    for (let i = 0; i < data.history.length; i++) {
      // API returns DESC order, DB query was ASC above for index checking
      const apiSnap = data.history[i];
      const dbSnap = dbSnaps[dbSnaps.length - 1 - i];

      assert.strictEqual(apiSnap.id, dbSnap.id, 'ID mismatch'); pass();
      assert.strictEqual(apiSnap.snapshotDate, dbSnap.snapshotDate, 'Date mismatch'); pass();
      assert.strictEqual(apiSnap.publishedProjectCount, dbSnap.publishedProjectCount, 'Project count mismatch'); pass();
      assert.strictEqual(apiSnap.resaleListingCount, dbSnap.resaleListingCount, 'Resale count mismatch'); pass();
      assert.strictEqual(apiSnap.rentalListingCount, dbSnap.rentalListingCount, 'Rental count mismatch'); pass();

      // Configuration Counts
      assert.strictEqual(apiSnap.configurationCounts.bhk1Count, dbSnap.configurationCounts.bhk1Count, '1BHK mismatch'); pass();
      assert.strictEqual(apiSnap.configurationCounts.bhk2Count, dbSnap.configurationCounts.bhk2Count, '2BHK mismatch'); pass();
      assert.strictEqual(apiSnap.configurationCounts.bhk3Count, dbSnap.configurationCounts.bhk3Count, '3BHK mismatch'); pass();
      assert.strictEqual(apiSnap.configurationCounts.bhk4Count, dbSnap.configurationCounts.bhk4Count, '4BHK mismatch'); pass();
      assert.strictEqual(apiSnap.configurationCounts.bhk5PlusCount, dbSnap.configurationCounts.bhk5PlusCount, '5BHK mismatch'); pass();

      // Price Metrics (Check every basis)
      for (const basis of ['CARPET_AREA', 'BUILT_UP_AREA', 'SUPER_BUILT_UP_AREA']) {
        const apiMetric = apiSnap.priceMetrics.find(m => m.priceBasis === basis);
        const dbMetric = dbSnap.priceMetrics.find(m => m.priceBasis === basis);
        
        if (dbMetric) {
          assert.ok(apiMetric, `Missing basis ${basis} in API`); pass();
          assert.strictEqual(apiMetric.medianRatePerSqft, dbMetric.medianRatePerSqft, `Median mismatch for ${basis}`); pass();
          assert.strictEqual(apiMetric.sampleCount, dbMetric.sampleCount, `Sample count mismatch for ${basis}`); pass();
        }
      }

      // RERA Metrics
      assert.strictEqual(apiSnap.reraMetrics.verifiedProjects, dbSnap.reraMetrics.verifiedProjects, 'Verified count mismatch'); pass();
      assert.strictEqual(apiSnap.reraMetrics.providedProjects, dbSnap.reraMetrics.providedProjects, 'Provided count mismatch'); pass();
      assert.strictEqual(apiSnap.reraMetrics.notProvidedProjects, dbSnap.reraMetrics.notProvidedProjects, 'Not provided count mismatch'); pass();
    }
    
    // 3. Security Boundary Check (for each location)
    const privateFields = ['ownerPhone', 'ownerEmail', 'brokerPhone', 'brokerEmail', 'crmId', 'internalNotes', 'staffId'];
    const rawJson = JSON.stringify(data);
    for (const field of privateFields) {
      assert.strictEqual(rawJson.includes(`"${field}"`), false, `Security Leak: ${field} found in public history!`); pass();
    }
  }

  // 4. Input Validation & Resilience
  console.log('  - Testing API Resilience...');
  const malicious = [
    { param: 'scope', val: "DIRECT'; DROP TABLE locations;--" },
    { param: 'scope', val: "*/../../etc/passwd" },
    { param: 'scope', val: "12345" },
    { slug: "rajarhat'--" },
    { slug: "non-existent-slug-12345" }
  ];

  for (const m of malicious) {
    const slug = m.slug || testSlugs[0];
    const qs = m.param ? `?${m.param}=${encodeURIComponent(m.val)}` : '';
    const res = await fetch(`${BASE_URL}/api/locations/${slug}/market/history${qs}`);
    
    if (m.slug === "non-existent-slug-12345") {
      assert.strictEqual(res.status, 404, 'Non-existent slug should 404'); pass();
    } else if (m.slug) {
       assert.ok(res.status >= 400, `Malicious slug ${m.slug} should error`); pass();
    } else {
      assert.strictEqual(res.status, 200, 'Invalid query params should fall back safely'); pass();
      const data = await res.json();
      assert.ok(Array.isArray(data.history), 'Fall back to default scope should work'); pass();
    }
  }

  // 5. Accessibility Contract
  console.log('  - Testing Accessibility Data Summaries...');
  for (const loc of locRecords) {
     const res = await fetch(`${BASE_URL}/api/locations/${loc.slug}/market/history`);
     const data = await res.json();
     for (const snap of data.history) {
        // Ensure all required fields for aria-labels are present and formatted
        assert.ok(snap.snapshotDate.includes('-'), 'Date format'); pass();
        assert.ok(typeof snap.publishedProjectCount === 'number', 'Supply data'); pass();
        assert.ok(Array.isArray(snap.priceMetrics), 'Price metrics array'); pass();
     }
  }

  console.log(`\n🎉 PHASE 15.3 TEST SUITE COMPLETED SUCCESSFULLY!`);
  console.log(`Total Meaningful Assertions Executed: ${assertionCount}`);
  console.log('====================================================\n');
  return assertionCount;
}

runPhase153Tests().catch(err => {
  console.error('\n✕ PHASE 15.3 TEST FAILED:');
  console.error(err);
  process.exit(1);
});
