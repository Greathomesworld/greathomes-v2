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
  console.log('Starting Phase 05F.7.D — Nearby Places & Distance in KM Tests\n');

  // ==========================================
  // 1 & 2. SPATIAL GEODESIC DISTANCE CALCULATION
  // ==========================================
  logSection('1 & 2. Geodesic Distance in KM Math & Validation');
  const { calculateGeodesicDistanceKm, formatDistanceKm } = await import(
    '../src/domain/places/spatial/distance.ts'
  );

  assert.strictEqual(typeof calculateGeodesicDistanceKm, 'function');
  assert.strictEqual(typeof formatDistanceKm, 'function');

  // Known Kolkata coordinates
  const originRise = { latitude: 22.5958, longitude: 88.4632 }; // Merlin Rise (Rajarhat)
  const airportCCU = { latitude: 22.6547, longitude: 88.4467 }; // CCU Airport
  const ecoPark = { latitude: 22.6022, longitude: 88.4674 };    // Eco Park New Town
  const cityCentre2 = { latitude: 22.6288, longitude: 88.4485 };// City Centre 2 Rajarhat
  const tataMedical = { latitude: 22.5835, longitude: 88.4899 };// Tata Medical Center

  const distToAirport = calculateGeodesicDistanceKm(originRise, airportCCU);
  assert.ok(distToAirport !== null);
  assert.ok(distToAirport >= 6.5 && distToAirport <= 7.2, `Airport distance should be ~6.8 km, got ${distToAirport}`);
  assert.strictEqual(formatDistanceKm(distToAirport), `${distToAirport.toFixed(1)} km`);

  const distToEcoPark = calculateGeodesicDistanceKm(originRise, ecoPark);
  assert.ok(distToEcoPark !== null);
  assert.ok(distToEcoPark >= 0.7 && distToEcoPark <= 1.0, `Eco park distance should be ~0.8 km, got ${distToEcoPark}`);

  const distToCC2 = calculateGeodesicDistanceKm(originRise, cityCentre2);
  assert.ok(distToCC2 !== null);
  assert.ok(distToCC2 >= 3.8 && distToCC2 <= 4.2, `City Centre 2 distance should be ~4.0 km, got ${distToCC2}`);

  const distToTata = calculateGeodesicDistanceKm(originRise, tataMedical);
  assert.ok(distToTata !== null);
  assert.ok(distToTata >= 3.0 && distToTata <= 3.5, `Tata Medical Center distance should be ~3.1 km, got ${distToTata}`);

  // Symmetry test: dist(A, B) === dist(B, A)
  assert.strictEqual(
    calculateGeodesicDistanceKm(originRise, airportCCU),
    calculateGeodesicDistanceKm(airportCCU, originRise)
  );

  // Zero distance test: dist(A, A) === 0.0
  assert.strictEqual(calculateGeodesicDistanceKm(originRise, originRise), 0);

  // Invalid coordinates return null
  assert.strictEqual(calculateGeodesicDistanceKm(null, airportCCU), null);
  assert.strictEqual(calculateGeodesicDistanceKm(originRise, null), null);
  assert.strictEqual(calculateGeodesicDistanceKm({ latitude: 91, longitude: 88 }, airportCCU), null);
  assert.strictEqual(calculateGeodesicDistanceKm(originRise, { latitude: 22, longitude: 181 }), null);
  console.log('✓ Geodesic distance in km calculated accurately with single decimal precision and boundary safety');

  // ==========================================
  // 3 & 4. VERIFIED PLACES ENTITIES & CATEGORY REGISTRY
  // ==========================================
  logSection('3 & 4. Verified Places Domain Entities & Category Registry');
  const { PLACE_CATEGORY_REGISTRY } = await import('../src/domain/places/entities.ts');

  assert.ok(PLACE_CATEGORY_REGISTRY, 'PLACE_CATEGORY_REGISTRY must exist');
  assert.ok(PLACE_CATEGORY_REGISTRY.METRO, 'Must support METRO category');
  assert.ok(PLACE_CATEGORY_REGISTRY.AIRPORT, 'Must support AIRPORT category');
  assert.ok(PLACE_CATEGORY_REGISTRY.TRANSIT, 'Must support TRANSIT category');
  assert.ok(PLACE_CATEGORY_REGISTRY.EDUCATION, 'Must support EDUCATION category');
  assert.ok(PLACE_CATEGORY_REGISTRY.HEALTHCARE, 'Must support HEALTHCARE category');
  assert.ok(PLACE_CATEGORY_REGISTRY.COMMERCIAL, 'Must support COMMERCIAL category');
  assert.ok(PLACE_CATEGORY_REGISTRY.RETAIL, 'Must support RETAIL category');
  assert.ok(PLACE_CATEGORY_REGISTRY.RECREATION, 'Must support RECREATION category');
  assert.ok(PLACE_CATEGORY_REGISTRY.LANDMARK, 'Must support LANDMARK category');

  // Verify each category has labels and descriptions
  for (const [key, meta] of Object.entries(PLACE_CATEGORY_REGISTRY)) {
    assert.strictEqual(meta.key, key);
    assert.ok(meta.label.length > 0);
    assert.ok(meta.shortLabel.length > 0);
    assert.ok(meta.description.length > 0);
  }
  console.log('✓ Canonical Place Category Registry verified with comprehensive metadata');

  // ==========================================
  // 5 & 6. REPOSITORY ABSTRACTION & MEMORY IMPLEMENTATION
  // ==========================================
  logSection('5 & 6. Repository Abstraction & In-Memory Spatial Implementation');
  const { placeRepository } = await import(
    '../src/infrastructure/repositories/memory/placeRepositoryMemory.ts'
  );

  assert.ok(placeRepository, 'placeRepository singleton must exist');
  assert.strictEqual(typeof placeRepository.findAll, 'function');
  assert.strictEqual(typeof placeRepository.findNearby, 'function');
  assert.strictEqual(typeof placeRepository.findByCategory, 'function');

  const allPlaces = await placeRepository.findAll();
  assert.ok(allPlaces.length >= 10, 'Must contain verified default Kolkata places');

  // Query nearby places around Merlin Rise within 15 km
  const nearbyRise = await placeRepository.findNearby({
    origin: originRise,
    radiusKm: 15,
    limit: 20,
  });

  assert.ok(nearbyRise.length > 0, 'Must find nearby places within 15 km');
  // Check sorting: ascending distance
  for (let i = 0; i < nearbyRise.length - 1; i++) {
    assert.ok(
      nearbyRise[i].distanceKm <= nearbyRise[i + 1].distanceKm,
      `Places must be sorted by distance ascending: ${nearbyRise[i].distanceKm} <= ${nearbyRise[i + 1].distanceKm}`
    );
  }

  // Check radius filtering
  const tightQuery = await placeRepository.findNearby({
    origin: originRise,
    radiusKm: 2.0, // Only Eco Park and immediately adjacent
  });
  for (const p of tightQuery) {
    assert.ok(p.distanceKm <= 2.0, `Place distance ${p.distanceKm} must be <= 2.0 km`);
  }

  // Check category filtering
  const healthcareQuery = await placeRepository.findNearby({
    origin: originRise,
    radiusKm: 15,
    category: 'HEALTHCARE',
  });
  for (const p of healthcareQuery) {
    assert.strictEqual(p.category, 'HEALTHCARE');
  }
  console.log('✓ In-memory place repository verified: radius, category filtering, ascending distance sort');

  // ==========================================
  // 7 & 8. POSTGIS PRODUCTION CONTRACT AUDIT
  // ==========================================
  logSection('7 & 8. PostGIS Spatial Query Production Contract');
  const { PlaceRepositoryPostgres } = await import(
    '../src/infrastructure/repositories/postgres/placeRepositoryPostgres.ts'
  );

  assert.ok(PlaceRepositoryPostgres, 'PlaceRepositoryPostgres must exist');
  const postgisSql = PlaceRepositoryPostgres.getPostGisNearbyQuerySql();
  assert.ok(postgisSql.includes('ST_Distance'), 'Must include PostGIS ST_Distance');
  assert.ok(postgisSql.includes('ST_DWithin'), 'Must include PostGIS ST_DWithin');
  assert.ok(postgisSql.includes('ST_SetSRID'), 'Must include ST_SetSRID 4326');
  assert.ok(postgisSql.includes('::geography'), 'Must cast to PostGIS geography for accurate ellipsoidal metres');
  assert.ok(postgisSql.includes('/ 1000.0'), 'Must divide by 1000.0 to produce kilometres');
  console.log('✓ PostGIS production query contract verified with ST_Distance, ST_DWithin, and geography casting');

  // ==========================================
  // 9. DATABASE SCHEMA INVARIANCE
  // ==========================================
  logSection('9. Database Schema Invariance');
  const schemaFile = fs.readFileSync(path.resolve('./src/db/schema.ts'), 'utf-8');
  const schemaLines = schemaFile.split('\n').length;
  assert.ok(schemaLines >= 179, 'Schema contains core tables and Phase 06.1 persistence additions');
  console.log(`✓ Database schema verified (${schemaLines} lines)`);

  // ==========================================
  // 10 & 11. APPLICATION SERVICE LAYER
  // ==========================================
  logSection('10 & 11. Application Service Layer (NearbyPlaceService)');
  const { nearbyPlaceService } = await import(
    '../src/domain/places/services/nearbyPlaceService.ts'
  );

  assert.ok(nearbyPlaceService, 'nearbyPlaceService singleton must exist');

  // Valid coordinates
  const servicePlaces = await nearbyPlaceService.getNearbyPlaces(originRise, { radiusKm: 15 });
  assert.ok(servicePlaces.length > 0);
  assert.ok(servicePlaces[0].formattedDistance.endsWith(' km'));

  // Missing / invalid coordinates return empty array safely
  const nullCoords = await nearbyPlaceService.getNearbyPlaces(null);
  assert.deepStrictEqual(nullCoords, []);

  const invalidCoords = await nearbyPlaceService.getNearbyPlaces({ latitude: 120, longitude: 88 });
  assert.deepStrictEqual(invalidCoords, []);
  console.log('✓ NearbyPlaceService correctly resolves verified places and safely handles invalid/missing origins');

  // ==========================================
  // 12 & 13. REST API ENDPOINTS
  // ==========================================
  logSection('12 & 13. REST API Endpoints (/api/places/nearby & /api/projects/slug/[slug]/nearby)');

  // 12.1 Places Nearby API
  const apiPlacesRes = await fetchRoute('/api/places/nearby?lat=22.5958&lng=88.4632&radius=15');
  assert.strictEqual(apiPlacesRes.status, 200, '/api/places/nearby must return 200');
  const apiPlacesData = JSON.parse(apiPlacesRes.body);
  assert.strictEqual(apiPlacesData.success, true);
  assert.ok(apiPlacesData.count > 0);
  assert.ok(Array.isArray(apiPlacesData.data));
  assert.ok(apiPlacesData.data[0].distanceKm !== undefined);
  assert.ok(apiPlacesData.data[0].formattedDistance.endsWith(' km'));

  // 12.2 Bad coordinates return 400
  const badCoordsRes = await fetchRoute('/api/places/nearby?lat=95&lng=88.4632');
  assert.strictEqual(badCoordsRes.status, 400, 'Invalid latitude must return 400');

  const missingCoordsRes = await fetchRoute('/api/places/nearby');
  assert.strictEqual(missingCoordsRes.status, 400, 'Missing coordinates must return 400');

  // 12.3 Project Nearby API for Merlin Rise
  const projectNearbyRes = await fetchRoute('/api/projects/slug/merlin-rise/nearby');
  assert.strictEqual(projectNearbyRes.status, 200, '/api/projects/slug/merlin-rise/nearby must return 200');
  const projectNearbyData = JSON.parse(projectNearbyRes.body);
  assert.strictEqual(projectNearbyData.success, true);

  // 12.4 Draft project protection
  const draftProjectNearbyRes = await fetchRoute('/api/projects/slug/merlin-secret-villa/nearby');
  assert.strictEqual(draftProjectNearbyRes.status, 404, 'Draft project nearby route must return 404');
  console.log('✓ REST API endpoints verified for places, projects, coordinate validation, and draft protection');

  // ==========================================
  // 14 & 15. FRONTEND INTEGRATION & NO TRAVEL TIME ESTIMATES
  // ==========================================
  logSection('14 & 15. Frontend Integration & Zero Travel-Time Estimates');

  const nearbyComponentFile = fs.readFileSync(
    path.resolve('./src/components/projects/ProjectNearbyPlaces.tsx'),
    'utf-8'
  );
  assert.ok(nearbyComponentFile.includes('Nearby Places'), 'Component includes Nearby Places header');
  assert.ok(nearbyComponentFile.includes('Geodesic'), 'Component documents geodesic straight-line distance');
  assert.ok(!nearbyComponentFile.includes('mins drive'), 'Zero fabricated driving time estimates');
  assert.ok(!nearbyComponentFile.includes('mins away'), 'Zero fabricated travel minutes');
  assert.ok(!nearbyComponentFile.includes('min walk'), 'Zero fabricated walking estimates');

  const sectionFile = fs.readFileSync(
    path.resolve('./src/components/projects/ProjectLocationSection.tsx'),
    'utf-8'
  );
  assert.ok(sectionFile.includes('ProjectNearbyPlaces'), 'ProjectLocationSection renders ProjectNearbyPlaces');
  assert.ok(!sectionFile.includes('resaleListing'), 'Zero resale listing leakage');
  assert.ok(!sectionFile.includes('rentalListing'), 'Zero rental listing leakage');

  // Check live page HTML
  const risePage = await fetchRoute('/projects/merlin-rise');
  assert.strictEqual(risePage.status, 200);
  assert.ok(risePage.body.includes('id="location"'), 'Location section rendered');
  assert.ok(
    risePage.body.includes('Location &amp; Connectivity') || risePage.body.includes('Location & Connectivity'),
    'Locked heading Location & Connectivity rendered'
  );
  assert.ok(!risePage.body.includes('Micro-Market'), 'Zero Micro-Market in page');
  console.log('✓ Frontend integration verified: factual distance in km, zero fabricated travel times, zero listing leaks');

  // ==========================================
  // 16. DESKTOP ADVISORY & MOBILE STICKY CTA PRESERVATION
  // ==========================================
  logSection('16. Desktop Advisory & Mobile Sticky CTA Invariance');
  const pageFile = fs.readFileSync(path.resolve('./app/projects/[slug]/page.tsx'), 'utf-8');
  assert.ok(pageFile.includes('GreatHomesAdvisoryCard'), 'Desktop GreatHomesAdvisoryCard preserved');
  assert.ok(pageFile.includes('MobileStickyCta'), 'MobileStickyCta preserved');
  console.log('✓ Desktop advisory and mobile sticky CTA verified completely intact');

  console.log('\n==================================================');
  console.log('  ALL PHASE 05F.7.D TESTS PASSED (16 / 16)');
  console.log('==================================================\n');
}

runTests().catch(err => {
  console.error('\n❌ Test failed:', err);
  process.exit(1);
});
