import React from 'react';
import Link from 'next/link';
import { MapPin } from 'lucide-react';
import { PropertyDetailViewModel } from '@/src/domain/projects/viewModels/listingDetailViewModel';

interface PropertyDetailHeaderProps {
  listing: PropertyDetailViewModel;
}

export function PropertyDetailHeader({ listing }: PropertyDetailHeaderProps) {
  const isResale = listing.mode === 'RESALE';
  const primaryPrice = isResale ? listing.formattedAskingPrice : listing.formattedMonthlyRent;
  const priceLabel = isResale ? 'Asking Price' : 'Monthly Rent';

  const mobileSubHeadline = listing.project
    ? `Part of ${listing.project.name}`
    : listing.customProjectDisplay
    ? listing.customProjectDisplay
    : listing.location
    ? listing.locationDisplay
    : listing.customLocalityDisplay
    ? listing.customLocalityDisplay
    : 'Kolkata';

  return (
    <div className="pt-1">
      {/* UNIFIED RESPONSIVE TITLE, LOCATION & MOBILE PRICE HEADER (Single Semantic H1) */}
      <div className="flex items-start justify-between gap-3 md:block">
        <div className="min-w-0 flex-1 space-y-1 md:space-y-2">
          <h1 className="text-xl md:text-2xl lg:text-[32px] font-serif font-bold text-[#111111] tracking-tight leading-snug md:leading-tight">
            {listing.title}
          </h1>

          {/* Mobile concise project/location context below H1 (<md) */}
          <div className="md:hidden">
            {listing.project ? (
              <Link
                href={listing.project.url}
                className="text-sm font-display font-medium text-[#111111]/75 hover:text-[#E85D3F] block truncate"
              >
                {mobileSubHeadline}
              </Link>
            ) : (
              <p className="text-sm font-display font-medium text-[#111111]/75 truncate">
                {mobileSubHeadline}
              </p>
            )}
          </div>

          {/* Desktop Location & Parent Project Row (md+) */}
          <div className="hidden md:flex items-center flex-wrap gap-2 text-sm text-[#111111]/75 font-body">
            <MapPin className="w-4 h-4 text-[#E85D3F] shrink-0" />
            {listing.location ? (
              <Link
                href={listing.location.url}
                className="hover:text-[#E85D3F] transition-colors font-medium text-[#111111]/85"
              >
                {listing.locationDisplay}
              </Link>
            ) : (
              <span className="font-medium text-[#111111]/85">{listing.locationDisplay}</span>
            )}

            {listing.project ? (
              <>
                <span className="text-[#111111]/35">·</span>
                <Link
                  href={listing.project.url}
                  className="font-display font-semibold text-[#111111] underline decoration-[#111111]/30 hover:decoration-[#E85D3F] hover:text-[#E85D3F] underline-offset-4 transition-colors"
                >
                  {`Part of ${listing.project.name}`}
                </Link>
              </>
            ) : listing.customProjectDisplay ? (
              <>
                <span className="text-[#111111]/35">·</span>
                <span className="font-display font-semibold text-[#111111]/85">
                  {listing.customProjectDisplay}
                </span>
              </>
            ) : null}
          </div>
        </div>

        {/* Mobile Price Column (<md only; desktop price lives in sticky enquiry sidebar) */}
        <div className="md:hidden text-right shrink-0">
          <span className="text-xl font-display font-bold text-[#111111] block leading-snug">
            {primaryPrice}
          </span>
          <span className="text-[11px] font-display font-medium text-[#111111]/55 block">
            {isResale
              ? listing.primaryAreaDisplay
                ? `${listing.primaryAreaLabel}: ${listing.primaryAreaDisplay}`
                : priceLabel
              : listing.formattedMaintenance
              ? `+ ${listing.formattedMaintenance} Maint.`
              : priceLabel}
          </span>
        </div>
      </div>
    </div>
  );
}
