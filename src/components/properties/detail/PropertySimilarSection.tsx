'use client';

import React, { useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Building2,
  MapPin,
} from 'lucide-react';
import { PropertyDetailViewModel } from '@/src/domain/projects/viewModels/listingDetailViewModel';
import {
  ResaleDiscoveryCardDto,
  RentDiscoveryCardDto,
  ProjectDiscoveryCardDto,
} from '@/src/domain/projects/dto/discoveryDto';
import { formatIndianPrice, formatArea } from '@/src/components/discovery/formatters';
import { SaveButton } from '@/src/components/customer/SaveButton';

interface PropertySimilarSectionProps {
  listing: PropertyDetailViewModel;
  similarResale: ResaleDiscoveryCardDto[];
  similarRental: RentDiscoveryCardDto[];
  relatedProjects: ProjectDiscoveryCardDto[];
}

export function PropertySimilarSection({
  listing,
  similarResale,
  similarRental,
  relatedProjects,
}: PropertySimilarSectionProps) {
  const similarScrollRef = useRef<HTMLDivElement>(null);
  const projectsScrollRef = useRef<HTMLDivElement>(null);
  const [failedUrls, setFailedUrls] = useState<Record<string, boolean>>({});

  const markUrlFailed = useCallback((url?: string | null) => {
    if (!url) return;
    setFailedUrls(prev => ({ ...prev, [url]: true }));
  }, []);

  const isResale = listing.mode === 'RESALE';
  const similarItems = isResale ? similarResale : similarRental;
  const hasSimilar = similarItems.length > 0;
  const hasProject = Boolean(listing.project);
  const hasRelatedProjects = relatedProjects.length > 0;

  if (!hasSimilar && !hasProject && !hasRelatedProjects) {
    return null;
  }

  const scrollContainer = (
    ref: React.RefObject<HTMLDivElement | null>,
    direction: 'left' | 'right'
  ) => {
    if (!ref.current) return;
    const offset = direction === 'left' ? -280 : 280;
    ref.current.scrollBy({ left: offset, behavior: 'smooth' });
  };

  // Determine responsive grid columns based on how many panels are active
  const activePanelCount =
    (hasSimilar ? 1 : 0) + (hasProject ? 1 : 0) + (hasRelatedProjects ? 1 : 0);

  const gridClass =
    activePanelCount === 3
      ? 'grid-cols-1 lg:grid-cols-12'
      : activePanelCount === 2
      ? 'grid-cols-1 lg:grid-cols-2'
      : 'grid-cols-1';

  const projectSpotUrl = listing.project?.featuredImageUrl;
  const showProjectSpotImage = Boolean(projectSpotUrl && !failedUrls[projectSpotUrl]);

  return (
    <section id="similar-properties" className="scroll-mt-32 pt-2">
      <div className={`grid ${gridClass} gap-5 items-stretch`}>
        {/* PANEL 1: Similar Resale / Rental Properties */}
        {hasSimilar && (
          <div
            className={`${
              activePanelCount === 3 ? 'lg:col-span-4' : ''
            } bg-white rounded-2xl border border-[#E6E2DC] p-5 shadow-2xs flex flex-col justify-between relative`}
          >
            <div className="flex items-center justify-between gap-2 mb-4">
              <h2 className="text-base font-display font-bold text-[#111111]">
                {isResale ? 'Similar Resale Properties' : 'Similar Rental Properties'}
              </h2>
              <Link
                href={isResale ? '/buy' : '/rent'}
                className="inline-flex items-center gap-1 text-xs font-display font-semibold text-[#E85D3F] hover:text-[#D44C2F] transition-colors shrink-0"
              >
                <span>View All</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="relative flex-1 flex items-center">
              {similarItems.length > 2 && (
                <button
                  type="button"
                  onClick={() => scrollContainer(similarScrollRef, 'left')}
                  aria-label="Scroll similar properties left"
                  className="hidden sm:flex absolute -left-3 z-10 w-7 h-7 rounded-full bg-white border border-[#E6E2DC] shadow-sm items-center justify-center text-[#111111]/75 hover:text-[#111111] cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              )}

              <div
                ref={similarScrollRef}
                className="flex items-stretch gap-3 overflow-x-auto no-scrollbar w-full pb-1"
              >
                {isResale
                  ? similarResale.map(item => {
                      const href = `/buy/${item.slug || item.id}`;
                      const areaText = item.carpetArea ? formatArea(item.carpetArea) : null;
                      const subtitle =
                        item.project?.name || item.location?.name || 'Kolkata';
                      const hasValidImg = Boolean(
                        item.featuredImageUrl && !failedUrls[item.featuredImageUrl]
                      );

                      return (
                        <Link
                          key={item.id}
                          href={href}
                          className="min-w-[175px] max-w-[200px] flex-1 rounded-xl border border-[#E6E2DC] bg-[#FAFAF8] hover:bg-white hover:border-[#111111]/25 transition-all overflow-hidden flex flex-col justify-between group shrink-0"
                        >
                          <div className="relative h-28 w-full bg-gradient-to-br from-[#F5F2EB] via-[#EDE7DC] to-[#E4DEC9] border-b border-[#E6E2DC] overflow-hidden">
                            {hasValidImg ? (
                              <img
                                src={item.featuredImageUrl!}
                                alt={`${item.configuration} in ${subtitle}`}
                                referrerPolicy="no-referrer"
                                onError={() => markUrlFailed(item.featuredImageUrl)}
                                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                              />
                            ) : (
                              <div className="w-full h-full flex flex-col items-center justify-center text-center px-2 space-y-1">
                                <div className="w-8 h-8 rounded-lg bg-white/80 border border-[#DFD8CA] flex items-center justify-center text-[#E85D3F]">
                                  <Building2 className="w-4 h-4" />
                                </div>
                                <span className="text-[10px] font-display font-semibold text-[#111111]/65 truncate max-w-full">
                                  {item.bedroomCount} BHK Residence
                                </span>
                              </div>
                            )}
                            <div
                              className="absolute top-2 right-2 z-10"
                              onClick={e => e.preventDefault()}
                            >
                              <SaveButton
                                resourceType="RESALE_LISTING"
                                resourceId={item.id}
                                className="!p-1.5 !rounded-full !bg-white/90"
                              />
                            </div>
                          </div>

                          <div className="p-3 space-y-1">
                            <p className="text-xs font-display font-bold text-[#111111] truncate">
                              {item.bedroomCount} BHK
                              {areaText ? ` · ${areaText}` : ''}
                            </p>
                            <p className="text-sm font-display font-bold text-[#111111]">
                              {formatIndianPrice(item.askingPrice)}
                            </p>
                            <div className="flex items-center gap-1.5 text-[11px] font-body text-[#111111]/65 pt-0.5">
                              {item.verificationStatus === 'VERIFIED' && (
                                <span className="inline-flex items-center gap-0.5 text-[#218C5A] font-display font-semibold shrink-0">
                                  <CheckCircle2 className="w-3 h-3" />
                                  <span>Verified</span>
                                </span>
                              )}
                              <span className="truncate">{subtitle}</span>
                            </div>
                          </div>
                        </Link>
                      );
                    })
                  : similarRental.map(item => {
                      const href = `/rent/${item.slug || item.id}`;
                      const areaText = item.carpetArea ? formatArea(item.carpetArea) : null;
                      const subtitle =
                        item.project?.name || item.location?.name || 'Kolkata';
                      const hasValidImg = Boolean(
                        item.featuredImageUrl && !failedUrls[item.featuredImageUrl]
                      );

                      return (
                        <Link
                          key={item.id}
                          href={href}
                          className="min-w-[175px] max-w-[200px] flex-1 rounded-xl border border-[#E6E2DC] bg-[#FAFAF8] hover:bg-white hover:border-[#111111]/25 transition-all overflow-hidden flex flex-col justify-between group shrink-0"
                        >
                          <div className="relative h-28 w-full bg-gradient-to-br from-[#F5F2EB] via-[#EDE7DC] to-[#E4DEC9] border-b border-[#E6E2DC] overflow-hidden">
                            {hasValidImg ? (
                              <img
                                src={item.featuredImageUrl!}
                                alt={`${item.configuration} rental in ${subtitle}`}
                                referrerPolicy="no-referrer"
                                onError={() => markUrlFailed(item.featuredImageUrl)}
                                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                              />
                            ) : (
                              <div className="w-full h-full flex flex-col items-center justify-center text-center px-2 space-y-1">
                                <div className="w-8 h-8 rounded-lg bg-white/80 border border-[#DFD8CA] flex items-center justify-center text-[#218C5A]">
                                  <Building2 className="w-4 h-4" />
                                </div>
                                <span className="text-[10px] font-display font-semibold text-[#111111]/65 truncate max-w-full">
                                  {item.bedroomCount} BHK Rental
                                </span>
                              </div>
                            )}
                            <div
                              className="absolute top-2 right-2 z-10"
                              onClick={e => e.preventDefault()}
                            >
                              <SaveButton
                                resourceType="RENTAL_LISTING"
                                resourceId={item.id}
                                className="!p-1.5 !rounded-full !bg-white/90"
                              />
                            </div>
                          </div>

                          <div className="p-3 space-y-1">
                            <p className="text-xs font-display font-bold text-[#111111] truncate">
                              {item.bedroomCount} BHK
                              {areaText ? ` · ${areaText}` : ''}
                            </p>
                            <p className="text-sm font-display font-bold text-[#111111]">
                              {formatIndianPrice(item.monthlyRent)} / mo
                            </p>
                            <div className="flex items-center gap-1.5 text-[11px] font-body text-[#111111]/65 pt-0.5">
                              {item.verificationStatus === 'VERIFIED' && (
                                <span className="inline-flex items-center gap-0.5 text-[#218C5A] font-display font-semibold shrink-0">
                                  <CheckCircle2 className="w-3 h-3" />
                                  <span>Verified</span>
                                </span>
                              )}
                              <span className="truncate">{subtitle}</span>
                            </div>
                          </div>
                        </Link>
                      );
                    })}
              </div>

              {similarItems.length > 2 && (
                <button
                  type="button"
                  onClick={() => scrollContainer(similarScrollRef, 'right')}
                  aria-label="Scroll similar properties right"
                  className="hidden sm:flex absolute -right-3 z-10 w-7 h-7 rounded-full bg-white border border-[#E6E2DC] shadow-sm items-center justify-center text-[#111111]/75 hover:text-[#111111] cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* PANEL 2: Explore Connected Project Spotlight (Matches Desktop Reference Center Card) */}
        {listing.project && (
          <div
            className={`${
              activePanelCount === 3 ? 'lg:col-span-4' : ''
            } bg-white rounded-2xl border border-[#E6E2DC] p-5 shadow-2xs flex flex-col justify-between`}
          >
            <div className="mb-4">
              <h2 className="text-base font-display font-bold text-[#111111] truncate">
                {`Explore ${listing.project.name}`}
              </h2>
            </div>

            <div className="flex flex-col sm:flex-row gap-3.5 items-stretch flex-1">
              <div className="w-full sm:w-36 h-36 sm:h-auto rounded-xl overflow-hidden bg-gradient-to-br from-[#F5F2EB] via-[#EDE7DC] to-[#E4DEC9] border border-[#DFD8CA] shrink-0 flex items-center justify-center">
                {showProjectSpotImage ? (
                  <img
                    src={projectSpotUrl!}
                    alt={listing.project.name}
                    referrerPolicy="no-referrer"
                    onError={() => markUrlFailed(projectSpotUrl)}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center text-center px-2 space-y-1">
                    <div className="w-9 h-9 rounded-lg bg-white/80 border border-[#DFD8CA] flex items-center justify-center text-[#E85D3F]">
                      <Building2 className="w-5 h-5" />
                    </div>
                    <span className="text-[10px] font-display font-semibold uppercase tracking-wider text-[#111111]/65">
                      Project Enclave
                    </span>
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0 flex flex-col justify-between space-y-2">
                <div className="space-y-1">
                  <h3 className="text-sm font-display font-bold text-[#111111] truncate">
                    {listing.project.name}
                  </h3>
                  {listing.project.developerName && (
                    <p className="text-[11px] font-body text-[#111111]/60 truncate">
                      By {listing.project.developerName}
                    </p>
                  )}
                  <p className="text-[11px] font-display font-semibold text-[#111111]/85">
                    {[listing.project.bhkSummary, listing.project.statusDisplay]
                      .filter(Boolean)
                      .join(' | ') || 'Residential Enclave'}
                  </p>
                  <p className="text-[11px] font-body text-[#111111]/65 line-clamp-3 leading-relaxed">
                    {listing.project.shortDescription ||
                      'Premium residential project with lifestyle amenities, security and excellent connectivity.'}
                  </p>
                </div>

                <Link
                  href={listing.project.url}
                  className="w-full py-2 px-3 rounded-xl bg-white hover:bg-[#FFF5F0] text-[#E85D3F] border border-[#E85D3F]/50 text-xs font-display font-semibold flex items-center justify-center gap-1.5 transition-colors"
                >
                  <span>Explore Project</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* PANEL 3: Other Projects in This Location (Matches Desktop Reference Right Card) */}
        {hasRelatedProjects && (
          <div
            className={`${
              activePanelCount === 3 ? 'lg:col-span-4' : ''
            } bg-white rounded-2xl border border-[#E6E2DC] p-5 shadow-2xs flex flex-col justify-between relative`}
          >
            <div className="flex items-center justify-between gap-2 mb-4">
              <h2 className="text-base font-display font-bold text-[#111111]">
                Other Projects in This Location
              </h2>
              <Link
                href={listing.location?.url || '/projects'}
                className="inline-flex items-center gap-1 text-xs font-display font-semibold text-[#E85D3F] hover:text-[#D44C2F] transition-colors shrink-0"
              >
                <span>View All</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="relative flex-1 flex items-center">
              {relatedProjects.length > 2 && (
                <button
                  type="button"
                  onClick={() => scrollContainer(projectsScrollRef, 'left')}
                  aria-label="Scroll related projects left"
                  className="hidden sm:flex absolute -left-3 z-10 w-7 h-7 rounded-full bg-white border border-[#E6E2DC] shadow-sm items-center justify-center text-[#111111]/75 hover:text-[#111111] cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              )}

              <div
                ref={projectsScrollRef}
                className="flex items-stretch gap-3 overflow-x-auto no-scrollbar w-full pb-1"
              >
                {relatedProjects.map(proj => {
                  const hasValidProjImg = Boolean(
                    proj.featuredImageUrl && !failedUrls[proj.featuredImageUrl]
                  );

                  return (
                    <Link
                      key={proj.id}
                      href={`/projects/${proj.slug}`}
                      className="min-w-[165px] max-w-[195px] flex-1 rounded-xl border border-[#E6E2DC] bg-[#FAFAF8] hover:bg-white hover:border-[#111111]/25 transition-all overflow-hidden flex flex-col justify-between group shrink-0"
                    >
                      <div className="relative h-28 w-full bg-gradient-to-br from-[#F5F2EB] via-[#EDE7DC] to-[#E4DEC9] border-b border-[#E6E2DC] overflow-hidden">
                        {hasValidProjImg ? (
                          <img
                            src={proj.featuredImageUrl!}
                            alt={proj.name}
                            referrerPolicy="no-referrer"
                            onError={() => markUrlFailed(proj.featuredImageUrl)}
                            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                          />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center text-center px-2 space-y-1">
                            <div className="w-8 h-8 rounded-lg bg-white/80 border border-[#DFD8CA] flex items-center justify-center text-[#E85D3F]">
                              <Building2 className="w-4 h-4" />
                            </div>
                            <span className="text-[10px] font-display font-semibold text-[#111111]/65 truncate max-w-full">
                              {proj.name}
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="p-3 space-y-1">
                        <h3 className="text-xs font-display font-bold text-[#111111] truncate">
                          {proj.name}
                        </h3>
                        <p className="text-[11px] font-body text-[#111111]/65 flex items-center gap-1 truncate">
                          <MapPin className="w-3 h-3 text-[#E85D3F] shrink-0" />
                          <span className="truncate">
                            {proj.location?.name || 'Kolkata'}
                          </span>
                        </p>
                        {proj.startingPrice && (
                          <p className="text-[11px] font-display font-semibold text-[#111111]/85 pt-0.5">
                            From {formatIndianPrice(proj.startingPrice)}
                          </p>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>

              {relatedProjects.length > 2 && (
                <button
                  type="button"
                  onClick={() => scrollContainer(projectsScrollRef, 'right')}
                  aria-label="Scroll related projects right"
                  className="hidden sm:flex absolute -right-3 z-10 w-7 h-7 rounded-full bg-white border border-[#E6E2DC] shadow-sm items-center justify-center text-[#111111]/75 hover:text-[#111111] cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
