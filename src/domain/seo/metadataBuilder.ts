import type { Metadata } from 'next';
import { normalizeMediaPublicUrl } from '@/src/lib/mediaUtils';

/**
 * Canonical Great Homes V2 SEO domain & branding constants.
 * Single source of truth used across routes, sitemap, robots, structured data, and admin SEO tools.
 */
export const SITE_ORIGIN = 'https://www.greathomes.co.in';
export const SITE_NAME = 'Great Homes';
export const SITE_LOGO_URL = `${SITE_ORIGIN}/icon.png`;
export const DEFAULT_OG_IMAGE = `${SITE_ORIGIN}/og-image.png`;

const ALLOWED_CANONICAL_HOSTS = new Set([
  'www.greathomes.co.in',
  'greathomes.co.in',
]);

const TRAILING_BRAND_PATTERNS = [
  /\s*[|–—-]\s*Great Homes(?:\s+(?:Kolkata|Review|Reviews|Advisory))?\s*$/i,
];

const GENERIC_PLACEHOLDER_DESCRIPTIONS = new Set([
  'verified great homes resale listing.',
  'verified great homes rental listing.',
  'verified great homes resale listing',
  'verified great homes rental listing',
  'verified resale listing',
  'verified rental listing',
  'coming soon',
  'test',
  'testing',
  'placeholder',
  'n/a',
  'na',
  'none',
  'dev',
]);

/**
 * Trailing connectors, prepositions, articles, and verb fragments that should never
 * terminate a clamped meta title or meta description.
 */
const DANGLING_TRAILING_WORDS = new Set([
  '&',
  'and',
  'or',
  'nor',
  'but',
  'yet',
  'so',
  'with',
  'without',
  'in',
  'on',
  'at',
  'to',
  'for',
  'of',
  'from',
  'by',
  'across',
  'near',
  'via',
  'about',
  'into',
  'through',
  'under',
  'over',
  'between',
  'among',
  'around',
  'offering',
  'featuring',
  'including',
  'starting',
  'the',
  'a',
  'an',
  'your',
  'our',
  'their',
  'this',
  'that',
  'these',
  'those',
]);

/**
 * Known placeholder / stock-randomizer image hosts that must never appear in
 * public SEO metadata (OpenGraph, Twitter Cards, Schema.org JSON-LD, or editorial covers).
 */
const PLACEHOLDER_IMAGE_HOSTS = new Set([
  'picsum.photos',
  'fastly.picsum.photos',
  'via.placeholder.com',
  'placehold.co',
  'placehold.it',
  'placekitten.com',
  'dummyimage.com',
]);

/**
 * Strips HTML tags and normalizes all whitespace (newlines, tabs, repeated spaces).
 */
