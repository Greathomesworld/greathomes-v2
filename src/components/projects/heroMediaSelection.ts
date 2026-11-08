import { PublicProjectMediaDto } from '@/src/domain/projects/dto/projectDto';
import { parseVideoUrl } from '@/src/lib/videoUtils';

export interface HeroMediaSelectionResult {
  heroMedia: PublicProjectMediaDto | null;
  suitableMediaList: PublicProjectMediaDto[];
  heroIndex: number;
}

export const EXCLUDED_HERO_CATEGORIES = new Set([
  'FLOOR_PLANS',
  'MASTER_PLAN',
  'CONSTRUCTION',
  'WALKTHROUGH',
  'BROCHURE',
]);

/**
 * Selects the canonical hero media according to Great Homes Phase 05E.2 priority:
 * 1. Featured Exterior media
 * 2. Featured project media (excluding floor plans, master plans, construction, walkthroughs/videos, brochures)
 * 3. First Exterior media
 * 4. First suitable project media
 * 5. Fallback visual (heroMedia: null)
 */
export function selectHeroMedia(mediaList: PublicProjectMediaDto[] = []): HeroMediaSelectionResult {
  if (!Array.isArray(mediaList) || mediaList.length === 0) {
    return {
      heroMedia: null,
      suitableMediaList: [],
      heroIndex: -1,
    };
  }

  // Filter out non-hero categories, video/document URLs, and empty URLs
  const suitableMediaList = mediaList.filter(m => {
    if (!m || !m.url || m.url.trim().length === 0) return false;
    const category = (m.category || '').toUpperCase();
    const mediaType = (m.mediaType || '').toUpperCase();
    if (EXCLUDED_HERO_CATEGORIES.has(category) || mediaType === 'VIDEO' || mediaType === 'DOCUMENT') {
      return false;
    }
    if (m.url.toLowerCase().endsWith('.pdf')) {
      return false;
    }
    if (parseVideoUrl(m.url).isValid) {
      return false;
    }
    return true;
  });

  if (suitableMediaList.length === 0) {
    return {
      heroMedia: null,
      suitableMediaList: [],
      heroIndex: -1,
    };
  }

  // Priority 1: Featured Exterior
  let chosen = suitableMediaList.find(m => m.isFeatured && m.category === 'EXTERIOR');

  // Priority 2: Featured suitable media
  if (!chosen) {
    chosen = suitableMediaList.find(m => m.isFeatured);
  }

  // Priority 3: First Exterior media
  if (!chosen) {
    chosen = suitableMediaList.find(m => m.category === 'EXTERIOR');
  }

  // Priority 4: First suitable project media
  if (!chosen) {
    chosen = suitableMediaList[0];
  }

  const heroIndex = chosen
    ? suitableMediaList.findIndex(m => (m.id && chosen!.id ? m.id === chosen!.id : m.url === chosen!.url))
    : -1;

  return {
    heroMedia: chosen || null,
    suitableMediaList,
    heroIndex: heroIndex >= 0 ? heroIndex : 0,
  };
}
