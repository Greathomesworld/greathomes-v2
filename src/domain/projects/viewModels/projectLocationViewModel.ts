import { LocationType } from '../../locations/entities';
import { BoundedLocationDto } from '../dto/projectDto';

/**
 * Public consumer-facing terminology for location levels.
 * Enforces Great Homes Canonical Location Hierarchy:
 * STATE -> DISTRICT -> CITY -> DISCOVERY_REGION -> AREA -> NEIGHBOURHOOD
 *
 * Micro-Market is STRICTLY FORBIDDEN.
 */
export const LOCATION_LEVEL_DISPLAY_NAMES: Record<LocationType, string> = {
  STATE: 'State',
  DISTRICT: 'District',
  CITY: 'City',
  DISCOVERY_REGION: 'Region',
  AREA: 'Area',
  NEIGHBOURHOOD: 'Neighbourhood',
};

export interface BreadcrumbNode {
  id?: string;
  name: string;
  slug: string;
  level: LocationType;
  levelDisplay: string;
  type?: LocationType;
  href: string;
}

/**
 * ProjectLocationViewModel
 *
 * Dedicated public presentation view model for Project Location & Connectivity.
 * Contains strictly verified public facts supported by the underlying data store.
 *
 * NEVER fabricates coordinates, roads, metro stations, airports, schools,
 * hospitals, malls, travel times, or distances.
 */
export type CoordinateSource = 'PROJECT' | 'LOCATION' | 'NONE';

/**
 * Canonical 3-state location integrity model (Phase 1):
 * - VERIFIED_PROJECT_LOCATION: Actual project-site pinpoint coordinates are present and verified.
 * - APPROXIMATE_LOCATION: Only approximate coordinates (such as locality centroid coordinates) are available.
 * - LOCATION_UNAVAILABLE: No usable coordinates are available.
 */
export type ProjectLocationStatus =
  | 'VERIFIED_PROJECT_LOCATION'
  | 'APPROXIMATE_LOCATION'
  | 'LOCATION_UNAVAILABLE';

export type CoordinateVerificationStatus = 'VERIFIED' | 'APPROXIMATE' | 'UNVERIFIED';

export interface CoordinatePairValidationResult {
  valid: boolean;
  isEmpty: boolean;
  isPartial: boolean;
  latitude: number | null;
  longitude: number | null;
  error: string | null;
}

export interface ResolvedCoordinates {
  latitude: number | null;
  longitude: number | null;
  source: CoordinateSource;
  locationStatus: ProjectLocationStatus;
  isProjectOverride: boolean;
  hasValidCoordinates: boolean;
  hasVerifiedProjectCoordinates: boolean;
  isApproximateLocation: boolean;
  canComputeExactProjectDistance: boolean;
  hasPartialProjectCoordinates?: boolean;
}

/**
 * Dedicated public presentation view model for Project Location & Connectivity.
 * Contains strictly verified public facts supported by the underlying data store.
 *
 * NEVER fabricates coordinates, roads, metro stations, airports, schools,
 * hospitals, malls, travel times, or distances.
 */
export interface ProjectLocationViewModel {
  locationId: string;
  name: string;
  slug: string;
  level: LocationType;
  levelDisplay: string;
  city: string | null;
  district: string | null;
  state: string | null;
  breadcrumb: BreadcrumbNode[];
  latitude: number | null;
  longitude: number | null;
  hasValidCoordinates: boolean;
  coordinateSource: CoordinateSource;
  locationStatus: ProjectLocationStatus;
  isProjectOverride: boolean;
  hasVerifiedProjectCoordinates: boolean;
  isApproximateLocation: boolean;
  canComputeExactProjectDistance: boolean;
  canonicalPath: string;
  canonicalUrl: string;
  description: string | null;
}

/**
 * Validates geographic coordinate bounds.
 * Latitude must be within [-90, +90].
 * Longitude must be within [-180, +180].
 * Rejects NaN, non-finite values, and uninitialized (0, 0) Null Island coordinates.
 */
export function isValidCoordinate(latitude?: number | null, longitude?: number | null): boolean {
  if (
    latitude === null ||
    latitude === undefined ||
    longitude === null ||
    longitude === undefined ||
    typeof latitude !== 'number' ||
    typeof longitude !== 'number' ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    return false;
  }
  if (latitude === 0 && longitude === 0) {
    return false;
  }
  return latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
}

/**
 * Validates a raw (latitude, longitude) coordinate pair input.
 * Rejects partial pairs, booleans, empty strings, NaN/Infinity, (0, 0) Null Island, and out-of-range degrees.
 */
