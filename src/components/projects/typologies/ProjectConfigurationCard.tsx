'use client';

import React from 'react';
import { Layers, FileText, ArrowRight, Compass } from 'lucide-react';
import {
  ProjectConfigurationViewModel,
  getConfigurationAvailabilityBadge,
} from './typologyModel';
import { useEnquiry } from '@/src/components/enquiry/EnquiryContext';

interface ProjectConfigurationCardProps {
  config: ProjectConfigurationViewModel;
  projectName?: string;
  projectSlug?: string;
  locationName?: string;
  onSelectFloorPlan?: (configId: string) => void;
  onEnquire?: (config: ProjectConfigurationViewModel) => void;
}

const AVAILABILITY_TONE_CLASSES: Record<
  'available' | 'limited' | 'request' | 'sold_out',
  string
> = {
  available: 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
  limited: 'bg-amber-50 text-amber-800 border-amber-200/80',
  request: 'bg-stone-100 text-stone-700 border-stone-200',
  sold_out: 'bg-neutral-100 text-neutral-600 border-neutral-200',
};

export function ProjectConfigurationCard({
  config,
  projectName,
  projectSlug,
  locationName,
  onSelectFloorPlan,
  onEnquire,
}: ProjectConfigurationCardProps) {
  const { openEnquiry } = useEnquiry();
  const primaryPlan = config.floorPlans[0] || null;
  const availabilityBadge = getConfigurationAvailabilityBadge(config.availability);

  const handleFloorPlanClick = () => {
    if (config.hasFloorPlans && onSelectFloorPlan) {
      onSelectFloorPlan(config.id);
    }
  };

  const handleEnquireClick = () => {
    if (onEnquire) {
      onEnquire(config);
      return;
    }
    openEnquiry({
      contextType: 'PROJECT',
      projectSlug,
      projectName,
      locationName,
      configurationId: config.id,
      configuration: config.name,
      requestSiteVisit: false,
      title: projectName ? `${config.name} at ${projectName}` : config.name,
      priceDisplay: config.startingPriceFormatted,
      subtitle: config.priceOnRequest
        ? `${config.carpetAreaDisplay || 'Verified'} Carpet Area · Price on Request`
        : `${config.carpetAreaDisplay || 'Verified'} Carpet Area · Starting ${config.startingPriceFormatted}`,
    });
  };

  return (
    <article
      className="group rounded-2xl bg-white border border-[var(--color-border)] shadow-xs transition-all duration-200 overflow-hidden flex flex-col hover:border-[var(--color-foreground)]/30 hover:shadow-md"
      aria-label={`${config.name} configuration`}
    >
      {/* Visual Header / Floor Plan Preview Container */}
      <div className="relative aspect-16/10 bg-[#F7F7F6] border-b border-[var(--color-border)]/60 flex items-center justify-center p-4 overflow-hidden select-none">
        {config.hasFloorPlans && primaryPlan ? (
          <div
            className="w-full h-full flex items-center justify-center cursor-pointer"
            onClick={handleFloorPlanClick}
            title={`View floor plan for ${config.name}`}
          >
            <img
              src={primaryPlan.url}
              alt={primaryPlan.altText || `${config.name} architectural layout`}
              className="max-w-full max-h-full object-contain transition-transform duration-300 group-hover:scale-105"
              loading="lazy"
            />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center text-center p-4 space-y-2">
            <div className="w-10 h-10 rounded-full bg-black/5 flex items-center justify-center text-[var(--color-foreground)]/40">
              <Compass className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-semibold text-[var(--color-foreground)]/70 font-display">
                Floor Plan on Request
              </p>
              <p className="text-[10px] text-[var(--color-foreground)]/45 font-body mt-0.5">
                Verified CAD layout available
              </p>
            </div>
          </div>
        )}

        {/* Top Badges (Typology & Floor Plan Count) */}
        <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none">
          <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-[#111111]/80 text-white font-display backdrop-blur-xs shadow-xs">
            {config.typologyCategory}
          </span>

          {config.hasFloorPlans && (
            <span className="px-2.5 py-1 rounded-full text-[10px] font-medium bg-white/95 text-[#111111] font-display backdrop-blur-xs border border-black/10 shadow-xs flex items-center gap-1.5">
              <Layers className="w-3 h-3 text-[#E85D3F]" />
              <span>
                {config.floorPlanCount} {config.floorPlanCount === 1 ? 'Plan' : 'Plans'}
              </span>
            </span>
          )}
        </div>
      </div>

      {/* Card Body */}
      <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
        <div>
          {/* Configuration Title & Canonical Availability Status Badge */}
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-base font-bold font-display text-[var(--color-foreground)] tracking-tight">
              {config.name}
            </h3>
            {availabilityBadge && (
              <span
                data-availability-status={availabilityBadge.status}
                className={`shrink-0 px-2 py-0.5 rounded-md text-[10px] font-semibold font-display border ${AVAILABILITY_TONE_CLASSES[availabilityBadge.tone]}`}
              >
                {availabilityBadge.label}
              </span>
            )}
          </div>

          {/* Area Presentation (Prioritizing Carpet Area + Exactly One Secondary Area) */}
          <div className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-[var(--color-foreground)]/75 font-body">
            {config.carpetAreaDisplay ? (
              <span>
                Carpet:{' '}
                <strong className="text-[var(--color-foreground)] font-semibold">
                  {config.carpetAreaDisplay}
                </strong>
              </span>
            ) : (
              <span>Area on Request</span>
            )}

            {config.secondaryAreaDisplay && (
              <>
                <span className="text-[var(--color-foreground)]/30">·</span>
                <span>
                  {config.secondaryAreaLabel}:{' '}
                  <strong className="text-[var(--color-foreground)] font-semibold">
                    {config.secondaryAreaDisplay}
                  </strong>
                </span>
              </>
            )}
          </div>
        </div>

        {/* Pricing & Effective Rate Presentation */}
        <div className="pt-3 border-t border-[var(--color-border)]/60 flex items-end justify-between gap-2">
          <div>
            <p className="text-[10px] text-[var(--color-foreground)]/50 uppercase tracking-wider font-display font-medium">
              {config.priceOnRequest ? 'Pricing' : 'Starting From'}
            </p>
            <p className="text-base font-bold font-display text-[var(--color-foreground)] tracking-tight">
              {config.startingPriceFormatted}
            </p>
          </div>

          {!config.priceOnRequest && (
            <div className="text-right">
              {config.hasRate && config.rateDisplay ? (
                <span className="inline-block px-2.5 py-1 rounded bg-black/[0.04] text-[11px] font-semibold text-[var(--color-foreground)]/80 font-display">
                  {config.rateDisplay}
                </span>
              ) : (
                <span className="inline-block text-[11px] text-[var(--color-foreground)]/50 font-body">
                  Rate on Request
                </span>
              )}
            </div>
          )}
        </div>

        {/* Card-Level Action CTAs */}
        <div className="pt-1 flex items-center gap-2">
          {config.hasFloorPlans ? (
            <button
              type="button"
              onClick={handleFloorPlanClick}
              className="flex-1 py-2 px-3 rounded-lg border border-[var(--color-border)] hover:border-[var(--color-foreground)]/40 hover:bg-black/[0.02] text-[var(--color-foreground)] text-xs font-semibold font-display flex items-center justify-center gap-1.5 transition-colors cursor-pointer focus:outline-hidden focus-visible:ring-2 focus-visible:ring-[var(--color-foreground)]"
            >
              <FileText className="w-3.5 h-3.5 text-[#E85D3F]" />
              <span>
                {config.floorPlanCount === 1 ? 'View Floor Plan' : `View Floor Plans (${config.floorPlanCount})`}
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleEnquireClick}
              className="flex-1 py-2 px-3 rounded-lg border border-dashed border-[var(--color-border)] bg-black/[0.01] hover:bg-black/[0.04] text-[var(--color-foreground)]/70 text-xs font-medium font-display flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <Compass className="w-3.5 h-3.5 text-[var(--color-foreground)]/50" />
              <span>Request Floor Plan</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleEnquireClick}
            className="py-2 px-3.5 rounded-lg bg-[#E85D3F] hover:bg-[#D44C2F] text-white text-xs font-semibold font-display flex items-center justify-center gap-1 transition-colors shadow-xs cursor-pointer focus:outline-hidden focus-visible:ring-2 focus-visible:ring-[#E85D3F]"
          >
            <span>Enquire</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </article>
  );
}
