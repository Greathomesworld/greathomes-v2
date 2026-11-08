import assert from 'node:assert/strict';
import http from 'node:http';

function logSection(title) {
  console.log(`\n==================================================`);
  console.log(`  ${title}`);
  console.log(`==================================================`);
}

async function fetchRoute(urlPath, headers = {}) {
  return new Promise((resolve, reject) => {
    http
      .get(`http://localhost:3000${urlPath}`, { headers }, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () =>
          resolve({ status: res.statusCode, headers: res.headers, body: data })
        );
      })
      .on('error', reject);
  });
}

async function runPhase1Tests() {
  console.log('Starting Great Homes V2 — Phase 1: Coordinate Integrity & Location Foundation Tests\n');

  const {
    isValidCoordinate,
    validateCoordinatePair,
    resolveProjectCoordinates,
    buildProjectLocationViewModel,
  } = await import('../src/domain/projects/viewModels/projectLocationViewModel.ts');

  const {
    calculateGeodesicDistanceKm,
    formatDistanceKm,
  } = await import('../src/domain/places/spatial/distance.ts');

  const {
    projectIntelligenceService,
    ValidationError,
  } = await import('../src/domain/projects/services/projectIntelligenceService.ts');

  const { ensureSeedData } = await import('../src/infrastructure/seed.ts');
  await ensureSeedData();

  // =========================================================================
  // 1. Project with valid project coordinates resolves as VERIFIED_PROJECT_LOCATION
  // =========================================================================
  logSection('1. Valid project coordinates resolve as VERIFIED_PROJECT_LOCATION');
  const verifiedResolved = resolveProjectCoordinates(
    { latitude: 22.620356, longitude: 88.503071 },
    { latitude: 22.61, longitude: 88.45 }
  );
  assert.strictEqual(verifiedResolved.locationStatus, 'VERIFIED_PROJECT_LOCATION');
  assert.strictEqual(verifiedResolved.source, 'PROJECT');
  assert.strictEqual(verifiedResolved.isProjectOverride, true);
  assert.strictEqual(verifiedResolved.hasValidCoordinates, true);
  assert.strictEqual(verifiedResolved.hasVerifiedProjectCoordinates, true);
  assert.strictEqual(verifiedResolved.isApproximateLocation, false);
  assert.strictEqual(verifiedResolved.canComputeExactProjectDistance, true);
  assert.strictEqual(verifiedResolved.latitude, 22.620356);
  assert.strictEqual(verifiedResolved.longitude, 88.503071);

  const verifiedVm = buildProjectLocationViewModel(
    {
      id: 'loc-rajarhat',
      name: 'Rajarhat',
      slug: 'rajarhat',
      type: 'AREA',
      latitude: 22.61,
      longitude: 88.45,
    },
    null,
    {
      projectLatitude: 22.620356,
      projectLongitude: 88.503071,
      latitude: 22.620356,
      longitude: 88.503071,
    }
  );
  assert.strictEqual(verifiedVm.locationStatus, 'VERIFIED_PROJECT_LOCATION');
  assert.strictEqual(verifiedVm.coordinateSource, 'PROJECT');
  assert.strictEqual(verifiedVm.hasVerifiedProjectCoordinates, true);
  assert.strictEqual(verifiedVm.isApproximateLocation, false);
  console.log('✓ Test 1 Passed: Project with valid project coordinates resolves as VERIFIED_PROJECT_LOCATION');

  // =========================================================================
  // 2. Project with null project coordinates and valid locality coordinates resolves as APPROXIMATE_LOCATION
  // =========================================================================
  logSection('2. Null project coordinates + valid locality coordinates resolve as APPROXIMATE_LOCATION');
  const approxResolved = resolveProjectCoordinates(
    { latitude: null, longitude: null },
    { latitude: 22.58, longitude: 88.47 }
  );
  assert.strictEqual(approxResolved.locationStatus, 'APPROXIMATE_LOCATION');
  assert.strictEqual(approxResolved.source, 'LOCATION');
  assert.strictEqual(approxResolved.isProjectOverride, false);
  assert.strictEqual(approxResolved.hasValidCoordinates, true);
  assert.strictEqual(approxResolved.hasVerifiedProjectCoordinates, false);
  assert.strictEqual(approxResolved.isApproximateLocation, true);
  assert.strictEqual(approxResolved.canComputeExactProjectDistance, false);
  assert.strictEqual(approxResolved.latitude, 22.58);
  assert.strictEqual(approxResolved.longitude, 88.47);

  const approxVm = buildProjectLocationViewModel(
    {
      id: 'loc-new-town',
      name: 'New Town',
      slug: 'new-town',
      type: 'AREA',
      latitude: 22.58,
      longitude: 88.47,
    },
    null,
    {
      projectLatitude: null,
      projectLongitude: null,
      latitude: 22.58,
      longitude: 88.47,
    }
  );
  assert.strictEqual(approxVm.locationStatus, 'APPROXIMATE_LOCATION');
  assert.strictEqual(approxVm.coordinateSource, 'LOCATION');
  assert.strictEqual(approxVm.hasVerifiedProjectCoordinates, false);
  assert.strictEqual(approxVm.isApproximateLocation, true);
  assert.strictEqual(approxVm.canComputeExactProjectDistance, false);
  console.log('✓ Test 2 Passed: Null project coordinates + valid locality coordinates resolve as APPROXIMATE_LOCATION');

  // =========================================================================
  // 3. Project with null project coordinates and null locality coordinates resolves as LOCATION_UNAVAILABLE
  // =========================================================================
  logSection('3. Null project coordinates + null locality coordinates resolve as LOCATION_UNAVAILABLE');
  const unavailResolved = resolveProjectCoordinates(
    { latitude: null, longitude: null },
    { latitude: null, longitude: null }
  );
  assert.strictEqual(unavailResolved.locationStatus, 'LOCATION_UNAVAILABLE');
  assert.strictEqual(unavailResolved.source, 'NONE');
  assert.strictEqual(unavailResolved.isProjectOverride, false);
  assert.strictEqual(unavailResolved.hasValidCoordinates, false);
  assert.strictEqual(unavailResolved.hasVerifiedProjectCoordinates, false);
  assert.strictEqual(unavailResolved.isApproximateLocation, false);
  assert.strictEqual(unavailResolved.canComputeExactProjectDistance, false);
  assert.strictEqual(unavailResolved.latitude, null);
  assert.strictEqual(unavailResolved.longitude, null);

  const unavailVm = buildProjectLocationViewModel(
    {
      id: 'loc-unavail',
      name: 'Unmapped Area',
      slug: 'unmapped-area',
      type: 'AREA',
      latitude: null,
      longitude: null,
    },
    null,
    {
      projectLatitude: null,
      projectLongitude: null,
      latitude: null,
      longitude: null,
    }
  );
  assert.strictEqual(unavailVm.locationStatus, 'LOCATION_UNAVAILABLE');
  assert.strictEqual(unavailVm.coordinateSource, 'NONE');
  assert.strictEqual(unavailVm.hasValidCoordinates, false);
  assert.strictEqual(unavailVm.hasVerifiedProjectCoordinates, false);
  console.log('✓ Test 3 Passed: Null project + null locality coordinates resolve as LOCATION_UNAVAILABLE');

  // =========================================================================
  // 4. Project with only latitude or only longitude is rejected by validation
  // =========================================================================
  logSection('4. Partial coordinate pairs (only latitude or only longitude) rejected');
  const partialLatOnly = validateCoordinatePair(22.620356, null);
  assert.strictEqual(partialLatOnly.valid, false);
  assert.strictEqual(partialLatOnly.isPartial, true);
  assert.ok(partialLatOnly.error?.includes('Both project latitude and longitude must be provided together'));

  const partialLngOnly = validateCoordinatePair(undefined, 88.503071);
  assert.strictEqual(partialLngOnly.valid, false);
  assert.strictEqual(partialLngOnly.isPartial, true);

  // Never mixes project latitude with location longitude
  const mixedAttempt = resolveProjectCoordinates(
    { latitude: 22.620356, longitude: null },
    { latitude: 22.58, longitude: 88.47 }
  );
  assert.strictEqual(mixedAttempt.hasPartialProjectCoordinates, true);
  assert.strictEqual(mixedAttempt.source, 'LOCATION');
  assert.strictEqual(mixedAttempt.locationStatus, 'APPROXIMATE_LOCATION');
  assert.strictEqual(mixedAttempt.latitude, 22.58, 'Must NOT mix project latitude with locality longitude');
  assert.strictEqual(mixedAttempt.longitude, 88.47);

  // Service-level validation rejects partial coordinates
  const riseDto = await projectIntelligenceService.getProjectBySlug('merlin-rise');
  assert.ok(riseDto, 'merlin-rise must exist');
  await assert.rejects(
    async () => {
      await projectIntelligenceService.updateProject(riseDto.id, {
        latitude: 22.62,
        longitude: null,
      });
    },
    (err) => err instanceof ValidationError && err.message.includes('Both project latitude and longitude')
  );
  console.log('✓ Test 4 Passed: Partial coordinate pairs rejected at both validator and service levels');

  // =========================================================================
  // 5. Project with out-of-range coordinates is rejected by validation
  // =========================================================================
  logSection('5. Out-of-range coordinates rejected by validation');
  assert.strictEqual(isValidCoordinate(-90.001, 88.5), false);
  assert.strictEqual(isValidCoordinate(90.001, 88.5), false);
  assert.strictEqual(isValidCoordinate(22.6, -180.001), false);
  assert.strictEqual(isValidCoordinate(22.6, 180.001), false);
  assert.strictEqual(isValidCoordinate(NaN, 88.5), false);
  assert.strictEqual(isValidCoordinate(22.6, Infinity), false);

  assert.strictEqual(validateCoordinatePair(95, 88.5).valid, false);
  assert.strictEqual(validateCoordinatePair(-95, 88.5).valid, false);
  assert.strictEqual(validateCoordinatePair(22.6, 195).valid, false);
  assert.strictEqual(validateCoordinatePair(22.6, -195).valid, false);

  await assert.rejects(
    async () => {
      await projectIntelligenceService.updateProject(riseDto.id, {
        latitude: 95.5,
        longitude: 88.5,
      });
    },
    (err) => err instanceof ValidationError && err.message.includes('between -90 and 90')
  );

  await assert.rejects(
    async () => {
      await projectIntelligenceService.updateProject(riseDto.id, {
        latitude: 22.6,
        longitude: 185.0,
      });
    },
    (err) => err instanceof ValidationError && err.message.includes('between -180 and 180')
  );
  console.log('✓ Test 5 Passed: Out-of-range latitude and longitude rejected');

  // =========================================================================
  // 6. Project with (0, 0) coordinates is rejected by validation
  // =========================================================================
  logSection('6. (0, 0) Null Island coordinates rejected by validation');
  assert.strictEqual(isValidCoordinate(0, 0), false);
  const zeroPair = validateCoordinatePair(0, 0);
  assert.strictEqual(zeroPair.valid, false);
  assert.ok(zeroPair.error?.includes('Null Island'));

  const zeroResolved = resolveProjectCoordinates(
    { latitude: 0, longitude: 0 },
    { latitude: 0, longitude: 0 }
  );
  assert.strictEqual(zeroResolved.locationStatus, 'LOCATION_UNAVAILABLE');
  assert.strictEqual(zeroResolved.hasValidCoordinates, false);

  await assert.rejects(
    async () => {
      await projectIntelligenceService.updateProject(riseDto.id, {
        latitude: 0,
        longitude: 0,
      });
    },
    (err) => err instanceof ValidationError && err.message.includes('Null Island')
  );
  console.log('✓ Test 6 Passed: (0, 0) Null Island coordinates rejected');

  // =========================================================================
  // 7. Nearby-places API/service uses project coordinates when verified project coordinates exist
  // =========================================================================
  logSection('7. Nearby-places API uses project pinpoint coordinates when VERIFIED_PROJECT_LOCATION');
  const riseNearbyRes = await fetchRoute('/api/projects/slug/merlin-rise/nearby');
  assert.strictEqual(riseNearbyRes.status, 200);
  const riseNearbyJson = JSON.parse(riseNearbyRes.body);
  assert.strictEqual(riseNearbyJson.success, true);
  assert.strictEqual(riseNearbyJson.hasCoordinates, true);
  assert.strictEqual(riseNearbyJson.hasVerifiedProjectCoordinates, true);
  assert.strictEqual(riseNearbyJson.locationStatus, 'VERIFIED_PROJECT_LOCATION');
  assert.strictEqual(riseNearbyJson.coordinateSource, 'PROJECT');
  assert.strictEqual(riseNearbyJson.projectLocation.latitude, riseDto.projectLatitude);
  assert.strictEqual(riseNearbyJson.projectLocation.longitude, riseDto.projectLongitude);
  assert.ok(riseNearbyJson.count > 0, 'Merlin Rise must return verified nearby places from project pinpoint');
  console.log(
    `✓ Test 7 Passed: /api/projects/slug/merlin-rise/nearby uses project pinpoint (${riseNearbyJson.projectLocation.latitude}, ${riseNearbyJson.projectLocation.longitude}) and returned ${riseNearbyJson.count} places`
  );

  // =========================================================================
  // 8. Nearby-places API/service does NOT silently claim verified project-specific distances when only locality coordinates exist
  // =========================================================================
  logSection('8. Nearby-places API/UI does not claim exact project distances when APPROXIMATE_LOCATION');
  const allPublishedProjects = await projectIntelligenceService.listAllProjects();
  const approxProjectDto = allPublishedProjects.find(
    (p) => p.projectLatitude === null && p.projectLongitude === null && p.locationStatus === 'APPROXIMATE_LOCATION'
  );
  assert.ok(approxProjectDto, 'At least one published project with APPROXIMATE_LOCATION must exist');
  assert.strictEqual(approxProjectDto.projectLatitude, null);
  assert.strictEqual(approxProjectDto.projectLongitude, null);
  assert.strictEqual(approxProjectDto.coordinatesSource, 'LOCATION');
  assert.strictEqual(approxProjectDto.locationStatus, 'APPROXIMATE_LOCATION');
  assert.strictEqual(approxProjectDto.hasVerifiedProjectCoordinates, false);
  assert.strictEqual(approxProjectDto.isApproximateLocation, true);

  const approxNearbyRes = await fetchRoute(`/api/projects/slug/${approxProjectDto.slug}/nearby`);
  assert.strictEqual(approxNearbyRes.status, 200);
  const approxNearbyJson = JSON.parse(approxNearbyRes.body);
  assert.strictEqual(approxNearbyJson.success, true);
  assert.strictEqual(approxNearbyJson.hasCoordinates, false);
  assert.strictEqual(approxNearbyJson.hasVerifiedProjectCoordinates, false);
  assert.strictEqual(approxNearbyJson.isApproximateLocation, true);
  assert.strictEqual(approxNearbyJson.locationStatus, 'APPROXIMATE_LOCATION');
  assert.strictEqual(approxNearbyJson.coordinateSource, 'LOCATION');
  assert.strictEqual(approxNearbyJson.count, 0);
  assert.deepStrictEqual(approxNearbyJson.data, []);
  assert.ok(approxNearbyJson.message.includes('approximate locality coordinates'));

  // Verify HTML rendering on /projects/[slug] does not claim "Verified Project Pinpoint" or "from {name} pinpoint coordinates"
  const approxPage = await fetchRoute(`/projects/${approxProjectDto.slug}`);
  assert.strictEqual(approxPage.status, 200);
  assert.ok(
    approxPage.body.includes('Approximate Locality Map') ||
      approxPage.body.includes('Approximate Locality Coordinates Only'),
    'Page with locality fallback must explicitly indicate approximate locality status'
  );
  assert.ok(
    !approxPage.body.includes(`from ${approxProjectDto.name} pinpoint coordinates`),
    'Page with locality fallback must NOT claim distances from project pinpoint coordinates'
  );
  console.log(
    `✓ Test 8 Passed: Project "${approxProjectDto.name}" (${approxProjectDto.slug}) with approximate locality coordinates (${approxProjectDto.location.name}) never fabricates exact project-site distances`
  );

  // =========================================================================
  // 9. Nearby-places API/service handles unavailable coordinates cleanly
  // =========================================================================
  logSection('9. Nearby-places service & viewModel handle LOCATION_UNAVAILABLE cleanly');
  const { nearbyPlaceService } = await import('../src/domain/places/services/nearbyPlaceService.ts');
  const unavailPlaces = await nearbyPlaceService.getNearbyPlaces(null);
  assert.deepStrictEqual(unavailPlaces, []);
  const invalidOriginPlaces = await nearbyPlaceService.getNearbyPlaces({ latitude: 0, longitude: 0 });
  assert.deepStrictEqual(invalidOriginPlaces, []);
  console.log('✓ Test 9 Passed: Unavailable coordinates return empty nearby places cleanly');

  // =========================================================================
  // 10. Existing geodesic distance helper still calculates expected values for valid coordinate pairs
  // =========================================================================
  logSection('10. Geodesic distance helper (calculateGeodesicDistanceKm) regression check');
  const originPin = { latitude: 22.620356, longitude: 88.503071 }; // Merlin Rise verified pin
  const airportPin = { latitude: 22.6547, longitude: 88.4467 }; // CCU Airport
  const distKm = calculateGeodesicDistanceKm(originPin, airportPin);
  assert.ok(distKm !== null && Number.isFinite(distKm));
  assert.ok(distKm >= 6.5 && distKm <= 7.5, `Expected ~6.9 km, got ${distKm}`);
  assert.strictEqual(formatDistanceKm(distKm), `${distKm.toFixed(1)} km`);
  assert.strictEqual(calculateGeodesicDistanceKm(originPin, originPin), 0);
  assert.strictEqual(calculateGeodesicDistanceKm(null, airportPin), null);
  console.log(`✓ Test 10 Passed: calculateGeodesicDistanceKm(Merlin Rise, CCU Airport) = ${formatDistanceKm(distKm)}`);

  console.log('\n==================================================');
  console.log('  ALL PHASE 1 COORDINATE INTEGRITY TESTS PASSED (10 / 10)');
  console.log('==================================================\n');
}

runPhase1Tests().catch((err) => {
  console.error('\n❌ Phase 1 test failed:', err);
  process.exit(1);
});
