import type { Metadata } from 'next';
import { ResaleFilterOptions, ResaleSortOption } from '../repositories/resaleRepository';
import { RentalListingFilter, RentalSortOption } from '../repositories/rentalRepository';
import { PublicProjectDto } from '../dto/projectDto';

export const PROJECT_INVENTORY_PAGE_SIZE = 9;
export const PROJECT_CAROUSEL_MAX_ITEMS = 6;
const BASE_URL = 'https://greathomes.co.in';

const VALID_FURNISHING = new Set(['UNFURNISHED', 'SEMI_FURNISHED', 'FULLY_FURNISHED']);
const VALID_FLOOR_CATEGORY = new Set(['LOWER_FLOOR', 'MID_FLOOR', 'HIGH_FLOOR']);
const VALID_FACING = new Set([
  'NORTH',
  'SOUTH',
  'EAST',
  'WEST',
  'NORTH_EAST',
  'NORTH_WEST',
  'SOUTH_EAST',
  'SOUTH_WEST',
]);
const VALID_POSSESSION = new Set([
  'READY',
  'READY_TO_MOVE',
  'IMMEDIATE',
  'UNDER_CONSTRUCTION',
  'OCCUPIED',
  'AVAILABLE_FROM_DATE',
]);
const VALID_RESALE_SORTS = new Set<ResaleSortOption>(['newest', 'price_asc', 'price_desc', 'area_desc']);
const VALID_RENTAL_SORTS = new Set<RentalSortOption>(['newest', 'rent_asc', 'rent_desc', 'area_desc']);

function getFirstString(val: string | string[] | undefined): string | undefined {
  if (typeof val === 'string') return val.trim() || undefined;
  if (Array.isArray(val) && typeof val[0] === 'string') return val[0].trim() || undefined;
  return undefined;
}

function parsePositiveNumber(val: string | undefined): number | undefined {
  if (!val) return undefined;
  const num = Number(val);
  if (!Number.isFinite(num) || num <= 0) return undefined;
  return num;
}

function parsePositiveInt(val: string | undefined, fallback: number): number {
  if (!val) return fallback;
  const num = parseInt(val, 10);
  if (!Number.isFinite(num) || num < 1) return fallback;
  return num;
}

/**
 * Shared dynamic SEO title count-formatting helper.
 * | Eligible listings | Title count |
 * | 0                 | null        |
 * | 1-9               | null        |
 * | 10-19             | 10+         |
 * | 20-29             | 20+         |
 * | 30-39             | 30+         |
 * | ...               | ...         |
 * | 90-99             | 90+         |
 * | 100+              | 100+        |
 */
export function formatInventoryTitleCountBucket(eligibleCount: number): string | null {
  if (!Number.isFinite(eligibleCount) || eligibleCount < 10) {
    return null;
  }
  const cleanCount = Math.floor(eligibleCount);
  if (cleanCount >= 100) {
    return '100+';
  }
  const decade = Math.floor(cleanCount / 10) * 10;
  return `${decade}+`;
}

/**
 * Formats an eligible listing count phrase with strict singular/plural grammar
 * and only includes "verified" when the displayed count genuinely equals verifiedCount.
 */
export function formatInventoryListingCountPhrase(options: {
  eligibleCount: number;
  verifiedCount?: number;
  singularNoun: string;
  pluralNoun: string;
}): string {
  const count = Number.isFinite(options.eligibleCount) ? Math.max(0, Math.floor(options.eligibleCount)) : 0;
  const allVerified =
    count > 0 &&
    typeof options.verifiedCount === 'number' &&
    options.verifiedCount === count;
  const verifiedPrefix = allVerified ? 'verified ' : '';

  if (count === 1) {
    return `1 ${verifiedPrefix}${options.singularNoun}`;
  }
  const bucket = formatInventoryTitleCountBucket(count);
  if (bucket) {
    return `${bucket} ${verifiedPrefix}${options.pluralNoun}`;
  }
  return `${count} ${verifiedPrefix}${options.pluralNoun}`;
}

