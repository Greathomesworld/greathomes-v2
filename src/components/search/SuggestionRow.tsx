'use client';

import React from 'react';
import { Building, MapPin, Briefcase } from 'lucide-react';
import { SuggestionItem, HighlightMatch } from '@/src/context/SearchContext';

interface SuggestionRowProps {
  item: SuggestionItem;
  query: string;
  isHighlighted?: boolean;
  onSelect: (item: SuggestionItem) => void;
  idPrefix?: string;
}

export function SuggestionRow({
  item,
  query,
  isHighlighted = false,
  onSelect,
  idPrefix = 'suggestion',
}: SuggestionRowProps) {
  const getIcon = () => {
    switch (item.type) {
      case 'LOCATION':
        return (
          <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600 shrink-0">
            <MapPin className="w-4 h-4" />
          </div>
        );
      case 'DEVELOPER':
        return (
          <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0">
            <Briefcase className="w-4 h-4" />
          </div>
        );
      case 'PROJECT':
      case 'RESALE':
      case 'RENTAL':
      default:
        return (
          <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center text-[#E85D3F] shrink-0">
            <Building className="w-4 h-4" />
          </div>
        );
    }
  };

  const getSecondaryInfo = () => {
    if (item.priceDisplay) {
      return (
        <span className="text-xs sm:text-sm font-bold text-neutral-900 font-display whitespace-nowrap">
          {item.priceDisplay}
        </span>
      );
    }
    if (item.type === 'LOCATION') {
      return (
        <span className="text-[10px] sm:text-[11px] font-semibold text-neutral-400 font-display uppercase tracking-wider">
          Location
        </span>
      );
    }
    if (item.type === 'DEVELOPER') {
      return (
        <span className="text-[10px] sm:text-[11px] font-semibold text-neutral-400 font-display uppercase tracking-wider">
          Developer
        </span>
      );
    }
    return null;
  };

  return (
    <div
      id={`${idPrefix}-${item.id}`}
      role="option"
      aria-selected={isHighlighted}
      onClick={() => onSelect(item)}
      className={`w-full grid grid-cols-[36px_1fr_auto] items-center gap-3 px-3 py-2.5 rounded-xl transition-colors cursor-pointer group ${
        isHighlighted ? 'bg-orange-50/80 ring-1 ring-[#E85D3F]/40' : 'hover:bg-neutral-50'
      }`}
    >
      {/* Column 1 — Icon (Fixed 36px slot with 32x32px centered icon) */}
      <div className="w-9 flex items-center justify-start shrink-0">
        {getIcon()}
      </div>

      {/* Column 2 — Main Information (Flexible width, strictly aligned starting coordinate) */}
      <div className="min-w-0 flex flex-col justify-center">
        <div className="text-xs sm:text-sm font-semibold text-neutral-900 group-hover:text-[#E85D3F] transition-colors truncate font-display">
          <HighlightMatch text={item.title} query={query} />
        </div>
        {item.subtitle && (
          <div className="text-[11px] sm:text-xs text-neutral-500 truncate mt-0.5 font-body">
            <HighlightMatch text={item.subtitle} query={query} />
          </div>
        )}
      </div>

      {/* Column 3 — Price / Secondary Information (Right-aligned, vertically centered) */}
      <div className="text-right shrink-0 pl-2">
        {getSecondaryInfo()}
      </div>
    </div>
  );
}
