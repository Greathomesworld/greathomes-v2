'use client';

import Link from 'next/link';
import { ArrowRight, Calendar, Download } from 'lucide-react';
import { PublicProjectDto } from '@/src/domain/projects/dto/projectDto';
import { formatIndianPrice } from '@/src/components/discovery/formatters';
import { useEnquiry } from '@/src/components/enquiry/EnquiryContext';
import { useProjectInteraction } from './ProjectInteractionContext';
import { useVisitorTelemetry } from '@/src/components/telemetry/VisitorTelemetryProvider';
import { scrollToProjectSection } from './scrollToProjectSection';

interface MobileStickyCtaProps {
  project?: PublicProjectDto;
  projectName?: string;
  startingPrice?: number | null;
  ctaText?: string;
  targetSectionId?: string;
  className?: string;
  priceLabel?: string;
  formattedPrice?: string;
  ctaHref?: string;
}

export function MobileStickyCta({
  project,
  projectName,
  startingPrice,
  ctaText = 'Get Price & Availability',
  targetSectionId = 'contact-details',
  className = '',
  priceLabel,
  formattedPrice,
  ctaHref,
}: MobileStickyCtaProps) {
  const { openEnquiry } = useEnquiry();
  const { openBrochureModal } = useProjectInteraction();
  const { trackEvent } = useVisitorTelemetry();
  const displayName = project?.name || projectName || 'Great Homes';

  const hasBrochure = Boolean(project && (project.hasBrochure || project.brochure?.available));

  const handleOpenBrochure = () => {
    if (!project) return;
    trackEvent({
      eventType: 'BROCHURE_CLICKED',
      entityType: 'PROJECT',
      entityId: project.id,
      entitySlug: project.slug,
      metadata: {
        placement: 'mobile_sticky_cta',
        projectName: project.name,
      },
    }).catch(() => {});
    openBrochureModal();
  };

  // Determine pricing and label
  const effectiveStartingPrice = project ? project.pricing?.startingPrice : startingPrice;
  const derivedPrice =
    effectiveStartingPrice && effectiveStartingPrice > 0
      ? formatIndianPrice(effectiveStartingPrice)
      : project
      ? 'Price on Request'
      : null;

  const displayPrice = formattedPrice || derivedPrice;
  const displayLabel = priceLabel || (derivedPrice ? 'Starting Price' : 'Great Homes');

  const scrollToSection = (sectionId: string = targetSectionId) => {
    if (typeof window === 'undefined') return;
    if (!scrollToProjectSection(sectionId)) {
      // Fallback: smooth scroll toward bottom
      window.scrollTo({
        top: document.body.scrollHeight - 600,
        behavior: 'smooth',
      });
    }
  };

  const handleAction = (requestVisit: boolean, fallbackSectionId: string = targetSectionId) => {
    if (project?.slug) {
      openEnquiry({
        contextType: 'PROJECT',
        projectSlug: project.slug,
        projectName: project.name,
        locationName: project.location?.name,
        title: project.name,
        priceDisplay: displayPrice || undefined,
        requestSiteVisit: requestVisit,
        subtitle: requestVisit
          ? 'Schedule a guided property inspection visit'
          : 'Get verified project brochures, floor plans, and pricing intelligence',
      });
      return;
    }
    scrollToSection(fallbackSectionId);
  };

  return (
    <aside
      id="mobile-sticky-conversion-bar"
      role="region"
      aria-label={`Conversion actions for ${displayName}`}
      className={`fixed inset-x-0 bottom-14 md:bottom-0 z-40 lg:hidden bg-white/95 backdrop-blur-md border-t border-[var(--color-border)] px-3.5 sm:px-4 py-2.5 shadow-lg select-none ${className}`}
      style={{ paddingBottom: 'max(0.625rem, env(safe-area-inset-bottom))' }}
    >
      <div className="max-w-md mx-auto flex items-center justify-between gap-2 sm:gap-3">
        {/* Left Column: Pricing or Great Homes Identity */}
        <div className="min-w-0 flex-1 flex flex-col justify-center">
          <span className="text-[9px] sm:text-[10px] uppercase tracking-wider font-semibold text-[var(--color-foreground)]/50 font-display truncate">
            {displayLabel}
          </span>
          <span className="text-sm sm:text-base font-display font-bold text-[#111111] leading-tight truncate">
            {displayPrice || displayName}
          </span>
        </div>

        {/* Right Actions: Brochure + Secondary Visit + Primary Conversion CTA */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Brochure Action: visible if project has verified brochure */}
          {hasBrochure && (
            <button
              type="button"
              onClick={handleOpenBrochure}
              data-testid="sticky-mobile-download-brochure-button"
              className="inline-flex items-center justify-center gap-1 py-2 px-2.5 rounded-xl border border-[#E85D3F]/35 bg-white hover:bg-[#FAFAF8] text-[#111111] text-xs font-semibold font-display transition-colors shadow-2xs active:scale-95 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-[#E85D3F] cursor-pointer shrink-0"
              aria-label={`Download brochure for ${displayName}`}
            >
              <Download className="w-3.5 h-3.5 text-[#E85D3F] shrink-0" aria-hidden="true" />
              <span className="hidden min-[380px]:inline">Brochure</span>
            </button>
          )}

          {/* Secondary Action: Visit / Schedule Site Visit */}
          {!ctaHref && (
            <button
              type="button"
              onClick={() => handleAction(true, 'contact-details')}
              className={`${hasBrochure ? 'hidden min-[420px]:inline-flex' : 'hidden min-[360px]:inline-flex'} items-center justify-center gap-1 py-2 px-2.5 rounded-xl border border-[var(--color-border)] hover:bg-[#FAFAF8] text-[#111111] text-xs font-semibold font-display transition-colors shadow-2xs active:scale-95 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] cursor-pointer`}
              aria-label={`Schedule a site visit for ${displayName}`}
            >
              <Calendar className="w-3.5 h-3.5 text-[#E85D3F]" />
              <span>Visit</span>
            </button>
          )}

          {/* Primary CTA: Link or Button */}
          {ctaHref ? (
            <Link
              href={ctaHref}
              className="py-2.5 px-3.5 sm:px-4 rounded-xl bg-[#E85D3F] hover:bg-[#D44C2F] active:scale-[0.98] text-white text-xs sm:text-sm font-semibold font-display flex items-center justify-center gap-1.5 transition-all shadow-xs focus:outline-hidden focus-visible:ring-2 focus-visible:ring-[#E85D3F]"
              aria-label={`${ctaText} for ${displayName}`}
            >
              <span className="whitespace-nowrap">{ctaText}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => handleAction(false, targetSectionId)}
              className="py-2.5 px-3.5 sm:px-4 rounded-xl bg-[#E85D3F] hover:bg-[#D44C2F] active:scale-[0.98] text-white text-xs sm:text-sm font-semibold font-display flex items-center justify-center gap-1.5 transition-all shadow-xs focus:outline-hidden focus-visible:ring-2 focus-visible:ring-[#E85D3F] cursor-pointer"
              aria-label={`${ctaText} for ${displayName}`}
            >
              <span className="whitespace-nowrap">{ctaText}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
