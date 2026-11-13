export type SeoCheckSeverity = 'PASS' | 'WARNING' | 'CRITICAL';

export type SeoEntityType =
  | 'PROJECT'
  | 'DEVELOPER'
  | 'LOCATION'
  | 'RESALE'
  | 'RENTAL'
  | 'EDITORIAL'
  | 'STATIC';

export interface SeoIssue {
  field: 'title' | 'description' | 'slug' | 'canonical' | 'image' | 'schema' | 'indexability';
  severity: SeoCheckSeverity;
  message: string;
  recommendation: string;
}

export interface SeoEntityInput {
  id: string;
  title?: string | null;
  description?: string | null;
  slug?: string | null;
  canonicalUrl?: string | null;
  hasFeaturedImage?: boolean;
  hasStructuredData?: boolean;
  schemaTypes?: string[];
  schemaValidated?: boolean;
  isIndexed?: boolean;
  entityType?: SeoEntityType;
  lifecycleStatus?: string | null;
  verificationStatus?: string | null;
  isEligible?: boolean;
  exclusionReasons?: string[];
}

export interface SeoAuditResult {
  score: number;
  qualityScore: number;
  status: SeoCheckSeverity;
  isIndexable: boolean;
  indexabilityStatus: 'INDEXABLE' | 'NON_INDEXABLE';
  exclusionReasons: string[];
  titleLength: number;
  descriptionLength: number;
  canonicalValid: boolean;
  slugValid: boolean;
  issues: SeoIssue[];
}

const CANONICAL_ROUTE_REGEX =
  /^https:\/\/(www\.)?greathomes\.co\.in(\/(projects\/[a-z0-9]+(?:-[a-z0-9]+)*\/(resale|rent)|(projects|developers|locations|buy|rent|guides|reviews|market)(\/[a-z0-9]+(?:-[a-z0-9]+)*)?))?$/;

const SLUG_FORMAT_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const ENTITY_ROUTE_PREFIX: Partial<Record<SeoEntityType, string>> = {
  PROJECT: '/projects/',
  DEVELOPER: '/developers/',
  LOCATION: '/locations/',
  RESALE: '/buy/',
  RENTAL: '/rent/',
};

/**
 * Validates that a canonical URL belongs to https://www.greathomes.co.in,
 * matches the canonical route pattern, and aligns with the entity type and slug when provided.
 */
export function validateCanonicalUrl(
  canonicalUrl?: string | null,
  entityType?: SeoEntityType,
  slug?: string | null
): { valid: boolean; reason?: string } {
  const cleanUrl = (canonicalUrl || '').trim();
  if (!cleanUrl) {
    return { valid: false, reason: 'Canonical URL is missing.' };
  }

  if (!CANONICAL_ROUTE_REGEX.test(cleanUrl)) {
    return {
      valid: false,
      reason: 'Canonical URL does not match https://www.greathomes.co.in/<section>/<slug> format.',
    };
  }

  if (entityType && ENTITY_ROUTE_PREFIX[entityType]) {
    const expectedPrefix = `https://www.greathomes.co.in${ENTITY_ROUTE_PREFIX[entityType]}`;
    const legacyPrefix = `https://greathomes.co.in${ENTITY_ROUTE_PREFIX[entityType]}`;
    if (!cleanUrl.startsWith(expectedPrefix) && !cleanUrl.startsWith(legacyPrefix)) {
      return {
        valid: false,
        reason: `Canonical URL must start with ${expectedPrefix} for ${entityType.toLowerCase()} records.`,
      };
    }
    const cleanSlug = (slug || '').trim();
    if (cleanSlug) {
      const exactMatch = cleanUrl === `${expectedPrefix}${cleanSlug}` || cleanUrl === `${legacyPrefix}${cleanSlug}`;
      const projectInventoryMatch =
        entityType === 'PROJECT' &&
        (cleanUrl === `${expectedPrefix}${cleanSlug}/resale` ||
          cleanUrl === `${legacyPrefix}${cleanSlug}/resale` ||
          cleanUrl === `${expectedPrefix}${cleanSlug}/rent` ||
          cleanUrl === `${legacyPrefix}${cleanSlug}/rent`);

      if (!exactMatch && !projectInventoryMatch) {
        return {
          valid: false,
          reason: `Canonical URL path does not match entity slug "${cleanSlug}".`,
        };
      }
    }
  }

  return { valid: true };
}

/**
 * Evaluates an entity's SEO metadata quality AND public indexability eligibility.
 * Separates metadata quality (qualityScore 0-100) from public search readiness (score & isIndexable).
 * Never marks DRAFT, ARCHIVED, PAUSED, SOLD_RENTED, REJECTED, or UNVERIFIED records as PASS or indexable.
 */
