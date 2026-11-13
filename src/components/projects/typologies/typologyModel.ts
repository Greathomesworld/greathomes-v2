import {
  PublicProjectConfigurationDto,
  PublicProjectMediaDto,
  getConfigurationCardAreaInfo,
  formatStartingPrice,
  sortConfigurations,
} from '@/src/domain/projects/dto/projectDto';
import { PriceBasis } from '@/src/domain/projects/entities';

/**
 * Future Floor Plan Viewer Contract definition (Phase 05F.5.A foundation)
 */
export interface OpenFloorPlansParams {
  projectId: string;
  configurationId?: string;
  initialMediaId?: string;
}

/**
 * Clean Frontend View Model for a Project Configuration
 * Derived purely from the PublicProjectConfigurationDto and media list.
 */
export interface ProjectConfigurationViewModel {
  id: string;
  projectId?: string;
  name: string;
  typologyCategory: string; // Dynamic typology category (e.g. "1 BHK", "2 BHK", "2.5 BHK", "3 BHK", "Penthouse")
  bedroomCount: number | null;
  carpetArea: number | null;
  builtUpArea: number | null;
  superBuiltUpArea: number | null;
  startingPrice: number;
  startingPriceFormatted: string;
  priceOnRequest: boolean;
  priceBasis: PriceBasis;
  effectivePricePerSqft: number | null;
  rateDisplay: string | null; // e.g. "₹8,450/sq.ft. · Carpet"
  rateBasisLabel: string; // "Carpet", "Built-up", or "Super Built-up"
  hasRate: boolean;
  carpetAreaDisplay: string | null;
  secondaryAreaLabel: string | null;
  secondaryAreaDisplay: string | null;
  floorPlans: PublicProjectMediaDto[];
  floorPlanCount: number;
  hasFloorPlans: boolean;
  availability: string;
}

export type CanonicalConfigurationAvailability =
  | 'AVAILABLE'
  | 'LIMITED'
  | 'FEW_UNITS_LEFT'
  | 'ON_REQUEST'
  | 'SOLD_OUT'
  | 'NOT_AVAILABLE';

export interface ConfigurationAvailabilityBadgeInfo {
  status: CanonicalConfigurationAvailability;
  label: string;
  tone: 'available' | 'limited' | 'request' | 'sold_out';
}

const CANONICAL_AVAILABILITY_MAP: Record<
  CanonicalConfigurationAvailability,
  { label: string; tone: 'available' | 'limited' | 'request' | 'sold_out' }
> = {
  AVAILABLE: { label: 'Available', tone: 'available' },
  LIMITED: { label: 'Limited Units', tone: 'limited' },
  FEW_UNITS_LEFT: { label: 'Few Units Left', tone: 'limited' },
  ON_REQUEST: { label: 'On Request', tone: 'request' },
  SOLD_OUT: { label: 'Sold Out', tone: 'sold_out' },
  NOT_AVAILABLE: { label: 'Not Available', tone: 'sold_out' },
};

/**
 * Resolves a canonical configuration availability status to its display badge.
 * Never invents availability statuses or infers availability from price or floor plans.
 */
export function getConfigurationAvailabilityBadge(
  rawAvailability?: string | null
): ConfigurationAvailabilityBadgeInfo | null {
  if (!rawAvailability || typeof rawAvailability !== 'string') {
    return null;
  }
  const normalized = rawAvailability.trim().toUpperCase() as CanonicalConfigurationAvailability;
  const mapped = CANONICAL_AVAILABILITY_MAP[normalized];
  if (!mapped) {
    return null;
  }
  return {
    status: normalized,
    label: mapped.label,
    tone: mapped.tone,
  };
}

/**
 * Merges genuine configuration availability overrides onto canonical project configurations.
 * - Matches strictly by configurationId === config.id.
 * - Never allows synthetic fallback_<id> records or invalid statuses to overwrite canonical availability.
 * - Preserves each configuration's canonical availability when no explicit override exists.
 */
export function mergeConfigurationAvailabilityOverrides(
  configurations: PublicProjectConfigurationDto[] = [],
  overrides: Array<{
    id?: string | null;
    configurationId?: string | null;
    availabilityStatus?: string | null;
  }> = []
): PublicProjectConfigurationDto[] {
  if (!configurations || configurations.length === 0) return [];
  if (!overrides || overrides.length === 0) return configurations;

  const overrideMap = new Map<string, CanonicalConfigurationAvailability>();
  for (const record of overrides) {
    if (!record || !record.configurationId) continue;
    if (typeof record.id === 'string' && record.id.startsWith('fallback_')) {
      continue;
    }
    const badge = getConfigurationAvailabilityBadge(record.availabilityStatus);
    if (badge) {
      overrideMap.set(record.configurationId, badge.status);
    }
  }

  if (overrideMap.size === 0) return configurations;

  return configurations.map((cfg) => {
    const overrideStatus = overrideMap.get(cfg.id);
    return overrideStatus ? { ...cfg, availability: overrideStatus } : cfg;
  });
}

/**
 * Typology Filter item for dynamic client-side filtering
 */
export interface TypologyFilterItem {
  key: string;
  label: string;
  count: number;
}

/**
 * Extracts a normalized typology category string from configuration name/bedroomCount.
 * Strictly data-driven: matches any "N BHK" or "N.N BHK", or descriptive names like "Studio", "Duplex", "Penthouse", "Villa".
 */
