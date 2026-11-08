'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';

export interface HomeLocationCardData {
  id: string;
  name: string;
  slug: string;
  type: string;
  description?: string;
  projectCount?: number;
  imageUrl?: string;
}

interface HomeLocationSectionProps {
  locations: HomeLocationCardData[];
}

const EXCLUDED_LOCATION_TYPES = new Set(['STATE', 'CITY', 'DISTRICT']);

export function HomeLocationSection({ locations = [] }: HomeLocationSectionProps) {
  const [currentPage, setCurrentPage] = useState(0);

  const fallbackImages = [
    'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1590381105924-c72589b9ef3f?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1576013551627-0cc20b96c2a7?auto=format&fit=crop&w=800&q=80',
  ];

  const validLocations = locations.filter(
    (l) => !EXCLUDED_LOCATION_TYPES.has((l.type || '').toUpperCase()) && (l.projectCount ?? 0) > 0
  );

  const pageSize = 4;
  const totalPages = Math.max(1, Math.ceil(validLocations.length / pageSize));
  const safePage = Math.min(currentPage, totalPages - 1);
  const displayLocations = validLocations.slice(safePage * pageSize, (safePage + 1) * pageSize);

  return (
    <section 
      aria-labelledby="residential-locations-heading"
      className="py-16 md:py-20 bg-white border-b border-[rgba(17,17,17,0.08)]"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
          <div>
            <div className="flex items-center gap-2.5 mb-2">
              <span className="text-xs uppercase tracking-widest text-[#E85D3F] font-bold font-display">
                EXPLORE BY LOCATION
              </span>
              <span className="w-8 h-0.5 bg-[#E85D3F] inline-block rounded-full" aria-hidden="true" />
            </div>

            <h2 
              id="residential-locations-heading"
              className="text-3xl sm:text-4xl font-display font-extrabold text-[#111111] tracking-tight mt-1"
            >
              Popular Residential Locations in <span className="text-[#E85D3F]">Kolkata</span>
            </h2>

            <p className="text-sm sm:text-base text-neutral-600 font-body mt-2 max-w-2xl">
              Discover residential projects, resale homes and rental opportunities across Kolkata in the city’s most sought-after neighbourhoods.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {validLocations.length > pageSize && (
              <div className="flex items-center gap-1.5" aria-label="Carousel navigation">
                <button
                  type="button"
                  onClick={() => setCurrentPage((prev) => Math.max(0, prev - 1))}
                  disabled={safePage === 0}
                  className="w-9 h-9 rounded-full border border-neutral-200/80 bg-white hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center text-neutral-600 transition-colors shadow-2xs cursor-pointer"
                  aria-label="Previous locations"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentPage((prev) => Math.min(totalPages - 1, prev + 1))}
                  disabled={safePage >= totalPages - 1}
                  className="w-9 h-9 rounded-full border border-neutral-200/80 bg-white hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center text-neutral-600 transition-colors shadow-2xs cursor-pointer"
                  aria-label="Next locations"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}

            <Link
              href="/locations"
              className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold text-[#E85D3F] hover:bg-[#FFF5EE] font-display transition-colors py-2 px-4 rounded-lg border border-[rgba(232,93,63,0.35)] group"
            >
              <span>View All Locations</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" aria-hidden="true" />
            </Link>
          </div>
        </div>

        {/* Four-Column Location Card Grid */}
        {displayLocations.length === 0 ? (
          <div className="bg-[#FAFAF8] border border-neutral-200 rounded-xl p-12 text-center max-w-md mx-auto my-8">
            <p className="text-base font-display font-bold text-neutral-900">
              No locations currently published
            </p>
            <p className="text-xs text-neutral-500 font-body mt-1.5 mb-5">
              Explore our master developments across Kolkata growth corridors.
            </p>
            <Link
              href="/projects"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-[#111111] hover:bg-neutral-800 rounded-lg font-display transition-colors"
            >
              <span>Explore Projects</span>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
            {displayLocations.map((loc, idx) => {
              const globalIdx = safePage * pageSize + idx;
              const bgImg = loc.imageUrl || fallbackImages[globalIdx % fallbackImages.length];
              const pCount = loc.projectCount || 0;
              const countLabel = pCount === 1 ? '1 Project' : `${pCount} Projects`;

              return (
                <Link
                  key={loc.id}
                  href={`/locations/${loc.slug}`}
                  className="group relative rounded-xl sm:rounded-2xl overflow-hidden aspect-[3/4] sm:aspect-[4/5] border border-[rgba(17,17,17,0.08)] shadow-2xs hover:shadow-xl transition-all duration-300 flex flex-col justify-end p-3.5 sm:p-6 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-[#111111]"
                >
                  {/* Background Image with Gradient */}
                  <div className="absolute inset-0 z-0">
                    <Image
                      src={bgImg}
                      alt={loc.name}
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                      className="object-cover group-hover:scale-106 transition-transform duration-700 ease-out"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />
                  </div>

                  {/* Content on Bottom */}
                  <div className="relative z-10 flex flex-col justify-between h-full">
                    <div className="flex justify-end">
                      <span className="px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-white text-[11px] font-display font-bold border border-white/20">
                        {countLabel}
                      </span>
                    </div>

                    <div>
                      <h3 className="text-base sm:text-xl font-display font-extrabold text-white group-hover:text-[#E85D3F] transition-colors mb-0.5 sm:mb-1">
                        {loc.name}
                      </h3>
                      <p className="text-[11px] sm:text-xs text-white/80 font-body line-clamp-1 sm:line-clamp-2 mb-2 sm:mb-4">
                        {loc.description || `Explore prime residential projects in ${loc.name}.`}
                      </p>

                      <div className="flex items-center gap-1 sm:gap-1.5 text-[11px] sm:text-xs font-bold text-white font-display group-hover:text-[#E85D3F] transition-colors">
                        <span>Explore Area</span>
                        <ArrowRight className="w-3 sm:w-3.5 h-3 sm:h-3.5 group-hover:translate-x-1 transition-transform" />
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
