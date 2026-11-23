import { projectIntelligenceService } from './projectIntelligenceService';
import { locationRepository } from '@/src/infrastructure/repositories/locationProvider';
import { PublicProjectDto } from '../dto/projectDto';
import { formatIndianPrice } from '@/src/components/discovery/formatters';
import { LOCATION_ALIASES } from '@/src/domain/locations/services/locationService';
import { isPublicCanonicalLocation } from '@/src/domain/locations/locationRegionMapper';
import {
  buildPageMetadata,
  formatLocationWithCity,
  sanitizeMetaDescription,
  SITE_ORIGIN,
} from '@/src/domain/seo/metadataBuilder';

export interface BhkLandingData {
  bedroomCount: number;
  localitySlug: string;
  localityName: string;
  isCityLevel: boolean;
  projects: PublicProjectDto[];
  totalProjects: number;
  totalConfigurations: number;
  verifiedReraCount: number;
  isIndexable: boolean;
  minPrice: number | null;
  maxPrice: number | null;
  hasPriceOnRequestOnly: boolean;
}

export interface EligibleBhkLandingEntry {
  bedroomCount: number;
  localitySlug: string;
  localityName: string;
  slug: string;
  href: string;
  label: string;
  totalProjects: number;
  latestUpdatedAt: Date | null;
}

const BHK_MIN_PROJECTS_FOR_INDEX = 3;
const SUPPORTED_BHK_COUNTS = [1, 2, 3, 4, 5] as const;

