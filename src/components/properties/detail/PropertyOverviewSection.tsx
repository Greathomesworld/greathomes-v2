'use client';

import React, { useState } from 'react';
import {
  ShieldCheck,
  Sparkles,
  Building2,
  MapPin,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Clock,
  Maximize2,
} from 'lucide-react';
import { PropertyDetailViewModel } from '@/src/domain/projects/viewModels/listingDetailViewModel';

interface PropertyOverviewSectionProps {
  listing: PropertyDetailViewModel;
}

export function PropertyOverviewSection({ listing }: PropertyOverviewSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const isResale = listing.mode === 'RESALE';

  const verifiedWord = listing.isVerified ? 'verified ' : '';
  const defaultNarrative = isResale
    ? `An exclusive ${verifiedWord}${listing.configuration} resale ${listing.propertyTypeDisplay.toLowerCase()} offering refined layouts, natural ventilation, and strategic residential positioning${
        listing.project
          ? ` within the ${listing.project.name} community`
          : listing.location
          ? ` in ${listing.location.name}, Kolkata`
          : ' in Kolkata'
      }.`
    : `A well-appointed ${verifiedWord}${listing.configuration} rental ${listing.propertyTypeDisplay.toLowerCase()} offering practical living space, natural light, and convenient residential access${
        listing.project
          ? ` within the ${listing.project.name} community`
          : listing.location
          ? ` in ${listing.location.name}, Kolkata`
          : ' in Kolkata'
      }.`;

  const descriptionText = listing.description?.trim() || defaultNarrative;
  const isLongDescription = descriptionText.length > 210;

  // Factual highlights derived strictly from real listing data
  const factualBulletPoints = [
    {
      icon: ShieldCheck,
      text: `${listing.configuration} ${listing.propertyTypeDisplay} (${listing.furnishingDisplay})`,
    },
    {
      icon: Sparkles,
      text:
        listing.facingDisplay !== 'Not Specified'
          ? `${listing.facingDisplay} facing orientation · ${listing.floorCategoryDisplay}`
          : `Positioned on ${listing.floorCategoryDisplay} with natural ventilation`,
    },
    {
      icon: Building2,
      text: listing.project
        ? `Access to ${listing.project.name} residential community amenities`
        : `${listing.possessionDisplay} · ${listing.listingPartyLabel}`,
    },
    {
      icon: MapPin,
      text: listing.location
        ? `Located in ${listing.location.name}, Kolkata residential micro-market`
        : 'Located in an established residential corridor in Kolkata',
    },
  ];

  const areaBadges = [
    listing.carpetAreaDisplay
      ? { label: 'Carpet Area', value: listing.carpetAreaDisplay }
      : null,
    listing.builtUpAreaDisplay
      ? { label: 'Built-up Area', value: listing.builtUpAreaDisplay }
      : null,
    listing.superBuiltUpAreaDisplay
      ? { label: 'Super Built-up Area', value: listing.superBuiltUpAreaDisplay }
      : null,
  ].filter((b): b is { label: string; value: string } => Boolean(b));

  return (
    <section id="overview" className="scroll-mt-32 space-y-4">
      <div className="bg-white rounded-2xl border border-[#E6E2DC] p-5 sm:p-6 shadow-2xs">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 md:divide-x md:divide-[#E6E2DC]">
          {/* Left Column: About This Home */}
          <div className="md:col-span-6 md:pr-6 space-y-3">
            <h2 className="text-base sm:text-lg font-display font-bold text-[#111111]">
              About This Home
            </h2>

            <div className="text-xs sm:text-sm text-[#111111]/75 font-body leading-relaxed whitespace-pre-line">
              {isLongDescription && !expanded ? (
                <>
                  <span>{descriptionText.slice(0, 210).trim()}...</span>
                </>
              ) : (
                <span>{descriptionText}</span>
              )}
            </div>

            {isLongDescription && (
              <button
                type="button"
                onClick={() => setExpanded(prev => !prev)}
                className="inline-flex items-center gap-1 text-xs font-display font-semibold text-[#E85D3F] hover:text-[#D44C2F] transition-colors cursor-pointer"
              >
                <span>{expanded ? 'Show Less' : 'Read More'}</span>
                {expanded ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>
            )}

            {/* Area Breakdown Pills when multiple area metrics exist */}
            {areaBadges.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 pt-2">
                {areaBadges.map(area => (
                  <span
                    key={area.label}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#FAFAF8] border border-[#E6E2DC] text-[11px] font-body text-[#111111]/75"
                  >
                    <Maximize2 className="w-3 h-3 text-[#E85D3F]" />
                    <span>{area.label}:</span>
                    <strong className="font-display font-semibold text-[#111111]">
                      {area.value}
                    </strong>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Right Column: Key Factual Highlights (Matches Desktop Reference) */}
          <div className="md:col-span-6 md:pl-6 flex flex-col justify-center space-y-3 pt-4 md:pt-0 border-t md:border-t-0 border-[#E6E2DC]">
            {factualBulletPoints.map((item, idx) => {
              const Icon = item.icon;
              return (
                <div key={idx} className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-md bg-[#FFF5F0] border border-[#F3DFD5] flex items-center justify-center text-[#E85D3F] shrink-0 mt-0.5">
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-xs sm:text-sm font-body text-[#111111]/85 leading-snug">
                    {item.text}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* MOBILE VERIFICATION DETAILS SUMMARY CARD (Strictly tied to listing.isVerified) */}
      {listing.isVerified ? (
        <div className="md:hidden rounded-2xl bg-[#F2FAF6] border border-[#218C5A]/25 p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#218C5A]" />
              <span className="text-xs font-display font-bold text-[#111111]">
                Verification Details
              </span>
            </div>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#1E8E5A] text-white text-[10px] font-display font-semibold">
              <CheckCircle2 className="w-3 h-3" />
              <span>Verified Listing</span>
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2.5 text-[11px] font-body text-[#111111]/80">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#218C5A] shrink-0" />
              <span className="truncate">Listing Verified</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#218C5A] shrink-0" />
              <span className="truncate">Specs Cross-checked</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#218C5A] shrink-0" />
              <span className="truncate">{listing.listingPartyLabel}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#218C5A] shrink-0" />
              <span className="truncate">Great Homes Assisted</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="md:hidden rounded-2xl bg-[#FAFAF8] border border-[#E6E2DC] p-4 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#111111]/60" />
              <span className="text-xs font-display font-bold text-[#111111]">
                Verification Status
              </span>
            </div>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#111111]/8 text-[#111111]/75 text-[10px] font-display font-semibold">
              <span>Verification Pending</span>
            </span>
          </div>

          <p className="text-[11px] font-body text-[#111111]/70 leading-relaxed">
            This listing is currently under Great Homes review. Request assistance from our team to confirm documentation before a site visit.
          </p>
        </div>
      )}
    </section>
  );
}
