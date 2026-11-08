'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, ChevronLeft, ChevronRight, ShieldCheck, MapPin, Building2 } from 'lucide-react';
import { SaveButton } from '../customer/SaveButton';
import { HomeListingCardData } from './HomeResaleSection';

interface HomeRentalSectionProps {
  listings: HomeListingCardData[];
}

export function HomeRentalSection({ listings = [] }: HomeRentalSectionProps) {
  const [currentPage, setCurrentPage] = useState(0);
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});

  const pageSize = 4;
  const totalPages = Math.max(1, Math.ceil(listings.length / pageSize));
  const safePage = Math.min(currentPage, totalPages - 1);
  const visibleListings = listings.slice(safePage * pageSize, (safePage + 1) * pageSize);

  return (
    <section 
      aria-labelledby="rental-homes-heading"
      className="py-16 md:py-20 bg-[#F8F9FA] border-b border-[rgba(17,17,17,0.08)]"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
          <div>
            <div className="flex items-center gap-2.5 mb-2">
              <span className="text-xs uppercase tracking-widest text-[#E85D3F] font-bold font-display">
                FIND A HOME TO RENT
              </span>
              <span className="w-8 h-0.5 bg-[#E85D3F] inline-block rounded-full" aria-hidden="true" />
            </div>

            <h2 
              id="rental-homes-heading"
              className="text-3xl sm:text-4xl font-display font-extrabold text-[#111111] tracking-tight mt-1"
            >
              Rental Homes in <span className="text-[#E85D3F]">Kolkata</span>
            </h2>

            <p className="text-sm sm:text-base text-neutral-600 font-body mt-2 max-w-2xl">
              Explore verified rental properties in prime locations across Kolkata.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {listings.length > pageSize && (
              <div className="flex items-center gap-1.5" aria-label="Carousel navigation">
                <button
                  type="button"
                  onClick={() => setCurrentPage((prev) => Math.max(0, prev - 1))}
                  disabled={safePage === 0}
                  className="w-9 h-9 rounded-full border border-neutral-200/80 bg-white hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center text-neutral-600 transition-colors shadow-2xs cursor-pointer"
                  aria-label="Previous rental homes"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentPage((prev) => Math.min(totalPages - 1, prev + 1))}
                  disabled={safePage >= totalPages - 1}
                  className="w-9 h-9 rounded-full border border-neutral-200/80 bg-white hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center text-neutral-600 transition-colors shadow-2xs cursor-pointer"
                  aria-label="Next rental homes"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}

            <Link
              href="/rent"
              className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold text-[#E85D3F] hover:bg-[#FFF5EE] font-display transition-colors py-2 px-4 rounded-lg border border-[rgba(232,93,63,0.35)] group bg-white"
            >
              <span>View All Rental Homes</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" aria-hidden="true" />
            </Link>
          </div>
        </div>

        {/* Four-Column Grid */}
        {listings.length === 0 ? (
          <div className="bg-white border border-neutral-200 rounded-xl p-12 text-center max-w-md mx-auto my-8">
            <p className="text-base font-display font-bold text-neutral-900">
              No rental listings currently available
            </p>
            <p className="text-xs text-neutral-500 font-body mt-1.5 mb-5">
              Curated rental apartments are continuously updated across prime Kolkata locations.
            </p>
            <Link
              href="/rent"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-[#111111] hover:bg-neutral-800 rounded-lg font-display transition-colors"
            >
              <span>Explore All Rentals</span>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {visibleListings.map((item) => {
              const showImage = Boolean(item.imageUrl) && !failedImages[item.id];
              return (
                <div
                  key={item.id}
                  className="group bg-white border border-[rgba(17,17,17,0.08)] rounded-xl overflow-hidden shadow-xs hover:shadow-xl hover:border-[rgba(17,17,17,0.18)] transition-all duration-300 flex flex-col justify-between"
                >
                  <div>
                    <div className="relative aspect-[16/11] bg-neutral-100 overflow-hidden">
                      {showImage ? (
                        <Image
                          src={item.imageUrl!}
                          alt={item.title}
                          fill
                          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                          className="object-cover group-hover:scale-104 transition-transform duration-500 ease-out"
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          onError={() =>
                            setFailedImages((prev) => ({ ...prev, [item.id]: true }))
                          }
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-neutral-400 bg-neutral-100">
                          <Building2 className="w-8 h-8 stroke-1 text-neutral-400 mb-1" aria-hidden="true" />
                          <span className="text-[11px] font-display text-neutral-500 uppercase tracking-wider">
                            Rental Residence
                          </span>
                        </div>
                      )}

                      {item.isVerified && (
                        <div className="absolute top-3 left-3 z-10 pointer-events-none">
                          <span className="px-2.5 py-1 rounded-full text-[11px] font-bold font-display bg-white/95 text-[#218C5A] border border-green-200/80 shadow-2xs flex items-center gap-1">
                            <ShieldCheck className="w-3 h-3 text-[#218C5A]" />
                            Verified
                          </span>
                        </div>
                      )}

                      <div className="absolute top-3 right-3 z-10">
                        <SaveButton resourceType="RENTAL_LISTING" resourceId={item.id} />
                      </div>
                    </div>

                    <div className="p-5">
                      <h3 className="text-base font-display font-bold text-[#111111] group-hover:text-[#E85D3F] transition-colors line-clamp-1 leading-snug mb-1">
                        <Link href={`/rent/${item.slug}`}>
                          {item.title}
                        </Link>
                      </h3>

                      {item.projectName && (
                        <p className="text-xs text-neutral-500 font-body mb-2 truncate">
                          {item.projectName}
                        </p>
                      )}

                      <p className="text-xs text-neutral-600 font-body flex items-center gap-1 mb-3.5 truncate">
                        <MapPin className="w-3.5 h-3.5 text-neutral-400 shrink-0" aria-hidden="true" />
                        <span>{item.locationName}, Kolkata</span>
                      </p>

                      <div className="flex flex-wrap items-center gap-1.5 mb-2">
                        <span className="px-2.5 py-1 rounded-md bg-[#FAFAF8] border border-[rgba(17,17,17,0.06)] text-[11px] font-medium text-neutral-700 font-body">
                          {item.bhk} BHK
                        </span>
                        {item.areaString && (
                          <span className="px-2.5 py-1 rounded-md bg-[#FAFAF8] border border-[rgba(17,17,17,0.06)] text-[11px] font-medium text-neutral-700 font-body">
                            {item.areaString}
                          </span>
                        )}
                        <span className="px-2.5 py-1 rounded-md bg-[#FAFAF8] border border-[rgba(17,17,17,0.06)] text-[11px] font-medium text-neutral-700 font-body">
                          {item.propertyType || 'Apartment'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="p-5 pt-0">
                    <div className="pt-3 border-t border-neutral-100 flex items-center justify-between">
                      <div>
                        <span className="text-base font-display font-extrabold text-[#111111] tracking-tight">
                          {item.priceDisplay}
                        </span>
                      </div>

                      <Link
                        href={`/rent/${item.slug}`}
                        aria-label={`View details for ${item.title}`}
                        className="w-8 h-8 rounded-full bg-[#FFF5EE] text-[#E85D3F] border border-[rgba(232,93,63,0.2)] flex items-center justify-center group-hover:bg-[#E85D3F] group-hover:text-white transition-all shadow-2xs"
                      >
                        <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
