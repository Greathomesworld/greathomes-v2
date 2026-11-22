'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  X,
  CheckCircle2,
  MapPin,
  ArrowRight,
  ArrowLeft,
  Loader2,
  ShieldCheck,
  Calendar,
  Lock,
  Check,
  Sparkles,
} from 'lucide-react';
import type { PublicEnquiryContextDto } from '@/src/domain/enquiry/dto/enquiryDto';
import {
  PREFERRED_BHK_OPTIONS,
  PROPERTY_TYPE_OPTIONS,
  BUDGET_RANGE_OPTIONS,
  BUYING_TIMELINE_OPTIONS,
  PURCHASE_PURPOSE_OPTIONS,
  ADDITIONAL_REQUIREMENT_SUGGESTIONS,
  MAX_ADDITIONAL_REQUIREMENTS_LENGTH,
} from '@/src/domain/enquiry/buyerRequirements';
import { useCustomerAuth } from '../customer/CustomerAuthContext';
import { useVisitorTelemetry } from '../telemetry/VisitorTelemetryProvider';
import { safeFetchJson } from '@/src/lib/safeApiFetch';

interface LeadFirstProjectEnquiryFlowProps {
  contextData: PublicEnquiryContextDto;
  onClose: () => void;
}

function generateAttemptIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `gpa_${crypto.randomUUID()}`;
  }
  const randomPart = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  return `gpa_${Date.now().toString(36)}_${randomPart.slice(0, 20)}`;
}

