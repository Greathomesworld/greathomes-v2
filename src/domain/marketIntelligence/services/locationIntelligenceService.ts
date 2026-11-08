import {
  LocationIntelligenceDTO,
  PublicLocationIntelligenceLocationDto,
  MarketOverviewDto,
  SupplyIntelligenceDto,
  PriceIntelligenceDto,
  PriceBasisBreakdownDto,
  PriceMetricBasisSummaryDto,
  RentalPriceSummaryDto,
  ReraIntelligenceDto,
  ConnectivityIntelligenceDto,
  ConnectivityPlaceDto,
  RecentActivityDto,
  PublicMarketEventDto,
  ConfigurationDistributionDto,
} from '../dto/locationIntelligenceDto';
import { MetricScope } from '../types';
import { locationService } from '../../locations/services/locationService';
import { marketIntelligenceService } from './marketIntelligenceService';
import { marketEventService } from './marketEventService';
import { buildFreshnessInfo, calculateMean, calculateMedian } from '../metrics';
import { getDb } from '../../../db/client';
import { resaleListings, rentalListings, projects, locationMarketSnapshots, locations } from '../../../db/schema';
import { eq, and, inArray, desc, or } from 'drizzle-orm';
import { LocationType } from '../../locations/entities';
import { ensureSeedData } from '../../../infrastructure/seed';
import { projectRepository } from '../../../infrastructure/repositories/projectProvider';
import { locationRepository } from '../../../infrastructure/repositories/locationProvider';
import { resaleListingRepository } from '../../projects/repositories/resaleRepository';
import { rentalListingRepository } from '../../projects/repositories/rentalRepository';
import { getLocationFullDescription } from '../../locations/locationRegionMapper';
import { isKnownTestResaleListing, isVerifiedPublicResaleListing } from '../../projects/services/resaleService';
import { isKnownTestRentalListing, isVerifiedPublicRentalListing } from '../../projects/services/rentalService';

function formatStatusDisplay(status?: string | null): string {
  if (!status) return 'Updated';
  switch (status.toUpperCase()) {
    case 'NEW_LAUNCH': return 'New Launch';
    case 'UNDER_CONSTRUCTION': return 'Under Construction';
    case 'READY_TO_MOVE': return 'Ready to Move';
    case 'COMPLETED': return 'Completed';
    case 'SOLD_OUT': return 'Sold Out';
    default: return status.replace(/_/g, ' ');
  }
}

function formatReraStatusDisplay(status?: string | null): string {
  if (!status) return 'Verified';
  switch (status.toUpperCase()) {
    case 'VERIFIED': return 'Verified';
    case 'PROVIDED': return 'Provided (Under Review)';
    case 'NOT_PROVIDED': return 'Unregistered';
    default: return status.replace(/_/g, ' ');
  }
}

function formatBhkDisplay(bhk?: string | null): string {
  if (!bhk) return 'New';
  if (bhk.toUpperCase().includes('BHK')) return bhk;
  return `${bhk} BHK`;
}

function sanitizeEventMetadata(meta: any): Record<string, any> | null {
  if (!meta || typeof meta !== 'object') return null;
  const safe: Record<string, any> = {};
  const allowedKeys = ['bhkType', 'status', 'previousStatus', 'newStatus', 'reraStatus', 'priceBasis', 'unitType', 'facing'];
  for (const k of allowedKeys) {
    if (k in meta && meta[k] !== undefined && meta[k] !== null) {
      safe[k] = meta[k];
    }
  }
  return Object.keys(safe).length > 0 ? safe : null;
}

const SYNTHETIC_ACTIVITY_RESOURCE_REGEX =
  /(^|[_-])(test|sample|concurrent|dedupe|neon|fixture|mock|temp)([_-]|$|\d)/i;
const SYNTHETIC_SHORT_ID_REGEX = /^(res|rent|proj|loc)-\d+$/i;

export function isSyntheticActivityResourceId(id?: string | null): boolean {
  if (!id) return true;
  const trimmed = id.trim();
  if (!trimmed) return true;
  return SYNTHETIC_ACTIVITY_RESOURCE_REGEX.test(trimmed) || SYNTHETIC_SHORT_ID_REGEX.test(trimmed);
}

