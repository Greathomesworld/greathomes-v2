import React, { cache } from 'react';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

import { locationService, LOCATION_ALIASES } from '@/src/domain/locations/services/locationService';
import { locationSeoService } from '@/src/domain/locations/services/locationSeoService';
import { locationIntelligenceService } from '@/src/domain/marketIntelligence/services/locationIntelligenceService';
import { propertyDiscoveryService } from '@/src/domain/projects/services/propertyDiscoveryService';
import { ensureSeedData } from '@/src/infrastructure/seed';
import { getDb } from '@/src/db/client';
import {
  getLocationEditorialTagline,
  getLocationFullDescription,
  resolveLocationCorridor,
} from '@/src/domain/locations/locationRegionMapper';
import { Breadcrumbs, BreadcrumbItem } from '@/src/components/navigation/Breadcrumbs';
import { LocationSectionNav, NavItem } from '@/src/components/locations/LocationSectionNav';
import { LocationHero2 } from '@/src/components/locations/LocationHero2';
import { ChildLocationsSection } from '@/src/components/locations/ChildLocationsSection';
import { LocationProjectsSection } from '@/src/components/locations/LocationProjectsSection';
import { ConfigurationIntelligenceSection } from '@/src/components/locations/ConfigurationIntelligenceSection';
import { PricingIntelligenceSection } from '@/src/components/locations/PricingIntelligenceSection';
import { ResaleIntelligenceSection } from '@/src/components/locations/ResaleIntelligenceSection';
import { RentalIntelligenceSection } from '@/src/components/locations/RentalIntelligenceSection';
import { ReraIntelligenceSection } from '@/src/components/locations/ReraIntelligenceSection';
import { LocationConnectivitySection } from '@/src/components/locations/LocationConnectivitySection';
import { MarketActivitySection } from '@/src/components/locations/MarketActivitySection';
import { NearbyLocationsSection } from '@/src/components/locations/NearbyLocationsSection';
import { MarketChartsSection } from '@/src/components/locations/MarketChartsSection';
import { RecentlyViewedTracker } from '@/src/components/customer/RecentlyViewedTracker';

interface LocationPageProps {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ scope?: string }>;
}

const getCachedLocationBySlug = cache(async (normalizedSlug: string) => {
  return locationService.resolveLocationBySlug(normalizedSlug, { publishedOnly: true });
});

const getCachedLocationPath = cache(async (locationId: string) => {
  return locationService.getLocationPath(locationId, { publishedOnly: true });
});

const getCachedChildLocations = cache(async (parentId: string) => {
  return locationService.getChildLocations(parentId, { publishedOnly: true });
});

const getCachedLocationIntelligence = cache(async (normalizedSlug: string, scope: 'DIRECT' | 'DESCENDANT') => {
  return locationIntelligenceService.getLocationIntelligence(normalizedSlug, { scope });
});

