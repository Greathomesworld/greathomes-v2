'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Building2, ArrowRight, CheckCircle2, Layers, MapPin } from 'lucide-react';
import { BoundedDeveloperDto } from '@/src/domain/projects/dto/projectDto';
import { ProjectDiscoveryCardDto } from '@/src/domain/projects/dto/discoveryDto';
import { ProjectHorizontalCarousel } from './ProjectHorizontalCarousel';
import { normalizeMediaPublicUrl } from '@/src/lib/mediaUtils';

export interface ProjectDeveloperSectionProps {
  developer: BoundedDeveloperDto;
  developerLogoUrl?: string | null;
  developerBio?: string | null;
  developerProjectCount?: number | null;
  developerLocationsCount?: number | null;
  moreProjects?: ProjectDiscoveryCardDto[];
  currentProjectId?: string;
  currentProjectSlug?: string;
}

export function getDeveloperInitials(name?: string | null): string {
  if (!name || typeof name !== 'string') return 'GH';
  const words = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return 'GH';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}

export function filterEligibleDeveloperProjects(
  projects?: ProjectDiscoveryCardDto[] | null,
  currentProjectId?: string,
  currentProjectSlug?: string
): ProjectDiscoveryCardDto[] {
  if (!projects || !Array.isArray(projects)) return [];
  const seenIds = new Set<string>(currentProjectId ? [currentProjectId] : []);
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

/**
 * Note: Developer website URLs are explicitly prohibited in this public section.
 * Displays the developer's brand profile with a high-impact rectangular, aspect-aware logo canvas,
 * verified developer identity, non-fabricated bio, and "More Projects by This Developer" carousel.
 */
export function ProjectDeveloperSection({
  developer,
  developerLogoUrl,
  developerBio,
  developerProjectCount,
  developerLocationsCount,
  moreProjects = [],
  currentProjectId,
  currentProjectSlug,
}: ProjectDeveloperSectionProps) {
  const [logoFailed, setLogoFailed] = useState(false);

  const rawLogoUrl =
    (developerLogoUrl && developerLogoUrl.trim()) ||
    (developer.logoUrl && developer.logoUrl.trim()) ||
    null;

  const resolvedLogoUrl = normalizeMediaPublicUrl(rawLogoUrl);

  const resolvedBio =
    (developerBio && developerBio.trim()) ||
    (developer.shortDescription && developer.shortDescription.trim()) ||
    (developer.description && developer.description.trim()) ||
    null;

  const showLogoImage = Boolean(resolvedLogoUrl && !logoFailed);
  const initials = getDeveloperInitials(developer.name);

  const eligibleMoreProjects = filterEligibleDeveloperProjects(
    moreProjects,
    currentProjectId,
    currentProjectSlug
  );

  return (
    <section
      id="developer"
      aria-labelledby="developer-heading"
      className="space-y-8 pt-8 border-t border-[var(--color-border)]"
    >
      <div>
        <div className="text-xs uppercase font-semibold tracking-wider text-[var(--color-accent)] mb-1 font-display">
          Development Partner
        </div>
        <h2
          id="developer-heading"
          className="text-2xl sm:text-3xl font-display font-semibold text-[var(--color-foreground)] tracking-tight"
        >
          About {developer.name}
        </h2>
        <p className="text-xs sm:text-sm text-[var(--color-foreground)]/65 mt-1 font-body">
          Architectural pedigree and verified builder track record.
        </p>
      </div>

      {/* Developer Brand Profile Card */}
      <div className="p-5 sm:p-6 md:p-8 rounded-2xl border border-[var(--color-border)] bg-[var(--color-foreground)]/[0.015] shadow-xs space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          {/* Brand Identity: Logo + Name & Badges */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6 min-w-0">
            {/* Prominent Aspect-Aware Developer Logo Canvas (Rectangular, 128-144px mobile, 176-192px desktop) */}
            <div
              data-developer-logo-container="true"
              className="w-36 h-14 sm:w-44 sm:h-20 md:w-48 md:h-22 rounded-xl sm:rounded-2xl bg-white dark:bg-[#181816] border border-[var(--color-border)] p-2 sm:p-3 flex items-center justify-center shrink-0 overflow-hidden shadow-2xs transition-shadow hover:shadow-xs"
            >
              {showLogoImage && resolvedLogoUrl ? (
                <img
                  src={resolvedLogoUrl}
                  alt={`${developer.name} logo`}
                  onError={() => setLogoFailed(true)}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-contain object-center"
                />
              ) : (
                <div
                  aria-label={`${developer.name} monogram`}
                  className="w-full h-full rounded-lg bg-[#FAFAF8] dark:bg-[#141412] border border-[var(--color-border)]/50 flex items-center justify-center gap-2.5 px-3 select-none"
                >
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-md bg-[var(--color-foreground)]/[0.04] flex items-center justify-center shrink-0">
                    <Building2 className="w-4 h-4 sm:w-4.5 sm:h-4.5 text-[#E85D3F]" aria-hidden="true" />
                  </div>
                  <div className="flex flex-col text-left min-w-0">
                    <span className="text-xs sm:text-sm font-display font-bold tracking-tight text-[#111111] dark:text-[#F5F5F3] truncate">
                      {initials}
                    </span>
                    <span className="text-[10px] sm:text-[11px] font-display font-medium text-[var(--color-foreground)]/55 uppercase tracking-wider">
                      Builder
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Name, Verification & Metrics */}
            <div className="min-w-0 space-y-2">
              <div className="space-y-0.5">
                <span className="text-[11px] font-display font-semibold uppercase tracking-wider text-[var(--color-accent)]">
                  Verified Development Partner
                </span>
                <h3 className="text-xl sm:text-2xl font-display font-bold text-[var(--color-foreground)] tracking-tight truncate">
                  {developer.name}
                </h3>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#218C5A]/10 text-[#218C5A] font-medium font-display">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>Verified Builder Portfolio</span>
                </span>

                {typeof developerProjectCount === 'number' && developerProjectCount > 0 && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[var(--color-foreground)]/[0.05] text-[var(--color-foreground)]/80 font-display font-medium">
                    <Layers className="w-3.5 h-3.5 text-[var(--color-accent)]" />
                    <span>
                      {developerProjectCount}{' '}
                      {developerProjectCount === 1 ? 'Published Project' : 'Published Projects'}
                    </span>
                  </span>
                )}

                {typeof developerLocationsCount === 'number' && developerLocationsCount > 0 && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[var(--color-foreground)]/[0.05] text-[var(--color-foreground)]/80 font-display font-medium">
                    <MapPin className="w-3.5 h-3.5 text-[var(--color-accent)]" />
                    <span>
                      {developerLocationsCount}{' '}
                      {developerLocationsCount === 1 ? 'Active Locality' : 'Active Localities'}
                    </span>
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Action Link: Explore Developer Portfolio */}
          {developer.slug && !developer.slug.startsWith('neon-dev-') && (
            <div className="pt-2 sm:pt-0 shrink-0">
              <Link
                href={`/developers/${developer.slug}`}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-[var(--color-border)] bg-white dark:bg-[#1C1C1A] text-xs font-display font-semibold text-[var(--color-foreground)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] shadow-2xs hover:shadow-xs transition-all duration-200 group"
              >
                <span>View All Projects by {developer.name}</span>
                <ArrowRight className="w-3.5 h-3.5 text-[var(--color-accent)] group-hover:translate-x-0.5 transition-transform" />
              </Link>
            </div>
          )}
        </div>

        {resolvedBio && (
          <div className="pt-5 border-t border-[var(--color-border)]/60">
            <p className="text-sm font-body text-[var(--color-foreground)]/85 leading-relaxed max-w-4xl">
              {resolvedBio}
            </p>
          </div>
        )}
      </div>

      {/* Part E: More Projects by This Developer Carousel */}
      {eligibleMoreProjects.length > 0 && (
        <div
          id="more-projects-by-developer"
          data-developer-projects-carousel="true"
          className="space-y-4 pt-2"
        >
          <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
            <div>
              <div className="text-xs uppercase font-semibold tracking-wider text-[var(--color-accent)] font-display mb-0.5">
                Developer Portfolio
              </div>
              <h3 className="text-xl sm:text-2xl font-display font-semibold text-[var(--color-foreground)]">
                More Projects by {developer.name}
              </h3>
              <p className="text-xs text-[var(--color-foreground)]/65 mt-0.5 font-body">
                Explore other verified residential developments by {developer.name}.
              </p>
            </div>

            {developer.slug && !developer.slug.startsWith('neon-dev-') && (
              <Link
                href={`/developers/${developer.slug}`}
                className="inline-flex items-center gap-1 text-xs font-display font-semibold text-[var(--color-foreground)] hover:text-[#E85D3F] transition-colors shrink-0"
              >
                <span>Explore Full Portfolio ({eligibleMoreProjects.length})</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            )}
          </div>

          <ProjectHorizontalCarousel
            items={eligibleMoreProjects}
            ariaLabel={`More projects by ${developer.name}`}
            cardIdPrefix="dev-proj"
          />
        </div>
      )}
    </section>
  );
}