export function validateCoordinatePair(
  rawLatitude?: unknown,
  rawLongitude?: unknown
): CoordinatePairValidationResult {
  const isLatAbsent =
    rawLatitude === undefined ||
    rawLatitude === null ||
    (typeof rawLatitude === 'string' && rawLatitude.trim() === '');
  const isLngAbsent =
    rawLongitude === undefined ||
    rawLongitude === null ||
    (typeof rawLongitude === 'string' && rawLongitude.trim() === '');

  if (isLatAbsent && isLngAbsent) {
    return {
      valid: false,
      isEmpty: true,
      isPartial: false,
      latitude: null,
      longitude: null,
      error: null,
    };
  }

  if (isLatAbsent !== isLngAbsent) {
    return {
      valid: false,
      isEmpty: false,
      isPartial: true,
      latitude: null,
      longitude: null,
      error: 'Both project latitude and longitude must be provided together.',
    };
  }

  if (
    typeof rawLatitude === 'boolean' ||
    typeof rawLongitude === 'boolean' ||
    typeof rawLatitude === 'object' ||
    typeof rawLongitude === 'object'
  ) {
    return {
      valid: false,
      isEmpty: false,
      isPartial: false,
      latitude: null,
      longitude: null,
      error: 'Project coordinates must be valid numbers.',
    };
  }

  const lat = Number(rawLatitude);
  const lng = Number(rawLongitude);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return {
      valid: false,
      isEmpty: false,
      isPartial: false,
      latitude: null,
      longitude: null,
      error: 'Project coordinates must be valid finite numbers.',
    };
  }

  if (lat < -90 || lat > 90) {
    return {
      valid: false,
      isEmpty: false,
      isPartial: false,
      latitude: null,
      longitude: null,
      error: 'Project latitude must be between -90 and 90 degrees.',
    };
  }

  if (lng < -180 || lng > 180) {
    return {
      valid: false,
      isEmpty: false,
      isPartial: false,
      latitude: null,
      longitude: null,
      error: 'Project longitude must be between -180 and 180 degrees.',
    };
  }

  if (lat === 0 && lng === 0) {
    return {
      valid: false,
      isEmpty: false,
      isPartial: false,
      latitude: null,
      longitude: null,
      error: 'Project coordinates cannot be (0, 0) Null Island.',
    };
  }

  return {
    valid: true,
    isEmpty: false,
    isPartial: false,
    latitude: lat,
    longitude: lng,
    error: null,
  };
}

/**
 * Canonical Coordinate Resolution Utility
 * Precedence:
 * 1. Valid project-specific coordinate pair (supports both raw Project entities with latitude/longitude
 *    and PublicProjectDto objects where raw project overrides are stored in projectLatitude/projectLongitude)
 *    -> VERIFIED_PROJECT_LOCATION (unless explicitly marked APPROXIMATE/UNVERIFIED).
 * 2. Valid coordinates from linked canonical Location -> APPROXIMATE_LOCATION.
 * 3. Unavailable state -> LOCATION_UNAVAILABLE.
 *
 * Never mixes project latitude with Location longitude or vice versa.
 * Never silently treats approximate locality coordinates as verified project-site coordinates.
 */
