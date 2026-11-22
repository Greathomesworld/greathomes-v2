'use client';

import React from 'react';
import {
  CANONICAL_ATTESTATION_VERSION,
  CANONICAL_OWNER_DECLARATION_TEXT,
  CANONICAL_PARTNER_ATTESTATION_TEXT,
  type ListingSource,
} from '@/src/domain/propertySubmission/validation';

export interface AuthorityConsentStepProps {
  customerName?: string | null;
  customerPhone?: string | null;
  listingSource: ListingSource;
  ownerDeclarationAccepted: boolean;
  partnerAttestationAccepted: boolean;
  onOwnerDeclarationChange: (accepted: boolean) => void;
  onPartnerAttestationChange: (accepted: boolean) => void;
}

export const AuthorityConsentStep = React.memo(function AuthorityConsentStep({
  customerName,
  customerPhone,
  listingSource,
  ownerDeclarationAccepted,
  partnerAttestationAccepted,
  onOwnerDeclarationChange,
  onPartnerAttestationChange,
}: AuthorityConsentStepProps) {
  return (
    <div className="mt-6 space-y-6">
      <div className="rounded-xl border border-[#E5E0D8] bg-[#FAFAF8] p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#6E6A65] font-display">
          <span>Authenticated Submitter Identity</span>
          <span className="tabular-nums">Consent Version: {CANONICAL_ATTESTATION_VERSION}</span>
        </div>
        <p className="mt-2 font-display text-base font-bold text-[#111111]">
          {customerName} {customerPhone ? `(${customerPhone})` : ''}
        </p>
        <p className="mt-1 text-xs text-[#555555] font-body">
          Submission Source:{' '}
          <span className="font-semibold text-[#111111]">{listingSource}</span>
          {' · '}No physical ownership deeds or PDF documents are collected in this step.
        </p>
      </div>

      {listingSource === 'OWNER' ? (
        <div className="rounded-2xl border border-[#D9D5D0] bg-white p-5 sm:p-6">
          <h3 className="font-display text-base font-bold text-[#111111]">
            Property Owner Authority Declaration
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-[#4A4743] font-body">
            {CANONICAL_OWNER_DECLARATION_TEXT}
          </p>

          <label className="mt-5 flex min-h-[48px] items-start gap-3.5 rounded-xl border border-transparent hover:bg-[#FAFAF8] p-2 -mx-2 cursor-pointer select-none border-t-[#F0EDE8]">
            <input
              type="checkbox"
              checked={ownerDeclarationAccepted}
              onChange={(e) => onOwnerDeclarationChange(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 rounded border-[#D9D5D0] accent-[#E85D3F] focus:ring-2 focus:ring-[#E85D3F]/30"
            />
            <span className="text-sm font-medium text-[#111111] font-body leading-relaxed">
              I confirm that I am the legal owner (or authorized representative) of this property
              and have the authority to submit it for verification by Great Homes.
            </span>
          </label>
        </div>
      ) : (
        <div className="rounded-2xl border border-[#D9D5D0] bg-white p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display text-base font-bold text-[#111111]">
              Authorized Partner Owner-Consent Attestation
            </h3>
            <span className="text-xs font-semibold text-[#218C5A] font-display">
              Partner Identity Verified
            </span>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-[#4A4743] font-body">
            {CANONICAL_PARTNER_ATTESTATION_TEXT}
          </p>

          <label className="mt-5 flex min-h-[48px] items-start gap-3.5 rounded-xl border border-transparent hover:bg-[#FAFAF8] p-2 -mx-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={partnerAttestationAccepted}
              onChange={(e) => onPartnerAttestationChange(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 rounded border-[#D9D5D0] accent-[#E85D3F] focus:ring-2 focus:ring-[#E85D3F]/30"
            />
            <span className="text-sm font-medium text-[#111111] font-body leading-relaxed">
              I explicitly attest under my verified partner identity ({customerName}) that the
              property owner has authorized this submission on Great Homes.
            </span>
          </label>
        </div>
      )}
    </div>
  );
});
