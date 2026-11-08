'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Search,
  MapPin,
  Building2,
  Home,
  Key,
  ArrowRight,
  ChevronRight,
  LayoutGrid,
  Map as MapIcon,
  Columns,
  Layers,
  X,
  Compass,
  Sparkles,
} from 'lucide-react';
import {
  DirectoryIntelligenceSummaryDto,
  DirectoryLocationCardDto,
} from '@/src/domain/marketIntelligence/services/marketIntelligenceService';
import {
  KOLKATA_CORRIDORS,
  KolkataCorridorId,
} from '@/src/domain/locations/locationRegionMapper';
import { LocationsMapExplorer } from './LocationsMapExplorer';
import { GreatHomesIllustration } from '@/src/components/illustrations/GreatHomesIllustration';

interface LocationsDirectoryClientProps {
  summary: DirectoryIntelligenceSummaryDto;
}

type LocationScopeFilter = 'ALL_AREAS' | 'ALL_LOCATIONS' | 'FEATURED';
type DirectoryViewMode = 'grid' | 'split' | 'map';

export function LocationsDirectoryClient({ summary }: LocationsDirectoryClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Initialize state from URL query parameters
  const initialQ = searchParams.get('q') || '';
  const initialRegion = (searchParams.get('region') as KolkataCorridorId) || 'ALL';
  const initialType = (searchParams.get('type') as LocationScopeFilter) || 'ALL_AREAS';
  const initialView = (searchParams.get('view') as DirectoryViewMode) || 'grid';

  const [searchQuery, setSearchQuery] = useState<string>(initialQ);
  const [debouncedQuery, setDebouncedQuery] = useState<string>(initialQ);
  const [activeRegion, setActiveRegion] = useState<KolkataCorridorId>(
    KOLKATA_CORRIDORS.some(c => c.id === initialRegion) ? initialRegion : 'ALL'
  );
  const [locationScope, setLocationScope] = useState<LocationScopeFilter>(
    ['ALL_AREAS', 'ALL_LOCATIONS', 'FEATURED'].includes(initialType) ? initialType : 'ALL_AREAS'
  );
  const [viewMode, setViewMode] = useState<DirectoryViewMode>(
    ['grid', 'split', 'map'].includes(initialView) ? initialView : 'grid'
  );
  const [showAllPopular, setShowAllPopular] = useState<boolean>(false);
  const [regionTab, setRegionTab] = useState<KolkataCorridorId>('ALL');
  const [selectedMapSlug, setSelectedMapSlug] = useState<string | null>(null);
  const [expandedRegionAreas, setExpandedRegionAreas] = useState<Record<string, boolean>>({});

  // Synchronize filters to URL without page jump
  const syncUrlParams = useCallback(
    (next: {
      q?: string;
      region?: KolkataCorridorId;
      type?: LocationScopeFilter;
      view?: DirectoryViewMode;
    }) => {
      const params = new URLSearchParams(
        typeof window !== 'undefined' ? window.location.search : searchParams.toString()
      );
      const qVal = next.q !== undefined ? next.q : debouncedQuery;
      const regVal = next.region !== undefined ? next.region : activeRegion;
      const typeVal = next.type !== undefined ? next.type : locationScope;
      const viewVal = next.view !== undefined ? next.view : viewMode;

      if (qVal) params.set('q', qVal);
      else params.delete('q');

      if (regVal && regVal !== 'ALL') params.set('region', regVal);
      else params.delete('region');

      if (typeVal && typeVal !== 'ALL_AREAS') params.set('type', typeVal);
      else params.delete('type');

      if (viewVal && viewVal !== 'grid') params.set('view', viewVal);
      else params.delete('view');

      const qs = params.toString();
      router.replace(`/locations${qs ? `?${qs}` : ''}`, { scroll: false });
    },
    [searchParams, debouncedQuery, activeRegion, locationScope, viewMode, router]
  );

  // Debounce search input (150ms) and sync to URL
  useEffect(() => {
    const timer = setTimeout(() => {
      const trimmed = searchQuery.trim();
      setDebouncedQuery(trimmed);
      syncUrlParams({ q: trimmed });
    }, 150);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleRegionChange = (region: KolkataCorridorId) => {
    setActiveRegion(region);
    setRegionTab(region);
    syncUrlParams({ region });
  };

  const handleScopeChange = (scope: LocationScopeFilter) => {
    setLocationScope(scope);
    syncUrlParams({ type: scope });
  };

  const handleViewChange = (mode: DirectoryViewMode) => {
    setViewMode(mode);
    syncUrlParams({ view: mode });
  };

  const handleClearFilters = () => {
    setSearchQuery('');
    setDebouncedQuery('');
    setActiveRegion('ALL');
    setLocationScope('ALL_AREAS');
    setShowAllPopular(false);
    router.replace('/locations', { scroll: false });
  };

  // Filtered locations for main Popular / Key Residential Areas grid
  const filteredPrimaryLocations = useMemo(() => {
    let sourcePool: DirectoryLocationCardDto[] = [];
    if (locationScope === 'ALL_LOCATIONS') {
      sourcePool = [...summary.areas, ...summary.neighbourhoods];
    } else if (locationScope === 'FEATURED') {
      sourcePool = summary.areas.filter(a => a.featured);
    } else {
      // If user is searching, search across both Areas AND Neighbourhoods so micro-markets like Sector V or Action Area I are immediately found
      sourcePool = debouncedQuery
        ? [...summary.areas, ...summary.neighbourhoods]
        : summary.areas;
    }

    return sourcePool.filter(loc => {
      if (activeRegion !== 'ALL' && loc.corridorId !== activeRegion) {
        return false;
      }
      if (debouncedQuery) {
        const q = debouncedQuery.toLowerCase();
        const matchName = loc.name.toLowerCase().includes(q);
        const matchSlug = loc.slug.toLowerCase().includes(q);
        const matchParent = (loc.parentName || '').toLowerCase().includes(q);
        const matchCorridor = (loc.corridorLabel || '').toLowerCase().includes(q);
        const matchDesc = loc.shortDescription.toLowerCase().includes(q);
        const matchChildren = loc.childMicroMarkets.some(c =>
          c.name.toLowerCase().includes(q)
        );
        return (
          matchName ||
          matchSlug ||
          matchParent ||
          matchCorridor ||
          matchDesc ||
          matchChildren
        );
      }
      return true;
    });
  }, [summary.areas, summary.neighbourhoods, locationScope, activeRegion, debouncedQuery]);

  const isFiltered =
    Boolean(debouncedQuery) || activeRegion !== 'ALL' || locationScope !== 'ALL_AREAS';

  const displayedPopularCards = useMemo(() => {
    if (isFiltered || showAllPopular) {
      return filteredPrimaryLocations;
    }
    return filteredPrimaryLocations.slice(0, 6);
  }, [filteredPrimaryLocations, isFiltered, showAllPopular]);

  // Explore by Region filtered areas
  const regionalDirectoryAreas = useMemo(() => {
    if (regionTab === 'ALL') return summary.areas;
    return summary.areas.filter(a => a.corridorId === regionTab);
  }, [summary.areas, regionTab]);

  const badgeToneClasses: Record<DirectoryLocationCardDto['badgeTone'], string> = {
    coral: 'bg-[#FDECE8] text-[#D94B2B] border-[#F9C8BD]',
    amber: 'bg-[#FEF3D6] text-[#B86E00] border-[#F8DCA0]',
    green: 'bg-[#E5F5ED] text-[#1B7A4E] border-[#B6E2CC]',
    neutral: 'bg-[#F4F1EA] text-[#4A463F] border-[#E2DDD2]',
  };

  return (
    <div className="space-y-12 sm:space-y-14 pb-16">
      {/* 1. EDITORIAL HERO SECTION (Matching Reference A) */}
      <section className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-center">
          {/* Left Hero Copy */}
          <div className="lg:col-span-7 space-y-4">
            <div className="inline-flex items-center gap-1.5 text-xs text-[#218C5A] font-display font-semibold bg-[#218C5A]/10 px-3 py-1 rounded-full border border-[#218C5A]/20">
              <Compass className="w-3.5 h-3.5" />
              <span>Kolkata Location &amp; Neighbourhood Guide</span>
            </div>

            <h1 className="text-3xl sm:text-4xl lg:text-[46px] font-editorial font-normal text-[#111111] tracking-tight leading-[1.12]">
              Explore <span className="text-[#E85D3F]">Kolkata&apos;s</span> Residential Corridors &amp; Neighbourhoods
            </h1>

            <p className="text-sm sm:text-base lg:text-[17px] font-body text-[#111111]/75 leading-relaxed max-w-2xl">
              Discover the best residential locations across Kolkata. Compare neighbourhoods, explore connectivity, discover residential projects and find verified resale and rental opportunities.
            </p>
          </div>

          {/* Right Hero Architectural Skyline Illustration */}
          <div className="lg:col-span-5 hidden sm:flex justify-end">
            <div className="w-full max-w-[460px] h-[170px] sm:h-[195px] rounded-2xl bg-gradient-to-b from-[#F7F3EB] to-[#FAFAF8] border border-[rgba(17,17,17,0.06)] overflow-hidden flex items-center justify-center px-4 py-2 relative shadow-2xs">
              <GreatHomesIllustration
                id="LOCATION_DISCOVERY"
                size="FEATURE"
                className="w-full h-full object-contain opacity-95"
              />
            </div>
          </div>
        </div>

        {/* 2. FACTUAL COVERAGE SUMMARY METRICS STRIP (Matching Reference A) */}
        <div
          aria-label="Kolkata Location Coverage Summary"
          className="bg-[#F6F2EC] border border-[rgba(17,17,17,0.08)] rounded-2xl p-4 sm:p-5 grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 shadow-2xs"
        >
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-full bg-[#E85D3F]/12 border border-[#E85D3F]/20 flex items-center justify-center text-[#E85D3F] shrink-0">
              <MapPin className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <span className="block text-xl sm:text-2xl font-display font-bold text-[#111111] leading-tight">
                {summary.totals.areasCount}
              </span>
              <span className="block text-xs font-body text-[#111111]/70 truncate">
                Key Residential Areas ({summary.totals.neighbourhoodsCount} Micro-Markets)
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-full bg-[#E85D3F]/12 border border-[#E85D3F]/20 flex items-center justify-center text-[#E85D3F] shrink-0">
              <Building2 className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <span className="block text-xl sm:text-2xl font-display font-bold text-[#111111] leading-tight">
                {summary.totals.publishedProjectsCount}
              </span>
              <span className="block text-xs font-body text-[#111111]/70 truncate">
                Published Residential Projects
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-full bg-[#E85D3F]/12 border border-[#E85D3F]/20 flex items-center justify-center text-[#E85D3F] shrink-0">
              <Home className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <span className="block text-xl sm:text-2xl font-display font-bold text-[#111111] leading-tight">
                {summary.totals.verifiedResaleCount}
              </span>
              <span className="block text-xs font-body text-[#111111]/70 truncate">
                Verified Resale Homes
                {summary.totals.unverifiedResaleCount > 0
                  ? ` (+${summary.totals.unverifiedResaleCount} Unverified)`
                  : ''}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-full bg-[#E85D3F]/12 border border-[#E85D3F]/20 flex items-center justify-center text-[#E85D3F] shrink-0">
              <Key className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <span className="block text-xl sm:text-2xl font-display font-bold text-[#111111] leading-tight">
                {summary.totals.verifiedRentalCount}
              </span>
              <span className="block text-xs font-body text-[#111111]/70 truncate">
                Verified Rental Homes
                {summary.totals.unverifiedRentalCount > 0
                  ? ` (+${summary.totals.unverifiedRentalCount} Unverified)`
                  : ''}
              </span>
            </div>
          </div>
        </div>

        {/* 3. SEARCH BAR, LOCATION SCOPE SELECTOR, VIEW TOGGLE & CORRIDOR FILTER PILLS */}
        <div className="space-y-3.5">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-center">
            {/* Search Input */}
            <div className="lg:col-span-7 relative">
              <Search className="w-4 h-4 text-[#E85D3F] absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search New Town, Rajarhat, Ballygunge, Sector V, Action Area..."
                aria-label="Search Kolkata residential areas and neighbourhoods"
                className="w-full h-12 pl-11 pr-10 rounded-xl bg-white border border-[rgba(17,17,17,0.12)] text-sm font-body text-[#111111] placeholder:text-[#111111]/45 focus:outline-hidden focus:border-[#E85D3F] focus:ring-2 focus:ring-[#E85D3F]/15 shadow-2xs transition-all"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search query"
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full text-[#111111]/45 hover:text-[#111111] hover:bg-neutral-100 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Location Type / Scope Dropdown */}
            <div className="lg:col-span-3">
              <div className="relative h-12 rounded-xl bg-white border border-[rgba(17,17,17,0.12)] px-3.5 flex flex-col justify-center shadow-2xs">
                <span className="text-[10px] font-display font-medium text-[#111111]/50 leading-none">
                  Location Type
                </span>
                <select
                  aria-label="Select Location Type Scope"
                  value={locationScope}
                  onChange={e => handleScopeChange(e.target.value as LocationScopeFilter)}
                  className="w-full bg-transparent text-xs sm:text-sm font-display font-semibold text-[#111111] focus:outline-hidden cursor-pointer mt-0.5"
                >
                  <option value="ALL_AREAS">
                    All Residential Areas ({summary.totals.areasCount})
                  </option>
                  <option value="ALL_LOCATIONS">
                    All Areas &amp; Micro-Markets ({summary.totals.areasCount + summary.totals.neighbourhoodsCount})
                  </option>
                  <option value="FEATURED">
                    Featured Corridors ({summary.totals.featuredAreasCount})
                  </option>
                </select>
              </div>
            </div>

            {/* Grid / Split / Map View Switcher */}
            <div className="lg:col-span-2 flex items-center justify-end">
              <div
                role="group"
                aria-label="View Mode Switcher"
                className="w-full lg:w-auto h-12 p-1 rounded-xl bg-white border border-[rgba(17,17,17,0.12)] inline-flex items-center justify-between gap-1 shadow-2xs"
              >
                <button
                  type="button"
                  onClick={() => handleViewChange('grid')}
                  className={`flex-1 lg:flex-initial inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-display font-semibold transition-all cursor-pointer ${
                    viewMode === 'grid'
                      ? 'bg-[#E85D3F] text-white shadow-xs'
                      : 'text-[#111111]/70 hover:text-[#111111]'
                  }`}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span>Grid</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleViewChange('split')}
                  className={`hidden md:inline-flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-display font-semibold transition-all cursor-pointer ${
                    viewMode === 'split'
                      ? 'bg-[#E85D3F] text-white shadow-xs'
                      : 'text-[#111111]/70 hover:text-[#111111]'
                  }`}
                >
                  <Columns className="w-3.5 h-3.5" />
                  <span>Split</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleViewChange('map')}
                  className={`flex-1 lg:flex-initial inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-display font-semibold transition-all cursor-pointer ${
                    viewMode === 'map'
                      ? 'bg-[#E85D3F] text-white shadow-xs'
                      : 'text-[#111111]/70 hover:text-[#111111]'
                  }`}
                >
                  <MapIcon className="w-3.5 h-3.5" />
                  <span>Map</span>
                </button>
              </div>
            </div>
          </div>

          {/* Popular Regional Corridor Filter Chips */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
            <span className="text-xs font-display font-semibold text-[#111111]/70 shrink-0 mr-1">
              Popular Filters:
            </span>

            <button
              type="button"
              onClick={() => handleRegionChange('ALL')}
              className={`px-3.5 py-1.5 rounded-full text-xs font-display font-semibold whitespace-nowrap transition-all cursor-pointer ${
                activeRegion === 'ALL'
                  ? 'bg-[#E85D3F] text-white shadow-xs'
                  : 'bg-white text-[#111111]/80 border border-[rgba(17,17,17,0.12)] hover:border-[#111111]'
              }`}
            >
              All Locations
            </button>

            {KOLKATA_CORRIDORS.map(corridor => {
              const isActive = activeRegion === corridor.id;
              return (
                <button
                  key={corridor.id}
                  type="button"
                  onClick={() => handleRegionChange(corridor.id)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-display font-medium whitespace-nowrap transition-all cursor-pointer ${
                    isActive
                      ? 'bg-[#E85D3F] text-white font-semibold shadow-xs'
                      : 'bg-white text-[#111111]/80 border border-[rgba(17,17,17,0.12)] hover:border-[#111111]'
                  }`}
                >
                  {corridor.shortLabel}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* IF MAP VIEW MODE IS ACTIVE, RENDER FULL-WIDTH MAP EXPLORER AT TOP */}
      {viewMode === 'map' && (
        <LocationsMapExplorer
          areas={summary.areas}
          neighbourhoods={summary.neighbourhoods}
          mappableProjects={summary.mappableProjects}
          corridorCounts={summary.corridorCounts}
          totals={summary.totals}
          activeRegion={activeRegion}
          selectedSlug={selectedMapSlug}
          onSelectLocation={setSelectedMapSlug}
          fullWidthMode={true}
          onToggleFullMap={() => handleViewChange('grid')}
        />
      )}

      {/* IF SPLIT VIEW MODE IS ACTIVE ON DESKTOP, RENDER SIDE-BY-SIDE CARDS + INTERACTIVE MAP */}
      {viewMode === 'split' && (
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-6 space-y-4 max-h-[760px] overflow-y-auto pr-1">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-display font-bold text-[#111111]">
                {filteredPrimaryLocations.length} Matching Locations
              </h2>
              <button
                type="button"
                onClick={() => handleViewChange('grid')}
                className="text-xs font-display font-semibold text-[#E85D3F] hover:underline cursor-pointer"
              >
                Exit Split View
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {filteredPrimaryLocations.map(loc => (
                <div
                  key={`split-${loc.id}`}
                  onMouseEnter={() => setSelectedMapSlug(loc.slug)}
                  className={`p-4 rounded-xl border bg-white transition-all shadow-2xs flex flex-col justify-between ${
                    selectedMapSlug === loc.slug
                      ? 'border-[#E85D3F] ring-1 ring-[#E85D3F]'
                      : 'border-[rgba(17,17,17,0.08)] hover:border-[rgba(17,17,17,0.25)]'
                  }`}
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-display font-bold uppercase tracking-wider text-[#E85D3F]">
                        {loc.corridorLabel || loc.type}
                      </span>
                      <span className="text-[11px] font-mono text-[#111111]/60">
                        {loc.projectCount} Projects
                      </span>
                    </div>
                    <Link
                      href={`/locations/${loc.slug}`}
                      className="block text-base font-display font-bold text-[#111111] hover:text-[#E85D3F]"
                    >
                      {loc.name}
                    </Link>
                    <p className="text-xs font-body text-[#111111]/70 line-clamp-2">
                      {loc.shortDescription}
                    </p>
                  </div>
                  <div className="mt-3 pt-2.5 border-t border-[rgba(17,17,17,0.06)] flex items-center justify-between text-xs font-display font-semibold text-[#E85D3F]">
                    <Link href={`/locations/${loc.slug}`} className="hover:underline">
                      Explore intelligence →
                    </Link>
                    {loc.latitude && (
                      <button
                        type="button"
                        onClick={() => setSelectedMapSlug(loc.slug)}
                        className="text-[11px] text-[#111111]/60 hover:text-[#111111] cursor-pointer"
                      >
                        Pin on map
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-6 sticky top-24">
            <LocationsMapExplorer
              areas={summary.areas}
              neighbourhoods={summary.neighbourhoods}
              mappableProjects={summary.mappableProjects}
              corridorCounts={summary.corridorCounts}
              totals={summary.totals}
              activeRegion={activeRegion}
              selectedSlug={selectedMapSlug}
              onSelectLocation={setSelectedMapSlug}
              fullWidthMode={true}
              onToggleFullMap={() => handleViewChange('map')}
            />
          </div>
        </section>
      )}

      {/* 4. POPULAR RESIDENTIAL AREAS INTELLIGENCE CARDS (Matching Reference A) */}
      {viewMode !== 'split' && (
        <section aria-labelledby="popular-areas-heading" className="space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
            <div>
              <h2
                id="popular-areas-heading"
                className="text-2xl sm:text-[28px] font-editorial font-normal text-[#111111] tracking-tight"
              >
                {activeRegion !== 'ALL'
                  ? `${KOLKATA_CORRIDORS.find(c => c.id === activeRegion)?.label} Locations`
                  : debouncedQuery
                    ? `Search Results for "${debouncedQuery}"`
                    : locationScope === 'ALL_LOCATIONS'
                      ? 'All Kolkata Residential Areas & Micro-Markets'
                      : 'Popular Residential Areas'}
              </h2>
              {activeRegion !== 'ALL' && (
                <p className="text-xs sm:text-sm font-body text-[#111111]/65 mt-0.5">
                  {KOLKATA_CORRIDORS.find(c => c.id === activeRegion)?.description}
                </p>
              )}
            </div>

            <div className="flex items-center gap-4">
              {isFiltered && (
                <button
                  type="button"
                  onClick={handleClearFilters}
                  className="text-xs font-display font-semibold text-[#111111]/65 hover:text-[#111111] underline cursor-pointer"
                >
                  Reset filters
                </button>
              )}

              {!isFiltered && filteredPrimaryLocations.length > 6 && (
                <button
                  type="button"
                  onClick={() => setShowAllPopular(prev => !prev)}
                  className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-display font-semibold text-[#E85D3F] hover:text-[#d44d31] transition-colors cursor-pointer"
                >
                  <span>
                    {showAllPopular
                      ? 'Show top 6 popular areas'
                      : `See all ${filteredPrimaryLocations.length} locations`}
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {displayedPopularCards.length === 0 ? (
            <div className="p-10 rounded-2xl bg-white border border-[rgba(17,17,17,0.08)] text-center space-y-3 max-w-xl mx-auto shadow-2xs">
              <MapPin className="w-8 h-8 text-[#E85D3F] mx-auto" />
              <h3 className="text-base font-display font-bold text-[#111111]">
                No residential locations match &ldquo;{debouncedQuery}&rdquo;
              </h3>
              <p className="text-xs sm:text-sm font-body text-[#111111]/65">
                Try searching for a major corridor like New Town, Rajarhat, Salt Lake, Ballygunge, Alipore, or clear active filters.
              </p>
              <button
                type="button"
                onClick={handleClearFilters}
                className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#111111] text-white text-xs font-display font-semibold hover:bg-[#222222] cursor-pointer"
              >
                Show All Kolkata Locations
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {displayedPopularCards.map(loc => (
                <article
                  key={loc.id}
                  className="rounded-2xl border border-[rgba(17,17,17,0.09)] bg-white hover:border-[rgba(17,17,17,0.25)] hover:shadow-md transition-all overflow-hidden flex flex-col justify-between group shadow-2xs"
                >
                  <div>
                    {/* Visual Architectural Header Banner (Matching Reference A) */}
                    <Link
                      href={`/locations/${loc.slug}`}
                      className="block relative h-36 sm:h-40 w-full overflow-hidden bg-neutral-900"
                    >
                      <img
                        src={loc.imageUrl}
                        alt={`${loc.name}, Kolkata residential skyline`}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/15 to-transparent" />

                      {/* Top-left Factual Badge */}
                      <div className="absolute top-3 left-3 flex items-center gap-1.5">
                        <span
                          className={`px-2.5 py-1 rounded-full text-[10px] font-display font-bold uppercase tracking-wider border shadow-2xs ${badgeToneClasses[loc.badgeTone]}`}
                        >
                          {loc.badgeText}
                        </span>
                      </div>

                      {/* Top-right Corridor / Parent Context Pill */}
                      {(loc.corridorLabel || loc.parentName) && (
                        <div className="absolute top-3 right-3">
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-display font-medium bg-black/55 backdrop-blur-xs text-white border border-white/15">
                            {loc.type === 'NEIGHBOURHOOD' && loc.parentName
                              ? `in ${loc.parentName}`
                              : loc.corridorLabel}
                          </span>
                        </div>
                      )}
                    </Link>

                    {/* Card Body */}
                    <div className="p-5 sm:p-6 space-y-4">
                      <div className="space-y-1.5">
                        <Link href={`/locations/${loc.slug}`} className="block">
                          <h3 className="text-xl sm:text-2xl font-editorial font-normal text-[#111111] group-hover:text-[#E85D3F] transition-colors tracking-tight">
                            {loc.name}
                          </h3>
                        </Link>
                        <p className="text-xs sm:text-sm font-body text-[#111111]/75 line-clamp-2 leading-relaxed">
                          {loc.shortDescription}
                        </p>
                      </div>

                      {/* 3-Column Live Inventory Metrics Strip (Matching Reference A) */}
                      <div className="grid grid-cols-3 gap-2 pt-3 border-t border-[rgba(17,17,17,0.08)]">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-7 h-7 rounded-lg bg-[#E85D3F]/10 text-[#E85D3F] flex items-center justify-center shrink-0">
                            <Building2 className="w-3.5 h-3.5" />
                          </div>
                          <div className="min-w-0">
                            <span className="block text-sm font-display font-bold text-[#111111] leading-none">
                              {loc.projectCount > 0 ? loc.projectCount : '–'}
                            </span>
                            <span className="block text-[11px] font-body text-[#111111]/60 truncate mt-0.5">
                              {loc.projectCount === 1 ? 'Project' : 'Projects'}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 min-w-0 border-l border-[rgba(17,17,17,0.08)] pl-2.5">
                          <div className="w-7 h-7 rounded-lg bg-[#E85D3F]/10 text-[#E85D3F] flex items-center justify-center shrink-0">
                            <Home className="w-3.5 h-3.5" />
                          </div>
                          <div className="min-w-0">
                            <span className="block text-sm font-display font-bold text-[#111111] leading-none">
                              {loc.resaleCount > 0 ? loc.resaleCount : '–'}
                            </span>
                            <span className="block text-[11px] font-body text-[#111111]/60 truncate mt-0.5">
                              {loc.resaleCount === 1 ? 'Verified Resale' : 'Verified Resale'}
                            </span>
                            {loc.unverifiedResaleCount > 0 && (
                              <span className="block text-[10px] font-body text-amber-700 truncate">
                                +{loc.unverifiedResaleCount} unverified
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 min-w-0 border-l border-[rgba(17,17,17,0.08)] pl-2.5">
                          <div className="w-7 h-7 rounded-lg bg-[#E85D3F]/10 text-[#E85D3F] flex items-center justify-center shrink-0">
                            <Key className="w-3.5 h-3.5" />
                          </div>
                          <div className="min-w-0">
                            <span className="block text-sm font-display font-bold text-[#111111] leading-none">
                              {loc.rentalCount > 0 ? loc.rentalCount : '–'}
                            </span>
                            <span className="block text-[11px] font-body text-[#111111]/60 truncate mt-0.5">
                              {loc.rentalCount === 1 ? 'Verified Rental' : 'Verified Rentals'}
                            </span>
                            {loc.unverifiedRentalCount > 0 && (
                              <span className="block text-[10px] font-body text-amber-700 truncate">
                                +{loc.unverifiedRentalCount} unverified
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Child Micro-Market Chips (Hierarchy Visibility) */}
                      {loc.childMicroMarkets.length > 0 && (
                        <div className="pt-2.5 border-t border-[rgba(17,17,17,0.06)] flex flex-wrap items-center gap-1.5">
                          <span className="text-[10px] font-display font-semibold uppercase tracking-wider text-[#111111]/45 mr-0.5">
                            Micro-Markets:
                          </span>
                          {loc.childMicroMarkets.slice(0, 3).map(child => (
                            <Link
                              key={child.id}
                              href={`/locations/${child.slug}`}
                              className="px-2 py-0.5 rounded-md bg-[#FAFAF8] border border-[rgba(17,17,17,0.08)] text-[11px] font-body text-[#111111]/75 hover:border-[#E85D3F] hover:text-[#E85D3F] transition-colors"
                            >
                              {child.name}
                            </Link>
                          ))}
                          {loc.childMicroMarkets.length > 3 && (
                            <Link
                              href={`/locations/${loc.slug}#sub-locations`}
                              className="px-2 py-0.5 rounded-md bg-[#F6F2EC] text-[11px] font-display font-semibold text-[#111111]/70 hover:text-[#E85D3F]"
                            >
                              +{loc.childMicroMarkets.length - 3} more
                            </Link>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Card Footer CTA */}
                  <div className="px-5 sm:px-6 py-3.5 bg-[#FAFAF8] border-t border-[rgba(17,17,17,0.07)] flex items-center justify-between gap-2">
                    <Link
                      href={`/locations/${loc.slug}`}
                      className="inline-flex items-center gap-1.5 text-xs font-display font-semibold text-[#E85D3F] hover:text-[#d44d31] transition-colors"
                    >
                      <span>Explore location intelligence</span>
                      <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                    </Link>

                    <div className="flex items-center gap-1.5">
                      {loc.projectCount > 0 && (
                        <Link
                          href={`/projects?location=${loc.slug}`}
                          className="text-[11px] font-display font-medium text-[#111111]/65 hover:text-[#111111] px-2 py-0.5 rounded bg-white border border-[rgba(17,17,17,0.08)]"
                        >
                          Projects
                        </Link>
                      )}
                      {loc.resaleCount > 0 && (
                        <Link
                          href={`/buy?inventoryType=RESALE&location=${loc.slug}`}
                          className="text-[11px] font-display font-medium text-[#111111]/65 hover:text-[#111111] px-2 py-0.5 rounded bg-white border border-[rgba(17,17,17,0.08)]"
                        >
                          Resale
                        </Link>
                      )}
                      {loc.rentalCount > 0 && (
                        <Link
                          href={`/rent?location=${loc.slug}`}
                          className="text-[11px] font-display font-medium text-[#111111]/65 hover:text-[#111111] px-2 py-0.5 rounded bg-white border border-[rgba(17,17,17,0.08)]"
                        >
                          Rent
                        </Link>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {/* 5. INTERACTIVE MAP EXPLORER + LOCATION INTELLIGENCE SECTION (In Default Grid Mode) */}
      {viewMode === 'grid' && (
        <LocationsMapExplorer
          areas={summary.areas}
          neighbourhoods={summary.neighbourhoods}
          mappableProjects={summary.mappableProjects}
          corridorCounts={summary.corridorCounts}
          totals={summary.totals}
          activeRegion={activeRegion}
          selectedSlug={selectedMapSlug}
          onSelectLocation={setSelectedMapSlug}
          fullWidthMode={false}
        />
      )}

      {/* 6. EXPLORE BY REGION DIRECTORY (All 31 Areas + 130 Child Micro-Markets Grouped by 7 Corridors) */}
      <section
        id="explore-by-region"
        aria-labelledby="explore-by-region-heading"
        className="space-y-6 pt-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#E85D3F]/10 border border-[#E85D3F]/20 flex items-center justify-center text-[#E85D3F] shrink-0 mt-1">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2
                id="explore-by-region-heading"
                className="text-xl sm:text-2xl font-display font-bold text-[#111111] tracking-tight"
              >
                Explore by Region
              </h2>
              <p className="text-xs sm:text-sm font-body text-[#111111]/65">
                Browse residential areas and micro-markets grouped by Kolkata&apos;s 7 key corridors.
              </p>
            </div>
          </div>
        </div>

        {/* Region Corridor Selector Pills with Exact Area Counts */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
          <button
            type="button"
            onClick={() => setRegionTab('ALL')}
            className={`px-4 py-2 rounded-full text-xs font-display font-semibold whitespace-nowrap transition-all cursor-pointer ${
              regionTab === 'ALL'
                ? 'bg-[#E85D3F] text-white shadow-xs'
                : 'bg-white text-[#111111]/80 border border-[rgba(17,17,17,0.12)] hover:border-[#111111]'
            }`}
          >
            All Areas ({summary.totals.areasCount})
          </button>

          {KOLKATA_CORRIDORS.map(corridor => {
            const count = summary.corridorCounts[corridor.id]?.areaCount || 0;
            const isActive = regionTab === corridor.id;
            return (
              <button
                key={`reg-tab-${corridor.id}`}
                type="button"
                onClick={() => setRegionTab(corridor.id)}
                className={`px-4 py-2 rounded-full text-xs font-display font-medium whitespace-nowrap transition-all cursor-pointer ${
                  isActive
                    ? 'bg-[#E85D3F] text-white font-semibold shadow-xs'
                    : 'bg-white text-[#111111]/80 border border-[rgba(17,17,17,0.12)] hover:border-[#111111]'
                }`}
              >
                {corridor.shortLabel} ({count})
              </button>
            );
          })}
        </div>

        {/* Compact Regional Directory Cards (Matching Reference A) */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {regionalDirectoryAreas.map(area => {
            const isMicroExpanded = Boolean(expandedRegionAreas[area.id]);
            const visibleMicros = isMicroExpanded
              ? area.childMicroMarkets
              : area.childMicroMarkets.slice(0, 4);

            return (
              <div
                key={`region-card-${area.id}`}
                className="p-4 sm:p-5 rounded-xl border border-[rgba(17,17,17,0.08)] bg-white hover:border-[rgba(17,17,17,0.22)] hover:shadow-sm transition-all flex flex-col justify-between gap-3 shadow-2xs"
              >
                <Link
                  href={`/locations/${area.slug}`}
                  className="flex items-start justify-between gap-3 group"
                >
                  <div className="flex items-start gap-3.5 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-[#FDECE8] border border-[#F9C8BD]/60 flex items-center justify-center text-[#E85D3F] shrink-0 mt-0.5">
                      <Building2 className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-base font-display font-bold text-[#111111] group-hover:text-[#E85D3F] transition-colors">
                          {area.name}
                        </h3>
                        {area.projectCount > 0 && (
                          <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-[#FAFAF8] border border-[rgba(17,17,17,0.08)] text-[#111111]/70">
                            {area.projectCount} {area.projectCount === 1 ? 'Project' : 'Projects'}
                          </span>
                        )}
                      </div>
                      <p className="text-xs font-body text-[#111111]/65 line-clamp-2 leading-relaxed">
                        {area.shortDescription}
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[#111111]/40 group-hover:text-[#E85D3F] group-hover:translate-x-0.5 transition-all shrink-0 mt-1" />
                </Link>

                {/* Sub-market Neighbourhood Links */}
                {area.childMicroMarkets.length > 0 && (
                  <div className="pt-2.5 border-t border-[rgba(17,17,17,0.06)] flex flex-wrap items-center gap-1.5">
                    {visibleMicros.map(micro => (
                      <Link
                        key={micro.id}
                        href={`/locations/${micro.slug}`}
                        className="px-2 py-0.5 rounded bg-[#FAFAF8] border border-[rgba(17,17,17,0.07)] text-[11px] font-body text-[#111111]/70 hover:text-[#E85D3F] hover:border-[#E85D3F] transition-colors"
                      >
                        {micro.name}
                        {micro.projectCount > 0 ? ` (${micro.projectCount})` : ''}
                      </Link>
                    ))}
                    {area.childMicroMarkets.length > 4 && (
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedRegionAreas(prev => ({
                            ...prev,
                            [area.id]: !prev[area.id],
                          }))
                        }
                        className="px-2 py-0.5 rounded bg-[#F6F2EC] text-[11px] font-display font-semibold text-[#E85D3F] hover:underline cursor-pointer"
                      >
                        {isMicroExpanded
                          ? 'Show less'
                          : `+${area.childMicroMarkets.length - 4} micro-markets`}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* 7. CITIES & MUNICIPALITIES SECTION (Matching Reference A Bottom Strip) */}
      {summary.citiesAndMunicipalities.length > 0 && (
        <section
          aria-labelledby="cities-municipalities-heading"
          className="pt-8 border-t border-[rgba(17,17,17,0.08)]"
        >
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-center">
            <div className="lg:col-span-4 flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-[#E85D3F]/10 border border-[#E85D3F]/20 flex items-center justify-center text-[#E85D3F] shrink-0 mt-0.5">
                <Building2 className="w-5 h-5" />
              </div>
              <div>
                <h2
                  id="cities-municipalities-heading"
                  className="text-lg sm:text-xl font-display font-bold text-[#111111] tracking-tight"
                >
                  Cities &amp; Municipalities
                </h2>
                <p className="text-xs font-body text-[#111111]/65 mt-0.5 leading-relaxed">
                  Discover properties across key cities and districts in the Kolkata Metropolitan Region.
                </p>
              </div>
            </div>

            <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
              {summary.citiesAndMunicipalities.map(city => (
                <div
                  key={city.id}
                  className="p-4 rounded-xl border border-[rgba(17,17,17,0.08)] bg-white hover:border-[rgba(17,17,17,0.25)] hover:shadow-sm transition-all flex flex-col justify-between gap-2 shadow-2xs"
                >
                  <Link
                    href={`/locations/${city.slug}`}
                    className="flex items-center justify-between gap-3 group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-[#FDECE8] flex items-center justify-center text-[#E85D3F] shrink-0">
                        <MapPin className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-sm sm:text-base font-display font-bold text-[#111111] group-hover:text-[#E85D3F] transition-colors truncate">
                          {city.name}
                        </h3>
                        <span className="block text-[11px] font-body text-[#111111]/55 truncate">
                          {city.subtitle}
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-[#111111]/40 group-hover:text-[#E85D3F] group-hover:translate-x-0.5 transition-all shrink-0" />
                  </Link>

                  {city.childTowns.length > 0 && (
                    <div className="pt-2 border-t border-[rgba(17,17,17,0.06)] flex flex-wrap items-center gap-1">
                      <span className="text-[10px] font-display text-[#111111]/45 mr-0.5">
                        Includes:
                      </span>
                      {city.childTowns.map(t => (
                        <Link
                          key={t.slug}
                          href={`/locations/${t.slug}`}
                          className="text-[11px] font-display font-medium text-[#E85D3F] hover:underline"
                        >
                          {t.name}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
