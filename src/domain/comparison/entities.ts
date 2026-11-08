export type ComparisonMode = 'PROJECTS' | 'RESALE' | 'RENTAL';

export interface ComparisonItem {
  resourceType: 'PROJECT' | 'RESALE_LISTING' | 'RENTAL_LISTING';
  resourceId: string;
  addedAt: string;
}

export interface ComparisonSession {
  id: string;
  customerId?: string | null;
  mode: ComparisonMode;
  items: ComparisonItem[];
  createdAt: string;
  updatedAt: string;
}

export interface ProjectComparisonDto {
  id: string;
  slug: string;
  name: string;
  developer: {
    id: string;
    name: string;
    slug: string;
  };
  location: {
    id: string;
    name: string;
    slug: string;
    type: string;
  };
  status: string;
  stage: string;
  startingPrice: number | null;
  startingPriceDisplay: string;
  priceBasis: string | null;
  projectArea: string | null;
  towerCount: number | null;
  totalUnits: number | null;
  configurationsSummary: string | null;
  floors: string | null;
  possession: string | null;
  reraStatus: string;
  reraRegistrationNumber: string | null;
  hasVerifiedReraBadge: boolean;
  amenities: { id: string; name: string; category: string }[];
  snapshot: {
    projectArea: string | null;
    towerCount: number | null;
    totalUnits: number | null;
    configurations: string | null;
    floors: string | null;
    possession: string | null;
  };
  isAvailable: boolean;
  unavailableReason?: string;
  thumbnailUrl?: string | null;
}

export interface ResaleComparisonDto {
  id: string;
  slug: string;
  title: string;
  propertyType: string;
  configuration: string;
  locationName: string;
  projectName?: string | null;
  carpetArea?: number | null;
  builtUpArea?: number | null;
  superBuiltUpArea?: number | null;
  askingPrice: number;
  askingPriceDisplay: string;
  furnishing: string;
  facing?: string | null;
  floorCategory: string; // LOWER_FLOOR | MID_FLOOR | HIGH_FLOOR
  possessionStatus?: string | null;
  amenities: string[];
  verificationStatus: string;
  listingPartyType: string; // Owner Listed | Listing Partner
  isAvailable: boolean;
  unavailableReason?: string;
  thumbnailUrl?: string | null;
}

export interface RentalComparisonDto {
  id: string;
  slug: string;
  title: string;
  propertyType: string;
  configuration: string;
  locationName: string;
  projectName?: string | null;
  carpetArea?: number | null;
  builtUpArea?: number | null;
  superBuiltUpArea?: number | null;
  monthlyRent: number;
  monthlyRentDisplay: string;
  maintenance?: number | null;
  securityDeposit?: number | null;
  furnishing: string;
  facing?: string | null;
  floorCategory: string; // LOWER_FLOOR | MID_FLOOR | HIGH_FLOOR
  availabilityStatus: string;
  amenities: string[];
  verificationStatus: string;
  isAvailable: boolean;
  unavailableReason?: string;
  thumbnailUrl?: string | null;
}
