import { SupplyMetrics, PriceMetricsPerBasis, ReraCoverageMetrics, ConfigurationDistribution } from '../entities';
import { MetricScope } from '../types';
import { calculateMean, calculateMedian } from '../metrics';
import { getDb } from '../../../db/client';
import { locations, projects, projectConfigurations, resaleListings, rentalListings, places, projectRera } from '../../../db/schema';
import { eq, and, inArray, or } from 'drizzle-orm';
import { ensureSeedData } from '../../../infrastructure/seed';
import { locationRepository } from '../../../infrastructure/repositories/locationProvider';
import {
  projectRepository,
  projectConfigurationRepository,
  projectReraRepository,
} from '../../../infrastructure/repositories/projectProvider';
import { resaleListingRepository } from '../../projects/repositories/resaleRepository';
import { rentalListingRepository } from '../../projects/repositories/rentalRepository';
import { placeRepository } from '../../../infrastructure/repositories/memory/placeRepositoryMemory';
import {
  isPublicCanonicalLocation,
  resolveLocationCorridor,
  getLocationEditorialTagline,
  getLocationFullDescription,
  getLocationVisualTheme,
  KOLKATA_CORRIDORS,
  KolkataCorridorId,
} from '../../locations/locationRegionMapper';
import {
  resaleListingService,
  isKnownTestResaleListing,
  isVerifiedPublicResaleListing,
  isPublishedUnverifiedPublicResaleListing,
} from '../../projects/services/resaleService';
import {
  rentalListingService,
  isKnownTestRentalListing,
  isVerifiedPublicRentalListing,
  isPublishedUnverifiedPublicRentalListing,
} from '../../projects/services/rentalService';
import { propertyDiscoveryService } from '../../projects/services/propertyDiscoveryService';

const FALLBACK_LOCATION_COORDS: Record<string, { lat: number; lng: number }> = {
  'kolkata': { lat: 22.5726, lng: 88.3639 },
  'rajarhat': { lat: 22.6250, lng: 88.4520 },
  'new-town': { lat: 22.5867, lng: 88.4750 },
  'salt-lake': { lat: 22.5867, lng: 88.4171 },
  'em-bypass': { lat: 22.5354, lng: 88.4036 },
  'alipore': { lat: 22.5322, lng: 88.3324 },
  'ballygunge': { lat: 22.5280, lng: 88.3659 },
  'tollygunge': { lat: 22.4989, lng: 88.3454 },
};

export interface DirectoryChildMicroMarketDto {
  id: string;
  name: string;
  slug: string;
  projectCount: number;
  resaleCount: number;
  rentalCount: number;
  unverifiedResaleCount?: number;
  unverifiedRentalCount?: number;
}

export interface DirectoryLocationCardDto {
  id: string;
  name: string;
  slug: string;
  type: 'STATE' | 'DISTRICT' | 'CITY' | 'DISCOVERY_REGION' | 'AREA' | 'NEIGHBOURHOOD';
  parentId: string | null;
  parentName: string | null;
  parentSlug: string | null;
  corridorId: Exclude<KolkataCorridorId, 'ALL'> | null;
  corridorLabel: string | null;
  featured: boolean;
  latitude: number | null;
  longitude: number | null;
  shortDescription: string;
  description: string;
  projectCount: number;
  resaleCount: number;
  rentalCount: number;
  unverifiedResaleCount: number;
  unverifiedRentalCount: number;
  microMarketCount: number;
  childMicroMarkets: DirectoryChildMicroMarketDto[];
  imageUrl: string;
  badgeText: string;
  badgeTone: 'coral' | 'amber' | 'green' | 'neutral';
}

export interface DirectoryMappableProjectDto {
  id: string;
  name: string;
  slug: string;
  status: string | null;
  locationId: string;
  locationName: string;
  locationSlug: string;
  corridorId: Exclude<KolkataCorridorId, 'ALL'> | null;
  latitude: number;
  longitude: number;
}

export interface DirectoryIntelligenceSummaryDto {
  totals: {
    areasCount: number;
    neighbourhoodsCount: number;
    featuredAreasCount: number;
    publishedProjectsCount: number;
    verifiedResaleCount: number;
    verifiedRentalCount: number;
    unverifiedResaleCount: number;
    unverifiedRentalCount: number;
  };
  areas: DirectoryLocationCardDto[];
  neighbourhoods: DirectoryLocationCardDto[];
  mappableProjects: DirectoryMappableProjectDto[];
  citiesAndMunicipalities: Array<{
    id: string;
    name: string;
    slug: string;
    type: string;
    subtitle: string;
    description: string;
    areaCount: number;
    neighbourhoodCount: number;
    projectCount: number;
    childTowns: Array<{ name: string; slug: string }>;
  }>;
  corridorCounts: Record<
    string,
    {
      areaCount: number;
      microMarketCount: number;
      projectCount: number;
      resaleCount: number;
      rentalCount: number;
      unverifiedResaleCount: number;
      unverifiedRentalCount: number;
    }
  >;
}

export interface PreloadedScopedMarketData {
  publishedProjects: any[];
  projectConfigurationRows: any[];
  verifiedResaleRows: any[];
  unverifiedResaleRows: any[];
  verifiedRentalRows: any[];
  unverifiedRentalRows: any[];
}

export class MarketIntelligenceService {
  private pgLocationsCache: { data: Array<{ id: string; name: string; slug: string; parentId?: string | null; status: string; type?: string; latitude?: number | null; longitude?: number | null }>; expiresAt: number } | null = null;
  private pgPlacesCache: { data: any[]; expiresAt: number } | null = null;
  private pgListingsCache: { resale: any[]; rental: any[]; expiresAt: number } | null = null;

