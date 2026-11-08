import assert from 'assert';
import { marketIntelligenceService } from '../src/domain/marketIntelligence/services/marketIntelligenceService.js';
import { snapshotGenerationService } from '../src/domain/marketIntelligence/services/snapshotGenerationService.js';
import { marketEventService } from '../src/domain/marketIntelligence/services/marketEventService.js';
import { marketSnapshotRepository } from '../src/domain/marketIntelligence/repositories/marketSnapshotRepository.js';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

async function runPhase15Tests() {
  console.log('====================================================');
  console.log('🚀 RUNNING PHASE 15.0 LOCATION & MARKET INTELLIGENCE 2.0 TESTS');
  console.log('====================================================');

  // Suite 1: GET /api/locations/:slug/market
  console.log('\n--- Suite 1: Public Location Market Summary API ---');
  {
    const res = await fetch(`${BASE_URL}/api/locations/new-town/market`);
    assert.strictEqual(res.status, 200, 'Market API should return 200 for valid location');
    const data = await res.json();
    assert.strictEqual(data.success, true, 'Market response should indicate success');
    assert.ok(data.summary, 'Response should contain summary');
    assert.strictEqual(data.summary.location.slug, 'new-town', 'Location slug should match');
    assert.ok(data.summary.supply, 'Summary should contain supply metrics');
    assert.ok(Array.isArray(data.summary.priceMetrics), 'Price metrics should be an array');
    assert.ok(data.summary.reraCoverage, 'Summary should contain RERA coverage');
    assert.ok(data.summary.freshness, 'Summary should contain freshness info');

    // Rule check: No speculative investment scores or ratings
    assert.strictEqual(data.summary.investmentScore, undefined, 'Must not expose investment scores');
    assert.strictEqual(data.summary.recommendation, undefined, 'Must not expose AI recommendations');
    console.log('✅ Public Location Market Summary API contract verified');
  }

  // Suite 2: GET /api/locations/:slug/market with invalid slug
  console.log('\n--- Suite 2: Market API Error Handling ---');
  {
    const res = await fetch(`${BASE_URL}/api/locations/non-existent-locality-slug-999/market`);
    assert.strictEqual(res.status, 404, 'Market API should return 404 for invalid location');
    const data = await res.json();
    assert.strictEqual(data.success, false, 'Error response should indicate success: false');
    console.log('✅ Market API 404 error handling verified');
  }

  // Suite 3: GET /api/locations/:slug/supply
  console.log('\n--- Suite 3: Location Supply Intelligence API ---');
  {
    const resDirect = await fetch(`${BASE_URL}/api/locations/new-town/supply?scope=DIRECT`);
    assert.strictEqual(resDirect.status, 200, 'Supply API DIRECT scope should return 200');
    const dataDirect = await resDirect.json();
    assert.strictEqual(dataDirect.success, true);
    assert.strictEqual(dataDirect.supply.scope, 'DIRECT', 'Scope should be DIRECT');

    const resDesc = await fetch(`${BASE_URL}/api/locations/new-town/supply?scope=DESCENDANT`);
    assert.strictEqual(resDesc.status, 200, 'Supply API DESCENDANT scope should return 200');
    const dataDesc = await resDesc.json();
    assert.strictEqual(dataDesc.supply.scope, 'DESCENDANT', 'Scope should be DESCENDANT');

    assert.ok(typeof dataDesc.supply.totalProjects === 'number', 'totalProjects should be numeric');
    assert.ok(typeof dataDesc.supply.publishedProjects === 'number', 'publishedProjects should be numeric');
    assert.ok(dataDesc.supply.configurationDistribution, 'Should contain configuration distribution');
    console.log('✅ Location Supply Intelligence API contract & scope filtering verified');
  }

  // Suite 4: GET /api/locations/:slug/prices
  console.log('\n--- Suite 4: Location Price Intelligence API ---');
  {
    const res = await fetch(`${BASE_URL}/api/locations/new-town/prices`);
    assert.strictEqual(res.status, 200, 'Prices API should return 200');
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(Array.isArray(data.priceMetrics), 'priceMetrics should be array');

    for (const metric of data.priceMetrics) {
      assert.ok(
        ['CARPET_AREA', 'BUILT_UP_AREA', 'SUPER_BUILT_UP_AREA'].includes(metric.priceBasis),
        'Price basis must be valid canonical type'
      );
      assert.ok(typeof metric.minRatePerSqft === 'number', 'minRatePerSqft should be number');
      assert.ok(typeof metric.maxRatePerSqft === 'number', 'maxRatePerSqft should be number');
      assert.ok(typeof metric.medianRatePerSqft === 'number', 'medianRatePerSqft should be number');
      assert.ok(typeof metric.avgRatePerSqft === 'number', 'avgRatePerSqft should be number');
      assert.ok(metric.sampleCount > 0, 'sampleCount should be > 0');
    }
    console.log('✅ Location Price Intelligence API contract & price basis isolation verified');
  }

  // Suite 5: Domain Services & Snapshot Idempotency
  console.log('\n--- Suite 5: Domain Services & Snapshot Idempotency ---');
  {
    const locationId = '332c48a8-69e1-4b2f-be73-b2cdb0cb04cf'; // New Town ID
    const today = new Date().toISOString().split('T')[0];

    const snapshot1 = await snapshotGenerationService.generateSnapshot(locationId, today);
    assert.ok(snapshot1, 'Snapshot should be generated');
    assert.strictEqual(snapshot1.locationId, locationId, 'Location ID should match');
    assert.strictEqual(snapshot1.snapshotDate, today, 'Snapshot date should match');

    // Generating again for same date must update/upsert (idempotent)
    const snapshot2 = await snapshotGenerationService.generateSnapshot(locationId, today);
    assert.strictEqual(snapshot2.id, snapshot1.id, 'Upsert should reuse deterministic ID');

    const latest = await marketSnapshotRepository.getLatestSnapshot(locationId);
    assert.ok(latest, 'Latest snapshot should be retrieved');
    assert.strictEqual(latest.snapshotDate, today, 'Latest snapshot date should match today');

    console.log('✅ Snapshot generation idempotency verified');
  }

  // Suite 6: Market Event Change Detection
  console.log('\n--- Suite 6: Market Event Change Detection ---');
  {
    const locationId = '332c48a8-69e1-4b2f-be73-b2cdb0cb04cf';
    const testResourceId = `proj_test_${Date.now()}`;

    const event1 = await marketEventService.recordEvent({
      eventType: 'PROJECT_PUBLISHED',
      resourceType: 'PROJECT',
      resourceId: testResourceId,
      locationId,
      newValue: 'PUBLISHED',
    });

    assert.ok(event1, 'Event should be recorded');
    assert.strictEqual(event1.eventType, 'PROJECT_PUBLISHED');
    assert.strictEqual(event1.locationId, locationId);

    // Duplicate event recording with same fingerprint should return existing or ignore duplicates
    const event2 = await marketEventService.recordEvent({
      eventType: 'PROJECT_PUBLISHED',
      resourceType: 'PROJECT',
      resourceId: testResourceId,
      locationId,
      newValue: 'PUBLISHED',
    });

    assert.strictEqual(event2.id, event1.id, 'Duplicate change fingerprint should yield existing event');

    const events = await marketEventService.getEventsForLocation(locationId, 5);
    assert.ok(events.length > 0, 'Recent events should be non-empty');
    assert.ok(events.some(e => e.resourceId === testResourceId), 'Recorded event should be in location timeline');

    console.log('✅ Market event change detection & timeline recording verified');
  }

  console.log('\n====================================================');
  console.log('🎉 ALL PHASE 15.0 LOCATION & MARKET INTELLIGENCE TESTS PASSED!');
  console.log('====================================================\n');
}

runPhase15Tests().catch(err => {
  console.error('❌ Phase 15.0 Test Suite Failed:', err);
  process.exit(1);
});
