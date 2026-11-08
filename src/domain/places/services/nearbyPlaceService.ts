import { PlaceCategory, NearbyPlaceDto, PLACE_CATEGORY_REGISTRY } from '../entities';
import { PlaceRepository } from '../repositories/placeRepository';
import { placeRepository as defaultPlaceRepository } from '../../../infrastructure/repositories/memory/placeRepositoryMemory';
import { LatLng } from '../spatial/distance';
import {
  CoordinateSource,
  isValidCoordinate,
  ProjectLocationStatus,
  resolveProjectCoordinates,
} from '../../projects/viewModels/projectLocationViewModel';
import {
  ProjectRouteOriginInput,
  RoutingProviderId,
} from '../routing/types';
import {
  RoadRoutingService,
  roadRoutingService as defaultRoadRoutingService,
} from '../routing/roadRoutingService';

export interface NearbyPlaceServiceOptions {
  radiusKm?: number;
  category?: PlaceCategory | PlaceCategory[];
  limit?: number;
  routingService?: RoadRoutingService;
  /** Maximum number of POIs to enrich with road-route requests per call (default: 9) */
  maxRoutedPlaces?: number;
  /** Whether road-routing enrichment is permitted for this call (default: true for verified projects, false for arbitrary raw coordinate queries) */
  allowRoadRouting?: boolean;
  /** Overall wall-clock deadline in ms for road-routing enrichment before falling back to verified geodesic distances (default: 2500ms) */
  overallDeadlineMs?: number;
}

export interface ProjectNearbyConnectivityResult {
  originStatus: ProjectLocationStatus;
  coordinateSource: CoordinateSource;
  hasVerifiedProjectCoordinates: boolean;
  canComputeExactProjectDistance: boolean;
  routingProvider: RoutingProviderId;
  isRoutingProviderConfigured: boolean;
  places: NearbyPlaceDto[];
  attribution: string | null;
  disclosureMessage: string | null;
}

export class NearbyPlaceService {
  constructor(
    private repo: PlaceRepository = defaultPlaceRepository,
    private routingService: RoadRoutingService = defaultRoadRoutingService
  ) {}

  /**
   * Resolves verified nearby places from verified origin coordinates.
   * If origin coordinates are missing or invalid, safely returns an empty array.
   * Note: Raw coordinate queries default to straight-line geodesic distances (`allowRoadRouting: false`)
   * unless `allowRoadRouting: true` or an explicit `routingService` is provided.
   */
  async getNearbyPlaces(
    origin: LatLng | null | undefined,
    options?: NearbyPlaceServiceOptions
  ): Promise<NearbyPlaceDto[]> {
    if (!origin) {
      return [];
    }

    if (!isValidCoordinate(origin.latitude, origin.longitude)) {
      return [];
    }

    const allowRoadRouting =
      options?.allowRoadRouting !== undefined
        ? options.allowRoadRouting
        : Boolean(options?.routingService);

    const connectivity = await this.getProjectNearbyConnectivity(
      {
        latitude: origin.latitude,
        longitude: origin.longitude,
        projectLatitude: origin.latitude,
        projectLongitude: origin.longitude,
        locationStatus: 'VERIFIED_PROJECT_LOCATION',
        coordinateSource: 'PROJECT',
        hasVerifiedProjectCoordinates: true,
      },
      {
        ...options,
        allowRoadRouting,
      }
    );

    return connectivity.places;
  }

