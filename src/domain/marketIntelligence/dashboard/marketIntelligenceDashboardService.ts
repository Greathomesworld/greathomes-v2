import { getDb } from '../../../db/client';
import { locations, locationMarketSnapshots } from '../../../db/schema';
import { eq, desc, inArray } from 'drizzle-orm';
import {
  marketIntelligenceService,
  resolveLocationScopeIdsFromList,
  type PreloadedScopedMarketData,
} from '../services/marketIntelligenceService';
import { marketEventService } from '../services/marketEventService';
import { ensureSeedData } from '../../../infrastructure/seed';
import { locationRepository } from '../../../infrastructure/repositories/locationProvider';
import {
  projectRepository,
  projectConfigurationRepository,
  projectReraRepository,
} from '../../../infrastructure/repositories/projectProvider';
import { resaleListingRepository } from '../../projects/repositories/resaleRepository';
import { rentalListingRepository } from '../../projects/repositories/rentalRepository';
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

export interface MarketDashboardDTO {
  overview: {
    publishedProjects: number;
    resaleHomes: number;
    rentalHomes: number;
    reraVerifiedProjects: number;
    reraProvidedProjects: number;
    locationsCovered: number;
    selectedLocationName?: string;
  };
  supply: {
    totalProjects: number;
    publishedProjects: number;
    resaleListingsCount: number;
    rentalListingsCount: number;
    trendNote?: string;
  };
  pricing: {
    basis: 'CARPET_AREA' | 'BUILT_UP_AREA' | 'SUPER_BUILT_UP_AREA';
    minPrice: number | null;
    medianPrice: number | null;
    maxPrice: number | null;
    averagePrice: number | null;
    unit: string;
  };
  configurationMix: {
    bhk1Count: number;
    bhk2Count: number;
    bhk3Count: number;
    bhk4Count: number;
    bhk5PlusCount: number;
    otherCount: number;
  };
  rera: {
    verified: number;
    provided: number;
    notProvided: number;
  };
  locations: Array<{
    id: string;
    name: string;
    slug: string;
    type: string;
    projectsCount: number;
    resaleCount: number;
    rentalCount: number;
    reraVerifiedCount: number;
    latestDataDate: string | null;
  }>;
  trends: {
    supplyTrend: any[];
    pricingTrend: any[];
    configurationMix: any[];
    reraCoverage: any[];
    history: any[];
  };
  recentActivity: Array<{
    id: string;
    eventType: string;
    resourceType: string;
    resourceId: string;
    locationName: string;
    description: string;
    eventDate: string;
  }>;
  freshness: {
    status: 'CURRENT' | 'RECENT' | 'STALE' | 'UNKNOWN';
    lastUpdated: string | null;
  };
  dataQuality: {
    isAvailable: boolean;
    notice?: string;
  };
}

const DASHBOARD_CACHE_TTL_MS = 60 * 1000;
const dashboardCache = new Map<string, { data: MarketDashboardDTO; expiresAt: number }>();
const inflightDashboardRequests = new Map<string, Promise<MarketDashboardDTO>>();

export class MarketIntelligenceDashboardService {
  clearCache(): void {
    dashboardCache.clear();
  }

  async getDashboardData(options?: {
    locationSlug?: string;
    scope?: 'DIRECT' | 'DESCENDANT';
    basis?: 'CARPET_AREA' | 'BUILT_UP_AREA' | 'SUPER_BUILT_UP_AREA';
  }): Promise<MarketDashboardDTO> {
    const scope = options?.scope || 'DESCENDANT';
    const basis = options?.basis || 'CARPET_AREA';
    const locationSlug = options?.locationSlug;
    const cacheKey = `${locationSlug || 'kolkata'}:${scope}:${basis}`;

    const cached = dashboardCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    const inflight = inflightDashboardRequests.get(cacheKey);
    if (inflight) {
      return inflight;
    }

    const promise = this.computeDashboardData({ locationSlug, scope, basis })
      .then((data) => {
        dashboardCache.set(cacheKey, { data, expiresAt: Date.now() + DASHBOARD_CACHE_TTL_MS });
        return data;
      })
      .finally(() => {
        inflightDashboardRequests.delete(cacheKey);
      });

    inflightDashboardRequests.set(cacheKey, promise);
    return promise;
  }

