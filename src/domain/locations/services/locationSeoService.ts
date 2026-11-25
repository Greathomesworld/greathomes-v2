import { Metadata } from 'next';
import { Location, LocationType } from '../entities';
import { locationService, LOCATION_ALIASES } from './locationService';
import { locationRepository } from '../../../infrastructure/repositories/locationProvider';
import { projectRepository } from '../../../infrastructure/repositories/projectProvider';
import { projectIntelligenceService } from '../../projects/services/projectIntelligenceService';
import {
  isPublicCanonicalLocation,
  getLocationEditorialTagline,
} from '../locationRegionMapper';
import {
  buildPageMetadata,
  DEFAULT_OG_IMAGE,
  formatBrandTitle,
  formatLocationWithCity,
  normalizePublicSeoImageUrl,
  sanitizeMetaDescription,
  SITE_ORIGIN,
} from '../../seo/metadataBuilder';
import { isApprovedFirstPartyMediaUrl } from '../../../lib/mediaUtils';

export type LocationSeoIneligibilityReason =
  | 'SUFFICIENT_CONTENT'
  | 'SUFFICIENT_PROJECT_DEPTH'
  | 'INSUFFICIENT_CONTENT'
  | 'NO_PUBLISHED_PROJECTS'
  | 'DRAFT'
  | 'ARCHIVED'
  | 'DUPLICATE'
  | 'INVALID_HIERARCHY'
  | 'ALIAS';

export interface LocationSeoEligibility {
  eligible: boolean;
  reason: LocationSeoIneligibilityReason;
  index: boolean;
  follow: boolean;
  canonicalUrl: string;
  title: string;
  description: string;
  imageUrl?: string;
}

export interface EvaluateLocationSeoParams {
  location: Location;
  path?: Location[];
  childLocations?: Location[];
  projects?: Array<{ id: string; lifecycleStatus?: string; heroImageUrl?: string | null }>;
  isAlias?: boolean;
  preferredImageUrl?: string | null;
}

const LOCATION_LEVEL_PUBLIC_NAMES: Record<LocationType, string> = {
  STATE: 'State',
  DISTRICT: 'District',
  CITY: 'City',
  DISCOVERY_REGION: 'Region',
  AREA: 'Area',
  NEIGHBOURHOOD: 'Neighbourhood',
};

const CURATED_SEO_METADATA: Record<string, { title: string; description: string }> = {
  'new-town': {
    title: 'New Town Kolkata – Projects & Property Guide | Great Homes',
    description:
      'Explore residential projects, resale homes, rentals, Action Areas I, II & III, connectivity and locality intelligence in New Town, Kolkata.',
  },
  'rajarhat': {
    title: 'Rajarhat Kolkata – Projects & Property Guide | Great Homes',
    description:
      'Discover residential projects, verified resale homes, rental properties, micro-markets and connectivity intelligence across Rajarhat, Kolkata on Great Homes.',
  },
  'salt-lake': {
    title: 'Salt Lake Kolkata – Sectors & Property Guide | Great Homes',
    description:
      'Explore residential sectors, Sector V connectivity, verified projects, resale homes and rentals in Salt Lake (Bidhannagar), Kolkata on Great Homes.',
  },
  'ballygunge': {
    title: 'Ballygunge Kolkata – Projects & Property Guide | Great Homes',
    description:
      'Discover premium residential projects, verified resale apartments, rental homes, social infrastructure and locality intelligence in Ballygunge, South Kolkata.',
  },
};

/**
 * 8 Verified Tier 2 Curated Editorial Locations with comprehensive locality guides
 * index: true, follow: true despite 0 active inventory.
 */
export const TIER_2_CURATED_SLUGS = new Set([
  'alipore',
  'ballygunge',
  'behala',
  'golf-green',
  'jodhpur-park',
  'lake-gardens',
  'howrah',
  'hooghly',
]);