/**
 * Resolves the canonical hero/primary image from a project's media array.
 * Never fabricates or invents fallback image URLs.
 */
export function resolveCanonicalProjectHeroMedia(
  project: PublicProjectDto,
  mode: 'RESALE' | 'RENTAL'
): { url: string; alt: string } | null {
  if (!project.media || project.media.length === 0) {
    return null;
  }

  const validImages = project.media.filter(
    m =>
      Boolean(m.url && m.url.trim().length > 0) &&
      (m.mediaType || 'IMAGE').toUpperCase() === 'IMAGE'
  );

  if (validImages.length === 0) {
    return null;
  }

  const candidate =
    validImages.find(m => m.isFeatured && (m.category || '').toUpperCase() !== 'FLOOR_PLANS') ||
    validImages.find(m => (m.category || '').toUpperCase() !== 'FLOOR_PLANS') ||
    validImages.find(m => m.isFeatured) ||
    validImages[0];

  if (!candidate || !candidate.url) {
    return null;
  }

  const localityName = project.location?.name?.trim() || 'Kolkata';
  const modeLabel = mode === 'RESALE' ? 'Resale Apartments' : 'Apartments for Rent';
  const customAlt = candidate.altText?.trim() || candidate.caption?.trim();
  const alt = customAlt
    ? `${project.name} (${customAlt}) — ${modeLabel} in ${localityName}, Kolkata`
    : `${project.name} — ${modeLabel} in ${localityName}, Kolkata`;

  return {
    url: candidate.url.trim(),
    alt,
  };
}

/**
 * Extracts project-level carpet area summary from canonical project configurations.
 * Clearly scoped to master project configurations (never conflated with active resale/rental units).
 */
export function deriveProjectCarpetAreaRangeText(project: PublicProjectDto): string | null {
  if (!project.configurations || project.configurations.length === 0) {
    return null;
  }
  const carpetAreas = project.configurations
    .map(c => c.carpetArea)
    .filter((a): a is number => typeof a === 'number' && Number.isFinite(a) && a > 0)
    .map(a => Math.round(a));

  if (carpetAreas.length === 0) {
    return null;
  }

  const minArea = Math.min(...carpetAreas);
  const maxArea = Math.max(...carpetAreas);

  if (minArea === maxArea) {
    return `${minArea.toLocaleString('en-IN')} sq.ft. carpet area`;
  }
  return `${minArea.toLocaleString('en-IN')} – ${maxArea.toLocaleString('en-IN')} sq.ft. carpet area`;
}

/**
 * Shared metadata builder for /projects/[slug]/resale and /projects/[slug]/rent.
 * - Clean page-1 URLs are always index, follow regardless of inventory count (0, 1-9, 10+, 100+).
 * - Filtered, explicitly sorted, and paginated URLs are noindex, follow and canonicalize to clean base URL.
 * - Populates complete OpenGraph and Twitter card metadata using canonical project media.
 */
