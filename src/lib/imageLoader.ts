export interface ImageLoaderProps {
  src: string;
  width: number;
  quality?: number;
}

const R2_PUBLIC_BASE = 'https://pub-8e680bcad96e4b29adac1756755a344b.r2.dev';
const FALLBACK_PROJECT_IMAGE =
  '/uploads/media/project/f09fdaff-63f0-4783-9d82-1acc642460bb/cfb31520-cda5-4060-ac01-01ffd76d8179/public_wm.webp';

/**
 * Custom Next.js Image Loader that resolves responsive image URLs directly
 * against edge CDNs (Unsplash, Cloudflare R2, local static/fallback routes)
 * without proxying outbound fetches through the Node.js server process,
 * preventing upstream ECONNRESET / timeout crashes on `/_next/image`.
 */
export default function greatHomesImageLoader({
  src,
  width,
  quality,
}: ImageLoaderProps): string {
  const q = quality || 75;

  if (!src || typeof src !== 'string') {
    return `${FALLBACK_PROJECT_IMAGE}?w=${width}&q=${q}`;
  }

  let normalizedSrc = src.trim();

  // Rewrite legacy custom media domain to the active Cloudflare R2 public bucket
  if (normalizedSrc.startsWith('https://media.greathomes.co.in/')) {
    normalizedSrc = normalizedSrc.replace(
      'https://media.greathomes.co.in/',
      `${R2_PUBLIC_BASE}/`
    );
  } else if (normalizedSrc.startsWith('https://cdn.greathomes.in/')) {
    normalizedSrc = FALLBACK_PROJECT_IMAGE;
  }

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

  const separator = normalizedSrc.includes('?') ? '&' : '?';
  return `${normalizedSrc}${separator}w=${width}&q=${q}`;
}
