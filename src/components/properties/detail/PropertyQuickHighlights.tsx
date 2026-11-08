import React from 'react';
import {
  BedDouble,
  Maximize2,
  Layers,
  Armchair,
  Compass,
  KeyRound,
  Calendar,
  Phone,
  MessageSquare,
  Headset,
  ChevronRight,
} from 'lucide-react';
import { PropertyDetailViewModel } from '@/src/domain/projects/viewModels/listingDetailViewModel';
import { EnquiryTriggerButton } from '@/src/components/enquiry/EnquiryTriggerButton';
import { PublicEnquiryContextDto } from '@/src/domain/enquiry/dto/enquiryDto';

interface PropertyQuickHighlightsProps {
  listing: PropertyDetailViewModel;
}

export function PropertyQuickHighlights({ listing }: PropertyQuickHighlightsProps) {
  const isResale = listing.mode === 'RESALE';
  const priceDisplay = isResale ? listing.formattedAskingPrice : listing.formattedMonthlyRent;

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
    priceDisplay,
    locationName: listing.location?.name || listing.project?.locationName || 'Kolkata',
    sourcePage: listing.canonicalUrl,
  };

  const desktopItems = [
    {
      label: 'Configuration',
      value: listing.configuration,
      icon: BedDouble,
    },
    {
      label: listing.primaryAreaLabel,
      value: listing.primaryAreaDisplay || 'On Request',
      icon: Maximize2,
    },
    {
      label: 'Floor',
      value: listing.floorCategoryDisplay,
      icon: Layers,
    },
    {
      label: 'Furnishing',
      value: listing.furnishingDisplay,
      icon: Armchair,
    },
    {
      label: 'Facing',
      value: listing.facingDisplay,
      icon: Compass,
    },
    {
      label: isResale ? 'Possession' : 'Availability',
      value: listing.possessionDisplay,
      icon: KeyRound,
    },
  ];

  return (
    <div>
      {/* DESKTOP 6-ITEM KEY HIGHLIGHTS BAR (Matches Desktop Reference) */}
      <div className="hidden md:grid md:grid-cols-6 bg-white rounded-2xl border border-[#E6E2DC] py-3.5 px-2 shadow-2xs divide-x divide-[#E6E2DC]">
        {desktopItems.map(item => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="px-3.5 flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-[#FAFAF8] border border-[#E6E2DC]/80 flex items-center justify-center text-[#111111]/75 shrink-0">
                <Icon className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <span className="text-xs lg:text-[13px] font-display font-bold text-[#111111] block truncate">
                  {item.value}
                </span>
                <span className="text-[11px] font-body text-[#111111]/55 block truncate">
                  {item.label}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* MOBILE COMPACT STRIP + 4-CARD HIGHLIGHT BOX + NEED ASSISTANCE CARD (Matches Mobile Reference) */}
      <div className="md:hidden space-y-3.5">
        {/* Compact 4-item inline spec row */}
        <div className="flex items-center justify-between gap-2 py-2.5 px-3 bg-white rounded-xl border border-[#E6E2DC] text-[11px] font-display font-semibold text-[#111111]/80 overflow-x-auto">
          <div className="flex items-center gap-1.5 shrink-0">
            <BedDouble className="w-3.5 h-3.5 text-[#111111]/55" />
            <span>{listing.bedroomCount} BHK</span>
          </div>
          <span className="text-[#E6E2DC]">|</span>
          <div className="flex items-center gap-1.5 shrink-0">
            <Layers className="w-3.5 h-3.5 text-[#111111]/55" />
            <span>{listing.floorCategoryDisplay}</span>
          </div>
          <span className="text-[#E6E2DC]">|</span>
          <div className="flex items-center gap-1.5 shrink-0">
            <Armchair className="w-3.5 h-3.5 text-[#111111]/55" />
            <span>{listing.furnishingDisplay}</span>
          </div>
          <span className="text-[#E6E2DC]">|</span>
          <div className="flex items-center gap-1.5 shrink-0">
            <KeyRound className="w-3.5 h-3.5 text-[#111111]/55" />
            <span>{listing.possessionDisplay}</span>
          </div>
        </div>

        {/* 4-Column Icon Highlight Grid */}
        <div className="grid grid-cols-4 bg-[#F7F6F2] rounded-2xl border border-[#E6E2DC] py-3 px-1 divide-x divide-[#E6E2DC]">
          <div className="px-2 flex flex-col items-center text-center space-y-1">
            <Maximize2 className="w-4 h-4 text-[#111111]/70" />
            <span className="text-[11px] font-display font-bold text-[#111111] leading-tight">
              {listing.primaryAreaDisplay || 'On Request'}
            </span>
            <span className="text-[10px] font-body text-[#111111]/55 leading-tight">
              {listing.primaryAreaLabel}
            </span>
          </div>

          <div className="px-2 flex flex-col items-center text-center space-y-1">
            <Layers className="w-4 h-4 text-[#111111]/70" />
            <span className="text-[11px] font-display font-bold text-[#111111] leading-tight">
              {listing.floorCategoryDisplay}
            </span>
            <span className="text-[10px] font-body text-[#111111]/55 leading-tight">
              Floor Level
            </span>
          </div>

          <div className="px-2 flex flex-col items-center text-center space-y-1">
            <Compass className="w-4 h-4 text-[#111111]/70" />
            <span className="text-[11px] font-display font-bold text-[#111111] leading-tight">
              {listing.facingDisplay}
            </span>
            <span className="text-[10px] font-body text-[#111111]/55 leading-tight">
              Facing
            </span>
          </div>

          <div className="px-2 flex flex-col items-center text-center space-y-1">
            <KeyRound className="w-4 h-4 text-[#111111]/70" />
            <span className="text-[11px] font-display font-bold text-[#111111] leading-tight">
              {listing.possessionDisplay}
            </span>
            <span className="text-[10px] font-body text-[#111111]/55 leading-tight">
              {isResale ? 'Possession' : 'Availability'}
            </span>
          </div>
        </div>

        {/* Mobile "Need Assistance?" Card (Matches Mobile Reference) */}
        <div className="rounded-2xl bg-[#FFF6F1] border border-[#F3DFD5] p-3.5 space-y-3">
          <EnquiryTriggerButton
            contextData={{
              ...baseEnquiryContext,
              requestSiteVisit: true,
            }}
            className="w-full flex items-center justify-between text-left cursor-pointer"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-full bg-[#E85D3F]/15 text-[#E85D3F] flex items-center justify-center shrink-0">
                <Headset className="w-4 h-4" />
              </div>
              <div>
                <span className="text-xs font-display font-bold text-[#111111] block">
                  Need Assistance?
                </span>
                <span className="text-[11px] font-body text-[#111111]/65 block">
                  Get expert help with this property
                </span>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-[#E85D3F]" />
          </EnquiryTriggerButton>

          <div className="grid grid-cols-12 gap-2">
            <EnquiryTriggerButton
              contextData={{
                ...baseEnquiryContext,
                requestSiteVisit: true,
                preferredContact: 'PHONE',
              }}
              className="col-span-5 py-2.5 px-2.5 rounded-xl bg-[#E85D3F] hover:bg-[#D44C2F] text-white text-[11px] font-display font-semibold flex items-center justify-center gap-1 shadow-2xs transition-colors cursor-pointer"
            >
              <Calendar className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Site Visit</span>
            </EnquiryTriggerButton>

            <EnquiryTriggerButton
              contextData={{
                ...baseEnquiryContext,
                requestSiteVisit: false,
                preferredContact: 'PHONE',
              }}
              className="col-span-3 py-2.5 px-2 rounded-xl bg-white hover:bg-[#FAFAF8] text-[#111111] border border-[#E6E2DC] text-[11px] font-display font-semibold flex items-center justify-center gap-1 shadow-2xs transition-colors cursor-pointer"
            >
              <Phone className="w-3 h-3 text-[#111111]/75 shrink-0" />
              <span className="truncate">Request Call</span>
            </EnquiryTriggerButton>

            <EnquiryTriggerButton
              contextData={{
                ...baseEnquiryContext,
                requestSiteVisit: false,
                preferredContact: 'WHATSAPP',
              }}
              className="col-span-4 py-2.5 px-2 rounded-xl bg-white hover:bg-[#FAFAF8] text-[#111111] border border-[#E6E2DC] text-[11px] font-display font-semibold flex items-center justify-center gap-1 shadow-2xs transition-colors cursor-pointer"
            >
              <MessageSquare className="w-3 h-3 text-[#218C5A] shrink-0" />
              <span className="truncate">WhatsApp Help</span>
            </EnquiryTriggerButton>
          </div>
        </div>
      </div>
    </div>
  );
}