export function extractTypologyCategory(config: PublicProjectConfigurationDto): string {
  // Check for any BHK pattern in the name (e.g., "1 BHK", "2 BHK", "2.5 BHK", "3 BHK", "4 BHK", "5 BHK")
  const bhkMatch = config.name.match(/(\d+(\.\d+)?)\s*BHK/i);
  if (bhkMatch) {
    return `${bhkMatch[1]} BHK`;
  }

  if (config.bedroomCount != null && config.bedroomCount > 0) {
    return `${config.bedroomCount} BHK`;
  }

  // Non-BHK categories: extract known words or clean the name
  const lower = config.name.toLowerCase();
  if (lower.includes('studio')) return 'Studio';
  if (lower.includes('penthouse')) return 'Penthouse';
  if (lower.includes('duplex')) return 'Duplex';
  if (lower.includes('villa')) return 'Villa';
  if (lower.includes('plot')) return 'Plot';

  // Fallback: trimmed name
  return config.name.trim();
}

/**
 * Maps a PublicProjectConfigurationDto to the clean ProjectConfigurationViewModel.
 * Adheres strictly to canonical pricing rules and area breakdown.
 */
export function mapDtoToConfigurationViewModel(
  dto: PublicProjectConfigurationDto,
  mediaList: PublicProjectMediaDto[] = [],
  projectId?: string
): ProjectConfigurationViewModel {
  const areaInfo = getConfigurationCardAreaInfo(dto);

  // Resolve floor plans for this specific configuration
  const configFloorPlans: PublicProjectMediaDto[] = (() => {
    // 1. Direct floorPlans array on the DTO
    if (dto.floorPlans && dto.floorPlans.length > 0) {
      return dto.floorPlans;
    }
    // 2. Search project media matching configurationId or floorPlanMediaId
    if (mediaList.length > 0) {
      const matched = mediaList.filter(
        (m) =>
          (m.configurationId === dto.id || (dto.floorPlanMediaId && (m.id === dto.floorPlanMediaId || m.mediaId === dto.floorPlanMediaId))) &&
          m.category === 'FLOOR_PLANS'
      );
      if (matched.length > 0) return matched;

      if (dto.floorPlanMediaId) {
        const direct = mediaList.find((m) => m.id === dto.floorPlanMediaId || m.mediaId === dto.floorPlanMediaId);
        if (direct) return [direct];
      }
    }
    return [];
  })();

  const typologyCategory = extractTypologyCategory(dto);

  const isPor = Boolean(dto.priceOnRequest) || !dto.price || dto.price <= 0;

  return {
    id: dto.id,
    projectId,
    name: dto.name,
    typologyCategory,
    bedroomCount: dto.bedroomCount ?? null,
    carpetArea: dto.carpetArea ?? null,
    builtUpArea: dto.builtUpArea ?? null,
    superBuiltUpArea: dto.superBuiltUpArea ?? null,
    startingPrice: isPor ? 0 : (dto.price ?? 0),
    startingPriceFormatted: isPor ? 'Price on Request' : formatStartingPrice(dto.price),
    priceOnRequest: isPor,
    priceBasis: dto.priceBasis,
    effectivePricePerSqft: isPor ? null : (dto.effectivePricePerSqft ?? null),
    rateDisplay: isPor ? null : areaInfo.rateDisplay,
    rateBasisLabel: areaInfo.rateBasisLabel,
    hasRate: !isPor && Boolean(areaInfo.rateDisplay),
    carpetAreaDisplay: areaInfo.carpetAreaDisplay,
    secondaryAreaLabel: areaInfo.secondaryAreaLabel,
    secondaryAreaDisplay: areaInfo.secondaryAreaDisplay,
    floorPlans: configFloorPlans,
    floorPlanCount: configFloorPlans.length,
    hasFloorPlans: configFloorPlans.length > 0,
    availability: dto.availability || 'NOT_AVAILABLE',
  };
}

/**
 * Dynamically generates typology filters from the actual configuration set.
 * Zero hardcoded values: dynamically discovers all categories.
 */
export function extractDynamicTypologyFilters(
  configs: ProjectConfigurationViewModel[]
): TypologyFilterItem[] {
  if (configs.length === 0) return [];

  const categoryCounts = new Map<string, number>();

  for (const c of configs) {
    const cat = c.typologyCategory;
    categoryCounts.set(cat, (categoryCounts.get(cat) || 0) + 1);
  }

  // Helper to extract numerical BHK value for sorting
  const getBhkNumber = (cat: string): number | null => {
    const match = cat.match(/(\d+(\.\d+)?)\s*BHK/i);
    return match ? parseFloat(match[1]) : null;
  };

  const categories = Array.from(categoryCounts.keys()).sort((a, b) => {
    const aNum = getBhkNumber(a);
    const bNum = getBhkNumber(b);

    if (aNum != null && bNum != null) {
      return aNum - bNum;
    }
    if (aNum != null) return -1;
    if (bNum != null) return 1;
    return a.localeCompare(b);
  });

  const filters: TypologyFilterItem[] = [
    { key: 'ALL', label: 'All', count: configs.length },
    ...categories.map((cat) => ({
      key: cat,
      label: cat,
      count: categoryCounts.get(cat) || 0,
    })),
  ];

  return filters;
}

/**
 * Transforms a list of DTOs into sorted, view models.
 */
export function prepareProjectConfigurations(
  configurations: PublicProjectConfigurationDto[],
  mediaList: PublicProjectMediaDto[] = [],
  projectId?: string
): ProjectConfigurationViewModel[] {
  const sortedDtos = sortConfigurations(configurations || []);
  return sortedDtos.map((dto) => mapDtoToConfigurationViewModel(dto, mediaList, projectId));
}
