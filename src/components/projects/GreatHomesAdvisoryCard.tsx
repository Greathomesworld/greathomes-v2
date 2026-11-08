'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  Headphones,
  Download,
  Calendar,
  Phone,
  Share2,
  ArrowRight,
  CheckCircle2,
  TrendingUp,
  Check,
} from 'lucide-react';
import { PublicProjectDto } from '@/src/domain/projects/dto/projectDto';
import { useEnquiry } from '@/src/components/enquiry/EnquiryContext';
import { useProjectInteraction } from './ProjectInteractionContext';
import { useVisitorTelemetry } from '@/src/components/telemetry/VisitorTelemetryProvider';
import { formatIndianPrice } from '@/src/components/discovery/formatters';

interface GreatHomesAdvisoryCardProps {
  project: PublicProjectDto;
  mode?: 'PROJECT' | 'RESALE' | 'RENTAL';
  className?: string;
}

const BENEFIT_STATEMENTS = [
  'Project & RERA verified facts',
  'Zero brokerage on builder bookings',
  'Personalised site visit assistance',
  'Latest price & availability',
] as const;

export function GreatHomesAdvisoryCard({
  project,
  mode = 'PROJECT',
  className = '',
}: GreatHomesAdvisoryCardProps) {
  const { openEnquiry } = useEnquiry();
  const { openBrochureModal } = useProjectInteraction();
  const { trackEvent } = useVisitorTelemetry();
  const [copied, setCopied] = useState(false);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  const isProjectMode = mode === 'PROJECT';
  const isRental = mode === 'RENTAL';
  const isResale = mode === 'RESALE';
  const isFullWidthMode = isResale || isRental;

  // Preserve existing pricing business rules from DTO
  const startingPrice = project.pricing?.startingPrice ?? project.startingPrice ?? null;
  const hasStartingPrice = typeof startingPrice === 'number' && startingPrice > 0;
  const priceDisplay = hasStartingPrice ? formatIndianPrice(startingPrice) : 'Price on Request';

  const lowestSqftPrice = project.pricing?.lowestEffectivePricePerSqft ?? null;
  const hasRatePerSqFt = typeof lowestSqftPrice === 'number' && lowestSqftPrice > 0;
  const ratePerSqFtDisplay = hasRatePerSqFt
    ? `₹${Math.round(lowestSqftPrice).toLocaleString('en-IN')}`
    : null;

  const hasBrochure = Boolean(project.hasBrochure || project.brochure?.available);

  const handleOpenEnquiry = (requestVisit = false) => {
    openEnquiry({
      contextType: isRental ? 'RENTAL' : isResale ? 'RESALE' : 'PROJECT',
      projectSlug: project.slug,
      projectName: project.name,
      locationName: project.location?.name,
      priceDisplay,
      title: isRental
        ? `${project.name} — Rental Assistance`
        : isResale
        ? `${project.name} — Resale Assistance`
        : `${project.name} — Great Homes Advisory`,
      subtitle: requestVisit
        ? 'Schedule a guided property inspection visit'
        : 'Get latest price sheet, inventory availability & floor plans',
      requestSiteVisit: requestVisit,
    });
  };

  const handleDownloadBrochure = () => {
    if (!isProjectMode || !hasBrochure) return;
    trackEvent({
      eventType: 'BROCHURE_CLICKED',
      entityType: 'PROJECT',
      entityId: project.id,
      entitySlug: project.slug,
      metadata: {
        placement: 'advisory_card',
        projectName: project.name,
      },
    }).catch(() => {});
    openBrochureModal();
  };

  const triggerCopiedFeedback = () => {
    setCopied(true);
    if (copyTimeoutRef.current) {
      clearTimeout(copyTimeoutRef.current);
    }
    copyTimeoutRef.current = setTimeout(() => {
      setCopied(false);
    }, 2000);
  };

  const handleShare = async () => {
    const canonicalUrl =
      typeof window !== 'undefined'
        ? `${window.location.origin}/projects/${project.slug}`
        : `/projects/${project.slug}`;

    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: project.name,
          text: `Check out ${project.name} on Great Homes`,
          url: canonicalUrl,
        });
        return;
      } catch (err) {
        if ((err as { name?: string })?.name === 'AbortError') {
          return;
        }
      }
    }

    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(canonicalUrl);
        triggerCopiedFeedback();
      } catch {}
    }
  };

  return (
    <div
      id="great-homes-advisory-card"
      data-advisory-mode={mode}
      className={`bg-white rounded-2xl border border-[#111111]/10 shadow-[0_4px_20px_rgba(17,17,17,0.04)] p-4 xl:p-5 w-full ${
        isFullWidthMode ? 'sm:p-6 lg:p-7' : ''
      } ${className}`}
    >
      <div
        className={
          isFullWidthMode
            ? 'flex flex-col gap-4 lg:grid lg:grid-cols-12 lg:gap-8 lg:items-center'
            : 'flex flex-col gap-4'
        }
      >
        {/* Left / Top Group: Identity Header, Pricing Panel, and Benefit Statements */}
        <div className={isFullWidthMode ? 'flex flex-col gap-4 lg:col-span-7 min-w-0' : 'flex flex-col gap-4 min-w-0'}>
          {/* 1-3. Headset Icon + Heading + Project-Specific Subtitle */}
          <div className="flex items-center gap-2.5 xl:gap-3 pb-3.5 border-b border-[#111111]/[0.08]">
            <div className="w-9 h-9 xl:w-10 xl:h-10 rounded-xl bg-[#FDF0EC] flex items-center justify-center text-[#E85D3F] shrink-0">
              <Headphones className="w-4.5 h-4.5 xl:w-5 xl:h-5" strokeWidth={1.85} aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-editorial text-[17px] xl:text-[19px] leading-tight text-[#111111] tracking-tight whitespace-nowrap">
                Great Homes Advisory
              </h3>
              <p
                className="text-[11px] xl:text-xs font-body text-[#111111]/60 leading-snug mt-0.5 truncate"
                title={`Expert guidance for ${project.name}`}
              >
                Expert guidance for {project.name}
              </p>
            </div>
          </div>

          {/* 4. Horizontal Two-Column Pricing Panel */}
          <div
            data-testid="advisory-pricing-panel"
            className={`bg-[#F7F7F5] rounded-xl p-3 xl:p-3.5 border border-[#111111]/[0.08] ${
              isFullWidthMode ? 'max-w-md' : ''
            }`}
          >
            <div
              className={
                ratePerSqFtDisplay
                  ? 'grid grid-cols-2 gap-2.5 xl:gap-3 items-center'
                  : 'grid grid-cols-1'
              }
            >
              <div className="min-w-0">
                <div className="text-[9px] xl:text-[10px] font-display font-semibold uppercase tracking-wider text-[#111111]/55 whitespace-nowrap">
                  STARTING PRICE
                </div>
                <div
                  data-testid="advisory-starting-price"
                  className={`mt-0.5 text-[#111111] leading-tight whitespace-nowrap ${
                    hasStartingPrice
                      ? 'font-editorial text-lg xl:text-[22px]'
                      : 'font-display font-bold text-sm xl:text-base'
                  }`}
                >
                  {priceDisplay}
                </div>
              </div>

              {ratePerSqFtDisplay && (
                <div className="min-w-0 border-l border-[#111111]/10 pl-2.5 xl:pl-3">
                  <div className="text-[9px] xl:text-[10px] font-display font-semibold uppercase tracking-wider text-[#111111]/55 whitespace-nowrap">
                    RATE / SQ. FT.
                  </div>
                  <div
                    data-testid="advisory-rate-sqft"
                    className="mt-0.5 font-editorial text-lg xl:text-[22px] text-[#111111] leading-tight whitespace-nowrap"
                  >
                    {ratePerSqFtDisplay}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 5. Four Benefit Statements */}
          <ul
            className={
              isFullWidthMode
                ? 'grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs font-body text-[#111111]/80'
                : 'space-y-2 text-xs font-body text-[#111111]/80'
            }
          >
            {BENEFIT_STATEMENTS.map((statement) => (
              <li key={statement} className="flex items-center gap-2">
                <CheckCircle2
                  className="w-4 h-4 text-[#E85D3F] shrink-0"
                  strokeWidth={1.85}
                  aria-hidden="true"
                />
                <span className="leading-snug">{statement}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Right / Bottom Group: Pale Coral Availability Callout, CTAs, and Utility Actions */}
        <div
          className={
            isFullWidthMode
              ? 'flex flex-col gap-3 lg:col-span-5 lg:pl-7 lg:border-l lg:border-[#111111]/[0.08] min-w-0'
              : 'flex flex-col gap-3 min-w-0'
          }
        >
          {/* 6. Pale Coral Availability Callout */}
          <div className="rounded-xl bg-[#FFF6F3] border border-[#E85D3F]/20 px-3 xl:px-3.5 py-2.5">
            <div className="flex items-center gap-1.5">
              <TrendingUp
                className="w-3.5 h-3.5 text-[#E85D3F] shrink-0"
                strokeWidth={2.1}
                aria-hidden="true"
              />
              <span className="text-[11px] xl:text-xs font-display font-bold text-[#111111] leading-snug">
                Want latest price & availability?
              </span>
            </div>
            <p className="mt-0.5 text-[11px] font-body text-[#111111]/65 leading-snug">
              Get verified units, payment plans, and developer availability.
            </p>
          </div>

          {/* 7 & 8. Primary and Secondary CTAs */}
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => handleOpenEnquiry(false)}
              data-testid="advisory-get-price-button"
              className="gh-cta-shine-btn group relative overflow-hidden w-full h-11 px-3 xl:px-4 rounded-xl bg-[#E85D3F] hover:bg-[#D44C2F] text-white text-xs xl:text-sm font-display font-semibold inline-flex items-center justify-center gap-1.5 xl:gap-2 whitespace-nowrap transition-colors shadow-2xs cursor-pointer focus:outline-hidden focus-visible:ring-2 focus-visible:ring-[#E85D3F]"
            >
              <span
                aria-hidden="true"
                className="gh-cta-shine-bar pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/30 to-transparent opacity-0"
              />
              <span className="relative z-10 inline-flex items-center justify-center gap-1.5 xl:gap-2 whitespace-nowrap">
                <span>Get Price & Availability</span>
                <ArrowRight className="w-3.5 h-3.5 xl:w-4 xl:h-4 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5" />
              </span>
            </button>

            {isProjectMode && hasBrochure && (
              <button
                type="button"
                onClick={handleDownloadBrochure}
                data-testid="advisory-download-brochure-button"
                className="w-full h-10 px-3 xl:px-4 rounded-xl border border-[#E85D3F]/30 hover:border-[#E85D3F]/55 bg-white hover:bg-[#FFF6F3]/40 text-[#111111] text-xs xl:text-[13px] font-display font-semibold inline-flex items-center justify-center gap-1.5 xl:gap-2 whitespace-nowrap transition-colors shadow-2xs cursor-pointer focus:outline-hidden focus-visible:ring-2 focus-visible:ring-[#E85D3F]"
              >
                <Download className="w-3.5 h-3.5 xl:w-4 xl:h-4 text-[#E85D3F] shrink-0" aria-hidden="true" />
                <span>Download Brochure</span>
              </button>
            )}
          </div>

          {/* 9. Three Equal-Width Utility Actions: Visit, Call, Share */}
          <div className="grid grid-cols-3 gap-1.5 xl:gap-2 pt-0.5">
            <button
              type="button"
              onClick={() => handleOpenEnquiry(true)}
              data-testid="advisory-visit-button"
              className="h-9 px-1.5 xl:px-2 rounded-lg border border-[#111111]/12 bg-white hover:bg-[#FAFAF8] text-[#111111]/85 hover:text-[#111111] transition-colors text-[11px] xl:text-xs font-display font-medium inline-flex items-center justify-center gap-1 xl:gap-1.5 whitespace-nowrap cursor-pointer focus:outline-hidden focus-visible:ring-2 focus-visible:ring-[#E85D3F]"
            >
              <Calendar className="w-3 h-3 xl:w-3.5 xl:h-3.5 text-[#111111]/60 shrink-0" aria-hidden="true" />
              <span>Visit</span>
            </button>

            <a
              href="tel:08069640999"
              data-testid="advisory-call-link"
              className="h-9 px-1.5 xl:px-2 rounded-lg border border-[#111111]/12 bg-white hover:bg-[#FAFAF8] text-[#111111]/85 hover:text-[#111111] transition-colors text-[11px] xl:text-xs font-display font-medium inline-flex items-center justify-center gap-1 xl:gap-1.5 whitespace-nowrap cursor-pointer focus:outline-hidden focus-visible:ring-2 focus-visible:ring-[#E85D3F]"
            >
              <Phone className="w-3 h-3 xl:w-3.5 xl:h-3.5 text-[#111111]/60 shrink-0" aria-hidden="true" />
              <span>Call</span>
            </a>

            <button
              type="button"
              onClick={handleShare}
              data-testid="advisory-share-button"
              className="h-9 px-1.5 xl:px-2 rounded-lg border border-[#111111]/12 bg-white hover:bg-[#FAFAF8] text-[#111111]/85 hover:text-[#111111] transition-colors text-[11px] xl:text-xs font-display font-medium inline-flex items-center justify-center gap-1 xl:gap-1.5 whitespace-nowrap cursor-pointer focus:outline-hidden focus-visible:ring-2 focus-visible:ring-[#E85D3F]"
            >
              {copied ? (
                <>
                  <Check className="w-3 h-3 xl:w-3.5 xl:h-3.5 text-[#218C5A] shrink-0" aria-hidden="true" />
                  <span className="text-[#218C5A] font-semibold">Copied!</span>
                </>
              ) : (
                <>
                  <Share2 className="w-3 h-3 xl:w-3.5 xl:h-3.5 text-[#111111]/60 shrink-0" aria-hidden="true" />
                  <span>Share</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

