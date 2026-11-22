'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowRight,
  Building2,
  CheckCircle2,
  Clock3,
  HelpCircle,
  Home,
  Loader2,
  Lock,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  XCircle,
} from 'lucide-react';
import type { CustomerDto, PartnerProfileStatus } from '@/src/domain/customer/entities';
import { useEnquiry } from '@/src/components/enquiry/EnquiryContext';
import { safeFetchJson } from '@/src/lib/safeApiFetch';

export interface PartnerEligibilityState {
  checking: boolean;
  checked: boolean;
  eligible: boolean;
  status: string | null;
  message: string | null;
  profile?: {
    agencyName?: string | null;
    businessAddress?: string | null;
    locality?: string | null;
    city?: string | null;
    agencyContactPhone?: string | null;
    rejectionReason?: string | null;
    suspensionReason?: string | null;
    revocationReason?: string | null;
  } | null;
}

export type BeforeYouStartMode =
  | 'AUTH_LOADING'
  | 'UNAUTHENTICATED'
  | 'ACCOUNT_TYPE_INCOMPLETE'
  | 'PARTNER_CHECKING'
  | 'PARTNER_CHECK_ERROR'
  | 'OWNER_ELIGIBLE'
  | 'PARTNER_ACTIVE_ELIGIBLE'
  | 'PARTNER_PENDING'
  | 'PARTNER_REJECTED'
  | 'PARTNER_SUSPENDED'
  | 'PARTNER_REVOKED';

export function evaluateBeforeYouStartState(params: {
  authLoading: boolean;
  customer: Pick<CustomerDto, 'id' | 'accountType'> | null | undefined;
  partnerStatus: Pick<PartnerEligibilityState, 'checking' | 'checked' | 'eligible' | 'status'>;
}): { mode: BeforeYouStartMode; canAccessWizard: boolean } {
  const { authLoading, customer, partnerStatus } = params;

  if (authLoading) {
    return { mode: 'AUTH_LOADING', canAccessWizard: false };
  }
  if (!customer) {
    return { mode: 'UNAUTHENTICATED', canAccessWizard: false };
  }
  if (!customer.accountType) {
    return { mode: 'ACCOUNT_TYPE_INCOMPLETE', canAccessWizard: false };
  }
  if (customer.accountType === 'OWNER') {
    return { mode: 'OWNER_ELIGIBLE', canAccessWizard: true };
  }

  // LISTING_PARTNER must pass server partner-status eligibility check
  if (partnerStatus.checking || !partnerStatus.checked) {
    return { mode: 'PARTNER_CHECKING', canAccessWizard: false };
  }
  if (partnerStatus.eligible && partnerStatus.status === 'ACTIVE') {
    return { mode: 'PARTNER_ACTIVE_ELIGIBLE', canAccessWizard: true };
  }

  const statusUpper = String(partnerStatus.status || '').toUpperCase() as
    | PartnerProfileStatus
    | 'ERROR'
    | 'NETWORK_ERROR'
    | 'NONE'
    | '';

  if (statusUpper === 'PENDING') {
    return { mode: 'PARTNER_PENDING', canAccessWizard: false };
  }
  if (statusUpper === 'REJECTED') {
    return { mode: 'PARTNER_REJECTED', canAccessWizard: false };
  }
  if (statusUpper === 'SUSPENDED') {
    return { mode: 'PARTNER_SUSPENDED', canAccessWizard: false };
  }
  if (statusUpper === 'REVOKED') {
    return { mode: 'PARTNER_REVOKED', canAccessWizard: false };
  }

  return { mode: 'PARTNER_CHECK_ERROR', canAccessWizard: false };
}

const PARTNER_DECLARATION_TEXT =
  'I confirm that this account is the sole Great Homes Listing Partner login for my agency, all agency details provided are genuine and verifiable, and I will obtain explicit owner consent before submitting any property.';

