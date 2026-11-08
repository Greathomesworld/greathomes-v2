'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Calendar,
  Clock,
  MapPin,
  ShieldCheck,
  AlertCircle,
  Loader2,
  X,
  RefreshCw,
  Ban,
  Building2,
  CheckCircle2,
} from 'lucide-react';
import { CustomerSiteVisitDTO } from '@/src/domain/siteVisit/dto/siteVisitDto';

export default function CustomerSiteVisitsView() {
  const [visits, setVisits] = useState<CustomerSiteVisitDTO[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Reschedule Modal state
  const [rescheduleVisit, setRescheduleVisit] = useState<CustomerSiteVisitDTO | null>(null);
  const [newDate, setNewDate] = useState('');
  const [newTimeWindow, setNewTimeWindow] = useState('12:00–15:00');
  const [rescheduleReason, setRescheduleReason] = useState('');
  const [isRescheduling, setIsRescheduling] = useState(false);

  // Cancel Modal state
  const [cancelVisit, setCancelVisit] = useState<CustomerSiteVisitDTO | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);

  const fetchVisits = async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/customer/site-visits');
      if (!res.ok) {
        if (res.status === 401) {
          setError('Please sign in to view your scheduled site visits.');
          return;
        }
        throw new Error('Failed to load site visits');
      }
      const data = await res.json();
      setVisits(data.items || []);
    } catch (err: any) {
      setError(err.message || 'Error loading site visits');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchVisits();
  }, []);

  const handleRescheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rescheduleVisit || !newDate || !newTimeWindow) return;

    setIsRescheduling(true);
    try {
      const res = await fetch(`/api/customer/site-visits/${rescheduleVisit.id}/reschedule`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          preferredDate: newDate,
          preferredTimeWindow: newTimeWindow,
          reason: rescheduleReason.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to request reschedule');
      }

      setRescheduleVisit(null);
      await fetchVisits();
    } catch (err: any) {
      alert(err.message || 'Error submitting reschedule request.');
    } finally {
      setIsRescheduling(false);
    }
  };

  const handleCancelSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancelVisit) return;

    setIsCancelling(true);
    try {
      const res = await fetch(`/api/customer/site-visits/${cancelVisit.id}/cancel`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: cancelReason.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to cancel site visit');
      }

      setCancelVisit(null);
      await fetchVisits();
    } catch (err: any) {
      alert(err.message || 'Error cancelling site visit.');
    } finally {
      setIsCancelling(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--color-border)] pb-5">
        <div>
          <h1 className="text-2xl font-serif font-bold text-[#111111]">My Site Visits</h1>
          <p className="text-xs font-body text-[#111111]/60 mt-1">
            Manage your assisted property viewing appointments and schedule changes.
          </p>
        </div>

        <Link
          href="/account/enquiries"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#FAFAF8] border border-[var(--color-border)] hover:border-[#111111] text-xs font-display font-semibold text-[#111111] transition-colors"
        >
          <span>View All Enquiries</span>
        </Link>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="py-16 text-center space-y-3">
          <Loader2 className="w-6 h-6 animate-spin text-[#E85D3F] mx-auto" />
          <p className="text-xs font-display text-[#111111]/60">Loading your site visits...</p>
        </div>
      )}

      {/* Error state */}
      {error && !isLoading && (
        <div className="p-5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 space-y-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <span className="font-display font-semibold text-sm">{error}</span>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && visits.length === 0 && (
        <div className="py-16 px-6 text-center rounded-2xl bg-[#FAFAF8] border border-[var(--color-border)] space-y-4 max-w-md mx-auto">
          <div className="w-12 h-12 rounded-full bg-[#111111]/5 flex items-center justify-center mx-auto text-[#111111]/50">
            <Calendar className="w-6 h-6 text-[#E85D3F]" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-serif font-bold text-[#111111]">No Site Visits Scheduled</h3>
            <p className="text-xs font-body text-[#111111]/60">
              When you request a site visit while enquiring about a property, your inspection appointments will be listed here.
            </p>
          </div>
          <Link
            href="/search"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#111111] hover:bg-black text-white text-xs font-display font-semibold transition-colors"
          >
            <span>Browse Properties</span>
          </Link>
        </div>
      )}

      {/* List */}
      {!isLoading && !error && visits.length > 0 && (
        <div className="space-y-4">
          {visits.map((visit) => (
            <div
              key={visit.id}
              className="p-5 rounded-2xl bg-white border border-[var(--color-border)] shadow-2xs space-y-4"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--color-border)]/60 pb-3">
                <div className="space-y-0.5">
                  <span className="text-[11px] font-display font-bold uppercase tracking-wider text-[#E85D3F]">
                    {visit.referenceNumber}
                  </span>
                  <h3 className="text-base font-serif font-bold text-[#111111]">
                    {visit.propertyName || 'Property Inspection Visit'}
                  </h3>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-display font-semibold border ${
                      visit.status === 'CONFIRMED'
                        ? 'bg-[#218C5A]/10 text-[#218C5A] border-[#218C5A]/20'
                        : visit.status === 'CANCELLED'
                        ? 'bg-red-50 text-red-700 border-red-200'
                        : 'bg-amber-50 text-amber-800 border-amber-200'
                    }`}
                  >
                    {visit.statusLabel}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs font-body text-[#111111]/80">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-[#E85D3F] shrink-0" />
                  <div>
                    <span className="text-[10px] font-display uppercase tracking-wider text-[#111111]/40 block">
                      Preferred Date
                    </span>
                    <span className="font-semibold text-[#111111]">{visit.preferredDate}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-[#218C5A] shrink-0" />
                  <div>
                    <span className="text-[10px] font-display uppercase tracking-wider text-[#111111]/40 block">
                      Time Window
                    </span>
                    <span className="font-semibold text-[#111111]">{visit.preferredTimeWindow}</span>
                  </div>
                </div>

                <div>
                  <span className="text-[10px] font-display uppercase tracking-wider text-[#111111]/40 block">
                    Mode
                  </span>
                  <span className="font-semibold text-[#111111]">{visit.visitType}</span>
                </div>
              </div>

              {visit.buyerNote && (
                <div className="p-3 rounded-xl bg-[#FAFAF8] text-xs font-body text-[#111111]/70 border border-[var(--color-border)]/60">
                  <strong className="font-display font-semibold text-[#111111] block mb-0.5">Your Note:</strong>
                  <span>{visit.buyerNote}</span>
                </div>
              )}

              {/* Status explanation & Actions */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-[var(--color-border)]/60">
                <p className="text-xs text-[#111111]/60 font-body flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#218C5A] shrink-0" />
                  {visit.status === 'REQUESTED' && <span>Request received — Great Homes advisor will confirm slot.</span>}
                  {visit.status === 'CONFIRMED' && <span>Site visit confirmed! Great Homes team will host your viewing.</span>}
                  {visit.status === 'RESCHEDULE_REQUESTED' && <span>Reschedule requested — awaiting confirmation.</span>}
                  {visit.status === 'COMPLETED' && <span>Site visit completed.</span>}
                  {visit.status === 'CANCELLED' && <span>Site visit cancelled.</span>}
                </p>

                {visit.status !== 'CANCELLED' && visit.status !== 'COMPLETED' && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setRescheduleVisit(visit);
                        setNewDate(visit.preferredDate);
                        setNewTimeWindow(visit.preferredTimeWindow);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-white border border-[var(--color-border)] hover:border-[#111111] text-xs font-display font-semibold text-[#111111] flex items-center gap-1 transition-colors"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Reschedule</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setCancelVisit(visit)}
                      className="px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 text-xs font-display font-semibold flex items-center gap-1 transition-colors"
                    >
                      <Ban className="w-3.5 h-3.5" />
                      <span>Cancel</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Reschedule Modal */}
      {rescheduleVisit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 border border-[var(--color-border)] shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-3">
              <h3 className="text-base font-serif font-bold text-[#111111]">Request Reschedule</h3>
              <button
                type="button"
                onClick={() => setRescheduleVisit(null)}
                className="p-1 rounded-lg text-[#111111]/50 hover:bg-black/5"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleRescheduleSubmit} className="space-y-3 text-left">
              <div className="space-y-1">
                <label className="text-xs font-display font-semibold text-[#111111] block">New Preferred Date</label>
                <input
                  type="date"
                  required
                  value={newDate}
                  min={new Date().toISOString().split('T')[0]}
                  onChange={(e) => setNewDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[var(--color-border)] text-xs font-body text-[#111111]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-display font-semibold text-[#111111] block">New Time Window</label>
                <select
                  value={newTimeWindow}
                  onChange={(e) => setNewTimeWindow(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[var(--color-border)] text-xs font-body text-[#111111]"
                >
                  <option value="09:00–12:00">Morning (09:00 AM – 12:00 PM)</option>
                  <option value="12:00–15:00">Afternoon (12:00 PM – 03:00 PM)</option>
                  <option value="15:00–18:00">Late Afternoon (03:00 PM – 06:00 PM)</option>
                  <option value="18:00–20:00">Evening (06:00 PM – 08:00 PM)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-display font-semibold text-[#111111] block">Reason for Reschedule</label>
                <input
                  type="text"
                  placeholder="e.g. Schedule clash..."
                  value={rescheduleReason}
                  onChange={(e) => setRescheduleReason(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-white border border-[var(--color-border)] text-xs font-body text-[#111111]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRescheduleVisit(null)}
                  className="px-4 py-2 rounded-xl border border-[var(--color-border)] text-xs font-display font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isRescheduling}
                  className="px-5 py-2 rounded-xl bg-[#111111] hover:bg-black text-white text-xs font-display font-semibold"
                >
                  {isRescheduling ? 'Requesting...' : 'Confirm Reschedule Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Cancel Modal */}
      {cancelVisit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 border border-[var(--color-border)] shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-3">
              <h3 className="text-base font-serif font-bold text-[#111111]">Cancel Site Visit</h3>
              <button
                type="button"
                onClick={() => setCancelVisit(null)}
                className="p-1 rounded-lg text-[#111111]/50 hover:bg-black/5"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCancelSubmit} className="space-y-3 text-left">
              <p className="text-xs font-body text-[#111111]/70">
                Are you sure you want to cancel your site visit for <strong className="text-[#111111]">{cancelVisit.propertyName || cancelVisit.referenceNumber}</strong>?
              </p>

              <div className="space-y-1">
                <label className="text-xs font-display font-semibold text-[#111111] block">Cancellation Reason (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Changed plans..."
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-white border border-[var(--color-border)] text-xs font-body text-[#111111]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCancelVisit(null)}
                  className="px-4 py-2 rounded-xl border border-[var(--color-border)] text-xs font-display font-semibold"
                >
                  Keep Visit
                </button>
                <button
                  type="submit"
                  disabled={isCancelling}
                  className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-display font-semibold"
                >
                  {isCancelling ? 'Cancelling...' : 'Confirm Cancellation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
