'use client';

import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Clock3,
  Loader2,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Smartphone,
  UserRound,
  X,
} from 'lucide-react';
import { useCustomerAuth } from './CustomerAuthContext';

type AuthStep = 'phone' | 'otp' | 'profile';

function maskPhoneForDisplay(value: string): string {
  const digits = value.replace(/\D/g, '');
  const nationalNumber = digits.length > 10 ? digits.slice(-10) : digits;
  return nationalNumber.length >= 4
    ? '+91 •••••• ' + nationalNumber.slice(-4)
    : 'your mobile number';
}

const inputClassName =
  'w-full min-w-0 rounded-xl border border-[#D9D5D0] bg-white px-4 py-3 text-sm text-[#111111] outline-none transition placeholder:text-[#9A9690] focus:border-[#E85D3F] focus:ring-4 focus:ring-[#E85D3F]/10 disabled:cursor-not-allowed disabled:bg-[#F5F3F0]';

export function CustomerAuthModal() {
  const {
    isAuthModalOpen,
    closeAuthModal,
    authModalMode,
    sendOtp,
    verifyOtp,
    completeProfile,
  } = useCustomerAuth();

  const [step, setStep] = useState<AuthStep>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [challengeId, setChallengeId] = useState('');
  const [maskedPhone, setMaskedPhone] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(0);

  useEffect(() => {
    if (!isAuthModalOpen) return;
    setStep('phone');
    setPhone('');
    setOtp('');
    setChallengeId('');
    setMaskedPhone('');
    setName('');
    setEmail('');
    setError(null);
    setSubmitting(false);
    setResendSeconds(0);
  }, [isAuthModalOpen, authModalMode]);

  useEffect(() => {
    if (step !== 'otp' || resendSeconds <= 0) return;
    const timer = window.setTimeout(
      () => setResendSeconds((current) => Math.max(0, current - 1)),
      1000
    );
    return () => window.clearTimeout(timer);
  }, [step, resendSeconds]);

  if (!isAuthModalOpen) return null;

  const requestOtp = async (rawPhone: string) => {
    const result = await sendOtp(rawPhone);
    setChallengeId(result.challengeId);
    setMaskedPhone(maskPhoneForDisplay(rawPhone));
    setStep('otp');
    setOtp('');
    setResendSeconds(result.resendAfterSeconds);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      if (step === 'phone') {
        await requestOtp(phone);
      } else if (step === 'otp') {
        const result = await verifyOtp(challengeId, otp);
        if (result.requiresProfileCompletion) {
          setChallengeId(result.challengeId || challengeId);
          setMaskedPhone(result.maskedPhone || maskedPhone);
          setStep('profile');
        }
      } else {
        await completeProfile(challengeId, name.trim(), email.trim());
      }
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : 'Something went wrong. Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const stepIndex = step === 'phone' ? 0 : step === 'otp' ? 1 : 2;
  const steps: { key: AuthStep; label: string }[] = [
    { key: 'phone', label: 'Mobile' },
    { key: 'otp', label: 'Verify' },
    { key: 'profile', label: 'Profile' },
  ];

  const title =
    step === 'phone'
      ? authModalMode === 'register'
        ? 'Create your account'
        : 'Welcome to Great Homes'
      : step === 'otp'
        ? 'Verify your mobile'
        : 'A little about you';

  const description =
    step === 'phone'
      ? 'Sign in securely with your mobile number. No password needed.'
      : step === 'otp'
        ? 'Enter the four-digit code sent to ' + maskedPhone + '.'
        : 'Add your name and email to finish setting up your account.';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="customer-auth-title"
      aria-describedby="customer-auth-description"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#111111]/60 p-3 backdrop-blur-sm sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !submitting) closeAuthModal();
      }}
    >
      <div className="relative max-h-[calc(100dvh-24px)] w-full max-w-[470px] overflow-y-auto rounded-2xl border border-white/80 bg-[#FAFAF8] p-5 shadow-[0_28px_80px_rgba(17,17,17,0.28)] sm:max-h-[calc(100dvh-48px)] sm:p-8">
        <button
          type="button"
          onClick={closeAuthModal}
          aria-label="Close sign-in dialog"
          disabled={submitting}
          className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full text-[#6E6A65] transition hover:bg-[#EEEAE5] hover:text-[#111111] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#E85D3F]/20 disabled:opacity-40 sm:right-5 sm:top-5"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="mb-7 flex items-center gap-3 pr-10">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#E85D3F] text-white shadow-sm">
            <Smartphone className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#E85D3F]">
              Great Homes
            </p>
            <p className="mt-0.5 text-sm font-medium text-[#6E6A65]">
              Secure account access
            </p>
          </div>
        </div>

        <div className="mb-6">
          <h2
            id="customer-auth-title"
            className="text-[26px] font-semibold leading-tight tracking-[-0.035em] text-[#111111] sm:text-[29px]"
          >
            {title}
          </h2>
          <p
            id="customer-auth-description"
            className="mt-2 max-w-[365px] text-sm leading-6 text-[#6E6A65]"
          >
            {description}
          </p>
        </div>

        <div
          className="mb-7 grid grid-cols-3 gap-3"
          aria-label={'Step ' + (stepIndex + 1) + ' of 3'}
        >
          {steps.map((item, index) => {
            const isCurrent = index === stepIndex;
            const isComplete = index < stepIndex;
            const barClass =
              isCurrent || isComplete ? 'bg-[#E85D3F]' : 'bg-[#E5E1DC]';
            const textClass =
              isCurrent
                ? 'font-semibold text-[#111111]'
                : isComplete
                  ? 'font-medium text-[#6E6A65]'
                  : 'text-[#A09B94]';

            return (
              <div key={item.key} className="min-w-0" aria-current={isCurrent ? 'step' : undefined}>
                <div className={'mb-2 h-1.5 rounded-full transition-colors ' + barClass} />
                <span className={'text-[11px] uppercase tracking-[0.12em] ' + textClass}>
                  0{index + 1} <span className="ml-1">{item.label}</span>
                </span>
              </div>
            );
          })}
        </div>

        {error && (
          <div
            role="alert"
            className="mb-5 flex gap-2.5 rounded-xl border border-[#F2C8C0] bg-[#FFF1EE] px-3.5 py-3 text-sm leading-5 text-[#9C3526]"
          >
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {step === 'phone' && (
            <div>
              <label
                htmlFor="customer-phone"
                className="mb-2 block text-xs font-bold uppercase tracking-[0.1em] text-[#46413C]"
              >
                Indian mobile number <span className="text-[#E85D3F]">*</span>
              </label>
              <div className="flex overflow-hidden rounded-xl border border-[#D9D5D0] bg-white transition focus-within:border-[#E85D3F] focus-within:ring-4 focus-within:ring-[#E85D3F]/10">
                <span className="flex shrink-0 items-center border-r border-[#E8E4DF] bg-[#F5F3F0] px-3.5 text-sm font-semibold text-[#46413C]">
                  +91
                </span>
                <input
                  id="customer-phone"
                  type="tel"
                  required
                  autoComplete="tel-national"
                  inputMode="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="98300 12345"
                  maxLength={18}
                  disabled={submitting}
                  className="min-w-0 flex-1 bg-transparent px-4 py-3.5 text-sm text-[#111111] outline-none placeholder:text-[#A09B94] disabled:cursor-not-allowed"
                  aria-describedby="customer-phone-help"
                />
              </div>
              <p id="customer-phone-help" className="mt-2 text-xs leading-5 text-[#77716B]">
                Existing customers sign in after verification. New customers can create an account in the next step.
              </p>
            </div>
          )}

          {step === 'otp' && (
            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <label
                  htmlFor="customer-otp"
                  className="text-xs font-bold uppercase tracking-[0.1em] text-[#46413C]"
                >
                  Four-digit code <span className="text-[#E85D3F]">*</span>
                </label>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FBE5DF] px-2.5 py-1 text-[11px] font-semibold text-[#B9432D]">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  SMS verification
                </span>
              </div>
              <input
                id="customer-otp"
                type="text"
                required
                autoFocus
                autoComplete="one-time-code"
                inputMode="numeric"
                pattern="[0-9]{4}"
                minLength={4}
                maxLength={4}
                value={otp}
                onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="— — — —"
                disabled={submitting}
                className="w-full rounded-xl border border-[#D9D5D0] bg-white px-4 py-4 text-center text-2xl font-semibold tracking-[0.55em] text-[#111111] outline-none transition placeholder:text-[#D5D0CA] focus:border-[#E85D3F] focus:ring-4 focus:ring-[#E85D3F]/10 disabled:cursor-not-allowed disabled:bg-[#F5F3F0]"
                aria-describedby="customer-otp-help"
              />
              <div id="customer-otp-help" className="mt-3 flex items-start gap-2 text-xs leading-5 text-[#77716B]">
                <LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#E85D3F]" />
                <p>Never share this code with anyone, including someone claiming to be from Great Homes.</p>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => {
                    setStep('phone');
                    setOtp('');
                    setError(null);
                  }}
                  className="inline-flex items-center gap-1.5 font-medium text-[#6E6A65] transition hover:text-[#111111] disabled:opacity-50"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Change mobile
                </button>
                {resendSeconds > 0 ? (
                  <span className="inline-flex items-center gap-1.5 text-xs text-[#77716B]">
                    <Clock3 className="h-3.5 w-3.5" />
                    Resend in {resendSeconds}s
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={async () => {
                      setError(null);
                      setSubmitting(true);
                      try {
                        await requestOtp(phone);
                      } catch (err: unknown) {
                        setError(err instanceof Error ? err.message : 'Could not resend the code.');
                      } finally {
                        setSubmitting(false);
                      }
                    }}
                    className="font-semibold text-[#C84931] transition hover:text-[#9F3927] hover:underline disabled:opacity-50"
                  >
                    Resend code
                  </button>
                )}
              </div>
            </div>
          )}

          {step === 'profile' && (
            <>
              <div>
                <label
                  htmlFor="customer-name"
                  className="mb-2 block text-xs font-bold uppercase tracking-[0.1em] text-[#46413C]"
                >
                  Full name <span className="text-[#E85D3F]">*</span>
                </label>
                <input
                  id="customer-name"
                  type="text"
                  required
                  minLength={2}
                  maxLength={120}
                  autoComplete="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Your full name"
                  disabled={submitting}
                  className={inputClassName}
                />
              </div>
              <div>
                <label
                  htmlFor="customer-email"
                  className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.1em] text-[#46413C]"
                >
                  Email address <span className="text-[#E85D3F]">*</span>
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#A09B94]" />
                  <input
                    id="customer-email"
                    type="email"
                    required
                    maxLength={254}
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@example.com"
                    disabled={submitting}
                    className={inputClassName + ' pl-10'}
                  />
                </div>
                <p className="mt-2 text-xs leading-5 text-[#77716B]">
                  No email OTP is needed right now. Your mobile number has already been verified.
                </p>
              </div>
              <button
                type="button"
                disabled={submitting}
                onClick={() => {
                  setStep('phone');
                  setChallengeId('');
                  setOtp('');
                  setError(null);
                }}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-[#6E6A65] transition hover:text-[#111111] disabled:opacity-50"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Start over
              </button>
            </>
          )}

          <button
            type="submit"
            disabled={submitting || (step === 'otp' && otp.length !== 4)}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#E85D3F] px-4 py-3.5 text-sm font-bold text-white shadow-sm transition hover:bg-[#D94F33] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#E85D3F]/25 disabled:cursor-not-allowed disabled:opacity-55"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>
                  {step === 'phone'
                    ? 'Sending code…'
                    : step === 'otp'
                      ? 'Verifying code…'
                      : 'Creating account…'}
                </span>
              </>
            ) : (
              <>
                <span>
                  {step === 'phone'
                    ? 'Send secure code'
                    : step === 'otp'
                      ? 'Verify and continue'
                      : 'Create account'}
                </span>
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </form>

        <div className="mt-6 flex items-start gap-2.5 border-t border-[#E8E4DF] pt-4 text-xs leading-5 text-[#77716B]">
          <LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#8D8881]" />
          <p>Your account is protected by mobile verification. Great Homes will never ask you to share your OTP.</p>
        </div>
      </div>
    </div>
  );
}
