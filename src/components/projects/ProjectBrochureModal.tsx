'use client';

import React, { useEffect, useState } from 'react';
import {
  Download,
  FileText,
  X,
  CheckCircle2,
  ShieldCheck,
  AlertCircle,
  Loader2,
  ArrowRight,
  ArrowLeft,
  Smartphone,
  LockKeyhole,
  Clock3,
  UserCheck,
  RefreshCw,
} from 'lucide-react';
import { PublicProjectDto } from '@/src/domain/projects/dto/projectDto';
import { useProjectInteraction } from './ProjectInteractionContext';
import { useVisitorTelemetry } from '@/src/components/telemetry/VisitorTelemetryProvider';
import { useCustomerAuth } from '@/src/components/customer/CustomerAuthContext';

interface ProjectBrochureModalProps {
  project: PublicProjectDto;
}

export function ProjectMobileBrochureButton({ project }: ProjectBrochureModalProps) {
  const { openBrochureModal } = useProjectInteraction();
  const { trackEvent } = useVisitorTelemetry();

  const hasBrochure = Boolean(project.hasBrochure || project.brochure?.available);
  if (!hasBrochure) return null;

  const handleClick = () => {
    trackEvent({
      eventType: 'BROCHURE_CLICKED',
      entityType: 'PROJECT',
      entityId: project.id,
      entitySlug: project.slug,
      metadata: {
        placement: 'mobile_snapshot_bar',
        projectName: project.name,
      },
    }).catch(() => {});
    openBrochureModal();
  };

  return (
    <div className="pt-4 border-t border-[var(--color-border)] lg:hidden">
      <button
        type="button"
        onClick={handleClick}
        data-testid="mobile-download-brochure-button"
        className="w-full min-h-[44px] py-2.5 px-4 rounded-xl border border-[#111111]/20 bg-white hover:bg-[#111111]/[0.03] active:bg-[#111111]/[0.06] text-[#111111] font-display font-semibold text-xs sm:text-sm transition-colors flex items-center justify-center gap-2 shadow-2xs focus:outline-hidden focus-visible:ring-2 focus-visible:ring-[#E85D3F]"
      >
        <Download className="w-4 h-4 text-[#E85D3F] shrink-0" aria-hidden="true" />
        <span>Download Official Project Brochure (PDF)</span>
      </button>
    </div>
  );
}

function maskPhoneDisplay(value: string): string {
  const digits = value.replace(/\D/g, '');
  const national = digits.length > 10 ? digits.slice(-10) : digits;
  return national.length >= 4 ? `+91 •••••• ${national.slice(-4)}` : 'your mobile number';
}

type ModalStep = 'contact' | 'otp' | 'ready';