  /**
   * Resolves nearby places and road-route connectivity for a project origin while strictly
   * enforcing the 3-state coordinate integrity model:
   * - VERIFIED_PROJECT_LOCATION: Resolves nearby verified POIs and enriches eligible POIs with
   *   road-route distances and driving times when a routing provider is configured.
   * - APPROXIMATE_LOCATION: Does NOT request routes or compute locality-centroid distances as
   *   exact project distances. Returns an explicit disclosure message.
   * - LOCATION_UNAVAILABLE: Returns an empty list with an explicit unavailable status.
   */
  async getProjectNearbyConnectivity(
    originInput: ProjectRouteOriginInput | null | undefined,
    options?: NearbyPlaceServiceOptions
  ): Promise<ProjectNearbyConnectivityResult> {
    const activeRoutingService = options?.routingService ?? this.routingService;
    const routingProvider = activeRoutingService.getProviderId();
    const isRoutingProviderConfigured = activeRoutingService.isProviderConfigured();

    if (!originInput) {
      return {
        originStatus: 'LOCATION_UNAVAILABLE',
        coordinateSource: 'NONE',
        hasVerifiedProjectCoordinates: false,
        canComputeExactProjectDistance: false,
        routingProvider,
        isRoutingProviderConfigured,
        places: [],
        attribution: null,
        disclosureMessage:
          'Exact project coordinates are currently unavailable. Nearby distances and driving times will appear once the project location is verified.',
      };
    }

    const resolved = resolveProjectCoordinates(originInput, originInput.location);
    const effectiveStatus = originInput.locationStatus ?? resolved.locationStatus;
    const effectiveSource = originInput.coordinateSource ?? resolved.source;

    // Case C: LOCATION_UNAVAILABLE — Explicit unavailable status or no coordinates at all
    if (
      effectiveStatus === 'LOCATION_UNAVAILABLE' ||
      effectiveSource === 'NONE'
    ) {
      return {
        originStatus: 'LOCATION_UNAVAILABLE',
        coordinateSource: 'NONE',
        hasVerifiedProjectCoordinates: false,
        canComputeExactProjectDistance: false,
        routingProvider,
        isRoutingProviderConfigured,
        places: [],
        attribution: null,
        disclosureMessage:
          'Exact project coordinates are currently unavailable. Nearby distances and driving times will appear once the project location is verified.',
      };
    }

    // Case B: APPROXIMATE_LOCATION — Never request routes or present locality distances as project distances
    if (
      effectiveStatus === 'APPROXIMATE_LOCATION' ||
      effectiveSource === 'LOCATION' ||
      originInput.hasVerifiedProjectCoordinates === false
    ) {
      const locName = originInput.location?.name;
      return {
        originStatus: 'APPROXIMATE_LOCATION',
        coordinateSource: 'LOCATION',
        hasVerifiedProjectCoordinates: false,
        canComputeExactProjectDistance: false,
        routingProvider,
        isRoutingProviderConfigured,
        places: [],
        attribution: null,
        disclosureMessage: locName
          ? `Only approximate locality coordinates for ${locName} are available. Precise project distances and driving times are unavailable until the project location is verified.`
          : 'Only approximate locality coordinates are available. Precise project distances and driving times are unavailable until the project location is verified.',
      };
    }

    // Fallback safety check if coordinates are still invalid/missing
    if (
      effectiveStatus !== 'VERIFIED_PROJECT_LOCATION' ||
      !resolved.hasVerifiedProjectCoordinates ||
      resolved.latitude === null ||
      resolved.longitude === null
    ) {
      return {
        originStatus: 'LOCATION_UNAVAILABLE',
        coordinateSource: 'NONE',
        hasVerifiedProjectCoordinates: false,
        canComputeExactProjectDistance: false,
        routingProvider,
        isRoutingProviderConfigured,
        places: [],
        attribution: null,
        disclosureMessage:
          'Exact project coordinates are currently unavailable. Nearby distances and driving times will appear once the project location is verified.',
      };
    }

    // Case A: VERIFIED_PROJECT_LOCATION
    const {
      radiusKm = 15,
      category,
      limit = 20,
      maxRoutedPlaces = 9,
      allowRoadRouting = true,
      overallDeadlineMs = 2500,
    } = options || {};

    const rawPlaces = await this.repo.findNearby({
      origin: {
        latitude: resolved.latitude,
        longitude: resolved.longitude,
      },
      radiusKm,
      category,
      limit,
    });

    const buildGeodesicFallbackDto = (
      p: (typeof rawPlaces)[number],
      routeStatus: NearbyPlaceDto['routeStatus'] = 'PROVIDER_UNCONFIGURED',
      provider: RoutingProviderId = 'NONE',
      disclosure: string | null = 'Showing verified straight-line geodesic distance.'
    ): NearbyPlaceDto => {
      const categoryDisplay =
        PLACE_CATEGORY_REGISTRY[p.category]?.shortLabel || p.categoryDisplay;
      return {
        id: p.id,
        name: p.name,
        category: p.category,
        categoryDisplay,
        latitude: p.latitude,
        longitude: p.longitude,
        address: p.address,
        locality: p.locality,
        city: p.city,
        isVerified: p.isVerified,
        distanceKm: p.distanceKm,
        formattedDistance: p.formattedDistance,
        distanceMetric: 'GEODESIC_STRAIGHT_LINE',
        routeStatus,
        isRoadRouteAvailable: false,
        routeDistanceKm: null,
        formattedRouteDistance: null,
        estimatedDurationMinutes: null,
        estimatedDurationSeconds: null,
        formattedDuration: null,
        geodesicDistanceKm: p.distanceKm,
        formattedGeodesicDistance: p.formattedDistance,
        routingProvider: provider,
        attribution: null,
        disclosureMessage: disclosure,
      };
    };

    // Pre-populate all places with verified straight-line geodesic distances
    const enrichedPlaces: NearbyPlaceDto[] = rawPlaces.map(p =>
      buildGeodesicFallbackDto(p)
    );

    if (!allowRoadRouting) {
      return {
        originStatus: 'VERIFIED_PROJECT_LOCATION',
        coordinateSource: 'PROJECT',
        hasVerifiedProjectCoordinates: true,
        canComputeExactProjectDistance: true,
        routingProvider: 'NONE',
        isRoutingProviderConfigured: false,
        places: enrichedPlaces,
        attribution: null,
        disclosureMessage: null,
      };
    }

    const boundedRoutedCap = isRoutingProviderConfigured
      ? Math.max(0, Math.min(rawPlaces.length, limit, maxRoutedPlaces))
      : rawPlaces.length;

    let activeAttribution: string | null = null;
    const startedAtMs = Date.now();
    const effectiveOverallDeadlineMs =
      Number.isFinite(overallDeadlineMs) && overallDeadlineMs > 0
        ? overallDeadlineMs
        : 2500;

    // Process in bounded batches of 3 to avoid request waterfalls while preventing burst spikes
    const batchSize = 3;
    const resolvedIndices = new Set<number>();

    for (let i = 0; i < boundedRoutedCap; i += batchSize) {
      const elapsedMs = Date.now() - startedAtMs;
      const remainingMs = effectiveOverallDeadlineMs - elapsedMs;

      if (isRoutingProviderConfigured && remainingMs <= 0) {
        for (let k = i; k < boundedRoutedCap; k++) {
          if (!resolvedIndices.has(k)) {
            enrichedPlaces[k] = buildGeodesicFallbackDto(
              rawPlaces[k],
              'PROVIDER_TIMEOUT',
              routingProvider,
              'Road-routing deadline exceeded; falling back to verified straight-line geodesic distance.'
            );
          }
        }
        break;
      }

      const batchSlice = rawPlaces.slice(i, Math.min(i + batchSize, boundedRoutedCap));
      const batchPromises = batchSlice.map(async (p, batchIdx) => {
        const globalIdx = i + batchIdx;
        const categoryDisplay =
          PLACE_CATEGORY_REGISTRY[p.category]?.shortLabel || p.categoryDisplay;

        const routeResult = await activeRoutingService.getProjectRoadRoute(
          {
            projectId: originInput.projectId,
            projectSlug: originInput.projectSlug,
            projectName: originInput.projectName,
            projectLatitude: resolved.latitude,
            projectLongitude: resolved.longitude,
            latitude: resolved.latitude,
            longitude: resolved.longitude,
            locationStatus: 'VERIFIED_PROJECT_LOCATION',
            coordinateSource: 'PROJECT',
            hasVerifiedProjectCoordinates: true,
            location: originInput.location,
          },
          {
            destinationId: p.id,
            name: p.name,
            latitude: p.latitude,
            longitude: p.longitude,
          },
          isRoutingProviderConfigured
            ? { timeoutMs: Math.max(50, remainingMs) }
            : undefined
        );

        if (
          routeResult.isRoadRouteAvailable &&
          routeResult.routeStatus === 'ROUTE_AVAILABLE' &&
          routeResult.routeDistanceKm !== null &&
          routeResult.formattedRouteDistance !== null
        ) {
          if (routeResult.attribution && !activeAttribution) {
            activeAttribution = routeResult.attribution;
          }

          enrichedPlaces[globalIdx] = {
            id: p.id,
            name: p.name,
            category: p.category,
            categoryDisplay,
            latitude: p.latitude,
            longitude: p.longitude,
            address: p.address,
            locality: p.locality,
            city: p.city,
            isVerified: p.isVerified,
            distanceKm: routeResult.routeDistanceKm,
            formattedDistance: routeResult.formattedRouteDistance,
            distanceMetric: 'ROAD_ROUTE',
            routeStatus: routeResult.routeStatus,
            isRoadRouteAvailable: true,
            routeDistanceKm: routeResult.routeDistanceKm,
            formattedRouteDistance: routeResult.formattedRouteDistance,
            estimatedDurationMinutes: routeResult.estimatedDurationMinutes,
            estimatedDurationSeconds: routeResult.estimatedDurationSeconds,
            formattedDuration: routeResult.formattedDuration,
            geodesicDistanceKm: p.distanceKm,
            formattedGeodesicDistance: p.formattedDistance,
            routingProvider: routeResult.provider,
            attribution: routeResult.attribution,
            disclosureMessage: null,
          };
        } else {
          enrichedPlaces[globalIdx] = buildGeodesicFallbackDto(
            p,
            routeResult.routeStatus,
            routeResult.provider,
            routeResult.disclosureMessage
          );
        }
        resolvedIndices.add(globalIdx);
      });

      if (!isRoutingProviderConfigured) {
        await Promise.all(batchPromises);
        continue;
      }

      let deadlineTimer: ReturnType<typeof setTimeout> | null = null;
      const deadlineRacePromise = new Promise<'DEADLINE_EXCEEDED'>(resolve => {
        deadlineTimer = setTimeout(() => resolve('DEADLINE_EXCEEDED'), Math.max(10, remainingMs));
      });

      try {
        const outcome = await Promise.race([
          Promise.all(batchPromises).then(() => 'COMPLETED' as const),
          deadlineRacePromise,
        ]);

        if (outcome === 'DEADLINE_EXCEEDED') {
          for (let k = i; k < boundedRoutedCap; k++) {
            if (!resolvedIndices.has(k)) {
              enrichedPlaces[k] = buildGeodesicFallbackDto(
                rawPlaces[k],
                'PROVIDER_TIMEOUT',
                routingProvider,
                'Road-routing deadline exceeded; falling back to verified straight-line geodesic distance.'
              );
            }
          }
          break;
        }
      } finally {
        if (deadlineTimer) {
          clearTimeout(deadlineTimer);
        }
      }
    }

    return {
      originStatus: 'VERIFIED_PROJECT_LOCATION',
      coordinateSource: 'PROJECT',
      hasVerifiedProjectCoordinates: true,
      canComputeExactProjectDistance: true,
      routingProvider,
      isRoutingProviderConfigured,
      places: enrichedPlaces,
      attribution: activeAttribution,
      disclosureMessage: null,
    };
  }

  /**
   * Returns list of unique categories available in the registry.
   */
  getRegisteredCategories(): { key: PlaceCategory; label: string; shortLabel: string; icon: string }[] {
    return Object.values(PLACE_CATEGORY_REGISTRY).map(c => ({
      key: c.key,
      label: c.label,
      shortLabel: c.shortLabel,
      icon: c.icon,
    }));
  }
}

export const nearbyPlaceService = new NearbyPlaceService();
