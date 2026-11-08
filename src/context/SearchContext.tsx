'use client';

import React, { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from 'react';
import { useRouter } from 'next/navigation';

export type SearchDiscoveryMode = 'PROJECTS' | 'BUY' | 'RENT';

export interface SuggestionItem {
  id: string;
  type: 'PROJECT' | 'DEVELOPER' | 'LOCATION' | 'RESALE' | 'RENTAL';
  title: string;
  subtitle?: string;
  slug: string;
  url: string;
  imageUrl?: string;
  priceDisplay?: string;
}

export interface SuggestionsGrouped {
  projects: SuggestionItem[];
  locations: SuggestionItem[];
  developers: SuggestionItem[];
  resales?: SuggestionItem[];
  rentals?: SuggestionItem[];
}

export interface BudgetOption {
  label: string;
  min: string;
  max: string;
}

export const BHK_OPTIONS = [
  { label: 'All BHK', value: '' },
  { label: '1 BHK', value: '1' },
  { label: '2 BHK', value: '2' },
  { label: '3 BHK', value: '3' },
  { label: '4 BHK', value: '4' },
  { label: '5+ BHK', value: '5' },
];

export const BUY_BUDGET_OPTIONS: BudgetOption[] = [
  { label: 'Any Budget', min: '', max: '' },
  { label: 'Under ₹50 L', min: '', max: '5000000' },
  { label: '₹50 L – ₹1 Cr', min: '5000000', max: '10000000' },
  { label: '₹1 Cr – ₹2 Cr', min: '10000000', max: '20000000' },
  { label: '₹2 Cr – ₹5 Cr', min: '20000000', max: '50000000' },
  { label: 'Above ₹5 Cr', min: '50000000', max: '' },
];

export const RENT_BUDGET_OPTIONS: BudgetOption[] = [
  { label: 'Any Rent', min: '', max: '' },
  { label: 'Under ₹20,000', min: '', max: '20000' },
  { label: '₹20k – ₹40k', min: '20000', max: '40000' },
  { label: '₹40k – ₹75k', min: '40000', max: '75000' },
  { label: '₹75k – ₹1.5 L', min: '75000', max: '150000' },
  { label: 'Above ₹1.5 L', min: '150000', max: '' },
];

interface SearchContextValue {
  // Shared state
  activeMode: SearchDiscoveryMode;
  setActiveMode: (mode: SearchDiscoveryMode) => void;
  query: string;
  setQuery: (q: string) => void;
  selectedBhk: string;
  setSelectedBhk: (bhk: string) => void;
  selectedBudgetIndex: number;
  setSelectedBudgetIndex: (idx: number) => void;
  currentBudgetOptions: BudgetOption[];

  // Suggestions & loading
  suggestions: SuggestionsGrouped;
  loading: boolean;
  activeSuggestionsList: SuggestionItem[];
  highlightedIndex: number;
  setHighlightedIndex: (idx: number | ((prev: number) => number)) => void;

  // Overlays & UI
  isDropdownOpen: boolean;
  setIsDropdownOpen: (open: boolean) => void;
  isMobileSheetOpen: boolean;
  setIsMobileSheetOpen: (open: boolean) => void;
  isSearchModalOpen: boolean;
  setIsSearchModalOpen: (open: boolean) => void;
  openSearchModal: (initialMode?: SearchDiscoveryMode) => void;
  closeSearchModal: () => void;
  isStickyVisible: boolean;
  setIsStickyVisible: (visible: boolean) => void;

  // Recent searches
  recentSearches: string[];
  deleteRecentSearch: (term: string) => void;
  clearAllRecentSearches: () => void;

  // Actions
  executeSearch: (overrideQuery?: string) => void;
  selectSuggestion: (item: SuggestionItem) => void;
}

const SearchContext = createContext<SearchContextValue | null>(null);

// In-memory bounded client-side cache (max ~50 entries)
const SUGGESTIONS_CACHE = new Map<string, SuggestionsGrouped>();
const MAX_CACHE_ENTRIES = 50;

function setCachedSuggestions(key: string, data: SuggestionsGrouped) {
  if (SUGGESTIONS_CACHE.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = SUGGESTIONS_CACHE.keys().next().value;
    if (oldestKey) SUGGESTIONS_CACHE.delete(oldestKey);
  }
  SUGGESTIONS_CACHE.set(key, data);
}

export function SearchProvider({ children }: { children: ReactNode }) {
  const router = useRouter();

  const [activeMode, setActiveModeState] = useState<SearchDiscoveryMode>('PROJECTS');
  const [query, setQueryState] = useState('');
  const [selectedBhk, setSelectedBhk] = useState('');
  const [selectedBudgetIndex, setSelectedBudgetIndex] = useState(0);

  const [suggestions, setSuggestions] = useState<SuggestionsGrouped>({
    projects: [],
    locations: [],
    developers: [],
    resales: [],
    rentals: [],
  });
  const [loading, setLoading] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isMobileSheetOpen, setIsMobileSheetOpen] = useState(false);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [isStickyVisible, setIsStickyVisible] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  const abortControllerRef = useRef<AbortController | null>(null);
  const currentBudgetOptions = activeMode === 'RENT' ? RENT_BUDGET_OPTIONS : BUY_BUDGET_OPTIONS;

  const openSearchModal = useCallback((initialMode?: SearchDiscoveryMode) => {
    if (initialMode) {
      setActiveModeState(initialMode);
      setSelectedBudgetIndex(0);
    }
    setIsDropdownOpen(false);
    setIsMobileSheetOpen(false);
    setIsSearchModalOpen(true);
  }, []);

  const closeSearchModal = useCallback(() => {
    setIsSearchModalOpen(false);
    setHighlightedIndex(-1);
  }, []);

  // Correction 1: Global keyboard shortcuts (Ctrl+K, Cmd+K, and '/' when not inside editable fields)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isEditable =
        activeEl &&
        (activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          activeEl.tagName === 'SELECT' ||
          (activeEl as HTMLElement).isContentEditable);

      // Ctrl+K (Windows/Linux) or Cmd+K (macOS)
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setIsSearchModalOpen((prev) => !prev);
        return;
      }

      // '/' only when focus is NOT inside an editable control
      if (e.key === '/' && !isEditable && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setIsSearchModalOpen(true);
        return;
      }

      // Escape key closes search modal if open
      if (e.key === 'Escape' && isSearchModalOpen) {
        e.preventDefault();
        closeSearchModal();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSearchModalOpen, closeSearchModal]);

  // Load recent searches from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('gh_recent_searches');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setRecentSearches(parsed.slice(0, 5));
        }
      }
    } catch {}
  }, []);

  const setActiveMode = useCallback((mode: SearchDiscoveryMode) => {
    setActiveModeState(mode);
    setSelectedBudgetIndex(0); // reset budget scale on mode change
    setHighlightedIndex(-1);
  }, []);

  const setQuery = useCallback((q: string) => {
    setQueryState(q);
    setHighlightedIndex(-1);
  }, []);

  const deleteRecentSearch = useCallback((term: string) => {
    setRecentSearches((prev) => {
      const updated = prev.filter((s) => s !== term);
      try {
        localStorage.setItem('gh_recent_searches', JSON.stringify(updated));
      } catch {}
      return updated;
    });
  }, []);

  const clearAllRecentSearches = useCallback(() => {
    setRecentSearches([]);
    try {
      localStorage.removeItem('gh_recent_searches');
    } catch {}
  }, []);

  // Compute active ordered suggestions list for keyboard navigation and screen readers
  const activeSuggestionsList: SuggestionItem[] = React.useMemo(() => {
    const list: SuggestionItem[] = [];
    if (activeMode === 'PROJECTS' && suggestions.projects?.length) {
      list.push(...suggestions.projects);
    }
    if (activeMode === 'BUY' && suggestions.resales?.length) {
      list.push(...suggestions.resales);
    }
    if (activeMode === 'RENT' && suggestions.rentals?.length) {
      list.push(...suggestions.rentals);
    }
    if (suggestions.locations?.length) {
      list.push(...suggestions.locations);
    }
    if (activeMode === 'PROJECTS' && suggestions.developers?.length) {
      list.push(...suggestions.developers);
    }
    return list;
  }, [activeMode, suggestions]);

  // Autocomplete fetch with AbortController and bounded client cache
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed || trimmed.length < 2) {
      setSuggestions({ projects: [], locations: [], developers: [], resales: [], rentals: [] });
      setLoading(false);
      setHighlightedIndex(-1);
      return;
    }

    const cacheKey = `${trimmed.toLowerCase()}|${activeMode}`;
    if (SUGGESTIONS_CACHE.has(cacheKey)) {
      setSuggestions(SUGGESTIONS_CACHE.get(cacheKey)!);
      setLoading(false);
      return;
    }

    // Cancel previous in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/search/suggestions?q=${encodeURIComponent(trimmed)}&mode=${encodeURIComponent(activeMode)}`,
          { signal: controller.signal }
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (data.success && data.suggestions) {
          setSuggestions(data.suggestions);
          setCachedSuggestions(cacheKey, data.suggestions);
        }
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.error('Failed to fetch search suggestions:', err);
        }
      } finally {
        if (abortControllerRef.current === controller) {
          setLoading(false);
        }
      }
    }, 250);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, activeMode]);

  const executeSearch = useCallback((overrideQuery?: string) => {
    const searchTerm = (overrideQuery !== undefined ? overrideQuery : query).trim();

    if (searchTerm) {
      setRecentSearches((prev) => {
        const updated = [searchTerm, ...prev.filter((s) => s.toLowerCase() !== searchTerm.toLowerCase())].slice(0, 5);
        try {
          localStorage.setItem('gh_recent_searches', JSON.stringify(updated));
        } catch {}
        return updated;
      });
    }

    setIsDropdownOpen(false);
    setIsMobileSheetOpen(false);
    setIsSearchModalOpen(false);
    setHighlightedIndex(-1);

    const params = new URLSearchParams();
    if (searchTerm) {
      params.append('q', searchTerm);
    }
    if (selectedBhk) {
      params.append('bhk', selectedBhk);
    }
    const budget = currentBudgetOptions[selectedBudgetIndex];
    if (budget?.min) {
      params.append('minPrice', budget.min);
    }
    if (budget?.max) {
      params.append('maxPrice', budget.max);
    }

    let basePath = '/projects';
    if (activeMode === 'BUY') {
      basePath = '/buy';
      params.append('inventoryType', 'RESALE');
    } else if (activeMode === 'RENT') {
      basePath = '/rent';
    }

    const queryString = params.toString();
    router.push(queryString ? `${basePath}?${queryString}` : basePath);
  }, [query, selectedBhk, selectedBudgetIndex, currentBudgetOptions, activeMode, router]);

  const selectSuggestion = useCallback((item: SuggestionItem) => {
    setIsDropdownOpen(false);
    setIsMobileSheetOpen(false);
    setIsSearchModalOpen(false);
    setHighlightedIndex(-1);

    // Save recent search on suggestion select
    const title = item.title;
    if (title) {
      setRecentSearches((prev) => {
        const updated = [title, ...prev.filter((s) => s.toLowerCase() !== title.toLowerCase())].slice(0, 5);
        try {
          localStorage.setItem('gh_recent_searches', JSON.stringify(updated));
        } catch {}
        return updated;
      });
    }

    if (item.type === 'LOCATION' && item.slug) {
      if (activeMode === 'BUY') {
        router.push(`/buy?inventoryType=RESALE&location=${encodeURIComponent(item.slug)}`);
        return;
      }
      if (activeMode === 'RENT') {
        router.push(`/rent?location=${encodeURIComponent(item.slug)}`);
        return;
      }
    }

    router.push(item.url);
  }, [activeMode, router]);


  return (
    <SearchContext.Provider
      value={{
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
        isMobileSheetOpen,
        setIsMobileSheetOpen,
        isSearchModalOpen,
        setIsSearchModalOpen,
        openSearchModal,
        closeSearchModal,
        isStickyVisible,
        setIsStickyVisible,
        recentSearches,
        deleteRecentSearch,
        clearAllRecentSearches,
        executeSearch,
        selectSuggestion,
      }}
    >
      {children}
    </SearchContext.Provider>
  );
}

export function useSearch(): SearchContextValue {
  const context = useContext(SearchContext);
  if (!context) {
    throw new Error('useSearch must be used within a SearchProvider');
  }
  return context;
}

export function HighlightMatch({ text, query }: { text?: string; query?: string }) {
  if (!text) return null;
  if (!query || !query.trim()) return <>{text}</>;
  const trimmed = query.trim();
  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === trimmed.toLowerCase() ? (
          <span key={i} className="text-[#E85D3F] font-bold">
            {part}
          </span>
        ) : (
          part
        )
      )}
    </>
  );
}
