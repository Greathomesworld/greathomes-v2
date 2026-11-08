import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, ShieldCheck, MapPin, Building, Sparkles } from 'lucide-react';
import { HomeProjectCardData } from './HomeExploreProjects';

interface HomeProjectSpotlightProps {
  project: HomeProjectCardData;
}

export function HomeProjectSpotlight({ project }: HomeProjectSpotlightProps) {
  return (
    <section 
      aria-labelledby="spotlight-project-heading"
      className="py-16 md:py-24 bg-[#111111] text-white border-b border-white/10 relative overflow-hidden"
    >
      {/* Subtle ambient luxury background lighting */}
      <div 
        className="absolute top-0 right-1/4 w-96 h-96 bg-[#E85D3F]/10 rounded-full blur-3xl pointer-events-none" 
        aria-hidden="true"
      />
      <div 
        className="absolute bottom-0 left-10 w-80 h-80 bg-white/5 rounded-full blur-3xl pointer-events-none" 
        aria-hidden="true"
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-center">
        {/* LEFT: Featured Project Editorial Information */}
        <div className="lg:col-span-5 space-y-6 order-2 lg:order-1">
          {/* Eyebrow Pill */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded bg-[#E85D3F]/15 text-[#E85D3F] text-xs font-bold uppercase tracking-widest font-display border border-[#E85D3F]/30 shadow-xs">
            <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Curated Development Spotlight</span>
          </div>

          {/* Project Title — Playfair Display / font-editorial strictly enforced */}
          <h2 
            id="spotlight-project-heading"
            className="text-3xl sm:text-4xl md:text-5xl lg:text-5xl font-editorial font-bold leading-[1.15] tracking-tight text-white"
          >
            {project.name}
          </h2>

          {/* Developer & Location Line — Inter / font-body */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-base text-neutral-300 font-body">
            <span>By</span>
            <span className="font-semibold text-white font-display">{project.developerName}</span>
            <span className="text-neutral-500">•</span>
            <span className="inline-flex items-center gap-1 text-neutral-300">
              <MapPin className="w-4 h-4 text-[#E85D3F] shrink-0" aria-hidden="true" />
              <span>{project.locationName}, Kolkata</span>
            </span>
          </div>

          {/* Metadata badges: Configuration, Construction Stage & Verified RERA */}
          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            {project.configurationString && (
              <span className="bg-white/10 text-neutral-200 border border-white/15 px-3 py-1 rounded text-xs font-semibold font-display">
                {project.configurationString}
              </span>
            )}
            
            {project.status && (
              <span className="bg-neutral-800 text-neutral-300 border border-neutral-700 px-3 py-1 rounded text-xs font-semibold font-display">
                {project.status === 'UNDER_CONSTRUCTION'
                  ? 'Under Construction'
                  : project.status === 'READY_TO_MOVE'
                  ? 'Ready to Move'
                  : project.status === 'NEW_LAUNCH'
                  ? 'New Launch'
                  : project.status.replace(/_/g, ' ')}
              </span>
            )}

            {project.isReraVerified && (
              <div 
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-[#218C5A]/20 border border-[#218C5A]/40 text-[#2ECC71] text-xs font-bold font-display"
                title={project.reraNumber ? `Registration: ${project.reraNumber}` : 'Government RERA registered and verified'}
              >
                <ShieldCheck className="w-4 h-4 text-[#2ECC71] shrink-0" aria-hidden="true" />
                <span>RERA Verified</span>
              </div>
            )}
          </div>

          {/* Starting Price block */}
          <div className="pt-2">
            <span className="text-[11px] text-neutral-400 uppercase tracking-widest font-display font-bold block mb-1">
              Indicative Starting Price
            </span>
            <div className="text-3xl sm:text-4xl font-display font-extrabold text-[#E85D3F] tracking-tight">
              {project.priceDisplay || 'Price on Request'}
            </div>
            {project.priceDisplay && (
              <span className="text-xs text-neutral-400 font-body block mt-0.5">
                Excludes government registration & applicable stamp duties
              </span>
            )}
          </div>

          {/* CTA actions */}
          <div className="pt-2 flex flex-wrap items-center gap-4">
            <Link
              href={`/projects/${project.slug}`}
              className="inline-flex items-center gap-2 px-7 py-3.5 bg-[#E85D3F] hover:bg-[#D54D30] text-white rounded-md font-display font-bold transition-all text-sm uppercase tracking-wider shadow-lg hover:shadow-orange-950/40 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#111111]"
            >
              <span>Explore Masterplan</span>
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </Link>

            <Link
              href={`/projects?location=${encodeURIComponent(project.locationSlug || 'kolkata')}`}
              className="inline-flex items-center gap-1.5 px-5 py-3.5 bg-transparent hover:bg-white/10 text-neutral-300 hover:text-white border border-white/20 hover:border-white/40 rounded-md font-display font-semibold transition-colors text-xs uppercase tracking-wider"
            >
              <span>Browse Area Projects</span>
            </Link>
          </div>
        </div>

        {/* RIGHT: Large Masterplan Image with next/image optimization */}
        <div className="lg:col-span-7 order-1 lg:order-2">
          <div className="relative group overflow-hidden rounded-2xl border border-white/15 bg-neutral-900 shadow-2xl aspect-16/10">
            {project.imageUrl ? (
              <Image
                src={project.imageUrl}
                alt={`${project.name} architectural elevation and landmark residential enclave`}
                fill
                sizes="(max-width: 1024px) 100vw, 58vw"
                className="object-cover group-hover:scale-103 transition-transform duration-700 ease-out"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-neutral-500 bg-neutral-900">
                <Building className="w-16 h-16 stroke-1 text-neutral-600 mb-2" aria-hidden="true" />
                <span className="text-xs font-display text-neutral-400 uppercase tracking-wider">
                  Verified Landmark Architectural Preview
                </span>
              </div>
            )}

            {/* Subtle luxury gradient vignette */}
            <div 
              className="absolute inset-0 bg-gradient-to-t from-[#111111]/80 via-transparent to-transparent pointer-events-none" 
              aria-hidden="true"
            />
            
            {/* Quick status badge on image for mobile & visual grounding */}
            <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between text-xs text-white/90 bg-[#111111]/80 backdrop-blur-md px-4 py-2.5 rounded-lg border border-white/10 pointer-events-none">
              <span className="font-display font-semibold tracking-wide truncate">
                {project.name} • {project.locationName}
              </span>
              <span className="text-neutral-400 font-display shrink-0 text-[11px] ml-2 hidden sm:inline-block">
                Great Homes Verified Landmark
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
