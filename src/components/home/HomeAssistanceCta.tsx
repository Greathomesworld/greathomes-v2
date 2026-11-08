'use client';

import React from 'react';
import Image from 'next/image';
import {
  MessageSquare,
  Search,
  Calendar,
  FileText,
  Play,
  Building2,
  ChevronRight,
} from 'lucide-react';
import { useEnquiry } from '../enquiry/EnquiryContext';

export function HomeAssistanceCta() {
  const { openEnquiry } = useEnquiry();

  const benefits = [
    {
      icon: Search,
      title: 'Unbiased Project Advice',
      description: 'Independent and transparent guidance.',
    },
    {
      icon: Calendar,
      title: 'Site Visit Coordination',
      description: 'We schedule and accompany you.',
    },
    {
      icon: FileText,
      title: 'Documentation Guidance',
      description: 'End-to-end support through the process.',
    },
  ];

  const handleHowItWorksClick = () => {
    if (typeof window !== 'undefined') {
      const target = document.getElementById('why-great-homes');
      if (target) {
        target.scrollIntoView({ behavior: 'smooth' });
      }
    }
  };

  return (
    <section
      aria-labelledby="assistance-heading"
      className="relative py-16 sm:py-20 lg:py-24 bg-[#0D0D0D] text-white border-b border-white/10 overflow-hidden"
    >
      {/* Subtle top-right ambient warm gradient glow */}
      <div
        className="absolute top-0 right-0 w-[500px] h-[500px] bg-radial from-[#E85D3F]/15 via-transparent to-transparent pointer-events-none select-none"
        aria-hidden="true"
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-14 items-center">
          {/* LEFT COLUMN: Editorial Copy, Benefits & Actions */}
          <div className="space-y-6 sm:space-y-8">
            {/* Eyebrow */}
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2.5">
                <span
                  className="w-6 h-0.5 bg-[#E85D3F] rounded-full inline-block"
                  aria-hidden="true"
                />
                <span className="text-xs uppercase tracking-[0.2em] text-[#E85D3F] font-bold font-display">
                  GREAT HOMES ASSISTANCE
                </span>
              </div>

              {/* Headline */}
              <h2
                id="assistance-heading"
                className="text-3xl sm:text-5xl lg:text-6xl font-editorial font-bold text-white tracking-tight leading-[1.08] text-balance"
              >
                Not Sure <br className="hidden sm:inline" />
                Where to <span className="text-[#E85D3F]">Start?</span>
              </h2>

              {/* Supporting Copy */}
              <p className="text-sm sm:text-base lg:text-lg text-neutral-300 font-body leading-relaxed max-w-xl">
                Tell us what you're looking for. Our property advisors will help
                you evaluate, compare, and visit the right homes across Kolkata
                — with zero buyer brokerage on new developer bookings.
              </p>
            </div>

            {/* Benefit Blocks (Cards in Two-Column Grid Layout) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 sm:gap-4 pt-1">
              {benefits.map((b, idx) => {
                const IconComp = b.icon;
                return (
                  <div
                    key={idx}
                    className="flex flex-col space-y-2 p-3.5 sm:p-4 rounded-xl bg-white/5 border border-white/10 hover:border-white/20 transition-all"
                  >
                    <div className="w-10 h-10 rounded-full bg-white/10 text-[#E85D3F] border border-white/10 flex items-center justify-center shrink-0">
                      <IconComp className="w-5 h-5" aria-hidden="true" />
                    </div>
                    <div>
                      <h3 className="font-display font-bold text-xs sm:text-sm text-white leading-tight">
                        {b.title}
                      </h3>
                      <p className="font-body text-[11px] sm:text-xs text-neutral-400 mt-1 leading-normal line-clamp-2">
                        {b.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Primary & Secondary CTA Action Row */}
            <div className="flex flex-wrap items-center gap-3.5 sm:gap-5 pt-2">
              <button
                type="button"
                onClick={() =>
                  openEnquiry({
                    contextType: 'GENERAL',
                    title: 'General Property Buying Assistance',
                  })
                }
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-7 py-3.5 bg-[#E85D3F] hover:bg-[#D54D30] text-white rounded-xl font-display font-bold uppercase tracking-wider text-xs sm:text-sm transition-all shadow-lg hover:shadow-orange-950/50 cursor-pointer active:scale-98 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#0D0D0D]"
              >
                <MessageSquare className="w-4 h-4" aria-hidden="true" />
                <span>Talk to Great Homes</span>
              </button>

              <button
                type="button"
                onClick={handleHowItWorksClick}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-3 sm:py-3.5 text-neutral-300 hover:text-white font-display font-semibold text-xs sm:text-sm transition-colors cursor-pointer group rounded-xl hover:bg-white/5"
              >
                <div className="w-8 h-8 rounded-full bg-white/10 group-hover:bg-[#E85D3F] border border-white/15 flex items-center justify-center text-white transition-colors shrink-0">
                  <Play className="w-3.5 h-3.5 fill-current ml-0.5" aria-hidden="true" />
                </div>
                <span>How it works</span>
              </button>
            </div>

            {/* Verified Brand Metric Strip */}
            <div className="pt-6 border-t border-white/10 flex flex-wrap items-center gap-6 sm:gap-8 text-xs font-display">
              <div className="space-y-0.5">
                <span className="text-base sm:text-lg font-extrabold text-white block tracking-tight">
                  RERA-Referenced
                </span>
                <span className="text-neutral-400 text-[11px] font-body">
                  Projects & Curated Listings
                </span>
              </div>
              <div className="hidden sm:block w-px h-7 bg-white/15" aria-hidden="true" />
              <div className="space-y-0.5">
                <span className="text-base sm:text-lg font-extrabold text-[#E85D3F] block tracking-tight">
                  Zero Brokerage
                </span>
                <span className="text-neutral-400 text-[11px] font-body">
                  On New Developer Bookings
                </span>
              </div>
              <div className="hidden sm:block w-px h-7 bg-white/15" aria-hidden="true" />
              <div className="space-y-0.5">
                <span className="text-base sm:text-lg font-extrabold text-white block tracking-tight">
                  1 City
                </span>
                <span className="text-neutral-400 text-[11px] font-body">
                  Kolkata Focused
                </span>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: Consultation Photography & Floating Glassmorphism Panels */}
          <div className="relative mt-4 md:mt-0">
            <div className="relative w-full max-w-xl mx-auto lg:max-w-none">
              {/* Background Arch Photo Framing (Visible on sm+ viewports) */}
              <div
                className="absolute -top-6 -right-2 sm:right-4 w-40 sm:w-52 h-44 sm:h-56 rounded-t-full overflow-hidden border border-white/15 opacity-70 z-0 pointer-events-none hidden sm:block shadow-2xl"
                aria-hidden="true"
              >
                <Image
                  src="https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=800&q=80"
                  alt="Modern residential towers in Kolkata"
                  fill
                  sizes="220px"
                  className="object-cover"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0D0D0D] via-transparent to-transparent" />
              </div>

              {/* Main Consultation Photograph Container */}
              <div className="relative z-10 rounded-2xl overflow-hidden border border-white/15 bg-neutral-900 shadow-2xl aspect-4/3 sm:aspect-16/11 w-full">
                <Image
                  src="https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=1200&q=85"
                  alt="Property advisor consulting with home buyers over architectural floor plans"
                  fill
                  loading="lazy"
                  sizes="(max-width: 1024px) 100vw, 50vw"
                  className="object-cover object-center"
                  referrerPolicy="no-referrer"
                />
                <div
                  className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent pointer-events-none"
                  aria-hidden="true"
                />
              </div>

              {/* Desktop Floating Glassmorphism Cards (hidden on mobile, positioned floating over photo) */}
              {/* Floating Card 1: Compare Projects (Top-Left) */}
              <div className="hidden lg:flex absolute -top-5 -left-4 z-20 items-center gap-3 p-3 bg-black/60 backdrop-blur-md border border-white/20 rounded-xl shadow-2xl max-w-[190px]">
                <div className="w-8 h-8 rounded-lg bg-[#E85D3F]/20 text-[#E85D3F] border border-[#E85D3F]/30 flex items-center justify-center shrink-0">
                  <Building2 className="w-4 h-4" aria-hidden="true" />
                </div>
                <div>
                  <span className="text-xs font-display font-bold text-white block">
                    Compare Projects
                  </span>
                  <div className="w-16 h-1 bg-white/20 rounded-full mt-1.5" />
                  <div className="w-10 h-1 bg-white/15 rounded-full mt-1" />
                </div>
              </div>

              {/* Floating Card 2: Schedule Site Visits (Top-Right) */}
              <div className="hidden lg:flex absolute top-10 -right-4 z-20 items-center gap-3 p-3 bg-black/60 backdrop-blur-md border border-white/20 rounded-xl shadow-2xl max-w-[200px]">
                <div className="w-8 h-8 rounded-lg bg-[#218C5A]/20 text-[#218C5A] border border-[#218C5A]/30 flex items-center justify-center shrink-0">
                  <Calendar className="w-4 h-4" aria-hidden="true" />
                </div>
                <div>
                  <span className="text-xs font-display font-bold text-white block">
                    Schedule Site Visits
                  </span>
                  <div className="w-20 h-1 bg-white/20 rounded-full mt-1.5" />
                  <div className="w-12 h-1 bg-white/15 rounded-full mt-1" />
                </div>
              </div>

              {/* Floating Card 3: Understand Documentation (Bottom-Left) */}
              <div className="hidden lg:flex absolute -bottom-5 left-6 z-20 items-center gap-3 p-3 bg-black/60 backdrop-blur-md border border-white/20 rounded-xl shadow-2xl max-w-[210px]">
                <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center shrink-0">
                  <FileText className="w-4 h-4" aria-hidden="true" />
                </div>
                <div>
                  <span className="text-xs font-display font-bold text-white block">
                    Understand Documentation
                  </span>
                  <div className="w-20 h-1 bg-white/20 rounded-full mt-1.5" />
                  <div className="w-12 h-1 bg-white/15 rounded-full mt-1" />
                </div>
              </div>

              {/* Social Proof Badge (Bottom Right Overlay on Photo) */}
              <div className="absolute bottom-3 right-3 sm:bottom-4 sm:right-4 z-20 flex items-center gap-3 p-2.5 sm:p-3 bg-black/80 backdrop-blur-md border border-white/20 rounded-xl shadow-2xl text-xs font-display">
                <div className="flex -space-x-2 shrink-0">
                  <img
                    src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=100&q=80"
                    alt=""
                    aria-hidden="true"
                    className="w-6 h-6 sm:w-7 sm:h-7 rounded-full border border-black object-cover"
                    referrerPolicy="no-referrer"
                  />
                  <img
                    src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=100&q=80"
                    alt=""
                    aria-hidden="true"
                    className="w-6 h-6 sm:w-7 sm:h-7 rounded-full border border-black object-cover"
                    referrerPolicy="no-referrer"
                  />
                  <img
                    src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=100&q=80"
                    alt=""
                    aria-hidden="true"
                    className="w-6 h-6 sm:w-7 sm:h-7 rounded-full border border-black object-cover"
                    referrerPolicy="no-referrer"
                  />
                </div>
                <div className="pr-1">
                  <span className="text-[11px] sm:text-xs font-bold text-white block leading-tight">
                    Trusted by home buyers
                  </span>
                  <span className="text-[10px] text-neutral-400 block">
                    across Kolkata
                  </span>
                </div>
                <ChevronRight
                  className="w-3.5 h-3.5 text-neutral-400 shrink-0"
                  aria-hidden="true"
                />
              </div>
            </div>

            {/* Mobile Panel Chips (Two-Column Grid Layout) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-4 lg:hidden">
              <div className="flex items-center gap-2.5 p-3 rounded-xl bg-white/5 border border-white/10 text-xs font-display text-white">
                <Building2 className="w-4 h-4 text-[#E85D3F] shrink-0" />
                <span>Compare Projects</span>
              </div>
              <div className="flex items-center gap-2.5 p-3 rounded-xl bg-white/5 border border-white/10 text-xs font-display text-white">
                <Calendar className="w-4 h-4 text-[#218C5A] shrink-0" />
                <span>Schedule Site Visits</span>
              </div>
              <div className="flex items-center gap-2.5 p-3 rounded-xl bg-white/5 border border-white/10 text-xs font-display text-white">
                <FileText className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Understand Documentation</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
