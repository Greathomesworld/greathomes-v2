'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { PublicResaleListingDto } from '@/src/domain/projects/dto/resaleDto';
import Link from 'next/link';
import { CheckCircle, ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatIndianPrice, formatArea, formatFurnishing, formatFloorCategory, formatPropertyType } from '@/src/components/discovery/formatters';
import { ListingImage } from '@/src/components/discovery/ListingImage';
import { getEligibleResaleListings } from '@/src/domain/projects/viewModels/projectSectionEligibility';
import { PROJECT_CAROUSEL_MAX_ITEMS } from '@/src/domain/projects/viewModels/projectInventoryViewModel';

export { getEligibleResaleListings };

interface ResaleSectionProps {
  listings: PublicResaleListingDto[];
  projectSlug: string;
  projectId?: string;
  projectName?: string;
  totalCount?: number;
}

export function ResaleSection({
  listings,
  projectSlug,
  projectId,
  projectName,
  totalCount,
}: ResaleSectionProps) {
  const eligibleListings = getEligibleResaleListings(listings, projectId);
  if (eligibleListings.length === 0) return null;

  const carouselListings = eligibleListings.slice(0, PROJECT_CAROUSEL_MAX_ITEMS);
  const displayTotalCount = typeof totalCount === 'number' && totalCount > 0 ? totalCount : eligibleListings.length;
  const viewAllHref = `/projects/${projectSlug}/resale`;

  return (
    <ResaleCarouselInner
      carouselListings={carouselListings}
      displayTotalCount={displayTotalCount}
      projectSlug={projectSlug}
      projectName={projectName}
      viewAllHref={viewAllHref}
    />
  );
}

