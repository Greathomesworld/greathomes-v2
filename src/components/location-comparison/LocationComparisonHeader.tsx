'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Eye, ExternalLink, Trash2, Bookmark, Check } from 'lucide-react';
import { LocationComparisonItemDTO } from '@/src/domain/locationComparison';

interface LocationComparisonHeaderProps {
  locations: LocationComparisonItemDTO[];
  onRemoveLocation: (slug: string) => void;
  canRemove: boolean;
}

export function LocationComparisonHeader({
  locations,
  onRemoveLocation,
  canRemove,
}: LocationComparisonHeaderProps) {
  const [watchedLocations, setWatchedLocations] = useState<Record<string, boolean>>({});
  const [watchingLoading, setWatchingLoading] = useState<Record<string, boolean>>({});

  const handleWatchLocation = async (loc: LocationComparisonItemDTO) => {
    try {
      setWatchingLoading((prev) => ({ ...prev, [loc.id]: true }));
      const res = await fetch('/api/customer/watchlist/locations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locationId: loc.id }),
      });
      if (res.ok) {
        setWatchedLocations((prev) => ({ ...prev, [loc.id]: true }));
      } else if (res.status === 401) {
        // Redirect to login or open login state
        window.location.href = `/account/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`;
      }
    } catch (e) {
      console.error('Failed to watch location:', e);
    } finally {
      setWatchingLoading((prev) => ({ ...prev, [loc.id]: false }));
    }
  };

  return (
    <div className="grid grid-cols-1 divide-y divide-[#E5E5E0] dark:divide-stone-800 border-b border-[#E5E5E0] dark:border-stone-800">
      <div className="grid grid-cols-[180px_repeat(auto-fit,minmax(220px,1fr))] sm:grid-cols-[240px_repeat(auto-fit,minmax(240px,1fr))] items-stretch bg-white dark:bg-stone-900">
        <div className="p-4 sm:p-6 flex flex-col justify-end border-r border-[#E5E5E0] dark:border-stone-800 bg-[#FAFAF8] dark:bg-stone-950">
          <span className="text-xs font-mono uppercase tracking-wider text-stone-500 dark:text-stone-400">
            Selected Corridors
          </span>
          <p className="text-xs text-stone-400 dark:text-stone-500 mt-1">
            Comparing {locations.length} residential locations
          </p>
        </div>

        {locations.map((loc) => {
          const isWatched = watchedLocations[loc.id];
          const isWatchLoading = watchingLoading[loc.id];

          return (
            <div
              key={loc.slug}
              className="p-4 sm:p-6 flex flex-col justify-between border-r border-[#E5E5E0] dark:border-stone-800 last:border-r-0 relative group"
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <span className="text-[11px] font-mono uppercase tracking-wider text-stone-500 dark:text-stone-400">
                    {loc.levelDisplay}
                  </span>
                  {canRemove && (
                    <button
                      type="button"
                      onClick={() => onRemoveLocation(loc.slug)}
                      className="text-stone-400 hover:text-[#E85D3F] p-1 rounded transition-colors touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center -mr-2 -mt-2"
                      title={`Remove ${loc.name} from comparison`}
                      aria-label={`Remove ${loc.name} from comparison`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <h2 className="text-xl sm:text-2xl font-display font-bold text-[#111111] dark:text-stone-100 tracking-tight">
                  {loc.name}
                </h2>

                <div className="text-xs text-stone-500 dark:text-stone-400 mt-1 font-body">
                  {loc.breadcrumb && loc.breadcrumb.length > 0 ? (
                    loc.breadcrumb.map((b) => b.name).join(' → ')
                  ) : (
                    <span>Kolkata</span>
                  )}
                </div>

                {loc.description && (
                  <p className="text-xs text-stone-600 dark:text-stone-400 mt-2 line-clamp-2 font-body leading-relaxed">
                    {loc.description}
                  </p>
                )}
              </div>

              <div className="mt-4 pt-4 border-t border-stone-100 dark:border-stone-800/60 flex flex-wrap items-center gap-2">
                <Link
                  href={loc.canonicalPath || `/locations/${loc.slug}`}
                  className="inline-flex items-center gap-1.5 text-xs font-display font-medium text-[#111111] dark:text-stone-200 hover:text-[#218C5A] dark:hover:text-[#218C5A] transition-colors py-2 px-3 rounded border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 min-h-[44px]"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>View Location</span>
                </Link>

                <button
                  type="button"
                  onClick={() => handleWatchLocation(loc)}
                  disabled={isWatchLoading || isWatched}
                  className={`inline-flex items-center gap-1.5 text-xs font-display font-medium transition-colors py-2 px-3 rounded border min-h-[44px] ${
                    isWatched
                      ? 'border-[#218C5A] text-[#218C5A] bg-emerald-50 dark:bg-emerald-950/30'
                      : 'border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-300 hover:border-stone-400 bg-stone-50 dark:bg-stone-800/50'
                  }`}
                  aria-label={isWatched ? `${loc.name} watched` : `Watch ${loc.name}`}
                >
                  {isWatched ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-[#218C5A]" />
                      <span>Watched</span>
                    </>
                  ) : (
                    <>
                      <Bookmark className="w-3.5 h-3.5" />
                      <span>{isWatchLoading ? 'Saving...' : 'Watch Location'}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
