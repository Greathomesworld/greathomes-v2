'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Building2,
  Calendar,
  MessageSquare,
  Clock,
  ShieldCheck,
  ArrowRight,
  Loader2,
  AlertCircle,
  Search,
  Filter,
} from 'lucide-react';
import { CustomerEnquiryDto } from '@/src/domain/enquiry/dto/enquiryDto';

export default function CustomerEnquiriesView() {
  const [enquiries, setEnquiries] = useState<CustomerEnquiryDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchEnquiries() {
      try {
        setIsLoading(true);
        const res = await fetch('/api/customer/enquiries');
        if (!res.ok) {
          if (res.status === 401) {
            setError('Please sign in to view your submitted enquiries.');
            return;
          }
          throw new Error('Failed to load enquiries');
        }
        const data = await res.json();
        setEnquiries(data.items || []);
      } catch (err: any) {
        setError(err.message || 'Error loading enquiries');
      } finally {
        setIsLoading(false);
      }
    }

    fetchEnquiries();
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--color-border)] pb-5">
        <div>
          <h1 className="text-2xl font-serif font-bold text-[#111111]">My Enquiries</h1>
          <p className="text-xs font-body text-[#111111]/60 mt-1">
            Track your submitted property advisory requests and assistance status.
          </p>
        </div>

        <Link
          href="/account/site-visits"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#FAFAF8] border border-[var(--color-border)] hover:border-[#111111] text-xs font-display font-semibold text-[#111111] transition-colors"
        >
          <Calendar className="w-3.5 h-3.5 text-[#E85D3F]" />
          <span>View My Site Visits</span>
          <ArrowRight className="w-3.5 h-3.5 ml-1" />
        </Link>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="py-16 text-center space-y-3">
          <Loader2 className="w-6 h-6 animate-spin text-[#E85D3F] mx-auto" />
          <p className="text-xs font-display text-[#111111]/60">Loading your enquiries...</p>
        </div>
      )}

      {/* Error state */}
      {error && !isLoading && (
        <div className="p-5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 space-y-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <span className="font-display font-semibold text-sm">{error}</span>
          </div>
          <p className="text-xs font-body text-amber-800">
            Sign in to your Great Homes account or submit a new enquiry to view your status.
          </p>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && enquiries.length === 0 && (
        <div className="py-16 px-6 text-center rounded-2xl bg-[#FAFAF8] border border-[var(--color-border)] space-y-4 max-w-md mx-auto">
          <div className="w-12 h-12 rounded-full bg-[#111111]/5 flex items-center justify-center mx-auto text-[#111111]/50">
            <MessageSquare className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-serif font-bold text-[#111111]">No Enquiries Submitted Yet</h3>
            <p className="text-xs font-body text-[#111111]/60">
              When you enquire about a residential project, resale, or rental listing, your request details will appear here.
            </p>
          </div>
          <Link
            href="/search"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#111111] hover:bg-black text-white text-xs font-display font-semibold transition-colors"
          >
            <Search className="w-3.5 h-3.5" />
            <span>Explore Properties</span>
          </Link>
        </div>
      )}

      {/* List */}
      {!isLoading && !error && enquiries.length > 0 && (
        <div className="space-y-4">
          {enquiries.map((enq) => (
            <div
              key={enq.id}
              className="p-5 rounded-2xl bg-white border border-[var(--color-border)] shadow-2xs hover:border-[#111111]/30 transition-all space-y-4"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--color-border)]/60 pb-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-display font-bold uppercase tracking-wider text-[#E85D3F]">
                      {enq.referenceNumber}
                    </span>
                    <span className="text-[10px] font-display font-medium text-[#111111]/40">·</span>
                    <span className="text-[11px] font-display font-medium text-[#111111]/60">
                      {new Date(enq.createdAt).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                  </div>

                  <h3 className="text-base font-serif font-bold text-[#111111]">
                    {enq.propertyName || 'Residential Enquiry'}
                  </h3>
                </div>

                <div className="flex items-center gap-2">
                  <span className="px-3 py-1 rounded-full text-xs font-display font-semibold bg-[#218C5A]/10 text-[#218C5A] border border-[#218C5A]/20">
                    {enq.statusLabel}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-body text-[#111111]/80">
                <div>
                  <span className="text-[10px] font-display uppercase tracking-wider text-[#111111]/40 block">
                    Context
                  </span>
                  <span className="font-semibold text-[#111111]">{enq.contextType}</span>
                </div>

                {enq.priceDisplay && (
                  <div>
                    <span className="text-[10px] font-display uppercase tracking-wider text-[#111111]/40 block">
                      Price
                    </span>
                    <span className="font-semibold text-[#111111]">{enq.priceDisplay}</span>
                  </div>
                )}

                {enq.locationName && (
                  <div>
                    <span className="text-[10px] font-display uppercase tracking-wider text-[#111111]/40 block">
                      Location
                    </span>
                    <span className="font-semibold text-[#111111]">{enq.locationName}</span>
                  </div>
                )}

                <div>
                  <span className="text-[10px] font-display uppercase tracking-wider text-[#111111]/40 block">
                    Assistance
                  </span>
                  <span className="font-semibold text-[#218C5A] flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                    <span>Great Homes Advisory</span>
                  </span>
                </div>
              </div>

              {enq.message && (
                <div className="p-3 rounded-xl bg-[#FAFAF8] text-xs font-body text-[#111111]/70 border border-[var(--color-border)]/60">
                  <strong className="font-display font-semibold text-[#111111] block mb-0.5">Your Note:</strong>
                  <span>{enq.message}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
