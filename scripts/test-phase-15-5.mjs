import assert from 'assert';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

async function runPhase155Tests() {
  console.log('====================================================');
  console.log('🚀 RUNNING PHASE 15.5 MARKET TIMELINE CONTRACT TESTS');
  console.log(`Target Base URL: ${BASE_URL}`);
  console.log('====================================================\n');

  let passed = 0;
  function pass(msg) {
    passed++;
    console.log(`  ✓ [${passed}] ${msg}`);
  }

  // 1. Activity API basic contract
  const res1 = await fetch(`${BASE_URL}/api/locations/rajarhat/activity`);
  assert.strictEqual(res1.status, 200, 'GET /api/locations/rajarhat/activity returns 200');
  const data1 = await res1.json();
  assert.strictEqual(data1.success, true, 'success is true');
  assert.ok(data1.location, 'location object present');
  assert.strictEqual(data1.location.slug, 'rajarhat', 'location slug matches');
  assert.ok(data1.recentActivity, 'recentActivity object present');
  assert.ok(Array.isArray(data1.recentActivity.events), 'events is array');
  pass('Activity API returns valid 200 response with location & recentActivity');

  // 2. Direct vs Descendant scope
  const resDesc = await fetch(`${BASE_URL}/api/locations/rajarhat/activity?scope=DESCENDANT`);
  const dataDesc = await resDesc.json();
  assert.strictEqual(dataDesc.scope, 'DESCENDANT', 'scope is DESCENDANT');
  
  const resDir = await fetch(`${BASE_URL}/api/locations/rajarhat/activity?scope=DIRECT`);
  const dataDir = await resDir.json();
  assert.strictEqual(dataDir.scope, 'DIRECT', 'scope is DIRECT');
  pass('Activity API handles DIRECT and DESCENDANT scopes cleanly');

  // 3. Limit parameter bounding (1 to 20)
  const resLimit1 = await fetch(`${BASE_URL}/api/locations/rajarhat/activity?limit=2`);
  const dataLimit1 = await resLimit1.json();
  assert.ok(dataLimit1.recentActivity.events.length <= 2, 'limit=2 respected');

  const resLimitMax = await fetch(`${BASE_URL}/api/locations/rajarhat/activity?limit=100`);
  const dataLimitMax = await resLimitMax.json();
  assert.ok(dataLimitMax.recentActivity.events.length <= 20, 'limit capped at max 20');
  pass('Activity API bounds limit parameter strictly between 1 and 20');

  // 4. Privacy: Zero forbidden fields
  const forbidden = [
    'ownerPhone',
    'ownerEmail',
    'brokerPhone',
    'brokerEmail',
    'crmId',
    'internalNotes',
    'staffId',
    'verifiedBy',
    'passwordHash',
    'authToken',
  ];
  const str = JSON.stringify(data1);
  for (const f of forbidden) {
    assert.strictEqual(str.includes(f), false, `Payload must not contain ${f}`);
  }
  pass('Activity API response is completely free of private fields');

  // 5. Unknown location returns 404
  const res404 = await fetch(`${BASE_URL}/api/locations/unknown-location-xyz-123/activity`);
  assert.strictEqual(res404.status, 404, 'Unknown location returns 404');
  pass('Activity API returns 404 for nonexistent locations');

  // 6. Utility page /locations/rajarhat/activity renders successfully
  const resPage = await fetch(`${BASE_URL}/locations/rajarhat/activity`);
  assert.strictEqual(resPage.status, 200, 'Utility page returns 200');
  const pageHtml = await resPage.text();
  assert.ok(pageHtml.includes('Market Activity'), 'Page contains Market Activity header');
  assert.ok(pageHtml.includes('Rajarhat'), 'Page contains location name');
  pass('Location Activity utility route renders valid HTML');

  // 7. Deterministic ordering
  const resOrder1 = await fetch(`${BASE_URL}/api/locations/rajarhat/activity`);
  const resOrder2 = await fetch(`${BASE_URL}/api/locations/rajarhat/activity`);
  const dataOrder1 = await resOrder1.json();
  const dataOrder2 = await resOrder2.json();
  assert.deepStrictEqual(
    dataOrder1.recentActivity.events.map((e) => e.id),
    dataOrder2.recentActivity.events.map((e) => e.id),
    'Event ordering is perfectly deterministic'
  );
  pass('Activity events preserve deterministic ordering across repeated calls');

  console.log('\n====================================================');
  console.log(`🎉 ALL ${passed} PHASE 15.5 CONTRACT TESTS PASSED!`);
  console.log('====================================================\n');
}

runPhase155Tests().catch((err) => {
  console.error('Test runner failed:', err);
  process.exit(1);
});
