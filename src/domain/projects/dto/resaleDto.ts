import {
  PropertyType,
  FurnishingStatus,
  FacingDirection,
  FloorCategory,
  PossessionStatus,
  ResaleLifecycleStatus,
  ResaleVerificationStatus,
  ListingPartyType,
  ProjectMediaCategory,
} from '../entities/resaleEntities';
import { BoundedLocationDto } from '../dto/projectDto';

export interface BoundedResaleProjectDto {
  id: string;
  name: string;
  slug: string;
  location?: BoundedLocationDto | null;
  developerName?: string | null;
  developerSlug?: string | null;
  status?: string | null;
  shortDescription?: string | null;
  reraVerified?: boolean;
  featuredImageUrl?: string | null;
  bhkSummary?: string | number[] | null;
  startingPrice?: number | null;
}

export interface PublicResaleListingMediaDto {
  id: string;
  mediaType: string;
  category: ProjectMediaCategory;
  url: string;
  altText?: string | null;
  caption?: string | null;
  sortOrder: number;
  isFeatured: boolean;
}

export interface PublicResaleListingAmenityDto {
  id: string;
  name: string;
  slug: string;
  category: string;
  icon?: string | null;
}

export interface PublicResaleListingPartyDto {
  type: ListingPartyType;
  label: string; // "Owner Listed" or "Listing Partner"
}

export interface PublicResaleListingDto {
  id: string;
  slug?: string | null;
  project?: BoundedResaleProjectDto | null;
  location?: BoundedLocationDto | null;
  propertyType: PropertyType;
  configuration: string;
  bedroomCount: number;
  carpetArea?: number | null;
  builtUpArea?: number | null;
  superBuiltUpArea?: number | null;
  askingPrice: number; // Total asking price only. NO per-sqft calculation.
  furnishing: FurnishingStatus;
  facing: FacingDirection;
  floorCategory: FloorCategory; // Coarse: LOWER_FLOOR, MID_FLOOR, HIGH_FLOOR
  possession: PossessionStatus;
  possessionDate?: string | null;
  description?: string | null;
  listingParty: PublicResaleListingPartyDto;
  isVerified: boolean;
  verifiedAt?: string | null;
  media: PublicResaleListingMediaDto[];
  amenities: PublicResaleListingAmenityDto[];
  createdAt: string;
  updatedAt: string;
}

export interface AdminResaleListingDto extends PublicResaleListingDto {
  projectId?: string | null;
  locationId?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  geometry?: string | null;
  listingPartyType: ListingPartyType;
  listingPartyDisplayName?: string | null;
  ownerName?: string | null;
  ownerPhone?: string | null;
  ownerEmail?: string | null;
  brokerName?: string | null;
  brokerPhone?: string | null;
  brokerEmail?: string | null;
  privatePhone?: string | null;
  privateEmail?: string | null;
  internalNotes?: string | null;
  source?: string | null;
  crmId?: string | null;
  lifecycleStatus: ResaleLifecycleStatus;
  verificationStatus: ResaleVerificationStatus;
  verifiedAt?: string | null;
  verifiedBy?: string | null;
}
