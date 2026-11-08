import React from 'react';
import {
  BedDouble,
  Maximize2,
  Layers,
  Armchair,
  KeyRound,
  Compass,
} from 'lucide-react';
import { PropertyDetailViewModel } from '@/src/domain/projects/viewModels/listingDetailViewModel';

interface PropertySpecificationsSectionProps {
  listing: PropertyDetailViewModel;
}

export function PropertySpecificationsSection({
  listing,
}: PropertySpecificationsSectionProps) {
  const isResale = listing.mode === 'RESALE';

  const specs: { label: string; value: string }[] = [
    { label: 'Property Type', value: listing.propertyTypeDisplay },
    { label: 'Configuration', value: listing.configuration },
    {
      label: 'Carpet Area',
      value: listing.carpetAreaDisplay || 'On Request',
    },
    ...(listing.builtUpAreaDisplay
      ? [{ label: 'Built-Up Area', value: listing.builtUpAreaDisplay }]
      : []),
    ...(listing.superBuiltUpAreaDisplay
      ? [{ label: 'Super Built-Up Area', value: listing.superBuiltUpAreaDisplay }]
      : []),
    { label: 'Furnishing Status', value: listing.furnishingDisplay },
    { label: 'Facing Direction', value: listing.facingDisplay },
    // Strictly floor category only — never exact floor number
    { label: 'Floor Level', value: listing.floorCategoryDisplay },
    {
      label: isResale ? 'Possession Status' : 'Availability Status',
      value: listing.possessionDisplay,
    },
    { label: 'Listed By', value: listing.listingPartyLabel },
  ];

  const mobileHighlightCards = [
    {
      icon: BedDouble,
      value: listing.configuration,
      label: 'Configuration',
    },
    {
      icon: Maximize2,
      value: listing.primaryAreaDisplay || 'On Request',
      label: listing.primaryAreaLabel,
    },
    {
      icon: Layers,
      value: listing.floorCategoryDisplay,
      label: 'Floor Level',
    },
    {
      icon: Armchair,
      value: listing.furnishingDisplay,
      label: 'Furnishing',
    },
    {
      icon: KeyRound,
      value: listing.possessionDisplay,
      label: isResale ? 'Possession' : 'Availability',
    },
    {
      icon: Compass,
      value: listing.facingDisplay,
      label: 'Facing',
    },
  ];

  return (
    <section id="specifications" className="scroll-mt-32 space-y-4">
      {/* Mobile "Property Highlights" Horizontal Card Strip (Matches Mobile Reference) */}
      <div className="md:hidden space-y-2.5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-display font-bold text-[#111111]">
            Property Highlights
          </h2>
          <span className="text-[11px] font-display font-semibold text-[#E85D3F]">
            Verified Specs
          </span>
        </div>
        <div className="flex items-stretch gap-2.5 overflow-x-auto no-scrollbar pb-1">
          {mobileHighlightCards.map(card => {
            const Icon = card.icon;
            return (
              <div
                key={card.label}
                className="min-w-[104px] p-3 rounded-xl bg-white border border-[#E6E2DC] flex flex-col items-center text-center justify-center space-y-1 shrink-0 shadow-2xs"
              >
                <Icon className="w-4 h-4 text-[#111111]/65" />
                <span className="text-xs font-display font-bold text-[#111111] leading-tight">
                  {card.value}
                </span>
                <span className="text-[10px] font-body text-[#111111]/55 leading-tight">
                  {card.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Specifications Table Card */}
      <div className="bg-white rounded-2xl border border-[#E6E2DC] p-5 sm:p-6 shadow-2xs space-y-4">
        <div>
          <span className="text-[11px] font-display uppercase tracking-wider text-[#E85D3F] font-semibold block">
            Specifications
          </span>
          <h2 className="text-base sm:text-lg font-display font-bold text-[#111111]">
            {isResale ? 'Property Specifications & Details' : 'Rental Property Specifications'}
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2.5 gap-x-8 text-xs sm:text-sm divide-y sm:divide-y-0 divide-[#E6E2DC]/60">
          {specs.map(spec => (
            <div
              key={spec.label}
              className="flex items-center justify-between py-2 sm:border-b sm:border-[#E6E2DC]/60"
            >
              <span className="text-[#111111]/60 font-body">{spec.label}</span>
              <span className="font-display font-semibold text-[#111111] text-right">
                {spec.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
