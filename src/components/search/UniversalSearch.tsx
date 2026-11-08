'use client';

import React, { useRef, useId, useEffect } from 'react';
import { Search, X, MapPin, Building, Briefcase, ArrowRight, Loader2, ChevronDown, Check } from 'lucide-react';
import {
  useSearch,
  SearchDiscoveryMode,
  BHK_OPTIONS,
  HighlightMatch,
} from '@/src/context/SearchContext';
import { SuggestionRow } from './SuggestionRow';
export type { SearchDiscoveryMode };

interface UniversalSearchProps {
  placeholder?: string;
  className?: string;
  defaultMode?: SearchDiscoveryMode;
  showDiscoveryModes?: boolean;
  onModeChange?: (mode: SearchDiscoveryMode) => void;
  autoFocus?: boolean;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}

interface CustomSearchDropdownProps<T extends string | number> {
  options: { label: string; value: T }[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
}

function CustomSearchDropdown<T extends string | number>({
  options,
  value,
  onChange,
  ariaLabel,
  className = '',
}: CustomSearchDropdownProps<T>) {
  const [isOpen, setIsOpen] = React.useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value) || options[0];

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div ref={dropdownRef} className={`relative flex-1 lg:flex-initial min-w-0 ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={`w-full h-10 sm:h-11 flex items-center justify-between gap-1.5 bg-neutral-50 hover:bg-neutral-100/80 text-neutral-800 text-xs sm:text-sm font-display font-medium py-2 px-2.5 sm:px-3 rounded-xl border transition-all cursor-pointer select-none ${
          isOpen
            ? 'bg-white border-[#E85D3F] ring-2 ring-[#E85D3F]/20 shadow-xs'
            : 'border-neutral-200/80 hover:border-neutral-300'
        }`}
      >
        <span className="truncate text-left text-neutral-900 font-medium">
          {selectedOption ? selectedOption.label : ''}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-neutral-500 transition-transform duration-200 shrink-0 ${
            isOpen ? 'rotate-180 text-[#E85D3F]' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div
          role="listbox"
          aria-label={ariaLabel}
          className="absolute left-0 right-0 lg:right-auto lg:min-w-[170px] top-full mt-1.5 bg-white border border-neutral-200/90 rounded-xl shadow-xl z-50 py-1 max-h-60 overflow-y-auto animate-fade-in"
        >
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <button
                key={String(option.value)}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                className={`w-full text-left flex items-center justify-between px-3 py-2 text-xs sm:text-sm font-display transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-orange-50/80 text-[#E85D3F] font-semibold'
                    : 'text-neutral-700 hover:bg-neutral-50 hover:text-neutral-900 font-medium'
                }`}
              >
                <span className="truncate">{option.label}</span>
                {isSelected && <Check className="w-3.5 h-3.5 text-[#E85D3F] shrink-0 ml-2" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function UniversalSearch({
  placeholder = 'Location, project or developer',
  className = '',
  defaultMode,
  showDiscoveryModes = true,
  onModeChange,
  autoFocus = false,
  inputRef: externalInputRef,
}: UniversalSearchProps) {
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
    isDropdownOpen,
    setIsDropdownOpen,
    recentSearches,
    deleteRecentSearch,
    clearAllRecentSearches,
    executeSearch,
    selectSuggestion,
  } = useSearch();

  const containerRef = useRef<HTMLDivElement>(null);
  const internalInputRef = useRef<HTMLInputElement>(null);
  const inputRef = externalInputRef || internalInputRef;
  const listboxId = useId();

  // Omit forced mode reset to preserve user's chosen search mode across renders and modals


  // Click outside listener for dropdown
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [setIsDropdownOpen]);

  // Scroll highlighted suggestion into view
  useEffect(() => {
    if (highlightedIndex >= 0 && activeSuggestionsList[highlightedIndex]) {
      const activeEl = document.getElementById(`suggestion-${activeSuggestionsList[highlightedIndex].id}`);
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [highlightedIndex, activeSuggestionsList]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isDropdownOpen) {
        setIsDropdownOpen(true);
      }
      if (activeSuggestionsList.length > 0) {
        setHighlightedIndex((prev) => (prev < activeSuggestionsList.length - 1 ? prev + 1 : 0));
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isDropdownOpen) {
        setIsDropdownOpen(true);
      }
      if (activeSuggestionsList.length > 0) {
        setHighlightedIndex((prev) => (prev <= 0 ? activeSuggestionsList.length - 1 : prev - 1));
      }
    } else if (e.key === 'Enter') {
      if (isDropdownOpen && highlightedIndex >= 0 && activeSuggestionsList[highlightedIndex]) {
        e.preventDefault();
        selectSuggestion(activeSuggestionsList[highlightedIndex]);
      } else {
        e.preventDefault();
        executeSearch();
      }
    } else if (e.key === 'Escape') {
      if (isDropdownOpen) {
        e.preventDefault();
        setIsDropdownOpen(false);
      }
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executeSearch();
  };

  const showProjectsGroup =
    (!showDiscoveryModes || activeMode === 'PROJECTS') && (suggestions.projects?.length ?? 0) > 0;
  const showResalesGroup =
    (!showDiscoveryModes || activeMode === 'BUY') && (suggestions.resales?.length ?? 0) > 0;
  const showRentalsGroup =
    (!showDiscoveryModes || activeMode === 'RENT') && (suggestions.rentals?.length ?? 0) > 0;
  const showLocationsGroup = (suggestions.locations?.length ?? 0) > 0;
  const showDevelopersGroup =
    (!showDiscoveryModes || activeMode === 'PROJECTS') && (suggestions.developers?.length ?? 0) > 0;

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

  return (
    <div ref={containerRef} className={`w-full relative ${className}`}>
      {/* 1. Discovery Mode Tabs (Above Search Bar - Centered) */}
      {showDiscoveryModes && (
        <div className="flex items-center justify-center gap-2 sm:gap-2.5 mb-2.5 sm:mb-3 overflow-x-auto no-scrollbar pb-1 px-1">
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
                  if (onModeChange) {
                    onModeChange(mode.id);
                  }
                }}
                className={`px-4 sm:px-6 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-display font-bold transition-all duration-200 cursor-pointer whitespace-nowrap shrink-0 active:scale-95 ${
                  isActive
                    ? 'bg-[#E85D3F] text-white shadow-md ring-2 ring-[#E85D3F]/20'
                    : 'bg-white/95 hover:bg-white text-neutral-700 hover:text-neutral-900 border border-neutral-200/90 shadow-2xs hover:border-neutral-300'
                }`}
              >
                {mode.label}
              </button>
            );
          })}
        </div>
      )}

      {/* 2. Compact Search Presentation Container */}
      <div
        role="combobox"
        aria-expanded={isDropdownOpen}
        aria-haspopup="listbox"
        aria-owns={listboxId}
        className="relative bg-white rounded-2xl shadow-md border border-neutral-200/90 p-2.5 sm:p-3 lg:p-3.5 transition-all focus-within:ring-2 focus-within:ring-[#E85D3F]/60 focus-within:border-[#E85D3F]"
      >
        <form
          onSubmit={handleSearchSubmit}
          className="flex flex-col lg:flex-row items-stretch lg:items-center gap-2 sm:gap-2.5"
        >
          {/* Main Search Input */}
          <div className="relative flex-1 flex items-center min-w-0 h-11 sm:h-12 bg-neutral-50 lg:bg-transparent rounded-xl lg:rounded-none border border-neutral-200/70 lg:border-0 transition-colors">
            <Search className="absolute left-3 w-4 h-4 text-neutral-400 pointer-events-none shrink-0" />
            <input
              ref={inputRef as any}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setIsDropdownOpen(true);
              }}
              onFocus={() => setIsDropdownOpen(true)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              aria-label={placeholder}
              aria-autocomplete="list"
              aria-controls={listboxId}
              aria-activedescendant={
                activeHighlightedItem ? `suggestion-${activeHighlightedItem.id}` : undefined
              }
              autoComplete="off"
              autoFocus={autoFocus}
              className="w-full bg-transparent border-0 py-2 pl-9 pr-8 text-neutral-900 placeholder:text-neutral-400 text-xs sm:text-sm md:text-base font-body focus:outline-none"
            />
            {loading && (
              <div className="absolute right-8 text-neutral-400">
                <Loader2 className="w-4 h-4 animate-spin" />
              </div>
            )}
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  inputRef.current?.focus();
                }}
                className="absolute right-2.5 p-1 text-neutral-400 hover:text-neutral-600 rounded-full transition-colors cursor-pointer"
                aria-label="Clear search query"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Filter Dropdowns & CTA Button */}
          <div className="flex items-center gap-2 border-t lg:border-t-0 lg:border-l border-neutral-100 pt-2 lg:pt-0 lg:pl-2.5">
            {/* Budget Selector */}
            <CustomSearchDropdown
              options={currentBudgetOptions.map((opt, idx) => ({ label: opt.label, value: idx }))}
              value={selectedBudgetIndex}
              onChange={(val) => setSelectedBudgetIndex(val)}
              ariaLabel="Filter by pricing budget"
            />

            {/* BHK Selector */}
            <CustomSearchDropdown
              options={BHK_OPTIONS.map((opt) => ({ label: opt.label, value: opt.value }))}
              value={selectedBhk}
              onChange={(val) => setSelectedBhk(val)}
              ariaLabel="Filter by bedroom count"
            />

            {/* Search Submit CTA */}
            <button
              type="submit"
              aria-label="Search properties"
              className="h-10 sm:h-11 min-w-[40px] sm:min-w-[44px] inline-flex items-center justify-center gap-2 px-3 lg:px-6 rounded-xl bg-[#E85D3F] hover:bg-[#D44E32] active:scale-[0.98] text-white text-xs sm:text-sm font-display font-bold transition-all duration-150 shadow-xs hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E85D3F] focus-visible:ring-offset-2 shrink-0 cursor-pointer"
            >
              <Search className="w-4 h-4 lg:hidden" />
              <span className="hidden lg:inline">Search</span>
              <ArrowRight className="hidden lg:inline w-4 h-4 transition-transform group-hover:translate-x-0.5" />
            </button>
          </div>
        </form>

        {/* 3. Autocomplete Suggestions & History Overlay */}
        {isDropdownOpen && (
          <div
            id={listboxId}
            role="listbox"
            className="absolute left-0 right-0 top-full mt-2 bg-white border border-neutral-200 rounded-2xl shadow-2xl z-50 font-body max-h-[60vh] sm:max-h-[70vh] overflow-y-auto overscroll-contain animate-fade-in"
          >
            {/* Recent Searches Header */}
            {!query && recentSearches.length > 0 && (
              <div className="p-4 border-b border-neutral-100 bg-neutral-50/50">
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
                      className="inline-flex items-center gap-1.5 text-xs bg-white text-neutral-700 pl-3 pr-1.5 py-1.5 rounded-lg border border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50 transition-colors shadow-2xs"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setQuery(term);
                          executeSearch(term);
                        }}
                        className="font-medium text-neutral-800 hover:text-[#E85D3F] cursor-pointer"
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
                        className="p-0.5 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-200 rounded-full transition-colors cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Suggestions Grouping */}
            {query && hasSuggestions && (
              <div className="divide-y divide-neutral-100">
                {/* Projects */}
                {showProjectsGroup && (
                  <div className="p-2 sm:p-2.5">
                    <div className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-1.5 px-3 font-display">
                      Projects
                    </div>
                    {suggestions.projects.map((item) => (
                      <SuggestionRow
                        key={item.id}
                        item={item}
                        query={query}
                        isHighlighted={activeHighlightedItem?.id === item.id}
                        onSelect={selectSuggestion}
                        idPrefix="suggestion"
                      />
                    ))}
                  </div>
                )}

                {/* Verified Resale Homes */}
                {showResalesGroup && (
                  <div className="p-2 sm:p-2.5">
                    <div className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-1.5 px-3 font-display">
                      Verified Resale Homes
                    </div>
                    {suggestions.resales?.map((item) => (
                      <SuggestionRow
                        key={item.id}
                        item={item}
                        query={query}
                        isHighlighted={activeHighlightedItem?.id === item.id}
                        onSelect={selectSuggestion}
                        idPrefix="suggestion"
                      />
                    ))}
                  </div>
                )}

                {/* Verified Rental Homes */}
                {showRentalsGroup && (
                  <div className="p-2 sm:p-2.5">
                    <div className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-1.5 px-3 font-display">
                      Verified Rental Homes
                    </div>
                    {suggestions.rentals?.map((item) => (
                      <SuggestionRow
                        key={item.id}
                        item={item}
                        query={query}
                        isHighlighted={activeHighlightedItem?.id === item.id}
                        onSelect={selectSuggestion}
                        idPrefix="suggestion"
                      />
                    ))}
                  </div>
                )}

                {/* Locations */}
                {showLocationsGroup && (
                  <div className="p-2 sm:p-2.5">
                    <div className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-1.5 px-3 font-display">
                      Locations
                    </div>
                    {suggestions.locations.map((item) => (
                      <SuggestionRow
                        key={item.id}
                        item={item}
                        query={query}
                        isHighlighted={activeHighlightedItem?.id === item.id}
                        onSelect={selectSuggestion}
                        idPrefix="suggestion"
                      />
                    ))}
                  </div>
                )}

                {/* Developers */}
                {showDevelopersGroup && (
                  <div className="p-2 sm:p-2.5">
                    <div className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-1.5 px-3 font-display">
                      Developers
                    </div>
                    {suggestions.developers.map((item) => (
                      <SuggestionRow
                        key={item.id}
                        item={item}
                        query={query}
                        isHighlighted={activeHighlightedItem?.id === item.id}
                        onSelect={selectSuggestion}
                        idPrefix="suggestion"
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Empty State */}
            {query && !hasSuggestions && !loading && (
              <div className="p-6 text-center text-neutral-500">
                <p className="text-sm">No exact suggestions found for "{query}".</p>
                <button
                  type="button"
                  onClick={handleSearchSubmit}
                  className="mt-3 inline-flex items-center space-x-2 text-xs font-semibold text-white bg-[#E85D3F] px-4 py-2 rounded-lg hover:bg-[#D44E32] transition-colors cursor-pointer"
                >
                  <span>Search all results for "{query}"</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
