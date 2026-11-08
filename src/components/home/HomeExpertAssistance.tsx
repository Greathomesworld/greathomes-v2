'use client';

import React from 'react';
import Image from 'next/image';
import { ArrowRight, Sparkles, Sliders, Calendar } from 'lucide-react';
import { useEnquiry } from '../enquiry/EnquiryContext';

export function HomeExpertAssistance() {
  const { openEnquiry } = useEnquiry();

  const benefits = [
    {
      title: 'Personalized Recommendations',
      icon: Sparkles,
    },
    {
      title: 'Project Comparisons and Insights',
      icon: Sliders,
    },
    {
      title: 'Site Visit Assistance Across Kolkata',
      icon: Calendar,
    },
  ];

  return (
    <section 
      aria-labelledby="expert-assistance-heading"
      className="relative py-20 md:py-28 bg-[#FFF6F0] border-b border-[rgba(17,17,17,0.08)] overflow-hidden"
    >
      {/* Background Architectural Banner with Soft Warm Gradient */}
      <div className="absolute inset-0 z-0 pointer-events-none opacity-25">
        <Image
          src="https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1920&q=80"
          alt="Modern residential consultation setting"
          fill
          sizes="100vw"
          className="object-cover object-center"
          loading="lazy"
          referrerPolicy="no-referrer"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#FFF6F0] via-[#FFF6F0]/95 to-transparent" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center">
          
          {/* LEFT: Headline, Description & CTA */}
          <div className="lg:col-span-6 space-y-6">
            <div className="flex items-center gap-2.5 mb-2">
              <span className="text-xs uppercase tracking-widest text-[#E85D3F] font-bold font-display">
                GET EXPERT ASSISTANCE
              </span>
              <span className="w-8 h-0.5 bg-[#E85D3F] inline-block rounded-full" aria-hidden="true" />
            </div>

            <h2 
              id="expert-assistance-heading"
              className="text-3xl sm:text-4xl lg:text-5xl font-editorial font-bold text-[#111111] tracking-tight leading-[1.15]"
            >
              Let Us Help You Find the <span className="text-[#E85D3F]">Right Home.</span>
            </h2>

            <p className="text-sm sm:text-base text-neutral-600 font-body leading-relaxed max-w-xl">
              Share your requirements and our team will help you with personalized recommendations, project details and site visits.
            </p>

            <div className="pt-2">
              <button
                type="button"
                onClick={() =>
                  openEnquiry({
                    contextType: 'GENERAL',
                    title: 'Expert Property Advisory',
                    subtitle: 'Personalized recommendations, project comparisons and site visit assistance across Kolkata',
                  })
                }
                className="inline-flex items-center gap-2 px-7 py-3.5 bg-[#E85D3F] hover:bg-[#D54D30] text-white rounded-xl font-display font-bold text-sm tracking-wider uppercase transition-all shadow-sm cursor-pointer group"
              >
                <span>Talk to a Property Advisor</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* RIGHT: Three Assistance Benefits & Integrated Consultation Photo */}
          <div className="lg:col-span-6 space-y-6">
            <div className="bg-white/90 backdrop-blur-md p-8 rounded-2xl border border-[rgba(232,93,63,0.15)] shadow-sm space-y-5">
              <h3 className="text-xs font-display font-bold uppercase tracking-wider text-neutral-400">
                What Our Advisors Provide
              </h3>

              <div className="space-y-4">
                {benefits.map((b, index) => {
                  const IconComp = b.icon;
                  return (
                    <div key={index} className="flex items-center gap-4 p-3 rounded-xl bg-[#FAFAF8] border border-[rgba(17,17,17,0.04)]">
                      <div className="w-10 h-10 rounded-lg bg-[#FFF5EE] text-[#E85D3F] border border-[rgba(232,93,63,0.2)] flex items-center justify-center shrink-0">
                        <IconComp className="w-5 h-5" aria-hidden="true" />
                      </div>
                      <span className="text-sm sm:text-base font-display font-bold text-[#111111]">
                        {b.title}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
