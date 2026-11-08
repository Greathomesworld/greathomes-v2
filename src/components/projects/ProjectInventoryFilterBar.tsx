'use client';

import React, { useTransition, useEffect } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { SlidersHorizontal, RotateCcw, CheckCircle2, X, ChevronDown, ChevronUp } from 'lucide-react';

interface ProjectInventoryFilterBarProps {
  mode: 'RESALE' | 'RENTAL';
  availableBhkCounts: number[];
  availableFurnishings?: string[];
  availableFloorCategories?: string[];
  availablePossessions?: string[];
  verifiedCount?: number;
  minAvailableValue?: number | null;
  maxAvailableValue?: number | null;
  totalEligibleCount: number;
  filteredCount: number;
  hasActiveFilters: boolean;
}

const RESALE_PRICE_RANGES = [
  { label: 'Any Budget', min: '', max: '' },
  { label: 'Under ₹75 Lakh', min: '', max: '7500000' },
  { label: '₹75 Lakh – ₹1.5 Cr', min: '7500000', max: '15000000' },
  { label: '₹1.5 Cr – ₹3 Cr', min: '15000000', max: '30000000' },
  { label: 'Above ₹3 Cr', min: '30000000', max: '' },
];

const RENTAL_BUDGET_RANGES = [
  { label: 'Any Monthly Rent', min: '', max: '' },
  { label: 'Under ₹25,000 / mo', min: '', max: '25000' },
  { label: '₹25,000 – ₹50,000 / mo', min: '25000', max: '50000' },
  { label: '₹50,000 – ₹1,00,000 / mo', min: '50000', max: '100000' },
  { label: 'Above ₹1,00,000 / mo', min: '100000', max: '' },
];

const FURNISHING_OPTIONS = [
  { value: 'FULLY_FURNISHED', label: 'Fully Furnished' },
  { value: 'SEMI_FURNISHED', label: 'Semi-Furnished' },
  { value: 'UNFURNISHED', label: 'Unfurnished' },
];

const FLOOR_CATEGORY_OPTIONS = [
  { value: 'LOWER_FLOOR', label: 'Lower Floor' },
  { value: 'MID_FLOOR', label: 'Mid Floor' },
  { value: 'HIGH_FLOOR', label: 'High Floor' },
];

const POSSESSION_OPTIONS_RESALE = [
  { value: 'READY', label: 'Ready to Move' },
  { value: 'UNDER_CONSTRUCTION', label: 'Under Construction' },
  { value: 'OCCUPIED', label: 'Occupied' },
  { value: 'AVAILABLE_FROM_DATE', label: 'Available from Date' },
];

const POSSESSION_OPTIONS_RENTAL = [
  { value: 'READY', label: 'Ready to Move' },
  { value: 'OCCUPIED', label: 'Occupied' },
  { value: 'AVAILABLE_FROM_DATE', label: 'Available from Date' },
];

