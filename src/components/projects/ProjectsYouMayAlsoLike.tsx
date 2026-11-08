import React from 'react';
import { ProjectDiscoveryCardDto } from '@/src/domain/projects/dto/discoveryDto';
import { ProjectHorizontalCarousel } from './ProjectHorizontalCarousel';

export interface ProjectsYouMayAlsoLikeProps {
  projects: ProjectDiscoveryCardDto[];
  currentProjectId: string;
  currentProjectSlug?: string;
  excludeProjectIds?: string[];
}

export function filterEligibleRecommendedProjects(
  projects?: ProjectDiscoveryCardDto[] | null,
  currentProjectId?: string,
  currentProjectSlug?: string,
  excludeProjectIds: string[] = []
): ProjectDiscoveryCardDto[] {
  if (!projects || !Array.isArray(projects)) return [];

  const seenIds = new Set<string>([
    ...(currentProjectId ? [currentProjectId] : []),
    ...excludeProjectIds,
  ]);
  const seenSlugs = new Set<string>(
    currentProjectSlug ? [currentProjectSlug.trim().toLowerCase()] : []
  );

  const eligible: ProjectDiscoveryCardDto[] = [];
  for (const p of projects) {
    if (!p || !p.id || !p.slug || !p.name) continue;
    const normSlug = p.slug.trim().toLowerCase();
    if (seenIds.has(p.id) || seenSlugs.has(normSlug)) continue;
    seenIds.add(p.id);
    seenSlugs.add(normSlug);
    eligible.push(p);
  }

  return eligible;
}

export function ProjectsYouMayAlsoLike({
  projects,
  currentProjectId,
  currentProjectSlug,
  excludeProjectIds = [],
}: ProjectsYouMayAlsoLikeProps) {
  const eligibleProjects = filterEligibleRecommendedProjects(
    projects,
    currentProjectId,
    currentProjectSlug,
    excludeProjectIds
  );

  if (eligibleProjects.length === 0) {
    return null;
  }

  return (
    <section
      id="projects-you-may-also-like"
      aria-labelledby="projects-you-may-also-like-heading"
      className="space-y-5 pt-8 border-t border-[var(--color-border)]"
    >
      <div className="rounded-2xl border border-[var(--color-border)]/80 bg-[var(--color-foreground)]/[0.015] p-5 sm:p-6 space-y-5">
        <div>
          <div className="text-[11px] uppercase font-semibold tracking-wider text-[var(--color-accent)] mb-1 font-display">
            Similar Developments
          </div>
          <h2
            id="projects-you-may-also-like-heading"
            className="text-xl sm:text-2xl font-display font-semibold text-[var(--color-foreground)] tracking-tight"
          >
            Explore Similar Projects
          </h2>
          <p className="text-xs sm:text-sm text-[var(--color-foreground)]/65 mt-1 font-body">
            Discover other residential developments in and around this locality with similar configurations and price ranges.
          </p>
        </div>

        <ProjectHorizontalCarousel
          items={eligibleProjects}
          ariaLabel="Explore similar projects"
          cardIdPrefix="related-proj"
        />
      </div>
    </section>
  );
}
