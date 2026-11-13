import { getDb } from '@/src/db/client';
import { ensureSeedData } from '@/src/infrastructure/seed';
import { projectIntelligenceService } from './projectIntelligenceService';
import { locationRepository } from '@/src/infrastructure/repositories/locationProvider';
import { PublicProjectDto } from '../dto/projectDto';
import { formatIndianPrice } from '@/src/components/discovery/formatters';

export interface BhkLandingData {
  bedroomCount: number;
  localitySlug: string;
  localityName: string;
  isCityLevel: boolean;
  projects: PublicProjectDto[];
  totalProjects: number;
  totalConfigurations: number;
  isIndexable: boolean;
  minPrice: number | null;
  maxPrice: number | null;
  hasPriceOnRequestOnly: boolean;
}

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
    const locMap = new Map(allLocations.map(l => [l.id, l]));

    let targetLocName = 'Kolkata';
    if (!isCityLevel) {
      const found = allLocations.find(l => l.slug.toLowerCase() === cleanLocSlug);
      if (!found || found.status !== 'PUBLISHED') {
        return null;
      }
      targetLocName = found.name;
    }

    // Load all published projects
    const allPublished = await projectIntelligenceService.listAllProjects({}, false);
    const publishedProjects = (allPublished || []).filter(
      p => p.lifecycleStatus === 'PUBLISHED' && Boolean(p.slug)
    );

    function projectBelongsToLocality(p: PublicProjectDto): boolean {
      const locId = p.location?.id;
      if (!locId) return false;

      // Build ancestor chain
      let cur = locMap.get(locId);
      const visited = new Set<string>();
      const ancestors: string[] = [];
      while (cur && !visited.has(cur.id)) {
        visited.add(cur.id);
        ancestors.push(cur.slug.toLowerCase());
        cur = cur.parentId ? locMap.get(cur.parentId) : undefined;
      }

      if (isCityLevel) {
        // Exclude projects that are attached to West Bengal directly without Kolkata in ancestor path
        return ancestors.includes('kolkata');
      }

      return ancestors.includes(cleanLocSlug);
    }

    const matchingProjects: PublicProjectDto[] = [];
    let totalMatchingConfigs = 0;
    const publicPrices: number[] = [];
    let hasAnyPricedProject = false;

    for (const p of publishedProjects) {
      if (!projectBelongsToLocality(p)) {
        continue;
      }

      // Exact integer BHK matching on configurations (strictly exclude fractional typologies like 3.5 or 4.5)
      const exactConfigs = (p.configurations || []).filter(c => {
        if (typeof c.bedroomCount !== 'number') return false;
        // Strictly check integer value equals requested bedroomCount
        return Math.floor(c.bedroomCount) === bedroomCount && c.bedroomCount === bedroomCount;
      });

      if (exactConfigs.length > 0) {
        matchingProjects.push(p);
        totalMatchingConfigs += exactConfigs.length;

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

    const isIndexable = matchingProjects.length >= 3;
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
      isIndexable,
      minPrice,
      maxPrice,
      hasPriceOnRequestOnly,
    };
  }

  /**
   * Generates canonical SEO metadata for a BHK landing page.
   */
  generateSeoMetadata(data: BhkLandingData) {
    const { bedroomCount, localitySlug, localityName, totalProjects, isIndexable, minPrice, hasPriceOnRequestOnly } = data;
    const BASE_URL = 'https://www.greathomes.co.in';
    const canonicalUrl = `${BASE_URL}/buy/${bedroomCount}-bhk-flats-in-${localitySlug}`;

    const priceText = !hasPriceOnRequestOnly && minPrice
      ? ` from ${formatIndianPrice(minPrice)}`
      : '';

    const title = `${bedroomCount} BHK Flats in ${localityName} – ${totalProjects} Verified Projects | Great Homes`;
    const description = `Discover ${totalProjects} verified residential projects offering ${bedroomCount} BHK apartments and flats in ${localityName}, Kolkata${priceText}. Compare floor plans, carpet areas, pricing intelligence, amenities and RERA status.`;

    return {
      title,
      description,
      alternates: {
        canonical: canonicalUrl,
      },
      robots: {
        index: isIndexable,
        follow: true,
      },
      openGraph: {
        title,
        description,
        url: canonicalUrl,
        siteName: 'Great Homes',
        type: 'website',
      },
      twitter: {
        card: 'summary_large_image',
        title,
        description,
      },
    };
  }

  /**
   * Builds Schema.org structured data (CollectionPage, ItemList, BreadcrumbList, FAQPage).
   */
  generateJsonLd(data: BhkLandingData) {
    const { bedroomCount, localitySlug, localityName, totalProjects, projects, minPrice, hasPriceOnRequestOnly } = data;
    const BASE_URL = 'https://www.greathomes.co.in';
    const canonicalUrl = `${BASE_URL}/buy/${bedroomCount}-bhk-flats-in-${localitySlug}`;

    const breadcrumbs = [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: `${BASE_URL}`,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Buy',
        item: `${BASE_URL}/buy`,
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
      url: `${BASE_URL}/projects/${p.slug}`,
    }));

    const priceRangeText = !hasPriceOnRequestOnly && minPrice
      ? `Starting from ${formatIndianPrice(minPrice)}`
      : 'Pricing on request';

    const faqs = [
      {
        question: `How many verified ${bedroomCount} BHK projects are available in ${localityName}?`,
        answer: `Great Homes features ${totalProjects} verified residential projects offering ${bedroomCount} BHK configurations in ${localityName}, Kolkata with verified developer credentials, floor plans, and RERA compliance.`,
      },
      {
        question: `What is the price range for ${bedroomCount} BHK flats in ${localityName}?`,
        answer: `Prices for ${bedroomCount} BHK flats in ${localityName} vary based on micro-location, carpet area, and luxury tier. Current pricing begins ${priceRangeText}. Contact our property advisors for exact tower and inventory pricing.`,
      },
      {
        question: `Are ${bedroomCount} BHK projects in ${localityName} RERA registered?`,
        answer: `Yes, Great Homes publishes official WBRERA / HIRA registration numbers, approval documentation, and construction milestones for all featured developments.`,
      },
    ];

    return {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'CollectionPage',
          '@id': `${canonicalUrl}#collection`,
          name: `${bedroomCount} BHK Flats in ${localityName}`,
          description: `Comprehensive directory of ${totalProjects} verified ${bedroomCount} BHK residential developments in ${localityName}, Kolkata.`,
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
          mainEntity: faqs.map(faq => ({
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
