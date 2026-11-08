'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AdminPageHeader } from '@/src/components/admin/AdminPageHeader';
import { AdminBadge } from '@/src/components/admin/AdminBadge';
import { AdminLoadingState } from '@/src/components/admin/AdminLoadingState';
import { AdminErrorState } from '@/src/components/admin/AdminErrorState';
import { getAdminHeaders } from '@/src/lib/adminAuth';
import type {
  CustomerDirectoryItemDto,
  VisitorDetailDto,
  VisitorIntelligenceOverviewDto,
} from '@/src/domain/visitorIntelligence/entities';
import {
  Users,
  Eye,
  Search,
  Filter,
  Bookmark,
  MessageSquare,
  Calendar,
  ArrowUpRight,
  Smartphone,
  Monitor,
  Tablet,
  ShieldCheck,
  TrendingUp,
  MapPin,
  Building2,
  Activity,
  Clock,
  X,
  Lock,
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

export default function AdminVisitorCustomer360Page() {
  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'CUSTOMERS' | 'VISITORS'>('OVERVIEW');

  const [overview, setOverview] = useState<VisitorIntelligenceOverviewDto | null>(null);
  const [customers, setCustomers] = useState<CustomerDirectoryItemDto[]>([]);
  const [customerTotal, setCustomerTotal] = useState(0);
  const [visitors, setVisitors] = useState<any[]>([]);
  const [visitorTotal, setVisitorTotal] = useState(0);
  const [canViewPii, setCanViewPii] = useState(true);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Customer directory filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterHasEnquiry, setFilterHasEnquiry] = useState<string>('ALL');
  const [filterHasSiteVisit, setFilterHasSiteVisit] = useState<string>('ALL');
  const [filterHasSaved, setFilterHasSaved] = useState<string>('ALL');
  const [filterLocation, setFilterLocation] = useState('');
  const [filterBhk, setFilterBhk] = useState('');
  const [sortBy, setSortBy] = useState<string>('lastActiveAt');

  // Visitor filters & detail drawer
  const [onlyAnonymous, setOnlyAnonymous] = useState(false);
  const [selectedVisitorId, setSelectedVisitorId] = useState<string | null>(null);
  const [visitorDetail, setVisitorDetail] = useState<VisitorDetailDto | null>(null);
  const [loadingVisitorDetail, setLoadingVisitorDetail] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (searchQuery.trim()) params.set('search', searchQuery.trim());
      if (filterHasEnquiry !== 'ALL') params.set('hasEnquiry', filterHasEnquiry);
      if (filterHasSiteVisit !== 'ALL') params.set('hasSiteVisit', filterHasSiteVisit);
      if (filterHasSaved !== 'ALL') params.set('hasSavedItems', filterHasSaved);
      if (filterLocation.trim()) params.set('preferredLocation', filterLocation.trim());
      if (filterBhk.trim()) params.set('preferredBhk', filterBhk.trim());
      params.set('sortBy', sortBy);

      const visitorParams = new URLSearchParams();
      if (onlyAnonymous) visitorParams.set('onlyAnonymous', 'true');
      visitorParams.set('limit', '50');

      const [overviewRes, custRes, visRes] = await Promise.all([
        fetch('/api/admin/customer-intelligence/overview', {
          headers: getAdminHeaders(),
        }),
        fetch(`/api/admin/customer-intelligence/customers?${params.toString()}`, {
          headers: getAdminHeaders(),
        }),
        fetch(`/api/admin/customer-intelligence/visitors?${visitorParams.toString()}`, {
          headers: getAdminHeaders(),
        }),
      ]);

      if (!overviewRes.ok) {
        const errJson = await overviewRes.json().catch(() => ({}));
        throw new Error(errJson.error || 'Failed to load Visitor & Customer 360 intelligence.');
      }

      const overviewJson = await overviewRes.json();
      setOverview(overviewJson.data);
      setCanViewPii(Boolean(overviewJson.canViewPii));

      if (custRes.ok) {
        const custJson = await custRes.json();
        setCustomers(custJson.items || []);
        setCustomerTotal(custJson.total || 0);
      }

      if (visRes.ok) {
        const visJson = await visRes.json();
        setVisitors(visJson.items || []);
        setVisitorTotal(visJson.total || 0);
      }
    } catch (err: any) {
      setError(err.message || 'Error loading Visitor & Customer 360');
    } finally {
      setLoading(false);
    }
  }, [
    searchQuery,
    filterHasEnquiry,
    filterHasSiteVisit,
    filterHasSaved,
    filterLocation,
    filterBhk,
    sortBy,
    onlyAnonymous,
  ]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleInspectVisitor = async (visitorId: string) => {
    setSelectedVisitorId(visitorId);
    setLoadingVisitorDetail(true);
    setVisitorDetail(null);
    try {
      const res = await fetch(`/api/admin/customer-intelligence/visitors/${visitorId}`, {
        headers: getAdminHeaders(),
      });
      if (res.ok) {
        const json = await res.json();
        setVisitorDetail(json.data);
      }
    } catch {
      // ignore
    } finally {
      setLoadingVisitorDetail(false);
    }
  };

  if (loading && !overview) {
    return <AdminLoadingState message="Loading Visitor & Customer 360 Intelligence..." />;
  }

  if (error && !overview) {
    return <AdminErrorState title="Intelligence Unavailable" error={error} onRetry={loadData} />;
  }

  return (
    <div className="space-y-6 pb-16">
      <AdminPageHeader
        title="Great Homes Intelligence — Visitor & Customer 360"
        description="First-party anonymous visitor journeys, mobile OTP conversion, property discovery signals, and actionable CRM follow-up context."
        breadcrumbs={[
          { label: 'Admin', href: '/admin' },
          { label: 'Visitor & Customer 360' },
        ]}
        primaryAction={{
          label: 'Refresh Intelligence',
          onClick: loadData,
        }}
      />
      {!canViewPii && (
        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs font-display font-medium">
          <Lock className="w-3.5 h-3.5" />
          PII Redacted for Role
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-neutral-200 pb-3">
        <button
          type="button"
          onClick={() => setActiveTab('OVERVIEW')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-display font-semibold transition-colors cursor-pointer ${
            activeTab === 'OVERVIEW'
              ? 'bg-neutral-900 text-white'
              : 'bg-white text-neutral-600 border border-neutral-200 hover:bg-neutral-50'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          Overview & Conversion Funnel
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('CUSTOMERS')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-display font-semibold transition-colors cursor-pointer ${
            activeTab === 'CUSTOMERS'
              ? 'bg-neutral-900 text-white'
              : 'bg-white text-neutral-600 border border-neutral-200 hover:bg-neutral-50'
          }`}
        >
          <Users className="w-4 h-4" />
          OTP Customer 360 Directory ({customerTotal})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('VISITORS')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-display font-semibold transition-colors cursor-pointer ${
            activeTab === 'VISITORS'
              ? 'bg-neutral-900 text-white'
              : 'bg-white text-neutral-600 border border-neutral-200 hover:bg-neutral-50'
          }`}
        >
          <Activity className="w-4 h-4" />
          First-Party Visitors & Sessions ({visitorTotal})
        </button>
      </div>

      {/* TAB 1: OVERVIEW & CONVERSION FUNNEL */}
      {activeTab === 'OVERVIEW' && overview && (
        <div className="space-y-6">
          {/* Top KPI Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <div className="bg-white p-4 rounded-xl border border-neutral-200 shadow-xs">
              <div className="text-[11px] font-display font-semibold uppercase tracking-wider text-neutral-500">
                Total Visitors
              </div>
              <div className="mt-1 text-2xl font-display font-bold text-neutral-900">
                {overview.kpis.totalVisitors}
              </div>
              <div className="mt-1 text-xs text-neutral-500">
                {overview.kpis.anonymousVisitors} anon · {overview.kpis.authenticatedVisitors} linked
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-neutral-200 shadow-xs">
              <div className="text-[11px] font-display font-semibold uppercase tracking-wider text-neutral-500">
                OTP Customers
              </div>
              <div className="mt-1 text-2xl font-display font-bold text-emerald-700">
                {overview.kpis.totalCustomers}
              </div>
              <div className="mt-1 text-xs text-neutral-500">
                {overview.kpis.returningVisitors} returning visitors
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-neutral-200 shadow-xs">
              <div className="text-[11px] font-display font-semibold uppercase tracking-wider text-neutral-500">
                Property Views
              </div>
              <div className="mt-1 text-2xl font-display font-bold text-neutral-900">
                {overview.kpis.totalPropertyViews}
              </div>
              <div className="mt-1 text-xs text-neutral-500">
                Across {overview.kpis.totalSessions} sessions
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-neutral-200 shadow-xs">
              <div className="text-[11px] font-display font-semibold uppercase tracking-wider text-neutral-500">
                Searches & Filters
              </div>
              <div className="mt-1 text-2xl font-display font-bold text-neutral-900">
                {overview.kpis.totalSearches}
              </div>
              <div className="mt-1 text-xs text-neutral-500">
                {overview.kpis.totalComparisons} comparisons
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-neutral-200 shadow-xs">
              <div className="text-[11px] font-display font-semibold uppercase tracking-wider text-neutral-500">
                Shortlisted / Saved
              </div>
              <div className="mt-1 text-2xl font-display font-bold text-amber-700">
                {overview.kpis.totalShortlists}
              </div>
              <div className="mt-1 text-xs text-neutral-500">Saved homes & watches</div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-neutral-200 shadow-xs">
              <div className="text-[11px] font-display font-semibold uppercase tracking-wider text-neutral-500">
                Enquiries & Visits
              </div>
              <div className="mt-1 text-2xl font-display font-bold text-emerald-700">
                {overview.kpis.customersWithEnquiries} / {overview.kpis.customersWithSiteVisits}
              </div>
              <div className="mt-1 text-xs text-neutral-500">Customers w/ Enquiry / Visit</div>
            </div>
          </div>

          {/* 7-Stage Discovery-to-Visit Funnel */}
          <div className="bg-white rounded-xl border border-neutral-200 p-6 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-display font-bold text-neutral-900">
                  Visitor-to-Customer Discovery & Conversion Funnel
                </h2>
                <p className="text-xs text-neutral-500">
                  Tracks anonymous property discovery through mobile OTP verification, enquiry submission, and site visit requests.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
              {overview.funnel.map((stage) => (
                <div
                  key={stage.stage}
                  className="p-3.5 rounded-lg bg-neutral-50 border border-neutral-200 flex flex-col justify-between"
                >
                  <div className="text-[11px] font-display font-semibold text-neutral-600">
                    {stage.label}
                  </div>
                  <div className="my-2 text-2xl font-display font-bold text-neutral-900">
                    {stage.count}
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-neutral-500 pt-2 border-t border-neutral-200/80">
                    <span>Step: {stage.conversionRateFromPrevious}%</span>
                    <span className="font-semibold text-neutral-700">
                      Total: {stage.conversionRateFromTop}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Top Viewed Projects, Locations, Search Filters, and Traffic Sources */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Most Viewed Projects */}
            <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-xs">
              <h3 className="text-sm font-display font-bold text-neutral-900 mb-3 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-neutral-600" />
                Most Viewed Residential Projects
              </h3>
              {overview.topViewedProjects.length === 0 ? (
                <p className="text-xs text-neutral-500 py-4">No project views recorded yet.</p>
              ) : (
                <div className="divide-y divide-neutral-100">
                  {overview.topViewedProjects.map((proj) => (
                    <div
                      key={proj.entityId}
                      className="py-2.5 flex items-center justify-between text-xs"
                    >
                      <div>
                        <span className="font-display font-semibold text-neutral-900">
                          {proj.title}
                        </span>
                        {proj.slug && (
                          <Link
                            href={`/projects/${proj.slug}`}
                            target="_blank"
                            className="ml-2 text-neutral-400 hover:text-neutral-700 inline-flex items-center"
                          >
                            <ArrowUpRight className="w-3.5 h-3.5" />
                          </Link>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-neutral-600">
                        <span>{proj.views} views</span>
                        <span className="text-neutral-400">·</span>
                        <span>{proj.uniqueVisitors} visitors</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Most Explored Micro-Markets */}
            <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-xs">
              <h3 className="text-sm font-display font-bold text-neutral-900 mb-3 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-neutral-600" />
                Most Explored Kolkata Micro-Markets
              </h3>
              {overview.topLocations.length === 0 ? (
                <p className="text-xs text-neutral-500 py-4">No locality views recorded yet.</p>
              ) : (
                <div className="divide-y divide-neutral-100">
                  {overview.topLocations.map((loc) => (
                    <div
                      key={loc.locationId}
                      className="py-2.5 flex items-center justify-between text-xs"
                    >
                      <span className="font-display font-semibold text-neutral-900">
                        {loc.name}
                      </span>
                      <div className="flex items-center gap-3 text-neutral-600">
                        <span>{loc.views} interactions</span>
                        <span className="text-neutral-400">·</span>
                        <span>{loc.uniqueVisitors} visitors</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Top Search & Filter Signals */}
            <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-xs">
              <h3 className="text-sm font-display font-bold text-neutral-900 mb-3 flex items-center gap-2">
                <Filter className="w-4 h-4 text-neutral-600" />
                Top Observed Search & Filter Criteria
              </h3>
              {overview.topSearchFilters.length === 0 ? (
                <p className="text-xs text-neutral-500 py-4">No search filters recorded yet.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {overview.topSearchFilters.map((f, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-100 text-neutral-800 text-xs font-body"
                    >
                      <span>{f.label}</span>
                      <span className="px-1.5 py-0.5 rounded bg-white text-[10px] font-display font-bold text-neutral-700">
                        {f.count}
                      </span>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Traffic Sources & Devices */}
            <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-xs">
              <h3 className="text-sm font-display font-bold text-neutral-900 mb-3 flex items-center gap-2">
                <Activity className="w-4 h-4 text-neutral-600" />
                First-Touch Attribution & Device Split
              </h3>
              <div className="space-y-2 mb-4">
                {overview.trafficSources.map((src, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between text-xs py-1.5 border-b border-neutral-100 last:border-0"
                  >
                    <span className="font-mono text-neutral-800">
                      {src.source} / {src.medium}
                    </span>
                    <div className="flex items-center gap-3 text-neutral-600">
                      <span>{src.visitors} visitors</span>
                      <span className="text-emerald-700 font-semibold">
                        {src.authenticatedCustomers} OTP verified
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-4 pt-3 border-t border-neutral-200 text-xs text-neutral-600">
                {overview.deviceBreakdown.map((d) => (
                  <span key={d.deviceClass} className="inline-flex items-center gap-1">
                    {d.deviceClass === 'MOBILE' ? (
                      <Smartphone className="w-3.5 h-3.5" />
                    ) : d.deviceClass === 'TABLET' ? (
                      <Tablet className="w-3.5 h-3.5" />
                    ) : (
                      <Monitor className="w-3.5 h-3.5" />
                    )}
                    <span className="font-display font-semibold">{d.deviceClass}:</span> {d.count} (
                    {d.percentage}%)
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: CUSTOMER 360 DIRECTORY */}
      {activeTab === 'CUSTOMERS' && (
        <div className="space-y-4">
          {/* Search & Filter Bar */}
          <div className="bg-white p-4 rounded-xl border border-neutral-200 shadow-xs grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
            <div className="lg:col-span-2 relative">
              <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search customer name, mobile, email..."
                className="w-full pl-9 pr-3 py-2 text-xs border border-neutral-200 rounded-lg focus:outline-hidden focus:border-neutral-900"
              />
            </div>

            <select
              value={filterHasEnquiry}
              onChange={(e) => setFilterHasEnquiry(e.target.value)}
              className="px-3 py-2 text-xs border border-neutral-200 rounded-lg bg-white"
            >
              <option value="ALL">Enquiries: All</option>
              <option value="true">Has Submitted Enquiry</option>
              <option value="false">No Enquiry Yet (Follow-Up Opportunity)</option>
            </select>

            <select
              value={filterHasSiteVisit}
              onChange={(e) => setFilterHasSiteVisit(e.target.value)}
              className="px-3 py-2 text-xs border border-neutral-200 rounded-lg bg-white"
            >
              <option value="ALL">Site Visits: All</option>
              <option value="true">Has Requested Site Visit</option>
              <option value="false">No Site Visit Yet</option>
            </select>

            <input
              type="text"
              value={filterLocation}
              onChange={(e) => setFilterLocation(e.target.value)}
              placeholder="Filter locality (e.g. Rajarhat)"
              className="px-3 py-2 text-xs border border-neutral-200 rounded-lg"
            />

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="px-3 py-2 text-xs border border-neutral-200 rounded-lg bg-white"
            >
              <option value="lastActiveAt">Sort: Recently Active</option>
              <option value="enquiryCount">Sort: Most Enquiries</option>
              <option value="propertyViewCount">Sort: Most Property Views</option>
              <option value="createdAt">Sort: Newest Registered</option>
            </select>
          </div>

          {/* Customers Table */}
          <div className="bg-white rounded-xl border border-neutral-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-neutral-50 border-b border-neutral-200 text-[11px] font-display font-semibold uppercase tracking-wider text-neutral-500">
                    <th className="py-3 px-4">Customer</th>
                    <th className="py-3 px-4">Discovery Activity</th>
                    <th className="py-3 px-4">Preferences & Budget</th>
                    <th className="py-3 px-4">Factual Evidence Signals</th>
                    <th className="py-3 px-4">Enquiries / Visits</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 text-xs">
                  {customers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-neutral-500">
                        No OTP-authenticated customers match the current filters.
                      </td>
                    </tr>
                  ) : (
                    customers.map((cust) => (
                      <tr key={cust.id} className="hover:bg-neutral-50/80 transition-colors">
                        <td className="py-3.5 px-4">
                          <div className="font-display font-bold text-neutral-900">
                            {cust.name}
                          </div>
                          <div className="text-neutral-600 font-mono text-[11px] mt-0.5">
                            {cust.phone || 'No mobile'}
                          </div>
                          <div className="text-neutral-400 text-[11px]">{cust.email}</div>
                          {cust.firstTouchSource && (
                            <div className="mt-1 inline-flex items-center px-2 py-0.5 rounded bg-neutral-100 text-neutral-600 text-[10px] font-mono">
                              Source: {cust.firstTouchSource}
                            </div>
                          )}
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="space-y-1 text-neutral-700">
                            <div>
                              <span className="font-semibold">{cust.propertyViewCount}</span> property views ·{' '}
                              <span className="font-semibold">{cust.sessionCount}</span> sessions
                            </div>
                            <div className="text-neutral-500">
                              <span className="font-semibold text-neutral-800">{cust.savedCount}</span> saved ·{' '}
                              <span className="font-semibold text-neutral-800">
                                {cust.watchedProjectsCount + cust.watchedLocationsCount}
                              </span>{' '}
                              watched
                            </div>
                            <div className="text-[11px] text-neutral-400">
                              Last active: {new Date(cust.lastActiveAt).toLocaleDateString('en-IN')}
                            </div>
                          </div>
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="space-y-1">
                            {cust.preferredLocations.length > 0 ? (
                              <div className="font-medium text-neutral-800">
                                {cust.preferredLocations.slice(0, 3).join(', ')}
                              </div>
                            ) : (
                              <div className="text-neutral-400">Any Kolkata locality</div>
                            )}
                            <div className="text-neutral-600">
                              {cust.preferredBhk.length > 0
                                ? cust.preferredBhk.join(', ')
                                : 'All configurations'}
                            </div>
                            {(cust.budgetMin || cust.budgetMax) && (
                              <div className="text-[11px] font-mono text-emerald-700 font-semibold">
                                {formatIndianPrice(cust.budgetMin)} – {formatIndianPrice(cust.budgetMax)}
                              </div>
                            )}
                          </div>
                        </td>

                        <td className="py-3.5 px-4 max-w-xs">
                          <div className="flex flex-wrap gap-1.5">
                            {cust.evidenceIndicators.slice(0, 4).map((ind, idx) => (
                              <span
                                key={idx}
                                title={ind.detail}
                                className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-display font-medium ${
                                  ind.tone === 'emerald'
                                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                    : ind.tone === 'amber'
                                    ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                    : 'bg-neutral-100 text-neutral-700 border border-neutral-200'
                                }`}
                              >
                                {ind.label}
                              </span>
                            ))}
                          </div>
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5">
                              <MessageSquare className="w-3.5 h-3.5 text-neutral-500" />
                              <span className="font-semibold text-neutral-900">
                                {cust.enquiryCount}
                              </span>{' '}
                              enquir{cust.enquiryCount === 1 ? 'y' : 'ies'}
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Calendar className="w-3.5 h-3.5 text-neutral-500" />
                              <span className="font-semibold text-neutral-900">
                                {cust.siteVisitCount}
                              </span>{' '}
                              site visit{cust.siteVisitCount === 1 ? '' : 's'}
                            </div>
                          </div>
                        </td>

                        <td className="py-3.5 px-4 text-right">
                          <Link
                            href={`/admin/intelligence/customers/${cust.id}`}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-900 text-white text-xs font-display font-semibold hover:bg-neutral-800 transition-colors"
                          >
                            Customer 360
                            <ArrowUpRight className="w-3.5 h-3.5" />
                          </Link>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: FIRST-PARTY VISITORS & SESSIONS */}
      {activeTab === 'VISITORS' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-neutral-200 shadow-xs">
            <div className="text-xs text-neutral-600">
              Showing first-party browser visitors (`gh_visitor_id`) and their discovery sessions.
            </div>
            <label className="inline-flex items-center gap-2 text-xs font-display font-medium text-neutral-800 cursor-pointer">
              <input
                type="checkbox"
                checked={onlyAnonymous}
                onChange={(e) => setOnlyAnonymous(e.target.checked)}
                className="rounded border-neutral-300"
              />
              Show Only Unauthenticated Anonymous Visitors
            </label>
          </div>

          <div className="bg-white rounded-xl border border-neutral-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-neutral-50 border-b border-neutral-200 text-[11px] font-display font-semibold uppercase tracking-wider text-neutral-500">
                    <th className="py-3 px-4">Visitor ID</th>
                    <th className="py-3 px-4">Identity Status</th>
                    <th className="py-3 px-4">First-Touch Attribution</th>
                    <th className="py-3 px-4">Device & Browser</th>
                    <th className="py-3 px-4">Sessions & Activity</th>
                    <th className="py-3 px-4 text-right">Inspect</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 text-xs">
                  {visitors.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-neutral-500">
                        No visitors recorded yet.
                      </td>
                    </tr>
                  ) : (
                    visitors.map((v) => (
                      <tr key={v.id} className="hover:bg-neutral-50/80">
                        <td className="py-3 px-4 font-mono text-[11px] text-neutral-800">
                          {v.id}
                        </td>
                        <td className="py-3 px-4">
                          {v.customerId ? (
                            <Link
                              href={`/admin/intelligence/customers/${v.customerId}`}
                              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-display font-semibold hover:bg-emerald-100"
                            >
                              <ShieldCheck className="w-3 h-3" />
                              Linked Customer ({v.customerId.slice(0, 8)}…)
                            </Link>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded bg-neutral-100 text-neutral-700 text-[11px] font-display">
                              Anonymous Visitor
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-mono text-[11px] text-neutral-800">
                            {v.firstUtmSource || 'direct'} / {v.firstUtmMedium || 'none'}
                          </div>
                          <div className="text-neutral-400 text-[11px]">
                            Landing: {v.firstLandingPath || '/'}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-medium text-neutral-800">{v.deviceClass}</span> ·{' '}
                          <span className="text-neutral-500">{v.browserFamily || 'Browser'}</span>
                        </td>
                        <td className="py-3 px-4">
                          <div>{v.sessionCount} session(s)</div>
                          <div className="text-neutral-400 text-[11px]">
                            Last seen: {new Date(v.lastSeenAt).toLocaleString('en-IN')}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => handleInspectVisitor(v.id)}
                            className="px-3 py-1.5 rounded-lg border border-neutral-200 hover:border-neutral-900 text-xs font-display font-semibold text-neutral-800 cursor-pointer"
                          >
                            View Timeline
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Visitor Detail Modal */}
          {selectedVisitorId && (
            <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-end">
              <div className="bg-white w-full max-w-2xl h-full overflow-y-auto p-6 shadow-2xl space-y-6">
                <div className="flex items-center justify-between border-b border-neutral-200 pb-4">
                  <div>
                    <h3 className="text-base font-display font-bold text-neutral-900">
                      Visitor Session & Event Timeline
                    </h3>
                    <p className="text-xs font-mono text-neutral-500">{selectedVisitorId}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedVisitorId(null);
                      setVisitorDetail(null);
                    }}
                    className="p-2 rounded-lg text-neutral-500 hover:bg-neutral-100 cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {loadingVisitorDetail || !visitorDetail ? (
                  <div className="py-12 text-center text-xs text-neutral-500">
                    Loading visitor sessions and events...
                  </div>
                ) : (
                  <div className="space-y-6">
                    {visitorDetail.linkedCustomer && (
                      <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between">
                        <div>
                          <div className="text-xs font-display font-bold text-emerald-900">
                            OTP-Linked to Customer: {visitorDetail.linkedCustomer.name}
                          </div>
                          <div className="text-xs text-emerald-700 font-mono">
                            {visitorDetail.linkedCustomer.phoneMasked}
                          </div>
                        </div>
                        <Link
                          href={`/admin/intelligence/customers/${visitorDetail.linkedCustomer.id}`}
                          className="px-3 py-1.5 rounded-lg bg-emerald-800 text-white text-xs font-display font-semibold"
                        >
                          Open Customer 360
                        </Link>
                      </div>
                    )}

                    <div>
                      <h4 className="text-xs font-display font-bold uppercase tracking-wider text-neutral-500 mb-2">
                        Recorded Sessions ({visitorDetail.sessions.length})
                      </h4>
                      <div className="space-y-2">
                        {visitorDetail.sessions.map((s) => (
                          <div
                            key={s.id}
                            className="p-3 rounded-lg bg-neutral-50 border border-neutral-200 text-xs flex items-center justify-between"
                          >
                            <div>
                              <div className="font-mono font-semibold text-neutral-800">
                                {s.id}
                              </div>
                              <div className="text-neutral-500">
                                Entry: {s.entryPath || '/'} → Exit: {s.exitPath || '/'}
                              </div>
                            </div>
                            <div className="text-right text-neutral-600">
                              <div>
                                {s.pageViewCount} page views · {s.eventCount} events
                              </div>
                              <div className="text-[11px] text-neutral-400">
                                {new Date(s.startedAt).toLocaleString('en-IN')}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <h4 className="text-xs font-display font-bold uppercase tracking-wider text-neutral-500 mb-2">
                        Chronological Behavioral Events ({visitorDetail.events.length})
                      </h4>
                      <div className="space-y-2.5">
                        {visitorDetail.events.map((ev) => (
                          <div
                            key={ev.id}
                            className="p-3 rounded-lg border border-neutral-200 text-xs flex items-start justify-between gap-4"
                          >
                            <div>
                              <span className="inline-block px-2 py-0.5 rounded bg-neutral-100 font-mono text-[10px] font-semibold text-neutral-800">
                                {ev.eventType}
                              </span>
                              <div className="mt-1 font-medium text-neutral-900">
                                {ev.pageTitle || ev.entitySlug || ev.pagePath}
                              </div>
                              {ev.areaBasis && (
                                <div className="text-[11px] text-emerald-700 font-mono mt-0.5">
                                  Area Basis: {ev.areaBasis}
                                </div>
                              )}
                            </div>
                            <div className="text-right text-[11px] text-neutral-400 shrink-0">
                              {new Date(ev.occurredAt).toLocaleString('en-IN')}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