export class LocationSeoService {
  /**
   * Evaluates SEO eligibility for a location deterministically.
   * Protects against thin programmatic pages and duplicate indexation.
   */
  evaluateEligibility(params: EvaluateLocationSeoParams): LocationSeoEligibility {
    const { location, path = [], childLocations = [], projects = [], isAlias = false } = params;
    const cleanSlug = (location.slug || '').toLowerCase().trim();
    const canonicalUrl = `https://www.greathomes.co.in/locations/${cleanSlug}`;

    // 1. Build unique, concise, geographically accurate SEO title and description (F-12)
    const curated = CURATED_SEO_METADATA[cleanSlug];
    const cityAncestor = path.find(p => p.type === 'CITY' && p.id !== location.id);
    const districtAncestor = path.find(p => p.type === 'DISTRICT' && p.id !== location.id);
    const areaAncestor = path.find(p => p.type === 'AREA' && p.id !== location.id);

    const isTopLevelRegion =
      location.type === 'STATE' || location.type === 'CITY' || location.type === 'DISTRICT';
    const regionContextName = cityAncestor
      ? cityAncestor.name
      : districtAncestor
        ? districtAncestor.name
        : isTopLevelRegion
          ? ''
          : 'Kolkata';
    const cityNameForDesc = regionContextName || location.name || 'Kolkata';

    const locLower = location.name.trim().toLowerCase();
    const regionLower = regionContextName.trim().toLowerCase();
    const nameIncludesRegion = Boolean(regionLower) && locLower.includes(regionLower);

    const pickCompactLocationTitle = (candidates: string[]): string => {
      const fitting = candidates.find((c) => c.length <= 62);
      if (fitting) return fitting;
      return formatBrandTitle(candidates[candidates.length - 1], { maxLength: 62 });
    };

    let title: string;
    if (curated) {
      title = curated.title;
    } else if (location.type === 'NEIGHBOURHOOD' && areaAncestor) {
      const areaLower = areaAncestor.name.trim().toLowerCase();
      // Prevent duplicate locality names like "New Alipore Block A, New Alipore" or "Tollygunge Metro, Tollygunge"
      const childContainsArea = Boolean(areaLower) && locLower.includes(areaLower);
      const areaIncludesRegion = Boolean(regionLower) && areaLower.includes(regionLower);
      const regionSuffix =
        !regionContextName || nameIncludesRegion || (!childContainsArea && areaIncludesRegion)
          ? ''
          : `, ${regionContextName}`;

      const subjectWithParent = childContainsArea
        ? `${location.name}${regionSuffix}`
        : `${location.name}, ${areaAncestor.name}`;
      const subjectWithParentAndRegion = childContainsArea
        ? `${location.name}${regionSuffix}`
        : `${location.name}, ${areaAncestor.name}${regionSuffix}`;

      title = pickCompactLocationTitle([
        `${subjectWithParentAndRegion} – Property Guide | Great Homes`,
        `${subjectWithParent} – Property Guide | Great Homes`,
        `${subjectWithParent} – Flats & Projects | Great Homes`,
        `${subjectWithParent} | Great Homes`,
      ]);
    } else if (location.type === 'AREA') {
      const regionSuffix = !regionContextName || nameIncludesRegion ? '' : `, ${regionContextName}`;
      title = pickCompactLocationTitle([
        `${location.name}${regionSuffix} – Projects & Property Guide | Great Homes`,
        `${location.name}${regionSuffix} – Property Guide | Great Homes`,
        `${location.name}${regionSuffix} – Flats & Projects | Great Homes`,
        `${location.name}${regionSuffix} | Great Homes`,
      ]);
    } else if (location.type === 'CITY') {
      title = pickCompactLocationTitle([
        `${location.name} – Residential Areas & Property Guide | Great Homes`,
        `${location.name} – Residential Projects & Areas | Great Homes`,
        `${location.name} – Property Guide | Great Homes`,
        `${location.name} | Great Homes`,
      ]);
    } else if (location.type === 'STATE') {
      title = pickCompactLocationTitle([
        `${location.name} – Residential Projects & Areas | Great Homes`,
        `${location.name} – Property Guide | Great Homes`,
        `${location.name} | Great Homes`,
      ]);
    } else if (location.type === 'DISTRICT') {
      title = pickCompactLocationTitle([
        `${location.name} – Residential Projects & Guide | Great Homes`,
        `${location.name} – Property Guide | Great Homes`,
        `${location.name} | Great Homes`,
      ]);
    } else {
      const regionSuffix = !regionContextName || nameIncludesRegion ? '' : `, ${regionContextName}`;
      title = pickCompactLocationTitle([
        `${location.name}${regionSuffix} – Residential Areas & Guide | Great Homes`,
        `${location.name}${regionSuffix} – Property Guide | Great Homes`,
        `${location.name}${regionSuffix} | Great Homes`,
      ]);
    }

    let description: string;
    if (curated) {
      description = sanitizeMetaDescription(curated.description, curated.description, { maxLength: 158 });
    } else {
      const rawTagline = (getLocationEditorialTagline(location) || '').trim();
      const tagline = rawTagline
        ? /[.!?]$/.test(rawTagline)
          ? rawTagline
          : `${rawTagline}.`
        : '';
      const areaAlreadyInName = Boolean(
        areaAncestor && locLower.includes(areaAncestor.name.trim().toLowerCase())
      );
      const contextName =
        location.type === 'NEIGHBOURHOOD' && areaAncestor && !areaAlreadyInName
          ? `${location.name} (${formatLocationWithCity(areaAncestor.name, cityNameForDesc)})`
          : formatLocationWithCity(location.name, cityNameForDesc);
      const compactContextName = formatLocationWithCity(location.name, cityNameForDesc);
      const candidates = [
        tagline
          ? `${tagline} Explore residential projects, resale homes & rentals in ${contextName} on Great Homes.`
          : '',
        tagline
          ? `${tagline} Explore projects, resale & rentals in ${compactContextName} on Great Homes.`
          : '',
        `Explore residential projects, resale homes, rentals and connectivity in ${contextName} on Great Homes.`,
        `Explore residential projects, resale homes, rentals and connectivity in ${compactContextName} on Great Homes.`,
      ].filter(Boolean);

      const fittingCandidate = candidates.find((c) => c.length <= 158);
      const chosenRaw = fittingCandidate || candidates[candidates.length - 1];
      description = sanitizeMetaDescription(chosenRaw, chosenRaw, { maxLength: 158 });
    }

    // Prefer verified first-party/R2 project hero image for location OG/Twitter cards (F-13),
    // falling back to branded Great Homes default OG image instead of third-party Unsplash stock URLs.
    const candidatePreferred =
      params.preferredImageUrl ||
      projects.find((p) => Boolean(p.heroImageUrl))?.heroImageUrl ||
      null;
    const normalizedPreferred = normalizePublicSeoImageUrl(candidatePreferred);
    const imageUrl =
      normalizedPreferred && isApprovedFirstPartyMediaUrl(normalizedPreferred)
        ? normalizedPreferred
        : DEFAULT_OG_IMAGE;

    // 2. Non-canonical test/fixture guard
    if (!isPublicCanonicalLocation(location)) {
      return {
        eligible: false,
        reason: 'DRAFT',
        index: false,
        follow: false,
        canonicalUrl,
        title,
        description,
        imageUrl,
      };
    }

    // 3. Alias Route
    if (isAlias) {
      return {
        eligible: false,
        reason: 'ALIAS',
        index: false,
        follow: true,
        canonicalUrl,
        title,
        description,
        imageUrl,
      };
    }

    // 4. Draft status
    if (location.status === 'DRAFT') {
      return {
        eligible: false,
        reason: 'DRAFT',
        index: false,
        follow: false,
        canonicalUrl,
        title,
        description,
        imageUrl,
      };
    }

    // 5. Archived status
    if (location.status === 'ARCHIVED') {
      return {
        eligible: false,
        reason: 'ARCHIVED',
        index: false,
        follow: false,
        canonicalUrl,
        title,
        description,
        imageUrl,
      };
    }

    // 6. Hierarchy check
    if (location.parentId && location.parentId === location.id) {
      return {
        eligible: false,
        reason: 'INVALID_HIERARCHY',
        index: false,
        follow: false,
        canonicalUrl,
        title,
        description,
        imageUrl,
      };
    }

    // 7. Content & Inventory signals (Strict 3-Tier Classification)
    const publishedProjectsCount = projects.filter(
      p => (p.lifecycleStatus || 'PUBLISHED') === 'PUBLISHED'
    ).length;

    // Tier 1: Locations with 1 or more published projects (direct or rolled up)
    if (publishedProjectsCount > 0) {
      return {
        eligible: true,
        reason: 'SUFFICIENT_PROJECT_DEPTH',
        index: true,
        follow: true,
        canonicalUrl,
        title,
        description,
        imageUrl,
      };
    }

    // Tier 2: 8 Curated editorial guide locations with verified editorial depth despite 0 active inventory
    if (TIER_2_CURATED_SLUGS.has(cleanSlug)) {
      return {
        eligible: true,
        reason: 'SUFFICIENT_CONTENT',
        index: true,
        follow: true,
        canonicalUrl,
        title,
        description,
        imageUrl,
      };
    }

    // Tier 3: All other zero-inventory locations -> noindex, follow (thin programmatic placeholders)
    return {
      eligible: false,
      reason: 'INSUFFICIENT_CONTENT',
      index: false,
      follow: true,
      canonicalUrl,
      title,
      description,
      imageUrl,
    };
  }