export function evaluateEntitySeo(input: SeoEntityInput): SeoAuditResult {
  const issues: SeoIssue[] = [];
  const exclusionReasons: string[] = [...(input.exclusionReasons || [])];

  const title = (input.title || '').trim();
  const description = (input.description || '').trim();
  const slug = (input.slug || '').trim();
  const canonical = (input.canonicalUrl || '').trim();

  // 0. Public Indexability & Lifecycle / Verification Governance
  const lifecycle = input.lifecycleStatus ? input.lifecycleStatus.toUpperCase() : undefined;
  const verification = input.verificationStatus ? input.verificationStatus.toUpperCase() : undefined;

  if (!slug) {
    if (!exclusionReasons.some(r => r.toLowerCase().includes('slug'))) {
      exclusionReasons.push('Missing URL slug');
    }
  }

  if (lifecycle && lifecycle !== 'PUBLISHED') {
    const reason = `Lifecycle is ${lifecycle} (only PUBLISHED records are eligible for public indexing)`;
    if (!exclusionReasons.includes(reason)) {
      exclusionReasons.push(reason);
    }
  }

  if (verification && verification !== 'VERIFIED') {
    const reason = `Verification is ${verification} (only VERIFIED records are eligible for public indexing)`;
    if (!exclusionReasons.includes(reason)) {
      exclusionReasons.push(reason);
    }
  }

  if (input.isEligible === false && exclusionReasons.length === 0) {
    exclusionReasons.push('Ineligible for public indexation by domain SEO governance rules');
  }

  if (input.isIndexed === false && exclusionReasons.length === 0) {
    exclusionReasons.push('Marked non-indexable (noindex)');
  }

  const isIndexable =
    exclusionReasons.length === 0 &&
    input.isEligible !== false &&
    input.isIndexed !== false;

  if (!isIndexable) {
    issues.push({
      field: 'indexability',
      severity: 'CRITICAL',
      message: `Not publicly indexable: ${exclusionReasons.join(' • ')}`,
      recommendation:
        'Excluded from public /sitemap.xml and search engine indexing until lifecycle is PUBLISHED, verification (if applicable) is VERIFIED, and minimum content thresholds are met.',
    });
  }

  let qualityScore = 0;

  // 1. Title Evaluation (25 points)
  const titleLength = title.length;
  if (titleLength === 0) {
    issues.push({
      field: 'title',
      severity: 'CRITICAL',
      message: 'Missing SEO title.',
      recommendation: 'Provide a descriptive title between 30 and 60 characters including location and brand.',
    });
  } else if (titleLength < 30) {
    qualityScore += 10;
    issues.push({
      field: 'title',
      severity: 'WARNING',
      message: `Title is too short (${titleLength} chars).`,
      recommendation: 'Expand title to 30–60 characters to capture high-intent search queries.',
    });
  } else if (titleLength > 65) {
    qualityScore += 18;
    issues.push({
      field: 'title',
      severity: 'WARNING',
      message: `Title exceeds optimal SERP width (${titleLength} chars).`,
      recommendation: 'Trim title under 60–65 characters to prevent truncation in Google search results.',
    });
  } else {
    qualityScore += 25;
  }

  // 2. Meta Description Evaluation (25 points)
  const descriptionLength = description.length;
  if (descriptionLength === 0) {
    issues.push({
      field: 'description',
      severity: 'CRITICAL',
      message: 'Missing meta description.',
      recommendation: 'Add a compelling summary between 110 and 160 characters highlighting key configurations and locality.',
    });
  } else if (descriptionLength < 70) {
    qualityScore += 10;
    issues.push({
      field: 'description',
      severity: 'WARNING',
      message: `Meta description is thin (${descriptionLength} chars).`,
      recommendation: 'Enrich description to at least 110–160 characters for better SERP click-through rates.',
    });
  } else if (descriptionLength > 165) {
    qualityScore += 18;
    issues.push({
      field: 'description',
      severity: 'WARNING',
      message: `Meta description may truncate (${descriptionLength} chars).`,
      recommendation: 'Keep meta description concise (110–160 characters).',
    });
  } else {
    qualityScore += 25;
  }

  // 3. Slug & Canonical Hygiene (20 points)
  const slugValid = Boolean(slug && SLUG_FORMAT_REGEX.test(slug));
  const canonicalCheck = validateCanonicalUrl(canonical, input.entityType, slug);
  const canonicalValid = canonicalCheck.valid;

  if (!slug) {
    issues.push({
      field: 'slug',
      severity: 'CRITICAL',
      message: 'Missing URL slug.',
      recommendation: 'Assign a clean, lowercase, hyphen-separated slug.',
    });
  } else if (!slugValid) {
    qualityScore += 8;
    issues.push({
      field: 'slug',
      severity: 'WARNING',
      message: 'Non-standard slug format.',
      recommendation: 'Use only lowercase alphanumeric characters and single hyphens.',
    });
  } else if (!canonicalValid) {
    qualityScore += 8;
    issues.push({
      field: 'canonical',
      severity: 'CRITICAL',
      message: canonicalCheck.reason || 'Invalid canonical URL.',
      recommendation: 'Ensure canonical URL points to https://greathomes.co.in/<route>/<slug>.',
    });
  } else {
    qualityScore += 20;
  }

  // 4. OpenGraph / Featured Media (15 points)
  if (input.hasFeaturedImage) {
    qualityScore += 15;
  } else {
    issues.push({
      field: 'image',
      severity: 'WARNING',
      message: 'No OpenGraph / featured image configured.',
      recommendation: 'Attach a primary hero image (1200x630px recommended) for rich social and Discover previews.',
    });
  }

  // 5. JSON-LD Structured Data (15 points)
  // Only award points if the route actually emits verified JSON-LD
  const hasVerifiedSchema =
    Boolean(input.hasStructuredData) &&
    (input.schemaValidated !== false);

  if (hasVerifiedSchema) {
    qualityScore += 15;
  } else {
    issues.push({
      field: 'schema',
      severity: 'WARNING',
      message: 'JSON-LD structured data not verified.',
      recommendation: 'Ensure Schema.org JSON-LD markup is emitted on the public detail route.',
    });
  }

  // Compute effective public readiness score and severity status
  // Non-indexable records can never receive PASS or a high readiness score
  const score = isIndexable ? qualityScore : Math.min(qualityScore, 45);

  let status: SeoCheckSeverity = 'PASS';
  if (!isIndexable || score < 60 || issues.some(i => i.severity === 'CRITICAL')) {
    status = 'CRITICAL';
  } else if (score < 85 || issues.length > 0) {
    status = 'WARNING';
  }

  return {
    score,
    qualityScore,
    status,
    isIndexable,
    indexabilityStatus: isIndexable ? 'INDEXABLE' : 'NON_INDEXABLE',
    exclusionReasons,
    titleLength,
    descriptionLength,
    canonicalValid,
    slugValid,
    issues,
  };
}

