'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  ProjectDiscoveryCardDto,
  PropertyDiscoveryCardDto,
  RentDiscoveryCardDto,
} from '@/src/domain/projects/dto/discoveryDto';
import { PropertyCard } from '@/src/components/discovery/PropertyCard';

export type CarouselCardItem =
  | ProjectDiscoveryCardDto
  | PropertyDiscoveryCardDto
  | RentDiscoveryCardDto;

export interface ProjectHorizontalCarouselProps {
  items: CarouselCardItem[];
  ariaLabel: string;
  cardIdPrefix?: string;
}

export function ProjectHorizontalCarousel({
  items,
  ariaLabel,
  cardIdPrefix = 'carousel-card',
}: ProjectHorizontalCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(items.length > 1);

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanScrollPrev(scrollLeft > 4);
    setCanScrollNext(scrollLeft + clientWidth < scrollWidth - 4);
  }, []);

  useEffect(() => {
    updateScrollState();
    const el = scrollRef.current;
    if (!el) return;

    el.addEventListener('scroll', updateScrollState, { passive: true });
    window.addEventListener('resize', updateScrollState);

    return () => {
      el.removeEventListener('scroll', updateScrollState);
      window.removeEventListener('resize', updateScrollState);
    };
  }, [items.length, updateScrollState]);

  const handleScroll = (direction: 'prev' | 'next') => {
    const el = scrollRef.current;
    if (!el) return;
    const step = Math.max(280, Math.round(el.clientWidth * 0.82));
    el.scrollBy({
      left: direction === 'next' ? step : -step,
      behavior: 'smooth',
    });
  };

  if (!items || items.length === 0) return null;

  return (
    <div className="relative group/carousel" role="region" aria-label={ariaLabel}>
      {/* Desktop/Tablet Prev/Next Controls when overflow exists */}
      {items.length > 1 && (
        <div className="flex items-center justify-end gap-2 mb-3">
          <button
            type="button"
            onClick={() => handleScroll('prev')}
            disabled={!canScrollPrev}
            aria-label={`Previous items in ${ariaLabel}`}
            className="w-9 h-9 rounded-lg border border-[var(--color-border)] bg-white text-[var(--color-foreground)] hover:border-[#E85D3F] hover:text-[#E85D3F] disabled:opacity-35 disabled:pointer-events-none flex items-center justify-center transition-colors shadow-2xs focus:outline-hidden focus-visible:ring-2 focus-visible:ring-[#E85D3F]"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => handleScroll('next')}
            disabled={!canScrollNext}
            aria-label={`Next items in ${ariaLabel}`}
            className="w-9 h-9 rounded-lg border border-[var(--color-border)] bg-white text-[var(--color-foreground)] hover:border-[#E85D3F] hover:text-[#E85D3F] disabled:opacity-35 disabled:pointer-events-none flex items-center justify-center transition-colors shadow-2xs focus:outline-hidden focus-visible:ring-2 focus-visible:ring-[#E85D3F]"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Horizontal Track */}
      <div
        ref={scrollRef}
        className="flex gap-4 sm:gap-5 overflow-x-auto snap-x snap-mandatory scroll-smooth no-scrollbar pb-2 -mx-1 px-1"
      >
        {items.map((item) => (
          <div
            key={`${item.type}-${item.id}`}
            className="snap-start shrink-0 w-[85%] min-[480px]:w-[72%] sm:w-[calc(50%-10px)] lg:w-[calc(33.333%-14px)] flex flex-col"
          >
            <PropertyCard item={item} id={`${cardIdPrefix}-${item.id}`} />
          </div>
        ))}
      </div>
    </div>
  );
}
