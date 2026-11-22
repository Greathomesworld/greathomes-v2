'use client';

import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import {
  CANONICAL_ATTESTATION_VERSION,
  MAX_SUBMISSION_PHOTOS,
  MIN_SUBMISSION_PHOTOS,
  type PropertySubmissionPayload,
  type SubmissionPropertyType,
} from '@/src/domain/propertySubmission/validation';
import type { InternalWizardStepNumber } from '../wizardStepMapping';

export interface ReviewStepActivityItem {
  id: string;
  label: string;
  description: string;
  previousStatus: string | null;
  newStatus: string;
  timestamp: string;
}

export interface ReviewStepAmenityItem {
  slug: string;
  name: string;
}

export interface ReviewSubmitStepProps {
  wizardState: PropertySubmissionPayload;
  customerName?: string | null;
  canEdit: boolean;
  amenitiesCatalog: ReviewStepAmenityItem[];
  featuredPhoto: NonNullable<PropertySubmissionPayload['photos']>[number] | null;
  loadedActivityTimeline: ReviewStepActivityItem[];
  onJumpToStep: (step: InternalWizardStepNumber) => void;
}

function formatIndianCurrency(value?: number | null): string {
  if (!value || !Number.isFinite(value) || value <= 0) return '—';
  if (value >= 10_000_000) {
    return `₹${(value / 10_000_000).toFixed(2).replace(/\.00$/, '')} Crore`;
  }
  if (value >= 100_000) {
    return `₹${(value / 100_000).toFixed(2).replace(/\.00$/, '')} Lakh`;
  }
  return `₹${value.toLocaleString('en-IN')}`;
}

function formatPropertyTypeDisplay(propertyType: SubmissionPropertyType): string {
  switch (propertyType) {
    case 'APARTMENT':
      return 'Apartment';
    case 'INDEPENDENT_HOUSE':
      return 'Independent House';
    case 'PLOT':
      return 'Residential Plot';
    default:
      return 'Property';
  }
}

