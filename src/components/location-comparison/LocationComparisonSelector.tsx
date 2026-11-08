'use client';

import React, { useState } from 'react';
import { Plus, X, ArrowRight } from 'lucide-react';

interface AvailableLocationOption {
  slug: string;
  name: string;
  levelDisplay: string;
}

const AVAILABLE_CORRIDORS: AvailableLocationOption[] = [
  { slug: 'rajarhat', name: 'Rajarhat', levelDisplay: 'Area' },
  { slug: 'new-town', name: 'New Town', levelDisplay: 'Area' },
  { slug: 'salt-lake', name: 'Salt Lake', levelDisplay: 'Area' },
  { slug: 'em-bypass', name: 'EM Bypass', levelDisplay: 'Area' },
];

interface LocationComparisonSelectorProps {
  currentSlugs: string[];
  onAddLocation: (slug: string) => void;
  maxLocations?: number;
}

export function LocationComparisonSelector({
  currentSlugs,
  onAddLocation,
  maxLocations = 4,
}: LocationComparisonSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);

  const availableToAdd = AVAILABLE_CORRIDORS.filter(
    (loc) => !currentSlugs.includes(loc.slug)
  );

  const isAtMax = currentSlugs.length >= maxLocations;

  return (
    <div className="relative inline-block">
      <button
        type="button"
        disabled={isAtMax || availableToAdd.length === 0}
        onClick={() => setIsOpen((prev) => !prev)}
        className={`inline-flex items-center gap-1.5 text-xs font-display font-medium py-2.5 px-4 rounded border transition-colors touch-manipulation min-h-[44px] ${
          isAtMax || availableToAdd.length === 0
            ? 'border-stone-200 dark:border-stone-800 text-stone-400 cursor-not-allowed bg-stone-100/50 dark:bg-stone-900/50'
            : 'border-stone-300 dark:border-stone-700 text-[#111111] dark:text-stone-100 bg-white dark:bg-stone-900 hover:border-[#111111] dark:hover:border-stone-100 shadow-xs'
        }`}
        aria-expanded={isOpen}
        aria-haspopup="true"
        aria-label="Add location to comparison"
      >
        <Plus className="w-3.5 h-3.5" />
        <span>{isAtMax ? 'Max 4 Corridors' : 'Add Location to Compare'}</span>
      </button>

      {isOpen && !isAtMax && availableToAdd.length > 0 && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />
          <div
            role="menu"
            aria-orientation="vertical"
            className="absolute left-0 mt-2 w-64 rounded-md shadow-lg bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 z-50 py-1"
          >
            <div className="px-3 py-2 text-[11px] font-mono uppercase tracking-wider text-stone-400 dark:text-stone-500 border-b border-stone-100 dark:border-stone-800">
              Select Corridor to Add
            </div>
            {availableToAdd.map((loc) => (
              <button
                key={loc.slug}
                type="button"
                role="menuitem"
                onClick={() => {
                  onAddLocation(loc.slug);
                  setIsOpen(false);
                }}
                className="w-full text-left px-3 py-2.5 text-xs font-body hover:bg-stone-50 dark:hover:bg-stone-800 flex items-center justify-between transition-colors min-h-[44px]"
              >
                <div>
                  <span className="font-medium text-[#111111] dark:text-stone-100 block">
                    {loc.name}
                  </span>
                  <span className="text-[10px] text-stone-400 font-mono">
                    {loc.levelDisplay}
                  </span>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-stone-400" />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
