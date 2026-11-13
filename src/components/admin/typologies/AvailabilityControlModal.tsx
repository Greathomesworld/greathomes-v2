'use client';

import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  Loader2,
  Lock,
  Save,
  ShieldAlert,
  X,
  XCircle,
} from 'lucide-react';
import {
  CONFIGURATION_AVAILABILITY_STATUSES,
  type ConfigurationAvailabilityStatus,
} from '@/src/domain/projects/dto/newBookingDto';
import { getAdminHeaders } from '@/src/lib/adminAuth';

export interface AvailabilityStatusMeta {
  value: ConfigurationAvailabilityStatus;
  label: string;
  shortLabel: string;
  discoveryBehavior: string;
  badgeClass: string;
}

export const AVAILABILITY_STATUS_META: Record<ConfigurationAvailabilityStatus, AvailabilityStatusMeta> = {
  AVAILABLE: {
    value: 'AVAILABLE',
    label: 'Available',
    shortLabel: 'Available',
    discoveryBehavior: 'Shown publicly on New Booking discovery (/buy?inventoryType=NEW_BOOKING) & project page.',
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200/90',
  },
  LIMITED: {
    value: 'LIMITED',
    label: 'Limited Availability',
    shortLabel: 'Limited',
    discoveryBehavior: 'Shown publicly with a "Limited Availability" badge in New Booking discovery.',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200/90',
  },
  ON_REQUEST: {
    value: 'ON_REQUEST',
    label: 'On Request',
    shortLabel: 'On Request',
    discoveryBehavior: 'Shown publicly with an "On Request" badge and "Contact for Details" CTA (independent of PoR).',
    badgeClass: 'bg-sky-50 text-sky-800 border-sky-200/90',
  },
  SOLD_OUT: {
    value: 'SOLD_OUT',
    label: 'Sold Out',
    shortLabel: 'Sold Out',
    discoveryBehavior: 'Excluded from active New Booking discovery; still displays as "Sold Out" in project typologies.',
    badgeClass: 'bg-rose-50 text-rose-700 border-rose-200/90',
  },
  NOT_AVAILABLE: {
    value: 'NOT_AVAILABLE',
    label: 'Not Available',
    shortLabel: 'Not Available',
    discoveryBehavior: 'Fail-closed default. Excluded from New Booking discovery & active developer booking offers.',
    badgeClass: 'bg-neutral-100 text-neutral-700 border-neutral-200',
  },
};

export function normalizeAvailabilityStatus(
  status?: string | null
): ConfigurationAvailabilityStatus {
  if (!status) return 'NOT_AVAILABLE';
  if (status === 'FEW_UNITS_LEFT') return 'LIMITED';
  if ((CONFIGURATION_AVAILABILITY_STATUSES as readonly string[]).includes(status)) {
    return status as ConfigurationAvailabilityStatus;
  }
  return 'NOT_AVAILABLE';
}

