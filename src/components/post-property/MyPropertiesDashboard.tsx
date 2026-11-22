'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Building2,
  Plus,
  ArrowRight,
  MapPin,
  Camera,
  Clock,
  AlertCircle,
  CheckCircle2,
  FileEdit,
  XCircle,
  Loader2,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Lock,
  ExternalLink,
} from 'lucide-react';
import { useCustomerAuth } from '@/src/components/customer/CustomerAuthContext';
import type {
  CustomerSubmissionSummary,
  SubmissionActivityItem,
} from '@/src/domain/propertySubmission/repository';

type StatusTabKey =
  | 'ALL'
  | 'DRAFT'
  | 'SUBMITTED_OR_REVIEW'
  | 'CHANGES_REQUESTED'
  | 'APPROVED'
  | 'PUBLISHED'
  | 'DEACTIVATED'
  | 'WITHDRAWN_OR_CLOSED';

interface StatusCounts {
  ALL: number;
  DRAFT: number;
  SUBMITTED_OR_REVIEW: number;
  CHANGES_REQUESTED: number;
  APPROVED: number;
  PUBLISHED?: number;
  DEACTIVATED?: number;
  WITHDRAWN_OR_CLOSED: number;
}

interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const STATUS_TABS: Array<{
  key: StatusTabKey;
  label: string;
  countKey: keyof StatusCounts;
}> = [
  { key: 'ALL', label: 'All Submissions', countKey: 'ALL' },
  { key: 'DRAFT', label: 'Drafts', countKey: 'DRAFT' },
  {
    key: 'SUBMITTED_OR_REVIEW',
    label: 'Submitted / Under Review',
    countKey: 'SUBMITTED_OR_REVIEW',
  },
  {
    key: 'CHANGES_REQUESTED',
    label: 'Changes Requested',
    countKey: 'CHANGES_REQUESTED',
  },
  { key: 'APPROVED', label: 'Approved (Pending Publish)', countKey: 'APPROVED' },
  { key: 'PUBLISHED', label: 'Published', countKey: 'PUBLISHED' },
  { key: 'DEACTIVATED', label: 'Deactivated', countKey: 'DEACTIVATED' },
  {
    key: 'WITHDRAWN_OR_CLOSED',
    label: 'Withdrawn / Closed',
    countKey: 'WITHDRAWN_OR_CLOSED',
  },
];

function formatDateDisplay(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });
}

function formatDateTimeDisplay(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  });
}

function formatPropertyTypeName(type: string | null): string {
  switch (type) {
    case 'APARTMENT':
      return 'Apartment';
    case 'INDEPENDENT_HOUSE':
      return 'Independent House';
    case 'PLOT':
      return 'Residential Plot';
    default:
      return 'Property Category Unspecified';
  }
}

function getStatusAccentClass(status: string): string {
  switch (status) {
    case 'PUBLISHED':
      return 'text-[#1E7B4E]';
    case 'APPROVED':
      return 'text-[#1F4E79]';
    case 'CHANGES_REQUESTED':
      return 'text-[#C84B31]';
    case 'SUBMITTED':
    case 'UNDER_REVIEW':
      return 'text-[#1F4E79]';
    case 'DEACTIVATED':
    case 'REJECTED':
    case 'WITHDRAWN':
    case 'WITHDRAWAL_REQUESTED':
      return 'text-[#6E6A65]';
    case 'DRAFT':
    default:
      return 'text-[#8C5A16]';
  }
}

