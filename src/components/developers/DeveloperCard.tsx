'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Building2, MapPin, Sparkles, ArrowRight } from 'lucide-react';
import { PublicDeveloperDto } from '@/src/domain/developers/dto/developerDto';

interface DeveloperCardProps {
  developer: PublicDeveloperDto;
}

export function DeveloperCard({ developer }: DeveloperCardProps) {
  const [imageError, setImageError] = useState(false);

  const hasLogo = Boolean(developer.logoUrl) && !imageError;
  const projectLabel = `${developer.projectCount} Project${developer.projectCount === 1 ? '' : 's'}`;
  const locationCount = developer.locations.length;
  const locationLabel = locationCount > 0
    ? `${locationCount} Location${locationCount === 1 ? '' : 's'}`
    : 'Kolkata';

  return (
    <Link
      href={`/developers/${developer.slug}`}
      className="group block bg-white border border-[#E6E2DC] rounded-2xl p-6 hover:border-[#E85D3F]/60 hover:shadow-md transition-all duration-200 flex flex-col justify-between"
    >
      <div>
        {/* Top Header: Logo + Optional Featured Badge */}
        <div className="flex items-center justify-between gap-3 min-h-[3.5rem]">
          {hasLogo ? (
            <div className="relative w-36 h-12 flex items-center justify-start">
              <Image
                src={developer.logoUrl!}
                alt={`${developer.name} logo`}
                fill
                className="object-contain object-left"
                referrerPolicy="no-referrer"
                onError={() => setImageError(true)}
              />
            </div>
          ) : (
            <div className="h-11 px-3.5 flex items-center justify-center bg-[#FAF8F5] border border-[#E6E2DC] rounded-xl text-xs font-display font-bold text-[#111111]/70 tracking-wider uppercase">
              {developer.name.slice(0, 3)}
            </div>
          )}

          {developer.featured && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#FFF5F0] border border-[#F3DFD5] text-[11px] font-display font-semibold text-[#E85D3F] shrink-0">
              <Sparkles className="w-3 h-3 text-[#E85D3F]" />
              <span>Featured</span>
            </span>
          )}
        </div>

        {/* Developer Name & Focus */}
        <div className="mt-4">
          <h3 className="text-lg sm:text-xl font-display font-bold text-[#111111] group-hover:text-[#E85D3F] transition-colors leading-snug">
            {developer.name}
          </h3>
          <p className="text-[11px] font-display font-medium uppercase tracking-wider text-[#111111]/45 mt-1">
            Residential Development · Kolkata
          </p>
        </div>

        {/* Description */}
        <p className="text-xs sm:text-sm font-body text-[#111111]/70 line-clamp-3 leading-relaxed mt-2.5 min-h-[3.6rem]">
          {developer.shortDescription || developer.description || 'Prominent real estate developer with residential developments in Kolkata.'}
        </p>
      </div>

      {/* Footer Metrics & CTA */}
      <div className="mt-5 pt-4 border-t border-[#E6E2DC]/80 space-y-3.5">
        <div className="grid grid-cols-2 gap-2 text-xs font-body text-[#111111]/80">
          <div className="flex items-center gap-1.5 truncate">
            <Building2 className="w-3.5 h-3.5 text-[#E85D3F] shrink-0" />
            <span className="truncate">{projectLabel}</span>
          </div>

          <div className="flex items-center gap-1.5 truncate">
            <MapPin className="w-3.5 h-3.5 text-[#111111]/45 shrink-0" />
            <span className="truncate">{locationLabel}</span>
          </div>
        </div>

        <div className="pt-1 flex items-center text-xs sm:text-sm font-display font-semibold text-[#E85D3F] group-hover:text-[#D44A2C] transition-colors">
          <span>Explore Developer</span>
          <ArrowRight className="w-3.5 h-3.5 ml-1 transition-transform group-hover:translate-x-1" />
        </div>
      </div>
    </Link>
  );
}
