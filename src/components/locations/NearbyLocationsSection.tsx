'use client';

import React from 'react';
import Link from 'next/link';
import { MapPin, ArrowRight } from 'lucide-react';

interface NearbyLocationItem {
  id: string;
  name: string;
  slug: string;
  levelDisplay?: string;
  projectCount?: number;
}

interface NearbyLocationsSectionProps {
  locationName: string;
  nearbyLocations: NearbyLocationItem[];
}

export function NearbyLocationsSection({
  locationName,
  nearbyLocations,
}: NearbyLocationsSectionProps) {
  if (!nearbyLocations || nearbyLocations.length === 0) {
    return null;
  }

  return (
    <section id="nearby" className="space-y-4 pt-8 border-t border-[rgba(17,17,17,0.08)]" aria-labelledby="nearby-heading">
      <div>
        <h2
          id="nearby-heading"
          className="text-xl sm:text-2xl font-display font-semibold text-[#111111] tracking-tight"
        >
          Explore nearby locations
        </h2>
        <p className="text-xs sm:text-sm font-body text-[#111111]/60 mt-0.5">
          Canonical parent, child, and sibling sub-markets related to {locationName}.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
        {nearbyLocations.map((loc) => (
          <Link
            key={loc.id}
            href={`/locations/${loc.slug}`}
            className="group bg-white border border-[rgba(17,17,17,0.08)] hover:border-[#111111] rounded-xl p-4 flex flex-col justify-between space-y-2 transition-all shadow-2xs focus:outline-hidden focus-visible:ring-2 focus-visible:ring-[#111111]"
          >
            <div className="flex items-center justify-between">
              <span className="p-1.5 rounded-lg bg-[rgba(17,17,17,0.04)] text-[#111111] group-hover:bg-[#111111] group-hover:text-white transition-colors">
                <MapPin className="w-4 h-4" />
              </span>
              <ArrowRight className="w-4 h-4 text-[#111111]/30 group-hover:text-[#111111] group-hover:translate-x-1 transition-all" />
            </div>

            <div className="space-y-0.5 pt-1">
              <span className="block font-display font-semibold text-sm text-[#111111] group-hover:text-[#E85D3F] transition-colors truncate">
                {loc.name}
              </span>
              {loc.projectCount !== undefined && (
                <span className="text-xs text-[#111111]/60 font-body">
                  {loc.projectCount} {loc.projectCount === 1 ? 'project' : 'projects'}
                </span>
              )}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