export function resolveProjectCoordinates(
  projectCoordinates?: {
    latitude?: number | null;
    longitude?: number | null;
    projectLatitude?: number | null;
    projectLongitude?: number | null;
    coordinateVerificationStatus?: CoordinateVerificationStatus | null;
    isCoordinatesVerified?: boolean | null;
  } | null,
  locationCoordinates?: { latitude?: number | null; longitude?: number | null } | null
): ResolvedCoordinates {
  const hasExplicitProjectFields =
    projectCoordinates !== null &&
    projectCoordinates !== undefined &&
    ('projectLatitude' in projectCoordinates || 'projectLongitude' in projectCoordinates);

  const rawProjLat = hasExplicitProjectFields
    ? projectCoordinates?.projectLatitude
    : projectCoordinates?.latitude;
  const rawProjLng = hasExplicitProjectFields
    ? projectCoordinates?.projectLongitude
    : projectCoordinates?.longitude;

  const projValidation = validateCoordinatePair(rawProjLat, rawProjLng);

  if (projValidation.valid && projValidation.latitude !== null && projValidation.longitude !== null) {
    const isExplicitlyUnverified =
      projectCoordinates?.coordinateVerificationStatus === 'APPROXIMATE' ||
      projectCoordinates?.coordinateVerificationStatus === 'UNVERIFIED' ||
      projectCoordinates?.isCoordinatesVerified === false;

    const locationStatus: ProjectLocationStatus = isExplicitlyUnverified
      ? 'APPROXIMATE_LOCATION'
      : 'VERIFIED_PROJECT_LOCATION';

    const isVerified = locationStatus === 'VERIFIED_PROJECT_LOCATION';

    return {
      latitude: projValidation.latitude,
      longitude: projValidation.longitude,
      source: 'PROJECT',
      locationStatus,
      isProjectOverride: true,
      hasValidCoordinates: true,
      hasVerifiedProjectCoordinates: isVerified,
      isApproximateLocation: !isVerified,
      canComputeExactProjectDistance: isVerified,
      hasPartialProjectCoordinates: false,
    };
  }

  const locValidation = validateCoordinatePair(
    locationCoordinates?.latitude,
    locationCoordinates?.longitude
  );

  if (locValidation.valid && locValidation.latitude !== null && locValidation.longitude !== null) {
    return {
      latitude: locValidation.latitude,
      longitude: locValidation.longitude,
      source: 'LOCATION',
      locationStatus: 'APPROXIMATE_LOCATION',
      isProjectOverride: false,
      hasValidCoordinates: true,
      hasVerifiedProjectCoordinates: false,
      isApproximateLocation: true,
      canComputeExactProjectDistance: false,
      hasPartialProjectCoordinates: projValidation.isPartial,
    };
  }

  return {
    latitude: null,
    longitude: null,
    source: 'NONE',
    locationStatus: 'LOCATION_UNAVAILABLE',
    isProjectOverride: false,
    hasValidCoordinates: false,
    hasVerifiedProjectCoordinates: false,
    isApproximateLocation: false,
    canComputeExactProjectDistance: false,
    hasPartialProjectCoordinates: projValidation.isPartial,
  };
}

/**
 * Deduplicates location segments case-insensitively while preserving hierarchy order.
 * Prevents malformed or duplicate labels such as "Kolkata, Kolkata" or "Kolkata, Kolkata, West Bengal".
 */
function deduplicateLocationParts(parts: Array<string | null | undefined>): string[] {
  const result: string[] = [];
  const seenLower = new Set<string>();

  for (const raw of parts) {
    if (!raw || typeof raw !== 'string') continue;
    // Also split if a location name already contains comma-separated parts (e.g. "Rajarhat, Kolkata")
    const subParts = raw
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    for (const part of subParts) {
      const lower = part.toLowerCase();
      if (seenLower.has(lower)) continue;
      // If an existing part in result already ends with or contains this part as a word (e.g. "Central Kolkata" already contains "Kolkata")
      if (
        result.some(existing => {
          const exLower = existing.toLowerCase();
          return exLower.endsWith(lower) || exLower.split(/\s+/).includes(lower);
        })
      ) {
        continue;
      }
      seenLower.add(lower);
      result.push(part);
    }
  }

  return result;
}

/**
 * Formats a concise location label (e.g. "Rajarhat, Kolkata" or "Kolkata")
 * without ever duplicating city/locality names.
 */
export function formatProjectLocationShortLabel(
  location?: {
    name?: string | null;
    city?: string | null;
    state?: string | null;
    path?: { name: string; type?: string }[] | string;
  } | null,
  defaultCity: string | null = 'Kolkata'
): string {
  if (!location) return defaultCity || '';

  const rawPath = location.path;
  let cityFromPath: string | null = null;

  if (Array.isArray(rawPath)) {
    cityFromPath = rawPath.find(p => (p.type || '').toUpperCase() === 'CITY')?.name || null;
  } else if (typeof rawPath === 'string') {
    const segments = rawPath.split('>').map(s => s.trim()).filter(Boolean);
    if (segments.length >= 2) {
      cityFromPath = segments[1];
    } else if (segments.length === 1) {
      cityFromPath = segments[0];
    }
  }

  const resolvedCity = location.city ?? cityFromPath ?? defaultCity;
  const parts = deduplicateLocationParts([location.name, resolvedCity]);
  return parts.join(', ');
}

/**
 * Formats a full location label (e.g. "Rajarhat, Kolkata, West Bengal" or "Kolkata, West Bengal")
 * without ever duplicating city, locality, or state names.
 */