export function validateHistoricalSnapshots(
  snapshots: any[],
  scope: MetricScope = 'DESCENDANT',
  options?: {
    hasChildLocations?: boolean;
    liveSupply?: {
      publishedProjects: number;
      resaleListings: number;
      rentalListings: number;
    };
  }
): any[] {
  if (!snapshots || snapshots.length < 2) return [];
  // Snapshots in location_market_snapshots are pre-aggregated for DESCENDANT scope only.
  // Do not show descendant snapshots when viewing DIRECT scope on a parent location with sub-locations.
  if (scope === 'DIRECT' && options?.hasChildLocations) {
    return [];
  }

  const live = options?.liveSupply;
  const valid = snapshots.filter((s) => {
    if (!s || !s.snapshotDate) return false;
    const projCount = Number(s.publishedProjectCount ?? 0);
    const resaleCount = Number(s.resaleListingCount ?? 0);
    const rentalCount = Number(s.rentalListingCount ?? 0);
    if (projCount < 0 || resaleCount < 0 || rentalCount < 0) return false;

    // Exclude seeded synthetic snapshot rows where fabricated resale/rental counts (e.g. 20-31 resale, 12-19 rental)
    // contradict verified live inventory by more than an order of magnitude.
    if (live) {
      const maxPlausibleResale = Math.max(live.resaleListings * 3 + 3, 8);
      const maxPlausibleRental = Math.max(live.rentalListings * 3 + 3, 8);
      if (resaleCount > maxPlausibleResale || rentalCount > maxPlausibleRental) {
        return false;
      }
      // Exclude isolated test-fixture drop rows (e.g. 2026-10-06 where project count dropped to <= 2 while live is >= 8)
      if (live.publishedProjects >= 6 && projCount <= Math.floor(live.publishedProjects * 0.25)) {
        return false;
      }
    } else {
      // Fallback heuristic when liveSupply is not passed:
      // Synthetic seeded series in Sept 2026 had resaleListingCount >= 18 and rentalListingCount >= 12
      if (resaleCount >= 18 && rentalCount >= 12) {
        return false;
      }
    }

    return true;
  });

  if (valid.length < 2) return [];
  return valid;
}

export class LocationIntelligenceService {
  /**
   * Retrieves validated historical market snapshots for a location.
   * Excludes synthetic seeded rows and prevents scope mismatch when viewing DIRECT scope.
   */
  async getLocationHistory(
    locationId: string,
    scope: MetricScope = 'DESCENDANT',
    options?: {
      hasChildLocations?: boolean;
      liveSupply?: {
        publishedProjects: number;
        resaleListings: number;
        rentalListings: number;
      };
    }
  ): Promise<any[]> {
    if (scope === 'DIRECT' && options?.hasChildLocations) {
      return [];
    }
    const db = getDb();
    if (!db) return [];

    try {
      const snapshots = await db
        .select()
        .from(locationMarketSnapshots)
        .where(eq(locationMarketSnapshots.locationId, locationId))
        .orderBy(desc(locationMarketSnapshots.snapshotDate));

      return validateHistoricalSnapshots(snapshots, scope, options);
    } catch (e) {
      console.error('Failed to fetch history:', e);
      return [];
    }
  }

  /**
   * Builds the comprehensive, factual Location Intelligence DTO for a given location slug.
   */
  private intelCache = new Map<string, { data: LocationIntelligenceDTO | null; expiresAt: number }>();
  private inflightIntel = new Map<string, Promise<LocationIntelligenceDTO | null>>();

  async getLocationIntelligence(
    locationSlug: string,
    options?: { scope?: MetricScope }
  ): Promise<LocationIntelligenceDTO | null> {
    const isPg = Boolean(getDb());
    if (!isPg) {
      await ensureSeedData();
    }
    const scopeParam: MetricScope = options?.scope === 'DIRECT' ? 'DIRECT' : 'DESCENDANT';
    const cacheKey = `${locationSlug.toLowerCase().trim()}::${scopeParam}`;

    if (isPg) {
      const cached = this.intelCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.data;
      }
      const inflight = this.inflightIntel.get(cacheKey);
      if (inflight) {
        return inflight;
      }
    }

