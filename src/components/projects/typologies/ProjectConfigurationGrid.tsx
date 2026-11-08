'use client';

import React from 'react';
import { ProjectConfigurationViewModel } from './typologyModel';
import { ProjectConfigurationCard } from './ProjectConfigurationCard';

interface ProjectConfigurationGridProps {
  configurations: ProjectConfigurationViewModel[];
  projectName?: string;
  projectSlug?: string;
  locationName?: string;
  onSelectFloorPlan?: (configId: string) => void;
  onEnquire?: (config: ProjectConfigurationViewModel) => void;
  onResetFilter?: () => void;
}

export function ProjectConfigurationGrid({
  configurations,
  projectName,
  projectSlug,
  locationName,
  onSelectFloorPlan,
  onEnquire,
  onResetFilter,
}: ProjectConfigurationGridProps) {
  if (configurations.length === 0) {
    return (
      <div
        id="configurations-grid"
        role="region"
        aria-live="polite"
        className="py-12 px-6 text-center rounded-2xl bg-black/[0.02] border border-[var(--color-border)]/60 space-y-3"
      >
        <p className="text-sm text-[var(--color-foreground)]/60 font-body">
          No home configurations match the selected typology filter.
        </p>
        {onResetFilter && (
          <button
            type="button"
            onClick={onResetFilter}
            className="px-4 py-1.5 rounded-full text-xs font-display font-semibold bg-[#111111] text-white hover:bg-[#111111]/90 transition-colors cursor-pointer"
          >
            Show All Configurations
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      id="configurations-grid"
      role="region"
      aria-live="polite"
      className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
    >
      {configurations.map((config) => (
        <ProjectConfigurationCard
          key={config.id}
          config={config}
          projectName={projectName}
          projectSlug={projectSlug}
          locationName={locationName}
          onSelectFloorPlan={onSelectFloorPlan}
          onEnquire={onEnquire}
        />
      ))}
    </div>
  );
}
