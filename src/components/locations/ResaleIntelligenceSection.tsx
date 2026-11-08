'use client';

import React from 'react';
import Link from 'next/link';
import { Home, ArrowRight, ShieldCheck, Clock } from 'lucide-react';
import { ResaleDiscoveryCardDto } from '@/src/domain/projects/dto/discoveryDto';
import { PropertyCard } from '@/src/components/discovery/PropertyCard';

interface ResaleIntelligenceSectionProps {
  locationName: string;
  locationSlug: string;
  resaleListings: ResaleDiscoveryCardDto[];
}

export function ResaleIntelligenceSection({
  locationName,
  locationSlug,
  resaleListings,
}: ResaleIntelligenceSectionProps) {
  const verifiedListings = resaleListings.filter(
    l => l.verificationStatus === 'VERIFIED' || (l as any).isVerified === true
  );
  const unverifiedListings = resaleListings.filter(
    l => l.verificationStatus !== 'VERIFIED' && (l as any).isVerified !== true
  );

  const displayedVerified = verifiedListings.slice(0, 6);
  const displayedUnverified = unverifiedListings.slice(0, 6);

  return (
    <section id="resale" className="space-y-6 pt-8 border-t border-[rgba(17,17,17,0.08)]" aria-labelledby="resale-heading">
      <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
        <div>
          <h2
            id="resale-heading"
            className="text-xl sm:text-2xl font-display font-semibold text-[#111111] tracking-tight"
          >
            Resale homes in {locationName}
          </h2>
          <p className="text-xs sm:text-sm font-body text-[#111111]/60 mt-0.5">
            Verified resale apartments and individual homes listed in {locationName}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-medium bg-[#218C5A]/10 text-[#218C5A] border border-[#218C5A]/20">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>
              {verifiedListings.length} Verified {verifiedListings.length === 1 ? 'Resale Home' : 'Resale Homes'}
            </span>
          </span>
          {unverifiedListings.length > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-medium bg-amber-50 text-amber-800 border border-amber-200">
              <Clock className="w-3.5 h-3.5 text-amber-600" />
              <span>
                {unverifiedListings.length} Published (Unverified)
              </span>
            </span>
          )}
        </div>
      </div>

      {/* Primary Verified Resale Homes */}
      {displayedVerified.length === 0 ? (
        <div className="p-4 sm:p-5 rounded-xl border border-[rgba(17,17,17,0.08)] bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-start sm:items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[rgba(17,17,17,0.04)] flex items-center justify-center shrink-0 text-[#E85D3F]">
              <Home className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-display font-semibold text-[#111111]">
                No verified resale homes are currently listed in {locationName}
              </h3>
              <p className="text-xs font-body text-[#111111]/60 mt-0.5">
                {unverifiedListings.length > 0
                  ? `${unverifiedListings.length} published resale ${unverifiedListings.length === 1 ? 'listing is' : 'listings are'} shown below pending physical verification.`
                  : `Verified resale listings will appear here as property owners and partners submit properties in ${locationName}.`}
              </p>
            </div>
          </div>

          {unverifiedListings.length === 0 && (
            <a
              href="#projects"
              className="inline-flex items-center gap-1.5 text-xs font-display font-semibold text-[#E85D3F] hover:underline cursor-pointer shrink-0"
            >
              <span>Explore primary projects</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
          {displayedVerified.map((listing) => (
            <PropertyCard
              key={`resale-verified-${listing.id}`}
              item={listing}
            />
          ))}
        </div>
      )}

      {/* Secondary Subsection: Published but Unverified Resale Homes */}
      {displayedUnverified.length > 0 && (
        <div className="pt-4 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3.5 sm:px-4 rounded-xl bg-[#F6F2EC] border border-[rgba(17,17,17,0.08)]">
            <div className="flex items-center gap-2.5">
              <Clock className="w-4 h-4 text-amber-700 shrink-0" />
              <div>
                <h3 className="text-xs sm:text-sm font-display font-semibold text-[#111111]">
                  Published Resale Homes (Pending Verification)
                </h3>
                <p className="text-[11px] sm:text-xs font-body text-[#111111]/65">
                  These published listings in {locationName} are live on the marketplace and awaiting Great Homes physical verification. They are excluded from verified supply metrics above.
                </p>
              </div>
            </div>
            <span className="text-xs font-mono font-semibold text-amber-800 bg-amber-100/80 px-2.5 py-1 rounded-md shrink-0 self-start sm:self-center">
              {unverifiedListings.length} Unverified {unverifiedListings.length === 1 ? 'Listing' : 'Listings'}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
            {displayedUnverified.map((listing) => (
              <PropertyCard
                key={`resale-unverified-${listing.id}`}
                item={listing}
              />
            ))}
          </div>
        </div>
      )}

      {resaleListings.length > 0 && (
        <div className="flex justify-center pt-2">
          <Link
            href={`/buy?inventoryType=RESALE&location=${locationSlug}`}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white border border-[rgba(17,17,17,0.15)] text-[#111111] font-display font-medium text-sm hover:bg-[#FAFAF8] hover:border-[#111111] transition-all shadow-2xs"
          >
            <span>
              Explore Resale Inventory in {locationName} ({verifiedListings.length} Verified
              {unverifiedListings.length > 0 ? ` + ${unverifiedListings.length} Published` : ''})
            </span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      )}
    </section>
  );
}