    const computeIntel = async (): Promise<LocationIntelligenceDTO | null> => {

    // 1. Resolve canonical published location
    const location = await locationService.resolveLocationBySlug(locationSlug, { publishedOnly: true });
    if (!location) return null;

    // 2. Resolve location path & breadcrumb
    const locationPath = await locationService.getLocationPath(location.id, { publishedOnly: true });

    const levelDisplays: Record<LocationType, string> = {
      STATE: 'State',
      DISTRICT: 'District',
      CITY: 'City',
      DISCOVERY_REGION: 'Discovery Region',
      AREA: 'Area',
      NEIGHBOURHOOD: 'Neighbourhood',
    };

    const breadcrumb = locationPath.map((loc) => ({
      name: loc.name,
      slug: loc.slug,
      type: loc.type,
      canonicalPath: `/locations/${loc.slug}`,
    }));

    const cityLoc = locationPath.find((l) => l.type === 'CITY');
    const districtLoc = locationPath.find((l) => l.type === 'DISTRICT');
    const stateLoc = locationPath.find((l) => l.type === 'STATE');

    const publicLocation: PublicLocationIntelligenceLocationDto = {
      id: location.id,
      name: location.name,
      slug: location.slug,
      level: location.type,
      levelDisplay: levelDisplays[location.type] || location.type,
      city: cityLoc ? cityLoc.name : null,
      district: districtLoc ? districtLoc.name : null,
      state: stateLoc ? stateLoc.name : null,
      breadcrumb,
      canonicalPath: `/locations/${location.slug}`,
      latitude: location.latitude !== undefined && location.latitude !== null ? Number(location.latitude) : null,
      longitude: location.longitude !== undefined && location.longitude !== null ? Number(location.longitude) : null,
      description: getLocationFullDescription(location) || null,
    };

    // 3. Resolve location scope IDs and load scoped market data ONCE per request (Priority 6)
    const scopeLocationIds = await marketIntelligenceService.resolveLocationScopeIds(location.id, scopeParam);
    const scopedData = await marketIntelligenceService.loadScopedMarketData(scopeLocationIds);

    // 4. Supply Metrics & Market Overview (reusing preloaded scopedData)
    const supplyMetrics = await marketIntelligenceService.getSupplyMetrics(
      location.id,
      scopeParam,
      scopeLocationIds,
      scopedData
    );

    const marketOverview: MarketOverviewDto = {
      publishedProjects: supplyMetrics.publishedProjects,
      newLaunchProjects: supplyMetrics.newLaunchProjects,
      underConstructionProjects: supplyMetrics.underConstructionProjects,
      readyToMoveProjects: supplyMetrics.readyToMoveProjects,
      completedProjects: supplyMetrics.completedProjects,
      soldOutProjects: supplyMetrics.soldOutProjects,
      resaleListings: supplyMetrics.resaleListingsCount,
      rentalListings: supplyMetrics.rentalListingsCount,
      unverifiedResaleListings: supplyMetrics.unverifiedResaleListingsCount ?? 0,
      unverifiedRentalListings: supplyMetrics.unverifiedRentalListingsCount ?? 0,
    };

    // Resale & Rental configuration distributions (reusing preloaded verified rows)
    const resaleConfigDist = await this.getResaleConfigurationDistribution(
      scopeLocationIds,
      scopedData.verifiedResaleRows
    );
    const rentalConfigDist = await this.getRentalConfigurationDistribution(
      scopeLocationIds,
      scopedData.verifiedRentalRows
    );

    const supply: SupplyIntelligenceDto = {
      marketOverview,
      projectConfigurationDistribution: supplyMetrics.configurationDistribution,
      resaleConfigurationDistribution: resaleConfigDist,
      rentalConfigurationDistribution: rentalConfigDist,
      scope: scopeParam,
    };

    // 5. Price Intelligence (reusing preloaded projects, configurations & verified listings)
    const priceMetrics = await marketIntelligenceService.getPriceMetrics(
      location.id,
      scopeParam,
      scopeLocationIds,
      scopedData.publishedProjects,
      scopedData.projectConfigurationRows
    );
    const newBookingBreakdown: PriceBasisBreakdownDto = {};

    for (const pm of priceMetrics) {
      const summary: PriceMetricBasisSummaryDto = {
        minRatePerSqft: pm.minRatePerSqft!,
        maxRatePerSqft: pm.maxRatePerSqft!,
        medianRatePerSqft: pm.medianRatePerSqft!,
        avgRatePerSqft: pm.avgRatePerSqft!,
        sampleCount: pm.sampleCount,
      };

      if (pm.priceBasis === 'CARPET_AREA') newBookingBreakdown.carpetArea = summary;
      else if (pm.priceBasis === 'BUILT_UP_AREA') newBookingBreakdown.builtUpArea = summary;
      else if (pm.priceBasis === 'SUPER_BUILT_UP_AREA') newBookingBreakdown.superBuiltUpArea = summary;
    }

    const resalePricing = await this.getResalePriceBreakdown(
      scopeLocationIds,
      scopedData.verifiedResaleRows
    );
    const rentalPricing = await this.getRentalPriceSummary(
      scopeLocationIds,
      scopedData.verifiedRentalRows
    );

    const hasResaleSamples =
      resalePricing !== 'NO_DATA' &&
      Boolean(resalePricing.carpetArea || resalePricing.builtUpArea || resalePricing.superBuiltUpArea);
    const hasRentalSamples = rentalPricing !== 'NO_DATA' && rentalPricing.sampleCount > 0;
    const totalSamples = priceMetrics.reduce((sum, p) => sum + p.sampleCount, 0);
    const pricingStatus = totalSamples > 0 || hasResaleSamples || hasRentalSamples ? 'CURRENT' : 'NO_DATA';

    const pricing: PriceIntelligenceDto = {
      newBooking: newBookingBreakdown,
      resale: resalePricing,
      rental: rentalPricing,
      status: pricingStatus,
    };

    // 6, 7, 8. RERA Intelligence, Connectivity Intelligence & Recent Market Activity in parallel
    const [reraMetrics, connectivity, recentActivity] = await Promise.all([
      marketIntelligenceService.getReraCoverage(
        location.id,
        scopeParam,
        scopeLocationIds,
        scopedData.publishedProjects
      ),
      this.getConnectivityIntelligence(location),
      this.getRecentActivityIntelligence(location.id, 10, scopeParam, scopeLocationIds),
    ]);

    const rera: ReraIntelligenceDto = {
      verifiedReraProjects: reraMetrics.verifiedProjects,
      providedReraProjects: reraMetrics.providedProjects,
      projectsWithoutReraData: reraMetrics.notProvidedProjects,
      totalPublishedProjects: reraMetrics.totalProjects,
      verifiedPercentage: reraMetrics.totalProjects > 0 ? reraMetrics.verifiedPercentage : 'NOT_AVAILABLE',
    };

    // 9. Freshness Metadata
    const freshness = buildFreshnessInfo(location.updatedAt, 'Great Homes Market Intelligence Engine');

    return {
      location: publicLocation,
      scope: scopeParam,
      marketOverview,
      supply,
      pricing,
      rera,
      connectivity,
      recentActivity,
      freshness,
      sourceType: 'LIVE_METRIC',
    };
    };

