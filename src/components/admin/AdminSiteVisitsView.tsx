'use client';

import React, { useState, useEffect } from 'react';
import {
  Calendar,
  Clock,
  User,
  Phone,
  Mail,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Search,
  Filter,
  Loader2,
  ShieldAlert,
  ChevronRight,
  UserCheck,
  FileText,
} from 'lucide-react';
import { AdminSiteVisitDTO } from '@/src/domain/siteVisit/dto/siteVisitDto';
import { SiteVisitStatus } from '@/src/domain/siteVisit/entities/siteVisitEntity';
import { getAdminHeaders } from '@/src/lib/adminAuth';

export default function AdminSiteVisitsView() {
  const [visits, setVisits] = useState<AdminSiteVisitDTO[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter state
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Selected Detail Modal state
  const [selectedVisit, setSelectedVisit] = useState<AdminSiteVisitDTO | null>(null);
  const [staffNote, setStaffNote] = useState('');
  const [assignedStaffName, setAssignedStaffName] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  const fetchVisits = async () => {
    try {
      setIsLoading(true);
      const url = statusFilter !== 'ALL' ? `/api/admin/site-visits?status=${statusFilter}` : '/api/admin/site-visits';
      const res = await fetch(url, {
        headers: getAdminHeaders(),
      });
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          setError('Unauthorized. Staff authorization required.');
          return;
        }
        throw new Error('Failed to load admin site visits');
      }
      const data = await res.json();
      setVisits(data.items || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load site visits');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchVisits();
  }, [statusFilter]);

  const handleUpdateStatus = async (visitId: string, nextStatus: SiteVisitStatus) => {
    setIsUpdating(true);
    try {
      const res = await fetch(`/api/admin/site-visits/${visitId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          
        },
        body: JSON.stringify({
          status: nextStatus,
          notes: staffNote || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update status');
      }

      setSelectedVisit(null);
      setStaffNote('');
      await fetchVisits();
    } catch (err: any) {
      alert(err.message || 'Status update error');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleAssignStaff = async (visitId: string) => {
    if (!assignedStaffName.trim()) return;
    setIsUpdating(true);
    try {
      const res = await fetch(`/api/admin/site-visits/${visitId}/assign`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          staffId: `staff-${assignedStaffName.toLowerCase().replace(/\s+/g, '-')}`,
          staffName: assignedStaffName.trim(),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to assign staff');
      }

      setSelectedVisit(null);
      setAssignedStaffName('');
      await fetchVisits();
    } catch (err: any) {
      alert(err.message || 'Assignment error');
    } finally {
      setIsUpdating(false);
    }
  };

  // Metrics
  const requestedCount = visits.filter((v) => v.status === 'REQUESTED').length;
  const confirmedCount = visits.filter((v) => v.status === 'CONFIRMED').length;
  const rescheduleCount = visits.filter((v) => v.status === 'RESCHEDULE_REQUESTED').length;
  const completedCount = visits.filter((v) => v.status === 'COMPLETED').length;

  const filteredVisits = visits.filter((v) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      v.referenceNumber?.toLowerCase().includes(q) ||
      v.propertyName?.toLowerCase().includes(q) ||
      v.buyerName?.toLowerCase().includes(q) ||
      v.buyerPhone?.includes(q)
    );
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 text-left">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--color-border)] pb-5">
        <div>
          <h1 className="text-2xl font-serif font-bold text-[#111111]">Site Visit Operations</h1>
          <p className="text-xs font-body text-[#111111]/60 mt-1">
            Manage, confirm, assign, and coordinate buyer property site visits.
          </p>
        </div>
      </div>

      {/* Operational Metrics Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 space-y-1">
          <span className="text-[10px] font-display font-semibold uppercase tracking-wider text-amber-800">
            Pending Requests
          </span>
          <div className="text-2xl font-serif font-bold text-amber-900">{requestedCount}</div>
        </div>

        <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 space-y-1">
          <span className="text-[10px] font-display font-semibold uppercase tracking-wider text-blue-800">
            Confirmed Visits
          </span>
          <div className="text-2xl font-serif font-bold text-blue-900">{confirmedCount}</div>
        </div>

        <div className="p-4 rounded-xl bg-purple-50 border border-purple-200 space-y-1">
          <span className="text-[10px] font-display font-semibold uppercase tracking-wider text-purple-800">
            Reschedule Requests
          </span>
          <div className="text-2xl font-serif font-bold text-purple-900">{rescheduleCount}</div>
        </div>

        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 space-y-1">
          <span className="text-[10px] font-display font-semibold uppercase tracking-wider text-emerald-800">
            Completed Visits
          </span>
          <div className="text-2xl font-serif font-bold text-emerald-900">{completedCount}</div>
        </div>
      </div>

      {/* Filter & Search Toolbar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 rounded-2xl bg-[#FAFAF8] border border-[var(--color-border)]">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-[#111111]/50 ml-2" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 rounded-xl bg-white border border-[var(--color-border)] text-xs font-display font-semibold text-[#111111]"
          >
            <option value="ALL">All Statuses</option>
            <option value="REQUESTED">Requested</option>
            <option value="CONFIRMED">Confirmed</option>
            <option value="RESCHEDULE_REQUESTED">Reschedule Requested</option>
            <option value="RESCHEDULED">Rescheduled</option>
            <option value="COMPLETED">Completed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-[#111111]/40 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search by ref, buyer name, phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-white border border-[var(--color-border)] text-xs font-body text-[#111111]"
          />
        </div>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="py-16 text-center space-y-2">
          <Loader2 className="w-6 h-6 animate-spin text-[#E85D3F] mx-auto" />
          <p className="text-xs font-display text-[#111111]/60">Loading site visits...</p>
        </div>
      )}

      {/* Error state */}
      {error && !isLoading && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs font-body flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 shrink-0 text-red-600" />
          <span>{error}</span>
        </div>
      )}

      {/* Table */}
      {!isLoading && !error && (
        <div className="bg-white border border-[var(--color-border)] rounded-2xl overflow-hidden shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-body border-collapse">
              <thead>
                <tr className="bg-[#FAFAF8] border-b border-[var(--color-border)] text-[11px] font-display font-bold uppercase tracking-wider text-[#111111]/60">
                  <th className="p-3.5">Ref & Date</th>
                  <th className="p-3.5">Property</th>
                  <th className="p-3.5">Buyer</th>
                  <th className="p-3.5">Slot Requested</th>
                  <th className="p-3.5">Assigned Staff</th>
                  <th className="p-3.5">Status</th>
                  <th className="p-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]/60">
                {filteredVisits.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-[#111111]/50 font-body">
                      No site visits match the selected filter.
                    </td>
                  </tr>
                ) : (
                  filteredVisits.map((visit) => (
                    <tr key={visit.id} className="hover:bg-[#FAFAF8]/60 transition-colors">
                      <td className="p-3.5">
                        <span className="font-display font-bold text-[#E85D3F] block">
                          {visit.referenceNumber}
                        </span>
                        <span className="text-[10px] text-[#111111]/40 block">
                          {new Date(visit.createdAt).toLocaleDateString()}
                        </span>
                      </td>

                      <td className="p-3.5 font-medium text-[#111111]">
                        {visit.propertyName || 'Property Visit'}
                      </td>

                      <td className="p-3.5">
                        <span className="font-semibold text-[#111111] block">{visit.buyerName || 'Guest Buyer'}</span>
                        <span className="text-[10px] text-[#111111]/60 block">{visit.buyerPhone}</span>
                      </td>

                      <td className="p-3.5">
                        <span className="font-semibold block">{visit.preferredDate}</span>
                        <span className="text-[10px] text-[#111111]/60 block">{visit.preferredTimeWindow}</span>
                      </td>

                      <td className="p-3.5 text-[#111111]/80">
                        {visit.assignedToName || <span className="text-[#111111]/40 italic">Unassigned</span>}
                      </td>

                      <td className="p-3.5">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[11px] font-display font-semibold border inline-block ${
                            visit.status === 'CONFIRMED'
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : visit.status === 'CANCELLED'
                              ? 'bg-red-50 text-red-700 border-red-200'
                              : visit.status === 'COMPLETED'
                              ? 'bg-blue-50 text-blue-800 border-blue-200'
                              : 'bg-amber-50 text-amber-800 border-amber-200'
                          }`}
                        >
                          {visit.statusLabel}
                        </span>
                      </td>

                      <td className="p-3.5 text-right">
                        <button
                          type="button"
                          onClick={() => setSelectedVisit(visit)}
                          className="px-3 py-1.5 rounded-lg bg-[#111111] hover:bg-black text-white font-display font-semibold text-[11px] inline-flex items-center gap-1"
                        >
                          <span>Manage</span>
                          <ChevronRight className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Manage Detail Modal */}
      {selectedVisit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-5 border border-[var(--color-border)] shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-3">
              <div>
                <span className="text-[10px] font-display uppercase tracking-wider text-[#E85D3F] font-bold block">
                  {selectedVisit.referenceNumber}
                </span>
                <h3 className="text-base font-serif font-bold text-[#111111]">
                  Manage Site Visit
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedVisit(null)}
                className="p-1.5 rounded-lg text-[#111111]/50 hover:bg-black/5"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs font-body text-[#111111]/80">
              <div className="p-3 rounded-xl bg-[#FAFAF8] border border-[var(--color-border)] grid grid-cols-2 gap-2">
                <div>
                  <strong className="font-display block text-[10px] text-[#111111]/40 uppercase">Buyer</strong>
                  <span>{selectedVisit.buyerName} ({selectedVisit.buyerPhone})</span>
                </div>
                <div>
                  <strong className="font-display block text-[10px] text-[#111111]/40 uppercase">Property</strong>
                  <span>{selectedVisit.propertyName || 'Property'}</span>
                </div>
                <div>
                  <strong className="font-display block text-[10px] text-[#111111]/40 uppercase">Requested Date</strong>
                  <span>{selectedVisit.preferredDate} ({selectedVisit.preferredTimeWindow})</span>
                </div>
                <div>
                  <strong className="font-display block text-[10px] text-[#111111]/40 uppercase">Mode</strong>
                  <span>{selectedVisit.visitType}</span>
                </div>
              </div>

              {/* Staff Note */}
              <div className="space-y-1">
                <label className="font-display font-semibold text-[#111111] block">Add Internal Staff Note</label>
                <input
                  type="text"
                  placeholder="e.g. Host confirmed with builder site office..."
                  value={staffNote}
                  onChange={(e) => setStaffNote(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-[var(--color-border)] text-xs font-body text-[#111111]"
                />
              </div>

              {/* Staff Assign */}
              <div className="space-y-1">
                <label className="font-display font-semibold text-[#111111] block">Assign Staff Representative</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Staff name (e.g. Anish Roy)"
                    value={assignedStaffName}
                    onChange={(e) => setAssignedStaffName(e.target.value)}
                    className="flex-1 px-3 py-2 rounded-xl bg-white border border-[var(--color-border)] text-xs font-body text-[#111111]"
                  />
                  <button
                    type="button"
                    onClick={() => handleAssignStaff(selectedVisit.id)}
                    disabled={isUpdating}
                    className="px-4 py-2 rounded-xl bg-[#111111] text-white font-display font-semibold text-xs"
                  >
                    Assign
                  </button>
                </div>
              </div>

              {/* Status Action Transitions */}
              <div className="pt-2 border-t border-[var(--color-border)] space-y-2">
                <span className="font-display font-semibold text-[#111111] block">Update Status</span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => handleUpdateStatus(selectedVisit.id, 'CONFIRMED')}
                    disabled={isUpdating}
                    className="py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-display font-semibold text-xs transition-colors"
                  >
                    Confirm Visit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleUpdateStatus(selectedVisit.id, 'COMPLETED')}
                    disabled={isUpdating}
                    className="py-2 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-display font-semibold text-xs transition-colors"
                  >
                    Mark Completed
                  </button>
                  <button
                    type="button"
                    onClick={() => handleUpdateStatus(selectedVisit.id, 'RESCHEDULED')}
                    disabled={isUpdating}
                    className="py-2 px-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-display font-semibold text-xs transition-colors"
                  >
                    Rescheduled
                  </button>
                  <button
                    type="button"
                    onClick={() => handleUpdateStatus(selectedVisit.id, 'CANCELLED')}
                    disabled={isUpdating}
                    className="py-2 px-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-display font-semibold text-xs transition-colors"
                  >
                    Cancel Visit
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
