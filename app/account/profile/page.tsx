'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Check, Loader2, Building2, UserCheck, AlertCircle } from 'lucide-react';
import { useCustomerAuth } from '@/src/components/customer/CustomerAuthContext';

const PARTNER_DECLARATION =
  'I confirm that this account is the sole Great Homes Listing Partner login for my agency, all agency details provided are genuine and verifiable, and I will obtain explicit owner consent before submitting any property.';

export default function ProfilePage() {
  const { customer, refresh } = useCustomerAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [partnerDetail, setPartnerDetail] = useState<any>(null);
  const [partnerLoading, setPartnerLoading] = useState(false);

  const [completionType, setCompletionType] = useState<'OWNER' | 'LISTING_PARTNER'>('OWNER');
  const [agencyName, setAgencyName] = useState('');
  const [businessAddress, setBusinessAddress] = useState('');
  const [locality, setLocality] = useState('');
  const [city, setCity] = useState('Kolkata');
  const [agencyContactPhone, setAgencyContactPhone] = useState('');
  const [declarationAccepted, setDeclarationAccepted] = useState(false);
  const [partnerSubmitting, setPartnerSubmitting] = useState(false);
  const [partnerMessage, setPartnerMessage] = useState<string | null>(null);

  const loadPartnerDetail = useCallback(async () => {
    setPartnerLoading(true);
    try {
      const res = await fetch('/api/customer/partner-status', { cache: 'no-store' });
      const data = await res.json();
      if (res.ok && data.success) {
        setPartnerDetail(data);
        if (data.profile) {
          setAgencyName(data.profile.agencyName || '');
          setBusinessAddress(data.profile.businessAddress || '');
          setLocality(data.profile.locality || '');
          setCity(data.profile.city || 'Kolkata');
          setAgencyContactPhone(data.profile.agencyContactPhone || '');
        }
      }
    } catch {
      // Non-blocking
    } finally {
      setPartnerLoading(false);
    }
  }, []);

  useEffect(() => {
    if (customer) {
      setName(customer.name || '');
      setEmail(customer.email || '');
      setPhone(customer.phone || '');
      setAgencyContactPhone((prev) => prev || customer.phone || '');
      if (customer.accountType === 'LISTING_PARTNER') {
        loadPartnerDetail();
      }
    }
  }, [customer, loadPartnerDetail]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    setSuccess(false);

    try {
      if (!name.trim()) throw new Error('Name cannot be empty.');

      const res = await fetch('/api/customer/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim() || null,
          phone: phone ? phone.trim() : null,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to update profile');
      }

      await refresh();
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message || 'Error updating profile');
    } finally {
      setSaving(false);
    }
  };

  const handleAccountTypeAction = async (e: React.FormEvent, mode: 'COMPLETE' | 'RESUBMIT') => {
    e.preventDefault();
    setError(null);
    setPartnerMessage(null);
    setPartnerSubmitting(true);
    try {
      const res = await fetch('/api/customer/account-type', {
        method: mode === 'COMPLETE' ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          mode === 'COMPLETE'
            ? {
                accountType: completionType,
                ...(completionType === 'LISTING_PARTNER'
                  ? {
                      agencyName,
                      businessAddress,
                      locality,
                      city,
                      agencyContactPhone: agencyContactPhone || customer?.phone,
                      declarationAccepted,
                    }
                  : {}),
              }
            : {
                agencyName,
                businessAddress,
                locality,
                city,
                agencyContactPhone: agencyContactPhone || customer?.phone,
                declarationAccepted,
              }
        ),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to submit partner information.');
      }
      await refresh();
      await loadPartnerDetail();
      setPartnerMessage(
        mode === 'RESUBMIT'
          ? 'Partner application updated and resubmitted for verification.'
          : 'Account type saved successfully.'
      );
    } catch (err: any) {
      setError(err.message || 'Unable to save account type.');
    } finally {
      setPartnerSubmitting(false);
    }
  };

  if (!customer) return null;

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h2 className="text-xl font-serif text-slate-900">Account &amp; Profile Settings</h2>
        <p className="text-xs text-slate-500 font-body mt-0.5">
          Manage your Great Homes account identity, optional email, and Owner or Listing Partner status.
        </p>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-sm font-body rounded-md">
          {error}
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-body rounded-md flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-600" />
          <span>Profile updated successfully.</span>
        </div>
      )}

      {partnerMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-body rounded-md flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-600" />
          <span>{partnerMessage}</span>
        </div>
      )}

      {/* Account Type & Partner Status Card */}
      <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-xs space-y-4 font-body">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            {customer.accountType === 'LISTING_PARTNER' ? (
              <Building2 className="w-5 h-5 text-slate-800" />
            ) : (
              <UserCheck className="w-5 h-5 text-slate-800" />
            )}
            <div>
              <h3 className="text-sm font-semibold text-slate-900 font-display">
                Account Type:{' '}
                {customer.accountType === 'LISTING_PARTNER'
                  ? 'Listing Partner Agency'
                  : customer.accountType === 'OWNER'
                    ? 'Property Owner / Buyer'
                    : 'Not Selected Yet'}
              </h3>
              <p className="text-xs text-slate-500">
                {customer.accountType
                  ? 'Account types are permanently locked to preserve verification integrity.'
                  : 'Choose whether this login belongs to a Property Owner or a Listing Partner agency.'}
              </p>
            </div>
          </div>

          {customer.accountType === 'LISTING_PARTNER' && (
            <span className="text-xs font-semibold px-2.5 py-1 rounded bg-slate-100 text-slate-800 border border-slate-200 font-display">
              Partner Status: {partnerDetail?.status || customer.partnerStatus || 'PENDING'}
            </span>
          )}
        </div>

        {customer.accountType === null && (
          <form
            onSubmit={(e) => handleAccountTypeAction(e, 'COMPLETE')}
            className="pt-4 border-t border-slate-100 space-y-4"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setCompletionType('OWNER')}
                className={`p-3 rounded-md border text-left text-xs cursor-pointer ${
                  completionType === 'OWNER'
                    ? 'border-slate-900 bg-slate-50 font-semibold'
                    : 'border-slate-200'
                }`}
              >
                <div className="text-slate-900">Property Owner / Buyer</div>
                <div className="text-slate-500 mt-0.5 font-normal">
                  Submit your own residential properties
                </div>
              </button>
              <button
                type="button"
                onClick={() => setCompletionType('LISTING_PARTNER')}
                className={`p-3 rounded-md border text-left text-xs cursor-pointer ${
                  completionType === 'LISTING_PARTNER'
                    ? 'border-slate-900 bg-slate-50 font-semibold'
                    : 'border-slate-200'
                }`}
              >
                <div className="text-slate-900">Listing Partner</div>
                <div className="text-slate-500 mt-0.5 font-normal">
                  One login per real estate agency
                </div>
              </button>
            </div>

            {completionType === 'LISTING_PARTNER' && (
              <div className="space-y-3 bg-slate-50 p-4 rounded-md border border-slate-200">
                <input
                  type="text"
                  required
                  value={agencyName}
                  onChange={(e) => setAgencyName(e.target.value)}
                  placeholder="Agency Name *"
                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm bg-white"
                />
                <input
                  type="text"
                  required
                  value={businessAddress}
                  onChange={(e) => setBusinessAddress(e.target.value)}
                  placeholder="Business Address *"
                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm bg-white"
                />
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="text"
                    required
                    value={locality}
                    onChange={(e) => setLocality(e.target.value)}
                    placeholder="Locality *"
                    className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm bg-white"
                  />
                  <input
                    type="text"
                    required
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="City *"
                    className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm bg-white"
                  />
                </div>
                <input
                  type="tel"
                  required
                  value={agencyContactPhone}
                  onChange={(e) => setAgencyContactPhone(e.target.value)}
                  placeholder="Agency Contact Mobile *"
                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm bg-white"
                />
                <label className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    required
                    checked={declarationAccepted}
                    onChange={(e) => setDeclarationAccepted(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>{PARTNER_DECLARATION}</span>
                </label>
              </div>
            )}

            <button
              type="submit"
              disabled={partnerSubmitting}
              className="px-4 py-2 bg-slate-900 text-white text-xs font-semibold rounded-md hover:bg-slate-800 cursor-pointer"
            >
              {partnerSubmitting ? 'Saving...' : 'Confirm Account Type'}
            </button>
          </form>
        )}

        {customer.accountType === 'LISTING_PARTNER' && partnerLoading && (
          <p className="text-xs text-slate-500">Loading agency verification details...</p>
        )}

        {customer.accountType === 'LISTING_PARTNER' && partnerDetail?.profile && (
          <div className="pt-3 border-t border-slate-100 space-y-3 text-xs text-slate-700">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <span className="text-slate-500">Agency:</span>{' '}
                <strong className="text-slate-900">{partnerDetail.profile.agencyName}</strong>
              </div>
              <div>
                <span className="text-slate-500">Agency Phone:</span>{' '}
                <strong className="text-slate-900">
                  {partnerDetail.profile.agencyContactPhone}
                </strong>
              </div>
              <div className="sm:col-span-2">
                <span className="text-slate-500">Address:</span>{' '}
                {partnerDetail.profile.businessAddress}, {partnerDetail.profile.locality},{' '}
                {partnerDetail.profile.city}
              </div>
            </div>

            {partnerDetail.message && (
              <div className="flex items-start gap-2 rounded-md bg-slate-50 border border-slate-200 p-3 text-xs text-slate-800">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>{partnerDetail.message}</span>
              </div>
            )}

            {partnerDetail.status === 'REJECTED' && (
              <form
                onSubmit={(e) => handleAccountTypeAction(e, 'RESUBMIT')}
                className="space-y-3 bg-amber-50/50 p-4 rounded-md border border-amber-200"
              >
                <div className="font-semibold text-slate-900">
                  Update &amp; Resubmit Partner Application
                </div>
                <input
                  type="text"
                  required
                  value={agencyName}
                  onChange={(e) => setAgencyName(e.target.value)}
                  placeholder="Agency Name *"
                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm bg-white"
                />
                <input
                  type="text"
                  required
                  value={businessAddress}
                  onChange={(e) => setBusinessAddress(e.target.value)}
                  placeholder="Business Address *"
                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm bg-white"
                />
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="text"
                    required
                    value={locality}
                    onChange={(e) => setLocality(e.target.value)}
                    placeholder="Locality *"
                    className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm bg-white"
                  />
                  <input
                    type="text"
                    required
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="City *"
                    className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm bg-white"
                  />
                </div>
                <input
                  type="tel"
                  required
                  value={agencyContactPhone}
                  onChange={(e) => setAgencyContactPhone(e.target.value)}
                  placeholder="Agency Contact Mobile *"
                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm bg-white"
                />
                <label className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    required
                    checked={declarationAccepted}
                    onChange={(e) => setDeclarationAccepted(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>{PARTNER_DECLARATION}</span>
                </label>
                <button
                  type="submit"
                  disabled={partnerSubmitting}
                  className="px-4 py-2 bg-slate-900 text-white text-xs font-semibold rounded-md hover:bg-slate-800 cursor-pointer"
                >
                  {partnerSubmitting ? 'Submitting...' : 'Resubmit Partner Application'}
                </button>
              </form>
            )}
          </div>
        )}
      </div>

      {/* Standard Contact Form */}
      <form
        onSubmit={handleSubmit}
        className="space-y-6 bg-white border border-slate-200 rounded-lg p-6 sm:p-8 shadow-xs font-body"
      >
        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1 font-display">
            Full Name *
          </label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1 font-display">
            Email Address (Optional)
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com (optional)"
            className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
          />
          <p className="text-[11px] text-slate-400 mt-1">
            Used for status notifications when configured. Leave blank if you prefer mobile-only updates.
          </p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1 font-display">
            Verified Mobile Number
          </label>
          <input
            type="tel"
            disabled
            value={phone}
            placeholder="+91 98300 12345"
            className="w-full px-3 py-2 border border-slate-200 bg-slate-50 rounded-md text-sm text-slate-500 cursor-not-allowed"
          />
          <p className="text-[11px] text-slate-400 mt-1">
            Your mobile number is OTP-verified and serves as your primary login identifier.
          </p>
        </div>

        <div className="pt-4 border-t border-slate-100 flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-md transition-colors flex items-center gap-2 font-display cursor-pointer"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <span>Save Changes</span>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