export const ReviewSubmitStep = React.memo(function ReviewSubmitStep({
  wizardState,
  customerName,
  canEdit,
  amenitiesCatalog,
  featuredPhoto,
  loadedActivityTimeline,
  onJumpToStep,
}: ReviewSubmitStepProps) {
  return (
    <div className="mt-6 space-y-6">
      {/* Read-Only Overview: Listing Basics (carried from Page 1 & account) */}
      <div className="rounded-xl border border-[#E5E0D8] bg-[#FAFAF8] p-5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-display text-sm font-bold text-[#111111]">Listing Overview</h3>
          <span className="text-xs text-[#6E6A65] font-body">Account-verified selection</span>
        </div>
        <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3 text-xs sm:text-sm font-body">
          <div>
            <dt className="text-[#6E6A65]">Listing Purpose</dt>
            <dd className="mt-0.5 font-semibold text-[#111111]">
              {wizardState.listingType === 'RENTAL' ? 'Rent' : 'Sell'} ({wizardState.listingType})
            </dd>
          </div>
          <div>
            <dt className="text-[#6E6A65]">Property Type</dt>
            <dd className="mt-0.5 font-semibold text-[#111111]">
              {formatPropertyTypeDisplay(wizardState.propertyType)}
            </dd>
          </div>
          <div>
            <dt className="text-[#6E6A65]">Submission Source</dt>
            <dd className="mt-0.5 font-semibold text-[#111111]">
              {wizardState.listingSource === 'PARTNER'
                ? 'Approved Listing Partner'
                : 'Property Owner'}
            </dd>
          </div>
        </dl>
      </div>

      {/* Summary Card 1: Location & Project */}
      <div className="rounded-xl border border-[#E5E0D8] bg-[#FAFAF8] p-5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-display text-sm font-bold text-[#111111]">
            01. Location &amp; Project
          </h3>
          {canEdit && (
            <button
              type="button"
              onClick={() => onJumpToStep(2)}
              className="min-h-[36px] text-xs font-semibold text-[#E85D3F] hover:underline font-display cursor-pointer"
            >
              Edit Step 1
            </button>
          )}
        </div>
        <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 text-xs sm:text-sm font-body">
          <div>
            <dt className="text-[#6E6A65]">City &amp; Locality</dt>
            <dd className="mt-0.5 font-semibold text-[#111111]">
              {wizardState.location?.locality || '—'}, {wizardState.location?.city || 'Kolkata'}
            </dd>
          </div>
          <div>
            <dt className="text-[#6E6A65]">Mapped Project / Building</dt>
            <dd className="mt-0.5 font-semibold text-[#111111]">
              {wizardState.location?.projectName || 'Standalone Residential Property'}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-[#6E6A65]">Verification Address</dt>
            <dd className="mt-0.5 font-medium text-[#111111]">
              {wizardState.location?.address || '—'}
            </dd>
          </div>
        </dl>
      </div>

      {/* Summary Card 2: Details & Pricing */}
      <div className="rounded-xl border border-[#E5E0D8] bg-[#FAFAF8] p-5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-display text-sm font-bold text-[#111111]">
            02. Details &amp; Pricing
          </h3>
          {canEdit && (
            <button
              type="button"
              onClick={() => onJumpToStep(3)}
              className="min-h-[36px] text-xs font-semibold text-[#E85D3F] hover:underline font-display cursor-pointer"
            >
              Edit Step 2
            </button>
          )}
        </div>
        <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3 text-xs sm:text-sm font-body tabular-nums">
          {wizardState.propertyType !== 'PLOT' ? (
            <>
              <div>
                <dt className="text-[#6E6A65]">Configuration</dt>
                <dd className="mt-0.5 font-semibold text-[#111111]">
                  {wizardState.details?.bedroomCount} BHK · {wizardState.details?.bathroomCount}{' '}
                  Bath
                  {typeof wizardState.details?.balconies === 'number'
                    ? ` · ${wizardState.details.balconies} Balc`
                    : ''}
                </dd>
              </div>
              <div>
                <dt className="text-[#6E6A65]">Areas (sq. ft.)</dt>
                <dd className="mt-0.5 font-semibold text-[#111111]">
                  {wizardState.details?.carpetArea
                    ? `Carpet ${wizardState.details.carpetArea}`
                    : 'Carpet —'}
                  {wizardState.details?.builtUpArea
                    ? ` · Built-up ${wizardState.details.builtUpArea}`
                    : ''}
                  {wizardState.details?.superBuiltUpArea
                    ? ` · Super ${wizardState.details.superBuiltUpArea}`
                    : ''}
                </dd>
              </div>
              <div>
                <dt className="text-[#6E6A65]">Parking &amp; Building Age</dt>
                <dd className="mt-0.5 font-semibold text-[#111111]">
                  {typeof wizardState.details?.coveredParking === 'number' ||
                  typeof wizardState.details?.openParking === 'number'
                    ? `${wizardState.details?.coveredParking ?? 0} Covered · ${
                        wizardState.details?.openParking ?? 0
                      } Open`
                    : 'Parking —'}
                  {typeof wizardState.details?.propertyAgeYears === 'number'
                    ? ` · ${wizardState.details.propertyAgeYears} yr${
                        wizardState.details.propertyAgeYears === 1 ? '' : 's'
                      } old`
                    : ''}
                </dd>
              </div>
            </>
          ) : (
            <div>
              <dt className="text-[#6E6A65]">Plot Area</dt>
              <dd className="mt-0.5 font-semibold text-[#111111]">
                {wizardState.details?.plotArea ? `${wizardState.details.plotArea} sq. ft.` : '—'}
              </dd>
            </div>
          )}

          <div>
            <dt className="text-[#6E6A65]">
              {wizardState.listingType === 'RESALE' ? 'Asking Price' : 'Monthly Rent'}
            </dt>
            <dd className="mt-0.5 font-semibold text-[#E85D3F]">
              {wizardState.listingType === 'RESALE'
                ? formatIndianCurrency(wizardState.details?.askingPrice)
                : `${formatIndianCurrency(wizardState.details?.monthlyRent)} / month`}
            </dd>
          </div>

          {wizardState.listingType === 'RESALE' && wizardState.details?.possessionDate && (
            <div>
              <dt className="text-[#6E6A65]">Possession Date</dt>
              <dd className="mt-0.5 font-semibold text-[#111111]">
                {wizardState.details.possessionDate}
              </dd>
            </div>
          )}

          {wizardState.listingType === 'RENTAL' &&
            (wizardState.details?.leaseDuration ||
              wizardState.details?.noticePeriod ||
              wizardState.details?.availabilityDate) && (
              <div className="sm:col-span-2">
                <dt className="text-[#6E6A65]">Lease Terms &amp; Availability</dt>
                <dd className="mt-0.5 font-semibold text-[#111111]">
                  {[
                    wizardState.details?.leaseDuration
                      ? `Lease: ${wizardState.details.leaseDuration}`
                      : null,
                    wizardState.details?.noticePeriod
                      ? `Notice: ${wizardState.details.noticePeriod}`
                      : null,
                    wizardState.details?.availabilityDate
                      ? `Available: ${wizardState.details.availabilityDate}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </dd>
              </div>
            )}

          {Array.isArray(wizardState.details?.amenities) &&
            wizardState.details.amenities.length > 0 && (
              <div className="sm:col-span-3">
                <dt className="text-[#6E6A65]">Selected Amenities</dt>
                <dd className="mt-0.5 font-medium text-[#111111]">
                  {wizardState.details.amenities
                    .map((slug) => amenitiesCatalog.find((a) => a.slug === slug)?.name || slug)
                    .join(', ')}
                </dd>
              </div>
            )}
        </dl>
      </div>

      {/* Summary Card 3: Property Photographs */}
      <div className="rounded-xl border border-[#E5E0D8] bg-[#FAFAF8] p-5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-display text-sm font-bold text-[#111111] tabular-nums">
            03. Property Photographs ({wizardState.photos?.length || 0} of {MAX_SUBMISSION_PHOTOS}{' '}
            Uploaded)
          </h3>
          {canEdit && (
            <button
              type="button"
              onClick={() => onJumpToStep(4)}
              className="min-h-[36px] text-xs font-semibold text-[#E85D3F] hover:underline font-display cursor-pointer"
            >
              Edit Step 3
            </button>
          )}
        </div>
        {featuredPhoto ? (
          <div className="mt-3 space-y-3">
            <div className="flex items-center gap-4">
              <img
                src={featuredPhoto.url}
                alt={featuredPhoto.caption || 'Featured cover'}
                referrerPolicy="no-referrer"
                className="h-16 w-24 rounded-lg object-cover border border-[#D9D5D0]"
              />
              <div className="text-xs font-body">
                <p className="font-semibold text-[#111111]">
                  Featured Cover: {featuredPhoto.caption || featuredPhoto.category}
                </p>
                <p className="mt-0.5 text-[#6E6A65] tabular-nums">
                  {wizardState.photos.length} watermarked photograph(s) ordered for moderation
                  review
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {wizardState.photos.map((photo, idx) => (
                <div
                  key={photo.id}
                  className={`relative h-12 w-16 overflow-hidden rounded-lg border ${
                    photo.isFeatured ? 'border-[#E85D3F]' : 'border-[#D9D5D0]'
                  }`}
                >
                  <img
                    src={photo.url}
                    alt={photo.caption || `Photograph ${idx + 1}`}
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-cover"
                  />
                  <span className="absolute bottom-0.5 left-0.5 rounded bg-black/75 px-1 text-[10px] font-semibold text-white font-display tabular-nums">
                    #{idx + 1}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="mt-2 text-xs text-[#E85D3F] font-body">
            Minimum {MIN_SUBMISSION_PHOTOS} photographs are required before submission.
          </p>
        )}
      </div>

      {/* Summary Card 4: Authority & Consent */}
      <div className="rounded-xl border border-[#E5E0D8] bg-[#FAFAF8] p-5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-display text-sm font-bold text-[#111111]">
            04.{' '}
            {wizardState.listingSource === 'OWNER'
              ? 'Owner Authority Declaration'
              : 'Partner Consent Attestation'}
          </h3>
          {canEdit && (
            <button
              type="button"
              onClick={() => onJumpToStep(5)}
              className="min-h-[36px] text-xs font-semibold text-[#E85D3F] hover:underline font-display cursor-pointer"
            >
              Edit Step 4
            </button>
          )}
        </div>
        <p className="mt-2 text-xs sm:text-sm text-[#333333] font-body">
          {(wizardState.listingSource === 'OWNER' &&
            wizardState.consent?.ownerDeclarationAccepted) ||
          (wizardState.listingSource === 'PARTNER' &&
            wizardState.consent?.partnerAttestationAccepted) ? (
            <span className="inline-flex items-center gap-1.5 text-[#218C5A] font-medium">
              <CheckCircle2 className="h-4 w-4" />
              Confirmed by {customerName} (Version {CANONICAL_ATTESTATION_VERSION})
            </span>
          ) : (
            <span className="text-[#E85D3F] font-medium">
              Declaration confirmation required in Step 4.
            </span>
          )}
        </p>
      </div>

      {/* Verification & Publication Governance Notice */}
      <div className="rounded-xl border border-[#E5E0D8] bg-white p-4 text-xs text-[#555555] font-body">
        <p className="font-display font-bold text-[#111111]">
          Verification &amp; Publication Governance
        </p>
        <p className="mt-1 leading-relaxed">
          Submitting this property places it in the Great Homes verification queue (Status:{' '}
          <span className="font-semibold text-[#111111]">SUBMITTED</span>). It will not become
          publicly visible until our property moderation team verifies and publishes the listing.
        </p>
      </div>

      {/* Submission Activity & Verification History */}
      {loadedActivityTimeline.length > 0 && (
        <div className="rounded-xl border border-[#E5E0D8] bg-[#FAFAF8] p-5">
          <h3 className="font-display text-sm font-bold text-[#111111]">
            Submission Activity &amp; Verification History
          </h3>
          <ol className="mt-3 space-y-2.5">
            {loadedActivityTimeline.map((act) => (
              <li
                key={act.id}
                className="rounded-lg border border-[#E5E0D8] bg-white p-3 text-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-display font-bold text-[#111111]">{act.label}</span>
                  <span className="text-[#6E6A65] font-body tabular-nums">
                    {new Date(act.timestamp).toLocaleString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      timeZone: 'Asia/Kolkata',
                    })}
                  </span>
                </div>
                <p className="mt-1 text-[#4A4743] font-body">{act.description}</p>
                {act.previousStatus && (
                  <p className="mt-1 text-[11px] text-[#6E6A65] font-display">
                    Transition: {act.previousStatus} → {act.newStatus}
                  </p>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
});
