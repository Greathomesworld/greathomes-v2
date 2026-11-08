import type { SearchIntent } from './searchIntent';
import { searchParser } from './searchParser';
import {
  projectRepository,
  projectConfigurationRepository,
  projectMediaRepository,
} from '../../infrastructure/repositories/projectProvider';
import { locationRepository } from '../../infrastructure/repositories/locationProvider';
import { developerRepository } from '../../infrastructure/repositories/developerProvider';
import { resaleListingService, isKnownTestResaleListing } from '../projects/services/resaleService';
import { rentalListingService, isKnownTestRentalListing } from '../projects/services/rentalService';
import { isKnownTestDeveloperSlug } from '../developers/services/developerService';
import { normalizeMediaPublicUrl } from '@/src/lib/mediaUtils';

export interface UniversalSearchResultItem {
  id: string;
  type: 'PROJECT' | 'DEVELOPER' | 'LOCATION' | 'RESALE' | 'RENTAL';
  title: string;
  subtitle?: string;
  slug: string;
  url: string;
  imageUrl?: string;
  startingPrice?: number;
  priceDisplay?: string;
  locationName?: string;
  developerName?: string;
  propertyType?: string;
  bhk?: string;
  stageOrStatus?: string;
  score: number;
}

export interface SearchResponseDto {
  query: string;
  intent: SearchIntent;
  suggestions: {
    projects: UniversalSearchResultItem[];
    locations: UniversalSearchResultItem[];
    developers: UniversalSearchResultItem[];
    resales?: UniversalSearchResultItem[];
    rentals?: UniversalSearchResultItem[];
  };
  results: UniversalSearchResultItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

function formatPropertyTypeLabel(pt?: string | null): string {
  if (!pt) return 'Apartment';
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
  return map[pt.toUpperCase()] || pt.charAt(0).toUpperCase() + pt.slice(1).toLowerCase().replace(/_/g, ' ');
}

function formatIndianPriceCompact(price: number): string {
  if (price >= 10000000) {
    return `₹${(price / 10000000).toFixed(2).replace(/\.00$/, '')} Cr`;
  }
  if (price >= 100000) {
    return `₹${(price / 100000).toFixed(1).replace(/\.0$/, '')} L`;
  }
  return `₹${price.toLocaleString('en-IN')}`;
}

export class SearchService {
  /**
   * Universal search orchestration with intent parsing, entity resolution, and deterministic ranking
   */
  async search(
    rawQuery: string,
    mode: 'ALL' | 'PROJECTS' | 'BUY' | 'RENT' = 'ALL',
    page = 1,
    limit = 20
  ): Promise<SearchResponseDto> {
    const intent = searchParser.parse(rawQuery, mode);

    const [projects, developers, locations, resales, rentals] = await Promise.all([
      projectRepository.list({ lifecycleStatus: 'PUBLISHED', isPublished: true }),
      developerRepository.list(),
      locationRepository.findAll(),
      intent.mode === 'ALL' || intent.mode === 'BUY'
        ? resaleListingService.listPublicListings({ skipAmenities: true })
        : Promise.resolve([]),
      intent.mode === 'ALL' || intent.mode === 'RENT'
        ? rentalListingService.listPublicListings({ skipAmenities: true })
        : Promise.resolve([]),
    ]);

    const publishedProjects = projects.filter(p => {
      const isPub = p.lifecycleStatus ? p.lifecycleStatus === 'PUBLISHED' : p.isPublished === true;
      return isPub && p.isPublished !== false && !/^neon-proj-\d+$/i.test(p.slug);
    });

    const projectIds = publishedProjects.map(p => p.id);
    const [allConfigs, allMedia] = await Promise.all([
      projectIds.length > 0 && typeof projectConfigurationRepository.findByProjectIds === 'function'
        ? projectConfigurationRepository.findByProjectIds(projectIds)
        : projectConfigurationRepository.findAll(),
      projectIds.length > 0 && typeof projectMediaRepository.findByProjectIds === 'function'
        ? projectMediaRepository.findByProjectIds(projectIds)
        : projectMediaRepository.findAll(),
    ]);

    const configsByProject = new Map<string, typeof allConfigs>();
    for (const c of allConfigs) {
      const arr = configsByProject.get(c.projectId) || [];
      arr.push(c);
      configsByProject.set(c.projectId, arr);
    }

    const mediaByProject = new Map<string, typeof allMedia>();
    for (const m of allMedia) {
      if (
        !m ||
        typeof m.url !== 'string' ||
        !m.url.trim() ||
        (m.mediaType || 'IMAGE').toUpperCase() === 'VIDEO' ||
        (m.category || '').toUpperCase() === 'WALKTHROUGH'
      ) {
        continue;
      }
      const arr = mediaByProject.get(m.projectId) || [];
      arr.push(m);
      mediaByProject.set(m.projectId, arr);
    }

    const devMap = new Map(developers.map(d => [d.id, d]));
    const locMap = new Map(locations.map(l => [l.id, l]));

    const results: UniversalSearchResultItem[] = [];
    const suggestionsProjects: UniversalSearchResultItem[] = [];
    const suggestionsLocations: UniversalSearchResultItem[] = [];
    const suggestionsDevelopers: UniversalSearchResultItem[] = [];
    const suggestionsResales: UniversalSearchResultItem[] = [];
    const suggestionsRentals: UniversalSearchResultItem[] = [];

    const queryLower = intent.normalizedQuery;
    const queryTokens = intent.searchTokens;

    // 1. Projects
    for (const p of publishedProjects) {
      const dev = p.developerId ? devMap.get(p.developerId) : null;
      if (dev && (dev.status !== 'PUBLISHED' || isKnownTestDeveloperSlug(dev.slug))) continue;

      const loc = p.locationId ? locMap.get(p.locationId) : null;
      const configs = configsByProject.get(p.id) || [];
      const media = mediaByProject.get(p.id) || [];
      const featuredImg = media.find((m) => m.isFeatured) || media[0];

      let score = 0;
      const pNameLower = p.name.toLowerCase();

      if (intent.projectQuery && pNameLower.includes(intent.projectQuery.toLowerCase())) {
        score += 100;
        if (pNameLower === intent.projectQuery.toLowerCase()) score += 50;
      } else if (queryTokens.some((t) => pNameLower.includes(t))) {
        score += 30;
      }

      if (intent.locationQuery && loc) {
        if (loc.name.toLowerCase().includes(intent.locationQuery.toLowerCase())) {
          score += 40;
        }
      }

      if (intent.developerQuery && dev) {
        if (dev.name.toLowerCase().includes(intent.developerQuery.toLowerCase())) {
          score += 50;
        }
      }

      if (intent.bhk.length > 0) {
        const hasBhk = configs.some((c) => c.bedroomCount !== null && intent.bhk.includes(c.bedroomCount));
        if (hasBhk) {
          score += 40;
        } else {
          score -= 30;
        }
      }

      if (intent.propertyTypes.length > 0) {
        if (p.propertyType && intent.propertyTypes.includes(p.propertyType as any)) {
          score += 25;
        }
      }

      if (intent.projectStages.length > 0) {
        if (intent.projectStages.includes(p.status as any)) {
          score += 35;
        }
      }

      const validPrices = configs.map((c) => c.price).filter((pr): pr is number => typeof pr === 'number' && pr > 0);
      const startingPrice =
        validPrices.length > 0
          ? Math.min(...validPrices)
          : typeof p.startingPrice === 'number' && p.startingPrice > 0
            ? p.startingPrice
            : undefined;

      if (intent.budgetMax && startingPrice) {
        if (startingPrice <= intent.budgetMax) {
          score += 30;
        } else {
          score -= 40;
        }
      }

      const include =
        !queryLower ||
        score > 0 ||
        pNameLower.includes(queryLower) ||
        (dev?.name || '').toLowerCase().includes(queryLower) ||
        (loc?.name || '').toLowerCase().includes(queryLower);

      if (include && (intent.mode === 'ALL' || intent.mode === 'PROJECTS')) {
        const item: UniversalSearchResultItem = {
          id: p.id,
          type: 'PROJECT',
          title: p.name,
          subtitle: `${formatPropertyTypeLabel(p.propertyType)} • ${loc?.name || 'Kolkata'}`,
          slug: p.slug,
          url: `/projects/${p.slug}`,
          imageUrl: normalizeMediaPublicUrl(featuredImg?.url) || undefined,
          startingPrice,
          priceDisplay: startingPrice ? formatIndianPriceCompact(startingPrice) : undefined,
          locationName: loc?.name,
          developerName: dev?.name,
          propertyType: p.propertyType,
          stageOrStatus: p.status,
          score,
        };
        results.push(item);
        if (suggestionsProjects.length < 5) suggestionsProjects.push(item);
      }
    }

    // 2. Locations (mode-aware navigation target)
    for (const loc of locations) {
      if (loc.status && loc.status !== 'PUBLISHED') continue;
      if (loc.type === 'STATE' || loc.type === 'CITY' || loc.type === 'DISTRICT') continue;
      let score = 0;
      const locNameLower = loc.name.toLowerCase();

      if (intent.locationQuery && locNameLower.includes(intent.locationQuery.toLowerCase())) {
        score += 80;
        if (locNameLower === intent.locationQuery.toLowerCase()) score += 40;
      } else if (queryTokens.some((t) => locNameLower.includes(t))) {
        score += 25;
      }

      if (score > 0 || (queryLower && locNameLower.includes(queryLower))) {
        let locUrl = `/projects?location=${encodeURIComponent(loc.slug)}`;
        if (intent.mode === 'BUY') {
          locUrl = `/buy?location=${encodeURIComponent(loc.slug)}&inventoryType=RESALE`;
        } else if (intent.mode === 'RENT') {
          locUrl = `/rent?location=${encodeURIComponent(loc.slug)}`;
        } else if (intent.mode === 'ALL') {
          locUrl = `/locations/${loc.slug}`;
        }

        const item: UniversalSearchResultItem = {
          id: loc.id,
          type: 'LOCATION',
          title: loc.name,
          subtitle: `${loc.type || 'Locality'} • Kolkata`,
          slug: loc.slug,
          url: locUrl,
          score,
        };
        results.push(item);
        if (suggestionsLocations.length < 4) suggestionsLocations.push(item);
      }
    }

    // 3. Developers (for PROJECTS / ALL mode)
    if (intent.mode === 'ALL' || intent.mode === 'PROJECTS') {
      for (const dev of developers) {
        if (dev.status && dev.status !== 'PUBLISHED') continue;
        if (isKnownTestDeveloperSlug(dev.slug)) continue;
        let score = 0;
        const devNameLower = dev.name.toLowerCase();

        if (intent.developerQuery && devNameLower.includes(intent.developerQuery.toLowerCase())) {
          score += 90;
          if (devNameLower === intent.developerQuery.toLowerCase()) score += 50;
        } else if (queryTokens.some((t) => devNameLower.includes(t))) {
          score += 30;
        }

        if (score > 0 || (queryLower && devNameLower.includes(queryLower))) {
          const item: UniversalSearchResultItem = {
            id: dev.id,
            type: 'DEVELOPER',
            title: dev.name,
            subtitle: `Developer • ${dev.shortDescription || 'Kolkata'}`,
            slug: dev.slug,
            url: `/developers/${dev.slug}`,
            score,
          };
          results.push(item);
          if (suggestionsDevelopers.length < 4) suggestionsDevelopers.push(item);
        }
      }
    }

    // 4. Resale (Verified Resale Inventory for BUY / ALL mode)
    if (intent.mode === 'ALL' || intent.mode === 'BUY') {
      for (const r of resales) {
        if (isKnownTestResaleListing(r)) continue;
        if (!r.isVerified) continue;

        let score = 0;
        let rLocName =
          r.location?.name ||
          r.project?.location?.name ||
          ((r as any).locationId ? locMap.get((r as any).locationId)?.name : '') ||
          '';
        if (!rLocName && r.slug) {
          const matched = locations.find((l) => l.slug && (r.slug!.startsWith(l.slug) || r.slug!.includes(l.slug)));
          if (matched) rLocName = matched.name;
        }
        const rProjName = r.project?.name || '';
        const rDevName = r.project?.developerName || '';
        const propTypeLabel = formatPropertyTypeLabel(r.propertyType);
        const haystack = [
          r.configuration,
          `${r.bedroomCount} bhk`,
          `${r.bedroomCount}bhk`,
          propTypeLabel,
          rProjName,
          rLocName,
          rDevName,
          r.slug,
          r.description,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        if (intent.locationQuery && rLocName.toLowerCase().includes(intent.locationQuery.toLowerCase())) {
          score += 45;
        }
        if (intent.projectQuery && rProjName.toLowerCase().includes(intent.projectQuery.toLowerCase())) {
          score += 55;
        }
        if (intent.bhk.length > 0 && intent.bhk.includes(r.bedroomCount)) score += 35;
        if (intent.budgetMax && r.askingPrice <= intent.budgetMax) score += 25;
        if (queryLower && haystack.includes(queryLower)) score += 40;
        else if (queryTokens.length > 0 && queryTokens.some(t => haystack.includes(t))) score += 25;

        const includeResale = !queryLower || score > 0;
        if (!includeResale) continue;

        const baseConfig = r.configuration?.trim() || `${r.bedroomCount} BHK ${propTypeLabel}`;
        const title = rProjName
          ? `${baseConfig} in ${rProjName}`
          : rLocName
            ? `${baseConfig} in ${rLocName}`
            : baseConfig;

        const item: UniversalSearchResultItem = {
          id: r.id,
          type: 'RESALE',
          title,
          subtitle: `${rLocName || 'Kolkata'} • ${formatIndianPriceCompact(r.askingPrice)}`,
          slug: r.slug || r.id,
          url: `/buy/${r.slug || r.id}`,
          imageUrl: r.media?.[0]?.url || r.project?.featuredImageUrl || undefined,
          startingPrice: r.askingPrice,
          priceDisplay: formatIndianPriceCompact(r.askingPrice),
          locationName: rLocName || undefined,
          propertyType: propTypeLabel,
          bhk: `${r.bedroomCount} BHK`,
          score: score || 10,
        };
        results.push(item);
        if (suggestionsResales.length < 5) suggestionsResales.push(item);
      }
    }

    // 5. Rentals (Verified Rental Inventory for RENT / ALL mode)
    if (intent.mode === 'ALL' || intent.mode === 'RENT') {
      for (const rt of rentals) {
        if (isKnownTestRentalListing(rt)) continue;
        if (!rt.isVerified) continue;

        let score = 0;
        let rtLocName =
          rt.location?.name ||
          rt.project?.location?.name ||
          ((rt as any).locationId ? locMap.get((rt as any).locationId)?.name : '') ||
          '';
        if (!rtLocName && rt.slug) {
          const matched = locations.find((l) => l.slug && (rt.slug!.startsWith(l.slug) || rt.slug!.includes(l.slug)));
          if (matched) rtLocName = matched.name;
        }
        const rtProjName = rt.project?.name || '';
        const rtDevName = rt.project?.developerName || '';
        const propTypeLabel = formatPropertyTypeLabel(rt.propertyType);
        const haystack = [
          rt.configuration,
          `${rt.bedroomCount} bhk`,
          `${rt.bedroomCount}bhk`,
          propTypeLabel,
          rtProjName,
          rtLocName,
          rtDevName,
          rt.slug,
          rt.description,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        if (intent.locationQuery && rtLocName.toLowerCase().includes(intent.locationQuery.toLowerCase())) {
          score += 45;
        }
        if (intent.projectQuery && rtProjName.toLowerCase().includes(intent.projectQuery.toLowerCase())) {
          score += 55;
        }
        if (intent.bhk.length > 0 && intent.bhk.includes(rt.bedroomCount)) score += 35;
        if (intent.budgetMax && rt.monthlyRent <= intent.budgetMax) score += 25;
        if (queryLower && haystack.includes(queryLower)) score += 40;
        else if (queryTokens.length > 0 && queryTokens.some(t => haystack.includes(t))) score += 25;

        const includeRental = !queryLower || score > 0;
        if (!includeRental) continue;

        const baseConfig = rt.configuration?.trim() || `${rt.bedroomCount} BHK ${propTypeLabel}`;
        const title = rtProjName
          ? `${baseConfig} in ${rtProjName}`
          : rtLocName
            ? `${baseConfig} in ${rtLocName}`
            : baseConfig;

        const item: UniversalSearchResultItem = {
          id: rt.id,
          type: 'RENTAL',
          title,
          subtitle: `${rtLocName || 'Kolkata'} • ₹${rt.monthlyRent.toLocaleString('en-IN')} / mo`,
          slug: rt.slug || rt.id,
          url: `/rent/${rt.slug || rt.id}`,
          imageUrl: rt.media?.[0]?.url || rt.project?.featuredImageUrl || undefined,
          startingPrice: rt.monthlyRent,
          priceDisplay: `₹${rt.monthlyRent.toLocaleString('en-IN')} / mo`,
          locationName: rtLocName || undefined,
          propertyType: propTypeLabel,
          bhk: `${rt.bedroomCount} BHK`,
          score: score || 10,
        };
        results.push(item);
        if (suggestionsRentals.length < 5) suggestionsRentals.push(item);
      }
    }

    results.sort((a, b) => b.score - a.score);

    const seen = new Set<string>();
    const uniqueResults = results.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });

    const startIndex = (page - 1) * limit;
    const paginatedResults = uniqueResults.slice(startIndex, startIndex + limit);

    return {
      query: rawQuery,
      intent,
      suggestions: {
        projects: suggestionsProjects,
        locations: suggestionsLocations,
        developers: suggestionsDevelopers,
        resales: suggestionsResales,
        rentals: suggestionsRentals,
      },
      results: paginatedResults,
      pagination: {
        page,
        limit,
        total: uniqueResults.length,
        totalPages: Math.ceil(uniqueResults.length / limit) || 1,
      },
    };
  }
}

export const searchService = new SearchService();