  /**
   * Resolves direct location ID and all descendant location IDs using canonical location hierarchy.
   */
  async resolveLocationScopeIds(locationIdOrSlug: string, scope: MetricScope = 'DESCENDANT'): Promise<string[]> {
    const db = getDb();

    if (!db) {
      await ensureSeedData();
    }
    const allLocations = await locationRepository.findAll();
    if (db) {
      this.pgLocationsCache = { data: allLocations, expiresAt: Date.now() + 3_000 };
    }

    const rootLoc = allLocations.find(l => l.id === locationIdOrSlug || l.slug === locationIdOrSlug);
    const rootId = rootLoc ? rootLoc.id : locationIdOrSlug;

    if (scope === 'DIRECT') return [rootId];

    // Find direct location and its published canonical descendants
    const scopeIds = new Set<string>([rootId]);

    let addedNew = true;
    let iteration = 0;
    const maxIterations = 50; // Guard against infinite loop in case of hierarchy cycles
    while (addedNew && iteration < maxIterations) {
      iteration++;
      addedNew = false;
      for (const loc of allLocations) {
        if (
          loc.status === 'PUBLISHED' &&
          isPublicCanonicalLocation(loc as any) &&
          loc.parentId &&
          scopeIds.has(loc.parentId) &&
          !scopeIds.has(loc.id)
        ) {
          scopeIds.add(loc.id);
          addedNew = true;
        }
      }
    }

    return Array.from(scopeIds);
  }

  /**
   * Loads published projects and eligible resale/rental rows for a location scope in a single batch,
   * eliminating duplicate queries across supply, configuration, price, and RERA services.
   */
  async loadScopedMarketData(locationIds: string[]): Promise<PreloadedScopedMarketData> {
    if (locationIds.length === 0) {
      return {
        publishedProjects: [],
        projectConfigurationRows: [],
        verifiedResaleRows: [],
        unverifiedResaleRows: [],
        verifiedRentalRows: [],
        unverifiedRentalRows: [],
      };
    }

    const db = getDb();
    if (!db) {
      await ensureSeedData();
      const locIdSet = new Set(locationIds);
      const [allProjects, allConfigs, allResale, allRental] = await Promise.all([
        projectRepository.findAll(),
        projectConfigurationRepository.findAll(),
        resaleListingRepository.findAll({ lifecycleStatus: 'PUBLISHED' }),
        rentalListingRepository.findAll({ lifecycleStatus: 'PUBLISHED' }),
      ]);

      const publishedProjects = allProjects.filter(
        p => locIdSet.has(p.locationId) && (p.lifecycleStatus ? p.lifecycleStatus === 'PUBLISHED' : p.isPublished !== false)
      );
      const publishedProjIdSet = new Set(publishedProjects.map(p => p.id));
      const projectConfigurationRows = allConfigs.filter(c => publishedProjIdSet.has(c.projectId));

      const scopedResale = allResale.filter(
        r =>
          !isKnownTestResaleListing(r) &&
          ((r.projectId && publishedProjIdSet.has(r.projectId)) || (r.locationId && locIdSet.has(r.locationId)))
      );
      const scopedRental = allRental.filter(
        r =>
          !isKnownTestRentalListing(r) &&
          ((r.projectId && publishedProjIdSet.has(r.projectId)) || (r.locationId && locIdSet.has(r.locationId)))
      );

      return {
        publishedProjects,
        projectConfigurationRows,
        verifiedResaleRows: scopedResale.filter(r => isVerifiedPublicResaleListing(r as any)),
        unverifiedResaleRows: scopedResale.filter(r => isPublishedUnverifiedPublicResaleListing(r as any)),
        verifiedRentalRows: scopedRental.filter(r => isVerifiedPublicRentalListing(r as any)),
        unverifiedRentalRows: scopedRental.filter(r => isPublishedUnverifiedPublicRentalListing(r as any)),
      };
    }

    const locIdSet = new Set(locationIds);
    const refMaps = await propertyDiscoveryService.getReferenceMaps();
    const publishedProjects = refMaps.projectsList.filter(
      (p: any) => locIdSet.has(p.locationId) && p.lifecycleStatus === 'PUBLISHED'
    );
    const publishedProjIds = publishedProjects.map((p: any) => p.id);
    const publishedProjIdSet = new Set(publishedProjIds);

    const projectConfigurationRows: any[] = [];
    for (const pid of publishedProjIds) {
      const cfgs = refMaps.configsByProject.get(pid);
      if (cfgs) projectConfigurationRows.push(...cfgs);
    }

    const [allPubResale, allPubRental] = await Promise.all([
      resaleListingService.getPublishedListingsRaw().catch(() => []),
      rentalListingService.getPublishedListingsRaw().catch(() => []),
    ]);

    const rawResaleRows = allPubResale.filter(
      r => (r.projectId && publishedProjIdSet.has(r.projectId)) || (r.locationId && locIdSet.has(r.locationId))
    );
    const rawRentalRows = allPubRental.filter(
      r => (r.projectId && publishedProjIdSet.has(r.projectId)) || (r.locationId && locIdSet.has(r.locationId))
    );

    const nonTestResale = rawResaleRows.filter(r => !isKnownTestResaleListing(r));
    const nonTestRental = rawRentalRows.filter(r => !isKnownTestRentalListing(r));

    return {
      publishedProjects,
      projectConfigurationRows,
      verifiedResaleRows: nonTestResale.filter(r => isVerifiedPublicResaleListing(r)),
      unverifiedResaleRows: nonTestResale.filter(r => isPublishedUnverifiedPublicResaleListing(r)),
      verifiedRentalRows: nonTestRental.filter(r => isVerifiedPublicRentalListing(r)),
      unverifiedRentalRows: nonTestRental.filter(r => isPublishedUnverifiedPublicRentalListing(r)),
    };
  }

