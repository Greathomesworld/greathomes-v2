'use client';

import React from 'react';
import { SupplyTrendChart } from './SupplyTrendChart';
import { PricingTrendChart } from './PricingTrendChart';

interface MarketChartsSectionProps {
  locationName: string;
  history: any[];
}

export function MarketChartsSection({ locationName, history }: MarketChartsSectionProps) {
  if (!history || history.length < 2) {
    return null;
  }

  const calculateChange = (current: number, previous: number) => {
    if (previous === 0) return null;
    const change = ((current - previous) / previous) * 100;
    return change.toFixed(2);
  };

  const getSupplyChange = () => {
    if (history.length < 2) return null;
    const current = history[0].publishedProjectCount;
    const previous = history[1].publishedProjectCount;
    return calculateChange(current, previous);
  };

  const getPricingChange = () => {
    if (history.length < 2) return null;
    const current = history[0].priceMetrics?.find((m: any) => m.priceBasis === 'CARPET_AREA')?.medianRatePerSqft;
    const previous = history[1].priceMetrics?.find((m: any) => m.priceBasis === 'CARPET_AREA')?.medianRatePerSqft;
    if (!current || !previous) return null;
    return calculateChange(current, previous);
  };

  const supplyChange = getSupplyChange();
  const pricingChange = getPricingChange();

  return (
    <section id="trends" className="space-y-8 pt-8 border-t border-[rgba(17,17,17,0.08)]">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-display font-semibold text-[#111111] tracking-tight">
            Market trends in {locationName}
          </h2>
          <p className="text-sm text-[#111111]/60 mt-1">
            Factual historical observations from verified market snapshots.
          </p>
        </div>
        <div className="flex flex-wrap gap-4">
          {supplyChange !== null && (
            <div className="flex flex-col items-end">
              <span className="text-[10px] font-display font-bold uppercase tracking-wider text-[#111111]/40">Supply Change</span>
              <span className={`text-sm font-display font-bold ${Number(supplyChange) >= 0 ? 'text-[#218C5A]' : 'text-[#E85D3F]'}`}>
                {Number(supplyChange) >= 0 ? '+' : ''}{supplyChange}%
              </span>
            </div>
          )}
          {pricingChange !== null && (
            <div className="flex flex-col items-end">
              <span className="text-[10px] font-display font-bold uppercase tracking-wider text-[#111111]/40">Price Change (Carpet)</span>
              <span className={`text-sm font-display font-bold ${Number(pricingChange) >= 0 ? 'text-[#218C5A]' : 'text-[#E85D3F]'}`}>
                {Number(pricingChange) >= 0 ? '+' : ''}{pricingChange}%
              </span>
            </div>
          )}
        </div>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-xl border border-[rgba(17,17,17,0.08)] shadow-2xs">
          <h3 className="text-lg font-display font-semibold mb-4">Supply Trend</h3>
          <SupplyTrendChart history={history} />
        </div>
        
        <div className="bg-white p-6 rounded-xl border border-[rgba(17,17,17,0.08)] shadow-2xs">
          <h3 className="text-lg font-display font-semibold mb-4">Pricing Trend</h3>
          <PricingTrendChart history={history} />
        </div>
      </div>
    </section>
  );
}
