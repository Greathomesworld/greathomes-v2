/**
 * Canonical media URL resolution and normalization utilities for Great Homes V2.
 *
 * Bridges the verified Cloudflare R2 public endpoint and the target custom media
 * hostname (`https://media.greathomes.co.in`) while preserving exact object keys,
 * local `/uploads/...` paths, and external third-party URLs.
 */

export const VERIFIED_R2_PUBLIC_BASE_URL =
  'https://pub-8e680bcad96e4b29adac1756755a344b.r2.dev';

export const TARGET_CUSTOM_MEDIA_DOMAIN = 'https://media.greathomes.co.in';

const KNOWN_R2_ORIGINS = [
  'https://media.greathomes.co.in',
  'http://media.greathomes.co.in',
  'https://pub-8e680bcad96e4b29adac1756755a344b.r2.dev',
  'http://pub-8e680bcad96e4b29adac1756755a344b.r2.dev',
];

/**
 * Returns the active public base URL for Cloudflare R2 media delivery.
 *
 * Because `MEDIA_PUBLIC_BASE_URL` may be pre-configured to `https://media.greathomes.co.in`
 * before Cloudflare R2 Custom Domain DNS routing is active, this resolver defaults to
 * `VERIFIED_R2_PUBLIC_BASE_URL` unless `MEDIA_CUSTOM_DOMAIN_VERIFIED === 'true'` is explicitly set
 * (or `MEDIA_PUBLIC_BASE_URL` points to another explicitly verified endpoint).
 */
export function getActiveMediaPublicBaseUrl(): string {
  const configuredBase = (
    process.env.MEDIA_PUBLIC_BASE_URL ||
    process.env.NEXT_PUBLIC_MEDIA_BASE_URL ||
    ''
  )
    .trim()
    .replace(/\/+$/, '');

  const customDomainVerified =
    process.env.MEDIA_CUSTOM_DOMAIN_VERIFIED === 'true' ||
    process.env.NEXT_PUBLIC_MEDIA_CUSTOM_DOMAIN_VERIFIED === 'true';

  if (configuredBase) {
    const isUnverifiedCustomDomain =
      (configuredBase === 'https://media.greathomes.co.in' ||
        configuredBase === 'http://media.greathomes.co.in') &&
      !customDomainVerified;

    if (!isUnverifiedCustomDomain) {
      return configuredBase;
    }
  }

  return VERIFIED_R2_PUBLIC_BASE_URL;
}

/**
 * Normalizes any stored or incoming media URL into a deliverable public URL:
 * 1. Safely returns `null` for `null`, `undefined`, non-string, or empty values.
 * 2. Rewrites `media.greathomes.co.in` and `pub-8e680bcad96e4b29adac1756755a344b.r2.dev`
 *    origins to the active verified R2 public base URL while preserving the exact object key.
 * 3. Resolves bare R2 storage keys (`media/...`) to the active R2 public base URL.
 * 4. Preserves local `/uploads/...` URLs without inventing missing files.
 * 5. Preserves external URLs (`https://images.unsplash.com/...`, video links, data URIs).
 */
export function normalizeMediaPublicUrl(url?: string | null): string | null {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  const activeBase = getActiveMediaPublicBaseUrl();

  for (const origin of KNOWN_R2_ORIGINS) {
    if (trimmed === origin || trimmed.startsWith(`${origin}/`)) {
      const remainder = trimmed.slice(origin.length).replace(/^\/+/, '');
      return remainder ? `${activeBase}/${remainder}` : activeBase;
    }
  }

  // Handle bare R2 object keys (e.g. "media/project/<id>/<assetId>/public_wm.webp")
  if (trimmed.startsWith('media/')) {
    const cleanKey = trimmed.replace(/^\/+/, '');
    return `${activeBase}/${cleanKey}`;
  }

  // Preserve local /uploads/... paths while normalizing accidental leading double slashes
  if (trimmed.startsWith('/uploads/') || trimmed.startsWith('//uploads/')) {
    return `/${trimmed.replace(/^\/+/, '')}`;
  }
  if (trimmed.startsWith('uploads/')) {
    return `/${trimmed}`;
  }

  return trimmed;
}

/**
 * Normalizes all URL fields on a media asset or entity-media object without
 * mutating `storageKey` or non-URL metadata.
 */
export function normalizeMediaAssetUrls<T extends Record<string, any>>(asset: T): T {
  if (!asset || typeof asset !== 'object') return asset;

  const normalized: Record<string, any> = { ...asset };

  if (typeof normalized.url === 'string') {
    normalized.url = normalizeMediaPublicUrl(normalized.url) || normalized.url;
  }
  if (typeof normalized.originalUrl === 'string') {
    normalized.originalUrl =
      normalizeMediaPublicUrl(normalized.originalUrl) || normalized.originalUrl;
  }
  if (typeof normalized.thumbnailUrl === 'string') {
    normalized.thumbnailUrl =
      normalizeMediaPublicUrl(normalized.thumbnailUrl) || normalized.thumbnailUrl;
  }
  if (typeof normalized.webpUrl === 'string') {
    normalized.webpUrl = normalizeMediaPublicUrl(normalized.webpUrl) || normalized.webpUrl;
  }
  if (typeof normalized.avifUrl === 'string') {
    normalized.avifUrl = normalizeMediaPublicUrl(normalized.avifUrl) || normalized.avifUrl;
  }
  if (typeof normalized.watermarkedUrl === 'string') {
    normalized.watermarkedUrl =
      normalizeMediaPublicUrl(normalized.watermarkedUrl) || normalized.watermarkedUrl;
  }

  if (normalized.variants && typeof normalized.variants === 'object') {
    const v = { ...normalized.variants };
    if (typeof v.original === 'string') {
      v.original = normalizeMediaPublicUrl(v.original) || v.original;
    }
    if (typeof v.webp === 'string') {
      v.webp = normalizeMediaPublicUrl(v.webp) || v.webp;
    }
    if (typeof v.avif === 'string') {
      v.avif = normalizeMediaPublicUrl(v.avif) || v.avif;
    }
    if (typeof v.thumbnail === 'string') {
      v.thumbnail = normalizeMediaPublicUrl(v.thumbnail) || v.thumbnail;
    }
    if (typeof v.watermarkedWebp === 'string') {
      v.watermarkedWebp = normalizeMediaPublicUrl(v.watermarkedWebp) || v.watermarkedWebp;
    }
    if (typeof v.publicUrl === 'string') {
      v.publicUrl = normalizeMediaPublicUrl(v.publicUrl) || v.publicUrl;
    }
    normalized.variants = v;
  }

  return normalized as T;
}

