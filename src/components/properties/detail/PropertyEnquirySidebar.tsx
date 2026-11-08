import React from 'react';
import {
  ArrowRight,
  Phone,
  MessageSquare,
  Calendar,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Info,
} from 'lucide-react';
import { PropertyDetailViewModel } from '@/src/domain/projects/viewModels/listingDetailViewModel';
import { EnquiryTriggerButton } from '@/src/components/enquiry/EnquiryTriggerButton';
import { PublicEnquiryContextDto } from '@/src/domain/enquiry/dto/enquiryDto';

interface PropertyEnquirySidebarProps {
  listing: PropertyDetailViewModel;
}

export function PropertyEnquirySidebar({ listing }: PropertyEnquirySidebarProps) {
  const isResale = listing.mode === 'RESALE';
  const primaryPrice = isResale ? listing.formattedAskingPrice : listing.formattedMonthlyRent;
  const priceLabel = isResale ? 'Asking Price' : 'Monthly Rent';

  // Right-side context slot inside the price box:
  // Strictly NEVER displays derived price per sq.ft.
  // Displays Carpet Area (priority) or Built-up Area or Rental Deposit/Maintenance context.
  const secondaryMetricValue = isResale
    ? listing.primaryAreaDisplay || listing.possessionDisplay
    : listing.formattedSecurityDeposit ||
      listing.formattedMaintenance ||
      listing.primaryAreaDisplay ||
      listing.possessionDisplay;

  const secondaryMetricLabel = isResale
    ? listing.primaryAreaDisplay
      ? `(${listing.primaryAreaLabel})`
      : '(Possession Status)'
    : listing.formattedSecurityDeposit
    ? '(Security Deposit)'
    : listing.formattedMaintenance
    ? '(Maintenance)'
    : listing.primaryAreaDisplay
    ? `(${listing.primaryAreaLabel})`
    : '(Move-in Status)';

  const baseEnquiryContext: PublicEnquiryContextDto = {
    contextType: isResale ? 'RESALE' : 'RENTAL',
    title: listing.title,
    projectId: listing.project?.id,
    projectName: listing.project?.name,
    projectSlug: listing.project?.slug,
    listingId: listing.id,
    listingSlug: listing.slug,
    configuration: listing.configuration,
    propertyType: listing.propertyType,
    priceDisplay: primaryPrice,
    locationName: listing.location?.name || listing.project?.locationName || 'Kolkata',
    sourcePage: listing.canonicalUrl,
  };

  return (
    <div className="space-y-4">
      {/* CARD 1: Get Assistance from Great Homes (Matches Desktop Reference) */}
      <div className="bg-white rounded-2xl border border-[#E6E2DC] p-5 sm:p-6 shadow-xs space-y-4">
        <div className="space-y-1">
          <h3 className="text-lg sm:text-xl font-display font-bold text-[#111111] leading-snug">
            Get Assistance from{' '}
            <span className="text-[#E85D3F] block sm:inline">Great Homes</span>
          </h3>
          <p className="text-xs text-[#111111]/65 font-body leading-relaxed">
            {isResale
              ? 'Help with property information, seller coordination and a site visit.'
              : 'Help with rental terms, landlord coordination and a guided property viewing.'}
          </p>
        </div>

        {/* Warm Tinted Price & Area Summary Box (No derived ₹/sq.ft.) */}
        <div className="rounded-xl bg-[#FDF5EF] border border-[#F3DFD5] p-3.5 grid grid-cols-2 divide-x divide-[#E8D5C8] items-center">
          <div className="pr-3 min-w-0">
            <span className="text-xl lg:text-2xl font-display font-bold text-[#111111] block tracking-tight truncate">
              {primaryPrice}
            </span>
            <span className="text-[11px] font-body text-[#111111]/65 block mt-0.5">
              {priceLabel}
            </span>
          </div>

          <div className="pl-3 min-w-0">
            <div className="flex items-center gap-1">
              <span className="text-xs lg:text-sm font-display font-bold text-[#111111] truncate">
                {secondaryMetricValue}
              </span>
              <Info className="w-3.5 h-3.5 text-[#111111]/40 shrink-0" />
            </div>
            <span className="text-[11px] font-body text-[#111111]/65 block mt-0.5 truncate">
              {secondaryMetricLabel}
            </span>
          </div>
        </div>

        {/* Primary Orange CTA: Enquire About This Property */}
        <div className="space-y-2.5 pt-0.5">
          <EnquiryTriggerButton
            contextData={{
              ...baseEnquiryContext,
              requestSiteVisit: true,
              preferredContact: 'PHONE',
            }}
            className="w-full py-3.5 px-4 rounded-xl bg-[#E85D3F] hover:bg-[#D44C2F] text-white text-xs sm:text-sm font-display font-bold flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer"
          >
            <span>Enquire About This Property</span>
            <ArrowRight className="w-4 h-4" />
          </EnquiryTriggerButton>

          {/* Secondary 2-Column Row: Request a Call | WhatsApp */}
          <div className="grid grid-cols-2 gap-2.5">
            <EnquiryTriggerButton
              contextData={{
                ...baseEnquiryContext,
                requestSiteVisit: false,
                preferredContact: 'PHONE',
              }}
              className="py-2.5 px-3 rounded-xl bg-white hover:bg-[#FAFAF8] text-[#111111] border border-[#E6E2DC] text-xs font-display font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
            >
              <Phone className="w-3.5 h-3.5 text-[#111111]/75 shrink-0" />
              <span>Request a Call</span>
            </EnquiryTriggerButton>

            <EnquiryTriggerButton
              contextData={{
                ...baseEnquiryContext,
                requestSiteVisit: false,
                preferredContact: 'WHATSAPP',
              }}
              className="py-2.5 px-3 rounded-xl bg-white hover:bg-[#FAFAF8] text-[#111111] border border-[#E6E2DC] text-xs font-display font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
            >
              <MessageSquare className="w-3.5 h-3.5 text-[#218C5A] shrink-0" />
              <span>Request WhatsApp</span>
            </EnquiryTriggerButton>
          </div>

          {/* Full-Width Outlined Button: Schedule a Site Visit */}
          <EnquiryTriggerButton
            contextData={{
              ...baseEnquiryContext,
              requestSiteVisit: true,
              preferredContact: 'PHONE',
            }}
            className="w-full py-2.5 px-4 rounded-xl bg-white hover:bg-[#FFF5F0] text-[#111111] border border-[#E85D3F]/60 hover:border-[#E85D3F] text-xs font-display font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <Calendar className="w-3.5 h-3.5 text-[#E85D3F] shrink-0" />
            <span>Schedule a Site Visit</span>
          </EnquiryTriggerButton>
        </div>
      </div>

      {/* CARD 2: Verification Details Card (Strictly tied to listing.isVerified) */}
      {listing.isVerified ? (
        <div className="rounded-2xl bg-[#F2FAF6] border border-[#218C5A]/25 p-5 space-y-3.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-[#218C5A] shrink-0" />
              <h4 className="text-sm font-display font-bold text-[#111111]">
                Verification Details
              </h4>
            </div>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#1E8E5A] text-white text-[10px] font-display font-semibold">
              <CheckCircle2 className="w-3 h-3" />
              <span>Verified Listing</span>
            </span>
          </div>

          <ul className="space-y-2 text-xs font-body text-[#111111]/85">
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#218C5A] shrink-0" />
              <span>Listing Verified by Great Homes</span>
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#218C5A] shrink-0" />
              <span>Core Property Specifications Cross-checked</span>
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#218C5A] shrink-0" />
              <span>{`Listed By: ${listing.listingPartyLabel}`}</span>
            </li>
          </ul>
        </div>
      ) : (
        <div className="rounded-2xl bg-[#FAFAF8] border border-[#E6E2DC] p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#111111]/60 shrink-0" />
              <h4 className="text-sm font-display font-bold text-[#111111]">
                Verification Status
              </h4>
            </div>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#111111]/8 text-[#111111]/75 text-[10px] font-display font-semibold">
              <span>Verification Pending</span>
            </span>
          </div>

          <p className="text-xs font-body text-[#111111]/70 leading-relaxed">
            This listing is currently under Great Homes review. Request assistance from our team to confirm documentation and property details prior to a site visit.
          </p>
        </div>
      )}

      {/* CARD 3: Listing Reference & Listed By Metadata Card (Matches Desktop Reference) */}
      <div className="bg-white rounded-2xl border border-[#E6E2DC] px-5 py-3.5 divide-y divide-[#E6E2DC] text-xs font-body">
        <div className="flex items-center justify-between py-2 gap-3">
          <span className="text-[#111111]/60">Listing Reference</span>
          <span className="font-display font-bold text-[#111111] truncate max-w-[200px]">
            {listing.slug}
          </span>
        </div>
        <div className="flex items-center justify-between py-2 gap-3">
          <span className="text-[#111111]/60">Listed By</span>
          <span className="font-display font-bold text-[#111111]">
            {listing.listingPartyLabel}
          </span>
        </div>
      </div>
    </div>
  );
}
