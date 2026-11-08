import { PropertyType, ProjectMediaCategory } from '../entities';
export type { PropertyType, ProjectMediaCategory };

export type ListingPartyType = 'OWNER' | 'LISTING_PARTNER';

export type RentalLifecycleStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'PUBLISHED'
  | 'PAUSED'
  | 'SOLD_RENTED'
  | 'ARCHIVED';

export type RentalVerificationStatus = 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'REJECTED';

export type FurnishingStatus = 'UNFURNISHED' | 'SEMI_FURNISHED' | 'FULLY_FURNISHED';

export type FacingDirection =
  | 'NORTH'
  | 'SOUTH'
  | 'EAST'
  | 'WEST'
  | 'NORTH_EAST'
  | 'NORTH_WEST'
  | 'SOUTH_EAST'
  | 'SOUTH_WEST'
  | 'UNKNOWN';

export type FloorCategory = 'LOWER_FLOOR' | 'MID_FLOOR' | 'HIGH_FLOOR';

export type PossessionStatus = 'READY' | 'UNDER_CONSTRUCTION' | 'OCCUPIED' | 'AVAILABLE_FROM_DATE';

export interface RentalListingAmenity {
  id: string;
  rentalListingId: string;
  amenityId: string;
}

export interface RentalListingMedia {
  id: string;
  rentalListingId: string;
  mediaType: string;
  category: ProjectMediaCategory;
  url: string;
  altText?: string | null;
  caption?: string | null;
  sortOrder: number;
  isFeatured: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface RentalListing {
  id: string;
  slug?: string | null;
  projectId?: string | null;
  locationId?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  geometry?: string | null;
  propertyType: PropertyType;
  configuration: string;
  bedroomCount: number;
  carpetArea?: number | null;
  builtUpArea?: number | null;
  superBuiltUpArea?: number | null;

  monthlyRent: number;
  maintenance?: number | null;
  securityDeposit?: number | null;

  furnishing: FurnishingStatus;
  facing: FacingDirection;
  floorCategory: FloorCategory;
  possession: PossessionStatus;
  availabilityDate?: Date | null;
  leaseDuration?: string | null;
  noticePeriod?: string | null;
  description?: string | null;

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

  lifecycleStatus: RentalLifecycleStatus;
  verificationStatus: RentalVerificationStatus;
  verifiedAt?: Date | null;
  verifiedBy?: string | null;

  createdAt: Date;
  updatedAt: Date;
}
