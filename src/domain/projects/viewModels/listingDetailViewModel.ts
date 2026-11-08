import { PublicResaleListingDto } from '../dto/resaleDto';
import { PublicRentalListingDto } from '../dto/rentalDto';
import {
  formatIndianPrice,
  formatArea,
  formatFurnishing,
  formatFloorCategory,
  formatPropertyType,
} from '@/src/components/discovery/formatters';

export interface PropertyDetailLocationViewModel {
  id: string;
  name: string;
  slug: string;
  url: string;
}

export interface PropertyDetailProjectViewModel {
  id: string;
  name: string;
  slug: string;
  url: string;
  locationName: string | null;
  locationSlug: string | null;
  developerName: string | null;
  developerSlug: string | null;
  status: string | null;
  statusDisplay: string | null;
  shortDescription: string | null;
  reraVerified: boolean;
  featuredImageUrl: string | null;
  bhkSummary: string | null;
  startingPriceDisplay: string | null;
}

export interface PropertyDetailMediaViewModel {
  id: string;
  url: string;
  altText: string;
  caption: string | null;
  sortOrder: number;
  isFeatured: boolean;
}

export interface PropertyDetailAmenityViewModel {
  id: string;
  name: string;
  category: string;
}

/**
 * ResaleListingDetailViewModel
 *
 * Dedicated public presentation view model for Resale Listing Detail Pages (/buy/[slug]).
 * Contains strictly verified public facts.
 * NEVER contains private operational fields, phone numbers, emails, CRM notes, or derived price/sq.ft. metrics.
 */
export interface ResaleListingDetailViewModel {
  mode: 'RESALE';
  id: string;
  slug: string;
  canonicalUrl: string;
  title: string;
  propertyType: string;
  propertyTypeDisplay: string;
  configuration: string;
  bedroomCount: number;
  carpetArea: number | null;
  carpetAreaDisplay: string | null;
  builtUpArea: number | null;
  builtUpAreaDisplay: string | null;
  superBuiltUpArea: number | null;
  superBuiltUpAreaDisplay: string | null;
  primaryAreaLabel: 'Carpet Area' | 'Built-up Area' | 'Super Built-up Area';
  primaryAreaDisplay: string | null;
  askingPrice: number;
  formattedAskingPrice: string;
  furnishing: string;
  furnishingDisplay: string;
  facing: string;
  facingDisplay: string;
  floorCategory: string;
  floorCategoryDisplay: string;
  possession: string;
  possessionDisplay: string;
  possessionDate: string | null;
  description: string | null;
  listingPartyLabel: string;
  isVerified: boolean;
  verifiedAt: string | null;
  location: PropertyDetailLocationViewModel | null;
  locationDisplay: string;
  project: PropertyDetailProjectViewModel | null;
  media: PropertyDetailMediaViewModel[];
  amenities: PropertyDetailAmenityViewModel[];
  createdAt: string;
  updatedAt: string;
}

/**
 * RentalListingDetailViewModel
 *
 * Dedicated public presentation view model for Rental Listing Detail Pages (/rent/[slug]).
 * Contains strictly verified public facts.
 * NEVER contains private operational fields, phone numbers, emails, CRM notes, or derived rent/sq.ft. metrics.
 */