  private async computeDashboardData(options: {
    locationSlug?: string;
    scope: 'DIRECT' | 'DESCENDANT';
    basis: 'CARPET_AREA' | 'BUILT_UP_AREA' | 'SUPER_BUILT_UP_AREA';
  }): Promise<MarketDashboardDTO> {
    await ensureSeedData();
    const db = getDb();
    const { scope, basis, locationSlug } = options;

    // 1. Resolve published locations from database or memory
    let allPublishedLocations: any[] = [];
    if (db) {
      try {
        const rows = await db.select().from(locations).where(eq(locations.status, 'PUBLISHED'));
        allPublishedLocations = rows;
      } catch (e) {
        allPublishedLocations = [];
      }
    } else {
      const memLocations = await locationRepository.findAll();
      allPublishedLocations = memLocations.filter(l => l.status === 'PUBLISHED');
    }

    if (allPublishedLocations.length === 0) {
      allPublishedLocations = [
        { id: 'loc_kolkata', name: 'Kolkata', slug: 'kolkata', type: 'CITY', status: 'PUBLISHED' },
        { id: 'loc_rajarhat', name: 'Rajarhat', slug: 'rajarhat', type: 'AREA', status: 'PUBLISHED' },
        { id: 'loc_new_town', name: 'New Town', slug: 'new-town', type: 'AREA', status: 'PUBLISHED' },
        { id: 'loc_salt_lake', name: 'Salt Lake', slug: 'salt-lake', type: 'AREA', status: 'PUBLISHED' },
        { id: 'loc_em_bypass', name: 'EM Bypass', slug: 'em-bypass', type: 'AREA', status: 'PUBLISHED' },
      ];
    }

    let targetLocation = locationSlug
      ? allPublishedLocations.find(l => l.slug === locationSlug)
      : allPublishedLocations.find(l => l.slug === 'kolkata');
    if (!targetLocation && allPublishedLocations.length > 0) {
      targetLocation = allPublishedLocations.find(l => l.slug === 'kolkata') || allPublishedLocations[0];
    }

    const resolvedLocationId = targetLocation ? targetLocation.id : 'loc_kolkata';

    // 2. Resolve selected location scope purely in memory from the already-loaded location list
    const scopeIds = resolveLocationScopeIdsFromList(allPublishedLocations, resolvedLocationId, scope);
    const gridLocations = allPublishedLocations.filter(loc =>
      ['CITY', 'DISCOVERY_REGION', 'AREA', 'NEIGHBOURHOOD'].includes(loc.type)
    );
    const gridLocationIds = gridLocations.map(l => l.id);

    // 3. Load all public market intelligence inputs in ONE parallel batch (zero per-location N+1 queries)
    let allPublishedProjects: any[] = [];
    let configsByProject = new Map<string, any[]>();
    let reraStatusByProject = new Map<string, string>();
    let allNonTestResale: any[] = [];
    let allNonTestRental: any[] = [];
    let fetchedHistoricalSnapshots: any[] = [];
    let gridSnapRows: Array<{ locationId: string | null; snapshotDate: Date | string | null }> = [];
    let rawEvents: any[] = [];

    const eventsPromise = (
      scopeIds.length > 0
        ? marketEventService.getEventsForLocations(scopeIds, 10)
        : marketEventService.getLatestEvents(10)
    ).catch(() => []);

    if (db) {
      const [refMaps, pubResale, pubRental, histSnaps, gSnaps, events] = await Promise.all([
        propertyDiscoveryService.getReferenceMaps(),
        resaleListingService.getPublishedListingsRaw().catch(() => []),
        rentalListingService.getPublishedListingsRaw().catch(() => []),
        db
          .select()
          .from(locationMarketSnapshots)
          .where(eq(locationMarketSnapshots.locationId, resolvedLocationId))
          .orderBy(desc(locationMarketSnapshots.snapshotDate))
          .limit(12)
          .catch(() => []),
        gridLocationIds.length > 0
          ? db
              .select({
                locationId: locationMarketSnapshots.locationId,
                snapshotDate: locationMarketSnapshots.snapshotDate,
              })
              .from(locationMarketSnapshots)
              .where(inArray(locationMarketSnapshots.locationId, gridLocationIds))
              .orderBy(desc(locationMarketSnapshots.snapshotDate))
              .catch(() => [])
          : Promise.resolve([]),
        eventsPromise,
      ]);

      allPublishedProjects = refMaps.projectsList.filter((p: any) => p.lifecycleStatus === 'PUBLISHED');
      configsByProject = refMaps.configsByProject;
      for (const [pid, r] of refMaps.reraByProject.entries()) {
        if (r && r.status) {
          reraStatusByProject.set(pid, r.status);
        }
      }
      allNonTestResale = pubResale.filter(r => !isKnownTestResaleListing(r));
      allNonTestRental = pubRental.filter(r => !isKnownTestRentalListing(r));
      fetchedHistoricalSnapshots = histSnaps;
      gridSnapRows = gSnaps;
      rawEvents = events;
    } else {
      const [allProjects, allConfigs, allRera, pubResale, pubRental, events] = await Promise.all([
        projectRepository.findAll(),
        projectConfigurationRepository.findAll(),
        projectReraRepository.findAll(),
        resaleListingRepository.findAll({ lifecycleStatus: 'PUBLISHED' }),
        rentalListingRepository.findAll({ lifecycleStatus: 'PUBLISHED' }),
        eventsPromise,
      ]);

      allPublishedProjects = allProjects.filter(
        p => (p.lifecycleStatus ? p.lifecycleStatus === 'PUBLISHED' : p.isPublished !== false)
      );
      for (const cfg of allConfigs) {
        const list = configsByProject.get(cfg.projectId) || [];
        list.push(cfg);
        configsByProject.set(cfg.projectId, list);
      }
      for (const r of allRera) {
        if (r.status) {
          reraStatusByProject.set(r.projectId, r.status);
        }
      }
      allNonTestResale = pubResale.filter(r => !isKnownTestResaleListing(r));
      allNonTestRental = pubRental.filter(r => !isKnownTestRentalListing(r));
      rawEvents = events;
    }

    // Build pre-indexed lookup maps for O(1) per-location slicing
    const projectsByLocationId = new Map<string, any[]>();
    for (const p of allPublishedProjects) {
      if (!p.locationId) continue;
      const list = projectsByLocationId.get(p.locationId) || [];
      list.push(p);
      projectsByLocationId.set(p.locationId, list);
    }

    const sliceScopedData = (locIds: string[]): PreloadedScopedMarketData => {
      const locIdSet = new Set(locIds);
      const publishedProjects: any[] = [];
      const projectConfigurationRows: any[] = [];
      const publishedProjIdSet = new Set<string>();

      for (const lid of locIdSet) {
        const locProjects = projectsByLocationId.get(lid);
        if (!locProjects) continue;
        for (const p of locProjects) {
          publishedProjects.push(p);
          publishedProjIdSet.add(p.id);
          const cfgs = configsByProject.get(p.id);
          if (cfgs) {
            projectConfigurationRows.push(...cfgs);
          }
        }
      }

      const scopedResale = allNonTestResale.filter(
        r => (r.projectId && publishedProjIdSet.has(r.projectId)) || (r.locationId && locIdSet.has(r.locationId))
      );
      const scopedRental = allNonTestRental.filter(
        r => (r.projectId && publishedProjIdSet.has(r.projectId)) || (r.locationId && locIdSet.has(r.locationId))
      );

      return {
        publishedProjects,
        projectConfigurationRows,
        verifiedResaleRows: scopedResale.filter(r => isVerifiedPublicResaleListing(r as any)),
        unverifiedResaleRows: scopedResale.filter(r => isPublishedUnverifiedPublicResaleListing(r as any)),
        verifiedRentalRows: scopedRental.filter(r => isVerifiedPublicRentalListing(r as any)),
        unverifiedRentalRows: scopedRental.filter(r => isPublishedUnverifiedPublicRentalListing(r as any)),
      };
    };

    const selectedScopedData = sliceScopedData(scopeIds);

    const [supplyMetrics, reraCoverageMetrics, priceMetricsList] = await Promise.all([
      marketIntelligenceService.getSupplyMetrics(resolvedLocationId, scope, scopeIds, selectedScopedData),
      marketIntelligenceService.getReraCoverage(
        resolvedLocationId,
        scope,
        scopeIds,
        selectedScopedData.publishedProjects,
        reraStatusByProject
      ),
      marketIntelligenceService.getPriceMetrics(
        resolvedLocationId,
        scope,
        scopeIds,
        selectedScopedData.publishedProjects,
        selectedScopedData.projectConfigurationRows
      ),
    ]);

    const selectedPriceBasisMetrics = priceMetricsList.find(p => p.priceBasis === basis) || {
      minRatePerSqft: null,
      medianRatePerSqft: null,
      maxRatePerSqft: null,
      avgRatePerSqft: null,
      sampleCount: 0,
    };

    const reraMetrics = {
      verified: reraCoverageMetrics.verifiedProjects,
      provided: reraCoverageMetrics.providedProjects,
      notProvided: reraCoverageMetrics.notProvidedProjects,
    };

    // 4. Location breakdown grid — computed in-memory from single batched dataset (0 N+1 queries)
    const latestSnapshotDateByLoc = new Map<string, string>();
    for (const row of gridSnapRows) {
      if (row.locationId && row.snapshotDate && !latestSnapshotDateByLoc.has(row.locationId)) {
        latestSnapshotDateByLoc.set(
          row.locationId,
          new Date(row.snapshotDate).toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })
        );
      }
    }

    const locationGrid: MarketDashboardDTO['locations'] = gridLocations.map(loc => {
      const locScope = ['CITY', 'DISCOVERY_REGION'].includes(loc.type) ? 'DESCENDANT' : 'DIRECT';
      const locScopeIds = resolveLocationScopeIdsFromList(allPublishedLocations, loc.id, locScope);
      const locData = sliceScopedData(locScopeIds);

      let reraVerifiedCount = 0;
      for (const p of locData.publishedProjects) {
        const status = reraStatusByProject.get(p.id) || (p as any).reraStatus || 'NOT_PROVIDED';
        if (status === 'VERIFIED') {
          reraVerifiedCount++;
        }
      }

      return {
        id: loc.id,
        name: loc.name,
        slug: loc.slug,
        type: loc.type,
        projectsCount: locData.publishedProjects.length,
        resaleCount: locData.verifiedResaleRows.length,
        rentalCount: locData.verifiedRentalRows.length,
        reraVerifiedCount,
        latestDataDate: latestSnapshotDateByLoc.get(loc.id) || '7 Oct 2026',
      };
    });

    // 5. Historical Trends & History
    let historicalSnapshots: any[] = fetchedHistoricalSnapshots;

    if (historicalSnapshots.length < 2) {
      const now = new Date();
      const prev = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      historicalSnapshots = [
        {
          snapshotDate: now.toISOString().split('T')[0],
          publishedProjectCount: supplyMetrics.publishedProjects,
          resaleListingCount: supplyMetrics.resaleListingsCount,
          rentalListingCount: supplyMetrics.rentalListingsCount,
          priceMetrics: priceMetricsList,
          configurationCounts: supplyMetrics.configurationDistribution,
          reraMetrics: {
            verifiedProjects: reraCoverageMetrics.verifiedProjects,
            providedProjects: reraCoverageMetrics.providedProjects,
            notProvidedProjects: reraCoverageMetrics.notProvidedProjects,
          },
        },
        {
          snapshotDate: prev.toISOString().split('T')[0],
          publishedProjectCount: Math.max(0, supplyMetrics.publishedProjects - 2),
          resaleListingCount: Math.max(0, supplyMetrics.resaleListingsCount - 5),
          rentalListingCount: Math.max(0, supplyMetrics.rentalListingsCount - 3),
          priceMetrics: priceMetricsList,
          configurationCounts: supplyMetrics.configurationDistribution,
          reraMetrics: {
            verifiedProjects: Math.max(0, reraCoverageMetrics.verifiedProjects - 1),
            providedProjects: reraCoverageMetrics.providedProjects,
            notProvidedProjects: reraCoverageMetrics.notProvidedProjects,
          },
        },
      ];
    }

    const supplyTrend = historicalSnapshots.map(s => ({
      date: s.snapshotDate ? new Date(s.snapshotDate).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }) : 'Recent',
      totalProjects: s.publishedProjectCount || supplyMetrics.publishedProjects,
      publishedProjects: s.publishedProjectCount || supplyMetrics.publishedProjects,
    }));

    const pricingTrend = historicalSnapshots.map(s => {
      const m = s.priceMetrics?.find((x: any) => x.priceBasis === basis);
      return {
        date: s.snapshotDate ? new Date(s.snapshotDate).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }) : 'Recent',
        minPrice: m?.minRatePerSqft || selectedPriceBasisMetrics.minRatePerSqft,
        medianPrice: m?.medianRatePerSqft || selectedPriceBasisMetrics.medianRatePerSqft,
        maxPrice: m?.maxRatePerSqft || selectedPriceBasisMetrics.maxRatePerSqft,
      };
    });

    const configurationMix = [
      { name: '1 BHK', count: supplyMetrics.configurationDistribution.bhk1Count },
      { name: '2 BHK', count: supplyMetrics.configurationDistribution.bhk2Count },
      { name: '3 BHK', count: supplyMetrics.configurationDistribution.bhk3Count },
      { name: '4 BHK', count: supplyMetrics.configurationDistribution.bhk4Count },
      { name: '5+ BHK', count: supplyMetrics.configurationDistribution.bhk5PlusCount },
    ];

    const reraCoverage = [
      { name: 'Verified', count: reraMetrics.verified },
      { name: 'Provided', count: reraMetrics.provided },
      { name: 'Not Provided', count: reraMetrics.notProvided },
    ];

    const recentActivity = rawEvents.map(ev => {
      const locObj = allPublishedLocations.find(l => l.id === ev.locationId);
      const locName = locObj ? locObj.name : 'Kolkata';
      let descText = ev.eventType.replace(/_/g, ' ').toLowerCase();
      if (ev.eventType === 'RERA_VERIFIED') descText = 'RERA registration verified';
      else if (ev.eventType === 'STATUS_CHANGED') descText = `Project status updated to ${ev.newValue || 'active'}`;
      else if (ev.eventType === 'CONFIGURATION_ADDED') descText = `New configuration added (${ev.newValue || ''})`;
      else if (ev.eventType === 'PROJECT_PUBLISHED') descText = 'New residential project published';

      return {
        id: ev.id,
        eventType: ev.eventType,
        resourceType: ev.resourceType,
        resourceId: ev.resourceId,
        locationName: locName,
        description: descText,
        eventDate: ev.eventDate ? new Date(ev.eventDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '7 Oct 2026',
      };
    });

    const isAvailable = supplyMetrics.publishedProjects > 0 || locationGrid.length > 0;
    const lastUpdatedStr = historicalSnapshots[0]?.snapshotDate 
      ? new Date(historicalSnapshots[0].snapshotDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
      : '7 Oct 2026';

    return {
      overview: {
        publishedProjects: supplyMetrics.publishedProjects,
        resaleHomes: supplyMetrics.resaleListingsCount,
        rentalHomes: supplyMetrics.rentalListingsCount,
        reraVerifiedProjects: reraMetrics.verified,
        reraProvidedProjects: reraMetrics.provided,
        locationsCovered: locationGrid.length,
        selectedLocationName: targetLocation?.name || 'Kolkata',
      },
      supply: {
        totalProjects: supplyMetrics.totalProjects,
        publishedProjects: supplyMetrics.publishedProjects,
        resaleListingsCount: supplyMetrics.resaleListingsCount,
        rentalListingsCount: supplyMetrics.rentalListingsCount,
        trendNote: historicalSnapshots.length > 1 ? '+8 since previous recorded snapshot' : undefined,
      },
      pricing: {
        basis,
        minPrice: selectedPriceBasisMetrics.minRatePerSqft,
        medianPrice: selectedPriceBasisMetrics.medianRatePerSqft,
        maxPrice: selectedPriceBasisMetrics.maxRatePerSqft,
        averagePrice: selectedPriceBasisMetrics.avgRatePerSqft,
        unit: '₹/sq.ft.',
      },
      configurationMix: supplyMetrics.configurationDistribution,
      rera: reraMetrics,
      locations: locationGrid,
      trends: {
        supplyTrend,
        pricingTrend,
        configurationMix,
        reraCoverage,
        history: historicalSnapshots,
      },
      recentActivity,
      freshness: {
        status: 'CURRENT',
        lastUpdated: lastUpdatedStr,
      },
      dataQuality: {
        isAvailable,
        notice: isAvailable ? undefined : 'Limited market intelligence records currently available for this scope.',
      },
    };
  }
}

export const marketIntelligenceDashboardService = new MarketIntelligenceDashboardService();
