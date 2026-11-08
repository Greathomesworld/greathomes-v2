import { LatLng } from '../spatial/distance';
import {
  CoordinateSource,
  ProjectLocationStatus,
} from '../../projects/viewModels/projectLocationViewModel';

/**
 * Supported Road-Routing Provider Identifiers.
 * - OPENROUTESERVICE: OpenRouteService V2 Directions / Matrix API (OpenStreetMap / HeiGIT)
 * - OSRM: Self-Hosted Open Source Routing Machine HTTP API (/route/v1, /table/v1)
 * - GOOGLE_ROUTES: Google Maps Platform Routes API (computeRoutes / computeRouteMatrix)
 * - NONE: No external road-routing provider enabled
 */
export type RoutingProviderId =
  | 'OPENROUTESERVICE'
  | 'OSRM'
  | 'GOOGLE_ROUTES'
  | 'NONE';

/**
 * Explicit Distance Calculation Method.
 * Must NEVER be conflated: a straight-line geodesic calculation must never be labeled as ROAD_ROUTE.
 */
export type DistanceCalculationMethod =
  | 'ROAD_ROUTE'
  | 'GEODESIC_STRAIGHT_LINE'
  | 'UNAVAILABLE';

/**
 * Explicit Route Availability & Eligibility Status.
 *
 * Phase 3.1 (Issue A1 & A2):
 * - APPLICATION_BUDGET_EXCEEDED: Local application per-minute or daily request budget reached (no upstream call made).
 * - PROVIDER_RATE_LIMITED: Upstream routing provider returned HTTP 429 (quota or rate limit exhausted).
 * - PROVIDER_ERROR: Other upstream provider errors (e.g., 401/403 auth failure, 5xx server error, network failure).
 * - INVALID_PROVIDER_RESPONSE: Upstream provider returned HTTP 200 but with malformed JSON, missing summary fields, or invalid/impossible metrics.
 */
export type RouteAvailabilityStatus =
  | 'ROUTE_AVAILABLE'
  | 'ORIGIN_APPROXIMATE_NOT_ELIGIBLE'
  | 'ORIGIN_UNAVAILABLE'
  | 'DESTINATION_UNAVAILABLE'
  | 'UNROUTABLE'
  | 'PROVIDER_UNCONFIGURED'
  | 'APPLICATION_BUDGET_EXCEEDED'
  | 'PROVIDER_RATE_LIMITED'
  | 'PROVIDER_ERROR'
  | 'PROVIDER_TIMEOUT'
  | 'INVALID_PROVIDER_RESPONSE';

/**
 * Structured provider error classification code.
 */
export type ProviderRouteErrorCode =
  | 'UNCONFIGURED'
  | 'INVALID_COORDINATES'
  | 'APPLICATION_BUDGET_EXCEEDED'
  | 'PROVIDER_RATE_LIMITED'
  | 'AUTH_FAILED'
  | 'SERVER_ERROR'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'UNROUTABLE'
  | 'INVALID_RESPONSE';

/**
 * Route Cache Status Metadata.
 */
export type RouteCacheStatus =
  | 'HIT'
  | 'MISS'
  | 'BYPASS'
  | 'STALE_EXPIRED'
  | 'NOT_APPLICABLE';

/**
 * Provider-Specific Terms of Service & Caching Policy.
 */
export interface ProviderCachePolicy {
  provider: RoutingProviderId;
  /** Whether caching of route distance/duration is permitted by provider terms */
  allowCaching: boolean;
  /** Whether persistent database storage of route metrics is permitted */
  allowPersistentStorage: boolean;
  /** Maximum permitted cache TTL in seconds under provider terms */
  maxPermittedTtlSeconds: number;
  /** Default recommended cache TTL in seconds */
  defaultTtlSeconds: number;
  /** Required attribution text when displaying data from this provider */
  requiredAttribution: string | null;
}

/**
 * Documented Provider Cache & Retention Policies (Phase 2 Verified).
 */
export const PROVIDER_CACHE_POLICIES: Record<RoutingProviderId, ProviderCachePolicy> = {
  OPENROUTESERVICE: {
    provider: 'OPENROUTESERVICE',
    allowCaching: true,
    allowPersistentStorage: false, // Free Standard HeiGIT cloud key uses bounded in-memory caching rather than permanent DB harvesting
    maxPermittedTtlSeconds: 7 * 24 * 3600, // 7 days max transient TTL on Standard tier
    defaultTtlSeconds: 24 * 3600, // 24 hours default
    requiredAttribution: '© openrouteservice.org by HeiGIT | Map data © OpenStreetMap contributors',
  },
  OSRM: {
    provider: 'OSRM',
    allowCaching: true,
    allowPersistentStorage: true,
    maxPermittedTtlSeconds: 30 * 24 * 3600, // 30 days max before OSM graph refresh
    defaultTtlSeconds: 14 * 24 * 3600, // 14 days default
    requiredAttribution: '© OpenStreetMap contributors (OSRM)',
  },
  GOOGLE_ROUTES: {
    provider: 'GOOGLE_ROUTES',
    allowCaching: true,
    allowPersistentStorage: false, // Google Maps Platform ToS restricts pre-fetching/persistent bulk caching of Routes
    maxPermittedTtlSeconds: 3600, // Strict 1-hour in-memory transient session cache cap
    defaultTtlSeconds: 900, // 15 minutes default transient cache
    requiredAttribution: 'Google Maps',
  },
  NONE: {
    provider: 'NONE',
    allowCaching: false,
    allowPersistentStorage: false,
    maxPermittedTtlSeconds: 0,
    defaultTtlSeconds: 0,
    requiredAttribution: null,
  },
};

