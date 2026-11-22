'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  ShieldCheck,
  Search,
  Eye,
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  Tag,
  KeyRound,
  UserCheck,
  PhoneCall,
  RefreshCw,
} from 'lucide-react';
import { useAdminAuth } from '@/src/components/admin/AdminAuthProvider';
import { getAdminHeaders } from '@/src/lib/adminAuth';
import { safeFetchJson } from '@/src/lib/safeApiFetch';

interface SubmissionSummaryItem {
  id: string;
  referenceId: string;
  submitterCustomerId: string;
  listingType: 'RESALE' | 'RENTAL';
  listingSource: 'OWNER' | 'PARTNER';
  propertyType: string | null;
  submissionStatus: string;
  title: string;
  city: string;
  locality: string | null;
  projectName: string | null;
  priceLabel?: string | null;
  photoCount?: number;
  assignedReviewerId: string | null;
  contactConfirmed?: boolean;
  queueAgeHours?: number | null;
  slaStatus?: 'ON_TRACK' | 'APPROACHING_SLA' | 'OVERDUE' | null;
  resaleListingId?: string | null;
  rentalListingId?: string | null;
  publishedListingSlug?: string | null;
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
}

const QUEUE_STATUS_TABS = [
  { key: 'ALL', label: 'All Submissions' },
  { key: 'SUBMITTED', label: 'Submitted' },
  { key: 'UNDER_REVIEW', label: 'Under Review' },
  { key: 'CHANGES_REQUESTED', label: 'Changes Requested' },
  { key: 'APPROVED', label: 'Approved (Ready to Publish)' },
  { key: 'PUBLISHED', label: 'Published' },
  { key: 'DEACTIVATED', label: 'Deactivated' },
  { key: 'REJECTED', label: 'Rejected' },
  { key: 'WITHDRAWN', label: 'Withdrawn' },
  { key: 'DRAFT', label: 'Drafts' },
];

