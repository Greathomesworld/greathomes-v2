'use client';

import React from 'react';
import { LocationComparisonItemDTO } from '@/src/domain/locationComparison';

interface RecentActivityTableProps {
  locations: LocationComparisonItemDTO[];
}

export function RecentActivityTable({ locations }: RecentActivityTableProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {locations.map((loc) => {
        const events = loc.recentActivity?.events || [];

        return (
          <div
            key={loc.slug}
            className="p-4 rounded border border-[#E5E5E0] dark:border-stone-800 bg-[#FAFAF8]/50 dark:bg-stone-900/40 flex flex-col justify-between"
          >
            <div>
              <div className="text-xs font-mono uppercase tracking-wider text-stone-500 dark:text-stone-400 mb-2">
                {loc.name} Events
              </div>

              {events.length === 0 ? (
                <div className="text-xs text-stone-400 dark:text-stone-500 py-4 italic font-body">
                  No recent market events recorded for this corridor.
                </div>
              ) : (
                <ul className="space-y-3 font-body">
                  {events.slice(0, 5).map((evt) => (
                    <li
                      key={evt.id}
                      className="text-xs pb-2 border-b border-stone-200/60 dark:border-stone-800/60 last:border-b-0"
                    >
                      <div className="font-medium text-[#111111] dark:text-stone-200">
                        {evt.title}
                      </div>
                      <div className="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5">
                        {evt.summary}
                      </div>
                      <div className="text-[10px] text-stone-400 dark:text-stone-500 font-mono mt-1">
                        {evt.eventDate}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="text-[11px] text-stone-400 dark:text-stone-500 font-mono pt-3 border-t border-stone-200/60 dark:border-stone-800/60 mt-3">
              {events.length} verified events logged
            </div>
          </div>
        );
      })}
    </div>
  );
}
