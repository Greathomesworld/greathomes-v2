'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { ArrowRight, ChevronDown, ChevronUp } from 'lucide-react';
import { ChildLocationCardDto } from '@/src/domain/locations/viewModels/locationPageViewModel';

interface ChildLocationsSectionProps {
  childrenLocations: ChildLocationCardDto[];
  title: string;
  subtitle: string;
  parentName: string;
}

const INITIAL_VISIBLE_COUNT = 8;

export function ChildLocationsSection({
  childrenLocations,
  title,
  subtitle,
  parentName: _parentName,
}: ChildLocationsSectionProps) {
  const [showAll, setShowAll] = useState(false);

  const sortedLocations = useMemo(() => {
    if (!childrenLocations) return [];
    return [...childrenLocations].sort((a, b) => {
      const countDiff = (b.projectCount || 0) - (a.projectCount || 0);
      if (countDiff !== 0) return countDiff;
      return a.name.localeCompare(b.name);
    });
  }, [childrenLocations]);

  if (!sortedLocations || sortedLocations.length === 0) {
    return null;
  }

  const hasMore = sortedLocations.length > INITIAL_VISIBLE_COUNT;
  const visibleLocations = showAll ? sortedLocations : sortedLocations.slice(0, INITIAL_VISIBLE_COUNT);

  return (
    <section
      id="sub-locations"
      className="w-full min-w-0 space-y-4 sm:space-y-5 pt-8 border-t border-[rgba(17,17,17,0.08)]"
      aria-labelledby="child-locations-heading"
    >
      <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1">
        <div>
          <h2
            id="child-locations-heading"
            className="text-xl sm:text-2xl font-display font-semibold text-[#111111] tracking-tight"
          >
            {title}
          </h2>
          <p className="text-xs sm:text-sm font-body text-[#111111]/60 mt-0.5 sm:mt-1">
            {subtitle}
          </p>
        </div>
        <div className="text-xs font-mono text-[#111111]/50 shrink-0">
          {showAll || !hasMore
            ? `${sortedLocations.length} ${sortedLocations.length === 1 ? 'Micro-Market' : 'Micro-Markets'}`
            : `Showing top ${visibleLocations.length} of ${sortedLocations.length} Micro-Markets`}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
        {visibleLocations.map((child) => (
          <Link
            key={child.id}
            href={child.href}
            className="p-3.5 sm:p-4 rounded-xl border border-[rgba(17,17,17,0.08)] bg-white hover:border-[rgba(17,17,17,0.25)] hover:shadow-md transition-all group flex flex-col justify-between shadow-2xs focus:outline-hidden focus-visible:ring-2 focus-visible:ring-[#E85D3F]"
          >
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-display uppercase tracking-wider text-[#111111]/50 font-semibold">
                  {child.levelDisplay}
                </span>
                {child.projectCount > 0 ? (
                  <span className="text-[10px] font-display font-semibold text-[#E85D3F] bg-[#E85D3F]/10 px-2 py-0.5 rounded">
                    {child.projectCount} {child.projectCount === 1 ? 'Project' : 'Projects'}
                  </span>
                ) : (
                  <span className="text-[10px] font-mono text-[#111111]/40">
                    Residential Pocket
                  </span>
                )}
              </div>

              <h3 className="text-sm sm:text-base font-display font-semibold text-[#111111] group-hover:text-[#E85D3F] transition-colors leading-snug">
                {child.name}
              </h3>

              {(child.shortDescription || child.description) && (
                <p className="text-xs font-body text-[#111111]/70 line-clamp-2">
                  {child.shortDescription || child.description}
                </p>
              )}
            </div>

            <div className="mt-3 pt-2.5 border-t border-[rgba(17,17,17,0.06)] flex items-center justify-between text-xs font-display font-medium text-[#111111]/70 group-hover:text-[#E85D3F] transition-colors">
              <span className="truncate">{`Explore ${child.name}`}</span>
              <ArrowRight className="w-3.5 h-3.5 shrink-0 group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>
        ))}
      </div>

      {hasMore && (
        <div className="flex justify-center pt-1">
          <button
            type="button"
            onClick={() => setShowAll((prev) => !prev)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white border border-[rgba(17,17,17,0.15)] text-[#111111] font-display font-medium text-xs sm:text-sm hover:bg-[#FAFAF8] hover:border-[#111111] transition-all shadow-2xs cursor-pointer"
          >
            {showAll ? (
              <>
                <span>Show top {INITIAL_VISIBLE_COUNT} micro-markets</span>
                <ChevronUp className="w-4 h-4" />
              </>
            ) : (
              <>
                <span>View all {sortedLocations.length} micro-markets</span>
                <ChevronDown className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      )}
    </section>
  );
}
