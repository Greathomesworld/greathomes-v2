'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { SlidersHorizontal, X, Check, MapPin, ChevronDown } from 'lucide-react';
import { ActiveFilterChips } from './ActiveFilterChips';

interface LocationOption {
  id: string;
  name: string;
  slug: string;
  type: string;
}

interface DiscoveryFilterBarProps {
  mode: 'buy' | 'rent' | 'projects';
  availableLocations?: LocationOption[];
}

const BHK_OPTIONS = [
  { label: 'All BHK', value: '' },
  { label: '1 BHK', value: '1' },
  { label: '2 BHK', value: '2' },
  { label: '3 BHK', value: '3' },
  { label: '4 BHK', value: '4' },
  { label: '5+ BHK', value: '5' },
];

const PROPERTY_TYPE_OPTIONS = [
  { label: 'All Types', value: '' },
  { label: 'Apartment', value: 'APARTMENT' },
  { label: 'Villa', value: 'VILLA' },
  { label: 'Independent House', value: 'INDEPENDENT_HOUSE' },
  { label: 'Plot', value: 'PLOT' },
  { label: 'Duplex', value: 'DUPLEX' },
  { label: 'Penthouse', value: 'PENTHOUSE' },
];

const BUY_BUDGET_RANGES = [
  { label: 'Any Budget', min: '', max: '' },
  { label: 'Under ₹50 L', min: '', max: '5000000' },
  { label: '₹50 L – ₹1 Cr', min: '5000000', max: '10000000' },
  { label: '₹1 Cr – ₹2 Cr', min: '10000000', max: '20000000' },
  { label: '₹2 Cr – ₹5 Cr', min: '20000000', max: '50000000' },
  { label: 'Above ₹5 Cr', min: '50000000', max: '' },
];

const RENT_BUDGET_RANGES = [
  { label: 'Any Rent', min: '', max: '' },
  { label: 'Under ₹20,000', min: '', max: '20000' },
  { label: '₹20,000 – ₹40,000', min: '20000', max: '40000' },
  { label: '₹40,000 – ₹75,000', min: '40000', max: '75000' },
  { label: '₹75,000 – ₹1.5 L', min: '75000', max: '150000' },
  { label: 'Above ₹1.5 L', min: '150000', max: '' },
];

const FURNISHING_OPTIONS = [
  { label: 'All Furnishing', value: '' },
  { label: 'Fully Furnished', value: 'FULLY_FURNISHED' },
  { label: 'Semi Furnished', value: 'SEMI_FURNISHED' },
  { label: 'Unfurnished', value: 'UNFURNISHED' },
];

const STAGE_OPTIONS = [
  { label: 'All Stages', value: '' },
  { label: 'Upcoming', value: 'UPCOMING' },
  { label: 'New Launch', value: 'NEW_LAUNCH' },
  { label: 'Under Construction', value: 'UNDER_CONSTRUCTION' },
  { label: 'Ready to Move', value: 'READY_TO_MOVE' },
];