export function LeadFirstProjectEnquiryFlow({
  contextData,
  onClose,
}: LeadFirstProjectEnquiryFlowProps) {
  const { customer } = useCustomerAuth();
  const { trackEvent } = useVisitorTelemetry();

  // Steps: 1 = Contact Details (Lead Capture), 2 = Optional Buyer Requirements, 3 = Confirmation
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Per-modal-attempt stable idempotency key (reused on Step 1 retries; never stored in localStorage)
  const [idempotencyKey] = useState<string>(() => generateAttemptIdempotencyKey());

  // Step 1 fields
  const [name, setName] = useState<string>(() => customer?.name || '');
  const [phone, setPhone] = useState<string>(() =>
    customer?.phone ? customer.phone.replace(/^\+?91/, '').replace(/\D/g, '').slice(-10) : ''
  );
  const [email, setEmail] = useState<string>(() =>
    customer?.email && !customer.email.endsWith('@mobile.greathomes.local') ? customer.email : ''
  );

  // Step 1 inline field errors
  const [fieldErrors, setFieldErrors] = useState<{
    name?: string;
    phone?: string;
    email?: string;
  }>({});

  // Persisted Step 1 lead state (strictly in React memory, never persisted to browser storage)
  const [createdEnquiryId, setCreatedEnquiryId] = useState<string | null>(null);
  const [referenceNumber, setReferenceNumber] = useState<string>('');
  const [resolvedProjectName, setResolvedProjectName] = useState<string>(
    contextData.projectName || contextData.title || ''
  );
  const [continuationToken, setContinuationToken] = useState<string | null>(null);

  // Step 2 fields — ALL optional, ZERO preselected defaults
  const [preferredBhk, setPreferredBhk] = useState<string>('');
  const [propertyType, setPropertyType] = useState<string>('');
  const [budgetRange, setBudgetRange] = useState<string>('');
  const [purchaseTimeline, setPurchaseTimeline] = useState<string>('');
  const [purchasePurpose, setPurchasePurpose] = useState<string>('');
  const [siteVisitInterest, setSiteVisitInterest] = useState<boolean>(false);
  const [additionalRequirements, setAdditionalRequirements] = useState<string>('');

  // Step 3 confirmation metadata
  const [step2Outcome, setStep2Outcome] = useState<'SUBMITTED' | 'SKIPPED' | null>(null);
  const [requirementsProvidedCount, setRequirementsProvidedCount] = useState<number>(0);

  // Request states
  const [isSubmittingStep1, setIsSubmittingStep1] = useState<boolean>(false);
  const [isSubmittingStep2, setIsSubmittingStep2] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const firstInputRef = useRef<HTMLInputElement>(null);
  const bodyScrollRef = useRef<HTMLDivElement>(null);
  const hasTrackedOpenRef = useRef<boolean>(false);

  // Sync customer prefill if session resolves right after mount and fields are still untouched
  useEffect(() => {
    if (!createdEnquiryId && customer) {
      setName((prev) => prev || customer.name || '');
      if (customer.phone) {
        const clean = customer.phone.replace(/^\+?91/, '').replace(/\D/g, '').slice(-10);
        setPhone((prev) => prev || clean);
      }
      if (customer.email && !customer.email.endsWith('@mobile.greathomes.local')) {
        setEmail((prev) => prev || customer.email || '');
      }
    }
  }, [customer, createdEnquiryId]);

  // Lock body scroll & track modal open once
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    if (!hasTrackedOpenRef.current) {
      hasTrackedOpenRef.current = true;
      trackEvent({
        eventType: 'ENQUIRY_MODAL_OPENED',
        entityType: 'PROJECT',
        entityId: contextData.projectId || undefined,
        entitySlug: contextData.projectSlug || undefined,
        metadata: {
          contextType: 'PROJECT',
          flowMode: 'LEAD_FIRST_PROJECT',
          ctaSource: contextData.ctaSource || 'GET_PRICE_AVAILABILITY',
        },
      }).catch(() => {});
    }

    const focusTimer = setTimeout(() => {
      firstInputRef.current?.focus();
    }, 60);

    return () => {
      clearTimeout(focusTimer);
      document.body.style.overflow = prevOverflow || 'auto';
    };
  }, [contextData.projectId, contextData.projectSlug, contextData.ctaSource, trackEvent]);

  // Escape key dismissal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmittingStep1 && !isSubmittingStep2) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, isSubmittingStep1, isSubmittingStep2]);

  // Scroll modal body to top when step changes
  useEffect(() => {
    bodyScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [step]);

  const validateStep1 = (): { valid: boolean; cleanedPhone: string; trimmedName: string; trimmedEmail: string } => {
    const trimmedName = name.trim();
    const cleanedPhone = phone.replace(/[\s\-().]/g, '');
    const trimmedEmail = email.trim();
    const nextErrors: { name?: string; phone?: string; email?: string } = {};

    if (!trimmedName || trimmedName.length < 2) {
      nextErrors.name = 'Please enter your full name (at least 2 characters).';
    } else if (trimmedName.length > 120) {
      nextErrors.name = 'Full name must be 120 characters or fewer.';
    }

    const phoneMatch = cleanedPhone.match(/^(?:\+91|91|0)?([6-9]\d{9})$/);
    if (!phoneMatch) {
      nextErrors.phone = 'Please enter a valid 10-digit Indian mobile number.';
    }

    if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      nextErrors.email = 'Please enter a valid email address.';
    }

    setFieldErrors(nextErrors);
    return {
      valid: Object.keys(nextErrors).length === 0,
      cleanedPhone,
      trimmedName,
      trimmedEmail,
    };
  };

  const handleStep1Continue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingStep1) return;

    // If Step 1 was already persisted (user clicked Back from Step 2), advance safely without creating a duplicate
    if (createdEnquiryId && continuationToken) {
      setErrorMessage(null);
      setStep(2);
      return;
    }

    const { valid, cleanedPhone, trimmedName, trimmedEmail } = validateStep1();
    if (!valid) {
      setErrorMessage(null);
      return;
    }

    setIsSubmittingStep1(true);
    setErrorMessage(null);

    try {
      const payload = {
        contextType: 'PROJECT' as const,
        projectId: contextData.projectId,
        projectSlug: contextData.projectSlug,
        sourcePage:
          contextData.sourcePage ||
          (typeof window !== 'undefined' ? window.location.pathname : undefined),
        ctaSource: contextData.ctaSource || 'GET_PRICE_AVAILABILITY',
        flowMode: 'LEAD_FIRST_PROJECT' as const,
        name: trimmedName,
        phone: cleanedPhone,
        email: trimmedEmail || undefined,
        preferredContact: 'PHONE' as const,
        requestSiteVisit: false,
        idempotencyKey,
      };

      const result = await safeFetchJson<any>('/api/enquiries', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-idempotency-key': idempotencyKey,
        },
        body: JSON.stringify(payload),
      });

      const data = result.data;

      if (!result.ok || !data?.success || !data?.enquiryId) {
        throw new Error(
          result.error ||
            data?.message ||
            'Unable to submit your contact details right now. Please try again.'
        );
      }

      setCreatedEnquiryId(data.enquiryId);
      setReferenceNumber(data.referenceNumber || `GH-ENQ-${String(data.enquiryId).slice(-6).toUpperCase()}`);
      if (data.projectName) {
        setResolvedProjectName(data.projectName);
      }
      setContinuationToken(data.continuationToken || null);
      setStep(2);

      trackEvent({
        eventType: 'ENQUIRY_STEP_COMPLETED',
        entityType: 'ENQUIRY',
        entityId: data.enquiryId,
        entitySlug: contextData.projectSlug || undefined,
        metadata: {
          step: 1,
          flowMode: 'LEAD_FIRST_PROJECT',
          ctaSource: contextData.ctaSource || 'GET_PRICE_AVAILABILITY',
        },
      }).catch(() => {});
    } catch (err: any) {
      setErrorMessage(
        err?.message || 'Network error while saving your enquiry. Please check your connection and try again.'
      );
    } finally {
      setIsSubmittingStep1(false);
    }
  };

  const toggleChip = (current: string, value: string, setter: (v: string) => void) => {
    setter(current === value ? '' : value);
  };

  const handleToggleSuggestion = (suggestion: string) => {
    const current = additionalRequirements;
    const trimmed = current.trim();
    const escaped = suggestion.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const exactTokenRegex = new RegExp(`(^|,\\s*)${escaped}(?=,|$)`, 'i');

    if (exactTokenRegex.test(trimmed)) {
      const updated = trimmed
        .replace(exactTokenRegex, '')
        .replace(/^,\s*|\s*,\s*$/g, '')
        .replace(/,\s*,/g, ', ');
      setAdditionalRequirements(updated);
      return;
    }

    const nextText = trimmed ? `${trimmed}, ${suggestion}` : `Interested in: ${suggestion}`;
    if (nextText.length <= MAX_ADDITIONAL_REQUIREMENTS_LENGTH) {
      setAdditionalRequirements(nextText);
    }
  };

  const submitRequirementsUpdate = async (skipped: boolean) => {
    if (isSubmittingStep2) return;

    if (!createdEnquiryId || !continuationToken) {
      if (skipped) {
        setStep2Outcome('SKIPPED');
        setStep(3);
        return;
      }
      setErrorMessage(
        'Your enquiry session is no longer active, but your contact details are already saved.'
      );
      return;
    }

    const trimmedNotes = additionalRequirements.trim();
    if (!skipped && trimmedNotes.length > MAX_ADDITIONAL_REQUIREMENTS_LENGTH) {
      setErrorMessage(
        `Additional requirements must be ${MAX_ADDITIONAL_REQUIREMENTS_LENGTH} characters or fewer.`
      );
      return;
    }

    setIsSubmittingStep2(true);
    setErrorMessage(null);

    try {
      const bodyPayload = skipped
        ? { skipped: true }
        : {
            preferredBhk: preferredBhk || null,
            propertyType: propertyType || null,
            budgetRange: budgetRange || null,
            purchaseTimeline: purchaseTimeline || null,
            purchasePurpose: purchasePurpose || null,
            siteVisitInterest,
            additionalRequirements: trimmedNotes || null,
            skipped: false,
          };

      const result = await safeFetchJson<any>(
        `/api/enquiries/${encodeURIComponent(createdEnquiryId)}/requirements`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'x-enquiry-token': continuationToken,
          },
          body: JSON.stringify(bodyPayload),
        }
      );

      const data = result.data;

      if (!result.ok || !data?.success) {
        if (skipped) {
          // Contact lead is already safely captured; allow Skip to finish gracefully
          setStep2Outcome('SKIPPED');
          setStep(3);
          return;
        }
        throw new Error(
          result.error ||
            data?.message ||
            'Could not save your requirements right now. Your contact details are already saved.'
        );
      }

      setRequirementsProvidedCount(typeof data.providedCount === 'number' ? data.providedCount : 0);
      setStep2Outcome(skipped ? 'SKIPPED' : 'SUBMITTED');
      setStep(3);
    } catch (err: any) {
      if (skipped) {
        setStep2Outcome('SKIPPED');
        setStep(3);
      } else {
        setErrorMessage(
          err?.message ||
            'Could not save your requirements right now. Your contact details are already saved — you can retry or click Skip.'
        );
      }
    } finally {
      setIsSubmittingStep2(false);
    }
  };

  const handleStep2Submit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitRequirementsUpdate(false);
  };

  const handleStep2Skip = async () => {
    await submitRequirementsUpdate(true);
  };

  const displayProjectName = resolvedProjectName || contextData.projectName || contextData.title || 'This Property';
  const remainingChars = MAX_ADDITIONAL_REQUIREMENTS_LENGTH - additionalRequirements.length;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="gpa-dialog-heading"
      aria-describedby="gpa-dialog-subtitle"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmittingStep1 && !isSubmittingStep2) {
          onClose();
        }
      }}
    >
      <div
        data-testid="lead-first-enquiry-dialog"
        className="relative w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-2xl border border-[var(--color-border)] shadow-2xl overflow-hidden max-h-[92dvh] sm:max-h-[88vh] flex flex-col animate-in slide-in-from-bottom-6 sm:zoom-in-95 duration-200"
      >
        {/* Sticky Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-3.5 border-b border-[var(--color-border)] bg-[#FAFAF8] shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="px-2.5 py-0.5 rounded text-[11px] font-display font-semibold uppercase tracking-wider border bg-[#E85D3F]/10 text-[#E85D3F] border-[#E85D3F]/20 whitespace-nowrap">
              Price & Availability
            </span>
            {step < 3 && (
              <span className="text-xs font-display font-medium text-[#111111]/55 whitespace-nowrap">
                Step {step} of 2
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isSubmittingStep1 || isSubmittingStep2}
            aria-label="Close enquiry dialog"
            className="w-9 h-9 inline-flex items-center justify-center rounded-lg text-[#111111]/55 hover:text-[#111111] hover:bg-black/5 transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-[#E85D3F] disabled:opacity-40 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div
          ref={bodyScrollRef}
          className="px-5 sm:px-6 py-5 overflow-y-auto overflow-x-hidden overscroll-contain flex-1 space-y-5"
        >
          {/* STEP 1: CONTACT DETAILS (IMMEDIATE LEAD CAPTURE) */}
          {step === 1 && (
            <form
              id="gpa-step1-form"
              onSubmit={handleStep1Continue}
              noValidate
              className="space-y-4 text-left animate-in fade-in duration-150"
            >
              {/* Compact Project Strip */}
              <div className="p-3.5 rounded-xl bg-[#FAFAF8] border border-[var(--color-border)] flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-display font-bold text-[#111111] truncate">
                    {displayProjectName}
                  </p>
                  {contextData.locationName && (
                    <div className="flex items-center gap-1 text-xs text-[#111111]/60 font-body mt-0.5">
                      <MapPin className="w-3.5 h-3.5 text-[#E85D3F] shrink-0" />
                      <span className="truncate">{contextData.locationName}</span>
                    </div>
                  )}
                </div>
                {contextData.priceDisplay && (
                  <div className="text-right shrink-0">
                    <span className="text-[10px] font-display uppercase tracking-wider text-[#111111]/50 block">
                      Starting
                    </span>
                    <span className="text-sm font-display font-bold text-[#111111] whitespace-nowrap">
                      {contextData.priceDisplay}
                    </span>
                  </div>
                )}
              </div>

              {/* Approved Step 1 Heading & Subtitle */}
              <div className="space-y-1">
                <h2
                  id="gpa-dialog-heading"
                  className="text-xl sm:text-2xl font-display font-bold text-[#111111] tracking-tight"
                >
                  Get Price & Availability
                </h2>
                <p
                  id="gpa-dialog-subtitle"
                  className="text-xs sm:text-sm font-body text-[#111111]/65 leading-relaxed"
                >
                  Get the latest price, availability and details for this property.
                </p>
              </div>

              {/* Saved-Contact Banner when returning from Step 2 */}
              {createdEnquiryId && (
                <div className="p-3 rounded-xl bg-[#218C5A]/8 border border-[#218C5A]/25 text-xs font-body text-[#111111] flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#218C5A] shrink-0 mt-0.5" />
                  <div>
                    <span className="font-display font-semibold block">
                      Contact details saved ({referenceNumber})
                    </span>
                    <span className="text-[#111111]/65">
                      Continue to add or update your property requirements.
                    </span>
                  </div>
                </div>
              )}

              {/* API Error Banner */}
              {errorMessage && (
                <div
                  role="alert"
                  className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-body animate-in fade-in duration-150"
                >
                  {errorMessage}
                </div>
              )}

              {/* Full Name */}
              <div className="space-y-1.5">
                <label
                  htmlFor="gpa-full-name"
                  className="text-xs font-display font-semibold text-[#111111] block"
                >
                  Full Name <span className="text-[#E85D3F]">*</span>
                </label>
                <input
                  ref={firstInputRef}
                  id="gpa-full-name"
                  name="name"
                  type="text"
                  autoComplete="name"
                  required
                  disabled={Boolean(createdEnquiryId) || isSubmittingStep1}
                  placeholder="Enter your full name"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (fieldErrors.name) setFieldErrors((prev) => ({ ...prev, name: undefined }));
                  }}
                  aria-invalid={Boolean(fieldErrors.name)}
                  className={`w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-white border text-base sm:text-sm font-body text-[#111111] placeholder:text-[#111111]/35 focus:outline-hidden focus:ring-1 disabled:bg-[#FAFAF8] disabled:text-[#111111]/70 ${
                    fieldErrors.name
                      ? 'border-red-400 focus:border-red-500 focus:ring-red-400'
                      : 'border-[var(--color-border)] focus:border-[#111111] focus:ring-[#111111]'
                  }`}
                />
                {fieldErrors.name && (
                  <p className="text-xs font-body text-red-600">{fieldErrors.name}</p>
                )}
              </div>

              {/* Mobile Number */}
              <div className="space-y-1.5">
                <label
                  htmlFor="gpa-mobile"
                  className="text-xs font-display font-semibold text-[#111111] block"
                >
                  Mobile Number <span className="text-[#E85D3F]">*</span>
                </label>
                <div
                  className={`flex items-center rounded-xl border bg-white overflow-hidden focus-within:ring-1 ${
                    fieldErrors.phone
                      ? 'border-red-400 focus-within:border-red-500 focus-within:ring-red-400'
                      : 'border-[var(--color-border)] focus-within:border-[#111111] focus-within:ring-[#111111]'
                  } ${createdEnquiryId ? 'bg-[#FAFAF8]' : ''}`}
                >
                  <span className="px-3.5 py-2.5 min-h-[44px] inline-flex items-center bg-[#FAFAF8] border-r border-[var(--color-border)] text-xs font-display font-semibold text-[#111111]/75 select-none">
                    +91
                  </span>
                  <input
                    id="gpa-mobile"
                    name="phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel-national"
                    required
                    disabled={Boolean(createdEnquiryId) || isSubmittingStep1}
                    placeholder="10-digit mobile number"
                    value={phone}
                    onChange={(e) => {
                      setPhone(e.target.value);
                      if (fieldErrors.phone) setFieldErrors((prev) => ({ ...prev, phone: undefined }));
                    }}
                    aria-invalid={Boolean(fieldErrors.phone)}
                    className="w-full min-h-[44px] px-3.5 py-2.5 bg-transparent text-base sm:text-sm font-body text-[#111111] placeholder:text-[#111111]/35 focus:outline-hidden disabled:text-[#111111]/70"
                  />
                </div>
                {fieldErrors.phone && (
                  <p className="text-xs font-body text-red-600">{fieldErrors.phone}</p>
                )}
              </div>

              {/* Email (Optional) */}
              <div className="space-y-1.5">
                <label
                  htmlFor="gpa-email"
                  className="text-xs font-display font-semibold text-[#111111] flex items-center justify-between"
                >
                  <span>Email</span>
                  <span className="text-[11px] font-body font-normal text-[#111111]/45">Optional</span>
                </label>
                <input
                  id="gpa-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  disabled={Boolean(createdEnquiryId) || isSubmittingStep1}
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: undefined }));
                  }}
                  aria-invalid={Boolean(fieldErrors.email)}
                  className={`w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-white border text-base sm:text-sm font-body text-[#111111] placeholder:text-[#111111]/35 focus:outline-hidden focus:ring-1 disabled:bg-[#FAFAF8] disabled:text-[#111111]/70 ${
                    fieldErrors.email
                      ? 'border-red-400 focus:border-red-500 focus:ring-red-400'
                      : 'border-[var(--color-border)] focus:border-[#111111] focus:ring-[#111111]'
                  }`}
                />
                {fieldErrors.email && (
                  <p className="text-xs font-body text-red-600">{fieldErrors.email}</p>
                )}
              </div>

              {/* Continue Primary CTA */}
              <div className="pt-1 space-y-2.5">
                <button
                  type="submit"
                  disabled={isSubmittingStep1}
                  data-testid="gpa-step1-continue"
                  className="w-full min-h-[46px] px-6 rounded-xl bg-[#E85D3F] hover:bg-[#D44C2F] text-white font-display font-semibold text-sm flex items-center justify-center gap-2 shadow-xs transition-colors disabled:opacity-60 cursor-pointer"
                >
                  {isSubmittingStep1 ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Continuing...</span>
                    </>
                  ) : (
                    <>
                      <span>Continue</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>

                <p className="text-[11px] text-center text-[#111111]/55 font-body flex items-center justify-center gap-1.5">
                  <Lock className="w-3 h-3 text-[#218C5A] shrink-0" />
                  <span>Handled directly by Great Homes specialists.</span>
                </p>
              </div>
            </form>
          )}

          {/* STEP 2: BUYER REQUIREMENTS (ALL OPTIONAL, ZERO PRESELECTED DEFAULTS) */}
          {step === 2 && (
            <form
              id="gpa-step2-form"
              onSubmit={handleStep2Submit}
              className="space-y-5 text-left animate-in fade-in duration-150"
            >
              {/* Saved Contact Pill */}
              <div className="px-3.5 py-2.5 rounded-xl bg-[#218C5A]/8 border border-[#218C5A]/20 flex items-center justify-between gap-2 text-xs">
                <span className="inline-flex items-center gap-1.5 font-display font-semibold text-[#111111]">
                  <CheckCircle2 className="w-4 h-4 text-[#218C5A] shrink-0" />
                  <span>Contact details saved</span>
                </span>
                <span className="font-mono text-[11px] text-[#111111]/65 shrink-0">
                  {referenceNumber}
                </span>
              </div>

              {/* Approved Step 2 Heading & Subtitle */}
              <div className="space-y-1">
                <h2
                  id="gpa-dialog-heading"
                  className="text-lg sm:text-xl font-display font-bold text-[#111111] tracking-tight"
                >
                  Help us find the right property for you
                </h2>
                <p
                  id="gpa-dialog-subtitle"
                  className="text-xs sm:text-sm font-body text-[#111111]/65 leading-relaxed"
                >
                  Tell us a little about your requirements to help our team assist you better.
                </p>
              </div>

              {/* Step 2 Error Banner */}
              {errorMessage && (
                <div
                  role="alert"
                  className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-body"
                >
                  {errorMessage}
                </div>
              )}

              {/* 1. Preferred BHK */}
              <div className="space-y-2">
                <span className="text-xs font-display font-semibold text-[#111111] flex items-center justify-between">
                  <span>Preferred BHK</span>
                  <span className="text-[11px] font-body font-normal text-[#111111]/45">Optional</span>
                </span>
                <div className="flex flex-wrap gap-2">
                  {PREFERRED_BHK_OPTIONS.map((option) => {
                    const active = preferredBhk === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        aria-pressed={active}
                        onClick={() => toggleChip(preferredBhk, option.value, setPreferredBhk)}
                        className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-display font-semibold border transition-all cursor-pointer ${
                          active
                            ? 'bg-[#111111] text-white border-[#111111] shadow-2xs'
                            : 'bg-white text-[#111111]/80 border-[var(--color-border)] hover:border-[#111111]/40 hover:bg-[#FAFAF8]'
                        }`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 2. Property Type */}
              <div className="space-y-2">
                <span className="text-xs font-display font-semibold text-[#111111] flex items-center justify-between">
                  <span>Property Type</span>
                  <span className="text-[11px] font-body font-normal text-[#111111]/45">Optional</span>
                </span>
                <div className="flex flex-wrap gap-2">
                  {PROPERTY_TYPE_OPTIONS.map((option) => {
                    const active = propertyType === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        aria-pressed={active}
                        onClick={() => toggleChip(propertyType, option.value, setPropertyType)}
                        className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-display font-semibold border transition-all cursor-pointer ${
                          active
                            ? 'bg-[#111111] text-white border-[#111111] shadow-2xs'
                            : 'bg-white text-[#111111]/80 border-[var(--color-border)] hover:border-[#111111]/40 hover:bg-[#FAFAF8]'
                        }`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 3. Budget */}
              <div className="space-y-2">
                <span className="text-xs font-display font-semibold text-[#111111] flex items-center justify-between">
                  <span>Budget</span>
                  <span className="text-[11px] font-body font-normal text-[#111111]/45">Optional</span>
                </span>
                <div className="flex flex-wrap gap-2">
                  {BUDGET_RANGE_OPTIONS.map((option) => {
                    const active = budgetRange === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        aria-pressed={active}
                        onClick={() => toggleChip(budgetRange, option.value, setBudgetRange)}
                        className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-display font-semibold border transition-all cursor-pointer ${
                          active
                            ? 'bg-[#111111] text-white border-[#111111] shadow-2xs'
                            : 'bg-white text-[#111111]/80 border-[var(--color-border)] hover:border-[#111111]/40 hover:bg-[#FAFAF8]'
                        }`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 4. Buying Timeline */}
              <div className="space-y-2">
                <span className="text-xs font-display font-semibold text-[#111111] flex items-center justify-between">
                  <span>Buying Timeline</span>
                  <span className="text-[11px] font-body font-normal text-[#111111]/45">Optional</span>
                </span>
                <div className="flex flex-wrap gap-2">
                  {BUYING_TIMELINE_OPTIONS.map((option) => {
                    const active = purchaseTimeline === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        aria-pressed={active}
                        onClick={() => toggleChip(purchaseTimeline, option.value, setPurchaseTimeline)}
                        className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-display font-semibold border transition-all cursor-pointer ${
                          active
                            ? 'bg-[#111111] text-white border-[#111111] shadow-2xs'
                            : 'bg-white text-[#111111]/80 border-[var(--color-border)] hover:border-[#111111]/40 hover:bg-[#FAFAF8]'
                        }`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 5. Purchase Purpose */}
              <div className="space-y-2">
                <span className="text-xs font-display font-semibold text-[#111111] flex items-center justify-between">
                  <span>Purchase Purpose</span>
                  <span className="text-[11px] font-body font-normal text-[#111111]/45">Optional</span>
                </span>
                <div className="flex flex-wrap gap-2">
                  {PURCHASE_PURPOSE_OPTIONS.map((option) => {
                    const active = purchasePurpose === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        aria-pressed={active}
                        onClick={() => toggleChip(purchasePurpose, option.value, setPurchasePurpose)}
                        className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-display font-semibold border transition-all cursor-pointer ${
                          active
                            ? 'bg-[#111111] text-white border-[#111111] shadow-2xs'
                            : 'bg-white text-[#111111]/80 border-[var(--color-border)] hover:border-[#111111]/40 hover:bg-[#FAFAF8]'
                        }`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 6. Site Visit Interest (Interest only — unchecked by default) */}
              <label
                htmlFor="gpa-site-visit-interest"
                className={`flex items-start gap-3 p-3.5 rounded-xl border transition-colors cursor-pointer select-none ${
                  siteVisitInterest
                    ? 'bg-[#FFF6F3] border-[#E85D3F]/35'
                    : 'bg-[#FAFAF8] border-[var(--color-border)] hover:border-[#111111]/25'
                }`}
              >
                <input
                  id="gpa-site-visit-interest"
                  type="checkbox"
                  checked={siteVisitInterest}
                  onChange={(e) => setSiteVisitInterest(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-[var(--color-border)] text-[#E85D3F] focus:ring-[#E85D3F] cursor-pointer"
                />
                <div className="space-y-0.5">
                  <span className="text-xs sm:text-[13px] font-display font-semibold text-[#111111] block">
                    Yes, I&apos;d like to schedule a site visit
                  </span>
                  <span className="text-[11px] font-body text-[#111111]/60 block">
                    Our advisory team will coordinate a convenient date and time with you.
                  </span>
                </div>
              </label>

              {/* 7. Additional Requirements */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="gpa-additional-requirements"
                    className="text-xs font-display font-semibold text-[#111111]"
                  >
                    Additional Requirements
                  </label>
                  <span className="text-[11px] font-body text-[#111111]/45">
                    {remainingChars} chars left
                  </span>
                </div>

                {/* Helpful Suggestion Chips */}
                <div className="flex flex-wrap gap-1.5">
                  {ADDITIONAL_REQUIREMENT_SUGGESTIONS.map((suggestion) => {
                    const isIncluded = additionalRequirements
                      .toLowerCase()
                      .includes(suggestion.toLowerCase());
                    return (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => handleToggleSuggestion(suggestion)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-display font-medium border transition-colors inline-flex items-center gap-1 cursor-pointer ${
                          isIncluded
                            ? 'bg-[#E85D3F]/10 text-[#E85D3F] border-[#E85D3F]/30'
                            : 'bg-[#FAFAF8] text-[#111111]/70 border-[var(--color-border)] hover:bg-white hover:text-[#111111]'
                        }`}
                      >
                        {isIncluded && <Check className="w-3 h-3" />}
                        <span>{suggestion}</span>
                      </button>
                    );
                  })}
                </div>

                <textarea
                  id="gpa-additional-requirements"
                  rows={3}
                  maxLength={MAX_ADDITIONAL_REQUIREMENTS_LENGTH}
                  placeholder="What would you like to know about this property?"
                  value={additionalRequirements}
                  onChange={(e) => setAdditionalRequirements(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[var(--color-border)] text-base sm:text-sm font-body text-[#111111] placeholder:text-[#111111]/35 focus:outline-hidden focus:border-[#111111] focus:ring-1 focus:ring-[#111111] resize-y"
                />
              </div>
            </form>
          )}

          {/* STEP 3: CONFIRMATION */}
          {step === 3 && (
            <div
              data-testid="gpa-step3-confirmation"
              className="py-4 sm:py-6 text-center space-y-5 animate-in fade-in zoom-in-95 duration-200"
            >
              <div className="w-14 h-14 rounded-full bg-[#218C5A]/10 border border-[#218C5A]/20 flex items-center justify-center mx-auto text-[#218C5A]">
                <CheckCircle2 className="w-8 h-8" />
              </div>

              <div className="space-y-2">
                {referenceNumber && (
                  <span
                    data-testid="gpa-reference-number"
                    className="inline-block px-3 py-1 rounded-full bg-[#FAFAF8] border border-[var(--color-border)] text-xs font-display font-bold text-[#111111]"
                  >
                    Ref: {referenceNumber}
                  </span>
                )}
                <h2
                  id="gpa-dialog-heading"
                  className="text-2xl font-display font-bold text-[#111111]"
                >
                  Enquiry Submitted
                </h2>
                <p
                  id="gpa-dialog-subtitle"
                  className="text-sm font-body text-[#111111]/75 max-w-sm mx-auto leading-relaxed"
                >
                  Thank you for your interest in{' '}
                  <strong className="font-semibold text-[#111111]">{displayProjectName}</strong>.
                  Our team will contact you with the latest price, availability, and property details.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-[#FAFAF8] border border-[var(--color-border)] text-xs text-[#111111]/80 font-body max-w-sm mx-auto text-left space-y-2.5">
                <div className="flex items-start gap-2.5">
                  <Sparkles className="w-4 h-4 text-[#E85D3F] shrink-0 mt-0.5" />
                  <span>
                    {step2Outcome === 'SUBMITTED' && requirementsProvidedCount > 0
                      ? 'Your buyer requirements have been attached to this enquiry so our advisor can prepare relevant unit options and pricing for you.'
                      : 'A Great Homes property advisor will reach out to share verified pricing, available configurations, and answer any questions you have.'}
                  </span>
                </div>

                {siteVisitInterest && (
                  <div className="flex items-start gap-2.5 border-t border-[var(--color-border)]/70 pt-2.5">
                    <Calendar className="w-4 h-4 text-[#218C5A] shrink-0 mt-0.5" />
                    <div>
                      <span className="font-display font-semibold block text-[#111111]">
                        Site Visit Interest Noted
                      </span>
                      <span className="text-[#111111]/65 block">
                        Our team will coordinate with you to schedule a convenient property visit.
                      </span>
                    </div>
                  </div>
                )}

                <div className="flex items-start gap-2.5 border-t border-[var(--color-border)]/70 pt-2.5">
                  <ShieldCheck className="w-4 h-4 text-[#218C5A] shrink-0 mt-0.5" />
                  <span className="text-[#111111]/65">
                    Verified facts & direct Great Homes advisory assistance.
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                data-testid="gpa-step3-done"
                className="w-full sm:w-auto min-w-[160px] min-h-[44px] px-8 rounded-xl bg-[#111111] hover:bg-black text-white font-display font-semibold text-sm transition-colors shadow-xs cursor-pointer"
              >
                Done
              </button>
            </div>
          )}
        </div>

        {/* Sticky Footer for Step 2 Actions (Always reachable on 375px / 390px mobile) */}
        {step === 2 && (
          <div className="px-5 sm:px-6 py-3.5 border-t border-[var(--color-border)] bg-white shrink-0">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setErrorMessage(null);
                  setStep(1);
                }}
                disabled={isSubmittingStep2}
                data-testid="gpa-step2-back"
                className="min-h-[44px] px-3 sm:px-3.5 rounded-xl bg-white border border-[var(--color-border)] hover:bg-[#FAFAF8] text-[#111111] font-display font-semibold text-xs inline-flex items-center justify-center gap-1 transition-colors disabled:opacity-50 cursor-pointer shrink-0"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back</span>
              </button>

              <button
                type="button"
                onClick={handleStep2Skip}
                disabled={isSubmittingStep2}
                data-testid="gpa-step2-skip"
                className="min-h-[44px] px-3.5 sm:px-4 rounded-xl bg-[#FAFAF8] border border-[var(--color-border)] hover:bg-[#F2F2EE] text-[#111111]/80 font-display font-semibold text-xs inline-flex items-center justify-center transition-colors disabled:opacity-50 cursor-pointer shrink-0"
              >
                Skip
              </button>

              <button
                type="submit"
                form="gpa-step2-form"
                disabled={isSubmittingStep2}
                data-testid="gpa-step2-submit"
                className="flex-1 min-h-[44px] px-4 rounded-xl bg-[#E85D3F] hover:bg-[#D44C2F] text-white font-display font-semibold text-xs sm:text-sm inline-flex items-center justify-center gap-1.5 shadow-xs transition-colors disabled:opacity-60 cursor-pointer whitespace-nowrap"
              >
                {isSubmittingStep2 ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <span>Submit Requirements</span>
                    <ArrowRight className="w-4 h-4 shrink-0" />
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