function SubtleResidentialIllustration() {
  return (
    <div
      className="pointer-events-none select-none hidden md:flex items-end justify-end shrink-0"
      aria-hidden="true"
    >
      <svg
        width="210"
        height="112"
        viewBox="0 0 210 112"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Warm ambient clouds */}
        <path
          d="M22 36C22 30.477 26.477 26 32 26H52C56.418 26 60 29.582 60 34C60 38.418 56.418 42 52 42H28C24.686 42 22 39.314 22 36Z"
          fill="#F9ECE6"
        />
        <path
          d="M152 24C152 19.582 155.582 16 160 16H176C179.314 16 182 18.686 182 22C182 25.314 179.314 28 176 28H156C153.791 28 152 26.209 152 24Z"
          fill="#F9ECE6"
        />
        {/* Left mid-rise tower */}
        <rect x="44" y="42" width="46" height="62" rx="2" fill="#FFFBF9" stroke="#D5C8BE" strokeWidth="1.25" />
        <rect x="52" y="51" width="9" height="9" rx="1" fill="#FDE7DF" stroke="#E5B9A8" strokeWidth="1" />
        <rect x="73" y="51" width="9" height="9" rx="1" fill="#FDE7DF" stroke="#E5B9A8" strokeWidth="1" />
        <rect x="52" y="67" width="9" height="9" rx="1" fill="#FDE7DF" stroke="#E5B9A8" strokeWidth="1" />
        <rect x="73" y="67" width="9" height="9" rx="1" fill="#FDE7DF" stroke="#E5B9A8" strokeWidth="1" />
        <rect x="52" y="83" width="9" height="9" rx="1" fill="#FDE7DF" stroke="#E5B9A8" strokeWidth="1" />
        <rect x="73" y="83" width="9" height="9" rx="1" fill="#FDE7DF" stroke="#E5B9A8" strokeWidth="1" />
        {/* Main modern residential building */}
        <rect x="90" y="18" width="58" height="86" rx="2" fill="#FFFFFF" stroke="#C5B5A9" strokeWidth="1.35" />
        <rect x="98" y="12" width="42" height="6" rx="1" fill="#FFF3EE" stroke="#C5B5A9" strokeWidth="1.2" />
        {/* Grid windows */}
        <rect x="99" y="29" width="10" height="10" rx="1" fill="#FAFAF8" stroke="#D5C8BE" strokeWidth="1" />
        <rect x="114" y="29" width="10" height="10" rx="1" fill="#FAFAF8" stroke="#D5C8BE" strokeWidth="1" />
        <rect x="129" y="29" width="10" height="10" rx="1" fill="#FAFAF8" stroke="#D5C8BE" strokeWidth="1" />
        <rect x="99" y="46" width="10" height="10" rx="1" fill="#FFF3EE" stroke="#E85D3F" strokeOpacity="0.4" strokeWidth="1" />
        <rect x="114" y="46" width="10" height="10" rx="1" fill="#FAFAF8" stroke="#D5C8BE" strokeWidth="1" />
        <rect x="129" y="46" width="10" height="10" rx="1" fill="#FFF3EE" stroke="#E85D3F" strokeOpacity="0.4" strokeWidth="1" />
        <rect x="99" y="63" width="10" height="10" rx="1" fill="#FAFAF8" stroke="#D5C8BE" strokeWidth="1" />
        <rect x="114" y="63" width="10" height="10" rx="1" fill="#FAFAF8" stroke="#D5C8BE" strokeWidth="1" />
        <rect x="129" y="63" width="10" height="10" rx="1" fill="#FAFAF8" stroke="#D5C8BE" strokeWidth="1" />
        <rect x="112" y="83" width="14" height="21" rx="1" fill="#FDE7DF" stroke="#E85D3F" strokeOpacity="0.5" strokeWidth="1.1" />
        {/* Right townhouse / wing */}
        <rect x="148" y="54" width="38" height="50" rx="2" fill="#FFFBF9" stroke="#D5C8BE" strokeWidth="1.25" />
        <rect x="155" y="63" width="8" height="8" rx="1" fill="#FAFAF8" stroke="#D5C8BE" strokeWidth="1" />
        <rect x="170" y="63" width="8" height="8" rx="1" fill="#FAFAF8" stroke="#D5C8BE" strokeWidth="1" />
        <rect x="155" y="78" width="8" height="8" rx="1" fill="#FAFAF8" stroke="#D5C8BE" strokeWidth="1" />
        <rect x="170" y="78" width="8" height="8" rx="1" fill="#FAFAF8" stroke="#D5C8BE" strokeWidth="1" />
        {/* Accent trees + ground */}
        <circle cx="31" cy="84" r="11" fill="#E9F3EC" stroke="#8FB89B" strokeWidth="1.15" />
        <line x1="31" y1="88" x2="31" y2="104" stroke="#8FB89B" strokeWidth="1.25" />
        <circle cx="192" cy="88" r="9" fill="#E9F3EC" stroke="#8FB89B" strokeWidth="1.15" />
        <line x1="192" y1="91" x2="192" y2="104" stroke="#8FB89B" strokeWidth="1.25" />
        <line x1="12" y1="104" x2="204" y2="104" stroke="#C5B5A9" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    </div>
  );
}

interface AccountEligibilityPanelProps {
  customer: CustomerDto | null;
  authLoading: boolean;
  openAuthModal: (mode?: 'login' | 'register') => void;
  refreshCustomer: () => Promise<void>;
  partnerStatus: PartnerEligibilityState;
  onRetryPartnerStatus: () => Promise<unknown> | void;
  hasStartedWizard: boolean;
  isDraftResume: boolean;
  isReadOnlySubmission?: boolean;
  onContinue: () => void;
}