export function DiscoveryFilterBar({ mode, availableLocations = [] }: DiscoveryFilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Mobile drawer state
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  // Active parameter values from URL
  const activeLocation = searchParams.get('location') || '';
  const activeBhk = searchParams.get('bedroomCount') || searchParams.get('bhk') || '';
  const activeType = searchParams.get('propertyType') || '';
  const activeMinPrice = searchParams.get('minPrice') || '';
  const activeMaxPrice = searchParams.get('maxPrice') || '';
  const activeInventory = searchParams.get('inventoryType') || '';
  const activeFurnishing = searchParams.get('furnishing') || '';
  const activeStage = searchParams.get('stage') || searchParams.get('status') || '';

  // Local draft state for mobile drawer
  const [draftLocation, setDraftLocation] = useState(activeLocation);
  const [draftBhk, setDraftBhk] = useState(activeBhk);
  const [draftType, setDraftType] = useState(activeType);
  const [draftMinPrice, setDraftMinPrice] = useState(activeMinPrice);
  const [draftMaxPrice, setDraftMaxPrice] = useState(activeMaxPrice);
  const [draftInventory, setDraftInventory] = useState(activeInventory);
  const [draftFurnishing, setDraftFurnishing] = useState(activeFurnishing);
  const [draftStage, setDraftStage] = useState(activeStage);

  // Synchronize draft state when drawer opens or searchParams change
  useEffect(() => {
    setDraftLocation(activeLocation);
    setDraftBhk(activeBhk);
    setDraftType(activeType);
    setDraftMinPrice(activeMinPrice);
    setDraftMaxPrice(activeMaxPrice);
    setDraftInventory(activeInventory);
    setDraftFurnishing(activeFurnishing);
    setDraftStage(activeStage);
  }, [activeLocation, activeBhk, activeType, activeMinPrice, activeMaxPrice, activeInventory, activeFurnishing, activeStage, mobileDrawerOpen]);

  const activeQuery = searchParams.get('q') || searchParams.get('query') || '';

  // Count active filters (excluding default sort)
  let activeFilterCount = 0;
  if (activeQuery.trim()) activeFilterCount++;
  if (activeLocation) activeFilterCount++;
  if (activeBhk) activeFilterCount++;
  if (activeType) activeFilterCount++;
  if (activeMinPrice || activeMaxPrice) activeFilterCount++;
  if (activeInventory && activeInventory !== 'ALL') activeFilterCount++;
  if (activeFurnishing && activeFurnishing !== 'ALL') activeFilterCount++;
  if (activeStage) activeFilterCount++;

  // Helper to apply desktop filter update immediately
  const updateUrlParam = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('page'); // Reset to page 1

    Object.entries(updates).forEach(([key, val]) => {
      if (val === null || val === '') {
        params.delete(key);
      } else {
        params.set(key, val);
      }
    });

    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  // Helper to apply all draft mobile filters
  const applyMobileFilters = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('page');

    const setOrDelete = (key: string, val: string) => {
      if (!val || val === 'ALL') params.delete(key);
      else params.set(key, val);
    };

    setOrDelete('location', draftLocation);
    setOrDelete('bedroomCount', draftBhk);
    params.delete('bhk'); // remove duplicate if any
    setOrDelete('propertyType', draftType);
    setOrDelete('minPrice', draftMinPrice);
    setOrDelete('maxPrice', draftMaxPrice);
    setOrDelete('inventoryType', draftInventory);
    setOrDelete('furnishing', draftFurnishing);
    setOrDelete('stage', draftStage);
    params.delete('status'); // clean legacy param

    setMobileDrawerOpen(false);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  // Clear all mobile filters
  const clearMobileFilters = () => {
    setDraftLocation('');
    setDraftBhk('');
    setDraftType('');
    setDraftMinPrice('');
    setDraftMaxPrice('');
    setDraftInventory('');
    setDraftFurnishing('');
    setDraftStage('');
  };

  // Escape key closes mobile modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && mobileDrawerOpen) {
        setMobileDrawerOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileDrawerOpen]);

  const budgetRanges = mode === 'rent' ? RENT_BUDGET_RANGES : BUY_BUDGET_RANGES;

  // Find currently selected budget range index
  const currentBudgetRangeIdx = budgetRanges.findIndex(
    r => r.min === activeMinPrice && r.max === activeMaxPrice
  );

  return (
    <div className="mb-6">
      {/* 1. Primary Segments for /buy */}
      {mode === 'buy' && (
        <div className="flex items-center gap-1 p-1 bg-neutral-100 rounded-lg w-fit mb-4">
          <button
            type="button"
            onClick={() => updateUrlParam({ inventoryType: null })}
            className={`px-3.5 py-1.5 rounded-md text-xs font-semibold tracking-wide transition-all cursor-pointer ${
              !activeInventory || activeInventory === 'ALL'
                ? 'bg-white text-[#111111] shadow-2xs'
                : 'text-neutral-600 hover:text-[#111111]'
            }`}
          >
            All Homes
          </button>
          <button
            type="button"
            onClick={() => updateUrlParam({ inventoryType: 'NEW_BOOKING' })}
            className={`px-3.5 py-1.5 rounded-md text-xs font-semibold tracking-wide transition-all cursor-pointer ${
              activeInventory === 'NEW_BOOKING'
                ? 'bg-white text-[#111111] shadow-2xs'
                : 'text-neutral-600 hover:text-[#111111]'
            }`}
          >
            New Booking
          </button>
          <button
            type="button"
            onClick={() => updateUrlParam({ inventoryType: 'RESALE' })}
            className={`px-3.5 py-1.5 rounded-md text-xs font-semibold tracking-wide transition-all cursor-pointer ${
              activeInventory === 'RESALE'
                ? 'bg-white text-[#111111] shadow-2xs'
                : 'text-neutral-600 hover:text-[#111111]'
            }`}
          >
            Resale
          </button>
        </div>
      )}

      {/* 2. Desktop Filter Bar */}
      <div className="hidden lg:flex items-center gap-3 p-3 bg-white border border-[rgba(17,17,17,0.08)] rounded-xl shadow-xs flex-wrap">
        {/* Location Dropdown */}
        <div className="relative min-w-[160px]">
          <select
            id="filter-location-select"
            aria-label="Location"
            value={activeLocation}
            onChange={(e) => updateUrlParam({ location: e.target.value })}
            className="w-full appearance-none bg-[#FAFAF8] border border-[rgba(17,17,17,0.1)] rounded-lg pl-3 pr-8 py-2 text-xs font-medium text-[#111111] focus:outline-hidden focus:ring-1 focus:ring-[#111111] cursor-pointer"
          >
            <option value="">All Locations</option>
            {availableLocations.map(loc => (
              <option key={loc.id} value={loc.slug}>
                {loc.name}
              </option>
            ))}
          </select>
          <ChevronDown className="w-3.5 h-3.5 text-neutral-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>

        {/* BHK Dropdown */}
        <div className="relative min-w-[120px]">
          <select
            id="filter-bhk-select"
            aria-label="BHK"
            value={activeBhk}
            onChange={(e) => updateUrlParam({ bedroomCount: e.target.value, bhk: null })}
            className="w-full appearance-none bg-[#FAFAF8] border border-[rgba(17,17,17,0.1)] rounded-lg pl-3 pr-8 py-2 text-xs font-medium text-[#111111] focus:outline-hidden focus:ring-1 focus:ring-[#111111] cursor-pointer"
          >
            {BHK_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <ChevronDown className="w-3.5 h-3.5 text-neutral-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>

        {/* Property Type Dropdown */}
        <div className="relative min-w-[140px]">
          <select
            id="filter-property-type-select"
            aria-label="Property Type"
            value={activeType}
            onChange={(e) => updateUrlParam({ propertyType: e.target.value })}
            className="w-full appearance-none bg-[#FAFAF8] border border-[rgba(17,17,17,0.1)] rounded-lg pl-3 pr-8 py-2 text-xs font-medium text-[#111111] focus:outline-hidden focus:ring-1 focus:ring-[#111111] cursor-pointer"
          >
            {PROPERTY_TYPE_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <ChevronDown className="w-3.5 h-3.5 text-neutral-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>

        {/* Budget Dropdown */}
        <div className="relative min-w-[150px]">
          <select
            id="filter-budget-select"
            aria-label="Budget"
            value={currentBudgetRangeIdx >= 0 ? currentBudgetRangeIdx.toString() : ''}
            onChange={(e) => {
              const idx = parseInt(e.target.value);
              if (isNaN(idx) || idx === 0) {
                updateUrlParam({ minPrice: null, maxPrice: null });
              } else {
                const range = budgetRanges[idx];
                updateUrlParam({ minPrice: range.min || null, maxPrice: range.max || null });
              }
            }}
            className="w-full appearance-none bg-[#FAFAF8] border border-[rgba(17,17,17,0.1)] rounded-lg pl-3 pr-8 py-2 text-xs font-medium text-[#111111] focus:outline-hidden focus:ring-1 focus:ring-[#111111] cursor-pointer"
          >
            {budgetRanges.map((opt, i) => (
              <option key={i} value={i.toString()}>
                {opt.label}
              </option>
            ))}
          </select>
          <ChevronDown className="w-3.5 h-3.5 text-neutral-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>

        {/* Rent Only: Furnishing Dropdown */}
        {mode === 'rent' && (
          <div className="relative min-w-[140px]">
            <select
              id="filter-furnishing-select"
              aria-label="Furnishing"
              value={activeFurnishing}
              onChange={(e) => updateUrlParam({ furnishing: e.target.value })}
              className="w-full appearance-none bg-[#FAFAF8] border border-[rgba(17,17,17,0.1)] rounded-lg pl-3 pr-8 py-2 text-xs font-medium text-[#111111] focus:outline-hidden focus:ring-1 focus:ring-[#111111] cursor-pointer"
            >
              {FURNISHING_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-neutral-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        )}

        {/* Projects Only: Development Stage Dropdown */}
        {mode === 'projects' && (
          <div className="relative min-w-[160px]">
            <select
              id="filter-stage-select"
              aria-label="Development Stage"
              value={activeStage}
              onChange={(e) => updateUrlParam({ stage: e.target.value, status: null })}
              className="w-full appearance-none bg-[#FAFAF8] border border-[rgba(17,17,17,0.1)] rounded-lg pl-3 pr-8 py-2 text-xs font-medium text-[#111111] focus:outline-hidden focus:ring-1 focus:ring-[#111111] cursor-pointer"
            >
              {STAGE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-neutral-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        )}
      </div>

      {/* 3. Mobile Filter Trigger Button */}
      <div className="lg:hidden flex items-center gap-2">
        <button
          type="button"
          onClick={() => setMobileDrawerOpen(true)}
          className="flex-1 flex items-center justify-center gap-2 min-h-[44px] px-4 py-2.5 bg-white border border-[rgba(17,17,17,0.12)] rounded-xl text-sm font-semibold text-[#111111] shadow-2xs hover:bg-neutral-50 active:scale-98 transition-all cursor-pointer"
          aria-expanded={mobileDrawerOpen}
          aria-controls="mobile-filter-drawer"
        >
          <SlidersHorizontal className="w-4 h-4 text-[#E85D3F]" />
          <span>Filters</span>
          {activeFilterCount > 0 && (
            <span className="bg-[#111111] text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      {/* 4. Active Filter Chips Row */}
      <ActiveFilterChips mode={mode} locations={availableLocations} />

      {/* 5. Mobile Filter Sheet / Modal */}
      {mobileDrawerOpen && (
        <div
          id="mobile-filter-drawer"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mobile-filter-title"
          className="fixed inset-0 z-50 flex flex-col justify-end bg-black/50 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
        >
          {/* Backdrop click area */}
          <div
            className="flex-1 w-full"
            onClick={() => setMobileDrawerOpen(false)}
            aria-hidden="true"
          />

          {/* Sheet Body */}
          <div className="w-full max-h-[85vh] bg-white rounded-t-2xl flex flex-col overflow-hidden shadow-2xl animate-in slide-in-from-bottom duration-300">
            {/* Header */}
            <div className="px-5 py-4 border-b border-[rgba(17,17,17,0.08)] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-[#E85D3F]" />
                <h2 id="mobile-filter-title" className="font-display font-semibold text-lg text-[#111111]">
                  Filter Properties
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setMobileDrawerOpen(false)}
                className="p-2 text-neutral-400 hover:text-[#111111] rounded-full hover:bg-neutral-100 transition-colors"
                aria-label="Close filters"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Filters */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
              {/* Inventory Type (for buy) */}
              {mode === 'buy' && (
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-2.5">
                    Inventory Type
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: 'All', value: '' },
                      { label: 'New Booking', value: 'NEW_BOOKING' },
                      { label: 'Resale', value: 'RESALE' },
                    ].map(tab => (
                      <button
                        key={tab.value}
                        type="button"
                        onClick={() => setDraftInventory(tab.value)}
                        className={`min-h-[44px] px-3 py-2 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                          draftInventory === tab.value
                            ? 'bg-[#111111] text-white border-[#111111]'
                            : 'bg-neutral-50 text-neutral-700 border-[rgba(17,17,17,0.1)]'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Location */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-2">
                  Location
                </label>
                <div className="relative">
                  <select
                    value={draftLocation}
                    onChange={(e) => setDraftLocation(e.target.value)}
                    className="w-full min-h-[44px] appearance-none bg-[#FAFAF8] border border-[rgba(17,17,17,0.15)] rounded-lg pl-3 pr-8 py-2.5 text-sm font-medium text-[#111111]"
                  >
                    <option value="">All Locations</option>
                    {availableLocations.map(loc => (
                      <option key={loc.id} value={loc.slug}>
                        {loc.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-neutral-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              {/* BHK */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-2.5">
                  Bedrooms (BHK)
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {BHK_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setDraftBhk(opt.value)}
                      className={`min-h-[44px] px-3 py-2 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                        draftBhk === opt.value
                          ? 'bg-[#111111] text-white border-[#111111]'
                          : 'bg-neutral-50 text-neutral-700 border-[rgba(17,17,17,0.1)]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Property Type */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-2">
                  Property Type
                </label>
                <div className="relative">
                  <select
                    value={draftType}
                    onChange={(e) => setDraftType(e.target.value)}
                    className="w-full min-h-[44px] appearance-none bg-[#FAFAF8] border border-[rgba(17,17,17,0.15)] rounded-lg pl-3 pr-8 py-2.5 text-sm font-medium text-[#111111]"
                  >
                    {PROPERTY_TYPE_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-neutral-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              {/* Budget */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-2.5">
                  {mode === 'rent' ? 'Monthly Rent Range' : 'Budget Range'}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {budgetRanges.map((range, i) => {
                    const isSelected = draftMinPrice === range.min && draftMaxPrice === range.max;
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => {
                          setDraftMinPrice(range.min);
                          setDraftMaxPrice(range.max);
                        }}
                        className={`min-h-[44px] px-3 py-2 text-xs font-semibold rounded-lg border text-left transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-[#111111] text-white border-[#111111]'
                            : 'bg-neutral-50 text-neutral-700 border-[rgba(17,17,17,0.1)]'
                        }`}
                      >
                        {range.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Furnishing (rent only) */}
              {mode === 'rent' && (
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-2.5">
                    Furnishing Status
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {FURNISHING_OPTIONS.map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setDraftFurnishing(opt.value)}
                        className={`min-h-[44px] px-3 py-2 text-xs font-semibold rounded-lg border text-left transition-all cursor-pointer ${
                          draftFurnishing === opt.value
                            ? 'bg-[#111111] text-white border-[#111111]'
                            : 'bg-neutral-50 text-neutral-700 border-[rgba(17,17,17,0.1)]'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Development Stage (projects only) */}
              {mode === 'projects' && (
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-2.5">
                    Development Stage
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {STAGE_OPTIONS.map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setDraftStage(opt.value)}
                        className={`min-h-[44px] px-3 py-2 text-xs font-semibold rounded-lg border text-left transition-all cursor-pointer ${
                          draftStage === opt.value
                            ? 'bg-[#111111] text-white border-[#111111]'
                            : 'bg-neutral-50 text-neutral-700 border-[rgba(17,17,17,0.1)]'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer Actions */}
            <div className="p-4 border-t border-[rgba(17,17,17,0.08)] bg-neutral-50 flex items-center gap-3">
              <button
                type="button"
                onClick={clearMobileFilters}
                className="flex-1 min-h-[44px] px-4 py-2.5 border border-[rgba(17,17,17,0.15)] rounded-xl text-xs font-semibold text-neutral-700 hover:bg-white transition-colors cursor-pointer"
              >
                Reset All
              </button>
              <button
                type="button"
                onClick={applyMobileFilters}
                className="flex-2 min-h-[44px] px-4 py-2.5 bg-[#111111] text-white rounded-xl text-xs font-semibold hover:bg-neutral-800 transition-colors shadow-sm cursor-pointer"
              >
                Apply Filters
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
