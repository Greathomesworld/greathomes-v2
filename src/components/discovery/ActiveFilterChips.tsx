'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { X, RotateCcw } from 'lucide-react';
import { formatIndianPrice, formatFurnishing, formatPropertyType } from './formatters';

interface ActiveFilterChipsProps {
  mode: 'buy' | 'rent' | 'projects';
  locations?: { id: string; name: string; slug: string }[];
}

export function ActiveFilterChips({ mode, locations = [] }: ActiveFilterChipsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const query = searchParams.get('q') || searchParams.get('query');
  const location = searchParams.get('location');
  const bedroomCount = searchParams.get('bedroomCount') || searchParams.get('bhk');
  const propertyType = searchParams.get('propertyType');
  const minPrice = searchParams.get('minPrice');
  const maxPrice = searchParams.get('maxPrice');
  const inventoryType = searchParams.get('inventoryType');
  const furnishing = searchParams.get('furnishing');
  const stage = searchParams.get('stage') || searchParams.get('status');

  // Find location name if slug matches
  let locationLabel = location;
  if (location) {
    const matched = locations.find(l => l.slug.toLowerCase() === location.toLowerCase());
    if (matched) locationLabel = matched.name;
  }

  // Determine stage label
  const stageLabelMap: Record<string, string> = {
    UPCOMING: 'Upcoming',
    NEW_LAUNCH: 'New Launch',
    UNDER_CONSTRUCTION: 'Under Construction',
    READY_TO_MOVE: 'Ready to Move',
    COMPLETED: 'Completed',
    SOLD_OUT: 'Sold Out',
  };
  const stageLabel = stage ? (stageLabelMap[stage.toUpperCase()] || stage.replace(/_/g, ' ')) : null;

  // Determine budget label
  let budgetLabel: string | null = null;
  const isMonthly = mode === 'rent';
  if (minPrice && maxPrice) {
    budgetLabel = `${formatIndianPrice(parseInt(minPrice), isMonthly)} – ${formatIndianPrice(parseInt(maxPrice), isMonthly)}`;
  } else if (minPrice) {
    budgetLabel = `Above ${formatIndianPrice(parseInt(minPrice), isMonthly)}`;
  } else if (maxPrice) {
    budgetLabel = `Up to ${formatIndianPrice(parseInt(maxPrice), isMonthly)}`;
  }

  // Collect chips
  const chips: { key: string; label: string; removeKeys: string[] }[] = [];

  if (query && query.trim()) {
    chips.push({
      key: 'query',
      label: `Search: "${query.trim()}"`,
      removeKeys: ['q', 'query'],
    });
  }

  if (stage && stageLabel) {
    chips.push({
      key: 'stage',
      label: `Stage: ${stageLabel}`,
      removeKeys: ['stage', 'status'],
    });
  }

  if (location && locationLabel) {
    chips.push({
      key: 'location',
      label: locationLabel,
      removeKeys: ['location'],
    });
  }

  if (bedroomCount) {
    chips.push({
      key: 'bhk',
      label: `${bedroomCount} BHK`,
      removeKeys: ['bedroomCount', 'bhk'],
    });
  }

  if (propertyType) {
    chips.push({
      key: 'propertyType',
      label: formatPropertyType(propertyType),
      removeKeys: ['propertyType'],
    });
  }

  if (budgetLabel) {
    chips.push({
      key: 'budget',
      label: budgetLabel,
      removeKeys: ['minPrice', 'maxPrice'],
    });
  }

  if (inventoryType && inventoryType !== 'ALL') {
    chips.push({
      key: 'inventoryType',
      label: inventoryType === 'NEW_BOOKING' ? 'New Booking' : 'Resale',
      removeKeys: ['inventoryType'],
    });
  }

  if (furnishing && furnishing !== 'ALL') {
    chips.push({
      key: 'furnishing',
      label: formatFurnishing(furnishing),
      removeKeys: ['furnishing'],
    });
  }

  if (chips.length === 0) {
    return null;
  }

  const removeFilter = (keysToRemove: string[]) => {
    const params = new URLSearchParams(searchParams.toString());
    keysToRemove.forEach(k => params.delete(k));
    params.delete('page'); // Reset to first page
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  const clearAllFilters = () => {
    const params = new URLSearchParams();
    const sort = searchParams.get('sort');
    if (sort) params.set('sort', sort); // preserve sort
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  return (
    <div className="flex flex-wrap items-center gap-2 pt-3 pb-1" aria-label="Active filters">
      <span className="text-xs text-neutral-500 font-medium mr-1">Active:</span>
      
      {chips.map(chip => (
        <button
          key={chip.key}
          onClick={() => removeFilter(chip.removeKeys)}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-white text-[#111111] border border-[rgba(17,17,17,0.15)] hover:border-[#E85D3F] hover:text-[#E85D3F] transition-all shadow-2xs group cursor-pointer"
          title={`Remove filter: ${chip.label}`}
        >
          <span>{chip.label}</span>
          <X className="w-3 h-3 text-neutral-400 group-hover:text-[#E85D3F] transition-colors" />
        </button>
      ))}

      <button
        onClick={clearAllFilters}
        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-neutral-600 hover:text-[#E85D3F] hover:underline transition-colors ml-1 cursor-pointer"
      >
        <RotateCcw className="w-3 h-3" />
        <span>Clear all</span>
      </button>
    </div>
  );
}
