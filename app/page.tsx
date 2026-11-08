import type { Metadata } from 'next';
export const revalidate = 60;
import { ensureSeedData } from '@/src/infrastructure/seed';
import {
  projectRepository,
  projectMediaRepository,
  projectConfigurationRepository,
  projectReraRepository,
} from '@/src/infrastructure/repositories/projectProvider';
import { locationRepository } from '@/src/infrastructure/repositories/locationProvider';
import { developerRepository } from '@/src/infrastructure/repositories/developerProvider';
import { resaleListingService } from '@/src/domain/projects/services/resaleService';
import { rentalListingService } from '@/src/domain/projects/services/rentalService';
import { editorialService } from '@/src/domain/editorial/services/editorialService';
import { isKnownTestDeveloperSlug } from '@/src/domain/developers/services/developerService';
import { normalizeMediaPublicUrl } from '@/src/lib/mediaUtils';

import { HomeHero } from '@/src/components/home/HomeHero';
import { HomeExplorePillars } from '@/src/components/home/HomeExplorePillars';
import { HomeProjectSpotlight } from '@/src/components/home/HomeProjectSpotlight';
import { HomeProjectStages } from '@/src/components/home/HomeProjectStages';
import { HomeExploreProjects, HomeProjectCardData } from '@/src/components/home/HomeExploreProjects';
import { HomeResaleSection, HomeListingCardData } from '@/src/components/home/HomeResaleSection';
import { HomeRentalSection } from '@/src/components/home/HomeRentalSection';
import { HomeLocationSection, HomeLocationCardData } from '@/src/components/home/HomeLocationSection';
import { HomePersonalizedSection } from '@/src/components/home/HomePersonalizedSection';
import { HomeWhyGreatHomes } from '@/src/components/home/HomeWhyGreatHomes';
import { HomeTrustCredibility } from '@/src/components/home/HomeTrustCredibility';
import { HomeExpertAssistance } from '@/src/components/home/HomeExpertAssistance';
import { HomeIntelligenceGuides } from '@/src/components/home/HomeIntelligenceGuides';
import { HomeAssistanceCta } from '@/src/components/home/HomeAssistanceCta';

export const metadata: Metadata = {
  title: 'Great Homes | Verified Residential Property Discovery in Kolkata',
  description:
    'Discover verified projects, resale homes and rentals across Kolkata — with the property intelligence and assistance you need to make a confident decision.',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'Great Homes | Verified Residential Property Discovery in Kolkata',
    description:
      'Discover verified projects, resale homes and rentals across Kolkata with Great Homes property intelligence.',
    url: '/',
    siteName: 'Great Homes',
    locale: 'en_IN',
    type: 'website',
  },
};

function formatIndianPrice(amount?: number | null): string | undefined {
  if (amount === undefined || amount === null || isNaN(amount) || amount <= 0) return undefined;
  if (amount >= 10_000_000) {
    const cr = (amount / 10_000_000).toFixed(2).replace(/\.00$/, '');
    return `₹${cr} Cr`;
  }
  if (amount >= 100_000) {
    const l = (amount / 100_000).toFixed(2).replace(/\.00$/, '');
    return `₹${l} L`;
  }
  return `₹${amount.toLocaleString('en-IN')}`;
}

function formatPropertyTypeDisplay(propertyType?: string | null): string {
  if (!propertyType) return 'Apartment';
  const map: Record<string, string> = {
    APARTMENT: 'Apartment',
    VILLA: 'Villa',
    PLOT: 'Plot',
    COMMERCIAL: 'Commercial',
    PENTHOUSE: 'Penthouse',
    DUPLEX: 'Duplex',
    INDEPENDENT_HOUSE: 'Independent House',
    STUDIO: 'Studio',
  };
  const key = propertyType.toUpperCase().trim();
  return map[key] || key.charAt(0) + key.slice(1).toLowerCase().replace(/_/g, ' ');
}

function buildHomepageListingTitle(item: any, type: 'RESALE' | 'RENTAL'): string {
  const propLabel = formatPropertyTypeDisplay(item.propertyType);
  const rawConfig = typeof item.configuration === 'string' ? item.configuration.trim() : '';
  const cleanedConfig = rawConfig.replace(/\s+for\s+(sale|rent|lease)$/i, '').trim();
  const baseLabel = cleanedConfig
    ? cleanedConfig.toLowerCase().includes(propLabel.toLowerCase()) || cleanedConfig.toLowerCase().includes('flat')
      ? cleanedConfig
      : `${cleanedConfig} ${propLabel}`
    : `${item.bedroomCount || (type === 'RESALE' ? 3 : 2)} BHK ${propLabel}`;

  const contextName = item.project?.name || item.location?.name;
  if (contextName) {
    return `${baseLabel} in ${contextName}`;
  }
  return baseLabel;
}

