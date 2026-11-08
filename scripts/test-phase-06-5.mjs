// Phase 06.5 Forensic Test Suite
// Verifies Resale & Rental Admin CRUD, Lifecycle, Verification, Media, Amenities, Project Linkage, and Security/Privacy boundaries

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

const ADMIN_HEADERS = {
  'Content-Type': 'application/json',
  'Authorization': 'Bearer gh-internal-staff-secret',
  'x-staff-role': 'ADMIN',
};

const SUPER_ADMIN_HEADERS = {
  'Content-Type': 'application/json',
  'Authorization': 'Bearer gh-internal-staff-secret',
  'x-staff-role': 'SUPER_ADMIN',
};

const SALES_HEADERS = {
  'Content-Type': 'application/json',
  'Authorization': 'Bearer gh-internal-staff-secret',
  'x-staff-role': 'SALES',
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
  console.log('🚀 RUNNING PHASE 06.5 RESALE & RENTAL ADMIN TEST SUITE');
  console.log(`Target: ${BASE_URL}`);
  console.log('====================================================\n');

  // Fetch projects and amenities for references
  console.log('--- 0. Seed & Dependency Validation ---');
  const projRes = await fetch(`${BASE_URL}/api/projects?limit=5`, { headers: ADMIN_HEADERS });
  assert(projRes.ok, 'Catalog projects endpoint accessible');
  const projJson = await projRes.json();
  const sampleProject = projJson.data?.[0];
  assert(!!sampleProject, 'Sample project found in catalog for association testing');
  console.log(`Using sample project: ${sampleProject.name} (${sampleProject.id})`);

  const amenRes = await fetch(`${BASE_URL}/api/admin/amenities`, { headers: ADMIN_HEADERS });
  assert(amenRes.ok, 'Canonical amenities endpoint accessible');
  const amenJson = await amenRes.json();
  const sampleAmenity = amenJson.data?.[0];
  assert(!!sampleAmenity, 'Sample canonical amenity found for association testing');
  console.log(`Using sample amenity: ${sampleAmenity.name} (${sampleAmenity.id})\n`);

  // ==========================================
  // 1. RESALE LISTINGS CRUD & BOUNDARIES
  // ==========================================
  console.log('--- 1. Resale Listings Core CRUD & Forensics ---');

  // 1.1 Create Resale Listing (Linked to Project)
  const resaleLinkedPayload = {
    projectId: sampleProject.id,
    propertyType: 'APARTMENT',
    configuration: '3 BHK Luxury Panorama',
    bedroomCount: 3,
    carpetArea: 1050,
    builtUpArea: 1280,
    superBuiltUpArea: 1520,
    askingPrice: 8500000,
    furnishing: 'SEMI_FURNISHED',
    facing: 'NORTH_EAST',
    floorCategory: 'HIGH_FLOOR',
    possession: 'READY',
    description: 'Breathtaking high-floor residence with panoramic city views.',
    listingPartyType: 'OWNER',
    ownerName: 'Subir Banerjee',
    ownerPhone: '+919830111222',
    ownerEmail: 'subir.b@example.com',
    privatePhone: '+919830999000',
    privateEmail: 'subir.private@example.com',
    internalNotes: 'Owner motivated to close before fiscal year end.',
    source: 'REFERRAL_VIP',
    crmId: 'CRM-RS-1001',
  };

  const createResaleRes = await fetch(`${BASE_URL}/api/resale`, {
    method: 'POST',
    headers: ADMIN_HEADERS,
    body: JSON.stringify(resaleLinkedPayload),
  });
  assert(createResaleRes.status === 201, `Created linked resale listing (HTTP 201)`);
  const createResaleJson = await createResaleRes.json();
  const createdResaleId = createResaleJson.data.id;
  assert(!!createdResaleId, `Resale listing ID generated: ${createdResaleId}`);
  assert(createResaleJson.data.lifecycleStatus === 'DRAFT', 'Initial lifecycleStatus is DRAFT');
  assert(createResaleJson.data.verificationStatus === 'UNVERIFIED', 'Initial verificationStatus is UNVERIFIED');
  assert(createResaleJson.data.projectId === sampleProject.id, 'Linked to target project');

  // 1.2 Read Admin Resale Listing (Staff context)
  const adminResaleRes = await fetch(`${BASE_URL}/api/resale/${createdResaleId}`, {
    headers: ADMIN_HEADERS,
  });
  assert(adminResaleRes.ok, 'Staff can retrieve resale listing in admin view');
  const adminResaleJson = await adminResaleRes.json();
  assert(adminResaleJson.data.ownerName === 'Subir Banerjee', 'Admin DTO exposes ownerName');
  assert(adminResaleJson.data.ownerPhone === '+919830111222', 'Admin DTO exposes ownerPhone');
  assert(adminResaleJson.data.internalNotes === 'Owner motivated to close before fiscal year end.', 'Admin DTO exposes internalNotes');

  // 1.3 Public Privacy & Draft Invisibility
  const publicDraftRes = await fetch(`${BASE_URL}/api/resale/${createdResaleId}`);
  assert(publicDraftRes.status === 404, 'Public anonymous request to DRAFT listing returns 404');

  // 1.4 Update Resale Listing (PATCH)
  const updateResaleRes = await fetch(`${BASE_URL}/api/resale/${createdResaleId}`, {
    method: 'PATCH',
    headers: ADMIN_HEADERS,
    body: JSON.stringify({
      askingPrice: 8750000,
      carpetArea: 1080,
    }),
  });
  assert(updateResaleRes.ok, 'Resale listing updated successfully');
  const updateResaleJson = await updateResaleRes.json();
  assert(updateResaleJson.data.askingPrice === 8750000, 'Asking price updated');
  assert(updateResaleJson.data.carpetArea === 1080, 'Carpet area updated');

  // 1.5 Media Management for Resale
  console.log('--- 1.5 Resale Media Management ---');
  const addMediaRes = await fetch(`${BASE_URL}/api/resale/${createdResaleId}/media`, {
    method: 'POST',
    headers: ADMIN_HEADERS,
    body: JSON.stringify({
      mediaType: 'IMAGE',
      category: 'INTERIOR',
      url: 'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0',
      caption: 'Main Living Hall',
      isFeatured: true,
    }),
  });
  assert(addMediaRes.status === 201, 'Attached media image to resale listing');
  const addMediaJson = await addMediaRes.json();
  const createdMediaId = addMediaJson.data.id;
  assert(!!createdMediaId, 'Media item ID generated');

  const getMediaRes = await fetch(`${BASE_URL}/api/resale/${createdResaleId}/media`, { headers: ADMIN_HEADERS });
  const getMediaJson = await getMediaRes.json();
  assert(getMediaJson.data.length >= 1, 'Listed media items for resale listing');

  // 1.6 Amenities Management for Resale
  console.log('--- 1.6 Resale Amenities Association ---');
  const addAmenRes = await fetch(`${BASE_URL}/api/resale/${createdResaleId}/amenities`, {
    method: 'POST',
    headers: ADMIN_HEADERS,
    body: JSON.stringify({ amenityId: sampleAmenity.id }),
  });
  assert(addAmenRes.ok, 'Associated canonical amenity with resale listing');

  const getAmenRes = await fetch(`${BASE_URL}/api/resale/${createdResaleId}/amenities`, { headers: ADMIN_HEADERS });
  const getAmenJson = await getAmenRes.json();
  assert(getAmenJson.data.some(a => a.id === sampleAmenity.id), 'Associated amenity present in resale listing amenities');

  // 1.7 Verification Workflow for Resale
  console.log('--- 1.7 Resale Verification Workflow ---');
  const verifyRes = await fetch(`${BASE_URL}/api/resale/${createdResaleId}/status`, {
    method: 'POST',
    headers: ADMIN_HEADERS,
    body: JSON.stringify({
      action: 'verify',
      status: 'VERIFIED',
      verifiedBy: 'Senior Verification Officer',
    }),
  });
  assert(verifyRes.ok, 'Listing verified successfully');
  const verifyJson = await verifyRes.json();
  assert(verifyJson.data.verificationStatus === 'VERIFIED', 'Verification status is VERIFIED');
  assert(verifyJson.data.verifiedBy === 'Senior Verification Officer', 'verifiedBy recorded');
  assert(!!verifyJson.data.verifiedAt, 'verifiedAt timestamp recorded');

  // 1.8 Complete Lifecycle Transition State Machine for Resale
  console.log('--- 1.8 Resale Lifecycle Transition State Machine ---');
  // DRAFT -> SUBMITTED
  const toSubmitted = await fetch(`${BASE_URL}/api/resale/${createdResaleId}/status`, {
    method: 'POST',
    headers: ADMIN_HEADERS,
    body: JSON.stringify({ action: 'transition', status: 'SUBMITTED' }),
  });
  assert(toSubmitted.ok, 'Transitioned DRAFT -> SUBMITTED');

  // SUBMITTED -> UNDER_REVIEW
  const toReview = await fetch(`${BASE_URL}/api/resale/${createdResaleId}/status`, {
    method: 'POST',
    headers: ADMIN_HEADERS,
    body: JSON.stringify({ action: 'transition', status: 'UNDER_REVIEW' }),
  });
  assert(toReview.ok, 'Transitioned SUBMITTED -> UNDER_REVIEW');

  // UNDER_REVIEW -> APPROVED
  const toApproved = await fetch(`${BASE_URL}/api/resale/${createdResaleId}/status`, {
    method: 'POST',
    headers: ADMIN_HEADERS,
    body: JSON.stringify({ action: 'transition', status: 'APPROVED' }),
  });
  assert(toApproved.ok, 'Transitioned UNDER_REVIEW -> APPROVED');

  // APPROVED -> PUBLISHED
  const toPublished = await fetch(`${BASE_URL}/api/resale/${createdResaleId}/status`, {
    method: 'POST',
    headers: ADMIN_HEADERS,
    body: JSON.stringify({ action: 'transition', status: 'PUBLISHED' }),
  });
  assert(toPublished.ok, 'Transitioned APPROVED -> PUBLISHED');

  // Test Illegal Transition: PUBLISHED -> DRAFT (Must be rejected)
  const illegalTransition = await fetch(`${BASE_URL}/api/resale/${createdResaleId}/status`, {
    method: 'POST',
    headers: ADMIN_HEADERS,
    body: JSON.stringify({ action: 'transition', status: 'DRAFT' }),
  });
  assert(illegalTransition.status === 400, 'Illegal transition PUBLISHED -> DRAFT rejected with HTTP 400');

  // 1.9 Public Forensic Privacy & Financial Verification of PUBLISHED Resale Listing
  console.log('--- 1.9 Public DTO Privacy & Financial Forensic Audit ---');
  const publicPublishedRes = await fetch(`${BASE_URL}/api/resale/${createdResaleId}`);
  assert(publicPublishedRes.ok, 'Published listing is accessible to public');
  const publicJson = await publicPublishedRes.json();
  const publicData = publicJson.data;

  // Strict Privacy Verification
  assert(publicData.ownerName === undefined, 'Privacy: ownerName is NOT exposed in public DTO');
  assert(publicData.ownerPhone === undefined, 'Privacy: ownerPhone is NOT exposed in public DTO');
  assert(publicData.ownerEmail === undefined, 'Privacy: ownerEmail is NOT exposed in public DTO');
  assert(publicData.brokerName === undefined, 'Privacy: brokerName is NOT exposed in public DTO');
  assert(publicData.brokerPhone === undefined, 'Privacy: brokerPhone is NOT exposed in public DTO');
  assert(publicData.privatePhone === undefined, 'Privacy: privatePhone is NOT exposed in public DTO');
  assert(publicData.privateEmail === undefined, 'Privacy: privateEmail is NOT exposed in public DTO');
  assert(publicData.internalNotes === undefined, 'Privacy: internalNotes is NOT exposed in public DTO');
  assert(publicData.crmId === undefined, 'Privacy: crmId is NOT exposed in public DTO');
  assert(publicData.source === undefined, 'Privacy: source is NOT exposed in public DTO');
  assert(publicData.verifiedBy === undefined, 'Privacy: verifiedBy is NOT exposed in public DTO');

  // Floor Category Lock
  assert(publicData.floorCategory === 'HIGH_FLOOR', 'Floor category is coarse HIGH_FLOOR');
  assert(publicData.exactFloor === undefined && publicData.floorNumber === undefined, 'Exact floor number is NOT exposed');

  // Financial Rule Lock: ONLY total asking price
  assert(publicData.askingPrice === 8750000, 'Asking price is present');
  assert(publicData.pricePerSqft === undefined, 'Financial Rule: pricePerSqft is NOT present in public DTO');
  assert(publicData.effectivePricePerSqft === undefined, 'Financial Rule: effectivePricePerSqft is NOT present in public DTO');
  assert(publicData.resalePricePerSqft === undefined, 'Financial Rule: resalePricePerSqft is NOT present in public DTO');
  assert(publicData.yield === undefined, 'Financial Rule: yield is NOT present in public DTO');

  // Terminology Lock: "Owner Listed" or "Listing Partner" — never "Broker"
  assert(publicData.listingParty.label === 'Owner Listed', 'Public party label is "Owner Listed"');
  assert(!JSON.stringify(publicData).includes('"Broker"'), 'Public payload does not contain the word "Broker"');

  // 1.10 Project Decoupling (Unlinking) & Re-linking
  console.log('--- 1.10 Resale Project Decoupling / Unlinking ---');
  const unlinkRes = await fetch(`${BASE_URL}/api/resale/${createdResaleId}`, {
    method: 'PATCH',
    headers: ADMIN_HEADERS,
    body: JSON.stringify({ projectId: null }),
  });
  assert(unlinkRes.ok, 'Unlinked resale listing from project');
  const unlinkedJson = await unlinkRes.json();
  assert(unlinkedJson.data.projectId === null || unlinkedJson.data.projectId === undefined, 'projectId is now null');

  const relinkRes = await fetch(`${BASE_URL}/api/resale/${createdResaleId}`, {
    method: 'PATCH',
    headers: ADMIN_HEADERS,
    body: JSON.stringify({ projectId: sampleProject.id }),
  });
  assert(relinkRes.ok, 'Re-linked resale listing to project');
  const relinkedJson = await relinkRes.json();
  assert(relinkedJson.data.projectId === sampleProject.id, 'projectId successfully re-associated');

  // Pause & Archive lifecycle
  await fetch(`${BASE_URL}/api/resale/${createdResaleId}/status`, {
    method: 'POST',
    headers: ADMIN_HEADERS,
    body: JSON.stringify({ action: 'transition', status: 'PAUSED' }),
  });
  await fetch(`${BASE_URL}/api/resale/${createdResaleId}/status`, {
    method: 'POST',
    headers: ADMIN_HEADERS,
    body: JSON.stringify({ action: 'transition', status: 'ARCHIVED' }),
  });

  // 1.11 Resale Cleanup Delete
  const deleteResaleRes = await fetch(`${BASE_URL}/api/resale/${createdResaleId}`, {
    method: 'DELETE',
    headers: ADMIN_HEADERS,
  });
  assert(deleteResaleRes.ok, 'Deleted test resale listing');
  const afterDeleteRes = await fetch(`${BASE_URL}/api/resale/${createdResaleId}`, { headers: ADMIN_HEADERS });
  assert(afterDeleteRes.status === 404, 'Listing is no longer found after deletion\n');

  // ==========================================
  // 2. RENTAL LISTINGS CRUD & BOUNDARIES
  // ==========================================
  console.log('--- 2. Rental Listings Core CRUD & Forensics ---');

  // 2.1 Create Rental Listing (Linked to Project)
  const rentPayload = {
    projectId: sampleProject.id,
    propertyType: 'APARTMENT',
    configuration: '2 BHK Premium Garden View',
    bedroomCount: 2,
    carpetArea: 720,
    builtUpArea: 890,
    superBuiltUpArea: 1040,
    monthlyRent: 32000,
    maintenance: 4000,
    securityDeposit: 64000,
    furnishing: 'FULLY_FURNISHED',
    facing: 'SOUTH_EAST',
    floorCategory: 'MID_FLOOR',
    possession: 'READY',
    availabilityDate: new Date('2025-01-01').toISOString(),
    leaseDuration: '11 Months',
    noticePeriod: '1 Month',
    description: 'Immaculately maintained 2 BHK with Italian marble and modular fittings.',
    listingPartyType: 'OWNER',
    ownerName: 'Debabrata Sen',
    ownerPhone: '+919830555666',
    ownerEmail: 'debabrata@example.com',
    privatePhone: '+919830555999',
    privateEmail: 'private.sen@example.com',
    internalNotes: 'Prefers corporate lease agreement.',
    source: 'WEBSITE_INQUIRY',
    crmId: 'CRM-RENT-2002',
  };

  const createRentRes = await fetch(`${BASE_URL}/api/rent`, {
    method: 'POST',
    headers: ADMIN_HEADERS,
    body: JSON.stringify(rentPayload),
  });
  assert(createRentRes.status === 201, 'Created rental listing (HTTP 201)');
  const createRentJson = await createRentRes.json();
  const createdRentId = createRentJson.data.id;
  assert(!!createdRentId, `Rental listing ID generated: ${createdRentId}`);
  assert(createRentJson.data.monthlyRent === 32000, 'Monthly rent recorded accurately');
  assert(createRentJson.data.securityDeposit === 64000, 'Security deposit recorded accurately');
  assert(createRentJson.data.lifecycleStatus === 'DRAFT', 'Initial rental lifecycleStatus is DRAFT');

  // 2.2 Read Admin Rental Listing
  const adminRentRes = await fetch(`${BASE_URL}/api/rent/${createdRentId}`, { headers: ADMIN_HEADERS });
  assert(adminRentRes.ok, 'Staff can retrieve rental listing in admin view');
  const adminRentJson = await adminRentRes.json();
  assert(adminRentJson.data.ownerName === 'Debabrata Sen', 'Admin DTO exposes landlord ownerName');
  assert(adminRentJson.data.internalNotes === 'Prefers corporate lease agreement.', 'Admin DTO exposes internalNotes');

  // 2.3 Public Draft Invisibility
  const publicRentDraftRes = await fetch(`${BASE_URL}/api/rent/${createdRentId}`);
  assert(publicRentDraftRes.status === 404, 'Public anonymous request to DRAFT rental listing returns 404');

  // 2.4 Update Rental Listing (PATCH)
  const updateRentRes = await fetch(`${BASE_URL}/api/rent/${createdRentId}`, {
    method: 'PATCH',
    headers: ADMIN_HEADERS,
    body: JSON.stringify({
      monthlyRent: 33500,
      leaseDuration: '24 Months',
    }),
  });
  assert(updateRentRes.ok, 'Rental listing updated successfully');
  const updateRentJson = await updateRentRes.json();
  assert(updateRentJson.data.monthlyRent === 33500, 'Updated monthly rent verified');
  assert(updateRentJson.data.leaseDuration === '24 Months', 'Updated lease duration verified');

  // 2.5 Media Management for Rental
  console.log('--- 2.5 Rental Media Management ---');
  const addRentMediaRes = await fetch(`${BASE_URL}/api/rent/${createdRentId}/media`, {
    method: 'POST',
    headers: ADMIN_HEADERS,
    body: JSON.stringify({
      mediaType: 'IMAGE',
      category: 'INTERIOR',
      url: 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688',
      caption: 'Living and Dining Balcony',
      isFeatured: true,
    }),
  });
  assert(addRentMediaRes.status === 201, 'Attached media image to rental listing');
  const addRentMediaJson = await addRentMediaRes.json();
  const rentMediaId = addRentMediaJson.data.id;
  assert(!!rentMediaId, 'Rental media item ID generated');

  // 2.6 Amenities Management for Rental
  console.log('--- 2.6 Rental Amenities Association ---');
  const addRentAmenRes = await fetch(`${BASE_URL}/api/rent/${createdRentId}/amenities`, {
    method: 'POST',
    headers: ADMIN_HEADERS,
    body: JSON.stringify({ amenityId: sampleAmenity.id }),
  });
  assert(addRentAmenRes.ok, 'Associated canonical amenity with rental listing');

  // 2.7 Verification Workflow for Rental
  console.log('--- 2.7 Rental Verification Workflow ---');
  const verifyRentRes = await fetch(`${BASE_URL}/api/rent/${createdRentId}/status`, {
    method: 'POST',
    headers: ADMIN_HEADERS,
    body: JSON.stringify({
      action: 'verify',
      status: 'VERIFIED',
      verifiedBy: 'Rental Compliance Desk',
    }),
  });
  assert(verifyRentRes.ok, 'Rental listing verified successfully');
  const verifyRentJson = await verifyRentRes.json();
  assert(verifyRentJson.data.verificationStatus === 'VERIFIED', 'Rental verification status is VERIFIED');

  // 2.8 Lifecycle State Machine for Rental
  console.log('--- 2.8 Rental Lifecycle Transitions ---');
  await fetch(`${BASE_URL}/api/rent/${createdRentId}/status`, {
    method: 'POST',
    headers: ADMIN_HEADERS,
    body: JSON.stringify({ action: 'transition', status: 'SUBMITTED' }),
  });
  await fetch(`${BASE_URL}/api/rent/${createdRentId}/status`, {
    method: 'POST',
    headers: ADMIN_HEADERS,
    body: JSON.stringify({ action: 'transition', status: 'UNDER_REVIEW' }),
  });
  await fetch(`${BASE_URL}/api/rent/${createdRentId}/status`, {
    method: 'POST',
    headers: ADMIN_HEADERS,
    body: JSON.stringify({ action: 'transition', status: 'APPROVED' }),
  });
  const publishRentRes = await fetch(`${BASE_URL}/api/rent/${createdRentId}/status`, {
    method: 'POST',
    headers: ADMIN_HEADERS,
    body: JSON.stringify({ action: 'transition', status: 'PUBLISHED' }),
  });
  assert(publishRentRes.ok, 'Rental listing transitioned to PUBLISHED');

  // 2.9 Public Forensic Privacy & Financial Verification of PUBLISHED Rental Listing
  console.log('--- 2.9 Public Rental DTO Forensic Privacy & Financial Audit ---');
  const publicPublishedRentRes = await fetch(`${BASE_URL}/api/rent/${createdRentId}`);
  assert(publicPublishedRentRes.ok, 'Published rental listing accessible to public');
  const publicRentJson = await publicPublishedRentRes.json();
  const publicRentData = publicRentJson.data;

  // Strict Privacy Verification
  assert(publicRentData.ownerName === undefined, 'Rental Privacy: landlord ownerName is NOT exposed in public DTO');
  assert(publicRentData.ownerPhone === undefined, 'Rental Privacy: landlord ownerPhone is NOT exposed in public DTO');
  assert(publicRentData.ownerEmail === undefined, 'Rental Privacy: landlord ownerEmail is NOT exposed in public DTO');
  assert(publicRentData.internalNotes === undefined, 'Rental Privacy: internalNotes is NOT exposed in public DTO');
  assert(publicRentData.crmId === undefined, 'Rental Privacy: crmId is NOT exposed in public DTO');

  // Financial Governance Verification: NO Rental Yield!
  assert(publicRentData.monthlyRent === 33500, 'Monthly rent accurately exposed');
  assert(publicRentData.securityDeposit === 64000, 'Security deposit accurately exposed');
  assert(publicRentData.yield === undefined, 'Financial Rule: yield is NOT present in rental public DTO');
  assert(publicRentData.rentalYield === undefined, 'Financial Rule: rentalYield is NOT present in rental public DTO');
  assert(publicRentData.grossYield === undefined, 'Financial Rule: grossYield is NOT present in rental public DTO');

  // Floor Category Lock
  assert(publicRentData.floorCategory === 'MID_FLOOR', 'Floor category is coarse MID_FLOOR');
  assert(publicRentData.exactFloor === undefined, 'Exact floor number is NOT exposed');

  // 2.10 Rental Project Linkage / Decoupling
  console.log('--- 2.10 Rental Project Decoupling / Unlinking ---');
  const unlinkRentRes = await fetch(`${BASE_URL}/api/rent/${createdRentId}`, {
    method: 'PATCH',
    headers: ADMIN_HEADERS,
    body: JSON.stringify({ projectId: null }),
  });
  assert(unlinkRentRes.ok, 'Unlinked rental listing from project');
  const unlinkedRentJson = await unlinkRentRes.json();
  assert(unlinkedRentJson.data.projectId === null || unlinkedRentJson.data.projectId === undefined, 'Rental projectId is now null');

  // 2.11 Rental Cleanup Delete
  const deleteRentRes = await fetch(`${BASE_URL}/api/rent/${createdRentId}`, {
    method: 'DELETE',
    headers: ADMIN_HEADERS,
  });
  assert(deleteRentRes.ok, 'Deleted test rental listing');
  const afterDeleteRent = await fetch(`${BASE_URL}/api/rent/${createdRentId}`, { headers: ADMIN_HEADERS });
  assert(afterDeleteRent.status === 404, 'Rental listing is no longer found after deletion\n');

  // ==========================================
  // 3. CAPABILITY & AUTHORIZATION BOUNDARY
  // ==========================================
  console.log('--- 3. Authorization & Capability Boundary Tests ---');

  // 3.1 Anonymous mutation attempt must fail
  const anonPostRes = await fetch(`${BASE_URL}/api/resale`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(resaleLinkedPayload),
  });
  assert(anonPostRes.status === 401, 'Anonymous creation attempt rejected with HTTP 401');

  // 3.2 Sales Role Capability Check
  // SALES has listing.read, listing.create, listing.update, listing.submit
  // SALES DOES NOT HAVE listing.approve or listing.publish!
  const salesCreateRes = await fetch(`${BASE_URL}/api/resale`, {
    method: 'POST',
    headers: SALES_HEADERS,
    body: JSON.stringify({
      propertyType: 'APARTMENT',
      configuration: 'Sales Test Unit',
      bedroomCount: 2,
      askingPrice: 5000000,
      listingPartyType: 'OWNER',
    }),
  });
  assert(salesCreateRes.status === 201, 'SALES role with listing.create capability can create draft');
  const salesListingId = (await salesCreateRes.json()).data.id;

  // SALES attempts to PUBLISH directly -> Must fail with 403 Forbidden!
  const salesPublishRes = await fetch(`${BASE_URL}/api/resale/${salesListingId}/status`, {
    method: 'POST',
    headers: SALES_HEADERS,
    body: JSON.stringify({ action: 'transition', status: 'PUBLISHED' }),
  });
  assert(salesPublishRes.status === 403, 'SALES role without listing.publish is forbidden (HTTP 403)');

  // Clean up sales listing using ADMIN
  await fetch(`${BASE_URL}/api/resale/${salesListingId}`, {
    method: 'DELETE',
    headers: ADMIN_HEADERS,
  });

  console.log('\n====================================================');
  console.log(`🎉 ALL ${passedTests} / ${totalTests} TESTS PASSED PERFECTLY!`);
  console.log('Phase 06.5 Resale & Rental Admin is 100% Verified!');
  console.log('====================================================\n');
}

runTests().catch((err) => {
  console.error('\n❌ Test suite failed:', err);
  process.exit(1);
});