export function MyPropertiesDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { customer, loading: authLoading, openAuthModal } = useCustomerAuth();

  const initialStatusParam = (searchParams?.get('status') || 'ALL').toUpperCase();
  const validTabKeys = STATUS_TABS.map((t) => t.key as string);
  const initialTab: StatusTabKey = validTabKeys.includes(initialStatusParam)
    ? (initialStatusParam as StatusTabKey)
    : 'ALL';

  const [activeTab, setActiveTab] = useState<StatusTabKey>(initialTab);
  const [page, setPage] = useState<number>(1);
  const [items, setItems] = useState<CustomerSubmissionSummary[]>([]);
  const [counts, setCounts] = useState<StatusCounts>({
    ALL: 0,
    DRAFT: 0,
    SUBMITTED_OR_REVIEW: 0,
    CHANGES_REQUESTED: 0,
    APPROVED: 0,
    PUBLISHED: 0,
    DEACTIVATED: 0,
    WITHDRAWN_OR_CLOSED: 0,
  });
  const [pagination, setPagination] = useState<PaginationMeta>({
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 1,
  });

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedTimelineIds, setExpandedTimelineIds] = useState<Record<string, boolean>>({});
  const [loadedTimelines, setLoadedTimelines] = useState<Record<string, SubmissionActivityItem[]>>({});
  const [loadingTimelineIds, setLoadingTimelineIds] = useState<Record<string, boolean>>({});
  const [confirmWithdrawId, setConfirmWithdrawId] = useState<string | null>(null);
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null);
  const [changeRequestDraft, setChangeRequestDraft] = useState<{
    submissionId: string;
    requestType: 'CORRECTION' | 'REMOVAL';
    reason: string;
    requestedChangesNote: string;
  } | null>(null);
  const [submittingChangeRequest, setSubmittingChangeRequest] = useState<boolean>(false);
  const [actionBanner, setActionBanner] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const fetchSubmissions = useCallback(
    async (statusFilter: StatusTabKey, targetPage: number) => {
      if (!customer) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams();
        if (statusFilter !== 'ALL') {
          params.set('status', statusFilter);
        }
        params.set('page', String(targetPage));
        params.set('limit', '10');
        params.set('compact', '1');

        const res = await fetch(`/api/customer/submissions?${params.toString()}`, {
          method: 'GET',
          cache: 'no-store',
        });
        const data = await res.json();

        if (!res.ok || !data.success) {
          setError(
            data.error ||
              'We could not load your property submissions right now. Please try again.'
          );
          setItems([]);
          return;
        }

        setItems(Array.isArray(data.items) ? data.items : []);
        if (data.countsByStatus) {
          setCounts(data.countsByStatus);
        }
        if (data.pagination) {
          setPagination(data.pagination);
        }
      } catch {
        setError(
          'Network error while loading your property submissions. Please check your connection and try again.'
        );
      } finally {
        setLoading(false);
      }
    },
    [customer]
  );

  useEffect(() => {
    if (!authLoading && customer) {
      fetchSubmissions(activeTab, page);
    } else if (!authLoading && !customer) {
      setLoading(false);
    }
  }, [authLoading, customer, activeTab, page, fetchSubmissions]);

  const handleSelectTab = (tabKey: StatusTabKey) => {
    setActiveTab(tabKey);
    setPage(1);
    setActionBanner(null);
    const params = new URLSearchParams(searchParams?.toString() || '');
    if (tabKey === 'ALL') {
      params.delete('status');
    } else {
      params.set('status', tabKey);
    }
    const query = params.toString();
    router.replace(query ? `/my-properties?${query}` : '/my-properties', { scroll: false });
  };

  const toggleTimeline = async (id: string) => {
    const nextOpen = !expandedTimelineIds[id];
    setExpandedTimelineIds((prev) => ({
      ...prev,
      [id]: nextOpen,
    }));

    if (nextOpen && !loadedTimelines[id] && !loadingTimelineIds[id]) {
      setLoadingTimelineIds((prev) => ({ ...prev, [id]: true }));
      try {
        const res = await fetch(`/api/customer/submissions/${encodeURIComponent(id)}`, {
          method: 'GET',
          cache: 'no-store',
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.activityTimeline)) {
            setLoadedTimelines((prev) => ({
              ...prev,
              [id]: data.activityTimeline,
            }));
          }
        }
      } catch {
        // Fallback to baseline summary activityTimeline already present on card
      } finally {
        setLoadingTimelineIds((prev) => ({ ...prev, [id]: false }));
      }
    }
  };

  const handleWithdrawConfirmed = async (submissionId: string) => {
    setWithdrawingId(submissionId);
    setActionBanner(null);

    try {
      const res = await fetch(
        `/api/customer/submissions/${encodeURIComponent(submissionId)}/withdraw`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }
      );
      const data = await res.json();

      if (!res.ok || !data.success) {
        setActionBanner({
          type: 'error',
          message:
            data.error || 'Could not withdraw this submission. Please refresh and try again.',
        });
        setConfirmWithdrawId(null);
        return;
      }

      setActionBanner({
        type: 'success',
        message:
          data.message ||
          'Submission withdrawn and removed from the active verification queue.',
      });
      setConfirmWithdrawId(null);
      await fetchSubmissions(activeTab, page);
    } catch {
      setActionBanner({
        type: 'error',
        message: 'Network error while withdrawing submission. Please try again.',
      });
    } finally {
      setWithdrawingId(null);
    }
  };

  const handleSubmitChangeRequest = async () => {
    if (!changeRequestDraft) return;
    const trimmedReason = changeRequestDraft.reason.trim();
    if (trimmedReason.length < 10) {
      setActionBanner({
        type: 'error',
        message: 'Please provide a clear reason (at least 10 characters) for your request.',
      });
      return;
    }

    setSubmittingChangeRequest(true);
    setActionBanner(null);

    try {
      const res = await fetch(
        `/api/customer/submissions/${encodeURIComponent(changeRequestDraft.submissionId)}/change-requests`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requestType: changeRequestDraft.requestType,
            reason: trimmedReason,
            requestedChanges: changeRequestDraft.requestedChangesNote.trim()
              ? { summary: changeRequestDraft.requestedChangesNote.trim() }
              : {},
          }),
        }
      );
      const data = await res.json();
      if (!res.ok || !data.success) {
        setActionBanner({
          type: 'error',
          message:
            data.error ||
            'Could not submit your post-publication change request. Please try again.',
        });
        return;
      }

      setActionBanner({
        type: 'success',
        message:
          changeRequestDraft.requestType === 'REMOVAL'
            ? 'Listing removal request submitted to the Great Homes verification team.'
            : 'Post-publication correction request submitted to the Great Homes verification team.',
      });
      setChangeRequestDraft(null);
      await fetchSubmissions(activeTab, page);
    } catch {
      setActionBanner({
        type: 'error',
        message: 'Network error while submitting your request. Please try again.',
      });
    } finally {
      setSubmittingChangeRequest(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-[70vh] bg-[#FAFAF8] flex items-center justify-center px-4">
        <div className="flex flex-col items-center gap-3 text-center">
          <Loader2 className="h-7 w-7 animate-spin text-[#E85D3F]" />
          <p className="text-sm font-medium text-[#4A4743] font-body">
            Verifying your customer session...
          </p>
        </div>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="min-h-[75vh] bg-[#FAFAF8] py-16 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl rounded-2xl border border-[#E5E0D8] bg-white p-8 sm:p-12 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-[#FFF3EE] text-[#E85D3F]">
            <Lock className="h-6 w-6" />
          </div>
          <h1 className="mt-5 font-editorial text-3xl sm:text-4xl text-[#111111]">
            Sign In to View Your Property Submissions
          </h1>
          <p className="mt-3 text-sm sm:text-base leading-relaxed text-[#555555] font-body">
            Your drafts, verification statuses, reviewer feedback, and submitted Kolkata resale or
            rental listings are protected under your verified mobile identity.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <button
              type="button"
              onClick={() => openAuthModal('login')}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#E85D3F] px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-[#D44E32] font-display cursor-pointer"
            >
              <span>Sign In with OTP</span>
              <ArrowRight className="h-4 w-4" />
            </button>
            <Link
              href="/post-property"
              className="inline-flex items-center justify-center rounded-xl border border-[#D9D5D0] bg-white px-5 py-3.5 text-sm font-semibold text-[#111111] transition hover:bg-[#F5F3F0] font-display"
            >
              Explore Post Property Hub
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFAF8] text-[#111111] pb-28 sm:pb-24 overflow-x-hidden">
      {/* Header Section */}
      <section className="border-b border-[#E5E0D8] bg-white pt-6 pb-0 sm:pt-10">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between pb-5 sm:pb-7">
            <div>
              <h1 className="font-editorial text-3xl sm:text-4xl lg:text-[42px] text-[#111111] tracking-tight">
                My Property Submissions
              </h1>
              <p className="mt-1.5 max-w-2xl text-sm sm:text-base text-[#555555] font-body leading-relaxed">
                Resume saved drafts, review feedback from Great Homes, and manage your property submissions.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
              <button
                type="button"
                onClick={() => fetchSubmissions(activeTab, page)}
                disabled={loading}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-[#E5E0D8] bg-white px-4 py-2.5 text-xs sm:text-sm font-semibold text-[#111111] transition hover:bg-[#F5F3F0] disabled:opacity-50 font-display cursor-pointer whitespace-nowrap shrink-0"
              >
                <RefreshCw className={`h-4 w-4 text-[#6E6A65] ${loading ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>

              <Link
                href={`/post-property/new?source=${
                  customer.accountType === 'LISTING_PARTNER' ? 'PARTNER' : 'OWNER'
                }`}
                className="inline-flex min-h-[44px] flex-1 sm:flex-initial items-center justify-center gap-2 rounded-xl bg-[#E85D3F] px-5 py-2.5 text-xs sm:text-sm font-semibold text-white transition hover:bg-[#D44E32] font-display whitespace-nowrap shrink-0"
              >
                <Plus className="h-4 w-4" />
                <span>Post New Property</span>
              </Link>
            </div>
          </div>

          {/* Interactive Status Filter Tabs */}
          <nav
            aria-label="Filter submissions by status"
            className="-mx-4 px-4 sm:mx-0 sm:px-0 flex items-center gap-1.5 sm:gap-2 overflow-x-auto pb-px [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          >
            {STATUS_TABS.map((tab) => {
              const isSelected = activeTab === tab.key;
              const count = counts[tab.countKey] ?? 0;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => handleSelectTab(tab.key)}
                  aria-current={isSelected ? 'page' : undefined}
                  className={`inline-flex min-h-[44px] items-center gap-1.5 border-b-2 px-3 sm:px-3.5 py-2.5 text-xs sm:text-sm font-display transition whitespace-nowrap shrink-0 cursor-pointer ${
                    isSelected
                      ? 'border-[#E85D3F] font-bold text-[#E85D3F]'
                      : 'border-transparent font-medium text-[#6E6A65] hover:text-[#111111]'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`tabular-nums text-xs ${
                      isSelected ? 'font-bold text-[#E85D3F]' : 'text-[#6E6A65]'
                    }`}
                  >
                    ({count})
                  </span>
                </button>
              );
            })}
          </nav>
        </div>
      </section>

      {/* Main Content Area */}
      <div className="mx-auto max-w-6xl px-4 pt-6 sm:pt-8 sm:px-6 lg:px-8">
        {/* Action Feedback Banner */}
        {actionBanner && (
          <div
            role="status"
            className={`mb-5 rounded-2xl border p-4 sm:p-5 flex items-start justify-between gap-4 ${
              actionBanner.type === 'success'
                ? 'border-[#1E7B4E]/30 bg-[#F2FBF6] text-[#145335]'
                : 'border-[#C84B31]/30 bg-[#FFF5F2] text-[#8E2B17]'
            }`}
          >
            <div className="flex items-start gap-3">
              {actionBanner.type === 'success' ? (
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#1E7B4E]" />
              ) : (
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-[#C84B31]" />
              )}
              <p className="text-sm font-medium font-body">{actionBanner.message}</p>
            </div>
            <button
              type="button"
              onClick={() => setActionBanner(null)}
              className="text-xs font-semibold underline font-display cursor-pointer shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div
            role="alert"
            className="mb-5 rounded-2xl border border-[#C84B31]/30 bg-[#FFF5F2] p-5 sm:p-6"
          >
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-[#C84B31]" />
              <div>
                <h2 className="font-display text-sm font-bold text-[#111111]">
                  Unable to Load Submissions
                </h2>
                <p className="mt-1 text-sm text-[#4A4743] font-body">{error}</p>
                <button
                  type="button"
                  onClick={() => fetchSubmissions(activeTab, page)}
                  className="mt-4 inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-[#111111] px-4 py-2 text-xs font-semibold text-white hover:bg-[#2A2A2A] font-display cursor-pointer"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>Retry Loading</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Loading Skeleton */}
        {loading && (
          <div className="space-y-4">
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className="h-52 rounded-2xl border border-[#E5E0D8] bg-white p-5 sm:p-6 animate-pulse"
              />
            ))}
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && items.length === 0 && (
          <div className="rounded-2xl border border-[#E5E0D8] bg-white p-8 sm:p-14 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-[#F5F3F0] text-[#6E6A65]">
              <Building2 className="h-6 w-6" />
            </div>
            <h2 className="mt-4 font-display text-xl font-bold text-[#111111]">
              {activeTab === 'ALL'
                ? 'You Have Not Started Any Property Submissions Yet'
                : 'No Submissions Match This Status Filter'}
            </h2>
            <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-[#555555] font-body">
              {activeTab === 'ALL'
                ? 'Submit your Kolkata apartment, independent house, or plot for resale or rental. Save progress as a draft at any step and resume whenever you are ready.'
                : 'Try switching to "All Submissions" to view your drafts and listings across other verification stages.'}
            </p>
            <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
              {activeTab !== 'ALL' && (
                <button
                  type="button"
                  onClick={() => handleSelectTab('ALL')}
                  className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-[#E5E0D8] bg-white px-5 py-3 text-xs sm:text-sm font-semibold text-[#111111] hover:bg-[#F5F3F0] font-display cursor-pointer"
                >
                  View All Submissions ({counts.ALL})
                </button>
              )}
              <Link
                href="/post-property"
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#E85D3F] px-5 py-3 text-xs sm:text-sm font-semibold text-white hover:bg-[#D44E32] font-display"
              >
                <span>Start a Property Submission</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        )}

        {/* Submissions List */}
        {!loading && !error && items.length > 0 && (
          <div className="space-y-4 sm:space-y-6">
            {items.map((item) => {
              const isTimelineOpen = Boolean(expandedTimelineIds[item.id]);
              const isConfirmingWithdraw = confirmWithdrawId === item.id;
              const isWithdrawing = withdrawingId === item.id;

              const renderPhotoMediaBlock = (isMobileSlot: boolean) => (
                <div className={isMobileSlot ? 'mt-3.5 lg:hidden' : 'hidden lg:block lg:col-span-4'}>
                  <div
                    className={`relative w-full overflow-hidden rounded-xl border border-[#E5E0D8] bg-[#F5F3F0] ${
                      item.coverPhotoUrl
                        ? 'aspect-[16/10]'
                        : 'h-[168px] lg:h-auto lg:aspect-[16/10]'
                    }`}
                  >
                    {item.coverPhotoUrl ? (
                      <Image
                        src={item.coverPhotoUrl}
                        alt={item.title}
                        fill
                        sizes="(max-width: 1024px) 100vw, 360px"
                        className="object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="flex h-full w-full flex-col items-center justify-center px-4 py-3 text-center text-[#6E6A65]">
                        <Camera className="h-6 w-6 text-[#9A948C]" />
                        <span className="mt-1.5 text-xs font-semibold text-[#4A4743] font-display">
                          No Cover Photograph Yet
                        </span>
                        <span className="mt-0.5 text-[11px] text-[#857F77] font-body">
                          Minimum 3 photographs required before final submission
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="mt-2 flex items-center justify-between gap-2 text-xs text-[#6E6A65] font-body">
                    <span className="tabular-nums">
                      Photographs: {item.photoCount} of 15 uploaded
                    </span>
                    {item.photoCount < 3 && item.permissions.canEdit && (
                      <span className="font-semibold text-[#E85D3F] tabular-nums">
                        +{3 - item.photoCount} needed to submit
                      </span>
                    )}
                  </div>
                </div>
              );

              return (
                <article
                  key={item.id}
                  className="rounded-2xl border border-[#E5E0D8] bg-white transition hover:border-[#CFC9C0] overflow-hidden"
                >
                  <div className="p-4 sm:p-6">
                    <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 lg:gap-6">
                      {/* Desktop Left Column: Cover Image */}
                      {renderPhotoMediaBlock(false)}

                      {/* Details & Status Column (Right on Desktop, Full on Mobile) */}
                      <div className="lg:col-span-8 flex flex-col justify-between">
                        <div>
                          {/* 1. Submission Status and Listing Type */}
                          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-display">
                              <span
                                className={`font-bold ${getStatusAccentClass(
                                  item.submissionStatus
                                )}`}
                              >
                                {item.statusLabel}
                              </span>
                              <span aria-hidden="true" className="text-[#BDB8B0]">
                                ·
                              </span>
                              <span className="font-semibold text-[#111111]">
                                {item.listingType === 'RENTAL' ? 'Rent' : 'Resale'}
                              </span>
                              <span aria-hidden="true" className="text-[#BDB8B0]">
                                ·
                              </span>
                              <span className="text-[#4A4743]">
                                {formatPropertyTypeName(item.propertyType)}
                              </span>
                            </div>

                            <div className="hidden sm:flex items-center gap-x-2 text-[11px] text-[#857F77] font-body">
                              <span>Source: {item.listingSource}</span>
                              <span aria-hidden="true" className="text-[#D5D0C8]">
                                ·
                              </span>
                              <span className="font-mono tabular-nums">
                                Ref: {item.referenceId}
                              </span>
                            </div>
                          </div>

                          {/* 2. Property Title & 3. Property Price */}
                          <div className="mt-2 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                            <h2 className="font-display text-lg sm:text-xl font-bold text-[#111111] leading-snug">
                              {item.title}
                            </h2>
                            {item.priceLabel && (
                              <div className="font-display text-base sm:text-lg font-bold text-[#111111] tabular-nums shrink-0">
                                {item.priceLabel}
                              </div>
                            )}
                          </div>

                          {/* 4. Locality and Project Name */}
                          <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs sm:text-sm text-[#333333] font-body">
                            <span className="inline-flex items-center gap-1.5 font-medium text-[#111111]">
                              <MapPin className="h-3.5 w-3.5 shrink-0 text-[#E85D3F]" />
                              <span>
                                {item.locality ? `${item.locality}, ${item.city}` : item.city}
                              </span>
                            </span>
                            {item.projectName && (
                              <>
                                <span aria-hidden="true" className="text-[#BDB8B0]">
                                  ·
                                </span>
                                <span className="font-medium text-[#4A4743]">
                                  {item.projectName}
                                </span>
                              </>
                            )}
                          </div>

                          {/* 5 & 6. Mobile Photograph / Placeholder + Photo Count */}
                          {renderPhotoMediaBlock(true)}

                          {/* Next Action / Status Explanation */}
                          <p className="mt-3 text-xs sm:text-sm text-[#4A4743] font-body leading-relaxed">
                            {item.nextAction}
                          </p>

                          {/* Customer-Visible Review Feedback Callout */}
                          {item.latestFeedback && item.latestFeedback.submitterFeedback && (
                            <div
                              className={`mt-3.5 rounded-xl border p-3.5 sm:p-4 ${
                                item.submissionStatus === 'CHANGES_REQUESTED'
                                  ? 'border-[#E85D3F]/35 bg-[#FFF6F3]'
                                  : item.submissionStatus === 'APPROVED'
                                  ? 'border-[#1E7B4E]/30 bg-[#F2FBF6]'
                                  : 'border-[#E5E0D8] bg-[#FAFAF8]'
                              }`}
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="font-display text-xs font-bold text-[#111111]">
                                  {item.submissionStatus === 'CHANGES_REQUESTED'
                                    ? 'Verification Team Feedback — Changes Requested'
                                    : 'Verification Team Note'}
                                </span>
                                <span className="text-[11px] text-[#6E6A65] font-body tabular-nums">
                                  Reviewed {formatDateTimeDisplay(item.latestFeedback.createdAt)}
                                </span>
                              </div>
                              <p className="mt-1.5 text-xs sm:text-sm leading-relaxed text-[#222222] font-body">
                                {item.latestFeedback.submitterFeedback}
                              </p>
                            </div>
                          )}

                          {/* Secondary Metadata (Ref & Timestamps — Visually Quieter) */}
                          <div className="mt-3.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 border-t border-[#F0EDE8] pt-2.5 text-[11px] text-[#7A756E] font-body">
                            <span className="sm:hidden font-mono tabular-nums">
                              Ref: {item.referenceId}
                            </span>
                            <span aria-hidden="true" className="sm:hidden text-[#D5D0C8]">
                              ·
                            </span>
                            <span className="sm:hidden">Source: {item.listingSource}</span>
                            <span aria-hidden="true" className="sm:hidden text-[#D5D0C8]">
                              ·
                            </span>
                            <span className="tabular-nums">
                              Created {formatDateDisplay(item.createdAt)}
                            </span>
                            <span aria-hidden="true" className="text-[#D5D0C8]">
                              ·
                            </span>
                            <span className="tabular-nums">
                              Updated {formatDateDisplay(item.updatedAt)}
                            </span>
                            <span aria-hidden="true" className="text-[#D5D0C8]">
                              ·
                            </span>
                            <span className="tabular-nums">
                              Last activity {formatDateDisplay(item.lastActivityAt)}
                            </span>
                          </div>
                        </div>

                        {/* 7. Primary Action & 8. Secondary Actions and Activity History */}
                        <div className="mt-4 flex flex-col gap-3 border-t border-[#E5E0D8] pt-3.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                            {item.submissionStatus === 'DRAFT' && (
                              <Link
                                href={`/post-property/new?draftId=${encodeURIComponent(item.id)}`}
                                className="inline-flex min-h-[44px] w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-[#E85D3F] px-4 py-2.5 text-xs sm:text-sm font-semibold text-white transition hover:bg-[#D44E32] font-display"
                              >
                                <FileEdit className="h-4 w-4" />
                                <span>Continue Draft</span>
                              </Link>
                            )}

                            {item.submissionStatus === 'CHANGES_REQUESTED' && (
                              <Link
                                href={`/post-property/new?draftId=${encodeURIComponent(item.id)}`}
                                className="inline-flex min-h-[44px] w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-[#E85D3F] px-4 py-2.5 text-xs sm:text-sm font-semibold text-white transition hover:bg-[#D44E32] font-display"
                              >
                                <FileEdit className="h-4 w-4" />
                                <span>Edit &amp; Resubmit</span>
                              </Link>
                            )}

                            {item.submissionStatus === 'PUBLISHED' &&
                              item.listingType !== 'RENTAL' &&
                              (item.publishedListingSlug || item.resaleListingId) && (
                                <Link
                                  href={`/buy/${encodeURIComponent(
                                    String(item.publishedListingSlug || item.resaleListingId)
                                  )}`}
                                  className="inline-flex min-h-[44px] w-full sm:w-auto items-center justify-center gap-1.5 rounded-xl bg-[#1E7B4E] px-4 py-2.5 text-xs sm:text-sm font-semibold text-white transition hover:bg-[#17633E] font-display"
                                >
                                  <span>View Published Resale Listing</span>
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </Link>
                              )}

                            {item.submissionStatus === 'PUBLISHED' &&
                              item.listingType === 'RENTAL' &&
                              (item.publishedListingSlug || item.rentalListingId) && (
                                <Link
                                  href={`/rent/${encodeURIComponent(
                                    String(item.publishedListingSlug || item.rentalListingId)
                                  )}`}
                                  className="inline-flex min-h-[44px] w-full sm:w-auto items-center justify-center gap-1.5 rounded-xl bg-[#1E7B4E] px-4 py-2.5 text-xs sm:text-sm font-semibold text-white transition hover:bg-[#17633E] font-display"
                                >
                                  <span>View Published Rental Listing</span>
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </Link>
                              )}

                            {!item.permissions.canEdit && (
                              <Link
                                href={`/post-property/new?draftId=${encodeURIComponent(item.id)}`}
                                className="inline-flex min-h-[44px] w-full sm:w-auto items-center justify-center gap-2 rounded-xl border border-[#E5E0D8] bg-white px-4 py-2.5 text-xs sm:text-sm font-semibold text-[#111111] transition hover:bg-[#F5F3F0] font-display"
                              >
                                <ShieldCheck className="h-4 w-4 text-[#6E6A65]" />
                                <span>View Submission Summary</span>
                              </Link>
                            )}

                            <div className="flex flex-wrap items-center gap-2">
                              {item.permissions.canRequestCorrection && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setChangeRequestDraft({
                                      submissionId: item.id,
                                      requestType: 'CORRECTION',
                                      reason: '',
                                      requestedChangesNote: '',
                                    })
                                  }
                                  className="inline-flex min-h-[42px] flex-1 sm:flex-initial items-center justify-center gap-1.5 rounded-xl border border-[#E5E0D8] bg-white px-3.5 py-2 text-xs sm:text-sm font-semibold text-[#111111] transition hover:border-[#111111] hover:bg-[#FAFAF8] font-display cursor-pointer whitespace-nowrap"
                                >
                                  <FileEdit className="h-4 w-4 text-[#E85D3F]" />
                                  <span>Request Correction</span>
                                </button>
                              )}

                              {item.permissions.canRequestRemoval && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setChangeRequestDraft({
                                      submissionId: item.id,
                                      requestType: 'REMOVAL',
                                      reason: '',
                                      requestedChangesNote: '',
                                    })
                                  }
                                  className="inline-flex min-h-[42px] flex-1 sm:flex-initial items-center justify-center gap-1.5 rounded-xl border border-[#E5E0D8] bg-white px-3.5 py-2 text-xs sm:text-sm font-semibold text-[#4A4743] transition hover:border-[#C84B31] hover:text-[#C84B31] font-display cursor-pointer whitespace-nowrap"
                                >
                                  <XCircle className="h-4 w-4" />
                                  <span>Request Removal</span>
                                </button>
                              )}

                              {item.permissions.canWithdraw && !isConfirmingWithdraw && (
                                <button
                                  type="button"
                                  onClick={() => setConfirmWithdrawId(item.id)}
                                  className="inline-flex min-h-[42px] flex-1 sm:flex-initial items-center justify-center gap-1.5 rounded-xl border border-[#E5E0D8] bg-white px-3.5 py-2 text-xs sm:text-sm font-semibold text-[#4A4743] transition hover:bg-[#F5F3F0] hover:text-[#111111] font-display cursor-pointer whitespace-nowrap"
                                >
                                  <XCircle className="h-4 w-4 text-[#6E6A65]" />
                                  <span>Withdraw</span>
                                </button>
                              )}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => toggleTimeline(item.id)}
                            aria-expanded={isTimelineOpen}
                            className="inline-flex min-h-[40px] items-center justify-center sm:justify-end gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-[#555555] hover:bg-[#F5F3F0] hover:text-[#111111] font-display cursor-pointer self-start sm:self-center"
                          >
                            <Clock className="h-3.5 w-3.5 text-[#6E6A65]" />
                            <span>
                              Activity History
                              {(loadedTimelines[item.id]?.length ?? item.activityTimeline.length) > 0
                                ? ` (${loadedTimelines[item.id]?.length ?? item.activityTimeline.length})`
                                : ''}
                            </span>
                            {isTimelineOpen ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </button>
                        </div>

                        {/* Inline Post-Publication Change Request Box */}
                        {changeRequestDraft && changeRequestDraft.submissionId === item.id && (
                          <div className="mt-4 rounded-xl border border-[#E5E0D8] bg-[#FAFAF8] p-4 space-y-3">
                            <div className="flex items-center justify-between gap-2">
                              <p className="font-display text-xs sm:text-sm font-bold text-[#111111]">
                                {changeRequestDraft.requestType === 'REMOVAL'
                                  ? `Request Listing Removal / Deactivation (${item.referenceId})`
                                  : `Request Post-Publication Correction (${item.referenceId})`}
                              </p>
                              <div className="flex items-center gap-2 text-xs font-display">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setChangeRequestDraft((prev) =>
                                      prev ? { ...prev, requestType: 'CORRECTION' } : null
                                    )
                                  }
                                  className={`px-2.5 py-1 rounded-md border cursor-pointer ${
                                    changeRequestDraft.requestType === 'CORRECTION'
                                      ? 'border-[#111111] bg-[#111111] text-white font-semibold'
                                      : 'border-[#D9D5D0] bg-white text-[#555555]'
                                  }`}
                                >
                                  Correction
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setChangeRequestDraft((prev) =>
                                      prev ? { ...prev, requestType: 'REMOVAL' } : null
                                    )
                                  }
                                  className={`px-2.5 py-1 rounded-md border cursor-pointer ${
                                    changeRequestDraft.requestType === 'REMOVAL'
                                      ? 'border-[#C84B31] bg-[#C84B31] text-white font-semibold'
                                      : 'border-[#D9D5D0] bg-white text-[#555555]'
                                  }`}
                                >
                                  Removal
                                </button>
                              </div>
                            </div>

                            <div>
                              <label className="block font-display text-xs font-semibold text-[#333333]">
                                Reason for Request (Minimum 10 characters) *
                              </label>
                              <textarea
                                rows={2}
                                value={changeRequestDraft.reason}
                                onChange={(e) =>
                                  setChangeRequestDraft((prev) =>
                                    prev ? { ...prev, reason: e.target.value } : null
                                  )
                                }
                                placeholder={
                                  changeRequestDraft.requestType === 'REMOVAL'
                                    ? 'e.g., Property has been sold / rented out and should be removed from public search.'
                                    : 'e.g., Need to update the asking price and possession timeline after recent revision.'
                                }
                                className="mt-1.5 w-full rounded-lg border border-[#D9D5D0] bg-white p-2.5 text-xs sm:text-sm text-[#111111] outline-none focus:border-[#111111] font-body"
                              />
                            </div>

                            {changeRequestDraft.requestType === 'CORRECTION' && (
                              <div>
                                <label className="block font-display text-xs font-semibold text-[#333333]">
                                  Specific Changes Requested
                                </label>
                                <textarea
                                  rows={2}
                                  value={changeRequestDraft.requestedChangesNote}
                                  onChange={(e) =>
                                    setChangeRequestDraft((prev) =>
                                      prev
                                        ? { ...prev, requestedChangesNote: e.target.value }
                                        : null
                                    )
                                  }
                                  placeholder="Describe the exact fields or values you want our verification team to update."
                                  className="mt-1.5 w-full rounded-lg border border-[#D9D5D0] bg-white p-2.5 text-xs sm:text-sm text-[#111111] outline-none focus:border-[#111111] font-body"
                                />
                              </div>
                            )}

                            <div className="flex flex-wrap items-center gap-2.5">
                              <button
                                type="button"
                                disabled={submittingChangeRequest}
                                onClick={handleSubmitChangeRequest}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-[#111111] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#2A2A2A] disabled:opacity-60 font-display cursor-pointer"
                              >
                                {submittingChangeRequest ? (
                                  <>
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    <span>Submitting...</span>
                                  </>
                                ) : (
                                  <span>Submit Request</span>
                                )}
                              </button>
                              <button
                                type="button"
                                disabled={submittingChangeRequest}
                                onClick={() => setChangeRequestDraft(null)}
                                className="inline-flex items-center rounded-lg border border-[#D9D5D0] bg-white px-3.5 py-2 text-xs font-semibold text-[#111111] hover:bg-[#F5F3F0] font-display cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Inline Withdrawal Confirmation Box */}
                        {isConfirmingWithdraw && (
                          <div className="mt-4 rounded-xl border border-[#C84B31]/40 bg-[#FFF5F2] p-4">
                            <p className="font-display text-xs sm:text-sm font-bold text-[#111111]">
                              Confirm Withdrawal of {item.referenceId}?
                            </p>
                            <p className="mt-1 text-xs text-[#4A4743] font-body">
                              Withdrawing will close this submission and remove it from the Great
                              Homes verification queue. Withdrawn submissions cannot be reopened.
                            </p>
                            <div className="mt-3 flex flex-wrap items-center gap-2.5">
                              <button
                                type="button"
                                disabled={isWithdrawing}
                                onClick={() => handleWithdrawConfirmed(item.id)}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-[#C84B31] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#AD3D25] disabled:opacity-60 font-display cursor-pointer"
                              >
                                {isWithdrawing ? (
                                  <>
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    <span>Withdrawing...</span>
                                  </>
                                ) : (
                                  <span>Yes, Withdraw Submission</span>
                                )}
                              </button>
                              <button
                                type="button"
                                disabled={isWithdrawing}
                                onClick={() => setConfirmWithdrawId(null)}
                                className="inline-flex items-center rounded-lg border border-[#D9D5D0] bg-white px-3.5 py-2 text-xs font-semibold text-[#111111] hover:bg-[#F5F3F0] font-display cursor-pointer"
                              >
                                Keep Submission
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Expandable Activity & Review History Section */}
                  {isTimelineOpen && (
                    <div className="border-t border-[#E5E0D8] bg-[#FAFAF8] px-5 py-5 sm:px-7">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="font-display text-xs font-bold uppercase tracking-wider text-[#6E6A65]">
                          Submission Activity &amp; Verification Log
                        </h3>
                        <span className="font-mono text-[11px] text-[#6E6A65]">
                          ID: {item.id}
                        </span>
                      </div>

                      {loadingTimelineIds[item.id] ? (
                        <div className="mt-4 flex items-center gap-2 text-xs text-[#6E6A65] font-body">
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-[#E85D3F]" />
                          <span>Loading full activity history...</span>
                        </div>
                      ) : (
                        <ol className="mt-4 space-y-3">
                          {(loadedTimelines[item.id] ?? item.activityTimeline).map(
                            (act: SubmissionActivityItem) => (
                              <li
                                key={act.id}
                                className="rounded-xl border border-[#E5E0D8] bg-white p-3.5 text-xs sm:text-sm"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <span className="font-display font-bold text-[#111111]">
                                    {act.label}
                                  </span>
                                  <span className="text-xs text-[#6E6A65] font-body tabular-nums">
                                    {formatDateTimeDisplay(act.timestamp)}
                                  </span>
                                </div>
                                <p className="mt-1 text-xs sm:text-sm text-[#4A4743] font-body">
                                  {act.description}
                                </p>
                                {act.previousStatus && (
                                  <p className="mt-1 text-[11px] text-[#6E6A65] font-display">
                                    Transition: {act.previousStatus} → {act.newStatus}
                                  </p>
                                )}
                              </li>
                            )
                          )}
                        </ol>
                      )}
                    </div>
                  )}
                </article>
              );
            })}

            {/* Pagination Footer */}
            {pagination.totalPages > 1 && (
              <div className="mt-8 flex items-center justify-between rounded-2xl border border-[#E5E0D8] bg-white px-5 py-4">
                <p className="text-xs sm:text-sm text-[#555555] font-body tabular-nums">
                  Showing page {pagination.page} of {pagination.totalPages} ({pagination.total}{' '}
                  total)
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={pagination.page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="inline-flex items-center gap-1 rounded-xl border border-[#D9D5D0] bg-white px-3.5 py-2 text-xs font-semibold text-[#111111] hover:bg-[#F5F3F0] disabled:opacity-40 font-display cursor-pointer"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    <span>Previous</span>
                  </button>
                  <button
                    type="button"
                    disabled={pagination.page >= pagination.totalPages}
                    onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                    className="inline-flex items-center gap-1 rounded-xl border border-[#D9D5D0] bg-white px-3.5 py-2 text-xs font-semibold text-[#111111] hover:bg-[#F5F3F0] disabled:opacity-40 font-display cursor-pointer"
                  >
                    <span>Next</span>
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