export interface RentalListingDetailViewModel {
  mode: 'RENTAL';
  id: string;
  slug: string;
  canonicalUrl: string;
  title: string;
  propertyType: string;
  propertyTypeDisplay: string;
  configuration: string;
  bedroomCount: number;
  carpetArea: number | null;
  carpetAreaDisplay: string | null;
  builtUpArea: number | null;
  builtUpAreaDisplay: string | null;
  superBuiltUpArea: number | null;
  superBuiltUpAreaDisplay: string | null;
  primaryAreaLabel: 'Carpet Area' | 'Built-up Area' | 'Super Built-up Area';
  primaryAreaDisplay: string | null;
  monthlyRent: number;
  formattedMonthlyRent: string;
  maintenance: number | null;
  formattedMaintenance: string | null;
  securityDeposit: number | null;
  formattedSecurityDeposit: string | null;
  furnishing: string;
  furnishingDisplay: string;
  facing: string;
  facingDisplay: string;
  floorCategory: string;
  floorCategoryDisplay: string;
  possession: string;
  possessionDisplay: string;
  availabilityDate: string | null;
  leaseDuration: string | null;
  noticePeriod: string | null;
  description: string | null;
  listingPartyLabel: string;
  isVerified: boolean;
  verifiedAt: string | null;
  location: PropertyDetailLocationViewModel | null;
  locationDisplay: string;
  project: PropertyDetailProjectViewModel | null;
  media: PropertyDetailMediaViewModel[];
  amenities: PropertyDetailAmenityViewModel[];
  createdAt: string;
  updatedAt: string;
}

export type PropertyDetailViewModel =
  | ResaleListingDetailViewModel
  | RentalListingDetailViewModel;

export function formatFacing(facing?: string | null): string {
  if (!facing || facing === 'UNKNOWN') return 'Not Specified';
  return facing
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join('-');
}

export function formatPossession(possession?: string | null): string {
  if (!possession) return 'Ready to Move';
  if (possession === 'READY') return 'Ready to Move';
  if (possession === 'UNDER_CONSTRUCTION') return 'Under Construction';
  if (possession === 'OCCUPIED') return 'Currently Occupied';
  if (possession === 'AVAILABLE_FROM_DATE') return 'Available Shortly';
  return possession.replace(/_/g, ' ');
}

function formatProjectStatus(status?: string | null): string | null {
  if (!status) return null;
  if (status === 'READY_TO_MOVE' || status === 'COMPLETED') return 'Ready to Move';
  if (status === 'UNDER_CONSTRUCTION') return 'Under Construction';
  if (status === 'NEW_LAUNCH') return 'New Launch';
  return status.replace(/_/g, ' ');
}

function resolvePrimaryArea(dto: {
  carpetArea?: number | null;
  builtUpArea?: number | null;
  superBuiltUpArea?: number | null;
}): {
  primaryAreaLabel: 'Carpet Area' | 'Built-up Area' | 'Super Built-up Area';
  primaryAreaDisplay: string | null;
} {
  if (dto.carpetArea && dto.carpetArea > 0) {
    return {
      primaryAreaLabel: 'Carpet Area',
      primaryAreaDisplay: formatArea(dto.carpetArea),
    };
  }
  if (dto.builtUpArea && dto.builtUpArea > 0) {
    return {
      primaryAreaLabel: 'Built-up Area',
      primaryAreaDisplay: formatArea(dto.builtUpArea),
    };
  }
  if (dto.superBuiltUpArea && dto.superBuiltUpArea > 0) {
    return {
      primaryAreaLabel: 'Super Built-up Area',
      primaryAreaDisplay: formatArea(dto.superBuiltUpArea),
    };
  }
  return {
    primaryAreaLabel: 'Carpet Area',
    primaryAreaDisplay: null,
  };
}

