import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, Rocket, Building2, Construction, KeyRound } from 'lucide-react';

export interface StageCounts {
  UPCOMING?: number;
  NEW_LAUNCH?: number;
  UNDER_CONSTRUCTION?: number;
  READY_TO_MOVE?: number;
  COMPLETED?: number;
  SOLD_OUT?: number;
}

interface HomeProjectStagesProps {
  stageCounts?: StageCounts;
}

export function HomeProjectStages({ stageCounts }: HomeProjectStagesProps) {
  const stages = [
    {
      id: 'UPCOMING',
      stageKey: 'UPCOMING' as const,
      title: 'Upcoming Projects',
      description: 'Discover upcoming developments in the pipeline.',
      href: '/projects?stage=UPCOMING',
      imageUrl: 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=800&q=80',
      icon: <Rocket className="w-6 h-6 text-[#E85D3F]" aria-hidden="true" />,
      cardBg: 'bg-gradient-to-b from-[#FFF5EE] via-[#FFF9F5] to-white',
      borderClass: 'border-[#FDE5D8] hover:border-[#E85D3F]/50',
      accentColor: 'text-[#E85D3F]',
      btnBg: 'border-orange-100 text-[#E85D3F] group-hover:bg-[#E85D3F] group-hover:text-white',
      gradientOverlay: 'from-[#FFF9F5] via-[#FFF9F5]/40 to-transparent',
      gradientSideOverlay: 'from-[#FFF5EE]/80 to-transparent',
      ctaText: 'Explore Upcoming',
    },
    {
      id: 'NEW_LAUNCH',
      stageKey: 'NEW_LAUNCH' as const,
      title: 'New Launch Projects',
      description: 'Explore newly launched residential developments.',
      href: '/projects?stage=NEW_LAUNCH',
      imageUrl: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80',
      icon: <Building2 className="w-6 h-6 text-[#E85D3F]" aria-hidden="true" />,
      cardBg: 'bg-gradient-to-b from-[#FFF6F0] via-[#FFF9F6] to-white',
      borderClass: 'border-[#FDE8DC] hover:border-[#E85D3F]/50',
      accentColor: 'text-[#E85D3F]',
      btnBg: 'border-orange-100 text-[#E85D3F] group-hover:bg-[#E85D3F] group-hover:text-white',
      gradientOverlay: 'from-[#FFF9F6] via-[#FFF9F6]/40 to-transparent',
      gradientSideOverlay: 'from-[#FFF6F0]/80 to-transparent',
      ctaText: 'Explore New Launches',
    },
    {
      id: 'UNDER_CONSTRUCTION',
      stageKey: 'UNDER_CONSTRUCTION' as const,
      title: 'Under Construction',
      description: 'Projects currently under active construction.',
      href: '/projects?stage=UNDER_CONSTRUCTION',
      imageUrl: 'https://images.unsplash.com/photo-1590381105924-c72589b9ef3f?auto=format&fit=crop&w=800&q=80',
      icon: <Construction className="w-6 h-6 text-[#2563EB]" aria-hidden="true" />,
      cardBg: 'bg-gradient-to-b from-[#F0F7FF] via-[#F8FAFC] to-white',
      borderClass: 'border-[#DBEAFE] hover:border-[#2563EB]/50',
      accentColor: 'text-[#1E6091]',
      btnBg: 'border-blue-100 text-[#2563EB] group-hover:bg-[#2563EB] group-hover:text-white',
      gradientOverlay: 'from-[#F8FAFC] via-[#F8FAFC]/40 to-transparent',
      gradientSideOverlay: 'from-[#F0F7FF]/80 to-transparent',
      ctaText: 'Explore Under Construction',
    },
    {
      id: 'READY_TO_MOVE',
      stageKey: 'READY_TO_MOVE' as const,
      title: 'Ready to Move',
      description: 'Completed and ready for possession.',
      href: '/projects?stage=READY_TO_MOVE',
      imageUrl: 'https://images.unsplash.com/photo-1576013551627-0cc20b96c2a7?auto=format&fit=crop&w=800&q=80',
      icon: <KeyRound className="w-6 h-6 text-[#16A34A]" aria-hidden="true" />,
      cardBg: 'bg-gradient-to-b from-[#F0FAF4] via-[#F8FCF9] to-white',
      borderClass: 'border-[#DCFCE7] hover:border-[#16A34A]/50',
      accentColor: 'text-[#16A34A]',
      btnBg: 'border-emerald-100 text-[#16A34A] group-hover:bg-[#16A34A] group-hover:text-white',
      gradientOverlay: 'from-[#F8FCF9] via-[#F8FCF9]/40 to-transparent',
      gradientSideOverlay: 'from-[#F0FAF4]/80 to-transparent',
      ctaText: 'Explore Ready to Move',
    },
  ];

  return (
    <section 
      aria-labelledby="project-stages-heading"
      className="py-16 md:py-20 bg-white border-b border-[rgba(17,17,17,0.08)]"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="max-w-3xl mb-12">
          {/* Eyebrow matching reference: EXPLORE BY PROJECT STAGE ─── */}
          <div className="flex items-center gap-2.5 mb-2">
            <span className="text-xs uppercase tracking-widest text-[#E85D3F] font-bold font-display">
              EXPLORE BY PROJECT STAGE
            </span>
            <span className="w-8 h-0.5 bg-[#E85D3F] inline-block rounded-full" aria-hidden="true" />
          </div>

          {/* Heading matching reference: Find Projects at Every Stage */}
          <h2 
            id="project-stages-heading"
            className="text-3xl sm:text-4xl lg:text-5xl font-display font-extrabold text-[#111111] tracking-tight mt-1"
          >
            Find Projects at <span className="text-[#E85D3F]">Every Stage</span>
          </h2>

          {/* Supporting Copy */}
          <p className="text-sm sm:text-base text-neutral-600 font-body mt-2.5 max-w-2xl leading-relaxed">
            From upcoming developments to ready-to-move homes, explore residential projects in Kolkata based on their current stage of construction.
          </p>
        </div>

        {/* Four-Column Stage Discovery Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {stages.map((stage) => {
            const count = stageCounts?.[stage.stageKey] ?? 0;
            const countLabel = count === 1 ? '1 project' : `${count} projects`;

            return (
              <Link
                key={stage.id}
                href={stage.href}
                aria-label={`${stage.title}: ${countLabel}`}
                className={`group relative rounded-2xl border ${stage.cardBg} ${stage.borderClass} p-6 flex flex-col justify-between shadow-xs hover:shadow-lg transition-all duration-300 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-[#111111] focus-visible:ring-offset-2 motion-reduce:transition-none overflow-hidden`}
              >
                <div>
                  {/* Top Architectural Imagery with Blended Gradient & Floating Icon */}
                  <div className="relative h-36 -mx-6 -mt-6 mb-5 overflow-hidden rounded-t-2xl bg-neutral-100">
                    <Image
                      src={stage.imageUrl}
                      alt={`${stage.title} architectural imagery`}
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                      className="object-cover object-top opacity-85 group-hover:scale-105 transition-transform duration-500 ease-out"
                      referrerPolicy="no-referrer"
                    />
                    {/* Seamless Blending Overlays */}
                    <div 
                      className={`absolute inset-0 bg-gradient-to-t ${stage.gradientOverlay}`} 
                      aria-hidden="true" 
                    />
                    <div 
                      className={`absolute inset-0 bg-gradient-to-r ${stage.gradientSideOverlay}`} 
                      aria-hidden="true" 
                    />

                    {/* Floating Icon Badge */}
                    <div className="absolute top-4 left-4 z-10 w-11 h-11 rounded-xl bg-white shadow-xs border border-white/80 flex items-center justify-center">
                      {stage.icon}
                    </div>
                  </div>

                  {/* Stage Title */}
                  <h3 className="text-lg font-display font-bold text-[#111111] group-hover:text-[#E85D3F] transition-colors mb-1.5">
                    {stage.title}
                  </h3>

                  {/* Description */}
                  <p className="text-xs text-neutral-600 font-body leading-relaxed mb-3">
                    {stage.description}
                  </p>

                  {/* Accurate Published Count */}
                  <p className="text-xs text-neutral-500 font-body font-medium mb-5">
                    {countLabel}
                  </p>
                </div>

                {/* Bottom Action Area with Arrow Affordance */}
                <div className="pt-3 border-t border-[rgba(17,17,17,0.06)] flex items-center justify-between">
                  <span className={`text-xs font-bold font-display ${stage.accentColor} flex items-center gap-1 group-hover:gap-1.5 transition-all`}>
                    <span>{stage.ctaText}</span>
                    <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                  </span>

                  <span className={`w-8 h-8 rounded-full bg-white shadow-2xs border ${stage.btnBg} flex items-center justify-center transition-all shrink-0`}>
                    <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
