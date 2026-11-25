import { isApprovedFirstPartyMediaUrl, normalizeMediaPublicUrl } from '@/src/lib/mediaUtils';

export interface ImageLoaderProps {
  src: string;
  width: number;
  quality?: number;
}

/**
 * Custom Next.js Image Loader that resolves responsive image URLs directly
 * against edge CDNs (Cloudflare R2, Unsplash, local static/upload routes)
 * via the canonical `normalizeMediaPublicUrl()` resolver without proxying
 * outbound fetches through `/_next/image`.
 */
export default function greatHomesImageLoader({
  src,
  width,
  quality,
}: ImageLoaderProps): string {
  const q = quality || 75;

  if (!src || typeof src !== 'string') {
    return '';
  }

  const trimmed = src.trim();
  if (!trimmed) {
    return '';
  }

  // Pass data/blob URIs through untouched
  if (trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
    return trimmed;
  }

  const normalizedSrc = normalizeMediaPublicUrl(trimmed) || trimmed;

  // Optimize Unsplash images directly via Unsplash's native Imgix CDN parameters
  if (normalizedSrc.startsWith('https://images.unsplash.com/')) {
    try {
      const url = new URL(normalizedSrc);
      url.searchParams.set('auto', 'format');
      if (!url.searchParams.has('fit')) {
        url.searchParams.set('fit', 'crop');
      }
      url.searchParams.set('w', String(width));
      url.searchParams.set('q', String(q));
      return url.toString();
    } catch {
      const sep = normalizedSrc.includes('?') ? '&' : '?';
      return `${normalizedSrc}${sep}w=${width}&q=${q}`;
    }
  }

  // Static Cloudflare R2 objects and first-party static assets ignore ?w=&q= query strings;
  // returning the canonical URL prevents unnecessary CDN/browser cache fragmentation.
  if (isApprovedFirstPartyMediaUrl(normalizedSrc)) {
    return normalizedSrc;
  }

  // Avoid appending duplicate w/q parameters for other external image CDNs
  if (normalizedSrc.startsWith('http://') || normalizedSrc.startsWith('https://')) {
    try {
      const parsed = new URL(normalizedSrc);
      parsed.searchParams.set('w', String(width));
      parsed.searchParams.set('q', String(q));
      return parsed.toString();
    } catch {
      const separator = normalizedSrc.includes('?') ? '&' : '?';
      return `${normalizedSrc}${separator}w=${width}&q=${q}`;
    }
  }

  return normalizedSrc;
}

