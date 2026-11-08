import React from 'react';
import Image from 'next/image';
import { Search, Building, MapPin, Headphones } from 'lucide-react';

export function HomeWhyGreatHomes() {
  const valueProps = [
    {
      title: 'Verified Information',
      desc: 'RERA details and listing verification status where available.',
      icon: Search,
    },
    {
      title: 'Complete Discovery',
      desc: 'New launches, ongoing projects, resale homes and rentals in one place.',
      icon: Building,
    },
    {
      title: 'Local Expertise',
      desc: 'Discover Kolkata neighbourhoods, residential projects and available market information.',
      icon: MapPin,
    },
    {
      title: 'Personalized Assistance',
      desc: 'Get help shortlisting options, comparing projects and arranging site visits.',
      icon: Headphones,
    },
  ];

  return (
    <section 
      id="why-great-homes"
      aria-labelledby="why-great-homes-heading"
      className="relative py-20 md:py-28 bg-[#FAFAF8] border-b border-[rgba(17,17,17,0.08)] overflow-hidden"
    >
      {/* Background Architectural Banner with Soft Gradient Blend */}
      <div className="absolute inset-0 z-0 pointer-events-none opacity-20 lg:opacity-30">
        <Image
          src="https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1920&q=80"
          alt="Modern Kolkata residential architecture"
          fill
          sizes="100vw"
          className="object-cover object-center"
          priority={false}
          referrerPolicy="no-referrer"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#FAFAF8] via-[#FAFAF8]/90 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#FAFAF8] via-transparent to-[#FAFAF8]" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header Content */}
        <div className="max-w-3xl mb-14">
          <div className="flex items-center gap-2.5 mb-3">
            <span className="text-xs uppercase tracking-widest text-[#E85D3F] font-bold font-display">
              WHY GREAT HOMES
            </span>
            <span className="w-8 h-0.5 bg-[#E85D3F] inline-block rounded-full" aria-hidden="true" />
          </div>

          <h2 
            id="why-great-homes-heading"
            className="text-3xl sm:text-5xl font-editorial font-bold text-[#111111] tracking-tight leading-[1.15]"
          >
            Your Home Journey, <span className="text-[#E85D3F]">Simplified.</span>
          </h2>

          <p className="text-base sm:text-lg text-neutral-600 font-body mt-4 leading-relaxed max-w-2xl">
            Discover, compare and connect with residential properties across Kolkata.
          </p>
        </div>

        {/* Four Value Propositions in a Two-Column Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 bg-white/80 backdrop-blur-md p-6 sm:p-8 rounded-2xl border border-[rgba(17,17,17,0.08)] shadow-xs">
          {valueProps.map((item, index) => {
            const IconComp = item.icon;
            return (
              <div key={index} className="flex flex-col justify-between space-y-4 p-4 rounded-xl hover:bg-[#FAFAF8] transition-colors">
                <div className="w-12 h-12 rounded-xl bg-[#FFF5EE] text-[#E85D3F] border border-[rgba(232,93,63,0.2)] flex items-center justify-center shrink-0">
                  <IconComp className="w-6 h-6" aria-hidden="true" />
                </div>
                <div>
                  <h3 className="text-base font-display font-bold text-[#111111] mb-1">
                    {item.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-neutral-600 font-body leading-relaxed">
                    {item.desc}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