  /**
   * Computes factual supply metrics for a location (direct or descendant scope).
   */
  async getSupplyMetrics(
    locationId: string,
    scope: MetricScope = 'DESCENDANT',
    preResolvedLocationIds?: string[],
    preloadedData?: PreloadedScopedMarketData
  ): Promise<SupplyMetrics> {
    const locationIds = preResolvedLocationIds || (await this.resolveLocationScopeIds(locationId, scope));
    const db = getDb();

    if (locationIds.length === 0) {
      return {
        totalProjects: 0,
        publishedProjects: 0,
        newLaunchProjects: 0,
        underConstructionProjects: 0,
        readyToMoveProjects: 0,
        completedProjects: 0,
        soldOutProjects: 0,
        resaleListingsCount: 0,
        rentalListingsCount: 0,
        unverifiedResaleListingsCount: 0,
        unverifiedRentalListingsCount: 0,
        configurationDistribution: { bhk1Count: 0, bhk2Count: 0, bhk3Count: 0, bhk4Count: 0, bhk5PlusCount: 0, otherCount: 0 },
        scope,
      };
    }

    const scopedData = preloadedData || (await this.loadScopedMarketData(locationIds));
    const publishedProjs = scopedData.publishedProjects;

    const newLaunchProjects = publishedProjs.filter(p => p.status === 'NEW_LAUNCH').length;
    const underConstructionProjects = publishedProjs.filter(p => p.status === 'UNDER_CONSTRUCTION').length;
    const readyToMoveProjects = publishedProjs.filter(p => p.status === 'READY_TO_MOVE').length;
    const completedProjects = publishedProjs.filter(p => p.status === 'COMPLETED').length;
    const soldOutProjects = publishedProjs.filter(p => p.status === 'SOLD_OUT').length;

    const publishedProjIds = publishedProjs.map(p => p.id);
    const configDist: ConfigurationDistribution = {
      bhk1Count: 0,
      bhk2Count: 0,
      bhk3Count: 0,
      bhk4Count: 0,
      bhk5PlusCount: 0,
      otherCount: 0,
    };

    if (publishedProjIds.length > 0) {
      let configRows: any[] = [];
      if (scopedData.projectConfigurationRows) {
        configRows = scopedData.projectConfigurationRows;
      } else if (!db) {
        const publishedProjIdSet = new Set(publishedProjIds);
        const allConfigs = await projectConfigurationRepository.findAll();
        configRows = allConfigs.filter(c => publishedProjIdSet.has(c.projectId));
      } else {
        configRows = await db
          .select()
          .from(projectConfigurations)
          .where(inArray(projectConfigurations.projectId, publishedProjIds));
      }

      // Count distinct projects offering each BHK typology rather than raw floor plan variants
      const bhk1Projects = new Set<string>();
      const bhk2Projects = new Set<string>();
      const bhk3Projects = new Set<string>();
      const bhk4Projects = new Set<string>();
      const bhk5PlusProjects = new Set<string>();
      const otherProjects = new Set<string>();

      for (const c of configRows) {
        const pid = c.projectId || c.id;
        const bedrooms = c.bedroomCount;
        if (bedrooms === 1) bhk1Projects.add(pid);
        else if (bedrooms === 2) bhk2Projects.add(pid);
        else if (bedrooms === 3) bhk3Projects.add(pid);
        else if (bedrooms === 4) bhk4Projects.add(pid);
        else if (bedrooms && bedrooms >= 5) bhk5PlusProjects.add(pid);
        else otherProjects.add(pid);
      }

      configDist.bhk1Count = bhk1Projects.size;
      configDist.bhk2Count = bhk2Projects.size;
      configDist.bhk3Count = bhk3Projects.size;
      configDist.bhk4Count = bhk4Projects.size;
      configDist.bhk5PlusCount = bhk5PlusProjects.size;
      configDist.otherCount = otherProjects.size;
    }

    return {
      totalProjects: publishedProjs.length,
      publishedProjects: publishedProjs.length,
      newLaunchProjects,
      underConstructionProjects,
      readyToMoveProjects,
      completedProjects,
      soldOutProjects,
      resaleListingsCount: scopedData.verifiedResaleRows.length,
      rentalListingsCount: scopedData.verifiedRentalRows.length,
      unverifiedResaleListingsCount: scopedData.unverifiedResaleRows.length,
      unverifiedRentalListingsCount: scopedData.unverifiedRentalRows.length,
      configurationDistribution: configDist,
      scope,
    };
  }

