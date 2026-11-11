import { Metadata } from 'next';
import { Location, LocationType } from '../entities';
import { locationService, LOCATION_ALIASES } from './locationService';
import { locationRepository } from '../../../infrastructure/repositories/locationProvider';
import { projectRepository } from '../../../infrastructure/repositories/projectProvider';
import { projectIntelligenceService } from '../../projects/services/projectIntelligenceService';
import {
  isPublicCanonicalLocation,
  getLocationEditorialTagline,
  getLocationFullDescription,
  getLocationVisualTheme,
} from '../locationRegionMapper';

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
  projects?: Array<{ id: string; lifecycleStatus?: string }>;
  isAlias?: boolean;
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
    title: 'New Town Kolkata – Residential Areas & Property Guide | Great Homes',
    description:
      'Explore residential projects, resale homes, rental properties, Action Areas I, II & III, connectivity and property intelligence in New Town, Kolkata with Great Homes.',
  },
  'rajarhat': {
    title: 'Rajarhat Kolkata – Residential Localities & Property Guide | Great Homes',
    description:
      'Discover residential projects, verified resale homes, rental properties, micro-markets and connectivity intelligence across Rajarhat, Kolkata on Great Homes.',
  },
  'salt-lake': {
    title: 'Salt Lake Kolkata – Sectors, Projects & Property Guide | Great Homes',
    description:
      'Explore residential sectors, Sector V connectivity, verified projects, resale homes and rental opportunities in Salt Lake (Bidhannagar), Kolkata with Great Homes.',
  },
  'ballygunge': {
    title: 'Ballygunge Kolkata – Residential Area & Property Guide | Great Homes',
    description:
      'Discover premium residential projects, verified resale apartments, rental homes, social infrastructure and locality intelligence in Ballygunge, South Kolkata.',
  },
};

export class LocationSeoService {
  /**
   * Evaluates SEO eligibility for a location deterministically.
   * Protects against thin programmatic pages and duplicate indexation.
   */
  evaluateEligibility(params: EvaluateLocationSeoParams): LocationSeoEligibility {
    const { location, path = [], childLocations = [], projects = [], isAlias = false } = params;
    const cleanSlug = (location.slug || '').toLowerCase().trim();
    const canonicalUrl = `https://greathomes.co.in/locations/${cleanSlug}`;

    // 1. Build unique, location-specific SEO title and description
    const curated = CURATED_SEO_METADATA[cleanSlug];
    const cityAncestor = path.find(p => p.type === 'CITY' && p.id !== location.id);
    const areaAncestor = path.find(p => p.type === 'AREA' && p.id !== location.id);
    const cityName = cityAncestor ? cityAncestor.name : 'Kolkata';
    const nameIncludesCity = location.name.toLowerCase().includes(cityName.toLowerCase());

    let title: string;
    if (curated) {
      title = curated.title;
    } else if (location.type === 'NEIGHBOURHOOD' && areaAncestor) {
      const areaIncludesCity = areaAncestor.name.toLowerCase().includes(cityName.toLowerCase());
      const cityPart = nameIncludesCity || areaIncludesCity ? '' : ` ${cityName}`;
      title = `${location.name}, ${areaAncestor.name}${cityPart} – Locality & Property Guide | Great Homes`;
    } else if (location.type === 'AREA') {
      const citySuffix = nameIncludesCity ? '' : ` ${cityName}`;
      title = `${location.name}${citySuffix} – Residential Area & Property Guide | Great Homes`;
    } else if (location.type === 'CITY') {
      title = `${location.name} – Residential Areas, Neighbourhoods & Property Guide | Great Homes`;
    } else {
      const parentNames = path.filter(p => p.id !== location.id).map(p => p.name);
      const contextSubtitle = parentNames.length > 0 ? `, ${parentNames.join(', ')}` : '';
      title = `${location.name}${contextSubtitle} – Residential Projects & Location Guide | Great Homes`;
    }

    let description: string;
    if (curated) {
      description = curated.description;
    } else {
      const rawTagline = (getLocationEditorialTagline(location) || '').trim();
      const tagline = rawTagline
        ? /[.!?]$/.test(rawTagline)
          ? rawTagline
          : `${rawTagline}.`
        : '';
      const contextName =
        location.type === 'NEIGHBOURHOOD' && areaAncestor
          ? `${location.name} (${areaAncestor.name}, ${cityName})`
          : nameIncludesCity
            ? location.name
            : `${location.name}, ${cityName}`;
      description = `${tagline ? `${tagline} ` : ''}Explore residential projects, resale homes, rental listings and connectivity in ${contextName} with Great Homes.`.slice(0, 300);
    }

    const visualTheme = getLocationVisualTheme(cleanSlug, Boolean(location.featured));
    const imageUrl = visualTheme.imageUrl;

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

    // 7. Content signals
    const publishedProjectsCount = projects.filter(
      p => (p.lifecycleStatus || 'PUBLISHED') === 'PUBLISHED'
    ).length;
    const publishedChildrenCount = childLocations.filter(
      c => isPublicCanonicalLocation(c)
    ).length;
    const fullDesc = getLocationFullDescription(location);
    const hasMeaningfulContent = Boolean(fullDesc && fullDesc.trim().length >= 20);

    // Rule A: Projects present
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

    // Rule B: Child locations present (e.g. City or State or Region with sub-areas)
    if (publishedChildrenCount > 0) {
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

    // Rule C: Meaningful editorial description provided
    if (hasMeaningfulContent) {
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

    // Rule D: Thin page (Published but 0 projects, 0 children, 0 description) -> noindex, follow
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
    const socialImages = eligibility.imageUrl
      ? [
          {
            url: eligibility.imageUrl,
            width: 1200,
            height: 630,
            alt: eligibility.title,
          },
        ]
      : undefined;

    return {
      title: eligibility.title,
      description: eligibility.description,
      alternates: {
        canonical: eligibility.canonicalUrl,
      },
      robots: {
        index: eligibility.index,
        follow: eligibility.follow,
      },
      openGraph: {
        title: eligibility.title,
        description: eligibility.description,
        url: eligibility.canonicalUrl,
        siteName: 'Great Homes',
        type: 'website',
        ...(socialImages ? { images: socialImages } : {}),
      },
      twitter: {
        card: socialImages ? 'summary_large_image' : 'summary',
        title: eligibility.title,
        description: eligibility.description,
        ...(eligibility.imageUrl ? { images: [eligibility.imageUrl] } : {}),
      },
    };
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
        item: 'https://greathomes.co.in',
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Locations',
        item: 'https://greathomes.co.in/locations',
      },
    ];

    let pos = 3;
    for (const ancestor of path) {
      if (ancestor.id !== location.id) {
        breadcrumbItems.push({
          '@type': 'ListItem',
          position: pos++,
          name: ancestor.name,
          item: `https://greathomes.co.in/locations/${ancestor.slug}`,
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
        const list = projectsByLocation.get(locId) || [];
        list.push(p);
        projectsByLocation.set(locId, list);
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
        const list = projectsByLocation.get(locId) || [];
        list.push(p);
        projectsByLocation.set(locId, list);
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

      const seoEligibility = this.evaluateEligibility({
        location: loc,
        path,
        childLocations,
        projects,
        isAlias: false,
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
