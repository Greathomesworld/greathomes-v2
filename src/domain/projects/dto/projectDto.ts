import {
  Project,
  ProjectConfiguration,
  ProjectMedia,
  ProjectRera,
  Amenity,
  ProjectFaq,
  PriceBasis,
  ReraStatus,
  PropertyType,
  ProjectStatus,
  ProjectLifecycleStatus,
  ProjectConsideration,
  ConsiderationSection,
  ConsiderationSourceType,
} from "../entities";
import { Location } from "../../locations/entities";
import { Developer } from "../../developers/entities";
import {
  resolveProjectCoordinates,
  CoordinateSource,
  ProjectLocationStatus,
} from "../viewModels/projectLocationViewModel";

export interface BoundedDeveloperDto {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string | null;
  shortDescription?: string | null;
  description?: string | null;
}

export interface BoundedLocationDto {
  id: string;
  name: string;
  slug: string;
  type: string;
  latitude?: number | null;
  longitude?: number | null;
  path?: {
    id: string;
    name: string;
    slug: string;
    type: string;
    latitude?: number | null;
    longitude?: number | null;
  }[];
}

export interface PublicProjectConfigurationDto {
  id: string;
  name: string;
  bedroomCount?: number | null;
  carpetArea?: number | null;
  builtUpArea?: number | null;
  superBuiltUpArea?: number | null;
  price: number;
  priceBasis: PriceBasis;
  effectivePricePerSqft: number;
  floorPlanMediaId?: string | null;
  floorPlans?: PublicProjectMediaDto[];
  availability: string;
}

export interface PublicProjectMediaDto {
  id: string;
  mediaId?: string | null;
  configurationId?: string | null;
  mediaType: string;
  category: string;
  url: string;
  altText?: string | null;
  caption?: string | null;
  sortOrder: number;
  isFeatured: boolean;
}

export interface PublicProjectAmenityDto {
  id: string;
  name: string;
  slug: string;
  category: string;
  icon?: string | null;
  isFeatured: boolean;
  sortOrder: number;
}

export interface PublicProjectFaqDto {
  id: string;
  question: string;
  answer: string;
  sortOrder: number;
  isPublished?: boolean;
}

export interface PublicProjectConsiderationDto {
  id: string;
  projectId: string;
  section: ConsiderationSection;
  title: string;
  description: string;
  sourceType: ConsiderationSourceType;
  sortOrder: number;
  isVisible: boolean;
}

export interface PublicProjectPricingSummary {
  startingPrice: number | null;
  maximumPrice: number | null;
  lowestEffectivePricePerSqft: number | null;
  priceBasis: PriceBasis | null;
}

export interface PublicProjectReraDto {
  status: ReraStatus;
  registrationNumber?: string | null;
  authority?: string | null;
  hasVerifiedReraBadge: boolean;
}

export interface PublicProjectSnapshotDto {
  projectArea: string | null;
  towerCount: number | null;
  totalUnits: number | null;
  configurations: string | null;
  floors: string | null;
  possession: string | null;
  possessionDate?: string | null;
  possessionStatus?: string | null;
}

export interface PublicProjectBrochureDto {
  available: boolean;
  mediaId: string | null;
  projectMediaId: string | null;
  displayName: string | null;
  updatedAt: string | null;
}

