'use client';

import React, { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  Search,
  X,
  Building2,
  Home,
  Key,
  Clock,
  MapPin,
  CheckCircle2,
  ChevronRight,
  ChevronDown,
  ArrowRight,
  Loader2,
  Users,
  Compass,
  MessageSquare,
} from 'lucide-react';
import {
  useSearch,
  BHK_OPTIONS,
  HighlightMatch,
  SearchDiscoveryMode,
  SuggestionItem,
} from '@/src/context/SearchContext';
import { useEnquiry } from '@/src/components/enquiry/EnquiryContext';

// 6 Authentic Kolkata discovery locations
const POPULAR_KOLKATA_LOCATIONS = [
  { name: 'New Town', query: 'New Town', slug: 'new-town' },
  { name: 'Rajarhat', query: 'Rajarhat', slug: 'rajarhat' },
  { name: 'Salt Lake', query: 'Salt Lake', slug: 'salt-lake' },
  { name: 'Action Area 2', query: 'Action Area 2', slug: 'action-area-2' },
  { name: 'Tollygunge', query: 'Tollygunge', slug: 'tollygunge' },
  { name: 'Ballygunge', query: 'Ballygunge', slug: 'ballygunge' },
];

// Curated verified Kolkata showcase items for default state
const FEATURED_KOLKATA_PROJECTS = [
  {
    id: 'merlin-rise',
    type: 'PROJECT' as const,
    title: 'Merlin Rise',
    subtitle: 'Sports Themed City • Rajarhat',
    slug: 'merlin-rise',
    url: '/projects/merlin-rise',
    imageUrl: 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=300&q=80',
    priceDisplay: '₹48 L Onwards',
  },
  {
    id: 'merlin-serenia',
    type: 'PROJECT' as const,
    title: 'Merlin Serenia',
    subtitle: 'Premium Residences • New Town',
    slug: 'merlin-serenia',
    url: '/projects/merlin-serenia',
    imageUrl: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=300&q=80',
    priceDisplay: '₹1.25 Cr Onwards',
  },
  {
    id: 'merlin-the-fourth',
    type: 'PROJECT' as const,
    title: 'Merlin The Fourth',
    subtitle: 'Luxury Golf Residences • New Town',
    slug: 'merlin-the-fourth',
    url: '/projects/merlin-the-fourth',
    imageUrl: 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=300&q=80',
    priceDisplay: '₹1.93 Cr Onwards',
  },
];