export function ProjectInventoryFilterBar({
  mode,
  availableBhkCounts,
  availableFurnishings,
  availableFloorCategories,
  availablePossessions,
  verifiedCount,
  minAvailableValue,
  maxAvailableValue,
  totalEligibleCount,
  filteredCount,
  hasActiveFilters,
}: ProjectInventoryFilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [isMobileExpanded, setIsMobileExpanded] = React.useState(false);

  const isResale = mode === 'RESALE';

  // Listen for custom event from sticky mobile CTA "Filters" button
  useEffect(() => {
    const handleOpenFilters = () => {
      setIsMobileExpanded(true);
    };
    window.addEventListener('gh:open-inventory-filters', handleOpenFilters);
    return () => {
      window.removeEventListener('gh:open-inventory-filters', handleOpenFilters);
    };
  }, []);

  const currentBhk = searchParams.get('bhk') || '';
  const currentFurnishing = searchParams.get('furnishing') || '';
  const currentFloorCategory = searchParams.get('floorCategory') || '';
  const currentPossession = searchParams.get('possession') || '';
  const currentVerified = searchParams.get('verified') === 'true';
  const currentSort = searchParams.get('sort') || 'newest';

  const minKey = isResale ? 'minPrice' : 'minRent';
  const maxKey = isResale ? 'maxPrice' : 'maxRent';
  const currentMin = searchParams.get(minKey) || '';
  const currentMax = searchParams.get(maxKey) || '';
  const currentBudgetKey = `${currentMin}-${currentMax}`;

  const updateParams = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, val] of Object.entries(updates)) {
      if (!val) {
        params.delete(key);
      } else {
        params.set(key, val);
      }
    }
    // Always reset to page 1 when filters or sort change
    params.delete('page');
    const qs = params.toString();
    startTransition(() => {
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  };

  const clearAllFilters = () => {
    const params = new URLSearchParams();
    const sortVal = searchParams.get('sort');
    if (sortVal && sortVal !== 'newest') {
      params.set('sort', sortVal);
    }
    const qs = params.toString();
    startTransition(() => {
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  };

  // Filter budget ranges to only those overlapping project inventory range (or currently selected)
  const rawBudgetRanges = isResale ? RESALE_PRICE_RANGES : RENTAL_BUDGET_RANGES;
  const budgetRanges = rawBudgetRanges.filter(range => {
    const key = `${range.min}-${range.max}`;
    if (key === '-' || key === currentBudgetKey) return true;
    if (
      typeof minAvailableValue === 'number' &&
      typeof maxAvailableValue === 'number' &&
      minAvailableValue > 0 &&
      maxAvailableValue > 0
    ) {
      const rangeMin = range.min ? Number(range.min) : 0;
      const rangeMax = range.max ? Number(range.max) : Number.MAX_SAFE_INTEGER;
      return maxAvailableValue >= rangeMin && minAvailableValue <= rangeMax;
    }
    return true;
  });

  // Dynamic facet option filtering (prevent unavailable filter options from appearing unless currently active)
  const visibleFurnishingOptions = FURNISHING_OPTIONS.filter(
    opt =>
      opt.value === currentFurnishing ||
      !availableFurnishings ||
      availableFurnishings.length === 0 ||
      availableFurnishings.includes(opt.value)
  );

  const visibleFloorOptions = FLOOR_CATEGORY_OPTIONS.filter(
    opt =>
      opt.value === currentFloorCategory ||
      !availableFloorCategories ||
      availableFloorCategories.length === 0 ||
      availableFloorCategories.includes(opt.value)
  );

  const rawPossessionOptions = isResale ? POSSESSION_OPTIONS_RESALE : POSSESSION_OPTIONS_RENTAL;
  const visiblePossessionOptions = rawPossessionOptions.filter(
    opt =>
      opt.value === currentPossession ||
      !availablePossessions ||
      availablePossessions.length === 0 ||
      availablePossessions.includes(opt.value)
  );

  const visibleBhkOptions = Array.from(
    new Set([
      ...availableBhkCounts,
      ...(currentBhk && Number.isFinite(Number(currentBhk)) ? [Number(currentBhk)] : []),
    ])
  ).sort((a, b) => a - b);

  const showVerifiedToggle =
    currentVerified || verifiedCount === undefined || verifiedCount > 0;

  // Build list of active filter chips for individual 1-click removal
  const activeFilterChips: { key: string; label: string; onClear: () => void }[] = [];

  if (currentBhk) {
    activeFilterChips.push({
      key: 'bhk',
      label: `${currentBhk} BHK`,
      onClear: () => updateParams({ bhk: null }),
    });
  }

  if (currentMin || currentMax) {
    const matchedRange = rawBudgetRanges.find(r => `${r.min}-${r.max}` === currentBudgetKey);
    const budgetLabel = matchedRange
      ? matchedRange.label
      : currentMin && currentMax
      ? `₹${Number(currentMin).toLocaleString('en-IN')} – ₹${Number(currentMax).toLocaleString('en-IN')}`
      : currentMin
      ? `Min ₹${Number(currentMin).toLocaleString('en-IN')}`
      : `Max ₹${Number(currentMax).toLocaleString('en-IN')}`;
    activeFilterChips.push({
      key: 'budget',
      label: budgetLabel,
      onClear: () => updateParams({ [minKey]: null, [maxKey]: null }),
    });
  }

  if (currentFurnishing) {
    const furnishOpt = FURNISHING_OPTIONS.find(o => o.value === currentFurnishing);
    activeFilterChips.push({
      key: 'furnishing',
      label: furnishOpt ? furnishOpt.label : currentFurnishing.replace(/_/g, ' '),
      onClear: () => updateParams({ furnishing: null }),
    });
  }

  if (currentFloorCategory) {
    const floorOpt = FLOOR_CATEGORY_OPTIONS.find(o => o.value === currentFloorCategory);
    activeFilterChips.push({
      key: 'floorCategory',
      label: floorOpt ? floorOpt.label : currentFloorCategory.replace(/_/g, ' '),
      onClear: () => updateParams({ floorCategory: null }),
    });
  }

  if (currentPossession) {
    const possOpt = rawPossessionOptions.find(o => o.value === currentPossession);
    activeFilterChips.push({
      key: 'possession',
      label: possOpt ? possOpt.label : currentPossession.replace(/_/g, ' '),
      onClear: () => updateParams({ possession: null }),
    });
  }

  if (currentVerified) {
    activeFilterChips.push({
      key: 'verified',
      label: 'Verified Only',
      onClear: () => updateParams({ verified: null }),
    });
  }

  const activeFilterCount = activeFilterChips.length;

  return (
    <section
      id="inventory-filters"
      aria-label="Filter and sort project inventory"
      className={`bg-white border border-[var(--color-border)] rounded-xl p-4 sm:p-5 space-y-3.5 shadow-2xs transition-opacity ${
        isPending ? 'opacity-65' : 'opacity-100'
      }`}
    >
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3.5">
        {/* Mobile Filter Toggle & Quick Bar */}
        <div className="lg:hidden flex items-center justify-between gap-2 pb-3 border-b border-[var(--color-border)]">
          <button
            type="button"
            onClick={() => setIsMobileExpanded(!isMobileExpanded)}
            aria-expanded={isMobileExpanded}
            className="h-10 px-3.5 rounded-xl border border-[var(--color-border)] bg-[#FAFAF8] text-xs font-display font-semibold text-[var(--color-foreground)] hover:border-[var(--color-foreground)]/40 inline-flex items-center gap-2 transition-colors cursor-pointer"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-[var(--color-foreground)]/75" />
            <span>Filter Apartments</span>
            {activeFilterCount > 0 && (
              <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-[var(--color-accent)] text-white text-[11px] font-bold flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
            {isMobileExpanded ? (
              <ChevronUp className="w-3.5 h-3.5 text-[var(--color-foreground)]/60 ml-0.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 text-[var(--color-foreground)]/60 ml-0.5" />
            )}
          </button>

          <div className="flex items-center gap-3">
            <span className="text-xs font-body text-[var(--color-foreground)]/70">
              <strong className="font-display font-semibold text-[var(--color-foreground)]">
                {filteredCount}
              </strong>{' '}
              of {totalEligibleCount} {totalEligibleCount === 1 ? 'apartment' : 'apartments'}
            </span>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearAllFilters}
                className="h-9 px-2.5 rounded-lg text-xs font-display font-semibold text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10 inline-flex items-center gap-1 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>
            )}
          </div>
        </div>

        {/* Filter Controls (2-col Drawer on Mobile, Compact Row on Desktop) */}
        <div
          className={`${
            isMobileExpanded
              ? 'grid grid-cols-1 sm:grid-cols-2 gap-3 pb-3 border-b border-[var(--color-border)] lg:border-b-0 lg:pb-0 lg:flex lg:flex-wrap lg:items-center'
              : 'hidden lg:flex lg:flex-wrap lg:items-center lg:gap-2.5'
          }`}
        >
          <div className="hidden lg:inline-flex items-center gap-1.5 text-xs font-display font-semibold uppercase tracking-wider text-[var(--color-foreground)]/70 mr-1">
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Filters</span>
            {activeFilterCount > 0 && (
              <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--color-accent)] text-white text-[10px] font-bold inline-flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </div>

          {/* Dynamic BHK Filter — strictly from actual availableBhkCounts */}
          {visibleBhkOptions.length > 0 && (
            <div className="space-y-1 lg:space-y-0">
              <label className="lg:hidden text-[11px] font-display font-semibold text-[var(--color-foreground)]/65 block">
                Configuration (BHK)
              </label>
              <select
                aria-label="Filter by BHK configuration"
                value={currentBhk}
                onChange={e => updateParams({ bhk: e.target.value || null })}
                className={`w-full lg:w-auto h-10 lg:h-9 px-3 rounded-lg border text-xs font-display font-medium focus:outline-hidden focus:border-[var(--color-foreground)] transition-colors ${
                  currentBhk
                    ? 'border-[var(--color-foreground)] bg-[var(--color-foreground)]/[0.04] text-[var(--color-foreground)] font-semibold'
                    : 'border-[var(--color-border)] bg-[#FAFAF8] text-[var(--color-foreground)]'
                }`}
              >
                <option value="">All Configurations</option>
                {visibleBhkOptions.map(bhk => (
                  <option key={bhk} value={String(bhk)}>
                    {bhk} BHK
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Budget Range Filter */}
          {budgetRanges.length > 1 && (
            <div className="space-y-1 lg:space-y-0">
              <label className="lg:hidden text-[11px] font-display font-semibold text-[var(--color-foreground)]/65 block">
                {isResale ? 'Asking Price Budget' : 'Monthly Rent Budget'}
              </label>
              <select
                aria-label={isResale ? 'Filter by asking price' : 'Filter by monthly rent'}
                value={currentBudgetKey}
                onChange={e => {
                  const [min, max] = e.target.value.split('-');
                  updateParams({
                    [minKey]: min || null,
                    [maxKey]: max || null,
                  });
                }}
                className={`w-full lg:w-auto h-10 lg:h-9 px-3 rounded-lg border text-xs font-display font-medium focus:outline-hidden focus:border-[var(--color-foreground)] transition-colors ${
                  currentMin || currentMax
                    ? 'border-[var(--color-foreground)] bg-[var(--color-foreground)]/[0.04] text-[var(--color-foreground)] font-semibold'
                    : 'border-[var(--color-border)] bg-[#FAFAF8] text-[var(--color-foreground)]'
                }`}
              >
                {budgetRanges.map(range => {
                  const key = `${range.min}-${range.max}`;
                  return (
                    <option key={key} value={key}>
                      {range.label}
                    </option>
                  );
                })}
              </select>
            </div>
          )}

          {/* Furnishing Filter — Only options present in project inventory */}
          {visibleFurnishingOptions.length > 0 && (
            <div className="space-y-1 lg:space-y-0">
              <label className="lg:hidden text-[11px] font-display font-semibold text-[var(--color-foreground)]/65 block">
                Furnishing Status
              </label>
              <select
                aria-label="Filter by furnishing status"
                value={currentFurnishing}
                onChange={e => updateParams({ furnishing: e.target.value || null })}
                className={`w-full lg:w-auto h-10 lg:h-9 px-3 rounded-lg border text-xs font-display font-medium focus:outline-hidden focus:border-[var(--color-foreground)] transition-colors ${
                  currentFurnishing
                    ? 'border-[var(--color-foreground)] bg-[var(--color-foreground)]/[0.04] text-[var(--color-foreground)] font-semibold'
                    : 'border-[var(--color-border)] bg-[#FAFAF8] text-[var(--color-foreground)]'
                }`}
              >
                <option value="">All Furnishing</option>
                {visibleFurnishingOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Floor Category Filter — Only options present in project inventory */}
          {visibleFloorOptions.length > 0 && (
            <div className="space-y-1 lg:space-y-0">
              <label className="lg:hidden text-[11px] font-display font-semibold text-[var(--color-foreground)]/65 block">
                Floor Level
              </label>
              <select
                aria-label="Filter by floor level"
                value={currentFloorCategory}
                onChange={e => updateParams({ floorCategory: e.target.value || null })}
                className={`w-full lg:w-auto h-10 lg:h-9 px-3 rounded-lg border text-xs font-display font-medium focus:outline-hidden focus:border-[var(--color-foreground)] transition-colors ${
                  currentFloorCategory
                    ? 'border-[var(--color-foreground)] bg-[var(--color-foreground)]/[0.04] text-[var(--color-foreground)] font-semibold'
                    : 'border-[var(--color-border)] bg-[#FAFAF8] text-[var(--color-foreground)]'
                }`}
              >
                <option value="">Any Floor</option>
                {visibleFloorOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Possession Filter — Only options present in project inventory */}
          {visiblePossessionOptions.length > 0 && (
            <div className="space-y-1 lg:space-y-0">
              <label className="lg:hidden text-[11px] font-display font-semibold text-[var(--color-foreground)]/65 block">
                Possession / Availability
              </label>
              <select
                aria-label="Filter by possession status"
                value={currentPossession}
                onChange={e => updateParams({ possession: e.target.value || null })}
                className={`w-full lg:w-auto h-10 lg:h-9 px-3 rounded-lg border text-xs font-display font-medium focus:outline-hidden focus:border-[var(--color-foreground)] transition-colors ${
                  currentPossession
                    ? 'border-[var(--color-foreground)] bg-[var(--color-foreground)]/[0.04] text-[var(--color-foreground)] font-semibold'
                    : 'border-[var(--color-border)] bg-[#FAFAF8] text-[var(--color-foreground)]'
                }`}
              >
                <option value="">Any Availability</option>
                {visiblePossessionOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Verified Toggle */}
          {showVerifiedToggle && (
            <div className="pt-2 sm:pt-5 lg:pt-0">
              <button
                type="button"
                onClick={() => updateParams({ verified: currentVerified ? null : 'true' })}
                aria-pressed={currentVerified}
                className={`w-full lg:w-auto h-10 lg:h-9 px-3 rounded-lg border text-xs font-display font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                  currentVerified
                    ? 'bg-[#218C5A]/15 border-[#218C5A] text-[#218C5A]'
                    : 'border-[var(--color-border)] bg-[#FAFAF8] text-[var(--color-foreground)]/80 hover:border-[var(--color-foreground)]/40'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>
                  Verified Only{typeof verifiedCount === 'number' && verifiedCount > 0 ? ` (${verifiedCount})` : ''}
                </span>
              </button>
            </div>
          )}

          {/* Mobile Drawer Collapse Button */}
          <div className="lg:hidden sm:col-span-2 pt-1 flex items-center justify-end gap-2">
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearAllFilters}
                className="h-9 px-3 rounded-lg border border-[var(--color-border)] text-xs font-display font-semibold text-[var(--color-foreground)]/75 hover:text-[var(--color-foreground)] cursor-pointer"
              >
                Clear All
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsMobileExpanded(false)}
              className="h-9 px-4 rounded-lg bg-[var(--color-foreground)] text-[var(--color-background)] text-xs font-display font-semibold cursor-pointer"
            >
              Done ({filteredCount} {filteredCount === 1 ? 'Apartment' : 'Apartments'})
            </button>
          </div>
        </div>

        {/* Sort Control & Result Summary */}
        <div className="flex items-center justify-between lg:justify-end gap-3">
          <span className="hidden lg:inline text-xs font-body text-[var(--color-foreground)]/65">
            Showing <strong className="font-display font-semibold text-[var(--color-foreground)]">{filteredCount}</strong> of{' '}
            <strong className="font-display font-semibold text-[var(--color-foreground)]">{totalEligibleCount}</strong>{' '}
            {totalEligibleCount === 1 ? 'apartment' : 'apartments'}
          </span>

          <div className="flex items-center justify-between w-full lg:w-auto gap-2">
            <label htmlFor="inventory-sort" className="text-xs font-display font-medium text-[var(--color-foreground)]/65 shrink-0">
              Sort by:
            </label>
            <select
              id="inventory-sort"
              value={currentSort}
              onChange={e => updateParams({ sort: e.target.value === 'newest' ? null : e.target.value })}
              className="h-10 lg:h-9 px-3 rounded-lg border border-[var(--color-border)] bg-[#FAFAF8] text-xs font-display font-semibold text-[var(--color-foreground)] focus:outline-hidden focus:border-[var(--color-foreground)]"
            >
              <option value="newest">Newest First</option>
              <option value={isResale ? 'price_asc' : 'rent_asc'}>
                {isResale ? 'Price: Low to High' : 'Rent: Low to High'}
              </option>
              <option value={isResale ? 'price_desc' : 'rent_desc'}>
                {isResale ? 'Price: High to Low' : 'Rent: High to Low'}
              </option>
              <option value="area_desc">Carpet Area: Largest First</option>
            </select>
          </div>
        </div>
      </div>

      {/* Active Filter Chips Bar (Individual 1-click clear + Clear All) */}
      {activeFilterChips.length > 0 && (
        <div
          aria-label="Active filters"
          className="pt-3 border-t border-[var(--color-border)]/70 flex flex-wrap items-center gap-2"
        >
          <span className="text-[11px] font-display font-semibold uppercase tracking-wider text-[var(--color-foreground)]/50 mr-1">
            Active ({activeFilterCount}):
          </span>

          {activeFilterChips.map(chip => (
            <button
              key={chip.key}
              type="button"
              onClick={chip.onClear}
              aria-label={`Remove ${chip.label} filter`}
              className="h-7 px-2.5 rounded-lg bg-[var(--color-foreground)]/[0.05] hover:bg-[var(--color-foreground)]/[0.1] border border-[var(--color-border)] text-xs font-display font-medium text-[var(--color-foreground)] inline-flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <span>{chip.label}</span>
              <X className="w-3 h-3 text-[var(--color-foreground)]/60" />
            </button>
          ))}

          <button
            type="button"
            onClick={clearAllFilters}
            className="h-7 px-2.5 rounded-lg text-xs font-display font-semibold text-[var(--color-accent)] hover:underline inline-flex items-center gap-1 ml-auto cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Clear All</span>
          </button>
        </div>
      )}
    </section>
  );
}

