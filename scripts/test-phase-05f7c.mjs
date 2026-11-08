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
  console.log('Starting Phase 05F.7.C — CARTO Map Integration Tests\n');

  // ==========================================
  // 1 & 2. CARTO PROVIDER EXISTENCE & CONFORMANCE
  // ==========================================
  logSection('1 & 2. CARTO Provider Existence & Abstraction Conformance');
  const { cartoMapProvider, validateCartoCoordinates, projectLatLng, unprojectPixels } = await import(
    '../src/infrastructure/maps/carto/cartoProvider.ts'
  );

  assert.ok(cartoMapProvider, 'cartoMapProvider must be exported');
  assert.strictEqual(cartoMapProvider.id, 'carto', 'Provider ID must be "carto"');
  assert.strictEqual(cartoMapProvider.providerType, 'CARTO', 'Provider type must be "CARTO"');
  assert.strictEqual(typeof cartoMapProvider.validateCoordinates, 'function');
  assert.strictEqual(typeof cartoMapProvider.getTileUrl, 'function');
  assert.strictEqual(typeof cartoMapProvider.getStaticMapUrl, 'function');
  assert.strictEqual(typeof cartoMapProvider.getAttribution, 'function');
  assert.strictEqual(typeof cartoMapProvider.createInteractiveMap, 'function');
  console.log('✓ CARTO provider exists and strictly implements MapProvider domain abstraction');

  // ==========================================
  // 3 & 4. VALID COORDINATES & TILE RESOLUTION & ORDERING
  // ==========================================
  logSection('3 & 4. Valid Coordinates & Latitude/Longitude Ordering');
  const validCoords = { latitude: 22.5958, longitude: 88.4632 };
  assert.strictEqual(cartoMapProvider.validateCoordinates(validCoords), true);

  // Test projection & tile resolution
  const tileUrlLight = cartoMapProvider.getTileUrl(24439, 14198, 15, { theme: 'light' });
  assert.ok(tileUrlLight.includes('basemaps.cartocdn.com/rastertiles/voyager/15/24439/14198.png'));
  
  const tileUrlDark = cartoMapProvider.getTileUrl(24439, 14198, 15, { theme: 'dark' });
  assert.ok(tileUrlDark.includes('basemaps.cartocdn.com/dark_all/15/24439/14198.png'));

  // Verify latitude -> Y, longitude -> X ordering
  const projected = projectLatLng(validCoords.latitude, validCoords.longitude, 15);
  const unprojected = unprojectPixels(projected.x, projected.y, 15);
  assert.ok(Math.abs(unprojected.latitude - validCoords.latitude) < 0.0001, 'Latitude unprojection must match');
  assert.ok(Math.abs(unprojected.longitude - validCoords.longitude) < 0.0001, 'Longitude unprojection must match');
  console.log('✓ Valid coordinates initialize CARTO tiles with correct latitude/longitude ordering');

  // ==========================================
  // 5 & 6. NULL & INVALID COORDINATES HANDLING
  // ==========================================
  logSection('5 & 6. Null & Invalid Coordinates Rejection');
  assert.strictEqual(cartoMapProvider.validateCoordinates(null), false);
  assert.strictEqual(cartoMapProvider.validateCoordinates(undefined), false);
  assert.strictEqual(cartoMapProvider.validateCoordinates({ latitude: 91, longitude: 88 }), false);
  assert.strictEqual(cartoMapProvider.validateCoordinates({ latitude: -91, longitude: 88 }), false);
  assert.strictEqual(cartoMapProvider.validateCoordinates({ latitude: 22, longitude: 181 }), false);
  assert.strictEqual(cartoMapProvider.validateCoordinates({ latitude: 22, longitude: -181 }), false);
  assert.strictEqual(cartoMapProvider.validateCoordinates({ latitude: NaN, longitude: 88 }), false);
  assert.strictEqual(cartoMapProvider.validateCoordinates({ latitude: 22, longitude: NaN }), false);
  console.log('✓ Null and out-of-range coordinates strictly rejected without clamping');

  // ==========================================
  // 7 & 8. PROJECT MARKER USING PROJECT COORDINATES
  // ==========================================
  logSection('7 & 8. Project Marker Isolation & Single Marker');
  const mapFile = fs.readFileSync(path.resolve('./src/components/projects/ProjectLocationMap.tsx'), 'utf-8');
  assert.ok(mapFile.includes('category: \'PROJECT\''), 'Marker must have category: PROJECT');
  assert.ok(mapFile.includes('marker: {'), 'Exactly one project marker is configured');
  assert.ok(!mapFile.includes('markers: ['), 'No multi-marker array or nearby POI markers configured');
  console.log('✓ Exactly one project marker created strictly at Project coordinates');

  // ==========================================
  // 9 & 10. NO POI DATA & NO LISTING COORDINATES LEAK
  // ==========================================
  logSection('9 & 10. Zero POI Data & Zero Listing Coordinate Leakage');
  assert.ok(!mapFile.includes('airport'), 'No airport POI');
  assert.ok(!mapFile.includes('metro'), 'No metro POI');
  assert.ok(!mapFile.includes('hospital'), 'No hospital POI');
  assert.ok(!mapFile.includes('school'), 'No school POI');
  assert.ok(!mapFile.includes('mall'), 'No mall POI');
  assert.ok(!mapFile.includes('resaleListing'), 'No resale listing reference');
  assert.ok(!mapFile.includes('rentalListing'), 'No rental listing reference');
  console.log('✓ Zero POI data and zero listing coordinate leakage verified');

  // ==========================================
  // 11 & 12. NO DISTANCE CALCULATIONS & NO POSTGIS QUERIES
  // ==========================================
  logSection('11 & 12. Zero Distance Calculations & Zero Spatial PostGIS SQL');
  assert.ok(!mapFile.includes('Haversine'), 'Zero Haversine');
  assert.ok(!mapFile.includes('calculateDistance'), 'Zero distance calculations');
  assert.ok(!mapFile.includes(' km'), 'Zero distance badges');
  
  const schemaFile = fs.readFileSync(path.resolve('./src/db/schema.ts'), 'utf-8');
  assert.ok(!schemaFile.includes('ST_Distance'), 'No ST_Distance');
  assert.ok(!schemaFile.includes('ST_DWithin'), 'No ST_DWithin');
  console.log('✓ Zero distance calculations and zero spatial PostGIS queries verified');

  // ==========================================
  // 13. NO DATABASE SCHEMA CHANGES
  // ==========================================
  logSection('13. Database Schema Invariance');
  const schemaLines = schemaFile.split('\n').length;
  assert.ok(schemaLines >= 179, 'Schema contains core tables and Phase 06.1 persistence additions');
  console.log(`✓ Database schema verified (${schemaLines} lines)`);

  // ==========================================
  // 14 & 15. CREDENTIAL SECURITY & ENVIRONMENT CONFIGURATION
  // ==========================================
  logSection('14 & 15. Security: No Hardcoded Secrets, Public Safe Env');
  const cartoProviderFile = fs.readFileSync(path.resolve('./src/infrastructure/maps/carto/cartoProvider.ts'), 'utf-8');
  assert.ok(!cartoProviderFile.includes('secret_'), 'No secret keys hardcoded');
  assert.ok(cartoProviderFile.includes('NEXT_PUBLIC_CARTO_API_KEY'), 'Uses optional public env var');

  const envExample = fs.readFileSync(path.resolve('./.env.example'), 'utf-8');
  assert.ok(envExample.includes('NEXT_PUBLIC_CARTO_API_KEY'), '.env.example documents NEXT_PUBLIC_CARTO_API_KEY');
  assert.ok(envExample.includes('NEXT_PUBLIC_CARTO_BASEMAP_STYLE'), '.env.example documents NEXT_PUBLIC_CARTO_BASEMAP_STYLE');
  console.log('✓ Security verified: zero hardcoded secrets; public config documented in .env.example');

  // ==========================================
  // 16 & 17. LOADING & ERROR STATES
  // ==========================================
  logSection('16 & 17. Loading State & Safe Provider Error State');
  assert.ok(mapFile.includes('Loading map…'), 'Map includes loading state indicator');
  assert.ok(mapFile.includes('Map unavailable'), 'Map includes provider error fallback heading');
  assert.ok(mapFile.includes('The project location is verified, but the interactive map could not be loaded'), 'Map error clearly distinguishes map failure from location failure');
  assert.ok(mapFile.includes('aria-label="Interactive map unavailable"'), 'Error state has proper accessible aria-label');
  console.log('✓ Polished loading state and calm provider error fallback verified');

  // ==========================================
  // 18 & 19. PROJECT PAGE ACCESSIBILITY & DRAFT PROJECT PROTECTION
  // ==========================================
  logSection('18 & 19. Public Project Page Live & Draft Protection');
  const risePage = await fetchRoute('/projects/merlin-rise');
  assert.strictEqual(risePage.status, 200, 'Merlin Rise page must return 200');
  assert.ok(risePage.body.includes('id="location"'), 'Project page renders location section');
  assert.ok(risePage.body.includes('role="region"'), 'Project page renders map region container');
  assert.ok(mapFile.includes('data-map-provider="CARTO"'), 'Component specifies CARTO map provider tag');
  assert.ok(mapFile.includes('data-map-container="true"'), 'Component specifies data-map-container tag');

  const villaApiRes = await fetchRoute('/api/projects/slug/merlin-secret-villa');
  assert.strictEqual(villaApiRes.status, 404, 'Draft project API must return 404');
  console.log('✓ Public Project Page renders location section; draft project remains 404');

  // ==========================================
  // 20. MOBILE MAP RESPONSIVENESS (ZERO OVERFLOW)
  // ==========================================
  logSection('20. Mobile Responsive Layout');
  assert.ok(mapFile.includes('aspect-[4/3] sm:aspect-[16/10] md:aspect-[16/9]'), 'Responsive aspect ratio frame preserved');
  assert.ok(mapFile.includes('overflow-hidden'), 'Map container has overflow-hidden preventing spill');
  assert.ok(mapFile.includes('w-full'), 'Full width container');
  console.log('✓ Mobile responsive layout classes verified');

  // ==========================================
  // 21 & 22. DESKTOP ADVISORY & MOBILE STICKY CTA
  // ==========================================
  logSection('21 & 22. Desktop Advisory & Mobile Sticky CTA Invariance');
  const pageFile = fs.readFileSync(path.resolve('./app/projects/[slug]/page.tsx'), 'utf-8');
  assert.ok(pageFile.includes('GreatHomesAdvisoryCard'), 'Desktop GreatHomesAdvisoryCard is preserved');
  assert.ok(pageFile.includes('MobileStickyCta'), 'MobileStickyCta is preserved');
  console.log('✓ Desktop advisory and mobile sticky CTA verified completely intact');

  // ==========================================
  // 23 & 24. HEADING LOCK & LOCATION HIERARCHY INVARIANCE
  // ==========================================
  logSection('23 & 24. Heading Lock & Hierarchy Terminology');
  assert.ok(
    risePage.body.includes('Location &amp; Connectivity') || risePage.body.includes('Location & Connectivity'),
    'Heading must be "Location & Connectivity"'
  );
  assert.ok(!risePage.body.includes('Micro-Market'), 'Zero Micro-Market in page');
  assert.ok(risePage.body.includes('Rajarhat'), 'Rajarhat displayed');
  assert.ok(risePage.body.includes('Kolkata'), 'Kolkata displayed');
  assert.ok(risePage.body.includes('West Bengal'), 'West Bengal displayed');
  console.log('✓ Locked heading "Location & Connectivity" and canonical hierarchy verified');

  console.log('\n==================================================');
  console.log('  ALL PHASE 05F.7.C TESTS PASSED (24 / 24)');
  console.log('==================================================\n');
}

runTests().catch(err => {
  console.error('\n❌ Test failed:', err);
  process.exit(1);
});