export function stripHtmlAndNormalizeWhitespace(input?: string | null): string {
  if (!input || typeof input !== 'string') return '';
  return input
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Repeatedly strips trailing Great Homes brand suffixes to prevent double branding
 * such as "... | Great Homes | Great Homes" or "... | Great Homes | Great Homes Review".
 */
export function stripBrandSuffix(rawTitle?: string | null): string {
  let clean = stripHtmlAndNormalizeWhitespace(rawTitle);
  if (!clean) return '';

  let changed = true;
  while (changed) {
    changed = false;
    for (const pattern of TRAILING_BRAND_PATTERNS) {
      if (pattern.test(clean)) {
        clean = clean.replace(pattern, '').trim();
        changed = true;
      }
    }
  }
  return clean;
}

/**
 * Appends `| Great Homes` exactly once unless `includeBrand` is false.
 * When `includeBrand` is false, preserves an existing trailing Great Homes brand suffix
 * (deduplicating any repeated brand suffix) instead of stripping it, while leaving
 * intentionally unbranded or lead-branded titles untouched.
 */
export function formatBrandTitle(
  rawCoreTitle: string,
  options?: { includeBrand?: boolean; maxLength?: number }
): string {
  const includeBrand = options?.includeBrand !== false;
  const maxLength = options?.maxLength ?? 78;
  const cleanRaw = stripHtmlAndNormalizeWhitespace(rawCoreTitle);
  const core = stripBrandSuffix(cleanRaw);

  if (!core) {
    return `${SITE_NAME} | Verified Residential Property Discovery in Kolkata`;
  }

  const hasTrailingBrand = cleanRaw.length !== core.length;

  if (!includeBrand && !hasTrailingBrand) {
    return clampAtWordBoundary(core, maxLength, false);
  }

  const suffix = ` | ${SITE_NAME}`;
  if (core.length + suffix.length <= maxLength) {
    return `${core}${suffix}`;
  }

  const maxCoreLen = Math.max(24, maxLength - suffix.length);
  return `${clampAtWordBoundary(core, maxCoreLen, false)}${suffix}`;
}

/**
 * Formats a locality name paired with a city without ever producing duplicates
 * like "Kolkata, Kolkata" or geographical errors like "West Bengal, Kolkata".
 */
export function formatLocationWithCity(
  locationName?: string | null,
  cityName = 'Kolkata'
): string {
  const cleanLoc = stripHtmlAndNormalizeWhitespace(locationName);
  const cleanCity = stripHtmlAndNormalizeWhitespace(cityName) || 'Kolkata';

  if (!cleanLoc) return cleanCity;

  const lower = cleanLoc.toLowerCase();
  const lowerCity = cleanCity.toLowerCase();

  // Never output "Kolkata, Kolkata" or "Rajarhat, Kolkata, Kolkata"
  if (
    lower === lowerCity ||
    lower.endsWith(`, ${lowerCity}`) ||
    lower.endsWith(` ${lowerCity}`)
  ) {
    return cleanLoc;
  }

  // Never output "West Bengal, Kolkata" for state-level pages
  if (lower === 'west bengal' || lower === 'west bengal, india' || lower === 'india') {
    return cleanLoc;
  }

  return `${cleanLoc}, ${cleanCity}`;
}

/**
 * Strips dangling trailing punctuation, connectors/prepositions, and split brand stubs
 * (e.g. "...with Great" when "Great Homes" was truncated mid-brand).
 */
function stripDanglingTail(candidate: string, originalFullText: string): string {
  let result = candidate.replace(/[\s,;:–—|\-/&+]+$/g, '').trim();
  if (!result) return '';

  // Detect clipped trailing "Great" that came from "Great Homes"
  if (/\bGreat$/i.test(result)) {
    const escaped = result.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`${escaped}\\s+Homes\\b`, 'i').test(originalFullText)) {
      result = result.replace(/\s*\bGreat$/i, '').replace(/[\s,;:–—|\-/&+]+$/g, '').trim();
    }
  }

  // Repeatedly pop trailing dangling conjunctions, prepositions, or articles
  const tokens = result.split(/\s+/).filter(Boolean);
  while (tokens.length > 3) {
    const lastRaw = tokens[tokens.length - 1];
    const lastNormalized = lastRaw.replace(/^[^a-z0-9&]+|[^a-z0-9&]+$/gi, '').toLowerCase();
    if (!lastNormalized || DANGLING_TRAILING_WORDS.has(lastNormalized)) {
      tokens.pop();
      continue;
    }
    break;
  }

  return tokens
    .join(' ')
    .replace(/[\s,;:–—|\-/&+]+$/g, '')
    .trim();
}

/**
 * Trims text strictly on word boundaries so meta titles and descriptions
 * are never sliced mid-word or left ending on dangling connectors.
 */
