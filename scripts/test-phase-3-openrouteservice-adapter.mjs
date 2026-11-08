import assert from 'node:assert/strict';

const MERLIN_RISE_VERIFIED_ORIGIN = {
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

const APPROXIMATE_LOCALITY_ORIGIN = {
  projectId: 'proj-approx-1',
  projectSlug: 'approx-project',
  projectName: 'Approximate Project',
  projectLatitude: null,
  projectLongitude: null,
  latitude: 22.5867,
  longitude: 88.4171,
  location: {
    id: 'loc-salt-lake',
    name: 'Salt Lake',
    slug: 'salt-lake',
    latitude: 22.5867,
    longitude: 88.4171,
  },
};

const AIRPORT_DESTINATION = {
  destinationId: 'place-ccu-airport',
  name: 'Netaji Subhas Chandra Bose International Airport',
  latitude: 22.6547,
  longitude: 88.4467,
};

/**
 * Helper to create a mocked fetch implementation that records calls and returns a custom response.
 */
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
    return handler(url, init);
  };

  return { fetchFn, calls };
}

async function runTests() {
  console.log('=== Phase 3: OpenRouteService / HeiGIT Road-Routing Adapter Tests ===\n');

  const {
    RoadRoutingService,
    OpenRouteServiceAdapter,
    buildOpenRouteServiceDirectionsUrl,
    sanitizeProviderErrorMessage,
    createConfiguredRoadRoutingService,
  } = await import('../src/domain/places/routing/roadRoutingService.ts');

  const {
    validateAndGetConfig,
    resetConfigCacheForTesting,
  } = await import('../src/lib/config.ts');

  // ---------------------------------------------------------------------------
  // 1. Successful provider response parsing & HeiGIT API contract verification
  // ---------------------------------------------------------------------------
  console.log('Test 1: Successful provider response parsing & HeiGIT API contract ([lng, lat], headers, URL)...');
  {
    assert.equal(
      buildOpenRouteServiceDirectionsUrl('https://api.heigit.org'),
      'https://api.heigit.org/openrouteservice/v2/directions/driving-car'
    );
    assert.equal(
      buildOpenRouteServiceDirectionsUrl('https://api.heigit.org/'),
      'https://api.heigit.org/openrouteservice/v2/directions/driving-car'
    );
    assert.equal(
      buildOpenRouteServiceDirectionsUrl('https://api.heigit.org/openrouteservice'),
      'https://api.heigit.org/openrouteservice/v2/directions/driving-car'
    );

    const { fetchFn, calls } = createMockFetch(async () => {
      return new Response(
        JSON.stringify({
          routes: [
            {
              summary: {
                distance: 10840.2,
                duration: 1140.6,
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });

    const adapter = new OpenRouteServiceAdapter({
      apiKey: 'heigit-test-key-12345',
      baseUrl: 'https://api.heigit.org',
      fetchFn,
    });

    const service = new RoadRoutingService({ adapter });
    const result = await service.getProjectRoadRoute(MERLIN_RISE_VERIFIED_ORIGIN, AIRPORT_DESTINATION);

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://api.heigit.org/openrouteservice/v2/directions/driving-car');
    assert.equal(calls[0].init?.method, 'POST');

    const headers = calls[0].init?.headers;
    assert.equal(headers.Authorization, 'heigit-test-key-12345');
    assert.ok(headers['Content-Type'].includes('application/json'));

    // Verify [longitude, latitude] ordering in request payload
    const body = calls[0].parsedBody;
    assert.deepEqual(body.coordinates, [
      [MERLIN_RISE_VERIFIED_ORIGIN.longitude, MERLIN_RISE_VERIFIED_ORIGIN.latitude],
      [AIRPORT_DESTINATION.longitude, AIRPORT_DESTINATION.latitude],
    ]);
    assert.equal(body.instructions, false);
    assert.equal(body.geometry, false);

    assert.equal(result.isRoadRouteAvailable, true);
    assert.equal(result.routeStatus, 'ROUTE_AVAILABLE');
    assert.equal(result.distanceMetric, 'ROAD_ROUTE');
    assert.equal(result.provider, 'OPENROUTESERVICE');
    assert.ok(result.attribution?.includes('openrouteservice.org by HeiGIT'));
    console.log('  ✓ Passed');
  }

  // ---------------------------------------------------------------------------
  // 2. Correct distance and duration conversion
  // ---------------------------------------------------------------------------
  console.log('Test 2: Correct distance (metres -> km rounded to 1 decimal) and duration (seconds -> minutes)...');
  {
    const { fetchFn } = createMockFetch(async () => {
      return new Response(
        JSON.stringify({
          routes: [
            {
              summary: {
                distance: 12356.4, // -> 12.4 km
                duration: 4512.0, // -> 75 mins -> "1 hr 15 mins"
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });

    const adapter = new OpenRouteServiceAdapter({
      apiKey: 'heigit-test-key-12345',
      fetchFn,
    });
    const service = new RoadRoutingService({ adapter });
    const result = await service.getProjectRoadRoute(MERLIN_RISE_VERIFIED_ORIGIN, AIRPORT_DESTINATION);

    assert.equal(result.routeDistanceKm, 12.4);
    assert.equal(result.formattedRouteDistance, '12.4 km');
    assert.equal(result.estimatedDurationSeconds, 4512);
    assert.equal(result.estimatedDurationMinutes, 75);
    assert.equal(result.formattedDuration, '1 hr 15 mins');
    console.log('  ✓ Passed');
  }

  // ---------------------------------------------------------------------------
  // 3. Missing API key
  // ---------------------------------------------------------------------------
  console.log('Test 3: Missing API key returns PROVIDER_UNCONFIGURED without network call...');
  {
    const { fetchFn, calls } = createMockFetch(async () => {
      throw new Error('Should not be called when API key is missing');
    });

    const adapter = new OpenRouteServiceAdapter({
      apiKey: '   ',
      fetchFn,
    });
    assert.equal(adapter.isConfigured(), false);

    const service = new RoadRoutingService({ adapter });
    const result = await service.getProjectRoadRoute(MERLIN_RISE_VERIFIED_ORIGIN, AIRPORT_DESTINATION);

    assert.equal(calls.length, 0);
    assert.equal(result.isRoadRouteAvailable, false);
    assert.equal(result.routeStatus, 'PROVIDER_UNCONFIGURED');
    assert.equal(result.routeDistanceKm, null);
    assert.equal(result.estimatedDurationMinutes, null);
    console.log('  ✓ Passed');
  }

  // ---------------------------------------------------------------------------
  // 4. Authentication failure (401 / 403)
  // ---------------------------------------------------------------------------
  console.log('Test 4: Authentication failure (401 and 403) handled gracefully...');
  {
    for (const statusCode of [401, 403]) {
      const { fetchFn } = createMockFetch(async () => {
        return new Response(
          JSON.stringify({ error: 'Access to this API has been disallowed' }),
          { status: statusCode, headers: { 'Content-Type': 'application/json' } }
        );
      });

      const adapter = new OpenRouteServiceAdapter({
        apiKey: 'invalid-key',
        fetchFn,
      });
      const service = new RoadRoutingService({ adapter });
      const result = await service.getProjectRoadRoute(MERLIN_RISE_VERIFIED_ORIGIN, AIRPORT_DESTINATION);

      assert.equal(result.isRoadRouteAvailable, false);
      assert.equal(result.routeStatus, 'PROVIDER_ERROR');
      assert.equal(result.routeDistanceKm, null);
      assert.equal(result.estimatedDurationMinutes, null);
    }
    console.log('  ✓ Passed');
  }

  // ---------------------------------------------------------------------------
  // 5. Quota exhaustion and rate limiting (429 -> PROVIDER_RATE_LIMITED)
  // ---------------------------------------------------------------------------
  console.log('Test 5: Quota exhaustion and rate limiting (HTTP 429 -> PROVIDER_RATE_LIMITED) handled gracefully...');
  {
    const { fetchFn } = createMockFetch(async () => {
      return new Response(
        JSON.stringify({ message: 'Rate limit exceeded' }),
        { status: 429, headers: { 'Content-Type': 'application/json' } }
      );
    });

    const adapter = new OpenRouteServiceAdapter({
      apiKey: 'valid-key',
      fetchFn,
    });
    const providerRes = await adapter.computeDrivingRoute(
      { latitude: MERLIN_RISE_VERIFIED_ORIGIN.latitude, longitude: MERLIN_RISE_VERIFIED_ORIGIN.longitude },
      { latitude: AIRPORT_DESTINATION.latitude, longitude: AIRPORT_DESTINATION.longitude }
    );
    assert.equal(providerRes.status, 'RATE_LIMITED');
    assert.equal(providerRes.errorCode, 'PROVIDER_RATE_LIMITED');
    assert.equal(providerRes.httpStatus, 429);

    const service = new RoadRoutingService({ adapter });
    const result = await service.getProjectRoadRoute(MERLIN_RISE_VERIFIED_ORIGIN, AIRPORT_DESTINATION);
    assert.equal(result.isRoadRouteAvailable, false);
    assert.equal(result.routeStatus, 'PROVIDER_RATE_LIMITED');
    assert.equal(result.errorCode, 'PROVIDER_RATE_LIMITED');
    assert.equal(result.routeDistanceKm, null);
    console.log('  ✓ Passed');
  }

  // ---------------------------------------------------------------------------
  // 6. Provider server errors (5xx)
  // ---------------------------------------------------------------------------
  console.log('Test 6: Provider server errors (500, 502, 503) handled gracefully...');
  {
    for (const statusCode of [500, 502, 503]) {
      const { fetchFn } = createMockFetch(async () => {
        return new Response('Bad Gateway / Service Unavailable', { status: statusCode });
      });

      const adapter = new OpenRouteServiceAdapter({
        apiKey: 'valid-key',
        fetchFn,
      });
      const service = new RoadRoutingService({ adapter });
      const result = await service.getProjectRoadRoute(MERLIN_RISE_VERIFIED_ORIGIN, AIRPORT_DESTINATION);

      assert.equal(result.isRoadRouteAvailable, false);
      assert.equal(result.routeStatus, 'PROVIDER_ERROR');
      assert.equal(result.routeDistanceKm, null);
    }
    console.log('  ✓ Passed');
  }

  // ---------------------------------------------------------------------------
  // 7. Network timeout
  // ---------------------------------------------------------------------------
  console.log('Test 7: Network timeout aborts cleanly and returns PROVIDER_TIMEOUT...');
  {
    const { fetchFn } = createMockFetch(async (_url, init) => {
      return new Promise((_resolve, reject) => {
        if (init?.signal) {
          if (init.signal.aborted) {
            const abortErr = new Error('The operation was aborted');
            abortErr.name = 'AbortError';
            reject(abortErr);
            return;
          }
          init.signal.addEventListener('abort', () => {
            const abortErr = new Error('The operation was aborted');
            abortErr.name = 'AbortError';
            reject(abortErr);
          });
        }
      });
    });

    const adapter = new OpenRouteServiceAdapter({
      apiKey: 'valid-key',
      defaultTimeoutMs: 25,
      fetchFn,
    });
    const service = new RoadRoutingService({ adapter, timeoutMs: 25 });
    const result = await service.getProjectRoadRoute(MERLIN_RISE_VERIFIED_ORIGIN, AIRPORT_DESTINATION);

    assert.equal(result.isRoadRouteAvailable, false);
    assert.equal(result.routeStatus, 'PROVIDER_TIMEOUT');
    assert.equal(result.routeDistanceKm, null);
    assert.equal(result.estimatedDurationMinutes, null);
    console.log('  ✓ Passed');
  }

  // ---------------------------------------------------------------------------
  // 8. Malformed or incomplete responses & ORS unroutable error codes (2009 / 2010)
  // ---------------------------------------------------------------------------
  console.log('Test 8: Malformed/incomplete HTTP 200 responses (-> INVALID_PROVIDER_RESPONSE) and ORS unroutable codes (2009/2010)...');
  {
    const malformedPayloads = [
      { body: 'not-valid-json{{{', status: 200, expectedStatus: 'INVALID_PROVIDER_RESPONSE' },
      { body: JSON.stringify({ routes: [] }), status: 200, expectedStatus: 'UNROUTABLE' },
      {
        body: JSON.stringify({ routes: [{ summary: {} }] }),
        status: 200,
        expectedStatus: 'INVALID_PROVIDER_RESPONSE',
      },
      {
        body: JSON.stringify({ routes: [{ summary: { distance: 'invalid', duration: 100 } }] }),
        status: 200,
        expectedStatus: 'INVALID_PROVIDER_RESPONSE',
      },
      {
        body: JSON.stringify({ routes: [{ summary: { distance: -10, duration: 100 } }] }),
        status: 200,
        expectedStatus: 'INVALID_PROVIDER_RESPONSE',
      },
      {
        body: JSON.stringify({
          routes: [{ summary: { distance: 1200, duration: 120 } }], // 1.2 km road route < 7.4 km straight line -> physically impossible
        }),
        status: 200,
        expectedStatus: 'INVALID_PROVIDER_RESPONSE',
      },
      {
        body: JSON.stringify({
          error: {
            code: 2010,
            message: 'Could not find routable point within a radius of 350.0 meters of specified coordinate',
          },
        }),
        status: 404,
        expectedStatus: 'UNROUTABLE',
      },
      {
        body: JSON.stringify({
          error: {
            code: 2009,
            message: 'Route could not be found - Unable to find a route between points',
          },
        }),
        status: 404,
        expectedStatus: 'UNROUTABLE',
      },
    ];

    for (const testCase of malformedPayloads) {
      const { fetchFn } = createMockFetch(async () => {
        return new Response(testCase.body, { status: testCase.status });
      });

      const adapter = new OpenRouteServiceAdapter({
        apiKey: 'valid-key',
        fetchFn,
      });
      const service = new RoadRoutingService({ adapter });
      const result = await service.getProjectRoadRoute(MERLIN_RISE_VERIFIED_ORIGIN, AIRPORT_DESTINATION);

      assert.equal(result.isRoadRouteAvailable, false);
      assert.equal(result.routeStatus, testCase.expectedStatus);
      assert.equal(result.routeDistanceKm, null);
      assert.equal(result.estimatedDurationMinutes, null);
    }
    console.log('  ✓ Passed');
  }

  // ---------------------------------------------------------------------------
  // 9. Invalid coordinates
  // ---------------------------------------------------------------------------
  console.log('Test 9: Invalid coordinates rejected before any network call...');
  {
    const { fetchFn, calls } = createMockFetch(async () => {
      throw new Error('Should not call fetch for invalid coordinates');
    });

    const adapter = new OpenRouteServiceAdapter({
      apiKey: 'valid-key',
      fetchFn,
    });

    // Direct adapter invocation with invalid coordinates
    const directRes = await adapter.computeDrivingRoute(
      { latitude: Number.NaN, longitude: 88.5 },
      { latitude: 22.65, longitude: 88.44 }
    );
    assert.equal(directRes.status, 'ERROR');

    // Null Island (0, 0) rejected by service
    const service = new RoadRoutingService({ adapter });
    const nullIslandRes = await service.getProjectRoadRoute(MERLIN_RISE_VERIFIED_ORIGIN, {
      destinationId: 'null-island',
      latitude: 0,
      longitude: 0,
    });
    assert.equal(nullIslandRes.isRoadRouteAvailable, false);
    assert.equal(nullIslandRes.routeStatus, 'DESTINATION_UNAVAILABLE');
    assert.equal(calls.length, 0);
    console.log('  ✓ Passed');
  }

  // ---------------------------------------------------------------------------
  // 10. Approximate project coordinates rejected for exact routing
  // ---------------------------------------------------------------------------
  console.log('Test 10: Approximate project coordinates (APPROXIMATE_LOCATION) rejected for exact routing...');
  {
    const { fetchFn, calls } = createMockFetch(async () => {
      throw new Error('Provider must NOT be called for approximate locality coordinates');
    });

    const adapter = new OpenRouteServiceAdapter({
      apiKey: 'valid-key',
      fetchFn,
    });
    const service = new RoadRoutingService({ adapter });

    const result = await service.getProjectRoadRoute(
      APPROXIMATE_LOCALITY_ORIGIN,
      AIRPORT_DESTINATION
    );

    assert.equal(calls.length, 0);
    assert.equal(result.isRoadRouteAvailable, false);
    assert.equal(result.routeStatus, 'ORIGIN_APPROXIMATE_NOT_ELIGIBLE');
    assert.equal(result.originLocationStatus, 'APPROXIMATE_LOCATION');
    assert.equal(result.originCoordinateSource, 'LOCATION');
    assert.equal(result.routeDistanceKm, null);
    assert.equal(result.geodesicDistanceKm, null);
    assert.equal(result.distanceMetric, 'UNAVAILABLE');
    console.log('  ✓ Passed');
  }

  // ---------------------------------------------------------------------------
  // 11. Missing road distance never replaced by geodesic distance
  // ---------------------------------------------------------------------------
  console.log('Test 11: Missing road distance is never silently replaced by geodesic distance...');
  {
    const { fetchFn } = createMockFetch(async () => {
      return new Response(JSON.stringify({ error: 'Upstream routing failure' }), { status: 503 });
    });

    const adapter = new OpenRouteServiceAdapter({
      apiKey: 'valid-key',
      fetchFn,
    });
    const service = new RoadRoutingService({ adapter });

    const result = await service.getProjectRoadRoute(
      MERLIN_RISE_VERIFIED_ORIGIN,
      AIRPORT_DESTINATION
    );

    assert.equal(result.isRoadRouteAvailable, false);
    assert.equal(result.routeDistanceKm, null);
    assert.equal(result.formattedRouteDistance, null);
    assert.equal(result.estimatedDurationMinutes, null);
    assert.equal(result.formattedDuration, null);
    // Geodesic fallback is explicitly labeled as GEODESIC_STRAIGHT_LINE in separate fields
    assert.equal(result.distanceMetric, 'GEODESIC_STRAIGHT_LINE');
    assert.equal(result.geodesicDistanceKm, 7.4);
    assert.notEqual(result.routeDistanceKm, result.geodesicDistanceKm);
    console.log('  ✓ Passed');
  }

  // ---------------------------------------------------------------------------
  // 12. Cache-key invalidation when coordinates change
  // ---------------------------------------------------------------------------
  console.log('Test 12: Cache-key invalidation when project or destination coordinates change...');
  {
    let callCount = 0;
    const { fetchFn } = createMockFetch(async () => {
      callCount += 1;
      return new Response(
        JSON.stringify({
          routes: [
            {
              summary: {
                distance: 10000 + callCount * 500,
                duration: 900 + callCount * 60,
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });

    const adapter = new OpenRouteServiceAdapter({ apiKey: 'valid-key', fetchFn });
    const service = new RoadRoutingService({ adapter, requestedCacheTtlSeconds: 3600 });

    const res1 = await service.getProjectRoadRoute(MERLIN_RISE_VERIFIED_ORIGIN, AIRPORT_DESTINATION);
    assert.equal(callCount, 1);
    assert.equal(res1.cache.status, 'MISS');

    // Second request with identical coordinates hits cache
    const res2 = await service.getProjectRoadRoute(MERLIN_RISE_VERIFIED_ORIGIN, AIRPORT_DESTINATION);
    assert.equal(callCount, 1);
    assert.equal(res2.cache.status, 'HIT');
    assert.equal(res2.routeDistanceKm, res1.routeDistanceKm);

    // Updating project coordinates invalidates the cache key automatically
    const updatedOrigin = {
      ...MERLIN_RISE_VERIFIED_ORIGIN,
      projectLatitude: 22.6285,
      projectLongitude: 88.5142,
      latitude: 22.6285,
      longitude: 88.5142,
    };
    const res3 = await service.getProjectRoadRoute(updatedOrigin, AIRPORT_DESTINATION);
    assert.equal(callCount, 2);
    assert.equal(res3.cache.status, 'MISS');
    assert.notEqual(res3.cache.key, res1.cache.key);
    assert.notEqual(res3.routeDistanceKm, res1.routeDistanceKm);
    console.log('  ✓ Passed');
  }

  // ---------------------------------------------------------------------------
  // 13. Daily budget enforcement under concurrent requests
  // ---------------------------------------------------------------------------
  console.log('Test 13: Daily budget enforcement under concurrent requests...');
  {
    let providerCalls = 0;
    const { fetchFn } = createMockFetch(async () => {
      providerCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 15));
      return new Response(
        JSON.stringify({
          routes: [{ summary: { distance: 10500, duration: 780 } }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });

    const adapter = new OpenRouteServiceAdapter({ apiKey: 'valid-key', fetchFn });
    const service = new RoadRoutingService({
      adapter,
      maxRequestsPerDay: 3,
      maxRequestsPerMinute: 100,
    });

    // Fire 10 concurrent route requests for 10 distinct destinations
    const destinations = Array.from({ length: 10 }, (_, idx) => ({
      destinationId: `concurrent-place-${idx}`,
      latitude: 22.65 + idx * 0.002,
      longitude: 88.44 + idx * 0.002,
    }));

    const results = await Promise.all(
      destinations.map((dest) => service.getProjectRoadRoute(MERLIN_RISE_VERIFIED_ORIGIN, dest))
    );

    const availableCount = results.filter((r) => r.routeStatus === 'ROUTE_AVAILABLE').length;
    const budgetExceededCount = results.filter(
      (r) =>
        r.routeStatus === 'APPLICATION_BUDGET_EXCEEDED' &&
        r.errorCode === 'APPLICATION_BUDGET_EXCEEDED'
    ).length;

    assert.equal(providerCalls, 3, 'Expected exactly 3 provider calls under concurrent execution');
    assert.equal(availableCount, 3, 'Expected exactly 3 successful route responses');
    assert.equal(budgetExceededCount, 7, 'Expected remaining 7 concurrent requests to be blocked by APPLICATION_BUDGET_EXCEEDED');
    console.log('  ✓ Passed');
  }

  // ---------------------------------------------------------------------------
  // 14. Provider disabled by default even when OPENROUTESERVICE_API_KEY is present
  // ---------------------------------------------------------------------------
  console.log('Test 14: Provider disabled by default (ROAD_ROUTING_PROVIDER=none)...');
  {
    const prevProvider = process.env.ROAD_ROUTING_PROVIDER;
    const prevKey = process.env.OPENROUTESERVICE_API_KEY;

    try {
      delete process.env.ROAD_ROUTING_PROVIDER;
      process.env.OPENROUTESERVICE_API_KEY = 'secret-heigit-key-should-not-activate-automatically';
      resetConfigCacheForTesting();

      const cfg = validateAndGetConfig();
      assert.equal(cfg.roadRoutingProvider, 'none');
      assert.equal(cfg.openRouteServiceBaseUrl, 'https://api.heigit.org');

      const { fetchFn, calls } = createMockFetch(async () => {
        throw new Error('Should not be called when ROAD_ROUTING_PROVIDER defaults to none');
      });

      const configuredService = createConfiguredRoadRoutingService({ fetchFn });
      assert.equal(configuredService.getDiagnostics().isConfigured, false);
      assert.equal(configuredService.getProviderId(), 'NONE');

      const res = await configuredService.getProjectRoadRoute(
        MERLIN_RISE_VERIFIED_ORIGIN,
        AIRPORT_DESTINATION
      );
      assert.equal(calls.length, 0);
      assert.equal(res.routeStatus, 'PROVIDER_UNCONFIGURED');

      // Now verify enabling ROAD_ROUTING_PROVIDER="openrouteservice" wires OpenRouteServiceAdapter
      process.env.ROAD_ROUTING_PROVIDER = 'openrouteservice';
      resetConfigCacheForTesting();
      const { fetchFn: activeFetch, calls: activeCalls } = createMockFetch(async () => {
        return new Response(
          JSON.stringify({
            routes: [{ summary: { distance: 9200, duration: 840 } }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      });

      const activeService = createConfiguredRoadRoutingService({ fetchFn: activeFetch });
      assert.equal(activeService.getDiagnostics().isConfigured, true);
      assert.equal(activeService.getProviderId(), 'OPENROUTESERVICE');

      const activeRes = await activeService.getProjectRoadRoute(
        MERLIN_RISE_VERIFIED_ORIGIN,
        AIRPORT_DESTINATION
      );
      assert.equal(activeCalls.length, 1);
      assert.equal(activeRes.isRoadRouteAvailable, true);
      assert.equal(activeRes.routeDistanceKm, 9.2);
    } finally {
      if (prevProvider === undefined) {
        delete process.env.ROAD_ROUTING_PROVIDER;
      } else {
        process.env.ROAD_ROUTING_PROVIDER = prevProvider;
      }
      if (prevKey === undefined) {
        delete process.env.OPENROUTESERVICE_API_KEY;
      } else {
        process.env.OPENROUTESERVICE_API_KEY = prevKey;
      }
      resetConfigCacheForTesting();
    }
    console.log('  ✓ Passed');
  }

  // ---------------------------------------------------------------------------
  // 15. API key never appearing in client-visible output or error messages
  // ---------------------------------------------------------------------------
  console.log('Test 15: API key never appears in client-visible RoadRouteResult or sanitized errors...');
  {
    const secretKey = 'super-secret-heigit-key-99887766';

    // Direct sanitizer check
    const rawError = `Request failed for key ${secretKey} at https://api.heigit.org`;
    const sanitized = sanitizeProviderErrorMessage(rawError, secretKey);
    assert.ok(!sanitized.includes(secretKey), 'Sanitized error message must not contain the API key');
    assert.ok(sanitized.includes('[REDACTED_API_KEY]'));

    // Adapter error when upstream echoes back the secret key in error payload
    const { fetchFn: errorFetch } = createMockFetch(async () => {
      return new Response(
        JSON.stringify({
          error: {
            message: `Invalid token ${secretKey} rejected by gateway`,
          },
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    });

    const errorAdapter = new OpenRouteServiceAdapter({
      apiKey: secretKey,
      fetchFn: errorFetch,
    });
    const rawProviderRes = await errorAdapter.computeDrivingRoute(
      { latitude: MERLIN_RISE_VERIFIED_ORIGIN.latitude, longitude: MERLIN_RISE_VERIFIED_ORIGIN.longitude },
      { latitude: AIRPORT_DESTINATION.latitude, longitude: AIRPORT_DESTINATION.longitude }
    );
    assert.ok(
      !JSON.stringify(rawProviderRes).includes(secretKey),
      'ProviderRouteResponse must never leak the raw API key'
    );

    const errorService = new RoadRoutingService({ adapter: errorAdapter });
    const errorRouteResult = await errorService.getProjectRoadRoute(
      MERLIN_RISE_VERIFIED_ORIGIN,
      AIRPORT_DESTINATION
    );
    assert.ok(
      !JSON.stringify(errorRouteResult).includes(secretKey),
      'Failed RoadRouteResult must never contain the API key'
    );

    // Also verify successful RoadRouteResult and service diagnostics never contain the API key
    const { fetchFn: successFetch } = createMockFetch(async () => {
      return new Response(
        JSON.stringify({
          routes: [{ summary: { distance: 10800, duration: 1100 } }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });
    const successAdapter = new OpenRouteServiceAdapter({
      apiKey: secretKey,
      fetchFn: successFetch,
    });
    const successService = new RoadRoutingService({ adapter: successAdapter });
    const successRouteResult = await successService.getProjectRoadRoute(
      MERLIN_RISE_VERIFIED_ORIGIN,
      AIRPORT_DESTINATION
    );
    const diagnostics = successService.getDiagnostics();

    assert.ok(
      !JSON.stringify(successRouteResult).includes(secretKey),
      'Successful RoadRouteResult must never contain the API key'
    );
    assert.ok(
      !JSON.stringify(diagnostics).includes(secretKey),
      'Service diagnostics must never contain the API key'
    );
    console.log('  ✓ Passed');
  }

  console.log('\nAll 15 Phase 3 OpenRouteService / HeiGIT adapter tests passed!');
}

runTests().catch((err) => {
  console.error('Phase 3 test suite failed:', err);
  process.exit(1);
});