/**
 * Input representing a project origin for road-route calculation.
 */
export interface ProjectRouteOriginInput {
  projectId?: string;
  projectSlug?: string;
  projectName?: string;
  latitude?: number | null;
  longitude?: number | null;
  projectLatitude?: number | null;
  projectLongitude?: number | null;
  locationStatus?: ProjectLocationStatus;
  coordinateSource?: CoordinateSource;
  hasVerifiedProjectCoordinates?: boolean;
  location?: {
    id?: string;
    name?: string;
    slug?: string;
    latitude?: number | null;
    longitude?: number | null;
  } | null;
}

/**
 * Input representing a destination POI or landmark.
 */
export interface RouteDestinationInput {
  destinationId?: string;
  name?: string;
  latitude?: number | null;
  longitude?: number | null;
}

/**
 * Result of checking whether a project origin and destination are eligible
 * for exact project-specific road routing.
 */
export interface RouteCoordinateEligibilityResult {
  eligible: boolean;
  locationStatus: ProjectLocationStatus;
  coordinateSource: CoordinateSource;
  originCoordinates: LatLng | null;
  destinationCoordinates: LatLng | null;
  rejectionStatus: Exclude<RouteAvailabilityStatus, 'ROUTE_AVAILABLE'> | null;
  disclosureMessage: string | null;
}

/**
 * Raw result returned by a concrete provider adapter for a single origin-destination pair.
 */
export interface ProviderRouteResponse {
  status: 'OK' | 'UNROUTABLE' | 'RATE_LIMITED' | 'INVALID_RESPONSE' | 'ERROR' | 'TIMEOUT';
  errorCode?: ProviderRouteErrorCode;
  distanceMeters?: number | null;
  durationSeconds?: number | null;
  errorMessage?: string | null;
  httpStatus?: number;
}

/**
 * Provider-Independent Server-Side Road-Routing Adapter Interface.
 */
export interface RoadRoutingProviderAdapter {
  readonly providerId: RoutingProviderId;
  isConfigured(): boolean;
  computeDrivingRoute(
    origin: LatLng,
    destination: LatLng,
    options?: { timeoutMs?: number }
  ): Promise<ProviderRouteResponse>;
  computeDrivingMatrix?(
    origin: LatLng,
    destinations: LatLng[],
    options?: { timeoutMs?: number }
  ): Promise<ProviderRouteResponse[]>;
}

/**
 * Canonical Provider-Independent Road Route Result Contract.
 * Explicitly separates road-route metrics from straight-line geodesic distance.
 */
export interface RoadRouteResult {
  /** Whether a valid road route was obtained from verified project coordinates */
  isRoadRouteAvailable: boolean;
  /** Detailed status of route resolution */
  routeStatus: RouteAvailabilityStatus;
  /** Optional structured error classification when route is unavailable due to budget/provider/response error */
  errorCode?: ProviderRouteErrorCode | null;
  /** Primary distance calculation method represented by routeDistanceKm */
  distanceMetric: DistanceCalculationMethod;
  /** Routing provider that computed the road route (or NONE) */
  provider: RoutingProviderId;
  /** Verified road-route distance in kilometres (rounded to 1 decimal place). Null if road route unavailable. */
  routeDistanceKm: number | null;
  /** Formatted road-route distance (e.g. "3.8 km"). Null if road route unavailable. */
  formattedRouteDistance: string | null;
  /** Estimated driving duration in whole minutes. Null if road route unavailable. */
  estimatedDurationMinutes: number | null;
  /** Raw estimated driving duration in seconds. Null if road route unavailable. */
  estimatedDurationSeconds: number | null;
  /** Formatted driving duration (e.g. "12 mins" or "1 hr 15 mins"). Null if unavailable. */
  formattedDuration: string | null;
  /**
   * Optional straight-line geodesic distance in kilometres (strictly separated from routeDistanceKm).
   * Only populated when origin and destination have valid verified coordinates.
   */
  geodesicDistanceKm: number | null;
  /** Formatted straight-line geodesic distance (e.g. "2.6 km (straight-line)"). */
  formattedGeodesicDistance: string | null;
  /** Origin coordinate integrity status */
  originLocationStatus: ProjectLocationStatus;
  /** Origin coordinate source */
  originCoordinateSource: CoordinateSource;
  /** ISO-8601 timestamp when the route was calculated */
  calculatedAt: string | null;
  /** Cache resolution metadata */
  cache: {
    status: RouteCacheStatus;
    key: string | null;
    cachedAt: string | null;
    expiresAt: string | null;
    maxCacheAgeSeconds: number | null;
  };
  /** Required provider attribution if route data is displayed */
  attribution: string | null;
  /** Honest user-facing or diagnostic disclosure message when route is unavailable or approximate */
  disclosureMessage: string | null;
}
