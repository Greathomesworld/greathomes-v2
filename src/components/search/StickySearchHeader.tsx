'use client';

import React, { useRef, useState, useEffect, useId } from 'react';
import { usePathname } from 'next/navigation';
import {
  Search,
  X,
  ChevronDown,
  ArrowRight,
  Loader2,
  Check,
  SlidersHorizontal,
} from 'lucide-react';
import {
  useSearch,
  BHK_OPTIONS,
} from '@/src/context/SearchContext';
import { SuggestionRow } from './SuggestionRow';

export function GlobalSearchHeaderRow() {
  const pathname = usePathname();
  const isHomepage = pathname === '/';

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
    activeSuggestionsList,
    highlightedIndex,
    setHighlightedIndex,
    isStickyVisible,
    setIsMobileSheetOpen,
    recentSearches,
    deleteRecentSearch,
    clearAllRecentSearches,
    executeSearch,
    selectSuggestion,
  } = useSearch();

  const [desktopDropdownOpen, setDesktopDropdownOpen] = useState(false);
  const [bhkDropdownOpen, setBhkDropdownOpen] = useState(false);
  const [budgetDropdownOpen, setBudgetDropdownOpen] = useState(false);

  const stickyRowRef = useRef<HTMLDivElement>(null);
  const desktopInputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();

  // On homepage: show only when scrolled past hero (isStickyVisible === true)
  // On all other public pages: always show
  const isSearchRowActive = !isHomepage || isStickyVisible;

  // Click outside listener for desktop dropdowns
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (stickyRowRef.current && !stickyRowRef.current.contains(e.target as Node)) {
        setDesktopDropdownOpen(false);
        setBhkDropdownOpen(false);
        setBudgetDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!desktopDropdownOpen) setDesktopDropdownOpen(true);
      if (activeSuggestionsList.length > 0) {
        setHighlightedIndex((prev) => (prev < activeSuggestionsList.length - 1 ? prev + 1 : 0));
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!desktopDropdownOpen) setDesktopDropdownOpen(true);
      if (activeSuggestionsList.length > 0) {
        setHighlightedIndex((prev) => (prev <= 0 ? activeSuggestionsList.length - 1 : prev - 1));
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (desktopDropdownOpen && highlightedIndex >= 0 && activeSuggestionsList[highlightedIndex]) {
        selectSuggestion(activeSuggestionsList[highlightedIndex]);
        setDesktopDropdownOpen(false);
      } else {
        setDesktopDropdownOpen(false);
        executeSearch();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setDesktopDropdownOpen(false);
      setBhkDropdownOpen(false);
      setBudgetDropdownOpen(false);
    }
  };

  const selectedBudget = currentBudgetOptions[selectedBudgetIndex] || currentBudgetOptions[0];
  const selectedBhkObj = BHK_OPTIONS.find((b) => b.value === selectedBhk) || BHK_OPTIONS[0];

  const showProjectsGroup = activeMode === 'PROJECTS' && (suggestions.projects?.length ?? 0) > 0;
  const showResalesGroup = activeMode === 'BUY' && (suggestions.resales?.length ?? 0) > 0;
  const showRentalsGroup = activeMode === 'RENT' && (suggestions.rentals?.length ?? 0) > 0;
  const showLocationsGroup = (suggestions.locations?.length ?? 0) > 0;
  const showDevelopersGroup = activeMode === 'PROJECTS' && (suggestions.developers?.length ?? 0) > 0;

  const hasSuggestions =
    showProjectsGroup ||
    showResalesGroup ||
    showRentalsGroup ||
    showLocationsGroup ||
    showDevelopersGroup;

  const activeHighlightedItem =
    highlightedIndex >= 0 && activeSuggestionsList[highlightedIndex]
      ? activeSuggestionsList[highlightedIndex]
      : null;

  if (!isSearchRowActive) {
    return null;
  }

  return (
    <div
      ref={stickyRowRef}
      className="w-full relative transition-all duration-200 animate-fade-in"
    >
      {/* DESKTOP ROW 2: Compact Global Search Row (52px height) */}
      <div className="hidden md:block w-full border-t border-neutral-200/80 bg-neutral-50/70 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-[52px] flex items-center justify-between gap-3">
          {/* 1. Mode Selector Pills */}
          <div className="flex items-center gap-1 bg-neutral-200/70 p-1 rounded-xl shrink-0">
            {[
              { id: 'PROJECTS' as const, label: 'Projects' },
              { id: 'BUY' as const, label: 'Buy Resale' },
              { id: 'RENT' as const, label: 'Rent' },
            ].map((mode) => {
              const isActive = activeMode === mode.id;
              return (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => {
                    setActiveMode(mode.id);
                    setDesktopDropdownOpen(false);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-display font-semibold transition-all cursor-pointer whitespace-nowrap ${
                    isActive
                      ? 'bg-white text-[#E85D3F] shadow-2xs font-bold'
                      : 'text-neutral-600 hover:text-neutral-900 hover:bg-white/60'
                  }`}
                >
                  {mode.label}
                </button>
              );
            })}
          </div>

          {/* 2. Compact Search Input Form */}
          <div className="relative flex-1 max-w-2xl flex items-center bg-white rounded-xl border border-neutral-200/90 focus-within:border-[#E85D3F] focus-within:ring-2 focus-within:ring-[#E85D3F]/20 shadow-2xs transition-all h-9">
            <Search className="w-4 h-4 text-neutral-400 ml-3 shrink-0 pointer-events-none" />
            <input
              ref={desktopInputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setDesktopDropdownOpen(true);
              }}
              onFocus={() => setDesktopDropdownOpen(true)}
              onKeyDown={handleKeyDown}
              placeholder={
                activeMode === 'PROJECTS'
                  ? 'Search projects, locations or developers...'
                  : activeMode === 'BUY'
                    ? 'Search verified resale homes or locations...'
                    : 'Search verified rentals or locations...'
              }
              autoComplete="off"
              aria-label="Global property search"
              aria-autocomplete="list"
              aria-controls={listboxId}
              aria-activedescendant={
                activeHighlightedItem ? `sticky-suggestion-${activeHighlightedItem.id}` : undefined
              }
              className="w-full bg-transparent px-3 py-1.5 text-xs sm:text-sm text-neutral-900 placeholder:text-neutral-400 font-body focus:outline-none"
            />
            {loading && (
              <div className="pr-3 text-neutral-400">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              </div>
            )}
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  desktopInputRef.current?.focus();
                }}
                className="p-1 mr-1 text-neutral-400 hover:text-neutral-700 transition-colors cursor-pointer"
                aria-label="Clear query"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* 3. Filter Selectors & Search CTA Button */}
          <div className="flex items-center gap-2 shrink-0">
            {/* BHK Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setBhkDropdownOpen((prev) => !prev);
                  setBudgetDropdownOpen(false);
                  setDesktopDropdownOpen(false);
                }}
                className={`h-9 px-3 rounded-xl border text-xs font-display font-medium flex items-center gap-1.5 transition-colors cursor-pointer select-none shadow-2xs ${
                  bhkDropdownOpen
                    ? 'bg-orange-50/80 border-[#E85D3F] text-[#E85D3F]'
                    : 'bg-white border-neutral-200/90 text-neutral-700 hover:border-neutral-300'
                }`}
              >
                <span>{selectedBhkObj.label}</span>
                <ChevronDown className="w-3 h-3 text-neutral-400" />
              </button>
              {bhkDropdownOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-36 bg-white border border-neutral-200/90 rounded-xl shadow-xl z-50 py-1 animate-fade-in">
                  {BHK_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        setSelectedBhk(opt.value);
                        setBhkDropdownOpen(false);
                      }}
                      className={`w-full text-left px-3 py-1.5 text-xs font-display flex items-center justify-between cursor-pointer ${
                        selectedBhk === opt.value
                          ? 'bg-orange-50 text-[#E85D3F] font-bold'
                          : 'text-neutral-700 hover:bg-neutral-50'
                      }`}
                    >
                      <span>{opt.label}</span>
                      {selectedBhk === opt.value && <Check className="w-3 h-3 text-[#E85D3F]" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Budget Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setBudgetDropdownOpen((prev) => !prev);
                  setBhkDropdownOpen(false);
                  setDesktopDropdownOpen(false);
                }}
                className={`h-9 px-3 rounded-xl border text-xs font-display font-medium flex items-center gap-1.5 transition-colors cursor-pointer select-none shadow-2xs ${
                  budgetDropdownOpen
                    ? 'bg-orange-50/80 border-[#E85D3F] text-[#E85D3F]'
                    : 'bg-white border-neutral-200/90 text-neutral-700 hover:border-neutral-300'
                }`}
              >
                <span className="max-w-[105px] truncate">{selectedBudget.label}</span>
                <ChevronDown className="w-3 h-3 text-neutral-400" />
              </button>
              {budgetDropdownOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-44 bg-white border border-neutral-200/90 rounded-xl shadow-xl z-50 py-1 animate-fade-in">
                  {currentBudgetOptions.map((opt, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setSelectedBudgetIndex(idx);
                        setBudgetDropdownOpen(false);
                      }}
                      className={`w-full text-left px-3 py-1.5 text-xs font-display flex items-center justify-between cursor-pointer ${
                        selectedBudgetIndex === idx
                          ? 'bg-orange-50 text-[#E85D3F] font-bold'
                          : 'text-neutral-700 hover:bg-neutral-50'
                      }`}
                    >
                      <span className="truncate">{opt.label}</span>
                      {selectedBudgetIndex === idx && <Check className="w-3 h-3 text-[#E85D3F]" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Submit Button */}
            <button
              type="button"
              onClick={() => {
                setDesktopDropdownOpen(false);
                executeSearch();
              }}
              className="h-9 px-4 rounded-xl bg-[#E85D3F] hover:bg-[#D44E32] text-white text-xs font-display font-bold flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer active:scale-95"
            >
              <span>Search</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Desktop Attached Autocomplete Dropdown */}
        {desktopDropdownOpen && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
            <div
              id={listboxId}
              role="listbox"
              className="absolute left-4 right-4 sm:left-6 sm:right-6 lg:left-8 lg:right-8 top-1.5 bg-white border border-neutral-200 rounded-2xl shadow-2xl z-50 font-body max-h-[60vh] overflow-y-auto overscroll-contain animate-fade-in"
            >
              {/* Recent Searches */}
              {!query && recentSearches.length > 0 && (
                <div className="p-3 bg-neutral-50/70 border-b border-neutral-100">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider font-display">
                      Recent Searches
                    </span>
                    <button
                      type="button"
                      onClick={clearAllRecentSearches}
                      className="text-xs text-[#E85D3F] hover:underline font-medium cursor-pointer"
                    >
                      Clear All
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {recentSearches.map((term, idx) => (
                      <div
                        key={idx}
                        className="inline-flex items-center gap-1.5 text-xs bg-white text-neutral-700 pl-3 pr-1.5 py-1 rounded-lg border border-neutral-200 shadow-2xs"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setQuery(term);
                            setDesktopDropdownOpen(false);
                            executeSearch(term);
                          }}
                          className="font-medium hover:text-[#E85D3F] cursor-pointer"
                        >
                          {term}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteRecentSearch(term);
                          }}
                          aria-label={`Remove recent search ${term}`}
                          className="p-0.5 text-neutral-400 hover:text-neutral-700 rounded-full cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Suggestions Groups with rigid 3-column SuggestionRow */}
              {query && hasSuggestions && (
                <div className="divide-y divide-neutral-100">
                  {showProjectsGroup && (
                    <div className="p-2 sm:p-2.5">
                      <div className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-1 px-3 font-display">
                        Projects
                      </div>
                      {suggestions.projects.map((item) => (
                        <SuggestionRow
                          key={item.id}
                          item={item}
                          query={query}
                          isHighlighted={activeHighlightedItem?.id === item.id}
                          onSelect={(it) => {
                            selectSuggestion(it);
                            setDesktopDropdownOpen(false);
                          }}
                          idPrefix="sticky-suggestion"
                        />
                      ))}
                    </div>
                  )}

                  {showResalesGroup && (
                    <div className="p-2 sm:p-2.5">
                      <div className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-1 px-3 font-display">
                        Verified Resale Homes
                      </div>
                      {suggestions.resales?.map((item) => (
                        <SuggestionRow
                          key={item.id}
                          item={item}
                          query={query}
                          isHighlighted={activeHighlightedItem?.id === item.id}
                          onSelect={(it) => {
                            selectSuggestion(it);
                            setDesktopDropdownOpen(false);
                          }}
                          idPrefix="sticky-suggestion"
                        />
                      ))}
                    </div>
                  )}

                  {showRentalsGroup && (
                    <div className="p-2 sm:p-2.5">
                      <div className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-1 px-3 font-display">
                        Verified Rental Homes
                      </div>
                      {suggestions.rentals?.map((item) => (
                        <SuggestionRow
                          key={item.id}
                          item={item}
                          query={query}
                          isHighlighted={activeHighlightedItem?.id === item.id}
                          onSelect={(it) => {
                            selectSuggestion(it);
                            setDesktopDropdownOpen(false);
                          }}
                          idPrefix="sticky-suggestion"
                        />
                      ))}
                    </div>
                  )}

                  {showLocationsGroup && (
                    <div className="p-2 sm:p-2.5">
                      <div className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-1 px-3 font-display">
                        Locations
                      </div>
                      {suggestions.locations.map((item) => (
                        <SuggestionRow
                          key={item.id}
                          item={item}
                          query={query}
                          isHighlighted={activeHighlightedItem?.id === item.id}
                          onSelect={(it) => {
                            selectSuggestion(it);
                            setDesktopDropdownOpen(false);
                          }}
                          idPrefix="sticky-suggestion"
                        />
                      ))}
                    </div>
                  )}

                  {showDevelopersGroup && (
                    <div className="p-2 sm:p-2.5">
                      <div className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-1 px-3 font-display">
                        Developers
                      </div>
                      {suggestions.developers.map((item) => (
                        <SuggestionRow
                          key={item.id}
                          item={item}
                          query={query}
                          isHighlighted={activeHighlightedItem?.id === item.id}
                          onSelect={(it) => {
                            selectSuggestion(it);
                            setDesktopDropdownOpen(false);
                          }}
                          idPrefix="sticky-suggestion"
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Empty state */}
              {query && !hasSuggestions && !loading && (
                <div className="p-6 text-center text-neutral-500">
                  <p className="text-sm font-medium">No direct suggestions for "{query}"</p>
                  <button
                    type="button"
                    onClick={() => {
                      setDesktopDropdownOpen(false);
                      executeSearch();
                    }}
                    className="mt-2.5 inline-flex items-center space-x-2 text-xs font-semibold text-white bg-[#E85D3F] px-4 py-2 rounded-lg hover:bg-[#D44E32] transition-colors cursor-pointer"
                  >
                    <span>Search all results for "{query}"</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* MOBILE PERSISTENT SEARCH TRIGGER BAR (< md) */}
      <div className="md:hidden w-full border-t border-neutral-200/80 bg-neutral-50/80 px-4 py-2">
        <button
          type="button"
          onClick={() => setIsMobileSheetOpen(true)}
          className="w-full h-10 bg-white hover:bg-neutral-50 active:bg-neutral-100 rounded-xl border border-neutral-200/90 px-3 flex items-center justify-between text-left shadow-2xs transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <Search className="w-4 h-4 text-[#E85D3F] shrink-0" />
            <span className="text-xs font-body text-neutral-700 truncate">
              {query.trim() || 'Search Kolkata properties...'}
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="px-2 py-0.5 rounded-md bg-[#FFF5EE] text-[#E85D3F] text-[10px] font-display font-bold uppercase tracking-wider">
              {activeMode === 'PROJECTS' ? 'Projects' : activeMode === 'BUY' ? 'Buy' : 'Rent'}
            </span>
            <SlidersHorizontal className="w-3.5 h-3.5 text-neutral-400 ml-0.5" />
          </div>
        </button>
      </div>
    </div>
  );
}

export function MobileSearchSheet() {
  const {
    activeMode,
    setActiveMode,
    query,
    setQuery,
    selectedBhk,
    setSelectedBhk,
    suggestions,
    loading,
    isMobileSheetOpen,
    setIsMobileSheetOpen,
    recentSearches,
    deleteRecentSearch,
    clearAllRecentSearches,
    executeSearch,
    selectSuggestion,
  } = useSearch();

  const mobileInputRef = useRef<HTMLInputElement>(null);

  // Background scroll lock when mobile sheet is open
  useEffect(() => {
    if (isMobileSheetOpen) {
      const originalStyle = window.getComputedStyle(document.body).overflow;
      document.body.style.overflow = 'hidden';
      setTimeout(() => mobileInputRef.current?.focus(), 50);
      return () => {
        document.body.style.overflow = originalStyle;
      };
    }
  }, [isMobileSheetOpen]);

  if (!isMobileSheetOpen) {
    return null;
  }

  const showProjectsGroup = activeMode === 'PROJECTS' && (suggestions.projects?.length ?? 0) > 0;
  const showResalesGroup = activeMode === 'BUY' && (suggestions.resales?.length ?? 0) > 0;
  const showRentalsGroup = activeMode === 'RENT' && (suggestions.rentals?.length ?? 0) > 0;
  const showLocationsGroup = (suggestions.locations?.length ?? 0) > 0;
  const showDevelopersGroup = activeMode === 'PROJECTS' && (suggestions.developers?.length ?? 0) > 0;

  const hasSuggestions =
    showProjectsGroup ||
    showResalesGroup ||
    showRentalsGroup ||
    showLocationsGroup ||
    showDevelopersGroup;

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col animate-fade-in font-body overflow-hidden">
      {/* Top Bar with Safe Area Support */}
      <div className="pt-3 pb-2.5 px-4 border-b border-neutral-200 bg-white shrink-0">
        <div className="flex items-center gap-2">
          <div className="relative flex-1 flex items-center bg-neutral-100 rounded-xl">
            <Search className="w-4 h-4 text-neutral-400 ml-3 shrink-0" />
            <input
              ref={mobileInputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  executeSearch();
                }
              }}
              placeholder="Search project, location, developer..."
              autoComplete="off"
              className="w-full bg-transparent px-3 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  mobileInputRef.current?.focus();
                }}
                className="p-1 mr-2 text-neutral-400 hover:text-neutral-700 cursor-pointer"
                aria-label="Clear query"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setIsMobileSheetOpen(false)}
            className="px-2.5 py-2 text-sm font-display font-medium text-neutral-600 hover:text-neutral-900 cursor-pointer shrink-0"
          >
            Cancel
          </button>
        </div>

        {/* Discovery Mode Tabs */}
        <div className="flex items-center gap-2 mt-3 overflow-x-auto no-scrollbar">
          {[
            { id: 'PROJECTS' as const, label: 'Projects' },
            { id: 'BUY' as const, label: 'Buy Resale' },
            { id: 'RENT' as const, label: 'Rent' },
          ].map((mode) => {
            const isActive = activeMode === mode.id;
            return (
              <button
                key={mode.id}
                type="button"
                onClick={() => setActiveMode(mode.id)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-display font-bold transition-all cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'bg-[#E85D3F] text-white shadow-xs'
                    : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                }`}
              >
                {mode.label}
              </button>
            );
          })}
        </div>

        {/* Horizontal BHK Filter Chips */}
        <div className="flex items-center gap-1.5 mt-2.5 overflow-x-auto no-scrollbar pb-0.5">
          {BHK_OPTIONS.map((opt) => {
            const isSelected = selectedBhk === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setSelectedBhk(opt.value)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-display font-medium border cursor-pointer whitespace-nowrap ${
                  isSelected
                    ? 'bg-orange-50 border-[#E85D3F] text-[#E85D3F] font-bold'
                    : 'bg-white border-neutral-200 text-neutral-600 hover:border-neutral-300'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Scrollable Content Body */}
      <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-3 divide-y divide-neutral-100">
        {/* Recent Searches */}
        {!query && recentSearches.length > 0 && (
          <div className="pb-4">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider font-display">
                Recent Searches
              </span>
              <button
                type="button"
                onClick={clearAllRecentSearches}
                className="text-xs text-[#E85D3F] font-medium cursor-pointer"
              >
                Clear All
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {recentSearches.map((term, idx) => (
                <div
                  key={idx}
                  className="inline-flex items-center gap-1.5 text-xs bg-neutral-50 text-neutral-700 pl-3 pr-1.5 py-1.5 rounded-lg border border-neutral-200"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setQuery(term);
                      executeSearch(term);
                    }}
                    className="font-medium hover:text-[#E85D3F] cursor-pointer"
                  >
                    {term}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteRecentSearch(term);
                    }}
                    aria-label={`Remove recent search ${term}`}
                    className="p-0.5 text-neutral-400 hover:text-neutral-700 rounded-full cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Suggestion Groups using 3-column SuggestionRow */}
        {query && hasSuggestions && (
          <div className="divide-y divide-neutral-100">
            {showProjectsGroup && (
              <div className="py-2.5">
                <div className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-1.5 font-display">
                  Projects
                </div>
                {suggestions.projects.map((item) => (
                  <SuggestionRow
                    key={item.id}
                    item={item}
                    query={query}
                    onSelect={(it) => selectSuggestion(it)}
                    idPrefix="mobile-sheet"
                  />
                ))}
              </div>
            )}

            {showResalesGroup && (
              <div className="py-2.5">
                <div className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-1.5 font-display">
                  Verified Resale Homes
                </div>
                {suggestions.resales?.map((item) => (
                  <SuggestionRow
                    key={item.id}
                    item={item}
                    query={query}
                    onSelect={(it) => selectSuggestion(it)}
                    idPrefix="mobile-sheet"
                  />
                ))}
              </div>
            )}

            {showRentalsGroup && (
              <div className="py-2.5">
                <div className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-1.5 font-display">
                  Verified Rental Homes
                </div>
                {suggestions.rentals?.map((item) => (
                  <SuggestionRow
                    key={item.id}
                    item={item}
                    query={query}
                    onSelect={(it) => selectSuggestion(it)}
                    idPrefix="mobile-sheet"
                  />
                ))}
              </div>
            )}

            {showLocationsGroup && (
              <div className="py-2.5">
                <div className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-1.5 font-display">
                  Locations
                </div>
                {suggestions.locations.map((item) => (
                  <SuggestionRow
                    key={item.id}
                    item={item}
                    query={query}
                    onSelect={(it) => selectSuggestion(it)}
                    idPrefix="mobile-sheet"
                  />
                ))}
              </div>
            )}

            {showDevelopersGroup && (
              <div className="py-2.5">
                <div className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-1.5 font-display">
                  Developers
                </div>
                {suggestions.developers.map((item) => (
                  <SuggestionRow
                    key={item.id}
                    item={item}
                    query={query}
                    onSelect={(it) => selectSuggestion(it)}
                    idPrefix="mobile-sheet"
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Empty state */}
        {query && !hasSuggestions && !loading && (
          <div className="py-12 text-center text-neutral-500">
            <p className="text-sm font-medium">No direct suggestions for "{query}"</p>
            <p className="text-xs text-neutral-400 mt-1">
              Tap the button below to search all listings across Kolkata.
            </p>
          </div>
        )}
      </div>

      {/* Sticky Bottom Search CTA Button */}
      <div className="p-4 border-t border-neutral-200 bg-white shrink-0">
        <button
          type="button"
          onClick={() => executeSearch()}
          className="w-full h-12 rounded-xl bg-[#E85D3F] hover:bg-[#D44E32] active:scale-[0.99] text-white font-display font-bold text-sm flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
        >
          <Search className="w-4 h-4" />
          <span>
            Search{' '}
            {activeMode === 'PROJECTS'
              ? 'Projects'
              : activeMode === 'BUY'
                ? 'Resale Homes'
                : 'Rental Homes'}
          </span>
        </button>
      </div>
    </div>
  );
}
