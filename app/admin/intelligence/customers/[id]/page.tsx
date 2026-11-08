'use client';

import React, { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AdminPageHeader } from '@/src/components/admin/AdminPageHeader';
import { AdminLoadingState } from '@/src/components/admin/AdminLoadingState';
import { AdminErrorState } from '@/src/components/admin/AdminErrorState';
import { getAdminHeaders } from '@/src/lib/adminAuth';
import type { Customer360ProfileDto } from '@/src/domain/visitorIntelligence/entities';
import {
  ArrowLeft,
  ArrowUpRight,
  Phone,
  Mail,
  ShieldCheck,
  Clock,
  Eye,
  Bookmark,
  MapPin,
  Building2,
  MessageSquare,
  Calendar,
  Activity,
  Lock,
  AlertTriangle,
  Sparkles,
  Scale,
  Smartphone,
} from 'lucide-react';

function formatIndianPrice(amount?: number | null): string {
  if (!amount || isNaN(amount)) return '—';
  if (amount >= 10_000_000) {
    return `₹${(amount / 10_000_000).toFixed(2).replace(/\.00$/, '')} Cr`;
  }
  if (amount >= 100_000) {
    return `₹${(amount / 100_000).toFixed(1).replace(/\.0$/, '')} L`;
  }
  return `₹${amount.toLocaleString('en-IN')}`;
}

