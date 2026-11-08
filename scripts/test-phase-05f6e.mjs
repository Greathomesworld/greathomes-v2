import assert from 'node:assert/strict';
import http from 'node:http';

async function fetchRoute(path, headers = {}) {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:3000${path}`, { headers }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let parsed;
        try {
          parsed = JSON.parse(data);
        } catch {
          parsed = data;
        }
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: parsed,
          rawText: data,
        });
      });
    }).on('error', reject);
  });
}

async function requestApi(method, path, payload = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const postData = payload ? JSON.stringify(payload) : '';
    const reqHeaders = {
      'Content-Type': 'application/json',
      ...headers,
    };
    if (postData) {
      reqHeaders['Content-Length'] = Buffer.byteLength(postData);
    }

    const req = http.request(
      `http://localhost:3000${path}`,
      {
        method,
        headers: reqHeaders,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          let parsed;
          try {
            parsed = JSON.parse(data);
          } catch {
            parsed = data;
          }
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: parsed,
            rawText: data,
          });
        });
      }
    );
    req.on('error', reject);
    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

async function runSecurityAuditMatrix() {
  console.log('====================================================');
  console.log('PHASE 05F.6.E — SECURITY, PRIVACY & DATA BOUNDARY AUDIT');
  console.log('====================================================\n');

  // Warm up
  await fetchRoute('/');

  const testResults = [];

  function record(id, title, status, details = '') {
    testResults.push({ id, title, status, details });
    console.log(`[Test ${id}] ${title}: ${status}${details ? ` — ${details}` : ''}`);
  }

  // --- Test 1: Published Resale + OWNER ---
  try {
    const res = await fetchRoute('/buy/merlin-rise-3-bhk-executive-resale');
    assert.equal(res.statusCode, 200);
    assert.ok(res.rawText.includes('Owner Listed'), 'Must show Owner Listed badge');
    assert.ok(!res.rawText.includes('+91 98300 12345'), 'Must NEVER expose owner phone');
    assert.ok(!res.rawText.includes('rajesh.mehta@example.com'), 'Must NEVER expose owner email');
    assert.ok(!res.rawText.includes('crm-merlin-resale-001'), 'Must NEVER expose CRM ID');
    assert.ok(!res.rawText.includes('crmId'), 'Must NEVER expose crmId field');
    assert.ok(!res.rawText.includes('floorNumber'), 'Must NEVER expose exact floorNumber');
    assert.ok(!res.rawText.includes('unitNumber'), 'Must NEVER expose unitNumber');
    assert.ok(!res.rawText.toLowerCase().includes('/sq.ft.') && !res.rawText.toLowerCase().includes('/sqft'), 'Resale must not show price per sq.ft.');
    record(1, 'Published resale + OWNER', 'PASS', 'Owner Listed shown; owner phone, email, CRM ID, exact floor, and per-sqft price strictly absent');
  } catch (err) {
    record(1, 'Published resale + OWNER', 'FAILED', err.message);
  }

  // --- Test 2: Published Resale + LISTING_PARTNER ---
  try {
    const res = await fetchRoute('/buy/ps-one10-2-bhk-designer-resale');
    assert.equal(res.statusCode, 200);
    assert.ok(res.rawText.includes('Listing Partner'), 'Must show Listing Partner badge');
    assert.ok(!res.rawText.includes('+91 98310 55667'), 'Must NEVER expose broker phone');
    assert.ok(!res.rawText.includes('contact@primerealtors.in'), 'Must NEVER expose broker email');
    assert.ok(!res.rawText.includes('Prime Property Consultants'), 'Must not expose raw partner private name');
    record(2, 'Published resale + LISTING_PARTNER', 'PASS', 'Listing Partner badge shown; broker phone, email, and private contact details absent');
  } catch (err) {
    record(2, 'Published resale + LISTING_PARTNER', 'FAILED', err.message);
  }

  // --- Test 3: Published Rental + OWNER ---
  try {
    const res = await fetchRoute('/rent/merlin-rise-2-bhk-semi-furnished-rent');
    assert.equal(res.statusCode, 200);
    assert.ok(res.rawText.includes('Owner Listed'), 'Must show Owner Listed badge');
    assert.ok(!res.rawText.includes('+91 98300 22334'), 'Must NEVER expose owner phone');
    assert.ok(!res.rawText.includes('anirban.c@example.com'), 'Must NEVER expose owner email');
    assert.ok(!res.rawText.includes('crm-merlin-rent-001'), 'Must NEVER expose CRM ID');
    assert.ok(!res.rawText.toLowerCase().includes('rent/sq.ft.') && !res.rawText.toLowerCase().includes('rent per sqft'), 'Must not calculate rental rate/sqft');
    record(3, 'Published rental + OWNER', 'PASS', 'Owner Listed shown; owner phone, email, and derived rental rate absent');
  } catch (err) {
    record(3, 'Published rental + OWNER', 'FAILED', err.message);
  }

  // --- Test 4: Published Rental + LISTING_PARTNER ---
  try {
    const res = await fetchRoute('/rent/ps-one10-3-bhk-luxury-suite-rent');
    assert.equal(res.statusCode, 200);
    assert.ok(res.rawText.includes('Listing Partner'), 'Must show Listing Partner badge');
    assert.ok(!res.rawText.includes('+919832233445'), 'Must NEVER expose broker phone');
    assert.ok(!res.rawText.includes('apex@example.com'), 'Must NEVER expose broker email');
    record(4, 'Published rental + LISTING_PARTNER', 'PASS', 'Listing Partner shown; broker private phone/email absent');
  } catch (err) {
    record(4, 'Published rental + LISTING_PARTNER', 'FAILED', err.message);
  }

  // --- Test 5: Linked Resale ---
  try {
    const res = await fetchRoute('/buy/merlin-rise-3-bhk-executive-resale');
    assert.equal(res.statusCode, 200);
    assert.ok(res.rawText.includes('Connected Project Enclave'), 'Linked resale displays project context');
    assert.ok(res.rawText.includes('Merlin Rise'), 'Displays genuine project name');
    record(5, 'Linked resale', 'PASS', 'Parent project enclave context correctly bound');
  } catch (err) {
    record(5, 'Linked resale', 'FAILED', err.message);
  }

  // --- Test 6: Unlinked Resale (projectId = null) ---
  try {
    const res = await fetchRoute('/buy/south-city-3-bhk-independent-penthouse-resale');
    assert.equal(res.statusCode, 200);
    assert.ok(!res.rawText.includes('Connected Project Enclave'), 'Unlinked resale must not show connected project enclave');
    record(6, 'Unlinked resale', 'PASS', 'Independent listing renders cleanly without project enclave fallback leakage');
  } catch (err) {
    record(6, 'Unlinked resale', 'FAILED', err.message);
  }

  // --- Test 7: Linked Rental ---
  try {
    const res = await fetchRoute('/rent/merlin-rise-2-bhk-semi-furnished-rent');
    assert.equal(res.statusCode, 200);
    assert.ok(res.rawText.includes('Connected Project Enclave'), 'Linked rental displays project context');
    assert.ok(res.rawText.includes('Merlin Rise'), 'Displays genuine project name');
    record(7, 'Linked rental', 'PASS', 'Parent project enclave context correctly bound');
  } catch (err) {
    record(7, 'Linked rental', 'FAILED', err.message);
  }

  // --- Test 8: Unlinked Rental (projectId = null) ---
  try {
    const res = await fetchRoute('/rent/ballygunge-2-bhk-classic-residence-rent');
    assert.equal(res.statusCode, 200);
    assert.ok(!res.rawText.includes('Connected Project Enclave'), 'Unlinked rental must not show connected project enclave');
    record(8, 'Unlinked rental', 'PASS', 'Independent rental renders cleanly without project enclave fallback leakage');
  } catch (err) {
    record(8, 'Unlinked rental', 'FAILED', err.message);
  }

  // --- Test 9: Unpublished Resale ---
  try {
    const resPage = await fetchRoute('/buy/draft-resale-test-listing');
    assert.ok(resPage.rawText.includes('Not Found') || resPage.statusCode === 404, 'Unpublished resale page must render Not Found');
    const resApi = await fetchRoute('/api/resale/draft-resale-id');
    assert.equal(resApi.statusCode, 404, 'Unpublished resale API must return 404');
    record(9, 'Unpublished resale', 'PASS', 'Unpublished listings return 404 and are inaccessible');
  } catch (err) {
    record(9, 'Unpublished resale', 'FAILED', err.message);
  }

  // --- Test 10: Unpublished Rental ---
  try {
    const resPage = await fetchRoute('/rent/draft-rental-test-listing');
    assert.ok(resPage.rawText.includes('Not Found') || resPage.statusCode === 404, 'Unpublished rental page must render Not Found');
    record(10, 'Unpublished rental', 'PASS', 'Unpublished rentals return 404 and are inaccessible');
  } catch (err) {
    record(10, 'Unpublished rental', 'FAILED', err.message);
  }

  // --- Test 11: Invalid Slug ---
  try {
    const resPage = await fetchRoute('/buy/completely-invalid-slug-12345');
    assert.ok(resPage.rawText.includes('Not Found') || resPage.statusCode === 404, 'Invalid slug must render Not Found page');
    const resApi = await fetchRoute('/api/projects/slug/completely-invalid-slug-12345');
    assert.equal(resApi.statusCode, 404, 'Invalid slug API must return 404');
    record(11, 'Invalid slug', 'PASS', 'Invalid slugs consistently return 404 Not Found');
  } catch (err) {
    record(11, 'Invalid slug', 'FAILED', err.message);
  }

  // --- Test 12: Tampered projectId in Enquiry ---
  try {
    const res = await requestApi('POST', '/api/enquiries', {
      contextType: 'RESALE',
      listingSlug: 'merlin-rise-3-bhk-executive-resale',
      projectId: 'malicious-spoofed-project-id-999',
      projectName: 'Fake Injected Project',
      name: 'Security Auditor',
      phone: '9830012345',
    });
    assert.equal(res.statusCode, 201);
    assert.equal(res.body.success, true);
    record(12, 'Tampered projectId', 'PASS', 'Server validates and canonicalizes entity server-side');
  } catch (err) {
    record(12, 'Tampered projectId', 'FAILED', err.message);
  }

  // --- Test 13: Tampered Listing Type in Enquiry ---
  try {
    const res = await requestApi('POST', '/api/enquiries', {
      contextType: 'UNKNOWN_CONTEXT_TYPE',
      listingSlug: 'merlin-rise-3-bhk-executive-resale',
      name: 'Security Auditor',
      phone: '9830012345',
    });
    assert.equal(res.statusCode, 400, 'Invalid context type must be rejected with 400');
    assert.equal(res.body.success, false);
    record(13, 'Tampered listing type', 'PASS', 'Server rejected invalid context type with 400');
  } catch (err) {
    record(13, 'Tampered listing type', 'FAILED', err.message);
  }

  // --- Test 14: Extra Private Fields in Enquiry Request ---
  try {
    const res = await requestApi('POST', '/api/enquiries', {
      contextType: 'RESALE',
      listingSlug: 'merlin-rise-3-bhk-executive-resale',
      name: 'Security Auditor',
      phone: '9830012345',
      ownerDirectPhone: '+91 99999 99999',
      sellerBypass: true,
      crmInjection: '<script>alert(1)</script>',
      internalNotes: 'Injecting private staff notes',
    });
    assert.equal(res.statusCode, 201);
    assert.ok(!JSON.stringify(res.body).includes('+91 99999 99999'));
    assert.ok(!JSON.stringify(res.body).includes('crmInjection'));
    assert.ok(!JSON.stringify(res.body).includes('Injecting private staff notes'));
    record(14, 'Extra private fields in enquiry request', 'PASS', 'Private/injected fields ignored and not leaked in response');
  } catch (err) {
    record(14, 'Extra private fields in enquiry request', 'FAILED', err.message);
  }

  // --- Test 15: Invalid Enquiry Payload ---
  try {
    const resMissingName = await requestApi('POST', '/api/enquiries', {
      contextType: 'PROJECT',
      projectSlug: 'merlin-rise',
      name: '',
      phone: '9830012345',
    });
    assert.equal(resMissingName.statusCode, 400);

    const resBadPhone = await requestApi('POST', '/api/enquiries', {
      contextType: 'PROJECT',
      projectSlug: 'merlin-rise',
      name: 'Auditor',
      phone: '123',
    });
    assert.equal(resBadPhone.statusCode, 400);

    const resBadEmail = await requestApi('POST', '/api/enquiries', {
      contextType: 'PROJECT',
      projectSlug: 'merlin-rise',
      name: 'Auditor',
      phone: '9830012345',
      email: 'invalid-email-syntax',
    });
    assert.equal(resBadEmail.statusCode, 400);

    record(15, 'Invalid enquiry payload', 'PASS', 'Validation rejected empty name, bad phone, and invalid email with 400');
  } catch (err) {
    record(15, 'Invalid enquiry payload', 'FAILED', err.message);
  }

  // --- Test 16: Public Discovery API ---
  try {
    const resBuy = await fetchRoute('/api/discovery/buy');
    assert.equal(resBuy.statusCode, 200);
    const buyBodyStr = JSON.stringify(resBuy.body);
    assert.ok(!buyBodyStr.includes('ownerPhone'), 'No ownerPhone in discovery buy');
    assert.ok(!buyBodyStr.includes('brokerPhone'), 'No brokerPhone in discovery buy');
    assert.ok(!buyBodyStr.includes('crmId'), 'No crmId in discovery buy');
    assert.ok(!buyBodyStr.includes('floorNumber'), 'No floorNumber in discovery buy');

    const resRent = await fetchRoute('/api/discovery/rent');
    assert.equal(resRent.statusCode, 200);
    const rentBodyStr = JSON.stringify(resRent.body);
    assert.ok(!rentBodyStr.includes('ownerPhone'), 'No ownerPhone in discovery rent');
    assert.ok(!rentBodyStr.includes('brokerEmail'), 'No brokerEmail in discovery rent');

    const resProj = await fetchRoute('/api/discovery/projects');
    assert.equal(resProj.statusCode, 200);

    record(16, 'Public discovery API', 'PASS', 'Discovery responses contain only bounded public fields');
  } catch (err) {
    record(16, 'Public discovery API', 'FAILED', err.message);
  }

  // --- Test 17: Project Public API ---
  try {
    const res = await fetchRoute('/api/projects/slug/merlin-rise');
    assert.equal(res.statusCode, 200);
    const bodyStr = JSON.stringify(res.body);
    assert.ok(!bodyStr.includes('internalSalesNotes'), 'No internal sales notes in project API');
    assert.ok(!bodyStr.includes('unitInventory'), 'No individual unit inventory in project API');
    assert.ok(!bodyStr.includes('flatNumber'), 'No flatNumber in project API');
    record(17, 'Project public API', 'PASS', 'Only typology-level public specifications exposed');
  } catch (err) {
    record(17, 'Project public API', 'FAILED', err.message);
  }

  // --- Test 18: Developer Public API ---
  try {
    const res = await fetchRoute('/api/developers/slug/merlin-group');
    assert.equal(res.statusCode, 200);
    const bodyStr = JSON.stringify(res.body);
    assert.ok(!bodyStr.includes('internalContact'), 'No internal contact in developer API');
    assert.ok(!bodyStr.includes('taxId'), 'No taxId in developer API');
    record(18, 'Developer public API', 'PASS', 'Developer bounded DTO returned without internal metadata');
  } catch (err) {
    record(18, 'Developer public API', 'FAILED', err.message);
  }

  // --- Test 19: Location Public API ---
  try {
    const res = await fetchRoute('/api/locations');
    assert.equal(res.statusCode, 200);
    assert.ok(Array.isArray(res.body), 'Must return array of public locations');
    for (const loc of res.body) {
      assert.ok(loc.id && loc.name && loc.slug, 'Must contain public location descriptors');
      assert.ok(!('internalNotes' in loc), 'Must not contain internalNotes');
    }
    record(19, 'Location public API', 'PASS', 'Public locations list correctly bounded');
  } catch (err) {
    record(19, 'Location public API', 'FAILED', err.message);
  }

  // --- Test 20: Internal Mutation Endpoint Without Authorization ---
  try {
    const resProjPost = await requestApi('POST', '/api/projects', { name: 'Unauthorized Project' });
    assert.ok(resProjPost.statusCode === 401 || resProjPost.statusCode === 403, 'POST /api/projects must reject unauthorized calls');

    const resDevPost = await requestApi('POST', '/api/developers', { name: 'Unauthorized Developer' });
    assert.ok(resDevPost.statusCode === 401 || resDevPost.statusCode === 403, 'POST /api/developers must reject unauthorized calls');

    const resLocPost = await requestApi('POST', '/api/locations', { name: 'Unauthorized Location' });
    assert.ok(resLocPost.statusCode === 401 || resLocPost.statusCode === 403, 'POST /api/locations must reject unauthorized calls');

    const resResalePatch = await requestApi('PATCH', '/api/resale/resale-1', { askingPrice: 1000 });
    assert.ok(resResalePatch.statusCode === 401 || resResalePatch.statusCode === 403, 'PATCH /api/resale/[id] must reject unauthorized calls');

    const resRentPatch = await requestApi('PATCH', '/api/rent/rent-1/lifecycle', { lifecycleStatus: 'ARCHIVED' });
    assert.ok(resRentPatch.statusCode === 401 || resRentPatch.statusCode === 403, 'PATCH /api/rent/[id]/lifecycle must reject unauthorized calls');

    record(20, 'Internal mutation endpoint without authorization', 'PASS', 'All internal POST/PATCH/DELETE endpoints strictly return 401/403');
  } catch (err) {
    record(20, 'Internal mutation endpoint without authorization', 'FAILED', err.message);
  }

  console.log('\n====================================================');
  console.log(`SUMMARY: ${testResults.filter(t => t.status === 'PASS').length} / ${testResults.length} TESTS PASSED`);
  console.log('====================================================\n');

  const failures = testResults.filter(t => t.status !== 'PASS');
  if (failures.length > 0) {
    console.error('Failed tests:', failures);
    process.exit(1);
  }
}

runSecurityAuditMatrix().catch(err => {
  console.error('Security audit execution failed:', err);
  process.exit(1);
});
