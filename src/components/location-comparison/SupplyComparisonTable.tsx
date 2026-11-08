'use client';

import React from 'react';
import { SupplyMetricRow } from '@/src/domain/locationComparison';

interface SupplyComparisonTableProps {
  rows: SupplyMetricRow[];
  slugs: string[];
}

export function SupplyComparisonTable({ rows, slugs }: SupplyComparisonTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse" role="table">
        <caption className="sr-only">Supply Comparison Matrix</caption>
        <thead>
          <tr className="border-b border-[#E5E5E0] dark:border-stone-800 bg-[#FAFAF8] dark:bg-stone-950/80">
            <th
              scope="col"
              className="p-4 sm:p-5 text-xs font-mono uppercase tracking-wider text-stone-500 dark:text-stone-400 w-[180px] sm:w-[240px] border-r border-[#E5E5E0] dark:border-stone-800"
            >
              Supply Category
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
                {row.metric}
              </td>
              {slugs.map((slug) => {
                const val = row.values[slug];
                const change = row.historicalChanges?.[slug];
                const displayVal = val === null || val === undefined ? '—' : String(val);

                return (
                  <td
                    key={slug}
                    className="p-4 sm:p-5 text-sm font-display font-medium text-[#111111] dark:text-stone-100 border-r border-[#E5E5E0] dark:border-stone-800 last:border-r-0"
                  >
                    <div className="flex items-baseline gap-2">
                      <span className="text-lg font-bold">{displayVal}</span>
                      {change && change.changePercent !== null && (
                        <span className="text-xs font-mono text-stone-500 dark:text-stone-400">
                          ({change.changePercent >= 0 ? `+${change.changePercent}%` : `${change.changePercent}%`})
                        </span>
                      )}
                    </div>
                    {change && (
                      <div className="text-[11px] text-stone-400 dark:text-stone-500 font-normal mt-0.5">
                        Prev: {change.previous}
                      </div>
                    )}
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
