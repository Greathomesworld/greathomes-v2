import {
  calculateGeodesicDistanceKm,
  formatDistanceKm,
  LatLng,
} from '../spatial/distance';
import {
  resolveProjectCoordinates,
  validateCoordinatePair,
} from '../../projects/viewModels/projectLocationViewModel';
import {
  DistanceCalculationMethod,
  ProjectRouteOriginInput,
  PROVIDER_CACHE_POLICIES,
  ProviderRouteErrorCode,
  ProviderRouteResponse,
  RoadRouteResult,
  RoadRoutingProviderAdapter,
  RouteAvailabilityStatus,
  RouteCoordinateEligibilityResult,
  RouteDestinationInput,
  RoutingProviderId,
} from './types';
import { validateAndGetConfig } from '../../../lib/config';
import {
  OpenRouteServiceAdapter,
  OpenRouteServiceAdapterOptions,
  buildOpenRouteServiceDirectionsUrl,
  sanitizeProviderErrorMessage,
} from './openRouteServiceAdapter';

export {
  OpenRouteServiceAdapter,
  type OpenRouteServiceAdapterOptions,
  buildOpenRouteServiceDirectionsUrl,
  sanitizeProviderErrorMessage,
};

/**
 * Formats driving duration in seconds into a concise human-readable label.
 * Examples:
 * - 45 -> "1 min"
 * - 720 -> "12 mins"
 * - 3600 -> "1 hr"
 * - 4500 -> "1 hr 15 mins"
 */
