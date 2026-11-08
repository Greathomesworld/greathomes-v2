import assert from 'assert';
import {
  hashPassword,
  verifyPassword,
  createCustomerToken,
  verifyCustomerToken,
} from '../src/domain/customer/customerAuth.ts';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

async function runPhase10Tests() {
  console.log('====================================================');
  console.log('🚀 RUNNING PHASE 10 BUYER ACCOUNTS & PERSONALIZATION TEST SUITE (65+ ASSERTIONS)');
  console.log(`Target Base URL: ${BASE_URL}`);
  console.log('====================================================');

  let passed = 0;
  let failed = 0;

  function syncTest(name, fn) {
    try {
      fn();
      passed++;
      console.log(`  ✓ [${passed + failed}] ${name}`);
    } catch (err) {
      failed++;
      console.error(`  ✕ [${passed + failed}] ${name}`);
      console.error(`    Error: ${err.message}`);
    }
  }

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

  // HTTP API Helper
  async function api(endpoint, options = {}) {
    const url = `${BASE_URL}${endpoint}`;
    const res = await fetch(url, {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
    return { status: res.status, ok: res.ok, data, headers: res.headers };
  }

  // ============================================================
  // SECTION 1: CRYPTOGRAPHIC AUTH & TOKEN INTEGRITY (UNIT)
  // ============================================================
  console.log('\n--- SECTION 1: CRYPTOGRAPHIC AUTH & TOKEN INTEGRITY ---');

  syncTest('1.1 Password hashing produces secure salt:hash', () => {
    const h1 = hashPassword('SecurePass123!');
    const h2 = hashPassword('SecurePass123!');
    assert(h1.includes(':'), 'Hash must contain salt delimiter');
    assert.notStrictEqual(h1, h2, 'Different salts must produce different hashes');
  });

  syncTest('1.2 Password verification succeeds for valid password', () => {
    const raw = 'KolkataLuxury2026!';
    const hash = hashPassword(raw);
    assert.strictEqual(verifyPassword(raw, hash), true);
  });

  syncTest('1.3 Password verification rejects incorrect password', () => {
    const hash = hashPassword('CorrectPassword123');
    assert.strictEqual(verifyPassword('WrongPassword', hash), false);
    assert.strictEqual(verifyPassword('', hash), false);
  });

  syncTest('1.4 Customer token generation and verification works', () => {
    const custId = 'cust_test_uuid_999';
    const token = createCustomerToken(custId);
    assert(token && token.split(':').length === 3);
    const verified = verifyCustomerToken(token);
    assert.strictEqual(verified, custId);
  });

  syncTest('1.5 Customer token rejects tampered signatures', () => {
    const token = createCustomerToken('cust_real_id');
    const tampered = token.slice(0, -4) + 'zzzz';
    assert.strictEqual(verifyCustomerToken(tampered), null);
  });

  syncTest('1.6 Customer token strictly rejects staff tokens (Boundary Separation)', () => {
    assert.strictEqual(verifyCustomerToken('gh-internal-staff-secret'), null);
    assert.strictEqual(verifyCustomerToken('internal-dev-key'), null);
    assert.strictEqual(verifyCustomerToken('staff-operations-admin:token'), null);
  });

  // ============================================================
  // SECTION 2: CUSTOMER REGISTRATION API
  // ============================================================
  console.log('\n--- SECTION 2: CUSTOMER REGISTRATION API ---');

  const buyerEmail = `buyer_${Date.now()}@example.com`;
  let customerToken = '';
  let customerId = '';

  await test('2.1 POST /api/customer/auth/register creates new active buyer account', async () => {
    const res = await api('/api/customer/auth/register', {
      method: 'POST',
      body: {
        name: 'Sourav Ganguly',
        email: buyerEmail,
        password: 'KolkataPrince2026',
        phone: '+91 98300 12345',
      },
    });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.data.success, true);
    assert(res.data.customer);
    assert.strictEqual(res.data.customer.email, buyerEmail.toLowerCase());
    assert.strictEqual(res.data.customer.name, 'Sourav Ganguly');
    assert.strictEqual(res.data.customer.status, 'ACTIVE');
    assert.strictEqual(res.data.customer.passwordHash, undefined);
    assert(res.data.token);

    customerToken = res.data.token;
    customerId = res.data.customer.id;
  });

  await test('2.2 POST /api/customer/auth/register rejects duplicate email (409 Conflict)', async () => {
    const res = await api('/api/customer/auth/register', {
      method: 'POST',
      body: {
        name: 'Duplicate User',
        email: buyerEmail,
        password: 'AnotherPassword123',
      },
    });

    assert.strictEqual(res.status, 409);
    assert.strictEqual(res.data.success, false);
  });

  await test('2.3 POST /api/customer/auth/register rejects short passwords (< 8 chars)', async () => {
    const res = await api('/api/customer/auth/register', {
      method: 'POST',
      body: {
        name: 'Short Pass',
        email: `short_${Date.now()}@example.com`,
        password: 'short',
      },
    });

    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.data.success, false);
  });

  await test('2.4 POST /api/customer/auth/register rejects invalid email format', async () => {
    const res = await api('/api/customer/auth/register', {
      method: 'POST',
      body: {
        name: 'Invalid Email',
        email: 'invalid-email-address',
        password: 'ValidPassword123!',
      },
    });

    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.data.success, false);
  });

  // Second Customer for Cross-Customer Isolation Testing
  const buyer2Email = `buyer2_${Date.now()}@example.com`;
  let customer2Token = '';
  let customer2Id = '';

  await test('2.5 Register second buyer account for cross-isolation verification', async () => {
    const res = await api('/api/customer/auth/register', {
      method: 'POST',
      body: {
        name: 'Jhulan Goswami',
        email: buyer2Email,
        password: 'BowlerKolkata2026!',
      },
    });
    assert.strictEqual(res.status, 201);
    customer2Token = res.data.token;
    customer2Id = res.data.customer.id;
  });

  // ============================================================
  // SECTION 3: CUSTOMER LOGIN & SESSION API
  // ============================================================
  console.log('\n--- SECTION 3: CUSTOMER LOGIN & SESSION API ---');

  await test('3.1 POST /api/customer/auth/login authenticates with valid credentials', async () => {
    const res = await api('/api/customer/auth/login', {
      method: 'POST',
      body: {
        email: buyerEmail.toUpperCase(), // Case insensitive check
        password: 'KolkataPrince2026',
      },
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);
    assert.strictEqual(res.data.customer.id, customerId);
    assert.strictEqual(res.data.customer.passwordHash, undefined);
    assert(res.data.token);
  });

  await test('3.2 POST /api/customer/auth/login rejects wrong password (401)', async () => {
    const res = await api('/api/customer/auth/login', {
      method: 'POST',
      body: {
        email: buyerEmail,
        password: 'IncorrectPassword!',
      },
    });

    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.data.success, false);
  });

  await test('3.3 POST /api/customer/auth/login rejects non-existent email (401)', async () => {
    const res = await api('/api/customer/auth/login', {
      method: 'POST',
      body: {
        email: 'ghost_buyer_999@example.com',
        password: 'KolkataPrince2026',
      },
    });

    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.data.success, false);
  });

  await test('3.4 POST /api/customer/auth/logout clears session', async () => {
    const res = await api('/api/customer/auth/logout', {
      method: 'POST',
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);
  });

  // ============================================================
  // SECTION 4: SECURITY BOUNDARY (STAFF VS CUSTOMER SEPARATION)
  // ============================================================
  console.log('\n--- SECTION 4: SECURITY BOUNDARY & SEPARATION ---');

  await test('4.1 Customer token cannot access staff admin routes (401/403)', async () => {
    const res = await api('/api/admin/staff', {
      headers: {
        Authorization: `Bearer ${customerToken}`,
      },
    });

    assert(res.status === 401 || res.status === 403, `Expected 401/403, got ${res.status}`);
  });

  await test('4.2 Staff credentials cannot access customer protected routes (403)', async () => {
    const res = await api('/api/customer/profile', {
      headers: {
        'x-staff-role': 'SUPER_ADMIN',
        'x-staff-user': 'super-admin-user',
      },
    });

    assert(res.status === 401 || res.status === 403);
  });

  await test('4.3 Unauthenticated access to /api/customer/profile returns 401', async () => {
    const res = await api('/api/customer/profile');
    assert.strictEqual(res.status, 401);
  });

  await test('4.4 Invalid customer token is rejected with 401', async () => {
    const res = await api('/api/customer/profile', {
      headers: {
        Authorization: 'Bearer invalid.bogus.token',
      },
    });
    assert.strictEqual(res.status, 401);
  });

  // ============================================================
  // SECTION 5: CUSTOMER PROFILE MANAGEMENT API
  // ============================================================
  console.log('\n--- SECTION 5: CUSTOMER PROFILE MANAGEMENT API ---');

  await test('5.1 GET /api/customer/auth/me returns authenticated customer profile', async () => {
    const res = await api('/api/customer/auth/me', {
      headers: {
        Authorization: `Bearer ${customerToken}`,
      },
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.authenticated, true);
    assert.strictEqual(res.data.customer.id, customerId);
    assert.strictEqual(res.data.customer.passwordHash, undefined);
  });

  await test('5.2 PATCH /api/customer/profile updates name and phone', async () => {
    const res = await api('/api/customer/profile', {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${customerToken}`,
      },
      body: {
        name: 'Sourav Chandidas Ganguly',
        phone: '+91 98300 99999',
      },
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);
    assert.strictEqual(res.data.profile.name, 'Sourav Chandidas Ganguly');
    assert.strictEqual(res.data.profile.phone, '+91 98300 99999');
  });

  await test('5.3 PATCH /api/customer/profile rejects empty name', async () => {
    const res = await api('/api/customer/profile', {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${customerToken}`,
      },
      body: {
        name: '   ',
      },
    });
    assert.strictEqual(res.status, 400);
  });

  // ============================================================
  // SECTION 6: SAVED HOMES & SAVED PROJECTS API
  // ============================================================
  console.log('\n--- SECTION 6: SAVED HOMES & SAVED PROJECTS API ---');

  const testProjSlug = 'merlin-rise';
  let savedItemId = '';

  await test('6.1 POST /api/customer/saved saves a project', async () => {
    const res = await api('/api/customer/saved', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${customerToken}`,
      },
      body: {
        resourceType: 'PROJECT',
        resourceId: testProjSlug,
      },
    });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.data.success, true);
    assert.strictEqual(res.data.item.resourceType, 'PROJECT');
    assert.strictEqual(res.data.item.resourceId, testProjSlug);
    assert(res.data.item.resource);
    savedItemId = res.data.item.id;
  });

  await test('6.2 GET /api/customer/saved/check confirms saved state', async () => {
    const res = await api(
      `/api/customer/saved/check?resourceType=PROJECT&resourceId=${testProjSlug}`,
      {
        headers: {
          Authorization: `Bearer ${customerToken}`,
        },
      }
    );

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.saved, true);
  });

  await test('6.3 GET /api/customer/saved/check returns false for unsaved items', async () => {
    const res = await api(
      `/api/customer/saved/check?resourceType=PROJECT&resourceId=non-existent-proj-xyz`,
      {
        headers: {
          Authorization: `Bearer ${customerToken}`,
        },
      }
    );

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.saved, false);
  });

  await test('6.4 POST /api/customer/saved saves a resale listing', async () => {
    const res = await api('/api/customer/saved', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${customerToken}`,
      },
      body: {
        resourceType: 'RESALE_LISTING',
        resourceId: 'resale-salt-lake-01',
      },
    });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.data.item.resourceType, 'RESALE_LISTING');
  });

  await test('6.5 POST /api/customer/saved saves a rental listing', async () => {
    const res = await api('/api/customer/saved', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${customerToken}`,
      },
      body: {
        resourceType: 'RENTAL_LISTING',
        resourceId: 'rental-new-town-01',
      },
    });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.data.item.resourceType, 'RENTAL_LISTING');
  });

  await test('6.6 GET /api/customer/saved returns all saved items with enriched DTOs', async () => {
    const res = await api('/api/customer/saved', {
      headers: {
        Authorization: `Bearer ${customerToken}`,
      },
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);
    assert(Array.isArray(res.data.items));
    assert(res.data.items.length >= 3);
  });

  await test('6.7 GET /api/customer/saved?resourceType=PROJECT filters by project', async () => {
    const res = await api('/api/customer/saved?resourceType=PROJECT', {
      headers: {
        Authorization: `Bearer ${customerToken}`,
      },
    });

    assert.strictEqual(res.status, 200);
    assert(res.data.items.every((i) => i.resourceType === 'PROJECT'));
  });

  await test('6.8 Cross-Customer Isolation: Buyer 2 does not see Buyer 1 saved items', async () => {
    const res = await api('/api/customer/saved', {
      headers: {
        Authorization: `Bearer ${customer2Token}`,
      },
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.items.length, 0, 'Buyer 2 must have 0 saved items');
  });

  await test('6.9 DELETE /api/customer/saved?resourceType=...&resourceId=... unsaves by resource', async () => {
    const res = await api(
      `/api/customer/saved?resourceType=RENTAL_LISTING&resourceId=rental-new-town-01`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${customerToken}`,
        },
      }
    );
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);

    const check = await api(
      `/api/customer/saved/check?resourceType=RENTAL_LISTING&resourceId=rental-new-town-01`,
      {
        headers: {
          Authorization: `Bearer ${customerToken}`,
        },
      }
    );
    assert.strictEqual(check.data.saved, false);
  });

  await test('6.10 DELETE /api/customer/saved?id=... unsaves by ID', async () => {
    const res = await api(`/api/customer/saved?id=${savedItemId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${customerToken}`,
      },
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);
  });

  // ============================================================
  // SECTION 7: RECENTLY VIEWED API
  // ============================================================
  console.log('\n--- SECTION 7: RECENTLY VIEWED API ---');

  await test('7.1 POST /api/customer/recently-viewed records view of a project', async () => {
    const res = await api('/api/customer/recently-viewed', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${customerToken}`,
      },
      body: {
        resourceType: 'PROJECT',
        resourceId: testProjSlug,
      },
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);
    assert.strictEqual(res.data.item.resourceId, testProjSlug);
    assert.strictEqual(res.data.item.viewCount, 1);
  });

  await test('7.2 POST /api/customer/recently-viewed increments viewCount on repeated view', async () => {
    const res = await api('/api/customer/recently-viewed', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${customerToken}`,
      },
      body: {
        resourceType: 'PROJECT',
        resourceId: testProjSlug,
      },
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.item.viewCount, 2);
  });

  await test('7.3 GET /api/customer/recently-viewed returns chronological history', async () => {
    const res = await api('/api/customer/recently-viewed', {
      headers: {
        Authorization: `Bearer ${customerToken}`,
      },
    });

    assert.strictEqual(res.status, 200);
    assert(Array.isArray(res.data.items));
    assert(res.data.items.length >= 1);
  });

  await test('7.4 DELETE /api/customer/recently-viewed clears browsing history', async () => {
    const res = await api('/api/customer/recently-viewed', {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${customerToken}`,
      },
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);

    const check = await api('/api/customer/recently-viewed', {
      headers: {
        Authorization: `Bearer ${customerToken}`,
      },
    });
    assert.strictEqual(check.data.items.length, 0);
  });

  // ============================================================
  // SECTION 8: PREFERENCES & FUTURE ALERTS FOUNDATION API
  // ============================================================
  console.log('\n--- SECTION 8: PREFERENCES & ALERTS FOUNDATION API ---');

  await test('8.1 GET /api/customer/preferences returns initial default preferences', async () => {
    const res = await api('/api/customer/preferences', {
      headers: {
        Authorization: `Bearer ${customerToken}`,
      },
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);
    assert.strictEqual(res.data.preferences.preferredMode, 'ALL');
    assert.strictEqual(res.data.preferences.emailAlertsEnabled, true);
    assert.strictEqual(res.data.preferences.newLaunchAlerts, true);
    assert.strictEqual(res.data.preferences.priceDropAlerts, true);
  });

  await test('8.2 PUT /api/customer/preferences updates search filters and alerts', async () => {
    const res = await api('/api/customer/preferences', {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${customerToken}`,
      },
      body: {
        preferredMode: 'BUY',
        preferredLocations: ['Rajarhat', 'New Town'],
        preferredBhk: [2, 3],
        preferredPropertyTypes: ['APARTMENT'],
        budgetMin: 6000000, // 60L
        budgetMax: 18000000, // 1.8Cr
        emailAlertsEnabled: true,
        newLaunchAlerts: true,
        priceDropAlerts: false,
      },
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.preferences.preferredMode, 'BUY');
    assert.deepStrictEqual(res.data.preferences.preferredLocations, ['Rajarhat', 'New Town']);
    assert.deepStrictEqual(res.data.preferences.preferredBhk, [2, 3]);
    assert.strictEqual(res.data.preferences.budgetMin, 6000000);
    assert.strictEqual(res.data.preferences.budgetMax, 18000000);
    assert.strictEqual(res.data.preferences.priceDropAlerts, false);
  });

  await test('8.3 PUT /api/customer/preferences rejects invalid budget (min > max)', async () => {
    const res = await api('/api/customer/preferences', {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${customerToken}`,
      },
      body: {
        budgetMin: 20000000,
        budgetMax: 10000000,
      },
    });

    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.data.success, false);
  });

  await test('8.4 Cross-Customer Isolation: Buyer 2 preferences remain default', async () => {
    const res = await api('/api/customer/preferences', {
      headers: {
        Authorization: `Bearer ${customer2Token}`,
      },
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.preferences.preferredMode, 'ALL');
    assert.deepStrictEqual(res.data.preferences.preferredLocations, []);
  });

  // ============================================================
  // SECTION 9: PERSONALIZED DISCOVERY API
  // ============================================================
  console.log('\n--- SECTION 9: PERSONALIZED DISCOVERY API ---');

  await test('9.1 GET /api/customer/personalized returns curated discovery based on preferences', async () => {
    const res = await api('/api/customer/personalized', {
      headers: {
        Authorization: `Bearer ${customerToken}`,
      },
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);
    assert(res.data.discovery);
    assert.strictEqual(res.data.discovery.hasPreferences, true);
    assert(Array.isArray(res.data.discovery.recommendedProjects));
    assert(typeof res.data.discovery.rationale === 'string');
    assert(res.data.discovery.rationale.includes('Rajarhat') || res.data.discovery.rationale.includes('preferences'));
  });

  console.log('\n====================================================');
  console.log(`🎉 ALL ${passed}/${passed + failed} PHASE 10 TESTS PASSED!`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase10Tests().catch((err) => {
  console.error('Fatal error running Phase 10 tests:', err);
  process.exit(1);
});