function computeGeodesicDistanceKm(
  lat1?: number | null,
  lon1?: number | null,
  lat2?: number | null,
  lon2?: number | null
): number {
  if (
    lat1 === null ||
    lat1 === undefined ||
    lon1 === null ||
    lon1 === undefined ||
    lat2 === null ||
    lat2 === undefined ||
    lon2 === null ||
    lon2 === undefined
  ) {
    return 9999;
  }
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export async function generateMetadata(
  props: LocationPageProps
): Promise<Metadata> {
  if (!getDb()) {
    await ensureSeedData();
  }
  const { slug } = await props.params;
  const rawSearchParams = props.searchParams ? await props.searchParams : {};
  const normalizedSlug = slug.toLowerCase().trim();
  const scopeParam = rawSearchParams.scope === 'DIRECT' ? 'DIRECT' : 'DESCENDANT';
  const isAlias = LOCATION_ALIASES[normalizedSlug] !== undefined;

  const location = await getCachedLocationBySlug(normalizedSlug);

  if (!location || location.status !== 'PUBLISHED') {
    notFound();
  }

  const [path, childLocations, intel] = await Promise.all([
    getCachedLocationPath(location.id),
    getCachedChildLocations(location.id),
    getCachedLocationIntelligence(normalizedSlug, scopeParam),
  ]);

  const publishedCount = intel?.marketOverview?.publishedProjects || 0;
  const syntheticProjectStubs = Array.from({ length: publishedCount }, (_, i) => ({
    id: `proj-${i}`,
    lifecycleStatus: 'PUBLISHED',
  }));

  const eligibility = locationSeoService.evaluateEligibility({
    location,
    path,
    childLocations,
    projects: syntheticProjectStubs,
    isAlias,
  });

  return locationSeoService.buildMetadata(eligibility);
}

export default async function LocationDetailPage(props: LocationPageProps) {
  if (!getDb()) {
    await ensureSeedData();
  }
  const { slug } = await props.params;
  const rawSearchParams = props.searchParams ? await props.searchParams : {};
  const normalizedSlug = slug.toLowerCase().trim();
  const scopeParam = rawSearchParams.scope === 'DIRECT' ? 'DIRECT' : 'DESCENDANT';

  // 1. Resolve Location & Location Intelligence DTO (shared with generateMetadata via React.cache)
  const [location, intel] = await Promise.all([
    getCachedLocationBySlug(normalizedSlug),
    getCachedLocationIntelligence(normalizedSlug, scopeParam),
  ]);

  if (!location || location.status !== 'PUBLISHED' || !intel) {
    notFound();
  }

  const [path, childLocations] = await Promise.all([
    getCachedLocationPath(location.id),
    getCachedChildLocations(location.id),
  ]);

  const [history, projectsRes, resaleRes, rentalRes, siblings] = await Promise.all([
    locationIntelligenceService.getLocationHistory(intel.location.id, scopeParam, {
      hasChildLocations: childLocations.length > 0,
      liveSupply: intel.marketOverview,
    }),
    propertyDiscoveryService.discoverProjects({ location: normalizedSlug, scope: scopeParam }, 1, 20),
    propertyDiscoveryService.discoverBuy({ location: normalizedSlug, scope: scopeParam, inventoryType: 'RESALE' }, 1, 20),
    propertyDiscoveryService.discoverRent({ location: normalizedSlug, scope: scopeParam }, 1, 20),
    location.parentId ? getCachedChildLocations(location.parentId) : Promise.resolve([]),
  ]);

  const projects = projectsRes.data;
  const resaleListings = resaleRes.data.filter(item => item.type === 'RESALE') as any[];
  const rentalListings = rentalRes.data.filter(item => item.type === 'RENT') as any[];

  // 3. Compute accurate descendant project counts for child locations & nearby sibling locations
  const candidateSiblings = siblings.filter(s => s.id !== location.id);
  const allCountTargetIds = [
    ...childLocations.map(c => c.id),
    ...candidateSiblings.map(s => s.id),
  ];
  const scopedProjectCounts = await propertyDiscoveryService.getScopedProjectCountsByLocationIds(allCountTargetIds);

  const childLocationCards = childLocations.map(c => {
    const pCount = scopedProjectCounts.get(c.id) || 0;
    return {
      id: c.id,
      name: c.name,
      slug: c.slug,
      type: c.type,
      levelDisplay: c.type === 'NEIGHBOURHOOD' ? 'Micro-Market' : c.type === 'AREA' ? 'Residential Area' : c.type,
      shortDescription: getLocationEditorialTagline(c),
      description: getLocationFullDescription(c),
      href: `/locations/${c.slug}`,
      projectCount: pCount,
    };
  });

  // 4. Resolve and rank nearby sibling locations by corridor match, geodesic distance, and active project count
  const currentCorridor = resolveLocationCorridor(location.slug, location.name);
  const nearbyLocations = candidateSiblings
    .map(s => {
      const siblingCorridor = resolveLocationCorridor(s.slug, s.name);
      const sameCorridor = siblingCorridor === currentCorridor ? 1 : 0;
      const distKm = computeGeodesicDistanceKm(
        location.latitude,
        location.longitude,
        s.latitude,
        s.longitude
      );
      const pCount = scopedProjectCounts.get(s.id) || 0;
      return {
        id: s.id,
        name: s.name,
        slug: s.slug,
        levelDisplay: s.type === 'NEIGHBOURHOOD' ? 'Micro-Market' : 'Residential Area',
        projectCount: pCount,
        sameCorridor,
        distKm,
      };
    })
    .sort((a, b) => {
      if (b.sameCorridor !== a.sameCorridor) return b.sameCorridor - a.sameCorridor;
      if (Math.abs(a.distKm - b.distKm) > 1.5) return a.distKm - b.distKm;
      if (b.projectCount !== a.projectCount) return b.projectCount - a.projectCount;
      return a.name.localeCompare(b.name);
    })
    .slice(0, 8)
    .map(({ id, name, slug: sSlug, levelDisplay, projectCount }) => ({
      id,
      name,
      slug: sSlug,
      levelDisplay,
      projectCount,
    }));

  // 5. Construct canonical UI Breadcrumb items
  const breadcrumbItems: BreadcrumbItem[] = [
    { label: 'Home', href: '/' },
    { label: 'Locations', href: '/locations' },
  ];

  for (const ancestor of path) {
    if (ancestor.id !== location.id) {
      breadcrumbItems.push({
        label: ancestor.name,
        href: `/locations/${ancestor.slug}`,
      });
    }
  }

  breadcrumbItems.push({
    label: location.name,
    current: true,
  });

  // 6. Determine visible navigation items (capped at <= 7 high-value rendered sections)
  const configDist = intel.supply.projectConfigurationDistribution;
  const hasVisibleConfigurations =
    configDist &&
    configDist !== ('NOT_AVAILABLE' as any) &&
    (configDist.bhk1Count > 0 ||
      configDist.bhk2Count > 0 ||
      configDist.bhk3Count > 0 ||
      configDist.bhk4Count > 0 ||
      configDist.bhk5PlusCount > 0);

  const visibleNavItems: NavItem[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'projects', label: 'Projects' },
    { id: 'resale', label: 'Resale & Rent' },
  ];

  if (childLocationCards.length > 0) {
    visibleNavItems.push({
      id: 'sub-locations',
      label: location.type === 'CITY' ? 'Areas' : 'Micro-Markets',
    });
  }

  if (intel.pricing.status === 'CURRENT') {
    visibleNavItems.push({ id: 'pricing', label: 'Pricing' });
  } else if (hasVisibleConfigurations) {
    visibleNavItems.push({ id: 'configurations', label: 'Configurations' });
  }

  visibleNavItems.push({ id: 'connectivity', label: 'Connectivity' });

  if (history && history.length >= 2) {
    visibleNavItems.push({ id: 'trends', label: 'Trends' });
  } else if (nearbyLocations.length > 0) {
    visibleNavItems.push({ id: 'nearby', label: 'Nearby' });
  }

  // 7. Construct JSON-LD Structured Data
  const structuredData = locationSeoService.buildJsonLd({
    location,
    path,
    canonicalUrl: `https://greathomes.co.in/locations/${location.slug}`,
    description: intel.location.description || undefined,
  });

  return (
    <div className="min-h-screen bg-[#FAFAF8] text-[#111111] flex flex-col font-sans w-full min-w-0 overflow-x-hidden">
      <RecentlyViewedTracker
        resourceType="LOCATION"
        resourceId={location.id}
        resourceSlug={location.slug}
        metadata={{ locationName: location.name }}
      />
      {/* Structured Data (Place + BreadcrumbList JSON-LD) */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      {/* Breadcrumb Bar */}
      <div className="bg-white border-b border-[rgba(17,17,17,0.08)] w-full min-w-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <Breadcrumbs items={breadcrumbItems} />
        </div>
      </div>

      {/* Section Sticky Navigation Bar */}
      <LocationSectionNav items={visibleNavItems.slice(0, 7)} />

      {/* Main Location Intelligence Page Body */}
      <main className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10 space-y-10 sm:space-y-12 flex-grow pb-20 min-w-0">
        {/* 1. Location Hero + Integrated Market Snapshot + Primary CTAs (#overview + #market-snapshot) */}
        <LocationHero2
          location={intel.location}
          marketOverview={intel.marketOverview}
          rera={intel.rera}
          freshness={intel.freshness}
          activeScope={intel.scope}
          hasChildLocations={childLocationCards.length > 0}
        />

        {/* 2. Primary Projects Discovery Section (#projects) */}
        <LocationProjectsSection
          locationName={intel.location.name}
          locationSlug={intel.location.slug}
          projects={projects}
          totalCount={projectsRes.pagination.total}
        />

        {/* 3. Resale Homes Section (#resale) */}
        <ResaleIntelligenceSection
          locationName={intel.location.name}
          locationSlug={intel.location.slug}
          resaleListings={resaleListings}
        />

        {/* 4. Rental Homes Section (#rent) */}
        <RentalIntelligenceSection
          locationName={intel.location.name}
          locationSlug={intel.location.slug}
          rentalListings={rentalListings}
        />

        {/* 5. Micro-Markets & Sectors (#sub-locations) */}
        {childLocationCards.length > 0 && (
          <ChildLocationsSection
            childrenLocations={childLocationCards}
            title={
              location.type === 'CITY'
                ? `Residential Areas in ${intel.location.name}`
                : `Micro-Markets & Sectors in ${intel.location.name}`
            }
            subtitle={
              location.type === 'CITY'
                ? `Explore canonical residential corridors and localities within ${intel.location.name}.`
                : `Explore specific sub-localities, sectors and residential pockets within ${intel.location.name}.`
            }
            parentName={intel.location.name}
          />
        )}

        {/* 6. Configuration Availability (#configurations) */}
        <ConfigurationIntelligenceSection
          locationName={intel.location.name}
          locationSlug={intel.location.slug}
          configDistribution={intel.supply.projectConfigurationDistribution}
        />

        {/* 7. Pricing & Rate Band Intelligence (#pricing) */}
        <PricingIntelligenceSection
          locationName={intel.location.name}
          pricing={intel.pricing}
        />

        {/* 8. RERA Status & Regulatory Coverage (#rera) */}
        <ReraIntelligenceSection
          locationName={intel.location.name}
          rera={intel.rera}
        />

        {/* 9. Location & Connectivity (#connectivity) */}
        <LocationConnectivitySection
          locationName={intel.location.name}
          coordinates={
            intel.location.latitude !== null && intel.location.longitude !== null
              ? { latitude: intel.location.latitude, longitude: intel.location.longitude }
              : null
          }
          connectivity={intel.connectivity}
        />

        {/* 10. Verified Market Activity (#activity — rendered only when verified events exist) */}
        <MarketActivitySection
          locationName={intel.location.name}
          activity={intel.recentActivity}
        />

        {/* 11. Validated Historical Market Trends (#trends — rendered only when >=2 valid comparable snapshots exist) */}
        <MarketChartsSection
          locationName={intel.location.name}
          history={history}
        />

        {/* 12. Nearby Locations (#nearby) */}
        <NearbyLocationsSection
          locationName={intel.location.name}
          nearbyLocations={nearbyLocations}
        />
      </main>
    </div>
  );
}