export function toResaleListingDetailViewModel(
  dto: PublicResaleListingDto
): ResaleListingDetailViewModel {
  const slug = dto.slug || dto.id;
  const resolvedLoc = dto.location ?? dto.project?.location ?? null;
  const projectDisplay = dto.project
    ? ` at ${dto.project.name}`
    : resolvedLoc
    ? ` in ${resolvedLoc.name}`
    : '';
  const title = `${dto.bedroomCount} BHK ${formatPropertyType(dto.propertyType)}${projectDisplay}`;

  const location: PropertyDetailLocationViewModel | null = resolvedLoc
    ? {
        id: resolvedLoc.id,
        name: resolvedLoc.name,
        slug: resolvedLoc.slug,
        url: `/locations/${resolvedLoc.slug}`,
      }
    : null;

  const locationDisplay = location ? `${location.name}, Kolkata` : 'Kolkata';
  const { primaryAreaLabel, primaryAreaDisplay } = resolvePrimaryArea(dto);

  return {
    mode: 'RESALE',
    id: dto.id,
    slug,
    canonicalUrl: `/buy/${slug}`,
    title,
    propertyType: dto.propertyType,
    propertyTypeDisplay: formatPropertyType(dto.propertyType),
    configuration: dto.configuration,
    bedroomCount: dto.bedroomCount,
    carpetArea: dto.carpetArea ?? null,
    carpetAreaDisplay: formatArea(dto.carpetArea),
    builtUpArea: dto.builtUpArea ?? null,
    builtUpAreaDisplay: formatArea(dto.builtUpArea),
    superBuiltUpArea: dto.superBuiltUpArea ?? null,
    superBuiltUpAreaDisplay: formatArea(dto.superBuiltUpArea),
    primaryAreaLabel,
    primaryAreaDisplay,
    askingPrice: dto.askingPrice,
    formattedAskingPrice: formatIndianPrice(dto.askingPrice),
    furnishing: dto.furnishing,
    furnishingDisplay: formatFurnishing(dto.furnishing),
    facing: dto.facing,
    facingDisplay: formatFacing(dto.facing),
    floorCategory: dto.floorCategory,
    floorCategoryDisplay: formatFloorCategory(dto.floorCategory),
    possession: dto.possession,
    possessionDisplay: formatPossession(dto.possession),
    possessionDate: dto.possessionDate ?? null,
    description: dto.description ?? null,
    listingPartyLabel: dto.listingParty?.label || 'Verified Listing',
    isVerified: dto.isVerified,
    verifiedAt: dto.verifiedAt ?? null,
    location,
    locationDisplay,
    project: dto.project
      ? {
          id: dto.project.id,
          name: dto.project.name,
          slug: dto.project.slug,
          url: `/projects/${dto.project.slug}`,
          locationName: dto.project.location?.name ?? resolvedLoc?.name ?? null,
          locationSlug: dto.project.location?.slug ?? resolvedLoc?.slug ?? null,
          developerName: dto.project.developerName ?? null,
          developerSlug: dto.project.developerSlug ?? null,
          status: dto.project.status ?? null,
          statusDisplay: formatProjectStatus(dto.project.status),
          shortDescription: dto.project.shortDescription ?? null,
          reraVerified: Boolean(dto.project.reraVerified),
          featuredImageUrl: dto.project.featuredImageUrl ?? null,
          bhkSummary: Array.isArray(dto.project.bhkSummary)
            ? dto.project.bhkSummary.length > 0
              ? `${dto.project.bhkSummary.join(' & ')} BHK`
              : null
            : dto.project.bhkSummary ?? null,
          startingPriceDisplay: dto.project.startingPrice
            ? formatIndianPrice(dto.project.startingPrice)
            : null,
        }
      : null,
    media: dto.media.map(m => ({
      id: m.id,
      url: m.url,
      altText: m.altText || `${title} property photo`,
      caption: m.caption ?? null,
      sortOrder: m.sortOrder,
      isFeatured: m.isFeatured,
    })),
    amenities: dto.amenities.map(a => ({
      id: a.id,
      name: a.name,
      category: a.category,
    })),
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  };
}