export default function AdminCustomer360DetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [profile, setProfile] = useState<Customer360ProfileDto | null>(null);
  const [timelineCategory, setTimelineCategory] = useState<string>('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(
        `/api/admin/customer-intelligence/customers/${id}?category=${encodeURIComponent(
          timelineCategory
        )}`,
        {
          headers: getAdminHeaders(),
        }
      );

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Customer 360 profile not found');
      }

      const json = await res.json();
      setProfile(json.data);
    } catch (err: any) {
      setError(err.message || 'Failed to load Customer 360 profile');
    } finally {
      setLoading(false);
    }
  }, [id, timelineCategory]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  if (loading && !profile) {
    return <AdminLoadingState message="Loading Customer 360 Profile & Behavioral Timeline..." />;
  }

  if (error || !profile) {
    return (
      <AdminErrorState
        title="Customer 360 Unavailable"
        error={error || 'Customer not found'}
        onRetry={loadProfile}
      />
    );
  }

  const { customer, summaryCounts, attribution, intent } = profile;

  return (
    <div className="space-y-6 pb-20">
      <AdminPageHeader
        title={customer.name}
        description={`OTP-Authenticated Customer 360 Profile · ID: ${customer.id}`}
        breadcrumbs={[
          { label: 'Admin', href: '/admin' },
          { label: 'Visitor & Customer 360', href: '/admin/intelligence/customers' },
          { label: customer.name },
        ]}
        secondaryActions={[
          {
            label: 'Back to Directory',
            href: '/admin/intelligence/customers',
            icon: <ArrowLeft className="w-3.5 h-3.5" />,
          },
        ]}
      />
      {customer.piiRedacted && (
        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs font-display font-medium">
          <Lock className="w-3.5 h-3.5" />
          PII Redacted for Role
        </div>
      )}

      {/* Customer Identity & Summary Strip */}
      <div className="bg-white rounded-xl border border-neutral-200 p-6 shadow-xs space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-neutral-100 pb-5">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-display font-semibold">
                <ShieldCheck className="w-3.5 h-3.5" />
                OTP-Verified Account ({customer.status})
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs font-mono text-neutral-700 bg-neutral-100 px-2.5 py-1 rounded-md">
                <Phone className="w-3.5 h-3.5 text-neutral-500" />
                {customer.phone || 'No mobile'}
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs text-neutral-700 bg-neutral-100 px-2.5 py-1 rounded-md">
                <Mail className="w-3.5 h-3.5 text-neutral-500" />
                {customer.email}
              </span>
            </div>
            <div className="text-xs text-neutral-500 flex flex-wrap items-center gap-4 pt-1">
              <span>
                First seen:{' '}
                <strong className="text-neutral-700">
                  {new Date(attribution.firstTouch.firstSeenAt).toLocaleString('en-IN')}
                </strong>
              </span>
              <span>·</span>
              <span>
                Last active:{' '}
                <strong className="text-neutral-700">
                  {new Date(customer.lastActiveAt).toLocaleString('en-IN')}
                </strong>
              </span>
              <span>·</span>
              <span>
                First-touch source:{' '}
                <strong className="font-mono text-neutral-800">
                  {attribution.firstTouch.utmSource || 'direct'} /{' '}
                  {attribution.firstTouch.utmMedium || 'none'}
                </strong>
              </span>
            </div>
          </div>

          {/* Evidence-Based Signals */}
          <div className="flex flex-wrap gap-1.5 max-w-xl">
            {intent.evidenceIndicators.map((ind, idx) => (
              <div
                key={idx}
                className={`px-3 py-1.5 rounded-lg text-xs font-display ${
                  ind.tone === 'emerald'
                    ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                    : ind.tone === 'amber'
                    ? 'bg-amber-50 text-amber-900 border border-amber-200'
                    : 'bg-neutral-100 text-neutral-800 border border-neutral-200'
                }`}
              >
                <div className="font-bold">{ind.label}</div>
                <div className="text-[11px] opacity-80 font-body">{ind.detail}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Summary Counters */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          <div className="p-3 rounded-lg bg-neutral-50 border border-neutral-200">
            <div className="text-[10px] font-display font-semibold uppercase text-neutral-500">
              Sessions
            </div>
            <div className="text-lg font-display font-bold text-neutral-900">
              {summaryCounts.sessions}
            </div>
          </div>
          <div className="p-3 rounded-lg bg-neutral-50 border border-neutral-200">
            <div className="text-[10px] font-display font-semibold uppercase text-neutral-500">
              Property Views
            </div>
            <div className="text-lg font-display font-bold text-neutral-900">
              {summaryCounts.propertyViews}
            </div>
          </div>
          <div className="p-3 rounded-lg bg-neutral-50 border border-neutral-200">
            <div className="text-[10px] font-display font-semibold uppercase text-neutral-500">
              Searches / Filters
            </div>
            <div className="text-lg font-display font-bold text-neutral-900">
              {summaryCounts.searchesAndFilters}
            </div>
          </div>
          <div className="p-3 rounded-lg bg-neutral-50 border border-neutral-200">
            <div className="text-[10px] font-display font-semibold uppercase text-neutral-500">
              Comparisons
            </div>
            <div className="text-lg font-display font-bold text-neutral-900">
              {summaryCounts.comparisons}
            </div>
          </div>
          <div className="p-3 rounded-lg bg-neutral-50 border border-neutral-200">
            <div className="text-[10px] font-display font-semibold uppercase text-neutral-500">
              Saved Homes
            </div>
            <div className="text-lg font-display font-bold text-amber-700">
              {summaryCounts.savedItems}
            </div>
          </div>
          <div className="p-3 rounded-lg bg-neutral-50 border border-neutral-200">
            <div className="text-[10px] font-display font-semibold uppercase text-neutral-500">
              Watched Items
            </div>
            <div className="text-lg font-display font-bold text-amber-700">
              {summaryCounts.watchedProjects + summaryCounts.watchedLocations}
            </div>
          </div>
          <div className="p-3 rounded-lg bg-emerald-50/70 border border-emerald-200">
            <div className="text-[10px] font-display font-semibold uppercase text-emerald-700">
              Verified Enquiries
            </div>
            <div className="text-lg font-display font-bold text-emerald-900">
              {summaryCounts.verifiedEnquiries}
            </div>
          </div>
          <div className="p-3 rounded-lg bg-emerald-50/70 border border-emerald-200">
            <div className="text-[10px] font-display font-semibold uppercase text-emerald-700">
              Site Visits
            </div>
            <div className="text-lg font-display font-bold text-emerald-900">
              {summaryCounts.siteVisits}
            </div>
          </div>
        </div>
      </div>

      {/* Explicit Choices vs Observed Behavioral Signals */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Card 1: Explicit Customer Choices */}
        <div className="bg-white rounded-xl border border-neutral-200 p-6 shadow-xs space-y-4">
          <div className="border-b border-neutral-100 pb-3">
            <h2 className="text-sm font-display font-bold text-neutral-900">
              Explicit Customer Choices (Declared Preferences & Shortlists)
            </h2>
            <p className="text-xs text-neutral-500">
              Directly configured by the customer in Preferences, Saved Homes, and Watchlists.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <div className="text-neutral-500 font-display font-semibold">Preferred Mode</div>
              <div className="font-bold text-neutral-900 mt-0.5">
                {intent.explicitChoices.preferredMode}
              </div>
            </div>
            <div>
              <div className="text-neutral-500 font-display font-semibold">Stated Budget Range</div>
              <div className="font-bold text-emerald-800 font-mono mt-0.5">
                {formatIndianPrice(intent.explicitChoices.budgetMin)} –{' '}
                {formatIndianPrice(intent.explicitChoices.budgetMax)}
              </div>
            </div>
            <div>
              <div className="text-neutral-500 font-display font-semibold">Preferred Localities</div>
              <div className="font-medium text-neutral-900 mt-0.5">
                {intent.explicitChoices.preferredLocations.length > 0
                  ? intent.explicitChoices.preferredLocations.join(', ')
                  : 'None explicitly saved'}
              </div>
            </div>
            <div>
              <div className="text-neutral-500 font-display font-semibold">Preferred BHK</div>
              <div className="font-medium text-neutral-900 mt-0.5">
                {intent.explicitChoices.preferredBhk.length > 0
                  ? intent.explicitChoices.preferredBhk.join(', ')
                  : 'None explicitly saved'}
              </div>
            </div>
            <div>
              <div className="text-neutral-500 font-display font-semibold">Watched Localities</div>
              <div className="font-medium text-neutral-900 mt-0.5">
                {intent.explicitChoices.watchedLocations.length > 0
                  ? intent.explicitChoices.watchedLocations.join(', ')
                  : 'None'}
              </div>
            </div>
            <div>
              <div className="text-neutral-500 font-display font-semibold">Watched Projects</div>
              <div className="font-medium text-neutral-900 mt-0.5">
                {intent.explicitChoices.watchedProjects.length > 0
                  ? intent.explicitChoices.watchedProjects.join(', ')
                  : 'None'}
              </div>
            </div>
          </div>
        </div>

        {/* Card 2: Observed Behavioral Signals & Area-Basis Separation */}
        <div className="bg-white rounded-xl border border-neutral-200 p-6 shadow-xs space-y-4">
          <div className="border-b border-neutral-100 pb-3">
            <h2 className="text-sm font-display font-bold text-neutral-900">
              Observed Discovery Signals (First-Party Browsing & Search Behavior)
            </h2>
            <p className="text-xs text-neutral-500">
              Derived from property views, search filters, and side-by-side comparisons. Area bases are strictly separated.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <div className="text-neutral-500 font-display font-semibold">
                Most Browsed Localities
              </div>
              <div className="mt-1 space-y-1">
                {intent.observedSignals.mostViewedLocations.length === 0 ? (
                  <span className="text-neutral-400">No locality views yet</span>
                ) : (
                  intent.observedSignals.mostViewedLocations.map((loc) => (
                    <div key={loc.name} className="flex items-center justify-between pr-4">
                      <span className="font-medium text-neutral-900">{loc.name}</span>
                      <span className="text-neutral-500">{loc.count}x</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div>
              <div className="text-neutral-500 font-display font-semibold">
                Most Searched / Viewed BHK
              </div>
              <div className="mt-1 space-y-1">
                {intent.observedSignals.mostSearchedBhk.length === 0 ? (
                  <span className="text-neutral-400">No BHK signals yet</span>
                ) : (
                  intent.observedSignals.mostSearchedBhk.map((b) => (
                    <div key={b.bhk} className="flex items-center justify-between pr-4">
                      <span className="font-medium text-neutral-900">{b.bhk}</span>
                      <span className="text-neutral-500">{b.count}x</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="col-span-2 pt-2 border-t border-neutral-100">
              <div className="text-neutral-500 font-display font-semibold mb-1.5">
                Observed Area-Basis Breakdown (Carpet vs Built-Up vs Super Built-Up Preserved Separately)
              </div>
              {intent.observedSignals.areaBasisBreakdown.length === 0 ? (
                <div className="text-neutral-400">No area-basis specific events recorded yet.</div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {intent.observedSignals.areaBasisBreakdown.map((ab) => (
                    <div
                      key={ab.areaBasis}
                      className="p-2.5 rounded-lg bg-neutral-50 border border-neutral-200"
                    >
                      <div className="font-mono text-[11px] font-bold text-neutral-900">
                        {ab.areaBasis.replace(/_/g, ' ')}
                      </div>
                      <div className="text-[11px] text-neutral-600 mt-0.5">
                        {ab.eventCount} event(s)
                        {ab.minSqft
                          ? ` · ${ab.minSqft}${
                              ab.maxSqft && ab.maxSqft !== ab.minSqft ? `–${ab.maxSqft}` : ''
                            } sq.ft.`
                          : ''}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {intent.observedSignals.repeatedPropertyViews.length > 0 && (
              <div className="col-span-2 pt-2 border-t border-neutral-100">
                <div className="text-neutral-500 font-display font-semibold mb-1.5">
                  Repeatedly Viewed Properties (High Interest)
                </div>
                <div className="flex flex-wrap gap-2">
                  {intent.observedSignals.repeatedPropertyViews.map((rv) => (
                    <span
                      key={`${rv.entityType}-${rv.entityId}`}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-50 border border-amber-200 text-amber-900 text-xs font-medium"
                    >
                      <span>{rv.title}</span>
                      <span className="px-1.5 py-0.5 rounded bg-white font-display font-bold text-[10px]">
                        {rv.viewCount} views
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Verified Enquiries, Phone-Matched Candidates, and Site Visits */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Enquiries Section */}
        <div className="bg-white rounded-xl border border-neutral-200 p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-display font-bold text-neutral-900 flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-neutral-600" />
              Verified Enquiries ({profile.verifiedEnquiries.length})
            </h2>
          </div>

          {profile.verifiedEnquiries.length === 0 ? (
            <p className="text-xs text-neutral-500 py-2">
              No verified enquiries submitted from this customer session yet.
            </p>
          ) : (
            <div className="space-y-3">
              {profile.verifiedEnquiries.map((enq) => (
                <div
                  key={enq.id}
                  className="p-4 rounded-xl border border-neutral-200 hover:border-neutral-300 transition-colors space-y-2 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-neutral-900">
                        {enq.referenceNumber}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] font-display font-semibold">
                        {enq.statusLabel}
                      </span>
                    </div>
                    <Link
                      href={`/admin/enquiries/${enq.id}`}
                      className="inline-flex items-center gap-1 text-neutral-900 font-display font-semibold hover:underline"
                    >
                      Open CRM Enquiry
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>

                  <div className="font-display font-semibold text-neutral-900">
                    {enq.propertyName}{' '}
                    {enq.configuration ? `· ${enq.configuration}` : ''}{' '}
                    {enq.priceDisplay ? `· ${enq.priceDisplay}` : ''}
                  </div>

                  <div className="text-[11px] text-neutral-500 flex flex-wrap items-center justify-between gap-2">
                    <span>{enq.associationReason}</span>
                    <span>{new Date(enq.createdAt).toLocaleString('en-IN')}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Phone-Matched Historical Candidates */}
          {profile.phoneMatchedEnquiryCandidates.length > 0 && (
            <div className="pt-4 border-t border-neutral-200 space-y-3">
              <div className="flex items-center gap-2 text-xs font-display font-bold text-amber-800">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                Phone-Matched Historical Enquiry Candidates (
                {profile.phoneMatchedEnquiryCandidates.length})
              </div>
              <p className="text-[11px] text-neutral-500">
                These historical enquiries share the same mobile number but were submitted without an authenticated session or linked visitor cookie. They are hidden from the customer’s self-service account until verified by staff.
              </p>
              {profile.phoneMatchedEnquiryCandidates.map((cand) => (
                <div
                  key={cand.id}
                  className="p-3.5 rounded-xl bg-amber-50/60 border border-amber-200 text-xs space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-amber-950">
                      {cand.referenceNumber} · {cand.propertyName}
                    </span>
                    <Link
                      href={`/admin/enquiries/${cand.id}`}
                      className="inline-flex items-center gap-1 text-amber-900 font-display font-semibold hover:underline"
                    >
                      Inspect Enquiry
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                  <div className="text-[11px] text-amber-800">{cand.associationReason}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Site Visits & Saved Homes */}
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-neutral-200 p-6 shadow-xs space-y-4">
            <h2 className="text-sm font-display font-bold text-neutral-900 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-neutral-600" />
              Scheduled & Requested Site Visits ({profile.siteVisits.length})
            </h2>
            {profile.siteVisits.length === 0 ? (
              <p className="text-xs text-neutral-500">No site visits requested yet.</p>
            ) : (
              <div className="space-y-3">
                {profile.siteVisits.map((sv) => (
                  <div
                    key={sv.id}
                    className="p-3.5 rounded-xl border border-neutral-200 text-xs space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-display font-bold text-neutral-900">
                        {sv.projectName} ({sv.visitType.replace('_', ' ')})
                      </span>
                      <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] font-display font-semibold">
                        {sv.status}
                      </span>
                    </div>
                    <div className="text-neutral-600">
                      Preferred: {sv.preferredDate} ({sv.preferredTimeWindow})
                      {sv.confirmedDate ? ` · Confirmed: ${sv.confirmedDate}` : ''}
                    </div>
                    {sv.assignedStaffName && (
                      <div className="text-[11px] text-neutral-500">
                        Advisor: {sv.assignedStaffName}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-neutral-200 p-6 shadow-xs space-y-4">
            <h2 className="text-sm font-display font-bold text-neutral-900 flex items-center gap-2">
              <Bookmark className="w-4 h-4 text-neutral-600" />
              Saved Homes & Recently Viewed ({profile.savedItems.length} saved ·{' '}
              {profile.recentlyViewed.length} viewed)
            </h2>
            <div className="space-y-2 text-xs">
              {profile.savedItems.map((s) => (
                <div
                  key={s.id}
                  className="p-2.5 rounded-lg bg-neutral-50 border border-neutral-200 flex items-center justify-between"
                >
                  <div>
                    <span className="px-1.5 py-0.5 rounded bg-neutral-900 text-white text-[10px] font-display mr-2">
                      SAVED
                    </span>
                    <span className="font-display font-semibold text-neutral-900">
                      {s.resource.title}
                    </span>
                  </div>
                  <span className="text-neutral-500 font-mono text-[11px]">
                    {s.resource.priceDisplay || ''}
                  </span>
                </div>
              ))}
              {profile.recentlyViewed.map((rv) => (
                <div
                  key={rv.id}
                  className="p-2.5 rounded-lg border border-neutral-100 flex items-center justify-between"
                >
                  <div>
                    <span className="font-medium text-neutral-800">{rv.resource.title}</span>
                    {rv.resource.locationName && (
                      <span className="text-neutral-400 ml-1.5">· {rv.resource.locationName}</span>
                    )}
                  </div>
                  <span className="px-2 py-0.5 rounded bg-neutral-100 font-display font-semibold text-[11px] text-neutral-700">
                    {rv.viewCount} view{rv.viewCount > 1 ? 's' : ''}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Unified Chronological Customer 360 Timeline */}
      <div className="bg-white rounded-xl border border-neutral-200 p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-neutral-100 pb-4">
          <div>
            <h2 className="text-base font-display font-bold text-neutral-900">
              Unified Customer 360 Activity Timeline ({profile.timeline.length})
            </h2>
            <p className="text-xs text-neutral-500">
              Combines pre-authentication anonymous visitor events, authenticated browsing, shortlists, enquiries, and site visits.
            </p>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {[
              { id: 'ALL', label: 'All Activity' },
              { id: 'PROPERTY_VIEWS', label: 'Property Views' },
              { id: 'SEARCH_FILTERS', label: 'Search & Filters' },
              { id: 'SHORTLIST_COMPARE', label: 'Saved & Compare' },
              { id: 'ENQUIRIES_VISITS', label: 'Enquiries & Visits' },
              { id: 'AUTH_SESSION', label: 'OTP & Account' },
            ].map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setTimelineCategory(cat.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-display font-semibold transition-colors cursor-pointer ${
                  timelineCategory === cat.id
                    ? 'bg-neutral-900 text-white'
                    : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {profile.timeline.length === 0 ? (
          <p className="text-xs text-neutral-500 py-8 text-center">
            No timeline events in this category.
          </p>
        ) : (
          <div className="space-y-3">
            {profile.timeline.map((item) => (
              <div
                key={item.id}
                className="p-3.5 rounded-xl border border-neutral-200 hover:border-neutral-300 transition-colors flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-neutral-100 font-mono text-[10px] font-semibold text-neutral-700">
                      {item.eventType}
                    </span>
                    {item.isPreAuthAnonymous && (
                      <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-display font-semibold">
                        Pre-Auth Anonymous Session (Linked on OTP)
                      </span>
                    )}
                    {item.areaBasis && (
                      <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] font-mono font-semibold">
                        Area Basis: {item.areaBasis}
                      </span>
                    )}
                  </div>
                  <div className="font-display font-bold text-neutral-900">{item.title}</div>
                  {item.subtitle && <div className="text-neutral-600">{item.subtitle}</div>}
                </div>

                <div className="text-right text-[11px] text-neutral-400 shrink-0 font-mono">
                  {new Date(item.occurredAt).toLocaleString('en-IN')}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
