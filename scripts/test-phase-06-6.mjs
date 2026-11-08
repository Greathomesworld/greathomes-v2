// Phase 06.6 Forensic Test Suite: Media & RERA Admin
// Verifies Project Media, Developer Media, Resale Media, Rental Media, Project RERA Verification Workflow,
// Metadata & Ordering, Public DTO Privacy, and Capability-based Authorization Boundaries.

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

const ADMIN_HEADERS = {
  'Content-Type': 'application/json',
  'Authorization': 'Bearer gh-internal-staff-secret',
  'x-staff-role': 'ADMIN',
  'x-staff-user': 'staff-compliance-admin',
};

const SUPER_ADMIN_HEADERS = {
  'Content-Type': 'application/json',
  'Authorization': 'Bearer gh-internal-staff-secret',
  'x-staff-role': 'SUPER_ADMIN',
  'x-staff-user': 'super-admin-user',
};

const CONTENT_MANAGER_HEADERS = {
  'Content-Type': 'application/json',
  'Authorization': 'Bearer gh-internal-staff-secret',
  'x-staff-role': 'CONTENT_MANAGER',
  'x-staff-user': 'content-lead-user',
};

const SALES_HEADERS = {
  'Content-Type': 'application/json',
  'Authorization': 'Bearer gh-internal-staff-secret',
  'x-staff-role': 'SALES',
  'x-staff-user': 'sales-rep-user',
};

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  passedTests++;
  console.log(`  ✓ ${message}`);
}