export function formatDrivingDuration(durationSeconds?: number | null): string | null {
  if (
    durationSeconds === null ||
    durationSeconds === undefined ||
    typeof durationSeconds !== 'number' ||
    !Number.isFinite(durationSeconds) ||
    durationSeconds < 0
  ) {
    return null;
  }

  const totalMinutes = Math.max(1, Math.round(durationSeconds / 60));
  if (totalMinutes < 60) {
    return totalMinutes === 1 ? '1 min' : `${totalMinutes} mins`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  const hrLabel = hours === 1 ? '1 hr' : `${hours} hrs`;
  if (mins === 0) {
    return hrLabel;
  }
  return `${hrLabel} ${mins} ${mins === 1 ? 'min' : 'mins'}`;
}

/**
 * Canonicalizes a coordinate to 6 decimal places (~0.11m precision) for cache keys.
 * Ensures that any meaningful coordinate update invalidates cached routes automatically.
 */
export function canonicalizeCoord(value: number): string {
  return value.toFixed(6);
}

/**
 * Builds a deterministic, coordinate-sensitive cache key for a route request.
 * Any change to origin or destination coordinates produces a distinct key,
 * preventing stale routes from being served after coordinate updates.
 */
export function buildRouteCacheKey(params: {
  provider: RoutingProviderId;
  origin: LatLng;
  destination: LatLng;
  originId?: string;
  destinationId?: string;
}): string {
  const origKey = `${canonicalizeCoord(params.origin.latitude)},${canonicalizeCoord(
    params.origin.longitude
  )}`;
  const destKey = `${canonicalizeCoord(params.destination.latitude)},${canonicalizeCoord(
    params.destination.longitude
  )}`;
  const origPrefix = params.originId ? `${params.originId}@` : '';
  const destPrefix = params.destinationId ? `${params.destinationId}@` : '';
  return `route:v1:${params.provider}:DRIVING_CAR:${origPrefix}${origKey}->${destPrefix}${destKey}`;
}

/**
 * Resolves the effective cache TTL in seconds, strictly bounded by the provider's
 * documented Terms of Service maximum retention limit.
 */
export function resolveEffectiveCacheTtlSeconds(
  provider: RoutingProviderId,
  requestedTtlSeconds?: number | null
): number {
  const policy = PROVIDER_CACHE_POLICIES[provider] || PROVIDER_CACHE_POLICIES.NONE;
  if (!policy.allowCaching || policy.maxPermittedTtlSeconds <= 0) {
    return 0;
  }

  const candidate =
    requestedTtlSeconds !== undefined &&
    requestedTtlSeconds !== null &&
    Number.isFinite(requestedTtlSeconds) &&
    requestedTtlSeconds >= 0
      ? Math.floor(requestedTtlSeconds)
      : policy.defaultTtlSeconds;

  return Math.min(candidate, policy.maxPermittedTtlSeconds);
}

/**
 * Evaluates whether a project origin and destination are eligible for exact
 * project-specific road-route calculation (Phase 2 Section 5).
 *
 * Rules:
 * 1. Only VERIFIED_PROJECT_LOCATION origins are eligible for exact project road routes.
 * 2. APPROXIMATE_LOCATION origins (e.g. locality centroid fallbacks) are explicitly rejected
 *    with ORIGIN_APPROXIMATE_NOT_ELIGIBLE so locality routes are never presented as project routes.
 * 3. LOCATION_UNAVAILABLE origins return ORIGIN_UNAVAILABLE.
 * 4. Missing or invalid destination coordinates return DESTINATION_UNAVAILABLE.
 */
export function evaluateProjectRouteEligibility(
  originInput?: ProjectRouteOriginInput | null,
  destinationInput?: RouteDestinationInput | null
): RouteCoordinateEligibilityResult {
  if (!originInput) {
    return {
      eligible: false,
      locationStatus: 'LOCATION_UNAVAILABLE',
      coordinateSource: 'NONE',
      originCoordinates: null,
      destinationCoordinates: null,
      rejectionStatus: 'ORIGIN_UNAVAILABLE',
      disclosureMessage: 'Project location coordinates are pending verification.',
    };
  }

  const resolvedOrigin = resolveProjectCoordinates(originInput, originInput.location);

  // Explicit override check if caller already supplied locationStatus
  const effectiveLocationStatus =
    originInput.locationStatus ?? resolvedOrigin.locationStatus;
  const effectiveCoordinateSource =
    originInput.coordinateSource ?? resolvedOrigin.source;

  if (
    effectiveLocationStatus === 'LOCATION_UNAVAILABLE' ||
    effectiveCoordinateSource === 'NONE'
  ) {
    return {
      eligible: false,
      locationStatus: 'LOCATION_UNAVAILABLE',
      coordinateSource: 'NONE',
      originCoordinates: null,
      destinationCoordinates: null,
      rejectionStatus: 'ORIGIN_UNAVAILABLE',
      disclosureMessage: 'Project location coordinates are pending verification.',
    };
  }

  if (
    effectiveLocationStatus === 'APPROXIMATE_LOCATION' ||
    effectiveCoordinateSource === 'LOCATION' ||
    originInput.hasVerifiedProjectCoordinates === false
  ) {
    const locName = originInput.location?.name;
    return {
      eligible: false,
      locationStatus: 'APPROXIMATE_LOCATION',
      coordinateSource: 'LOCATION',
      originCoordinates: null,
      destinationCoordinates: null,
      rejectionStatus: 'ORIGIN_APPROXIMATE_NOT_ELIGIBLE',
      disclosureMessage: locName
        ? `Only approximate locality coordinates (${locName}) are available. Exact project-site road distances are pending verification.`
        : 'Only approximate locality coordinates are available. Exact project-site road distances are pending verification.',
    };
  }

  if (
    effectiveLocationStatus !== 'VERIFIED_PROJECT_LOCATION' ||
    !resolvedOrigin.hasVerifiedProjectCoordinates ||
    resolvedOrigin.latitude === null ||
    resolvedOrigin.longitude === null
  ) {
    return {
      eligible: false,
      locationStatus: 'LOCATION_UNAVAILABLE',
      coordinateSource: 'NONE',
      originCoordinates: null,
      destinationCoordinates: null,
      rejectionStatus: 'ORIGIN_UNAVAILABLE',
      disclosureMessage: 'Project location coordinates are pending verification.',
    };
  }

  const destValidation = validateCoordinatePair(
    destinationInput?.latitude,
    destinationInput?.longitude
  );

  if (
    !destValidation.valid ||
    destValidation.latitude === null ||
    destValidation.longitude === null
  ) {
    return {
      eligible: false,
      locationStatus: 'VERIFIED_PROJECT_LOCATION',
      coordinateSource: 'PROJECT',
      originCoordinates: {
        latitude: resolvedOrigin.latitude,
        longitude: resolvedOrigin.longitude,
      },
      destinationCoordinates: null,
      rejectionStatus: 'DESTINATION_UNAVAILABLE',
      disclosureMessage: 'Destination coordinates are unavailable or invalid.',
    };
  }

  return {
    eligible: true,
    locationStatus: 'VERIFIED_PROJECT_LOCATION',
    coordinateSource: 'PROJECT',
    originCoordinates: {
      latitude: resolvedOrigin.latitude,
      longitude: resolvedOrigin.longitude,
    },
    destinationCoordinates: {
      latitude: destValidation.latitude,
      longitude: destValidation.longitude,
    },
    rejectionStatus: null,
    disclosureMessage: null,
  };
}

/**
 * Validates raw provider route metrics against physical and numerical sanity bounds.
 * Rejects NaN, Infinity, negative numbers, zero distances for distinct points,
 * or road distances shorter than straight-line geodesic distance (with 0.15 km rounding tolerance).
 */
export function validateProviderRouteMetrics(
  response: ProviderRouteResponse | null | undefined,
  origin: LatLng,
  destination: LatLng
): {
  valid: boolean;
  routeDistanceKm: number | null;
  estimatedDurationSeconds: number | null;
  estimatedDurationMinutes: number | null;
} {
  if (!response || response.status !== 'OK') {
    return {
      valid: false,
      routeDistanceKm: null,
      estimatedDurationSeconds: null,
      estimatedDurationMinutes: null,
    };
  }

  const distMeters = response.distanceMeters;
  const durSeconds = response.durationSeconds;

  if (
    typeof distMeters !== 'number' ||
    typeof durSeconds !== 'number' ||
    !Number.isFinite(distMeters) ||
    !Number.isFinite(durSeconds) ||
    distMeters < 0 ||
    durSeconds < 0
  ) {
    return {
      valid: false,
      routeDistanceKm: null,
      estimatedDurationSeconds: null,
      estimatedDurationMinutes: null,
    };
  }

  const geodesicKm = calculateGeodesicDistanceKm(origin, destination) ?? 0;

  // If points are meaningfully distinct (> 100m apart), distance and duration must be > 0
  if (geodesicKm > 0.1 && (distMeters <= 0 || durSeconds <= 0)) {
    return {
      valid: false,
      routeDistanceKm: null,
      estimatedDurationSeconds: null,
      estimatedDurationMinutes: null,
    };
  }

  // Physical upper bound sanity check (500 km / 24 hours for regional connectivity)
  if (distMeters > 500_000 || durSeconds > 86_400) {
    return {
      valid: false,
      routeDistanceKm: null,
      estimatedDurationSeconds: null,
      estimatedDurationMinutes: null,
    };
  }

  const rawRoadKm = distMeters / 1000.0;

  // Road distance cannot be physically shorter than straight-line geodesic distance (allowing 0.15 km tolerance for snapping/rounding)
  if (geodesicKm > 0.3 && rawRoadKm + 0.15 < geodesicKm) {
    return {
      valid: false,
      routeDistanceKm: null,
      estimatedDurationSeconds: null,
      estimatedDurationMinutes: null,
    };
  }

  const routeDistanceKm = Math.round(rawRoadKm * 10) / 10;
  const estimatedDurationSeconds = Math.round(durSeconds);
  const estimatedDurationMinutes =
    estimatedDurationSeconds > 0 ? Math.max(1, Math.round(estimatedDurationSeconds / 60)) : 0;

  return {
    valid: true,
    routeDistanceKm,
    estimatedDurationSeconds,
    estimatedDurationMinutes,
  };
}

interface CachedRouteEntry {
  key: string;
  originId?: string;
  provider: RoutingProviderId;
  routeDistanceKm: number;
  estimatedDurationSeconds: number;
  estimatedDurationMinutes: number;
  calculatedAt: string;
  cachedAtMs: number;
  expiresAtMs: number;
  maxCacheAgeSeconds: number;
}

/**
 * Default No-Op Provider Adapter when no external road-routing provider is enabled.
 */
export class UnconfiguredRoadRoutingAdapter implements RoadRoutingProviderAdapter {
  public readonly providerId: RoutingProviderId = 'NONE';

  isConfigured(): boolean {
    return false;
  }

  async computeDrivingRoute(): Promise<ProviderRouteResponse> {
    return {
      status: 'ERROR',
      errorMessage: 'No road-routing provider is currently configured.',
    };
  }
}

export interface RoadRoutingServiceOptions {
  adapter?: RoadRoutingProviderAdapter;
  requestedCacheTtlSeconds?: number | null;
  timeoutMs?: number;
  maxRequestsPerMinute?: number;
  maxRequestsPerDay?: number;
  maxCacheEntries?: number;
  nowFn?: () => number;
}

/**
 * Provider-Independent Server-Side Road-Routing Service (Phase 2–4 Hardened).
 *
 * Guarantees:
 * 1. Enforces Phase 1 coordinate eligibility: only VERIFIED_PROJECT_LOCATION origins can request exact road routes.
 * 2. Strictly separates ROAD_ROUTE distance from GEODESIC_STRAIGHT_LINE distance.
 * 3. Never substitutes geodesic distance as road distance when a provider fails or is unconfigured.
 * 4. Enforces provider-specific cache retention policies, coordinate-change invalidation,
 *    bounded LRU memory cap (`maxCacheEntries`), in-flight request deduplication, and operational rate/budget controls.
 *
 * Multi-Instance / Serverless Note:
 * `minuteRequestCount`, `dayRequestCount`, `cache`, and `inFlight` are process-local in-memory state
 * within each Node.js runtime instance. Across horizontally scaled serverless instances, each cold instance
 * maintains its own local budget and cache unless backed by an external shared store. Upstream HTTP 429
 * responses are explicitly caught and mapped to `PROVIDER_RATE_LIMITED` with safe geodesic fallback.
 */
export class RoadRoutingService {
  private adapter: RoadRoutingProviderAdapter;
  private requestedCacheTtlSeconds: number | null | undefined;
  private timeoutMs: number;
  private maxRequestsPerMinute: number;
  private maxRequestsPerDay: number;
  private maxCacheEntries: number;
  private nowFn: () => number;

  private cache = new Map<string, CachedRouteEntry>();
  private inFlight = new Map<string, Promise<RoadRouteResult>>();
  private evictedCacheCount = 0;

  private minuteWindowStartMs = 0;
  private minuteRequestCount = 0;
  private dayWindowStartMs = 0;
  private dayRequestCount = 0;

  constructor(options?: RoadRoutingServiceOptions) {
    this.adapter = options?.adapter ?? new UnconfiguredRoadRoutingAdapter();
    this.requestedCacheTtlSeconds = options?.requestedCacheTtlSeconds;
    this.timeoutMs = options?.timeoutMs ?? 2000;
    this.maxRequestsPerMinute = options?.maxRequestsPerMinute ?? 40;
    this.maxRequestsPerDay = options?.maxRequestsPerDay ?? 1500;
    this.maxCacheEntries =
      options?.maxCacheEntries !== undefined &&
      Number.isFinite(options.maxCacheEntries) &&
      options.maxCacheEntries >= 1
        ? Math.floor(options.maxCacheEntries)
        : 500;
    this.nowFn = options?.nowFn ?? (() => Date.now());
  }

  /**
   * Returns the active provider identifier.
   */
  getProviderId(): RoutingProviderId {
    return this.adapter.providerId;
  }

  /**
   * Returns true when a real routing provider adapter is configured and ready.
   */
  isProviderConfigured(): boolean {
    return this.adapter.providerId !== 'NONE' && this.adapter.isConfigured();
  }

  /**
   * Invalidates all cached routes associated with a specific project/origin ID.
   */
  invalidateProjectRoutes(projectId: string): number {
    let removed = 0;
    for (const [key, entry] of this.cache.entries()) {
      if (entry.originId === projectId || key.includes(`:${projectId}@`)) {
        this.cache.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  /**
   * Clears the entire route cache.
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Prunes expired entries and evicts oldest LRU entries if cache exceeds maxCacheEntries.
   */
  private pruneAndEvictCache(nowMs: number, incomingCount: number = 0): void {
    for (const [key, entry] of this.cache.entries()) {
      if (nowMs > entry.expiresAtMs) {
        this.cache.delete(key);
      }
    }

    const targetMax = Math.max(0, this.maxCacheEntries - incomingCount);
    while (this.cache.size > targetMax) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey === undefined) break;
      this.cache.delete(oldestKey);
      this.evictedCacheCount += 1;
    }
  }

  /**
   * Returns current cache and quota telemetry for diagnostics and tests.
   */
  getDiagnostics(): {
    provider: RoutingProviderId;
    isConfigured: boolean;
    cacheSize: number;
    maxCacheEntries: number;
    evictedCacheCount: number;
    inFlightCount: number;
    effectiveCacheTtlSeconds: number;
    minuteRequestCount: number;
    dayRequestCount: number;
    isProcessLocalState: boolean;
  } {
    return {
      provider: this.adapter.providerId,
      isConfigured: this.adapter.isConfigured(),
      cacheSize: this.cache.size,
      maxCacheEntries: this.maxCacheEntries,
      evictedCacheCount: this.evictedCacheCount,
      inFlightCount: this.inFlight.size,
      effectiveCacheTtlSeconds: resolveEffectiveCacheTtlSeconds(
        this.adapter.providerId,
        this.requestedCacheTtlSeconds
      ),
      minuteRequestCount: this.minuteRequestCount,
      dayRequestCount: this.dayRequestCount,
      isProcessLocalState: true,
    };
  }

  private checkAndIncrementBudget(): boolean {
    const now = this.nowFn();
    if (now - this.minuteWindowStartMs >= 60_000) {
      this.minuteWindowStartMs = now;
      this.minuteRequestCount = 0;
    }
    if (now - this.dayWindowStartMs >= 86_400_000) {
      this.dayWindowStartMs = now;
      this.dayRequestCount = 0;
    }

    if (
      this.minuteRequestCount >= this.maxRequestsPerMinute ||
      this.dayRequestCount >= this.maxRequestsPerDay
    ) {
      return false;
    }

    this.minuteRequestCount += 1;
    this.dayRequestCount += 1;
    return true;
  }

  /**
   * Resolves a road route from a project origin to a destination POI.
   * Never fabricates road distance from straight-line geodesic distance.
   */
  async getProjectRoadRoute(
    originInput: ProjectRouteOriginInput | null | undefined,
    destinationInput: RouteDestinationInput | null | undefined,
    options?: { bypassCache?: boolean; timeoutMs?: number }
  ): Promise<RoadRouteResult> {
    const eligibility = evaluateProjectRouteEligibility(originInput, destinationInput);

    // Case 1: Origin or Destination is NOT eligible for exact project-specific road routing
    if (
      !eligibility.eligible ||
      !eligibility.originCoordinates ||
      !eligibility.destinationCoordinates
    ) {
      return {
        isRoadRouteAvailable: false,
        routeStatus: eligibility.rejectionStatus ?? 'ORIGIN_UNAVAILABLE',
        errorCode: null,
        distanceMetric: 'UNAVAILABLE',
        provider: 'NONE',
        routeDistanceKm: null,
        formattedRouteDistance: null,
        estimatedDurationMinutes: null,
        estimatedDurationSeconds: null,
        formattedDuration: null,
        geodesicDistanceKm: null,
        formattedGeodesicDistance: null,
        originLocationStatus: eligibility.locationStatus,
        originCoordinateSource: eligibility.coordinateSource,
        calculatedAt: null,
        cache: {
          status: 'NOT_APPLICABLE',
          key: null,
          cachedAt: null,
          expiresAt: null,
          maxCacheAgeSeconds: null,
        },
        attribution: null,
        disclosureMessage: eligibility.disclosureMessage,
      };
    }

    const origin = eligibility.originCoordinates;
    const destination = eligibility.destinationCoordinates;
    const geodesicKm = calculateGeodesicDistanceKm(origin, destination);
    const formattedGeodesic =
      geodesicKm !== null ? `${formatDistanceKm(geodesicKm)} (straight-line)` : null;

    const providerId = this.adapter.providerId;
    const policy = PROVIDER_CACHE_POLICIES[providerId] || PROVIDER_CACHE_POLICIES.NONE;
    const effectiveTtlSeconds = resolveEffectiveCacheTtlSeconds(
      providerId,
      this.requestedCacheTtlSeconds
    );

    // Case 2: Provider is unconfigured / disabled
    if (providerId === 'NONE' || !this.adapter.isConfigured()) {
      return this.buildFallbackUnavailableRoute({
        routeStatus: 'PROVIDER_UNCONFIGURED',
        errorCode: 'UNCONFIGURED',
        provider: providerId,
        geodesicKm,
        formattedGeodesic,
        cacheStatus: 'NOT_APPLICABLE',
        cacheKey: null,
        disclosureMessage:
          'Road-route provider is not configured; displaying verified straight-line geodesic distance only.',
      });
    }

    const cacheKey = buildRouteCacheKey({
      provider: providerId,
      origin,
      destination,
      originId: originInput?.projectId || originInput?.projectSlug,
      destinationId: destinationInput?.destinationId,
    });

    const nowMs = this.nowFn();

    // Case 3: Check Cache (unless bypassed or caching disabled)
    if (!options?.bypassCache && effectiveTtlSeconds > 0) {
      const cached = this.cache.get(cacheKey);
      if (cached) {
        if (nowMs <= cached.expiresAtMs) {
          // Promote in Map insertion order to maintain LRU ordering
          this.cache.delete(cacheKey);
          this.cache.set(cacheKey, cached);
          return {
            isRoadRouteAvailable: true,
            routeStatus: 'ROUTE_AVAILABLE',
            errorCode: null,
            distanceMetric: 'ROAD_ROUTE',
            provider: cached.provider,
            routeDistanceKm: cached.routeDistanceKm,
            formattedRouteDistance: formatDistanceKm(cached.routeDistanceKm),
            estimatedDurationMinutes: cached.estimatedDurationMinutes,
            estimatedDurationSeconds: cached.estimatedDurationSeconds,
            formattedDuration: formatDrivingDuration(cached.estimatedDurationSeconds),
            geodesicDistanceKm: geodesicKm,
            formattedGeodesicDistance: formattedGeodesic,
            originLocationStatus: 'VERIFIED_PROJECT_LOCATION',
            originCoordinateSource: 'PROJECT',
            calculatedAt: cached.calculatedAt,
            cache: {
              status: 'HIT',
              key: cacheKey,
              cachedAt: new Date(cached.cachedAtMs).toISOString(),
              expiresAt: new Date(cached.expiresAtMs).toISOString(),
              maxCacheAgeSeconds: cached.maxCacheAgeSeconds,
            },
            attribution: policy.requiredAttribution,
            disclosureMessage: null,
          };
        } else {
          this.cache.delete(cacheKey);
        }
      }
    }

    // Case 4: In-Flight Request Deduplication
    const existingInFlight = this.inFlight.get(cacheKey);
    if (existingInFlight) {
      return existingInFlight;
    }

    const executionPromise = this.executeProviderRouteRequest({
      cacheKey,
      originId: originInput?.projectId || originInput?.projectSlug,
      providerId,
      policy,
      effectiveTtlSeconds,
      origin,
      destination,
      geodesicKm,
      formattedGeodesic,
      bypassCache: Boolean(options?.bypassCache),
      timeoutMs: options?.timeoutMs,
    });

    this.inFlight.set(cacheKey, executionPromise);
    try {
      return await executionPromise;
    } finally {
      this.inFlight.delete(cacheKey);
    }
  }

  private async executeProviderRouteRequest(params: {
    cacheKey: string;
    originId?: string;
    providerId: RoutingProviderId;
    policy: (typeof PROVIDER_CACHE_POLICIES)[RoutingProviderId];
    effectiveTtlSeconds: number;
    origin: LatLng;
    destination: LatLng;
    geodesicKm: number | null;
    formattedGeodesic: string | null;
    bypassCache: boolean;
    timeoutMs?: number;
  }): Promise<RoadRouteResult> {
    const {
      cacheKey,
      originId,
      providerId,
      policy,
      effectiveTtlSeconds,
      origin,
      destination,
      geodesicKm,
      formattedGeodesic,
      bypassCache,
      timeoutMs,
    } = params;

    if (!this.checkAndIncrementBudget()) {
      return this.buildFallbackUnavailableRoute({
        routeStatus: 'APPLICATION_BUDGET_EXCEEDED',
        errorCode: 'APPLICATION_BUDGET_EXCEEDED',
        provider: providerId,
        geodesicKm,
        formattedGeodesic,
        cacheStatus: 'BYPASS',
        cacheKey,
        disclosureMessage:
          'Application road-routing rate limit or daily budget reached; falling back to explicitly labeled straight-line geodesic distance.',
      });
    }

    const effectiveTimeoutMs =
      timeoutMs !== undefined && Number.isFinite(timeoutMs) && timeoutMs > 0
        ? Math.min(timeoutMs, this.timeoutMs)
        : this.timeoutMs;

    let rawResponse: ProviderRouteResponse;
    try {
      rawResponse = await this.adapter.computeDrivingRoute(origin, destination, {
        timeoutMs: effectiveTimeoutMs,
      });
    } catch (err: unknown) {
      const isTimeout =
        err instanceof Error &&
        (err.name === 'AbortError' || err.message.toLowerCase().includes('timeout'));
      return this.buildFallbackUnavailableRoute({
        routeStatus: isTimeout ? 'PROVIDER_TIMEOUT' : 'PROVIDER_ERROR',
        errorCode: isTimeout ? 'TIMEOUT' : 'NETWORK_ERROR',
        provider: providerId,
        geodesicKm,
        formattedGeodesic,
        cacheStatus: 'MISS',
        cacheKey,
        disclosureMessage: isTimeout
          ? 'Road-routing provider timed out; road distance unavailable.'
          : 'Road-routing provider request failed; road distance unavailable.',
      });
    }

    if (!rawResponse) {
      return this.buildFallbackUnavailableRoute({
        routeStatus: 'INVALID_PROVIDER_RESPONSE',
        errorCode: 'INVALID_RESPONSE',
        provider: providerId,
        geodesicKm,
        formattedGeodesic,
        cacheStatus: 'MISS',
        cacheKey,
        disclosureMessage: 'Road-routing provider returned an empty response.',
      });
    }

    if (rawResponse.status === 'TIMEOUT') {
      return this.buildFallbackUnavailableRoute({
        routeStatus: 'PROVIDER_TIMEOUT',
        errorCode: 'TIMEOUT',
        provider: providerId,
        geodesicKm,
        formattedGeodesic,
        cacheStatus: 'MISS',
        cacheKey,
        disclosureMessage: 'Road-routing provider request timed out.',
      });
    }

    if (rawResponse.status === 'UNROUTABLE') {
      return this.buildFallbackUnavailableRoute({
        routeStatus: 'UNROUTABLE',
        errorCode: 'UNROUTABLE',
        provider: providerId,
        geodesicKm,
        formattedGeodesic,
        cacheStatus: 'MISS',
        cacheKey,
        disclosureMessage: 'No drivable road route found between project and destination.',
      });
    }

    if (
      rawResponse.status === 'RATE_LIMITED' ||
      rawResponse.httpStatus === 429 ||
      rawResponse.errorCode === 'PROVIDER_RATE_LIMITED'
    ) {
      return this.buildFallbackUnavailableRoute({
        routeStatus: 'PROVIDER_RATE_LIMITED',
        errorCode: 'PROVIDER_RATE_LIMITED',
        provider: providerId,
        geodesicKm,
        formattedGeodesic,
        cacheStatus: 'MISS',
        cacheKey,
        disclosureMessage:
          rawResponse.errorMessage ||
          'Upstream road-routing provider rate limit or quota exhausted (HTTP 429).',
      });
    }

    if (
      rawResponse.status === 'INVALID_RESPONSE' ||
      rawResponse.errorCode === 'INVALID_RESPONSE'
    ) {
      return this.buildFallbackUnavailableRoute({
        routeStatus: 'INVALID_PROVIDER_RESPONSE',
        errorCode: 'INVALID_RESPONSE',
        provider: providerId,
        geodesicKm,
        formattedGeodesic,
        cacheStatus: 'MISS',
        cacheKey,
        disclosureMessage:
          rawResponse.errorMessage ||
          'Road-routing provider returned a malformed or incomplete response.',
      });
    }

    if (rawResponse.status === 'ERROR') {
      return this.buildFallbackUnavailableRoute({
        routeStatus: 'PROVIDER_ERROR',
        errorCode: rawResponse.errorCode ?? 'SERVER_ERROR',
        provider: providerId,
        geodesicKm,
        formattedGeodesic,
        cacheStatus: 'MISS',
        cacheKey,
        disclosureMessage:
          rawResponse.errorMessage || 'Road-routing provider returned an error.',
      });
    }

    const validated = validateProviderRouteMetrics(rawResponse, origin, destination);
    if (
      !validated.valid ||
      validated.routeDistanceKm === null ||
      validated.estimatedDurationSeconds === null ||
      validated.estimatedDurationMinutes === null
    ) {
      return this.buildFallbackUnavailableRoute({
        routeStatus: 'INVALID_PROVIDER_RESPONSE',
        errorCode: 'INVALID_RESPONSE',
        provider: providerId,
        geodesicKm,
        formattedGeodesic,
        cacheStatus: 'MISS',
        cacheKey,
        disclosureMessage:
          'Road-routing provider returned invalid or physically inconsistent distance/duration metrics.',
      });
    }

    const nowMs = this.nowFn();
    const calculatedAt = new Date(nowMs).toISOString();

    let cacheMetadata: RoadRouteResult['cache'] = {
      status: bypassCache ? 'BYPASS' : 'MISS',
      key: cacheKey,
      cachedAt: null,
      expiresAt: null,
      maxCacheAgeSeconds: effectiveTtlSeconds > 0 ? effectiveTtlSeconds : null,
    };

    if (!bypassCache && effectiveTtlSeconds > 0) {
      const expiresAtMs = nowMs + effectiveTtlSeconds * 1000;
      this.pruneAndEvictCache(nowMs, 1);
      this.cache.set(cacheKey, {
        key: cacheKey,
        originId,
        provider: providerId,
        routeDistanceKm: validated.routeDistanceKm,
        estimatedDurationSeconds: validated.estimatedDurationSeconds,
        estimatedDurationMinutes: validated.estimatedDurationMinutes,
        calculatedAt,
        cachedAtMs: nowMs,
        expiresAtMs,
        maxCacheAgeSeconds: effectiveTtlSeconds,
      });

      cacheMetadata = {
        status: 'MISS',
        key: cacheKey,
        cachedAt: calculatedAt,
        expiresAt: new Date(expiresAtMs).toISOString(),
        maxCacheAgeSeconds: effectiveTtlSeconds,
      };
    }

    return {
      isRoadRouteAvailable: true,
      routeStatus: 'ROUTE_AVAILABLE',
      errorCode: null,
      distanceMetric: 'ROAD_ROUTE',
      provider: providerId,
      routeDistanceKm: validated.routeDistanceKm,
      formattedRouteDistance: formatDistanceKm(validated.routeDistanceKm),
      estimatedDurationMinutes: validated.estimatedDurationMinutes,
      estimatedDurationSeconds: validated.estimatedDurationSeconds,
      formattedDuration: formatDrivingDuration(validated.estimatedDurationSeconds),
      geodesicDistanceKm: geodesicKm,
      formattedGeodesicDistance: formattedGeodesic,
      originLocationStatus: 'VERIFIED_PROJECT_LOCATION',
      originCoordinateSource: 'PROJECT',
      calculatedAt,
      cache: cacheMetadata,
      attribution: policy.requiredAttribution,
      disclosureMessage: null,
    };
  }

  /**
   * Builds a safe fallback result when a road route cannot be obtained for a verified project origin.
   * CRITICAL INVARIANT: routeDistanceKm and estimatedDurationMinutes are strictly NULL,
   * and distanceMetric is NEVER 'ROAD_ROUTE'.
   */
  private buildFallbackUnavailableRoute(params: {
    routeStatus: Exclude<RouteAvailabilityStatus, 'ROUTE_AVAILABLE'>;
    errorCode?: ProviderRouteErrorCode | null;
    provider: RoutingProviderId;
    geodesicKm: number | null;
    formattedGeodesic: string | null;
    cacheStatus: RoadRouteResult['cache']['status'];
    cacheKey: string | null;
    disclosureMessage: string;
  }): RoadRouteResult {
    const distanceMetric: DistanceCalculationMethod =
      params.geodesicKm !== null ? 'GEODESIC_STRAIGHT_LINE' : 'UNAVAILABLE';

    return {
      isRoadRouteAvailable: false,
      routeStatus: params.routeStatus,
      errorCode: params.errorCode ?? null,
      distanceMetric,
      provider: params.provider,
      routeDistanceKm: null,
      formattedRouteDistance: null,
      estimatedDurationMinutes: null,
      estimatedDurationSeconds: null,
      formattedDuration: null,
      geodesicDistanceKm: params.geodesicKm,
      formattedGeodesicDistance: params.formattedGeodesic,
      originLocationStatus: 'VERIFIED_PROJECT_LOCATION',
      originCoordinateSource: 'PROJECT',
      calculatedAt: null,
      cache: {
        status: params.cacheStatus,
        key: params.cacheKey,
        cachedAt: null,
        expiresAt: null,
        maxCacheAgeSeconds: null,
      },
      attribution: null,
      disclosureMessage: params.disclosureMessage,
    };
  }
}

/**
 * Factory that constructs a RoadRoutingService from validated server configuration.
 * Defaults safely to disabled (UnconfiguredRoadRoutingAdapter) when ROAD_ROUTING_PROVIDER is 'none',
 * even if OPENROUTESERVICE_API_KEY is present in the environment.
 */
export function createConfiguredRoadRoutingService(options?: {
  fetchFn?: typeof fetch;
  nowFn?: () => number;
}): RoadRoutingService {
  const cfg = validateAndGetConfig();

  let adapter: RoadRoutingProviderAdapter = new UnconfiguredRoadRoutingAdapter();

  if (cfg.roadRoutingProvider === 'openrouteservice') {
    adapter = new OpenRouteServiceAdapter({
      apiKey: cfg.openRouteServiceApiKey,
      baseUrl: cfg.openRouteServiceBaseUrl,
      defaultTimeoutMs: cfg.roadRoutingTimeoutMs,
      fetchFn: options?.fetchFn,
    });
  }

  return new RoadRoutingService({
    adapter,
    requestedCacheTtlSeconds: cfg.roadRoutingCacheTtlSeconds,
    timeoutMs: cfg.roadRoutingTimeoutMs,
    maxRequestsPerMinute: 40,
    maxRequestsPerDay: cfg.roadRoutingDailyBudget,
    nowFn: options?.nowFn,
  });
}

export const roadRoutingService = createConfiguredRoadRoutingService();