export interface PublicProjectDto {
  id: string;
  name: string;
  slug: string;
  shortDescription?: string | null;
  description?: string | null;
  propertyType: PropertyType;
  status: ProjectStatus;
  lifecycleStatus: ProjectLifecycleStatus;
  featured: boolean;
  developer: BoundedDeveloperDto;
  location: BoundedLocationDto;
  pricing: PublicProjectPricingSummary;
  configurations: PublicProjectConfigurationDto[];
  rera: PublicProjectReraDto;
  media: PublicProjectMediaDto[];
  amenities: PublicProjectAmenityDto[];
  faqs: PublicProjectFaqDto[];
  considerations?: PublicProjectConsiderationDto[];
  hasBrochure?: boolean;
  brochure?: PublicProjectBrochureDto | null;
  // Canonical Project Coordinates & Source Precision
  latitude?: number | null;
  longitude?: number | null;
  projectLatitude?: number | null;
  projectLongitude?: number | null;
  coordinatesSource?: CoordinateSource;
  locationStatus?: ProjectLocationStatus;
  isProjectOverride?: boolean;
  hasVerifiedProjectCoordinates?: boolean;
  isApproximateLocation?: boolean;
  // Canonical Project Snapshot fields
  projectArea?: string | null;
  towerCount?: number | null;
  totalUnits?: number | null;
  configurationsSummary?: string | null;
  floors?: string | null;
  possession?: string | null;
  possessionStatus?: string | null;
  possessionDate?: string | null;
  snapshot: PublicProjectSnapshotDto;
  // Top-level backwards compatibility fields:
  startingPrice?: number;
  hasVerifiedReraBadge: boolean;
  reraStatus: ReraStatus;
  reraRegistrationNumber?: string;
  createdAt: string;
  updatedAt: string;
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

/**
 * Calculates effective price per sq ft based on canonical price basis.
 * Formula: price / applicable_primary_area
 * Throws an error if required area for price basis is missing or <= 0.
 */
export function calculateEffectivePricePerSqft(
  price: number,
  priceBasis: PriceBasis,
  areas: {
    carpetArea?: number | null;
    builtUpArea?: number | null;
    superBuiltUpArea?: number | null;
  }
): number {
  if (!price || price <= 0) {
    throw new ValidationError("Invalid price: price must be a positive number");
  }

  let applicableArea: number | null | undefined = null;

  switch (priceBasis) {
    case 'CARPET_AREA':
      applicableArea = areas.carpetArea;
      if (!applicableArea || applicableArea <= 0) {
        throw new ValidationError("Missing or invalid carpet area for CARPET_AREA price basis");
      }
      break;
    case 'BUILT_UP_AREA':
      applicableArea = areas.builtUpArea;
      if (!applicableArea || applicableArea <= 0) {
        throw new ValidationError("Missing or invalid built-up area for BUILT_UP_AREA price basis");
      }
      break;
    case 'SUPER_BUILT_UP_AREA':
      applicableArea = areas.superBuiltUpArea;
      if (!applicableArea || applicableArea <= 0) {
        throw new ValidationError("Missing or invalid super built-up area for SUPER_BUILT_UP_AREA price basis");
      }
      break;
    default:
      throw new ValidationError(`Invalid price basis: ${priceBasis}`);
  }

  // Exact derived effective rate rounded to nearest integer (rupees/sq.ft)
  return Math.round(price / applicableArea);
}

/**
 * Derives project-level price summary from configurations.
 */
export function deriveProjectPricingSummary(
  project: Project,
  configurations: (ProjectConfiguration | PublicProjectConfigurationDto)[]
): PublicProjectPricingSummary {
  if (!configurations || configurations.length === 0) {
    const fallbackStarting = project.startingPrice ? Math.round(project.startingPrice) : null;
    return {
      startingPrice: fallbackStarting,
      maximumPrice: fallbackStarting,
      lowestEffectivePricePerSqft: null,
      priceBasis: null,
    };
  }

  const prices = configurations.map(c => c.price).filter(p => p > 0);
  const effectiveRates = configurations.map(c => {
    if ('effectivePricePerSqft' in c && typeof (c as any).effectivePricePerSqft === 'number') {
      return (c as any).effectivePricePerSqft;
    }
    try {
      return calculateEffectivePricePerSqft(c.price, c.priceBasis, {
        carpetArea: c.carpetArea,
        builtUpArea: c.builtUpArea,
        superBuiltUpArea: c.superBuiltUpArea,
      });
    } catch {
      return null;
    }
  }).filter((r): r is number => r !== null && r > 0);

  const startingPrice = prices.length > 0
    ? Math.min(...prices)
    : (typeof project.startingPrice === 'number' && project.startingPrice > 0
        ? Math.round(project.startingPrice)
        : null);
  const maximumPrice = prices.length > 0 ? Math.max(...prices) : (project.startingPrice ? Math.round(project.startingPrice) : null);
  const lowestEffectivePricePerSqft = effectiveRates.length > 0 ? Math.min(...effectiveRates) : null;
  const priceBasis = configurations[0]?.priceBasis ?? null;

  return {
    startingPrice,
    maximumPrice,
    lowestEffectivePricePerSqft,
    priceBasis,
  };
}

/**
 * Derives a deterministic configuration summary from configurations.
 * e.g., [2, 3, 4] -> "2, 3 & 4 BHK"
 *       [2, 3] -> "2 & 3 BHK"
 *       [3] -> "3 BHK"
 *       [1, 2, 3, 4, 5] -> "1, 2, 3, 4 & 5 BHK"
 */
export function deriveConfigurationsSummary(
  configurations: (ProjectConfiguration | PublicProjectConfigurationDto)[] = []
): string | null {
  if (!configurations || configurations.length === 0) {
    return null;
  }

  // Extract distinct bedroom counts
  const bedroomCounts = Array.from(
    new Set(
      configurations
        .map(c => c.bedroomCount)
        .filter((b): b is number => typeof b === 'number' && b > 0)
    )
  ).sort((a, b) => a - b);

  if (bedroomCounts.length > 0) {
    if (bedroomCounts.length === 1) {
      return `${bedroomCounts[0]} BHK`;
    }
    if (bedroomCounts.length === 2) {
      return `${bedroomCounts[0]} & ${bedroomCounts[1]} BHK`;
    }
    const allExceptLast = bedroomCounts.slice(0, -1).join(', ');
    const last = bedroomCounts[bedroomCounts.length - 1];
    return `${allExceptLast} & ${last} BHK`;
  }

  // If no bedroomCount is explicitly set, fallback to distinct parsed names if they follow BHK pattern
  const bhkMatches = Array.from(
    new Set(
      configurations
        .map(c => {
          const match = c.name?.match(/(\d+)\s*BHK/i);
          return match ? parseInt(match[1], 10) : null;
        })
        .filter((b): b is number => b !== null && b > 0)
    )
  ).sort((a, b) => a - b);

  if (bhkMatches.length > 0) {
    if (bhkMatches.length === 1) return `${bhkMatches[0]} BHK`;
    if (bhkMatches.length === 2) return `${bhkMatches[0]} & ${bhkMatches[1]} BHK`;
    return `${bhkMatches.slice(0, -1).join(', ')} & ${bhkMatches[bhkMatches.length - 1]} BHK`;
  }

  // Fallback to distinct names if any
  const uniqueNames = Array.from(new Set(configurations.map(c => c.name).filter(Boolean)));
  if (uniqueNames.length > 0) {
    return uniqueNames.join(', ');
  }

  return null;
}

/**
 * Formats a possessionDate value into standard month + year display (e.g. "Dec 2027").
 */
export function formatPossessionDateValue(possessionDate?: Date | string | null): string | null {
  if (!possessionDate) return null;
  if (typeof possessionDate === 'string' && possessionDate.trim().length === 0) return null;

  const d = possessionDate instanceof Date ? possessionDate : new Date(possessionDate);
  if (!isNaN(d.getTime())) {
    const monthStr = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
    const yearStr = d.getUTCFullYear();
    return `${monthStr} ${yearStr}`;
  }

  if (typeof possessionDate === 'string') {
    const clean = possessionDate.trim();
    if (clean.length > 0 && clean !== '—') {
      return clean;
    }
  }

  return null;
}

/**
 * Resolves consumer-friendly possession display string.
 * Precedence (Canonical Batch 2 rules):
 * 1. If possessionDate is available, display it using the existing date-formatting conventions.
 * 2. If possessionDate is unavailable, but possessionStatus / possession exists, display it.
 * 3. If both are missing, return null (do NOT invent a date or status from project.status).
 */
export function derivePossessionDisplay(
  possessionOrOptions?:
    | string
    | null
    | {
        possession?: string | null;
        status?: ProjectStatus;
        possessionDate?: Date | string | null;
        possessionStatus?: string | null;
      },
  _status?: ProjectStatus,
  possessionDate?: Date | string | null,
  possessionStatus?: string | null
): string | null {
  let possessionVal: string | null | undefined;
  let possessionDateVal: Date | string | null | undefined;
  let possessionStatusVal: string | null | undefined;

  if (
    possessionOrOptions &&
    typeof possessionOrOptions === 'object' &&
    !(possessionOrOptions instanceof String)
  ) {
    possessionVal = possessionOrOptions.possession;
    possessionDateVal = possessionOrOptions.possessionDate;
    possessionStatusVal = possessionOrOptions.possessionStatus;
  } else {
    possessionVal = possessionOrOptions as string | null | undefined;
    possessionDateVal = possessionDate;
    possessionStatusVal = possessionStatus;
  }

  const formattedDate = formatPossessionDateValue(possessionDateVal);
  if (formattedDate) {
    return formattedDate;
  }

  const rawStatus = possessionStatusVal ?? possessionVal;
  if (rawStatus && typeof rawStatus === 'string') {
    const clean = rawStatus.trim();
    if (clean.length > 0 && clean !== '—') {
      return clean;
    }
  }

  return null;
}

export function toPublicProjectDto(
  project: Project,
  developer: BoundedDeveloperDto,
  location: Location,
  locationPath?: { id: string; name: string; slug: string; type: string }[],
  configurations: ProjectConfiguration[] = [],
  media: ProjectMedia[] = [],
  amenities: { amenity: Amenity; isFeatured: boolean; sortOrder: number }[] = [],
  faqs: ProjectFaq[] = [],
  reraRecord?: ProjectRera | null,
  considerations: ProjectConsideration[] = []
): PublicProjectDto {
  const reraStatus: ReraStatus = reraRecord?.status ?? project.reraStatus ?? 'NOT_PROVIDED';
  const registrationNumber = reraRecord?.registrationNumber ?? project.reraRegistrationNumber ?? undefined;
  const authority = reraRecord?.authority ?? (registrationNumber ? 'WBRERA' : undefined);
  const hasVerifiedReraBadge = reraStatus === 'VERIFIED';

  // Transform configurations with derived effective rates and configuration-specific floor plans
  const configDtos: PublicProjectConfigurationDto[] = configurations.map(c => {
    const effectivePricePerSqft = calculateEffectivePricePerSqft(c.price, c.priceBasis, {
      carpetArea: c.carpetArea,
      builtUpArea: c.builtUpArea,
      superBuiltUpArea: c.superBuiltUpArea,
    });

    const configFloorPlans: PublicProjectMediaDto[] = media
      .filter(m => m.category === 'FLOOR_PLANS' && (m.configurationId === c.id || (c.floorPlanMediaId && (m.id === c.floorPlanMediaId || m.mediaId === c.floorPlanMediaId))))
      .sort((a, b) => {
        const aIsPrimary = Boolean(c.floorPlanMediaId && (a.id === c.floorPlanMediaId || a.mediaId === c.floorPlanMediaId));
        const bIsPrimary = Boolean(c.floorPlanMediaId && (b.id === c.floorPlanMediaId || b.mediaId === c.floorPlanMediaId));
        if (aIsPrimary !== bIsPrimary) return aIsPrimary ? -1 : 1;
        if (a.isFeatured !== b.isFeatured) return a.isFeatured ? -1 : 1;
        return a.sortOrder - b.sortOrder;
      })
      .map(m => ({
        id: m.id,
        mediaId: m.mediaId || m.id,
        configurationId: m.configurationId,
        mediaType: m.mediaType,
        category: m.category,
        url: m.url,
        altText: m.altText,
        caption: m.caption,
        sortOrder: m.sortOrder,
        isFeatured: m.isFeatured,
      }));

    return {
      id: c.id,
      name: c.name,
      bedroomCount: c.bedroomCount,
      carpetArea: c.carpetArea,
      builtUpArea: c.builtUpArea,
      superBuiltUpArea: c.superBuiltUpArea,
      price: c.price,
      priceBasis: c.priceBasis,
      effectivePricePerSqft,
      floorPlanMediaId: c.floorPlanMediaId,
      floorPlans: configFloorPlans,
      availability: c.availability ?? 'AVAILABLE',
    };
  });

  const pricing = deriveProjectPricingSummary(project, configDtos);
  const configurationsSummary = deriveConfigurationsSummary(configDtos);
  const rawPossessionStatus =
    (project as { possessionStatus?: string | null }).possessionStatus ?? project.possession ?? null;
  const rawPossessionDateStr =
    project.possessionDate instanceof Date
      ? project.possessionDate.toISOString()
      : project.possessionDate
        ? String(project.possessionDate)
        : null;
  const possessionDisplay = derivePossessionDisplay(
    project.possession,
    project.status,
    project.possessionDate,
    (project as { possessionStatus?: string | null }).possessionStatus
  );

  const snapshot: PublicProjectSnapshotDto = {
    projectArea: project.projectArea ?? null,
    towerCount: project.towerCount ?? null,
    totalUnits: project.totalUnits ?? null,
    configurations: configurationsSummary,
    floors: project.floors ?? null,
    possession: possessionDisplay,
    possessionDate: rawPossessionDateStr,
    possessionStatus: rawPossessionStatus,
  };

  const brochureMediaList = media
    .filter(
      m =>
        (m.category || '').toUpperCase() === 'BROCHURE' &&
        m.url &&
        m.url.trim().length > 0
    )
    .sort((a, b) => {
      const timeA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const timeB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return timeB - timeA || a.sortOrder - b.sortOrder;
    });

  const activeBrochure = brochureMediaList[0] || null;
  const brochureDto: PublicProjectBrochureDto = activeBrochure
    ? {
        available: true,
        mediaId: activeBrochure.mediaId ?? activeBrochure.id,
        projectMediaId: activeBrochure.id,
        displayName:
          (activeBrochure.caption && activeBrochure.caption.trim()) ||
          (activeBrochure.altText && activeBrochure.altText.trim()) ||
          `${project.name} Official Brochure.pdf`,
        updatedAt:
          activeBrochure.updatedAt instanceof Date
            ? activeBrochure.updatedAt.toISOString()
            : activeBrochure.updatedAt
              ? String(activeBrochure.updatedAt)
              : null,
      }
    : {
        available: false,
        mediaId: null,
        projectMediaId: null,
        displayName: null,
        updatedAt: null,
      };

  // Exclude private BROCHURE documents from generic public media array so storage URLs are never exposed before authorization
  const mediaDtos: PublicProjectMediaDto[] = media
    .filter(m => (m.category || '').toUpperCase() !== 'BROCHURE')
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(m => ({
      id: m.id,
      mediaId: m.mediaId ?? m.id,
      configurationId: m.configurationId,
      mediaType: m.mediaType,
      category: m.category,
      url: m.url,
      altText: m.altText,
      caption: m.caption,
      sortOrder: m.sortOrder,
      isFeatured: m.isFeatured,
    }));

  const amenityDtos: PublicProjectAmenityDto[] = amenities
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(a => ({
      id: a.amenity.id,
      name: a.amenity.name,
      slug: a.amenity.slug,
      category: a.amenity.category,
      icon: a.amenity.icon,
      isFeatured: a.isFeatured,
      sortOrder: a.sortOrder,
    }));

  const faqDtos: PublicProjectFaqDto[] = faqs
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(f => ({
      id: f.id,
      question: f.question,
      answer: f.answer,
      sortOrder: f.sortOrder,
      isPublished: f.isPublished ?? true,
    }));

  const considerationDtos: PublicProjectConsiderationDto[] = considerations
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(c => ({
      id: c.id,
      projectId: c.projectId,
      section: c.section,
      title: c.title,
      description: c.description,
      sourceType: c.sourceType,
      sortOrder: c.sortOrder,
      isVisible: c.isVisible,
    }));

  // Resolve lifecycle status
  let lifecycleStatus: ProjectLifecycleStatus = 'PUBLISHED';
  if (project.lifecycleStatus) {
    lifecycleStatus = project.lifecycleStatus;
  } else if (project.isPublished === false) {
    lifecycleStatus = 'DRAFT';
  }

  // Resolve coordinate precedence (project override vs location fallback)
  const resolvedCoords = resolveProjectCoordinates(project, location);

  return {
    id: project.id,
    name: project.name,
    slug: project.slug,
    shortDescription: project.shortDescription ?? null,
    description: project.description ?? null,
    propertyType: project.propertyType,
    status: project.status,
    lifecycleStatus,
    featured: project.featured ?? false,
    latitude: resolvedCoords.latitude,
    longitude: resolvedCoords.longitude,
    projectLatitude: project.latitude !== undefined && project.latitude !== null ? Number(project.latitude) : null,
    projectLongitude: project.longitude !== undefined && project.longitude !== null ? Number(project.longitude) : null,
    coordinatesSource: resolvedCoords.source,
    locationStatus: resolvedCoords.locationStatus,
    isProjectOverride: resolvedCoords.isProjectOverride,
    hasVerifiedProjectCoordinates: resolvedCoords.hasVerifiedProjectCoordinates,
    isApproximateLocation: resolvedCoords.isApproximateLocation,
    developer: {
      id: developer.id,
      name: developer.name,
      slug: developer.slug,
      logoUrl: developer.logoUrl ?? null,
      shortDescription: developer.shortDescription ?? null,
      description: developer.description ?? null,
    },
    location: {
      id: location.id,
      name: location.name,
      slug: location.slug,
      type: location.type,
      latitude: location.latitude ?? null,
      longitude: location.longitude ?? null,
      path: locationPath,
    },
    pricing,
    configurations: configDtos,
    rera: {
      status: reraStatus,
      registrationNumber,
      authority,
      hasVerifiedReraBadge,
    },
    media: mediaDtos,
    amenities: amenityDtos,
    faqs: faqDtos,
    considerations: considerationDtos,
    hasBrochure: Boolean(activeBrochure),
    brochure: brochureDto,
    // Canonical Project Snapshot fields
    projectArea: project.projectArea ?? null,
    towerCount: project.towerCount ?? null,
    totalUnits: project.totalUnits ?? null,
    configurationsSummary,
    floors: project.floors ?? null,
    possession: possessionDisplay,
    possessionStatus: rawPossessionStatus,
    possessionDate: rawPossessionDateStr,
    snapshot,
    // Backwards compatibility top-level fields
    startingPrice: pricing.startingPrice ?? project.startingPrice ?? undefined,
    hasVerifiedReraBadge,
    reraStatus,
    reraRegistrationNumber: registrationNumber,
    createdAt: project.createdAt instanceof Date ? project.createdAt.toISOString() : String(project.createdAt),
    updatedAt: project.updatedAt instanceof Date ? project.updatedAt.toISOString() : String(project.updatedAt),
  };
}

/**
 * Deterministically sorts project configuration typologies:
 * 1. Numerical bedroom count ascending (2 BHK, 3 BHK, 4 BHK, 5 BHK)
 * 2. Extracted bedroom count from name if bedroomCount is omitted
 * 3. Non-BHK (Studio, Duplex, Penthouse, Villa) sorted by bedroom count or price or stable name
 */
export function sortConfigurations(configs: PublicProjectConfigurationDto[]): PublicProjectConfigurationDto[] {
  return [...configs].sort((a, b) => {
    const extractBhkNum = (name: string): number | null => {
      const match = name.match(/(\d+(\.\d+)?)\s*BHK/i);
      return match ? parseFloat(match[1]) : null;
    };

    const aBhk = a.bedroomCount ?? extractBhkNum(a.name);
    const bBhk = b.bedroomCount ?? extractBhkNum(b.name);

    if (aBhk != null && bBhk != null) {
      if (aBhk !== bBhk) return aBhk - bBhk;
    } else if (aBhk != null) {
      return -1; // BHK items first
    } else if (bBhk != null) {
      return 1;
    }

    // Secondary sort: starting price if both defined
    if (a.price && b.price && a.price !== b.price) {
      return a.price - b.price;
    }

    // Tertiary stable fallback: alphabetical name
    return a.name.localeCompare(b.name);
  });
}

/**
 * Formats configuration area based on canonical price basis:
 * e.g. "890 sq.ft. (Carpet Area)" or "1,250 sq.ft."
 */
export function formatConfigurationArea(
  config: PublicProjectConfigurationDto,
  options?: { includeBasis?: boolean }
): { areaDisplay: string | null; basisDisplay: string | null } {
  let primaryArea: number | null | undefined = null;
  let basisName: string | null = null;

  if (config.priceBasis === 'CARPET_AREA') {
    primaryArea = config.carpetArea ?? config.builtUpArea ?? config.superBuiltUpArea;
    basisName = 'Carpet Area';
  } else if (config.priceBasis === 'BUILT_UP_AREA') {
    primaryArea = config.builtUpArea ?? config.carpetArea ?? config.superBuiltUpArea;
    basisName = 'Built-up Area';
  } else if (config.priceBasis === 'SUPER_BUILT_UP_AREA') {
    primaryArea = config.superBuiltUpArea ?? config.builtUpArea ?? config.carpetArea;
    basisName = 'Super Built-up';
  } else {
    primaryArea = config.carpetArea ?? config.builtUpArea ?? config.superBuiltUpArea;
    basisName = 'Carpet Area';
  }

  if (!primaryArea || primaryArea <= 0) {
    return { areaDisplay: null, basisDisplay: null };
  }

  const areaStr = `${primaryArea.toLocaleString('en-IN')} sq.ft.`;
  return {
    areaDisplay: options?.includeBasis && basisName ? `${areaStr} (${basisName})` : areaStr,
    basisDisplay: basisName,
  };
}

export interface ConfigurationCardAreaInfo {
  carpetAreaDisplay: string | null;
  secondaryAreaLabel: string | null;
  secondaryAreaDisplay: string | null;
  rateBasisLabel: string;
  rateDisplay: string | null;
}

/**
 * Derives consumer-facing area & price rate breakdown according to canonical Phase 05F.5.1 specification:
 * 1. Carpet Area (mandatory primary if available)
 * 2. Exactly ONE applicable secondary area (Built-up OR Super Built-up)
 * 3. Price rate with explicitly labeled basis matching canonical price_basis
 */
export function getConfigurationCardAreaInfo(
  config: PublicProjectConfigurationDto
): ConfigurationCardAreaInfo {
  const carpetAreaDisplay =
    config.carpetArea && config.carpetArea > 0
      ? `${config.carpetArea.toLocaleString('en-IN')} sq.ft.`
      : null;

  let secondaryAreaLabel: string | null = null;
  let secondaryAreaDisplay: string | null = null;

  if (config.priceBasis === 'SUPER_BUILT_UP_AREA') {
    if (config.superBuiltUpArea && config.superBuiltUpArea > 0) {
      secondaryAreaLabel = 'Super Built-up';
      secondaryAreaDisplay = `${config.superBuiltUpArea.toLocaleString('en-IN')} sq.ft.`;
    } else if (config.builtUpArea && config.builtUpArea > 0) {
      secondaryAreaLabel = 'Built-up';
      secondaryAreaDisplay = `${config.builtUpArea.toLocaleString('en-IN')} sq.ft.`;
    }
  } else if (config.priceBasis === 'BUILT_UP_AREA') {
    if (config.builtUpArea && config.builtUpArea > 0) {
      secondaryAreaLabel = 'Built-up';
      secondaryAreaDisplay = `${config.builtUpArea.toLocaleString('en-IN')} sq.ft.`;
    } else if (config.superBuiltUpArea && config.superBuiltUpArea > 0) {
      secondaryAreaLabel = 'Super Built-up';
      secondaryAreaDisplay = `${config.superBuiltUpArea.toLocaleString('en-IN')} sq.ft.`;
    }
  } else {
    // CARPET_AREA basis or default
    if (config.superBuiltUpArea && config.superBuiltUpArea > 0) {
      secondaryAreaLabel = 'Super Built-up';
      secondaryAreaDisplay = `${config.superBuiltUpArea.toLocaleString('en-IN')} sq.ft.`;
    } else if (config.builtUpArea && config.builtUpArea > 0) {
      secondaryAreaLabel = 'Built-up';
      secondaryAreaDisplay = `${config.builtUpArea.toLocaleString('en-IN')} sq.ft.`;
    }
  }

  let rateBasisLabel = 'Carpet';
  let hasRequiredRateArea = false;
  let basisArea: number | null | undefined = null;

  if (config.priceBasis === 'BUILT_UP_AREA') {
    rateBasisLabel = 'Built-up';
    basisArea = config.builtUpArea;
    hasRequiredRateArea = Boolean(basisArea && basisArea > 0);
  } else if (config.priceBasis === 'SUPER_BUILT_UP_AREA') {
    rateBasisLabel = 'Super Built-up';
    basisArea = config.superBuiltUpArea;
    hasRequiredRateArea = Boolean(basisArea && basisArea > 0);
  } else {
    rateBasisLabel = 'Carpet';
    basisArea = config.carpetArea;
    hasRequiredRateArea = Boolean(basisArea && basisArea > 0);
  }

  let derivedRate: number | null = null;
  if (hasRequiredRateArea && config.price && config.price > 0 && basisArea) {
    derivedRate = Math.round(config.price / basisArea);
  } else if (config.effectivePricePerSqft && config.effectivePricePerSqft > 0 && hasRequiredRateArea) {
    derivedRate = config.effectivePricePerSqft;
  }

  const rateDisplay =
    hasRequiredRateArea && derivedRate && derivedRate > 0
      ? `₹${derivedRate.toLocaleString('en-IN')}/sq.ft. · ${rateBasisLabel}`
      : null;

  return {
    carpetAreaDisplay,
    secondaryAreaLabel,
    secondaryAreaDisplay,
    rateBasisLabel,
    rateDisplay,
  };
}

/**
 * Formats configuration starting price with clean INR denominations (Crores/Lakhs)
 */
export function formatStartingPrice(price?: number | null): string {
  if (!price || price <= 0) return 'Price on Request';
  if (price >= 10000000) {
    const cr = (price / 10000000).toFixed(2).replace(/\.00$/, '');
    return `₹${cr} Cr onwards`;
  }
  if (price >= 100000) {
    const l = (price / 100000).toFixed(2).replace(/\.00$/, '');
    return `₹${l} L onwards`;
  }
  return `₹${price.toLocaleString('en-IN')} onwards`;
}

