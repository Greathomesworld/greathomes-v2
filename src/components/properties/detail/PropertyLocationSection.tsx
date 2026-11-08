import React from 'react';
import Link from 'next/link';
import { MapPin, ArrowRight, Compass, Building2 } from 'lucide-react';
import { PropertyDetailViewModel } from '@/src/domain/projects/viewModels/listingDetailViewModel';

interface PropertyLocationSectionProps {
  listing: PropertyDetailViewModel;
  locationInfo?: {
    id: string;
    name: string;
    slug: string;
    shortDescription: string | null;
    description: string | null;
  } | null;
}

export function PropertyLocationSection({
  listing,
  locationInfo,
}: PropertyLocationSectionProps) {
  const resolvedLocation = listing.location;
  const localityName =
    resolvedLocation?.name ||
    locationInfo?.name ||
    listing.project?.locationName ||
    'Kolkata';
  const localityUrl =
    resolvedLocation?.url ||
    (locationInfo?.slug ? `/locations/${locationInfo.slug}` : null);

  const locationNarrative =
    locationInfo?.shortDescription ||
    locationInfo?.description ||
    `Situated in ${localityName}, this residential address connects residents to arterial thoroughfares, established schools, healthcare institutions, and daily retail conveniences.`;

  return (
    <section id="location" className="scroll-mt-32">
      <div className="bg-white rounded-2xl border border-[#E6E2DC] p-5 sm:p-6 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <span className="text-[11px] font-display uppercase tracking-wider text-[#E85D3F] font-semibold block">
              Location & Connectivity
            </span>
            <h2 className="text-base sm:text-lg font-display font-bold text-[#111111] flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-[#E85D3F] shrink-0" />
              <span>{localityName}, Kolkata</span>
            </h2>
          </div>

          {localityUrl && (
            <Link
              href={localityUrl}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#FAFAF8] hover:bg-[#F2EFE9] border border-[#E6E2DC] text-xs font-display font-semibold text-[#111111] transition-colors self-start sm:self-auto"
            >
              <span>Explore {localityName}</span>
              <ArrowRight className="w-3.5 h-3.5 text-[#E85D3F]" />
            </Link>
          )}
        </div>

        <p className="text-xs sm:text-sm text-[#111111]/75 font-body leading-relaxed">
          {locationNarrative}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <div className="p-3.5 rounded-xl bg-[#FAFAF8] border border-[#E6E2DC]/80 space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-display font-bold text-[#111111]">
              <Compass className="w-3.5 h-3.5 text-[#E85D3F]" />
              <span>Residential Micro-Market</span>
            </div>
            <p className="text-xs text-[#111111]/65 font-body leading-relaxed">
              {listing.project
                ? `Part of the ${listing.project.name} residential enclave in ${localityName}.`
                : `Verified standalone residential property in ${localityName}, Kolkata.`}
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-[#FAFAF8] border border-[#E6E2DC]/80 space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-display font-bold text-[#111111]">
              <Building2 className="w-3.5 h-3.5 text-[#218C5A]" />
              <span>Assisted Inspection & Navigation</span>
            </div>
            <p className="text-xs text-[#111111]/65 font-body leading-relaxed">
              Exact building gate and tower entry coordinates are shared upon site visit confirmation.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