export function clampAtWordBoundary(
  input: string,
  maxLength: number,
  addEllipsis = false
): string {
  const clean = stripHtmlAndNormalizeWhitespace(input);
  if (clean.length <= maxLength) return clean;

  const effectiveMax = addEllipsis ? Math.max(10, maxLength - 1) : maxLength;
  const slice = clean.slice(0, effectiveMax);
  const nextChar = clean.charAt(effectiveMax);
  // Only keep the full slice if the cut landed cleanly on whitespace/punctuation
  const endsOnWordBoundary = !nextChar || /[\s.,;:!?()[\]"'–—|-]/.test(nextChar);
  const lastSpace = slice.lastIndexOf(' ');
  const rawCandidate = endsOnWordBoundary
    ? slice
    : lastSpace >= Math.floor(effectiveMax * 0.5)
      ? slice.slice(0, lastSpace)
      : slice;

  const trimmed = stripDanglingTail(rawCandidate, clean);
  if (!trimmed) return clean.slice(0, maxLength).trim();
  return addEllipsis ? `${trimmed}…` : trimmed;
}

/**
 * Detects empty, stub, test, or garbage metadata strings (e.g. "Dev", "csadcsac",
 * "Verified Great Homes resale listing.") so structured fallbacks take over cleanly.
 */
export function isGarbageOrTooShortDescription(
  rawText?: string | null,
  minLength = 45
): boolean {
  const clean = stripHtmlAndNormalizeWhitespace(rawText);
  if (!clean || clean.length < minLength) return true;

  const lower = clean.toLowerCase();
  if (GENERIC_PLACEHOLDER_DESCRIPTIONS.has(lower)) return true;

  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length < 5) return true;

  // Guard against keyboard-mash gibberish (single long token or almost no vowels)
  const alphaChars = clean.replace(/[^a-z]/gi, '');
  if (alphaChars.length >= 12) {
    const vowelCount = (alphaChars.match(/[aeiou]/gi) || []).length;
    if (vowelCount / alphaChars.length < 0.14) return true;
  }

  return false;
}

/**
 * Produces a clean, factual, word-boundary-clamped meta description in the 120–160 char sweet spot.
 */
export function sanitizeMetaDescription(
  rawDescription?: string | null,
  fallbackDescription?: string,
  options?: { minLength?: number; maxLength?: number }
): string {
  const minLength = options?.minLength ?? 45;
  const maxLength = options?.maxLength ?? 158;

  const cleanRaw = stripHtmlAndNormalizeWhitespace(rawDescription);
  const chosen = !isGarbageOrTooShortDescription(cleanRaw, minLength)
    ? cleanRaw
    : stripHtmlAndNormalizeWhitespace(fallbackDescription) ||
      'Discover verified residential projects, resale homes, and rentals across Kolkata with pricing intelligence and RERA verification on Great Homes.';

  if (chosen.length <= maxLength) {
    return chosen;
  }

  // 1. Prefer ending cleanly at a complete sentence within [max(minLength, 70), maxLength]
  const sentenceFloor = Math.max(minLength, Math.min(70, Math.floor(maxLength * 0.5)));
  const candidate = chosen.slice(0, maxLength);
  let bestSentenceEnd = -1;
  const sentenceBoundaryRegex = /[.!?](?=\s|$)/g;
  let match: RegExpExecArray | null;
  while ((match = sentenceBoundaryRegex.exec(candidate)) !== null) {
    if (match.index + 1 >= sentenceFloor) {
      bestSentenceEnd = match.index + 1;
    }
  }
  if (bestSentenceEnd !== -1) {
    return candidate.slice(0, bestSentenceEnd).trim();
  }

  // 2. Otherwise clamp cleanly at a word boundary, strip dangling tails, and close with a period
  const clamped = clampAtWordBoundary(chosen, Math.max(20, maxLength - 1), false);
  if (!clamped) {
    return clampAtWordBoundary(chosen, maxLength, false);
  }
  if (/[.!?]$/.test(clamped)) {
    return clamped;
  }
  return clamped.length + 1 <= maxLength ? `${clamped}.` : clamped;
}

/**
 * Resolves and validates a canonical URL onto `https://www.greathomes.co.in`.
 * - Normalizes legacy non-www `https://greathomes.co.in` -> `https://www.greathomes.co.in`
 * - Strips query parameters, hash fragments, and trailing slashes (except root)
 * - Rejects external domains or invalid prefixes, falling back to the route's default canonical
 */
