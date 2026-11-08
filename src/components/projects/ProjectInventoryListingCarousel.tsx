'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { PublicResaleListingDto } from '@/src/domain/projects/dto/resaleDto';
import { PublicRentalListingDto } from '@/src/domain/projects/dto/rentalDto';
import { ProjectInventoryListingCard } from './ProjectInventoryListingCard';

export interface ProjectInventoryListingCarouselProps {
  listings: (PublicResaleListingDto | PublicRentalListingDto)[];
  mode: 'RESALE' | 'RENTAL';
  projectName: string;
  projectSlug: string;
  locationName?: string | null;
  ariaLabel: string;
}

export function ProjectInventoryListingCarousel({
  listings,
  mode,
  projectName,
  projectSlug,
  locationName,
  ariaLabel,
}: ProjectInventoryListingCarouselProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(listings.length > 1);

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const maxScrollLeft = el.scrollWidth - el.clientWidth;
    setCanScrollPrev(el.scrollLeft > 4);
    setCanScrollNext(maxScrollLeft - el.scrollLeft > 4);
  }, []);

  useEffect(() => {
    updateScrollState();
    const el = scrollRef.current;
    if (!el) return;

    const observer =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateScrollState) : null;
    observer?.observe(el);
    el.addEventListener('scroll', updateScrollState, { passive: true });
    window.addEventListener('resize', updateScrollState);

    return () => {
      observer?.disconnect();
      el.removeEventListener('scroll', updateScrollState);
      window.removeEventListener('resize', updateScrollState);
    };
  }, [listings.length, updateScrollState]);

  const scrollByStep = (direction: 'prev' | 'next') => {
    const el = scrollRef.current;
    if (!el) return;
    const firstCard = el.querySelector<HTMLElement>('[data-inventory-carousel-card="true"]');
    const step = firstCard ? firstCard.offsetWidth + 24 : Math.round(el.clientWidth * 0.85);
    el.scrollBy({
      left: direction === 'next' ? step : -step,
      behavior: 'smooth',
    });
  };

  if (!listings || listings.length === 0) return null;

  const isSingleCard = listings.length === 1;
  const showControls = listings.length > 1;

  return (
    <div className="relative space-y-3" role="region" aria-label={ariaLabel}>
      {/* Accessible Carousel Navigation Controls */}
      {showControls && (
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => scrollByStep('prev')}
            disabled={!canScrollPrev}
            aria-label={`Previous ${mode === 'RENTAL' ? 'rental' : 'resale'} apartments`}
            className="w-9 h-9 rounded-lg border border-[var(--color-border)] bg-white text-[var(--color-foreground)] hover:border-[#E85D3F] hover:text-[#E85D3F] disabled:opacity-35 disabled:pointer-events-none flex items-center justify-center transition-colors shadow-2xs cursor-pointer focus:outline-hidden focus-visible:ring-2 focus-visible:ring-[#E85D3F]"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => scrollByStep('next')}
            disabled={!canScrollNext}
            aria-label={`Next ${mode === 'RENTAL' ? 'rental' : 'resale'} apartments`}
            className="w-9 h-9 rounded-lg border border-[var(--color-border)] bg-white text-[var(--color-foreground)] hover:border-[#E85D3F] hover:text-[#E85D3F] disabled:opacity-35 disabled:pointer-events-none flex items-center justify-center transition-colors shadow-2xs cursor-pointer focus:outline-hidden focus-visible:ring-2 focus-visible:ring-[#E85D3F]"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Responsive Horizontal Carousel Track:
          - Desktop (lg): 3 cards per slide (calc((100% - 3rem) / 3))
          - Tablet (md): 2 cards per slide (calc((100% - 1.5rem) / 2))
          - Mobile (< md): 1 complete card + partial preview of next card (86% / 80%) */}
      <div
        ref={scrollRef}
        className="flex items-stretch gap-6 overflow-x-auto snap-x snap-mandatory scroll-smooth pb-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      >
        {listings.map((item) => (
          <div
            key={item.id}
            data-inventory-carousel-card="true"
            className={`snap-start shrink-0 flex flex-col ${
              isSingleCard ? 'w-full md:w-[calc((100%-1.5rem)/2)] lg:w-[calc((100%-3rem)/3)]' : 'w-[86%] sm:w-[78%] md:w-[calc((100%-1.5rem)/2)] lg:w-[calc((100%-3rem)/3)]'
            }`}
          >
            <ProjectInventoryListingCard
              listing={item}
              mode={mode}
              projectName={projectName}
              projectSlug={projectSlug}
              locationName={locationName}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