export function toRentalListingDetailViewModel(
  dto: PublicRentalListingDto
): RentalListingDetailViewModel {
  const slug = dto.slug || dto.id;
  const resolvedLoc = dto.location ?? dto.project?.location ?? null;
  const projectDisplay = dto.project
    ? ` at ${dto.project.name}`
    : resolvedLoc
    ? ` in ${resolvedLoc.name}`
    : '';
  const title = `${dto.bedroomCount} BHK ${formatPropertyType(dto.propertyType)}${projectDisplay}`;

  const location: PropertyDetailLocationViewModel | null = resolvedLoc
    ? {
        id: resolvedLoc.id,
        name: resolvedLoc.name,
        slug: resolvedLoc.slug,
        url: `/locations/${resolvedLoc.slug}`,
      }
    : null;

  const locationDisplay = location ? `${location.name}, Kolkata` : 'Kolkata';
  const { primaryAreaLabel, primaryAreaDisplay } = resolvePrimaryArea(dto);

  return {
    mode: 'RENTAL',
    id: dto.id,
    slug,
    canonicalUrl: `/rent/${slug}`,
    title,
    propertyType: dto.propertyType,
    propertyTypeDisplay: formatPropertyType(dto.propertyType),
    configuration: dto.configuration,
    bedroomCount: dto.bedroomCount,
    carpetArea: dto.carpetArea ?? null,
    carpetAreaDisplay: formatArea(dto.carpetArea),
    builtUpArea: dto.builtUpArea ?? null,
    builtUpAreaDisplay: formatArea(dto.builtUpArea),
    superBuiltUpArea: dto.superBuiltUpArea ?? null,
    superBuiltUpAreaDisplay: formatArea(dto.superBuiltUpArea),
    primaryAreaLabel,
    primaryAreaDisplay,
    monthlyRent: dto.monthlyRent,
    formattedMonthlyRent: `${formatIndianPrice(dto.monthlyRent)} / month`,
    maintenance: dto.maintenance ?? null,
    formattedMaintenance:
      dto.maintenance && dto.maintenance > 0
        ? `${formatIndianPrice(dto.maintenance)} / month`
        : null,
    securityDeposit: dto.securityDeposit ?? null,
    formattedSecurityDeposit:
      dto.securityDeposit && dto.securityDeposit > 0
        ? formatIndianPrice(dto.securityDeposit)
        : null,
    furnishing: dto.furnishing,
    furnishingDisplay: formatFurnishing(dto.furnishing),
    facing: dto.facing,
    facingDisplay: formatFacing(dto.facing),
    floorCategory: dto.floorCategory,
    floorCategoryDisplay: formatFloorCategory(dto.floorCategory),
    possession: dto.possession,
    possessionDisplay: formatPossession(dto.possession),
    availabilityDate: dto.availabilityDate ?? null,
    leaseDuration: dto.leaseDuration ?? null,
    noticePeriod: dto.noticePeriod ?? null,
    description: dto.description ?? null,
    listingPartyLabel: dto.listingParty?.label || 'Verified Listing',
    isVerified: dto.isVerified,
    verifiedAt: dto.verifiedAt ?? null,
    location,
    locationDisplay,
    project: dto.project
      ? {
          id: dto.project.id,
          name: dto.project.name,
          slug: dto.project.slug,
          url: `/projects/${dto.project.slug}`,
          locationName: dto.project.location?.name ?? resolvedLoc?.name ?? null,
          locationSlug: dto.project.location?.slug ?? resolvedLoc?.slug ?? null,
          developerName: dto.project.developerName ?? null,
          developerSlug: dto.project.developerSlug ?? null,
          status: dto.project.status ?? null,
          statusDisplay: formatProjectStatus(dto.project.status),
          shortDescription: dto.project.shortDescription ?? null,
          reraVerified: Boolean(dto.project.reraVerified),
          featuredImageUrl: dto.project.featuredImageUrl ?? null,
          bhkSummary: Array.isArray(dto.project.bhkSummary)
            ? dto.project.bhkSummary.length > 0
              ? `${dto.project.bhkSummary.join(' & ')} BHK`
              : null
            : dto.project.bhkSummary ?? null,
          startingPriceDisplay: dto.project.startingPrice
            ? formatIndianPrice(dto.project.startingPrice)
            : null,
        }
      : null,
    media: dto.media.map(m => ({
      id: m.id,
      url: m.url,
      altText: m.altText || `${title} rental property photo`,
      caption: m.caption ?? null,
      sortOrder: m.sortOrder,
      isFeatured: m.isFeatured,
    })),
    amenities: dto.amenities.map(a => ({
      id: a.id,
      name: a.name,
      category: a.category,
    })),
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  };
}

export const mapResaleDtoToDetailViewModel = toResaleListingDetailViewModel;
export const mapRentalDtoToDetailViewModel = toRentalListingDetailViewModel;
