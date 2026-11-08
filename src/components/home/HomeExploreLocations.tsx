'use client';

import React from 'react';
import Link from 'next/link';
import { MapPin, ArrowRight } from 'lucide-react';
import { GreatHomesIllustration } from '../illustrations/GreatHomesIllustration';

export interface HomeLocationCardData {
  id: string;
  name: string;
  slug: string;
  type: string;
  description?: string;
  projectCount?: number;
}

interface HomeExploreLocationsProps {
  locations: HomeLocationCardData[];
}

export function HomeExploreLocations({ locations = [] }: HomeExploreLocationsProps) {
  // Focus on Kolkata premium growth hubs
  const prioritySlugs = ['new-town', 'rajarhat', 'salt-lake', 'action-area-1', 'action-area-2', 'action-area-3'];
  const displayLocations = locations
    .filter((l) => prioritySlugs.includes(l.slug) || l.projectCount && l.projectCount > 0)
    .slice(0, 6);

  return (
    <section className="py-24 bg-[#FAFAF8] border-b border-[rgba(17,17,17,0.08)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          {/* LEFT: Conceptual Map / Large Stylized City Illustration */}
          <div className="space-y-6">
            <span className="text-xs uppercase tracking-widest text-[#E85D3F] font-semibold font-display block">
              Neighborhood Intelligence
            </span>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-display font-extrabold text-[#111111] tracking-tight leading-tight">
              Explore Kolkata
            </h2>
            <p className="text-base text-slate-600 font-body leading-relaxed max-w-lg">
              Discover verified residential projects, homes and masterfully planned growth corridors shaping Kolkata’s urban landscape.
            </p>

            <div className="bg-white p-6 rounded-xl border border-[rgba(17,17,17,0.06)] shadow-xs flex justify-center items-center">
              <GreatHomesIllustration
                id="LOCATION_DISCOVERY"
                size="FEATURE"
                className="w-full h-auto max-w-[420px]"
              />
            </div>
          </div>

          {/* RIGHT: Sophisticated List Rows */}
          <div className="space-y-6">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <span className="text-xs uppercase font-bold text-slate-400 font-display tracking-wider">
                Select Corridor
              </span>
              <Link
                href="/locations"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-[#E85D3F] hover:text-[#D54D30] font-display transition-colors"
              >
                <span>View All Hoods</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="divide-y divide-slate-100 bg-white rounded-xl border border-[rgba(17,17,17,0.06)] overflow-hidden shadow-xs">
              {displayLocations.map((loc) => (
                <Link
                  key={loc.id}
                  href={`/locations/${loc.slug}`}
                  className="group flex items-center justify-between p-5 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="bg-[#FAFAF8] p-3 rounded-lg border border-[rgba(17,17,17,0.05)] text-[#E85D3F]">
                      <MapPin className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-display font-bold text-[#111111] group-hover:text-[#E85D3F] transition-colors">
                        {loc.name}
                      </h3>
                      {loc.description && (
                        <p className="text-xs text-slate-500 font-body mt-0.5 line-clamp-1 max-w-sm">
                          {loc.description}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {loc.projectCount !== undefined && loc.projectCount > 0 && (
                      <span className="text-xs font-semibold px-2.5 py-1 bg-slate-100 text-slate-600 rounded-full font-display">
                        {loc.projectCount} {loc.projectCount === 1 ? 'Project' : 'Projects'}
                      </span>
                    )}
                    <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-[#E85D3F] group-hover:translate-x-0.5 transition-all" />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
