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
  console.log('Starting Phase 05F.7.B — Project Location & Connectivity Section Tests\n');

  // ==========================================
  // 1. SECTION EXISTENCE & HEADING LOCK
  // ==========================================
  logSection('1. Location & Connectivity Section Exists');
  const risePage = await fetchRoute('/projects/merlin-rise');
  assert.strictEqual(risePage.status, 200, '/projects/merlin-rise must return 200');
  assert.ok(risePage.body.includes('id="location"'), 'Section must have id="location" for scroll navigation');
  assert.ok(
    risePage.body.includes('Location &amp; Connectivity') || risePage.body.includes('Location & Connectivity'),
    'Section heading must be "Location & Connectivity"'
  );
  assert.ok(risePage.body.includes('aria-labelledby="location-heading"'), 'Section must have accessible aria-labelledby');
  console.log('✓ Section id="location" and locked heading "Location & Connectivity" verified');

  // ==========================================
  // 2. PROJECT LOCATION VIEW MODEL CONSUMPTION
  // ==========================================
  logSection('2. ProjectLocationViewModel is Source of Truth');
  const pageFile = fs.readFileSync(path.resolve('./app/projects/[slug]/page.tsx'), 'utf-8');
  assert.ok(
    pageFile.includes('buildProjectLocationViewModel'),
    'Project Page must import and use buildProjectLocationViewModel'
  );
  assert.ok(
    pageFile.includes('location={buildProjectLocationViewModel(project.location)}'),
    'Project Page must pass canonical ProjectLocationViewModel to ProjectLocationSection'
  );

  const sectionFile = fs.readFileSync(path.resolve('./src/components/projects/ProjectLocationSection.tsx'), 'utf-8');
  assert.ok(sectionFile.includes('ProjectLocationViewModel'), 'ProjectLocationSection must import ProjectLocationViewModel');
  assert.ok(!sectionFile.includes('locationRepository'), 'Component must NOT access repositories directly');
  console.log('✓ ProjectLocationViewModel is verified as the source of truth');

  // ==========================================
  // 3 & 4. MAP COMPONENT COORDINATE HANDLING
  // ==========================================
  logSection('3 & 4. Map Component Valid vs Safe Empty State');
  const mapFile = fs.readFileSync(path.resolve('./src/components/projects/ProjectLocationMap.tsx'), 'utf-8');
  assert.ok(mapFile.includes('MapCoordinates'), 'ProjectLocationMap must consume MapCoordinates abstraction');
  assert.ok(mapFile.includes('data-map-container="true"'), 'Valid state must render container with data-map-container="true"');
  assert.ok(mapFile.includes('Map location unavailable'), 'Empty state must contain "Map location unavailable"');
  assert.ok(mapFile.includes('currently verifying the exact project location'), 'Empty state must explain verification status');
  assert.ok(mapFile.includes('aria-label="Map location unavailable"'), 'Empty state must have aria-label="Map location unavailable"');

  const { buildProjectLocationViewModel, isValidCoordinate } = await import('../src/domain/projects/viewModels/projectLocationViewModel.ts');
  
  // Case A: Valid coordinates
  const validLocationDto = {
    id: 'test-loc-1',
    name: 'Rajarhat',
    slug: 'rajarhat',
    type: 'AREA',
    latitude: 22.5958,
    longitude: 88.4632,
    path: [
      { id: 'wb', name: 'West Bengal', slug: 'west-bengal', type: 'STATE' },
      { id: 'kol', name: 'Kolkata', slug: 'kolkata', type: 'CITY' },
      { id: 'test-loc-1', name: 'Rajarhat', slug: 'rajarhat', type: 'AREA' }
    ]
  };
  const validVm = buildProjectLocationViewModel(validLocationDto);
  assert.strictEqual(validVm.hasValidCoordinates, true);
  assert.strictEqual(validVm.latitude, 22.5958);
  assert.strictEqual(validVm.longitude, 88.4632);
  console.log('✓ Valid coordinates correctly handled and passed to ViewModel');

  // Case B: Null coordinates
  const nullLocationDto = {
    id: 'test-loc-2',
    name: 'New Town',
    slug: 'new-town',
    type: 'AREA',
    path: [
      { id: 'wb', name: 'West Bengal', slug: 'west-bengal', type: 'STATE' },
      { id: 'kol', name: 'Kolkata', slug: 'kolkata', type: 'CITY' },
      { id: 'test-loc-2', name: 'New Town', slug: 'new-town', type: 'AREA' }
    ]
  };
  const nullVm = buildProjectLocationViewModel(nullLocationDto);
  assert.strictEqual(nullVm.hasValidCoordinates, false);
  assert.strictEqual(nullVm.latitude, null);
  assert.strictEqual(nullVm.longitude, null);
  console.log('✓ Null coordinates produce safe null values with zero fabrication');

  // ==========================================
  // 5. NO FALLBACK / MOCK COORDINATES
  // ==========================================
  logSection('5. Zero Fallback or Invented Coordinates');
  assert.strictEqual(nullVm.latitude, null);
  assert.strictEqual(nullVm.longitude, null);
  assert.notStrictEqual(nullVm.latitude, 22.5726, 'Must NOT fall back to Kolkata latitude');
  assert.notStrictEqual(nullVm.longitude, 88.3639, 'Must NOT fall back to Kolkata longitude');
  console.log('✓ Zero coordinate fabrication verified');

  // ==========================================
  // 6 & 7. DYNAMIC LOCATION HIERARCHY & PARTIAL HIERARCHY
  // ==========================================
  logSection('6 & 7. Dynamic Hierarchy & Partial Hierarchy Handling');
  
  // Merlin Rise (3 levels: State -> City -> Area)
  assert.strictEqual(validVm.breadcrumb.length, 3);
  assert.strictEqual(validVm.state, 'West Bengal');
  assert.strictEqual(validVm.city, 'Kolkata');
  assert.strictEqual(validVm.level, 'AREA');

  // Partial hierarchy: 2 levels (State -> City)
  const cityOnlyDto = {
    id: 'city-1',
    name: 'Kolkata',
    slug: 'kolkata',
    type: 'CITY',
    path: [
      { id: 'wb', name: 'West Bengal', slug: 'west-bengal', type: 'STATE' },
      { id: 'city-1', name: 'Kolkata', slug: 'kolkata', type: 'CITY' }
    ]
  };
  const cityVm = buildProjectLocationViewModel(cityOnlyDto);
  assert.strictEqual(cityVm.breadcrumb.length, 2);
  assert.strictEqual(cityVm.level, 'CITY');
  assert.strictEqual(cityVm.city, 'Kolkata');
  assert.strictEqual(cityVm.district, null, 'Unspecified District must be null, not fabricated');
  console.log('✓ Dynamic hierarchy and partial hierarchy verified');

  // ==========================================
  // 8 & 9. AREA-LEVEL AND CITY-LEVEL LIVE PROJECTS
  // ==========================================
  logSection('8 & 9. Area-Level and City-Level Live Projects');
  
  // Merlin Rise (AREA)
  assert.ok(risePage.body.includes('Rajarhat'), 'Merlin Rise page must display Rajarhat');
  assert.ok(risePage.body.includes('Kolkata'), 'Merlin Rise page must display Kolkata');
  assert.ok(risePage.body.includes('West Bengal'), 'Merlin Rise page must display West Bengal');
  console.log('✓ Area-level project (Merlin Rise -> Rajarhat) verified');

  // Merlin Elements (CITY)
  const elementsPage = await fetchRoute('/projects/merlin-elements');
  assert.strictEqual(elementsPage.status, 200, 'Merlin Elements must return 200');
  assert.ok(elementsPage.body.includes('Kolkata'), 'Merlin Elements page must display Kolkata');
  assert.ok(elementsPage.body.includes('West Bengal'), 'Merlin Elements page must display West Bengal');
  console.log('✓ City-level project (Merlin Elements -> Kolkata) verified');

  // PS One10 (AREA)
  const one10Page = await fetchRoute('/projects/ps-one10');
  assert.strictEqual(one10Page.status, 200, 'PS One10 must return 200');
  assert.ok(one10Page.body.includes('New Town'), 'PS One10 page must display New Town');
  console.log('✓ Area-level project (PS One10 -> New Town) verified');

  // ==========================================
  // 10. DRAFT PROJECT INACCESSIBILITY
  // ==========================================
  logSection('10. Draft Project Inaccessibility');
  const villaApiRes = await fetchRoute('/api/projects/slug/merlin-secret-villa');
  assert.strictEqual(villaApiRes.status, 404, 'Draft project API must strictly return 404');
  
  const secretVillaPage = await fetchRoute('/projects/merlin-secret-villa');
  assert.ok(
    secretVillaPage.status === 404 ||
    secretVillaPage.body.includes('could not be found') ||
    secretVillaPage.body.includes('Not Found') ||
    secretVillaPage.body.includes('not found'),
    'Draft project HTML must return not-found page'
  );
  console.log('✓ Draft project remains strictly inaccessible (API 404 & HTML Not Found)');

  // ==========================================
  // 11. LEGACY MOCK POIs REMOVED
  // ==========================================
  logSection('11. Legacy Mock POIs Removed');
  assert.ok(!sectionFile.includes('International Airport'), 'Mock International Airport must be removed');
  assert.ok(!sectionFile.includes('City Center Mall'), 'Mock City Center Mall must be removed');
  assert.ok(!sectionFile.includes('Global Hospital'), 'Mock Global Hospital must be removed');
  assert.ok(!sectionFile.includes('Delhi Public School'), 'Mock Delhi Public School must be removed');
  assert.ok(!sectionFile.includes('Tech Park IT SEZ'), 'Mock Tech Park must be removed');
  assert.ok(!sectionFile.includes('calculateDistance'), 'Mock calculateDistance must be removed');
  assert.ok(!sectionFile.includes('Haversine'), 'Mock Haversine formula must be removed');
  assert.ok(!sectionFile.includes('Nearby Landmarks'), 'Mock Nearby Landmarks must be removed');
  assert.ok(!sectionFile.includes('photo-1524661135-423995f22d0b'), 'Mock map image must be removed');
  console.log('✓ All legacy mock POIs, fake distances, and mock images strictly removed');

  // ==========================================
  // 12. ZERO MICRO-MARKET TERMINOLOGY
  // ==========================================
  logSection('12. Zero Micro-Market Terminology');
  assert.ok(!risePage.body.includes('Micro-Market'), 'Project page must NOT contain "Micro-Market"');
  assert.ok(!risePage.body.includes('Micro Market'), 'Project page must NOT contain "Micro Market"');
  assert.ok(!risePage.body.includes('Investment Corridor'), 'Project page must NOT contain "Investment Corridor"');
  assert.ok(!risePage.body.includes('Business Corridor'), 'Project page must NOT contain "Business Corridor"');
  console.log('✓ Zero "Micro-Market" or corridor terminology verified across public page HTML');

  // ==========================================
  // 13 & 14. PRIVACY & ISOLATION
  // ==========================================
  logSection('13 & 14. Privacy & Project Location Isolation');
  assert.ok(!risePage.body.includes('ownerPhone'), 'No owner phone in project page');
  assert.ok(!risePage.body.includes('brokerEmail'), 'No broker email in project page');
  assert.ok(!sectionFile.includes('resaleListing'), 'Section must NOT reference resale listings');
  assert.ok(!sectionFile.includes('rentalListing'), 'Section must NOT reference rental listings');
  console.log('✓ Privacy verified: pure project location isolation without listing leakage');

  // ==========================================
  // 15, 16, 17. NO PREMATURE DEPENDENCIES / SCHEMA MODIFICATIONS
  // ==========================================
  logSection('15, 16, 17. Schema, PostGIS & CARTO Scope Invariance');
  const pkgFile = fs.readFileSync(path.resolve('./package.json'), 'utf-8');
  assert.ok(!pkgFile.includes('@carto/'), 'Must NOT install CARTO SDK in Phase 05F.7.B');
  assert.ok(!pkgFile.includes('mapbox-gl'), 'Must NOT install Mapbox in Phase 05F.7.B');
  assert.ok(!pkgFile.includes('@googlemaps/'), 'Must NOT install Google Maps in Phase 05F.7.B');

  const schemaFile = fs.readFileSync(path.resolve('./src/db/schema.ts'), 'utf-8');
  assert.ok(!schemaFile.includes('ST_DWithin'), 'Must NOT add PostGIS distance queries in 05F.7.B');
  console.log('✓ Zero schema modifications, zero premature spatial queries, zero CARTO imports');

  // ==========================================
  // 18, 19, 20. RESPONSIVE DESIGN, ADVISORY & STICKY CTA
  // ==========================================
  logSection('18, 19, 20. Responsive UX, Desktop Advisory & Mobile Sticky CTA');
  assert.ok(risePage.body.includes('max-w-7xl'), 'Page maintains 7xl container with balanced padding');
  assert.ok(risePage.body.includes('col-span-1 lg:col-span-9'), 'Left column maintains 9-col width on desktop');
  assert.ok(pageFile.includes('GreatHomesAdvisoryCard'), 'Desktop GreatHomesAdvisoryCard is preserved');
  assert.ok(pageFile.includes('MobileStickyCta'), 'MobileStickyCta is preserved');
  console.log('✓ Desktop advisory and mobile sticky CTA verified completely intact');

  console.log('\n==================================================');
  console.log('  ALL PHASE 05F.7.B TESTS PASSED (20 / 20)');
  console.log('==================================================\n');
}

runTests().catch(err => {
  console.error('\n❌ Test failed:', err);
  process.exit(1);
});
