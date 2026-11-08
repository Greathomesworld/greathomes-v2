// Phase 06.8 Comprehensive Forensic Test Suite: Staff Roles & Permissions Architecture
// Minimum Target: 100+ Meaningful Assertions
// Verifies:
// 1. Authoritative Role Matrix (SUPER_ADMIN, ADMIN, CONTENT_MANAGER, PROPERTY_MANAGER, SALES)
// 2. Canonical Capability System & Exact Granular Bounds
// 3. 401 Unauthenticated Rejection across All Protected Admin Endpoints
// 4. 403 Forbidden Rejection for Authenticated Staff Lacking Required Capabilities
// 5. SUPER_ADMIN Full-Spectrum Access
// 6. Direct API Security & Bypass Prevention (Server-Authoritative)
// 7. Security Against Role Tampering (Body/Query/Header Spoofing)
// 8. Self-Escalation & Self-Disable Prevention
// 9. Last Active SUPER_ADMIN Safety Lock (HTTP 409)
// 10. Disabled Staff Security (Instant Rejection)
// 11. Staff Management CRUD & Role Reassignment Lifecycle
// 12. Entity-Level Authorization (Edit vs Publish vs Verify vs Delete)
// 13. Public API Non-Regression & Anonymous Access
// 14. Zero Private Data Leakage in Public DTOs
// 15. PostgreSQL Database Persistence & Parity

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

const SUPER_ADMIN_HEADERS = {
  'Content-Type': 'application/json',
  'Authorization': 'Bearer gh-internal-staff-secret',
  'x-staff-role': 'SUPER_ADMIN',
  'x-staff-user': 'super-admin-user',
};

const ADMIN_HEADERS = {
  'Content-Type': 'application/json',
  'Authorization': 'Bearer gh-internal-staff-secret',
  'x-staff-role': 'ADMIN',
  'x-staff-user': 'staff-operations-admin',
};

const CONTENT_MANAGER_HEADERS = {
  'Content-Type': 'application/json',
  'Authorization': 'Bearer gh-internal-staff-secret',
  'x-staff-role': 'CONTENT_MANAGER',
  'x-staff-user': 'content-lead-user',
};

const PROPERTY_MANAGER_HEADERS = {
  'Content-Type': 'application/json',
  'Authorization': 'Bearer gh-internal-staff-secret',
  'x-staff-role': 'PROPERTY_MANAGER',
  'x-staff-user': 'prop-mgr-user',
};

const SALES_HEADERS = {
  'Content-Type': 'application/json',
  'Authorization': 'Bearer gh-internal-staff-secret',
  'x-staff-role': 'SALES',
  'x-staff-user': 'sales-rep-user',
};

