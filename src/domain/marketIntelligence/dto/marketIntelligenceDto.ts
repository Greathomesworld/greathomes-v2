import { LocationMarketSnapshot, MarketEvent, SupplyMetrics, PriceMetricsPerBasis, ReraCoverageMetrics, MarketFreshnessInfo } from '../entities';

export interface BoundedLocationHeaderDto {
  id: string;
  name: string;
  slug: string;
  type: string;
}

export interface PublicLocationMarketSummaryDto {
  location: BoundedLocationHeaderDto;
  supply: SupplyMetrics;
  priceMetrics: PriceMetricsPerBasis[];
  reraCoverage: ReraCoverageMetrics;
  latestSnapshot?: {
    snapshotDate: string;
    publishedProjectCount: number;
    resaleListingCount: number;
    rentalListingCount: number;
  } | null;
  freshness: MarketFreshnessInfo;
}

export interface PublicMarketEventDto {
  id: string;
  eventType: string;
  resourceType: string;
  resourceId: string;
  locationId: string;
  title: string;
  description: string;
  eventDate: string;
}

export interface PublicLocationComparisonDto {
  locationA: {
    info: BoundedLocationHeaderDto;
    supply: SupplyMetrics;
    priceMetrics: PriceMetricsPerBasis[];
    reraCoverage: ReraCoverageMetrics;
  };
  locationB: {
    info: BoundedLocationHeaderDto;
    supply: SupplyMetrics;
    priceMetrics: PriceMetricsPerBasis[];
    reraCoverage: ReraCoverageMetrics;
  };
  freshness: MarketFreshnessInfo;
}

export function toPublicMarketEventDto(event: MarketEvent): PublicMarketEventDto {
  const titles: Record<string, string> = {
    PROJECT_PUBLISHED: 'New Project Added',
    PROJECT_STATUS_CHANGED: 'Project Stage Updated',
    PROJECT_RERA_VERIFIED: 'RERA Verification Completed',
    PROJECT_PRICE_CHANGED: 'Starting Price Updated',
    RESALE_LISTING_PUBLISHED: 'Resale Opportunity Listed',
    RENTAL_LISTING_PUBLISHED: 'Rental Opportunity Listed',
  };

  return {
    id: event.id,
    eventType: event.eventType,
    resourceType: event.resourceType,
    resourceId: event.resourceId,
    locationId: event.locationId,
    title: titles[event.eventType] || 'Market Update',
    description: `Factual market update for ${event.resourceType.toLowerCase().replace('_', ' ')}.`,
    eventDate: event.eventDate.toISOString(),
  };
}