export function AccountEligibilityPanel({
  customer,
  authLoading,
  openAuthModal,
  refreshCustomer,
  partnerStatus,
  onRetryPartnerStatus,
  hasStartedWizard,
  isDraftResume,
  isReadOnlySubmission = false,
  onContinue,
}: AccountEligibilityPanelProps) {
  const { openEnquiry } = useEnquiry();

  const { mode } = evaluateBeforeYouStartState({
    authLoading,
    customer,
    partnerStatus,
  });

  // Account completion (accountType === null) / REJECTED Partner resubmission form state
  const [completionType, setCompletionType] = useState<'OWNER' | 'LISTING_PARTNER'>('OWNER');
  const [agencyName, setAgencyName] = useState('');
  const [businessAddress, setBusinessAddress] = useState('');
  const [locality, setLocality] = useState('');
  const [city, setCity] = useState('Kolkata');
  const [agencyContactPhone, setAgencyContactPhone] = useState('');
  const [declarationAccepted, setDeclarationAccepted] = useState(false);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (customer?.phone && !agencyContactPhone) {
      setAgencyContactPhone(customer.phone);
    }
  }, [customer?.phone, agencyContactPhone]);

  useEffect(() => {
    const p = partnerStatus.profile;
    if (!p) return;
    if (p.agencyName && !agencyName) setAgencyName(p.agencyName);
    if (p.businessAddress && !businessAddress) setBusinessAddress(p.businessAddress);
    if (p.locality && !locality) setLocality(p.locality);
    if (p.city) setCity(p.city);
    if (p.agencyContactPhone && !agencyContactPhone) setAgencyContactPhone(p.agencyContactPhone);
  }, [partnerStatus.profile, agencyName, businessAddress, locality, agencyContactPhone]);

  const handleCompleteAccountType = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);
    setFormSubmitting(true);
    try {
      const result = await safeFetchJson<any>('/api/customer/account-type', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountType: completionType,
          ...(completionType === 'LISTING_PARTNER'
            ? {
                agencyName: agencyName.trim(),
                businessAddress: businessAddress.trim(),
                locality: locality.trim(),
                city: city.trim() || 'Kolkata',
                agencyContactPhone: agencyContactPhone.trim() || customer?.phone,
                declarationAccepted,
              }
            : {}),
        }),
      });
      if (!result.ok || !result.data?.success) {
        setFormError(result.error || 'Could not finalize account type.');
        return;
      }
      await refreshCustomer();
      if (completionType === 'OWNER') {
        setFormSuccess('Your Property Owner account is configured and ready.');
        onContinue();
      } else {
        setFormSuccess(
          'Your Listing Partner agency profile has been submitted for Great Homes review.'
        );
        await onRetryPartnerStatus();
      }
    } catch {
      setFormError('Network error while saving your account type. Please try again.');
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleResubmitPartner = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);
    setFormSubmitting(true);
    try {
      const result = await safeFetchJson<any>('/api/customer/account-type', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agencyName: agencyName.trim(),
          businessAddress: businessAddress.trim(),
          locality: locality.trim(),
          city: city.trim() || 'Kolkata',
          agencyContactPhone: agencyContactPhone.trim() || customer?.phone,
          declarationAccepted,
        }),
      });
      if (!result.ok || !result.data?.success) {
        setFormError(result.error || 'Could not resubmit partner agency application.');
        return;
      }
      await refreshCustomer();
      setFormSuccess('Partner application resubmitted and is now under review.');
      await onRetryPartnerStatus();
    } catch {
      setFormError('Network error while resubmitting partner application. Please try again.');
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleOpenAssistance = () => {
    openEnquiry({
      contextType: 'GENERAL',
      title: 'Listing Partner Account Assistance',
      subtitle:
        'Connect with Great Homes Partner Support regarding account status, review questions, or reactivation.',
      sourcePage: '/post-property/new',
    });
  };

  // 1. Auth Loading Skeleton
  if (mode === 'AUTH_LOADING') {
    return (
      <section
        aria-label="Checking account eligibility"
        className="rounded-2xl border border-[#E5E0D8] bg-white p-6 shadow-2xs"
      >
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-[#F4F1EA] animate-pulse shrink-0" />
          <div className="space-y-2 flex-1">
            <div className="h-3.5 w-32 rounded bg-[#F4F1EA] animate-pulse" />
            <div className="h-5 w-64 max-w-full rounded bg-[#F4F1EA] animate-pulse" />
          </div>
        </div>
        <div className="mt-4 h-4 w-80 max-w-full rounded bg-[#F4F1EA] animate-pulse" />
      </section>
    );
  }

  // 2. Unauthenticated Gate
  if (mode === 'UNAUTHENTICATED') {
    return (
      <section
        aria-labelledby="before-you-start-heading"
        className="rounded-2xl border border-[#F0D9D1] bg-[#FFF8F5] p-6 sm:p-8 shadow-2xs"
      >
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="max-w-xl">
            <div className="flex items-center gap-3">
              <div className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#FDE7DF] text-[#E85D3F]">
                <Lock className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <p className="font-display text-xs font-bold uppercase tracking-wider text-[#E85D3F]">
                  Before You Start
                </p>
                <h2
                  id="before-you-start-heading"
                  className="font-display text-xl sm:text-2xl font-bold text-[#111111]"
                >
                  Sign in with your mobile number to continue
                </h2>
              </div>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-[#555555] font-body">
              Let&apos;s make sure you&apos;re using the right account to submit your property. Your
              selected property details stay preserved and will open immediately after OTP verification.
            </p>
            <div className="mt-6 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <button
                type="button"
                onClick={() => openAuthModal('login')}
                className="min-h-[46px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#E85D3F] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#D44E32] font-display cursor-pointer whitespace-nowrap"
              >
                <span>Sign In with Mobile OTP</span>
                <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
              </button>
              <Link
                href="/post-property"
                className="min-h-[46px] inline-flex items-center justify-center rounded-xl border border-[#D9D5D0] bg-white px-5 py-3 text-sm font-semibold text-[#111111] transition hover:bg-[#F5F3F0] font-display whitespace-nowrap"
              >
                Back to Post Property Hub
              </Link>
            </div>
          </div>
          <SubtleResidentialIllustration />
        </div>
      </section>
    );
  }

  // 3. Partner Verification Check Loading
  if (mode === 'PARTNER_CHECKING') {
    return (
      <section
        aria-label="Verifying Listing Partner eligibility"
        className="rounded-2xl border border-[#E5E0D8] bg-white p-6 sm:p-7 shadow-2xs"
      >
        <div className="flex items-center gap-3">
          <div className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#FFF3EE] text-[#E85D3F]">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          </div>
          <div>
            <p className="font-display text-xs font-bold uppercase tracking-wider text-[#E85D3F]">
              Before You Start
            </p>
            <h2 className="font-display text-lg sm:text-xl font-bold text-[#111111]">
              Checking your agency account eligibility...
            </h2>
            <p className="mt-1 text-xs sm:text-sm text-[#6E6A65] font-body">
              Let&apos;s make sure you&apos;re using the right account to submit your property.
            </p>
          </div>
        </div>
      </section>
    );
  }

  // 4. Compact Confirmed Strip when Eligible User Already Clicked Continue (or Read-Only Summary / Resuming Eligible Draft)
  if (
    hasStartedWizard &&
    (mode === 'OWNER_ELIGIBLE' || mode === 'PARTNER_ACTIVE_ELIGIBLE')
  ) {
    const isPartner = mode === 'PARTNER_ACTIVE_ELIGIBLE';
    const agencyLabel = partnerStatus.profile?.agencyName?.trim();

    return (
      <section
        aria-label="Verified account summary"
        className="rounded-2xl border border-[#F0D9D1] bg-[#FFF8F5] px-4 py-3.5 sm:px-6 sm:py-4 shadow-2xs"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <div className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#FDE7DF] text-[#E85D3F]">
                {isPartner ? (
                  <ShieldCheck className="h-5 w-5" aria-hidden="true" />
                ) : (
                  <UserCheck className="h-5 w-5" aria-hidden="true" />
                )}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
                  <span className="font-display text-[11px] font-bold uppercase tracking-wider text-[#E85D3F]">
                    Before You Start
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#218C5A] font-display">
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>{isPartner ? 'Agency approved' : 'Account verified'}</span>
                  </span>
                </div>
                <p className="mt-0.5 font-display text-sm sm:text-base font-bold text-[#111111] truncate">
                  {isPartner
                    ? `Approved Listing Partner${agencyLabel ? ` · ${agencyLabel}` : ''}`
                    : `You're ready to list your property`}
                </p>
              </div>
            </div>
            <p className="mt-2 text-xs text-[#555555] font-body">
              {isPartner
                ? 'You can submit properties on behalf of owners. Owner-authority confirmation is recorded in Step 4.'
                : 'Your Property Owner account is verified. You can submit your own residential property in Kolkata.'}
            </p>
          </div>
          {isDraftResume && (
            <span className="text-xs font-medium text-[#6E6A65] font-body shrink-0">
              {isReadOnlySubmission ? 'Read-only inspection' : 'Resumed saved draft'}
            </span>
          )}
        </div>
      </section>
    );
  }

  // 5. OWNER Ready & Eligible (Pre-Continue Banner)
  if (mode === 'OWNER_ELIGIBLE') {
    return (
      <section
        aria-labelledby="before-you-start-heading"
        className="rounded-2xl border border-[#F0D9D1] bg-[#FFF8F5] p-5 sm:p-7 shadow-2xs"
      >
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3.5">
              <div className="inline-flex h-11 w-11 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-xl bg-[#FDE7DF] text-[#E85D3F]">
                <UserCheck className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="font-display text-xs font-bold uppercase tracking-wider text-[#E85D3F]">
                  Before You Start
                </p>
                <h2
                  id="before-you-start-heading"
                  className="mt-0.5 font-display text-lg sm:text-2xl font-bold text-[#111111] leading-snug"
                >
                  You&apos;re ready to list your property.
                </h2>
              </div>
            </div>

            <p className="mt-3 text-sm leading-relaxed text-[#4A4743] font-body max-w-xl">
              Your Property Owner account is verified. You can submit your own residential property
              in Kolkata.
            </p>

            <div className="mt-3.5 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs sm:text-sm font-medium text-[#218C5A] font-display">
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>Account verified</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>Ready to submit</span>
              </span>
            </div>

            <div className="mt-4">
              <button
                type="button"
                onClick={onContinue}
                className="w-full sm:w-auto min-h-[46px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#E85D3F] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#D44E32] font-display cursor-pointer whitespace-nowrap"
              >
                <span>Continue to Location &amp; Project</span>
                <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
              </button>
            </div>
          </div>

          <SubtleResidentialIllustration />
        </div>
      </section>
    );
  }

  // 6. ACTIVE LISTING_PARTNER Ready & Eligible (Pre-Continue Banner)
  if (mode === 'PARTNER_ACTIVE_ELIGIBLE') {
    const agencyNameVal = partnerStatus.profile?.agencyName?.trim();
    return (
      <section
        aria-labelledby="before-you-start-heading"
        className="rounded-2xl border border-[#F0D9D1] bg-[#FFF8F5] p-5 sm:p-7 shadow-2xs"
      >
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3.5">
              <div className="inline-flex h-11 w-11 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-xl bg-[#FDE7DF] text-[#E85D3F]">
                <ShieldCheck className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="font-display text-xs font-bold uppercase tracking-wider text-[#E85D3F]">
                  Before You Start
                </p>
                <h2
                  id="before-you-start-heading"
                  className="mt-0.5 font-display text-lg sm:text-2xl font-bold text-[#111111] leading-snug"
                >
                  Your agency account is approved
                </h2>
              </div>
            </div>

            <p className="mt-3 text-sm leading-relaxed text-[#4A4743] font-body max-w-xl">
              {agencyNameVal ? (
                <>
                  <span className="font-semibold text-[#111111]">{agencyNameVal}</span> is an
                  approved Great Homes Listing Partner. You can submit properties on behalf of
                  owners and confirm the owner-authority declaration in Step 4.
                </>
              ) : (
                'Your Listing Partner agency profile is approved to submit properties on behalf of property owners. You will confirm the owner-authority declaration in Step 4.'
              )}
            </p>

            <div className="mt-3.5 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs sm:text-sm font-medium text-[#218C5A] font-display">
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>Agency approved</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>Owner-authority declaration required in Step 4</span>
              </span>
            </div>

            <div className="mt-4">
              <button
                type="button"
                onClick={onContinue}
                className="w-full sm:w-auto min-h-[46px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#E85D3F] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#D44E32] font-display cursor-pointer whitespace-nowrap"
              >
                <span>Continue to Location &amp; Project</span>
                <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
              </button>
            </div>
          </div>

          <SubtleResidentialIllustration />
        </div>
      </section>
    );
  }

  // 7. Account Type Incomplete (customer.accountType === null)
  if (mode === 'ACCOUNT_TYPE_INCOMPLETE') {
    return (
      <section
        aria-labelledby="before-you-start-heading"
        className="rounded-2xl border border-[#E5E0D8] bg-white p-6 sm:p-8 shadow-2xs"
      >
        <div className="max-w-3xl">
          <p className="font-display text-xs font-bold uppercase tracking-wider text-[#E85D3F]">
            Before You Start
          </p>
          <h2
            id="before-you-start-heading"
            className="mt-1 font-display text-xl sm:text-2xl font-bold text-[#111111]"
          >
            Let&apos;s set up your account before you begin
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-[#555555] font-body">
            Let&apos;s make sure you&apos;re using the right account to submit your property. Great
            Homes keeps Property Owner and Listing Partner accounts separate (one login per agency).
          </p>

          {formError && (
            <div
              role="alert"
              className="mt-4 rounded-xl border border-[#E85D3F]/40 bg-[#FFF5F2] px-4 py-3 text-sm text-[#9C3526] font-body"
            >
              {formError}
            </div>
          )}
          {formSuccess && (
            <div
              role="status"
              className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 font-body"
            >
              {formSuccess}
            </div>
          )}

          <form onSubmit={handleCompleteAccountType} className="mt-5 space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <button
                type="button"
                onClick={() => {
                  setCompletionType('OWNER');
                  setFormError(null);
                }}
                className={`rounded-xl border p-4 text-left transition cursor-pointer ${
                  completionType === 'OWNER'
                    ? 'border-[#E85D3F] bg-[#FFF8F5] ring-2 ring-[#E85D3F]/15'
                    : 'border-[#D9D5D0] bg-white hover:border-[#ABA59E]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[#FFF3EE] text-[#E85D3F]">
                    <Home className="h-4 w-4" aria-hidden="true" />
                  </div>
                  {completionType === 'OWNER' && (
                    <CheckCircle2 className="h-4 w-4 text-[#E85D3F]" aria-hidden="true" />
                  )}
                </div>
                <div className="mt-3 font-display text-sm font-bold text-[#111111]">
                  Property Owner Account
                </div>
                <div className="mt-1 text-xs text-[#555555] font-body leading-relaxed">
                  For homeowners submitting their own residential home or plot in Kolkata.
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setCompletionType('LISTING_PARTNER');
                  setFormError(null);
                }}
                className={`rounded-xl border p-4 text-left transition cursor-pointer ${
                  completionType === 'LISTING_PARTNER'
                    ? 'border-[#E85D3F] bg-[#FFF8F5] ring-2 ring-[#E85D3F]/15'
                    : 'border-[#D9D5D0] bg-white hover:border-[#ABA59E]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[#FFF3EE] text-[#E85D3F]">
                    <Building2 className="h-4 w-4" aria-hidden="true" />
                  </div>
                  {completionType === 'LISTING_PARTNER' && (
                    <CheckCircle2 className="h-4 w-4 text-[#E85D3F]" aria-hidden="true" />
                  )}
                </div>
                <div className="mt-3 font-display text-sm font-bold text-[#111111]">
                  Listing Partner Agency Account
                </div>
                <div className="mt-1 text-xs text-[#555555] font-body leading-relaxed">
                  One login per agency for submitting owner-consented listings (team approval required).
                </div>
              </button>
            </div>

            {completionType === 'LISTING_PARTNER' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-xl border border-[#E5E0D8] bg-[#FAFAF8] p-5">
                <div className="sm:col-span-2">
                  <label
                    htmlFor="before-start-agency-name"
                    className="block font-display text-xs font-bold uppercase tracking-wider text-[#555555] mb-1.5"
                  >
                    Agency Name *
                  </label>
                  <input
                    id="before-start-agency-name"
                    type="text"
                    required
                    minLength={2}
                    maxLength={160}
                    value={agencyName}
                    onChange={(e) => setAgencyName(e.target.value)}
                    placeholder="Agency legal or trading name"
                    className="w-full rounded-xl border border-[#D9D5D0] bg-white px-4 py-2.5 text-base sm:text-sm text-[#111111] outline-none focus:border-[#E85D3F]"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label
                    htmlFor="before-start-agency-address"
                    className="block font-display text-xs font-bold uppercase tracking-wider text-[#555555] mb-1.5"
                  >
                    Business Address *
                  </label>
                  <input
                    id="before-start-agency-address"
                    type="text"
                    required
                    minLength={5}
                    maxLength={500}
                    value={businessAddress}
                    onChange={(e) => setBusinessAddress(e.target.value)}
                    placeholder="Full office address"
                    className="w-full rounded-xl border border-[#D9D5D0] bg-white px-4 py-2.5 text-base sm:text-sm text-[#111111] outline-none focus:border-[#E85D3F]"
                  />
                </div>
                <div>
                  <label
                    htmlFor="before-start-agency-locality"
                    className="block font-display text-xs font-bold uppercase tracking-wider text-[#555555] mb-1.5"
                  >
                    Locality *
                  </label>
                  <input
                    id="before-start-agency-locality"
                    type="text"
                    required
                    minLength={2}
                    maxLength={120}
                    value={locality}
                    onChange={(e) => setLocality(e.target.value)}
                    placeholder="e.g. Ballygunge"
                    className="w-full rounded-xl border border-[#D9D5D0] bg-white px-4 py-2.5 text-base sm:text-sm text-[#111111] outline-none focus:border-[#E85D3F]"
                  />
                </div>
                <div>
                  <label
                    htmlFor="before-start-agency-city"
                    className="block font-display text-xs font-bold uppercase tracking-wider text-[#555555] mb-1.5"
                  >
                    City *
                  </label>
                  <input
                    id="before-start-agency-city"
                    type="text"
                    required
                    minLength={2}
                    maxLength={100}
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Kolkata"
                    className="w-full rounded-xl border border-[#D9D5D0] bg-white px-4 py-2.5 text-base sm:text-sm text-[#111111] outline-none focus:border-[#E85D3F]"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label
                    htmlFor="before-start-agency-phone"
                    className="block font-display text-xs font-bold uppercase tracking-wider text-[#555555] mb-1.5"
                  >
                    Agency Contact Mobile *
                  </label>
                  <input
                    id="before-start-agency-phone"
                    type="tel"
                    required
                    value={agencyContactPhone}
                    onChange={(e) => setAgencyContactPhone(e.target.value)}
                    placeholder="10-digit Indian mobile"
                    className="w-full rounded-xl border border-[#D9D5D0] bg-white px-4 py-2.5 text-base sm:text-sm text-[#111111] outline-none focus:border-[#E85D3F]"
                  />
                </div>
                <label className="sm:col-span-2 flex items-start gap-3 pt-1 text-xs sm:text-sm text-[#4A4743] font-body cursor-pointer">
                  <input
                    type="checkbox"
                    required
                    checked={declarationAccepted}
                    onChange={(e) => setDeclarationAccepted(e.target.checked)}
                    className="mt-1 h-4 w-4 shrink-0 rounded border-[#D9D5D0] accent-[#E85D3F]"
                  />
                  <span>{PARTNER_DECLARATION_TEXT}</span>
                </label>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={formSubmitting}
                className="w-full sm:w-auto min-h-[46px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#E85D3F] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#D44E32] disabled:opacity-60 font-display cursor-pointer whitespace-nowrap"
              >
                {formSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    <span>Saving Account Setup...</span>
                  </>
                ) : (
                  <>
                    <span>
                      {completionType === 'LISTING_PARTNER'
                        ? 'Submit Listing Partner Registration'
                        : 'Confirm Property Owner Account & Continue'}
                    </span>
                    <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </section>
    );
  }

  // 8. PENDING LISTING_PARTNER (Blocked)
  if (mode === 'PARTNER_PENDING') {
    const agencyNameVal = partnerStatus.profile?.agencyName?.trim();
    return (
      <section
        aria-labelledby="before-you-start-heading"
        role="region"
        className="rounded-2xl border border-[#E5D3B3] bg-[#FFFDF7] p-5 sm:p-8 shadow-2xs"
      >
        <div className="max-w-2xl">
          <div className="flex items-center gap-3.5">
            <div className="inline-flex h-11 w-11 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-xl bg-[#FDF2DF] text-[#B45309]">
              <Clock3 className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="font-display text-xs font-bold uppercase tracking-wider text-[#B45309]">
                Before You Start · Under Review
              </p>
              <h2
                id="before-you-start-heading"
                className="mt-0.5 font-display text-lg sm:text-2xl font-bold text-[#111111] leading-snug"
              >
                Your agency registration is under review
              </h2>
            </div>
          </div>

          <p className="mt-3 text-sm leading-relaxed text-[#4A4743] font-body">
            {agencyNameVal
              ? `Your registration for ${agencyNameVal} has been received and is currently being reviewed by our team.`
              : 'Your Listing Partner agency registration is currently being reviewed by our team.'}{' '}
            Property submissions from agency accounts open once approval is completed.
          </p>

          {formSuccess && (
            <div
              role="status"
              className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs sm:text-sm text-emerald-800 font-body"
            >
              {formSuccess}
            </div>
          )}

          <div className="mt-5 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <Link
              href="/my-properties"
              className="min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#111111] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#2A2A2A] font-display whitespace-nowrap"
            >
              <span>View My Property Submissions</span>
              <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
            </Link>
            <Link
              href="/post-property"
              className="min-h-[44px] inline-flex items-center justify-center rounded-xl border border-[#D9D5D0] bg-white px-5 py-2.5 text-sm font-semibold text-[#111111] transition hover:bg-[#F5F3F0] font-display whitespace-nowrap"
            >
              Return to Post Property Hub
            </Link>
          </div>
        </div>
      </section>
    );
  }

  // 9. REJECTED LISTING_PARTNER (Blocked + Resubmission Form)
  if (mode === 'PARTNER_REJECTED') {
    const rejectionFeedback =
      partnerStatus.profile?.rejectionReason ||
      partnerStatus.message ||
      'Your agency application was declined. Please update your agency details below to resubmit for review.';

    return (
      <section
        aria-labelledby="before-you-start-heading"
        role="region"
        className="rounded-2xl border border-[#E85D3F]/35 bg-[#FFF8F6] p-5 sm:p-8 shadow-2xs"
      >
        <div className="max-w-3xl">
          <div className="flex items-center gap-3.5">
            <div className="inline-flex h-11 w-11 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-xl bg-[#FDE7DF] text-[#C84B31]">
              <XCircle className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="font-display text-xs font-bold uppercase tracking-wider text-[#C84B31]">
                Before You Start · Resubmission Needed
              </p>
              <h2
                id="before-you-start-heading"
                className="mt-0.5 font-display text-lg sm:text-2xl font-bold text-[#111111] leading-snug"
              >
                Your agency application needs some attention
              </h2>
            </div>
          </div>

          <p className="mt-3 text-sm leading-relaxed text-[#4A4743] font-body">
            You cannot submit listings until your agency profile is updated and approved.
          </p>

          <div className="mt-4 rounded-xl border border-[#E85D3F]/30 bg-white p-4">
            <p className="font-display text-xs font-bold uppercase tracking-wider text-[#C84B31]">
              Review Feedback
            </p>
            <p className="mt-1 text-sm text-[#111111] font-body leading-relaxed">
              {rejectionFeedback}
            </p>
          </div>

          {formError && (
            <div
              role="alert"
              className="mt-5 rounded-xl border border-[#E85D3F]/40 bg-white px-4 py-3 text-sm text-[#9C3526] font-body"
            >
              {formError}
            </div>
          )}

          <form
            onSubmit={handleResubmitPartner}
            className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-xl border border-[#E5E0D8] bg-white p-5 sm:p-6"
          >
            <div className="sm:col-span-2">
              <h3 className="font-display text-base font-bold text-[#111111]">
                Update &amp; Resubmit Partner Application
              </h3>
              <p className="mt-0.5 text-xs text-[#6E6A65] font-body">
                Once resubmitted, our team will review your updated agency details again.
              </p>
            </div>

            <div>
              <label
                htmlFor="resubmit-agency-name"
                className="block font-display text-xs font-bold uppercase tracking-wider text-[#555555] mb-1.5"
              >
                Agency Name *
              </label>
              <input
                id="resubmit-agency-name"
                type="text"
                required
                minLength={2}
                maxLength={160}
                value={agencyName}
                onChange={(e) => setAgencyName(e.target.value)}
                placeholder="Agency Name"
                className="w-full rounded-xl border border-[#D9D5D0] bg-white px-3.5 py-2.5 text-base sm:text-sm text-[#111111] outline-none focus:border-[#E85D3F]"
              />
            </div>

            <div>
              <label
                htmlFor="resubmit-agency-phone"
                className="block font-display text-xs font-bold uppercase tracking-wider text-[#555555] mb-1.5"
              >
                Agency Contact Mobile *
              </label>
              <input
                id="resubmit-agency-phone"
                type="tel"
                required
                value={agencyContactPhone}
                onChange={(e) => setAgencyContactPhone(e.target.value)}
                placeholder="10-digit Indian mobile"
                className="w-full rounded-xl border border-[#D9D5D0] bg-white px-3.5 py-2.5 text-base sm:text-sm text-[#111111] outline-none focus:border-[#E85D3F]"
              />
            </div>

            <div className="sm:col-span-2">
              <label
                htmlFor="resubmit-agency-address"
                className="block font-display text-xs font-bold uppercase tracking-wider text-[#555555] mb-1.5"
              >
                Business Address *
              </label>
              <input
                id="resubmit-agency-address"
                type="text"
                required
                minLength={5}
                maxLength={500}
                value={businessAddress}
                onChange={(e) => setBusinessAddress(e.target.value)}
                placeholder="Full office address"
                className="w-full rounded-xl border border-[#D9D5D0] bg-white px-3.5 py-2.5 text-base sm:text-sm text-[#111111] outline-none focus:border-[#E85D3F]"
              />
            </div>

            <div>
              <label
                htmlFor="resubmit-agency-locality"
                className="block font-display text-xs font-bold uppercase tracking-wider text-[#555555] mb-1.5"
              >
                Locality *
              </label>
              <input
                id="resubmit-agency-locality"
                type="text"
                required
                minLength={2}
                maxLength={120}
                value={locality}
                onChange={(e) => setLocality(e.target.value)}
                placeholder="e.g. Ballygunge"
                className="w-full rounded-xl border border-[#D9D5D0] bg-white px-3.5 py-2.5 text-base sm:text-sm text-[#111111] outline-none focus:border-[#E85D3F]"
              />
            </div>

            <div>
              <label
                htmlFor="resubmit-agency-city"
                className="block font-display text-xs font-bold uppercase tracking-wider text-[#555555] mb-1.5"
              >
                City *
              </label>
              <input
                id="resubmit-agency-city"
                type="text"
                required
                minLength={2}
                maxLength={100}
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Kolkata"
                className="w-full rounded-xl border border-[#D9D5D0] bg-white px-3.5 py-2.5 text-base sm:text-sm text-[#111111] outline-none focus:border-[#E85D3F]"
              />
            </div>

            <label className="sm:col-span-2 flex items-start gap-3 pt-1 text-xs sm:text-sm text-[#4A4743] font-body cursor-pointer">
              <input
                type="checkbox"
                required
                checked={declarationAccepted}
                onChange={(e) => setDeclarationAccepted(e.target.checked)}
                className="mt-1 h-4 w-4 shrink-0 rounded border-[#D9D5D0] accent-[#E85D3F]"
              />
              <span>{PARTNER_DECLARATION_TEXT}</span>
            </label>

            <div className="sm:col-span-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-1">
              <button
                type="submit"
                disabled={formSubmitting}
                className="min-h-[46px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#E85D3F] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#D44E32] disabled:opacity-60 font-display cursor-pointer whitespace-nowrap"
              >
                {formSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    <span>Resubmitting Application...</span>
                  </>
                ) : (
                  <>
                    <span>Resubmit Partner Application</span>
                    <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
                  </>
                )}
              </button>
              <Link
                href="/post-property"
                className="min-h-[46px] inline-flex items-center justify-center rounded-xl border border-[#D9D5D0] bg-white px-5 py-3 text-sm font-semibold text-[#111111] hover:bg-[#F5F3F0] font-display whitespace-nowrap"
              >
                Back to Post Property Hub
              </Link>
            </div>
          </form>
        </div>
      </section>
    );
  }

  // 10. SUSPENDED / REVOKED LISTING_PARTNER (Blocked + Respectful Restriction + Assistance Route)
  if (mode === 'PARTNER_SUSPENDED' || mode === 'PARTNER_REVOKED') {
    const isRevoked = mode === 'PARTNER_REVOKED';
    const serverReason = isRevoked
      ? partnerStatus.profile?.revocationReason || partnerStatus.message
      : partnerStatus.profile?.suspensionReason || partnerStatus.message;

    return (
      <section
        aria-labelledby="before-you-start-heading"
        role="region"
        className="rounded-2xl border border-[#C84B31]/35 bg-[#FFF8F6] p-5 sm:p-8 shadow-2xs"
      >
        <div className="max-w-2xl">
          <div className="flex items-center gap-3.5">
            <div className="inline-flex h-11 w-11 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-xl bg-[#FDE7DF] text-[#C84B31]">
              <ShieldAlert className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="font-display text-xs font-bold uppercase tracking-wider text-[#C84B31]">
                Before You Start · Account Restricted
              </p>
              <h2
                id="before-you-start-heading"
                className="mt-0.5 font-display text-lg sm:text-2xl font-bold text-[#111111] leading-snug"
              >
                {isRevoked
                  ? 'Your Listing Partner authorization has been revoked'
                  : 'Your Listing Partner account is currently suspended'}
              </h2>
            </div>
          </div>

          <p className="mt-3 text-sm leading-relaxed text-[#4A4743] font-body">
            {isRevoked
              ? 'This agency login can no longer create or submit property listings on Great Homes. Please reach out to our support team if you need clarification regarding this decision.'
              : 'New submissions and draft edits are paused while this suspension is in place. Please contact our support team for review or assistance.'}
          </p>

          {serverReason && (
            <div className="mt-4 rounded-xl border border-[#E5E0D8] bg-white p-4">
              <p className="font-display text-xs font-bold uppercase tracking-wider text-[#6E6A65]">
                Account Status Details
              </p>
              <p className="mt-1 text-sm text-[#111111] font-body">{serverReason}</p>
            </div>
          )}

          <div className="mt-5 flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3">
            <button
              type="button"
              onClick={handleOpenAssistance}
              className="min-h-[46px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#E85D3F] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#D44E32] font-display cursor-pointer whitespace-nowrap"
            >
              <HelpCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Request Account Assistance</span>
            </button>
            <Link
              href="/account/enquiries"
              className="min-h-[46px] inline-flex items-center justify-center rounded-xl border border-[#D9D5D0] bg-white px-5 py-3 text-sm font-semibold text-[#111111] transition hover:bg-[#F5F3F0] font-display whitespace-nowrap"
            >
              View My Enquiries
            </Link>
            <Link
              href="/post-property"
              className="min-h-[46px] inline-flex items-center justify-center rounded-xl border border-transparent px-4 py-3 text-sm font-semibold text-[#555555] hover:text-[#111111] font-display whitespace-nowrap"
            >
              Back to Post Property
            </Link>
          </div>
        </div>
      </section>
    );
  }

  // 11. Partner Verification Temporary Error / Retry Fallback
  return (
    <section
      aria-labelledby="before-you-start-heading"
      role="alert"
      className="rounded-2xl border border-[#E85D3F]/35 bg-[#FFF8F6] p-5 sm:p-8 shadow-2xs"
    >
      <div className="max-w-2xl">
        <div className="flex items-center gap-3.5">
          <div className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#FDE7DF] text-[#C84B31]">
            <AlertCircle className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="font-display text-xs font-bold uppercase tracking-wider text-[#C84B31]">
              Before You Start
            </p>
            <h2
              id="before-you-start-heading"
              className="mt-0.5 font-display text-lg sm:text-xl font-bold text-[#111111] leading-snug"
            >
              We couldn&apos;t verify your partner account right now
            </h2>
          </div>
        </div>
        <p className="mt-3 text-sm text-[#4A4743] font-body">
          {partnerStatus.message ||
            'Temporary issue connecting to our partner verification service. Please try again.'}
        </p>
        <div className="mt-5 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <button
            type="button"
            onClick={() => void onRetryPartnerStatus()}
            className="min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#E85D3F] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#D44E32] font-display cursor-pointer whitespace-nowrap"
          >
            <span>Retry Verification</span>
          </button>
          <button
            type="button"
            onClick={handleOpenAssistance}
            className="min-h-[44px] inline-flex items-center justify-center rounded-xl border border-[#D9D5D0] bg-white px-5 py-2.5 text-sm font-semibold text-[#111111] hover:bg-[#F5F3F0] font-display cursor-pointer whitespace-nowrap"
          >
            Get Assistance
          </button>
        </div>
      </div>
    </section>
  );
}
