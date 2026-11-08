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

  const mobileMainHeadline = `${listing.bedroomCount} BHK ${listing.propertyTypeDisplay}`;
  const mobileSubHeadline = listing.project
    ? `at ${listing.project.name}`
    : listing.location
    ? `in ${listing.location.name}`
    : 'in Kolkata';

  return (
    <div className="pt-1">
      {/* DESKTOP TITLE & LOCATION ROW */}
      <div className="hidden md:block space-y-2">
        <h1 className="text-2xl lg:text-[32px] font-serif font-bold text-[#111111] tracking-tight leading-tight">
          {listing.title}
        </h1>

        <div className="flex items-center flex-wrap gap-2 text-sm text-[#111111]/75 font-body">
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

          {listing.project && (
            <>
              <span className="text-[#111111]/35">·</span>
              <Link
                href={listing.project.url}
                className="font-display font-semibold text-[#111111] underline decoration-[#111111]/30 hover:decoration-[#E85D3F] hover:text-[#E85D3F] underline-offset-4 transition-colors"
              >
                {`Part of ${listing.project.name}`}
              </Link>
            </>
          )}
        </div>
      </div>

      {/* MOBILE TITLE & PRICE SIDE-BY-SIDE HEADER (Matches Mobile Reference) */}
      <div className="md:hidden flex items-start justify-between gap-3 pt-1">
        <div className="min-w-0 flex-1 space-y-0.5">
          <h1 className="text-xl font-serif font-bold text-[#111111] leading-snug">
            {mobileMainHeadline}
          </h1>
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

        <div className="text-right shrink-0">
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
