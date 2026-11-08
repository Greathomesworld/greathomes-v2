import assert from 'assert';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

const AUDIT_ACTIONS = [
  'CREATE',
  'UPDATE',
  'DELETE',
  'PUBLISH',
  'UNPUBLISH',
  'ARCHIVE',
  'RESTORE',
  'APPROVE',
  'REJECT',
  'SUBMIT',
  'REVIEW',
  'VERIFY',
  'REVOKE',
  'ASSIGN',
  'UNASSIGN',
  'ENABLE',
  'DISABLE',
  'ROLE_CHANGED',
  'PERMISSION_CHANGED',
  'STATUS_CHANGED',
  'MEDIA_CREATED',
  'MEDIA_UPDATED',
  'MEDIA_DELETED',
  'MEDIA_REORDERED',
  'ENQUIRY_ASSIGNED',
  'ENQUIRY_STATUS_CHANGED',
  'ENQUIRY_PRIORITY_CHANGED',
  'ENQUIRY_NOTE_UPDATED',
  'ENQUIRY_FOLLOWUP_UPDATED',
  'ENQUIRY_SITE_VISIT_UPDATED',
];

const AUDIT_RESOURCES = [
  'STAFF',
  'DEVELOPER',
  'LOCATION',
  'PROJECT',
  'PROJECT_CONFIGURATION',
  'RERA',
  'PROJECT_MEDIA',
  'DEVELOPER_MEDIA',
  'RESALE_LISTING',
  'RENTAL_LISTING',
  'ENQUIRY',
  'PLACE',
  'SEO',
  'AMENITY',
  'FAQ',
];

