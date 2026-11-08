import { ChangeCalculationResult, MarketFreshnessInfo } from './entities';
import { FreshnessStatus } from './types';

export function calculateMean(values: number[]): number | null {
  if (!values || values.length === 0) return null;
  const sum = values.reduce((acc, val) => acc + val, 0);
  return Math.round(sum / values.length);
}

export function calculateMedian(values: number[]): number | null {
  if (!values || values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  }
  return Math.round(sorted[mid]);
}

export function calculatePercentile(values: number[], percentile: number): number | null {
  if (!values || values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(Math.floor((percentile / 100) * sorted.length), sorted.length - 1);
  return Math.round(sorted[index]);
}

export function calculateChange(current: number, previous: number): ChangeCalculationResult {
  const currentCount = Number(current) || 0;
  const previousCount = Number(previous) || 0;
  const absoluteChange = currentCount - previousCount;

  if (previousCount === 0) {
    return {
      currentCount,
      previousCount,
      absoluteChange,
      percentageChange: 'NOT_APPLICABLE',
    };
  }

  const percentageChange = Math.round(((currentCount - previousCount) / previousCount) * 100 * 10) / 10;
  return {
    currentCount,
    previousCount,
    absoluteChange,
    percentageChange,
  };
}

export function determineFreshnessStatus(lastUpdated: Date | string | null | undefined): FreshnessStatus {
  if (!lastUpdated) return 'UNKNOWN';
  const d = new Date(lastUpdated);
  if (isNaN(d.getTime())) return 'UNKNOWN';

  const diffMs = Date.now() - d.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  if (diffDays <= 7) return 'CURRENT';
  if (diffDays <= 30) return 'RECENT';
  return 'STALE';
}

export function buildFreshnessInfo(
  dataAsOfDate?: Date | string | null,
  sourceLabel = 'Great Homes Residential Database'
): MarketFreshnessInfo {
  const dataAsOf = dataAsOfDate ? new Date(dataAsOfDate).toISOString() : new Date().toISOString();
  const lastCalculatedAt = new Date().toISOString();
  const freshnessStatus = determineFreshnessStatus(dataAsOf);

  return {
    dataAsOf,
    lastCalculatedAt,
    freshnessStatus,
    sourceType: 'GREAT_HOMES_DB',
    sourceLabel,
  };
}
