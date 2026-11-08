import assert from 'node:assert/strict';
import http from 'node:http';

async function fetchRoute(path) {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:3000${path}`, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data,
        });
      });
    }).on('error', reject);
  });
}

async function postApi(path, payload) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(payload);
    const req = http.request(
      `http://localhost:3000${path}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
        },
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
          });
        });
      }
    );
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function runTests() {
  console.log('--- Starting Phase 05F.6.D Runtime Verification ---');

  // Warm-up call
  await fetchRoute('/');

  // Test 1: Project Enquiry submission
  console.log('\n[1] Testing Project Enquiry via POST /api/enquiries');
  const projectEnq = await postApi('/api/enquiries', {
    contextType: 'PROJECT',
    projectSlug: 'merlin-rise',
    name: 'Arjun Das',
    phone: '9830012345',
    email: 'arjun.das@example.com',
    preferredContact: 'WHATSAPP',
    requestSiteVisit: true,
    message: 'Interested in 3 BHK duplex configurations with east facing layout.',
  });
  assert.equal(projectEnq.statusCode, 201, 'Project enquiry must return 201');
  assert.equal(projectEnq.body.success, true, 'Project enquiry must succeed');
  assert.ok(projectEnq.body.enquiryId, 'Must return generated enquiryId');
  console.log('✓ Project Enquiry submission PASSED');

  // Test 2: Resale Linked Enquiry submission
  console.log('\n[2] Testing Resale Linked Enquiry via POST /api/enquiries');
  const resaleLinkedEnq = await postApi('/api/enquiries', {
    contextType: 'RESALE',
    listingSlug: 'merlin-rise-3-bhk-executive-resale',
    name: 'Pooja Sen',
    phone: '+91 98300 99887',
    preferredContact: 'PHONE',
    requestSiteVisit: true,
  });
  assert.equal(resaleLinkedEnq.statusCode, 201, 'Resale linked enquiry must return 201');
  assert.equal(resaleLinkedEnq.body.success, true, 'Resale linked enquiry must succeed');
  console.log('✓ Resale Linked Enquiry submission PASSED');

  // Test 3: Resale Unlinked Enquiry submission (projectId = null)
  console.log('\n[3] Testing Resale Unlinked Enquiry via POST /api/enquiries');
  const resaleUnlinkedEnq = await postApi('/api/enquiries', {
    contextType: 'RESALE',
    listingSlug: 'south-city-3-bhk-independent-penthouse-resale',
    name: 'Rohit Bose',
    phone: '9830077889',
    preferredContact: 'EMAIL',
    email: 'rohit.bose@example.com',
    requestSiteVisit: false,
  });
  assert.equal(resaleUnlinkedEnq.statusCode, 201, 'Resale unlinked enquiry must return 201');
  assert.equal(resaleUnlinkedEnq.body.success, true, 'Resale unlinked enquiry must succeed');
  console.log('✓ Resale Unlinked Enquiry submission PASSED');

  // Test 4: Rental Linked Enquiry submission
  console.log('\n[4] Testing Rental Linked Enquiry via POST /api/enquiries');
  const rentLinkedEnq = await postApi('/api/enquiries', {
    contextType: 'RENTAL',
    listingSlug: 'merlin-rise-2-bhk-semi-furnished-rent',
    name: 'Sneha Roy',
    phone: '9831122334',
    preferredContact: 'WHATSAPP',
    requestSiteVisit: true,
  });
  assert.equal(rentLinkedEnq.statusCode, 201, 'Rental linked enquiry must return 201');
  assert.equal(rentLinkedEnq.body.success, true, 'Rental linked enquiry must succeed');
  console.log('✓ Rental Linked Enquiry submission PASSED');

  // Test 5: Rental Unlinked Enquiry submission (projectId = null)
  console.log('\n[5] Testing Rental Unlinked Enquiry via POST /api/enquiries');
  const rentUnlinkedEnq = await postApi('/api/enquiries', {
    contextType: 'RENTAL',
    listingSlug: 'ballygunge-2-bhk-classic-residence-rent',
    name: 'Vikram Ghosh',
    phone: '9830088990',
    preferredContact: 'PHONE',
    requestSiteVisit: false,
  });
  assert.equal(rentUnlinkedEnq.statusCode, 201, 'Rental unlinked enquiry must return 201');
  assert.equal(rentUnlinkedEnq.body.success, true, 'Rental unlinked enquiry must succeed');
  console.log('✓ Rental Unlinked Enquiry submission PASSED');

  // Test 6: Validation Errors
  console.log('\n[6] Testing Validation Error handling');
  // Missing name
  const missingName = await postApi('/api/enquiries', {
    contextType: 'PROJECT',
    projectSlug: 'merlin-rise',
    name: '',
    phone: '9830012345',
  });
  assert.equal(missingName.statusCode, 400, 'Missing name must return 400');
  assert.equal(missingName.body.success, false);

  // Invalid phone number
  const invalidPhone = await postApi('/api/enquiries', {
    contextType: 'PROJECT',
    projectSlug: 'merlin-rise',
    name: 'Test Buyer',
    phone: '12345',
  });
  assert.equal(invalidPhone.statusCode, 400, 'Invalid phone must return 400');
  assert.equal(invalidPhone.body.success, false);

  // Invalid email
  const invalidEmail = await postApi('/api/enquiries', {
    contextType: 'PROJECT',
    projectSlug: 'merlin-rise',
    name: 'Test Buyer',
    phone: '9830012345',
    email: 'not-an-email',
  });
  assert.equal(invalidEmail.statusCode, 400, 'Invalid email must return 400');

  // Non-existent listing
  const nonExistent = await postApi('/api/enquiries', {
    contextType: 'RESALE',
    listingSlug: 'non-existent-resale-slug-xyz',
    name: 'Test Buyer',
    phone: '9830012345',
  });
  assert.equal(nonExistent.statusCode, 400, 'Non-existent listing must return 400');
  console.log('✓ Validation Error handling checks PASSED');

  // Test 7: Security & Anti-tampering check
  console.log('\n[7] Testing Security & Privacy boundaries');
  const tamperedEnq = await postApi('/api/enquiries', {
    contextType: 'RESALE',
    listingSlug: 'merlin-rise-3-bhk-executive-resale',
    name: 'Security Tester',
    phone: '9830012345',
    ownerPhone: '+919999999999',
    crmId: 'crm-fake-injection',
    brokerEmail: 'fake@broker.com',
  });
  assert.equal(tamperedEnq.statusCode, 201);
  // Verify that API response never leaks internal private data
  assert.ok(!JSON.stringify(tamperedEnq.body).includes('crm-fake-injection'));
  assert.ok(!JSON.stringify(tamperedEnq.body).includes('+919999999999'));
  console.log('✓ Security & Privacy boundary checks PASSED');

  // Test 8: URL-driven enquiry triggers on pages
  console.log('\n[8] Testing URL-driven enquiry pages');
  const resBuyEnquire = await fetchRoute('/buy?enquire=merlin-rise-3-bhk-executive-resale');
  assert.equal(resBuyEnquire.statusCode, 200, '/buy with ?enquire must return 200');

  const resRentEnquire = await fetchRoute('/rent?enquire=merlin-rise-2-bhk-semi-furnished-rent');
  assert.equal(resRentEnquire.statusCode, 200, '/rent with ?enquire must return 200');
  console.log('✓ URL-driven enquiry checks PASSED');

  // Test 9: Regression test across main routes
  console.log('\n[9] Regression testing across Great Homes routes');
  const resProject = await fetchRoute('/projects/merlin-rise');
  assert.equal(resProject.statusCode, 200);

  const resBuy = await fetchRoute('/buy/merlin-rise-3-bhk-executive-resale');
  assert.equal(resBuy.statusCode, 200);

  const resRent = await fetchRoute('/rent/merlin-rise-2-bhk-semi-furnished-rent');
  assert.equal(resRent.statusCode, 200);

  console.log('✓ Regression checks PASSED');

  console.log('\n=== ALL PHASE 05F.6.D TESTS PASSED ===\n');
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
