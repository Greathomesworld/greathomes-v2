'use client';

import React, { useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from 'recharts';
import { LocationComparisonItemDTO, PriceBasisType } from '@/src/domain/locationComparison';

interface HistoricalTrendsComparisonProps {
  locations: LocationComparisonItemDTO[];
}

const LOCATION_COLORS = ['#111111', '#218C5A', '#E85D3F', '#3B82F6'];

export function HistoricalTrendsComparison({ locations }: HistoricalTrendsComparisonProps) {
  const [activeBasis, setActiveBasis] = useState<PriceBasisType>('CARPET_AREA');

  // Check if at least one location has >= 2 snapshots
  const hasSufficientHistory = locations.some(
    (loc) => loc.historicalSnapshots && loc.historicalSnapshots.length >= 2
  );

  if (!hasSufficientHistory) {
    return (
      <div className="p-8 text-center bg-stone-50 dark:bg-stone-900/40 rounded border border-[#E5E5E0] dark:border-stone-800">
        <p className="text-sm text-stone-600 dark:text-stone-400 font-body">
          Not enough historical snapshot data is recorded yet to generate comparative trend charts.
        </p>
      </div>
    );
  }

  // Build unified chronological timeline data across all locations
  const dateSet = new Set<string>();
  locations.forEach((loc) => {
    (loc.historicalSnapshots || []).forEach((snap: any) => {
      if (snap.snapshotDate) dateSet.add(snap.snapshotDate);
    });
  });

  const sortedDates = Array.from(dateSet).sort();

  // 1. Supply Chart Data
  const supplyChartData = sortedDates.map((date) => {
    const point: Record<string, any> = { date };
    locations.forEach((loc) => {
      const snap = (loc.historicalSnapshots || []).find((s: any) => s.snapshotDate === date);
      point[loc.name] = snap ? (snap.publishedProjectCount ?? snap.projectCount ?? null) : null;
    });
    return point;
  });

  // 2. Pricing Chart Data (basis-isolated)
  const pricingChartData = sortedDates.map((date) => {
    const point: Record<string, any> = { date };
    locations.forEach((loc) => {
      const snap = (loc.historicalSnapshots || []).find((s: any) => s.snapshotDate === date);
      if (snap && Array.isArray(snap.priceMetrics)) {
        const metric = snap.priceMetrics.find((m: any) => m.priceBasis === activeBasis);
        point[loc.name] = metric ? metric.medianRatePerSqft : null;
      } else {
        point[loc.name] = null;
      }
    });
    return point;
  });

  return (
    <div className="space-y-8">
      {/* 1. Supply Trends */}
      <div className="p-5 bg-white dark:bg-stone-900 border border-[#E5E5E0] dark:border-stone-800 rounded">
        <div className="mb-4">
          <h3 className="text-base font-display font-bold text-[#111111] dark:text-stone-100">
            Published Residential Projects Trend
          </h3>
          <p className="text-xs text-stone-500 dark:text-stone-400 font-body mt-0.5">
            Factual counts of verified active housing projects plotted over snapshot dates.
          </p>
        </div>

        <div className="h-[280px] w-full" role="img" aria-label="Comparative published projects supply chart">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={supplyChartData} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E5E0" opacity={0.6} />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#888888" dy={5} />
              <YAxis tick={{ fontSize: 11 }} stroke="#888888" />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#111111',
                  color: '#FFFFFF',
                  borderRadius: 4,
                  fontSize: 12,
                }}
              />
              <Legend verticalAlign="top" height={36} iconType="circle" />
              {locations.map((loc, idx) => (
                <Line
                  key={loc.slug}
                  type="monotone"
                  dataKey={loc.name}
                  name={loc.name}
                  stroke={LOCATION_COLORS[idx % LOCATION_COLORS.length]}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 2. Historical Pricing Trends (Basis-Isolated) */}
      <div className="p-5 bg-white dark:bg-stone-900 border border-[#E5E5E0] dark:border-stone-800 rounded">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-base font-display font-bold text-[#111111] dark:text-stone-100">
              Median Price Trend (₹/sq.ft.)
            </h3>
            <p className="text-xs text-stone-500 dark:text-stone-400 font-body mt-0.5">
              Historical median rates recorded under strictly identical measurement boundaries.
            </p>
          </div>

          <div
            role="group"
            aria-label="Select basis for historical pricing chart"
            className="inline-flex rounded-md border border-stone-300 dark:border-stone-700 p-0.5 bg-stone-50 dark:bg-stone-950"
          >
            {(['CARPET_AREA', 'BUILT_UP_AREA', 'SUPER_BUILT_UP_AREA'] as PriceBasisType[]).map((b) => {
              const label = b === 'CARPET_AREA' ? 'Carpet' : b === 'BUILT_UP_AREA' ? 'Built-Up' : 'Super Built-Up';
              const isSelected = b === activeBasis;
              return (
                <button
                  key={b}
                  type="button"
                  onClick={() => setActiveBasis(b)}
                  aria-pressed={isSelected}
                  className={`py-1.5 px-3 text-xs font-display font-medium rounded transition-colors touch-manipulation min-h-[44px] flex items-center justify-center ${
                    isSelected
                      ? 'bg-[#111111] text-white dark:bg-stone-100 dark:text-stone-900 shadow-xs'
                      : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="h-[280px] w-full" role="img" aria-label={`Comparative median pricing trend chart for ${activeBasis}`}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={pricingChartData} margin={{ top: 10, right: 20, left: 10, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E5E0" opacity={0.6} />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#888888" dy={5} />
              <YAxis
                tick={{ fontSize: 11 }}
                stroke="#888888"
                tickFormatter={(val) => `₹${Math.round(val / 1000)}k`}
              />
              <Tooltip
                formatter={(val: any) => (val !== null ? `₹${Number(val).toLocaleString('en-IN')}/sq.ft.` : '—')}
                contentStyle={{
                  backgroundColor: '#111111',
                  color: '#FFFFFF',
                  borderRadius: 4,
                  fontSize: 12,
                }}
              />
              <Legend verticalAlign="top" height={36} iconType="circle" />
              {locations.map((loc, idx) => (
                <Line
                  key={loc.slug}
                  type="monotone"
                  dataKey={loc.name}
                  name={loc.name}
                  stroke={LOCATION_COLORS[idx % LOCATION_COLORS.length]}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
