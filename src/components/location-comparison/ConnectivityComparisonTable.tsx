'use client';

import React from 'react';
import { ConnectivityRow } from '@/src/domain/locationComparison';

interface ConnectivityComparisonTableProps {
  rows: ConnectivityRow[];
  slugs: string[];
}

export function ConnectivityComparisonTable({ rows, slugs }: ConnectivityComparisonTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse" role="table">
        <caption className="sr-only">Infrastructure and Connectivity Comparison Matrix</caption>
        <thead>
          <tr className="border-b border-[#E5E5E0] dark:border-stone-800 bg-[#FAFAF8] dark:bg-stone-950/80">
            <th
              scope="col"
              className="p-4 sm:p-5 text-xs font-mono uppercase tracking-wider text-stone-500 dark:text-stone-400 w-[180px] sm:w-[240px] border-r border-[#E5E5E0] dark:border-stone-800"
            >
              Infrastructure Category
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
              key={row.category}
              className="hover:bg-stone-50/50 dark:hover:bg-stone-800/20 transition-colors"
            >
              <td className="p-4 sm:p-5 text-sm font-medium text-[#111111] dark:text-stone-200 border-r border-[#E5E5E0] dark:border-stone-800 bg-[#FAFAF8]/50 dark:bg-stone-950/30">
                {row.categoryDisplay}
              </td>
              {slugs.map((slug) => {
                const name = row.closestPlaceName[slug];
                const km = row.closestDistanceKm[slug];
                const count = row.placeCount[slug] ?? 0;

                if (!name && km === null) {
                  return (
                    <td
                      key={slug}
                      className="p-4 sm:p-5 text-sm text-stone-400 dark:text-stone-500 border-r border-[#E5E5E0] dark:border-stone-800 last:border-r-0"
                    >
                      <span>Not recorded</span>
                    </td>
                  );
                }

                return (
                  <td
                    key={slug}
                    className="p-4 sm:p-5 text-sm font-display font-medium text-[#111111] dark:text-stone-100 border-r border-[#E5E5E0] dark:border-stone-800 last:border-r-0"
                  >
                    <div>{name}</div>
                    <div className="text-xs text-stone-500 dark:text-stone-400 font-mono mt-0.5">
                      {km !== null ? `${km.toFixed(1)} km away` : '—'}
                      {count > 1 ? ` · ${count} mapped hubs` : ''}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="p-3 bg-stone-50/60 dark:bg-stone-900/40 border-t border-[#E5E5E0] dark:border-stone-800 text-[11px] text-stone-500 dark:text-stone-400">
        Distances are straight-line geodesic or recorded road distances measured in kilometres to the nearest registered node.
      </div>
    </div>
  );
}