export function buildProjectInventorySeoMetadata(options: {
  project: PublicProjectDto;
  mode: 'RESALE' | 'RENTAL';
  totalEligibleCount: number;
  verifiedCount: number;
  hasActiveFilters: boolean;
  hasExplicitSort: boolean;
  page: number;
}): Metadata {
  const {
    project,
    mode,
    totalEligibleCount,
    verifiedCount,
    hasActiveFilters,
    hasExplicitSort,
    page,
  } = options;

  const isResale = mode === 'RESALE';
  const rawLocality = project.location?.name?.trim();
  const locationClause =
    rawLocality && rawLocality.toLowerCase() !== 'kolkata'
      ? `${rawLocality}, Kolkata`
      : 'Kolkata';

  const canonicalUrl = `${BASE_URL}/projects/${project.slug}/${isResale ? 'resale' : 'rent'}`;

  const cleanProjectName = project.name.split(/\s*[—–]\s*/)[0].trim() || project.name.trim();

  const baseTitle = isResale
    ? `Resale Apartments in ${cleanProjectName}, ${locationClause}`
    : `Apartments for Rent in ${cleanProjectName}, ${locationClause}`;

  const titleCountBucket = formatInventoryTitleCountBucket(totalEligibleCount);
  const title = titleCountBucket
    ? `${baseTitle} – ${titleCountBucket} Listings | Great Homes`
    : `${baseTitle} | Great Homes`;

  const developerClause = project.developer?.name?.trim()
    ? ` by ${project.developer.name.trim()}`
    : '';
  const configSummary =
    project.configurationsSummary?.trim() || project.snapshot?.configurations?.trim() || null;
  const configClause = configSummary ? `${configSummary} ` : '';

  let description: string;
  if (totalEligibleCount > 0) {
    const countPhrase = formatInventoryListingCountPhrase({
      eligibleCount: totalEligibleCount,
      verifiedCount,
      singularNoun: isResale ? 'resale apartment' : 'rental apartment',
      pluralNoun: isResale ? 'resale apartments' : 'rental apartments',
    });

    description = isResale
      ? `Browse ${countPhrase} for sale in ${project.name}${developerClause}, ${locationClause}. Compare ${configClause}configurations, carpet areas, floor levels & asking prices.`
      : `Browse ${countPhrase} for rent in ${project.name}${developerClause}, ${locationClause}. Compare ${configClause}configurations, carpet areas, monthly rent & lease terms.`;
  } else {
    description = isResale
      ? `Explore resale apartments in ${project.name}${developerClause}, ${locationClause}. Review ${configClause}project configurations, carpet area details & register for resale availability alerts.`
      : `Explore apartments for rent in ${project.name}${developerClause}, ${locationClause}. Review ${configClause}project configurations, carpet area details & register for rental availability alerts.`;
  }

  const shouldIndex = !hasActiveFilters && !hasExplicitSort && page === 1;
  const heroMedia = resolveCanonicalProjectHeroMedia(project, mode);

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    robots: {
      index: shouldIndex,
      follow: true,
    },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      siteName: 'Great Homes',
      type: 'website',
      ...(heroMedia
        ? {
            images: [
              {
                url: heroMedia.url,
                alt: heroMedia.alt,
              },
            ],
          }
        : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      ...(heroMedia ? { images: [heroMedia.url] } : {}),
    },
  };
}

export interface ParsedProjectResaleSearchParams {
  filter: ResaleFilterOptions;
  page: number;
  sortBy: ResaleSortOption;
  hasActiveFilters: boolean;
  hasExplicitSort: boolean;
  isParameterizedUrl: boolean;
}

export function parseProjectResaleSearchParams(
  searchParams: Record<string, string | string[] | undefined>
): ParsedProjectResaleSearchParams {
  const bhkRaw = getFirstString(searchParams.bhk);
  const bedroomCount = bhkRaw ? parsePositiveInt(bhkRaw, 0) || undefined : undefined;

  const minPrice = parsePositiveNumber(getFirstString(searchParams.minPrice));
  const maxPrice = parsePositiveNumber(getFirstString(searchParams.maxPrice));

  const furnishingRaw = getFirstString(searchParams.furnishing);
  const furnishing = furnishingRaw && VALID_FURNISHING.has(furnishingRaw) ? furnishingRaw : undefined;

  const floorRaw = getFirstString(searchParams.floorCategory);
  const floorCategory = floorRaw && VALID_FLOOR_CATEGORY.has(floorRaw) ? floorRaw : undefined;

  const facingRaw = getFirstString(searchParams.facing);
  const facing = facingRaw && VALID_FACING.has(facingRaw) ? facingRaw : undefined;

  const possessionRaw = getFirstString(searchParams.possession);
  const possession = possessionRaw && VALID_POSSESSION.has(possessionRaw) ? possessionRaw : undefined;

  const verifiedRaw = getFirstString(searchParams.verified);
  const verificationStatus = verifiedRaw === 'true' ? 'VERIFIED' : undefined;

  const sortRaw = getFirstString(searchParams.sort) as ResaleSortOption | undefined;
  const sortBy: ResaleSortOption = sortRaw && VALID_RESALE_SORTS.has(sortRaw) ? sortRaw : 'newest';
  const hasExplicitSort = Boolean(sortRaw);

  const pageRaw = getFirstString(searchParams.page);
  const page = parsePositiveInt(pageRaw, 1);

  const hasActiveFilters = Boolean(
    bedroomCount !== undefined ||
      minPrice !== undefined ||
      maxPrice !== undefined ||
      furnishing ||
      floorCategory ||
      facing ||
      possession ||
      verificationStatus
  );

  const isParameterizedUrl = Boolean(hasActiveFilters || hasExplicitSort || page > 1);

  return {
    filter: {
      bedroomCount,
      minPrice,
      maxPrice,
      furnishing,
      floorCategory,
      facing,
      possession,
      verificationStatus,
      sortBy,
    },
    page,
    sortBy,
    hasActiveFilters,
    hasExplicitSort,
    isParameterizedUrl,
  };
}