export function normalizeCanonicalUrl(
  rawUrl: string | null | undefined,
  defaultPath: string,
  options?: { allowedPathPrefix?: string }
): string {
  const cleanDefaultPath = defaultPath.startsWith('/') ? defaultPath : `/${defaultPath}`;
  const fallback =
    cleanDefaultPath === '/'
      ? SITE_ORIGIN
      : `${SITE_ORIGIN}${cleanDefaultPath.replace(/\/+$/, '')}`;

  if (!rawUrl || typeof rawUrl !== 'string' || !rawUrl.trim()) {
    return fallback;
  }

  const trimmed = rawUrl.trim();
  try {
    const parsed = trimmed.startsWith('/')
      ? new URL(trimmed, SITE_ORIGIN)
      : new URL(trimmed);

    if (
      (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') ||
      !ALLOWED_CANONICAL_HOSTS.has(parsed.hostname.toLowerCase())
    ) {
      return fallback;
    }

    const cleanPath = parsed.pathname.replace(/\/+$/, '') || '/';
    if (
      options?.allowedPathPrefix &&
      !cleanPath.startsWith(options.allowedPathPrefix)
    ) {
      return fallback;
    }

    return cleanPath === '/' ? SITE_ORIGIN : `${SITE_ORIGIN}${cleanPath}`;
  } catch {
    return fallback;
  }
}

/**
 * Normalizes any media/image URL into an absolute `https://` URL safe for
 * OpenGraph, Twitter Cards, Schema.org JSON-LD, and XML `<image:loc>`.
 */
export function normalizeAbsoluteImageUrl(rawUrl?: string | null): string | null {
  const normalized = normalizeMediaPublicUrl(rawUrl);
  if (!normalized) return null;

  const trimmed = normalized.trim();
  if (
    !trimmed ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('blob:') ||
    trimmed.startsWith('javascript:')
  ) {
    return null;
  }

  if (/^https:\/\//i.test(trimmed)) {
    return trimmed;
  }

  if (/^http:\/\//i.test(trimmed)) {
    return trimmed.replace(/^http:\/\//i, 'https://');
  }

  if (trimmed.startsWith('//')) {
    return `https:${trimmed}`;
  }

  if (trimmed.startsWith('/')) {
    return `${SITE_ORIGIN}${trimmed}`;
  }

  return null;
}

/**
 * Returns true if the URL points to a known placeholder / random stock image host
 * (such as picsum.photos) that must not be emitted in SEO or editorial image tags.
 */
export function isPlaceholderImageUrl(rawUrl?: string | null): boolean {
  if (!rawUrl || typeof rawUrl !== 'string') return false;
  const trimmed = rawUrl.trim();
  if (!trimmed) return false;

  try {
    const parsed = trimmed.startsWith('//')
      ? new URL(`https:${trimmed}`)
      : trimmed.startsWith('/')
        ? new URL(trimmed, SITE_ORIGIN)
        : new URL(trimmed);
    const host = parsed.hostname.toLowerCase();
    if (PLACEHOLDER_IMAGE_HOSTS.has(host)) return true;
    for (const placeholderHost of PLACEHOLDER_IMAGE_HOSTS) {
      if (host.endsWith(`.${placeholderHost}`)) return true;
    }
    return false;
  } catch {
    return /(?:picsum\.photos|via\.placeholder\.com|placehold\.co|placekitten\.com|dummyimage\.com)/i.test(
      trimmed
    );
  }
}

/**
 * Resolves an editorial article/review image URL for OpenGraph, Twitter Cards,
 * Article JSON-LD, and editorial presentation:
 * 1. Valid existing non-placeholder absolute image URL
 * 2. Branded Great Homes default social image (`/og-image.png`)
 */
export function resolveEditorialSeoImage(rawUrl?: string | null): string {
  const normalized = normalizeAbsoluteImageUrl(rawUrl);
  if (!normalized || isPlaceholderImageUrl(normalized)) {
    return DEFAULT_OG_IMAGE;
  }
  return normalized;
}

/**
 * Formats verified BHK counts concisely (e.g., [2, 3] -> "2 & 3 BHK", [2, 3, 4] -> "2, 3 & 4 BHK", [1, 2, 3, 4] -> "1-4 BHK").
 */
export function formatVerifiedConfigurationSummary(
  configurations?: Array<{ bedroomCount?: number | null; configurationLabel?: string | null }> | null,
  propertyTypes?: string[] | null
): string | null {
  const distinctBhks = Array.from(
    new Set(
      (configurations || [])
        .map((c) => c.bedroomCount)
        .filter((n): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0 && n <= 10)
    )
  ).sort((a, b) => a - b);

  if (distinctBhks.length === 1) {
    return `${distinctBhks[0]} BHK`;
  }
  if (distinctBhks.length === 2) {
    return `${distinctBhks[0]} & ${distinctBhks[1]} BHK`;
  }
  if (distinctBhks.length === 3) {
    return `${distinctBhks[0]}, ${distinctBhks[1]} & ${distinctBhks[2]} BHK`;
  }
  if (distinctBhks.length >= 4) {
    return `${distinctBhks[0]}–${distinctBhks[distinctBhks.length - 1]} BHK`;
  }

  // Fallback to verified non-apartment property types (Plots / Villas / Bungalows)
  const types = (propertyTypes || []).map((t) => t.toUpperCase());
  if (types.includes('PLOT') || types.includes('RESIDENTIAL_PLOT')) {
    return 'Residential Plots';
  }
  if (types.includes('VILLA') || types.includes('BUNGALOW')) {
    return 'Villas';
  }
  if (types.includes('PENTHOUSE')) {
    return 'Penthouses';
  }

  return null;
}

export interface LockedProjectTitleInput {
  name: string;
  locationName?: string | null;
  configurations?: Array<{ bedroomCount?: number | null; configurationLabel?: string | null }> | null;
  propertyTypes?: string[] | null;
  hasPricing?: boolean;
  hasFloorPlans?: boolean;
  overrideTitle?: string | null;
}

/**
 * LOCKED PROJECT TITLE STRATEGY (Section 4 — Canonical)
 *
 * Formula: Project name + location + verified configuration + selective search intent + Great Homes branding
 * Example: "Merlin Rise in Rajarhat | 2 & 3 BHK, Price & Floor Plans | Great Homes"
 *
 * Precedence:
 * 1. Validated manual override (`project_seo.metaTitle`, >= 15 chars) normalized with single `| Great Homes` branding.
 * 2. Verified project data following the locked formula with graceful length discipline (target <= 74 chars).
 */
export function buildLockedProjectTitle(input: LockedProjectTitleInput): string {
  const cleanOverride = stripBrandSuffix(input.overrideTitle);
  if (cleanOverride && cleanOverride.length >= 15) {
    return formatBrandTitle(cleanOverride, { maxLength: 82 });
  }

  const projectName = stripHtmlAndNormalizeWhitespace(input.name) || 'Residential Project';
  const rawLocation = stripHtmlAndNormalizeWhitespace(input.locationName);
  const normalizedNameLower = projectName.toLowerCase();

  // Avoid repeating locality if project name already explicitly contains it (e.g. "Merlin Rise Rajarhat")
  const hasLocation =
    Boolean(rawLocation) && !normalizedNameLower.includes(rawLocation.toLowerCase());

  const subject = hasLocation ? `${projectName} in ${rawLocation}` : projectName;
  const configSummary = formatVerifiedConfigurationSummary(
    input.configurations,
    input.propertyTypes
  );

  const hasPricing = input.hasPricing !== false;
  const hasFloorPlans = input.hasFloorPlans !== false;

  // Build ordered candidates from richest selective-intent phrase to cleanest concise fallback
  const candidates: string[] = [];

  if (configSummary) {
    if (hasPricing && hasFloorPlans) {
      candidates.push(`${subject} | ${configSummary}, Price & Floor Plans | ${SITE_NAME}`);
    }
    if (hasPricing) {
      candidates.push(`${subject} | ${configSummary} & Price | ${SITE_NAME}`);
    }
    if (hasFloorPlans) {
      candidates.push(`${subject} | ${configSummary} Floor Plans | ${SITE_NAME}`);
    }
    candidates.push(`${subject} | ${configSummary} | ${SITE_NAME}`);
  } else {
    if (hasPricing && hasFloorPlans) {
      candidates.push(`${subject} | Price & Floor Plans | ${SITE_NAME}`);
    } else if (hasPricing) {
      candidates.push(`${subject} | Price & Details | ${SITE_NAME}`);
    }
  }

  candidates.push(`${subject} | ${SITE_NAME}`);

  // Choose the first candidate within clean SERP length (<= 74 chars)
  for (const candidate of candidates) {
    if (candidate.length <= 74) {
      return candidate;
    }
  }

  // If even `${subject} | Great Homes` is unusually long, clamp cleanly with single branding
  return formatBrandTitle(subject, { maxLength: 74 });
}

export interface ProjectDescriptionInput {
  name: string;
  locationName?: string | null;
  cityName?: string | null;
  developerName?: string | null;
  configurations?: Array<{ bedroomCount?: number | null; configurationLabel?: string | null }> | null;
  propertyTypes?: string[] | null;
  startingPriceFormatted?: string | null;
  hasVerifiedRera?: boolean;
  shortDescription?: string | null;
  overrideDescription?: string | null;
}

/**
 * Builds a factual, non-stuffed, word-boundary-clamped project meta description.
 * Precedence: validated `project_seo.metaDescription` -> structured verified data -> sanitized shortDescription.
 */
export function buildProjectMetaDescription(input: ProjectDescriptionInput): string {
  const cleanOverride = stripHtmlAndNormalizeWhitespace(input.overrideDescription);
  if (!isGarbageOrTooShortDescription(cleanOverride, 50)) {
    return sanitizeMetaDescription(cleanOverride, undefined, { maxLength: 158 });
  }

  const projectName = stripHtmlAndNormalizeWhitespace(input.name) || 'This project';
  const locWithCity = formatLocationWithCity(input.locationName, input.cityName || 'Kolkata');
  const configSummary = formatVerifiedConfigurationSummary(
    input.configurations,
    input.propertyTypes
  );
  const devName = stripHtmlAndNormalizeWhitespace(input.developerName);

  const byDev = devName ? ` by ${devName}` : '';
  const configPhrase = configSummary
    ? /\bBHK\b/i.test(configSummary)
      ? ` offering ${configSummary} homes`
      : ` offering ${configSummary.toLowerCase()}`
    : '';
  const pricePhrase = input.startingPriceFormatted
    ? ` starting from ${input.startingPriceFormatted}`
    : '';
  const reraPhrase = input.hasVerifiedRera ? ' WBRERA verified details.' : '';
  const leadWithDev = `Explore ${projectName}${byDev} in ${locWithCity}${configPhrase}${pricePhrase}.`;
  const leadCompact = `Explore ${projectName} in ${locWithCity}${configPhrase}${pricePhrase}.`;
  const leadCore = `Explore ${projectName} in ${locWithCity}${configPhrase}.`;
  const leadMinimal = `Explore ${projectName} in ${locWithCity}.`;

  // Ordered complete-sentence candidates so descriptions stay concise & naturally punctuated within 158 chars
  const candidates = [
    `${leadWithDev} Check floor plans, amenities, possession & pricing on Great Homes.${reraPhrase}`,
    `${leadWithDev} Check floor plans, amenities & pricing on Great Homes.${reraPhrase}`,
    `${leadWithDev} Check floor plans, amenities & pricing on Great Homes.`,
    `${leadCompact} Check floor plans, amenities & pricing on Great Homes.`,
    `${leadCore} Check floor plans, amenities, possession & pricing on Great Homes.`,
    `${leadMinimal} Check floor plans, amenities & pricing on Great Homes.`,
  ];

  for (const candidate of candidates) {
    if (candidate.length <= 158) {
      return candidate;
    }
  }

  return sanitizeMetaDescription(leadCompact, input.shortDescription || leadMinimal, {
    maxLength: 158,
  });
}

export interface BuildPageMetadataInput {
  title: string;
  description: string;
  canonicalPath: string;
  canonicalUrl?: string | null;
  allowedCanonicalPrefix?: string;
  includeBrand?: boolean;
  index?: boolean;
  follow?: boolean;
  ogType?: 'website' | 'article' | 'profile';
  ogImage?: string | null;
  ogImageAlt?: string;
  publishedTime?: string;
  modifiedTime?: string;
  authors?: string[];
  omitCanonical?: boolean;
}

/**
 * Single authoritative builder for Next.js Metadata across all Great Homes routes.
 * Guarantees synchronized title, description, canonical, robots, OpenGraph, and Twitter tags
 * so child pages NEVER leak homepage social metadata.
 */
export function buildPageMetadata(input: BuildPageMetadataInput): Metadata {
  const formattedTitle = formatBrandTitle(input.title, {
    includeBrand: input.includeBrand ?? true,
    maxLength: 82,
  });

  const cleanDescription = sanitizeMetaDescription(input.description, input.description, {
    minLength: 20,
    maxLength: 158,
  });

  const canonical = normalizeCanonicalUrl(input.canonicalUrl, input.canonicalPath, {
    allowedPathPrefix: input.allowedCanonicalPrefix,
  });

  const index = input.index !== false;
  const follow = input.follow !== false;
  const normalizedOgImage = normalizeAbsoluteImageUrl(input.ogImage);
  const resolvedImage =
    normalizedOgImage && !isPlaceholderImageUrl(normalizedOgImage)
      ? normalizedOgImage
      : DEFAULT_OG_IMAGE;

  const openGraphBase: NonNullable<Metadata['openGraph']> = {
    title: formattedTitle,
    description: cleanDescription,
    url: canonical,
    siteName: SITE_NAME,
    locale: 'en_IN',
    type: input.ogType || 'website',
    images: [
      {
        url: resolvedImage,
        ...(resolvedImage === DEFAULT_OG_IMAGE ? { width: 1200, height: 630 } : {}),
        alt: input.ogImageAlt || stripBrandSuffix(formattedTitle),
      },
    ],
    ...(input.ogType === 'article' && input.publishedTime
      ? { publishedTime: input.publishedTime }
      : {}),
    ...(input.ogType === 'article' && input.modifiedTime
      ? { modifiedTime: input.modifiedTime }
      : {}),
    ...(input.ogType === 'article' && input.authors?.length
      ? { authors: input.authors }
      : {}),
  };

  return {
    title: formattedTitle,
    description: cleanDescription,
    ...(input.omitCanonical ? {} : { alternates: { canonical } }),
    robots: {
      index,
      follow,
    },
    openGraph: openGraphBase,
    twitter: {
      card: 'summary_large_image',
      title: formattedTitle,
      description: cleanDescription,
      images: [resolvedImage],
    },
  };
}

/**
 * Standardized `noindex, nofollow` metadata for private, operational, utility, and 404 routes.
 */
export function buildNoIndexMetadata(
  title: string,
  description: string,
  options?: { follow?: boolean }
): Metadata {
  const formattedTitle = formatBrandTitle(title, { includeBrand: true, maxLength: 78 });
  const cleanDescription = sanitizeMetaDescription(description, description, {
    minLength: 15,
    maxLength: 158,
  });

  return {
    title: formattedTitle,
    description: cleanDescription,
    robots: {
      index: false,
      follow: options?.follow ?? false,
    },
    openGraph: {
      title: formattedTitle,
      description: cleanDescription,
      siteName: SITE_NAME,
      locale: 'en_IN',
      type: 'website',
    },
    twitter: {
      card: 'summary',
      title: formattedTitle,
      description: cleanDescription,
    },
  };
}
