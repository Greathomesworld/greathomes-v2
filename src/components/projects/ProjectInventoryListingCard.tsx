import React from 'react';
import Link from 'next/link';
import { CheckCircle, ArrowRight, FileText, Clock, MessageSquare } from 'lucide-react';
import { PublicResaleListingDto } from '@/src/domain/projects/dto/resaleDto';
import { PublicRentalListingDto } from '@/src/domain/projects/dto/rentalDto';
import { ListingImage } from '@/src/components/discovery/ListingImage';
import { EnquiryTriggerButton } from '@/src/components/enquiry/EnquiryTriggerButton';
import {
  formatIndianPrice,
  formatFurnishing,
  formatFloorCategory,
  formatPropertyType,
  formatPossession,
  formatAreaDetails,
  formatListingDisplayTitle,
} from '@/src/components/discovery/formatters';

export interface ProjectInventoryListingCardProps {
  listing: PublicResaleListingDto | PublicRentalListingDto;
  mode: 'RESALE' | 'RENTAL';
  projectName: string;
  projectSlug: string;
  locationName?: string | null;
  priority?: boolean;
}

export function ProjectInventoryListingCard({
  listing,
  mode,
  projectName,
  projectSlug,
  locationName,
  priority = false,
}: ProjectInventoryListingCardProps) {
  const isResale = mode === 'RESALE';
  const resaleListing = isResale ? (listing as PublicResaleListingDto) : null;
  const rentalListing = !isResale ? (listing as PublicRentalListingDto) : null;

  // Prioritize genuine property photographs (featured image first, then first available photo)
  const validPhotos = (listing.media || []).filter(
    m => m && typeof m.url === 'string' && m.url.trim().length > 0
  );
  const featuredMedia = validPhotos.find(m => m.isFeatured) || validPhotos[0];
  const imageUrl = featuredMedia?.url || null;

  const areaDetails = formatAreaDetails(
    listing.carpetArea,
    listing.builtUpArea,
    listing.superBuiltUpArea
  );
  const floorSummary = formatFloorCategory(listing.floorCategory) || 'Standard Floor';
  const furnishSummary = formatFurnishing(listing.furnishing);
  const dateStr = isResale ? resaleListing?.possessionDate : rentalListing?.availabilityDate;
  const possessionLabel = formatPossession(listing.possession, dateStr);
  const propertyTypeLabel = formatPropertyType(listing.propertyType);

  const facingLabel =
    listing.facing && listing.facing !== 'UNKNOWN'
      ? `${listing.facing.charAt(0)}${listing.facing.slice(1).toLowerCase().replace(/_/g, '-')} Facing`
      : null;

  const priceAmount = isResale ? (resaleListing?.askingPrice ?? 0) : (rentalListing?.monthlyRent ?? 0);
  const priceDisplay = isResale
    ? formatIndianPrice(priceAmount)
    : `₹${priceAmount.toLocaleString('en-IN')}`;
  const fullPriceDisplay = isResale ? priceDisplay : `${priceDisplay}/mo`;

  // Safe routing: Link to listing detail route using slug if available, else fallback to ID.
  const identifier = listing.slug && listing.slug.trim().length > 0 ? listing.slug : listing.id;
  const detailUrl = isResale ? `/buy/${identifier}` : `/rent/${identifier}`;

  const { title: cardTitle, subtitle: cardSubtitle, bhkBadge } = formatListingDisplayTitle({
    configuration: listing.configuration,
    bedroomCount: listing.bedroomCount,
    propertyType: listing.propertyType,
    furnishing: listing.furnishing,
    mode,
    projectName,
  });

  const mediaHeaderContent = (
    <>
      <ListingImage
        src={imageUrl}
        alt={`${cardTitle} in ${projectName}`}
        fallbackType={isResale ? 'resale' : 'rent'}
        isVerified={listing.isVerified}
        priority={priority}
      />

      {/* Top-Left Category & Configuration Badges */}
      <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 items-center z-10 pointer-events-none">
        <span className="bg-white/95 text-[#111111] border border-[rgba(17,17,17,0.12)] text-[11px] font-display font-semibold tracking-wider uppercase px-2.5 py-1 rounded-md shadow-xs backdrop-blur-xs">
          {isResale ? 'RESALE' : 'FOR RENT'}
        </span>
        {bhkBadge && (
          <span className="bg-[#111111]/85 text-white text-[11px] font-display font-semibold px-2.5 py-1 rounded-md shadow-xs backdrop-blur-xs">
            {bhkBadge}
          </span>
        )}
      </div>

      {/* Top-Right Verification Status Badge (Verified vs Unverified clearly distinguished) */}
      <div className="absolute top-3 right-3 flex flex-wrap gap-1.5 items-center z-10 pointer-events-none">
        {listing.isVerified ? (
          <span className="bg-[#218C5A] text-white text-[11px] font-display font-semibold px-2.5 py-1 rounded-md flex items-center gap-1 shadow-xs">
            <CheckCircle className="w-3 h-3 shrink-0" />
            <span>Verified</span>
          </span>
        ) : (
          <span
            className="bg-white/95 text-[#111111]/70 border border-[rgba(17,17,17,0.14)] text-[11px] font-display font-medium px-2.5 py-1 rounded-md flex items-center gap-1 shadow-xs backdrop-blur-xs"
            title="Listing details submitted and pending physical verification"
          >
            <Clock className="w-3 h-3 text-[#111111]/50 shrink-0" />
            <span>Unverified</span>
          </span>
        )}
      </div>
    </>
  );

  return (
    <article
      id={`${mode.toLowerCase()}-${listing.id}`}
      className="group flex flex-col justify-between h-full bg-white border border-[var(--color-border)] rounded-xl overflow-hidden hover:border-[var(--color-foreground)]/30 hover:shadow-md transition-all duration-200"
    >
      <div>
        {/* Media Container (Unchanged original aspect-[16/10]) */}
        {detailUrl ? (
          <Link
            href={detailUrl}
            aria-label={`View ${cardTitle} in ${projectName}`}
            className="block relative aspect-[16/10] bg-[#F2F0EC] overflow-hidden focus:outline-hidden"
          >
            {mediaHeaderContent}
          </Link>
        ) : (
          <div className="relative aspect-[16/10] bg-[#F2F0EC] overflow-hidden">
            {mediaHeaderContent}
          </div>
        )}

        {/* Compact Details Body Below Image */}
        <div className="px-4 pt-3 pb-2 space-y-2.5">
          {/* Primary Header Row: Compact Title + Price/Rent */}
          <div className="flex items-start justify-between gap-2.5 pb-2 border-b border-[var(--color-border)]/70">
            <div className="min-w-0 flex-1">
              {detailUrl ? (
                <Link href={detailUrl} className="block focus:outline-hidden">
                  <h2 className="font-display font-semibold text-base text-[var(--color-foreground)] group-hover:text-[var(--color-accent)] transition-colors line-clamp-1 leading-snug">
                    {cardTitle}
                  </h2>
                </Link>
              ) : (
                <h2 className="font-display font-semibold text-base text-[var(--color-foreground)] line-clamp-1 leading-snug">
                  {cardTitle}
                </h2>
              )}
              <p className="text-xs font-body text-[var(--color-foreground)]/65 line-clamp-1 mt-0.5 leading-tight">
                {cardSubtitle}
              </p>
            </div>

            <div className="text-right shrink-0">
              <span className="text-[10px] font-display font-semibold uppercase tracking-wider text-[var(--color-foreground)]/50 block leading-none">
                {isResale ? 'Asking Price' : 'Monthly Rent'}
              </span>
              <div className="flex items-baseline justify-end gap-0.5 mt-0.5">
                <span className="text-lg sm:text-xl font-display font-bold text-[var(--color-foreground)] tracking-tight leading-tight">
                  {priceDisplay}
                </span>
                {!isResale && (
                  <span className="text-xs font-body text-[var(--color-foreground)]/60">/mo</span>
                )}
              </div>
              {!isResale && rentalListing?.maintenance && rentalListing.maintenance > 0 ? (
                <span className="text-[10.5px] font-body text-[var(--color-foreground)]/60 block leading-tight">
                  + ₹{rentalListing.maintenance.toLocaleString('en-IN')} maint.
                </span>
              ) : null}
            </div>
          </div>

          {/* Compact 2x2 Key Specification Grid */}
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 px-2.5 py-2 bg-[#FAFAF8] rounded-lg border border-[var(--color-border)] text-xs font-body">
            {/* Spec 1: Area (Carpet / Built-up fallback) */}
            <div className="min-w-0 leading-tight">
              <span className="text-[10px] font-display uppercase tracking-wider text-[var(--color-foreground)]/50 block">
                {areaDetails.primaryLabel}
              </span>
              <span className="font-medium text-[var(--color-foreground)] block truncate mt-0.5">
                {areaDetails.primaryValue || 'On Request'}
              </span>
              {areaDetails.secondaryText && (
                <span className="text-[10px] text-[var(--color-foreground)]/55 block truncate">
                  {areaDetails.secondaryText}
                </span>
              )}
            </div>

            {/* Spec 2: Furnishing */}
            <div className="min-w-0 leading-tight">
              <span className="text-[10px] font-display uppercase tracking-wider text-[var(--color-foreground)]/50 block">
                Furnishing
              </span>
              <span className="font-medium text-[var(--color-foreground)] block truncate mt-0.5">
                {furnishSummary}
              </span>
              <span className="text-[10px] text-[var(--color-foreground)]/55 block truncate">
                {propertyTypeLabel}
              </span>
            </div>

            {/* Spec 3: Floor & Facing */}
            <div className="min-w-0 pt-1.5 border-t border-[var(--color-border)]/60 leading-tight">
              <span className="text-[10px] font-display uppercase tracking-wider text-[var(--color-foreground)]/50 block">
                Floor Level
              </span>
              <span className="font-medium text-[var(--color-foreground)] block truncate mt-0.5">
                {floorSummary}
              </span>
              {facingLabel && (
                <span className="text-[10px] text-[var(--color-foreground)]/55 block truncate">
                  {facingLabel}
                </span>
              )}
            </div>

            {/* Spec 4: Availability / Possession & Deposit */}
            <div className="min-w-0 pt-1.5 border-t border-[var(--color-border)]/60 leading-tight">
              <span className="text-[10px] font-display uppercase tracking-wider text-[var(--color-foreground)]/50 block">
                {isResale ? 'Possession' : 'Availability'}
              </span>
              <span className="font-medium text-[var(--color-foreground)] block truncate mt-0.5">
                {possessionLabel}
              </span>
              {!isResale && rentalListing?.securityDeposit && rentalListing.securityDeposit > 0 ? (
                <span className="text-[10px] text-[var(--color-foreground)]/55 block truncate">
                  Deposit: ₹{rentalListing.securityDeposit.toLocaleString('en-IN')}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* Card Action Footer — Compact Spacing & Aligned Bottom CTAs */}
      <div className="px-4 pb-3.5 pt-0">
        <div className="pt-2 border-t border-[var(--color-border)] space-y-2">
          <div className="flex items-center justify-between gap-2 text-[11px] font-body text-[var(--color-foreground)]/65 leading-tight">
            <span className="font-medium">{listing.listingParty.label}</span>
            <span>{listing.isVerified ? 'Great Homes Verified' : 'Direct Advisory Available'}</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <EnquiryTriggerButton
              contextData={{
                contextType: mode,
                inquiryIntent: 'STANDARD',
                listingSlug: listing.slug || undefined,
                projectName,
                projectSlug,
                configuration: listing.configuration,
                propertyType: listing.propertyType,
                locationName: locationName || undefined,
                priceDisplay: fullPriceDisplay,
                title: `${cardTitle} in ${projectName}`,
                subtitle: `${isResale ? 'Asking Price' : 'Monthly Rent'}: ${fullPriceDisplay} · ${furnishSummary}`,
              }}
              className="h-9 px-3 rounded-xl border border-[var(--color-border)] bg-[#FAFAF8] hover:bg-[var(--color-foreground)]/[0.04] hover:border-[var(--color-foreground)]/40 text-xs font-display font-semibold text-[var(--color-foreground)] inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <MessageSquare className="w-3.5 h-3.5 text-[var(--color-foreground)]/70 shrink-0" />
              <span>Enquire Now</span>
            </EnquiryTriggerButton>

            <Link
              href={detailUrl}
              className="h-9 px-3 rounded-xl bg-[var(--color-foreground)] text-[var(--color-background)] hover:bg-[var(--color-accent)] text-xs font-display font-semibold inline-flex items-center justify-center gap-1.5 transition-colors shadow-2xs"
            >
              <span>View Property</span>
              <ArrowRight className="w-3.5 h-3.5 shrink-0" />
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}

