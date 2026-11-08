'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { AdminPageHeader } from '@/src/components/admin/AdminPageHeader';
import { AdminBadge } from '@/src/components/admin/AdminBadge';
import { AdminLoadingState } from '@/src/components/admin/AdminLoadingState';
import { AdminErrorState } from '@/src/components/admin/AdminErrorState';
import { AdminConfirmDialog } from '@/src/components/admin/AdminConfirmDialog';
import { getAdminHeaders } from '@/src/lib/adminAuth';
import {
  ShieldCheck,
  ShieldAlert,
  Clock,
  Building2,
  Search,
  Filter,
  CheckCircle2,
  Edit2,
  XCircle,
  ExternalLink,
  Save,
  X,
  FileCheck2,
} from 'lucide-react';

interface ReraRecordItem {
  projectId: string;
  projectName: string;
  projectSlug: string;
  lifecycleStatus: string;
  developerName: string;
  locationName: string;
  rera: {
    id: string | null;
    status: 'VERIFIED' | 'PROVIDED' | 'NOT_PROVIDED';
    authority: string | null;
    registrationNumber: string | null;
    verifiedAt: string | null;
    verifiedBy: string | null;
    internalNotes: string | null;
    updatedAt: string;
  };
}

interface ReraStats {
  totalProjects: number;
  verifiedCount: number;
  providedCount: number;
  notProvidedCount: number;
}