    if (isPg) {
      const p = computeIntel()
        .then((res) => {
          this.intelCache.set(cacheKey, { data: res, expiresAt: Date.now() + 3_000 });
          return res;
        })
        .finally(() => {
          this.inflightIntel.delete(cacheKey);
        });
      this.inflightIntel.set(cacheKey, p);
      return p;
    }

    return computeIntel();
  }

  /**
   * Computes resale configuration distribution for published + verified resale listings in location scope.
   */
  private async getResaleConfigurationDistribution(
    scopeLocationIds: string[],
    preloadedVerifiedResaleRows?: any[]
  ): Promise<ConfigurationDistributionDto | 'NOT_AVAILABLE'> {
    if (scopeLocationIds.length === 0) return 'NOT_AVAILABLE';

    try {
      let resaleRows: any[] = [];
      if (preloadedVerifiedResaleRows) {
        resaleRows = preloadedVerifiedResaleRows;
      } else {
        const scopedData = await marketIntelligenceService.loadScopedMarketData(scopeLocationIds);
        resaleRows = scopedData.verifiedResaleRows;
      }

      if (resaleRows.length === 0) return 'NOT_AVAILABLE';

      const dist: ConfigurationDistributionDto = {
        bhk1Count: 0,
        bhk2Count: 0,
        bhk3Count: 0,
        bhk4Count: 0,
        bhk5PlusCount: 0,
        otherCount: 0,
      };

      for (const r of resaleRows) {
        if (isKnownTestResaleListing(r) || !isVerifiedPublicResaleListing(r)) continue;
        const beds = r.bedroomCount;
        if (beds === 1) dist.bhk1Count++;
        else if (beds === 2) dist.bhk2Count++;
        else if (beds === 3) dist.bhk3Count++;
        else if (beds === 4) dist.bhk4Count++;
        else if (beds && beds >= 5) dist.bhk5PlusCount++;
        else dist.otherCount++;
      }

      return dist;
    } catch {
      return 'NOT_AVAILABLE';
    }
  }

  /**
   * Computes rental configuration distribution for published + verified rental listings in location scope.
   */
  private async getRentalConfigurationDistribution(
    scopeLocationIds: string[],
    preloadedVerifiedRentalRows?: any[]
  ): Promise<ConfigurationDistributionDto | 'NOT_AVAILABLE'> {
    if (scopeLocationIds.length === 0) return 'NOT_AVAILABLE';

    try {
      let rentalRows: any[] = [];
      if (preloadedVerifiedRentalRows) {
        rentalRows = preloadedVerifiedRentalRows;
      } else {
        const scopedData = await marketIntelligenceService.loadScopedMarketData(scopeLocationIds);
        rentalRows = scopedData.verifiedRentalRows;
      }

      if (rentalRows.length === 0) return 'NOT_AVAILABLE';

      const dist: ConfigurationDistributionDto = {
        bhk1Count: 0,
        bhk2Count: 0,
        bhk3Count: 0,
        bhk4Count: 0,
        bhk5PlusCount: 0,
        otherCount: 0,
      };

      for (const rent of rentalRows) {
        if (isKnownTestRentalListing(rent) || !isVerifiedPublicRentalListing(rent)) continue;
        const beds = rent.bedroomCount;
        if (beds === 1) dist.bhk1Count++;
        else if (beds === 2) dist.bhk2Count++;
        else if (beds === 3) dist.bhk3Count++;
        else if (beds === 4) dist.bhk4Count++;
        else if (beds && beds >= 5) dist.bhk5PlusCount++;
        else dist.otherCount++;
      }

      return dist;
    } catch {
      return 'NOT_AVAILABLE';
    }
  }

  /**
   * Computes aggregate resale price breakdowns per area basis if valid data exists.
   */
  private async getResalePriceBreakdown(
    scopeLocationIds: string[],
    preloadedVerifiedResaleRows?: any[]
  ): Promise<PriceBasisBreakdownDto | 'NO_DATA'> {
    if (scopeLocationIds.length === 0) return 'NO_DATA';

    try {
      let resaleRows: any[] = [];
      if (preloadedVerifiedResaleRows) {
        resaleRows = preloadedVerifiedResaleRows;
      } else {
        const scopedData = await marketIntelligenceService.loadScopedMarketData(scopeLocationIds);
        resaleRows = scopedData.verifiedResaleRows;
      }

      if (resaleRows.length === 0) return 'NO_DATA';

      const carpetRates: number[] = [];
      const builtUpRates: number[] = [];
      const superBuiltUpRates: number[] = [];

      for (const r of resaleRows) {
        if (isKnownTestResaleListing(r) || !isVerifiedPublicResaleListing(r)) continue;
        const price = Number(r.askingPrice);
        if (!price || price <= 0) continue;

        if (r.carpetArea && Number(r.carpetArea) > 0) {
          carpetRates.push(Math.round(price / Number(r.carpetArea)));
        }
        if (r.builtUpArea && Number(r.builtUpArea) > 0) {
          builtUpRates.push(Math.round(price / Number(r.builtUpArea)));
        }
        if (r.superBuiltUpArea && Number(r.superBuiltUpArea) > 0) {
          superBuiltUpRates.push(Math.round(price / Number(r.superBuiltUpArea)));
        }
      }

      if (carpetRates.length === 0 && builtUpRates.length === 0 && superBuiltUpRates.length === 0) {
        return 'NO_DATA';
      }

      const breakdown: PriceBasisBreakdownDto = {};

      if (carpetRates.length > 0) {
        breakdown.carpetArea = {
          minRatePerSqft: Math.min(...carpetRates),
          maxRatePerSqft: Math.max(...carpetRates),
          medianRatePerSqft: calculateMedian(carpetRates)!,
          avgRatePerSqft: calculateMean(carpetRates)!,
          sampleCount: carpetRates.length,
        };
      }

      if (builtUpRates.length > 0) {
        breakdown.builtUpArea = {
          minRatePerSqft: Math.min(...builtUpRates),
          maxRatePerSqft: Math.max(...builtUpRates),
          medianRatePerSqft: calculateMedian(builtUpRates)!,
          avgRatePerSqft: calculateMean(builtUpRates)!,
          sampleCount: builtUpRates.length,
        };
      }

      if (superBuiltUpRates.length > 0) {
        breakdown.superBuiltUpArea = {
          minRatePerSqft: Math.min(...superBuiltUpRates),
          maxRatePerSqft: Math.max(...superBuiltUpRates),
          medianRatePerSqft: calculateMedian(superBuiltUpRates)!,
          avgRatePerSqft: calculateMean(superBuiltUpRates)!,
          sampleCount: superBuiltUpRates.length,
        };
      }

      return breakdown;
    } catch {
      return 'NO_DATA';
    }
  }

  /**
   * Computes monthly rent statistical metrics for published + verified rental listings in location scope.
   */
  private async getRentalPriceSummary(
    scopeLocationIds: string[],
    preloadedVerifiedRentalRows?: any[]
  ): Promise<RentalPriceSummaryDto | 'NO_DATA'> {
    if (scopeLocationIds.length === 0) return 'NO_DATA';

    try {
      let rentalRows: any[] = [];
      if (preloadedVerifiedRentalRows) {
        rentalRows = preloadedVerifiedRentalRows;
      } else {
        const scopedData = await marketIntelligenceService.loadScopedMarketData(scopeLocationIds);
        rentalRows = scopedData.verifiedRentalRows;
      }

      const rents: number[] = [];
      for (const rent of rentalRows) {
        if (isKnownTestRentalListing(rent) || !isVerifiedPublicRentalListing(rent)) continue;
        const val = Number(rent.monthlyRent);
        if (val && val > 0) rents.push(val);
      }

      if (rents.length === 0) return 'NO_DATA';

      return {
        minMonthlyRent: Math.min(...rents),
        maxMonthlyRent: Math.max(...rents),
        medianMonthlyRent: calculateMedian(rents),
        avgMonthlyRent: calculateMean(rents),
        sampleCount: rents.length,
      };
    } catch {
      return 'NO_DATA';
    }
  }

  /**
   * Retrieves connectivity metrics (PostGIS nearby places) capped at max 5 places per category.
   */
  public async getConnectivityIntelligence(location: any): Promise<ConnectivityIntelligenceDto> {
    if (!location) {
      return {
        status: 'NOT_AVAILABLE',
        placesByCategory: {},
        totalNearbyPlaces: 0,
      };
    }

    const rawPlaces = await marketIntelligenceService.getConnectivityMetrics(location);
    if (!rawPlaces || rawPlaces.length === 0) {
      return {
        status: 'NOT_AVAILABLE',
        placesByCategory: {},
        totalNearbyPlaces: 0,
      };
    }

    const placesByCategory: Record<string, ConnectivityPlaceDto[]> = {};
    let totalNearbyPlaces = 0;

    for (const p of rawPlaces) {
      const category = (p.category || 'LANDMARK').toUpperCase();
      if (!placesByCategory[category]) {
        placesByCategory[category] = [];
      }

      if (placesByCategory[category].length < 5) {
        placesByCategory[category].push({
          id: p.id,
          name: p.name,
          category,
          distanceKm: p.distanceKm,
          distanceDisplay: `${p.distanceKm} km`,
          latitude: p.latitude !== undefined && p.latitude !== null ? Number(p.latitude) : null,
          longitude: p.longitude !== undefined && p.longitude !== null ? Number(p.longitude) : null,
        });
        totalNearbyPlaces++;
      }
    }

    return {
      status: 'AVAILABLE',
      placesByCategory,
      totalNearbyPlaces,
    };
  }

  /**
   * Retrieves recent market events with deterministic summaries and public entity resolution.
   */
  public async getRecentActivityIntelligence(
    locationIdOrIds: string | string[],
    limit = 10,
    scope: MetricScope = 'DESCENDANT',
    scopeLocationIds?: string[]
  ): Promise<RecentActivityDto> {
    const boundLimit = Math.min(Math.max(1, limit), 20); // Bounded 1 - 20
    const db = getDb();

    let targetLocationIds: string[] = [];
    if (scopeLocationIds && scopeLocationIds.length > 0) {
      targetLocationIds = scopeLocationIds;
    } else if (Array.isArray(locationIdOrIds)) {
      targetLocationIds = locationIdOrIds;
    } else if (locationIdOrIds) {
      if (scope === 'DESCENDANT') {
        targetLocationIds = await marketIntelligenceService.resolveLocationScopeIds(locationIdOrIds, 'DESCENDANT');
      } else {
        targetLocationIds = [locationIdOrIds];
      }
    }

    if (targetLocationIds.length === 0) {
      return {
        events: [],
        totalEvents: 0,
        scope,
        summaryText: 'No recent market activity has been recorded for this location.',
        recordedUpdatesCount: 0,
      };
    }

    const rawEvents = await marketEventService.getEventsForLocations(targetLocationIds, boundLimit);

    if (rawEvents.length === 0) {
      return {
        events: [],
        totalEvents: 0,
        scope,
        summaryText: 'No recent market activity has been recorded for this location.',
        recordedUpdatesCount: 0,
      };
    }

    const candidateEvents = rawEvents.filter((e) => {
      if (isSyntheticActivityResourceId(e.resourceId)) return false;
      if (e.projectId && isSyntheticActivityResourceId(e.projectId)) return false;
      return true;
    });

    if (candidateEvents.length === 0) {
      return {
        events: [],
        totalEvents: 0,
        scope,
        summaryText: 'No recent market activity has been recorded for this location.',
        recordedUpdatesCount: 0,
      };
    }

    // 1. Batch resolve referenced published projects
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const projectIds = Array.from(
      new Set(
        candidateEvents
          .map((e) => e.projectId || (e.resourceType === 'PROJECT' ? e.resourceId : null))
          .filter((id): id is string => Boolean(id) && (!db || uuidRegex.test(id)))
      )
    );

    const resaleIds = Array.from(
      new Set(
        candidateEvents
          .filter((e) => e.resourceType === 'RESALE_LISTING' || e.eventType.startsWith('RESALE_'))
          .map((e) => e.resourceId)
          .filter((id): id is string => Boolean(id))
      )
    );

    const rentalIds = Array.from(
      new Set(
        candidateEvents
          .filter((e) => e.resourceType === 'RENTAL_LISTING' || e.eventType.startsWith('RENTAL_'))
          .map((e) => e.resourceId)
          .filter((id): id is string => Boolean(id))
      )
    );

    const projectMap = new Map<string, { id: string; name: string; slug: string; canonicalPath: string }>();
    const validResaleIds = new Set<string>();
    const validRentalIds = new Set<string>();

    if (db) {
      await Promise.all([
        projectIds.length > 0
          ? db
              .select({ id: projects.id, name: projects.name, slug: projects.slug })
              .from(projects)
              .where(and(inArray(projects.id, projectIds), eq(projects.lifecycleStatus, 'PUBLISHED')))
              .then((pubProjects) => {
                for (const p of pubProjects) {
                  if (!/^neon-proj-\d+$/i.test(p.slug)) {
                    projectMap.set(p.id, {
                      id: p.id,
                      name: p.name,
                      slug: p.slug,
                      canonicalPath: `/projects/${p.slug}`,
                    });
                  }
                }
              })
              .catch((err) => console.warn('Failed to batch resolve projects for market activity:', err))
          : Promise.resolve(),
        resaleIds.length > 0
          ? db
              .select({ id: resaleListings.id, slug: resaleListings.slug, lifecycleStatus: resaleListings.lifecycleStatus })
              .from(resaleListings)
              .where(and(inArray(resaleListings.id, resaleIds), eq(resaleListings.lifecycleStatus, 'PUBLISHED')))
              .then((rows) => {
                for (const r of rows) {
                  if (!isKnownTestResaleListing(r)) validResaleIds.add(r.id);
                }
              })
              .catch(() => {})
          : Promise.resolve(),
        rentalIds.length > 0
          ? db
              .select({ id: rentalListings.id, slug: rentalListings.slug, lifecycleStatus: rentalListings.lifecycleStatus })
              .from(rentalListings)
              .where(and(inArray(rentalListings.id, rentalIds), eq(rentalListings.lifecycleStatus, 'PUBLISHED')))
              .then((rows) => {
                for (const r of rows) {
                  if (!isKnownTestRentalListing(r)) validRentalIds.add(r.id);
                }
              })
              .catch(() => {})
          : Promise.resolve(),
      ]);
    } else {
      if (projectIds.length > 0) {
        const idSet = new Set(projectIds);
        const allProjects = await projectRepository.findAll();
        for (const p of allProjects) {
          if (
            idSet.has(p.id) &&
            !/^neon-proj-\d+$/i.test(p.slug) &&
            (p.lifecycleStatus ? p.lifecycleStatus === 'PUBLISHED' : p.isPublished !== false)
          ) {
            projectMap.set(p.id, {
              id: p.id,
              name: p.name,
              slug: p.slug,
              canonicalPath: `/projects/${p.slug}`,
            });
          }
        }
      }
      if (resaleIds.length > 0) {
        const allResale = await resaleListingRepository.findAll({ lifecycleStatus: 'PUBLISHED' });
        for (const r of allResale) {
          if (!isKnownTestResaleListing(r)) validResaleIds.add(r.id);
        }
      }
      if (rentalIds.length > 0) {
        const allRental = await rentalListingRepository.findAll({ lifecycleStatus: 'PUBLISHED' });
        for (const r of allRental) {
          if (!isKnownTestRentalListing(r)) validRentalIds.add(r.id);
        }
      }
    }

    // 2. Batch resolve referenced published locations
    const locIds = Array.from(new Set(candidateEvents.map((e) => e.locationId).filter(Boolean)));
    const locationMap = new Map<string, { id: string; name: string; slug: string; canonicalPath: string }>();

    if (db && locIds.length > 0) {
      try {
        const pubLocations = await db
          .select({ id: locations.id, name: locations.name, slug: locations.slug })
          .from(locations)
          .where(and(inArray(locations.id, locIds), eq(locations.status, 'PUBLISHED')));

        for (const l of pubLocations) {
          locationMap.set(l.id, {
            id: l.id,
            name: l.name,
            slug: l.slug,
            canonicalPath: `/locations/${l.slug}`,
          });
        }
      } catch (err) {
        console.warn('Failed to batch resolve locations for market activity:', err);
      }
    } else if (!db && locIds.length > 0) {
      const locIdSet = new Set(locIds);
      const allLocations = await locationRepository.findAll();
      for (const l of allLocations) {
        if (locIdSet.has(l.id) && l.status === 'PUBLISHED') {
          locationMap.set(l.id, {
            id: l.id,
            name: l.name,
            slug: l.slug,
            canonicalPath: `/locations/${l.slug}`,
          });
        }
      }
    }

    const titles: Record<string, string> = {
      PROJECT_PUBLISHED: 'New Project Published',
      PROJECT_STATUS_CHANGED: 'Project Status Updated',
      PROJECT_RERA_VERIFIED: 'RERA Registration Verified',
      PROJECT_RERA_STATUS_CHANGED: 'RERA Status Updated',
      PROJECT_PRICE_CHANGED: 'Starting Price Updated',
      PROJECT_CONFIGURATION_ADDED: 'Configuration Added',
      PROJECT_CONFIGURATION_UPDATED: 'Configuration Updated',
      PROJECT_POSSESSION_UPDATED: 'Possession Timeline Updated',
      RESALE_LISTING_PUBLISHED: 'New Resale Home Listed',
      RESALE_PRICE_CHANGED: 'Resale Price Updated',
      RESALE_STATUS_CHANGED: 'Resale Status Changed',
      RENTAL_LISTING_PUBLISHED: 'New Rental Home Listed',
      RENTAL_PRICE_CHANGED: 'Rental Price Updated',
      RENTAL_STATUS_CHANGED: 'Rental Status Changed',
    };

    // Filter to strictly verified, published public entities (no anonymous "a local residential project" fallback or orphaned test listings)
    const verifiedEvents = candidateEvents.filter((e) => {
      const isProjectEvent = e.resourceType === 'PROJECT' || e.eventType.startsWith('PROJECT_');
      const isResaleEvent = e.resourceType === 'RESALE_LISTING' || e.eventType.startsWith('RESALE_');
      const isRentalEvent = e.resourceType === 'RENTAL_LISTING' || e.eventType.startsWith('RENTAL_');

      if (isProjectEvent) {
        const pid = e.projectId || e.resourceId;
        return Boolean(pid && projectMap.has(pid));
      }
      if (isResaleEvent) {
        if (!validResaleIds.has(e.resourceId)) return false;
        if (e.projectId && !projectMap.has(e.projectId)) return false;
        return true;
      }
      if (isRentalEvent) {
        if (!validRentalIds.has(e.resourceId)) return false;
        if (e.projectId && !projectMap.has(e.projectId)) return false;
        return true;
      }
      return Boolean(locationMap.has(e.locationId));
    });

    const events: PublicMarketEventDto[] = verifiedEvents.map((e) => {
      const projRef = e.projectId ? projectMap.get(e.projectId) : (e.resourceType === 'PROJECT' ? projectMap.get(e.resourceId) : null);
      const locRef = locationMap.get(e.locationId) || null;
      const projectName = projRef ? projRef.name : 'Verified Project';

      let summary = '';
      switch (e.eventType) {
        case 'PROJECT_PUBLISHED':
          summary = projRef
            ? `New residential project '${projRef.name}' was published in this location.`
            : `New residential project was published in this location.`;
          break;
        case 'PROJECT_STATUS_CHANGED':
          summary = `Development stage updated to ${formatStatusDisplay(e.newValue)} for ${projectName}.`;
          break;
        case 'PROJECT_RERA_VERIFIED':
          summary = `RERA registration for ${projectName} was confirmed and verified.`;
          break;
        case 'PROJECT_RERA_STATUS_CHANGED':
          summary = `RERA status updated to ${formatReraStatusDisplay(e.newValue)} for ${projectName}.`;
          break;
        case 'PROJECT_PRICE_CHANGED':
          summary = `Starting pricing was updated for ${projectName}.`;
          break;
        case 'PROJECT_CONFIGURATION_ADDED':
          summary = `${formatBhkDisplay(e.metadata?.bhkType || e.newValue)} configuration added to ${projectName}.`;
          break;
        case 'PROJECT_CONFIGURATION_UPDATED':
          summary = `Configuration information updated for ${projectName}.`;
          break;
        case 'PROJECT_POSSESSION_UPDATED':
          summary = `Possession timeline updated for ${projectName}.`;
          break;
        case 'RESALE_LISTING_PUBLISHED':
          summary = `New verified resale property listed${projRef ? ` in ${projRef.name}` : ' in this location'}.`;
          break;
        case 'RESALE_PRICE_CHANGED':
          summary = `Asking price updated for a published resale listing${projRef ? ` in ${projRef.name}` : ''}.`;
          break;
        case 'RESALE_STATUS_CHANGED':
          summary = `Listing status updated for a resale property${projRef ? ` in ${projRef.name}` : ''}.`;
          break;
        case 'RENTAL_LISTING_PUBLISHED':
          summary = `New residential property listed for lease${projRef ? ` in ${projRef.name}` : ' in this location'}.`;
          break;
        case 'RENTAL_PRICE_CHANGED':
          summary = `Monthly rental price updated for a published lease listing${projRef ? ` in ${projRef.name}` : ''}.`;
          break;
        case 'RENTAL_STATUS_CHANGED':
          summary = `Listing status updated for a rental property${projRef ? ` in ${projRef.name}` : ''}.`;
          break;
        default:
          summary = `Factual market update recorded for ${e.resourceType.toLowerCase().replace(/_/g, ' ')}.`;
      }

      const rawDate = e.eventDate instanceof Date ? e.eventDate : new Date(e.eventDate);
      const isoDate = rawDate.toISOString();

      return {
        id: e.id,
        eventType: e.eventType,
        resourceType: e.resourceType,
        resourceId: e.resourceId,
        locationId: e.locationId,
        title: titles[e.eventType] || e.eventType.replace(/_/g, ' '),
        summary,
        eventDate: isoDate,
        occurredAt: isoDate,
        project: projRef || null,
        location: locRef || null,
        sourceType: 'FACTUAL_RECORD',
        metadata: sanitizeEventMetadata(e.metadata),
      };
    });

    const count = events.length;
    return {
      events,
      totalEvents: count,
      scope,
      summaryText:
        count > 0
          ? `${count} recorded update${count === 1 ? '' : 's'} across this location.`
          : 'No recent market activity has been recorded for this location.',
      recordedUpdatesCount: count,
    };
  }
}

export const locationIntelligenceService = new LocationIntelligenceService();
