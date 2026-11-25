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

const KNOWN_R2_HOSTS = new Set([
  'media.greathomes.co.in',
  'pub-8e680bcad96e4b29adac1756755a344b.r2.dev',
]);

const PLACEHOLDER_MEDIA_HOSTS = new Set([
  'picsum.photos',
  'fastly.picsum.photos',
  'via.placeholder.com',
  'placehold.co',
  'placehold.it',
  'placekitten.com',
  'dummyimage.com',
]);

const LEGACY_MEDIA_HOSTS = new Set([
  'propvestors.in',
  'www.propvestors.in',
]);

export type MediaOriginCategory =
  | 'VERIFIED_R2'
  | 'CUSTOM_MEDIA_DOMAIN'
  | 'FIRST_PARTY_SITE'
  | 'LOCAL_PATH'
  | 'EXTERNAL_STOCK'
  | 'EXTERNAL_VIDEO'
  | 'PLACEHOLDER'
  | 'LEGACY_EXTERNAL'
  | 'OTHER_EXTERNAL'
  | 'INVALID';

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
    const normalizedLower = configuredBase.toLowerCase();
    const isUnverifiedCustomDomain =
      (normalizedLower === 'https://media.greathomes.co.in' ||
        normalizedLower === 'http://media.greathomes.co.in') &&
      !customDomainVerified;

    if (!isUnverifiedCustomDomain) {
      return configuredBase.replace(/^http:\/\//i, 'https://');
    }
  }

  return VERIFIED_R2_PUBLIC_BASE_URL;
}

/**
 * Classifies a media URL into its canonical origin category for SEO & media governance checks.
 */
export function classifyMediaOrigin(url?: string | null): MediaOriginCategory {
  if (!url || typeof url !== 'string') return 'INVALID';
  const trimmed = url.trim();
  if (!trimmed || trimmed.startsWith('data:') || trimmed.startsWith('blob:') || trimmed.startsWith('javascript:')) {
    return 'INVALID';
  }

  if (trimmed.startsWith('/uploads/') || trimmed.startsWith('/assets/') || trimmed.startsWith('/og-image') || trimmed.startsWith('/icon')) {
    return 'LOCAL_PATH';
  }
  if (trimmed.startsWith('media/') || trimmed.startsWith('/media/')) {
    return 'VERIFIED_R2';
  }

  try {
    const parsed = trimmed.startsWith('//')
      ? new URL(`https:${trimmed}`)
      : trimmed.startsWith('/')
        ? new URL(trimmed, 'https://www.greathomes.co.in')
        : new URL(trimmed);

    const host = parsed.hostname.toLowerCase();
    if (host === 'pub-8e680bcad96e4b29adac1756755a344b.r2.dev' || host.endsWith('.r2.dev') || host.endsWith('.r2.cloudflarestorage.com')) {
      return 'VERIFIED_R2';
    }
    if (host === 'media.greathomes.co.in') {
      return 'CUSTOM_MEDIA_DOMAIN';
    }
    if (host === 'www.greathomes.co.in' || host === 'greathomes.co.in') {
      return 'FIRST_PARTY_SITE';
    }
    if (PLACEHOLDER_MEDIA_HOSTS.has(host) || Array.from(PLACEHOLDER_MEDIA_HOSTS).some((h) => host.endsWith(`.${h}`))) {
      return 'PLACEHOLDER';
    }
    if (LEGACY_MEDIA_HOSTS.has(host) || Array.from(LEGACY_MEDIA_HOSTS).some((h) => host.endsWith(`.${h}`))) {
      return 'LEGACY_EXTERNAL';
    }
    if (host === 'images.unsplash.com') {
      return 'EXTERNAL_STOCK';
    }
    if (host === 'img.youtube.com' || host === 'i.ytimg.com' || host.endsWith('.vimeocdn.com')) {
      return 'EXTERNAL_VIDEO';
    }
    return 'OTHER_EXTERNAL';
  } catch {
    return 'INVALID';
  }
}

/**
 * Returns true if the URL resolves to an approved first-party Great Homes media origin
 * (verified Cloudflare R2 bucket, verified custom media domain, canonical site asset, or local static/upload path).
 */
export function isApprovedFirstPartyMediaUrl(url?: string | null): boolean {
  const category = classifyMediaOrigin(url);
  return (
    category === 'VERIFIED_R2' ||
    category === 'CUSTOM_MEDIA_DOMAIN' ||
    category === 'FIRST_PARTY_SITE' ||
    category === 'LOCAL_PATH'
  );
}

/**
 * Normalizes any stored or incoming media URL into a deliverable public URL:
 * 1. Safely returns `null` for `null`, `undefined`, non-string, or empty values.
 * 2. Rewrites `media.greathomes.co.in`, `pub-8e680bcad96e4b29adac1756755a344b.r2.dev`,
 *    protocol-relative R2 URLs, and direct `*.r2.cloudflarestorage.com` object URLs
 *    to the active verified R2 public base URL while preserving the exact object key.
 * 3. Resolves bare/leading-slash R2 storage keys (`media/...`, `/media/...`) to the active R2 public base URL.
 * 4. Normalizes non-www `http(s)://greathomes.co.in/...` static asset URLs to `https://www.greathomes.co.in/...`.
 * 5. Preserves local `/uploads/...` URLs without inventing missing files.
 * 6. Preserves external URLs (`https://images.unsplash.com/...`, video links, data URIs).
 */
export function normalizeMediaPublicUrl(url?: string | null): string | null {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  const activeBase = getActiveMediaPublicBaseUrl();

  // Handle bare or leading-slash R2 object keys (e.g. "media/project/..." or "/media/project/...")
  if (trimmed.startsWith('media/') || trimmed.startsWith('/media/')) {
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

  // Normalize absolute or protocol-relative URLs for known R2 and canonical first-party hosts
  if (/^(?:https?:)?\/\//i.test(trimmed)) {
    try {
      const parsed = trimmed.startsWith('//') ? new URL(`https:${trimmed}`) : new URL(trimmed);
      const host = parsed.hostname.toLowerCase();

      if (KNOWN_R2_HOSTS.has(host)) {
        const remainder = parsed.pathname.replace(/^\/+/, '');
        return remainder ? `${activeBase}/${remainder}` : activeBase;
      }

      // Rewrite direct Cloudflare R2 S3 API URLs (e.g. https://<acct>.r2.cloudflarestorage.com/<bucket>/media/...)
      if (host.endsWith('.r2.cloudflarestorage.com')) {
        const mediaIdx = parsed.pathname.indexOf('/media/');
        if (mediaIdx !== -1) {
          const objectKey = parsed.pathname.slice(mediaIdx + 1).replace(/^\/+/, '');
          return `${activeBase}/${objectKey}`;
        }
      }

      // Canonicalize apex or http greathomes.co.in static assets onto https://www.greathomes.co.in
      if (host === 'greathomes.co.in' || (host === 'www.greathomes.co.in' && parsed.protocol === 'http:')) {
        return `https://www.greathomes.co.in${parsed.pathname}${parsed.search}`;
      }
    } catch {
      // Fall through to returning trimmed URL safely
    }
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

