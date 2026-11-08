'use client';

import React, { useRef } from 'react';
import { TypologyFilterItem } from './typologyModel';

interface ProjectTypologyFiltersProps {
  filters: TypologyFilterItem[];
  selectedKey: string;
  onSelect: (key: string) => void;
}

export function ProjectTypologyFilters({
  filters,
  selectedKey,
  onSelect,
}: ProjectTypologyFiltersProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // If there is only 'ALL' or no filters, no filter row needed
  if (filters.length <= 1) {
    return null;
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    let nextIndex: number | null = null;

    if (e.key === 'ArrowRight') {
      nextIndex = (currentIndex + 1) % filters.length;
    } else if (e.key === 'ArrowLeft') {
      nextIndex = (currentIndex - 1 + filters.length) % filters.length;
    } else if (e.key === 'Home') {
      nextIndex = 0;
    } else if (e.key === 'End') {
      nextIndex = filters.length - 1;
    }

    if (nextIndex !== null) {
      e.preventDefault();
      const nextFilter = filters[nextIndex];
      onSelect(nextFilter.key);

      // Focus the new tab
      const buttons = containerRef.current?.querySelectorAll<HTMLButtonElement>('button[role="tab"]');
      if (buttons && buttons[nextIndex]) {
        buttons[nextIndex].focus();
      }
    }
  };

  return (
    <div
      ref={containerRef}
      role="tablist"
      aria-label="Filter configurations by typology"
      className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar select-none"
    >
      {filters.map((filter, idx) => {
        const isSelected = selectedKey === filter.key;
        return (
          <button
            key={filter.key}
            type="button"
            role="tab"
            aria-selected={isSelected}
            aria-controls="configurations-grid"
            tabIndex={isSelected ? 0 : -1}
            onClick={() => onSelect(filter.key)}
            onKeyDown={(e) => handleKeyDown(e, idx)}
            className={`px-4 py-2 text-xs font-display font-semibold rounded-full transition-all whitespace-nowrap cursor-pointer focus:outline-hidden focus-visible:ring-2 focus-visible:ring-[#E85D3F] ${
              isSelected
                ? 'bg-[#E85D3F] text-white shadow-xs border border-[#E85D3F]'
                : 'bg-white text-[#111111]/80 hover:text-[#111111] hover:bg-black/[0.04] border border-[var(--color-border)]'
            }`}
          >
            <span>{filter.label}</span>
            <span
              className={`ml-1.5 text-[11px] tabular-nums ${
                isSelected ? 'text-white/90' : 'text-[#111111]/50'
              }`}
            >
              ({filter.count})
            </span>
          </button>
        );
      })}
    </div>
  );
}