  /**
   * Constructs standard Next.js App Router Metadata for a canonical location page.
   */
  buildMetadata(eligibility: LocationSeoEligibility): Metadata {
    const cleanPath = eligibility.canonicalUrl.replace(SITE_ORIGIN, '') || '/locations';
    return buildPageMetadata({
      title: eligibility.title,
      description: eligibility.description,
      canonicalPath: cleanPath,
      canonicalUrl: eligibility.canonicalUrl,
      index: eligibility.index,
      follow: eligibility.follow,
      ogType: 'website',
      ogImage: eligibility.imageUrl,
      ogImageAlt: eligibility.title,
    });
  }

  /**
   * Constructs Schema.org Place and BreadcrumbList structured data for a location page.
   */
  buildJsonLd(params: {
    location: Location;
    path: Location[];
    canonicalUrl: string;
    description?: string;
  }) {
    const { location, path, canonicalUrl, description } = params;

    const breadcrumbItems = [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: 'https://www.greathomes.co.in',
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Locations',
        item: 'https://www.greathomes.co.in/locations',
      },
    ];

    let pos = 3;
    for (const ancestor of path) {
      if (ancestor.id !== location.id) {
        breadcrumbItems.push({
          '@type': 'ListItem',
          position: pos++,
          name: ancestor.name,
          item: `https://www.greathomes.co.in/locations/${ancestor.slug}`,
        });
      }
    }

