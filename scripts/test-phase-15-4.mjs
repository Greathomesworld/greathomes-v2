import assert from 'assert';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

async function runPhase154Tests() {
  console.log('====================================================');
  console.log('🚀 RUNNING PHASE 15.4 LOCATION COMPARISON TEST SUITE');
  console.log(`Target Base URL: ${BASE_URL}`);
  console.log('====================================================\n');

  let assertionCount = 0;

  try {
    // CATEGORY A: ROUTE VALIDATION & PARAMETER INTEGRITY
    console.log('--- CATEGORY A: Route Validation & Parameter Integrity ---');

    // A1: No locations param -> 400
    const resA1 = await fetch(`${BASE_URL}/api/compare/locations`);
    assert.strictEqual(resA1.status, 400, 'A1: Missing locations param returns 400');
    assertionCount++;

    // A2: Single location -> 400
    const resA2 = await fetch(`${BASE_URL}/api/compare/locations?locations=rajarhat`);
    assert.strictEqual(resA2.status, 400, 'A2: Single location returns 400');
    assertionCount++;

    // A3: More than 4 unique locations -> 400
    const resA3 = await fetch(
      `${BASE_URL}/api/compare/locations?locations=rajarhat,new-town,salt-lake,em-bypass,kolkata`
    );
    assert.strictEqual(resA3.status, 400, 'A3: >4 locations returns 400');
    assertionCount++;

    // A4: Unknown location -> 404
    const resA4 = await fetch(
      `${BASE_URL}/api/compare/locations?locations=rajarhat,nonexistent-corridor-xyz`
    );
    assert.strictEqual(resA4.status, 404, 'A4: Unknown location returns 404');
    assertionCount++;

    // A5: Incompatible hierarchy (STATE vs AREA) -> 400
    const resA5 = await fetch(
      `${BASE_URL}/api/compare/locations?locations=west-bengal,rajarhat`
    );
    assert.strictEqual(resA5.status, 400, 'A5: Incompatible hierarchy returns 400');
    assertionCount++;

    // A6: Deduplication of duplicates (3 passed, 2 unique) -> 200
    const resA6 = await fetch(
      `${BASE_URL}/api/compare/locations?locations=new-town,rajarhat,new-town`
    );
    assert.strictEqual(resA6.status, 200, 'A6: Deduplicated locations return 200');
    assertionCount++;
    const dataA6 = await resA6.json();
    assert.strictEqual(dataA6.locations.length, 2, 'A6: Result has exactly 2 unique locations');
    assertionCount++;

    // CATEGORY B: 2-LOCATION COMPARISON CONTRACT
    console.log('--- CATEGORY B: 2-Location Comparison Contract ---');
    const resB = await fetch(
      `${BASE_URL}/api/compare/locations?locations=rajarhat,new-town`
    );
    assert.strictEqual(resB.status, 200, 'B1: 2-location comparison returns 200');
    assertionCount++;
    const dataB = await resB.json();
    assert.strictEqual(dataB.success, true, 'B2: success is true');
    assertionCount++;
    assert.strictEqual(dataB.mode, 'LOCATIONS', 'B3: mode is LOCATIONS');
    assertionCount++;
    assert.strictEqual(dataB.locations.length, 2, 'B4: Exactly 2 locations returned');
    assertionCount++;
    assert.ok(dataB.comparisonScope, 'B5: comparisonScope exists');
    assertionCount++;
    assert.ok(dataB.matrix, 'B6: matrix exists');
    assertionCount++;
    assert.ok(dataB.matrix.overview.length >= 5, 'B7: Overview matrix has rows');
    assertionCount++;
    assert.ok(dataB.matrix.supply.length >= 3, 'B8: Supply matrix has rows');
    assertionCount++;
    assert.ok(dataB.matrix.pricing.length === 3, 'B9: Pricing matrix has 3 basis rows');
    assertionCount++;
    assert.ok(dataB.matrix.configurations.length >= 5, 'B10: Configuration matrix has BHK rows');
    assertionCount++;
    assert.ok(dataB.matrix.rera.length >= 4, 'B11: RERA matrix has rows');
    assertionCount++;
    assert.ok(dataB.matrix.connectivity.length >= 5, 'B12: Connectivity matrix has categories');
    assertionCount++;

    // CATEGORY C: 3-LOCATION COMPARISON CONTRACT
    console.log('--- CATEGORY C: 3-Location Comparison Contract ---');
    const resC = await fetch(
      `${BASE_URL}/api/compare/locations?locations=rajarhat,new-town,salt-lake`
    );
    assert.strictEqual(resC.status, 200, 'C1: 3-location comparison returns 200');
    assertionCount++;
    const dataC = await resC.json();
    assert.strictEqual(dataC.locations.length, 3, 'C2: Exactly 3 locations returned');
    assertionCount++;

    // CATEGORY D: 4-LOCATION COMPARISON CONTRACT
    console.log('--- CATEGORY D: 4-Location Comparison Contract ---');
    const resD = await fetch(
      `${BASE_URL}/api/compare/locations?locations=rajarhat,new-town,salt-lake,em-bypass`
    );
    assert.strictEqual(resD.status, 200, 'D1: 4-location comparison returns 200');
    assertionCount++;
    const dataD = await resD.json();
    assert.strictEqual(dataD.locations.length, 4, 'D2: Exactly 4 locations returned');
    assertionCount++;

    // CATEGORY E: PRICING BASIS ISOLATION
    console.log('--- CATEGORY E: Pricing Basis Isolation ---');
    for (const basisRow of dataB.matrix.pricing) {
      assert.ok(
        ['CARPET_AREA', 'BUILT_UP_AREA', 'SUPER_BUILT_UP_AREA'].includes(basisRow.basis),
        'E1: Basis is valid'
      );
      assertionCount++;
      for (const metric of basisRow.metrics) {
        assert.ok(metric.label, 'E2: Metric has label');
        assertionCount++;
        assert.ok(metric.values, 'E3: Metric has values object');
        assertionCount++;
      }
    }

    // CATEGORY F: PRIVACY & BOUNDED DTO
    console.log('--- CATEGORY F: Privacy & Bounded DTO Enforcement ---');
    const jsonStr = JSON.stringify(dataB);
    assert.strictEqual(jsonStr.includes('ownerPhone'), false, 'F1: No ownerPhone leak');
    assertionCount++;
    assert.strictEqual(jsonStr.includes('ownerEmail'), false, 'F2: No ownerEmail leak');
    assertionCount++;
    assert.strictEqual(jsonStr.includes('brokerPhone'), false, 'F3: No brokerPhone leak');
    assertionCount++;
    assert.strictEqual(jsonStr.includes('brokerEmail'), false, 'F4: No brokerEmail leak');
    assertionCount++;
    assert.strictEqual(jsonStr.includes('crmId'), false, 'F5: No crmId leak');
    assertionCount++;
    assert.strictEqual(jsonStr.includes('internalNotes'), false, 'F6: No internalNotes leak');
    assertionCount++;
    assert.strictEqual(jsonStr.includes('passwordHash'), false, 'F7: No passwordHash leak');
    assertionCount++;

    // CATEGORY G: CACHE-CONTROL HEADERS
    console.log('--- CATEGORY G: Cache-Control Headers ---');
    const cacheHeader = resB.headers.get('cache-control');
    assert.ok(cacheHeader, 'G1: Cache-Control header is present');
    assertionCount++;
    assert.ok(cacheHeader.includes('s-maxage=3600'), 'G2: CDN s-maxage=3600 configured');
    assertionCount++;
    assert.ok(cacheHeader.includes('stale-while-revalidate'), 'G3: Stale-while-revalidate configured');
    assertionCount++;

    console.log(`\n🎉 PHASE 15.4 CORE TEST SUITE COMPLETED: ${assertionCount} assertions passed!`);
  } catch (err) {
    console.error('\n✕ TEST SUITE FAILED:', err);
    process.exit(1);
  }
}

runPhase154Tests();
