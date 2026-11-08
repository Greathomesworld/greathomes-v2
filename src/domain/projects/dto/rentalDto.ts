import {
  PropertyType,
  FurnishingStatus,
  FacingDirection,
  FloorCategory,
  PossessionStatus,
  RentalLifecycleStatus,
  RentalVerificationStatus,
  ListingPartyType,
  ProjectMediaCategory,
} from '../entities/rentalEntities';
export type {
  PropertyType,
  FurnishingStatus,
  FacingDirection,
  FloorCategory,
  PossessionStatus,
  RentalLifecycleStatus,
  RentalVerificationStatus,
  ListingPartyType,
  ProjectMediaCategory,
};
import { BoundedLocationDto } from '../dto/projectDto';

export interface BoundedRentalProjectDto {
  id: string;
  name: string;
  slug: string;
  location: BoundedLocationDto | null;
  developerName?: string | null;
  developerSlug?: string | null;
  status?: string | null;
  shortDescription?: string | null;
  reraVerified?: boolean;
  featuredImageUrl?: string | null;
  bhkSummary?: string | number[] | null;
  startingPrice?: number | null;
}

export interface BoundedRentalMediaDto {
  id: string;
  category: ProjectMediaCategory;
  url: string;
  altText: string | null;
  caption: string | null;
  sortOrder: number;
  isFeatured: boolean;
}

export interface BoundedRentalAmenityDto {
  id: string;
  name: string;
  category: string;
}

export interface PublicRentalListingDto {
  id: string;
  slug?: string | null;
  projectId: string | null;
  project: BoundedRentalProjectDto | null;
  location?: BoundedLocationDto | null;
  propertyType: PropertyType;
  configuration: string;
  bedroomCount: number;
  carpetArea: number | null;
  builtUpArea: number | null;
  superBuiltUpArea: number | null;

  monthlyRent: number;
  maintenance: number | null;
  securityDeposit: number | null;

  furnishing: FurnishingStatus;
  facing: FacingDirection;
  floorCategory: FloorCategory;
  possession: PossessionStatus;
  availabilityDate: string | null;
  leaseDuration: string | null;
  noticePeriod: string | null;
  description: string | null;

  listingParty: {
    type: ListingPartyType;
    label: string;
  };

  verificationStatus: RentalVerificationStatus;
  isVerified: boolean;
  verifiedAt: string | null;

  amenities: BoundedRentalAmenityDto[];
  media: BoundedRentalMediaDto[];

  createdAt: string;
  updatedAt: string;
}

export interface AdminRentalListingDto extends PublicRentalListingDto {
  locationId?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  geometry?: string | null;
  lifecycleStatus: RentalLifecycleStatus;
  internalNotes: string | null;
  source: string | null;
  crmId: string | null;
  verifiedBy: string | null;
  ownerName: string | null;
  ownerPhone: string | null;
  ownerEmail: string | null;
  brokerName: string | null;
  brokerPhone: string | null;
  brokerEmail: string | null;
  privatePhone: string | null;
  privateEmail: string | null;
}
