import assert from 'node:assert/strict';

function logSection(title) {
  console.log(`\n==================================================`);
  console.log(`  ${title}`);
  console.log(`==================================================`);
}

async function runPhase2Tests() {
  console.log(
    'Starting Great Homes V2 — Phase 2: Road-Routing Provider Evaluation & Architecture Tests\n'
  );

  const {
    PROVIDER_CACHE_POLICIES,
  } = await import('../src/domain/places/routing/types.ts');

  const {
    RoadRoutingService,
    evaluateProjectRouteEligibility,
    buildRouteCacheKey,
    resolveEffectiveCacheTtlSeconds,
    validateProviderRouteMetrics,
    formatDrivingDuration,
  } = await import('../src/domain/places/routing/roadRoutingService.ts');

  const {
    validateAndGetConfig,
    resetConfigCacheForTesting,
  } = await import('../src/lib/config.ts');

  const verifiedProjectOrigin = {
    projectId: 'proj-merlin-rise',
    projectSlug: 'merlin-rise',
    projectName: 'Merlin Rise',
    projectLatitude: 22.625274,
    projectLongitude: 88.51089,
    latitude: 22.625274,
    longitude: 88.51089,
    location: {
      id: 'loc-rajarhat',
      name: 'Rajarhat',
      slug: 'rajarhat',
      latitude: 22.5958,
      longitude: 88.4632,
    },
  };

  const approximateProjectOrigin = {
    projectId: 'proj-approx-1',
    projectSlug: 'merlin-the-fourth',
    projectName: 'Merlin The Fourth',
    projectLatitude: null,
    projectLongitude: null,
    latitude: 22.58,
    longitude: 88.47,
    location: {
      id: 'loc-new-town',
      name: 'New Town',
      slug: 'new-town',
      latitude: 22.58,
      longitude: 88.47,
    },
  };

  const unavailableProjectOrigin = {
    projectId: 'proj-unavail-1',
    projectSlug: 'unmapped-project',
    projectName: 'Unmapped Project',
    projectLatitude: null,
    projectLongitude: null,
    latitude: null,
    longitude: null,
    location: {
      id: 'loc-unmapped',
      name: 'Unmapped Area',
      slug: 'unmapped-area',
      latitude: null,
      longitude: null,
    },
  };

  const airportDestination = {
    destinationId: 'poi-ccu-airport',
    name: 'Netaji Subhas Chandra Bose International Airport',
    latitude: 22.6547,
    longitude: 88.4467,
  };

  // =========================================================================
  // 1. Verified coordinates can request exact road routes
  // =========================================================================
  logSection('1. Verified coordinates can request exact road routes');
  let adapterCallCount = 0;
  const mockOrsAdapter = {
    providerId: 'OPENROUTESERVICE',
    isConfigured: () => true,
    computeDrivingRoute: async () => {
      adapterCallCount += 1;
      return {
        status: 'OK',
        distanceMeters: 9420, // 9.4 km road route vs ~6.9 km geodesic
        durationSeconds: 1140, // 19 mins
      };
    },
  };

  const routingService = new RoadRoutingService({
    adapter: mockOrsAdapter,
    requestedCacheTtlSeconds: 3600,
  });

  const verifiedRoute = await routingService.getProjectRoadRoute(
    verifiedProjectOrigin,
    airportDestination
  );

  assert.strictEqual(adapterCallCount, 1, 'Adapter must be called once for verified origin');
  assert.strictEqual(verifiedRoute.isRoadRouteAvailable, true);
  assert.strictEqual(verifiedRoute.routeStatus, 'ROUTE_AVAILABLE');
  assert.strictEqual(verifiedRoute.distanceMetric, 'ROAD_ROUTE');
  assert.strictEqual(verifiedRoute.provider, 'OPENROUTESERVICE');
  assert.strictEqual(verifiedRoute.routeDistanceKm, 9.4);
  assert.strictEqual(verifiedRoute.formattedRouteDistance, '9.4 km');
  assert.strictEqual(verifiedRoute.estimatedDurationMinutes, 19);
  assert.strictEqual(verifiedRoute.estimatedDurationSeconds, 1140);
  assert.strictEqual(verifiedRoute.formattedDuration, '19 mins');
  assert.strictEqual(verifiedRoute.originLocationStatus, 'VERIFIED_PROJECT_LOCATION');
  assert.strictEqual(verifiedRoute.originCoordinateSource, 'PROJECT');
  assert.ok(verifiedRoute.calculatedAt !== null);
  assert.strictEqual(verifiedRoute.cache.status, 'MISS');
  assert.ok(verifiedRoute.attribution?.includes('OpenStreetMap'));
  console.log('✓ Test 1 Passed: Verified project coordinates successfully compute exact road route (9.4 km, 19 mins)');

  // =========================================================================
  // 2. Approximate coordinates cannot request exact project-specific routes
  // =========================================================================
  logSection('2. Approximate coordinates cannot request exact project-specific routes');
  const approxEligibility = evaluateProjectRouteEligibility(
    approximateProjectOrigin,
    airportDestination
  );
  assert.strictEqual(approxEligibility.eligible, false);
  assert.strictEqual(approxEligibility.locationStatus, 'APPROXIMATE_LOCATION');
  assert.strictEqual(approxEligibility.coordinateSource, 'LOCATION');
  assert.strictEqual(approxEligibility.rejectionStatus, 'ORIGIN_APPROXIMATE_NOT_ELIGIBLE');
  assert.ok(approxEligibility.disclosureMessage?.includes('approximate locality coordinates'));

  const beforeApproxCalls = adapterCallCount;
  const approxRoute = await routingService.getProjectRoadRoute(
    approximateProjectOrigin,
    airportDestination
  );
  assert.strictEqual(
    adapterCallCount,
    beforeApproxCalls,
    'Adapter must NEVER be called for APPROXIMATE_LOCATION origin'
  );
  assert.strictEqual(approxRoute.isRoadRouteAvailable, false);
  assert.strictEqual(approxRoute.routeStatus, 'ORIGIN_APPROXIMATE_NOT_ELIGIBLE');
  assert.strictEqual(approxRoute.distanceMetric, 'UNAVAILABLE');
  assert.strictEqual(approxRoute.routeDistanceKm, null);
  assert.strictEqual(approxRoute.formattedRouteDistance, null);
  assert.strictEqual(approxRoute.estimatedDurationMinutes, null);
  assert.strictEqual(approxRoute.originLocationStatus, 'APPROXIMATE_LOCATION');
  assert.strictEqual(approxRoute.originCoordinateSource, 'LOCATION');
  assert.ok(approxRoute.disclosureMessage?.includes('New Town'));
  console.log('✓ Test 2 Passed: Approximate locality coordinates blocked from exact road routing with explicit disclosure');

  // =========================================================================
  // 3. Missing coordinates return an unavailable result
  // =========================================================================
  logSection('3. Missing origin or destination coordinates return unavailable result');
  const unavailOriginRoute = await routingService.getProjectRoadRoute(
    unavailableProjectOrigin,
    airportDestination
  );
  assert.strictEqual(unavailOriginRoute.isRoadRouteAvailable, false);
  assert.strictEqual(unavailOriginRoute.routeStatus, 'ORIGIN_UNAVAILABLE');
  assert.strictEqual(unavailOriginRoute.distanceMetric, 'UNAVAILABLE');
  assert.strictEqual(unavailOriginRoute.routeDistanceKm, null);
  assert.strictEqual(unavailOriginRoute.originLocationStatus, 'LOCATION_UNAVAILABLE');

  const unavailDestRoute = await routingService.getProjectRoadRoute(verifiedProjectOrigin, {
    destinationId: 'poi-bad',
    name: 'Invalid POI',
    latitude: null,
    longitude: 88.45,
  });
  assert.strictEqual(unavailDestRoute.isRoadRouteAvailable, false);
  assert.strictEqual(unavailDestRoute.routeStatus, 'DESTINATION_UNAVAILABLE');
  assert.strictEqual(unavailDestRoute.routeDistanceKm, null);
  console.log('✓ Test 3 Passed: Missing origin/destination coordinates return ORIGIN_UNAVAILABLE / DESTINATION_UNAVAILABLE');

  // =========================================================================
  // 4. Road distance and straight-line distance remain strictly distinct
  // =========================================================================
  logSection('4. Road distance and straight-line geodesic distance remain strictly distinct');
  assert.strictEqual(verifiedRoute.routeDistanceKm, 9.4);
  assert.strictEqual(verifiedRoute.geodesicDistanceKm, 7.4);
  assert.notStrictEqual(
    verifiedRoute.routeDistanceKm,
    verifiedRoute.geodesicDistanceKm,
    'Road distance and geodesic distance are stored in separate fields'
  );
  assert.strictEqual(verifiedRoute.formattedRouteDistance, '9.4 km');
  assert.strictEqual(verifiedRoute.formattedGeodesicDistance, '7.4 km (straight-line)');

  // When no provider is configured, geodesic distance is available as fallback metadata,
  // but routeDistanceKm MUST remain null and distanceMetric MUST be GEODESIC_STRAIGHT_LINE (never ROAD_ROUTE)
  const unconfiguredService = new RoadRoutingService();
  const unconfiguredResult = await unconfiguredService.getProjectRoadRoute(
    verifiedProjectOrigin,
    airportDestination
  );
  assert.strictEqual(unconfiguredResult.isRoadRouteAvailable, false);
  assert.strictEqual(unconfiguredResult.routeStatus, 'PROVIDER_UNCONFIGURED');
  assert.strictEqual(unconfiguredResult.distanceMetric, 'GEODESIC_STRAIGHT_LINE');
  assert.strictEqual(unconfiguredResult.routeDistanceKm, null);
  assert.strictEqual(unconfiguredResult.formattedRouteDistance, null);
  assert.strictEqual(unconfiguredResult.estimatedDurationMinutes, null);
  assert.strictEqual(unconfiguredResult.geodesicDistanceKm, 7.4);
  console.log('✓ Test 4 Passed: Road distance and straight-line geodesic distance are never conflated');

  // =========================================================================
  // 5. Provider errors, timeouts, and unroutable points do not fabricate distances
  // =========================================================================
  logSection('5. Provider errors, timeouts, and unroutable points never fabricate road distances');
  const errorService = new RoadRoutingService({
    adapter: {
      providerId: 'OPENROUTESERVICE',
      isConfigured: () => true,
      computeDrivingRoute: async () => {
        throw new Error('Upstream HTTP 503 Service Unavailable');
      },
    },
  });
  const errResult = await errorService.getProjectRoadRoute(
    verifiedProjectOrigin,
    airportDestination
  );
  assert.strictEqual(errResult.isRoadRouteAvailable, false);
  assert.strictEqual(errResult.routeStatus, 'PROVIDER_ERROR');
  assert.strictEqual(errResult.distanceMetric, 'GEODESIC_STRAIGHT_LINE');
  assert.strictEqual(errResult.routeDistanceKm, null);
  assert.strictEqual(errResult.estimatedDurationMinutes, null);

  const timeoutService = new RoadRoutingService({
    adapter: {
      providerId: 'OSRM',
      isConfigured: () => true,
      computeDrivingRoute: async () => ({ status: 'TIMEOUT' }),
    },
  });
  const timeoutResult = await timeoutService.getProjectRoadRoute(
    verifiedProjectOrigin,
    airportDestination
  );
  assert.strictEqual(timeoutResult.isRoadRouteAvailable, false);
  assert.strictEqual(timeoutResult.routeStatus, 'PROVIDER_TIMEOUT');
  assert.strictEqual(timeoutResult.routeDistanceKm, null);

  const unroutableService = new RoadRoutingService({
    adapter: {
      providerId: 'OSRM',
      isConfigured: () => true,
      computeDrivingRoute: async () => ({ status: 'UNROUTABLE' }),
    },
  });
  const unroutableResult = await unroutableService.getProjectRoadRoute(
    verifiedProjectOrigin,
    airportDestination
  );
  assert.strictEqual(unroutableResult.isRoadRouteAvailable, false);
  assert.strictEqual(unroutableResult.routeStatus, 'UNROUTABLE');
  assert.strictEqual(unroutableResult.routeDistanceKm, null);
  console.log('✓ Test 5 Passed: Provider errors, timeouts, and unroutable responses never fabricate road distances');

  // =========================================================================
  // 6. Invalid provider responses are handled safely
  // =========================================================================
  logSection('6. Invalid provider responses (NaN, negative, or < geodesic distance) are rejected');
  // Physically impossible: road distance 2.0 km when straight-line geodesic distance is 7.3 km
  const impossibleValidation = validateProviderRouteMetrics(
    { status: 'OK', distanceMeters: 2000, durationSeconds: 300 },
    { latitude: 22.625274, longitude: 88.51089 },
    { latitude: 22.6547, longitude: 88.4467 }
  );
  assert.strictEqual(
    impossibleValidation.valid,
    false,
    'Road distance shorter than geodesic distance must be rejected'
  );

  // Negative or NaN metrics rejected
  assert.strictEqual(
    validateProviderRouteMetrics(
      { status: 'OK', distanceMeters: -500, durationSeconds: 300 },
      { latitude: 22.625274, longitude: 88.51089 },
      { latitude: 22.6547, longitude: 88.4467 }
    ).valid,
    false
  );
  assert.strictEqual(
    validateProviderRouteMetrics(
      { status: 'OK', distanceMeters: NaN, durationSeconds: 300 },
      { latitude: 22.625274, longitude: 88.51089 },
      { latitude: 22.6547, longitude: 88.4467 }
    ).valid,
    false
  );

  const malformedService = new RoadRoutingService({
    adapter: {
      providerId: 'OPENROUTESERVICE',
      isConfigured: () => true,
      computeDrivingRoute: async () => ({
        status: 'OK',
        distanceMeters: 1500, // Impossible: 1.5 km road vs 7.3 km straight-line
        durationSeconds: 180,
      }),
    },
  });
  const malformedResult = await malformedService.getProjectRoadRoute(
    verifiedProjectOrigin,
    airportDestination
  );
  assert.strictEqual(malformedResult.isRoadRouteAvailable, false);
  assert.strictEqual(malformedResult.routeStatus, 'INVALID_PROVIDER_RESPONSE');
  assert.strictEqual(malformedResult.routeDistanceKm, null);
  assert.strictEqual(malformedResult.estimatedDurationMinutes, null);
  console.log('✓ Test 6 Passed: Malformed and physically impossible provider responses rejected safely');

  // =========================================================================
  // 7. Cache behaviour follows provider restrictions, coordinate invalidation, and deduplication
  // =========================================================================
  logSection('7. Provider cache restrictions, coordinate-change invalidation, and request deduplication');
  // 7a. Provider TTL bounds
  const googleTtl = resolveEffectiveCacheTtlSeconds('GOOGLE_ROUTES', 30 * 24 * 3600);
  assert.strictEqual(
    googleTtl,
    PROVIDER_CACHE_POLICIES.GOOGLE_ROUTES.maxPermittedTtlSeconds,
    'Google Routes cache TTL must be strictly clamped to maxPermittedTtlSeconds (3600s)'
  );
  assert.strictEqual(
    PROVIDER_CACHE_POLICIES.GOOGLE_ROUTES.allowPersistentStorage,
    false,
    'Google Routes policy must prohibit persistent bulk caching per ToS'
  );

  const orsTtl = resolveEffectiveCacheTtlSeconds('OPENROUTESERVICE', 7 * 24 * 3600);
  assert.strictEqual(orsTtl, 7 * 24 * 3600);

  // 7b. Cache HIT on repeated request (no second upstream call)
  const cachedRepeat = await routingService.getProjectRoadRoute(
    verifiedProjectOrigin,
    airportDestination
  );
  assert.strictEqual(cachedRepeat.cache.status, 'HIT');
  assert.strictEqual(cachedRepeat.routeDistanceKm, 9.4);
  assert.strictEqual(adapterCallCount, 1, 'Cached HIT must not trigger a second upstream call');

  // 7c. Coordinate change automatically invalidates/misses cache
  const updatedCoordOrigin = {
    ...verifiedProjectOrigin,
    projectLatitude: 22.6285,
    projectLongitude: 88.5152,
    latitude: 22.6285,
    longitude: 88.5152,
  };
  const afterCoordChange = await routingService.getProjectRoadRoute(
    updatedCoordOrigin,
    airportDestination
  );
  assert.strictEqual(
    afterCoordChange.cache.status,
    'MISS',
    'Modified project coordinates must produce a new cache key and miss stale cache'
  );
  assert.strictEqual(adapterCallCount, 2);

  // 7d. Explicit project route invalidation
  const removedCount = routingService.invalidateProjectRoutes('proj-merlin-rise');
  assert.strictEqual(removedCount, 2, 'invalidateProjectRoutes must purge both cached entries for project');

  // 7e. Concurrent in-flight request deduplication
  let concurrentCalls = 0;
  const slowService = new RoadRoutingService({
    adapter: {
      providerId: 'OSRM',
      isConfigured: () => true,
      computeDrivingRoute: async () => {
        concurrentCalls += 1;
        await new Promise((r) => setTimeout(r, 40));
        return { status: 'OK', distanceMeters: 8800, durationSeconds: 960 };
      },
    },
  });
  const [resA, resB, resC] = await Promise.all([
    slowService.getProjectRoadRoute(verifiedProjectOrigin, airportDestination),
    slowService.getProjectRoadRoute(verifiedProjectOrigin, airportDestination),
    slowService.getProjectRoadRoute(verifiedProjectOrigin, airportDestination),
  ]);
  assert.strictEqual(
    concurrentCalls,
    1,
    'Concurrent identical requests must be deduplicated into a single upstream call'
  );
  assert.strictEqual(resA.routeDistanceKm, 8.8);
  assert.strictEqual(resB.routeDistanceKm, 8.8);
  assert.strictEqual(resC.routeDistanceKm, 8.8);

  // 7f. Duration formatting helper
  assert.strictEqual(formatDrivingDuration(45), '1 min');
  assert.strictEqual(formatDrivingDuration(720), '12 mins');
  assert.strictEqual(formatDrivingDuration(3600), '1 hr');
  assert.strictEqual(formatDrivingDuration(4500), '1 hr 15 mins');
  console.log('✓ Test 7 Passed: Provider cache caps, coordinate-change invalidation, and in-flight deduplication verified');

  // =========================================================================
  // 8. Configuration & Secret Security Validation
  // =========================================================================
  logSection('8. Configuration & Secret Security Validation (src/lib/config.ts)');
  const origNodeEnv = process.env.NODE_ENV;
  const origProvider = process.env.ROAD_ROUTING_PROVIDER;
  const origOsrmUrl = process.env.OSRM_BASE_URL;
  const origDbUrl = process.env.DATABASE_URL;

  try {
    // 8a. Reject OSRM public demo server in production
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = origDbUrl || 'postgresql://localhost:5432/greathomes';
    process.env.ROAD_ROUTING_PROVIDER = 'osrm';
    process.env.OSRM_BASE_URL = 'https://router.project-osrm.org/route/v1';
    resetConfigCacheForTesting();
    assert.throws(
      () => validateAndGetConfig(),
      /router\.project-osrm\.org.*strictly forbidden/i,
      'Production config must reject router.project-osrm.org'
    );

    // 8b. Reject NEXT_PUBLIC_ leaked routing API keys
    process.env.ROAD_ROUTING_PROVIDER = 'none';
    process.env.OSRM_BASE_URL = '';
    process.env.NEXT_PUBLIC_OPENROUTESERVICE_API_KEY = 'leaked-key';
    resetConfigCacheForTesting();
    assert.throws(
      () => validateAndGetConfig(),
      /SECURITY VIOLATION/,
      'Config must reject NEXT_PUBLIC_OPENROUTESERVICE_API_KEY leak'
    );
  } finally {
    delete process.env.NEXT_PUBLIC_OPENROUTESERVICE_API_KEY;
    if (origNodeEnv !== undefined) process.env.NODE_ENV = origNodeEnv;
    else delete process.env.NODE_ENV;
    if (origProvider !== undefined) process.env.ROAD_ROUTING_PROVIDER = origProvider;
    else delete process.env.ROAD_ROUTING_PROVIDER;
    if (origOsrmUrl !== undefined) process.env.OSRM_BASE_URL = origOsrmUrl;
    else delete process.env.OSRM_BASE_URL;
    if (origDbUrl !== undefined) process.env.DATABASE_URL = origDbUrl;
    else delete process.env.DATABASE_URL;
    resetConfigCacheForTesting();
  }
  console.log('✓ Test 8 Passed: Production OSRM demo server block and NEXT_PUBLIC_ secret leak guard verified');

  console.log('\n==================================================');
  console.log('  ALL PHASE 2 ROAD-ROUTING ARCHITECTURE TESTS PASSED (8 / 8)');
  console.log('==================================================\n');
}

runPhase2Tests().catch((err) => {
  console.error('\n❌ Phase 2 test failed:', err);
  process.exit(1);
});
