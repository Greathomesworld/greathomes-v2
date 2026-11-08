'use client';

import React, { useState } from 'react';
import { PricingComparisonBasisRow, PriceBasisType } from '@/src/domain/locationComparison';

interface PricingComparisonTableProps {
  basisRows: PricingComparisonBasisRow[];
  slugs: string[];
}

export function PricingComparisonTable({ basisRows, slugs }: PricingComparisonTableProps) {
  const [activeBasis, setActiveBasis] = useState<PriceBasisType>('CARPET_AREA');

  const selectedBasisData = basisRows.find((b) => b.basis === activeBasis) || basisRows[0];

  const formatRate = (val: number | null | undefined): string => {
    if (val === null || val === undefined || isNaN(val)) return '—';
    return `₹${Math.round(val).toLocaleString('en-IN')}/sq.ft.`;
  };

  return (
    <div className="space-y-4">
      {/* Basis Selector Control */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-stone-50 dark:bg-stone-900 border border-[#E5E5E0] dark:border-stone-800 rounded">
        <div>
          <span className="text-xs font-mono uppercase tracking-wider text-stone-500 dark:text-stone-400">
            Isolated Pricing Basis
          </span>
          <p className="text-xs text-stone-600 dark:text-stone-400 mt-0.5">
            Switching basis updates all compared locations simultaneously.
          </p>
        </div>

        <div
          role="group"
          aria-label="Select pricing basis for comparison"
          className="inline-flex rounded-md border border-stone-300 dark:border-stone-700 p-0.5 bg-white dark:bg-stone-950"
        >
          {basisRows.map((b) => {
            const isSelected = b.basis === activeBasis;
            return (
              <button
                key={b.basis}
                type="button"
                onClick={() => setActiveBasis(b.basis)}
                aria-pressed={isSelected}
                className={`py-2 px-3 text-xs font-display font-medium rounded transition-colors touch-manipulation min-h-[44px] flex items-center justify-center ${
                  isSelected
                    ? 'bg-[#111111] text-white dark:bg-stone-100 dark:text-stone-900 shadow-xs'
                    : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100'
                }`}
              >
                {b.basisDisplay}
              </button>
            );
          })}
        </div>
      </div>

      {/* Pricing Matrix */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse" role="table">
          <caption className="sr-only">Pricing Comparison Matrix for {selectedBasisData?.basisDisplay}</caption>
          <thead>
            <tr className="border-b border-[#E5E5E0] dark:border-stone-800 bg-[#FAFAF8] dark:bg-stone-950/80">
              <th
                scope="col"
                className="p-4 sm:p-5 text-xs font-mono uppercase tracking-wider text-stone-500 dark:text-stone-400 w-[180px] sm:w-[240px] border-r border-[#E5E5E0] dark:border-stone-800"
              >
                Rate Metric ({selectedBasisData?.basisDisplay})
              </th>
              {slugs.map((slug) => (
                <th
                  key={slug}
                  scope="col"
                  className="p-4 sm:p-5 text-xs font-mono uppercase tracking-wider text-stone-500 dark:text-stone-400 border-r border-[#E5E5E0] dark:border-stone-800 last:border-r-0 min-w-[200px]"
                >
                  {slug}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E5E5E0] dark:divide-stone-800 font-body">
            {selectedBasisData?.metrics.map((m) => (
              <tr
                key={m.key}
                className="hover:bg-stone-50/50 dark:hover:bg-stone-800/20 transition-colors"
              >
                <td className="p-4 sm:p-5 text-sm font-medium text-[#111111] dark:text-stone-200 border-r border-[#E5E5E0] dark:border-stone-800 bg-[#FAFAF8]/50 dark:bg-stone-950/30">
                  {m.label}
                </td>
                {slugs.map((slug) => {
                  const val = m.values[slug];
                  const isMedian = m.key === 'medianRatePerSqft';

                  return (
                    <td
                      key={slug}
                      className="p-4 sm:p-5 text-sm font-display font-medium text-[#111111] dark:text-stone-100 border-r border-[#E5E5E0] dark:border-stone-800 last:border-r-0"
                    >
                      <span className={isMedian ? 'text-base font-bold' : ''}>
                        {formatRate(val)}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-stone-500 dark:text-stone-400 leading-relaxed italic">
        * Architectural measurement bases represent strictly distinct areas. Carpet Area measures usable internal floor area excluding walls; Built-Up Area includes internal walls; Super Built-Up includes common areas and elevator shafts. Rates must never be directly cross-compared across divergent measurement bases.
      </p>
    </div>
  );
}
