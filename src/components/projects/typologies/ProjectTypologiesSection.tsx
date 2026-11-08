'use client';

import React, { useState, useMemo } from 'react';
import {
  PublicProjectConfigurationDto,
  PublicProjectMediaDto,
} from '@/src/domain/projects/dto/projectDto';
import {
  prepareProjectConfigurations,
  extractDynamicTypologyFilters,
  ProjectConfigurationViewModel,
} from './typologyModel';
import { ProjectTypologyFilters } from './ProjectTypologyFilters';
import { ProjectConfigurationGrid } from './ProjectConfigurationGrid';
import { useProjectInteraction } from '../ProjectInteractionContext';

export interface ProjectTypologiesSectionProps {
  configurations?: PublicProjectConfigurationDto[];
  mediaList?: PublicProjectMediaDto[];
  projectName?: string;
  projectSlug?: string;
  locationName?: string;
  onSelectFloorPlan?: (configId: string) => void;
  onEnquire?: (config: ProjectConfigurationViewModel) => void;
}

export function ProjectTypologiesSection({
  configurations = [],
  mediaList = [],
  projectName = 'Project',
  projectSlug,
  locationName,
  onSelectFloorPlan,
  onEnquire,
}: ProjectTypologiesSectionProps) {
  const [selectedTypology, setSelectedTypology] = useState<string>('ALL');
  const { openConfigurationViewer } = useProjectInteraction();

  // Prepare normalized view models strictly derived from canonical DTOs
  const viewModels = useMemo(
    () => prepareProjectConfigurations(configurations, mediaList),
    [configurations, mediaList]
  );

  // Extract dynamic filters strictly from actual configuration items (no hardcoded BHKs)
  const dynamicFilters = useMemo(
    () => extractDynamicTypologyFilters(viewModels),
    [viewModels]
  );

  // Local client-side filtering: immediate response, zero network/navigation overhead
  const filteredConfigurations = useMemo(() => {
    if (selectedTypology === 'ALL') {
      return viewModels;
    }
    return viewModels.filter((c) => c.typologyCategory === selectedTypology);
  }, [viewModels, selectedTypology]);

  // Wire card floor-plan trigger to canonical viewer
  const handleSelectFloorPlan = (configId: string) => {
    if (onSelectFloorPlan) {
      onSelectFloorPlan(configId);
      return;
    }
    // Verify target configuration has real floor plans before opening viewer
    const targetConfig = viewModels.find((c) => c.id === configId);
    if (!targetConfig || !targetConfig.hasFloorPlans || targetConfig.floorPlans.length === 0) {
      return;
    }
    openConfigurationViewer(configId);
  };

  // Fallback if no configurations exist in the project
  if (configurations.length === 0) {
    return (
      <section
        id="configurations"
        aria-labelledby="configurations-heading"
        className="py-8 scroll-mt-20 space-y-6"
      >
        <div className="border-b border-[var(--color-border)]/60 pb-4">
          <h2
            id="configurations-heading"
            className="text-xl sm:text-2xl font-bold font-display text-[var(--color-foreground)] tracking-tight"
          >
            Project Typologies & Configurations
          </h2>
          <p className="text-xs sm:text-sm text-[var(--color-foreground)]/60 font-body mt-1">
            Explore the home configurations available within this project.
          </p>
        </div>
        <div className="p-8 rounded-2xl bg-black/[0.02] border border-[var(--color-border)]/60 text-center">
          <p className="text-sm text-[var(--color-foreground)]/60 font-body">
            Configuration specifications are currently being updated by the developer desk for {projectName}.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section
      id="configurations"
      aria-labelledby="configurations-heading"
      className="py-8 scroll-mt-20 space-y-6"
    >
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-[var(--color-border)]/60 pb-4">
        <div>
          <h2
            id="configurations-heading"
            className="text-xl sm:text-2xl font-bold font-display text-[var(--color-foreground)] tracking-tight"
          >
            Project Typologies & Configurations
          </h2>
          <p className="text-xs sm:text-sm text-[var(--color-foreground)]/60 font-body mt-1">
            Explore the home configurations available within this project.
          </p>
        </div>

        <div className="text-xs text-[var(--color-foreground)]/50 font-body tabular-nums">
          Showing {filteredConfigurations.length} of {viewModels.length}{' '}
          {viewModels.length === 1 ? 'configuration' : 'configurations'}
        </div>
      </div>

      {/* Dynamic Typology Filters (Local client-side, dynamically generated) */}
      <ProjectTypologyFilters
        filters={dynamicFilters}
        selectedKey={selectedTypology}
        onSelect={setSelectedTypology}
      />

      {/* Configuration Grid */}
      <ProjectConfigurationGrid
        configurations={filteredConfigurations}
        projectName={projectName}
        projectSlug={projectSlug}
        locationName={locationName}
        onSelectFloorPlan={handleSelectFloorPlan}
        onEnquire={onEnquire}
        onResetFilter={() => setSelectedTypology('ALL')}
      />
    </section>
  );
}