async function runTests() {
  console.log('====================================================');
  console.log('🚀 RUNNING PHASE 06.6 MEDIA & RERA ADMIN TEST SUITE');
  console.log(`Target: ${BASE_URL}`);
  console.log('====================================================\n');

  // Fetch reference entities
  console.log('--- 0. Dependency & Seed Verification ---');
  const projRes = await fetch(`${BASE_URL}/api/projects?limit=5`, { headers: ADMIN_HEADERS });
  assert(projRes.ok, 'Catalog projects endpoint accessible');
  const projJson = await projRes.json();
  const sampleProject = projJson.data?.[0];
  assert(!!sampleProject, 'Sample project found in catalog');
  console.log(`Using sample project: "${sampleProject.name}" (${sampleProject.id})`);

  const devRes = await fetch(`${BASE_URL}/api/developers?limit=5`, { headers: ADMIN_HEADERS });
  assert(devRes.ok, 'Catalog developers endpoint accessible');
  const devJson = await devRes.json();
  const sampleDeveloper = devJson.data?.[0];
  assert(!!sampleDeveloper, 'Sample developer found in catalog');
  console.log(`Using sample developer: "${sampleDeveloper.name}" (${sampleDeveloper.id})`);

  const resaleRes = await fetch(`${BASE_URL}/api/resale`, { headers: ADMIN_HEADERS });
  assert(resaleRes.ok, 'Admin resale listings endpoint accessible');
  const resaleJson = await resaleRes.json();
  const sampleResale = resaleJson.data?.[0];
  assert(!!sampleResale, 'Sample resale listing found');
  console.log(`Using sample resale listing: "${sampleResale.title || sampleResale.id}"`);

  const rentRes = await fetch(`${BASE_URL}/api/rent`, { headers: ADMIN_HEADERS });
  assert(rentRes.ok, 'Admin rental listings endpoint accessible');
  const rentJson = await rentRes.json();
  const sampleRental = rentJson.data?.[0];
  assert(!!sampleRental, 'Sample rental listing found');
  console.log(`Using sample rental listing: "${sampleRental.title || sampleRental.id}"\n`);

  // ==========================================
  // 1. PROJECT MEDIA MANAGEMENT
  // ==========================================
  console.log('--- 1. Project Media Management ---');
  const newProjectMediaUrl = `https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=1200&q=80`;
  const addProjMediaRes = await fetch(`${BASE_URL}/api/projects/${sampleProject.id}/media`, {
    method: 'POST',
    headers: ADMIN_HEADERS,
    body: JSON.stringify({
      url: newProjectMediaUrl,
      category: 'EXTERIOR',
      caption: 'Main Tower Elevation Sunset',
      altText: 'Architectural elevation at dusk',
      sortOrder: 1,
      isFeatured: false,
    }),
  });
  assert(addProjMediaRes.status === 201, 'Project media created successfully (HTTP 201)');
  const createdProjMedia = await addProjMediaRes.json();
  assert(!!createdProjMedia.id, 'Project media ID generated');
  assert(createdProjMedia.category === 'EXTERIOR', 'Category recorded as EXTERIOR');
  assert(createdProjMedia.caption === 'Main Tower Elevation Sunset', 'Caption recorded correctly');
  assert(createdProjMedia.isFeatured === false, 'isFeatured initially false');

  // Update Project Media (metadata & promote to Hero)
  const updateProjMediaRes = await fetch(`${BASE_URL}/api/projects/${sampleProject.id}/media/${createdProjMedia.id}`, {
    method: 'PATCH',
    headers: ADMIN_HEADERS,
    body: JSON.stringify({
      caption: 'Main Tower Elevation Sunset - Prime Hero View',
      isFeatured: true,
      sortOrder: 10,
    }),
  });
  assert(updateProjMediaRes.ok, 'Project media updated successfully (HTTP 200)');
  const updatedProjMedia = await updateProjMediaRes.json();
  assert(updatedProjMedia.caption === 'Main Tower Elevation Sunset - Prime Hero View', 'Updated caption verified');
  assert(updatedProjMedia.isFeatured === true, 'isFeatured updated to true (HERO image)');
  assert(updatedProjMedia.sortOrder === 10, 'sortOrder updated to 10');

  // Verify retrieval via Project Media list
  const listProjMediaRes = await fetch(`${BASE_URL}/api/projects/${sampleProject.id}/media`, {
    headers: ADMIN_HEADERS,
  });
  assert(listProjMediaRes.ok, 'List project media endpoint successful');
  const projMediaList = await listProjMediaRes.json();
  assert(projMediaList.some(m => m.id === createdProjMedia.id), 'Created media asset present in project gallery');

  // Delete Project Media
  const delProjMediaRes = await fetch(`${BASE_URL}/api/projects/${sampleProject.id}/media/${createdProjMedia.id}`, {
    method: 'DELETE',
    headers: ADMIN_HEADERS,
  });
  assert(delProjMediaRes.ok, 'Project media deleted successfully');

  // Verify deleted from list
  const listAfterDelProj = await (await fetch(`${BASE_URL}/api/projects/${sampleProject.id}/media`, { headers: ADMIN_HEADERS })).json();
  assert(!listAfterDelProj.some(m => m.id === createdProjMedia.id), 'Deleted project media is no longer present');

  // ==========================================
  // 2. DEVELOPER MEDIA MANAGEMENT
  // ==========================================
  console.log('\n--- 2. Developer Media Management ---');
  // Attempt invalid category
  const invalidDevMediaRes = await fetch(`${BASE_URL}/api/developers/${sampleDeveloper.id}/media`, {
    method: 'POST',
    headers: ADMIN_HEADERS,
    body: JSON.stringify({
      url: 'https://example.com/invalid.png',
      category: 'INVALID_CATEGORY',
    }),
  });
  assert(invalidDevMediaRes.status === 400, 'Invalid developer media category rejected with HTTP 400');

  // Add valid developer media (LOGO)
  const devLogoUrl = 'https://images.unsplash.com/photo-1599305445671-ac291c95aaa9?auto=format&fit=crop&w=400&q=80';
  const addDevMediaRes = await fetch(`${BASE_URL}/api/developers/${sampleDeveloper.id}/media`, {
    method: 'POST',
    headers: ADMIN_HEADERS,
    body: JSON.stringify({
      url: devLogoUrl,
      category: 'LOGO',
      sortOrder: 0,
      isFeatured: true,
    }),
  });
  assert(addDevMediaRes.status === 201, 'Developer logo media created successfully (HTTP 201)');
  const createdDevMedia = (await addDevMediaRes.json()).data;
  assert(!!createdDevMedia.id, 'Developer media ID generated');
  assert(createdDevMedia.category === 'LOGO', 'Developer media category is LOGO');
  assert(createdDevMedia.isFeatured === true, 'Developer media isFeatured recorded');

  // List developer media
  const listDevMediaRes = await fetch(`${BASE_URL}/api/developers/${sampleDeveloper.id}/media`, {
    headers: ADMIN_HEADERS,
  });
  assert(listDevMediaRes.ok, 'Developer media list accessible');
  const devMediaList = (await listDevMediaRes.json()).data;
  assert(devMediaList.some(m => m.id === createdDevMedia.id), 'Created logo present in developer media list');

  // Update developer media (change category to BRAND, sortOrder)
  const updateDevMediaRes = await fetch(`${BASE_URL}/api/developers/${sampleDeveloper.id}/media/${createdDevMedia.id}`, {
    method: 'PATCH',
    headers: ADMIN_HEADERS,
    body: JSON.stringify({
      category: 'BRAND',
      sortOrder: 5,
      isFeatured: false,
    }),
  });
  assert(updateDevMediaRes.ok, 'Developer media updated successfully');
  const updatedDevMedia = (await updateDevMediaRes.json()).data;
  assert(updatedDevMedia.category === 'BRAND', 'Developer media category updated to BRAND');
  assert(updatedDevMedia.sortOrder === 5, 'sortOrder updated');
  assert(updatedDevMedia.isFeatured === false, 'isFeatured updated to false');

  // Delete developer media
  const delDevMediaRes = await fetch(`${BASE_URL}/api/developers/${sampleDeveloper.id}/media/${createdDevMedia.id}`, {
    method: 'DELETE',
    headers: ADMIN_HEADERS,
  });
  assert(delDevMediaRes.ok, 'Developer media deleted successfully');

  // Verify deletion
  const listAfterDelDev = (await (await fetch(`${BASE_URL}/api/developers/${sampleDeveloper.id}/media`, { headers: ADMIN_HEADERS })).json()).data;
  assert(!listAfterDelDev.some(m => m.id === createdDevMedia.id), 'Deleted developer media is no longer present');

  // ==========================================
  // 3. RESALE & RENTAL LISTING MEDIA
  // ==========================================
  console.log('\n--- 3. Resale & Rental Listing Media ---');
  // Resale Media Add & PATCH
  const addResaleMediaRes = await fetch(`${BASE_URL}/api/resale/${sampleResale.id}/media`, {
    method: 'POST',
    headers: ADMIN_HEADERS,
    body: JSON.stringify({
      url: 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1200&q=80',
      category: 'INTERIOR',
      caption: 'Spacious Hall View',
      sortOrder: 0,
      isFeatured: false,
    }),
  });
  assert(addResaleMediaRes.status === 201, 'Resale media added successfully');
  const createdResaleMedia = (await addResaleMediaRes.json()).data;

  // Update resale media via PATCH
  const updateResaleMediaRes = await fetch(`${BASE_URL}/api/resale/${sampleResale.id}/media/${createdResaleMedia.id}`, {
    method: 'PATCH',
    headers: ADMIN_HEADERS,
    body: JSON.stringify({
      caption: 'Spacious Hall View (Hero Shot)',
      isFeatured: true,
      sortOrder: 2,
    }),
  });
  assert(updateResaleMediaRes.ok, 'Resale media updated successfully via PATCH');
  const updatedResaleMedia = (await updateResaleMediaRes.json()).data;
  assert(updatedResaleMedia.caption === 'Spacious Hall View (Hero Shot)', 'Updated resale caption verified');
  assert(updatedResaleMedia.isFeatured === true, 'Resale media marked as featured hero');

  // Delete resale media
  const delResaleMediaRes = await fetch(`${BASE_URL}/api/resale/${sampleResale.id}/media/${createdResaleMedia.id}`, {
    method: 'DELETE',
    headers: ADMIN_HEADERS,
  });
  assert(delResaleMediaRes.ok, 'Resale media deleted successfully');

  // Rental Media Add & PATCH
  const addRentalMediaRes = await fetch(`${BASE_URL}/api/rent/${sampleRental.id}/media`, {
    method: 'POST',
    headers: ADMIN_HEADERS,
    body: JSON.stringify({
      url: 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=1200&q=80',
      category: 'INTERIOR',
      caption: 'Fully Furnished Living Room',
      sortOrder: 1,
      isFeatured: false,
    }),
  });
  assert(addRentalMediaRes.status === 201, 'Rental media added successfully');
  const createdRentalMedia = (await addRentalMediaRes.json()).data;

  // Update rental media via PATCH
  const updateRentalMediaRes = await fetch(`${BASE_URL}/api/rent/${sampleRental.id}/media/${createdRentalMedia.id}`, {
    method: 'PATCH',
    headers: ADMIN_HEADERS,
    body: JSON.stringify({
      caption: 'Fully Furnished Living Room (Main View)',
      isFeatured: true,
    }),
  });
  assert(updateRentalMediaRes.ok, 'Rental media updated successfully via PATCH');
  const updatedRentalMedia = (await updateRentalMediaRes.json()).data;
  assert(updatedRentalMedia.caption === 'Fully Furnished Living Room (Main View)', 'Updated rental caption verified');
  assert(updatedRentalMedia.isFeatured === true, 'Rental media marked as featured hero');

  // Delete rental media
  const delRentalMediaRes = await fetch(`${BASE_URL}/api/rent/${sampleRental.id}/media/${createdRentalMedia.id}`, {
    method: 'DELETE',
    headers: ADMIN_HEADERS,
  });
  assert(delRentalMediaRes.ok, 'Rental media deleted successfully');

  // ==========================================
  // 4. CENTRAL ADMIN MEDIA HUB API
  // ==========================================
  console.log('\n--- 4. Unified Admin Media Collection Endpoint ---');
  const adminMediaRes = await fetch(`${BASE_URL}/api/admin/media?entityType=PROJECT`, {
    headers: ADMIN_HEADERS,
  });
  assert(adminMediaRes.ok, 'Unified admin media collection accessible');
  const adminMediaJson = await adminMediaRes.json();
  assert(adminMediaJson.success === true, 'Success flag true on admin media');
  assert(Array.isArray(adminMediaJson.data), 'Returns data array of media items');
  console.log(`Found ${adminMediaJson.data.length} project media items across catalog`);

  // ==========================================
  // 5. PROJECT RERA COMPLIANCE & VERIFICATION WORKFLOW
  // ==========================================
  console.log('\n--- 5. Project RERA Compliance & Verification Workflow ---');
  // List RERA registry
  const reraListRes = await fetch(`${BASE_URL}/api/admin/rera`, {
    headers: ADMIN_HEADERS,
  });
  assert(reraListRes.ok, 'Admin RERA registry endpoint accessible');
  const reraListJson = await reraListRes.json();
  assert(reraListJson.success === true, 'RERA registry response success');
  assert(typeof reraListJson.stats.totalProjects === 'number', 'RERA registry stats totalProjects computed');
  assert(typeof reraListJson.stats.verifiedCount === 'number', 'RERA registry stats verifiedCount computed');
  assert(typeof reraListJson.stats.providedCount === 'number', 'RERA registry stats providedCount computed');
  assert(typeof reraListJson.stats.notProvidedCount === 'number', 'RERA registry stats notProvidedCount computed');
  console.log(`RERA Registry Stats: Total: ${reraListJson.stats.totalProjects}, Verified: ${reraListJson.stats.verifiedCount}, Provided: ${reraListJson.stats.providedCount}, Not Provided: ${reraListJson.stats.notProvidedCount}`);

  // Test RERA Verification Endpoint
  const testRegNumber = `WBRERA/P/KOL/TEST/${Date.now().toString().slice(-6)}`;
  const verifyRes = await fetch(`${BASE_URL}/api/admin/rera/${sampleProject.id}/verify`, {
    method: 'POST',
    headers: ADMIN_HEADERS,
    body: JSON.stringify({
      registrationNumber: testRegNumber,
      authority: 'WBRERA',
      internalNotes: 'Verified against state registry portal test certificate.',
    }),
  });
  assert(verifyRes.ok, 'RERA verification execution succeeded (HTTP 200)');
  const verifyJson = await verifyRes.json();
  assert(verifyJson.data.status === 'VERIFIED', 'RERA status is VERIFIED');
  assert(verifyJson.data.registrationNumber === testRegNumber, 'Registration number stored accurately');
  assert(verifyJson.data.authority === 'WBRERA', 'Authority stored accurately');
  assert(!!verifyJson.data.verifiedAt, 'verifiedAt timestamp recorded');
  assert(!!verifyJson.data.verifiedBy, 'verifiedBy staff audit recorded');
  assert(verifyJson.data.internalNotes === 'Verified against state registry portal test certificate.', 'internalNotes recorded');

  // Verify in Admin RERA registry view
  const reraRecordAfterVerify = await (await fetch(`${BASE_URL}/api/admin/rera?search=${encodeURIComponent(sampleProject.name)}`, { headers: ADMIN_HEADERS })).json();
  const targetProjectRera = reraRecordAfterVerify.data.find(r => r.projectId === sampleProject.id);
  assert(!!targetProjectRera, 'Target project found in RERA registry');
  assert(targetProjectRera.rera.status === 'VERIFIED', 'Admin RERA view reflects VERIFIED status');
  assert(targetProjectRera.rera.registrationNumber === testRegNumber, 'Admin RERA view reflects registration number');
  assert(targetProjectRera.rera.verifiedBy === 'staff-compliance-admin', 'Admin RERA view exposes verifiedBy to staff');
  assert(targetProjectRera.rera.internalNotes === 'Verified against state registry portal test certificate.', 'Admin RERA view exposes internalNotes to staff');

  // ==========================================
  // 6. PUBLIC DTO PRIVACY FORENSICS
  // ==========================================
  console.log('\n--- 6. Public DTO Privacy Forensics ---');
  // Anonymous / Public request to the project endpoint
  const publicProjRes = await fetch(`${BASE_URL}/api/projects/${sampleProject.id}`);
  assert(publicProjRes.ok, 'Public project detail endpoint accessible');
  const publicProj = await publicProjRes.json();

  assert(publicProj.rera.status === 'VERIFIED', 'Public DTO reflects verified status');
  assert(publicProj.rera.registrationNumber === testRegNumber, 'Public DTO reflects registration number');
  assert(publicProj.rera.hasVerifiedReraBadge === true, 'Public DTO hasVerifiedReraBadge is TRUE for verified project');
  assert(publicProj.rera.authority === 'WBRERA', 'Public DTO has authority');

  // PRIVACY GATES:
  assert(publicProj.rera.verifiedBy === undefined, 'Privacy Gate: verifiedBy is NOT exposed to public');
  assert(publicProj.rera.internalNotes === undefined, 'Privacy Gate: internalNotes is NOT exposed to public');
  assert(JSON.stringify(publicProj.rera).indexOf('staff-compliance-admin') === -1, 'Privacy Gate: Staff identity never leaked in public RERA payload');
  assert(JSON.stringify(publicProj.rera).indexOf('test certificate') === -1, 'Privacy Gate: Internal notes never leaked in public RERA payload');

  // Revocation Workflow
  console.log('\n--- 7. RERA Revocation Workflow ---');
  const revokeRes = await fetch(`${BASE_URL}/api/admin/rera/${sampleProject.id}/revoke`, {
    method: 'POST',
    headers: ADMIN_HEADERS,
    body: JSON.stringify({
      status: 'PROVIDED',
      internalNotes: 'Revoked for routine compliance recertification.',
    }),
  });
  assert(revokeRes.ok, 'RERA verification revoked successfully');
  const revokeJson = await revokeRes.json();
  assert(revokeJson.data.status === 'PROVIDED', 'Status returned to PROVIDED');
  assert(!revokeJson.data.verifiedAt, 'verifiedAt cleared');
  assert(!revokeJson.data.verifiedBy, 'verifiedBy cleared');

  // Public check after revocation
  const publicProjAfterRevoke = await (await fetch(`${BASE_URL}/api/projects/${sampleProject.id}`)).json();
  assert(publicProjAfterRevoke.rera.status === 'PROVIDED', 'Public DTO reflects PROVIDED after revocation');
  assert(publicProjAfterRevoke.rera.hasVerifiedReraBadge === false, 'hasVerifiedReraBadge is FALSE after revocation');

  // ==========================================
  // 8. CAPABILITY & AUTHORIZATION BOUNDARIES
  // ==========================================
  console.log('\n--- 8. Capability-Based Authorization Boundaries ---');
  // Anonymous requests
  const anonMediaRes = await fetch(`${BASE_URL}/api/admin/media`);
  assert(anonMediaRes.status === 401, 'Anonymous request to admin media rejected with HTTP 401');

  const anonReraRes = await fetch(`${BASE_URL}/api/admin/rera`);
  assert(anonReraRes.status === 401, 'Anonymous request to admin RERA rejected with HTTP 401');

  // Non-authorized role (SALES lacks MANAGE_RERA and MANAGE_MEDIA)
  const salesVerifyRes = await fetch(`${BASE_URL}/api/admin/rera/${sampleProject.id}/verify`, {
    method: 'POST',
    headers: SALES_HEADERS,
    body: JSON.stringify({ registrationNumber: 'TEST/123' }),
  });
  assert(salesVerifyRes.status === 403, 'SALES role without MANAGE_RERA forbidden (HTTP 403)');

  const salesDevMediaRes = await fetch(`${BASE_URL}/api/developers/${sampleDeveloper.id}/media`, {
    method: 'POST',
    headers: SALES_HEADERS,
    body: JSON.stringify({ url: 'https://example.com/test.png', category: 'LOGO' }),
  });
  assert(salesDevMediaRes.status === 403, 'SALES role without MANAGE_MEDIA forbidden (HTTP 403)');

  // CONTENT_MANAGER has MANAGE_RERA and MANAGE_MEDIA
  const cmReraRes = await fetch(`${BASE_URL}/api/admin/rera`, { headers: CONTENT_MANAGER_HEADERS });
  assert(cmReraRes.ok, 'CONTENT_MANAGER with MANAGE_RERA authorized (HTTP 200)');

  const cmMediaRes = await fetch(`${BASE_URL}/api/admin/media`, { headers: CONTENT_MANAGER_HEADERS });
  assert(cmMediaRes.ok, 'CONTENT_MANAGER with MANAGE_MEDIA authorized (HTTP 200)');

  // Super Admin authorized
  const saReraRes = await fetch(`${BASE_URL}/api/admin/rera`, { headers: SUPER_ADMIN_HEADERS });
  assert(saReraRes.ok, 'SUPER_ADMIN with MANAGE_RERA authorized (HTTP 200)');

  console.log('\n====================================================');
  console.log(`🎉 ALL ${passedTests} / ${totalTests} TESTS PASSED!`);
  console.log('Phase 06.6 Media & RERA Admin is 100% Operational & Verified!');
  console.log('====================================================');
}

runTests().catch(err => {
  console.error('\n❌ TEST SUITE FAILED:', err);
  process.exit(1);
});
