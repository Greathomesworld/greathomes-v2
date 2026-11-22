'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { AdminPageHeader } from './AdminPageHeader';
import { AdminStatCard } from './AdminStatCard';
import { AdminTable, ColumnDef } from './AdminTable';
import { AdminSearch } from './AdminSearch';
import { AdminBadge } from './AdminBadge';
import { useAdminAuth } from './AdminAuthProvider';
import { getAdminHeaders } from '@/src/lib/adminAuth';
import { safeFetchJson } from '@/src/lib/safeApiFetch';
import type {
  AdminPartnerListItem,
  AdminPartnerDetailDto,
  PartnerAdminAction,
} from '@/src/domain/customer/partnerService';
import {
  Building2,
  CheckCircle2,
  Clock,
  ShieldAlert,
  Ban,
  XCircle,
  Eye,
  RotateCcw,
  Phone,
  MapPin,
  FileCheck2,
  X,
  AlertTriangle,
  Loader2,
} from 'lucide-react';

const STATUS_TABS: Array<{ key: string; label: string }> = [
  { key: 'ALL', label: 'All Applications' },
  { key: 'PENDING', label: 'Pending Review' },
  { key: 'ACTIVE', label: 'Active Partners' },
  { key: 'REJECTED', label: 'Rejected' },
  { key: 'SUSPENDED', label: 'Suspended' },
  { key: 'REVOKED', label: 'Revoked' },
];

