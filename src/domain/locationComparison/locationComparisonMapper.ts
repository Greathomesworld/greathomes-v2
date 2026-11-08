import {
  LocationComparisonItemDTO,
  LocationComparisonDTO,
  MetricRowValue,
  SupplyMetricRow,
  PricingComparisonBasisRow,
  ConfigurationRow,
  ReraRow,
  ConnectivityRow,
  HistoricalChangeValue,
  PriceBasisType,
} from './locationComparisonTypes';
import { HierarchyValidationResult } from './locationComparisonValidation';
import { MetricScope } from '../marketIntelligence/types';

export function buildLocationComparisonDTO(
  items: LocationComparisonItemDTO[],
  hierarchyInfo: HierarchyValidationResult,
  scope: MetricScope = 'DESCENDANT'
): LocationComparisonDTO {
  // Sort locations deterministically by slug
  const sortedItems = [...items].sort((a, b) => a.slug.localeCompare(b.slug));

  // 1. Matrix: Overview
  const overviewRows: MetricRowValue[] = [
    {
      metric: 'Published Residential Projects',
      key: 'publishedProjects',
      values: Object.fromEntries(sortedItems.map((loc) => [loc.slug, loc.marketOverview.publishedProjects])),
      description: 'Active residential housing projects currently verified and published.',
    },
    {
      metric: 'Resale Homes',
      key: 'resaleListings',
      values: Object.fromEntries(sortedItems.map((loc) => [loc.slug, loc.marketOverview.resaleListings])),
      description: 'Individual residential units available for secondary purchase.',
    },
    {
      metric: 'Rental Homes',
      key: 'rentalListings',
      values: Object.fromEntries(sortedItems.map((loc) => [loc.slug, loc.marketOverview.rentalListings])),
      description: 'Residential apartments and villas available on lease/rent.',
    },
    {
      metric: 'RERA Verified Projects',
      key: 'reraVerifiedProjects',
      values: Object.fromEntries(sortedItems.map((loc) => [loc.slug, loc.rera.verifiedReraProjects])),
      description: 'Projects with confirmed state RERA registration records.',
    },
    {
      metric: 'RERA Provided Projects',
      key: 'reraProvidedProjects',
      values: Object.fromEntries(sortedItems.map((loc) => [loc.slug, loc.rera.providedReraProjects])),
      description: 'Projects with declared registration numbers under verification.',
    },
    {
      metric: 'Latest Snapshot Date',
      key: 'latestSnapshotDate',
      values: Object.fromEntries(
        sortedItems.map((loc) => {
          const snaps = loc.historicalSnapshots || [];
          const latest = snaps.length > 0 ? snaps[0].snapshotDate : null;
          return [loc.slug, latest || (loc.freshness ? new Date(loc.freshness.dataAsOf).toISOString().split('T')[0] : null)];
        })
      ),
      description: 'Most recent date of recorded market telemetry.',
    },
  ];

  // 2. Matrix: Supply & Historical Factual Changes
  const calculateChange = (snaps: any[] | undefined, extractor: (s: any) => number): HistoricalChangeValue | null => {
    if (!snaps || snaps.length < 2) return null;
    const latest = extractor(snaps[0]);
    const prev = extractor(snaps[1]);
    if (typeof latest !== 'number' || typeof prev !== 'number') return null;
    const changePercent = prev > 0 ? Number((((latest - prev) / prev) * 100).toFixed(1)) : null;
    return {
      latest,
      previous: prev,
      changePercent,
    };
  };

  const supplyRows: SupplyMetricRow[] = [
    {
      metric: 'Published Projects',
      key: 'publishedProjects',
      values: Object.fromEntries(sortedItems.map((loc) => [loc.slug, loc.marketOverview.publishedProjects])),
      historicalChanges: Object.fromEntries(
        sortedItems.map((loc) => [
          loc.slug,
          calculateChange(loc.historicalSnapshots, (s) => s.publishedProjectCount ?? s.projectCount ?? 0),
        ])
      ),
    },
    {
      metric: 'Resale Listings',
      key: 'resaleListings',
      values: Object.fromEntries(sortedItems.map((loc) => [loc.slug, loc.marketOverview.resaleListings])),
      historicalChanges: Object.fromEntries(
        sortedItems.map((loc) => [
          loc.slug,
          calculateChange(loc.historicalSnapshots, (s) => s.resaleListingCount ?? 0),
        ])
      ),
    },
    {
      metric: 'Rental Listings',
      key: 'rentalListings',
      values: Object.fromEntries(sortedItems.map((loc) => [loc.slug, loc.marketOverview.rentalListings])),
      historicalChanges: Object.fromEntries(
        sortedItems.map((loc) => [
          loc.slug,
          calculateChange(loc.historicalSnapshots, (s) => s.rentalListingCount ?? 0),
        ])
      ),
    },
  ];

  // 3. Matrix: Pricing (Strict Basis Isolation)
  const bases: { basis: PriceBasisType; display: string }[] = [
    { basis: 'CARPET_AREA', display: 'Carpet Area' },
    { basis: 'BUILT_UP_AREA', display: 'Built-Up Area' },
    { basis: 'SUPER_BUILT_UP_AREA', display: 'Super Built-Up Area' },
  ];

  const pricingRows: PricingComparisonBasisRow[] = bases.map(({ basis, display }) => {
    const basisKey = basis === 'CARPET_AREA' ? 'carpetArea' : basis === 'BUILT_UP_AREA' ? 'builtUpArea' : 'superBuiltUpArea';

    const getMetricValue = (loc: LocationComparisonItemDTO, metricKey: 'minRatePerSqft' | 'medianRatePerSqft' | 'maxRatePerSqft' | 'avgRatePerSqft'): number | null => {
      const breakdown = loc.pricing.newBooking[basisKey];
      if (!breakdown || breakdown === 'NO_DATA') {
        // Fallback to checking the latest snapshot priceMetrics if available
        const latestSnap = loc.historicalSnapshots?.[0];
        if (latestSnap?.priceMetrics && Array.isArray(latestSnap.priceMetrics)) {
          const matched = latestSnap.priceMetrics.find((m: any) => m.priceBasis === basis);
          if (matched && typeof matched[metricKey] === 'number') {
            return matched[metricKey];
          }
        }
        return null;
      }
      return breakdown[metricKey] ?? null;
    };

    return {
      basis,
      basisDisplay: display,
      metrics: [
        {
          label: 'Minimum Rate (₹/sq.ft.)',
          key: 'minRatePerSqft',
          values: Object.fromEntries(sortedItems.map((loc) => [loc.slug, getMetricValue(loc, 'minRatePerSqft')])),
        },
        {
          label: 'Median Rate (₹/sq.ft.)',
          key: 'medianRatePerSqft',
          values: Object.fromEntries(sortedItems.map((loc) => [loc.slug, getMetricValue(loc, 'medianRatePerSqft')])),
        },
        {
          label: 'Maximum Rate (₹/sq.ft.)',
          key: 'maxRatePerSqft',
          values: Object.fromEntries(sortedItems.map((loc) => [loc.slug, getMetricValue(loc, 'maxRatePerSqft')])),
        },
        {
          label: 'Average Rate (₹/sq.ft.)',
          key: 'avgRatePerSqft',
          values: Object.fromEntries(sortedItems.map((loc) => [loc.slug, getMetricValue(loc, 'avgRatePerSqft')])),
        },
      ],
    };
  });

  // 4. Matrix: Configuration Distribution
  const configKeys: { key: keyof typeof sortedItems[0]['supply']['projectConfigurationDistribution']; label: string }[] = [
    { key: 'bhk1Count', label: '1 BHK' },
    { key: 'bhk2Count', label: '2 BHK' },
    { key: 'bhk3Count', label: '3 BHK' },
    { key: 'bhk4Count', label: '4 BHK' },
    { key: 'bhk5PlusCount', label: '5+ BHK' },
  ];

  const configurationRows: ConfigurationRow[] = configKeys.map(({ key, label }) => ({
    label,
    key,
    values: Object.fromEntries(
      sortedItems.map((loc) => {
        const val = loc.supply.projectConfigurationDistribution[key];
        return [loc.slug, typeof val === 'number' ? val : 0];
      })
    ),
  }));

  // 5. Matrix: RERA Metrics
  const reraRows: ReraRow[] = [
    {
      label: 'Verified Projects',
      key: 'verifiedReraProjects',
      values: Object.fromEntries(sortedItems.map((loc) => [loc.slug, loc.rera.verifiedReraProjects])),
    },
    {
      label: 'Provided Projects (Under Review)',
      key: 'providedReraProjects',
      values: Object.fromEntries(sortedItems.map((loc) => [loc.slug, loc.rera.providedReraProjects])),
    },
    {
      label: 'Without RERA Data',
      key: 'projectsWithoutReraData',
      values: Object.fromEntries(sortedItems.map((loc) => [loc.slug, loc.rera.projectsWithoutReraData])),
    },
    {
      label: 'Verified Compliance Rate (%)',
      key: 'verifiedPercentage',
      values: Object.fromEntries(
        sortedItems.map((loc) => [
          loc.slug,
          loc.rera.verifiedPercentage === 'NOT_AVAILABLE' ? '—' : `${loc.rera.verifiedPercentage}%`,
        ])
      ),
    },
  ];

  // 6. Matrix: Connectivity Summary
  const connectivityCategories = [
    { cat: 'METRO', display: 'Metro Rail' },
    { cat: 'AIRPORT', display: 'International Airport' },
    { cat: 'TRANSIT', display: 'Transit / Major Roads' },
    { cat: 'HEALTHCARE', display: 'Healthcare & Hospitals' },
    { cat: 'EDUCATION', display: 'Education & Schools' },
    { cat: 'COMMERCIAL', display: 'IT & Commercial Hubs' },
  ];

  const connectivityRows: ConnectivityRow[] = connectivityCategories.map(({ cat, display }) => {
    const closestNames: Record<string, string | null> = {};
    const closestDistances: Record<string, number | null> = {};
    const counts: Record<string, number> = {};

    for (const loc of sortedItems) {
      const places = loc.connectivity?.placesByCategory?.[cat] || [];
      counts[loc.slug] = places.length;
      if (places.length > 0) {
        // Sort by distance ascending
        const sorted = [...places].sort((a, b) => a.distanceKm - b.distanceKm);
        closestNames[loc.slug] = sorted[0].name;
        closestDistances[loc.slug] = sorted[0].distanceKm;
      } else {
        closestNames[loc.slug] = null;
        closestDistances[loc.slug] = null;
      }
    }

    return {
      category: cat,
      categoryDisplay: display,
      closestPlaceName: closestNames,
      closestDistanceKm: closestDistances,
      placeCount: counts,
    };
  });

  return {
    locations: sortedItems,
    comparisonScope: {
      mode: scope,
      isSameHierarchyLevel: hierarchyInfo.isSameHierarchyLevel,
      hierarchyLevels: hierarchyInfo.hierarchyLevels,
      primaryLevel: hierarchyInfo.primaryLevel,
      scopeDescription: hierarchyInfo.scopeDescription,
    },
    matrix: {
      overview: overviewRows,
      supply: supplyRows,
      pricing: pricingRows,
      configurations: configurationRows,
      rera: reraRows,
      connectivity: connectivityRows,
    },
    freshnessSummary: {
      asOfDates: Object.fromEntries(
        sortedItems.map((loc) => [loc.slug, loc.freshness?.dataAsOf || new Date().toISOString()])
      ),
      status: Object.fromEntries(
        sortedItems.map((loc) => [loc.slug, loc.freshness?.freshnessStatus || 'CURRENT'])
      ),
      sourceType: Object.fromEntries(
        sortedItems.map((loc) => [loc.slug, loc.freshness?.sourceType || 'GREAT_HOMES_DB'])
      ),
    },
  };
}