export function AvailabilityStatusBadge({
  status,
  size = 'sm',
}: {
  status?: string | null;
  size?: 'sm' | 'md';
}) {
  const canonical = normalizeAvailabilityStatus(status);
  const meta = AVAILABILITY_STATUS_META[canonical];
  const sizeClass = size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs';

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border font-display font-semibold tracking-wide whitespace-nowrap ${sizeClass} ${meta.badgeClass}`}
    >
      {canonical === 'AVAILABLE' && <CheckCircle2 className="h-3 w-3 shrink-0" />}
      {canonical === 'LIMITED' && <Clock className="h-3 w-3 shrink-0" />}
      {canonical === 'ON_REQUEST' && <AlertCircle className="h-3 w-3 shrink-0" />}
      {canonical === 'SOLD_OUT' && <XCircle className="h-3 w-3 shrink-0" />}
      {canonical === 'NOT_AVAILABLE' && <Lock className="h-3 w-3 shrink-0" />}
      <span>{meta.label}</span>
    </span>
  );
}

export interface AvailabilityControlTargetConfig {
  id: string;
  name: string;
  bedroomCount?: number | null;
  availability?: string | null;
  availabilityLastVerifiedAt?: string | null;
  availabilityUpdatedByStaffName?: string | null;
  availabilityInternalNotes?: string | null;
}

interface AvailabilityControlModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  projectName: string;
  projectLifecycleStatus?: string | null;
  projectStatus?: string | null;
  configuration: AvailabilityControlTargetConfig | null;
  source: 'ADMIN_PROJECT_TYPOLOGY_UI' | 'ADMIN_CONFIG_DIRECTORY_UI';
  onSaved: (updatedStatus: ConfigurationAvailabilityStatus, message: string) => void | Promise<void>;
}

export function AvailabilityControlModal({
  isOpen,
  onClose,
  projectId,
  projectName,
  projectLifecycleStatus,
  projectStatus,
  configuration,
  source,
  onSaved,
}: AvailabilityControlModalProps) {
  const [selectedStatus, setSelectedStatus] = useState<ConfigurationAvailabilityStatus>('NOT_AVAILABLE');
  const [internalNotes, setInternalNotes] = useState('');
  const [availableFrom, setAvailableFrom] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && configuration) {
      setSelectedStatus(normalizeAvailabilityStatus(configuration.availability));
      setInternalNotes(configuration.availabilityInternalNotes || '');
      setAvailableFrom('');
      setConfirmed(false);
      setErrorMsg(null);
    }
  }, [isOpen, configuration]);

  if (!isOpen || !configuration) return null;

  const isProjectArchived = projectLifecycleStatus === 'ARCHIVED';
  const isProjectDraft = projectLifecycleStatus && projectLifecycleStatus !== 'PUBLISHED' && !isProjectArchived;
  const isProjectSoldOut = projectStatus === 'SOLD_OUT';
  const isTargetBookable =
    selectedStatus === 'AVAILABLE' || selectedStatus === 'LIMITED' || selectedStatus === 'ON_REQUEST';
  const isBlockedByProjectState = isTargetBookable && (isProjectArchived || isProjectSoldOut);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmed) {
      setErrorMsg('Please confirm the availability update before saving.');
      return;
    }

    setSaving(true);
    setErrorMsg(null);

    try {
      const payload: Record<string, unknown> = {
        configurationId: configuration.id,
        availabilityStatus: selectedStatus,
        internalNotes: internalNotes.trim() || null,
        source,
      };
      if (availableFrom.trim()) {
        payload.availableFrom = availableFrom.trim();
      }

      const res = await fetch(`/api/projects/${projectId}/new-booking`, {
        method: 'POST',
        headers: {
          ...getAdminHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || data.error || 'Failed to update configuration availability.');
      }

      const label = AVAILABILITY_STATUS_META[selectedStatus].label;
      await onSaved(
        selectedStatus,
        `Availability for "${configuration.name}" updated to ${label}.`
      );
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save availability update.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-neutral-200 space-y-5 max-h-[92vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3 border-b border-neutral-200 pb-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 font-display">
              New Booking Availability Control
            </p>
            <h3 className="text-base font-bold text-neutral-900 font-display mt-0.5">
              {configuration.name}
              {configuration.bedroomCount ? ` (${configuration.bedroomCount} BHK)` : ''}
            </h3>
            <p className="text-xs text-neutral-500 font-sans mt-0.5">
              Project: <span className="font-medium text-neutral-700">{projectName}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition"
            aria-label="Close modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Current State & Contextual Warnings */}
        <div className="flex flex-wrap items-center justify-between gap-2 bg-neutral-50 border border-neutral-200/80 rounded-xl px-3.5 py-2.5 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-neutral-500 font-display font-medium">Current Status:</span>
            <AvailabilityStatusBadge status={configuration.availability} />
          </div>
          {configuration.availabilityLastVerifiedAt && (
            <span className="text-[11px] text-neutral-500 font-mono">
              Verified {new Date(configuration.availabilityLastVerifiedAt).toLocaleDateString('en-IN')}
              {configuration.availabilityUpdatedByStaffName
                ? ` by ${configuration.availabilityUpdatedByStaffName}`
                : ''}
            </span>
          )}
        </div>

        {(isProjectArchived || isProjectSoldOut) && (
          <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs">
            <ShieldAlert className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-display font-bold">
                Project is {isProjectArchived ? 'ARCHIVED' : 'SOLD OUT'}
              </p>
              <p className="text-rose-700 mt-0.5 leading-relaxed">
                Publicly bookable statuses (Available, Limited, On Request) cannot be activated while the parent project is {isProjectArchived ? 'archived' : 'marked Sold Out'}. Set to Sold Out or Not Available.
              </p>
            </div>
          </div>
        )}

        {isProjectDraft && (
          <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-display font-bold">Project Lifecycle: {projectLifecycleStatus}</p>
              <p className="text-amber-700 mt-0.5 leading-relaxed">
                Availability changes are saved persistently, but this typology will remain hidden from public discovery until the project is published.
              </p>
            </div>
          </div>
        )}

        {errorMsg && (
          <div className="flex items-start gap-2 p-3 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Status Radio Options */}
          <div>
            <label className="block text-xs font-bold text-neutral-700 font-display mb-2">
              Select Canonical Availability Status <span className="text-rose-500">*</span>
            </label>
            <div className="space-y-2">
              {CONFIGURATION_AVAILABILITY_STATUSES.map((statusKey) => {
                const meta = AVAILABILITY_STATUS_META[statusKey];
                const isSelected = selectedStatus === statusKey;
                const isOptionDisabled =
                  (statusKey === 'AVAILABLE' || statusKey === 'LIMITED' || statusKey === 'ON_REQUEST') &&
                  (isProjectArchived || isProjectSoldOut);

                return (
                  <label
                    key={statusKey}
                    className={`flex items-start gap-3 p-3 rounded-xl border transition-all ${
                      isOptionDisabled
                        ? 'opacity-50 cursor-not-allowed bg-neutral-50 border-neutral-200'
                        : isSelected
                          ? 'border-neutral-900 bg-neutral-50/90 shadow-2xs cursor-pointer'
                          : 'border-neutral-200 hover:border-neutral-300 bg-white cursor-pointer'
                    }`}
                  >
                    <input
                      type="radio"
                      name="availabilityStatus"
                      value={statusKey}
                      checked={isSelected}
                      disabled={isOptionDisabled}
                      onChange={() => setSelectedStatus(statusKey)}
                      className="mt-1 h-4 w-4 text-neutral-900 border-neutral-300 focus:ring-neutral-900"
                    />
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <AvailabilityStatusBadge status={statusKey} />
                        <span className="text-[10px] font-mono text-neutral-400">{statusKey}</span>
                      </div>
                      <p className="text-xs text-neutral-600 leading-snug font-sans">
                        {meta.discoveryBehavior}
                      </p>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Available From & Internal Remarks */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-neutral-700 font-display mb-1">
                Available From (Optional)
              </label>
              <div className="relative">
                <Calendar className="h-3.5 w-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="date"
                  value={availableFrom}
                  onChange={(e) => setAvailableFrom(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs font-mono bg-neutral-50 border border-neutral-200 rounded-lg focus:bg-white focus:border-neutral-400 focus:outline-hidden"
                />
              </div>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-neutral-700 font-display mb-1">
                Internal Remarks (Staff Audit Note, Optional)
              </label>
              <textarea
                rows={2}
                value={internalNotes}
                onChange={(e) => setInternalNotes(e.target.value)}
                placeholder="e.g. Verified with developer inventory sheet on call"
                className="w-full text-xs font-sans bg-neutral-50 border border-neutral-200 rounded-lg p-2.5 focus:bg-white focus:border-neutral-400 focus:outline-hidden resize-none"
              />
            </div>
          </div>

          {/* Explicit Review Confirmation */}
          <label className="flex items-start gap-2.5 p-3 rounded-xl bg-neutral-50 border border-neutral-200 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-900"
            />
            <span className="text-xs text-neutral-700 font-sans leading-relaxed">
              I confirm this availability status change is verified and ready for audit logging and live discovery updates.
            </span>
          </label>

          {/* Actions */}
          <div className="border-t border-neutral-200 pt-4 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-neutral-700 bg-white hover:bg-neutral-100 border border-neutral-300 rounded-lg transition font-display"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !confirmed || isBlockedByProjectState}
              className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-neutral-900 hover:bg-black disabled:bg-neutral-300 disabled:cursor-not-allowed rounded-lg transition font-display"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Updating...</span>
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  <span>Confirm & Save Availability</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
