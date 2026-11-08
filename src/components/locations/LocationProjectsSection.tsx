'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Building2, ArrowRight } from 'lucide-react';
import { ProjectDiscoveryCardDto } from '@/src/domain/projects/dto/discoveryDto';
import { PropertyCard } from '@/src/components/discovery/PropertyCard';

interface LocationProjectsSectionProps {
  locationName: string;
  locationSlug: string;
  projects: ProjectDiscoveryCardDto[];
  totalCount?: number;
}

const STAGE_FILTERS = [
  { id: 'ALL', label: 'All' },
  { id: 'NEW_LAUNCH', label: 'New Launch' },
  { id: 'UNDER_CONSTRUCTION', label: 'Under Construction' },
  { id: 'READY_TO_MOVE', label: 'Ready to Move' },
  { id: 'COMPLETED', label: 'Completed' },
  { id: 'SOLD_OUT', label: 'Sold Out' },
];

export function LocationProjectsSection({
  locationName,
  locationSlug,
  projects,
  totalCount,
}: LocationProjectsSectionProps) {
  const [activeStage, setActiveStage] = useState<string>('ALL');
  const effectiveTotal = typeof totalCount === 'number' ? totalCount : projects.length;

  const filteredProjects = projects.filter((p) => {
    if (activeStage === 'ALL') return true;
    return (
      p.status === activeStage ||
      (p as any).lifecycleStatus === activeStage ||
      (p as any).stage === activeStage
    );
  });

  const displayedProjects = filteredProjects.slice(0, 6);

  return (
    <section id="projects" className="w-full min-w-0 space-y-5 pt-8 border-t border-[rgba(17,17,17,0.08)]" aria-labelledby="projects-heading">
      <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
        <div>
          <h2
            id="projects-heading"
            className="text-xl sm:text-2xl font-display font-semibold text-[#111111] tracking-tight"
          >
            Residential Projects in {locationName}
          </h2>
          <p className="text-xs sm:text-sm font-body text-[#111111]/60 mt-0.5">
            Verified master developments, configurations, and pricing intelligence in {locationName}.
          </p>
        </div>
        <div className="text-xs font-mono text-[#111111]/50 shrink-0">
          {effectiveTotal} {effectiveTotal === 1 ? 'Project' : 'Projects'}
        </div>
      </div>

      {/* Stage Filter Chips */}
      {projects.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
          {STAGE_FILTERS.map((filter) => {
            const isActive = activeStage === filter.id;
            return (
              <button
                key={filter.id}
                type="button"
                onClick={() => setActiveStage(filter.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'bg-[#111111] text-white font-semibold shadow-xs'
                    : 'bg-[#FAFAF8] text-[#111111]/70 border border-[rgba(17,17,17,0.08)] hover:bg-neutral-100 hover:text-[#111111]'
                }`}
              >
                {filter.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Grid or Compact Empty State */}
      {displayedProjects.length === 0 ? (
        <div className="p-5 sm:p-6 rounded-xl border border-[rgba(17,17,17,0.08)] bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-2xs">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-[rgba(17,17,17,0.04)] flex items-center justify-center shrink-0 text-[#111111]/50">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-display font-semibold text-[#111111]">
                {activeStage !== 'ALL'
                  ? `No ${STAGE_FILTERS.find((s) => s.id === activeStage)?.label.toLowerCase()} projects in ${locationName}`
                  : `No projects currently listed in ${locationName}`}
              </h3>
              <p className="text-xs font-body text-[#111111]/60 mt-0.5">
                {activeStage !== 'ALL'
                  ? 'Try switching back to All stages to view available developments in this scope.'
                  : `Verified residential developments in ${locationName} will appear here as they achieve regulatory clearance and publication.`}
              </p>
            </div>
          </div>
          {activeStage !== 'ALL' && (
            <button
              type="button"
              onClick={() => setActiveStage('ALL')}
              className="px-3.5 py-2 rounded-lg bg-[#FAFAF8] border border-[rgba(17,17,17,0.12)] text-xs font-display font-semibold text-[#111111] hover:bg-neutral-100 transition-colors shrink-0 self-start sm:self-center cursor-pointer"
            >
              Show All ({projects.length})
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
          {displayedProjects.map((project) => (
            <PropertyCard
              key={`location-project-${project.id}`}
              item={project}
            />
          ))}
        </div>
      )}

      {/* View All Projects CTA */}
      {effectiveTotal > 0 && (
        <div className="flex justify-center pt-2">
          <Link
            href={`/projects?location=${locationSlug}`}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white border border-[rgba(17,17,17,0.15)] text-[#111111] font-display font-medium text-sm hover:bg-[#FAFAF8] hover:border-[#111111] transition-all shadow-2xs"
          >
            <span>View All {effectiveTotal} Projects in {locationName}</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      )}
    </section>
  );
}