export function formatProjectLocationFullLabel(
  location?: {
    name?: string | null;
    city?: string | null;
    state?: string | null;
    path?: { name: string; type?: string }[] | string;
  } | null,
  defaultCity: string | null = 'Kolkata',
  defaultState: string | null = 'West Bengal'
): string {
  if (!location) {
    return deduplicateLocationParts([defaultCity, defaultState]).join(', ');
  }

  const rawPath = location.path;
  let cityFromPath: string | null = null;
  let stateFromPath: string | null = null;

  if (Array.isArray(rawPath)) {
    cityFromPath = rawPath.find(p => (p.type || '').toUpperCase() === 'CITY')?.name || null;
    stateFromPath = rawPath.find(p => (p.type || '').toUpperCase() === 'STATE')?.name || null;
  } else if (typeof rawPath === 'string') {
    const segments = rawPath.split('>').map(s => s.trim()).filter(Boolean);
    if (segments.length >= 2) {
      stateFromPath = segments[0];
      cityFromPath = segments[1];
    } else if (segments.length === 1) {
      cityFromPath = segments[0];
    }
  }

  const resolvedCity = location.city ?? cityFromPath ?? defaultCity;
  const resolvedState = location.state ?? stateFromPath ?? defaultState;

  const parts = deduplicateLocationParts([location.name, resolvedCity, resolvedState]);
  return parts.join(', ');
}

/**
 * Constructs a ProjectLocationViewModel from a bounded location DTO and its ancestry path.
 * Resolves state, district, city from the canonical ancestry path.
 * Uses resolveProjectCoordinates to apply project override vs location fallback.
 */
export function buildProjectLocationViewModel(
  location: BoundedLocationDto,
  description?: string | null,
  projectCoordinates?: {
    latitude?: number | null;
    longitude?: number | null;
    projectLatitude?: number | null;
    projectLongitude?: number | null;
    coordinateVerificationStatus?: CoordinateVerificationStatus | null;
    isCoordinatesVerified?: boolean | null;
  } | null
): ProjectLocationViewModel {
  const rawPath =
    location.path && location.path.length > 0
      ? location.path
      : [{ id: location.id, name: location.name, slug: location.slug, type: location.type }];

  // Deduplicate path nodes by slug/name to prevent duplicate breadcrumb items
  const path: typeof rawPath = [];
  const seenNodes = new Set<string>();
  for (const node of rawPath) {
    if (!node || !node.name) continue;
    const key = `${(node.slug || '').toLowerCase()}::${node.name.trim().toLowerCase()}`;
    if (seenNodes.has(key)) continue;
    seenNodes.add(key);
    path.push(node);
  }

  // Find State, District, City in the path ancestry
  const stateNode = path.find(p => (p.type || '').toUpperCase() === 'STATE');
  const districtNode = path.find(p => (p.type || '').toUpperCase() === 'DISTRICT');
  const cityNode = path.find(p => (p.type || '').toUpperCase() === 'CITY');

  const state = stateNode?.name || null;
  const district = districtNode?.name || null;
  const city = cityNode?.name || null;

  // Build canonical breadcrumb
  const breadcrumb: BreadcrumbNode[] = path.map(p => {
    const rawType = ((p.type || 'LOCALITY').toUpperCase() as LocationType);
    const levelDisplay = LOCATION_LEVEL_DISPLAY_NAMES[rawType] || p.type || 'Locality';
    return {
      id: p.id,
      name: p.name,
      slug: p.slug,
      level: rawType,
      levelDisplay,
      type: rawType,
      href: `/locations/${p.slug}`,
    };
  });

  // Resolve coordinate precedence
  const resolved = resolveProjectCoordinates(projectCoordinates, location);

  // Build canonical path
  const canonicalPath = `/locations/${path.map(p => p.slug).join('/')}`;
  const canonicalUrl = `/locations/${location.slug}`;

  const currentLevel = ((location.type || 'LOCALITY').toUpperCase() as LocationType);
  const levelDisplay = LOCATION_LEVEL_DISPLAY_NAMES[currentLevel] || location.type || 'Locality';

  return {
    locationId: location.id,
    name: location.name,
    slug: location.slug,
    level: currentLevel,
    levelDisplay,
    city,
    district,
    state,
    breadcrumb,
    latitude: resolved.latitude,
    longitude: resolved.longitude,
    hasValidCoordinates: resolved.hasValidCoordinates,
    coordinateSource: resolved.source,
    locationStatus: resolved.locationStatus,
    isProjectOverride: resolved.isProjectOverride,
    hasVerifiedProjectCoordinates: resolved.hasVerifiedProjectCoordinates,
    isApproximateLocation: resolved.isApproximateLocation,
    canComputeExactProjectDistance: resolved.canComputeExactProjectDistance,
    canonicalPath,
    canonicalUrl,
    description: description || null,
  };
}