export class BhkLandingService {
  /**
   * Resolves BHK landing page inventory deterministically.
   * Enforces exact integer BHK matching and strict locality hierarchy.
   */
  async resolveBhkLandingData(
    bedroomCount: number,
    localitySlug: string
  ): Promise<BhkLandingData | null> {
    if (bedroomCount < 1 || bedroomCount > 5) {
      return null;
    }

    const cleanLocSlug = localitySlug.toLowerCase().trim();
    const isCityLevel = cleanLocSlug === 'kolkata';

    const allLocations = await locationRepository.findAll();
    const locMap = new Map(allLocations.map((l) => [l.id, l]));

    let targetLocName = 'Kolkata';
    if (!isCityLevel) {
      const found = allLocations.find((l) => l.slug.toLowerCase() === cleanLocSlug);
      if (!found || found.status !== 'PUBLISHED') {
        return null;
      }
      targetLocName = found.name;
    }

    // Load all published projects
    const allPublished = await projectIntelligenceService.listAllProjects({}, false);
    const publishedProjects = (allPublished || []).filter(
      (p) => p.lifecycleStatus === 'PUBLISHED' && Boolean(p.slug)
    );

    function projectBelongsToLocality(p: PublicProjectDto): boolean {
      const locId = p.location?.id;
      if (!locId) return false;

      let cur = locMap.get(locId);
      const visited = new Set<string>();
      const ancestors: string[] = [];
      while (cur && !visited.has(cur.id)) {
        visited.add(cur.id);
        ancestors.push(cur.slug.toLowerCase());
        cur = cur.parentId ? locMap.get(cur.parentId) : undefined;
      }

      if (isCityLevel) {
        return ancestors.includes('kolkata');
      }

      return ancestors.includes(cleanLocSlug);
    }

    const matchingProjects: PublicProjectDto[] = [];
    let totalMatchingConfigs = 0;
    let verifiedReraCount = 0;
    const publicPrices: number[] = [];
    let hasAnyPricedProject = false;

    for (const p of publishedProjects) {
      if (!projectBelongsToLocality(p)) {
        continue;
      }

      // Exact integer BHK matching on configurations (strictly exclude fractional typologies like 3.5 or 4.5)
      const exactConfigs = (p.configurations || []).filter((c) => {
        if (typeof c.bedroomCount !== 'number') return false;
        return Math.floor(c.bedroomCount) === bedroomCount && c.bedroomCount === bedroomCount;
      });

      if (exactConfigs.length > 0) {
        matchingProjects.push(p);
        totalMatchingConfigs += exactConfigs.length;

        if (p.hasVerifiedReraBadge || p.rera?.hasVerifiedReraBadge || Boolean(p.rera?.registrationNumber)) {
          verifiedReraCount += 1;
        }

        if (!p.pricing?.priceOnRequest && p.pricing?.startingPrice && p.pricing.startingPrice > 0) {
          publicPrices.push(p.pricing.startingPrice);
          hasAnyPricedProject = true;
        }
        if (!p.pricing?.priceOnRequest && p.pricing?.maximumPrice && p.pricing.maximumPrice > 0) {
          publicPrices.push(p.pricing.maximumPrice);
        }
      }
    }

    // Sort: featured projects first, then alphabetically
    matchingProjects.sort((a, b) => {
      if (a.featured !== b.featured) {
        return a.featured ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });

    const isIndexable = matchingProjects.length >= BHK_MIN_PROJECTS_FOR_INDEX;
    const minPrice = publicPrices.length > 0 ? Math.min(...publicPrices) : null;
    const maxPrice = publicPrices.length > 0 ? Math.max(...publicPrices) : null;
    const hasPriceOnRequestOnly = !hasAnyPricedProject;

    return {
      bedroomCount,
      localitySlug: cleanLocSlug,
      localityName: targetLocName,
      isCityLevel,
      projects: matchingProjects,
      totalProjects: matchingProjects.length,
      totalConfigurations: totalMatchingConfigs,
      verifiedReraCount,
      isIndexable,
      minPrice,
      maxPrice,
      hasPriceOnRequestOnly,
    };
  }

  /**
   * Dynamically computes ALL eligible BHK landing pages (threshold >= 3 published projects)
   * from live published project & canonical location data. Used by sitemap.ts and internal linking.
   */
  async getEligibleBhkLandingPages(
    preloadedProjects?: PublicProjectDto[]
  ): Promise<EligibleBhkLandingEntry[]> {
    const [allLocations, rawProjects] = await Promise.all([
      locationRepository.findAll(),
      preloadedProjects
        ? Promise.resolve(preloadedProjects)
        : projectIntelligenceService.listAllProjects({}, false),
    ]);

    const publishedProjects = (rawProjects || []).filter(
      (p) => p.lifecycleStatus === 'PUBLISHED' && Boolean(p.slug)
    );

    const locMap = new Map(allLocations.map((l) => [l.id, l]));
    const canonicalBySlug = new Map<string, { slug: string; name: string; type: string }>();

    for (const loc of allLocations) {
      const slug = (loc.slug || '').toLowerCase().trim();
      if (!slug || loc.status !== 'PUBLISHED') continue;
      if (!isPublicCanonicalLocation(loc)) continue;
      if (LOCATION_ALIASES[slug] !== undefined) continue;
      if (loc.type === 'STATE' || loc.type === 'DISTRICT') continue;
      canonicalBySlug.set(slug, { slug, name: loc.name, type: loc.type });
    }

    // Ensure Kolkata city hub is always evaluated
    if (!canonicalBySlug.has('kolkata')) {
      canonicalBySlug.set('kolkata', { slug: 'kolkata', name: 'Kolkata', type: 'CITY' });
    }

    // Map (localitySlug -> bhkCount -> { projectIds, latestUpdatedMs })
    const bucketMap = new Map<
      string,
      {
        bedroomCount: number;
        localitySlug: string;
        localityName: string;
        projectIds: Set<string>;
        latestUpdatedMs: number | null;
      }
    >();

    for (const p of publishedProjects) {
      const locId = p.location?.id;
      if (!locId) continue;

      // Exact integer BHK counts available in this project
      const projectBhks = new Set<number>();
      for (const c of p.configurations || []) {
        if (
          typeof c.bedroomCount === 'number' &&
          Number.isInteger(c.bedroomCount) &&
          (SUPPORTED_BHK_COUNTS as readonly number[]).includes(c.bedroomCount)
        ) {
          projectBhks.add(c.bedroomCount);
        }
      }
      if (projectBhks.size === 0) continue;

      // Walk location ancestor chain
      let cur = locMap.get(locId);
      const visited = new Set<string>();
      const ancestorSlugs: string[] = [];
      while (cur && !visited.has(cur.id)) {
        visited.add(cur.id);
        ancestorSlugs.push(cur.slug.toLowerCase().trim());
        cur = cur.parentId ? locMap.get(cur.parentId) : undefined;
      }

      const projUpdatedMs = p.updatedAt ? new Date(p.updatedAt).getTime() : NaN;
      const validUpdatedMs = Number.isFinite(projUpdatedMs) ? projUpdatedMs : null;

      for (const ancSlug of ancestorSlugs) {
        const canonicalLoc = canonicalBySlug.get(ancSlug);
        if (!canonicalLoc) continue;

        for (const bhk of projectBhks) {
          const key = `${bhk}:${ancSlug}`;
          let bucket = bucketMap.get(key);
          if (!bucket) {
            bucket = {
              bedroomCount: bhk,
              localitySlug: ancSlug,
              localityName: canonicalLoc.name,
              projectIds: new Set<string>(),
              latestUpdatedMs: validUpdatedMs,
            };
            bucketMap.set(key, bucket);
          }
          bucket.projectIds.add(p.id);
          if (
            validUpdatedMs !== null &&
            (bucket.latestUpdatedMs === null || validUpdatedMs > bucket.latestUpdatedMs)
          ) {
            bucket.latestUpdatedMs = validUpdatedMs;
          }
        }
      }
    }

    const entries: EligibleBhkLandingEntry[] = [];
    for (const bucket of bucketMap.values()) {
      if (bucket.projectIds.size < BHK_MIN_PROJECTS_FOR_INDEX) continue;
      const slug = `${bucket.bedroomCount}-bhk-flats-in-${bucket.localitySlug}`;
      entries.push({
        bedroomCount: bucket.bedroomCount,
        localitySlug: bucket.localitySlug,
        localityName: bucket.localityName,
        slug,
        href: `/buy/${slug}`,
        label: `${bucket.bedroomCount} BHK Flats in ${bucket.localityName}`,
        totalProjects: bucket.projectIds.size,
        latestUpdatedAt: bucket.latestUpdatedMs ? new Date(bucket.latestUpdatedMs) : null,
      });
    }

    // Deterministic order: Kolkata city first, then by project depth descending, then BHK ascending
    entries.sort((a, b) => {
      if ((a.localitySlug === 'kolkata') !== (b.localitySlug === 'kolkata')) {
        return a.localitySlug === 'kolkata' ? -1 : 1;
      }
      if (b.totalProjects !== a.totalProjects) {
        return b.totalProjects - a.totalProjects;
      }
      return a.bedroomCount - b.bedroomCount || a.localitySlug.localeCompare(b.localitySlug);
    });

    return entries;
  }

  /**
   * Returns eligible BHK landing links for a specific locality (for Location detail pages).
   */
  async getEligibleBhkLinksForLocality(localitySlug: string): Promise<EligibleBhkLandingEntry[]> {
    const clean = localitySlug.toLowerCase().trim();
    const all = await this.getEligibleBhkLandingPages();
    return all
      .filter((e) => e.localitySlug === clean)
      .sort((a, b) => a.bedroomCount - b.bedroomCount);
  }

  /**
   * Returns curated related eligible BHK links for internal cross-linking on a BHK landing page:
   * sibling BHK counts in the same locality + same BHK count across other top localities.
   */
  async getRelatedEligibleBhkLinks(
    bedroomCount: number,
    localitySlug: string
  ): Promise<EligibleBhkLandingEntry[]> {
    const clean = localitySlug.toLowerCase().trim();
    const all = await this.getEligibleBhkLandingPages();

    const sameLocality = all
      .filter((e) => e.localitySlug === clean && e.bedroomCount !== bedroomCount)
      .sort((a, b) => a.bedroomCount - b.bedroomCount);

    const sameBhkOtherLocalities = all
      .filter((e) => e.bedroomCount === bedroomCount && e.localitySlug !== clean)
      .slice(0, 6);

    const combined = [...sameLocality, ...sameBhkOtherLocalities];
    const seen = new Set<string>();
    return combined.filter((item) => {
      if (seen.has(item.href)) return false;
      seen.add(item.href);
      return true;
    });
  }

  /**
   * Generates canonical SEO metadata for a BHK landing page.
   */
  generateSeoMetadata(data: BhkLandingData) {
    const {
      bedroomCount,
      localitySlug,
      localityName,
      totalProjects,
      isIndexable,
      minPrice,
      hasPriceOnRequestOnly,
    } = data;

    const locationWithCity = formatLocationWithCity(localityName, 'Kolkata');
    const projectWord = totalProjects === 1 ? 'Project' : 'Projects';
    const priceText =
      !hasPriceOnRequestOnly && minPrice ? ` from ${formatIndianPrice(minPrice)}` : '';

    const rawTitle =
      totalProjects > 0
        ? `${bedroomCount} BHK Flats in ${localityName} – ${totalProjects} Verified ${projectWord}`
        : `${bedroomCount} BHK Flats in ${localityName}`;

    const rawDescription =
      totalProjects > 0
        ? `Discover ${totalProjects} verified residential ${projectWord.toLowerCase()} offering ${bedroomCount} BHK flats in ${locationWithCity}${priceText}. Compare floor plans, carpet areas & RERA details.`
        : `Explore ${bedroomCount} BHK residential flats and apartments in ${locationWithCity} with verified floor plans, developer details, and pricing intelligence on Great Homes.`;

    const primaryImage =
      data.projects[0]?.media?.find((m) => m.isFeatured)?.url ||
      data.projects[0]?.media?.[0]?.url ||
      null;

    return buildPageMetadata({
      title: rawTitle,
      description: sanitizeMetaDescription(rawDescription, rawDescription, { maxLength: 158 }),
      canonicalPath: `/buy/${bedroomCount}-bhk-flats-in-${localitySlug}`,
      index: isIndexable,
      follow: true,
      ogType: 'website',
      ogImage: primaryImage,
      ogImageAlt: `${bedroomCount} BHK Flats in ${localityName}`,
    });
  }

  /**
   * Builds Schema.org structured data (CollectionPage, ItemList, BreadcrumbList, FAQPage)
   * with 100% factual parity against visible page copy.
   */
  generateJsonLd(data: BhkLandingData) {
    const {
      bedroomCount,
      localitySlug,
      localityName,
      totalProjects,
      verifiedReraCount,
      projects,
      minPrice,
      hasPriceOnRequestOnly,
    } = data;

    const canonicalUrl = `${SITE_ORIGIN}/buy/${bedroomCount}-bhk-flats-in-${localitySlug}`;
    const locationWithCity = formatLocationWithCity(localityName, 'Kolkata');
    const projectWord = totalProjects === 1 ? 'project' : 'projects';

    const breadcrumbs = [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: SITE_ORIGIN,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Buy',
        item: `${SITE_ORIGIN}/buy`,
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: `${bedroomCount} BHK Flats in ${localityName}`,
        item: canonicalUrl,
      },
    ];

    const itemListElements = projects.map((p, idx) => ({
      '@type': 'ListItem',
      position: idx + 1,
      name: p.name,
      url: `${SITE_ORIGIN}/projects/${p.slug}`,
    }));

    const priceSentence =
      !hasPriceOnRequestOnly && minPrice
        ? `Published starting prices currently begin at ${formatIndianPrice(minPrice)}.`
        : 'Current pricing is available on request from the developer or Great Homes advisors.';

    const reraAnswer =
      verifiedReraCount > 0
        ? `${verifiedReraCount} of the ${totalProjects} listed ${bedroomCount} BHK ${projectWord} in ${locationWithCity} carry verified WBRERA registration records published directly on their Great Homes project pages.`
        : `Great Homes displays official WBRERA registration status and developer disclosures on each individual project page for ${bedroomCount} BHK developments in ${locationWithCity}.`;

    const faqs = [
      {
        question: `How many verified ${bedroomCount} BHK projects are available in ${localityName}?`,
        answer: `Great Homes features ${totalProjects} verified residential ${projectWord} offering ${bedroomCount} BHK configurations in ${locationWithCity}, complete with floor plans, carpet area details, and developer profiles.`,
      },
      {
        question: `What is the price range for ${bedroomCount} BHK flats in ${localityName}?`,
        answer: `Prices for ${bedroomCount} BHK flats in ${locationWithCity} vary by micro-location, carpet area, and tower specification. ${priceSentence}`,
      },
      {
        question: `Are ${bedroomCount} BHK projects in ${localityName} RERA registered?`,
        answer: reraAnswer,
      },
    ];

    return {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'CollectionPage',
          '@id': `${canonicalUrl}#collection`,
          name: `${bedroomCount} BHK Flats in ${localityName}`,
          description: `Directory of ${totalProjects} verified ${bedroomCount} BHK residential ${projectWord} in ${locationWithCity}.`,
          url: canonicalUrl,
          mainEntity: {
            '@type': 'ItemList',
            numberOfItems: totalProjects,
            itemListElement: itemListElements,
          },
        },
        {
          '@type': 'BreadcrumbList',
          '@id': `${canonicalUrl}#breadcrumbs`,
          itemListElement: breadcrumbs,
        },
        {
          '@type': 'FAQPage',
          '@id': `${canonicalUrl}#faqs`,
          mainEntity: faqs.map((faq) => ({
            '@type': 'Question',
            name: faq.question,
            acceptedAnswer: {
              '@type': 'Answer',
              text: faq.answer,
            },
          })),
        },
      ],
    };
  }
}

export const bhkLandingService = new BhkLandingService();
