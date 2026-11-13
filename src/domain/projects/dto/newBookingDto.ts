export const CONFIGURATION_AVAILABILITY_STATUSES = [
  'AVAILABLE',
  'LIMITED',
  'ON_REQUEST',
  'SOLD_OUT',
  'NOT_AVAILABLE',
] as const;

export type ConfigurationAvailabilityStatus = (typeof CONFIGURATION_AVAILABILITY_STATUSES)[number];

export const PUBLIC_NEW_BOOKING_ACTIVE_STATUSES: readonly ConfigurationAvailabilityStatus[] = [
  'AVAILABLE',
  'LIMITED',
  'ON_REQUEST',
];

export function isValidConfigurationAvailabilityStatus(
  value: unknown
): value is ConfigurationAvailabilityStatus {
  return (
    typeof value === 'string' &&
    (CONFIGURATION_AVAILABILITY_STATUSES as readonly string[]).includes(value)
  );
}

export function isPubliclyBookableAvailabilityStatus(
  status: ConfigurationAvailabilityStatus | string | null | undefined
): boolean {
  return (
    status === 'AVAILABLE' ||
    status === 'LIMITED' ||
    status === 'ON_REQUEST'
  );
}

export interface ProjectConfigurationAvailability {
  id: string;
  projectId: string;
  configurationId: string;
  availabilityStatus: ConfigurationAvailabilityStatus;
  availableFrom?: Date | null;
  lastVerifiedAt: Date;
  updatedByStaffId?: string | null;
  updatedByStaffName?: string | null;
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

