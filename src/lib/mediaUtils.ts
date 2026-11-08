/**
 * Shared media URL normalization utility for Great Homes V2.
 * 
 * Maps inactive or legacy custom CDN endpoints (such as media.greathomes.co.in)
 * to verified, active Cloudflare R2 bucket endpoints, ensuring authentic assets
 * resolve reliably across all clients.
 */
export function normalizeMediaPublicUrl(url?: string | null): string | null {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  // Resolve legacy/unrouted media.greathomes.co.in domain to verified active Cloudflare R2 public bucket
  if (trimmed.startsWith('https://media.greathomes.co.in/')) {
    return trimmed.replace(
      'https://media.greathomes.co.in/',
      'https://pub-8e680bcad96e4b29adac1756755a344b.r2.dev/'
    );
  }

  return trimmed;
}