function ResaleCarouselInner({
  carouselListings,
  displayTotalCount,
  projectSlug,
  projectName,
  viewAllHref,
}: {
  carouselListings: PublicResaleListingDto[];
  displayTotalCount: number;
  projectSlug: string;
  projectName?: string;
  viewAllHref: string;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);

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

    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateScrollState) : null;
    observer?.observe(el);
    window.addEventListener('resize', updateScrollState);

    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', updateScrollState);
    };
  }, [updateScrollState, carouselListings.length]);

  const scrollByStep = (direction: 'prev' | 'next') => {
    const el = scrollRef.current;
    if (!el) return;
    const firstCard = el.querySelector<HTMLElement>('[data-carousel-card="true"]');
    const step = firstCard ? firstCard.offsetWidth + 24 : el.clientWidth * 0.85;
    el.scrollBy({
      left: direction === 'next' ? step : -step,
      behavior: 'smooth',
    });
  };

  const showCarouselControls = canScrollPrev || canScrollNext;
  const isSingleCard = carouselListings.length === 1;

  return (
    <section id="resale" aria-labelledby="resale-heading" className="space-y-6 pt-10 border-t border-[var(--color-border)]">
      {/* Editorial Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="text-xs uppercase font-display font-semibold tracking-wider text-[var(--color-accent)] mb-1">
            Resale Homes
          </div>
          <h2 id="resale-heading" className="text-2xl md:text-3xl font-display font-semibold text-[var(--color-foreground)]">
            Resale Homes ({displayTotalCount})
          </h2>
          <p className="text-xs font-body text-[var(--color-foreground)]/65 mt-1">
            Verified resale properties currently available in {projectName || 'this project'}.
          </p>
        </div>

        <div className="flex items-center gap-3 self-start sm:self-auto">
          {showCarouselControls && (
            <div className="flex items-center gap-1.5" role="group" aria-label="Resale listings carousel navigation">
              <button
                type="button"
                onClick={() => scrollByStep('prev')}
                disabled={!canScrollPrev}
                aria-label="Previous resale homes"
                className="w-9 h-9 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] flex items-center justify-center text-[var(--color-foreground)] hover:border-[var(--color-foreground)]/40 disabled:opacity-35 disabled:pointer-events-none transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => scrollByStep('next')}
                disabled={!canScrollNext}
                aria-label="Next resale homes"
                className="w-9 h-9 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] flex items-center justify-center text-[var(--color-foreground)] hover:border-[var(--color-foreground)]/40 disabled:opacity-35 disabled:pointer-events-none transition-colors cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}

          <Link
            href={viewAllHref}
            className="inline-flex items-center gap-1.5 text-xs font-display font-semibold text-[var(--color-foreground)] hover:text-[var(--color-accent)] transition-colors py-2 px-3.5 rounded-lg border border-[var(--color-border)] hover:border-[var(--color-accent)] bg-[var(--color-background)]"
          >
            <span>View All Resale ({displayTotalCount})</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {/* Responsive Horizontal Carousel (3 desktop, 2 tablet, 1 mobile) */}
      <div
        ref={scrollRef}
        onScroll={updateScrollState}
        className="flex gap-6 overflow-x-auto snap-x snap-mandatory scroll-smooth pb-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      >
        {carouselListings.map(listing => {
          const featuredMedia = listing.media?.find(m => m.isFeatured) || listing.media?.[0];
          const imageUrl = featuredMedia?.url;
          const areaSummary = formatArea(listing.carpetArea);
          const floorSummary = formatFloorCategory(listing.floorCategory);
          const furnishSummary = formatFurnishing(listing.furnishing);
          const possessionLabel = listing.possession === 'READY' ? 'Ready' : listing.possession.replace(/_/g, ' ');
          const targetUrl = listing.slug ? `/buy/${listing.slug}` : `/projects/${projectSlug}/resale`;

          return (
            <Link
              key={listing.id}
              id={`resale-${listing.id}`}
              data-carousel-card="true"
              href={targetUrl}
              aria-label={`${listing.configuration} Resale Home in ${projectName || projectSlug}`}
              className={`snap-start shrink-0 ${
                isSingleCard ? 'w-full' : 'w-[86%] sm:w-[80%]'
              } md:w-[calc((100%-1.5rem)/2)] lg:w-[calc((100%-3rem)/3)] group flex flex-col bg-[var(--color-background)] border border-[var(--color-border)] rounded-xl overflow-hidden hover:border-[var(--color-foreground)]/30 hover:shadow-md transition-all duration-200 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-[#111111] focus-visible:ring-offset-2`}
            >
              <article className="flex flex-col flex-grow justify-between h-full">
                <div>
                  {/* Media Header (Unchanged original aspect-[16/10]) */}
                  <div className="relative aspect-[16/10] bg-neutral-100 overflow-hidden">
                    <ListingImage
                      src={imageUrl}
                      alt={listing.configuration}
                      fallbackType="resale"
                      isVerified={listing.isVerified}
                    />

                    {/* Top Badges */}
                    <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 items-center z-10 pointer-events-none">
                      <span className="bg-white/95 text-[#111111] border border-[rgba(17,17,17,0.12)] text-[11px] font-display font-semibold tracking-wider uppercase px-2.5 py-1 rounded-md shadow-xs backdrop-blur-xs">
                        RESALE
                      </span>
                    </div>

                    <div className="absolute top-3 right-3 flex flex-wrap gap-1.5 items-center z-10 pointer-events-none">
                      {listing.isVerified && (
                        <span className="bg-[#218C5A] text-white text-[11px] font-display font-medium px-2 py-1 rounded-md flex items-center gap-1 shadow-xs">
                          <CheckCircle className="w-3 h-3" />
                          Verified
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Compact Body Content Below Image */}
                  <div className="px-4 pt-3 pb-2 space-y-2.5">
                    <div className="flex items-start justify-between gap-2.5">
                      <div className="min-w-0 flex-1">
                        <h3 className="font-display font-semibold text-base text-[var(--color-foreground)] group-hover:text-[var(--color-accent)] transition-colors line-clamp-1 leading-snug">
                          {listing.configuration}
                        </h3>
                        <div className="text-xs font-body text-[var(--color-foreground)]/60 mt-0.5 leading-tight">
                          {listing.bedroomCount} BHK · {formatPropertyType(listing.propertyType)}
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-[10px] font-display uppercase tracking-wider text-[var(--color-foreground)]/50 block leading-none">
                          Asking Price
                        </span>
                        <div className="text-lg sm:text-xl font-display font-bold text-[var(--color-foreground)] leading-tight mt-0.5">
                          {formatIndianPrice(listing.askingPrice)}
                        </div>
                      </div>
                    </div>

                    {/* Property Highlights */}
                    <div className="py-2 px-2.5 bg-[var(--color-foreground)]/[0.02] rounded-lg border border-[var(--color-border)] text-xs font-body text-[var(--color-foreground)]/75 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[var(--color-foreground)]/60">Area & Furnishing:</span>
                        <span className="font-medium text-[var(--color-foreground)]">
                          {[areaSummary, furnishSummary].filter(Boolean).join(' · ')}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[var(--color-foreground)]/60">Floor & Status:</span>
                        <span className="font-medium text-[var(--color-foreground)]">
                          {[floorSummary, possessionLabel].filter(Boolean).join(' · ')}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Footer with Listing Party & CTA */}
                <div className="px-4 pb-3.5 pt-0">
                  <div className="pt-2 border-t border-[var(--color-border)] flex items-center justify-between text-xs">
                    <span className="text-[11px] font-body font-medium text-[var(--color-foreground)]/65">
                      {listing.listingParty.label}
                    </span>

                    <span className="inline-flex items-center gap-1.5 text-xs font-display font-semibold text-[var(--color-foreground)] group-hover:text-[var(--color-accent)] transition-colors h-8 px-3 rounded-lg border border-[var(--color-border)] group-hover:border-[var(--color-accent)]">
                      <span>View Property</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </div>
              </article>
            </Link>
          );
        })}
      </div>

      {/* Footer View All Banner when more than 3 listings exist */}
      {displayTotalCount > 3 && (
        <div className="pt-2 flex justify-end">
          <Link
            href={viewAllHref}
            className="inline-flex items-center gap-2 text-xs font-display font-semibold text-[var(--color-foreground)]/80 hover:text-[var(--color-accent)] transition-colors"
          >
            <span>Explore all {displayTotalCount} resale apartments in {projectName || 'this project'}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      )}
    </section>
  );
}

