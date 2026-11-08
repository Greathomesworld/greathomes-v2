'use client';

import React from 'react';
import Link from 'next/link';
import { Layers, ArrowRight } from 'lucide-react';
import { ConfigurationDistributionDto } from '@/src/domain/marketIntelligence/dto/locationIntelligenceDto';

interface ConfigurationIntelligenceSectionProps {
  locationName: string;
  locationSlug?: string;
  configDistribution: ConfigurationDistributionDto | 'NOT_AVAILABLE';
}

export function ConfigurationIntelligenceSection({
  locationName,
  locationSlug,
  configDistribution,
}: ConfigurationIntelligenceSectionProps) {
  if (!configDistribution || configDistribution === 'NOT_AVAILABLE') {
    return null;
  }

  const configs = [
    { label: '1 BHK', bhk: 1, count: configDistribution.bhk1Count },
    { label: '2 BHK', bhk: 2, count: configDistribution.bhk2Count },
    { label: '3 BHK', bhk: 3, count: configDistribution.bhk3Count },
    { label: '4 BHK', bhk: 4, count: configDistribution.bhk4Count },
    { label: '5+ BHK', bhk: 5, count: configDistribution.bhk5PlusCount },
  ].filter((c) => c.count > 0);

  if (configs.length === 0) return null;

  return (
    <section id="configurations" className="space-y-4 pt-8 border-t border-[rgba(17,17,17,0.08)]" aria-labelledby="configurations-heading">
      <div>
        <h2
          id="configurations-heading"
          className="text-xl sm:text-2xl font-display font-semibold text-[#111111] tracking-tight"
        >
          Popular configurations in {locationName}
        </h2>
        <p className="text-xs sm:text-sm font-body text-[#111111]/60 mt-0.5">
          Distinct published projects offering each bedroom configuration in {locationName}.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        {configs.map((cfg) => {
          const href = locationSlug
            ? `/projects?location=${locationSlug}&bedroomCount=${cfg.bhk}`
            : '#projects';
          return (
            <Link
              key={cfg.label}
              href={href}
              className="group bg-white border border-[rgba(17,17,17,0.08)] rounded-xl p-4 flex flex-col justify-between space-y-1 hover:border-[#111111] transition-all shadow-2xs"
            >
              <div className="flex items-center justify-between text-[#111111]/60">
                <span className="text-xs font-display font-semibold uppercase tracking-wider text-[#111111] group-hover:text-[#E85D3F] transition-colors">
                  {cfg.label}
                </span>
                <Layers className="w-4 h-4 text-[#111111]/40 group-hover:text-[#E85D3F] transition-colors" />
              </div>
              <div className="pt-2 flex items-end justify-between gap-2">
                <div>
                  <span className="block text-2xl font-display font-bold text-[#111111]">
                    {cfg.count}
                  </span>
                  <span className="text-xs text-[#111111]/60 font-body">
                    {cfg.count === 1 ? 'Project available' : 'Projects available'}
                  </span>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-[#111111]/30 group-hover:text-[#E85D3F] group-hover:translate-x-0.5 transition-all mb-1 shrink-0" />
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
