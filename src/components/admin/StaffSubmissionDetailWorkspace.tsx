'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  ArrowLeft,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  MapPin,
  Image as ImageIcon,
  FileCheck,
  UserCheck,
  Send,
  ExternalLink,
  RefreshCw,
  PhoneCall,
  Sparkles,
  CopyCheck,
  Eye,
  Lock,
  PowerOff,
  RotateCcw,
} from 'lucide-react';
import { useAdminAuth } from '@/src/components/admin/AdminAuthProvider';
import { getAdminHeaders } from '@/src/lib/adminAuth';
import { safeFetchJson } from '@/src/lib/safeApiFetch';

interface StaffSubmissionDetailWorkspaceProps {
  submissionId: string;
}

const CANONICAL_CHECKLIST_ITEMS: Array<{
  key:
    | 'ownershipClaimReviewed'
    | 'mediaQualityChecked'
    | 'locationVerified'
    | 'pricingReviewed'
    | 'duplicateChecked'
    | 'contactConfirmed';
  label: string;
}> = [
  {
    key: 'ownershipClaimReviewed',
    label: 'Ownership declaration / Partner attestation verified',
  },
  {
    key: 'mediaQualityChecked',
    label: 'Minimum 3 genuine property photographs verified (no watermarks/stock)',
  },
  {
    key: 'locationVerified',
    label: 'Kolkata locality, address & project linkage verified',
  },
  {
    key: 'pricingReviewed',
    label: 'Asking price / monthly rent & area measurements plausible',
  },
  {
    key: 'duplicateChecked',
    label: 'No duplicate active listing found for this unit',
  },
  {
    key: 'contactConfirmed',
    label: 'Telephonic / direct submitter contact confirmed (Mandatory before Approval)',
  },
];

function formatDateTimeIST(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  });
}

function formatDateIST(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });
}