    breadcrumbItems.push({
      '@type': 'ListItem',
      position: pos,
      name: location.name,
      item: canonicalUrl,
    });

    const levelPublicName = LOCATION_LEVEL_PUBLIC_NAMES[location.type] || location.type;

    return {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'Place',
          name: location.name,
          description: description || undefined,
          url: canonicalUrl,
          additionalType: `https://schema.org/${location.type === 'CITY' ? 'City' : 'AdministrativeArea'}`,
          disambiguatingDescription: `${levelPublicName} in West Bengal, India`,
          ...(location.latitude !== null && location.latitude !== undefined && location.longitude !== null && location.longitude !== undefined
            ? {
                geo: {
                  '@type': 'GeoCoordinates',
                  latitude: location.latitude,
                  longitude: location.longitude,
                },
              }
            : {}),
          address: {
            '@type': 'PostalAddress',
            addressLocality: location.name,
            addressCountry: 'IN',
          },
        },
        {
          '@type': 'BreadcrumbList',
          itemListElement: breadcrumbItems,
        },
      ],
    };
  }

  /**
   * Retrieves all published, SEO-eligible locations suitable for sitemap inclusion.
   * Efficiently computes hierarchy paths, children, and location projects in memory
   * to avoid N+1 database queries.
   */
  async getIndexableLocations(): Promise<Location[]> {
    const all = await locationRepository.findAll();
    const published = all.filter(l => isPublicCanonicalLocation(l));
    const allMap = new Map<string, Location>(all.map(l => [l.id, l]));

    // Efficiently batch fetch all published projects directly via repository to prevent N+1 connection pool exhaustion
    let allPublishedProjects: Array<{
      id: string;
      locationId?: string | null;
      location?: { id: string } | null;
      lifecycleStatus?: string;
    }> = [];
    try {
      allPublishedProjects = await projectRepository.list({
        lifecycleStatus: 'PUBLISHED',
        isPublished: true,
      });
    } catch (err) {
      try {
        allPublishedProjects = await projectIntelligenceService.listAllProjects({}, false);
      } catch (fallbackErr) {
        console.error('Error fetching projects for location SEO eligibility:', err);
      }
    }

    const projectsByLocation = new Map<string, Array<{ id: string; lifecycleStatus?: string }>>();
    for (const p of allPublishedProjects) {
      const locId = p.location?.id || p.locationId;
      if (locId) {
        let cur = allMap.get(locId);
        const visited = new Set<string>();
        while (cur && !visited.has(cur.id)) {
          visited.add(cur.id);
          const list = projectsByLocation.get(cur.id) || [];
          if (!list.some(existing => existing.id === p.id)) {
            list.push(p);
          }
          projectsByLocation.set(cur.id, list);
          cur = cur.parentId ? allMap.get(cur.parentId) : undefined;
        }
      }
    }

    const eligible: Location[] = [];

    for (const loc of published) {
      // In-memory path construction from location Map
      const path: Location[] = [];
      let curr: Location | undefined = loc;
      const visited = new Set<string>();
      while (curr && !visited.has(curr.id)) {
        visited.add(curr.id);
        path.unshift(curr);
        curr = curr.parentId ? allMap.get(curr.parentId) : undefined;
      }

      // In-memory child locations lookup
      const childLocations = all.filter(c => c.parentId === loc.id && c.status === 'PUBLISHED');

      // In-memory projects lookup
      const projects = projectsByLocation.get(loc.id) || [];

      const evalRes = this.evaluateEligibility({
        location: loc,
        path,
        childLocations,
        projects,
        isAlias: false,
      });

      if (evalRes.index) {
        eligible.push(loc);
      }
    }

    return eligible;
  }

  /**
   * Evaluates all locations in batch for SEO administration, returning each location
   * alongside its authoritative LocationSeoEligibility, publishedProjectCount, and publishedChildCount.
   */
  async evaluateAllLocationsForAdmin(): Promise<
    Array<{
      location: Location;
      seoEligibility: LocationSeoEligibility;
      publishedProjectCount: number;
      publishedChildCount: number;
    }>
  > {
    const all = await locationRepository.findAll();
    const allMap = new Map<string, Location>(all.map(l => [l.id, l]));

    // Efficiently batch fetch all published projects directly via repository to prevent N+1 connection pool exhaustion
    let allPublishedProjects: Array<{
      id: string;
      locationId?: string | null;
      location?: { id: string } | null;
      lifecycleStatus?: string;
    }> = [];
    try {
      allPublishedProjects = await projectRepository.list({
        lifecycleStatus: 'PUBLISHED',
        isPublished: true,
      });
    } catch (err) {
      try {
        allPublishedProjects = await projectIntelligenceService.listAllProjects({}, false);
      } catch (fallbackErr) {
        console.error('Error fetching projects for admin location SEO evaluation:', err);
      }
    }

    const projectsByLocation = new Map<string, Array<{ id: string; lifecycleStatus?: string }>>();
    for (const p of allPublishedProjects) {
      const locId = p.location?.id || p.locationId;
      if (locId) {
        let cur = allMap.get(locId);
        const visited = new Set<string>();
        while (cur && !visited.has(cur.id)) {
          visited.add(cur.id);
          const list = projectsByLocation.get(cur.id) || [];
          if (!list.some(existing => existing.id === p.id)) {
            list.push(p);
          }
          projectsByLocation.set(cur.id, list);
          cur = cur.parentId ? allMap.get(cur.parentId) : undefined;
        }
      }
    }

    return all.map(loc => {
      const path: Location[] = [];
      let curr: Location | undefined = loc;
      const visited = new Set<string>();
      while (curr && !visited.has(curr.id)) {
        visited.add(curr.id);
        path.unshift(curr);
        curr = curr.parentId ? allMap.get(curr.parentId) : undefined;
      }

      const childLocations = all.filter(c => c.parentId === loc.id && c.status === 'PUBLISHED');
      const projects = projectsByLocation.get(loc.id) || [];

      const cleanLocSlug = (loc.slug || '').toLowerCase().trim();
      const aliasTarget = LOCATION_ALIASES[cleanLocSlug];
      const isAlias = Boolean(aliasTarget && aliasTarget !== cleanLocSlug);

      const seoEligibility = this.evaluateEligibility({
        location: loc,
        path,
        childLocations,
        projects,
        isAlias,
      });

      return {
        location: loc,
        seoEligibility,
        publishedProjectCount: projects.length,
        publishedChildCount: childLocations.length,
      };
    });
  }
}

export const locationSeoService = new LocationSeoService();