export default async function HomePage() {
  try {
    await ensureSeedData();
  } catch (seedError) {
    console.warn('HomePage ensureSeedData warning:', seedError);
  }

  // Wave 1: Fetch Published Primary Master Data concurrently (3 bounded SQL queries)
  const [allProjects, allLocations, allDevelopers] = await Promise.all([
    projectRepository.list({ lifecycleStatus: 'PUBLISHED', isPublished: true }).catch(() => []),
    locationRepository.findAll().catch(() => []),
    developerRepository.list({ status: 'PUBLISHED' }).catch(() => []),
  ]);

  const locationMap = new Map<string, any>(allLocations.map((l: any) => [l.id, l] as const));
  const publishedDevelopers = allDevelopers.filter(
    (d: any) => d.status === 'PUBLISHED' && !isKnownTestDeveloperSlug(d.slug)
  );
  const developerMap = new Map<string, any>(publishedDevelopers.map((d: any) => [d.id, d] as const));

  // Canonical publication check & test developer exclusion
  const publishedProjects = allProjects.filter((p: any) => {
    const isPub = p.lifecycleStatus ? p.lifecycleStatus === 'PUBLISHED' : p.isPublished === true;
    if (!isPub || p.isPublished === false) return false;
    if (/^neon-proj-\d+$/i.test(p.slug || '')) return false;
    if (p.developerId && !developerMap.has(p.developerId)) return false;
    return true;
  });

  const projectMap = new Map<string, any>(publishedProjects.map((p: any) => [p.id, p] as const));

  // 1. Select Spotlight candidate respecting `featured === true` (Merlin Rise)
  const featuredCandidates = publishedProjects
    .filter((p: any) => Boolean(p.featured))
    .sort((a: any, b: any) => {
      if (a.slug === 'merlin-rise') return -1;
      if (b.slug === 'merlin-rise') return 1;
      return a.name.localeCompare(b.name);
    });
  const spotlightCandidate = featuredCandidates[0] || publishedProjects[0] || null;

  // 2. Build a stage-balanced set of Explore Projects (excluding Spotlight project)
  // so every stage filter tab (New Launch, Under Construction, Ready to Move, Upcoming) has real matching projects
  const nonSpotlightProjects = spotlightCandidate
    ? publishedProjects.filter((p: any) => p.id !== spotlightCandidate.id)
    : [...publishedProjects];

  const sortByFeaturedThenPrice = (list: any[]) =>
    [...list].sort((a, b) => {
      if (Boolean(a.featured) !== Boolean(b.featured)) return a.featured ? -1 : 1;
      const priceA = typeof a.startingPrice === 'number' && a.startingPrice > 0 ? a.startingPrice : Number.MAX_SAFE_INTEGER;
      const priceB = typeof b.startingPrice === 'number' && b.startingPrice > 0 ? b.startingPrice : Number.MAX_SAFE_INTEGER;
      if (priceA !== priceB) return priceA - priceB;
      return a.name.localeCompare(b.name);
    });

  const newLaunchList = sortByFeaturedThenPrice(nonSpotlightProjects.filter((p: any) => p.status === 'NEW_LAUNCH'));
  const readyToMoveList = sortByFeaturedThenPrice(nonSpotlightProjects.filter((p: any) => p.status === 'READY_TO_MOVE'));
  const upcomingList = sortByFeaturedThenPrice(nonSpotlightProjects.filter((p: any) => p.status === 'UPCOMING'));
  const underConstructionList = sortByFeaturedThenPrice(
    nonSpotlightProjects.filter((p: any) => p.status === 'UNDER_CONSTRUCTION')
  );

  // Combine so Page 1 of "All Projects" has a rich stage mix and Page 2 has additional Under Construction projects
  const exploreCandidates: any[] = [
    ...readyToMoveList,
    ...newLaunchList,
    ...upcomingList,
    ...underConstructionList.slice(0, 12),
  ];

  const projectsForHomepage = spotlightCandidate
    ? [spotlightCandidate, ...exploreCandidates]
    : exploreCandidates;
  const homepageProjectIds = projectsForHomepage.map((p: any) => p.id);

  const preloadedListingContext = {
    projectMap,
    devMap: developerMap,
    locMap: locationMap,
    mediaByProject: new Map(),
    configsByProject: new Map(),
    reraByProject: new Map(),
  };

  // Wave 2: Batch-fetch project sub-entities, verified resale/rental listings, and editorial guides in parallel
  const [
    batchedMedia,
    batchedConfigs,
    batchedReras,
    rawResaleDtos,
    rawRentalDtos,
    publishedGuides,
  ] = await Promise.all([
    homepageProjectIds.length > 0
      ? projectMediaRepository.findByProjectIds(homepageProjectIds).catch(() => [])
      : Promise.resolve([]),
    homepageProjectIds.length > 0 && typeof projectConfigurationRepository.findByProjectIds === 'function'
      ? projectConfigurationRepository.findByProjectIds(homepageProjectIds).catch(() => [])
      : Promise.resolve([]),
    homepageProjectIds.length > 0 && typeof projectReraRepository.findByProjectIds === 'function'
      ? projectReraRepository.findByProjectIds(homepageProjectIds).catch(() => [])
      : Promise.resolve([]),
    resaleListingService
      .listPublicListings({
        verificationStatus: 'VERIFIED',
        onlyEligiblePublic: true,
        limit: 8,
        skipAmenities: true,
        preloadedContext: preloadedListingContext,
      })
      .catch(() => []),
    rentalListingService
      .listPublicListings({
        verificationStatus: 'VERIFIED',
        onlyEligiblePublic: true,
        limit: 8,
        skipAmenities: true,
        preloadedContext: preloadedListingContext,
      })
      .catch(() => []),
    editorialService
      .getPublicArticles({
        limit: 3,
        preloadedMaps: {
          projectMap,
          devMap: developerMap,
          locMap: locationMap,
        },
      })
      .then((res) => res.items || [])
      .catch(() => []),
  ]);

  const mediaByProjectId = new Map<string, any[]>();
  for (const m of batchedMedia) {
    const list = mediaByProjectId.get(m.projectId) || [];
    list.push(m);
    mediaByProjectId.set(m.projectId, list);
  }

  const configsByProjectId = new Map<string, any[]>();
  for (const c of batchedConfigs) {
    const list = configsByProjectId.get(c.projectId) || [];
    list.push(c);
    configsByProjectId.set(c.projectId, list);
  }

  const reraByProjectId = new Map<string, any>(
    batchedReras.map((r: any) => [r.projectId, r] as const)
  );

  const homeProjectCards: HomeProjectCardData[] = projectsForHomepage.map((p: any) => {
    const media = mediaByProjectId.get(p.id) || [];
    const configs = configsByProjectId.get(p.id) || [];
    const rera = reraByProjectId.get(p.id) || null;

    const loc = p.locationId ? locationMap.get(p.locationId) : null;
    const dev = p.developerId ? developerMap.get(p.developerId) : null;

    // Filter out technical floor plans (.svg), videos, and walkthroughs for project card covers
    const imageMedia = media.filter(
      (m) =>
        m &&
        typeof m.url === 'string' &&
        m.url.trim().length > 0 &&
        (m.mediaType || 'IMAGE').toUpperCase() === 'IMAGE' &&
        (m.category || '').toUpperCase() !== 'FLOOR_PLANS' &&
        (m.category || '').toUpperCase() !== 'WALKTHROUGH' &&
        !m.url.toLowerCase().endsWith('.svg')
    );
    const featuredMedia = imageMedia.find((m) => m.isFeatured) || imageMedia[0] || null;

    const bhkList = Array.from(
      new Set(
        configs
          .map((c: any) => c.bedroomCount || c.bedrooms)
          .filter((b: any): b is number => Boolean(b && b > 0))
          .sort((a: number, b: number) => a - b)
      )
    );

    const configStr = bhkList.length > 0 ? `${bhkList.join(', ')} BHK` : undefined;

    const carpetAreas = configs
      .map((c: any) => c.carpetArea || c.area)
      .filter((a: any): a is number => Boolean(a && a > 0));
    const minArea = carpetAreas.length > 0 ? Math.min(...carpetAreas) : null;
    const maxArea = carpetAreas.length > 0 ? Math.max(...carpetAreas) : null;
    const areaStr =
      minArea && maxArea
        ? minArea === maxArea
          ? `${minArea.toLocaleString('en-IN')} sq.ft`
          : `${minArea.toLocaleString('en-IN')} – ${maxArea.toLocaleString('en-IN')} sq.ft`
        : undefined;

    const validConfigPrices = configs
      .map((c: any) => c.price)
      .filter((pr: any): pr is number => typeof pr === 'number' && pr > 0);
    const effectiveStartingPrice =
      p.startingPrice && p.startingPrice > 0
        ? p.startingPrice
        : validConfigPrices.length > 0
          ? Math.min(...validConfigPrices)
          : undefined;

    // Strict RERA verification semantics: Only VERIFIED if repository record status is strictly 'VERIFIED'
    const isReraVerified = rera?.status === 'VERIFIED';
    const reraNumber = isReraVerified
      ? rera?.registrationNumber || p.reraRegistrationNumber
      : undefined;

    return {
      id: p.id,
      name: p.name,
      slug: p.slug,
      developerName: dev?.name || 'Leading Developer',
      locationName: loc?.name || 'Kolkata',
      locationSlug: loc?.slug || 'kolkata',
      status: p.status,
      startingPrice: effectiveStartingPrice,
      priceDisplay: formatIndianPrice(effectiveStartingPrice),
      configurationString: configStr,
      areaString: areaStr,
      imageUrl: normalizeMediaPublicUrl(featuredMedia?.url ?? null) || undefined,
      isReraVerified,
      reraNumber,
      isFeatured: Boolean(p.featured),
    };
  });

  // 3. Featured Project Spotlight (`featured === true`)
  const spotlightProject =
    homeProjectCards.find((p) => p.id === spotlightCandidate?.id) ||
    homeProjectCards.find((p) => p.isFeatured) ||
    homeProjectCards[0] ||
    null;

  // 4. Explore Projects Cards (excludes Spotlight project to prevent duplication)
  const exploreProjectsList = spotlightProject
    ? homeProjectCards.filter((p) => p.id !== spotlightProject.id)
    : homeProjectCards;

  // 5. Stage Discovery Counts from published projects (aligned with /projects?stage=...)
  const stageCounts = {
    UPCOMING: publishedProjects.filter((p: any) => p.status === 'UPCOMING').length,
    NEW_LAUNCH: publishedProjects.filter((p: any) => p.status === 'NEW_LAUNCH').length,
    UNDER_CONSTRUCTION: publishedProjects.filter((p: any) => p.status === 'UNDER_CONSTRUCTION').length,
    READY_TO_MOVE: publishedProjects.filter((p: any) => p.status === 'READY_TO_MOVE').length,
  };

  // 6. Active Neighbourhood Locations with Project Counts (excludes STATE, CITY, DISTRICT & 0-project records)
  const projectCountByLocation = new Map<string, number>();
  for (const project of publishedProjects) {
    if (!project.locationId) continue;
    const locationId = String(project.locationId);
    projectCountByLocation.set(locationId, (projectCountByLocation.get(locationId) || 0) + 1);
  }

  const eligibleResidentialLocations = allLocations
    .filter((l: any) => {
      const isPub = l.status === 'PUBLISHED' || l.lifecycleStatus === 'PUBLISHED' || !l.status;
      if (!isPub) return false;
      const locType = (l.type || '').toUpperCase();
      if (locType === 'STATE' || locType === 'CITY' || locType === 'DISTRICT') return false;
      const count = projectCountByLocation.get(String(l.id)) || 0;
      return count > 0;
    })
    .sort((a: any, b: any) => {
      if (Boolean(a.featured) !== Boolean(b.featured)) return a.featured ? -1 : 1;
      const countA = projectCountByLocation.get(String(a.id)) || 0;
      const countB = projectCountByLocation.get(String(b.id)) || 0;
      if (countB !== countA) return countB - countA;
      return a.name.localeCompare(b.name);
    });

  const homeLocationCards: HomeLocationCardData[] = eligibleResidentialLocations.map((loc: any) => ({
    id: loc.id,
    name: loc.name,
    slug: loc.slug,
    type: loc.type,
    description: loc.shortDescription || loc.description,
    projectCount: projectCountByLocation.get(String(loc.id)) || 0,
  }));

  const heroPopularLocations = homeLocationCards.slice(0, 5).map((loc) => ({
    name: loc.name,
    slug: loc.slug,
  }));

  // 7. Map Verified Resale & Rental Listings (never default missing verification status to true)
  const resaleListings: HomeListingCardData[] = (Array.isArray(rawResaleDtos) ? rawResaleDtos : [])
    .filter((item: any) => item.isVerified === true)
    .map((item: any) => {
      const validMediaUrl = normalizeMediaPublicUrl(item.media?.[0]?.url ?? null) || undefined;
      return {
        id: item.id,
        title: buildHomepageListingTitle(item, 'RESALE'),
        slug: item.slug || item.id,
        type: 'RESALE' as const,
        propertyType: formatPropertyTypeDisplay(item.propertyType),
        bhk: item.bedroomCount || 3,
        locationName: item.location?.name || item.project?.location?.name || 'Kolkata',
        projectName: item.project?.name,
        priceDisplay: formatIndianPrice(item.askingPrice) || 'Price on Request',
        imageUrl: validMediaUrl,
        isVerified: item.isVerified === true,
        areaString: item.carpetArea ? `${item.carpetArea.toLocaleString('en-IN')} sq.ft` : undefined,
      };
    })
    .sort((a, b) => (b.imageUrl ? 1 : 0) - (a.imageUrl ? 1 : 0))
    .slice(0, 4);

  const rentalListings: HomeListingCardData[] = (Array.isArray(rawRentalDtos) ? rawRentalDtos : [])
    .filter((item: any) => item.isVerified === true)
    .map((item: any) => {
      const validMediaUrl = normalizeMediaPublicUrl(item.media?.[0]?.url ?? null) || undefined;
      return {
        id: item.id,
        title: buildHomepageListingTitle(item, 'RENTAL'),
        slug: item.slug || item.id,
        type: 'RENTAL' as const,
        propertyType: formatPropertyTypeDisplay(item.propertyType),
        bhk: item.bedroomCount || 2,
        locationName: item.location?.name || item.project?.location?.name || 'Kolkata',
        projectName: item.project?.name,
        priceDisplay: `${formatIndianPrice(item.monthlyRent) || 'Rent on Request'}/mo`,
        imageUrl: validMediaUrl,
        isVerified: item.isVerified === true,
        areaString: item.carpetArea ? `${item.carpetArea.toLocaleString('en-IN')} sq.ft` : undefined,
      };
    })
    .sort((a, b) => (b.imageUrl ? 1 : 0) - (a.imageUrl ? 1 : 0))
    .slice(0, 4);

  return (
    <div className="min-h-screen bg-[#FAFAF8] text-[#111111]">
      {/* 1. Hero with Universal Search & Discovery Modes */}
      <HomeHero popularLocations={heroPopularLocations} />

      {/* 2. Explore / Discovery Modes (New Launch, Resale, Rent with property photography) */}
      <HomeExplorePillars />

      {/* 3. Featured Project Spotlight (Verified featured===true, no duplication) */}
      {spotlightProject && <HomeProjectSpotlight project={spotlightProject} />}

      {/* 4. Project Stage Discovery (Timeline & Handover with truthful published counts) */}
      <HomeProjectStages stageCounts={stageCounts} />

      {/* 5. Explore Projects (Excludes spotlighted project to prevent duplicate content) */}
      <HomeExploreProjects projects={exploreProjectsList} />

      {/* 6. Why Great Homes — Your Home Journey, Simplified (Design A) */}
      <HomeWhyGreatHomes />

      {/* 7. Verified Resale Homes in Kolkata (4-column grid) */}
      <HomeResaleSection listings={resaleListings} />

      {/* 8. Trust & Credibility — A More Confident Way to Find a Home (Design B) */}
      <HomeTrustCredibility />

      {/* 9. Rental Homes in Kolkata (4-column grid) */}
      <HomeRentalSection listings={rentalListings} />

      {/* 10. Popular Residential Locations in Kolkata (4-column grid) */}
      <HomeLocationSection locations={homeLocationCards} />

      {/* 11. Expert Assistance — Let Us Help You Find the Right Home (Design C) */}
      <HomeExpertAssistance />

      {/* 12. Account-Aware Continue Exploring / Set Preferences row */}
      <HomePersonalizedSection />

      {/* 13. Know Before You Buy (Intelligence pillar) */}
      <HomeIntelligenceGuides articles={publishedGuides} />

      {/* 14. Final Assistance (Talk to Great Homes) */}
      <HomeAssistanceCta />
    </div>
  );
}
