'use client';

import React from 'react';
import { MetricRowValue } from '@/src/domain/locationComparison';

interface MarketOverviewTableProps {
  rows: MetricRowValue[];
  slugs: string[];
}

export function MarketOverviewTable({ rows, slugs }: MarketOverviewTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse" role="table">
        <caption className="sr-only">Market Overview Comparison Matrix</caption>
        <thead>
          <tr className="border-b border-[#E5E5E0] dark:border-stone-800 bg-[#FAFAF8] dark:bg-stone-950/80">
            <th
              scope="col"
              className="p-4 sm:p-5 text-xs font-mono uppercase tracking-wider text-stone-500 dark:text-stone-400 w-[180px] sm:w-[240px] border-r border-[#E5E5E0] dark:border-stone-800"
            >
              Overview Metric
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
          {rows.map((row) => (
            <tr
              key={row.key}
              className="hover:bg-stone-50/50 dark:hover:bg-stone-800/20 transition-colors"
            >
              <td className="p-4 sm:p-5 text-sm font-medium text-[#111111] dark:text-stone-200 border-r border-[#E5E5E0] dark:border-stone-800 bg-[#FAFAF8]/50 dark:bg-stone-950/30">
                <div>{row.metric}</div>
                {row.description && (
                  <div className="text-[11px] text-stone-500 dark:text-stone-400 font-normal mt-0.5 leading-snug">
                    {row.description}
                  </div>
                )}
              </td>
              {slugs.map((slug) => {
                const val = row.values[slug];
                const displayVal = val === null || val === undefined ? '—' : String(val);

                return (
                  <td
                    key={slug}
                    className="p-4 sm:p-5 text-sm font-display font-medium text-[#111111] dark:text-stone-100 border-r border-[#E5E5E0] dark:border-stone-800 last:border-r-0"
                  >
                    {displayVal}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