export function StaffSubmissionsWorkspace() {
  const { displayName, role } = useAdminAuth();

  const [items, setItems] = useState<SubmissionSummaryItem[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [countsLoaded, setCountsLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [purposeFilter, setPurposeFilter] = useState<string>('');
  const [sourceFilter, setSourceFilter] = useState<string>('');
  const [propertyTypeFilter, setPropertyTypeFilter] = useState<string>('');
  const [assignedToMeOnly, setAssignedToMeOnly] = useState<boolean>(false);

  const fetchSubmissions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter && statusFilter !== 'ALL') params.set('status', statusFilter);
      if (purposeFilter) params.set('listingPurpose', purposeFilter);
      if (sourceFilter) params.set('listingSource', sourceFilter);
      if (propertyTypeFilter) params.set('propertyType', propertyTypeFilter);
      if (assignedToMeOnly && displayName) {
        params.set('assignedReviewerId', displayName);
      }
      if (searchQuery.trim()) params.set('search', searchQuery.trim());

      const result = await safeFetchJson<any>(
        `/api/admin/property-submissions?${params.toString()}`,
        {
          headers: getAdminHeaders(),
          cache: 'no-store',
        }
      );
      if (!result.ok || !result.data?.success) {
        throw new Error(result.error || 'Failed to load submissions queue.');
      }
      const json = result.data;
      setItems(Array.isArray(json.items) ? json.items : []);
      setCounts(json.countsByStatus || {});
      setCountsLoaded(true);
    } catch (err: any) {
      setError(err.message || 'Error connecting to admin verification service.');
      setCountsLoaded(false);
    } finally {
      setLoading(false);
    }
  }, [
    statusFilter,
    purposeFilter,
    sourceFilter,
    propertyTypeFilter,
    assignedToMeOnly,
    displayName,
    searchQuery,
  ]);

  useEffect(() => {
    fetchSubmissions();
  }, [fetchSubmissions]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchSubmissions();
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'SUBMITTED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 font-display">
            <Clock className="w-3 h-3" /> Submitted
          </span>
        );
      case 'UNDER_REVIEW':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200 font-display">
            <Clock className="w-3 h-3" /> Under Review
          </span>
        );
      case 'CHANGES_REQUESTED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-orange-50 text-orange-700 border border-orange-200 font-display">
            <AlertTriangle className="w-3 h-3" /> Changes Requested
          </span>
        );
      case 'APPROVED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-sky-50 text-sky-800 border border-sky-200 font-display">
            <CheckCircle2 className="w-3 h-3" /> Approved
          </span>
        );
      case 'PUBLISHED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 font-display">
            <CheckCircle2 className="w-3 h-3" /> Published
          </span>
        );
      case 'DEACTIVATED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-neutral-100 text-neutral-700 border border-neutral-300 font-display">
            Deactivated
          </span>
        );
      case 'REJECTED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200 font-display">
            <XCircle className="w-3 h-3" /> Rejected
          </span>
        );
      case 'WITHDRAWN':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-neutral-100 text-neutral-600 border border-neutral-300 font-display">
            Withdrawn
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-neutral-100 text-neutral-700 border border-neutral-200 font-display">
            {status}
          </span>
        );
    }
  };

  const renderSlaBadge = (sub: SubmissionSummaryItem) => {
    if (!sub.slaStatus || sub.queueAgeHours === null || sub.queueAgeHours === undefined) {
      return null;
    }
    if (sub.slaStatus === 'OVERDUE') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200 tabular-nums font-display">
          SLA Overdue ({sub.queueAgeHours}h)
        </span>
      );
    }
    if (sub.slaStatus === 'APPROACHING_SLA') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200 tabular-nums font-display">
          Approaching SLA ({sub.queueAgeHours}h)
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 tabular-nums font-display">
        On Track ({sub.queueAgeHours}h)
      </span>
    );
  };

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-neutral-200 pb-6">
        <div>
          <div className="flex items-center gap-2 text-[#E85D3F] text-xs font-bold uppercase tracking-wider mb-1 font-display">
            <ShieldCheck className="w-4 h-4" /> Great Homes Staff Verification ({role || 'STAFF'})
          </div>
          <h1 className="text-2xl md:text-3xl font-display font-bold text-neutral-900 tracking-tight">
            Property Verification &amp; Publication Queue
          </h1>
          <p className="text-neutral-600 text-sm mt-1 font-body">
            Review customer residential submissions, verify owner declarations and partner
            attestations, confirm telephonic contact, and manage publication to /buy and /rent.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={fetchSubmissions}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-white text-neutral-800 border border-neutral-300 rounded-lg shadow-xs hover:bg-neutral-50 transition-colors font-display cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh Queue</span>
          </button>
        </div>
      </div>

      {/* Status Filter Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-neutral-200 pb-3">
        {QUEUE_STATUS_TABS.map((tab) => {
          const count = countsLoaded && !error ? counts[tab.key] ?? 0 : '—';
          const isActive = statusFilter === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setStatusFilter(tab.key)}
              className={`px-3.5 py-1.5 rounded-lg text-xs md:text-sm font-medium transition-all flex items-center gap-2 font-display cursor-pointer ${
                isActive
                  ? 'bg-neutral-900 text-white shadow-xs'
                  : 'bg-white text-neutral-600 border border-neutral-200 hover:bg-neutral-50 hover:text-neutral-900'
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-bold tabular-nums ${
                  isActive ? 'bg-white/20 text-white' : 'bg-neutral-100 text-neutral-600'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Filters & Search Toolbar */}
      <form
        onSubmit={handleSearchSubmit}
        className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-neutral-200 shadow-xs"
      >
        <div className="flex flex-wrap items-center gap-3 flex-1">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <input
              type="text"
              placeholder="Search reference ID (GH-...), locality, or title..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm bg-neutral-50 border border-neutral-300 rounded-lg focus:outline-none focus:border-neutral-900 font-body"
            />
          </div>

          <select
            aria-label="Filter by listing purpose"
            value={purposeFilter}
            onChange={(e) => setPurposeFilter(e.target.value)}
            className="px-3 py-2 text-sm bg-neutral-50 border border-neutral-300 rounded-lg text-neutral-700 focus:outline-none font-display"
          >
            <option value="">All Purposes</option>
            <option value="RESALE">Resale</option>
            <option value="RENTAL">Rental</option>
          </select>

          <select
            aria-label="Filter by listing source"
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="px-3 py-2 text-sm bg-neutral-50 border border-neutral-300 rounded-lg text-neutral-700 focus:outline-none font-display"
          >
            <option value="">All Sources</option>
            <option value="OWNER">Owner</option>
            <option value="PARTNER">Partner / Agent</option>
          </select>

          <select
            aria-label="Filter by property type"
            value={propertyTypeFilter}
            onChange={(e) => setPropertyTypeFilter(e.target.value)}
            className="px-3 py-2 text-sm bg-neutral-50 border border-neutral-300 rounded-lg text-neutral-700 focus:outline-none font-display"
          >
            <option value="">All Property Types</option>
            <option value="APARTMENT">Apartment</option>
            <option value="INDEPENDENT_HOUSE">Independent House</option>
            <option value="PLOT">Residential Plot</option>
          </select>

          <label className="inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold text-neutral-700 bg-neutral-50 border border-neutral-300 rounded-lg cursor-pointer font-display">
            <input
              type="checkbox"
              checked={assignedToMeOnly}
              onChange={(e) => setAssignedToMeOnly(e.target.checked)}
              className="rounded border-neutral-300 text-neutral-900"
            />
            <span>Assigned to me ({displayName || 'Staff'})</span>
          </label>
        </div>

        <button
          type="submit"
          className="px-4 py-2 text-sm font-semibold bg-[#E85D3F] text-white rounded-lg hover:bg-[#D44E32] transition-colors shadow-xs font-display cursor-pointer"
        >
          Search Queue
        </button>
      </form>

      {/* Main Content Area */}
      {loading ? (
        <div className="py-20 text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-[#E85D3F] border-t-transparent mb-3" />
          <p className="text-neutral-500 text-sm font-body">
            Loading submissions verification queue...
          </p>
        </div>
      ) : error ? (
        <div className="p-6 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-sm flex flex-col sm:flex-row items-center justify-between gap-4 font-body">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 shrink-0 text-rose-700" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={fetchSubmissions}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-rose-300 bg-white text-xs font-semibold text-rose-900 hover:bg-rose-100 transition-colors font-display cursor-pointer shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Retry</span>
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-2xl border border-neutral-200 p-12 text-center space-y-3">
          <ShieldCheck className="w-12 h-12 text-neutral-300 mx-auto" />
          <h3 className="text-lg font-display font-semibold text-neutral-900">
            No submissions found
          </h3>
          <p className="text-neutral-500 text-sm max-w-md mx-auto font-body">
            There are no property submissions matching your current filter criteria in the
            verification queue.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-neutral-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-neutral-50/80 border-b border-neutral-200 text-xs font-semibold text-neutral-500 uppercase tracking-wider font-display">
                  <th className="py-3.5 px-4">Reference &amp; Title</th>
                  <th className="py-3.5 px-4">Type, Purpose &amp; Price</th>
                  <th className="py-3.5 px-4">Source</th>
                  <th className="py-3.5 px-4">Location</th>
                  <th className="py-3.5 px-4">Reviewer &amp; SLA</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4">Submitted</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 text-sm font-body">
                {items.map((sub) => (
                  <tr key={sub.id} className="hover:bg-neutral-50/60 transition-colors group">
                    <td className="py-4 px-4">
                      <div className="font-display font-semibold text-neutral-900 flex items-center gap-2">
                        <span>{sub.referenceId}</span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-neutral-100 text-neutral-600">
                          {sub.id.slice(0, 6)}
                        </span>
                      </div>
                      <div className="text-neutral-600 text-xs mt-0.5 truncate max-w-xs">
                        {sub.title}
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <div className="font-display font-medium text-neutral-900">
                        {sub.propertyType || 'Property'}
                      </div>
                      <div className="text-xs text-neutral-500 flex items-center gap-2 mt-0.5">
                        {sub.listingType === 'RESALE' ? (
                          <span className="text-blue-700 font-medium flex items-center gap-1">
                            <Tag className="w-3 h-3" /> Resale
                          </span>
                        ) : (
                          <span className="text-purple-700 font-medium flex items-center gap-1">
                            <KeyRound className="w-3 h-3" /> Rental
                          </span>
                        )}
                        {sub.priceLabel && (
                          <span className="font-display font-bold text-neutral-900 tabular-nums">
                            · {sub.priceLabel}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold font-display ${
                          sub.listingSource === 'OWNER'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-amber-50 text-amber-800 border border-amber-200'
                        }`}
                      >
                        {sub.listingSource === 'OWNER' ? 'Owner' : 'Partner'}
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      <div className="text-neutral-900 text-xs font-medium">
                        {sub.locality || 'Locality unspecified'}
                      </div>
                      <div className="text-neutral-500 text-[11px]">
                        {sub.city} {sub.projectName ? `· ${sub.projectName}` : ''}
                      </div>
                    </td>
                    <td className="py-4 px-4 space-y-1">
                      <div className="flex items-center gap-1.5 text-xs text-neutral-700">
                        <UserCheck className="w-3.5 h-3.5 text-neutral-400" />
                        <span>{sub.assignedReviewerId || 'Unassigned'}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold font-display ${
                            sub.contactConfirmed
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-neutral-100 text-neutral-600 border border-neutral-200'
                          }`}
                        >
                          <PhoneCall className="w-2.5 h-2.5" />
                          {sub.contactConfirmed ? 'Contact Verified' : 'Contact Pending'}
                        </span>
                        {renderSlaBadge(sub)}
                      </div>
                    </td>
                    <td className="py-4 px-4">{getStatusBadge(sub.submissionStatus)}</td>
                    <td className="py-4 px-4 text-xs text-neutral-500 tabular-nums">
                      {sub.submittedAt
                        ? new Date(sub.submittedAt).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                            timeZone: 'Asia/Kolkata',
                          })
                        : 'Draft / Unsubmitted'}
                    </td>
                    <td className="py-4 px-4 text-right">
                      <Link
                        href={`/admin/property-submissions/${sub.id}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-neutral-900 text-white rounded-lg text-xs font-semibold shadow-xs hover:bg-[#E85D3F] transition-colors font-display"
                      >
                        <Eye className="w-3.5 h-3.5" /> Review
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
