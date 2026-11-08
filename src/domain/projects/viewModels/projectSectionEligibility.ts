import { PublicResaleListingDto } from '../dto/resaleDto';
import { PublicRentalListingDto } from '../dto/rentalDto';
import { PublicProjectMediaDto, PublicProjectAmenityDto } from '../dto/projectDto';
import { parseVideoUrl } from '@/src/lib/videoUtils';

/**
 * Filters project resale listings to only eligible, published records belonging
 * to the specified project with valid configuration and asking price.
 */
export function getEligibleResaleListings(
  listings?: PublicResaleListingDto[] | null,
  projectId?: string
): PublicResaleListingDto[] {
  if (!listings || !Array.isArray(listings)) return [];
  const seen = new Set<string>();
  const eligible: PublicResaleListingDto[] = [];

  for (const l of listings) {
    if (!l || !l.id) continue;
    if (seen.has(l.id)) continue;

    // Check project association
    const listingProjectId =
      (l as { projectId?: string | null }).projectId ?? l.project?.id;
    if (projectId && listingProjectId !== projectId) continue;

    // Check configuration (handles both string e.g. "3 BHK" and object e.g. { bhkCount: 3 })
    const rawConfig = l.configuration as unknown;
    let hasConfig = false;
    if (typeof rawConfig === 'string') {
      hasConfig = rawConfig.trim().length > 0;
    } else if (rawConfig && typeof rawConfig === 'object') {
      const cfg = rawConfig as { bhkCount?: number; configurationLabel?: string; carpetAreaSqft?: number };
      hasConfig = Boolean(
        (typeof cfg.bhkCount === 'number' && cfg.bhkCount > 0) ||
        (typeof cfg.configurationLabel === 'string' && cfg.configurationLabel.trim().length > 0) ||
        (typeof cfg.carpetAreaSqft === 'number' && cfg.carpetAreaSqft > 0)
      );
    }
    if (!hasConfig && typeof l.bedroomCount === 'number' && l.bedroomCount > 0) {
      hasConfig = true;
    }
    if (!hasConfig) continue;

    // Check asking price (handles top-level askingPrice or nested pricing.askingPrice)
    const rawPricing = (l as { pricing?: { askingPrice?: number } }).pricing;
    const askingPrice =
      typeof l.askingPrice === 'number'
        ? l.askingPrice
        : typeof rawPricing?.askingPrice === 'number'
          ? rawPricing.askingPrice
          : 0;

    if (!Number.isFinite(askingPrice) || askingPrice <= 0) continue;

    seen.add(l.id);
    eligible.push(l);
  }

  return eligible;
}

/**
 * Filters project rental listings to only eligible, published records belonging
 * to the specified project with valid configuration and monthly rent.
 */
export function getEligibleRentalListings(
  listings?: PublicRentalListingDto[] | null,
  projectId?: string
): PublicRentalListingDto[] {
  if (!listings || !Array.isArray(listings)) return [];
  const seen = new Set<string>();
  const eligible: PublicRentalListingDto[] = [];

  for (const l of listings) {
    if (!l || !l.id) continue;
    if (seen.has(l.id)) continue;

    const listingProjectId =
      l.projectId ?? (l as { project?: { id?: string } }).project?.id;
    if (projectId && listingProjectId !== projectId) continue;

    // Check configuration (handles both string e.g. "2 BHK" and object e.g. { bhkCount: 2 })
    const rawConfig = l.configuration as unknown;
    let hasConfig = false;
    if (typeof rawConfig === 'string') {
      hasConfig = rawConfig.trim().length > 0;
    } else if (rawConfig && typeof rawConfig === 'object') {
      const cfg = rawConfig as { bhkCount?: number; configurationLabel?: string; carpetAreaSqft?: number };
      hasConfig = Boolean(
        (typeof cfg.bhkCount === 'number' && cfg.bhkCount > 0) ||
        (typeof cfg.configurationLabel === 'string' && cfg.configurationLabel.trim().length > 0) ||
        (typeof cfg.carpetAreaSqft === 'number' && cfg.carpetAreaSqft > 0)
      );
    }
    if (!hasConfig && typeof l.bedroomCount === 'number' && l.bedroomCount > 0) {
      hasConfig = true;
    }
    if (!hasConfig) continue;

    // Check monthly rent (handles top-level monthlyRent or nested pricing.monthlyRent)
    const rawPricing = (l as { pricing?: { monthlyRent?: number } }).pricing;
    const monthlyRent =
      typeof l.monthlyRent === 'number'
        ? l.monthlyRent
        : typeof rawPricing?.monthlyRent === 'number'
          ? rawPricing.monthlyRent
          : 0;

    if (!Number.isFinite(monthlyRent) || monthlyRent <= 0) continue;

    seen.add(l.id);
    eligible.push(l);
  }

  return eligible;
}

/**
 * Filters project media to only eligible image gallery items, excluding empty URLs,
 * video embeds, and walkthrough/floor-plan/master-plan/construction items.
 */
export function getEligibleGalleryMedia(
  mediaList?: PublicProjectMediaDto[] | null
): PublicProjectMediaDto[] {
  if (!mediaList || !Array.isArray(mediaList)) return [];
  const seen = new Set<string>();
  const eligible: PublicProjectMediaDto[] = [];

  for (const m of mediaList) {
    if (!m || !m.url || !m.url.trim()) continue;
    const trimmedUrl = m.url.trim();
    if (seen.has(trimmedUrl)) continue;

    const cat = (m.category || '').toUpperCase();
    const mType = (m.mediaType || '').toUpperCase();
    const isExcludedCategory = ['FLOOR_PLANS', 'MASTER_PLAN', 'CONSTRUCTION', 'WALKTHROUGH', 'BROCHURE'].includes(cat);
    const isVideoOrDoc =
      parseVideoUrl(trimmedUrl).isValid ||
      mType === 'VIDEO' ||
      mType === 'WALKTHROUGH' ||
      mType === 'DOCUMENT' ||
      trimmedUrl.toLowerCase().endsWith('.pdf');

    if (isExcludedCategory || isVideoOrDoc) continue;

    seen.add(trimmedUrl);
    eligible.push(m);
  }

  return eligible;
}

/**
 * Filters project amenities to only non-empty, deduplicated records.
 */
export function getEligibleAmenities(
  amenities?: PublicProjectAmenityDto[] | null
): PublicProjectAmenityDto[] {
  if (!amenities || !Array.isArray(amenities)) return [];
  const seen = new Set<string>();
  const result: PublicProjectAmenityDto[] = [];

  for (const a of amenities) {
    if (!a || !a.name || !a.name.trim()) continue;
    const key = `${(a.category || 'GENERAL').trim().toUpperCase()}::${a.name.trim().toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(a);
  }

  return result;
}
