'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Building2, ShieldCheck, ArrowRight, ChevronLeft, ChevronRight, MapPin } from 'lucide-react';
import { SaveButton } from '../customer/SaveButton';
import { AddToCompareButton } from '../comparison/AddToCompareButton';

export interface HomeProjectCardData {
  id: string;
  name: string;
  slug: string;
  developerName: string;
  locationName: string;
  locationSlug?: string;
  status: string; // 'NEW_LAUNCH' | 'UNDER_CONSTRUCTION' | 'READY_TO_MOVE' | 'UPCOMING'
  startingPrice?: number;
  priceDisplay?: string;
  configurationString?: string;
  areaString?: string;
  imageUrl?: string;
  isReraVerified?: boolean;
  reraNumber?: string;
  isFeatured?: boolean;
}

interface HomeExploreProjectsProps {
  projects: HomeProjectCardData[];
}

export function HomeExploreProjects({ projects = [] }: HomeExploreProjectsProps) {
  const [activeTab, setActiveTab] = useState<'ALL' | 'UPCOMING' | 'NEW_LAUNCH' | 'UNDER_CONSTRUCTION' | 'READY_TO_MOVE'>('ALL');
  const [currentPage, setCurrentPage] = useState(0);
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});

  const filteredProjects = projects.filter((p) => {
    if (activeTab === 'ALL') return true;
    return p.status === activeTab;
  });

  const pageSize = 8;
  const totalPages = Math.max(1, Math.ceil(filteredProjects.length / pageSize));
  const safePage = Math.min(currentPage, totalPages - 1);
  const visibleProjects = filteredProjects.slice(safePage * pageSize, (safePage + 1) * pageSize);

  const getStageBadgeStyle = (status: string) => {
    switch (status) {
      case 'UNDER_CONSTRUCTION':
        return {
          label: 'Under Construction',
          className: 'bg-white/95 text-[#1E6091] border border-blue-200/80 shadow-2xs',
        };
      case 'READY_TO_MOVE':
        return {
          label: 'Ready to Move',
          className: 'bg-white/95 text-[#218C5A] border border-green-200/80 shadow-2xs',
        };
      case 'UPCOMING':
        return {
          label: 'Upcoming',
          className: 'bg-white/95 text-[#E85D3F] border border-orange-200/80 shadow-2xs',
        };
      case 'NEW_LAUNCH':
        return {
          label: 'New Launch',
          className: 'bg-white/95 text-[#E85D3F] border border-orange-200/80 shadow-2xs',
        };
      default:
        return {
          label: status.replace(/_/g, ' '),
          className: 'bg-white/95 text-neutral-800 border border-neutral-200 shadow-2xs',
        };
    }
  };

  return (
    <section 
      aria-labelledby="featured-projects-heading"
      className="py-16 md:py-20 bg-white border-b border-[rgba(17,17,17,0.08)]"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header matching reference */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
          <div>
            {/* Eyebrow: PROJECTS BY CONSTRUCTION STAGE ─── */}
            <div className="flex items-center gap-2.5 mb-2">
              <span className="text-xs uppercase tracking-widest text-[#E85D3F] font-bold font-display">
                PROJECTS BY CONSTRUCTION STAGE
              </span>
              <span className="w-8 h-0.5 bg-[#E85D3F] inline-block rounded-full" aria-hidden="true" />
            </div>

            {/* Heading: Featured Projects Across Stages */}
            <h2 
              id="featured-projects-heading"
              className="text-3xl sm:text-4xl font-display font-extrabold text-[#111111] tracking-tight mt-1"
            >
              Featured Projects Across Stages
            </h2>

            {/* Subtitle */}
            <p className="text-sm sm:text-base text-neutral-600 font-body mt-2 max-w-2xl">
              A quick look at some of the best residential projects in Kolkata, organised by their current stage.
            </p>
          </div>

          {/* Carousel Arrows & View All Projects CTA */}
          <div className="flex items-center gap-3 shrink-0">
            {filteredProjects.length > pageSize && (
              <div className="flex items-center gap-1.5" aria-label="Carousel navigation">
                <button
                  type="button"
                  onClick={() => setCurrentPage((prev) => Math.max(0, prev - 1))}
                  disabled={safePage === 0}
                  className="w-9 h-9 rounded-full border border-neutral-200/80 bg-white hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center text-neutral-600 transition-colors shadow-2xs cursor-pointer"
                  aria-label="Previous projects"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentPage((prev) => Math.min(totalPages - 1, prev + 1))}
                  disabled={safePage >= totalPages - 1}
                  className="w-9 h-9 rounded-full border border-neutral-200/80 bg-white hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center text-neutral-600 transition-colors shadow-2xs cursor-pointer"
                  aria-label="Next projects"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}

            <Link
              href="/projects"
              className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold text-[#E85D3F] hover:bg-[#FFF5EE] font-display transition-colors py-2 px-4 rounded-lg border border-[rgba(232,93,63,0.35)] group"
            >
              <span>View All Projects</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" aria-hidden="true" />
            </Link>
          </div>
        </div>

        {/* Filter Tabs matching reference: All Projects, Upcoming, New Launch, Under Construction, Ready to Move */}
        <div 
          role="tablist" 
          aria-label="Filter projects by development stage"
          className="flex items-center gap-2 sm:gap-2.5 overflow-x-auto no-scrollbar pb-2 sm:flex-wrap mb-6 sm:mb-10 -mx-4 px-4 sm:mx-0 sm:px-0"
        >
          {[
            { id: 'ALL', label: 'All Projects' },
            { id: 'UPCOMING', label: 'Upcoming' },
            { id: 'NEW_LAUNCH', label: 'New Launch' },
            { id: 'UNDER_CONSTRUCTION', label: 'Under Construction' },
            { id: 'READY_TO_MOVE', label: 'Ready to Move' },
          ].map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => {
                setActiveTab(tab.id as any);
                setCurrentPage(0);
              }}
              className={`px-3.5 sm:px-4 py-2 text-xs sm:text-sm font-bold rounded-lg border transition-all font-display cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === tab.id
                  ? 'bg-[#E85D3F] text-white border-[#E85D3F] shadow-xs'
                  : 'bg-white text-neutral-700 border-neutral-200 hover:border-neutral-400 hover:text-[#111111]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* 4-Column Responsive Grid matching reference */}
        {filteredProjects.length === 0 ? (
          <div className="bg-[#FAFAF8] border border-neutral-200 rounded-xl p-12 text-center max-w-md mx-auto my-8">
            <Building2 className="w-12 h-12 text-neutral-400 mx-auto mb-3 stroke-1" aria-hidden="true" />
            <p className="text-base font-display font-bold text-neutral-900">
              No developments currently in this category
            </p>
            <p className="text-xs text-neutral-500 font-body mt-1.5 mb-5">
              Additional verified residential master plans across Kolkata are continually being curated by our advisory team.
            </p>
            <button
              type="button"
              onClick={() => {
                setActiveTab('ALL');
                setCurrentPage(0);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-[#111111] hover:bg-neutral-800 rounded-lg font-display transition-colors cursor-pointer"
            >
              <span>Show All Projects</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {visibleProjects.map((project) => {
              const badge = getStageBadgeStyle(project.status);
              const showImage = Boolean(project.imageUrl) && !failedImages[project.id];

              return (
                <div
                  key={project.id}
                  className="group bg-white border border-[rgba(17,17,17,0.08)] rounded-xl overflow-hidden shadow-xs hover:shadow-xl hover:border-[rgba(17,17,17,0.18)] transition-all duration-300 flex flex-col justify-between"
                >
                  <div>
                    {/* Media Header */}
                    <div className="relative aspect-[16/11] bg-neutral-100 overflow-hidden">
                      {showImage ? (
                        <Image
                          src={project.imageUrl!}
                          alt={`${project.name} development facade`}
                          fill
                          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                          className="object-cover group-hover:scale-104 transition-transform duration-500 ease-out"
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          onError={() =>
                            setFailedImages((prev) => ({ ...prev, [project.id]: true }))
                          }
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-neutral-400 bg-neutral-100">
                          <Building2 className="w-10 h-10 stroke-1 text-neutral-400 mb-1" aria-hidden="true" />
                          <span className="text-[11px] font-display text-neutral-500 uppercase tracking-wider">
                            Architectural Elevation
                          </span>
                        </div>
                      )}

                      {/* Pill Stage Badge in Top-Left */}
                      <div className="absolute top-3 left-3 z-10 pointer-events-none">
                        <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold font-display ${badge.className}`}>
                          {badge.label}
                        </span>
                      </div>

                      {/* Heart Save Button in Top-Right */}
                      <div className="absolute top-3 right-3 z-10">
                        <SaveButton resourceType="PROJECT" resourceId={project.id} />
                      </div>
                    </div>

                    {/* Card Body */}
                    <div className="p-5">
                      {/* Name & RERA Verified row */}
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <h3 className="text-base font-display font-bold text-[#111111] group-hover:text-[#E85D3F] transition-colors line-clamp-1 leading-snug">
                          <Link href={`/projects/${project.slug}`}>
                            {project.name}
                          </Link>
                        </h3>
                        {project.isReraVerified && (
                          <span 
                            className="inline-flex items-center gap-1 text-[11px] font-bold text-[#218C5A] font-display shrink-0"
                            title="RERA Registered and Verified"
                          >
                            <span>RERA</span>
                            <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
                          </span>
                        )}
                      </div>

                      {/* Developer Name */}
                      <p className="text-xs text-neutral-500 font-body mb-2 truncate">
                        {project.developerName}
                      </p>

                      {/* Location with Pin */}
                      <p className="text-xs text-neutral-600 font-body flex items-center gap-1 mb-3.5 truncate">
                        <MapPin className="w-3.5 h-3.5 text-neutral-400 shrink-0" aria-hidden="true" />
                        <span>{project.locationName}, Kolkata</span>
                      </p>

                      {/* Typology and Area Pill Tags */}
                      <div className="flex flex-wrap items-center gap-1.5 mb-2">
                        {project.configurationString && (
                          <span className="px-2.5 py-1 rounded-md bg-[#FAFAF8] border border-[rgba(17,17,17,0.06)] text-[11px] font-medium text-neutral-700 font-body">
                            {project.configurationString}
                          </span>
                        )}
                        {project.areaString && (
                          <span className="px-2.5 py-1 rounded-md bg-[#FAFAF8] border border-[rgba(17,17,17,0.06)] text-[11px] font-medium text-neutral-700 font-body">
                            {project.areaString}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Card Bottom: Price, Compare, and Circular Arrow Affordance */}
                  <div className="p-5 pt-0">
                    <div className="pt-3 border-t border-neutral-100 flex flex-col gap-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <span className="text-base font-display font-bold text-[#111111] tracking-tight">
                            {project.priceDisplay ? `${project.priceDisplay} Onwards` : 'Price on Request'}
                          </span>
                        </div>

                        <Link
                          href={`/projects/${project.slug}`}
                          aria-label={`View details for ${project.name}`}
                          className="w-8 h-8 rounded-full bg-[#FFF5EE] text-[#E85D3F] border border-[rgba(232,93,63,0.2)] flex items-center justify-center group-hover:bg-[#E85D3F] group-hover:text-white transition-all shadow-2xs shrink-0"
                        >
                          <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                        </Link>
                      </div>

                      <div className="pt-2 border-t border-neutral-100 flex items-center justify-between">
                        <AddToCompareButton mode="PROJECTS" id={project.id} name={project.name} />
                      </div>
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
