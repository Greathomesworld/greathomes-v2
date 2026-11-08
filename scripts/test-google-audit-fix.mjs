import assert from 'assert';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

async function runGoogleAuditFixTests() {
  console.log('====================================================');
  console.log('🚀 RUNNING GOOGLE SEARCH CONSOLE AUDIT LOGGING FIX TESTS');
  console.log(`Target: ${BASE_URL}`);
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      passed++;
      console.log(`  ✓ [${passed + failed}] ${name}`);
    } catch (err) {
      failed++;
      console.error(`  ✕ [${passed + failed}] ${name}`);
      console.error(`    Error: ${err.message}`);
    }
  }

  // Admin auth headers helper
  const adminHeaders = {
    'Content-Type': 'application/json',
    'x-staff-id': 'staff_super_01',
    'x-staff-role': 'SUPER_ADMIN',
  };

  console.log('--- 1. URL Inspection API Verification ---');

  await test('URL inspection for static root page returns HTTP 200 with Google results', async () => {
    const res = await fetch(`${BASE_URL}/api/admin/google/search-console/inspect`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ url: 'https://landasset.co.in/' }),
    });

    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.success, true);
    assert.ok(json.data?.inspectionResult);
    assert.strictEqual(json.data.inspectionResult.indexStatusResult.verdict, 'PASS');
  });

  await test('URL inspection for project listing page returns HTTP 200 with Google results', async () => {
    const res = await fetch(`${BASE_URL}/api/admin/google/search-console/inspect`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ url: 'https://landasset.co.in/projects' }),
    });

    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.success, true);
    assert.ok(json.data?.inspectionResult);
    assert.strictEqual(json.data.inspectionResult.indexStatusResult.coverageState, 'Submitted and indexed');
  });

  await test('URL inspection for project detail page returns HTTP 200 with Google results', async () => {
    const res = await fetch(`${BASE_URL}/api/admin/google/search-console/inspect`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ url: 'https://landasset.co.in/projects/keventer-one' }),
    });

    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.success, true);
    assert.ok(json.data?.inspectionResult);
    assert.strictEqual(json.data.inspectionResult.indexStatusResult.userCanonical, 'https://landasset.co.in/projects/keventer-one');
  });

  console.log('\n--- 2. Sitemap Submission & Deletion API Verification ---');

  await test('Sitemap submission returns HTTP 200 with Google response', async () => {
    const res = await fetch(`${BASE_URL}/api/admin/google/search-console/sitemap`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ feedpath: 'https://landasset.co.in/sitemap.xml' }),
    });

    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.success, true);
    assert.strictEqual(json.data.feedpath, 'https://landasset.co.in/sitemap.xml');
  });

  await test('Sitemap deletion returns HTTP 200 with Google response', async () => {
    const res = await fetch(`${BASE_URL}/api/admin/google/search-console/sitemap`, {
      method: 'DELETE',
      headers: adminHeaders,
      body: JSON.stringify({ feedpath: 'https://landasset.co.in/sitemap.xml' }),
    });

    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.success, true);
    assert.ok(json.data.deletedAt);
  });

  console.log('\n--- 3. Audit Log Inspection & Security Verification ---');

  await test('Audit logs record SEARCH_CONSOLE_INSPECTION with null resourceId and URL in metadata', async () => {
    const res = await fetch(`${BASE_URL}/api/admin/audit?action=SEARCH_CONSOLE_INSPECTION&pageSize=5`, {
      headers: adminHeaders,
    });

    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.success, true);
    assert.ok(json.data.length > 0, 'Should have recorded audit logs for URL inspections');
    
    const latest = json.data[0];
    assert.strictEqual(latest.action, 'SEARCH_CONSOLE_INSPECTION');
    assert.strictEqual(latest.resourceType, 'SEARCH_CONSOLE');
    assert.strictEqual(latest.resourceId, null, 'Must NOT store URL as fake numeric entity ID');
    assert.ok(latest.metadata?.url, 'Target URL must be stored in metadata');
    assert.strictEqual(latest.metadata.verdict, 'PASS');
  });

  await test('Audit logs record SITEMAP_SUBMITTED with null resourceId and sitemap in metadata', async () => {
    const res = await fetch(`${BASE_URL}/api/admin/audit?action=SITEMAP_SUBMITTED&pageSize=5`, {
      headers: adminHeaders,
    });

    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.success, true);
    assert.ok(json.data.length > 0);
    
    const latest = json.data[0];
    assert.strictEqual(latest.action, 'SITEMAP_SUBMITTED');
    assert.strictEqual(latest.resourceId, null);
    assert.strictEqual(latest.metadata?.feedPath, 'https://landasset.co.in/sitemap.xml');
  });

  console.log('\n--- 4. Error Isolation & Database Safety ---');

  await test('Invalid URL input returns HTTP 400 Bad Request (not a 500 error)', async () => {
    const res = await fetch(`${BASE_URL}/api/admin/google/search-console/inspect`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ url: 'invalid-url' }),
    });

    assert.strictEqual(res.status, 400);
    const json = await res.json();
    assert.strictEqual(json.error, 'BAD_REQUEST');
  });

  await test('Unauthenticated inspection request is rejected with HTTP 401', async () => {
    const res = await fetch(`${BASE_URL}/api/admin/google/search-console/inspect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://landasset.co.in/' }),
    });

    assert.strictEqual(res.status, 401);
  });

  console.log('\n====================================================');
  console.log(`SUMMARY: ${passed} / ${passed + failed} assertions passed (${Math.round((passed / (passed + failed)) * 100)}%)`);
  console.log('====================================================\n');

  if (failed === 0) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runGoogleAuditFixTests().catch((err) => {
  console.error('Test runner failed:', err);
  process.exit(1);
});