export function ImmersiveSearchModal() {
  const {
    activeMode,
    setActiveMode,
    query,
    setQuery,
    selectedBhk,
    setSelectedBhk,
    selectedBudgetIndex,
    setSelectedBudgetIndex,
    currentBudgetOptions,
    suggestions,
    loading,
    isSearchModalOpen,
    closeSearchModal,
    recentSearches,
    deleteRecentSearch,
    clearAllRecentSearches,
    executeSearch,
    selectSuggestion,
  } = useSearch();

  const { openEnquiry } = useEnquiry();

  const [bhkDropdownOpen, setBhkDropdownOpen] = useState(false);
  const [budgetDropdownOpen, setBudgetDropdownOpen] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const bhkRef = useRef<HTMLDivElement>(null);
  const budgetRef = useRef<HTMLDivElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);

  // Preserve previous active element & lock body scroll without layout shift
  useEffect(() => {
    if (isSearchModalOpen) {
      previousActiveElementRef.current = document.activeElement as HTMLElement | null;

      // Prevent layout shift from disappearing scrollbar
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      document.body.style.overflow = 'hidden';
      if (scrollbarWidth > 0) {
        document.body.style.paddingRight = `${scrollbarWidth}px`;
      }

      // Auto-focus input
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);

      return () => {
        clearTimeout(timer);
        document.body.style.overflow = '';
        document.body.style.paddingRight = '';
        if (previousActiveElementRef.current && typeof previousActiveElementRef.current.focus === 'function') {
          previousActiveElementRef.current.focus();
        }
      };
    }
  }, [isSearchModalOpen]);

  // Click outside filter popovers
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (bhkRef.current && !bhkRef.current.contains(e.target as Node)) {
        setBhkDropdownOpen(false);
      }
      if (budgetRef.current && !budgetRef.current.contains(e.target as Node)) {
        setBudgetDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!isSearchModalOpen) return null;

  const currentBudgetLabel = currentBudgetOptions[selectedBudgetIndex]?.label || 'Any Budget';
  const currentBhkLabel = BHK_OPTIONS.find((b) => b.value === selectedBhk)?.label || 'All BHK';

  const hasAnyResults =
    (suggestions.projects && suggestions.projects.length > 0) ||
    (suggestions.resales && suggestions.resales.length > 0) ||
    (suggestions.rentals && suggestions.rentals.length > 0) ||
    (suggestions.locations && suggestions.locations.length > 0) ||
    (suggestions.developers && suggestions.developers.length > 0);

  const handleModeTabChange = (mode: SearchDiscoveryMode) => {
    setActiveMode(mode);
    setBhkDropdownOpen(false);
    setBudgetDropdownOpen(false);
    inputRef.current?.focus();
  };

  const handleLocationChipClick = (locQuery: string) => {
    setQuery(locQuery);
    executeSearch(locQuery);
  };

  const handleRecentSearchClick = (term: string) => {
    setQuery(term);
    executeSearch(term);
  };

  // Section 7: Modal Coordination - clean transition to Enquiry Dialog
  const handleOpenAssistance = () => {
    closeSearchModal();
    setTimeout(() => {
      openEnquiry({
        contextType: 'GENERAL',
        title: 'Assisted Property Shortlisting',
        subtitle: 'Connect with a verified Kolkata residential advisor for matching properties.',
      });
    }, 150);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="search-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#111111]/60 backdrop-blur-md p-3 sm:p-6 animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeSearchModal();
      }}
    >
      <div
        className="relative w-full max-w-4xl max-h-[92vh] sm:max-h-[88vh] bg-white rounded-2xl sm:rounded-3xl shadow-[0_32px_96px_rgba(17,17,17,0.28)] border border-slate-100 flex flex-col overflow-hidden animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* TOP SECTION: Heading, Subtitle & Close Button */}
        <div className="px-5 sm:px-8 pt-6 sm:pt-8 pb-4 border-b border-slate-100/80">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2
                id="search-modal-title"
                className="text-2xl sm:text-3xl font-display font-bold text-slate-900 tracking-tight"
              >
                Find Your Next Home in <span className="text-[#E85D3F]">Kolkata</span>
              </h2>
              <p className="mt-1 text-xs sm:text-sm text-slate-500 font-body">
                Search projects, properties, locations or developers
              </p>
            </div>

            {/* Circular Close Button */}
            <button
              type="button"
              onClick={closeSearchModal}
              aria-label="Close property search dialog"
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E85D3F] shrink-0 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Mode Switcher Tabs: Projects | Buy Resale | Rent */}
          <div className="mt-5 flex items-center gap-2 sm:gap-3 overflow-x-auto no-scrollbar">
            <button
              type="button"
              onClick={() => handleModeTabChange('PROJECTS')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-display font-semibold transition-all cursor-pointer whitespace-nowrap ${
                activeMode === 'PROJECTS'
                  ? 'bg-[#E85D3F] text-white shadow-sm'
                  : 'bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              <Building2 className="w-4 h-4" />
              <span>Projects</span>
            </button>

            <button
              type="button"
              onClick={() => handleModeTabChange('BUY')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-display font-semibold transition-all cursor-pointer whitespace-nowrap ${
                activeMode === 'BUY'
                  ? 'bg-[#E85D3F] text-white shadow-sm'
                  : 'bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              <Home className="w-4 h-4" />
              <span>Buy Resale</span>
            </button>

            <button
              type="button"
              onClick={() => handleModeTabChange('RENT')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-display font-semibold transition-all cursor-pointer whitespace-nowrap ${
                activeMode === 'RENT'
                  ? 'bg-[#E85D3F] text-white shadow-sm'
                  : 'bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              <Key className="w-4 h-4" />
              <span>Rent</span>
            </button>
          </div>

          {/* SEARCH INPUT ROW with BHK, Budget, and Search CTA */}
          <div className="mt-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            {/* Search Input Box */}
            <div className="flex-1 flex items-center bg-white border border-slate-200 rounded-xl sm:rounded-2xl px-3.5 sm:px-4 py-2 sm:py-2.5 focus-within:border-[#E85D3F] focus-within:ring-4 focus-within:ring-[#E85D3F]/10 transition-all shadow-2xs">
              <Search className="w-4 h-4 sm:w-5 sm:h-5 text-[#E85D3F] shrink-0 mr-2.5" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    executeSearch();
                  }
                }}
                placeholder={
                  activeMode === 'PROJECTS'
                    ? 'Search by project name, developer or locality...'
                    : activeMode === 'BUY'
                      ? 'Search verified resale homes in Kolkata...'
                      : 'Search verified rental homes in Kolkata...'
                }
                className="w-full text-xs sm:text-sm md:text-base text-slate-900 placeholder:text-slate-400 outline-none bg-transparent"
                aria-label="Property search input"
              />

              {loading && <Loader2 className="w-4 h-4 text-[#E85D3F] animate-spin shrink-0 ml-2" />}

              {query && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery('');
                    inputRef.current?.focus();
                  }}
                  aria-label="Clear search input"
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors ml-1 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Filter Popovers Cluster */}
            <div className="flex items-center gap-2 shrink-0">
              {/* BHK Selector Popover */}
              <div className="relative" ref={bhkRef}>
                <button
                  type="button"
                  onClick={() => {
                    setBhkDropdownOpen(!bhkDropdownOpen);
                    setBudgetDropdownOpen(false);
                  }}
                  className={`flex items-center justify-between gap-1.5 px-3 py-2 sm:py-2.5 rounded-xl border text-xs sm:text-sm font-medium transition-colors cursor-pointer ${
                    selectedBhk
                      ? 'border-[#E85D3F] bg-[#FFF5EE] text-[#E85D3F] font-semibold'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                  }`}
                  aria-expanded={bhkDropdownOpen}
                >
                  <span className="whitespace-nowrap">{currentBhkLabel}</span>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                </button>

                {bhkDropdownOpen && (
                  <div className="absolute left-0 sm:right-0 sm:left-auto top-full mt-1.5 w-44 bg-white border border-slate-200 rounded-xl shadow-xl py-1.5 z-50 animate-fade-in">
                    {BHK_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => {
                          setSelectedBhk(opt.value);
                          setBhkDropdownOpen(false);
                        }}
                        className={`w-full text-left px-3.5 py-2 text-xs sm:text-sm transition-colors cursor-pointer flex items-center justify-between ${
                          selectedBhk === opt.value
                            ? 'bg-[#FFF5EE] text-[#E85D3F] font-semibold'
                            : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <span>{opt.label}</span>
                        {selectedBhk === opt.value && (
                          <CheckCircle2 className="w-3.5 h-3.5 text-[#E85D3F]" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Budget Selector Popover */}
              <div className="relative" ref={budgetRef}>
                <button
                  type="button"
                  onClick={() => {
                    setBudgetDropdownOpen(!budgetDropdownOpen);
                    setBhkDropdownOpen(false);
                  }}
                  className={`flex items-center justify-between gap-1.5 px-3 py-2 sm:py-2.5 rounded-xl border text-xs sm:text-sm font-medium transition-colors cursor-pointer ${
                    selectedBudgetIndex > 0
                      ? 'border-[#E85D3F] bg-[#FFF5EE] text-[#E85D3F] font-semibold'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                  }`}
                  aria-expanded={budgetDropdownOpen}
                >
                  <span className="whitespace-nowrap">{currentBudgetLabel}</span>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                </button>

                {budgetDropdownOpen && (
                  <div className="absolute right-0 top-full mt-1.5 w-52 bg-white border border-slate-200 rounded-xl shadow-xl py-1.5 z-50 animate-fade-in">
                    {currentBudgetOptions.map((opt, idx) => (
                      <button
                        key={opt.label}
                        type="button"
                        onClick={() => {
                          setSelectedBudgetIndex(idx);
                          setBudgetDropdownOpen(false);
                        }}
                        className={`w-full text-left px-3.5 py-2 text-xs sm:text-sm transition-colors cursor-pointer flex items-center justify-between ${
                          selectedBudgetIndex === idx
                            ? 'bg-[#FFF5EE] text-[#E85D3F] font-semibold'
                            : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <span>{opt.label}</span>
                        {selectedBudgetIndex === idx && (
                          <CheckCircle2 className="w-3.5 h-3.5 text-[#E85D3F]" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Terracotta Search Action CTA */}
              <button
                type="button"
                onClick={() => executeSearch()}
                className="flex items-center justify-center gap-1.5 px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl bg-[#E85D3F] hover:bg-[#D94F33] text-white text-xs sm:text-sm font-display font-semibold shadow-sm transition-all active:scale-[0.98] cursor-pointer"
              >
                <span>Search</span>
                <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* MAIN BODY: Two-Column Responsive Layout */}
        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-12 divide-y md:divide-y-0 md:divide-x divide-slate-100 min-h-[380px]">
            {/* LEFT COLUMN: Recent Searches & Popular Locations */}
            <div className="md:col-span-5 p-5 sm:p-6 space-y-6 bg-slate-50/50">
              {/* Recent Searches */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-700 font-display">
                    <Clock className="w-4 h-4 text-[#E85D3F]" />
                    <span>Recent Searches</span>
                  </div>
                  {recentSearches.length > 0 && (
                    <button
                      type="button"
                      onClick={clearAllRecentSearches}
                      className="text-xs text-[#E85D3F] hover:underline font-medium cursor-pointer"
                    >
                      Clear All
                    </button>
                  )}
                </div>

                {recentSearches.length > 0 ? (
                  <div className="space-y-1.5">
                    {recentSearches.map((term) => (
                      <div
                        key={term}
                        className="group flex items-center justify-between py-1.5 px-3 rounded-lg bg-white border border-slate-200/80 hover:border-slate-300 hover:shadow-2xs transition-all text-xs sm:text-sm"
                      >
                        <button
                          type="button"
                          onClick={() => handleRecentSearchClick(term)}
                          className="flex items-center gap-2 text-slate-700 hover:text-[#E85D3F] font-medium text-left flex-1 min-w-0 cursor-pointer"
                        >
                          <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="truncate">{term}</span>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteRecentSearch(term);
                          }}
                          aria-label={`Remove recent search ${term}`}
                          className="p-1 text-slate-400 hover:text-slate-600 rounded transition-colors cursor-pointer shrink-0 ml-1"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 font-body py-1">
                    Your recent property searches will appear here.
                  </p>
                )}
              </div>

              {/* Popular Locations in Kolkata */}
              <div>
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-700 font-display mb-3">
                  <MapPin className="w-4 h-4 text-[#E85D3F]" />
                  <span>Popular Locations</span>
                </div>

                <div className="flex flex-wrap gap-2">
                  {POPULAR_KOLKATA_LOCATIONS.map((loc) => (
                    <button
                      key={loc.slug}
                      type="button"
                      onClick={() => handleLocationChipClick(loc.query)}
                      className="px-3.5 py-1.5 rounded-full bg-white hover:bg-slate-50 text-slate-700 hover:text-[#E85D3F] border border-slate-200 hover:border-[#E85D3F] text-xs font-display font-medium shadow-2xs transition-all active:scale-95 cursor-pointer"
                    >
                      {loc.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN: Live Categorized Autocomplete or Default Featured */}
            <div className="md:col-span-7 p-5 sm:p-6 space-y-6">
              {query.trim().length >= 2 ? (
                /* LIVE AUTOCOMPLETE RESULTS */
                <div>
                  {loading && !hasAnyResults ? (
                    <div className="space-y-3">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl animate-pulse">
                          <div className="w-16 h-12 bg-slate-200 rounded-lg shrink-0" />
                          <div className="flex-1 space-y-2">
                            <div className="h-4 bg-slate-200 rounded w-1/2" />
                            <div className="h-3 bg-slate-200 rounded w-1/3" />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : hasAnyResults ? (
                    <div className="space-y-6">
                      {/* Projects Section */}
                      {suggestions.projects && suggestions.projects.length > 0 && (
                        <div>
                          <div className="flex items-center justify-between mb-2.5">
                            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-700 font-display">
                              <Building2 className="w-4 h-4 text-[#E85D3F]" />
                              <span>Projects ({suggestions.projects.length})</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => executeSearch()}
                              className="text-xs text-[#E85D3F] hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                            >
                              <span>View all projects</span>
                              <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <div className="space-y-2">
                            {suggestions.projects.map((item) => (
                              <button
                                key={item.id}
                                type="button"
                                onClick={() => selectSuggestion(item)}
                                className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-100 group text-left cursor-pointer"
                              >
                                <div className="flex items-center gap-3 min-w-0">
                                  <div className="relative w-16 h-12 rounded-lg overflow-hidden bg-slate-100 shrink-0 border border-slate-100">
                                    {item.imageUrl ? (
                                      <Image
                                        src={item.imageUrl}
                                        alt={item.title}
                                        fill
                                        sizes="64px"
                                        className="object-cover group-hover:scale-105 transition-transform"
                                        referrerPolicy="no-referrer"
                                      />
                                    ) : (
                                      <div className="w-full h-full flex items-center justify-center text-slate-400">
                                        <Building2 className="w-5 h-5" />
                                      </div>
                                    )}
                                  </div>
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5">
                                      <p className="text-sm font-semibold text-slate-900 group-hover:text-[#E85D3F] transition-colors font-display truncate">
                                        <HighlightMatch text={item.title} query={query} />
                                      </p>
                                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 fill-emerald-100 shrink-0" />
                                    </div>
                                    {item.subtitle && (
                                      <p className="text-xs text-slate-500 font-body truncate mt-0.5">
                                        {item.subtitle}
                                      </p>
                                    )}
                                  </div>
                                </div>

                                {item.priceDisplay && (
                                  <div className="text-right shrink-0 ml-3">
                                    <span className="text-sm font-bold font-display text-slate-900 block">
                                      {item.priceDisplay}
                                    </span>
                                    <span className="text-[10px] text-slate-400 font-body">Onwards</span>
                                  </div>
                                )}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Resale Properties Section */}
                      {suggestions.resales && suggestions.resales.length > 0 && (
                        <div>
                          <div className="flex items-center justify-between mb-2.5">
                            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-700 font-display">
                              <Home className="w-4 h-4 text-[#E85D3F]" />
                              <span>Resale Properties ({suggestions.resales.length})</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => executeSearch()}
                              className="text-xs text-[#E85D3F] hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                            >
                              <span>View all</span>
                              <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <div className="space-y-2">
                            {suggestions.resales.map((item) => (
                              <button
                                key={item.id}
                                type="button"
                                onClick={() => selectSuggestion(item)}
                                className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-100 group text-left cursor-pointer"
                              >
                                <div className="flex items-center gap-3 min-w-0">
                                  <div className="relative w-16 h-12 rounded-lg overflow-hidden bg-slate-100 shrink-0 border border-slate-100">
                                    {item.imageUrl ? (
                                      <Image
                                        src={item.imageUrl}
                                        alt={item.title}
                                        fill
                                        sizes="64px"
                                        className="object-cover group-hover:scale-105 transition-transform"
                                        referrerPolicy="no-referrer"
                                      />
                                    ) : (
                                      <div className="w-full h-full flex items-center justify-center text-slate-400">
                                        <Home className="w-5 h-5" />
                                      </div>
                                    )}
                                  </div>
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5">
                                      <p className="text-sm font-semibold text-slate-900 group-hover:text-[#E85D3F] transition-colors font-display truncate">
                                        <HighlightMatch text={item.title} query={query} />
                                      </p>
                                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 fill-emerald-100 shrink-0" />
                                    </div>
                                    {item.subtitle && (
                                      <p className="text-xs text-slate-500 font-body truncate mt-0.5">
                                        {item.subtitle}
                                      </p>
                                    )}
                                  </div>
                                </div>

                                {item.priceDisplay && (
                                  <div className="text-right shrink-0 ml-3">
                                    <span className="text-sm font-bold font-display text-slate-900 block">
                                      {item.priceDisplay}
                                    </span>
                                  </div>
                                )}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Rentals Section */}
                      {suggestions.rentals && suggestions.rentals.length > 0 && (
                        <div>
                          <div className="flex items-center justify-between mb-2.5">
                            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-700 font-display">
                              <Key className="w-4 h-4 text-[#E85D3F]" />
                              <span>Rental Properties ({suggestions.rentals.length})</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => executeSearch()}
                              className="text-xs text-[#E85D3F] hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                            >
                              <span>View all</span>
                              <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <div className="space-y-2">
                            {suggestions.rentals.map((item) => (
                              <button
                                key={item.id}
                                type="button"
                                onClick={() => selectSuggestion(item)}
                                className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-100 group text-left cursor-pointer"
                              >
                                <div className="flex items-center gap-3 min-w-0">
                                  <div className="relative w-16 h-12 rounded-lg overflow-hidden bg-slate-100 shrink-0 border border-slate-100">
                                    {item.imageUrl ? (
                                      <Image
                                        src={item.imageUrl}
                                        alt={item.title}
                                        fill
                                        sizes="64px"
                                        className="object-cover group-hover:scale-105 transition-transform"
                                        referrerPolicy="no-referrer"
                                      />
                                    ) : (
                                      <div className="w-full h-full flex items-center justify-center text-slate-400">
                                        <Key className="w-5 h-5" />
                                      </div>
                                    )}
                                  </div>
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5">
                                      <p className="text-sm font-semibold text-slate-900 group-hover:text-[#E85D3F] transition-colors font-display truncate">
                                        <HighlightMatch text={item.title} query={query} />
                                      </p>
                                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 fill-emerald-100 shrink-0" />
                                    </div>
                                    {item.subtitle && (
                                      <p className="text-xs text-slate-500 font-body truncate mt-0.5">
                                        {item.subtitle}
                                      </p>
                                    )}
                                  </div>
                                </div>

                                {item.priceDisplay && (
                                  <div className="text-right shrink-0 ml-3">
                                    <span className="text-sm font-bold font-display text-slate-900 block">
                                      {item.priceDisplay}
                                    </span>
                                    <span className="text-[10px] text-slate-400 font-body">/ month</span>
                                  </div>
                                )}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Developers Section */}
                      {suggestions.developers && suggestions.developers.length > 0 && (
                        <div>
                          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-700 font-display mb-2.5">
                            <Users className="w-4 h-4 text-[#E85D3F]" />
                            <span>Developers ({suggestions.developers.length})</span>
                          </div>

                          <div className="space-y-2">
                            {suggestions.developers.map((item) => (
                              <button
                                key={item.id}
                                type="button"
                                onClick={() => selectSuggestion(item)}
                                className="w-full flex items-center justify-between p-3 rounded-xl border border-slate-200/80 hover:border-slate-300 hover:bg-slate-50 transition-all group text-left cursor-pointer"
                              >
                                <div className="flex items-center gap-3 min-w-0">
                                  <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center font-bold text-slate-800 text-xs font-display shrink-0 border border-slate-200">
                                    {item.title.substring(0, 2).toUpperCase()}
                                  </div>
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5">
                                      <p className="text-sm font-semibold text-slate-900 group-hover:text-[#E85D3F] transition-colors font-display truncate">
                                        <HighlightMatch text={item.title} query={query} />
                                      </p>
                                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 fill-emerald-100 shrink-0" />
                                    </div>
                                    <p className="text-xs text-slate-500 font-body truncate">
                                      Verified Developer • Kolkata
                                    </p>
                                  </div>
                                </div>
                                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-[#E85D3F] shrink-0 transition-colors" />
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    /* NO RESULTS STATE */
                    <div className="text-center py-10 px-4">
                      <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
                        <Search className="w-6 h-6" />
                      </div>
                      <h4 className="text-base font-semibold text-slate-900 font-display">
                        No properties found for &ldquo;{query}&rdquo;
                      </h4>
                      <p className="mt-1 text-xs sm:text-sm text-slate-500 font-body max-w-sm mx-auto">
                        Try searching by major micro-market (e.g. Rajarhat, New Town), developer name, or check your spelling.
                      </p>
                      <button
                        type="button"
                        onClick={() => executeSearch()}
                        className="mt-4 inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-[#E85D3F] hover:underline cursor-pointer"
                      >
                        <span>Explore all available listings</span>
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                /* DEFAULT STATE: Featured Discoveries Spotlight */
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-700 font-display">
                      <Compass className="w-4 h-4 text-[#E85D3F]" />
                      <span>Featured Verified Projects</span>
                    </div>
                    <Link
                      href="/projects"
                      onClick={closeSearchModal}
                      className="text-xs text-[#E85D3F] hover:underline font-semibold flex items-center gap-1"
                    >
                      <span>View All</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>

                  <div className="space-y-2.5">
                    {FEATURED_KOLKATA_PROJECTS.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => selectSuggestion(item as SuggestionItem)}
                        className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-100 group text-left cursor-pointer"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="relative w-16 h-12 rounded-lg overflow-hidden bg-slate-100 shrink-0 border border-slate-100">
                            <Image
                              src={item.imageUrl}
                              alt={item.title}
                              fill
                              sizes="64px"
                              className="object-cover group-hover:scale-105 transition-transform"
                              referrerPolicy="no-referrer"
                            />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="text-sm font-semibold text-slate-900 group-hover:text-[#E85D3F] transition-colors font-display truncate">
                                {item.title}
                              </p>
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 fill-emerald-100 shrink-0" />
                            </div>
                            <p className="text-xs text-slate-500 font-body truncate mt-0.5">
                              {item.subtitle}
                            </p>
                          </div>
                        </div>

                        <div className="text-right shrink-0 ml-3">
                          <span className="text-sm font-bold font-display text-slate-900 block">
                            {item.priceDisplay}
                          </span>
                          <span className="text-[10px] text-slate-400 font-body">Onwards</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* MODAL FOOTER: Concierge Advisory Link */}
        <div className="px-5 sm:px-8 py-3 bg-slate-50/80 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500 font-body">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
            <span>100% Verified Real Estate Intelligence in Kolkata</span>
          </div>
          <button
            type="button"
            onClick={handleOpenAssistance}
            className="text-[#E85D3F] font-display font-semibold hover:underline flex items-center gap-1 cursor-pointer"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Need shortlisting help? Talk to an Advisor</span>
          </button>
        </div>
      </div>
    </div>
  );
}
