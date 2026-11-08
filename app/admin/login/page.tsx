'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminAuth } from '@/src/components/admin/AdminAuthProvider';
import {
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  LockKeyhole,
  Mail,
  ShieldCheck,
} from 'lucide-react';

export default function AdminLoginPage() {
  const router = useRouter();
  const { login } = useAdminAuth();
  const [email, setEmail] = useState('superadmin@greathomes.co.in');
  const [password, setPassword] = useState('');
  const [bootstrapToken, setBootstrapToken] = useState('');
  const [bootstrapMode, setBootstrapMode] = useState(false);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const mode = new URLSearchParams(window.location.search).get('mode');
    if (mode === 'setup') setBootstrapMode(true);
    if (mode === 'recover') setRecoveryMode(true);
  }, []);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim() || !password || ((bootstrapMode || recoveryMode) && !bootstrapToken.trim())) {
      setError('Complete all required fields.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setNotice(null);

    try {
      const result = await login(
        email.trim(),
        password,
        bootstrapMode || recoveryMode ? bootstrapToken : undefined,
        bootstrapMode,
        recoveryMode
      );

      if (result === 'password-reset') {
        setBootstrapMode(false);
        setRecoveryMode(false);
        setBootstrapToken('');
        setPassword('');
        setNotice('Your Super Admin password has been reset. Sign in with your new password.');
        return;
      }

      if (result === 'bootstrap-complete') {
        setBootstrapMode(false);
        setPassword('');
        setBootstrapToken('');
        setNotice('Super Admin account created. Sign in with the email and password you just configured.');
        return;
      }

      if (result === true) {
        router.replace('/admin');
      } else if (typeof result === 'object' && result !== null) {
        setError(result.error);
      } else {
        setError(
          bootstrapMode
            ? 'Setup did not complete. Review the requirements and try again.'
            : recoveryMode
              ? 'Password recovery did not complete. Review the error and try again.'
              : 'Sign-in failed. Check your email and password or contact your administrator.'
        );
      }
    } catch {
      setError('We could not complete your request. Please try again in a moment.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const utilityMode = bootstrapMode || recoveryMode;
  const heading = bootstrapMode
    ? 'Set up your workspace'
    : recoveryMode
      ? 'Recover admin access'
      : 'Welcome back';
  const subheading = bootstrapMode
    ? 'Create the first Super Admin account for Great Homes.'
    : recoveryMode
      ? 'Verify your setup token and choose a new password.'
      : 'Sign in to manage Great Homes operations.';

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#F5F3F0] px-4 py-8 text-[#111111] sm:px-6">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -right-32 -top-40 h-[28rem] w-[28rem] rounded-full bg-[#E85D3F]/10 blur-3xl" />
        <div className="absolute -bottom-48 -left-28 h-[30rem] w-[30rem] rounded-full bg-[#111111]/[0.04] blur-3xl" />
        <div className="absolute inset-x-0 top-0 h-1 bg-[#E85D3F]" />
      </div>

      <div className="relative grid w-full max-w-5xl overflow-hidden rounded-[28px] border border-[#E5E1DC] bg-white shadow-[0_28px_90px_rgba(17,17,17,0.12)] lg:min-h-[610px] lg:grid-cols-[0.92fr_1.08fr]">
        <section className="relative hidden flex-col justify-between overflow-hidden bg-[#171717] p-10 text-white lg:flex xl:p-12">
          <div aria-hidden="true" className="absolute -right-24 top-20 h-72 w-72 rounded-full border border-white/10" />
          <div aria-hidden="true" className="absolute -right-12 top-32 h-48 w-48 rounded-full border border-white/10" />
          <div aria-hidden="true" className="absolute -bottom-20 -left-16 h-64 w-64 rounded-full bg-[#E85D3F]/20 blur-3xl" />

          <div className="relative flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#E85D3F] text-lg font-extrabold tracking-tight text-white shadow-lg shadow-black/20">
              GH
            </div>
            <div>
              <p className="text-sm font-bold tracking-wide">Great Homes</p>
              <p className="mt-0.5 text-xs text-white/50">Internal operations</p>
            </div>
          </div>

          <div className="relative max-w-sm py-12">
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/70">
              <ShieldCheck className="h-3.5 w-3.5 text-[#F28A72]" />
              Secure staff workspace
            </p>
            <h2 className="text-4xl font-semibold leading-[1.12] tracking-[-0.04em] xl:text-[42px]">
              Your work.
              <br />
              Your properties.
              <br />
              <span className="text-[#F28A72]">One clear view.</span>
            </h2>
            <p className="mt-5 max-w-xs text-sm leading-6 text-white/60">
              Sign in to manage listings, customer enquiries, and day-to-day operations from one place.
            </p>
          </div>

          <div className="relative flex items-center gap-2 border-t border-white/10 pt-5 text-xs text-white/45">
            <LockKeyhole className="h-3.5 w-3.5" />
            Private access for authorised team members
          </div>
        </section>

        <section className="flex min-w-0 flex-col justify-center px-5 py-8 sm:px-10 sm:py-12 lg:px-12 xl:px-16">
          <div className="mx-auto w-full max-w-md">
            <div className="mb-8 flex items-center gap-3 lg:hidden">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#E85D3F] text-base font-extrabold text-white">GH</div>
              <div>
                <p className="text-sm font-bold">Great Homes</p>
                <p className="text-xs text-[#77716B]">Internal operations</p>
              </div>
            </div>

            <div className="mb-8">
              <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.18em] text-[#C84931]">
                {utilityMode ? 'Account security' : 'Staff portal'}
              </p>
              <h1 className="text-3xl font-semibold tracking-[-0.04em] text-[#111111] sm:text-[34px]">
                {heading}
              </h1>
              <p className="mt-2 max-w-sm text-sm leading-6 text-[#77716B]">{subheading}</p>
            </div>

            {notice && (
              <div role="status" aria-live="polite" className="mb-5 flex gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-5 text-emerald-800">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{notice}</span>
              </div>
            )}

            {error && (
              <div role="alert" aria-live="polite" className="mb-5 flex gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm leading-5 text-rose-800">
                <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <label htmlFor="staff-email" className="mb-2 block text-xs font-semibold text-[#37332F]">
                  Work email
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8D8881]" />
                  <input
                    id="staff-email"
                    type="email"
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    disabled={isSubmitting}
                    className="min-h-12 w-full rounded-xl border border-[#D9D5D0] bg-[#FCFBFA] py-3 pl-10 pr-4 text-sm text-[#111111] outline-none transition placeholder:text-[#A09B94] hover:border-[#C6C0B9] focus:border-[#E85D3F] focus:bg-white focus:ring-4 focus:ring-[#E85D3F]/10 disabled:cursor-not-allowed disabled:opacity-60"
                    placeholder="you@greathomes.co.in"
                  />
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <label htmlFor="staff-password" className="block text-xs font-semibold text-[#37332F]">
                    {utilityMode ? 'Create new password' : 'Password'}
                  </label>
                  {!utilityMode && (
                    <span className="text-[11px] text-[#8D8881]">Staff account</span>
                  )}
                </div>
                <div className="relative">
                  <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8D8881]" />
                  <input
                    id="staff-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete={utilityMode ? 'new-password' : 'current-password'}
                    minLength={utilityMode ? 12 : undefined}
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    disabled={isSubmitting}
                    className="min-h-12 w-full rounded-xl border border-[#D9D5D0] bg-[#FCFBFA] py-3 pl-10 pr-12 text-sm text-[#111111] outline-none transition placeholder:text-[#A09B94] hover:border-[#C6C0B9] focus:border-[#E85D3F] focus:bg-white focus:ring-4 focus:ring-[#E85D3F]/10 disabled:cursor-not-allowed disabled:opacity-60"
                    placeholder={utilityMode ? 'At least 12 characters' : 'Enter your password'}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((visible) => !visible)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                    className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-[#77716B] transition hover:bg-[#EEEAE5] hover:text-[#111111] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E85D3F]/40"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {utilityMode && (
                <div>
                  <label htmlFor="bootstrap-token" className="mb-2 block text-xs font-semibold text-[#37332F]">
                    One-time setup token
                  </label>
                  <input
                    id="bootstrap-token"
                    type="password"
                    autoComplete="off"
                    required
                    value={bootstrapToken}
                    onChange={(event) => setBootstrapToken(event.target.value)}
                    disabled={isSubmitting}
                    className="min-h-12 w-full rounded-xl border border-[#D9D5D0] bg-[#FCFBFA] px-4 py-3 font-mono text-sm text-[#111111] outline-none transition placeholder:text-[#A09B94] focus:border-[#E85D3F] focus:bg-white focus:ring-4 focus:ring-[#E85D3F]/10 disabled:cursor-not-allowed disabled:opacity-60"
                    placeholder="Enter your secure setup token"
                  />
                  <p className="mt-2 text-xs leading-5 text-[#77716B]">
                    Obtain this token securely from the administrator who configured the deployment.
                  </p>
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting || !email.trim() || !password || (utilityMode && !bootstrapToken.trim())}
                className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#E85D3F] px-4 py-3 text-sm font-bold text-white shadow-[0_8px_18px_rgba(232,93,63,0.2)] transition hover:bg-[#D94F33] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#E85D3F]/25 disabled:cursor-not-allowed disabled:opacity-55"
              >
                <span>
                  {isSubmitting
                    ? bootstrapMode
                      ? 'Setting up account…'
                      : recoveryMode
                        ? 'Resetting password…'
                        : 'Signing in…'
                    : bootstrapMode
                      ? 'Create Super Admin'
                      : recoveryMode
                        ? 'Reset Super Admin password'
                        : 'Sign in securely'}
                </span>
                {!isSubmitting && <ArrowRight className="h-4 w-4" />}
              </button>
            </form>

            {utilityMode && (
              <button
                type="button"
                onClick={() => {
                  setBootstrapMode(false);
                  setRecoveryMode(false);
                  setBootstrapToken('');
                  setPassword('');
                  setError(null);
                  setNotice(null);
                  router.replace('/admin/login');
                }}
                className="mt-4 w-full rounded-lg py-2 text-xs font-medium text-[#77716B] underline underline-offset-4 transition hover:text-[#111111]"
              >
                Return to staff sign-in
              </button>
            )}

            <div className="mt-8 border-t border-[#EEEAE5] pt-5">
              <p className="flex items-center justify-center gap-2 text-xs font-medium text-[#6E6A65]">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                Great Homes staff workspace
              </p>
              <p className="mt-2 text-center text-[11px] text-[#A09B94]">
                © Great Homes Internal Operations System
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
