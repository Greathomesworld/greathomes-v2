'use client';

import React, { useState } from 'react';
import { X, CheckCircle, ShieldCheck } from 'lucide-react';
import { LocationComparisonItemDTO } from '@/src/domain/locationComparison';

interface ComparisonEnquiryModalProps {
  locations: LocationComparisonItemDTO[];
  isOpen: boolean;
  onClose: () => void;
}

export function ComparisonEnquiryModal({
  locations,
  isOpen,
  onClose,
}: ComparisonEnquiryModalProps) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      setError('Please provide a valid 10-digit phone number.');
      return;
    }
    if (!name.trim()) {
      setError('Please provide your name.');
      return;
    }

    try {
      setSubmitting(true);
      const res = await fetch('/api/enquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contextType: 'GENERAL',
          name: name.trim(),
          phone: cleanPhone,
          email: email.trim() || undefined,
          message: `Location Comparison Assistance for [${locations.map((l) => l.name).join(' vs ')}]. Buyer Notes: ${notes.trim() || 'No specific notes'}`,
          sourcePage: typeof window !== 'undefined' ? window.location.pathname + window.location.search : '/compare/locations',
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setSuccess(true);
      } else {
        setError(data.error || 'Failed to submit enquiry. Please try again.');
      }
    } catch (err: any) {
      setError(err.message || 'Network error occurred. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="comparison-enquiry-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
    >
      <div className="relative w-full max-w-lg bg-white dark:bg-stone-900 rounded-lg shadow-xl border border-stone-200 dark:border-stone-800 overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-stone-200 dark:border-stone-800 bg-[#FAFAF8] dark:bg-stone-950">
          <div>
            <span className="text-[11px] font-mono uppercase tracking-wider text-stone-500 dark:text-stone-400">
              Great Homes Advisory
            </span>
            <h2
              id="comparison-enquiry-title"
              className="text-xl font-display font-bold text-[#111111] dark:text-stone-100 tracking-tight mt-0.5"
            >
              Get Assistance Comparing These Locations
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 p-2 rounded transition-colors touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center -mr-2 -mt-2"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {success ? (
            <div className="text-center py-6 space-y-3">
              <CheckCircle className="w-12 h-12 text-[#218C5A] mx-auto" />
              <h3 className="text-lg font-display font-bold text-[#111111] dark:text-stone-100">
                Assistance Request Received
              </h3>
              <p className="text-sm text-stone-600 dark:text-stone-400 font-body leading-relaxed max-w-sm mx-auto">
                A Great Homes property advisor will review verified telemetry for{' '}
                <span className="font-semibold text-stone-800 dark:text-stone-200">
                  {locations.map((l) => l.name).join(' and ')}
                </span>{' '}
                and reach out to assist your evaluation.
              </p>
              <div className="pt-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="py-2.5 px-6 rounded bg-[#111111] text-white dark:bg-stone-100 dark:text-stone-900 font-display text-sm font-medium touch-manipulation min-h-[44px]"
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="p-3 bg-stone-50 dark:bg-stone-950/60 rounded border border-stone-200 dark:border-stone-800 text-xs text-stone-600 dark:text-stone-400 font-body">
                Selected Locations:{' '}
                <span className="font-semibold text-stone-900 dark:text-stone-100">
                  {locations.map((l) => l.name).join(' vs ')}
                </span>
              </div>

              {error && (
                <div className="p-3 bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 rounded text-xs">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-stone-600 dark:text-stone-400 mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. S. Banerjee"
                  className="w-full px-3 py-2 text-sm rounded border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-950 focus:outline-hidden focus:ring-1 focus:ring-[#111111] dark:focus:ring-stone-100 min-h-[44px]"
                />
              </div>

              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-stone-600 dark:text-stone-400 mb-1">
                  Phone Number (10 digits) *
                </label>
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g. 9830012345"
                  className="w-full px-3 py-2 text-sm rounded border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-950 focus:outline-hidden focus:ring-1 focus:ring-[#111111] dark:focus:ring-stone-100 min-h-[44px]"
                />
              </div>

              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-stone-600 dark:text-stone-400 mb-1">
                  Email Address (Optional)
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. buyer@example.com"
                  className="w-full px-3 py-2 text-sm rounded border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-950 focus:outline-hidden focus:ring-1 focus:ring-[#111111] dark:focus:ring-stone-100 min-h-[44px]"
                />
              </div>

              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-stone-600 dark:text-stone-400 mb-1">
                  Specific Questions or Context
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Looking for a 3 BHK near metro connectivity under ₹1.2 Cr..."
                  className="w-full px-3 py-2 text-sm rounded border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-950 focus:outline-hidden focus:ring-1 focus:ring-[#111111] dark:focus:ring-stone-100"
                />
              </div>

              <div className="pt-2 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-[11px] text-stone-500 dark:text-stone-400">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#218C5A]" />
                  <span>Direct to Great Homes. Zero broker spam.</span>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="py-2.5 px-5 rounded bg-[#111111] text-white dark:bg-stone-100 dark:text-stone-900 font-display text-sm font-medium hover:bg-stone-800 transition-colors disabled:opacity-60 touch-manipulation min-h-[44px]"
                >
                  {submitting ? 'Submitting...' : 'Request Assistance'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
