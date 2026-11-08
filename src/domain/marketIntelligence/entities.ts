import { FreshnessStatus, MetricScope, MarketEventType, DataQualitySeverity, DataQualityCode } from './types';

export interface MarketFreshnessInfo {
  dataAsOf: string; // ISO date string
  lastCalculatedAt: string; // ISO date string
  freshnessStatus: FreshnessStatus;
  sourceType: string;
  sourceLabel: string;
}

export interface PriceMetricsPerBasis {
  priceBasis: 'CARPET_AREA' | 'BUILT_UP_AREA' | 'SUPER_BUILT_UP_AREA';
  minRatePerSqft: number | null;
  maxRatePerSqft: number | null;
  medianRatePerSqft: number | null;
  avgRatePerSqft: number | null;
  sampleCount: number;
}

export interface ConfigurationDistribution {
  bhk1Count: number;
  bhk2Count: number;
  bhk3Count: number;
  bhk4Count: number;
  bhk5PlusCount: number;
  otherCount: number;
}

export interface ReraCoverageMetrics {
  verifiedProjects: number;
  providedProjects: number;
  notProvidedProjects: number;
  totalProjects: number;
  verifiedPercentage: number; // verified / totalProjects * 100
}

export interface SupplyMetrics {
  totalProjects: number;
  publishedProjects: number;
  newLaunchProjects: number;
  underConstructionProjects: number;
  readyToMoveProjects: number;
  completedProjects: number;
  soldOutProjects: number;
  resaleListingsCount: number;
  rentalListingsCount: number;
  unverifiedResaleListingsCount?: number;
  unverifiedRentalListingsCount?: number;
  configurationDistribution: ConfigurationDistribution;
  scope: MetricScope;
}

export interface LocationMarketSnapshot {
  id: string;
  locationId: string;
  snapshotDate: string; // YYYY-MM-DD
  projectCount: number;
  publishedProjectCount: number;
  newLaunchCount: number;
  underConstructionCount: number;
  readyToMoveCount: number;
  completedProjectCount: number;
  soldOutProjectCount: number;
  resaleListingCount: number;
  rentalListingCount: number;
  configurationCounts: ConfigurationDistribution;
  priceMetrics: PriceMetricsPerBasis[];
  reraMetrics: ReraCoverageMetrics;
  dataFreshness: MarketFreshnessInfo;
  source: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface MarketEvent {
  id: string;
  eventType: MarketEventType;
  resourceType: 'PROJECT' | 'RESALE_LISTING' | 'RENTAL_LISTING' | 'LOCATION';
  resourceId: string;
  locationId: string;
  projectId?: string | null;
  previousValue?: string | null;
  newValue?: string | null;
  changeFingerprint: string;
  metadata?: Record<string, any> | null;
  eventDate: Date;
  createdAt: Date;
}

export interface DataQualityIssue {
  id: string;
  severity: DataQualitySeverity;
  entityType: string;
  entityId: string;
  field?: string | null;
  code: DataQualityCode;
  message: string;
  detectedAt: Date;
}

export interface ChangeCalculationResult {
  currentCount: number;
  previousCount: number;
  absoluteChange: number;
  percentageChange: number | 'NOT_APPLICABLE';
}
