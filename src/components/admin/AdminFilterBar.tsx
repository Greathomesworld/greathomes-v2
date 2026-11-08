'use client';

import React from 'react';

export interface FilterOption {
  key: string;
  label: string;
  options: Array<{ label: string; value: string }>;
  value: string;
  onChange: (value: string) => void;
}

interface AdminFilterBarProps {
  filters: FilterOption[];
  onReset?: () => void;
}

export function AdminFilterBar({ filters, onReset }: AdminFilterBarProps) {
  const hasActiveFilters = filters.some(f => f.value && f.value !== 'ALL' && f.value !== '');

  return (
    <div className="flex flex-wrap items-center gap-3 py-2">
      {filters.map(filter => (
        <div key={filter.key} className="flex items-center gap-2">
          <label className="text-xs font-semibold text-neutral-600 font-display whitespace-nowrap">
            {filter.label}:
          </label>
          <select
            value={filter.value}
            onChange={e => filter.onChange(e.target.value)}
            className="px-3 py-1.5 text-xs bg-white border border-neutral-300 rounded-lg text-neutral-800 font-body focus:outline-hidden focus:ring-2 focus:ring-neutral-900 shadow-2xs cursor-pointer min-h-[38px]"
          >
            {filter.options.map(opt => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      ))}

      {hasActiveFilters && onReset && (
        <button
          onClick={onReset}
          className="text-xs font-semibold text-terracotta hover:underline ml-auto cursor-pointer min-h-[38px] px-2 py-1"
        >
          Reset Filters
        </button>
      )}
    </div>
  );
}