export interface ParsedProjectRentalSearchParams {
  filter: RentalListingFilter;
  page: number;
  sortBy: RentalSortOption;
  hasActiveFilters: boolean;
  hasExplicitSort: boolean;
  isParameterizedUrl: boolean;
}

export function parseProjectRentalSearchParams(
  searchParams: Record<string, string | string[] | undefined>
): ParsedProjectRentalSearchParams {
  const bhkRaw = getFirstString(searchParams.bhk);
  const bedroomCount = bhkRaw ? parsePositiveInt(bhkRaw, 0) || undefined : undefined;

  const minRent = parsePositiveNumber(getFirstString(searchParams.minRent));
  const maxRent = parsePositiveNumber(getFirstString(searchParams.maxRent));

  const furnishingRaw = getFirstString(searchParams.furnishing);
  const furnishing = furnishingRaw && VALID_FURNISHING.has(furnishingRaw) ? furnishingRaw : undefined;

  const floorRaw = getFirstString(searchParams.floorCategory);
  const floorCategory = floorRaw && VALID_FLOOR_CATEGORY.has(floorRaw) ? floorRaw : undefined;

  const facingRaw = getFirstString(searchParams.facing);
  const facing = facingRaw && VALID_FACING.has(facingRaw) ? facingRaw : undefined;

  const possessionRaw = getFirstString(searchParams.possession);
  const possession = possessionRaw && VALID_POSSESSION.has(possessionRaw) ? possessionRaw : undefined;

  const verifiedRaw = getFirstString(searchParams.verified);
  const verificationStatus = verifiedRaw === 'true' ? 'VERIFIED' : undefined;

  const sortRaw = getFirstString(searchParams.sort) as RentalSortOption | undefined;
  const sortBy: RentalSortOption = sortRaw && VALID_RENTAL_SORTS.has(sortRaw) ? sortRaw : 'newest';
  const hasExplicitSort = Boolean(sortRaw);

  const pageRaw = getFirstString(searchParams.page);
  const page = parsePositiveInt(pageRaw, 1);

  const hasActiveFilters = Boolean(
    bedroomCount !== undefined ||
      minRent !== undefined ||
      maxRent !== undefined ||
      furnishing ||
      floorCategory ||
      facing ||
      possession ||
      verificationStatus
  );

  const isParameterizedUrl = Boolean(hasActiveFilters || hasExplicitSort || page > 1);

  return {
    filter: {
      bedroomCount,
      minRent,
      maxRent,
      furnishing,
      floorCategory,
      facing,
      possession,
      verificationStatus,
      sortBy,
    },
    page,
    sortBy,
    hasActiveFilters,
    hasExplicitSort,
    isParameterizedUrl,
  };
}