  /**
   * Computes price metrics strictly isolated per price basis (CARPET_AREA, BUILT_UP_AREA, SUPER_BUILT_UP_AREA).
   * NEVER combines incompatible price bases.
   */
  async getPriceMetrics(
    locationId: string,
    scope: MetricScope = 'DESCENDANT',
    preResolvedLocationIds?: string[],
    preloadedPublishedProjects?: any[],
    preloadedProjectConfigurations?: any[]
  ): Promise<PriceMetricsPerBasis[]> {
    const locationIds = preResolvedLocationIds || (await this.resolveLocationScopeIds(locationId, scope));
    if (locationIds.length === 0) return [];
    const db = getDb();

    let configRows: any[] = [];

    if (preloadedProjectConfigurations) {
      configRows = preloadedProjectConfigurations;
    } else if (!db) {
      await ensureSeedData();
      const locIdSet = new Set(locationIds);
      const publishedProjs =
        preloadedPublishedProjects ||
        (await projectRepository.findAll()).filter(
          p => locIdSet.has(p.locationId) && (p.lifecycleStatus ? p.lifecycleStatus === 'PUBLISHED' : p.isPublished !== false)
        );
      const publishedProjIds = new Set(publishedProjs.map(p => p.id));
      if (publishedProjIds.size === 0) return [];
      const allConfigs = await projectConfigurationRepository.findAll();
      configRows = allConfigs.filter(c => publishedProjIds.has(c.projectId));
    } else {
      const projRows =
        preloadedPublishedProjects ||
        (await db
          .select()
          .from(projects)
          .where(and(inArray(projects.locationId, locationIds), eq(projects.lifecycleStatus, 'PUBLISHED'))));
      const projIds = projRows.map(p => p.id);
      if (projIds.length === 0) return [];
      configRows = await db.select().from(projectConfigurations).where(inArray(projectConfigurations.projectId, projIds));
    }

    // Group rates by price basis
    const ratesByBasis: Record<string, number[]> = {
      CARPET_AREA: [],
      BUILT_UP_AREA: [],
      SUPER_BUILT_UP_AREA: [],
    };

    for (const c of configRows) {
      const price = Number(c.price);
      if (!price || price <= 0) continue;

      let area: number | null = null;
      if (c.priceBasis === 'CARPET_AREA') area = c.carpetArea ? Number(c.carpetArea) : null;
      else if (c.priceBasis === 'BUILT_UP_AREA') area = c.builtUpArea ? Number(c.builtUpArea) : null;
      else if (c.priceBasis === 'SUPER_BUILT_UP_AREA') area = c.superBuiltUpArea ? Number(c.superBuiltUpArea) : null;

      if (area && area > 0) {
        const rate = Math.round(price / area);
        if (rate > 0 && ratesByBasis[c.priceBasis]) {
          ratesByBasis[c.priceBasis].push(rate);
        }
      }
    }

    const result: PriceMetricsPerBasis[] = [];
    const bases: ('CARPET_AREA' | 'BUILT_UP_AREA' | 'SUPER_BUILT_UP_AREA')[] = ['CARPET_AREA', 'BUILT_UP_AREA', 'SUPER_BUILT_UP_AREA'];

    for (const basis of bases) {
      const rates = ratesByBasis[basis];
      if (rates.length > 0) {
        result.push({
          priceBasis: basis,
          minRatePerSqft: Math.min(...rates),
          maxRatePerSqft: Math.max(...rates),
          medianRatePerSqft: calculateMedian(rates),
          avgRatePerSqft: calculateMean(rates),
          sampleCount: rates.length,
        });
      }
    }

    return result;
  }

  /**
   * Computes RERA coverage metrics.
   */
  async getReraCoverage(
    locationId: string,
    scope: MetricScope = 'DESCENDANT',
    preResolvedLocationIds?: string[],
    preloadedPublishedProjects?: any[]
  ): Promise<ReraCoverageMetrics> {
    const locationIds = preResolvedLocationIds || (await this.resolveLocationScopeIds(locationId, scope));
    if (locationIds.length === 0) {
      return { verifiedProjects: 0, providedProjects: 0, notProvidedProjects: 0, totalProjects: 0, verifiedPercentage: 0 };
    }
    const db = getDb();

    if (!db) {
      await ensureSeedData();
      const locIdSet = new Set(locationIds);
      const projRows =
        preloadedPublishedProjects ||
        (await projectRepository.findAll()).filter(
          p => locIdSet.has(p.locationId) && (p.lifecycleStatus ? p.lifecycleStatus === 'PUBLISHED' : p.isPublished !== false)
        );
      const totalProjects = projRows.length;
      if (totalProjects === 0) {
        return { verifiedProjects: 0, providedProjects: 0, notProvidedProjects: 0, totalProjects: 0, verifiedPercentage: 0 };
      }

      const allRera = await projectReraRepository.findAll();
      const reraMap = new Map<string, string>();
      for (const r of allRera) {
        reraMap.set(r.projectId, r.status);
      }

      let verifiedProjects = 0;
      let providedProjects = 0;
      let notProvidedProjects = 0;

      for (const p of projRows) {
        const status = reraMap.get(p.id) || (p as any).reraStatus || 'NOT_PROVIDED';
        if (status === 'VERIFIED') verifiedProjects++;
        else if (status === 'PROVIDED') providedProjects++;
        else notProvidedProjects++;
      }

      const verifiedPercentage = Math.round((verifiedProjects / totalProjects) * 100 * 10) / 10;

      return {
        verifiedProjects,
        providedProjects,
        notProvidedProjects,
        totalProjects,
        verifiedPercentage,
      };
    }

    const projRows =
      preloadedPublishedProjects ||
      (await db
        .select()
        .from(projects)
        .where(and(inArray(projects.locationId, locationIds), eq(projects.lifecycleStatus, 'PUBLISHED'))));
    const totalProjects = projRows.length;

    if (totalProjects === 0) {
      return { verifiedProjects: 0, providedProjects: 0, notProvidedProjects: 0, totalProjects: 0, verifiedPercentage: 0 };
    }

    const projIds = projRows.map(p => p.id);
    const reraMap = new Map<string, string>();
    if (projIds.length > 0) {
      try {
        const refMaps = await propertyDiscoveryService.getReferenceMaps();
        for (const pid of projIds) {
          const r = refMaps.reraByProject.get(pid);
          if (r && r.status) {
            reraMap.set(pid, r.status);
          }
        }
      } catch {
        // Table fallback
      }
    }

    let verifiedProjects = 0;
    let providedProjects = 0;
    let notProvidedProjects = 0;

    for (const p of projRows) {
      const status = reraMap.get(p.id) || (p as any).reraStatus || 'NOT_PROVIDED';
      if (status === 'VERIFIED') verifiedProjects++;
      else if (status === 'PROVIDED') providedProjects++;
      else notProvidedProjects++;
    }

    const verifiedPercentage = Math.round((verifiedProjects / totalProjects) * 100 * 10) / 10;

    return {
      verifiedProjects,
      providedProjects,
      notProvidedProjects,
      totalProjects,
      verifiedPercentage,
    };
  }