export function buildDeveloperJsonLd(
  developer: {
    name: string;
    slug: string;
    shortDescription?: string;
    description?: string;
    logoUrl?: string;
    websiteUrl?: string;
    locations?: Array<{ name: string }>;
  },
  projects?: Array<{ name: string; slug: string }>
) {
  const canonicalUrl = `https://www.greathomes.co.in/developers/${developer.slug}`;
  const description =
    developer.shortDescription ||
    developer.description ||
    `Verified real estate developer profile and residential project portfolio for ${developer.name} on Great Homes.`;

  const graph: any[] = [
    {
      '@type': ['Organization', 'RealEstateAgent'],
      '@id': `${canonicalUrl}#organization`,
      name: developer.name,
      url: canonicalUrl,
      description,
      ...(developer.logoUrl ? { logo: developer.logoUrl, image: developer.logoUrl } : {}),
      ...(developer.websiteUrl ? { sameAs: [developer.websiteUrl] } : {}),
      ...(developer.locations && developer.locations.length > 0
        ? {
            areaServed: developer.locations.map(loc => ({
              '@type': 'Place',
              name: loc.name,
            })),
          }
        : {}),
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: 'Home',
          item: 'https://www.greathomes.co.in',
        },
        {
          '@type': 'ListItem',
          position: 2,
          name: 'Developers',
          item: 'https://www.greathomes.co.in/developers',
        },
        {
          '@type': 'ListItem',
          position: 3,
          name: developer.name,
          item: canonicalUrl,
        },
      ],
    },
  ];

  if (projects && projects.length > 0) {
    graph.push({
      '@type': 'ItemList',
      name: `Projects by ${developer.name}`,
      numberOfItems: projects.length,
      itemListElement: projects.map((p, idx) => ({
        '@type': 'ListItem',
        position: idx + 1,
        name: p.name,
        url: `https://www.greathomes.co.in/projects/${p.slug}`,
      })),
    });
  }

  return {
    '@context': 'https://schema.org',
    '@graph': graph,
  };
}

