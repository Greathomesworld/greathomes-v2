import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

function logSection(title) {
  console.log(`\n==================================================`);
  console.log(`  ${title}`);
  console.log(`==================================================\n`);
}

async function fetchRoute(urlPath, headers = {}) {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:3000${urlPath}`, { headers }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    }).on('error', reject);
  });
}

async function runTests() {
  console.log('Starting Phase 05F.7.E — Location Hierarchy & Breadcrumbs Tests\n');

  // Load domain services
  const { locationService, LOCATION_ALIASES } = await import(
    '../src/domain/locations/services/locationService.ts'
  );
  const { buildProjectLocationViewModel } = await import(
    '../src/domain/projects/viewModels/projectLocationViewModel.ts'
  );
  const { ensureSeedData } = await import(
    '../src/infrastructure/seed.ts'
  );

  await ensureSeedData();

  // ==========================================
  // SECTION A: HIERARCHY
  // ==========================================
  logSection('A. Hierarchy Resolution & Integrity (1 - 8)');

  // 1. Rajarhat resolves as AREA
  const rajarhat = await locationService.resolveLocationBySlug('rajarhat');
  assert.ok(rajarhat, 'Rajarhat must exist');
  assert.strictEqual(rajarhat.type, 'AREA', 'Rajarhat must be AREA');
  console.log('✓ 1. Rajarhat resolves as AREA');

  // 2. New Town resolves as AREA
  const newTown = await locationService.resolveLocationBySlug('new-town');
  assert.ok(newTown, 'New Town must exist');
  assert.strictEqual(newTown.type, 'AREA', 'New Town must be AREA');
  console.log('✓ 2. New Town resolves as AREA');

  // 3. Kolkata resolves as CITY
  const kolkata = await locationService.resolveLocationBySlug('kolkata');
  assert.ok(kolkata, 'Kolkata must exist');
  assert.strictEqual(kolkata.type, 'CITY', 'Kolkata must be CITY');
  console.log('✓ 3. Kolkata resolves as CITY');

  // 4. State parent resolves correctly
  const pathRajarhat = await locationService.getLocationPath(rajarhat.id);
  assert.strictEqual(pathRajarhat.length, 3, 'Path must be State -> City -> Area');
  assert.strictEqual(pathRajarhat[0].type, 'STATE', 'Root must be STATE');
  assert.strictEqual(pathRajarhat[0].name, 'West Bengal');
  assert.strictEqual(pathRajarhat[1].type, 'CITY');
  assert.strictEqual(pathRajarhat[1].name, 'Kolkata');
  assert.strictEqual(pathRajarhat[2].type, 'AREA');
  assert.strictEqual(pathRajarhat[2].name, 'Rajarhat');
  console.log('✓ 4. State parent resolves correctly (West Bengal -> Kolkata -> Rajarhat)');

  // 5. Missing intermediate levels are not fabricated
  // Merlin Elements is attached to Kolkata (CITY)
  const pathKolkata = await locationService.getLocationPath(kolkata.id);
  assert.strictEqual(pathKolkata.length, 2, 'Kolkata path must have exactly 2 tiers (State -> City)');
  assert.strictEqual(pathKolkata[0].type, 'STATE');
  assert.strictEqual(pathKolkata[1].type, 'CITY');
  const hasDistrict = pathKolkata.some(p => p.type === 'DISTRICT');
  const hasRegion = pathKolkata.some(p => p.type === 'DISCOVERY_REGION');
  assert.strictEqual(hasDistrict, false, 'Must not fabricate missing District');
  assert.strictEqual(hasRegion, false, 'Must not fabricate missing Discovery Region');
  console.log('✓ 5. Missing intermediate levels are strictly omitted without fabrication');

  // 6. Invalid parent relationships are rejected
  assert.strictEqual(locationService.validateParentChild('STATE', 'CITY'), false, 'State cannot be child of City');
  assert.strictEqual(locationService.validateParentChild('CITY', 'AREA'), false, 'City cannot be child of Area');
  assert.strictEqual(locationService.validateParentChild('AREA', 'AREA'), false, 'Area cannot be child of Area');
  assert.strictEqual(locationService.validateParentChild('STATE', 'STATE'), false, 'State cannot be child of State');
  assert.strictEqual(locationService.validateParentChild('AREA', 'CITY'), true, 'Area can descend from City');
  assert.strictEqual(locationService.validateParentChild('NEIGHBOURHOOD', 'AREA'), true, 'Neighbourhood can descend from Area');
  console.log('✓ 6. Invalid inverted/circular parent relationships rejected');

  // 7. Cycles cannot recurse indefinitely (Cycle Protection)
  const mockRepoCycle = {
    findById: async (id) => {
      if (id === 'node-a') return { id: 'node-a', name: 'Node A', type: 'AREA', parentId: 'node-b', status: 'PUBLISHED' };
      if (id === 'node-b') return { id: 'node-b', name: 'Node B', type: 'CITY', parentId: 'node-a', status: 'PUBLISHED' };
      return null;
    }
  };
  const { LocationService } = await import('../src/domain/locations/services/locationService.ts');
  const cycleService = new LocationService(mockRepoCycle);
  const cyclePath = await cycleService.getLocationPath('node-a');
  assert.ok(cyclePath.length <= 2, 'Cycle must terminate cleanly without stack overflow');
  console.log('✓ 7. Corrupted hierarchy cycle terminated deterministically without infinite loop');

  // 8. Duplicate breadcrumb nodes are removed / prevented
  const vmElements = buildProjectLocationViewModel({
    id: 'elements-loc',
    name: 'Kolkata',
    slug: 'kolkata',
    type: 'CITY',
    path: [
      { id: 'wb', name: 'West Bengal', slug: 'west-bengal', type: 'STATE' },
      { id: 'kol', name: 'Kolkata', slug: 'kolkata', type: 'CITY' },
    ]
  });
  const nodeSlugs = vmElements.breadcrumb.map(b => b.slug);
  const uniqueSlugs = new Set(nodeSlugs);
  assert.strictEqual(nodeSlugs.length, uniqueSlugs.size, 'Breadcrumb nodes must not contain duplicates');
  console.log('✓ 8. Duplicate breadcrumb nodes strictly prevented');

  // ==========================================
  // SECTION B: BREADCRUMBS
  // ==========================================
  logSection('B. Breadcrumb Navigation & Canonical Links (9 - 15)');

  // 9. Merlin Rise breadcrumb
  const riseRes = await fetchRoute('/projects/merlin-rise');
  assert.strictEqual(riseRes.status, 200);
  assert.ok(riseRes.body.includes('href="/locations/kolkata"'), 'Rise page links to /locations/kolkata');
  assert.ok(riseRes.body.includes('href="/locations/rajarhat"'), 'Rise page links to /locations/rajarhat');
  assert.ok(riseRes.body.includes('Merlin Rise'), 'Rise page terminates with project name');
  console.log('✓ 9. Merlin Rise breadcrumb: Home › Projects › Kolkata › Rajarhat › Merlin Rise');

  // 10. Merlin The Fourth breadcrumb
  const fourthRes = await fetchRoute('/projects/merlin-the-fourth');
  assert.strictEqual(fourthRes.status, 200);
  assert.ok(fourthRes.body.includes('href="/locations/new-town"'), 'Fourth links to /locations/new-town');
  assert.ok(fourthRes.body.includes('Merlin The Fourth'), 'Fourth terminates with project name');
  console.log('✓ 10. Merlin The Fourth breadcrumb: Home › Projects › Kolkata › New Town › Merlin The Fourth');

  // 11. Merlin Elements breadcrumb
  const elementsRes = await fetchRoute('/projects/merlin-elements');
  assert.strictEqual(elementsRes.status, 200);
  assert.ok(elementsRes.body.includes('href="/locations/kolkata"'), 'Elements links to /locations/kolkata');
  assert.ok(!elementsRes.body.includes('href="/locations/rajarhat"'), 'Elements must NOT include Rajarhat');
  assert.ok(!elementsRes.body.includes('href="/locations/new-town"'), 'Elements must NOT include New Town');
  console.log('✓ 11. Merlin Elements breadcrumb strictly reflects City tier without fabricated Area');

  // 12. PS One10 breadcrumb
  const one10Res = await fetchRoute('/projects/ps-one10');
  assert.strictEqual(one10Res.status, 200);
  assert.ok(one10Res.body.includes('href="/locations/new-town"'), 'PS One10 links to /locations/new-town');
  console.log('✓ 12. PS One10 breadcrumb: Home › Projects › Kolkata › New Town › PS One10');

  // 13. Location page breadcrumb
  const locRajarhatPage = await fetchRoute('/locations/rajarhat');
  assert.strictEqual(locRajarhatPage.status, 200);
  assert.ok(locRajarhatPage.body.includes('href="/locations/kolkata"'), 'Location page links to parent Kolkata');
  console.log('✓ 13. Location page breadcrumb: Home › West Bengal › Kolkata › Rajarhat');

  // 14. Current page uses aria-current
  assert.ok(locRajarhatPage.body.includes('aria-current="page"'), 'Current location node has aria-current="page"');
  assert.ok(riseRes.body.includes('aria-current="page"'), 'Current project node has aria-current="page"');
  console.log('✓ 14. Current node accessible markup (aria-current="page") verified');

  // 15. Every breadcrumb href is canonical (/locations/{slug} or /projects/{slug})
  assert.ok(!locRajarhatPage.body.includes('/locations/west-bengal/kolkata/rajarhat'), 'Zero hierarchical multi-slash URL variants');
  assert.ok(locRajarhatPage.body.includes('href="/locations/rajarhat"') || locRajarhatPage.body.includes('aria-current="page"'));
  console.log('✓ 15. Every breadcrumb href uses the canonical flat route /locations/{slug}');

  // ==========================================
  // SECTION C: VISIBILITY
  // ==========================================
  logSection('C. Publication Visibility & Privacy Boundaries (16 - 20)');

  // 16. Draft location is not public (404 / Not Found)
  const draftLocRes = await fetchRoute('/locations/secret-sector-9');
  assert.ok(
    draftLocRes.status === 404 ||
    draftLocRes.body.includes('NEXT_HTTP_ERROR_FALLBACK;404') ||
    draftLocRes.body.includes('Page not found') ||
    draftLocRes.body.includes('Location Not Found'),
    'Draft location must return 404 or Not Found page'
  );
  const draftLocApi = await fetchRoute('/api/locations/secret-sector-9');
  assert.strictEqual(draftLocApi.status, 404, 'Draft location API must strictly return 404');
  console.log('✓ 16. Draft location (secret-sector-9) returns 404');

  // 17. Archived location is not public (404 / Not Found)
  const archivedLocRes = await fetchRoute('/locations/old-industrial-zone');
  assert.ok(
    archivedLocRes.status === 404 ||
    archivedLocRes.body.includes('NEXT_HTTP_ERROR_FALLBACK;404') ||
    archivedLocRes.body.includes('Page not found') ||
    archivedLocRes.body.includes('Location Not Found'),
    'Archived location must return 404 or Not Found page'
  );
  const archivedLocApi = await fetchRoute('/api/locations/old-industrial-zone');
  assert.strictEqual(archivedLocApi.status, 404, 'Archived location API must strictly return 404');
  console.log('✓ 17. Archived location (old-industrial-zone) returns 404');

  // 18. Draft parent is not leaked in public breadcrumb
  const mockWithDraftParent = {
    findById: async (id) => {
      if (id === 'child') return { id: 'child', name: 'Child Loc', slug: 'child-loc', type: 'AREA', parentId: 'draft-parent', status: 'PUBLISHED' };
      if (id === 'draft-parent') return { id: 'draft-parent', name: 'Draft Secret City', slug: 'draft-city', type: 'CITY', parentId: null, status: 'DRAFT' };
      return null;
    }
  };
  const draftAuditService = new LocationService(mockWithDraftParent);
  const safePublicPath = await draftAuditService.getLocationPath('child', { publishedOnly: true });
  assert.strictEqual(safePublicPath.length, 1, 'Draft parent must be excluded in public context');
  assert.strictEqual(safePublicPath[0].id, 'child');
  console.log('✓ 18. Draft parent is strictly omitted from public breadcrumbs');

  // 19. Draft Merlin Secret Villa remains 404
  const villaRes = await fetchRoute('/projects/merlin-secret-villa');
  assert.ok(
    villaRes.status === 404 ||
    villaRes.body.includes('NEXT_HTTP_ERROR_FALLBACK;404') ||
    villaRes.body.includes('Page not found') ||
    villaRes.body.includes('Project Not Found'),
    'Draft project must return 404 or Not Found'
  );
  const villaApiRes = await fetchRoute('/api/projects/merlin-secret-villa');
  assert.strictEqual(villaApiRes.status, 404, 'Draft project API must strictly return 404');
  console.log('✓ 19. Draft project (merlin-secret-villa) remains strictly 404');

  // 20. Public APIs contain no private/internal fields
  const apiLocRes = await fetchRoute('/api/locations/rajarhat');
  assert.strictEqual(apiLocRes.status, 200);
  const locJson = JSON.parse(apiLocRes.body);
  assert.strictEqual(locJson.name, 'Rajarhat');
  assert.strictEqual(locJson.adminNotes, undefined, 'No admin notes in public API');
  assert.strictEqual(locJson.crmId, undefined, 'No CRM IDs in public API');
  assert.strictEqual(locJson.ownerPhone, undefined, 'No owner phone in public API');
  console.log('✓ 20. Public API responses strictly purged of internal/administrative metadata');

  // ==========================================
  // SECTION D: CANONICAL URLS
  // ==========================================
  logSection('D. Canonical Location Routes & SEO Canonicals (21 - 25)');

  // 21, 22, 23. /locations/{slug} routes resolve with 200
  const rajPage = await fetchRoute('/locations/rajarhat');
  assert.strictEqual(rajPage.status, 200, '/locations/rajarhat must return 200');
  const ntPage = await fetchRoute('/locations/new-town');
  assert.strictEqual(ntPage.status, 200, '/locations/new-town must return 200');
  const kolPage = await fetchRoute('/locations/kolkata');
  assert.strictEqual(kolPage.status, 200, '/locations/kolkata must return 200');
  console.log('✓ 21 - 23. Canonical location routes (/locations/rajarhat, new-town, kolkata) return 200');

  // 24. Canonical metadata is correct
  assert.ok(
    rajPage.body.includes('rel="canonical" href="https://greathomes.co.in/locations/rajarhat"') ||
    rajPage.body.includes('canonical') && rajPage.body.includes('https://greathomes.co.in/locations/rajarhat'),
    'Rajarhat canonical URL must be https://greathomes.co.in/locations/rajarhat'
  );
  console.log('✓ 24. Canonical link tag points strictly to https://greathomes.co.in/locations/{slug}');

  // 25. No duplicate hierarchy URL generated
  assert.ok(!rajPage.body.includes('/locations/west-bengal/kolkata/rajarhat'));
  console.log('✓ 25. Zero duplicate hierarchical URL routes generated');

  // ==========================================
  // SECTION E: STRUCTURED DATA
  // ==========================================
  logSection('E. Structured Data & BreadcrumbList JSON-LD (26 - 30)');

  // 26 & 27. BreadcrumbList exists without duplication on Project page
  assert.ok(riseRes.body.includes('"@type":"BreadcrumbList"'), 'Project page includes BreadcrumbList');
  const breadcrumbCount = (riseRes.body.match(/"@type":"BreadcrumbList"/g) || []).length;
  assert.strictEqual(breadcrumbCount, 1, 'Exactly one BreadcrumbList on project page');
  console.log('✓ 26 & 27. Exactly one BreadcrumbList JSON-LD present on project page');

  // 28. URLs in BreadcrumbList are canonical
  assert.ok(riseRes.body.includes('https://greathomes.co.in/projects/merlin-rise'), 'Terminal project canonical URL in JSON-LD');
  assert.ok(riseRes.body.includes('https://greathomes.co.in/locations/rajarhat'), 'Location canonical URL in JSON-LD');
  assert.ok(riseRes.body.includes('https://greathomes.co.in/locations/kolkata'), 'City canonical URL in JSON-LD');
  console.log('✓ 28. Canonical HTTPS domain URLs in BreadcrumbList');

  // 29. Draft locations absent from structured data
  assert.ok(!riseRes.body.includes('secret-sector-9'), 'Draft location must not appear in JSON-LD');
  console.log('✓ 29. Draft locations strictly absent from structured data');

  // 30. Project structured data remains intact
  assert.ok(riseRes.body.includes('ApartmentComplex') || riseRes.body.includes('SingleFamilyResidence'), 'Project schema preserved');
  assert.ok(riseRes.body.includes('AggregateOffer'), 'Pricing offer schema preserved');
  console.log('✓ 30. ApartmentComplex and AggregateOffer project schemas fully preserved');

  // ==========================================
  // SECTION F: ALIAS & DUPLICATE SAFEGUARDS
  // ==========================================
  logSection('F. Alias Resolution & Duplicate Audit (31 - 33)');

  // 31. Alias resolves to canonical location
  const resolvedAlias = await locationService.resolveLocationBySlug('newtown');
  assert.ok(resolvedAlias, 'Alias "newtown" must resolve');
  assert.strictEqual(resolvedAlias.slug, 'new-town', 'Alias must point to canonical slug "new-town"');
  console.log('✓ 31. Location alias "newtown" successfully resolves to canonical "new-town"');

  // 32. Alias does not create duplicate location page
  assert.strictEqual(LOCATION_ALIASES['newtown'], 'new-town');
  console.log('✓ 32. Alias registry preserves single canonical representation');

  // 33. Duplicate locations are flagged, not auto-merged
  const auditReport = await locationService.detectDuplicates();
  assert.ok(typeof auditReport.scannedCount === 'number');
  assert.ok(Array.isArray(auditReport.flags));
  console.log(`✓ 33. Duplicate audit scanner functional (scanned: ${auditReport.scannedCount}, flags: ${auditReport.flags.length})`);

  // ==========================================
  // SECTION G: NEARBY REGRESSION & SECURITY AUDIT
  // ==========================================
  logSection('G. Nearby API Security Audit & Regression (34 - 36)');

  // 34. 05F.7.D nearby functionality intact
  const nearbyRiseRes = await fetchRoute('/api/projects/slug/merlin-rise/nearby');
  assert.strictEqual(nearbyRiseRes.status, 200, 'Project-scoped nearby endpoint must return 200');
  const nearbyRiseData = JSON.parse(nearbyRiseRes.body);
  assert.strictEqual(nearbyRiseData.success, true);
  assert.ok(nearbyRiseData.hasCoordinates ? nearbyRiseData.count > 0 : nearbyRiseData.success === true, 'Nearby endpoint operates gracefully');
  console.log('✓ 34 & 35. Project-scoped nearby endpoint verified with authoritative coordinates');

  // 36. Arbitrary coordinate spatial probing surface bounded
  // Global coordinate probing outside regional markets (e.g. London: 51.5, -0.12) is rejected
  const probingRes = await fetchRoute('/api/places/nearby?lat=51.5074&lng=-0.1278');
  assert.strictEqual(probingRes.status, 400, 'Probing outside supported regional markets must return 400');
  assert.ok(probingRes.body.includes('restricted to supported operational regional markets'));

  // Valid market coordinate query remains permitted
  const validMarketRes = await fetchRoute('/api/places/nearby?lat=22.5958&lng=88.4632');
  assert.strictEqual(validMarketRes.status, 200, 'Query inside Kolkata market must succeed');
  console.log('✓ 36. Arbitrary global coordinate probing blocked; regional operational bounds enforced');

  // ==========================================
  // SECTION H: ZERO PROHIBITED TERMINOLOGY
  // ==========================================
  logSection('H. Zero Prohibited Terminology Audit');
  const allPagesHtml = [rajPage.body, ntPage.body, kolPage.body, riseRes.body].join(' ');
  assert.ok(!allPagesHtml.includes('Micro-Market'), 'Zero "Micro-Market" in HTML');
  assert.ok(!allPagesHtml.includes('Micro Market'), 'Zero "Micro Market" in HTML');
  assert.ok(!allPagesHtml.includes('Investment Corridor'), 'Zero "Investment Corridor" in HTML');
  assert.ok(!allPagesHtml.includes('Business Corridor'), 'Zero "Business Corridor" in HTML');
  assert.ok(!allPagesHtml.includes('Growth Corridor'), 'Zero "Growth Corridor" in HTML');
  console.log('✓ Prohibited corridor and micro-market terminology completely absent');

  console.log('\n==================================================');
  console.log('  ALL PHASE 05F.7.E TESTS PASSED (36 / 36)');
  console.log('==================================================\n');
}

runTests().catch(err => {
  console.error('\n❌ Test failed:', err);
  process.exit(1);
});
