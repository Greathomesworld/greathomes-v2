import { LocationType } from '../locations/entities';
import { MetricScope } from '../marketIntelligence/types';
import {
  MarketOverviewDto,
  SupplyIntelligenceDto,
  PriceIntelligenceDto,
  ReraIntelligenceDto,
  ConnectivityIntelligenceDto,
  RecentActivityDto,
  ConfigurationDistributionDto,
  LocationBreadcrumbDto,
} from '../marketIntelligence/dto/locationIntelligenceDto';
import { MarketFreshnessInfo } from '../marketIntelligence/entities';

export type PriceBasisType = 'CARPET_AREA' | 'BUILT_UP_AREA' | 'SUPER_BUILT_UP_AREA';

export interface LocationComparisonItemDTO {
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
  description: string | null;
  marketOverview: MarketOverviewDto;
  supply: SupplyIntelligenceDto;
  pricing: PriceIntelligenceDto;
  rera: ReraIntelligenceDto;
  connectivity: ConnectivityIntelligenceDto;
  recentActivity: RecentActivityDto;
  freshness: MarketFreshnessInfo;
  historicalSnapshots?: any[];
}

export interface MetricRowValue {
  metric: string;
  key: string;
  values: Record<string, number | string | null>;
  description?: string;
}

export interface HistoricalChangeValue {
  latest: number;
  previous: number;
  changePercent: number | null;
}

export interface SupplyMetricRow {
  metric: string;
  key: string;
  values: Record<string, number | string | null>;
  historicalChanges?: Record<string, HistoricalChangeValue | null>;
}

export interface PricingComparisonBasisRow {
  basis: PriceBasisType;
  basisDisplay: string;
  metrics: {
    label: string;
    key: 'minRatePerSqft' | 'medianRatePerSqft' | 'maxRatePerSqft' | 'avgRatePerSqft';
    values: Record<string, number | null>;
  }[];
}

export interface ConfigurationRow {
  label: string;
  key: string;
  values: Record<string, number>;
}

export interface ReraRow {
  label: string;
  key: string;
  values: Record<string, number | string>;
}

export interface ConnectivityRow {
  category: string;
  categoryDisplay: string;
  closestPlaceName: Record<string, string | null>;
  closestDistanceKm: Record<string, number | null>;
  placeCount: Record<string, number>;
}

export interface LocationComparisonScopeDTO {
  mode: MetricScope;
  isSameHierarchyLevel: boolean;
  hierarchyLevels: string[];
  primaryLevel: string | null;
  scopeDescription: string;
}

export interface LocationComparisonDTO {
  locations: LocationComparisonItemDTO[];
  comparisonScope: LocationComparisonScopeDTO;
  matrix: {
    overview: MetricRowValue[];
    supply: SupplyMetricRow[];
    pricing: PricingComparisonBasisRow[];
    configurations: ConfigurationRow[];
    rera: ReraRow[];
    connectivity: ConnectivityRow[];
  };
  freshnessSummary: {
    asOfDates: Record<string, string>;
    status: Record<string, string>;
    sourceType: Record<string, string>;
  };
}
