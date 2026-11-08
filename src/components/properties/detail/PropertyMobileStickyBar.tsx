import React from 'react';
import { ArrowRight } from 'lucide-react';
import { PropertyDetailViewModel } from '@/src/domain/projects/viewModels/listingDetailViewModel';
import { EnquiryTriggerButton } from '@/src/components/enquiry/EnquiryTriggerButton';
import { PublicEnquiryContextDto } from '@/src/domain/enquiry/dto/enquiryDto';

interface PropertyMobileStickyBarProps {
  listing: PropertyDetailViewModel;
}

export function PropertyMobileStickyBar({ listing }: PropertyMobileStickyBarProps) {
  const isResale = listing.mode === 'RESALE';
  const primaryPrice = isResale ? listing.formattedAskingPrice : listing.formattedMonthlyRent;
  const priceLabel = isResale ? 'Asking Price' : 'Monthly Rent';
  const subContext = isResale
    ? listing.primaryAreaDisplay || listing.configuration
    : listing.formattedMaintenance
    ? `+ ${listing.formattedMaintenance}`
    : listing.primaryAreaDisplay || listing.configuration;

  const enquiryContext: PublicEnquiryContextDto = {
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
    requestSiteVisit: true,
    preferredContact: 'PHONE',
    sourcePage: listing.canonicalUrl,
  };

  return (
    <aside
      aria-label="Mobile property enquiry bar"
      className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom,0px))] md:bottom-0 z-40 lg:hidden bg-white/95 backdrop-blur-md border-t border-[#E6E2DC] px-4 py-2.5 md:pb-[max(0.625rem,env(safe-area-inset-bottom,0px))] shadow-[0_-4px_20px_rgba(0,0,0,0.06)]"
    >
      <div className="max-w-lg mx-auto flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <span className="text-[10px] font-display uppercase tracking-wider font-semibold text-[#111111]/55 block">
            {priceLabel}
          </span>
          <div className="flex items-baseline gap-2 truncate">
            <span className="text-lg font-display font-bold text-[#111111] tracking-tight">
              {primaryPrice}
            </span>
            {subContext && (
              <span className="text-[11px] font-body text-[#111111]/55 truncate">
                {subContext}
              </span>
            )}
          </div>
        </div>

        <EnquiryTriggerButton
          contextData={enquiryContext}
          className="py-3 px-5 rounded-xl bg-[#E85D3F] hover:bg-[#D44C2F] text-white text-xs font-display font-bold flex items-center justify-center gap-1.5 shadow-xs transition-colors shrink-0 cursor-pointer"
        >
          <span>Enquire Now</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </EnquiryTriggerButton>
      </div>
    </aside>
  );
}
