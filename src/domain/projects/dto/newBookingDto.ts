export type ConfigurationAvailabilityStatus =
  | 'AVAILABLE'
  | 'LIMITED'
  | 'ON_REQUEST'
  | 'SOLD_OUT'
  | 'NOT_AVAILABLE';

export interface ProjectConfigurationAvailability {
  id: string;
  projectId: string;
  configurationId: string;
  availabilityStatus: ConfigurationAvailabilityStatus;
  availableFrom?: Date | null;
  lastVerifiedAt: Date;
  source?: string | null;
  internalNotes?: string | null; // private internal
  createdAt: Date;
  updatedAt: Date;
}

export interface PublicNewBookingConfigurationDto {
  id: string;
  configurationId: string;
  name: string;
  bedroomCount?: number | null;
  carpetArea?: number | null;
  builtUpArea?: number | null;
  superBuiltUpArea?: number | null;
  price: number;
  priceBasis: string;
  priceOnRequest?: boolean;
  effectivePricePerSqft: number;
  availabilityStatus: ConfigurationAvailabilityStatus;
  lastVerifiedAt: string; // ISO string
  floorPlanMediaId?: string | null;
  floorPlanUrl?: string | null;
}