export function StaffSubmissionDetailWorkspace({
  submissionId,
}: StaffSubmissionDetailWorkspaceProps) {
  const { role, displayName, hasCapability } = useAdminAuth();

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Reviewer & Checklist state
  const [reviewerInput, setReviewerInput] = useState('');
  const [checklist, setChecklist] = useState<Record<string, boolean>>({
    ownershipClaimReviewed: false,
    mediaQualityChecked: false,
    locationVerified: false,
    pricingReviewed: false,
    duplicateChecked: false,
    contactConfirmed: false,
  });
  const [contactNotesInput, setContactNotesInput] = useState('');

  // Review Notes & Submitter Feedback
  const [internalNotes, setInternalNotes] = useState('');
  const [submitterFeedback, setSubmitterFeedback] = useState('');

  // Curated Public Copy Editor state
  const [curatedHeadline, setCuratedHeadline] = useState('');
  const [curatedDescription, setCuratedDescription] = useState('');
  const [curatedLocality, setCuratedLocality] = useState('');
  const [curatedEditReason, setCuratedEditReason] = useState('');

  // SUPER_ADMIN Override state
  const [overrideTargetStatus, setOverrideTargetStatus] = useState('APPROVED');
  const [overrideJustification, setOverrideJustification] = useState('');
  const [overrideSubmitterFeedback, setOverrideSubmitterFeedback] = useState('');

  // Change Request staff response state
  const [changeRequestNotes, setChangeRequestNotes] = useState<Record<string, string>>({});
  const [duplicateResolutionNotes, setDuplicateResolutionNotes] = useState<Record<string, string>>(
    {}
  );

  const canReview = hasCapability('submission.review');
  const canRequestChanges = hasCapability('submission.requestChanges');
  const canAssign = hasCapability('submission.assign');
  const canManageNotes = hasCapability('submission.manageNotes');
  const canEditCurated = hasCapability('submission.editCurated');
  const canApprove = hasCapability('submission.approve');
  const canReject = hasCapability('submission.reject');
  const canPublish = hasCapability('submission.publish');
  const canDeactivate = hasCapability('submission.deactivate');
  const canReactivate = hasCapability('submission.reactivate');
  const canResolveDuplicate = hasCapability('submission.resolveDuplicate');
  const canResolveCorrection = hasCapability('submission.resolveCorrection');
  const canResolveRemoval = hasCapability('submission.resolveRemoval');
  const canOverride = role === 'SUPER_ADMIN' && hasCapability('submission.override');

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await safeFetchJson<any>(
        `/api/admin/property-submissions/${encodeURIComponent(submissionId)}`,
        {
          headers: getAdminHeaders(),
          cache: 'no-store',
        }
      );
      if (!result.ok || !result.data?.success) {
        throw new Error(result.error || 'Failed to load submission details.');
      }
      const json = result.data;
      setData(json);

      const sub = json.submission || {};
      const existingChecklist =
        json.reviewChecklist || sub.reviewChecklist || sub.verificationChecklist || {};
      setChecklist({
        ownershipClaimReviewed: Boolean(existingChecklist.ownershipClaimReviewed),
        mediaQualityChecked: Boolean(existingChecklist.mediaQualityChecked),
        locationVerified: Boolean(existingChecklist.locationVerified),
        pricingReviewed: Boolean(existingChecklist.pricingReviewed),
        duplicateChecked: Boolean(existingChecklist.duplicateChecked),
        contactConfirmed: Boolean(
          json.contactConfirmed || sub.contactConfirmed || existingChecklist.contactConfirmed
        ),
      });
      setReviewerInput(json.assignedReviewerId || sub.assignedReviewerId || displayName || '');
      setContactNotesInput(sub.contactConfirmationNotes || '');

      const originalPayload = json.originalPayload || sub.originalPayload || json.payload || sub.payload || {};
      const curatedPayload = json.curatedPayload || sub.curatedPayload || {};
      const origDet = originalPayload.details || {};
      const origLoc = originalPayload.location || {};
      const curDet = curatedPayload.details || {};
      const curLoc = curatedPayload.location || {};

      setCuratedHeadline(
        curDet.title ||
          curDet.headline ||
          curatedPayload.headline ||
          origDet.title ||
          origDet.headline ||
          ''
      );
      setCuratedDescription(curDet.description ?? origDet.description ?? '');
      setCuratedLocality(curLoc.customLocalityDisplay ?? curLoc.locality ?? origLoc.locality ?? '');
    } catch (err: any) {
      setError(err.message || 'Error loading submission.');
    } finally {
      setLoading(false);
    }
  }, [submissionId, displayName]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  const executePostJson = async (
    url: string,
    body: Record<string, any>,
    successMessage: string
  ) => {
    setActionLoading(true);
    setActionFeedback(null);
    try {
      const result = await safeFetchJson<any>(url, {
        method: 'POST',
        headers: getAdminHeaders(),
        body: JSON.stringify(body),
      });
      if (!result.ok || !result.data?.success) {
        setActionFeedback({
          type: 'error',
          message:
            result.error || 'Action could not be completed. Please review requirements.',
        });
        return false;
      }
      const json = result.data;
      setActionFeedback({
        type: 'success',
        message: json.message || successMessage,
      });
      await fetchDetail();
      return true;
    } catch (err: any) {
      setActionFeedback({
        type: 'error',
        message: err.message || 'Network error while executing staff action.',
      });
      return false;
    } finally {
      setActionLoading(false);
    }
  };

  const handleReviewAction = async (
    action:
      | 'START_REVIEW'
      | 'ASSIGN_REVIEWER'
      | 'UPDATE_CHECKLIST'
      | 'ADD_NOTE'
      | 'REQUEST_CHANGES'
  ) => {
    if (action === 'REQUEST_CHANGES' && submitterFeedback.trim().length < 10) {
      setActionFeedback({
        type: 'error',
        message:
          'Customer-visible feedback (minimum 10 characters) is required when requesting corrections.',
      });
      return;
    }
    if (action === 'ADD_NOTE' && internalNotes.trim().length < 2) {
      setActionFeedback({
        type: 'error',
        message: 'Please enter an internal review note before saving.',
      });
      return;
    }

    const ok = await executePostJson(
      `/api/admin/property-submissions/${encodeURIComponent(submissionId)}/action`,
      {
        action,
        assignedReviewerId: reviewerInput.trim() || displayName || undefined,
        internalNote:
          action === 'UPDATE_CHECKLIST' && contactNotesInput.trim()
            ? contactNotesInput.trim()
            : internalNotes.trim() || undefined,
        submitterFeedback: submitterFeedback.trim() || undefined,
        checklist,
        contactConfirmed: Boolean(checklist.contactConfirmed),
      },
      `Staff action (${action}) recorded.`
    );

    if (ok && (action === 'ADD_NOTE' || action === 'REQUEST_CHANGES')) {
      setInternalNotes('');
      setSubmitterFeedback('');
    }
  };

  const handleApproveSubmission = async () => {
    if (!checklist.contactConfirmed) {
      setActionFeedback({
        type: 'error',
        message:
          'Telephonic / direct submitter contact confirmation is mandatory before approving a submission.',
      });
      return;
    }
    await executePostJson(
      `/api/admin/property-submissions/${encodeURIComponent(submissionId)}/approve`,
      {
        internalNote:
          [internalNotes.trim(), contactNotesInput.trim()].filter(Boolean).join(' · ') ||
          'Verified and approved for Admin publication review.',
        submitterFeedback:
          submitterFeedback.trim() ||
          'Your property submission has been verified and approved by our verification specialists.',
        checklist,
        contactConfirmed: true,
      },
      'Submission verified and transitioned to APPROVED (ready for Admin publication).'
    );
  };

  const handleRejectSubmission = async () => {
    const reason = submitterFeedback.trim();
    if (reason.length < 10) {
      setActionFeedback({
        type: 'error',
        message:
          'Please provide a clear rejection reason for the submitter (minimum 10 characters) before rejecting.',
      });
      return;
    }
    await executePostJson(
      `/api/admin/property-submissions/${encodeURIComponent(submissionId)}/reject`,
      {
        reason,
        internalNote: internalNotes.trim() || 'Rejected during verification review.',
      },
      'Submission rejected and audit log recorded.'
    );
  };

  const handlePublishSubmission = async () => {
    await executePostJson(
      `/api/admin/property-submissions/${encodeURIComponent(submissionId)}/publish`,
      {},
      'Submission published to the live Great Homes marketplace.'
    );
  };

  const handleDeactivateListing = async () => {
    const reason =
      internalNotes.trim() ||
      submitterFeedback.trim() ||
      'Deactivated from public marketplace by Admin.';
    if (reason.length < 5) {
      setActionFeedback({
        type: 'error',
        message: 'Please provide a reason in Internal Review Notes before deactivating.',
      });
      return;
    }
    await executePostJson(
      `/api/admin/property-submissions/${encodeURIComponent(submissionId)}/deactivate`,
      {
        reason,
        internalNote: internalNotes.trim() || undefined,
      },
      'Public listing deactivated and removed from active discovery.'
    );
  };

  const handleReactivateListing = async () => {
    await executePostJson(
      `/api/admin/property-submissions/${encodeURIComponent(submissionId)}/reactivate`,
      {},
      'Listing reactivated and restored to public discovery.'
    );
  };

  const handleSaveCuratedEdits = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedTitle = curatedHeadline.trim();
    const trimmedDescription = curatedDescription.trim();
    const trimmedLocality = curatedLocality.trim();

    if (trimmedTitle && trimmedTitle.length < 5) {
      setActionFeedback({
        type: 'error',
        message: 'Curated headline must be at least 5 characters (or leave blank).',
      });
      return;
    }
    if (!trimmedTitle && !trimmedDescription && !trimmedLocality) {
      setActionFeedback({
        type: 'error',
        message: 'Provide at least a curated headline, locality, or description before saving.',
      });
      return;
    }

    const curatedPatch: Record<string, unknown> = {
      ...(trimmedTitle ? { title: trimmedTitle } : {}),
      ...(trimmedDescription ? { description: trimmedDescription } : {}),
      ...(trimmedLocality
        ? {
            customLocalityDisplay: trimmedLocality,
            location: { locality: trimmedLocality },
          }
        : {}),
      details: {
        ...(trimmedTitle ? { title: trimmedTitle } : {}),
        ...(trimmedDescription ? { description: trimmedDescription } : {}),
      },
    };

    const ok = await executePostJson(
      `/api/admin/property-submissions/${encodeURIComponent(submissionId)}/curated`,
      curatedPatch,
      'Curated public listing copy saved while preserving original customer submission.'
    );
    if (ok) {
      if (curatedEditReason.trim().length >= 2 && canManageNotes) {
        await fetch(`/api/admin/property-submissions/${encodeURIComponent(submissionId)}/action`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'ADD_NOTE',
            internalNote: `Curated edit note: ${curatedEditReason.trim()}`,
          }),
        }).catch(() => undefined);
      }
      setCuratedEditReason('');
    }
  };

  const handleSuperAdminOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canOverride) {
      setActionFeedback({
        type: 'error',
        message: 'Only SUPER_ADMIN can execute a verification override.',
      });
      return;
    }
    if (overrideJustification.trim().length < 15) {
      setActionFeedback({
        type: 'error',
        message:
          'Super Admin override requires a written justification of at least 15 characters.',
      });
      return;
    }
    const ok = await executePostJson(
      `/api/admin/property-submissions/${encodeURIComponent(submissionId)}/override`,
      {
        targetStatus: overrideTargetStatus,
        reason: overrideJustification.trim(),
        submitterFeedback: overrideSubmitterFeedback.trim() || undefined,
      },
      `Super Admin override to ${overrideTargetStatus} recorded with immutable audit log.`
    );
    if (ok) {
      setOverrideJustification('');
      setOverrideSubmitterFeedback('');
    }
  };

  const handleResolveDuplicateFlag = async (
    flagId: string,
    resolutionStatus: 'CONFIRMED_DUPLICATE' | 'DISMISSED'
  ) => {
    await executePostJson(
      `/api/admin/property-submissions/${encodeURIComponent(
        submissionId
      )}/duplicate-flags/${encodeURIComponent(flagId)}`,
      {
        resolutionStatus,
        resolutionNote:
          duplicateResolutionNotes[flagId]?.trim() ||
          `Resolved as ${resolutionStatus} during verification review.`,
      },
      `Duplicate flag marked as ${resolutionStatus}.`
    );
  };

  const handleResolveChangeRequest = async (
    reqId: string,
    status: 'APPROVED' | 'REJECTED' | 'APPLIED',
    requestType: 'CORRECTION' | 'REMOVAL'
  ) => {
    await executePostJson(
      `/api/admin/property-submissions/${encodeURIComponent(
        submissionId
      )}/change-requests/${encodeURIComponent(reqId)}`,
      {
        status,
        requestType,
        deactivateListing:
          requestType === 'REMOVAL' && (status === 'APPROVED' || status === 'APPLIED'),
        staffResponse:
          changeRequestNotes[reqId]?.trim() ||
          `Post-publication ${requestType.toLowerCase()} request processed (${status}).`,
      },
      `Change request updated to ${status}.`
    );
  };

  if (loading) {
    return (
      <div className="p-12 text-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-[#E85D3F] border-t-transparent mb-3" />
        <p className="text-neutral-500 text-sm font-body">
          Loading submission verification workspace...
        </p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <div className="p-6 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-sm space-y-3 font-body">
          <p className="font-semibold">{error || 'Submission not found'}</p>
          <Link
            href="/admin/property-submissions"
            className="inline-flex items-center gap-1.5 text-xs font-semibold underline font-display"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Return to Verification Queue
          </Link>
        </div>
      </div>
    );
  }

  const {
    submission,
    submitter,
    photos = [],
    attestation,
    reviews = [],
    duplicateFlags = [],
    changeRequests = [],
    publishedListingSlug,
  } = data;

  const payload = data.effectivePayload || data.payload || submission.payload || {};
  const originalPayload = data.originalPayload || submission.originalPayload || payload;
  const curatedPayload = data.curatedPayload || submission.curatedPayload || null;
  const loc = payload.location || {};
  const det = payload.details || {};
  const con = payload.consent || {};
  const propertyType = payload.propertyType || 'APARTMENT';
  const isPlot = propertyType === 'PLOT';
  const isResale = submission.listingType === 'RESALE';

  const bedroomCount = det.bedroomCount ?? det.bedrooms;
  const bathroomCount = det.bathroomCount ?? det.bathrooms;
  const carpetArea = det.carpetArea ?? det.carpetAreaSqFt;
  const superBuiltUpArea = det.superBuiltUpArea ?? det.superBuiltUpAreaSqFt;
  const builtUpArea = det.builtUpArea ?? det.builtUpAreaSqFt;
  const plotArea = det.plotArea ?? det.plotAreaSqFt;

  const derivedTitle =
    det.title ||
    det.headline ||
    curatedPayload?.headline ||
    `${isPlot ? 'Residential Plot' : `${bedroomCount ? `${bedroomCount} BHK ` : ''}${propertyType === 'INDEPENDENT_HOUSE' ? 'Independent House' : 'Apartment'}`} in ${loc.locality || loc.city || 'Kolkata'}`;
  const derivedReferenceId = submission.id ? `SUB-${String(submission.id).slice(-8).toUpperCase()}` : '—';
  const derivedPriceLabel = isResale
    ? det.askingPrice
      ? `₹${Number(det.askingPrice).toLocaleString('en-IN')}`
      : '—'
    : det.monthlyRent
    ? `₹${Number(det.monthlyRent).toLocaleString('en-IN')}/mo`
    : '—';

  const publicAttributionBadge =
    submission.listingSource === 'PARTNER' ? 'Listing Partner' : 'Owner Listed';
  const liveListingHref =
    submission.submissionStatus === 'PUBLISHED'
      ? isResale
        ? `/buy/${encodeURIComponent(
            String(publishedListingSlug || submission.resaleListingId || '')
          )}`
        : `/rent/${encodeURIComponent(
            String(publishedListingSlug || submission.rentalListingId || '')
          )}`
      : null;

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Top Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-neutral-200 pb-5">
        <div className="space-y-1">
          <Link
            href="/admin/property-submissions"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-500 hover:text-neutral-900 font-display"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Submissions Queue
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-display font-bold text-neutral-900">{derivedTitle}</h1>
            <span className="px-2.5 py-0.5 rounded-md text-xs font-mono bg-neutral-100 text-neutral-700 border border-neutral-200">
              {derivedReferenceId}
            </span>
            <span className="px-3 py-1 rounded-md text-xs font-bold bg-neutral-900 text-white font-display">
              {submission.submissionStatus}
            </span>
            <span className="px-2.5 py-0.5 rounded-md text-xs font-semibold bg-neutral-100 text-neutral-700 font-display">
              Role: {role || 'STAFF'}
            </span>
          </div>
          <p className="text-xs text-neutral-500 font-body">
            Submission ID: <span className="font-mono">{submission.id}</span> · Version:{' '}
            <span className="tabular-nums font-semibold">{data.version ?? submission.version ?? 1}</span> · Created:{' '}
            {formatDateTimeIST(submission.createdAt)}
          </p>
        </div>

        {/* Live Listing Link & Refresh */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={fetchDetail}
            disabled={actionLoading}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white border border-neutral-300 text-neutral-800 rounded-lg text-xs font-semibold hover:bg-neutral-50 font-display cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          {liveListingHref && (
            <Link
              href={liveListingHref}
              target="_blank"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 transition-colors shadow-xs font-display"
            >
              <span>
                View Live {isResale ? 'Resale (/buy)' : 'Rental (/rent)'} Listing
              </span>
              <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          )}
        </div>
      </div>

      {/* Inline Feedback Banner (Replaces all window.alert calls) */}
      {actionFeedback && (
        <div
          role="status"
          className={`rounded-xl border p-4 flex items-start justify-between gap-4 ${
            actionFeedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <div className="flex items-start gap-2.5 text-xs sm:text-sm font-body">
            {actionFeedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-700 shrink-0 mt-0.5" />
            )}
            <span>{actionFeedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionFeedback(null)}
            className="text-xs font-semibold underline font-display cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Columns: Property Details, Submitter, Photos, Curated Editor, Duplicates, Change Requests */}
        <div className="lg:col-span-2 space-y-6">
          {/* Submitter Contact & Identity Card (Staff-Only PII) */}
          <div className="bg-white rounded-2xl border border-neutral-200 p-6 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-100 pb-3">
              <h2 className="text-base font-display font-bold text-neutral-900 flex items-center gap-2">
                <PhoneCall className="w-4 h-4 text-[#E85D3F]" /> Submitter Identity &amp; Telephonic
                Verification (Staff Confidential)
              </h2>
              <span
                className={`px-2.5 py-0.5 rounded text-xs font-semibold font-display ${
                  checklist.contactConfirmed
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-amber-50 text-amber-800 border border-amber-200'
                }`}
              >
                {checklist.contactConfirmed
                  ? 'Telephonic Contact Confirmed'
                  : 'Telephonic Contact Pending'}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm font-body">
              <div>
                <span className="text-xs text-neutral-400 block">Submitter Name</span>
                <span className="font-semibold text-neutral-900">
                  {submitter?.name || 'Customer'}
                </span>
              </div>
              <div>
                <span className="text-xs text-neutral-400 block">Verified Mobile</span>
                <span className="font-mono font-semibold text-neutral-900 tabular-nums">
                  {submitter?.phone || '—'}
                </span>
              </div>
              <div>
                <span className="text-xs text-neutral-400 block">Email Address</span>
                <span className="font-medium text-neutral-900 break-all">
                  {submitter?.email || '—'}
                </span>
              </div>
              <div>
                <span className="text-xs text-neutral-400 block">Account Type &amp; Source</span>
                <span className="font-semibold text-neutral-900">
                  {submitter?.accountType || submission.listingSource} ({submission.listingSource})
                </span>
              </div>
            </div>
          </div>

          {/* Complete Property & Pricing Summary */}
          <div className="bg-white rounded-2xl border border-neutral-200 p-6 shadow-xs space-y-5">
            <h2 className="text-base font-display font-bold text-neutral-900 flex items-center gap-2 border-b border-neutral-100 pb-3">
              <MapPin className="w-4 h-4 text-[#E85D3F]" /> Property &amp; Location Specifications (
              {propertyType})
            </h2>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm font-body">
              <div>
                <span className="text-xs text-neutral-400 block">Listing Purpose</span>
                <span className="font-semibold text-neutral-900">{submission.listingType}</span>
              </div>
              <div>
                <span className="text-xs text-neutral-400 block">Property Type</span>
                <span className="font-semibold text-neutral-900">{propertyType}</span>
              </div>
              <div>
                <span className="text-xs text-neutral-400 block">City &amp; Locality</span>
                <span className="font-semibold text-neutral-900">
                  {loc.locality || '—'}, {loc.city || 'Kolkata'}
                  {loc.isCustomLocality ? ' (Custom Locality)' : ''}
                </span>
              </div>
              <div>
                <span className="text-xs text-neutral-400 block">Project / Building</span>
                <span className="font-medium text-neutral-900">
                  {loc.projectName || 'Standalone / Unlinked'}
                </span>
              </div>
              <div className="col-span-2">
                <span className="text-xs text-neutral-400 block">Full Address / Landmark</span>
                <span className="font-medium text-neutral-900">
                  {loc.address || loc.landmark || '—'}
                </span>
              </div>

              {isPlot ? (
                <>
                  <div>
                    <span className="text-xs text-neutral-400 block">
                      Plot Area (numeric(12,2))
                    </span>
                    <span className="font-semibold text-neutral-900 tabular-nums">
                      {plotArea ? `${plotArea} sq.ft.` : '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-neutral-400 block">Primary Facing</span>
                    <span className="font-medium text-neutral-900">{det.facing || '—'}</span>
                  </div>
                  <div>
                    <span className="text-xs text-neutral-400 block">Possession</span>
                    <span className="font-medium text-neutral-900">{det.possession || '—'}</span>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <span className="text-xs text-neutral-400 block">Configuration</span>
                    <span className="font-semibold text-neutral-900">
                      {det.configuration || (bedroomCount ? `${bedroomCount} BHK` : '—')}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-neutral-400 block">Bedrooms / Bathrooms</span>
                    <span className="font-medium text-neutral-900 tabular-nums">
                      {bedroomCount ?? '—'} Beds · {bathroomCount ?? '—'} Baths ·{' '}
                      {det.balconies ?? 0} Balconies
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-neutral-400 block">
                      Carpet / Built-Up / Super Built-Up
                    </span>
                    <span className="font-medium text-neutral-900 tabular-nums">
                      {carpetArea || '—'} / {builtUpArea || '—'} / {superBuiltUpArea || '—'} sq.ft.
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-neutral-400 block">
                      Floor Category &amp; Total Storeys
                    </span>
                    <span className="font-medium text-neutral-900">
                      {det.floorCategory || 'Not Specified'} ·{' '}
                      {det.totalFloors ? `${det.totalFloors} Storeys` : '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-neutral-400 block">Furnishing &amp; Facing</span>
                    <span className="font-medium text-neutral-900">
                      {det.furnishing || '—'} · {det.facing || '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-neutral-400 block">
                      Parking &amp; Property Age
                    </span>
                    <span className="font-medium text-neutral-900 tabular-nums">
                      {det.coveredParking ?? 0} Covered, {det.openParking ?? 0} Open · Age:{' '}
                      {det.propertyAgeYears ?? '—'} yrs
                    </span>
                  </div>
                </>
              )}

              <div>
                <span className="text-xs text-neutral-400 block">
                  {isResale ? 'Asking Price' : 'Monthly Rent'}
                </span>
                <span className="font-display font-bold text-neutral-900 tabular-nums">
                  {derivedPriceLabel}
                </span>
              </div>
              {!isResale && (
                <div>
                  <span className="text-xs text-neutral-400 block">
                    Security Deposit &amp; Maintenance
                  </span>
                  <span className="font-medium text-neutral-900 tabular-nums">
                    Deposit:{' '}
                    {det.securityDeposit
                      ? `₹${Number(det.securityDeposit).toLocaleString('en-IN')}`
                      : '—'}{' '}
                    · Maint:{' '}
                    {det.maintenance
                      ? `₹${Number(det.maintenance).toLocaleString('en-IN')}`
                      : '—'}
                  </span>
                </div>
              )}
              <div>
                <span className="text-xs text-neutral-400 block">Possession / Availability</span>
                <span className="font-medium text-neutral-900">
                  {det.possession || '—'}{' '}
                  {det.availabilityDate ? `(${formatDateIST(det.availabilityDate)})` : ''}
                </span>
              </div>
            </div>

            {Array.isArray(det.amenities) && det.amenities.length > 0 && (
              <div className="pt-3 border-t border-neutral-100">
                <span className="text-xs text-neutral-400 block mb-1.5 font-display">
                  Selected Amenities ({det.amenities.length})
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {det.amenities.map((slug: string) => (
                    <span
                      key={slug}
                      className="px-2.5 py-1 rounded-md bg-neutral-100 text-neutral-700 text-xs font-medium font-body"
                    >
                      {slug}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="pt-3 border-t border-neutral-100">
              <span className="text-xs text-neutral-400 block mb-1 font-display">
                Submitted Property Description
              </span>
              <p className="text-sm text-neutral-700 leading-relaxed whitespace-pre-line font-body">
                {det.description || 'No description provided.'}
              </p>
            </div>
          </div>

          {/* Original vs Curated Public Listing Copy & Public Preview Card */}
          <div className="bg-white rounded-2xl border border-neutral-200 p-6 shadow-xs space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-100 pb-3">
              <h2 className="text-base font-display font-bold text-neutral-900 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#E85D3F]" /> Original vs Curated Copy &amp;
                Public Preview
              </h2>
              <span className="text-xs text-neutral-500 font-body">
                {curatedPayload ? 'Curated Override Active' : 'Using Original Submitter Copy'}
              </span>
            </div>

            {/* Public Card Preview (Zero Submitter PII) */}
            <div className="rounded-xl border border-neutral-200 bg-[#FAFAF8] p-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-display font-bold uppercase tracking-wider text-neutral-500 flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5 text-[#E85D3F]" /> Public Discovery Preview (PII
                  Redacted)
                </span>
                <span className="px-2.5 py-0.5 rounded text-xs font-semibold bg-white border border-neutral-200 text-neutral-800 font-display">
                  {publicAttributionBadge} · Great Homes Verified
                </span>
              </div>
              <p className="font-display font-bold text-base text-neutral-900">
                {curatedHeadline || derivedTitle}
              </p>
              <p className="text-xs text-neutral-600 font-body">
                {curatedLocality || loc.locality || 'Kolkata'},{' '}
                {loc.city || 'Kolkata'} · {derivedPriceLabel}
              </p>
              <p className="text-xs text-neutral-700 line-clamp-3 font-body">
                {curatedDescription || det.description || '—'}
              </p>
              <p className="text-[11px] text-emerald-800 font-medium pt-1 font-body">
                Public Enquiry Routing: Managed exclusively via Great Homes CRM (Submitter phone,
                email, and name are never exposed publicly).
              </p>
            </div>

            {/* Original vs Curated Comparison */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-body">
              <div className="rounded-xl border border-neutral-200 p-3.5 bg-neutral-50 space-y-1.5">
                <span className="font-display font-bold text-neutral-800 block">
                  Original Customer Submission (Immutable)
                </span>
                <p className="text-neutral-600">
                  <strong>Locality:</strong>{' '}
                  {originalPayload?.location?.locality || loc.locality || '—'}
                </p>
                <p className="text-neutral-600 line-clamp-4">
                  <strong>Description:</strong>{' '}
                  {originalPayload?.details?.description || det.description || '—'}
                </p>
              </div>
              <div className="rounded-xl border border-neutral-200 p-3.5 bg-white space-y-1.5">
                <span className="font-display font-bold text-neutral-800 block">
                  Active Curated Override
                </span>
                {curatedPayload ? (
                  <>
                    <p className="text-neutral-700">
                      <strong>Headline:</strong>{' '}
                      {curatedPayload.details?.title ||
                        curatedPayload.headline ||
                        curatedPayload.details?.headline ||
                        '—'}
                    </p>
                    <p className="text-neutral-700">
                      <strong>Locality:</strong>{' '}
                      {curatedPayload.location?.customLocalityDisplay ||
                        curatedPayload.location?.locality ||
                        '—'}
                    </p>
                    <p className="text-neutral-700 line-clamp-4">
                      <strong>Description:</strong> {curatedPayload.details?.description || '—'}
                    </p>
                  </>
                ) : (
                  <p className="text-neutral-400 italic">
                    No curated edits saved yet. Public listing will use original customer copy.
                  </p>
                )}
              </div>
            </div>

            {canEditCurated && (
              <form
                onSubmit={handleSaveCuratedEdits}
                className="space-y-3 pt-3 border-t border-neutral-100"
              >
                <h3 className="text-xs font-display font-bold uppercase tracking-wider text-neutral-700">
                  Curate Public Headline &amp; Description
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-neutral-600 block mb-1 font-display">
                      Curated Public Headline
                    </label>
                    <input
                      type="text"
                      value={curatedHeadline}
                      onChange={(e) => setCuratedHeadline(e.target.value)}
                      placeholder="e.g., East-Facing 3 BHK in New Town Action Area I"
                      className="w-full px-3 py-2 text-xs bg-neutral-50 border border-neutral-300 rounded-lg font-body"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-neutral-600 block mb-1 font-display">
                      Curated Locality Label
                    </label>
                    <input
                      type="text"
                      value={curatedLocality}
                      onChange={(e) => setCuratedLocality(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-neutral-50 border border-neutral-300 rounded-lg font-body"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-neutral-600 block mb-1 font-display">
                    Curated Public Description
                  </label>
                  <textarea
                    rows={3}
                    value={curatedDescription}
                    onChange={(e) => setCuratedDescription(e.target.value)}
                    className="w-full p-2.5 text-xs bg-neutral-50 border border-neutral-300 rounded-lg font-body"
                  />
                </div>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  <input
                    type="text"
                    value={curatedEditReason}
                    onChange={(e) => setCuratedEditReason(e.target.value)}
                    placeholder="Editorial reason for curated adjustment (min 5 chars)..."
                    className="flex-1 px-3 py-2 text-xs bg-neutral-50 border border-neutral-300 rounded-lg font-body"
                  />
                  <button
                    type="submit"
                    disabled={actionLoading}
                    className="px-4 py-2 bg-neutral-900 text-white rounded-lg text-xs font-semibold hover:bg-neutral-800 disabled:opacity-50 font-display cursor-pointer shrink-0"
                  >
                    Save Curated Copy
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Photographs Gallery */}
          <div className="bg-white rounded-2xl border border-neutral-200 p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <h2 className="text-base font-display font-bold text-neutral-900 flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-[#E85D3F]" /> Uploaded Photographs (
                {photos.length})
              </h2>
              <span
                className={`text-xs font-semibold px-2.5 py-0.5 rounded font-display ${
                  photos.length >= 3
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-rose-50 text-rose-700'
                }`}
              >
                {photos.length >= 3
                  ? 'Meets 3-Photo Minimum (Static Photos Only)'
                  : 'Below 3-Photo Minimum'}
              </span>
            </div>

            {photos.length === 0 ? (
              <p className="text-sm text-neutral-500 py-4 text-center font-body">
                No photographs uploaded.
              </p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {photos.map((photo: any, idx: number) => (
                  <div
                    key={photo.id || idx}
                    className="group relative rounded-xl overflow-hidden border border-neutral-200 bg-neutral-100 aspect-4/3"
                  >
                    <Image
                      src={photo.url}
                      alt={photo.category || `Photo ${idx + 1}`}
                      fill
                      sizes="(max-width: 768px) 50vw, 240px"
                      className="object-cover"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute top-2 left-2 flex gap-1">
                      {photo.isCover && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#E85D3F] text-white shadow-xs font-display">
                          COVER
                        </span>
                      )}
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-black/70 text-white font-display">
                        {photo.category || 'IMAGE'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Consent & Partner Attestation Audit */}
          <div className="bg-white rounded-2xl border border-neutral-200 p-6 shadow-xs space-y-4">
            <h2 className="text-base font-display font-bold text-neutral-900 flex items-center gap-2 border-b border-neutral-100 pb-3">
              <FileCheck className="w-4 h-4 text-[#E85D3F]" /> Consent &amp; Attestation Audit
            </h2>
            <div className="text-sm space-y-2 font-body">
              <div className="flex items-center justify-between">
                <span className="text-neutral-500">Submission Source:</span>
                <span className="font-semibold text-neutral-900">{submission.listingSource}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-neutral-500">Owner Declaration Accepted:</span>
                <span className="font-semibold">
                  {con.ownerDeclarationAccepted ? 'Yes' : 'No'}
                </span>
              </div>
              {submission.listingSource === 'PARTNER' && (
                <div className="flex items-center justify-between">
                  <span className="text-neutral-500">Partner Attestation Recorded:</span>
                  <span className="font-semibold text-amber-800">
                    {attestation ? `Recorded (${attestation.attestationVersion})` : 'Missing'}
                  </span>
                </div>
              )}
              {con.declarationText && (
                <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-200 text-xs text-neutral-600 mt-2">
                  “{con.declarationText}”
                </div>
              )}
            </div>
          </div>

          {/* Duplicate Detection Flags */}
          {duplicateFlags.length > 0 && (
            <div className="bg-white rounded-2xl border border-amber-200 p-6 shadow-xs space-y-4">
              <h2 className="text-base font-display font-bold text-neutral-900 flex items-center gap-2 border-b border-neutral-100 pb-3">
                <CopyCheck className="w-4 h-4 text-amber-700" /> Duplicate Detection Flags (
                {duplicateFlags.length})
              </h2>
              <div className="space-y-3">
                {duplicateFlags.map((flag: any) => (
                  <div
                    key={flag.id}
                    className="p-3.5 rounded-xl border border-neutral-200 bg-neutral-50 space-y-2 text-xs font-body"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-display font-bold text-neutral-900">
                        Reason: {flag.matchReason} · Confidence: {flag.confidenceScore}%
                      </span>
                      <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 font-semibold font-display">
                        {flag.resolutionStatus}
                      </span>
                    </div>
                    <p className="text-neutral-600">
                      Matched Entity ({flag.matchedEntityType || 'UNKNOWN'}):{' '}
                      <span className="font-mono">{flag.matchedEntityId || '—'}</span>
                    </p>
                    {flag.resolutionNote && (
                      <p className="text-neutral-700">
                        <strong>Resolution Note:</strong> {flag.resolutionNote}
                      </p>
                    )}
                    {flag.resolutionStatus === 'OPEN' && canResolveDuplicate && (
                      <div className="flex flex-wrap items-center gap-2 pt-2">
                        <input
                          type="text"
                          placeholder="Resolution note..."
                          value={duplicateResolutionNotes[flag.id] || ''}
                          onChange={(e) =>
                            setDuplicateResolutionNotes((prev) => ({
                              ...prev,
                              [flag.id]: e.target.value,
                            }))
                          }
                          className="flex-1 min-w-[180px] px-2.5 py-1.5 bg-white border border-neutral-300 rounded-md text-xs"
                        />
                        <button
                          type="button"
                          disabled={actionLoading}
                          onClick={() => handleResolveDuplicateFlag(flag.id, 'DISMISSED')}
                          className="px-3 py-1.5 bg-neutral-900 text-white rounded-md font-semibold font-display cursor-pointer"
                        >
                          Dismiss Flag
                        </button>
                        <button
                          type="button"
                          disabled={actionLoading}
                          onClick={() =>
                            handleResolveDuplicateFlag(flag.id, 'CONFIRMED_DUPLICATE')
                          }
                          className="px-3 py-1.5 bg-rose-600 text-white rounded-md font-semibold font-display cursor-pointer"
                        >
                          Confirm Duplicate
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Post-Publication Change Requests */}
          {changeRequests.length > 0 && (
            <div className="bg-white rounded-2xl border border-neutral-200 p-6 shadow-xs space-y-4">
              <h2 className="text-base font-display font-bold text-neutral-900 border-b border-neutral-100 pb-3">
                Customer Post-Publication Change Requests ({changeRequests.length})
              </h2>
              <div className="space-y-3">
                {changeRequests.map((req: any) => {
                  const canResolveThis =
                    req.requestType === 'REMOVAL' ? canResolveRemoval : canResolveCorrection;
                  return (
                    <div
                      key={req.id}
                      className="p-4 rounded-xl border border-neutral-200 bg-neutral-50 space-y-2 text-xs font-body"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-display font-bold text-neutral-900">
                          {req.requestType} Request
                        </span>
                        <span className="px-2 py-0.5 rounded bg-neutral-200 text-neutral-800 font-semibold font-display">
                          {req.status}
                        </span>
                      </div>
                      <p className="text-neutral-700">
                        <strong>Customer Reason:</strong> {req.reason}
                      </p>
                      {req.requestedChanges?.summary && (
                        <p className="text-neutral-600">
                          <strong>Requested Changes:</strong> {req.requestedChanges.summary}
                        </p>
                      )}
                      {req.staffResponse && (
                        <p className="text-emerald-800">
                          <strong>Staff Response:</strong> {req.staffResponse}
                        </p>
                      )}
                      {req.status === 'PENDING' && canResolveThis && (
                        <div className="flex flex-wrap items-center gap-2 pt-2">
                          <input
                            type="text"
                            placeholder="Staff response to customer..."
                            value={changeRequestNotes[req.id] || ''}
                            onChange={(e) =>
                              setChangeRequestNotes((prev) => ({
                                ...prev,
                                [req.id]: e.target.value,
                              }))
                            }
                            className="flex-1 min-w-[180px] px-2.5 py-1.5 bg-white border border-neutral-300 rounded-md text-xs"
                          />
                          <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() =>
                              handleResolveChangeRequest(req.id, 'APPLIED', req.requestType)
                            }
                            className="px-3 py-1.5 bg-emerald-600 text-white rounded-md font-semibold font-display cursor-pointer"
                          >
                            {req.requestType === 'REMOVAL'
                              ? 'Approve & Deactivate Listing'
                              : 'Mark Applied'}
                          </button>
                          <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() =>
                              handleResolveChangeRequest(req.id, 'REJECTED', req.requestType)
                            }
                            className="px-3 py-1.5 bg-rose-600 text-white rounded-md font-semibold font-display cursor-pointer"
                          >
                            Reject Request
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Verification Checklist, Stage Transitions, Publication & Super Admin Override */}
        <div className="space-y-6">
          {/* Reviewer Assignment & Canonical Verification Checklist */}
          <div className="bg-white rounded-2xl border border-neutral-200 p-6 shadow-xs space-y-5">
            <h2 className="text-base font-display font-bold text-neutral-900 flex items-center gap-2 border-b border-neutral-100 pb-3">
              <ShieldCheck className="w-4 h-4 text-[#E85D3F]" /> Staff Verification Controls
            </h2>

            {/* Reviewer Assignment */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-neutral-700 block font-display">
                Assigned Verification Specialist
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={reviewerInput}
                  onChange={(e) => setReviewerInput(e.target.value)}
                  placeholder="Reviewer name or ID..."
                  className="flex-1 px-3 py-1.5 text-xs bg-neutral-50 border border-neutral-300 rounded-lg font-body"
                />
                {canAssign && (
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => handleReviewAction('ASSIGN_REVIEWER')}
                    className="px-3 py-1.5 bg-neutral-900 text-white rounded-lg text-xs font-semibold hover:bg-neutral-800 disabled:opacity-50 font-display cursor-pointer"
                  >
                    Assign
                  </button>
                )}
              </div>
            </div>

            {/* Canonical 6-Item Verification Checklist */}
            <div className="space-y-2.5 pt-2 border-t border-neutral-100">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-neutral-600 uppercase tracking-wider font-display">
                  Verification Checklist
                </span>
                {canReview && (
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => handleReviewAction('UPDATE_CHECKLIST')}
                    className="text-xs font-semibold text-[#E85D3F] hover:underline font-display cursor-pointer"
                  >
                    Save Checklist
                  </button>
                )}
              </div>

              {CANONICAL_CHECKLIST_ITEMS.map((item) => (
                <label
                  key={item.key}
                  className={`flex items-start gap-2.5 text-xs cursor-pointer p-2 rounded-lg border ${
                    item.key === 'contactConfirmed'
                      ? 'border-emerald-200 bg-emerald-50/50 font-semibold text-neutral-900'
                      : 'border-transparent text-neutral-700'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={Boolean(checklist[item.key])}
                    onChange={(e) =>
                      setChecklist((prev) => ({ ...prev, [item.key]: e.target.checked }))
                    }
                    className="mt-0.5 rounded border-neutral-300 text-[#E85D3F]"
                  />
                  <span>{item.label}</span>
                </label>
              ))}

              <div>
                <label className="text-xs font-medium text-neutral-600 block mb-1 font-display">
                  Telephonic Contact Confirmation Notes
                </label>
                <input
                  type="text"
                  value={contactNotesInput}
                  onChange={(e) => setContactNotesInput(e.target.value)}
                  placeholder="e.g., Spoke with owner at +91-98300XXXXX; confirmed asking price & availability."
                  className="w-full px-3 py-1.5 text-xs bg-neutral-50 border border-neutral-300 rounded-lg font-body"
                />
              </div>
            </div>

            {/* Internal Review Notes */}
            <div className="space-y-1.5 pt-2 border-t border-neutral-100">
              <label className="text-xs font-semibold text-neutral-700 block font-display">
                Internal Staff Review Notes (Hidden from Customer)
              </label>
              <textarea
                rows={2}
                placeholder="Record internal verification findings, pricing checks, or deactivation reason..."
                value={internalNotes}
                onChange={(e) => setInternalNotes(e.target.value)}
                className="w-full p-2.5 text-xs bg-neutral-50 border border-neutral-300 rounded-lg focus:outline-none focus:border-neutral-900 font-body"
              />
            </div>

            {/* Customer-Visible Feedback */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-neutral-700 block font-display">
                Customer-Visible Feedback (Required for Changes Requested / Rejection)
              </label>
              <textarea
                rows={3}
                placeholder="Explain clearly what the submitter needs to update (min 10 chars)..."
                value={submitterFeedback}
                onChange={(e) => setSubmitterFeedback(e.target.value)}
                className="w-full p-2.5 text-xs bg-neutral-50 border border-neutral-300 rounded-lg focus:outline-none focus:border-neutral-900 font-body"
              />
            </div>

            {/* Role-Gated Action Buttons */}
            <div className="space-y-2.5 pt-3 border-t border-neutral-100">
              {canReview && submission.submissionStatus === 'SUBMITTED' && (
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={() => handleReviewAction('START_REVIEW')}
                  className="w-full py-2.5 px-4 bg-amber-600 text-white rounded-xl text-xs font-semibold hover:bg-amber-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 font-display cursor-pointer"
                >
                  <Clock className="w-4 h-4" /> Start Verification Review (UNDER_REVIEW)
                </button>
              )}

              {canRequestChanges &&
                ['SUBMITTED', 'UNDER_REVIEW', 'APPROVED'].includes(
                  submission.submissionStatus
                ) && (
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => handleReviewAction('REQUEST_CHANGES')}
                    className="w-full py-2.5 px-4 bg-orange-600 text-white rounded-xl text-xs font-semibold hover:bg-orange-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 font-display cursor-pointer"
                  >
                    <AlertTriangle className="w-4 h-4" /> Request Corrections from Submitter
                  </button>
                )}

              {/* Step 1: Verification Approval (Transitions to APPROVED — Never directly publishes) */}
              {canApprove &&
                ['SUBMITTED', 'UNDER_REVIEW'].includes(
                  submission.submissionStatus
                ) && (
                  <button
                    type="button"
                    disabled={actionLoading || photos.length < 3}
                    onClick={handleApproveSubmission}
                    className="w-full py-2.5 px-4 bg-sky-700 text-white rounded-xl text-xs font-semibold hover:bg-sky-800 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 font-display cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4" /> Verify &amp; Approve (Ready for Admin
                    Publish)
                  </button>
                )}

              {/* Step 2: Final Admin Publication Review (Transitions APPROVED -> PUBLISHED) */}
              {canPublish && submission.submissionStatus === 'APPROVED' && (
                <button
                  type="button"
                  disabled={actionLoading || photos.length < 3}
                  onClick={handlePublishSubmission}
                  className="w-full py-3 px-4 bg-emerald-600 text-white rounded-xl text-xs sm:text-sm font-bold hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 font-display cursor-pointer shadow-xs"
                >
                  <Sparkles className="w-4 h-4" /> Publish Listing to Live Marketplace
                </button>
              )}

              {/* Deactivate Live Listing (PUBLISHED -> DEACTIVATED) */}
              {canDeactivate && submission.submissionStatus === 'PUBLISHED' && (
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={handleDeactivateListing}
                  className="w-full py-2.5 px-4 bg-neutral-800 text-white rounded-xl text-xs font-semibold hover:bg-neutral-900 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 font-display cursor-pointer"
                >
                  <PowerOff className="w-4 h-4" /> Deactivate Public Listing
                </button>
              )}

              {/* Reactivate Listing (DEACTIVATED -> PUBLISHED) */}
              {canReactivate && submission.submissionStatus === 'DEACTIVATED' && (
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={handleReactivateListing}
                  className="w-full py-2.5 px-4 bg-emerald-700 text-white rounded-xl text-xs font-semibold hover:bg-emerald-800 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 font-display cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" /> Reactivate Public Listing
                </button>
              )}

              {/* Reject Submission */}
              {canReject &&
                ['SUBMITTED', 'UNDER_REVIEW', 'CHANGES_REQUESTED', 'APPROVED'].includes(
                  submission.submissionStatus
                ) && (
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={handleRejectSubmission}
                    className="w-full py-2.5 px-4 bg-rose-600 text-white rounded-xl text-xs font-semibold hover:bg-rose-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 font-display cursor-pointer"
                  >
                    <XCircle className="w-4 h-4" /> Reject Submission
                  </button>
                )}

              {canManageNotes && (
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={() => handleReviewAction('ADD_NOTE')}
                  className="w-full py-2 px-4 bg-neutral-100 text-neutral-800 rounded-xl text-xs font-semibold hover:bg-neutral-200 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 font-display cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" /> Save Internal Review Note Only
                </button>
              )}
            </div>
          </div>

          {/* SUPER_ADMIN Verification Override Panel */}
          {canOverride && (
            <form
              onSubmit={handleSuperAdminOverride}
              className="bg-white rounded-2xl border-2 border-neutral-900 p-6 shadow-xs space-y-4"
            >
              <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
                <h2 className="text-sm font-display font-bold text-neutral-900 flex items-center gap-2">
                  <Lock className="w-4 h-4 text-[#E85D3F]" /> Super Admin Verification Override
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-neutral-900 text-white font-display">
                  SUPER_ADMIN ONLY
                </span>
              </div>

              <p className="text-xs text-neutral-600 font-body">
                Overrides verification state with mandatory written justification and immutable
                audit logging. Cannot bypass partner eligibility, 3-photo minimum, or mandatory
                property validation.
              </p>

              <div>
                <label className="text-xs font-semibold text-neutral-700 block mb-1 font-display">
                  Target Override Status
                </label>
                <select
                  value={overrideTargetStatus}
                  onChange={(e) => setOverrideTargetStatus(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-neutral-50 border border-neutral-300 rounded-lg font-display"
                >
                  <option value="UNDER_REVIEW">UNDER_REVIEW</option>
                  <option value="CHANGES_REQUESTED">CHANGES_REQUESTED</option>
                  <option value="APPROVED">APPROVED</option>
                  <option value="REJECTED">REJECTED</option>
                  <option value="DEACTIVATED">DEACTIVATED</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-neutral-700 block mb-1 font-display">
                  Mandatory Written Justification (Min 15 characters) *
                </label>
                <textarea
                  rows={2}
                  value={overrideJustification}
                  onChange={(e) => setOverrideJustification(e.target.value)}
                  placeholder="Document executive reason for overriding standard verification workflow..."
                  className="w-full p-2.5 text-xs bg-neutral-50 border border-neutral-300 rounded-lg font-body"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-neutral-700 block mb-1 font-display">
                  Optional Customer Note
                </label>
                <input
                  type="text"
                  value={overrideSubmitterFeedback}
                  onChange={(e) => setOverrideSubmitterFeedback(e.target.value)}
                  placeholder="Optional note visible to submitter..."
                  className="w-full px-3 py-2 text-xs bg-neutral-50 border border-neutral-300 rounded-lg font-body"
                />
              </div>

              <button
                type="submit"
                disabled={actionLoading}
                className="w-full py-2.5 px-4 bg-neutral-900 text-white rounded-xl text-xs font-bold hover:bg-[#E85D3F] transition-colors disabled:opacity-50 font-display cursor-pointer"
              >
                Execute Super Admin Override
              </button>
            </form>
          )}

          {/* Review Audit Log */}
          <div className="bg-white rounded-2xl border border-neutral-200 p-6 shadow-xs space-y-4">
            <h2 className="text-base font-display font-bold text-neutral-900 border-b border-neutral-100 pb-3">
              Immutable Verification Audit Trail ({reviews.length})
            </h2>

            {reviews.length === 0 ? (
              <p className="text-xs text-neutral-400 text-center py-4 font-body">
                No staff actions recorded yet.
              </p>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                {reviews.map((item: any) => (
                  <div
                    key={item.id}
                    className="p-3 rounded-xl bg-neutral-50 border border-neutral-200 text-xs space-y-1.5 font-body"
                  >
                    <div className="flex items-center justify-between font-semibold text-neutral-900 font-display">
                      <span>{item.eventType || item.action || 'EVENT'}</span>
                      <span className="text-[10px] text-neutral-400 font-normal tabular-nums">
                        {formatDateTimeIST(item.createdAt)}
                      </span>
                    </div>
                    <div className="text-[11px] text-neutral-500 flex items-center gap-1">
                      <UserCheck className="w-3 h-3" /> {item.staffUserId || 'System'}
                    </div>
                    {item.previousStatus && (
                      <div className="text-[11px] text-neutral-600 font-display">
                        Status: <span className="font-mono">{item.previousStatus}</span> →{' '}
                        <span className="font-mono font-semibold">{item.newStatus}</span>
                      </div>
                    )}
                    {item.eventType === 'OVERRIDE' && (
                      <div className="p-2 rounded bg-amber-50 text-amber-900 border border-amber-200">
                        <strong>SUPER_ADMIN OVERRIDE:</strong>{' '}
                        {item.metadata?.overrideReason || item.internalNote || item.submitterFeedback || 'Recorded'}
                      </div>
                    )}
                    {item.internalNote && (
                      <div className="p-2 rounded bg-white text-neutral-700 border border-neutral-200">
                        <strong>Internal:</strong> {item.internalNote}
                      </div>
                    )}
                    {item.submitterFeedback && (
                      <div className="p-2 rounded bg-orange-50 text-orange-900 border border-orange-200">
                        <strong>To Customer:</strong> {item.submitterFeedback}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
