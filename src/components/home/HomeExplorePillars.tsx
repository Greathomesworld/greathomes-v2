import React from 'react';
import Link from 'next/link';
import { Building2, Home, Key, Sparkles, MapPin, ShieldCheck, Users, ArrowRight } from 'lucide-react';

export function HomeExplorePillars() {
  // 1. Trust Indicators / Highlights Row (Directly below Hero)
  const trustHighlights = [
    {
      icon: <Building2 className="w-5 h-5 text-[#E85D3F]" />,
      title: 'Verified Projects',
      description: 'From reputed developers',
    },
    {
      icon: <MapPin className="w-5 h-5 text-[#E85D3F]" />,
      title: 'Key Locations',
      description: 'Rajarhat, New Town & more',
    },
    {
      icon: <ShieldCheck className="w-5 h-5 text-[#E85D3F]" />,
      title: 'RERA Backed',
      description: 'Verified where applicable',
    },
    {
      icon: <Users className="w-5 h-5 text-[#E85D3F]" />,
      title: 'Personalised Assistance',
      description: 'From shortlisting to site visits',
    },
  ];

  // 2. Four Core Primary Discovery Entry Points
  const discoveryCards = [
    {
      id: 'NEW_LAUNCH',
      title: 'New Launches',
      description: 'Explore the latest projects',
      href: '/projects?stage=NEW_LAUNCH',
      isFeatured: true, // Prominent terracotta card as shown in reference board
      icon: <Sparkles className="w-6 h-6 text-white" />,
    },
    {
      id: 'PROJECTS',
      title: 'Projects',
      description: 'Browse all projects',
      href: '/projects',
      isFeatured: false,
      icon: <Building2 className="w-6 h-6 text-[#E85D3F]" />,
    },
    {
      id: 'BUY_RESALE',
      title: 'Buy Resale',
      description: 'Homes from verified owners',
      href: '/buy?inventoryType=RESALE',
      isFeatured: false,
      icon: <Home className="w-6 h-6 text-[#E85D3F]" />,
    },
    {
      id: 'RENT',
      title: 'Rent',
      description: 'Find rental homes',
      href: '/rent',
      isFeatured: false,
      icon: <Key className="w-6 h-6 text-[#E85D3F]" />,
    },
  ];

  return (
    <section className="w-full bg-[#FAFAF8] border-b border-neutral-200/80">
      {/* SECTION 1: Trust Indicators Highlight Strip */}
      <div className="border-b border-neutral-200/70 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-7">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8">
            {trustHighlights.map((item, index) => (
              <div key={index} className="flex items-center gap-3.5 sm:gap-4">
                <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-orange-50 border border-orange-100 flex items-center justify-center shrink-0">
                  {item.icon}
                </div>
                <div className="min-w-0">
                  <h3 className="text-xs sm:text-sm font-display font-bold text-neutral-900 tracking-tight truncate">
                    {item.title}
                  </h3>
                  <p className="text-[11px] sm:text-xs text-neutral-500 font-body line-clamp-2 text-balance leading-tight">
                    {item.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* SECTION 2: Four Core Primary Discovery Cards */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {discoveryCards.map((card) => {
            if (card.isFeatured) {
              return (
                <div key={card.id} className="h-full">
                  <Link
                    href={card.href}
                    className="group relative flex flex-col justify-between h-full min-h-[160px] p-6 rounded-2xl bg-gradient-to-br from-[#E85D3F] via-[#DF5234] to-[#C94326] text-white shadow-md hover:shadow-xl hover:-translate-y-1 active:scale-[0.98] transition-all duration-200 overflow-hidden motion-reduce:transform-none"
                  >
                    {/* Subtle decorative architectural backdrop graphic */}
                    <div className="absolute right-0 bottom-0 translate-x-4 translate-y-4 opacity-15 pointer-events-none">
                      <Building2 className="w-32 h-32 text-white" />
                    </div>

                    <div className="space-y-4 relative z-10">
                      <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-xs flex items-center justify-center shadow-xs">
                        {card.icon}
                      </div>
                      <div>
                        <h3 className="text-lg sm:text-xl font-display font-bold tracking-tight text-white">
                          {card.title}
                        </h3>
                        <p className="text-xs sm:text-sm text-white/90 font-body mt-1">
                          {card.description}
                        </p>
                      </div>
                    </div>

                    <div className="pt-4 flex items-center justify-end relative z-10">
                      <div className="w-8 h-8 rounded-full bg-white text-[#E85D3F] flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform">
                        <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                      </div>
                    </div>
                  </Link>
                </div>
              );
            }

            return (
              <div key={card.id} className="h-full">
                <Link
                  href={card.href}
                  className="group relative flex flex-col justify-between h-full min-h-[160px] p-6 rounded-2xl bg-white border border-neutral-200/90 hover:border-neutral-300 text-neutral-900 shadow-xs hover:shadow-md hover:-translate-y-1 active:scale-[0.98] transition-all duration-200 motion-reduce:transform-none"
                >
                  <div className="space-y-4">
                    <div className="w-12 h-12 rounded-xl bg-orange-50/80 border border-orange-100/60 flex items-center justify-center group-hover:bg-orange-100/80 transition-colors">
                      {card.icon}
                    </div>
                    <div>
                      <h3 className="text-lg sm:text-xl font-display font-bold tracking-tight text-neutral-900 group-hover:text-[#E85D3F] transition-colors">
                        {card.title}
                      </h3>
                      <p className="text-xs sm:text-sm text-neutral-500 font-body mt-1">
                        {card.description}
                      </p>
                    </div>
                  </div>

                  <div className="pt-4 flex items-center justify-end">
                    <div className="w-8 h-8 rounded-full bg-neutral-100 group-hover:bg-[#E85D3F] text-neutral-600 group-hover:text-white flex items-center justify-center transition-all duration-200">
                      <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                    </div>
                  </div>
                </Link>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