export function AdminPartnersWorkspace() {
  const { hasCapability } = useAdminAuth();

  const [items, setItems] = useState<AdminPartnerListItem[]>([]);
  const [counts, setCounts] = useState({
    ALL: 0,
    PENDING: 0,
    ACTIVE: 0,
    REJECTED: 0,
    SUSPENDED: 0,
    REVOKED: 0,
  });
  const [countsLoaded, setCountsLoaded] = useState(false);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedbackBanner, setFeedbackBanner] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const [selectedDetail, setSelectedDetail] = useState<AdminPartnerDetailDto | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [actionModal, setActionModal] = useState<{
    action: PartnerAdminAction;
    partnerId: string;
    agencyName: string;
  } | null>(null);
  const [actionReason, setActionReason] = useState('');
  const [actionSubmitting, setActionSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchPartners = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      if (searchQuery.trim()) params.set('search', searchQuery.trim());
      params.set('page', String(page));
      params.set('limit', '20');

      const result = await safeFetchJson<any>(`/api/admin/partners?${params.toString()}`, {
        headers: getAdminHeaders(),
        cache: 'no-store',
      });
      if (!result.ok || !result.data?.success) {
        setError(result.error || 'Failed to load partner applications.');
        setItems([]);
        setCountsLoaded(false);
        return;
      }
      const data = result.data;
      setItems(data.items || []);
      if (data.countsByStatus) {
        setCounts(data.countsByStatus);
        setCountsLoaded(true);
      } else {
        setCountsLoaded(true);
      }
      setTotalPages(data.pagination?.totalPages || 1);
    } catch {
      setError('Network error while loading partner applications.');
      setCountsLoaded(false);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, searchQuery, page]);

  useEffect(() => {
    fetchPartners();
  }, [fetchPartners]);

  const openPartnerDetail = async (id: string) => {
    setDetailLoading(true);
    setSelectedDetail(null);
    try {
      const result = await safeFetchJson<any>(`/api/admin/partners/${encodeURIComponent(id)}`, {
        headers: getAdminHeaders(),
        cache: 'no-store',
      });
      if (!result.ok || !result.data?.success) {
        setFeedbackBanner({
          type: 'error',
          message: result.error || 'Unable to load partner application details.',
        });
        return;
      }
      const data = result.data;
      setSelectedDetail({
        profile: data.profile,
        auditHistory: data.auditHistory || [],
      });
    } catch {
      setFeedbackBanner({
        type: 'error',
        message: 'Network error loading partner application details.',
      });
    } finally {
      setDetailLoading(false);
    }
  };

  const openActionDialog = (
    action: PartnerAdminAction,
    partnerId: string,
    agencyName: string
  ) => {
    setActionModal({ action, partnerId, agencyName });
    setActionReason('');
    setActionError(null);
  };

  const executePartnerAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!actionModal) return;

    const needsReason =
      actionModal.action === 'REJECT' ||
      actionModal.action === 'SUSPEND' ||
      actionModal.action === 'REVOKE';
    if (needsReason && actionReason.trim().length < 5) {
      setActionError(`Please enter a clear reason (at least 5 characters) for ${actionModal.action}.`);
      return;
    }

    setActionSubmitting(true);
    setActionError(null);
    try {
      const result = await safeFetchJson<any>(
        `/api/admin/partners/${encodeURIComponent(actionModal.partnerId)}/action`,
        {
          method: 'POST',
          headers: getAdminHeaders(),
          body: JSON.stringify({
            action: actionModal.action,
            reason: actionReason.trim() || undefined,
          }),
        }
      );
      if (!result.ok || !result.data?.success) {
        setActionError(result.error || 'Unable to execute partner status transition.');
        return;
      }
      const data = result.data;

      setActionModal(null);
      setSelectedDetail({
        profile: data.profile,
        auditHistory: data.auditHistory || [],
      });
      setFeedbackBanner({
        type: 'success',
        message: `Partner "${actionModal.agencyName}" updated to ${data.profile?.status || 'updated status'}.`,
      });
      fetchPartners();
    } catch {
      setActionError('Network error while executing partner action.');
    } finally {
      setActionSubmitting(false);
    }
  };

  const canApprove = hasCapability('partner.approve');
  const canReject = hasCapability('partner.reject');
  const canSuspend = hasCapability('partner.suspend');
  const canRevoke = hasCapability('partner.revoke');
  const canReactivate = hasCapability('partner.reactivate');

  const columns: ColumnDef<AdminPartnerListItem>[] = [
    {
      header: 'Agency & Contact',
      cell: (row) => (
        <div className="min-w-0">
          <div className="text-xs font-semibold text-neutral-900 font-display truncate">
            {row.agencyName || 'Unnamed Agency'}
          </div>
          <div className="text-[11px] text-neutral-500 truncate">
            {row.customerName} · {row.agencyContactPhone || row.customerPhone || 'No phone'}
          </div>
        </div>
      ),
    },
    {
      header: 'Locality & City',
      cell: (row) => (
        <div className="text-xs text-neutral-700">
          <div>{row.locality || '—'}</div>
          <div className="text-[11px] text-neutral-500">{row.city || 'Kolkata'}</div>
        </div>
      ),
    },
    {
      header: 'Status',
      cell: (row) => <AdminBadge variant={row.status} size="sm" />,
    },
    {
      header: 'Declaration',
      cell: (row) => (
        <span
          className={`inline-flex items-center gap-1 text-[11px] font-medium ${
            row.declarationAccepted ? 'text-emerald-700' : 'text-neutral-500'
          }`}
        >
          <FileCheck2 className="h-3.5 w-3.5" />
          {row.declarationAccepted ? 'Accepted' : 'Pending'}
        </span>
      ),
    },
    {
      header: 'Submissions',
      cell: (row) => (
        <span className="font-mono text-xs font-semibold text-neutral-800 tabular-nums">
          {row.submissionCount}
        </span>
      ),
    },
    {
      header: 'Updated',
      cell: (row) => (
        <span className="font-mono text-[11px] text-neutral-500">
          {new Date(row.updatedAt).toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            timeZone: 'Asia/Kolkata',
          })}
        </span>
      ),
    },
    {
      header: 'Actions',
      className: 'text-right',
      cell: (row) => (
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => openPartnerDetail(row.id)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-xs font-medium text-neutral-800 hover:bg-neutral-50 cursor-pointer"
          >
            <Eye className="h-3.5 w-3.5" />
            <span>Review</span>
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      <AdminPageHeader
        title="Listing Partner Applications"
        description="Verify agency onboarding applications, enforce one-login-per-agency governance, and manage partner privileges."
        breadcrumbs={[
          { label: 'Admin', href: '/admin' },
          { label: 'Partner Applications' },
        ]}
      />

      {/* KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <AdminStatCard
          title="Total Agencies"
          value={countsLoaded && !error ? counts.ALL : '—'}
          icon={<Building2 className="h-4 w-4" />}
        />
        <AdminStatCard
          title="Pending Review"
          value={countsLoaded && !error ? counts.PENDING : '—'}
          badgeText="Action Needed"
          badgeVariant="amber"
          icon={<Clock className="h-4 w-4" />}
        />
        <AdminStatCard
          title="Active Partners"
          value={countsLoaded && !error ? counts.ACTIVE : '—'}
          badgeText="Verified"
          badgeVariant="success"
          icon={<CheckCircle2 className="h-4 w-4" />}
        />
        <AdminStatCard
          title="Suspended"
          value={countsLoaded && !error ? counts.SUSPENDED : '—'}
          icon={<ShieldAlert className="h-4 w-4" />}
        />
        <AdminStatCard
          title="Rejected / Revoked"
          value={countsLoaded && !error ? counts.REJECTED + counts.REVOKED : '—'}
          icon={<Ban className="h-4 w-4" />}
        />
      </div>

      {feedbackBanner && (
        <div
          role="status"
          className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-xs font-medium ${
            feedbackBanner.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-rose-200 bg-rose-50 text-rose-900'
          }`}
        >
          <span>{feedbackBanner.message}</span>
          <button
            type="button"
            onClick={() => setFeedbackBanner(null)}
            className="p-1 rounded hover:bg-black/5 cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Filter Tabs + Search */}
      <div className="bg-white border border-neutral-200/80 rounded-xl p-4 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 pb-3">
          <div className="flex flex-wrap gap-1.5">
            {STATUS_TABS.map((tab) => {
              const active = statusFilter === tab.key;
              const tabCount =
                countsLoaded && !error ? counts[tab.key as keyof typeof counts] ?? 0 : '—';
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => {
                    setStatusFilter(tab.key);
                    setPage(1);
                  }}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                    active
                      ? 'bg-neutral-900 text-white'
                      : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`font-mono text-[11px] tabular-nums ${
                      active ? 'text-neutral-300' : 'text-neutral-500'
                    }`}
                  >
                    {tabCount}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="w-full sm:w-72">
            <AdminSearch
              value={searchQuery}
              onChange={(val) => {
                setSearchQuery(val);
                setPage(1);
              }}
              placeholder="Search agency, locality, phone..."
            />
          </div>
        </div>

        {error && (
          <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              <span>{error}</span>
            </div>
            <button
              type="button"
              onClick={fetchPartners}
              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-900 hover:bg-rose-100 cursor-pointer shrink-0"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Retry</span>
            </button>
          </div>
        )}

        <AdminTable
          columns={columns}
          data={items}
          keyExtractor={(item) => item.id}
          isLoading={loading}
          emptyMessage="No partner applications match your current filter."
        />

        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-2 text-xs text-neutral-600">
            <span>
              Page {page} of {totalPages}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-lg border border-neutral-200 px-3 py-1.5 disabled:opacity-40 cursor-pointer"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="rounded-lg border border-neutral-200 px-3 py-1.5 disabled:opacity-40 cursor-pointer"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Partner Detail Drawer Modal */}
      {(detailLoading || selectedDetail) && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex justify-end">
          <div className="bg-white w-full max-w-2xl h-full overflow-y-auto shadow-2xl border-l border-neutral-200 flex flex-col">
            <div className="sticky top-0 z-10 bg-white border-b border-neutral-200 px-6 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-neutral-900 font-display">
                  {selectedDetail?.profile.agencyName || 'Partner Application Review'}
                </h2>
                <p className="text-xs text-neutral-500">
                  {selectedDetail?.profile.id || 'Loading profile...'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDetail(null)}
                className="p-2 rounded-lg text-neutral-500 hover:bg-neutral-100 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {detailLoading ? (
              <div className="p-12 flex items-center justify-center gap-2 text-sm text-neutral-600">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Loading agency verification record...</span>
              </div>
            ) : selectedDetail ? (
              <div className="p-6 space-y-6 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-neutral-50 p-4">
                  <div className="space-y-1">
                    <div className="text-[11px] uppercase tracking-wider text-neutral-500 font-semibold">
                      Partner Status
                    </div>
                    <AdminBadge variant={selectedDetail.profile.status} size="md" />
                  </div>
                  <div className="text-right text-xs text-neutral-600">
                    <div>
                      Partner Submissions:{' '}
                      <strong className="text-neutral-900 tabular-nums">
                        {selectedDetail.profile.submissionCount}
                      </strong>
                    </div>
                    <div className="font-mono text-[11px] text-neutral-500">
                      Customer: {selectedDetail.profile.customerId}
                    </div>
                  </div>
                </div>

                {/* Agency Details Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-xl border border-neutral-200 p-4 text-xs">
                  <div>
                    <div className="text-neutral-500">Agency Name</div>
                    <div className="mt-1 font-semibold text-neutral-900">
                      {selectedDetail.profile.agencyName || '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-neutral-500">Primary Account Holder</div>
                    <div className="mt-1 font-semibold text-neutral-900">
                      {selectedDetail.profile.customerName}
                    </div>
                  </div>
                  <div>
                    <div className="text-neutral-500 flex items-center gap-1">
                      <Phone className="h-3 w-3" /> Agency Contact Phone
                    </div>
                    <div className="mt-1 font-mono text-neutral-900">
                      {selectedDetail.profile.agencyContactPhone ||
                        selectedDetail.profile.customerPhone ||
                        '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-neutral-500">Verified Login Mobile</div>
                    <div className="mt-1 font-mono text-neutral-900">
                      {selectedDetail.profile.customerPhone || '—'}
                    </div>
                  </div>
                  <div className="sm:col-span-2">
                    <div className="text-neutral-500 flex items-center gap-1">
                      <MapPin className="h-3 w-3" /> Business Address
                    </div>
                    <div className="mt-1 text-neutral-900">
                      {selectedDetail.profile.businessAddress || '—'}
                      {selectedDetail.profile.locality
                        ? `, ${selectedDetail.profile.locality}`
                        : ''}
                      {selectedDetail.profile.city ? `, ${selectedDetail.profile.city}` : ''}
                    </div>
                  </div>
                </div>

                {/* Onboarding Declaration */}
                <div className="rounded-xl border border-neutral-200 p-4 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-neutral-900 flex items-center gap-1.5">
                      <FileCheck2 className="h-4 w-4 text-emerald-700" />
                      One-Login-Per-Agency Declaration
                    </span>
                    <span className="text-[11px] text-neutral-500">
                      {selectedDetail.profile.declarationAcceptedAt
                        ? `Accepted ${new Date(
                            selectedDetail.profile.declarationAcceptedAt
                          ).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`
                        : 'Pending'}
                    </span>
                  </div>
                  <p className="text-xs leading-relaxed text-neutral-700 bg-neutral-50 rounded-lg p-3 border border-neutral-100">
                    {selectedDetail.profile.declarationText ||
                      'Agency confirmed single login and owner-consent compliance.'}
                  </p>
                </div>

                {/* Active Reasons */}
                {(selectedDetail.profile.rejectionReason ||
                  selectedDetail.profile.suspensionReason ||
                  selectedDetail.profile.revocationReason) && (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-900 space-y-1">
                    <div className="font-semibold">Recorded Governance Reason</div>
                    {selectedDetail.profile.rejectionReason && (
                      <p>Rejection: {selectedDetail.profile.rejectionReason}</p>
                    )}
                    {selectedDetail.profile.suspensionReason && (
                      <p>Suspension: {selectedDetail.profile.suspensionReason}</p>
                    )}
                    {selectedDetail.profile.revocationReason && (
                      <p>Revocation: {selectedDetail.profile.revocationReason}</p>
                    )}
                  </div>
                )}

                {/* Governance Actions */}
                <div className="rounded-xl border border-neutral-200 p-4 space-y-3">
                  <div className="text-xs font-semibold text-neutral-900 uppercase tracking-wider">
                    Admin Governance Actions
                  </div>
                  <div className="flex flex-wrap gap-2.5">
                    {(selectedDetail.profile.status === 'PENDING' ||
                      selectedDetail.profile.status === 'REJECTED') &&
                      canApprove && (
                        <button
                          type="button"
                          onClick={() =>
                            openActionDialog(
                              'APPROVE',
                              selectedDetail.profile.id,
                              selectedDetail.profile.agencyName || 'Agency'
                            )
                          }
                          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-800 cursor-pointer"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>Approve Partner</span>
                        </button>
                      )}

                    {selectedDetail.profile.status === 'PENDING' && canReject && (
                      <button
                        type="button"
                        onClick={() =>
                          openActionDialog(
                            'REJECT',
                            selectedDetail.profile.id,
                            selectedDetail.profile.agencyName || 'Agency'
                          )
                        }
                        className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300 bg-rose-50 px-3.5 py-2 text-xs font-semibold text-rose-800 hover:bg-rose-100 cursor-pointer"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        <span>Reject Application</span>
                      </button>
                    )}

                    {selectedDetail.profile.status === 'ACTIVE' && canSuspend && (
                      <button
                        type="button"
                        onClick={() =>
                          openActionDialog(
                            'SUSPEND',
                            selectedDetail.profile.id,
                            selectedDetail.profile.agencyName || 'Agency'
                          )
                        }
                        className="inline-flex items-center gap-1.5 rounded-lg border border-orange-300 bg-orange-50 px-3.5 py-2 text-xs font-semibold text-orange-900 hover:bg-orange-100 cursor-pointer"
                      >
                        <ShieldAlert className="h-3.5 w-3.5" />
                        <span>Suspend Partner</span>
                      </button>
                    )}

                    {selectedDetail.profile.status === 'SUSPENDED' && canReactivate && (
                      <button
                        type="button"
                        onClick={() =>
                          openActionDialog(
                            'REACTIVATE',
                            selectedDetail.profile.id,
                            selectedDetail.profile.agencyName || 'Agency'
                          )
                        }
                        className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-neutral-800 cursor-pointer"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        <span>Reactivate Partner</span>
                      </button>
                    )}

                    {selectedDetail.profile.status !== 'REVOKED' && canRevoke && (
                      <button
                        type="button"
                        onClick={() =>
                          openActionDialog(
                            'REVOKE',
                            selectedDetail.profile.id,
                            selectedDetail.profile.agencyName || 'Agency'
                          )
                        }
                        className="inline-flex items-center gap-1.5 rounded-lg bg-rose-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-rose-800 cursor-pointer"
                      >
                        <Ban className="h-3.5 w-3.5" />
                        <span>Permanently Revoke</span>
                      </button>
                    )}
                  </div>
                  <p className="text-[11px] text-neutral-500">
                    Revoked authorizations are permanent. Suspended partners retain existing live
                    listings unless separately deactivated.
                  </p>
                </div>

                {/* Immutable Audit History */}
                <div className="space-y-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-600">
                    Partner Audit History
                  </h3>
                  {selectedDetail.auditHistory.length === 0 ? (
                    <p className="text-xs text-neutral-500">No audit history entries recorded.</p>
                  ) : (
                    <div className="space-y-2">
                      {selectedDetail.auditHistory.map((h) => (
                        <div
                          key={h.id}
                          className="rounded-lg border border-neutral-200 p-3 text-xs space-y-1"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-neutral-900">
                              {h.previousStatus ? `${h.previousStatus} → ${h.newStatus}` : h.newStatus}
                            </span>
                            <span className="font-mono text-[11px] text-neutral-500">
                              {new Date(h.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
                            </span>
                          </div>
                          {h.reason && <p className="text-neutral-700">{h.reason}</p>}
                          {h.actingStaffUserId && (
                            <p className="font-mono text-[11px] text-neutral-500">
                              Staff ID: {h.actingStaffUserId}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Action Confirmation & Reason Modal */}
      {actionModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-neutral-200 rounded-xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
              <h3 className="text-sm font-bold text-neutral-900 font-display">
                Confirm Partner {actionModal.action}
              </h3>
              <button
                type="button"
                onClick={() => setActionModal(null)}
                className="p-1 text-neutral-400 hover:text-neutral-700 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs text-neutral-700">
              Agency: <strong className="text-neutral-900">{actionModal.agencyName}</strong>
            </p>

            {actionError && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
                {actionError}
              </div>
            )}

            <form onSubmit={executePartnerAction} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  Reason / Audit Note{' '}
                  {['REJECT', 'SUSPEND', 'REVOKE'].includes(actionModal.action)
                    ? '(Required, min 5 characters)'
                    : '(Optional)'}
                </label>
                <textarea
                  rows={3}
                  value={actionReason}
                  onChange={(e) => setActionReason(e.target.value)}
                  required={['REJECT', 'SUSPEND', 'REVOKE'].includes(actionModal.action)}
                  placeholder="Provide clear verification or compliance notes..."
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-xs text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-200">
                <button
                  type="button"
                  onClick={() => setActionModal(null)}
                  disabled={actionSubmitting}
                  className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionSubmitting}
                  className="rounded-lg bg-neutral-900 px-4 py-2 text-xs font-semibold text-white hover:bg-neutral-800 disabled:opacity-50 cursor-pointer"
                >
                  {actionSubmitting ? 'Applying...' : `Confirm ${actionModal.action}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
