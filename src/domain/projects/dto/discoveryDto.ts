import { PropertyType, ProjectStatus } from '../entities';

export interface DiscoveryPagination {
  page: number;
  pageSize: number;
  total: number;
  totalCount?: number;
  totalPages: number;
}

export interface BoundedLocation {
  id: string;
  name: string;
  slug: string;
  type: string;
}

export interface BoundedProject {
  id: string;
  name: string;
  slug: string;
  developer: { id?: string; name: string; slug: string } | null;
  location: BoundedLocation | null;
  startingPrice?: number | null;
  priceOnRequest?: boolean;
  propertyTypes: PropertyType[];
  bhkSummary: number[];
  reraVerified: boolean;
  featuredImageUrl?: string | null;
  status?: ProjectStatus;
}

export type DiscoveryResultType = 'PROJECT' | 'NEW_BOOKING' | 'RESALE' | 'RENT';

export interface BaseDiscoveryCard {
  id: string;
  type: DiscoveryResultType;
  featuredImageUrl?: string | null;
}

export interface ProjectDiscoveryCardDto extends BaseDiscoveryCard {
  type: 'PROJECT';
  name: string;
  slug: string;
  developer: { id?: string; name: string; slug: string } | null;
  location: BoundedLocation | null;
  propertyTypes: PropertyType[];
  bhkSummary: number[];
  startingPrice?: number | null;
  priceOnRequest?: boolean;
  reraVerified: boolean;
  recommendationReason?: string;
  status?: ProjectStatus;
  distanceKm?: number | null;
  formattedDistance?: string | null;
}

export interface NewBookingDiscoveryCardDto extends BaseDiscoveryCard {
  type: 'NEW_BOOKING';
  project: BoundedProject;
  configurationName: string;
  bedroomCount?: number | null;
  carpetArea?: number | null;
  price: number;
  priceBasis: string;
  priceOnRequest?: boolean;
  effectivePricePerSqft: number;
  availabilityStatus: string;
  reraVerified: boolean;
}

export interface ResaleDiscoveryCardDto extends BaseDiscoveryCard {
  type: 'RESALE';
  slug?: string | null;
  project: BoundedProject | null;
  propertyType: PropertyType;
  configuration: string;
  bedroomCount: number;
  carpetArea?: number | null;
  askingPrice: number;
  furnishing: string;
  floorCategory: string;
  listingPartyLabel: string;
  verificationStatus: string;
  location: BoundedLocation | null;
  distanceKm?: number | null;
  formattedDistance?: string | null;
}

export interface RentDiscoveryCardDto extends BaseDiscoveryCard {
  type: 'RENT';
  slug?: string | null;
  project: BoundedProject | null;
  propertyType: PropertyType;
  configuration: string;
  bedroomCount: number;
  carpetArea?: number | null;
  monthlyRent: number;
  maintenance?: number | null;
  securityDeposit?: number | null;
  furnishing: string;
  floorCategory: string;
  listingPartyLabel: string;
  verificationStatus: string;
  location: BoundedLocation | null;
  distanceKm?: number | null;
  formattedDistance?: string | null;
}

export type PropertyDiscoveryCardDto =
  | ProjectDiscoveryCardDto
  | NewBookingDiscoveryCardDto
  | ResaleDiscoveryCardDto
  | RentDiscoveryCardDto;

export interface DiscoveryResponse<T> {
  data: T[];
  pagination: DiscoveryPagination;
  countsByType?: {
    newBooking: number;
    resale: number;
  };
}

export type SearchResultType = 'PROJECT' | 'DEVELOPER' | 'LOCATION';

export interface SearchResultDto {
  type: SearchResultType;
  id: string;
  name: string;
  slug: string;
  subtitle?: string | null;
}
