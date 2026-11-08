import { PropertyType, ProjectMediaCategory } from '../entities';
export type { PropertyType, ProjectMediaCategory };

export type ListingPartyType = 'OWNER' | 'LISTING_PARTNER';

export type ResaleLifecycleStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'PUBLISHED'
  | 'PAUSED'
  | 'SOLD_RENTED'
  | 'ARCHIVED';

export type ResaleVerificationStatus = 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'REJECTED';

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

export interface ResaleListingAmenity {
  id: string;
  resaleListingId: string;
  amenityId: string;
}

export interface ResaleListingMedia {
  id: string;
  resaleListingId: string;
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

export interface ResaleListing {
  id: string;
  slug?: string | null;
  projectId?: string | null; // Nullable project reference
  locationId?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  geometry?: string | null;
  propertyType: PropertyType;
  configuration: string; // e.g. "3 BHK"
  bedroomCount: number;
  carpetArea?: number | null;
  builtUpArea?: number | null;
  superBuiltUpArea?: number | null;
  askingPrice: number; // TOTAL ASKING PRICE ONLY
  furnishing: FurnishingStatus;
  facing: FacingDirection;
  floorCategory: FloorCategory;
  possession: PossessionStatus;
  possessionDate?: Date | null;
  description?: string | null;

  // Listing Party Model (Private operational fields)
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

  // Lifecycle & Verification
  lifecycleStatus: ResaleLifecycleStatus;
  verificationStatus: ResaleVerificationStatus;
  verifiedAt?: Date | null;
  verifiedBy?: string | null;

  createdAt: Date;
  updatedAt: Date;
}