  /**
   * Computes factual PostGIS/Spatial connectivity metrics for a location (KM distance only).
   * Filters local amenities to <= 10 km and major city-wide transit hubs (AIRPORT) to <= 35 km.
   */
  async getConnectivityMetrics(locationOrId: string | { id: string; slug?: string; latitude?: number | null; longitude?: number | null }): Promise<any[]> {
    const db = getDb();
    let lat: number | null = null;
    let lng: number | null = null;
    let placeRows: any[] = [];

    const passedLoc = typeof locationOrId === 'object' && locationOrId !== null ? locationOrId : null;
    const locationId = passedLoc ? passedLoc.id : (locationOrId as string);

    if (!db) {
      await ensureSeedData();
      const loc = passedLoc && (passedLoc.latitude !== undefined || passedLoc.slug)
        ? passedLoc
        : (await locationRepository.findById(locationId)) || (await locationRepository.findBySlug(locationId));
      if (!loc) return [];
      const fallback = loc.slug ? FALLBACK_LOCATION_COORDS[loc.slug] : undefined;
      lat = loc.latitude !== undefined && loc.latitude !== null ? Number(loc.latitude) : fallback ? fallback.lat : null;
      lng = loc.longitude !== undefined && loc.longitude !== null ? Number(loc.longitude) : fallback ? fallback.lng : null;
      if (lat === null || lng === null) return [];
      placeRows = await placeRepository.findAll();
    } else {
      let loc: { slug?: string; latitude?: number | null; longitude?: number | null } | undefined =
        passedLoc && (passedLoc.latitude !== undefined || passedLoc.slug) ? passedLoc : undefined;
      if (!loc) {
        if (this.pgLocationsCache && this.pgLocationsCache.expiresAt > Date.now()) {
          loc = this.pgLocationsCache.data.find(l => l.id === locationId || l.slug === locationId);
        }
        if (!loc) {
          const [dbLoc] = await db.select().from(locations).where(eq(locations.id, locationId)).limit(1);
          if (dbLoc) {
            loc = {
              slug: dbLoc.slug,
              latitude: dbLoc.latitude !== null && dbLoc.latitude !== undefined ? Number(dbLoc.latitude) : null,
              longitude: dbLoc.longitude !== null && dbLoc.longitude !== undefined ? Number(dbLoc.longitude) : null,
            };
          }
        }
      }
      if (!loc) return [];
      const fallback = loc.slug ? FALLBACK_LOCATION_COORDS[loc.slug] : undefined;
      lat = loc.latitude !== undefined && loc.latitude !== null ? Number(loc.latitude) : fallback ? fallback.lat : null;
      lng = loc.longitude !== undefined && loc.longitude !== null ? Number(loc.longitude) : fallback ? fallback.lng : null;
      if (lat === null || lng === null) return [];

      const now = Date.now();
      if (this.pgPlacesCache && this.pgPlacesCache.expiresAt > now) {
        placeRows = this.pgPlacesCache.data;
      } else {
        placeRows = await db.select().from(places);
        this.pgPlacesCache = { data: placeRows, expiresAt: now + 10_000 };
      }
    }

    const connectivity: any[] = [];
    for (const p of placeRows) {
      if (p.isActive === false) continue;
      if (!p.latitude || !p.longitude) continue;
      const pLat = Number(p.latitude);
      const pLng = Number(p.longitude);

      // Haversine distance in KM
      const R = 6371; // Earth radius in km
      const dLat = ((pLat - lat) * Math.PI) / 180;
      const dLng = ((pLng - lng) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((lat * Math.PI) / 180) * Math.cos((pLat * Math.PI) / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const distanceKm = Math.round(R * c * 10) / 10;

      const catUpper = (p.category || 'LANDMARK').toUpperCase();
      const maxAllowedKm = catUpper === 'AIRPORT' ? 35 : 10;
      if (distanceKm > maxAllowedKm) continue;

      connectivity.push({
        id: p.id,
        name: p.name,
        category: p.category,
        distanceKm,
        distanceDisplay: `${distanceKm} km`,
        latitude: pLat,
        longitude: pLng,
      });
    }

    return connectivity.sort((a, b) => a.distanceKm - b.distanceKm).slice(0, 12);
  }

  /**
   * Batch computes directory-wide location intelligence across all canonical Areas,
   * Neighbourhoods, and Cities in 4 single batch queries (0 N+1 queries).
   */
  async getDirectoryIntelligenceSummary(): Promise<DirectoryIntelligenceSummaryDto> {
    const db = getDb();
    let allLocs: any[] = [];
    let pubProjects: Array<{
      id: string;
      name: string;
      slug: string;
      status: string | null;
      locationId: string | null;
      latitude: number | null;
      longitude: number | null;
    }> = [];
    let rawResale: Array<{
      id: string;
      slug: string | null;
      projectId: string | null;
      locationId: string | null;
      lifecycleStatus: string;
      verificationStatus: string;
    }> = [];
    let rawRental: Array<{
      id: string;
      slug: string | null;
      projectId: string | null;
      locationId: string | null;
      lifecycleStatus: string;
      verificationStatus: string;
    }> = [];

    if (db) {
      const [locRows, projRows, resaleRows, rentalRows] = await Promise.all([
        db.select().from(locations).where(eq(locations.status, 'PUBLISHED')),
        db
          .select({
            id: projects.id,
            name: projects.name,
            slug: projects.slug,
            status: projects.status,
            locationId: projects.locationId,
            latitude: projects.latitude,
            longitude: projects.longitude,
          })
          .from(projects)
          .where(eq(projects.lifecycleStatus, 'PUBLISHED')),
        db
          .select({
            id: resaleListings.id,
            slug: resaleListings.slug,
            projectId: resaleListings.projectId,
            locationId: resaleListings.locationId,
            lifecycleStatus: resaleListings.lifecycleStatus,
            verificationStatus: resaleListings.verificationStatus,
          })
          .from(resaleListings)
          .where(eq(resaleListings.lifecycleStatus, 'PUBLISHED')),
        db
          .select({
            id: rentalListings.id,
            slug: rentalListings.slug,
            projectId: rentalListings.projectId,
            locationId: rentalListings.locationId,
            lifecycleStatus: rentalListings.lifecycleStatus,
            verificationStatus: rentalListings.verificationStatus,
          })
          .from(rentalListings)
          .where(eq(rentalListings.lifecycleStatus, 'PUBLISHED')),
      ]);
      allLocs = locRows;
      pubProjects = projRows.map(p => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        status: p.status ?? null,
        locationId: p.locationId,
        latitude: p.latitude !== null && p.latitude !== undefined ? Number(p.latitude) : null,
        longitude: p.longitude !== null && p.longitude !== undefined ? Number(p.longitude) : null,
      }));
      rawResale = resaleRows;
      rawRental = rentalRows;
    } else {
      await ensureSeedData();
      const [locRows, projRows, resaleRows, rentalRows] = await Promise.all([
        locationRepository.findAll(),
        projectRepository.findAll(),
        resaleListingRepository.findAll({ lifecycleStatus: 'PUBLISHED' }),
        rentalListingRepository.findAll({ lifecycleStatus: 'PUBLISHED' }),
      ]);
      allLocs = locRows.filter(l => l.status === 'PUBLISHED');
      pubProjects = projRows
        .filter(p => (p.lifecycleStatus ? p.lifecycleStatus === 'PUBLISHED' : p.isPublished !== false))
        .map(p => ({
          id: p.id,
          name: p.name,
          slug: p.slug,
          status: p.status ?? null,
          locationId: p.locationId,
          latitude: p.latitude !== null && p.latitude !== undefined ? Number(p.latitude) : null,
          longitude: p.longitude !== null && p.longitude !== undefined ? Number(p.longitude) : null,
        }));
      rawResale = resaleRows.map(r => ({
        id: r.id,
        slug: r.slug ?? null,
        projectId: r.projectId || null,
        locationId: r.locationId || null,
        lifecycleStatus: r.lifecycleStatus,
        verificationStatus: r.verificationStatus,
      }));
      rawRental = rentalRows.map(r => ({
        id: r.id,
        slug: r.slug ?? null,
        projectId: r.projectId || null,
        locationId: r.locationId || null,
        lifecycleStatus: r.lifecycleStatus,
        verificationStatus: r.verificationStatus,
      }));
    }

    const canonicalLocs = allLocs.filter(l => isPublicCanonicalLocation(l));
    const locById = new Map<string, any>();
    const childrenByParentId = new Map<string, any[]>();

    for (const loc of canonicalLocs) {
      locById.set(loc.id, loc);
      if (loc.parentId) {
        const list = childrenByParentId.get(loc.parentId) || [];
        list.push(loc);
        childrenByParentId.set(loc.parentId, list);
      }
    }

    // Map projects by direct locationId (only for canonical locations)
    const directProjectsByLocId = new Map<string, string[]>();
    const projLocationMap = new Map<string, string>();
    for (const p of pubProjects) {
      if (!p.locationId || !locById.has(p.locationId)) continue;
      projLocationMap.set(p.id, p.locationId);
      const list = directProjectsByLocId.get(p.locationId) || [];
      list.push(p.id);
      directProjectsByLocId.set(p.locationId, list);
    }

    // Filter out known test fixtures and require a valid effective canonical location association
    const verResale = rawResale.filter(r => {
      if (!isVerifiedPublicResaleListing(r)) return false;
      const effectiveLocId = r.locationId || (r.projectId ? projLocationMap.get(r.projectId) : null);
      return Boolean(effectiveLocId && locById.has(effectiveLocId));
    });

    const unverResale = rawResale.filter(r => {
      if (!isPublishedUnverifiedPublicResaleListing(r)) return false;
      const effectiveLocId = r.locationId || (r.projectId ? projLocationMap.get(r.projectId) : null);
      return Boolean(effectiveLocId && locById.has(effectiveLocId));
    });

    const verRental = rawRental.filter(r => {
      if (!isVerifiedPublicRentalListing(r)) return false;
      const effectiveLocId = r.locationId || (r.projectId ? projLocationMap.get(r.projectId) : null);
      return Boolean(effectiveLocId && locById.has(effectiveLocId));
    });

    const unverRental = rawRental.filter(r => {
      if (!isPublishedUnverifiedPublicRentalListing(r)) return false;
      const effectiveLocId = r.locationId || (r.projectId ? projLocationMap.get(r.projectId) : null);
      return Boolean(effectiveLocId && locById.has(effectiveLocId));
    });

    // Resolve effective locationId for each verified and unverified resale/rental listing
    const directResaleByLocId = new Map<string, number>();
    for (const r of verResale) {
      const effectiveLocId = r.locationId || (r.projectId ? projLocationMap.get(r.projectId) : null);
      if (effectiveLocId) {
        directResaleByLocId.set(effectiveLocId, (directResaleByLocId.get(effectiveLocId) || 0) + 1);
      }
    }

    const directUnverResaleByLocId = new Map<string, number>();
    for (const r of unverResale) {
      const effectiveLocId = r.locationId || (r.projectId ? projLocationMap.get(r.projectId) : null);
      if (effectiveLocId) {
        directUnverResaleByLocId.set(effectiveLocId, (directUnverResaleByLocId.get(effectiveLocId) || 0) + 1);
      }
    }

    const directRentalByLocId = new Map<string, number>();
    for (const r of verRental) {
      const effectiveLocId = r.locationId || (r.projectId ? projLocationMap.get(r.projectId) : null);
      if (effectiveLocId) {
        directRentalByLocId.set(effectiveLocId, (directRentalByLocId.get(effectiveLocId) || 0) + 1);
      }
    }

    const directUnverRentalByLocId = new Map<string, number>();
    for (const r of unverRental) {
      const effectiveLocId = r.locationId || (r.projectId ? projLocationMap.get(r.projectId) : null);
      if (effectiveLocId) {
        directUnverRentalByLocId.set(effectiveLocId, (directUnverRentalByLocId.get(effectiveLocId) || 0) + 1);
      }
    }

    // Build mappableProjects strictly for projects that have actual project-level coordinates
    const mappableProjects: DirectoryMappableProjectDto[] = [];
    for (const p of pubProjects) {
      if (
        p.latitude !== null &&
        p.longitude !== null &&
        !Number.isNaN(p.latitude) &&
        !Number.isNaN(p.longitude) &&
        p.locationId &&
        locById.has(p.locationId)
      ) {
        const loc = locById.get(p.locationId)!;
        const parent = loc.parentId ? locById.get(loc.parentId) : null;
        const corridor = resolveLocationCorridor(loc.slug, parent?.slug, loc.type);
        mappableProjects.push({
          id: p.id,
          name: p.name,
          slug: p.slug,
          status: p.status,
          locationId: loc.id,
          locationName: loc.name,
          locationSlug: loc.slug,
          corridorId: corridor ? corridor.id : null,
          latitude: p.latitude,
          longitude: p.longitude,
        });
      }
    }

    // Helper: get all descendant IDs including self
    const getDescendantIds = (rootId: string): string[] => {
      const result = [rootId];
      const visited = new Set<string>([rootId]);
      const queue = [rootId];
      while (queue.length > 0) {
        const curr = queue.shift()!;
        const children = childrenByParentId.get(curr) || [];
        for (const ch of children) {
          if (!visited.has(ch.id)) {
            visited.add(ch.id);
            result.push(ch.id);
            queue.push(ch.id);
          }
        }
      }
      return result;
    };

    const buildCardDto = (loc: any): DirectoryLocationCardDto => {
      const parent = loc.parentId ? locById.get(loc.parentId) : null;
      const corridor = resolveLocationCorridor(loc.slug, parent?.slug, loc.type);
      const scopeIds = getDescendantIds(loc.id);

      let projectCount = 0;
      let resaleCount = 0;
      let rentalCount = 0;
      let unverifiedResaleCount = 0;
      let unverifiedRentalCount = 0;

      for (const sid of scopeIds) {
        projectCount += (directProjectsByLocId.get(sid) || []).length;
        resaleCount += directResaleByLocId.get(sid) || 0;
        rentalCount += directRentalByLocId.get(sid) || 0;
        unverifiedResaleCount += directUnverResaleByLocId.get(sid) || 0;
        unverifiedRentalCount += directUnverRentalByLocId.get(sid) || 0;
      }

      const directChildren = (childrenByParentId.get(loc.id) || []).filter(
        c => c.type === 'NEIGHBOURHOOD'
      );

      const childMicroMarkets: DirectoryChildMicroMarketDto[] = directChildren
        .map(ch => {
          const chProj = (directProjectsByLocId.get(ch.id) || []).length;
          const chResale = directResaleByLocId.get(ch.id) || 0;
          const chRental = directRentalByLocId.get(ch.id) || 0;
          const chUnverResale = directUnverResaleByLocId.get(ch.id) || 0;
          const chUnverRental = directUnverRentalByLocId.get(ch.id) || 0;
          return {
            id: ch.id,
            name: ch.name,
            slug: ch.slug,
            projectCount: chProj,
            resaleCount: chResale,
            rentalCount: chRental,
            unverifiedResaleCount: chUnverResale,
            unverifiedRentalCount: chUnverRental,
          };
        })
        .sort((a, b) => b.projectCount - a.projectCount || a.name.localeCompare(b.name));

      const visual = getLocationVisualTheme(loc.slug, Boolean(loc.featured), corridor?.shortLabel);

      return {
        id: loc.id,
        name: loc.name,
        slug: loc.slug,
        type: loc.type,
        parentId: loc.parentId || null,
        parentName: parent ? parent.name : null,
        parentSlug: parent ? parent.slug : null,
        corridorId: corridor ? corridor.id : null,
        corridorLabel: corridor ? corridor.label : null,
        featured: Boolean(loc.featured),
        latitude: loc.latitude !== null && loc.latitude !== undefined ? Number(loc.latitude) : null,
        longitude: loc.longitude !== null && loc.longitude !== undefined ? Number(loc.longitude) : null,
        shortDescription: getLocationEditorialTagline(loc),
        description: getLocationFullDescription(loc),
        projectCount,
        resaleCount,
        rentalCount,
        unverifiedResaleCount,
        unverifiedRentalCount,
        microMarketCount: childMicroMarkets.length,
        childMicroMarkets,
        imageUrl: visual.imageUrl,
        badgeText: visual.badgeText,
        badgeTone: visual.badgeTone,
      };
    };

    // Priority order for key residential areas
    const PRIORITY_SLUGS = [
      'new-town',
      'salt-lake',
      'ballygunge',
      'rajarhat',
      'em-bypass',
      'alipore',
      'tollygunge',
      'garia',
      'joka',
      'behala',
      'dum-dum',
      'vip-road',
      'lake-town',
      'new-alipore',
      'park-street-area',
      'jadavpur',
    ];
    const priorityRank = new Map<string, number>(PRIORITY_SLUGS.map((s, idx) => [s, idx]));

    const rawAreas = canonicalLocs.filter(l => l.type === 'AREA' && l.slug !== 'konnagar');
    const areas = rawAreas.map(buildCardDto).sort((a, b) => {
      const rankA = priorityRank.has(a.slug) ? priorityRank.get(a.slug)! : 999;
      const rankB = priorityRank.has(b.slug) ? priorityRank.get(b.slug)! : 999;
      if (rankA !== rankB) return rankA - rankB;
      if (a.featured !== b.featured) return a.featured ? -1 : 1;
      if (b.projectCount !== a.projectCount) return b.projectCount - a.projectCount;
      return a.name.localeCompare(b.name);
    });

    const rawNeighbourhoods = canonicalLocs.filter(l => l.type === 'NEIGHBOURHOOD');
    const neighbourhoods = rawNeighbourhoods.map(buildCardDto).sort((a, b) => {
      if (b.projectCount !== a.projectCount) return b.projectCount - a.projectCount;
      if (a.featured !== b.featured) return a.featured ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    // Corridor counts (Areas, Micro-Markets, Projects, Verified & Unverified Resale/Rental)
    const corridorCounts: DirectoryIntelligenceSummaryDto['corridorCounts'] = {};
    for (const c of KOLKATA_CORRIDORS) {
      const cAreas = areas.filter(a => a.corridorId === c.id);
      corridorCounts[c.id] = {
        areaCount: cAreas.length,
        microMarketCount: cAreas.reduce((sum, a) => sum + a.microMarketCount, 0),
        projectCount: cAreas.reduce((sum, a) => sum + a.projectCount, 0),
        resaleCount: cAreas.reduce((sum, a) => sum + a.resaleCount, 0),
        rentalCount: cAreas.reduce((sum, a) => sum + a.rentalCount, 0),
        unverifiedResaleCount: cAreas.reduce((sum, a) => sum + a.unverifiedResaleCount, 0),
        unverifiedRentalCount: cAreas.reduce((sum, a) => sum + a.unverifiedRentalCount, 0),
      };
    }

    // Cities & Municipalities (Kolkata, Howrah, Hooghly + Konnagar)
    const kolkataLoc = canonicalLocs.find(l => l.slug === 'kolkata');
    const howrahLoc = canonicalLocs.find(l => l.slug === 'howrah');
    const hooghlyLoc = canonicalLocs.find(l => l.slug === 'hooghly');
    const konnagarLoc = canonicalLocs.find(l => l.slug === 'konnagar');

    const citiesAndMunicipalities: DirectoryIntelligenceSummaryDto['citiesAndMunicipalities'] = [];
    if (kolkataLoc) {
      const kolkataScope = getDescendantIds(kolkataLoc.id);
      let kolkataProjs = 0;
      for (const sid of kolkataScope) {
        kolkataProjs += (directProjectsByLocId.get(sid) || []).length;
      }
      citiesAndMunicipalities.push({
        id: kolkataLoc.id,
        name: kolkataLoc.name,
        slug: kolkataLoc.slug,
        type: 'Metropolitan City',
        subtitle: 'West Bengal · Primary Market',
        description: getLocationEditorialTagline(kolkataLoc),
        areaCount: areas.length,
        neighbourhoodCount: neighbourhoods.filter(n => n.slug !== 'konnagar').length,
        projectCount: kolkataProjs,
        childTowns: [
          { name: 'New Town', slug: 'new-town' },
          { name: 'Salt Lake', slug: 'salt-lake' },
          { name: 'Ballygunge', slug: 'ballygunge' },
        ],
      });
    }
    if (howrahLoc) {
      const howrahProjs = (directProjectsByLocId.get(howrahLoc.id) || []).length;
      citiesAndMunicipalities.push({
        id: howrahLoc.id,
        name: howrahLoc.name,
        slug: howrahLoc.slug,
        type: 'Twin Metropolitan City',
        subtitle: 'West Bengal · Hooghly River West Bank',
        description: getLocationEditorialTagline(howrahLoc),
        areaCount: 0,
        neighbourhoodCount: 0,
        projectCount: howrahProjs,
        childTowns: [],
      });
    }
    if (hooghlyLoc) {
      const hooghlyScope = getDescendantIds(hooghlyLoc.id);
      let hooghlyProjs = 0;
      for (const sid of hooghlyScope) {
        hooghlyProjs += (directProjectsByLocId.get(sid) || []).length;
      }
      citiesAndMunicipalities.push({
        id: hooghlyLoc.id,
        name: hooghlyLoc.name,
        slug: hooghlyLoc.slug,
        type: 'Metropolitan District',
        subtitle: 'West Bengal · Suburban Rail Corridor',
        description: getLocationEditorialTagline(hooghlyLoc),
        areaCount: 0,
        neighbourhoodCount: konnagarLoc ? 1 : 0,
        projectCount: hooghlyProjs,
        childTowns: konnagarLoc ? [{ name: konnagarLoc.name, slug: konnagarLoc.slug }] : [],
      });
    }

    return {
      totals: {
        areasCount: areas.length,
        neighbourhoodsCount: neighbourhoods.length,
        featuredAreasCount: areas.filter(a => a.featured).length,
        publishedProjectsCount: pubProjects.length,
        verifiedResaleCount: verResale.length,
        verifiedRentalCount: verRental.length,
        unverifiedResaleCount: unverResale.length,
        unverifiedRentalCount: unverRental.length,
      },
      areas,
      neighbourhoods,
      mappableProjects,
      citiesAndMunicipalities,
      corridorCounts,
    };
  }
}

export const marketIntelligenceService = new MarketIntelligenceService();
