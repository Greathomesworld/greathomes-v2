import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

function createMockFetch(handler) {
  const calls = [];
  const fetchFn = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    let parsedBody = undefined;
    if (init?.body && typeof init.body === 'string') {
      try {
        parsedBody = JSON.parse(init.body);
      } catch {
        parsedBody = init.body;
      }
    }
    calls.push({ url, init, parsedBody });
    return handler(url, init, parsedBody);
  };

  return { fetchFn, calls };
}

async function runPhase4Tests() {
  console.log('=== Phase 3.1 Corrections + Phase 4 Location & Connectivity Integration Tests ===\n');

  // Ensure offline unit tests run deterministically without making live external API calls
  process.env.ROAD_ROUTING_PROVIDER = 'none';

  const {
    RoadRoutingService,
    OpenRouteServiceAdapter,
    UnconfiguredRoadRoutingAdapter,
  } = await import('../src/domain/places/routing/roadRoutingService.ts');

  const {
    NearbyPlaceService,
  } = await import('../src/domain/places/services/nearbyPlaceService.ts');

  const {
    placeRepository,
  } = await import('../src/infrastructure/repositories/memory/placeRepositoryMemory.ts');

  const {
    ProjectNearbyPlaces,
  } = await import('../src/components/projects/ProjectNearbyPlaces.tsx');

  const {
    ProjectLocationSection,
  } = await import('../src/components/projects/ProjectLocationSection.tsx');

  const {
    propertyDiscoveryService,
  } = await import('../src/domain/projects/services/propertyDiscoveryService.ts');

  const {
    projectIntelligenceService,
  } = await import('../src/domain/projects/services/projectIntelligenceService.ts');

  const {
    ensureSeedData,
  } = await import('../src/infrastructure/seed.ts');

  const {
    GET: getNearbyPlacesRoute,
  } = await import('../app/api/places/nearby/route.ts');

  const { NextRequest } = await import('next/server');

  await ensureSeedData();

  const VERIFIED_PROJECT_ORIGIN = {
    projectId: 'proj-merlin-rise',
    projectSlug: 'merlin-rise',
    projectName: 'Merlin Rise',
    projectLatitude: 22.625274,
    projectLongitude: 88.51089,
    latitude: 22.625274,
    longitude: 88.51089,
    locationStatus: 'VERIFIED_PROJECT_LOCATION',
    coordinateSource: 'PROJECT',
    hasVerifiedProjectCoordinates: true,
    location: {
      id: 'loc-rajarhat',
      name: 'Rajarhat',
      slug: 'rajarhat',
      latitude: 22.5958,
      longitude: 88.4632,
    },
  };

  const APPROXIMATE_PROJECT_ORIGIN = {
    projectId: 'proj-approx-antares',
    projectSlug: 'antares',
    projectName: 'Antares',
    projectLatitude: null,
    projectLongitude: null,
    latitude: 22.5867,
    longitude: 88.4171,
    locationStatus: 'APPROXIMATE_LOCATION',
    coordinateSource: 'LOCATION',
    hasVerifiedProjectCoordinates: false,
    location: {
      id: 'loc-salt-lake',
      name: 'Salt Lake',
      slug: 'salt-lake',
      latitude: 22.5867,
      longitude: 88.4171,
    },
  };

  const UNAVAILABLE_PROJECT_ORIGIN = {
    projectId: 'proj-unavail',
    projectSlug: 'unmapped-project',
    projectName: 'Unmapped Project',
    projectLatitude: null,
    projectLongitude: null,
    latitude: null,
    longitude: null,
    locationStatus: 'LOCATION_UNAVAILABLE',
    coordinateSource: 'NONE',
    hasVerifiedProjectCoordinates: false,
    location: {
      id: 'loc-unmapped',
      name: 'Unmapped Locality',
      slug: 'unmapped-locality',
      latitude: null,
      longitude: null,
    },
  };

  const AIRPORT_DESTINATION = {
    destinationId: 'poi-ccu-airport',
    name: 'Netaji Subhas Chandra Bose International Airport',
    latitude: 22.6547,
    longitude: 88.4467,
  };

  // ---------------------------------------------------------------------------
  // 1. Phase 3.1 Regression: Distinguish APPLICATION_BUDGET_EXCEEDED, PROVIDER_RATE_LIMITED, and PROVIDER_ERROR
  // ---------------------------------------------------------------------------
  console.log('Test 1: Phase 3.1 Issue A1 — Distinguish APPLICATION_BUDGET_EXCEEDED, PROVIDER_RATE_LIMITED, and PROVIDER_ERROR...');
  {
    // 1a. Local application budget exhausted -> APPLICATION_BUDGET_EXCEEDED
    const { fetchFn: budgetFetch, calls: budgetCalls } = createMockFetch(async () => {
      return new Response(
        JSON.stringify({ routes: [{ summary: { distance: 10200, duration: 900 } }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });
    const budgetAdapter = new OpenRouteServiceAdapter({ apiKey: 'test-key', fetchFn: budgetFetch });
    const budgetService = new RoadRoutingService({
      adapter: budgetAdapter,
      maxRequestsPerDay: 1,
      maxRequestsPerMinute: 40,
    });

    const firstRes = await budgetService.getProjectRoadRoute(VERIFIED_PROJECT_ORIGIN, AIRPORT_DESTINATION);
    assert.equal(firstRes.routeStatus, 'ROUTE_AVAILABLE');
    assert.equal(budgetCalls.length, 1);

    const secondDest = {
      destinationId: 'poi-2',
      name: 'Eco Park',
      latitude: 22.602,
      longitude: 88.467,
    };
    const budgetBlockedRes = await budgetService.getProjectRoadRoute(VERIFIED_PROJECT_ORIGIN, secondDest);
    assert.equal(budgetCalls.length, 1, 'No upstream call when local application budget is exhausted');
    assert.equal(budgetBlockedRes.routeStatus, 'APPLICATION_BUDGET_EXCEEDED');
    assert.equal(budgetBlockedRes.errorCode, 'APPLICATION_BUDGET_EXCEEDED');
    assert.equal(budgetBlockedRes.isRoadRouteAvailable, false);
    assert.equal(budgetBlockedRes.routeDistanceKm, null);

    // 1b. Upstream HTTP 429 -> PROVIDER_RATE_LIMITED
    const { fetchFn: rateLimitFetch } = createMockFetch(async () => {
      return new Response(JSON.stringify({ message: 'Quota exceeded' }), { status: 429 });
    });
    const rateLimitService = new RoadRoutingService({
      adapter: new OpenRouteServiceAdapter({ apiKey: 'test-key', fetchFn: rateLimitFetch }),
    });
    const rateLimitRes = await rateLimitService.getProjectRoadRoute(
      VERIFIED_PROJECT_ORIGIN,
      AIRPORT_DESTINATION
    );
    assert.equal(rateLimitRes.routeStatus, 'PROVIDER_RATE_LIMITED');
    assert.equal(rateLimitRes.errorCode, 'PROVIDER_RATE_LIMITED');
    assert.equal(rateLimitRes.isRoadRouteAvailable, false);
    assert.equal(rateLimitRes.routeDistanceKm, null);

    // 1c. Other upstream errors (401/403 auth, 503 server error) -> PROVIDER_ERROR
    const { fetchFn: authErrorFetch } = createMockFetch(async () => {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    });
    const authErrorService = new RoadRoutingService({
      adapter: new OpenRouteServiceAdapter({ apiKey: 'bad-key', fetchFn: authErrorFetch }),
    });
    const authErrorRes = await authErrorService.getProjectRoadRoute(
      VERIFIED_PROJECT_ORIGIN,
      AIRPORT_DESTINATION
    );
    assert.equal(authErrorRes.routeStatus, 'PROVIDER_ERROR');
    assert.equal(authErrorRes.errorCode, 'AUTH_FAILED');
    assert.equal(authErrorRes.routeDistanceKm, null);

    console.log('  ✓ Passed');
  }

  // ---------------------------------------------------------------------------
  // 2. Phase 3.1 Regression: Malformed HTTP 200 responses classified as INVALID_PROVIDER_RESPONSE
  // ---------------------------------------------------------------------------
  console.log('Test 2: Phase 3.1 Issue A2 — Malformed HTTP 200 responses classified as INVALID_PROVIDER_RESPONSE...');
  {
    const cases = [
      '<<<not-json>>>',
      JSON.stringify({}),
      JSON.stringify({ routes: [{}] }),
      JSON.stringify({ routes: [{ summary: {} }] }),
      JSON.stringify({ routes: [{ summary: { distance: null, duration: 600 } }] }),
      JSON.stringify({ routes: [{ summary: { distance: 10500, duration: 'NaN' } }] }),
      JSON.stringify({ routes: [{ summary: { distance: -500, duration: 600 } }] }),
      JSON.stringify({ routes: [{ summary: { distance: 500, duration: 60 } }] }), // < 7.4km straight-line
    ];

    for (const body of cases) {
      const { fetchFn } = createMockFetch(async () => new Response(body, { status: 200 }));
      const service = new RoadRoutingService({
        adapter: new OpenRouteServiceAdapter({ apiKey: 'test-key', fetchFn }),
      });
      const res = await service.getProjectRoadRoute(VERIFIED_PROJECT_ORIGIN, AIRPORT_DESTINATION);
      assert.equal(
        res.routeStatus,
        'INVALID_PROVIDER_RESPONSE',
        `Expected INVALID_PROVIDER_RESPONSE for HTTP 200 body: ${body}`
      );
      assert.equal(res.errorCode, 'INVALID_RESPONSE');
      assert.equal(res.isRoadRouteAvailable, false);
      assert.equal(res.routeDistanceKm, null);
      assert.equal(res.estimatedDurationMinutes, null);
    }
    console.log('  ✓ Passed');
  }

  // ---------------------------------------------------------------------------
  // 3. Verified project coordinates produce eligible route requests & populate road distance + duration
  // ---------------------------------------------------------------------------
  console.log('Test 3: Verified project coordinates produce eligible route requests in NearbyPlaceService...');
  {
    const { fetchFn, calls } = createMockFetch(async () => {
      return new Response(
        JSON.stringify({
          routes: [
            {
              summary: {
                distance: 11400, // 11.4 km road distance
                duration: 1320, // 22 mins
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });

    const routingService = new RoadRoutingService({
      adapter: new OpenRouteServiceAdapter({ apiKey: 'test-key', fetchFn }),
    });
    const service = new NearbyPlaceService(placeRepository, routingService);

    const connectivity = await service.getProjectNearbyConnectivity(VERIFIED_PROJECT_ORIGIN, {
      radiusKm: 15,
      limit: 5,
      maxRoutedPlaces: 3,
    });

    assert.equal(connectivity.originStatus, 'VERIFIED_PROJECT_LOCATION');
    assert.equal(connectivity.coordinateSource, 'PROJECT');
    assert.equal(connectivity.hasVerifiedProjectCoordinates, true);
    assert.equal(connectivity.canComputeExactProjectDistance, true);
    assert.ok(connectivity.places.length > 0, 'Expected verified nearby places to be returned');
    assert.equal(
      calls.length,
      Math.min(3, connectivity.places.length),
      'Only up to maxRoutedPlaces should trigger provider calls'
    );

    const firstPlace = connectivity.places[0];
    assert.equal(firstPlace.isRoadRouteAvailable, true);
    assert.equal(firstPlace.distanceMetric, 'ROAD_ROUTE');
    assert.equal(firstPlace.routeStatus, 'ROUTE_AVAILABLE');
    assert.equal(firstPlace.routeDistanceKm, 11.4);
    assert.equal(firstPlace.formattedRouteDistance, '11.4 km');
    assert.equal(firstPlace.estimatedDurationMinutes, 22);
    assert.equal(firstPlace.formattedDuration, '22 mins');
    assert.ok(
      typeof firstPlace.geodesicDistanceKm === 'number' &&
        firstPlace.geodesicDistanceKm !== firstPlace.routeDistanceKm,
      'Geodesic distance must remain separate from road distance'
    );
    assert.equal(
      connectivity.attribution,
      '© openrouteservice.org by HeiGIT | Map data © OpenStreetMap contributors'
    );

    // Places beyond maxRoutedPlaces fall back cleanly to straight-line geodesic without calling provider
    if (connectivity.places.length > 3) {
      const fourthPlace = connectivity.places[3];
      assert.equal(fourthPlace.isRoadRouteAvailable, false);
      assert.equal(fourthPlace.distanceMetric, 'GEODESIC_STRAIGHT_LINE');
      assert.equal(fourthPlace.routeDistanceKm, null);
      assert.equal(fourthPlace.formattedDuration, null);
    }
    console.log('  ✓ Passed');
  }

  // ---------------------------------------------------------------------------
  // 4. Approximate origins and unavailable origins do NOT generate route requests
  // ---------------------------------------------------------------------------
  console.log('Test 4: Approximate and unavailable project origins never generate route requests...');
  {
    const { fetchFn, calls } = createMockFetch(async () => {
      throw new Error('Provider must NOT be called for approximate or unavailable origins');
    });

    const routingService = new RoadRoutingService({
      adapter: new OpenRouteServiceAdapter({ apiKey: 'test-key', fetchFn }),
    });
    const service = new NearbyPlaceService(placeRepository, routingService);

    const approxConnectivity = await service.getProjectNearbyConnectivity(APPROXIMATE_PROJECT_ORIGIN);
    assert.equal(calls.length, 0);
    assert.equal(approxConnectivity.originStatus, 'APPROXIMATE_LOCATION');
    assert.equal(approxConnectivity.coordinateSource, 'LOCATION');
    assert.equal(approxConnectivity.hasVerifiedProjectCoordinates, false);
    assert.equal(approxConnectivity.places.length, 0);
    assert.equal(approxConnectivity.attribution, null);
    assert.ok(approxConnectivity.disclosureMessage?.includes('Salt Lake'));

    const unavailConnectivity = await service.getProjectNearbyConnectivity(UNAVAILABLE_PROJECT_ORIGIN);
    assert.equal(calls.length, 0);
    assert.equal(unavailConnectivity.originStatus, 'LOCATION_UNAVAILABLE');
    assert.equal(unavailConnectivity.coordinateSource, 'NONE');
    assert.equal(unavailConnectivity.places.length, 0);
    assert.equal(unavailConnectivity.attribution, null);
    assert.ok(unavailConnectivity.disclosureMessage?.includes('unavailable'));
    console.log('  ✓ Passed');
  }

  // ---------------------------------------------------------------------------
  // 5. Disabled provider behaviour (ROAD_ROUTING_PROVIDER="none") & non-fabrication
  // ---------------------------------------------------------------------------
  console.log('Test 5: Disabled provider behaviour preserves straight-line distances without fabricating road routes...');
  {
    const disabledRoutingService = new RoadRoutingService({
      adapter: new UnconfiguredRoadRoutingAdapter(),
    });
    const service = new NearbyPlaceService(placeRepository, disabledRoutingService);

    const connectivity = await service.getProjectNearbyConnectivity(VERIFIED_PROJECT_ORIGIN, {
      radiusKm: 15,
      limit: 4,
    });

    assert.equal(connectivity.originStatus, 'VERIFIED_PROJECT_LOCATION');
    assert.equal(connectivity.routingProvider, 'NONE');
    assert.equal(connectivity.isRoutingProviderConfigured, false);
    assert.equal(connectivity.attribution, null);
    assert.ok(connectivity.places.length > 0);

    for (const p of connectivity.places) {
      assert.equal(p.isRoadRouteAvailable, false);
      assert.equal(p.distanceMetric, 'GEODESIC_STRAIGHT_LINE');
      assert.equal(p.routeStatus, 'PROVIDER_UNCONFIGURED');
      assert.equal(p.routeDistanceKm, null);
      assert.equal(p.formattedRouteDistance, null);
      assert.equal(p.estimatedDurationMinutes, null);
      assert.equal(p.formattedDuration, null);
      assert.ok(typeof p.geodesicDistanceKm === 'number' && p.geodesicDistanceKm > 0);
    }
    console.log('  ✓ Passed');
  }

  // ---------------------------------------------------------------------------
  // 6. UI Rendering: Road route + attribution vs Straight-Line vs Approximate vs Unavailable
  // ---------------------------------------------------------------------------
  console.log('Test 6: ProjectNearbyPlaces & ProjectLocationSection UI rendering (Road Route, Attribution, Geodesic, Approximate, Unavailable)...');
  {
    // 6a. When road routes are available: renders road distance, driving time, "Road Route" label, and HeiGIT attribution
    const roadPlaces = [
      {
        id: 'poi-1',
        name: 'Kolkata Airport',
        category: 'AIRPORT',
        categoryDisplay: 'Airport',
        latitude: 22.6547,
        longitude: 88.4467,
        locality: 'Dum Dum',
        city: 'Kolkata',
        isVerified: true,
        distanceKm: 11.4,
        formattedDistance: '11.4 km',
        distanceMetric: 'ROAD_ROUTE',
        routeStatus: 'ROUTE_AVAILABLE',
        isRoadRouteAvailable: true,
        routeDistanceKm: 11.4,
        formattedRouteDistance: '11.4 km',
        estimatedDurationMinutes: 22,
        estimatedDurationSeconds: 1320,
        formattedDuration: '22 mins',
        geodesicDistanceKm: 7.4,
        formattedGeodesicDistance: '7.4 km',
        routingProvider: 'OPENROUTESERVICE',
        attribution: '© openrouteservice.org by HeiGIT | Map data © OpenStreetMap contributors',
      },
    ];

    const roadHtml = renderToStaticMarkup(
      React.createElement(ProjectNearbyPlaces, {
        places: roadPlaces,
        hasCoordinates: true,
        locationStatus: 'VERIFIED_PROJECT_LOCATION',
        coordinateSource: 'PROJECT',
        projectName: 'Merlin Rise',
        attribution: '© openrouteservice.org by HeiGIT | Map data © OpenStreetMap contributors',
      })
    );

    assert.ok(roadHtml.includes('11.4 km'), 'Must display road route distance');
    assert.ok(roadHtml.includes('~22 mins drive'), 'Must display estimated driving duration');
    assert.ok(roadHtml.includes('Road Route'), 'Must label metric as Road Route');
    assert.ok(
      roadHtml.includes('© openrouteservice.org by HeiGIT | Map data © OpenStreetMap contributors'),
      'Must visibly render required OpenRouteService / HeiGIT attribution'
    );

    // 6b. When road routing is disabled/unavailable: renders Straight-Line (Geodesic), NO driving time, NO ORS attribution
    const geodesicPlaces = [
      {
        id: 'poi-1',
        name: 'Kolkata Airport',
        category: 'AIRPORT',
        categoryDisplay: 'Airport',
        latitude: 22.6547,
        longitude: 88.4467,
        locality: 'Dum Dum',
        city: 'Kolkata',
        isVerified: true,
        distanceKm: 7.4,
        formattedDistance: '7.4 km',
        distanceMetric: 'GEODESIC_STRAIGHT_LINE',
        routeStatus: 'PROVIDER_UNCONFIGURED',
        isRoadRouteAvailable: false,
        routeDistanceKm: null,
        formattedRouteDistance: null,
        estimatedDurationMinutes: null,
        estimatedDurationSeconds: null,
        formattedDuration: null,
        geodesicDistanceKm: 7.4,
        formattedGeodesicDistance: '7.4 km',
        routingProvider: 'NONE',
        attribution: null,
      },
    ];

    const geodesicHtml = renderToStaticMarkup(
      React.createElement(ProjectNearbyPlaces, {
        places: geodesicPlaces,
        hasCoordinates: true,
        locationStatus: 'VERIFIED_PROJECT_LOCATION',
        coordinateSource: 'PROJECT',
        projectName: 'Merlin Rise',
      })
    );

    assert.ok(geodesicHtml.includes('7.4 km'));
    assert.ok(geodesicHtml.includes('Straight-Line (Geodesic)'));
    assert.ok(!geodesicHtml.includes('Road Route'));
    assert.ok(!geodesicHtml.includes('mins drive'));
    assert.ok(!geodesicHtml.includes('openrouteservice.org by HeiGIT'));

    // 6c. Approximate origin UI
    const approxHtml = renderToStaticMarkup(
      React.createElement(ProjectNearbyPlaces, {
        places: [],
        hasCoordinates: false,
        locationStatus: 'APPROXIMATE_LOCATION',
        coordinateSource: 'LOCATION',
        locationName: 'Salt Lake',
        projectName: 'Antares',
      })
    );
    assert.ok(approxHtml.includes('data-location-status="APPROXIMATE_LOCATION"'));
    assert.ok(approxHtml.includes('Approximate Locality Coordinates Only'));
    assert.ok(approxHtml.includes('Salt Lake'));

    // 6d. Unavailable origin UI
    const unavailHtml = renderToStaticMarkup(
      React.createElement(ProjectNearbyPlaces, {
        places: [],
        hasCoordinates: false,
        locationStatus: 'LOCATION_UNAVAILABLE',
        coordinateSource: 'NONE',
        projectName: 'Unmapped Project',
      })
    );
    assert.ok(unavailHtml.includes('data-location-status="LOCATION_UNAVAILABLE"'));
    assert.ok(unavailHtml.includes('Nearby Connectivity Pending'));

    console.log('  ✓ Passed');
  }

  // ---------------------------------------------------------------------------
  // 7. API Behaviour (/api/places/nearby) & Same-Locality Zero-Distance Guard
  // ---------------------------------------------------------------------------
  console.log('Test 7: /api/places/nearby API behaviour & same-locality zero-distance guard...');
  {
    // 7a. Verified project via API
    const reqVerified = new NextRequest('http://localhost:3000/api/places/nearby?projectSlug=merlin-rise&limit=4');
    const resVerified = await getNearbyPlacesRoute(reqVerified);
    assert.equal(resVerified.status, 200);
    const bodyVerified = await resVerified.json();
    assert.equal(bodyVerified.success, true);
    assert.equal(bodyVerified.originStatus, 'VERIFIED_PROJECT_LOCATION');
    assert.equal(bodyVerified.hasVerifiedProjectCoordinates, true);
    assert.ok(Array.isArray(bodyVerified.data) && bodyVerified.data.length > 0);
    assert.equal(bodyVerified.data[0].distanceMetric, 'GEODESIC_STRAIGHT_LINE'); // provider is 'none' by default

    // 7b. Approximate project via API returns 0 exact project distances
    const allProjects = await projectIntelligenceService.listAllProjects();
    const approxProject = allProjects.find((p) => p.locationStatus === 'APPROXIMATE_LOCATION');
    if (approxProject) {
      const reqApprox = new NextRequest(
        `http://localhost:3000/api/places/nearby?projectSlug=${encodeURIComponent(approxProject.slug)}`
      );
      const resApprox = await getNearbyPlacesRoute(reqApprox);
      assert.equal(resApprox.status, 200);
      const bodyApprox = await resApprox.json();
      assert.equal(bodyApprox.originStatus, 'APPROXIMATE_LOCATION');
      assert.equal(bodyApprox.hasVerifiedProjectCoordinates, false);
      assert.equal(bodyApprox.data.length, 0);
      assert.ok(bodyApprox.disclosureMessage?.includes('approximate locality coordinates'));

      // Also verify PropertyDiscoveryService does not produce 0 km distances for approximate projects
      const bundle = await propertyDiscoveryService.getProjectDetailDiscoveryBundle(approxProject);
      assert.equal(bundle.nearbyResale.length, 0);
      assert.equal(bundle.nearbyRental.length, 0);
      for (const rel of bundle.relatedProjects) {
        assert.equal(rel.distanceKm, null, 'Approximate origin must never produce project-to-project distance');
      }
    }
    console.log('  ✓ Passed');
  }

  // ---------------------------------------------------------------------------
  // 8. Priority 1: Slow or unavailable routing never blocks connectivity past overallDeadlineMs
  // ---------------------------------------------------------------------------
  console.log('Test 8: Slow upstream routing is bounded by overallDeadlineMs and falls back cleanly to geodesic distances...');
  {
    let slowAdapterCalls = 0;
    const slowAdapter = new OpenRouteServiceAdapter({
      apiKey: 'test-ors-key-slow',
      baseUrl: 'https://api.heigit.org',
      defaultTimeoutMs: 5000,
      fetchFn: async () => {
        slowAdapterCalls += 1;
        await new Promise((resolve) => setTimeout(resolve, 1500));
        return new Response(
          JSON.stringify({ routes: [{ summary: { distance: 12000, duration: 1200 } }] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      },
    });

    const slowRoutingService = new RoadRoutingService({
      adapter: slowAdapter,
      maxRequestsPerMinute: 40,
      maxRequestsPerDay: 1500,
    });
    const service = new NearbyPlaceService(placeRepository, slowRoutingService);

    // 8a. Instant Suspense fallback mode (allowRoadRouting: false) performs 0 upstream calls
    const instantFallback = await service.getProjectNearbyConnectivity(VERIFIED_PROJECT_ORIGIN, {
      radiusKm: 15,
      limit: 6,
      allowRoadRouting: false,
    });
    assert.equal(slowAdapterCalls, 0, 'allowRoadRouting: false must make 0 upstream calls');
    assert.ok(instantFallback.places.length > 0);
    for (const p of instantFallback.places) {
      assert.equal(p.distanceMetric, 'GEODESIC_STRAIGHT_LINE');
      assert.equal(p.isRoadRouteAvailable, false);
    }

    // 8b. Slow upstream with 120ms overallDeadlineMs resolves quickly with geodesic fallbacks
    const t0 = Date.now();
    const boundedResult = await service.getProjectNearbyConnectivity(VERIFIED_PROJECT_ORIGIN, {
      radiusKm: 15,
      limit: 6,
      maxRoutedPlaces: 6,
      overallDeadlineMs: 120,
    });
    const elapsedMs = Date.now() - t0;

    assert.ok(elapsedMs < 800, `Expected bounded deadline resolution < 800ms, took ${elapsedMs}ms`);
    assert.ok(boundedResult.places.length > 0);
    for (const p of boundedResult.places) {
      assert.equal(p.isRoadRouteAvailable, false);
      assert.equal(p.distanceMetric, 'GEODESIC_STRAIGHT_LINE');
      assert.equal(p.routeStatus, 'PROVIDER_TIMEOUT');
      assert.equal(p.routeDistanceKm, null);
      assert.equal(p.formattedDuration, null);
      assert.ok(typeof p.geodesicDistanceKm === 'number' && p.geodesicDistanceKm > 0);
    }
    console.log('  ✓ Passed');
  }

  // ---------------------------------------------------------------------------
  // 9. Priority 2: Arbitrary-coordinate API abuse protection & per-IP rate limiting
  // ---------------------------------------------------------------------------
  console.log('Test 9: Arbitrary-coordinate API abuse protection & per-IP rate limiting...');
  {
    // 9a. Service-level getNearbyPlaces(latLng) defaults to allowRoadRouting: false even when adapter is configured
    let adapterCalls = 0;
    const configuredAdapter = new OpenRouteServiceAdapter({
      apiKey: 'test-ors-key-abuse-guard',
      baseUrl: 'https://api.heigit.org',
      fetchFn: async () => {
        adapterCalls += 1;
        return new Response(
          JSON.stringify({ routes: [{ summary: { distance: 8000, duration: 900 } }] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      },
    });
    const configuredRoutingService = new RoadRoutingService({ adapter: configuredAdapter });
    const guardedService = new NearbyPlaceService(placeRepository, configuredRoutingService);

    const rawCoordPlaces = await guardedService.getNearbyPlaces(
      { latitude: 22.625274, longitude: 88.51089 },
      { limit: 4 }
    );
    assert.equal(adapterCalls, 0, 'Raw coordinate getNearbyPlaces must not trigger road routing by default');
    assert.ok(rawCoordPlaces.length > 0);
    assert.equal(rawCoordPlaces[0].distanceMetric, 'GEODESIC_STRAIGHT_LINE');

    // 9b. API route /api/places/nearby?lat=...&lng=... returns geodesic only and enforces 30 req/min rate limit
    const testIp = '203.0.113.195';
    const rawApiReq = new NextRequest(
      'http://localhost:3000/api/places/nearby?lat=22.625274&lng=88.51089&limit=3',
      { headers: { 'x-forwarded-for': testIp } }
    );
    const rawApiRes = await getNearbyPlacesRoute(rawApiReq);
    assert.equal(rawApiRes.status, 200);
    const rawApiBody = await rawApiRes.json();
    assert.equal(rawApiBody.routingProvider, 'NONE');
    assert.equal(rawApiBody.attribution, null);
    assert.ok(rawApiBody.disclosureMessage?.includes('straight-line geodesic distances only'));
    for (const p of rawApiBody.data) {
      assert.equal(p.distanceMetric, 'GEODESIC_STRAIGHT_LINE');
      assert.equal(p.isRoadRouteAvailable, false);
    }

    // Burst 30 more requests from same IP to trigger HTTP 429 rate limit
    let lastStatus = 200;
    for (let i = 0; i < 30; i++) {
      const burstReq = new NextRequest(
        `http://localhost:3000/api/places/nearby?lat=22.625274&lng=88.51089&limit=2`,
        { headers: { 'x-forwarded-for': testIp } }
      );
      const burstRes = await getNearbyPlacesRoute(burstReq);
      lastStatus = burstRes.status;
    }
    assert.equal(lastStatus, 429, 'Burst raw-coordinate requests beyond 30/min must be rate-limited with HTTP 429');
    console.log('  ✓ Passed');
  }

  // ---------------------------------------------------------------------------
  // 10. Priority 3: Bounded cache memory growth (maxCacheEntries) & LRU eviction
  // ---------------------------------------------------------------------------
  console.log('Test 10: Bounded cache memory growth (maxCacheEntries) and LRU eviction...');
  {
    let callCounter = 0;
    const adapter = new OpenRouteServiceAdapter({
      apiKey: 'test-ors-key-lru',
      baseUrl: 'https://api.heigit.org',
      fetchFn: async () => {
        callCounter += 1;
        return new Response(
          JSON.stringify({
            routes: [{ summary: { distance: 10000 + callCounter * 100, duration: 1000 + callCounter * 10 } }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      },
    });

    const lruService = new RoadRoutingService({
      adapter,
      maxCacheEntries: 3,
      maxRequestsPerMinute: 40,
      maxRequestsPerDay: 1500,
    });

    const dest1 = { destinationId: 'd1', latitude: 22.65, longitude: 88.44 };
    const dest2 = { destinationId: 'd2', latitude: 22.66, longitude: 88.45 };
    const dest3 = { destinationId: 'd3', latitude: 22.67, longitude: 88.46 };
    const dest4 = { destinationId: 'd4', latitude: 22.68, longitude: 88.47 };

    await lruService.getProjectRoadRoute(VERIFIED_PROJECT_ORIGIN, dest1);
    await lruService.getProjectRoadRoute(VERIFIED_PROJECT_ORIGIN, dest2);
    await lruService.getProjectRoadRoute(VERIFIED_PROJECT_ORIGIN, dest3);
    assert.equal(lruService.getDiagnostics().cacheSize, 3);
    assert.equal(lruService.getDiagnostics().evictedCacheCount, 0);

    // Access dest1 (HIT) so dest1 becomes most-recently-used and dest2 becomes least-recently-used
    const hit1 = await lruService.getProjectRoadRoute(VERIFIED_PROJECT_ORIGIN, dest1);
    assert.equal(hit1.cache.status, 'HIT');

    // Insert dest4 -> cache is capped at 3, so dest2 (oldest LRU) must be evicted
    const miss4 = await lruService.getProjectRoadRoute(VERIFIED_PROJECT_ORIGIN, dest4);
    assert.equal(miss4.cache.status, 'MISS');

    const diag = lruService.getDiagnostics();
    assert.equal(diag.cacheSize, 3, 'Cache size must never exceed maxCacheEntries (3)');
    assert.equal(diag.maxCacheEntries, 3);
    assert.equal(diag.evictedCacheCount, 1, 'Exactly 1 LRU entry must be recorded as evicted');
    assert.equal(diag.isProcessLocalState, true);

    // dest1 should still be HIT, dest2 should now be MISS
    const hit1Again = await lruService.getProjectRoadRoute(VERIFIED_PROJECT_ORIGIN, dest1);
    assert.equal(hit1Again.cache.status, 'HIT');

    const miss2Again = await lruService.getProjectRoadRoute(VERIFIED_PROJECT_ORIGIN, dest2);
    assert.equal(miss2Again.cache.status, 'MISS');

    console.log('  ✓ Passed');
  }

  // ---------------------------------------------------------------------------
  // 11. Priority 4: Mixed road-route and straight-line geodesic UI presentation
  // ---------------------------------------------------------------------------
  console.log('Test 11: Mixed road-route and straight-line geodesic UI presentation...');
  {
    const mixedPlaces = [
      {
        id: 'poi-road-1',
        name: 'Kolkata Airport',
        category: 'AIRPORT',
        categoryDisplay: 'Airport',
        latitude: 22.6547,
        longitude: 88.4467,
        locality: 'Dum Dum',
        city: 'Kolkata',
        isVerified: true,
        distanceKm: 11.4,
        formattedDistance: '11.4 km',
        distanceMetric: 'ROAD_ROUTE',
        routeStatus: 'ROUTE_AVAILABLE',
        isRoadRouteAvailable: true,
        routeDistanceKm: 11.4,
        formattedRouteDistance: '11.4 km',
        estimatedDurationMinutes: 22,
        estimatedDurationSeconds: 1320,
        formattedDuration: '22 mins',
        geodesicDistanceKm: 7.4,
        formattedGeodesicDistance: '7.4 km',
        routingProvider: 'OPENROUTESERVICE',
        attribution: '© openrouteservice.org by HeiGIT | Map data © OpenStreetMap contributors',
      },
      {
        id: 'poi-geo-2',
        name: 'Eco Park',
        category: 'RECREATION',
        categoryDisplay: 'Park & Recreation',
        latitude: 22.6018,
        longitude: 88.4665,
        locality: 'New Town',
        city: 'Kolkata',
        isVerified: true,
        distanceKm: 5.2,
        formattedDistance: '5.2 km',
        distanceMetric: 'GEODESIC_STRAIGHT_LINE',
        routeStatus: 'PROVIDER_UNCONFIGURED',
        isRoadRouteAvailable: false,
        routeDistanceKm: null,
        formattedRouteDistance: null,
        estimatedDurationMinutes: null,
        estimatedDurationSeconds: null,
        formattedDuration: null,
        geodesicDistanceKm: 5.2,
        formattedGeodesicDistance: '5.2 km',
        routingProvider: 'NONE',
        attribution: null,
      },
    ];

    const mixedHtml = renderToStaticMarkup(
      React.createElement(ProjectNearbyPlaces, {
        places: mixedPlaces,
        hasCoordinates: true,
        locationStatus: 'VERIFIED_PROJECT_LOCATION',
        coordinateSource: 'PROJECT',
        projectName: 'Merlin Rise',
        attribution: '© openrouteservice.org by HeiGIT | Map data © OpenStreetMap contributors',
      })
    );

    assert.ok(
      mixedHtml.includes('data-distance-mode="MIXED_ROAD_AND_GEODESIC"'),
      'Mixed set must declare MIXED_ROAD_AND_GEODESIC mode'
    );
    assert.ok(
      mixedHtml.includes('1 Road Route · 1 Straight-Line'),
      'Must display explicit mixed-metric summary badge'
    );
    assert.ok(
      mixedHtml.includes('Each card is labeled by distance type.'),
      'Must explain mixed metrics in section subtitle'
    );
    assert.ok(mixedHtml.includes('~22 mins drive'));
    assert.ok(mixedHtml.includes('Road Route'));
    assert.ok(mixedHtml.includes('Straight-Line (Geodesic)'));
    assert.ok(mixedHtml.includes('© openrouteservice.org by HeiGIT | Map data © OpenStreetMap contributors'));

    console.log('  ✓ Passed');
  }

  // ---------------------------------------------------------------------------
  // 12. Mobile-only accordion experience & zero duplicate DOM content
  // ---------------------------------------------------------------------------
  console.log('Test 12: Mobile-only accordion experience (collapsed by default, category accordions, zero duplicate DOM nodes)...');
  {
    const multiCategoryPlaces = [
      {
        id: 'poi-edu-1',
        name: "St. Xavier's University New Town",
        category: 'EDUCATION',
        categoryDisplay: 'Education',
        latitude: 22.5977,
        longitude: 88.4842,
        locality: 'New Town',
        city: 'Kolkata',
        isVerified: true,
        distanceKm: 4.9,
        formattedDistance: '4.9 km',
        distanceMetric: 'ROAD_ROUTE',
        routeStatus: 'ROUTE_AVAILABLE',
        isRoadRouteAvailable: true,
        routeDistanceKm: 4.9,
        formattedRouteDistance: '4.9 km',
        estimatedDurationMinutes: 7,
        estimatedDurationSeconds: 420,
        formattedDuration: '7 mins',
        geodesicDistanceKm: 3.7,
        formattedGeodesicDistance: '3.7 km',
        routingProvider: 'OPENROUTESERVICE',
        attribution: '© openrouteservice.org by HeiGIT | Map data © OpenStreetMap contributors',
      },
      {
        id: 'poi-health-1',
        name: 'Tata Medical Center',
        category: 'HEALTHCARE',
        categoryDisplay: 'Healthcare',
        latitude: 22.5812,
        longitude: 88.4789,
        locality: 'New Town',
        city: 'Kolkata',
        isVerified: true,
        distanceKm: 8.1,
        formattedDistance: '8.1 km',
        distanceMetric: 'ROAD_ROUTE',
        routeStatus: 'ROUTE_AVAILABLE',
        isRoadRouteAvailable: true,
        routeDistanceKm: 8.1,
        formattedRouteDistance: '8.1 km',
        estimatedDurationMinutes: 11,
        estimatedDurationSeconds: 660,
        formattedDuration: '11 mins',
        geodesicDistanceKm: 5.1,
        formattedGeodesicDistance: '5.1 km',
        routingProvider: 'OPENROUTESERVICE',
        attribution: '© openrouteservice.org by HeiGIT | Map data © OpenStreetMap contributors',
      },
      {
        id: 'poi-airport-1',
        name: 'Netaji Subhash Chandra Bose International Airport (CCU)',
        category: 'AIRPORT',
        categoryDisplay: 'Airport',
        latitude: 22.6547,
        longitude: 88.4467,
        locality: 'Dum Dum',
        city: 'Kolkata',
        isVerified: true,
        distanceKm: 6.9,
        formattedDistance: '6.9 km',
        distanceMetric: 'GEODESIC_STRAIGHT_LINE',
        routeStatus: 'UNROUTABLE',
        isRoadRouteAvailable: false,
        routeDistanceKm: null,
        formattedRouteDistance: null,
        estimatedDurationMinutes: null,
        estimatedDurationSeconds: null,
        formattedDuration: null,
        geodesicDistanceKm: 6.9,
        formattedGeodesicDistance: '6.9 km',
        routingProvider: 'OPENROUTESERVICE',
        attribution: null,
      },
    ];

    const mobileHtml = renderToStaticMarkup(
      React.createElement(ProjectNearbyPlaces, {
        places: multiCategoryPlaces,
        hasCoordinates: true,
        locationStatus: 'VERIFIED_PROJECT_LOCATION',
        coordinateSource: 'PROJECT',
        projectName: 'Merlin Rise',
        attribution: '© openrouteservice.org by HeiGIT | Map data © OpenStreetMap contributors',
        defaultMobileView: true,
      })
    );

    assert.ok(mobileHtml.includes('data-mobile-nearby-accordion="true"'), 'Must render mobile accordion container');
    assert.ok(
      /data-mobile-section-trigger="true"[^>]*aria-expanded="true"|aria-expanded="true"[^>]*data-mobile-section-trigger="true"/.test(mobileHtml),
      'Main mobile section trigger must start expanded by default (aria-expanded="true")'
    );
    assert.ok(mobileHtml.includes('data-mobile-connectivity-summary="true"'), 'Connectivity summary must be rendered above categories');
    assert.ok(mobileHtml.includes('Schools &amp; Universities'), 'Must render first category name');
    assert.ok(mobileHtml.includes('Hospitals &amp; Medical Care'), 'Must render second category name');
    assert.ok(mobileHtml.includes('Airports'), 'Must render third category name');
    assert.ok(!mobileHtml.includes('Metro Stations'), 'Must not render empty categories');
    assert.ok(
      /aria-expanded="false"[^>]*data-mobile-category-trigger="EDUCATION"|data-mobile-category-trigger="EDUCATION"[^>]*aria-expanded="false"/.test(mobileHtml),
      'Categories must start collapsed by default (including first category)'
    );
    assert.ok(
      /aria-expanded="false"[^>]*data-mobile-category-trigger="HEALTHCARE"|data-mobile-category-trigger="HEALTHCARE"[^>]*aria-expanded="false"/.test(mobileHtml),
      'Subsequent categories must start collapsed'
    );
    assert.ok(!mobileHtml.includes('role="tablist"'), 'Desktop tablist must not duplicate in mobile DOM');
    assert.equal(
      (mobileHtml.match(/data-place-id="poi-edu-1"/g) || []).length,
      1,
      'Each place card must appear exactly once in mobile DOM (no duplicate DOM content)'
    );

    console.log('  ✓ Passed');
  }

  console.log('\nAll Phase 3.1 + Phase 4 + Hardening tests passed (12 / 12)!');
}

runPhase4Tests().catch((err) => {
  console.error('Phase 4 test suite failed:', err);
  process.exit(1);
});

