'use client';

import React from 'react';
import { ArrowRight, ChevronDown, Loader2, Lock } from 'lucide-react';
import type { ListingType, SubmissionPropertyType } from '@/src/domain/propertySubmission/validation';
import type { PostPropertyLocationOption } from '@/src/domain/locations/locationOptions';

export type { PostPropertyLocationOption };

interface QuickPostHeroFormProps {
  locations: PostPropertyLocationOption[];
  listingType: ListingType;
  onListingTypeChange: (value: ListingType) => void;
  propertyType: SubmissionPropertyType | '';
  onPropertyTypeChange: (value: SubmissionPropertyType | '') => void;
  selectedLocationKey: string;
  onLocationChange: (value: string) => void;
  onSubmit: () => void;
  errors: {
    propertyType?: string;
    location?: string;
  };
  isSubmitting?: boolean;
  ctaLabel?: string;
}

export function QuickPostHeroForm({
  locations,
  listingType,
  onListingTypeChange,
  propertyType,
  onPropertyTypeChange,
  selectedLocationKey,
  onLocationChange,
  onSubmit,
  errors,
  isSubmitting = false,
  ctaLabel = 'Start Now',
}: QuickPostHeroFormProps) {
  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit();
  };

  return (
    <div
      id="quick-post-form"
      className="rounded-xl sm:rounded-2xl border border-[#E5E0D8] bg-white p-4 sm:p-7 shadow-2xs sm:shadow-[0_14px_40px_rgba(17,17,17,0.06)]"
    >
      <h2 className="font-display text-lg sm:text-[21px] font-bold tracking-tight text-[#111111]">
        Start Posting Your Property
      </h2>
      <p className="mt-0.5 sm:mt-1 text-xs sm:text-[13px] text-[#6E6A65] font-body">
        It&apos;s easy to get started and takes just a few minutes.
      </p>

      <form onSubmit={handleFormSubmit} noValidate className="mt-3.5 sm:mt-5 space-y-3.5 sm:space-y-4">
        {/* Listing Purpose Toggle (Sell / Rent) */}
        <div>
          <span
            id="quick-post-purpose-label"
            className="block font-display text-xs font-semibold text-[#111111]"
          >
            I want to <span className="text-[#E85D3F]">*</span>
          </span>
          <div
            role="radiogroup"
            aria-labelledby="quick-post-purpose-label"
            className="mt-2 grid grid-cols-2 gap-3"
          >
            <button
              type="button"
              role="radio"
              aria-checked={listingType === 'RESALE'}
              onClick={() => onListingTypeChange('RESALE')}
              className={`min-h-[44px] flex items-center gap-2.5 rounded-lg border px-3.5 py-2.5 text-left transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E85D3F]/50 ${
                listingType === 'RESALE'
                  ? 'border-[#E85D3F] bg-[#FFF8F5] text-[#111111] shadow-[0_0_0_1px_rgba(232,93,63,0.18)]'
                  : 'border-[#D9D5D0] bg-white text-[#4A4743] hover:border-[#ABA59E]'
              }`}
            >
              <span
                aria-hidden="true"
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition ${
                  listingType === 'RESALE'
                    ? 'border-[#E85D3F] bg-white'
                    : 'border-[#ABA59E] bg-white'
                }`}
              >
                {listingType === 'RESALE' && (
                  <span className="h-2 w-2 rounded-full bg-[#E85D3F]" />
                )}
              </span>
              <span className="font-display text-sm font-semibold whitespace-nowrap">Sell</span>
            </button>

            <button
              type="button"
              role="radio"
              aria-checked={listingType === 'RENTAL'}
              onClick={() => onListingTypeChange('RENTAL')}
              className={`min-h-[44px] flex items-center gap-2.5 rounded-lg border px-3.5 py-2.5 text-left transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E85D3F]/50 ${
                listingType === 'RENTAL'
                  ? 'border-[#E85D3F] bg-[#FFF8F5] text-[#111111] shadow-[0_0_0_1px_rgba(232,93,63,0.18)]'
                  : 'border-[#D9D5D0] bg-white text-[#4A4743] hover:border-[#ABA59E]'
              }`}
            >
              <span
                aria-hidden="true"
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition ${
                  listingType === 'RENTAL'
                    ? 'border-[#E85D3F] bg-white'
                    : 'border-[#ABA59E] bg-white'
                }`}
              >
                {listingType === 'RENTAL' && (
                  <span className="h-2 w-2 rounded-full bg-[#E85D3F]" />
                )}
              </span>
              <span className="font-display text-sm font-semibold whitespace-nowrap">Rent</span>
            </button>
          </div>
        </div>

        {/* Property Type Select */}
        <div>
          <label
            htmlFor="quick-post-property-type"
            className="block font-display text-xs font-semibold text-[#111111]"
          >
            Property type <span className="text-[#E85D3F]">*</span>
          </label>
          <div className="relative mt-1.5">
            <select
              id="quick-post-property-type"
              value={propertyType}
              onChange={(e) =>
                onPropertyTypeChange(e.target.value as SubmissionPropertyType | '')
              }
              aria-invalid={Boolean(errors.propertyType)}
              aria-describedby={errors.propertyType ? 'quick-post-property-type-error' : undefined}
              className={`w-full min-h-[44px] appearance-none rounded-lg border bg-white pl-3.5 pr-10 py-2.5 text-base sm:text-sm outline-none transition font-body cursor-pointer ${
                propertyType ? 'text-[#111111]' : 'text-[#6E6A65]'
              } ${
                errors.propertyType
                  ? 'border-[#DC2626] focus:border-[#DC2626] focus:ring-2 focus:ring-[#DC2626]/15'
                  : 'border-[#D9D5D0] focus:border-[#E85D3F] focus:ring-2 focus:ring-[#E85D3F]/15'
              }`}
            >
              <option value="">Select property type</option>
              <option value="APARTMENT">Apartment</option>
              <option value="INDEPENDENT_HOUSE">Independent House</option>
              <option value="PLOT">Plot</option>
            </select>
            <ChevronDown
              className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6E6A65]"
              aria-hidden="true"
            />
          </div>
          {errors.propertyType && (
            <p
              id="quick-post-property-type-error"
              role="alert"
              className="mt-1.5 text-xs font-medium text-[#DC2626] font-body"
            >
              {errors.propertyType}
            </p>
          )}
        </div>

        {/* Kolkata Locality Select */}
        <div>
          <label
            htmlFor="quick-post-location"
            className="block font-display text-xs font-semibold text-[#111111]"
          >
            Location <span className="text-[#E85D3F]">*</span>
          </label>
          <div className="relative mt-1.5">
            <select
              id="quick-post-location"
              value={selectedLocationKey}
              onChange={(e) => onLocationChange(e.target.value)}
              aria-invalid={Boolean(errors.location)}
              aria-describedby={errors.location ? 'quick-post-location-error' : undefined}
              className={`w-full min-h-[44px] appearance-none rounded-lg border bg-white pl-3.5 pr-10 py-2.5 text-base sm:text-sm outline-none transition font-body cursor-pointer ${
                selectedLocationKey ? 'text-[#111111]' : 'text-[#6E6A65]'
              } ${
                errors.location
                  ? 'border-[#DC2626] focus:border-[#DC2626] focus:ring-2 focus:ring-[#DC2626]/15'
                  : 'border-[#D9D5D0] focus:border-[#E85D3F] focus:ring-2 focus:ring-[#E85D3F]/15'
              }`}
            >
              <option value="">Select location in Kolkata</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.label}
                </option>
              ))}
              <option value="custom">Other Kolkata Locality (Enter manually in Wizard)</option>
            </select>
            <ChevronDown
              className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6E6A65]"
              aria-hidden="true"
            />
          </div>
          {errors.location && (
            <p
              id="quick-post-location-error"
              role="alert"
              className="mt-1.5 text-xs font-medium text-[#DC2626] font-body"
            >
              {errors.location}
            </p>
          )}
        </div>

        {/* Primary CTA */}
        <button
          type="submit"
          disabled={isSubmitting}
          className="mt-1 w-full min-h-[46px] inline-flex items-center justify-center gap-2 rounded-lg bg-[#E85D3F] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#D44E32] disabled:opacity-65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E85D3F] focus-visible:ring-offset-2 font-display cursor-pointer whitespace-nowrap"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin shrink-0" aria-hidden="true" />
              <span>Checking Status...</span>
            </>
          ) : (
            <>
              <span>{ctaLabel}</span>
              <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
            </>
          )}
        </button>

        {/* Privacy Reassurance */}
        <div className="flex items-center justify-center gap-1.5 pt-0.5 text-xs text-[#6E6A65] font-body">
          <Lock className="h-3.5 w-3.5 shrink-0 text-[#6E6A65]" aria-hidden="true" />
          <span>Your details are secure and never shared publicly.</span>
        </div>
      </form>
    </div>
  );
}
