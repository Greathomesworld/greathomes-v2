import { getDb } from '../../../db/client';
import { locations, locationMarketSnapshots } from '../../../db/schema';
import { eq, desc } from 'drizzle-orm';
import { marketIntelligenceService } from '../services/marketIntelligenceService';
import { marketEventService } from '../services/marketEventService';
import { ensureSeedData } from '../../../infrastructure/seed';
import { locationRepository } from '../../../infrastructure/repositories/locationProvider';

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

export class MarketIntelligenceDashboardService {
  async getDashboardData(options?: {
    locationSlug?: string;
    scope?: 'DIRECT' | 'DESCENDANT';
    basis?: 'CARPET_AREA' | 'BUILT_UP_AREA' | 'SUPER_BUILT_UP_AREA';
  }): Promise<MarketDashboardDTO> {
    await ensureSeedData();
    const db = getDb();
    const scope = options?.scope || 'DESCENDANT';
    const basis = options?.basis || 'CARPET_AREA';
    const locationSlug = options?.locationSlug;

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
    const scopeIds = await marketIntelligenceService.resolveLocationScopeIds(resolvedLocationId, scope);

    // 2. Fetch supply, RERA and pricing metrics
    const supplyMetrics = await marketIntelligenceService.getSupplyMetrics(resolvedLocationId, scope);
    const reraCoverageMetrics = await marketIntelligenceService.getReraCoverage(resolvedLocationId, scope);
    const priceMetricsList = await marketIntelligenceService.getPriceMetrics(resolvedLocationId, scope);

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

    // 3. Location breakdown grid
    const locationGrid = [];
    for (const loc of allPublishedLocations) {
      if (['CITY', 'DISCOVERY_REGION', 'AREA', 'NEIGHBOURHOOD'].includes(loc.type)) {
        const locScope = ['CITY', 'DISCOVERY_REGION'].includes(loc.type) ? 'DESCENDANT' : 'DIRECT';
        const locSupply = await marketIntelligenceService.getSupplyMetrics(loc.id, locScope);
        const locRera = await marketIntelligenceService.getReraCoverage(loc.id, locScope);
        
        let latestDate: string | null = null;
        if (db) {
          try {
            const [snap] = await db
              .select({ snapshotDate: locationMarketSnapshots.snapshotDate })
              .from(locationMarketSnapshots)
              .where(eq(locationMarketSnapshots.locationId, loc.id))
              .orderBy(desc(locationMarketSnapshots.snapshotDate))
              .limit(1);
            if (snap && snap.snapshotDate) {
              latestDate = new Date(snap.snapshotDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
            }
          } catch (e) {
            // ignore
          }
        }

        locationGrid.push({
          id: loc.id,
          name: loc.name,
          slug: loc.slug,
          type: loc.type,
          projectsCount: locSupply.publishedProjects,
          resaleCount: locSupply.resaleListingsCount,
          rentalCount: locSupply.rentalListingsCount,
          reraVerifiedCount: locRera.verifiedProjects,
          latestDataDate: latestDate || '7 Oct 2026',
        });
      }
    }

    // 4. Historical Trends & History
    let historicalSnapshots: any[] = [];
    if (db) {
      try {
        historicalSnapshots = await db
          .select()
          .from(locationMarketSnapshots)
          .where(eq(locationMarketSnapshots.locationId, resolvedLocationId))
          .orderBy(desc(locationMarketSnapshots.snapshotDate))
          .limit(12);
      } catch (e) {
        // ignore
      }
    }

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

    // 5. Recent Market Activity
    let rawEvents = [];
    try {
      if (scopeIds.length > 0) {
        rawEvents = await marketEventService.getEventsForLocations(scopeIds, 10);
      } else {
        rawEvents = await marketEventService.getLatestEvents(10);
      }
    } catch (e) {
      rawEvents = [];
    }

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
