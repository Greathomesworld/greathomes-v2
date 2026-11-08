'use client';

import React from 'react';
import { ConfigurationRow } from '@/src/domain/locationComparison';

interface ConfigurationComparisonTableProps {
  rows: ConfigurationRow[];
  slugs: string[];
}

export function ConfigurationComparisonTable({ rows, slugs }: ConfigurationComparisonTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse" role="table">
        <caption className="sr-only">Configuration Distribution Comparison</caption>
        <thead>
          <tr className="border-b border-[#E5E5E0] dark:border-stone-800 bg-[#FAFAF8] dark:bg-stone-950/80">
            <th
              scope="col"
              className="p-4 sm:p-5 text-xs font-mono uppercase tracking-wider text-stone-500 dark:text-stone-400 w-[180px] sm:w-[240px] border-r border-[#E5E5E0] dark:border-stone-800"
            >
              Unit Type (Supply Counts)
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
                const count = row.values[slug] ?? 0;
                return (
                  <td
                    key={slug}
                    className="p-4 sm:p-5 text-sm font-display font-medium text-[#111111] dark:text-stone-100 border-r border-[#E5E5E0] dark:border-stone-800 last:border-r-0"
                  >
                    <span>{count} unit types recorded</span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="p-3 bg-stone-50/60 dark:bg-stone-900/40 border-t border-[#E5E5E0] dark:border-stone-800 text-[11px] text-stone-500 dark:text-stone-400">
        Note: Reflects factual inventory and project floor plan configurations published by developers. Does not imply consumer demand or purchasing preference.
      </div>
    </div>
  );
}
