'use client';

import React, { useState, useMemo, useTransition } from 'react';
import {
  Search,
  X,
  Building2,
  Layers,
  MapPin,
  ChevronDown,
  RotateCcw,
} from 'lucide-react';
import { PublicDeveloperDto } from '@/src/domain/developers/dto/developerDto';
import { DeveloperCard } from './DeveloperCard';

export interface DeveloperLocationFilterItem {
  id: string;
  name: string;
  slug: string;
  projectCount: number;
}

interface DevelopersDirectoryClientProps {
  initialDevelopers: PublicDeveloperDto[];
  statistics: {
    totalDevelopers: number;
    activeDevelopers: number;
    totalProjects: number;
    totalLocations: number;
  };
  locations: DeveloperLocationFilterItem[];
}

type FilterTab = 'all' | 'active' | 'featured';
type SortOption = 'name-asc' | 'name-desc' | 'projects-desc';

const INITIAL_PAGE_SIZE = 12;
const PAGE_INCREMENT = 12;

export function DevelopersDirectoryClient({
  initialDevelopers,
  statistics,
  locations,
}: DevelopersDirectoryClientProps) {
  // State: default filter tab is 'active' ("With Active Projects") per specifications
  const [activeTab, setActiveTab] = useState<FilterTab>('active');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLocation, setSelectedLocation] = useState<string>('all');
  const [sortOption, setSortOption] = useState<SortOption>('name-asc');
  const [visibleCount, setVisibleCount] = useState<number>(INITIAL_PAGE_SIZE);
  const [, startTransition] = useTransition();

  // Counts for filter pills
  const counts = useMemo(() => {
    const all = initialDevelopers.length;
    const active = initialDevelopers.filter(d => d.projectCount > 0).length;
    const featured = initialDevelopers.filter(d => d.featured).length;
    return { all, active, featured };
  }, [initialDevelopers]);

  // Filtered & Sorted list
  const filteredDevelopers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return initialDevelopers
      .filter(dev => {
        // Tab filter
        if (activeTab === 'active' && dev.projectCount === 0) {
          return false;
        }
        if (activeTab === 'featured' && !dev.featured) {
          return false;
        }

        // Location filter
        if (selectedLocation !== 'all') {
          const matchesLocation = dev.locations.some(
            loc => loc.slug === selectedLocation || loc.id === selectedLocation || loc.name.toLowerCase() === selectedLocation.toLowerCase()
          );
          if (!matchesLocation) {
            return false;
          }
        }

        // Search query filter (name, shortDescription, description)
        if (query) {
          const nameMatch = dev.name.toLowerCase().includes(query);
          const shortDescMatch = dev.shortDescription?.toLowerCase().includes(query);
          const descMatch = dev.description?.toLowerCase().includes(query);
          if (!nameMatch && !shortDescMatch && !descMatch) {
            return false;
          }
        }

        return true;
      })
      .sort((a, b) => {
        switch (sortOption) {
          case 'name-asc':
            return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
          case 'name-desc':
            return b.name.localeCompare(a.name, undefined, { sensitivity: 'base' });
          case 'projects-desc':
            if (b.projectCount !== a.projectCount) {
              return b.projectCount - a.projectCount;
            }
            return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
          default:
            return a.name.localeCompare(b.name);
        }
      });
  }, [initialDevelopers, activeTab, selectedLocation, searchQuery, sortOption]);

  // Reset pagination on filter/search change
  const handleTabChange = (tab: FilterTab) => {
    setActiveTab(tab);
    setVisibleCount(INITIAL_PAGE_SIZE);
  };

  const handleLocationChange = (loc: string) => {
    setSelectedLocation(loc);
    setVisibleCount(INITIAL_PAGE_SIZE);
  };

  const handleSearchChange = (val: string) => {
    startTransition(() => {
      setSearchQuery(val);
      setVisibleCount(INITIAL_PAGE_SIZE);
    });
  };

  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedLocation('all');
    setActiveTab('active');
    setSortOption('name-asc');
    setVisibleCount(INITIAL_PAGE_SIZE);
  };

  const handleLoadMore = () => {
    setVisibleCount(prev => Math.min(prev + PAGE_INCREMENT, filteredDevelopers.length));
  };

  const visibleDevelopers = filteredDevelopers.slice(0, visibleCount);
  const hasMore = visibleCount < filteredDevelopers.length;

  return (
    <div className="w-full">
      {/* ========================================================= */}
      {/* 1. HERO SECTION                                           */}
      {/* ========================================================= */}
      <section className="relative overflow-hidden bg-[#FAF8F5] border-b border-[#E6E2DC]">
        {/* Subtle decorative background architecture silhouette */}
        <div className="absolute right-0 top-0 bottom-0 w-full md:w-1/2 pointer-events-none opacity-20 lg:opacity-25 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-amber-100/60 via-transparent to-transparent">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#E6E2DC_1px,transparent_1px),linear-gradient(to_bottom,#E6E2DC_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)]" />
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14 lg:py-16 relative">
          <div className="max-w-3xl space-y-4">
            {/* Eyebrow */}
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FFF5F0] border border-[#F3DFD5] text-[11px] font-display font-bold uppercase tracking-wider text-[#E85D3F]">
              <Building2 className="w-3.5 h-3.5" />
              <span>Developer Directory</span>
            </div>

            {/* Main Title */}
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-editorial tracking-tight text-[#111111] leading-tight">
              Real Estate Developers
            </h1>

            {/* Subtitle */}
            <p className="text-sm sm:text-base font-body text-[#111111]/70 leading-relaxed max-w-2xl">
              Explore Kolkata&apos;s leading real estate developers, discover their residential
              projects, and learn more about their development portfolio.
            </p>

            {/* Dynamic Metric Stat Counters */}
            <div className="pt-3 sm:pt-4 flex flex-wrap items-center gap-4 sm:gap-8">
              {/* Stat 1: Developers */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white border border-[#E6E2DC] flex items-center justify-center text-[#E85D3F] shadow-xs">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-lg sm:text-xl font-display font-bold text-[#111111] leading-none">
                    {statistics.totalDevelopers}
                  </div>
                  <div className="text-xs font-body text-[#111111]/55 mt-1 font-medium">
                    Developers
                  </div>
                </div>
              </div>

              {/* Stat 2: Projects */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white border border-[#E6E2DC] flex items-center justify-center text-[#E85D3F] shadow-xs">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-lg sm:text-xl font-display font-bold text-[#111111] leading-none">
                    {statistics.totalProjects}
                  </div>
                  <div className="text-xs font-body text-[#111111]/55 mt-1 font-medium">
                    Active Projects
                  </div>
                </div>
              </div>

              {/* Stat 3: Locations */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white border border-[#E6E2DC] flex items-center justify-center text-[#E85D3F] shadow-xs">
                  <MapPin className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-lg sm:text-xl font-display font-bold text-[#111111] leading-none">
                    {statistics.totalLocations}
                  </div>
                  <div className="text-xs font-body text-[#111111]/55 mt-1 font-medium">
                    Locations
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================= */}
      {/* 2. DISCOVERY & FILTER CONTROLS BAR                        */}
      {/* ========================================================= */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-4">
        {/* Top Controls Row: Search Input + Location Dropdown */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5">
          {/* Search Box */}
          <div className="md:col-span-8 lg:col-span-8 relative">
            <Search className="w-4 h-4 text-[#111111]/45 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => handleSearchChange(e.target.value)}
              placeholder="Search developers (e.g. Merlin, DTC, PS Group...)"
              className="w-full pl-10 pr-10 py-3 bg-white border border-[#E6E2DC] rounded-xl text-sm font-body text-[#111111] placeholder:text-[#111111]/40 focus:outline-none focus:border-[#E85D3F] focus:ring-1 focus:ring-[#E85D3F] transition-all shadow-xs"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => handleSearchChange('')}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#111111]/40 hover:text-[#111111] p-1 transition-colors"
                aria-label="Clear search query"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Location Dropdown */}
          <div className="md:col-span-4 lg:col-span-4 relative">
            <div className="relative">
              <MapPin className="w-4 h-4 text-[#111111]/45 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <select
                value={selectedLocation}
                onChange={e => handleLocationChange(e.target.value)}
                className="w-full pl-10 pr-9 py-3 bg-white border border-[#E6E2DC] rounded-xl text-sm font-body text-[#111111] focus:outline-none focus:border-[#E85D3F] focus:ring-1 focus:ring-[#E85D3F] transition-all shadow-xs appearance-none cursor-pointer"
                aria-label="Filter by Location"
              >
                <option value="all">All Locations ({statistics.totalLocations})</option>
                {locations.map(loc => (
                  <option key={loc.id} value={loc.slug}>
                    {loc.name} ({loc.projectCount})
                  </option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-[#111111]/45 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Bottom Controls Row: Filter Pills + Sort Dropdown */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-1 border-t border-[#E6E2DC]/60">
          {/* Filter Pills */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Pill 1: All Developers */}
            <button
              type="button"
              onClick={() => handleTabChange('all')}
              className={`px-3.5 py-1.5 rounded-full text-xs font-display font-medium transition-all ${
                activeTab === 'all'
                  ? 'bg-[#111111] text-white shadow-xs'
                  : 'bg-white border border-[#E6E2DC] text-[#111111]/75 hover:bg-[#FAF8F5]'
              }`}
            >
              All Developers ({counts.all})
            </button>

            {/* Pill 2: With Active Projects (DEFAULT) */}
            <button
              type="button"
              onClick={() => handleTabChange('active')}
              className={`px-3.5 py-1.5 rounded-full text-xs font-display font-medium transition-all flex items-center gap-1.5 ${
                activeTab === 'active'
                  ? 'bg-[#111111] text-white shadow-xs'
                  : 'bg-white border border-[#E6E2DC] text-[#111111]/75 hover:bg-[#FAF8F5]'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>With Active Projects ({counts.active})</span>
            </button>

            {/* Pill 3: Featured Developers */}
            {counts.featured > 0 && (
              <button
                type="button"
                onClick={() => handleTabChange('featured')}
                className={`px-3.5 py-1.5 rounded-full text-xs font-display font-medium transition-all ${
                  activeTab === 'featured'
                    ? 'bg-[#111111] text-white shadow-xs'
                    : 'bg-white border border-[#E6E2DC] text-[#111111]/75 hover:bg-[#FAF8F5]'
                }`}
              >
                Featured Developers ({counts.featured})
              </button>
            )}
          </div>

          {/* Sort Dropdown */}
          <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
            <span className="text-xs font-body text-[#111111]/55">Sort by:</span>
            <div className="relative">
              <select
                value={sortOption}
                onChange={e => setSortOption(e.target.value as SortOption)}
                className="pl-3 pr-8 py-1.5 bg-white border border-[#E6E2DC] rounded-lg text-xs font-display font-medium text-[#111111] focus:outline-none focus:border-[#E85D3F] transition-all appearance-none cursor-pointer"
                aria-label="Sort Developers"
              >
                <option value="name-asc">A – Z</option>
                <option value="name-desc">Z – A</option>
                <option value="projects-desc">Most Projects</option>
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-[#111111]/45 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================= */}
      {/* 3. DEVELOPER DIRECTORY GRID                               */}
      {/* ========================================================= */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
        {filteredDevelopers.length === 0 ? (
          /* Empty State */
          <div className="bg-white border border-[#E6E2DC] rounded-2xl p-10 sm:p-14 text-center max-w-lg mx-auto my-8 space-y-4">
            <div className="w-12 h-12 mx-auto rounded-full bg-[#FAF8F5] border border-[#E6E2DC] flex items-center justify-center text-[#111111]/45">
              <Search className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-display font-bold text-[#111111]">
                No developers found
              </h3>
              <p className="text-xs sm:text-sm font-body text-[#111111]/60 mt-1 max-w-sm mx-auto">
                We couldn&apos;t find any real estate developers matching your active search or filter selection.
              </p>
            </div>
            <button
              type="button"
              onClick={handleResetFilters}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#111111] text-white rounded-xl text-xs font-display font-semibold hover:bg-[#222222] transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset All Filters</span>
            </button>
          </div>
        ) : (
          <>
            {/* Developer Cards 3-Column Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {visibleDevelopers.map(dev => (
                <DeveloperCard key={dev.id} developer={dev} />
              ))}
            </div>

            {/* Load More Button or Completion Text */}
            <div className="mt-12 text-center">
              {hasMore ? (
                <button
                  type="button"
                  onClick={handleLoadMore}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-white border border-[#E6E2DC] hover:border-[#111111]/40 text-sm font-display font-semibold text-[#111111] shadow-xs hover:shadow transition-all"
                >
                  <span>Load More Developers</span>
                  <ChevronDown className="w-4 h-4 text-[#111111]/60" />
                </button>
              ) : (
                <p className="text-xs font-body text-[#111111]/45">
                  Showing all {filteredDevelopers.length} developers
                </p>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
