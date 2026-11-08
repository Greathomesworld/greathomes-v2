import { LocationType } from '../../locations/entities';
import { MetricScope } from '../types';
import { MarketFreshnessInfo } from '../entities';

export interface LocationBreadcrumbDto {
  name: string;
  slug: string;
  type: LocationType;
  canonicalPath: string;
}

export interface PublicLocationIntelligenceLocationDto {
  id: string;
  name: string;
  slug: string;
  level: LocationType;
  levelDisplay: string;
  city?: string | null;
  district?: string | null;
  state?: string | null;
  breadcrumb: LocationBreadcrumbDto[];
  canonicalPath: string;
  latitude?: number | null;
  longitude?: number | null;
  description?: string | null;
}

export interface MarketOverviewDto {
  publishedProjects: number;
  newLaunchProjects: number;
  underConstructionProjects: number;
  readyToMoveProjects: number;
  completedProjects: number;
  soldOutProjects: number;
  resaleListings: number;
  rentalListings: number;
  unverifiedResaleListings?: number;
  unverifiedRentalListings?: number;
}

export interface ConfigurationDistributionDto {
  bhk1Count: number;
  bhk2Count: number;
  bhk3Count: number;
  bhk4Count: number;
  bhk5PlusCount: number;
  otherCount: number;
}

export interface SupplyIntelligenceDto {
  marketOverview: MarketOverviewDto;
  projectConfigurationDistribution: ConfigurationDistributionDto;
  resaleConfigurationDistribution: ConfigurationDistributionDto | 'NOT_AVAILABLE';
  rentalConfigurationDistribution: ConfigurationDistributionDto | 'NOT_AVAILABLE';
  scope: MetricScope;
}

export interface PriceMetricBasisSummaryDto {
  minRatePerSqft: number;
  maxRatePerSqft: number;
  medianRatePerSqft: number;
  avgRatePerSqft: number;
  sampleCount: number;
}

export interface PriceBasisBreakdownDto {
  carpetArea?: PriceMetricBasisSummaryDto | 'NO_DATA';
  builtUpArea?: PriceMetricBasisSummaryDto | 'NO_DATA';
  superBuiltUpArea?: PriceMetricBasisSummaryDto | 'NO_DATA';
}

export interface RentalPriceSummaryDto {
  minMonthlyRent: number | null;
  maxMonthlyRent: number | null;
  medianMonthlyRent: number | null;
  avgMonthlyRent: number | null;
  sampleCount: number;
}

export interface PriceIntelligenceDto {
  newBooking: PriceBasisBreakdownDto;
  resale: PriceBasisBreakdownDto | 'NO_DATA';
  rental: RentalPriceSummaryDto | 'NO_DATA';
  status: 'CURRENT' | 'NO_DATA' | 'NOT_ENOUGH_DATA';
}

export interface ReraIntelligenceDto {
  verifiedReraProjects: number;
  providedReraProjects: number;
  projectsWithoutReraData: number;
  totalPublishedProjects: number;
  verifiedPercentage: number | 'NOT_AVAILABLE';
}

export interface ConnectivityPlaceDto {
  id: string;
  name: string;
  category: string;
  distanceKm: number;
  distanceDisplay: string;
  latitude?: number | null;
  longitude?: number | null;
}

export interface ConnectivityIntelligenceDto {
  status: 'AVAILABLE' | 'NOT_AVAILABLE';
  placesByCategory: Record<string, ConnectivityPlaceDto[]>;
  totalNearbyPlaces: number;
}

export interface PublicProjectRefDto {
  id: string;
  name: string;
  slug: string;
  canonicalPath: string;
}

export interface PublicLocationRefDto {
  id: string;
  name: string;
  slug: string;
  canonicalPath: string;
}

export interface PublicMarketEventDto {
  id: string;
  eventType: string;
  resourceType: string;
  resourceId: string;
  locationId: string;
  title: string;
  summary: string;
  eventDate: string;
  occurredAt?: string;
  project?: PublicProjectRefDto | null;
  location?: PublicLocationRefDto | null;
  sourceType?: string;
  metadata?: Record<string, any> | null;
}

export interface RecentActivityDto {
  events: PublicMarketEventDto[];
  totalEvents: number;
  scope?: MetricScope;
  summaryText?: string;
  recordedUpdatesCount?: number;
}

export interface LocationIntelligenceDTO {
  location: PublicLocationIntelligenceLocationDto;
  scope: MetricScope;
  marketOverview: MarketOverviewDto;
  supply: SupplyIntelligenceDto;
  pricing: PriceIntelligenceDto;
  rera: ReraIntelligenceDto;
  connectivity: ConnectivityIntelligenceDto;
  recentActivity: RecentActivityDto;
  freshness: MarketFreshnessInfo;
  sourceType: 'LIVE_METRIC' | 'SNAPSHOT_METRIC';
}