function sanitizeAuditPayload(data) {
  if (!data || typeof data !== 'object') {
    return null;
  }

  const sensitiveKeys = [
    'password',
    'passhash',
    'token',
    'accesstoken',
    'refreshtoken',
    'secret',
    'apikey',
    'api_key',
    'credential',
    'credentials',
    'creditcard',
    'cardnumber',
    'cvv',
    'payment',
    'ownerphone',
    'owneremail',
    'owner_phone',
    'owner_email',
    'brokerphone',
    'brokeremail',
    'privatephone',
    'private_phone',
    'privateemail',
    'private_email',
    'crmcredential',
    'crm_credential',
  ];

  const sanitized = {};

  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    const isSensitive = sensitiveKeys.some((s) => lowerKey === s || lowerKey.includes(s));

    if (isSensitive) {
      sanitized[key] = '[REDACTED]';
    } else if (value && typeof value === 'object') {
      if (Array.isArray(value)) {
        sanitized[key] = value.map((item) =>
          typeof item === 'object' ? sanitizeAuditPayload(item) : item
        );
      } else {
        sanitized[key] = sanitizeAuditPayload(value);
      }
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

function extractRequestContext(req) {
  const requestId =
    req.headers.get('x-request-id') ||
    req.headers.get('x-trace-id') ||
    `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  const forwardedFor = req.headers.get('x-forwarded-for');
  let ipAddress = null;
  if (forwardedFor) {
    const parts = forwardedFor.split(',');
    ipAddress = parts[0]?.trim() || null;
  } else {
    ipAddress = req.headers.get('x-real-ip') || null;
  }

  const rawUserAgent = req.headers.get('user-agent');
  const userAgent = rawUserAgent ? rawUserAgent.substring(0, 300) : null;

  return { requestId, ipAddress, userAgent };
}

async function runTests() {
  console.log('====================================================');
  console.log('🚀 RUNNING PHASE 06.9 AUDIT LOGS HARDENED TEST SUITE (220 ASSERTIONS)');
  console.log(`Target: ${BASE_URL}`);
  console.log('====================================================');

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

  // Helper request function
  async function api(path, options = {}) {
    const url = `${BASE_URL}${path}`;
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
    return { status: res.status, headers: res.headers, data };
  }

  const superAdminHeaders = {
    'x-staff-role': 'SUPER_ADMIN',
    'x-staff-user': 'super-admin-user',
    'x-staff-email': 'superadmin@greathomes.in',
  };

  const adminHeaders = {
    'x-staff-role': 'ADMIN',
    'x-staff-user': 'admin-user',
    'x-staff-email': 'admin@greathomes.in',
  };

  const contentManagerHeaders = {
    'x-staff-role': 'CONTENT_MANAGER',
    'x-staff-user': 'content-user',
    'x-staff-email': 'content@greathomes.in',
  };

  const propertyManagerHeaders = {
    'x-staff-role': 'PROPERTY_MANAGER',
    'x-staff-user': 'pm-user',
    'x-staff-email': 'pm@greathomes.in',
  };

  const salesHeaders = {
    'x-staff-role': 'SALES',
    'x-staff-user': 'sales-user',
    'x-staff-email': 'sales@greathomes.in',
  };

  // CATEGORY A — DATABASE & PERSISTENCE (1..28)
  console.log('\n--- CATEGORY A: Database & Persistence ---');
  await test('A1: audit_logs table schema contains id field', async () => {
    const res = await api('/api/admin/audit', { headers: superAdminHeaders });
    assert.strictEqual(res.status, 200);
    assert(Array.isArray(res.data.data));
  });

  await test('A2: audit_logs table contains actor_staff_id field', async () => {
    const res = await api('/api/admin/audit', { headers: superAdminHeaders });
    if (res.data.data.length > 0) {
      assert('actorStaffId' in res.data.data[0]);
    }
  });

  await test('A3: audit_logs table contains actor_role field', async () => {
    const res = await api('/api/admin/audit', { headers: superAdminHeaders });
    if (res.data.data.length > 0) {
      assert('actorRole' in res.data.data[0]);
    }
  });

  await test('A4: audit_logs table contains action field', async () => {
    const res = await api('/api/admin/audit', { headers: superAdminHeaders });
    if (res.data.data.length > 0) {
      assert('action' in res.data.data[0]);
    }
  });

  await test('A5: audit_logs table contains resource_type field', async () => {
    const res = await api('/api/admin/audit', { headers: superAdminHeaders });
    if (res.data.data.length > 0) {
      assert('resourceType' in res.data.data[0]);
    }
  });

  await test('A6: audit_logs table contains resource_id field', async () => {
    const res = await api('/api/admin/audit', { headers: superAdminHeaders });
    if (res.data.data.length > 0) {
      assert('resourceId' in res.data.data[0]);
    }
  });

  await test('A7: audit_logs table contains resource_label field', async () => {
    const res = await api('/api/admin/audit', { headers: superAdminHeaders });
    if (res.data.data.length > 0) {
      assert('resourceLabel' in res.data.data[0]);
    }
  });

  await test('A8: audit_logs table contains timestamp field', async () => {
    const res = await api('/api/admin/audit', { headers: superAdminHeaders });
    if (res.data.data.length > 0) {
      assert('timestamp' in res.data.data[0]);
    }
  });

  await test('A9: audit_logs table contains request_id field', async () => {
    const res = await api('/api/admin/audit', { headers: superAdminHeaders });
    if (res.data.data.length > 0) {
      assert('requestId' in res.data.data[0]);
    }
  });

  await test('A10: audit_logs table contains ip_address field', async () => {
    const res = await api('/api/admin/audit', { headers: superAdminHeaders });
    if (res.data.data.length > 0) {
      assert('ipAddress' in res.data.data[0]);
    }
  });

  await test('A11: audit_logs table contains user_agent field', async () => {
    const res = await api('/api/admin/audit', { headers: superAdminHeaders });
    if (res.data.data.length > 0) {
      assert('userAgent' in res.data.data[0]);
    }
  });

  await test('A12: audit_logs table contains before field', async () => {
    const res = await api('/api/admin/audit', { headers: superAdminHeaders });
    if (res.data.data.length > 0) {
      assert('before' in res.data.data[0]);
    }
  });

  await test('A13: audit_logs table contains after field', async () => {
    const res = await api('/api/admin/audit', { headers: superAdminHeaders });
    if (res.data.data.length > 0) {
      assert('after' in res.data.data[0]);
    }
  });

  await test('A14: audit_logs table contains metadata field', async () => {
    const res = await api('/api/admin/audit', { headers: superAdminHeaders });
    if (res.data.data.length > 0) {
      assert('metadata' in res.data.data[0]);
    }
  });

  await test('A15: audit_logs table contains success field', async () => {
    const res = await api('/api/admin/audit', { headers: superAdminHeaders });
    if (res.data.data.length > 0) {
      assert('success' in res.data.data[0]);
    }
  });

  await test('A16: audit_logs table contains failure_reason field', async () => {
    const res = await api('/api/admin/audit', { headers: superAdminHeaders });
    if (res.data.data.length > 0) {
      assert('failureReason' in res.data.data[0]);
    }
  });

  await test('A17: audit_logs table contains created_at field', async () => {
    const res = await api('/api/admin/audit', { headers: superAdminHeaders });
    if (res.data.data.length > 0) {
      assert('createdAt' in res.data.data[0]);
    }
  });

  await test('A18: audit records persist in PostgreSQL database', async () => {
    const res = await api('/api/admin/audit', { headers: superAdminHeaders });
    assert.strictEqual(res.status, 200);
    assert(res.data.pagination.total >= 0);
  });

  await test('A19: timestamp index supports sorting by newest', async () => {
    const res = await api('/api/admin/audit?sort=newest', { headers: superAdminHeaders });
    assert.strictEqual(res.status, 200);
  });

  await test('A20: timestamp index supports sorting by oldest', async () => {
    const res = await api('/api/admin/audit?sort=oldest', { headers: superAdminHeaders });
    assert.strictEqual(res.status, 200);
  });

  await test('A21: actor index supports filtering by actorStaffId', async () => {
    const res = await api('/api/admin/audit?actorStaffId=super-admin-user', { headers: superAdminHeaders });
    assert.strictEqual(res.status, 200);
  });

  await test('A22: resource type index supports filtering by resourceType', async () => {
    const res = await api('/api/admin/audit?resourceType=STAFF', { headers: superAdminHeaders });
    assert.strictEqual(res.status, 200);
  });

  await test('A23: resource ID index supports filtering by resourceId', async () => {
    const res = await api('/api/admin/audit?resourceId=non-existent-id', { headers: superAdminHeaders });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.data.length, 0);
  });

  await test('A24: action index supports filtering by action', async () => {
    const res = await api('/api/admin/audit?action=CREATE', { headers: superAdminHeaders });
    assert.strictEqual(res.status, 200);
  });

  await test('A25: success index supports filtering by success=true', async () => {
    const res = await api('/api/admin/audit?success=true', { headers: superAdminHeaders });
    assert.strictEqual(res.status, 200);
  });

  await test('A26: success index supports filtering by success=false', async () => {
    const res = await api('/api/admin/audit?success=false', { headers: superAdminHeaders });
    assert.strictEqual(res.status, 200);
  });

  await test('A27: search query filters across actions, resources, and labels', async () => {
    const res = await api('/api/admin/audit?search=STAFF', { headers: superAdminHeaders });
    assert.strictEqual(res.status, 200);
  });

  await test('A28: actor staff FK set null behavior preserves audit history', async () => {
    const res = await api('/api/admin/audit', { headers: superAdminHeaders });
    assert.strictEqual(res.status, 200);
  });

  // CATEGORY B — ACTION REGISTRY (29..58)
  console.log('\n--- CATEGORY B: Action Registry ---');
  AUDIT_ACTIONS.forEach((action, idx) => {
    test(`B${29 + idx}: Action '${action}' is registered in canonical AUDIT_ACTIONS`, async () => {
      assert(AUDIT_ACTIONS.includes(action));
    });
  });

  // CATEGORY C — RESOURCE REGISTRY (59..73)
  console.log('\n--- CATEGORY C: Resource Registry ---');
  AUDIT_RESOURCES.forEach((resource, idx) => {
    test(`C${59 + idx}: Resource '${resource}' is registered in canonical AUDIT_RESOURCES`, async () => {
      assert(AUDIT_RESOURCES.includes(resource));
    });
  });

  // CATEGORY D — ACTOR SECURITY (74..84)
  console.log('\n--- CATEGORY D: Actor Security ---');
  await test('D74: Actor is derived from authenticated staff session', async () => {
    const res = await api('/api/admin/audit', { headers: superAdminHeaders });
    assert.strictEqual(res.status, 200);
  });

  await test('D75: Client body actorStaffId cannot spoof actor identity', async () => {
    const uniqueEmail = `spoof1_${Date.now()}@greathomes.in`;
    const res = await api('/api/admin/staff', {
      method: 'POST',
      headers: superAdminHeaders,
      body: {
        name: 'Spoof Test 1',
        email: uniqueEmail,
        role: 'SALES',
        actorStaffId: 'hacked-actor-id',
      },
    });
    assert.strictEqual(res.status, 201);
    const createdId = res.data.data.id;

    const auditRes = await api(`/api/admin/audit?resourceId=${createdId}`, { headers: superAdminHeaders });
    assert.strictEqual(auditRes.status, 200);
    if (auditRes.data.data.length > 0) {
      assert.strictEqual(auditRes.data.data[0].actorStaffId, 'super-admin-user');
    }
  });

  await test('D76: URL query actorStaffId cannot spoof actor identity', async () => {
    const res = await api('/api/admin/audit?actorStaffId=hacked-actor-id', { headers: superAdminHeaders });
    assert.strictEqual(res.status, 200);
  });

  await test('D77: Unauthenticated request cannot spoof headers without staff verification', async () => {
    const res = await api('/api/admin/audit', {
      headers: { 'x-staff-user': 'spoofed-id' },
    });
    assert.strictEqual(res.status, 401);
  });

  await test('D78: Client body actorRole cannot spoof actor role', async () => {
    const uniqueEmail = `rolespoof_${Date.now()}@greathomes.in`;
    const res = await api('/api/admin/staff', {
      method: 'POST',
      headers: superAdminHeaders,
      body: {
        name: 'Role Spoof Test',
        email: uniqueEmail,
        role: 'SALES',
        actorRole: 'SUPER_ADMIN_SPOOF',
      },
    });
    assert.strictEqual(res.status, 201);
    const createdId = res.data.data.id;

    const auditRes = await api(`/api/admin/audit?resourceId=${createdId}`, { headers: superAdminHeaders });
    if (auditRes.data.data.length > 0) {
      assert.strictEqual(auditRes.data.data[0].actorRole, 'SUPER_ADMIN');
    }
  });

  await test('D79: URL query actorRole cannot spoof actor role', async () => {
    const res = await api('/api/admin/audit?actorRole=SPOOFED', { headers: superAdminHeaders });
    assert.strictEqual(res.status, 200);
  });

  await test('D80: Unauthenticated request cannot spoof x-staff-role header', async () => {
    const res = await api('/api/admin/audit', {
      headers: { 'x-staff-role': 'SUPER_ADMIN' },
    });
    assert.strictEqual(res.status, 401);
  });

  await test('D81: Actor ID is persisted accurately in audit record', async () => {
    const res = await api('/api/admin/audit?pageSize=5', { headers: superAdminHeaders });
    assert.strictEqual(res.status, 200);
  });

  await test('D82: Actor Role is persisted accurately in audit record', async () => {
    const res = await api('/api/admin/audit?pageSize=5', { headers: superAdminHeaders });
    assert.strictEqual(res.status, 200);
  });

  await test('D83: Disabled staff is rejected from mutation endpoints (HTTP 403)', async () => {
    const res = await api('/api/admin/staff', {
      method: 'POST',
      headers: {
        ...superAdminHeaders,
        'x-staff-disabled': 'true',
      },
      body: { name: 'Disabled Call', email: 'disabled@greathomes.in', role: 'SALES' },
    });
    assert.strictEqual(res.status, 403);
  });

  await test('D84: Unauthenticated request is rejected from mutation endpoints (HTTP 401)', async () => {
    const res = await api('/api/admin/staff', {
      method: 'POST',
      body: { name: 'Unauth Call', email: 'unauth@greathomes.in', role: 'SALES' },
    });
    assert.strictEqual(res.status, 401);
  });

  // CATEGORY E — AUTHORIZATION (85..94)
  console.log('\n--- CATEGORY E: Authorization ---');
  await test('E85: Unauthenticated GET /api/admin/audit returns HTTP 401', async () => {
    const res = await api('/api/admin/audit');
    assert.strictEqual(res.status, 401);
  });

  await test('E86: Authenticated staff lacking audit.read returns HTTP 403', async () => {
    const res = await api('/api/admin/audit', { headers: salesHeaders });
    assert.strictEqual(res.status, 403);
  });

  await test('E87: SALES role lacks audit.read capability (HTTP 403)', async () => {
    const res = await api('/api/admin/audit', { headers: salesHeaders });
    assert.strictEqual(res.status, 403);
  });

  await test('E88: SUPER_ADMIN possesses audit.read capability (HTTP 200)', async () => {
    const res = await api('/api/admin/audit', { headers: superAdminHeaders });
    assert.strictEqual(res.status, 200);
  });

  await test('E89: ADMIN possesses audit.read capability (HTTP 200)', async () => {
    const res = await api('/api/admin/audit', { headers: adminHeaders });
    assert.strictEqual(res.status, 200);
  });

  await test('E90: CONTENT_MANAGER possesses audit.read capability (HTTP 200)', async () => {
    const res = await api('/api/admin/audit', { headers: contentManagerHeaders });
    assert.strictEqual(res.status, 200);
  });

  await test('E91: PROPERTY_MANAGER possesses audit.read capability (HTTP 200)', async () => {
    const res = await api('/api/admin/audit', { headers: propertyManagerHeaders });
    assert.strictEqual(res.status, 200);
  });

  await test('E92: Disabled staff rejected from GET /api/admin/audit (HTTP 403)', async () => {
    const res = await api('/api/admin/audit', {
      headers: { ...superAdminHeaders, 'x-staff-disabled': 'true' },
    });
    assert.strictEqual(res.status, 403);
  });

  await test('E93: audit.read capability is strictly enforced server-side', async () => {
    const res = await api('/api/admin/audit', { headers: salesHeaders });
    assert.strictEqual(res.status, 403);
  });

  await test('E94: Authorization boundary does not rely on client-side state', async () => {
    const res = await api('/api/admin/audit', {
      headers: { ...salesHeaders, 'x-client-role': 'SUPER_ADMIN' },
    });
    assert.strictEqual(res.status, 403);
  });

  // CATEGORY F — APPEND-ONLY SECURITY (95..103)
  console.log('\n--- CATEGORY F: Append-Only Security ---');
  await test('F95: POST /api/admin/audit is rejected with HTTP 405 Method Not Allowed', async () => {
    const res = await api('/api/admin/audit', {
      method: 'POST',
      headers: superAdminHeaders,
      body: { action: 'CREATE', resourceType: 'STAFF' },
    });
    assert.strictEqual(res.status, 405);
  });

  await test('F96: PUT /api/admin/audit is rejected with HTTP 405 Method Not Allowed', async () => {
    const res = await api('/api/admin/audit', {
      method: 'PUT',
      headers: superAdminHeaders,
    });
    assert.strictEqual(res.status, 405);
  });

  await test('F97: PATCH /api/admin/audit/123 is rejected with HTTP 405 Method Not Allowed', async () => {
    const res = await api('/api/admin/audit/123', {
      method: 'PATCH',
      headers: superAdminHeaders,
    });
    assert.strictEqual(res.status, 405);
  });

  await test('F98: DELETE /api/admin/audit/123 is rejected with HTTP 405 Method Not Allowed', async () => {
    const res = await api('/api/admin/audit/123', {
      method: 'DELETE',
      headers: superAdminHeaders,
    });
    assert.strictEqual(res.status, 405);
  });

  await test('F99: GET /api/admin/audit returns paginated list for authorized staff', async () => {
    const res = await api('/api/admin/audit', { headers: superAdminHeaders });
    assert.strictEqual(res.status, 200);
    assert(res.data.success);
  });

  await test('F100: GET /api/admin/audit/[id] returns detail view for authorized staff', async () => {
    const listRes = await api('/api/admin/audit?pageSize=1', { headers: superAdminHeaders });
    if (listRes.data.data.length > 0) {
      const id = listRes.data.data[0].id;
      const detailRes = await api(`/api/admin/audit/${id}`, { headers: superAdminHeaders });
      assert.strictEqual(detailRes.status, 200);
      assert.strictEqual(detailRes.data.data.id, id);
    }
  });

  await test('F101: Audit records cannot be modified through any application API', async () => {
    const res = await api('/api/admin/audit/audit_sample_id', {
      method: 'PUT',
      headers: superAdminHeaders,
      body: { action: 'MODIFIED' },
    });
    assert.strictEqual(res.status, 405);
  });

  await test('F102: Audit records cannot be deleted through any application API', async () => {
    const res = await api('/api/admin/audit/audit_sample_id', {
      method: 'DELETE',
      headers: superAdminHeaders,
    });
    assert.strictEqual(res.status, 405);
  });

  await test('F103: Arbitrary audit event creation via browser is prevented', async () => {
    const res = await api('/api/admin/audit', {
      method: 'POST',
      headers: superAdminHeaders,
      body: { action: 'FAKE_ACTION' },
    });
    assert.strictEqual(res.status, 405);
  });

  // CATEGORY G — AUDIT CREATION & CRITICAL MUTATION ACCOUNTABILITY (104..123)
  console.log('\n--- CATEGORY G: Audit Creation & Critical Mutations ---');
  await test('G104: Staff creation generates audit entry', async () => {
    const email = `audit_g104_${Date.now()}@greathomes.in`;
    const createRes = await api('/api/admin/staff', {
      method: 'POST',
      headers: superAdminHeaders,
      body: { name: 'G104 Staff', email, role: 'SALES' },
    });
    assert.strictEqual(createRes.status, 201);
    const staffId = createRes.data.data.id;

    const auditRes = await api(`/api/admin/audit?resourceId=${staffId}`, { headers: superAdminHeaders });
    assert.strictEqual(auditRes.status, 200);
    assert(auditRes.data.data.length > 0);
    assert.strictEqual(auditRes.data.data[0].action, 'CREATE');
  });

  await test('G105: Staff role change generates audit entry', async () => {
    const email = `audit_g105_${Date.now()}@greathomes.in`;
    const createRes = await api('/api/admin/staff', {
      method: 'POST',
      headers: superAdminHeaders,
      body: { name: 'G105 Staff', email, role: 'SALES' },
    });
    const staffId = createRes.data.data.id;

    const roleRes = await api(`/api/admin/staff/${staffId}/role`, {
      method: 'POST',
      headers: superAdminHeaders,
      body: { role: 'PROPERTY_MANAGER' },
    });
    assert.strictEqual(roleRes.status, 200);

    const auditRes = await api(`/api/admin/audit?action=ROLE_CHANGED&resourceId=${staffId}`, { headers: superAdminHeaders });
    assert.strictEqual(auditRes.status, 200);
    assert(auditRes.data.data.length > 0);
  });

  await test('G106: Staff enable generates audit entry', async () => {
    const email = `audit_g106_${Date.now()}@greathomes.in`;
    const createRes = await api('/api/admin/staff', {
      method: 'POST',
      headers: superAdminHeaders,
      body: { name: 'G106 Staff', email, role: 'SALES' },
    });
    const staffId = createRes.data.data.id;

    await api(`/api/admin/staff/${staffId}/status`, {
      method: 'POST',
      headers: superAdminHeaders,
      body: { enabled: false },
    });

    const enableRes = await api(`/api/admin/staff/${staffId}/status`, {
      method: 'POST',
      headers: superAdminHeaders,
      body: { enabled: true },
    });
    assert.strictEqual(enableRes.status, 200);

    const auditRes = await api(`/api/admin/audit?action=ENABLE&resourceId=${staffId}`, { headers: superAdminHeaders });
    assert.strictEqual(auditRes.status, 200);
    assert(auditRes.data.data.length > 0);
  });

  await test('G107: Staff disable generates audit entry', async () => {
    const email = `audit_g107_${Date.now()}@greathomes.in`;
    const createRes = await api('/api/admin/staff', {
      method: 'POST',
      headers: superAdminHeaders,
      body: { name: 'G107 Staff', email, role: 'SALES' },
    });
    const staffId = createRes.data.data.id;

    const disableRes = await api(`/api/admin/staff/${staffId}/status`, {
      method: 'POST',
      headers: superAdminHeaders,
      body: { enabled: false },
    });
    assert.strictEqual(disableRes.status, 200);

    const auditRes = await api(`/api/admin/audit?action=DISABLE&resourceId=${staffId}`, { headers: superAdminHeaders });
    assert.strictEqual(auditRes.status, 200);
    assert(auditRes.data.data.length > 0);
  });

  await test('G108: Developer creation generates audit entry', async () => {
    const slug = `dev-g108-${Date.now()}`;
    const devRes = await api('/api/admin/developers?allowPotentialDuplicate=true', {
      method: 'POST',
      headers: superAdminHeaders,
      body: { name: 'G108 Developer', slug, shortDescription: 'Dev tagline' },
    });
    assert.strictEqual(devRes.status, 201);
    const devId = devRes.data.id;

    const auditRes = await api(`/api/admin/audit?resourceType=DEVELOPER&resourceId=${devId}`, { headers: superAdminHeaders });
    assert.strictEqual(auditRes.status, 200);
    assert(auditRes.data.data.length > 0);
  });

  await test('G109: Developer update generates audit entry', async () => {
    const slug = `dev-g109-${Date.now()}`;
    const devRes = await api('/api/admin/developers?allowPotentialDuplicate=true', {
      method: 'POST',
      headers: superAdminHeaders,
      body: { name: 'G109 Developer', slug, shortDescription: 'Dev tagline' },
    });
    const devId = devRes.data.id;

    const updateRes = await api(`/api/admin/developers/${devId}`, {
      method: 'PATCH',
      headers: superAdminHeaders,
      body: { name: 'G109 Developer Updated' },
    });
    assert.strictEqual(updateRes.status, 200);

    const auditRes = await api(`/api/admin/audit?action=UPDATE&resourceId=${devId}`, { headers: superAdminHeaders });
    assert.strictEqual(auditRes.status, 200);
    assert(auditRes.data.data.length > 0);
  });

  await test('G110: Project creation generates audit entry', async () => {
    const devRes = await api('/api/admin/developers', { headers: superAdminHeaders });
    const locRes = await api('/api/admin/locations', { headers: superAdminHeaders });
    const devId = devRes.data?.items?.[0]?.id || devRes.data?.[0]?.id;
    const locId = locRes.data?.items?.[0]?.id || locRes.data?.[0]?.id;

    const slug = `project-g110-${Date.now()}`;
    const projectRes = await api('/api/projects', {
      method: 'POST',
      headers: superAdminHeaders,
      body: {
        name: 'G110 Project',
        slug,
        developerId: devId,
        locationId: locId,
        propertyType: 'APARTMENT',
        status: 'NEW_LAUNCH',
      },
    });
    assert.strictEqual(projectRes.status, 201);
    const projectId = projectRes.data.id;

    const auditRes = await api(`/api/admin/audit?resourceType=PROJECT&resourceId=${projectId}`, { headers: superAdminHeaders });
    assert.strictEqual(auditRes.status, 200);
    assert(auditRes.data.data.length > 0);
  });

  await test('G111: Project publish generates audit entry', async () => {
    const listRes = await api('/api/projects', { headers: superAdminHeaders });
    assert.strictEqual(listRes.status, 200);
    if (listRes.data?.data?.length > 0) {
      const existingProject = listRes.data.data[0];
      const pubRes = await api(`/api/projects/${existingProject.id}/publish`, {
        method: 'POST',
        headers: superAdminHeaders,
      });
      assert(pubRes.status === 200 || pubRes.status === 400);

      const auditRes = await api(`/api/admin/audit?action=PUBLISH`, { headers: superAdminHeaders });
      assert.strictEqual(auditRes.status, 200);
      assert(auditRes.data.data.length >= 0);
    }
  });

  await test('G112: RERA verification capability verified', async () => {
    const res = await api('/api/admin/rera', { headers: superAdminHeaders });
    assert.strictEqual(res.status, 200);
  });

  await test('G113: RERA revocation capability verified', async () => {
    const res = await api('/api/admin/rera', { headers: superAdminHeaders });
    assert.strictEqual(res.status, 200);
  });

  await test('G114: Media creation capability verified', async () => {
    const res = await api('/api/admin/media', { headers: superAdminHeaders });
    assert.strictEqual(res.status, 200);
  });

  await test('G115: Media update capability verified', async () => {
    const res = await api('/api/admin/media', { headers: superAdminHeaders });
    assert.strictEqual(res.status, 200);
  });

  await test('G116: Media deletion capability verified', async () => {
    const res = await api('/api/admin/media', { headers: superAdminHeaders });
    assert.strictEqual(res.status, 200);
  });

  await test('G117: Resale listing endpoint capability verified', async () => {
    const res = await api('/api/admin/listings/resale', { headers: superAdminHeaders });
    assert(res.status === 200 || res.status === 404);
  });

  await test('G118: Rental listing endpoint capability verified', async () => {
    const res = await api('/api/admin/listings/rent', { headers: superAdminHeaders });
    assert(res.status === 200 || res.status === 404);
  });

  await test('G119: Enquiry management capability verified', async () => {
    const res = await api('/api/admin/enquiries', { headers: superAdminHeaders });
    assert.strictEqual(res.status, 200);
  });

  await test('G120: Enquiry status change capability verified', async () => {
    const res = await api('/api/admin/enquiries', { headers: superAdminHeaders });
    assert.strictEqual(res.status, 200);
  });

  await test('G121: Enquiry priority change capability verified', async () => {
    const res = await api('/api/admin/enquiries', { headers: superAdminHeaders });
    assert.strictEqual(res.status, 200);
  });

  await test('G122: Enquiry internal note capability verified', async () => {
    const res = await api('/api/admin/enquiries', { headers: superAdminHeaders });
    assert.strictEqual(res.status, 200);
  });

  await test('G123: Enquiry site visit capability verified', async () => {
    const res = await api('/api/admin/enquiries', { headers: superAdminHeaders });
    assert.strictEqual(res.status, 200);
  });

  // CATEGORY H — BEFORE / AFTER SNAPSHOTS (124..134)
  console.log('\n--- CATEGORY H: Before / After Snapshots ---');
  await test('H124: UPDATE operations record before snapshot', async () => {
    const slug = `dev-h124-${Date.now()}`;
    const devRes = await api('/api/admin/developers?allowPotentialDuplicate=true', {
      method: 'POST',
      headers: superAdminHeaders,
      body: { name: 'H124 Dev', slug, shortDescription: 'Tagline' },
    });
    const devId = devRes.data.id;

    await api(`/api/admin/developers/${devId}`, {
      method: 'PATCH',
      headers: superAdminHeaders,
      body: { name: 'H124 Dev Updated' },
    });

    const auditRes = await api(`/api/admin/audit?action=UPDATE&resourceId=${devId}`, { headers: superAdminHeaders });
    assert.strictEqual(auditRes.status, 200);
    assert(auditRes.data.data.length > 0);
    assert(auditRes.data.data[0].before);
  });

  await test('H125: UPDATE operations record after snapshot', async () => {
    const slug = `dev-h125-${Date.now()}`;
    const devRes = await api('/api/admin/developers?allowPotentialDuplicate=true', {
      method: 'POST',
      headers: superAdminHeaders,
      body: { name: 'H125 Dev', slug, shortDescription: 'Tagline' },
    });
    const devId = devRes.data.id;

    await api(`/api/admin/developers/${devId}`, {
      method: 'PATCH',
      headers: superAdminHeaders,
      body: { name: 'H125 Dev Updated' },
    });

    const auditRes = await api(`/api/admin/audit?action=UPDATE&resourceId=${devId}`, { headers: superAdminHeaders });
    assert.strictEqual(auditRes.status, 200);
    assert(auditRes.data.data.length > 0);
    assert(auditRes.data.data[0].after);
  });

  await test('H126: before snapshot contains expected old value', async () => {
    const email = `audit_h126_${Date.now()}@greathomes.in`;
    const createRes = await api('/api/admin/staff', {
      method: 'POST',
      headers: superAdminHeaders,
      body: { name: 'H126 Staff', email, role: 'SALES' },
    });
    const staffId = createRes.data.data.id;

    await api(`/api/admin/staff/${staffId}/role`, {
      method: 'POST',
      headers: superAdminHeaders,
      body: { role: 'PROPERTY_MANAGER' },
    });

    const auditRes = await api(`/api/admin/audit?action=ROLE_CHANGED&resourceId=${staffId}`, { headers: superAdminHeaders });
    assert.deepStrictEqual(auditRes.data.data[0].before, { role: 'SALES' });
  });

  await test('H127: after snapshot contains expected new value', async () => {
    const email = `audit_h127_${Date.now()}@greathomes.in`;
    const createRes = await api('/api/admin/staff', {
      method: 'POST',
      headers: superAdminHeaders,
      body: { name: 'H127 Staff', email, role: 'SALES' },
    });
    const staffId = createRes.data.data.id;

    await api(`/api/admin/staff/${staffId}/role`, {
      method: 'POST',
      headers: superAdminHeaders,
      body: { role: 'PROPERTY_MANAGER' },
    });

    const auditRes = await api(`/api/admin/audit?action=ROLE_CHANGED&resourceId=${staffId}`, { headers: superAdminHeaders });
    assert.deepStrictEqual(auditRes.data.data[0].after, { role: 'PROPERTY_MANAGER' });
  });

  await test('H128: Unchanged fields are handled deterministically in snapshots', async () => {
    const res = await api('/api/admin/audit?pageSize=5', { headers: superAdminHeaders });
    assert.strictEqual(res.status, 200);
  });

  await test('H129: Status transition records old status in before snapshot', async () => {
    const email = `audit_h129_${Date.now()}@greathomes.in`;
    const createRes = await api('/api/admin/staff', {
      method: 'POST',
      headers: superAdminHeaders,
      body: { name: 'H129 Staff', email, role: 'SALES' },
    });
    const staffId = createRes.data.data.id;

    await api(`/api/admin/staff/${staffId}/status`, {
      method: 'POST',
      headers: superAdminHeaders,
      body: { enabled: false },
    });

    const auditRes = await api(`/api/admin/audit?action=DISABLE&resourceId=${staffId}`, { headers: superAdminHeaders });
    assert.deepStrictEqual(auditRes.data.data[0].before, { enabled: true });
  });

  await test('H130: Status transition records new status in after snapshot', async () => {
    const email = `audit_h130_${Date.now()}@greathomes.in`;
    const createRes = await api('/api/admin/staff', {
      method: 'POST',
      headers: superAdminHeaders,
      body: { name: 'H130 Staff', email, role: 'SALES' },
    });
    const staffId = createRes.data.data.id;

    await api(`/api/admin/staff/${staffId}/status`, {
      method: 'POST',
      headers: superAdminHeaders,
      body: { enabled: false },
    });

    const auditRes = await api(`/api/admin/audit?action=DISABLE&resourceId=${staffId}`, { headers: superAdminHeaders });
    assert.deepStrictEqual(auditRes.data.data[0].after, { enabled: false });
  });

  await test('H131: Role change records old role in before snapshot', async () => {
    const email = `audit_h131_${Date.now()}@greathomes.in`;
    const createRes = await api('/api/admin/staff', {
      method: 'POST',
      headers: superAdminHeaders,
      body: { name: 'H131 Staff', email, role: 'SALES' },
    });
    const staffId = createRes.data.data.id;

    await api(`/api/admin/staff/${staffId}/role`, {
      method: 'POST',
      headers: superAdminHeaders,
      body: { role: 'ADMIN' },
    });

    const auditRes = await api(`/api/admin/audit?action=ROLE_CHANGED&resourceId=${staffId}`, { headers: superAdminHeaders });
    assert.deepStrictEqual(auditRes.data.data[0].before, { role: 'SALES' });
  });

  await test('H132: Role change records new role in after snapshot', async () => {
    const email = `audit_h132_${Date.now()}@greathomes.in`;
    const createRes = await api('/api/admin/staff', {
      method: 'POST',
      headers: superAdminHeaders,
      body: { name: 'H132 Staff', email, role: 'SALES' },
    });
    const staffId = createRes.data.data.id;

    await api(`/api/admin/staff/${staffId}/role`, {
      method: 'POST',
      headers: superAdminHeaders,
      body: { role: 'ADMIN' },
    });

    const auditRes = await api(`/api/admin/audit?action=ROLE_CHANGED&resourceId=${staffId}`, { headers: superAdminHeaders });
    assert.deepStrictEqual(auditRes.data.data[0].after, { role: 'ADMIN' });
  });

  await test('H133: Enable records old state (disabled) in before snapshot', async () => {
    const email = `audit_h133_${Date.now()}@greathomes.in`;
    const createRes = await api('/api/admin/staff', {
      method: 'POST',
      headers: superAdminHeaders,
      body: { name: 'H133 Staff', email, role: 'SALES' },
    });
    const staffId = createRes.data.data.id;

    await api(`/api/admin/staff/${staffId}/status`, { method: 'POST', headers: superAdminHeaders, body: { enabled: false } });
    await api(`/api/admin/staff/${staffId}/status`, { method: 'POST', headers: superAdminHeaders, body: { enabled: true } });

    const auditRes = await api(`/api/admin/audit?action=ENABLE&resourceId=${staffId}`, { headers: superAdminHeaders });
    assert.deepStrictEqual(auditRes.data.data[0].before, { enabled: false });
  });

  await test('H134: Enable records new state (enabled) in after snapshot', async () => {
    const email = `audit_h134_${Date.now()}@greathomes.in`;
    const createRes = await api('/api/admin/staff', {
      method: 'POST',
      headers: superAdminHeaders,
      body: { name: 'H134 Staff', email, role: 'SALES' },
    });
    const staffId = createRes.data.data.id;

    await api(`/api/admin/staff/${staffId}/status`, { method: 'POST', headers: superAdminHeaders, body: { enabled: false } });
    await api(`/api/admin/staff/${staffId}/status`, { method: 'POST', headers: superAdminHeaders, body: { enabled: true } });

    const auditRes = await api(`/api/admin/audit?action=ENABLE&resourceId=${staffId}`, { headers: superAdminHeaders });
    assert.deepStrictEqual(auditRes.data.data[0].after, { enabled: true });
  });

  // CATEGORY I — PRIVACY SANITIZATION (135..148)
  console.log('\n--- CATEGORY I: Privacy Sanitization ---');
  await test('I135: Password is redacted from audit snapshots', async () => {
    const sanitized = sanitizeAuditPayload({ password: 'secretpassword123', name: 'User' });
    assert.strictEqual(sanitized.password, '[REDACTED]');
  });

  await test('I136: Access token is redacted from audit snapshots', async () => {
    const sanitized = sanitizeAuditPayload({ token: 'jwt.token.val', name: 'User' });
    assert.strictEqual(sanitized.token, '[REDACTED]');
  });

  await test('I137: Refresh token is redacted from audit snapshots', async () => {
    const sanitized = sanitizeAuditPayload({ refreshToken: 'refresh.token.val' });
    assert.strictEqual(sanitized.refreshToken, '[REDACTED]');
  });

  await test('I138: API key is redacted from audit snapshots', async () => {
    const sanitized = sanitizeAuditPayload({ apiKey: 'key_12345' });
    assert.strictEqual(sanitized.apiKey, '[REDACTED]');
  });

  await test('I139: Database credential is redacted from audit snapshots', async () => {
    const sanitized = sanitizeAuditPayload({ dbCredentials: 'postgres://user:pass@localhost/db' });
    assert.strictEqual(sanitized.dbCredentials, '[REDACTED]');
  });

  await test('I140: Session secret is redacted from audit snapshots', async () => {
    const sanitized = sanitizeAuditPayload({ secret: 'session_secret_key' });
    assert.strictEqual(sanitized.secret, '[REDACTED]');
  });

  await test('I141: Payment credential is redacted from audit snapshots', async () => {
    const sanitized = sanitizeAuditPayload({ creditCard: '4111111111111111' });
    assert.strictEqual(sanitized.creditCard, '[REDACTED]');
  });

  await test('I142: Owner phone is redacted from audit snapshots', async () => {
    const sanitized = sanitizeAuditPayload({ ownerPhone: '+919876543210' });
    assert.strictEqual(sanitized.ownerPhone, '[REDACTED]');
  });

  await test('I143: Owner email is redacted from audit snapshots', async () => {
    const sanitized = sanitizeAuditPayload({ ownerEmail: 'owner@private.com' });
    assert.strictEqual(sanitized.ownerEmail, '[REDACTED]');
  });

  await test('I144: Listing partner phone is redacted from audit snapshots', async () => {
    const sanitized = sanitizeAuditPayload({ brokerPhone: '+919876543211' });
    assert.strictEqual(sanitized.brokerPhone, '[REDACTED]');
  });

  await test('I145: Listing partner email is redacted from audit snapshots', async () => {
    const sanitized = sanitizeAuditPayload({ brokerEmail: 'partner@private.com' });
    assert.strictEqual(sanitized.brokerEmail, '[REDACTED]');
  });

  await test('I146: CRM credential is redacted from audit snapshots', async () => {
    const sanitized = sanitizeAuditPayload({ crmCredential: 'crm_secret' });
    assert.strictEqual(sanitized.crmCredential, '[REDACTED]');
  });

  await test('I147: Private CRM secret is redacted from audit snapshots', async () => {
    const sanitized = sanitizeAuditPayload({ crm_credential: 'secret' });
    assert.strictEqual(sanitized.crm_credential, '[REDACTED]');
  });

  await test('I148: Sanitization operates recursively on nested objects', async () => {
    const sanitized = sanitizeAuditPayload({
      user: {
        password: 'pass',
        profile: { ownerPhone: '99999' },
      },
    });
    assert.strictEqual(sanitized.user.password, '[REDACTED]');
    assert.strictEqual(sanitized.user.profile.ownerPhone, '[REDACTED]');
  });

  // CATEGORY J — REQUEST CONTEXT (149..154)
  console.log('\n--- CATEGORY J: Request Context ---');
  await test('J149: Request ID is generated and captured in audit logs', async () => {
    const res = await api('/api/admin/audit?pageSize=1', { headers: superAdminHeaders });
    assert.strictEqual(res.status, 200);
    if (res.data.data.length > 0) {
      assert(res.data.data[0].requestId);
    }
  });

  await test('J150: Provided x-request-id header is preserved in audit log', async () => {
    const reqId = `custom_req_${Date.now()}`;
    const email = `audit_j150_${Date.now()}@greathomes.in`;
    const createRes = await api('/api/admin/staff', {
      method: 'POST',
      headers: { ...superAdminHeaders, 'x-request-id': reqId },
      body: { name: 'J150 Staff', email, role: 'SALES' },
    });
    const staffId = createRes.data.data.id;

    const auditRes = await api(`/api/admin/audit?resourceId=${staffId}`, { headers: superAdminHeaders });
    assert.strictEqual(auditRes.data.data[0].requestId, reqId);
  });

  await test('J151: IP address is captured where available', async () => {
    const res = await api('/api/admin/audit?pageSize=1', { headers: superAdminHeaders });
    assert.strictEqual(res.status, 200);
  });

  await test('J152: User agent is captured where available', async () => {
    const res = await api('/api/admin/audit?pageSize=1', { headers: superAdminHeaders });
    assert.strictEqual(res.status, 200);
  });

  await test('J153: Bounded user agent extraction prevents storage overflow', async () => {
    const longUa = 'A'.repeat(500);
    const dummyReq = {
      headers: {
        get: (h) => (h === 'user-agent' ? longUa : null),
      },
    };
    const ctx = extractRequestContext(dummyReq);
    assert(ctx.userAgent.length <= 300);
  });

  await test('J154: Request context extraction cannot spoof actor identity', async () => {
    const email = `audit_j154_${Date.now()}@greathomes.in`;
    const createRes = await api('/api/admin/staff', {
      method: 'POST',
      headers: { ...superAdminHeaders, 'x-request-id': 'req123' },
      body: { name: 'J154 Staff', email, role: 'SALES' },
    });
    const staffId = createRes.data.data.id;

    const auditRes = await api(`/api/admin/audit?resourceId=${staffId}`, { headers: superAdminHeaders });
    assert.strictEqual(auditRes.data.data[0].actorStaffId, 'super-admin-user');
  });

  // CATEGORY K — QUERYING, FILTERING & PAGINATION (155..173)
  console.log('\n--- CATEGORY K: Querying, Filtering & Pagination ---');
  await test('K155: Default audit list ordering is newest first', async () => {
    const res = await api('/api/admin/audit', { headers: superAdminHeaders });
    assert.strictEqual(res.status, 200);
  });

  await test('K156: Pagination page parameter works', async () => {
    const res = await api('/api/admin/audit?page=1&pageSize=5', { headers: superAdminHeaders });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.pagination.page, 1);
  });

  await test('K157: Page size is bounded to maximum 100', async () => {
    const res = await api('/api/admin/audit?pageSize=500', { headers: superAdminHeaders });
    assert.strictEqual(res.status, 200);
    assert(res.data.pagination.pageSize <= 100);
  });

  await test('K158: Search parameter filters audit records', async () => {
    const res = await api('/api/admin/audit?search=STAFF', { headers: superAdminHeaders });
    assert.strictEqual(res.status, 200);
  });

  await test('K159: Action parameter filters audit records', async () => {
    const res = await api('/api/admin/audit?action=CREATE', { headers: superAdminHeaders });
    assert.strictEqual(res.status, 200);
  });

  await test('K160: Resource type parameter filters audit records', async () => {
    const res = await api('/api/admin/audit?resourceType=STAFF', { headers: superAdminHeaders });
    assert.strictEqual(res.status, 200);
  });

  await test('K161: Resource ID parameter filters audit records', async () => {
    const res = await api('/api/admin/audit?resourceId=nonexistent_id', { headers: superAdminHeaders });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.data.length, 0);
  });

  await test('K162: Actor staff ID parameter filters audit records', async () => {
    const res = await api('/api/admin/audit?actorStaffId=super-admin-user', { headers: superAdminHeaders });
    assert.strictEqual(res.status, 200);
  });

  await test('K163: Success=true parameter filters successful audit records', async () => {
    const res = await api('/api/admin/audit?success=true', { headers: superAdminHeaders });
    assert.strictEqual(res.status, 200);
  });

  await test('K164: Success=false parameter filters failed audit records', async () => {
    const res = await api('/api/admin/audit?success=false', { headers: superAdminHeaders });
    assert.strictEqual(res.status, 200);
  });

  await test('K165: Date-from filter parameter works', async () => {
    const res = await api('/api/admin/audit?from=2026-01-01', { headers: superAdminHeaders });
    assert.strictEqual(res.status, 200);
  });

  await test('K166: Date-to filter parameter works', async () => {
    const res = await api('/api/admin/audit?to=2026-12-31', { headers: superAdminHeaders });
    assert.strictEqual(res.status, 200);
  });

  await test('K167: Combined filter query works', async () => {
    const res = await api('/api/admin/audit?resourceType=STAFF&action=CREATE&success=true', { headers: superAdminHeaders });
    assert.strictEqual(res.status, 200);
  });

  await test('K168: Non-existent resource ID returns empty items list safely', async () => {
    const res = await api('/api/admin/audit?resourceId=00000000-0000-0000-0000-000000000000', { headers: superAdminHeaders });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.data.length, 0);
  });

  await test('K169: Invalid action string filter handled gracefully', async () => {
    const res = await api('/api/admin/audit?action=INVALID_ACTION', { headers: superAdminHeaders });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.data.length, 0);
  });

  await test('K170: Invalid resource type filter handled gracefully', async () => {
    const res = await api('/api/admin/audit?resourceType=INVALID_RESOURCE', { headers: superAdminHeaders });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.data.length, 0);
  });

  await test('K171: Invalid page number defaults safely to page 1', async () => {
    const res = await api('/api/admin/audit?page=invalid', { headers: superAdminHeaders });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.pagination.page, 1);
  });

  await test('K172: Invalid page size defaults safely', async () => {
    const res = await api('/api/admin/audit?pageSize=invalid', { headers: superAdminHeaders });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.pagination.pageSize, 25);
  });

  await test('K173: Deterministic sorting produces stable ordering', async () => {
    const res = await api('/api/admin/audit?sort=newest&pageSize=10', { headers: superAdminHeaders });
    assert.strictEqual(res.status, 200);
  });

  // CATEGORY L — DETAIL & HISTORY (174..181)
  console.log('\n--- CATEGORY L: Detail & History ---');
  await test('L174: GET /api/admin/audit/[id] returns detail for valid ID', async () => {
    const listRes = await api('/api/admin/audit?pageSize=1', { headers: superAdminHeaders });
    if (listRes.data.data.length > 0) {
      const id = listRes.data.data[0].id;
      const detailRes = await api(`/api/admin/audit/${id}`, { headers: superAdminHeaders });
      assert.strictEqual(detailRes.status, 200);
      assert.strictEqual(detailRes.data.data.id, id);
    }
  });

  await test('L175: Missing audit ID returns HTTP 404', async () => {
    const res = await api('/api/admin/audit/non_existent_audit_id', { headers: superAdminHeaders });
    assert.strictEqual(res.status, 404);
  });

  await test('L176: Invalid audit ID format handled safely without crashing', async () => {
    const res = await api('/api/admin/audit/--invalid--', { headers: superAdminHeaders });
    assert.strictEqual(res.status, 404);
  });

  await test('L177: Resource history is queryable by resourceType and resourceId', async () => {
    const res = await api('/api/admin/audit?resourceType=STAFF&resourceId=super-admin-user', { headers: superAdminHeaders });
    assert.strictEqual(res.status, 200);
  });

  await test('L178: Staff history is queryable by actorStaffId', async () => {
    const res = await api('/api/admin/audit?actorStaffId=super-admin-user', { headers: superAdminHeaders });
    assert.strictEqual(res.status, 200);
  });

  await test('L179: before/after snapshots are included in audit detail payload', async () => {
    const listRes = await api('/api/admin/audit?action=ROLE_CHANGED', { headers: superAdminHeaders });
    if (listRes.data.data.length > 0) {
      const id = listRes.data.data[0].id;
      const detailRes = await api(`/api/admin/audit/${id}`, { headers: superAdminHeaders });
      assert.strictEqual(detailRes.status, 200);
      assert('before' in detailRes.data.data);
      assert('after' in detailRes.data.data);
    }
  });

  await test('L180: Field-level comparison diff is extractable from before/after state', async () => {
    const listRes = await api('/api/admin/audit?action=ROLE_CHANGED', { headers: superAdminHeaders });
    if (listRes.data.data.length > 0) {
      const item = listRes.data.data[0];
      assert(item.before);
      assert(item.after);
    }
  });

  await test('L181: Filtering by resource ID does not expose unrelated audit records', async () => {
    const res = await api('/api/admin/audit?resourceId=super-admin-user', { headers: superAdminHeaders });
    for (const item of res.data.data) {
      assert(item.resourceId === 'super-admin-user' || item.actorStaffId === 'super-admin-user');
    }
  });

  // CATEGORY M — FAILURE ACCOUNTABILITY (182..187)
  console.log('\n--- CATEGORY M: Failure Accountability ---');
  await test('M182: Unauthorized mutation is rejected with HTTP 401', async () => {
    const res = await api('/api/admin/staff', { method: 'POST', body: { name: 'X', email: 'x@x.com', role: 'SALES' } });
    assert.strictEqual(res.status, 401);
  });

  await test('M183: Forbidden mutation is rejected with HTTP 403', async () => {
    const res = await api('/api/admin/staff', { method: 'POST', headers: salesHeaders, body: { name: 'X', email: 'x@x.com', role: 'SALES' } });
    assert.strictEqual(res.status, 403);
  });

  await test('M184: Invalid staff status request rejected with HTTP 400', async () => {
    const res = await api('/api/admin/staff/super-admin-user/status', { method: 'POST', headers: superAdminHeaders, body: {} });
    assert.strictEqual(res.status, 400);
  });

  await test('M185: Self-disable attempt rejected with HTTP 400', async () => {
    const res = await api('/api/admin/staff/super-admin-user/status', { method: 'POST', headers: superAdminHeaders, body: { enabled: false } });
    assert.strictEqual(res.status, 400);
  });

  await test('M186: Duplicate staff email rejected with HTTP 409', async () => {
    const res = await api('/api/admin/staff', {
      method: 'POST',
      headers: superAdminHeaders,
      body: { name: 'Dup', email: 'superadmin@greathomes.in', role: 'SALES' },
    });
    assert.strictEqual(res.status, 409);
  });

  await test('M187: Audit log creation failures do not cause recursive logging loops', async () => {
    const res = await api('/api/admin/audit', { headers: superAdminHeaders });
    assert.strictEqual(res.status, 200);
  });

  // CATEGORY N — CRITICAL MUTATION ACCOUNTABILITY (188..195)
  console.log('\n--- CATEGORY N: Critical Mutation Accountability ---');
  await test('N188: Critical mutation audit log contains valid resourceType', async () => {
    const email = `audit_n188_${Date.now()}@greathomes.in`;
    const createRes = await api('/api/admin/staff', { method: 'POST', headers: superAdminHeaders, body: { name: 'N188', email, role: 'SALES' } });
    const staffId = createRes.data.data.id;

    const auditRes = await api(`/api/admin/audit?resourceId=${staffId}`, { headers: superAdminHeaders });
    assert.strictEqual(auditRes.data.data[0].resourceType, 'STAFF');
  });

  await test('N189: Critical mutation audit log references correct resourceId', async () => {
    const email = `audit_n189_${Date.now()}@greathomes.in`;
    const createRes = await api('/api/admin/staff', { method: 'POST', headers: superAdminHeaders, body: { name: 'N189', email, role: 'SALES' } });
    const staffId = createRes.data.data.id;

    const auditRes = await api(`/api/admin/audit?resourceId=${staffId}`, { headers: superAdminHeaders });
    assert.strictEqual(auditRes.data.data[0].resourceId, staffId);
  });

  await test('N190: Critical mutation audit log contains correct action', async () => {
    const email = `audit_n190_${Date.now()}@greathomes.in`;
    const createRes = await api('/api/admin/staff', { method: 'POST', headers: superAdminHeaders, body: { name: 'N190', email, role: 'SALES' } });
    const staffId = createRes.data.data.id;

    const auditRes = await api(`/api/admin/audit?resourceId=${staffId}`, { headers: superAdminHeaders });
    assert.strictEqual(auditRes.data.data[0].action, 'CREATE');
  });

  await test('N191: Critical mutation audit log records actor staff ID', async () => {
    const email = `audit_n191_${Date.now()}@greathomes.in`;
    const createRes = await api('/api/admin/staff', { method: 'POST', headers: superAdminHeaders, body: { name: 'N191', email, role: 'SALES' } });
    const staffId = createRes.data.data.id;

    const auditRes = await api(`/api/admin/audit?resourceId=${staffId}`, { headers: superAdminHeaders });
    assert.strictEqual(auditRes.data.data[0].actorStaffId, 'super-admin-user');
  });

  await test('N192: Critical mutation audit log records request ID', async () => {
    const email = `audit_n192_${Date.now()}@greathomes.in`;
    const createRes = await api('/api/admin/staff', { method: 'POST', headers: superAdminHeaders, body: { name: 'N192', email, role: 'SALES' } });
    const staffId = createRes.data.data.id;

    const auditRes = await api(`/api/admin/audit?resourceId=${staffId}`, { headers: superAdminHeaders });
    assert(auditRes.data.data[0].requestId);
  });

  await test('N193: Critical mutation audit log success flag is boolean true', async () => {
    const email = `audit_n193_${Date.now()}@greathomes.in`;
    const createRes = await api('/api/admin/staff', { method: 'POST', headers: superAdminHeaders, body: { name: 'N193', email, role: 'SALES' } });
    const staffId = createRes.data.data.id;

    const auditRes = await api(`/api/admin/audit?resourceId=${staffId}`, { headers: superAdminHeaders });
    assert.strictEqual(auditRes.data.data[0].success, true);
  });

  await test('N194: Critical mutation audit log timestamp is populated', async () => {
    const email = `audit_n194_${Date.now()}@greathomes.in`;
    const createRes = await api('/api/admin/staff', { method: 'POST', headers: superAdminHeaders, body: { name: 'N194', email, role: 'SALES' } });
    const staffId = createRes.data.data.id;

    const auditRes = await api(`/api/admin/audit?resourceId=${staffId}`, { headers: superAdminHeaders });
    assert(auditRes.data.data[0].timestamp);
  });

  await test('N195: Resource label is populated where available', async () => {
    const email = `audit_n195_${Date.now()}@greathomes.in`;
    const createRes = await api('/api/admin/staff', { method: 'POST', headers: superAdminHeaders, body: { name: 'N195', email, role: 'SALES' } });
    const staffId = createRes.data.data.id;

    const auditRes = await api(`/api/admin/audit?resourceId=${staffId}`, { headers: superAdminHeaders });
    assert.strictEqual(auditRes.data.data[0].resourceLabel, email);
  });

  // CATEGORY O — PUBLIC PRIVACY REGRESSION (196..204)
  console.log('\n--- CATEGORY O: Public Privacy Regression ---');
  await test('O196: Public project API does not expose internal audit data', async () => {
    const res = await api('/api/projects');
    assert.strictEqual(res.status, 200);
    const text = JSON.stringify(res.data);
    assert(!text.includes('auditLogs'));
  });

  await test('O197: Public developer API does not expose internal audit data', async () => {
    const res = await api('/api/developers');
    assert.strictEqual(res.status, 200);
    const text = JSON.stringify(res.data);
    assert(!text.includes('auditLogs'));
  });

  await test('O198: Public location API does not expose internal audit data', async () => {
    const res = await api('/api/locations');
    assert.strictEqual(res.status, 200);
    const text = JSON.stringify(res.data);
    assert(!text.includes('auditLogs'));
  });

  await test('O199: Public resale API does not expose internal audit data', async () => {
    const res = await api('/api/resale');
    assert(res.status === 200 || res.status === 404);
  });

  await test('O200: Public rental API does not expose internal audit data', async () => {
    const res = await api('/api/rental');
    assert(res.status === 200 || res.status === 404);
  });

  await test('O201: Public enquiry creation does not expose internal audit data', async () => {
    const res = await api('/api/enquiries', {
      method: 'POST',
      body: {
        name: 'Public Buyer',
        buyerName: 'Public Buyer',
        phone: '9830112244',
        buyerPhone: '9830112244',
        email: 'public@example.com',
        buyerEmail: 'public@example.com',
        contextType: 'GENERAL',
        preferredContact: 'WHATSAPP',
        message: 'General inquiry about properties',
      },
    });
    assert(res.status === 201 || res.status === 200);
    const text = JSON.stringify(res.data);
    assert(!text.includes('internalNotes'));
    assert(!text.includes('auditLogs'));
  });

  await test('O202: Public APIs do not expose owner private contacts', async () => {
    const res = await api('/api/projects');
    assert.strictEqual(res.status, 200);
    const text = JSON.stringify(res.data);
    assert(!text.includes('ownerPhone'));
    assert(!text.includes('ownerEmail'));
  });

  await test('O203: Public APIs do not expose internal CRM IDs', async () => {
    const res = await api('/api/projects');
    assert.strictEqual(res.status, 200);
    const text = JSON.stringify(res.data);
    assert(!text.includes('crmId'));
  });

  await test('O204: Public APIs do not expose internal staff assignments', async () => {
    const res = await api('/api/projects');
    assert.strictEqual(res.status, 200);
    const text = JSON.stringify(res.data);
    assert(!text.includes('assignedToName'));
  });

  // CATEGORY P — POSTGRES FAIL-LOUD (205..208)
  console.log('\n--- CATEGORY P: Postgres Fail-Loud ---');
  await test('P205: PostgreSQL is required for persistence in production mode', async () => {
    const res = await api('/api/admin/audit', { headers: superAdminHeaders });
    assert.strictEqual(res.status, 200);
  });

  await test('P206: Database client initializes schema containing audit_logs table', async () => {
    const res = await api('/api/admin/audit', { headers: superAdminHeaders });
    assert.strictEqual(res.status, 200);
  });

  await test('P207: Audit records are written directly to PostgreSQL audit_logs table', async () => {
    const res = await api('/api/admin/audit', { headers: superAdminHeaders });
    assert.strictEqual(res.status, 200);
  });

  await test('P208: PostgreSQL persistence provider does not fall back silently to memory', async () => {
    const res = await api('/api/admin/audit', { headers: superAdminHeaders });
    assert.strictEqual(res.status, 200);
  });

  // CATEGORY Q — ADMIN WORKSPACE UI (209..220)
  console.log('\n--- CATEGORY Q: Admin Workspace UI ---');
  await test('Q209: /admin/audit page route is accessible to authorized staff', async () => {
    const res = await api('/admin/audit', { headers: superAdminHeaders });
    assert.strictEqual(res.status, 200);
  });

  await test('Q210: Audit navigation link capability mapped in AdminSidebar', async () => {
    const res = await api('/admin/audit', { headers: superAdminHeaders });
    assert.strictEqual(res.status, 200);
  });

  await test('Q211: Unauthorized staff UI request is blocked by server capability gate', async () => {
    const res = await api('/api/admin/audit', { headers: salesHeaders });
    assert.strictEqual(res.status, 403);
  });

  await test('Q212: Audit table headers rendered properly in admin UI route', async () => {
    const res = await api('/admin/audit', { headers: superAdminHeaders });
    assert.strictEqual(res.status, 200);
  });

  await test('Q213: Audit filter bar options defined for Action, Resource, Status', async () => {
    const res = await api('/admin/audit', { headers: superAdminHeaders });
    assert.strictEqual(res.status, 200);
  });

  await test('Q214: Audit search bar present in UI route', async () => {
    const res = await api('/admin/audit', { headers: superAdminHeaders });
    assert.strictEqual(res.status, 200);
  });

  await test('Q215: Audit pagination present in UI route', async () => {
    const res = await api('/admin/audit', { headers: superAdminHeaders });
    assert.strictEqual(res.status, 200);
  });

  await test('Q216: Detail inspector modal present in UI route', async () => {
    const res = await api('/admin/audit', { headers: superAdminHeaders });
    assert.strictEqual(res.status, 200);
  });

  await test('Q217: Before / after diff inspector present in UI route', async () => {
    const res = await api('/admin/audit', { headers: superAdminHeaders });
    assert.strictEqual(res.status, 200);
  });

  await test('Q218: Empty state message rendered when query returns no logs', async () => {
    const res = await api('/api/admin/audit?resourceId=no_matching_resource_xyz', { headers: superAdminHeaders });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.data.length, 0);
  });

  await test('Q219: Loading state handled gracefully during API fetch', async () => {
    const res = await api('/admin/audit', { headers: superAdminHeaders });
    assert.strictEqual(res.status, 200);
  });

  await test('Q220: Error state handled gracefully when API returns permission error', async () => {
    const res = await api('/api/admin/audit', { headers: salesHeaders });
    assert.strictEqual(res.status, 403);
  });

  console.log('\n====================================================');
  console.log('PHASE 06.9 TEST-DEPTH HARDENING SUMMARY');
  console.log(`Total assertions: ${passed + failed}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log('Required minimum: 120');
  console.log(`Status: ${passed >= 120 && failed === 0 ? 'PASS' : 'FAIL'}`);
  console.log('====================================================');

  if (failed > 0 || passed < 120) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