export default function AdminReraPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [records, setRecords] = useState<ReraRecordItem[]>([]);
  const [stats, setStats] = useState<ReraStats>({
    totalProjects: 0,
    verifiedCount: 0,
    providedCount: 0,
    notProvidedCount: 0,
  });

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [authorityFilter, setAuthorityFilter] = useState('ALL');

  // Verify Modal
  const [verifyModalOpen, setVerifyModalOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<ReraRecordItem | null>(null);
  const [verifyRegNumber, setVerifyRegNumber] = useState('');
  const [verifyAuthority, setVerifyAuthority] = useState('WBRERA');
  const [verifyNotes, setVerifyNotes] = useState('');
  const [verifySubmitting, setVerifySubmitting] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  // Edit Modal
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editStatus, setEditStatus] = useState<'VERIFIED' | 'PROVIDED' | 'NOT_PROVIDED'>('PROVIDED');
  const [editRegNumber, setEditRegNumber] = useState('');
  const [editAuthority, setEditAuthority] = useState('WBRERA');
  const [editNotes, setEditNotes] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Revoke Dialog
  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false);
  const [revokeSubmitting, setRevokeSubmitting] = useState(false);

  const fetchReraData = async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      if (authorityFilter !== 'ALL') params.set('authority', authorityFilter);

      const res = await fetch(`/api/admin/rera?${params.toString()}`, {
        headers: getAdminHeaders(),
      });
      if (!res.ok) {
        throw new Error('Failed to load RERA records.');
      }
      const json = await res.json();
      setRecords(json.data || []);
      if (json.stats) {
        setStats(json.stats);
      }
    } catch (err: any) {
      setError(err.message || 'Error fetching RERA compliance records');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReraData();
  }, [statusFilter, authorityFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchReraData();
  };

  const openVerifyModal = (item: ReraRecordItem) => {
    setSelectedProject(item);
    setVerifyRegNumber(item.rera.registrationNumber || '');
    setVerifyAuthority(item.rera.authority || 'WBRERA');
    setVerifyNotes(item.rera.internalNotes || '');
    setVerifyError(null);
    setVerifyModalOpen(true);
  };

  const handleConfirmVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProject) return;

    if (!verifyRegNumber.trim()) {
      setVerifyError('RERA Registration Number is required.');
      return;
    }

    try {
      setVerifySubmitting(true);
      setVerifyError(null);

      const res = await fetch(`/api/admin/rera/${selectedProject.projectId}/verify`, {
        method: 'POST',
        headers: getAdminHeaders(),
        body: JSON.stringify({
          registrationNumber: verifyRegNumber.trim(),
          authority: verifyAuthority.trim() || 'WBRERA',
          internalNotes: verifyNotes.trim() || `Verified via state RERA registry lookup.`,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Failed to verify RERA registration.');
      }

      setVerifyModalOpen(false);
      await fetchReraData();
    } catch (err: any) {
      setVerifyError(err.message || 'Error verifying RERA');
    } finally {
      setVerifySubmitting(false);
    }
  };

  const openEditModal = (item: ReraRecordItem) => {
    setSelectedProject(item);
    setEditStatus(item.rera.status);
    setEditRegNumber(item.rera.registrationNumber || '');
    setEditAuthority(item.rera.authority || 'WBRERA');
    setEditNotes(item.rera.internalNotes || '');
    setEditError(null);
    setEditModalOpen(true);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProject) return;

    try {
      setEditSubmitting(true);
      setEditError(null);

      const res = await fetch(`/api/projects/${selectedProject.projectId}/rera`, {
        method: 'POST',
        headers: getAdminHeaders(),
        body: JSON.stringify({
          status: editStatus,
          registrationNumber: editRegNumber.trim() || null,
          authority: editAuthority.trim() || 'WBRERA',
          internalNotes: editNotes.trim() || null,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Failed to update RERA record.');
      }

      setEditModalOpen(false);
      await fetchReraData();
    } catch (err: any) {
      setEditError(err.message || 'Error updating RERA record');
    } finally {
      setEditSubmitting(false);
    }
  };

  const openRevokeDialog = (item: ReraRecordItem) => {
    setSelectedProject(item);
    setRevokeDialogOpen(true);
  };

  const handleConfirmRevoke = async () => {
    if (!selectedProject) return;
    try {
      setRevokeSubmitting(true);
      const res = await fetch(`/api/admin/rera/${selectedProject.projectId}/revoke`, {
        method: 'POST',
        headers: getAdminHeaders(),
        body: JSON.stringify({
          status: 'PROVIDED',
          internalNotes: 'Verification revoked by staff audit.',
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Failed to revoke verification.');
      }

      setRevokeDialogOpen(false);
      await fetchReraData();
    } catch (err: any) {
      alert(err.message || 'Failed to revoke verification.');
    } finally {
      setRevokeSubmitting(false);
    }
  };

  // Distinct authorities for filter dropdown
  const authoritiesList = useMemo(() => {
    const set = new Set<string>();
    records.forEach(r => {
      if (r.rera.authority) set.add(r.rera.authority);
    });
    return Array.from(set);
  }, [records]);

  return (
    <div className="space-y-6 pb-16 font-body">
      <AdminPageHeader
        title="RERA Compliance Registry"
        description="Audit, verify, and monitor real estate regulatory authority registration numbers, certificate credentials, and state compliance records."
        breadcrumbs={[
          { label: 'Project Intelligence', href: '/admin/intelligence/configurations' },
          { label: 'RERA Compliance' },
        ]}
      />

      {/* KPI Stats Cards */}
      <div className="px-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-neutral-200 rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-neutral-500 font-display">
              Total Projects
            </span>
            <Building2 className="h-4 w-4 text-neutral-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-display text-neutral-900">{stats.totalProjects}</span>
            <span className="text-xs text-neutral-500">catalogued</span>
          </div>
        </div>

        <div className="bg-white border border-emerald-100 rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 font-display">
              Verified RERA
            </span>
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-display text-emerald-800">{stats.verifiedCount}</span>
            <span className="text-xs text-emerald-600 font-medium">certified active</span>
          </div>
        </div>

        <div className="bg-white border border-amber-100 rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-700 font-display">
              Pending Verification
            </span>
            <Clock className="h-4 w-4 text-amber-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-display text-amber-800">{stats.providedCount}</span>
            <span className="text-xs text-amber-600 font-medium">provided by dev</span>
          </div>
        </div>

        <div className="bg-white border border-neutral-200 rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-neutral-500 font-display">
              Not Provided
            </span>
            <ShieldAlert className="h-4 w-4 text-neutral-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-display text-neutral-700">{stats.notProvidedCount}</span>
            <span className="text-xs text-neutral-500">missing RERA info</span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="px-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 flex-1 max-w-md">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by project, developer, or registration number..."
              className="w-full bg-white border border-neutral-200 rounded-lg pl-9 pr-3 py-2 text-sm text-neutral-800 focus:outline-hidden focus:border-neutral-400 shadow-2xs font-body"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-neutral-900 hover:bg-neutral-800 text-white rounded-lg text-sm font-semibold transition-colors font-display"
          >
            Search
          </button>
        </form>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Filter className="h-3.5 w-3.5 text-neutral-400" />
            <span className="text-xs font-semibold text-neutral-500 font-display">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-white border border-neutral-200 rounded-lg px-3 py-1.5 text-xs font-semibold text-neutral-700 focus:outline-hidden shadow-2xs"
            >
              <option value="ALL">All Statuses</option>
              <option value="VERIFIED">Verified Only</option>
              <option value="PROVIDED">Provided / Pending</option>
              <option value="NOT_PROVIDED">Not Provided</option>
            </select>
          </div>

          {authoritiesList.length > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-neutral-500 font-display">Authority:</span>
              <select
                value={authorityFilter}
                onChange={(e) => setAuthorityFilter(e.target.value)}
                className="bg-white border border-neutral-200 rounded-lg px-3 py-1.5 text-xs font-semibold text-neutral-700 focus:outline-hidden shadow-2xs"
              >
                <option value="ALL">All Authorities</option>
                {authoritiesList.map(auth => (
                  <option key={auth} value={auth}>{auth}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* RERA Records Table */}
      <div className="px-6">
        {loading ? (
          <AdminLoadingState message="Loading RERA compliance records..." />
        ) : error ? (
          <AdminErrorState title="Failed to load records" error={error} onRetry={fetchReraData} />
        ) : records.length === 0 ? (
          <div className="bg-white border border-neutral-200 rounded-xl p-12 text-center shadow-xs">
            <FileCheck2 className="h-10 w-10 text-neutral-300 mx-auto mb-3" />
            <h3 className="text-base font-bold text-neutral-800 font-display">No compliance records found</h3>
            <p className="text-xs text-neutral-500 font-body mt-1 max-w-sm mx-auto">
              No project records matching your search or filter criteria were located in the registry.
            </p>
          </div>
        ) : (
          <div className="bg-white border border-neutral-200 rounded-xl shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-neutral-200 bg-neutral-50/75 text-neutral-500 uppercase tracking-wider font-display font-semibold">
                    <th className="py-3 px-4">Project & Developer</th>
                    <th className="py-3 px-4">Location</th>
                    <th className="py-3 px-4">Authority</th>
                    <th className="py-3 px-4">Registration Number</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Verification Audit</th>
                    <th className="py-3 px-4">Internal Notes</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 font-body">
                  {records.map((item) => {
                    const isVerified = item.rera.status === 'VERIFIED';
                    const isProvided = item.rera.status === 'PROVIDED';

                    return (
                      <tr key={item.projectId} className="hover:bg-neutral-50/60 transition-colors">
                        <td className="py-3 px-4">
                          <Link
                            href={`/admin/projects/${item.projectId}`}
                            className="font-bold text-neutral-900 hover:text-indigo-600 transition-colors flex items-center gap-1.5"
                          >
                            <span>{item.projectName}</span>
                            <ExternalLink className="h-3 w-3 text-neutral-400" />
                          </Link>
                          <span className="text-2xs text-neutral-500 block mt-0.5">
                            {item.developerName}
                          </span>
                        </td>

                        <td className="py-3 px-4 text-neutral-600">
                          {item.locationName}
                        </td>

                        <td className="py-3 px-4">
                          <span className="font-mono font-semibold bg-neutral-100 text-neutral-700 px-2 py-0.5 rounded text-2xs">
                            {item.rera.authority || 'WBRERA'}
                          </span>
                        </td>

                        <td className="py-3 px-4">
                          {item.rera.registrationNumber ? (
                            <span className="font-mono font-semibold text-neutral-900 bg-neutral-50 border border-neutral-200 px-2 py-0.5 rounded">
                              {item.rera.registrationNumber}
                            </span>
                          ) : (
                            <span className="text-neutral-400 italic">Not Assigned</span>
                          )}
                        </td>

                        <td className="py-3 px-4">
                          {isVerified ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-2xs font-bold bg-emerald-100 text-emerald-800">
                              <ShieldCheck className="h-3 w-3" />
                              VERIFIED
                            </span>
                          ) : isProvided ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-2xs font-bold bg-amber-100 text-amber-800">
                              <Clock className="h-3 w-3" />
                              PROVIDED
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-2xs font-bold bg-neutral-100 text-neutral-600">
                              <ShieldAlert className="h-3 w-3" />
                              NOT PROVIDED
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-4">
                          {isVerified ? (
                            <div>
                              <span className="font-semibold text-neutral-800 block text-2xs">
                                By: {item.rera.verifiedBy || 'Internal Staff'}
                              </span>
                              <span className="text-2xs text-neutral-400">
                                {item.rera.verifiedAt ? new Date(item.rera.verifiedAt).toLocaleDateString() : 'Active'}
                              </span>
                            </div>
                          ) : (
                            <span className="text-neutral-400 italic text-2xs">Unverified</span>
                          )}
                        </td>

                        <td className="py-3 px-4">
                          {item.rera.internalNotes ? (
                            <p className="text-2xs text-neutral-600 max-w-[200px] truncate" title={item.rera.internalNotes}>
                              {item.rera.internalNotes}
                            </p>
                          ) : (
                            <span className="text-neutral-300 italic text-2xs">None</span>
                          )}
                        </td>

                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {!isVerified ? (
                              <button
                                onClick={() => openVerifyModal(item)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-2xs font-bold transition-colors font-display shadow-2xs"
                                title="Certify and verify RERA registration"
                              >
                                <CheckCircle2 className="h-3 w-3" />
                                Verify
                              </button>
                            ) : (
                              <button
                                onClick={() => openRevokeDialog(item)}
                                className="inline-flex items-center gap-1 px-2 py-1 border border-rose-200 text-rose-600 hover:bg-rose-50 rounded text-2xs font-bold transition-colors font-display"
                                title="Revoke verified certificate status"
                              >
                                <XCircle className="h-3 w-3" />
                                Revoke
                              </button>
                            )}

                            <button
                              onClick={() => openEditModal(item)}
                              className="p-1 text-neutral-600 hover:bg-neutral-100 rounded transition-colors"
                              title="Edit registration and notes"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Verify RERA Modal */}
      {verifyModalOpen && selectedProject && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-neutral-200 rounded-xl shadow-xl w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-emerald-600" />
                <h3 className="text-sm font-bold text-neutral-900 font-display">
                  Certify RERA Registration
                </h3>
              </div>
              <button
                onClick={() => setVerifyModalOpen(false)}
                className="text-neutral-400 hover:text-neutral-600 p-1"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs text-neutral-600 font-body">
              Confirming verification grants the verified badge for <strong>{selectedProject.projectName}</strong>.
              Staff credentials and timestamp will be recorded permanently in the compliance audit trail.
            </p>

            {verifyError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700">
                {verifyError}
              </div>
            )}

            <form onSubmit={handleConfirmVerify} className="space-y-4 text-xs font-body">
              <div>
                <label className="block font-semibold text-neutral-700 mb-1">
                  RERA Registration Number *
                </label>
                <input
                  type="text"
                  value={verifyRegNumber}
                  onChange={(e) => setVerifyRegNumber(e.target.value)}
                  placeholder="e.g. WBRERA/P/KOL/2023/000456"
                  className="w-full bg-neutral-50 border border-neutral-200 rounded-lg p-2.5 text-xs font-mono text-neutral-900 focus:outline-hidden focus:border-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-neutral-700 mb-1">
                  Regulatory Authority *
                </label>
                <input
                  type="text"
                  value={verifyAuthority}
                  onChange={(e) => setVerifyAuthority(e.target.value)}
                  placeholder="e.g. WBRERA"
                  className="w-full bg-neutral-50 border border-neutral-200 rounded-lg p-2.5 text-xs text-neutral-900 focus:outline-hidden"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-neutral-700 mb-1">
                  Internal Verification Audit Notes (Private Staff Record)
                </label>
                <textarea
                  rows={3}
                  value={verifyNotes}
                  onChange={(e) => setVerifyNotes(e.target.value)}
                  placeholder="Verified against state authority portal lookup; certificate valid..."
                  className="w-full bg-neutral-50 border border-neutral-200 rounded-lg p-2.5 text-xs text-neutral-900 focus:outline-hidden"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => setVerifyModalOpen(false)}
                  className="px-4 py-2 border border-neutral-200 text-neutral-700 hover:bg-neutral-50 rounded-lg font-semibold transition-colors font-display"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={verifySubmitting}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-neutral-300 text-white rounded-lg font-bold transition-colors font-display flex items-center gap-1.5 shadow-xs"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {verifySubmitting ? 'Certifying...' : 'Certify & Verify RERA'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit RERA Record Modal */}
      {editModalOpen && selectedProject && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-neutral-200 rounded-xl shadow-xl w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <h3 className="text-sm font-bold text-neutral-900 font-display">
                Edit RERA Compliance Record
              </h3>
              <button
                onClick={() => setEditModalOpen(false)}
                className="text-neutral-400 hover:text-neutral-600 p-1"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {editError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700">
                {editError}
              </div>
            )}

            <form onSubmit={handleSaveEdit} className="space-y-4 text-xs font-body">
              <div>
                <label className="block font-semibold text-neutral-700 mb-1">Compliance Status</label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as any)}
                  className="w-full bg-neutral-50 border border-neutral-200 rounded-lg p-2.5 text-xs text-neutral-900 focus:outline-hidden"
                >
                  <option value="NOT_PROVIDED">Not Provided</option>
                  <option value="PROVIDED">Provided / Pending Verification</option>
                  <option value="VERIFIED">Verified (Staff Authorized)</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-neutral-700 mb-1">RERA Registration Number</label>
                <input
                  type="text"
                  value={editRegNumber}
                  onChange={(e) => setEditRegNumber(e.target.value)}
                  placeholder="e.g. WBRERA/P/KOL/2023/000456"
                  className="w-full bg-neutral-50 border border-neutral-200 rounded-lg p-2.5 text-xs font-mono text-neutral-900 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block font-semibold text-neutral-700 mb-1">Authority</label>
                <input
                  type="text"
                  value={editAuthority}
                  onChange={(e) => setEditAuthority(e.target.value)}
                  placeholder="e.g. WBRERA"
                  className="w-full bg-neutral-50 border border-neutral-200 rounded-lg p-2.5 text-xs text-neutral-900 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block font-semibold text-neutral-700 mb-1">Internal Verification Notes</label>
                <textarea
                  rows={3}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Private internal compliance log notes..."
                  className="w-full bg-neutral-50 border border-neutral-200 rounded-lg p-2.5 text-xs text-neutral-900 focus:outline-hidden"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => setEditModalOpen(false)}
                  className="px-4 py-2 border border-neutral-200 text-neutral-700 hover:bg-neutral-50 rounded-lg font-semibold transition-colors font-display"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editSubmitting}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-neutral-300 text-white rounded-lg font-bold transition-colors font-display flex items-center gap-1.5 shadow-xs"
                >
                  <Save className="h-4 w-4" />
                  {editSubmitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Revoke Confirmation Dialog */}
      <AdminConfirmDialog
        isOpen={revokeDialogOpen}
        title="Revoke RERA Verification"
        message={`Are you sure you want to revoke the verified status for ${selectedProject?.projectName}? This will remove the verified badge from the public portal immediately.`}
        confirmLabel="Revoke Verification"
        isDestructive
        isLoading={revokeSubmitting}
        onConfirm={handleConfirmRevoke}
        onCancel={() => setRevokeDialogOpen(false)}
      />
    </div>
  );
}
