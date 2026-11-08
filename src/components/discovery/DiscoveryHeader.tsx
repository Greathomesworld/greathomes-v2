'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { ArrowUpDown } from 'lucide-react';

interface DiscoveryHeaderProps {
  title: string;
  subtitle?: string;
  totalCount: number;
  itemTypeLabel?: string; // e.g. "homes", "projects", "rental homes"
  breakdown?: {
    newBookingCount?: number;
    resaleCount?: number;
  };
}

export function DiscoveryHeader({
  title,
  subtitle,
  totalCount,
  itemTypeLabel = 'properties',
  breakdown,
}: DiscoveryHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentSort = searchParams.get('sort') || 'RECOMMENDED';

  const handleSortChange = (newSort: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (newSort === 'RECOMMENDED') {
      params.delete('sort');
    } else {
      params.set('sort', newSort);
    }
    params.delete('page'); // Reset to first page
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  return (
    <div className="mb-6">
      {/* Editorial Title & Subtitle */}
      <div className="mb-6">
        <h1 className="font-display text-3xl sm:text-4xl font-light tracking-tight text-[#111111] mb-2">
          {title}
        </h1>
        {subtitle && (
          <p className="font-editorial text-base sm:text-lg text-neutral-600 max-w-2xl">
            {subtitle}
          </p>
        )}
      </div>

      {/* Result Count & Sort Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 pb-1 border-b border-[rgba(17,17,17,0.08)]">
        <div className="flex items-center gap-2 flex-wrap text-sm text-neutral-600">
          <span className="font-semibold text-[#111111] text-base">
            {totalCount} {totalCount === 1 ? itemTypeLabel.replace(/s$/, '') : itemTypeLabel} found
          </span>
          {breakdown && (
            <span className="text-xs text-neutral-500">
              ({breakdown.newBookingCount ?? 0} new booking · {breakdown.resaleCount ?? 0} resale)
            </span>
          )}
        </div>

        {/* Sort Controls */}
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <label htmlFor="discovery-sort-select" className="text-xs font-medium text-neutral-500 flex items-center gap-1">
            <ArrowUpDown className="w-3.5 h-3.5 text-neutral-400" />
            <span>Sort by:</span>
          </label>
          <select
            id="discovery-sort-select"
            value={currentSort}
            onChange={(e) => handleSortChange(e.target.value)}
            className="bg-white border border-[rgba(17,17,17,0.12)] rounded-lg px-2.5 py-1.5 text-xs font-medium text-[#111111] focus:outline-hidden focus:ring-1 focus:ring-[#111111] cursor-pointer"
          >
            <option value="RECOMMENDED">Recommended</option>
            <option value="PRICE_ASC">Price: Low to High</option>
            <option value="PRICE_DESC">Price: High to Low</option>
            <option value="NEWEST">Newest</option>
          </select>
        </div>
      </div>
    </div>
  );
}
