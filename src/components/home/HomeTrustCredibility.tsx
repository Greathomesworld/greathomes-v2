import React from 'react';
import Image from 'next/image';
import { ShieldCheck, Building2, FileCheck } from 'lucide-react';

export function HomeTrustCredibility() {
  const trustPoints = [
    {
      title: 'RERA Information',
      desc: 'Access available project registration details and their actual verification status.',
      icon: ShieldCheck,
    },
    {
      title: 'Developer Intelligence',
      desc: 'Explore developer profiles and residential projects using available master records.',
      icon: Building2,
    },
    {
      title: 'Verified Listings',
      desc: 'Look for the applicable verification status on eligible resale and rental listings.',
      icon: FileCheck,
    },
  ];

  return (
    <section 
      aria-labelledby="trust-credibility-heading"
      className="py-20 md:py-28 bg-white border-b border-[rgba(17,17,17,0.08)] overflow-hidden"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center">
          
          {/* LEFT: Asymmetric Editorial Column (Headline & Cropped Architectural Image) */}
          <div className="lg:col-span-5 space-y-6">
            <div className="flex items-center gap-2.5 mb-2">
              <span className="text-xs uppercase tracking-widest text-[#E85D3F] font-bold font-display">
                TRUST & CREDIBILITY
              </span>
              <span className="w-8 h-0.5 bg-[#E85D3F] inline-block rounded-full" aria-hidden="true" />
            </div>

            <h2 
              id="trust-credibility-heading"
              className="text-3xl sm:text-4xl lg:text-5xl font-editorial font-bold text-[#111111] tracking-tight leading-[1.15]"
            >
              A More <span className="text-[#E85D3F]">Confident</span> Way to Find a Home
            </h2>

            <p className="text-sm sm:text-base text-neutral-600 font-body leading-relaxed max-w-md">
              Built on transparency, verified information and a buyer-first approach.
            </p>

            {/* Integrated Architectural Cropped Image */}
            <div className="relative aspect-[16/10] rounded-2xl overflow-hidden border border-[rgba(17,17,17,0.08)] shadow-sm mt-6">
              <Image
                src="https://images.unsplash.com/photo-1590381105924-c72589b9ef3f?auto=format&fit=crop&w=1000&q=80"
                alt="Verified residential community in Kolkata"
                fill
                sizes="(max-width: 1024px) 100vw, 40vw"
                className="object-cover"
                loading="lazy"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
            </div>
          </div>

          {/* RIGHT: Three Horizontal Trust Points with Subtle Dividers */}
          <div className="lg:col-span-7 grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-6 divide-y md:divide-y-0 md:divide-x divide-neutral-200">
            {trustPoints.map((point, index) => {
              const IconComp = point.icon;
              return (
                <div key={index} className={`flex flex-col space-y-4 ${index > 0 ? 'pt-6 md:pt-0 md:pl-6' : ''}`}>
                  <div className="w-10 h-10 rounded-xl bg-[#FFF5EE] text-[#E85D3F] border border-[rgba(232,93,63,0.2)] flex items-center justify-center shrink-0">
                    <IconComp className="w-5 h-5" aria-hidden="true" />
                  </div>
                  <div>
                    <h3 className="text-base font-display font-bold text-[#111111] mb-2">
                      {point.title}
                    </h3>
                    <p className="text-xs sm:text-sm text-neutral-600 font-body leading-relaxed">
                      {point.desc}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

        </div>
      </div>
    </section>
  );
}
