'use client';

import React from 'react';
import { ArrowRight, Calendar, CheckCircle2, ShieldCheck } from 'lucide-react';
import { useEnquiry } from '@/src/components/enquiry/EnquiryContext';

interface ProjectFinalCtaProps {
  projectName: string;
  projectSlug?: string;
}

export function ProjectFinalCta({ projectName, projectSlug }: ProjectFinalCtaProps) {
  const { openEnquiry } = useEnquiry();

  const pillars = [
    'Guided Property Buying',
    'Site Visit Assistance',
    'Developer Booking Assistance',
    'No Brokerage on Developer Bookings',
    'Dedicated Great Homes Advisor',
  ];

  const handleOpenEnquiry = (requestVisit = false) => {
    openEnquiry({
      contextType: 'PROJECT',
      projectSlug,
      projectName,
      title: projectName,
      requestSiteVisit: requestVisit,
      subtitle: requestVisit
        ? 'Schedule an assisted site visit with a Great Homes specialist'
        : 'Get verified project brochures, floor plans, and pricing intelligence',
    });
  };

  return (
    <section
      id="contact-details"
      aria-labelledby="final-cta-heading"
      className="pt-6 border-t border-[var(--color-border)]"
    >
      <div className="rounded-2xl border border-[#E85D3F]/20 bg-gradient-to-br from-[#FFF3EA] via-[#FFF8F3] to-[#FAFAF5] px-5 py-5 sm:px-7 sm:py-6 text-center space-y-3.5 shadow-2xs">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-display font-semibold text-[#C84326] bg-[#E85D3F]/12 border border-[#E85D3F]/25">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Great Homes Assisted Buying</span>
        </div>

        <div className="space-y-1">
          <h2
            id="final-cta-heading"
            className="text-xl sm:text-2xl font-display font-semibold text-[#111111] tracking-tight"
          >
            Get Project Details & Advisory
          </h2>
          <p className="text-xs sm:text-sm font-body text-[#111111]/75 max-w-2xl mx-auto leading-snug">
            Connect with our property specialists for verified availability, architectural specifications, and end-to-end guidance for {projectName}.
          </p>
        </div>

        {/* Assisted Buying Value Pillars */}
        <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2 pt-0.5">
          {pillars.map((pillar, idx) => (
            <span
              key={idx}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/90 border border-[#E85D3F]/15 text-[11px] sm:text-xs font-display font-medium text-[#111111]/85 shadow-2xs"
            >
              <CheckCircle2 className="w-3 h-3 text-[var(--color-success)] shrink-0" />
              <span>{pillar}</span>
            </span>
          ))}
        </div>

        {/* Canonical Interactive CTAs */}
        <div className="pt-1 flex flex-col sm:flex-row items-center justify-center gap-2.5 sm:gap-3">
          <button
            type="button"
            onClick={() => handleOpenEnquiry(false)}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#E85D3F] hover:bg-[#D44C2F] text-white font-display font-semibold text-xs sm:text-sm tracking-wide transition-all shadow-xs active:scale-[0.98] focus:outline-hidden focus-visible:ring-2 focus-visible:ring-[#E85D3F] focus-visible:ring-offset-2 cursor-pointer"
          >
            <span>Get Project Details</span>
            <ArrowRight className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => handleOpenEnquiry(true)}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl border border-[#111111]/15 bg-white hover:bg-[#FAFAF8] text-[#111111] font-display font-medium text-xs sm:text-sm transition-all focus:outline-hidden focus-visible:ring-2 focus-visible:ring-[#111111] focus-visible:ring-offset-2 cursor-pointer"
          >
            <Calendar className="w-4 h-4 text-[#111111]/60" />
            <span>Schedule a Site Visit</span>
          </button>
        </div>

        <div className="text-[11px] font-body text-[#111111]/55">
          Independent advisory • Direct builder pricing • Strict privacy protection
        </div>
      </div>
    </section>
  );
}
