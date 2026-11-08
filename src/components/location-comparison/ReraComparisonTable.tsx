'use client';

import React from 'react';
import { ReraRow } from '@/src/domain/locationComparison';

interface ReraComparisonTableProps {
  rows: ReraRow[];
  slugs: string[];
}

export function ReraComparisonTable({ rows, slugs }: ReraComparisonTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse" role="table">
        <caption className="sr-only">RERA Regulatory Compliance Matrix</caption>
        <thead>
          <tr className="border-b border-[#E5E5E0] dark:border-stone-800 bg-[#FAFAF8] dark:bg-stone-950/80">
            <th
              scope="col"
              className="p-4 sm:p-5 text-xs font-mono uppercase tracking-wider text-stone-500 dark:text-stone-400 w-[180px] sm:w-[240px] border-r border-[#E5E5E0] dark:border-stone-800"
            >
              Regulatory Metric
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
                {row.label}
              </td>
              {slugs.map((slug) => {
                const val = row.values[slug];
                const displayVal = val === null || val === undefined ? '—' : String(val);

                return (
                  <td
                    key={slug}
                    className="p-4 sm:p-5 text-sm font-display font-medium text-[#111111] dark:text-stone-100 border-r border-[#E5E5E0] dark:border-stone-800 last:border-r-0"
                  >
                    <span>{displayVal}</span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="p-3 bg-stone-50/60 dark:bg-stone-900/40 border-t border-[#E5E5E0] dark:border-stone-800 text-[11px] text-stone-500 dark:text-stone-400">
        RERA Definitions: Verified indicates state registration number has been confirmed against official government registries. Provided indicates developer-submitted registration awaiting validation. Unverified numbers are never categorized as verified.
      </div>
    </div>
  );
}