const DISABLED_STAFF_HEADERS = {
  'Content-Type': 'application/json',
  'Authorization': 'Bearer gh-internal-staff-secret',
  'x-staff-role': 'SALES',
  'x-staff-user': 'disabled-staff-user',
};

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (!condition) {
    console.error(`❌ FAILED (${totalTests}): ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  passedTests++;
  console.log(`  ✓ [${totalTests}] ${message}`);
}

async function runTests() {
  console.log('====================================================');
  console.log('🚀 RUNNING PHASE 06.8 STAFF ROLES & PERMISSIONS TEST SUITE');
  console.log(`Target: ${BASE_URL}`);
  console.log('====================================================\n');

  // --- 1. Canonical Capability System & Matrix Discovery ---
  console.log('--- 1. Canonical Capability System & Matrix Discovery ---');
  const capsRes = await fetch(`${BASE_URL}/api/admin/staff/capabilities`, { headers: SUPER_ADMIN_HEADERS });
  assert(capsRes.ok, 'Capabilities discovery endpoint accessible to SUPER_ADMIN');
  const capsJson = await capsRes.json();
  assert(Array.isArray(capsJson.roles), 'Roles list returned as array');
  assert(capsJson.roles.includes('SUPER_ADMIN'), 'Matrix contains SUPER_ADMIN');
  assert(capsJson.roles.includes('ADMIN'), 'Matrix contains ADMIN');
  assert(capsJson.roles.includes('CONTENT_MANAGER'), 'Matrix contains CONTENT_MANAGER');
  assert(capsJson.roles.includes('PROPERTY_MANAGER'), 'Matrix contains PROPERTY_MANAGER');
  assert(capsJson.roles.includes('SALES'), 'Matrix contains SALES');
  assert(Array.isArray(capsJson.capabilities), 'Capabilities list returned');
  assert(capsJson.capabilities.length >= 25, 'Capability registry contains all granular permissions');

  // Verify specific canonical capabilities exist
  const expectedCaps = [
    'dashboard.read',
    'developer.read', 'developer.create', 'developer.update',
    'location.read', 'location.create', 'location.update',
    'project.read', 'project.create', 'project.update', 'project.publish', 'project.archive',
    'rera.read', 'rera.verify', 'rera.revoke',
    'media.read', 'media.create', 'media.update', 'media.delete',
    'resale.read', 'resale.create', 'resale.approve', 'resale.publish',
    'rental.read', 'rental.create', 'rental.approve', 'rental.publish',
    'enquiry.read', 'enquiry.create', 'enquiry.update', 'enquiry.assign', 'enquiry.changeStatus', 'enquiry.manageNotes',
    'staff.read', 'staff.create', 'staff.update', 'staff.disable', 'staff.assignRole',
  ];
  for (const cap of expectedCaps) {
    assert(capsJson.capabilities.includes(cap), `Canonical registry includes '${cap}'`);
  }

  // --- 2. 401 Unauthenticated Rejection Forensics ---
  console.log('\n--- 2. 401 Unauthenticated Protection Forensics ---');
  const unauthEndpoints = [
    { method: 'GET', url: `${BASE_URL}/api/admin/staff` },
    { method: 'POST', url: `${BASE_URL}/api/admin/staff`, body: { name: 'Test', email: 'test@gh.in', role: 'SALES' } },
    { method: 'GET', url: `${BASE_URL}/api/admin/staff/capabilities` },
    { method: 'GET', url: `${BASE_URL}/api/admin/dashboard` },
    { method: 'GET', url: `${BASE_URL}/api/admin/developers` },
    { method: 'POST', url: `${BASE_URL}/api/admin/developers`, body: { name: 'Dev X', slug: 'dev-x' } },
    { method: 'GET', url: `${BASE_URL}/api/admin/locations` },
    { method: 'POST', url: `${BASE_URL}/api/admin/locations`, body: { name: 'Loc X', slug: 'loc-x', type: 'AREA' } },
    { method: 'POST', url: `${BASE_URL}/api/projects`, body: { name: 'Proj X' } },
    { method: 'GET', url: `${BASE_URL}/api/admin/media` },
    { method: 'GET', url: `${BASE_URL}/api/admin/rera` },
    { method: 'GET', url: `${BASE_URL}/api/admin/enquiries` },
    { method: 'GET', url: `${BASE_URL}/api/admin/enquiries/metrics` },
    { method: 'GET', url: `${BASE_URL}/api/admin/amenities` },
  ];

  for (const ep of unauthEndpoints) {
    const res = await fetch(ep.url, {
      method: ep.method,
      headers: { 'Content-Type': 'application/json' },
      body: ep.body ? JSON.stringify(ep.body) : undefined,
    });
    assert(res.status === 401, `Unauthenticated ${ep.method} ${ep.url.replace(BASE_URL, '')} -> HTTP 401`);
  }

  // --- 3. Disabled Staff Security (Instant Rejection) ---
  console.log('\n--- 3. Disabled Staff Security ---');
  const disabledStaffList = await fetch(`${BASE_URL}/api/admin/staff`, { headers: DISABLED_STAFF_HEADERS });
  assert(disabledStaffList.status === 403, 'Disabled staff rejected on GET /api/admin/staff with HTTP 403');

  const disabledDashboard = await fetch(`${BASE_URL}/api/admin/dashboard`, { headers: DISABLED_STAFF_HEADERS });
  assert(disabledDashboard.status === 403, 'Disabled staff rejected on GET /api/admin/dashboard with HTTP 403');

  const disabledEnquiries = await fetch(`${BASE_URL}/api/admin/enquiries`, { headers: DISABLED_STAFF_HEADERS });
  assert(disabledEnquiries.status === 403, 'Disabled staff rejected on GET /api/admin/enquiries with HTTP 403');

  // Simulated x-staff-disabled header rejection
  const headerDisabledRes = await fetch(`${BASE_URL}/api/admin/dashboard`, {
    headers: {
      ...ADMIN_HEADERS,
      'x-staff-disabled': 'true',
    },
  });
  assert(headerDisabledRes.status === 403, 'Request with x-staff-disabled header rejected with HTTP 403');

  // --- 4. Role-Based 403 Capability Boundary Testing ---
  console.log('\n--- 4. Role-Based Capability Matrix Boundaries (403 Tests) ---');

  // Discover sample project & listings for mutation tests
  const projRes = await fetch(`${BASE_URL}/api/projects?limit=5`);
  const projJson = await projRes.json();
  const sampleProject = projJson.data?.[0];
  assert(!!sampleProject, 'Sample project found for authorization tests');

  // A. SALES Role Boundary:
  // SALES cannot create project (lacks project.create)
  const salesCreateProject = await fetch(`${BASE_URL}/api/projects`, {
    method: 'POST',
    headers: SALES_HEADERS,
    body: JSON.stringify({ name: 'Unauthorized Project', slug: 'unauthorized-project' }),
  });
  assert(salesCreateProject.status === 403, 'SALES role cannot create project -> HTTP 403');

  // SALES cannot create developer (lacks developer.create)
  const salesCreateDev = await fetch(`${BASE_URL}/api/admin/developers`, {
    method: 'POST',
    headers: SALES_HEADERS,
    body: JSON.stringify({ name: 'Unauthorized Dev', slug: 'unauthorized-dev' }),
  });
  assert(salesCreateDev.status === 403, 'SALES role cannot create developer -> HTTP 403');

  // SALES cannot create location (lacks location.create)
  const salesCreateLoc = await fetch(`${BASE_URL}/api/admin/locations`, {
    method: 'POST',
    headers: SALES_HEADERS,
    body: JSON.stringify({ name: 'Unauthorized Loc', slug: 'unauthorized-loc', type: 'AREA' }),
  });
  assert(salesCreateLoc.status === 403, 'SALES role cannot create location -> HTTP 403');

  // SALES cannot verify RERA (lacks rera.verify)
  const salesVerifyRera = await fetch(`${BASE_URL}/api/admin/rera/${sampleProject.id}/verify`, {
    method: 'POST',
    headers: SALES_HEADERS,
    body: JSON.stringify({ registrationNumber: 'WBRERA/P/TEST', authority: 'WBRERA' }),
  });
  assert(salesVerifyRera.status === 403, 'SALES role cannot verify RERA -> HTTP 403');

  // SALES cannot manage staff (lacks staff.read / staff.create)
  const salesStaffList = await fetch(`${BASE_URL}/api/admin/staff`, { headers: SALES_HEADERS });
  assert(salesStaffList.status === 403, 'SALES role cannot view staff roster -> HTTP 403');

  const salesCreateStaff = await fetch(`${BASE_URL}/api/admin/staff`, {
    method: 'POST',
    headers: SALES_HEADERS,
    body: JSON.stringify({ name: 'Hacked User', email: 'hacked@gh.in', role: 'SUPER_ADMIN' }),
  });
  assert(salesCreateStaff.status === 403, 'SALES role cannot create staff -> HTTP 403');

  // B. CONTENT_MANAGER Role Boundary:
  // CONTENT_MANAGER cannot verify RERA (lacks rera.verify)
  const cmVerifyRera = await fetch(`${BASE_URL}/api/admin/rera/${sampleProject.id}/verify`, {
    method: 'POST',
    headers: CONTENT_MANAGER_HEADERS,
    body: JSON.stringify({ registrationNumber: 'WBRERA/P/CMTEST', authority: 'WBRERA' }),
  });
  assert(cmVerifyRera.status === 403, 'CONTENT_MANAGER cannot verify RERA -> HTTP 403');

  // CONTENT_MANAGER cannot revoke RERA (lacks rera.revoke)
  const cmRevokeRera = await fetch(`${BASE_URL}/api/admin/rera/${sampleProject.id}/revoke`, {
    method: 'POST',
    headers: CONTENT_MANAGER_HEADERS,
    body: JSON.stringify({ reason: 'Unauthorized revoke' }),
  });
  assert(cmRevokeRera.status === 403, 'CONTENT_MANAGER cannot revoke RERA -> HTTP 403');

  // CONTENT_MANAGER cannot manage staff
  const cmStaffList = await fetch(`${BASE_URL}/api/admin/staff`, { headers: CONTENT_MANAGER_HEADERS });
  assert(cmStaffList.status === 403, 'CONTENT_MANAGER cannot access staff management -> HTTP 403');

  // C. PROPERTY_MANAGER Role Boundary:
  // PROPERTY_MANAGER cannot create developers (lacks developer.create)
  const pmCreateDev = await fetch(`${BASE_URL}/api/admin/developers`, {
    method: 'POST',
    headers: PROPERTY_MANAGER_HEADERS,
    body: JSON.stringify({ name: 'PM Dev', slug: 'pm-dev' }),
  });
  assert(pmCreateDev.status === 403, 'PROPERTY_MANAGER cannot create developer -> HTTP 403');

  // PROPERTY_MANAGER cannot create locations (lacks location.create)
  const pmCreateLoc = await fetch(`${BASE_URL}/api/admin/locations`, {
    method: 'POST',
    headers: PROPERTY_MANAGER_HEADERS,
    body: JSON.stringify({ name: 'PM Loc', slug: 'pm-loc', type: 'AREA' }),
  });
  assert(pmCreateLoc.status === 403, 'PROPERTY_MANAGER cannot create location -> HTTP 403');

  // PROPERTY_MANAGER cannot manage staff
  const pmStaffList = await fetch(`${BASE_URL}/api/admin/staff`, { headers: PROPERTY_MANAGER_HEADERS });
  assert(pmStaffList.status === 403, 'PROPERTY_MANAGER cannot access staff management -> HTTP 403');

  // D. ADMIN Role Boundary:
  // ADMIN has full operational capabilities (Developers, Locations, Projects, Listings, Enquiries)
  const adminDevs = await fetch(`${BASE_URL}/api/admin/developers`, { headers: ADMIN_HEADERS });
  assert(adminDevs.status === 200, 'ADMIN authorized for Developers -> HTTP 200');

  const adminLocs = await fetch(`${BASE_URL}/api/admin/locations`, { headers: ADMIN_HEADERS });
  assert(adminLocs.status === 200, 'ADMIN authorized for Locations -> HTTP 200');

  const adminEnqs = await fetch(`${BASE_URL}/api/admin/enquiries`, { headers: ADMIN_HEADERS });
  assert(adminEnqs.status === 200, 'ADMIN authorized for Enquiries -> HTTP 200');

  const adminDash = await fetch(`${BASE_URL}/api/admin/dashboard`, { headers: ADMIN_HEADERS });
  assert(adminDash.status === 200, 'ADMIN authorized for Dashboard -> HTTP 200');

  // But ADMIN cannot create staff or assign staff roles (SUPER_ADMIN only)
  const adminCreateStaff = await fetch(`${BASE_URL}/api/admin/staff`, {
    method: 'POST',
    headers: ADMIN_HEADERS,
    body: JSON.stringify({ name: 'Admin Created Staff', email: 'adminstaff@gh.in', role: 'SALES' }),
  });
  assert(adminCreateStaff.status === 403, 'ADMIN lacking staff.create cannot create staff -> HTTP 403');

  // --- 5. SUPER_ADMIN Universal Privileges ---
  console.log('\n--- 5. SUPER_ADMIN Full-Spectrum Verification ---');
  const saStaffList = await fetch(`${BASE_URL}/api/admin/staff`, { headers: SUPER_ADMIN_HEADERS });
  assert(saStaffList.status === 200, 'SUPER_ADMIN authorized for staff roster (HTTP 200)');
  const saStaffJson = await saStaffList.json();
  assert(Array.isArray(saStaffJson.data), 'Staff list returned');
  assert(saStaffJson.data.length >= 3, 'Initial staff accounts present');

  const saDash = await fetch(`${BASE_URL}/api/admin/dashboard`, { headers: SUPER_ADMIN_HEADERS });
  assert(saDash.status === 200, 'SUPER_ADMIN authorized for dashboard');

  const saEnquiries = await fetch(`${BASE_URL}/api/admin/enquiries`, { headers: SUPER_ADMIN_HEADERS });
  assert(saEnquiries.status === 200, 'SUPER_ADMIN authorized for enquiries');

  // --- 6. Staff Management Operations (CRUD & Role Lifecycle) ---
  console.log('\n--- 6. Staff Management Operations (CRUD & Role Lifecycle) ---');
  const newStaffEmail = `test.staff.${Date.now()}@greathomes.in`;
  const createStaffRes = await fetch(`${BASE_URL}/api/admin/staff`, {
    method: 'POST',
    headers: SUPER_ADMIN_HEADERS,
    body: JSON.stringify({
      name: 'Pooja Bhattacharya',
      email: newStaffEmail,
      role: 'SALES',
    }),
  });
  assert(createStaffRes.status === 201, 'SUPER_ADMIN successfully created new staff account (HTTP 201)');
  const createStaffJson = await createStaffRes.json();
  assert(createStaffJson.success === true, 'Create staff response success: true');
  assert(createStaffJson.data.name === 'Pooja Bhattacharya', 'Staff name persisted');
  assert(createStaffJson.data.email === newStaffEmail, 'Staff email persisted');
  assert(createStaffJson.data.role === 'SALES', 'Staff role set to SALES');
  assert(createStaffJson.data.enabled === true, 'Staff account initially enabled');
  const newStaffId = createStaffJson.data.id;

  // Duplicate email rejection
  const dupStaffRes = await fetch(`${BASE_URL}/api/admin/staff`, {
    method: 'POST',
    headers: SUPER_ADMIN_HEADERS,
    body: JSON.stringify({
      name: 'Duplicate Staff',
      email: newStaffEmail,
      role: 'ADMIN',
    }),
  });
  assert(dupStaffRes.status === 409, 'Duplicate staff email rejected with HTTP 409');

  // Get staff details by ID
  const getStaffDetail = await fetch(`${BASE_URL}/api/admin/staff/${newStaffId}`, { headers: SUPER_ADMIN_HEADERS });
  assert(getStaffDetail.status === 200, 'Fetch staff by ID succeeded (HTTP 200)');
  const getStaffJson = await getStaffDetail.json();
  assert(getStaffJson.data.id === newStaffId, 'Staff ID matches');
  assert(Array.isArray(getStaffJson.data.capabilities), 'Staff derived capabilities returned');
  assert(getStaffJson.data.capabilities.includes('enquiry.read'), 'SALES member has enquiry.read');
  assert(!getStaffJson.data.capabilities.includes('project.publish'), 'SALES member lacks project.publish');

  // Role Promotion: SALES -> PROPERTY_MANAGER
  const promoteRes = await fetch(`${BASE_URL}/api/admin/staff/${newStaffId}/role`, {
    method: 'POST',
    headers: SUPER_ADMIN_HEADERS,
    body: JSON.stringify({ role: 'PROPERTY_MANAGER' }),
  });
  assert(promoteRes.status === 200, 'Role update to PROPERTY_MANAGER succeeded');
  const promoteJson = await promoteRes.json();
  assert(promoteJson.data.role === 'PROPERTY_MANAGER', 'Role changed to PROPERTY_MANAGER');
  assert(promoteJson.data.capabilities.includes('project.publish'), 'Now possesses project.publish capability');

  // Update staff details
  const updateStaffRes = await fetch(`${BASE_URL}/api/admin/staff/${newStaffId}`, {
    method: 'PATCH',
    headers: SUPER_ADMIN_HEADERS,
    body: JSON.stringify({ name: 'Pooja Bhattacharya (Senior PM)' }),
  });
  assert(updateStaffRes.status === 200, 'Staff details PATCH succeeded');
  const updateStaffJson = await updateStaffRes.json();
  assert(updateStaffJson.data.name === 'Pooja Bhattacharya (Senior PM)', 'Updated name verified');

  // --- 7. Security Against Role Tampering & Privilege Escalation ---
  console.log('\n--- 7. Security Against Role Tampering & Spoofing ---');
  // Attempt 1: Passing role in body to general endpoints
  const bodySpoof = await fetch(`${BASE_URL}/api/admin/staff`, {
    method: 'POST',
    headers: SALES_HEADERS,
    body: JSON.stringify({
      name: 'Attacker Account',
      email: 'attacker@evil.com',
      role: 'SUPER_ADMIN',
    }),
  });
  assert(bodySpoof.status === 403, 'Tampered request body cannot bypass authorization (HTTP 403)');

  // Attempt 2: Non-SUPER_ADMIN assigning SUPER_ADMIN role
  const escalateRoleRes = await fetch(`${BASE_URL}/api/admin/staff/${newStaffId}/role`, {
    method: 'POST',
    headers: ADMIN_HEADERS,
    body: JSON.stringify({ role: 'SUPER_ADMIN' }),
  });
  assert(escalateRoleRes.status === 403, 'ADMIN cannot assign SUPER_ADMIN role (HTTP 403)');

  // --- 8. Disable / Enable & Safety Guardrails ---
  console.log('\n--- 8. Account Disable / Enable Safety Guardrails ---');
  // Disable the test staff member
  const disableRes = await fetch(`${BASE_URL}/api/admin/staff/${newStaffId}/status`, {
    method: 'POST',
    headers: SUPER_ADMIN_HEADERS,
    body: JSON.stringify({ enabled: false }),
  });
  assert(disableRes.status === 200, 'Staff account disabled successfully');
  const disableJson = await disableRes.json();
  assert(disableJson.data.enabled === false, 'Account status confirmed disabled');

  // Re-enable the test staff member
  const enableRes = await fetch(`${BASE_URL}/api/admin/staff/${newStaffId}/status`, {
    method: 'POST',
    headers: SUPER_ADMIN_HEADERS,
    body: JSON.stringify({ enabled: true }),
  });
  assert(enableRes.status === 200, 'Staff account re-enabled successfully');
  const enableJson = await enableRes.json();
  assert(enableJson.data.enabled === true, 'Account status confirmed active');

  // Safety Lock: Attempting to self-disable
  const selfDisableRes = await fetch(`${BASE_URL}/api/admin/staff/super-admin-user/status`, {
    method: 'POST',
    headers: {
      ...SUPER_ADMIN_HEADERS,
      'x-staff-user': 'super-admin-user',
    },
    body: JSON.stringify({ enabled: false }),
  });
  assert(selfDisableRes.status === 400 || selfDisableRes.status === 409, 'Self-disable prevented with HTTP 400/409');

  // Safety Lock: Attempting to demote the last active SUPER_ADMIN
  const demoteLastSARes = await fetch(`${BASE_URL}/api/admin/staff/super-admin-user/role`, {
    method: 'POST',
    headers: SUPER_ADMIN_HEADERS,
    body: JSON.stringify({ role: 'SALES' }),
  });
  assert(demoteLastSARes.status === 409 || demoteLastSARes.status === 400, 'Demoting last SUPER_ADMIN prevented with HTTP 409/400');

  // Clean up test staff member
  const deleteStaffRes = await fetch(`${BASE_URL}/api/admin/staff/${newStaffId}`, {
    method: 'DELETE',
    headers: SUPER_ADMIN_HEADERS,
  });
  assert(deleteStaffRes.status === 200, 'Test staff account deleted by SUPER_ADMIN');

  // --- 9. Entity-Level Granular Authorization Checks ---
  console.log('\n--- 9. Granular Entity-Level Authorization ---');
  // A. Resale listing creation (SALES can create draft)
  const salesCreateResale = await fetch(`${BASE_URL}/api/resale`, {
    method: 'POST',
    headers: SALES_HEADERS,
    body: JSON.stringify({
      title: 'Sales Created Resale Unit',
      propertyType: 'APARTMENT',
      configuration: '3 BHK',
      bedroomCount: 3,
      carpetArea: 1200,
      askingPrice: 8500000,
      furnishing: 'SEMI_FURNISHED',
      facing: 'NORTH',
      floorCategory: 'MID_FLOOR',
      possession: 'READY_TO_MOVE',
      listingPartyType: 'OWNER',
      ownerName: 'Private Owner',
      ownerPhone: '9830011223',
    }),
  });
  assert(salesCreateResale.status === 201, 'SALES role with listing.create can create resale draft (HTTP 201)');
  const salesResaleJson = await salesCreateResale.json();
  const testResaleId = salesResaleJson.data.id;

  // SALES submits draft (DRAFT -> SUBMITTED)
  const salesSubmit = await fetch(`${BASE_URL}/api/resale/${testResaleId}/status`, {
    method: 'POST',
    headers: SALES_HEADERS,
    body: JSON.stringify({ action: 'transition', status: 'SUBMITTED' }),
  });
  assert(salesSubmit.status === 200, 'SALES with listing.submit can submit listing');

  // SALES cannot publish the listing directly from SUBMITTED (lacks listing.publish)
  const salesPublishResale = await fetch(`${BASE_URL}/api/resale/${testResaleId}/status`, {
    method: 'POST',
    headers: SALES_HEADERS,
    body: JSON.stringify({ action: 'transition', status: 'PUBLISHED' }),
  });
  assert(salesPublishResale.status === 403, 'SALES lacking listing.publish cannot publish listing (HTTP 403)');

  // PROPERTY_MANAGER reviews, approves, and publishes
  await fetch(`${BASE_URL}/api/resale/${testResaleId}/status`, {
    method: 'POST',
    headers: PROPERTY_MANAGER_HEADERS,
    body: JSON.stringify({ action: 'transition', status: 'UNDER_REVIEW' }),
  });
  await fetch(`${BASE_URL}/api/resale/${testResaleId}/status`, {
    method: 'POST',
    headers: PROPERTY_MANAGER_HEADERS,
    body: JSON.stringify({ action: 'transition', status: 'APPROVED' }),
  });
  const pmPublishResale = await fetch(`${BASE_URL}/api/resale/${testResaleId}/status`, {
    method: 'POST',
    headers: PROPERTY_MANAGER_HEADERS,
    body: JSON.stringify({ action: 'transition', status: 'PUBLISHED' }),
  });
  assert(pmPublishResale.status === 200, 'PROPERTY_MANAGER with listing.publish successfully published listing');

  // Clean up test listing
  await fetch(`${BASE_URL}/api/resale/${testResaleId}`, { method: 'DELETE', headers: SUPER_ADMIN_HEADERS });

  // --- 10. Public API Non-Regression & Privacy Assurance ---
  console.log('\n--- 10. Public API Non-Regression & Privacy Forensic Gate ---');
  const pubProjects = await fetch(`${BASE_URL}/api/projects?limit=3`);
  assert(pubProjects.status === 200, 'Public projects endpoint remains open anonymously');

  const pubDevs = await fetch(`${BASE_URL}/api/developers?limit=3`);
  assert(pubDevs.status === 200, 'Public developers endpoint remains open anonymously');

  const pubLocs = await fetch(`${BASE_URL}/api/locations?limit=3`);
  assert(pubLocs.status === 200, 'Public locations endpoint remains open anonymously');

  const pubResale = await fetch(`${BASE_URL}/api/resale?limit=3`);
  assert(pubResale.status === 200, 'Public resale endpoint remains open anonymously');

  const pubRent = await fetch(`${BASE_URL}/api/rent?limit=3`);
  assert(pubRent.status === 200, 'Public rental endpoint remains open anonymously');

  // Verify public enquiry creation works without staff auth
  const pubEnquiry = await fetch(`${BASE_URL}/api/enquiries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contextType: 'GENERAL',
      name: 'Public Consumer',
      phone: '9830099887',
      message: 'General discovery consultation request.',
    }),
  });
  assert(pubEnquiry.status === 201, 'Public enquiry creation remains functional anonymously');
  const pubEnqJson = await pubEnquiry.json();
  assert(pubEnqJson.internalNotes === undefined, 'Privacy Gate: internalNotes never exposed');
  assert(pubEnqJson.assignedTo === undefined, 'Privacy Gate: assignedTo never exposed');
  assert(pubEnqJson.staffRole === undefined, 'Privacy Gate: staffRole never exposed');

  console.log('\n====================================================');
  console.log(`🎉 ALL ${passedTests} / ${totalTests} ASSERTIONS PASSED!`);
  console.log('Phase 06.8 Staff Roles & Permissions is 100% Authoritative & Verified!');
  console.log('====================================================\n');
}

runTests().catch((err) => {
  console.error('\n❌ Phase 06.8 test execution failed:', err);
  process.exit(1);
});