export function ProjectBrochureModal({ project }: ProjectBrochureModalProps) {
  const { brochureModalOpen, closeBrochureModal } = useProjectInteraction();
  const { trackEvent } = useVisitorTelemetry();
  const { customer, sendOtp, verifyOtp, completeProfile, logout } = useCustomerAuth();

  const [step, setStep] = useState<ModalStep>('contact');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [marketingConsent, setMarketingConsent] = useState(false);

  // OTP state (Scenario A & D)
  const [otp, setOtp] = useState('');
  const [challengeId, setChallengeId] = useState('');
  const [maskedPhone, setMaskedPhone] = useState('');
  const [resendSeconds, setResendSeconds] = useState(0);

  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [downloadReady, setDownloadReady] = useState<{
    downloadUrl: string;
    filename: string;
    referenceNumber: string;
  } | null>(null);

  const hasBrochure = Boolean(project.hasBrochure || project.brochure?.available);

  // Synchronize customer details if logged in
  useEffect(() => {
    if (customer) {
      if (customer.name) setName(customer.name);
      if (customer.phone) {
        const cleanPhone = customer.phone.replace(/^\+91/, '').trim();
        setPhone(cleanPhone);
      }
      if (customer.email && !customer.email.includes('@buyer.greathomes.co.in')) {
        setEmail(customer.email);
      }
    }
  }, [customer]);

  // Reset state whenever modal opens
  useEffect(() => {
    if (!brochureModalOpen) {
      setErrorMessage(null);
      setSubmitting(false);
      return;
    }

    setErrorMessage(null);
    setSubmitting(false);
    setOtp('');
    setMarketingConsent(false);
    setDownloadReady(null);
    setStep('contact');

    trackEvent({
      eventType: 'BROCHURE_MODAL_OPENED',
      entityType: 'PROJECT',
      entityId: project.id,
      entitySlug: project.slug,
      metadata: {
        projectName: project.name,
        authenticated: Boolean(customer),
      },
    }).catch(() => {});
  }, [brochureModalOpen, project.id, project.slug, project.name, customer, trackEvent]);

  // Resend countdown timer
  useEffect(() => {
    if (step !== 'otp' || resendSeconds <= 0) return;
    const timer = window.setTimeout(() => {
      setResendSeconds((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [step, resendSeconds]);

  if (!brochureModalOpen || !hasBrochure) return null;

  const triggerBrowserDownload = (url: string, filename: string) => {
    if (typeof document === 'undefined') return;
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename || `${project.slug}-brochure.pdf`;
    anchor.rel = 'noopener noreferrer';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  };

  const executeBrochureDownload = async (contactData: {
    buyerName: string;
    buyerPhone: string;
    buyerEmail?: string;
  }) => {
    const res = await fetch(`/api/projects/${project.id}/brochure/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: contactData.buyerName,
        phone: contactData.buyerPhone,
        email: contactData.buyerEmail || undefined,
        marketingConsent,
        sourcePage: typeof window !== 'undefined' ? window.location.pathname : `/projects/${project.slug}`,
      }),
    });

    const data = await res.json();
    if (!res.ok || !data.success || !data.downloadUrl) {
      if (res.status === 401) {
        // Session expired (Scenario C)
        await logout().catch(() => {});
        setStep('contact');
        throw new Error('Your session has expired. Please verify your mobile number again.');
      }
      throw new Error(data.message || data.error || 'Unable to process brochure request. Please try again.');
    }

    const readyState = {
      downloadUrl: data.downloadUrl as string,
      filename: (data.filename as string) || `${project.slug}-brochure.pdf`,
      referenceNumber: (data.referenceNumber as string) || '',
    };

    setDownloadReady(readyState);
    setStep('ready');

    trackEvent({
      eventType: 'BROCHURE_DOWNLOAD_INITIATED',
      entityType: 'PROJECT',
      entityId: project.id,
      entitySlug: project.slug,
      metadata: {
        projectName: project.name,
        referenceNumber: readyState.referenceNumber,
      },
    }).catch(() => {});

    triggerBrowserDownload(readyState.downloadUrl, readyState.filename);
  };

  // Scenario B: Customer is already logged in
  const handleAuthenticatedDownload = async () => {
    setErrorMessage(null);
    setSubmitting(true);
    try {
      await executeBrochureDownload({
        buyerName: customer?.name || name || 'Prospective Buyer',
        buyerPhone: customer?.phone || phone,
        buyerEmail: customer?.email && !customer.email.includes('@buyer.greathomes.co.in') ? customer.email : email,
      });
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to download brochure. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Scenario A & D Step 1: Visitor inputs contact info and requests OTP
  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const trimmedName = name.trim();
    const trimmedPhone = phone.trim();
    const trimmedEmail = email.trim();

    if (trimmedName.length < 2) {
      setErrorMessage('Please enter your full name (at least 2 characters).');
      return;
    }

    const digitsOnly = trimmedPhone.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '').replace(/^0(?=\d{10}$)/, '');
    if (!/^[6-9]\d{9}$/.test(digitsOnly)) {
      setErrorMessage('Please enter a valid 10-digit Indian mobile number.');
      return;
    }

    if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setErrorMessage('Please enter a valid email address or leave it blank.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await sendOtp(digitsOnly);
      setChallengeId(result.challengeId);
      setMaskedPhone(maskPhoneDisplay(digitsOnly));
      setResendSeconds(result.resendAfterSeconds);
      setStep('otp');
    } catch (err: any) {
      setErrorMessage(err.message || 'Unable to send verification code. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Scenario A & D Step 2: Visitor verifies OTP and unlocks brochure download
  const handleVerifyOtpAndDownload = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const cleanOtp = otp.trim().replace(/\D/g, '');
    if (cleanOtp.length !== 4) {
      setErrorMessage('Please enter the 4-digit verification code.');
      return;
    }

    setSubmitting(true);
    try {
      const verifyResult = await verifyOtp(challengeId, cleanOtp);

      // If new profile needed, complete it automatically with the name & optional email from Step 1
      if (verifyResult.requiresProfileCompletion) {
        await completeProfile(
          verifyResult.challengeId || challengeId,
          name.trim(),
          email.trim() || undefined
        );
      }

      // Customer session is now active in browser cookies! Immediately issue brochure request & download
      const digitsOnly = phone.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '').replace(/^0(?=\d{10}$)/, '');
      await executeBrochureDownload({
        buyerName: name.trim(),
        buyerPhone: digitsOnly,
        buyerEmail: email.trim() || undefined,
      });
    } catch (err: any) {
      setErrorMessage(err.message || 'Verification failed. Please check the code and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendSeconds > 0 || submitting) return;
    setErrorMessage(null);
    setSubmitting(true);
    try {
      const digitsOnly = phone.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '').replace(/^0(?=\d{10}$)/, '');
      const result = await sendOtp(digitsOnly);
      setChallengeId(result.challengeId);
      setResendSeconds(result.resendAfterSeconds);
      setOtp('');
    } catch (err: any) {
      setErrorMessage(err.message || 'Unable to resend code. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSwitchAccount = async () => {
    await logout().catch(() => {});
    setName('');
    setPhone('');
    setEmail('');
    setStep('contact');
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="brochure-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in"
    >
      <div className="relative w-full max-w-md rounded-2xl bg-white border border-[var(--color-border)] shadow-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 p-5 border-b border-[var(--color-border)] bg-[#FAFAF8]">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[#E85D3F]/10 text-[#E85D3F] flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <span className="text-[10px] font-display font-bold uppercase tracking-wider text-[#E85D3F] block">
                Official Project Documentation
              </span>
              <h2
                id="brochure-modal-title"
                className="text-base sm:text-lg font-display font-bold text-[#111111] truncate"
              >
                Download {project.name} Brochure
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={closeBrochureModal}
            aria-label="Close brochure modal"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--color-foreground)]/60 hover:text-[#111111] hover:bg-black/5 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Error Banner */}
          {errorMessage && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-body flex items-start gap-2"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* STEP: READY / COMPLETED */}
          {step === 'ready' && downloadReady ? (
            <div className="space-y-4 text-center py-2">
              <div className="w-12 h-12 rounded-full bg-[#218C5A]/10 text-[#218C5A] flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6" aria-hidden="true" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-display font-bold text-[#111111]">
                  Your Brochure Download Has Started
                </h3>
                <p className="text-xs text-[var(--color-foreground)]/70 font-body leading-relaxed">
                  If the PDF download did not begin automatically, click below to save{' '}
                  <span className="font-semibold text-[#111111]">{downloadReady.filename}</span>.
                </p>
                {downloadReady.referenceNumber && (
                  <p className="text-[11px] font-mono text-[var(--color-foreground)]/50 pt-0.5">
                    Enquiry Ref: {downloadReady.referenceNumber}
                  </p>
                )}
              </div>

              <a
                href={downloadReady.downloadUrl}
                download={downloadReady.filename}
                onClick={() => {
                  trackEvent({
                    eventType: 'BROCHURE_DOWNLOAD_INITIATED',
                    entityType: 'PROJECT',
                    entityId: project.id,
                    entitySlug: project.slug,
                    metadata: {
                      projectName: project.name,
                      referenceNumber: downloadReady.referenceNumber,
                      manualRetry: true,
                    },
                  }).catch(() => {});
                }}
                className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-[#E85D3F] hover:bg-[#d04e32] text-white font-display font-semibold text-xs sm:text-sm transition-colors inline-flex items-center justify-center gap-2 shadow-xs"
              >
                <Download className="w-4 h-4" />
                <span>Download PDF Again</span>
              </a>

              <button
                type="button"
                onClick={closeBrochureModal}
                className="w-full py-2 text-xs font-display font-medium text-[var(--color-foreground)]/60 hover:text-[#111111]"
              >
                Done
              </button>
            </div>
          ) : customer ? (
            /* SCENARIO B: CUSTOMER ALREADY LOGGED IN */
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-emerald-50/80 border border-emerald-200/80 flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                  <UserCheck className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <span className="text-[10px] font-display font-bold uppercase tracking-wider text-emerald-700 block">
                    Authenticated Customer
                  </span>
                  <p className="text-sm font-display font-bold text-[#111111] truncate">
                    {customer.name}
                  </p>
                  <p className="text-xs font-mono text-neutral-600 truncate">
                    {customer.phone || customer.email}
                  </p>
                </div>
              </div>

              <p className="text-xs text-[var(--color-foreground)]/70 font-body leading-relaxed">
                Click below to immediately generate and download the official verified{' '}
                <span className="font-semibold text-[#111111]">{project.name}</span> brochure PDF.
              </p>

              <button
                type="button"
                onClick={handleAuthenticatedDownload}
                disabled={submitting}
                className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-[#E85D3F] hover:bg-[#d04e32] disabled:opacity-60 text-white font-display font-semibold text-xs sm:text-sm transition-colors flex items-center justify-center gap-2 shadow-xs"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Preparing Official Brochure…</span>
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    <span>Download Brochure (PDF)</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>

              <div className="flex items-center justify-between pt-1 text-xs">
                <button
                  type="button"
                  onClick={handleSwitchAccount}
                  className="text-[11px] text-[var(--color-foreground)]/60 hover:text-[#E85D3F] font-display underline"
                >
                  Use a different mobile number
                </button>
                <div className="flex items-center gap-1 text-[10px] text-[var(--color-foreground)]/55 font-display">
                  <ShieldCheck className="w-3 h-3 text-[#218C5A] shrink-0" />
                  <span>Direct Download</span>
                </div>
              </div>
            </div>
          ) : step === 'otp' ? (
            /* SCENARIO A / D STEP 2: VERIFY 4-DIGIT OTP */
            <form onSubmit={handleVerifyOtpAndDownload} className="space-y-4" noValidate>
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => {
                      setStep('contact');
                      setErrorMessage(null);
                    }}
                    className="inline-flex items-center gap-1 text-xs font-display text-[var(--color-foreground)]/60 hover:text-[#111111]"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Change Number</span>
                  </button>
                  <span className="text-[11px] font-mono text-[var(--color-foreground)]/60">
                    {maskedPhone}
                  </span>
                </div>
                <h3 className="text-sm font-display font-bold text-[#111111] pt-1">
                  Enter 4-Digit Verification Code
                </h3>
                <p className="text-xs text-[var(--color-foreground)]/70 font-body leading-relaxed">
                  We sent a 4-digit SMS verification code to your mobile number.
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-center">
                  <input
                    id="brochure-otp-input"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    autoFocus
                    maxLength={4}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="••••"
                    className="w-40 text-center tracking-[0.5em] text-2xl font-mono py-2.5 px-3 rounded-xl border border-[var(--color-border)] bg-white text-[#111111] focus:outline-hidden focus:ring-2 focus:ring-[#E85D3F]"
                  />
                </div>

                <div className="flex items-center justify-center text-xs">
                  {resendSeconds > 0 ? (
                    <span className="flex items-center gap-1.5 text-neutral-500 font-display text-[11px]">
                      <Clock3 className="w-3.5 h-3.5" />
                      Resend code in {resendSeconds}s
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={handleResendOtp}
                      disabled={submitting}
                      className="inline-flex items-center gap-1.5 text-xs font-display font-semibold text-[#E85D3F] hover:underline"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Resend verification code
                    </button>
                  )}
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting || otp.trim().length !== 4}
                className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-[#E85D3F] hover:bg-[#d04e32] disabled:opacity-60 text-white font-display font-semibold text-xs sm:text-sm transition-colors flex items-center justify-center gap-2 shadow-xs"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Verifying &amp; Preparing Brochure…</span>
                  </>
                ) : (
                  <>
                    <LockKeyhole className="w-4 h-4" />
                    <span>Verify &amp; Download Brochure</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>

              <div className="flex items-center justify-center gap-1.5 text-[10px] text-[var(--color-foreground)]/55 font-display">
                <ShieldCheck className="w-3.5 h-3.5 text-[#218C5A] shrink-0" />
                <span>Secure SMS verification powered by Great Homes</span>
              </div>
            </form>
          ) : (
            /* SCENARIO A / D STEP 1: VISITOR ENTERS CONTACT DETAILS */
            <form onSubmit={handleRequestOtp} className="space-y-3.5" noValidate>
              <p className="text-xs text-[var(--color-foreground)]/70 font-body leading-relaxed">
                Provide your mobile number to verify and instantly unlock the official{' '}
                <span className="font-semibold text-[#111111]">{project.name}</span> PDF brochure.
              </p>

              <div className="space-y-1">
                <label
                  htmlFor="brochure-buyer-name"
                  className="block text-xs font-display font-semibold text-[#111111]"
                >
                  Full Name <span className="text-[#E85D3F]">*</span>
                </label>
                <input
                  id="brochure-buyer-name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Arindam Chatterjee"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--color-border)] bg-white text-xs sm:text-sm font-body text-[#111111] focus:outline-hidden focus:ring-2 focus:ring-[#E85D3F]"
                />
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="brochure-buyer-phone"
                  className="block text-xs font-display font-semibold text-[#111111]"
                >
                  Mobile Number (India) <span className="text-[#E85D3F]">*</span>
                </label>
                <div className="flex items-center rounded-xl border border-[var(--color-border)] bg-white overflow-hidden focus-within:ring-2 focus-within:ring-[#E85D3F]">
                  <span className="px-3 py-2.5 bg-[#FAFAF8] border-r border-[var(--color-border)] text-xs font-mono text-[var(--color-foreground)]/70 select-none">
                    +91
                  </span>
                  <input
                    id="brochure-buyer-phone"
                    type="tel"
                    inputMode="numeric"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="98300 12345"
                    className="w-full px-3.5 py-2.5 text-xs sm:text-sm font-body text-[#111111] focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="brochure-buyer-email"
                  className="block text-xs font-display font-semibold text-[#111111]"
                >
                  Email Address <span className="text-[10px] font-normal text-[var(--color-foreground)]/50">(Optional)</span>
                </label>
                <input
                  id="brochure-buyer-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--color-border)] bg-white text-xs sm:text-sm font-body text-[#111111] focus:outline-hidden focus:ring-2 focus:ring-[#E85D3F]"
                />
              </div>

              <label className="flex items-start gap-2.5 pt-1 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={marketingConsent}
                  onChange={(e) => setMarketingConsent(e.target.checked)}
                  className="mt-0.5 rounded border-neutral-300 text-[#E85D3F] focus:ring-[#E85D3F]"
                />
                <span className="text-[11px] text-[var(--color-foreground)]/65 font-body leading-snug">
                  Allow Great Homes advisors to share verified floor plans, inventory updates, and price sheets for {project.name}.
                </span>
              </label>

              <button
                type="submit"
                disabled={submitting}
                className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-[#E85D3F] hover:bg-[#d04e32] disabled:opacity-60 text-white font-display font-semibold text-xs sm:text-sm transition-colors flex items-center justify-center gap-2 shadow-xs"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Sending Verification Code…</span>
                  </>
                ) : (
                  <>
                    <Smartphone className="w-4 h-4" />
                    <span>Send 4-Digit Code to Download</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>

              <div className="flex items-center justify-center gap-1.5 pt-1 text-[10px] text-[var(--color-foreground)]/55 font-display">
                <ShieldCheck className="w-3.5 h-3.5 text-[#218C5A] shrink-0" />
                <span>Verified PDF • Authenticated Access</span>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
