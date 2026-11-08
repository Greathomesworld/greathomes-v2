'use client';

import React, { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AdminPageHeader } from '@/src/components/admin/AdminPageHeader';
import { AdminBadge } from '@/src/components/admin/AdminBadge';
import { AdminLoadingState } from '@/src/components/admin/AdminLoadingState';
import { AdminErrorState } from '@/src/components/admin/AdminErrorState';
import { getAdminHeaders } from '@/src/lib/adminAuth';
import {
  EnquiryEntity,
  EnquiryPriority,
  EnquiryStatus,
  VALID_STATUS_TRANSITIONS,
  ENQUIRY_STATUS_LABELS,
  ENQUIRY_PRIORITY_LABELS,
} from '@/src/domain/enquiry/entities/enquiryEntity';
import {
  MessageSquare,
  Phone,
  Mail,
  Calendar,
  Clock,
  UserCheck,
  Building2,
  Home,
  KeyRound,
  CheckCircle2,
  AlertTriangle,
  Flame,
  ArrowLeft,
  Save,
  Copy,
  Check,
  ExternalLink,
  ShieldCheck,
  FileText,
  Trash2,
} from 'lucide-react';

interface StaffOption {
  id: string;
  name: string;
  role: string;
}

const STAFF_MEMBERS: StaffOption[] = [
  { id: 'sales-agent-1', name: 'Suman Sen', role: 'Senior Sales Advisor' },
  { id: 'sales-agent-2', name: 'Ananya Roy', role: 'Property Advisory Lead' },
  { id: 'sales-agent-3', name: 'Rajesh Verma', role: 'Luxury Portfolio Manager' },
  { id: 'admin-desk', name: 'Great Homes Admin Desk', role: 'Central Operations' },
];

export default function AdminEnquiryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const { id } = use(params);

  const [enquiry, setEnquiry] = useState<EnquiryEntity | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [copiedPhone, setCopiedPhone] = useState(false);
  const [copiedEmail, setCopiedEmail] = useState(false);

  // Form states
  const [status, setStatus] = useState<EnquiryStatus>('NEW');
  const [priority, setPriority] = useState<EnquiryPriority>('NORMAL');
  const [assignedTo, setAssignedTo] = useState<string>('');
  const [assignedToName, setAssignedToName] = useState<string>('');
  const [internalNotes, setInternalNotes] = useState<string>('');
  const [lastContactedAt, setLastContactedAt] = useState<string>('');
  const [nextFollowUpAt, setNextFollowUpAt] = useState<string>('');
  const [requestSiteVisit, setRequestSiteVisit] = useState(false);

  const fetchEnquiry = async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch(`/api/admin/enquiries/${id}`, {
        headers: getAdminHeaders(),
      });

      if (!res.ok) {
        throw new Error(`Enquiry not found (${res.statusText})`);
      }

      const json = await res.json();
      const data: EnquiryEntity = json.data;
      setEnquiry(data);

      setStatus(data.status);
      setPriority(data.priority || 'NORMAL');
      setAssignedTo(data.assignedTo || '');
      setAssignedToName(data.assignedToName || '');
      setInternalNotes(data.internalNotes || '');
      setRequestSiteVisit(data.requestSiteVisit || false);

      if (data.lastContactedAt) {
        const d = new Date(data.lastContactedAt);
        setLastContactedAt(d.toISOString().slice(0, 16));
      } else {
        setLastContactedAt('');
      }

      if (data.nextFollowUpAt) {
        const d = new Date(data.nextFollowUpAt);
        setNextFollowUpAt(d.toISOString().slice(0, 16));
      } else {
        setNextFollowUpAt('');
      }
    } catch (err: any) {
      setError(err.message || 'Error loading enquiry details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEnquiry();
  }, [id]);

  const handleSave = async () => {
    if (!enquiry) return;
    try {
      setSaving(true);
      setError(null);
      setSaveSuccess(false);

      const payload: any = {
        status,
        priority,
        assignedTo: assignedTo || null,
        assignedToName: assignedToName || null,
        internalNotes: internalNotes || null,
        requestSiteVisit,
        lastContactedAt: lastContactedAt ? new Date(lastContactedAt).toISOString() : null,
        nextFollowUpAt: nextFollowUpAt ? new Date(nextFollowUpAt).toISOString() : null,
      };

      const res = await fetch(`/api/admin/enquiries/${id}`, {
        method: 'PATCH',
        headers: {
          ...getAdminHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok || json.error) {
        throw new Error(json.error || 'Failed to update enquiry');
      }

      setEnquiry(json.data);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const handleStaffChange = (staffId: string) => {
    setAssignedTo(staffId);
    if (!staffId) {
      setAssignedToName('');
    } else {
      const found = STAFF_MEMBERS.find((s) => s.id === staffId);
      setAssignedToName(found ? `${found.name} (${found.role})` : staffId);
    }
  };

  const handleMarkContactedNow = () => {
    const nowIso = new Date().toISOString().slice(0, 16);
    setLastContactedAt(nowIso);
    if (status === 'NEW' || status === 'RECEIVED') {
      setStatus('CONTACTED');
    }
  };

  const handleQuickFollowUp = (daysAhead: number) => {
    const futureDate = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
    setNextFollowUpAt(futureDate.toISOString().slice(0, 16));
  };

  const copyToClipboard = (text: string, type: 'phone' | 'email') => {
    navigator.clipboard.writeText(text);
    if (type === 'phone') {
      setCopiedPhone(true);
      setTimeout(() => setCopiedPhone(false), 2000);
    } else {
      setCopiedEmail(true);
      setTimeout(() => setCopiedEmail(false), 2000);
    }
  };

  const allowedTransitions = enquiry ? VALID_STATUS_TRANSITIONS[enquiry.status] || [] : [];

  if (loading) {
    return (
      <div className="space-y-6 pb-16">
        <AdminPageHeader
          title="Enquiry Operations"
          breadcrumbs={[{ label: 'Enquiries', href: '/admin/enquiries' }, { label: 'Loading...' }]}
        />
        <div className="px-6">
          <AdminLoadingState message="Loading enquiry intelligence workspace..." />
        </div>
      </div>
    );
  }

  if (error && !enquiry) {
    return (
      <div className="space-y-6 pb-16">
        <AdminPageHeader
          title="Enquiry Operations"
          breadcrumbs={[{ label: 'Enquiries', href: '/admin/enquiries' }, { label: 'Error' }]}
        />
        <div className="px-6">
          <AdminErrorState title="Enquiry Not Found" error={error} onRetry={fetchEnquiry} />
        </div>
      </div>
    );
  }

  if (!enquiry) return null;

  return (
    <div className="space-y-6 pb-20">
      <AdminPageHeader
        title={enquiry.buyerName}
        description={`Enquiry reference #${enquiry.id} • Submitted on ${new Date(enquiry.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`}
        breadcrumbs={[{ label: 'Enquiries', href: '/admin/enquiries' }, { label: enquiry.buyerName }]}
        primaryAction={{
          label: saving ? 'Saving...' : 'Save Changes',
          onClick: handleSave,
          icon: <Save className="h-4 w-4" />,
          disabled: saving,
        }}
        secondaryActions={[
          {
            label: 'Back to Enquiries',
            href: '/admin/enquiries',
            icon: <ArrowLeft className="h-4 w-4" />,
          },
        ]}
      />

      {saveSuccess && (
        <div className="mx-6 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-center justify-between shadow-2xs animate-fadeIn">
          <div className="flex items-center gap-2 text-sm font-semibold font-display">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            Enquiry updated successfully. All status, assignment, and internal notes are saved.
          </div>
        </div>
      )}

      {error && (
        <div className="mx-6 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 flex items-center gap-2 text-sm font-medium font-body shadow-2xs">
          <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="px-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left / Main Column: Details & Buyer Info (2 cols) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Section 1: Buyer Information */}
          <div className="bg-white p-6 rounded-xl border border-neutral-200/80 shadow-2xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-900 font-display flex items-center gap-2">
                <UserCheck className="h-4 w-4 text-terracotta" />
                Buyer Information
              </h3>
              <span className="text-[11px] font-mono font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                Staff Confidential
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-neutral-500 font-display">Full Name</label>
                <p className="text-base font-bold text-neutral-900 font-display mt-0.5">{enquiry.buyerName}</p>
              </div>

              <div>
                <label className="text-xs font-semibold text-neutral-500 font-display">Preferred Channel</label>
                <div className="mt-1">
                  <span className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded bg-neutral-100 text-neutral-800 font-display">
                    {enquiry.preferredContact || 'WHATSAPP'}
                  </span>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-neutral-500 font-display">Mobile Phone</label>
                <div className="flex items-center gap-2 mt-1">
                  <a
                    href={`tel:${enquiry.buyerPhone}`}
                    className="text-sm font-bold text-terracotta hover:underline font-mono flex items-center gap-1.5"
                  >
                    <Phone className="h-3.5 w-3.5" />
                    {enquiry.buyerPhone}
                  </a>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(enquiry.buyerPhone, 'phone')}
                    className="p-1 text-neutral-400 hover:text-neutral-700 rounded hover:bg-neutral-100 transition-colors"
                    title="Copy phone"
                  >
                    {copiedPhone ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-neutral-500 font-display">Email Address</label>
                <div className="flex items-center gap-2 mt-1">
                  {enquiry.buyerEmail ? (
                    <>
                      <a
                        href={`mailto:${enquiry.buyerEmail}`}
                        className="text-sm font-medium text-neutral-800 hover:text-terracotta font-mono flex items-center gap-1.5 truncate max-w-xs"
                      >
                        <Mail className="h-3.5 w-3.5 text-neutral-400" />
                        {enquiry.buyerEmail}
                      </a>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(enquiry.buyerEmail!, 'email')}
                        className="p-1 text-neutral-400 hover:text-neutral-700 rounded hover:bg-neutral-100 transition-colors"
                        title="Copy email"
                      >
                        {copiedEmail ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                      </button>
                    </>
                  ) : (
                    <span className="text-xs text-neutral-400 italic">Not provided</span>
                  )}
                </div>
              </div>
            </div>

            {/* Site Visit Request Banner */}
            <div className="pt-2">
              <div
                className={`p-3 rounded-lg border flex items-center justify-between ${
                  requestSiteVisit
                    ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                    : 'bg-neutral-50 border-neutral-200 text-neutral-600'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <CheckCircle2
                    className={`h-5 w-5 ${requestSiteVisit ? 'text-emerald-600' : 'text-neutral-400'}`}
                  />
                  <div>
                    <p className="text-xs font-bold font-display">
                      {requestSiteVisit ? 'Site Visit Requested by Buyer' : 'No Site Visit Requested Initially'}
                    </p>
                    <p className="text-[11px] text-neutral-500 font-body">
                      {requestSiteVisit
                        ? 'Buyer explicitly opted in for property inspection assistance.'
                        : 'Buyer submitted general advisory / pricing information request.'}
                    </p>
                  </div>
                </div>
                <label className="flex items-center gap-2 text-xs font-bold font-display cursor-pointer">
                  <input
                    type="checkbox"
                    checked={requestSiteVisit}
                    onChange={(e) => setRequestSiteVisit(e.target.checked)}
                    className="rounded text-terracotta focus:ring-terracotta h-4 w-4"
                  />
                  <span>Require Visit</span>
                </label>
              </div>
            </div>

            {/* Visitor & Customer 360 Attribution Strip */}
            <div className="pt-2">
              <div className="p-3.5 rounded-lg bg-neutral-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="text-xs font-display font-bold flex items-center gap-1.5">
                    <ShieldCheck className="h-4 w-4 text-emerald-400" />
                    {enquiry.customerId || enquiry.metadata?.customerId
                      ? 'OTP-Verified Customer Session Linked'
                      : enquiry.visitorId
                      ? 'First-Party Anonymous Visitor Linked'
                      : 'Visitor & Customer 360 Intelligence'}
                  </div>
                  <div className="text-[11px] text-neutral-300 font-mono">
                    {enquiry.customerId || enquiry.metadata?.customerId
                      ? `Customer ID: ${enquiry.customerId || enquiry.metadata?.customerId}`
                      : enquiry.visitorId
                      ? `Visitor ID: ${enquiry.visitorId}`
                      : `Search Customer 360 by mobile (${enquiry.buyerPhone})`}
                  </div>
                </div>

                {enquiry.customerId || enquiry.metadata?.customerId ? (
                  <Link
                    href={`/admin/intelligence/customers/${
                      enquiry.customerId || enquiry.metadata?.customerId
                    }`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-neutral-900 text-xs font-display font-bold hover:bg-neutral-100 transition-colors shrink-0"
                  >
                    <span>Open Customer 360</span>
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                ) : (
                  <Link
                    href="/admin/intelligence/customers"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 text-white text-xs font-display font-semibold hover:bg-white/20 transition-colors shrink-0"
                  >
                    <span>Open Visitor & Customer 360</span>
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                )}
              </div>
            </div>
          </div>

          {/* Section 2: Property Interest & Discovery Context */}
          <div className="bg-white p-6 rounded-xl border border-neutral-200/80 shadow-2xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-900 font-display flex items-center gap-2">
                <Building2 className="h-4 w-4 text-terracotta" />
                Property Interest Context
              </h3>
              <AdminBadge variant={enquiry.contextType} label={enquiry.contextType} />
            </div>

            <div className="bg-neutral-50 p-4 rounded-xl border border-neutral-200/70 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h4 className="text-base font-bold text-neutral-900 font-display">
                    {enquiry.projectName || enquiry.listingTitle || 'Great Homes Discovery'}
                  </h4>
                  {enquiry.locationName && (
                    <p className="text-xs text-neutral-500 font-body mt-0.5">{enquiry.locationName}</p>
                  )}
                </div>

                {/* Deep Link to corresponding Admin resource */}
                {enquiry.projectId && (
                  <Link
                    href={`/admin/projects/${enquiry.projectId}`}
                    className="inline-flex items-center gap-1 text-xs font-bold text-terracotta hover:underline font-display shrink-0"
                  >
                    <span>View Project in Admin</span>
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                )}
                {enquiry.listingId && enquiry.contextType === 'RESALE' && (
                  <Link
                    href={`/admin/listings/resale/${enquiry.listingId}`}
                    className="inline-flex items-center gap-1 text-xs font-bold text-terracotta hover:underline font-display shrink-0"
                  >
                    <span>View Resale Listing</span>
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                )}
                {enquiry.listingId && enquiry.contextType === 'RENTAL' && (
                  <Link
                    href={`/admin/listings/rent/${enquiry.listingId}`}
                    className="inline-flex items-center gap-1 text-xs font-bold text-terracotta hover:underline font-display shrink-0"
                  >
                    <span>View Rental Listing</span>
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2 border-t border-neutral-200/60 text-xs">
                <div>
                  <span className="text-neutral-500 font-display">Configuration:</span>
                  <p className="font-semibold text-neutral-800 mt-0.5">
                    {enquiry.configuration || enquiry.propertyType || 'Standard'}
                  </p>
                </div>
                <div>
                  <span className="text-neutral-500 font-display">Pricing Reference:</span>
                  <p className="font-semibold text-neutral-800 mt-0.5">
                    {enquiry.priceDisplay || 'Market Pricing'}
                  </p>
                </div>
                <div>
                  <span className="text-neutral-500 font-display">Attribution Source:</span>
                  <p className="font-semibold text-neutral-800 mt-0.5 font-mono text-[11px]">
                    {enquiry.source === 'BROCHURE_DOWNLOAD' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-50 text-indigo-800 border border-indigo-200 font-display font-bold text-[11px]">
                        <FileText className="h-3 w-3 text-indigo-600" />
                        BROCHURE_DOWNLOAD
                      </span>
                    ) : (
                      enquiry.source || 'WEB_PORTAL'
                    )}
                  </p>
                </div>
              </div>

              {enquiry.metadata && typeof enquiry.metadata.marketingConsent === 'boolean' && (
                <div className="text-xs text-neutral-600 font-body pt-1 border-t border-neutral-200/40">
                  <span className="font-semibold text-neutral-600 font-display">Marketing Consent:</span>{' '}
                  {enquiry.metadata.marketingConsent ? 'Opted In' : 'Not Opted In'}
                </div>
              )}

              {enquiry.sourcePage && (
                <div className="text-xs text-neutral-500 font-mono text-[11px] pt-1 border-t border-neutral-200/40 truncate">
                  <span className="font-semibold text-neutral-600 font-display">Source Page:</span> {enquiry.sourcePage}
                </div>
              )}
            </div>

            {/* Buyer Inbound Message */}
            <div>
              <label className="text-xs font-semibold text-neutral-600 font-display">Buyer Request Message</label>
              <div className="mt-1.5 p-3.5 bg-white rounded-lg border border-neutral-200 text-xs text-neutral-800 font-body leading-relaxed whitespace-pre-wrap">
                {enquiry.message || 'No additional message was submitted by the buyer.'}
              </div>
            </div>
          </div>

          {/* Section 3: Internal Staff Operational Notes (STRICTLY INTERNAL) */}
          <div className="bg-white p-6 rounded-xl border border-neutral-200/80 shadow-2xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-900 font-display flex items-center gap-2">
                <FileText className="h-4 w-4 text-terracotta" />
                Internal Staff Notes & Activity Log
              </h3>
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded font-display">
                <ShieldCheck className="h-3 w-3 text-amber-600" />
                Strictly Internal
              </span>
            </div>

            <div className="p-3 bg-amber-50/60 border border-amber-200/80 rounded-lg text-xs text-amber-900 font-body">
              <strong>Confidentiality Notice:</strong> Internal notes are strictly protected and only accessible by Great Homes personnel. They are NEVER sent to public consumers, listing brokers, or property owners.
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-neutral-700 font-display">
                Operations / Follow-up Notes
              </label>
              <textarea
                rows={5}
                value={internalNotes}
                onChange={(e) => setInternalNotes(e.target.value)}
                placeholder="Log internal discussions, buyer qualification notes, budget constraints, preferred possession timeline, site visit feedback..."
                className="w-full text-xs font-body p-3 bg-white border border-neutral-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-terracotta focus:border-terracotta leading-relaxed"
              />
            </div>

            {/* Quick Note Presets */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-xs text-neutral-500 font-display">Quick inserts:</span>
              {[
                'Verified loan pre-approval ready.',
                'Looking for possession within 6 months.',
                'Weekend site visit requested.',
                'Price sensitive; negotiating on token deposit.',
                'Spoke with buyer; brochure sent via WhatsApp.',
              ].map((preset, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    const separator = internalNotes.trim() ? '\n' : '';
                    setInternalNotes(internalNotes + separator + `[${new Date().toLocaleDateString('en-IN')}] ${preset}`);
                  }}
                  className="text-[11px] font-body bg-neutral-100 hover:bg-neutral-200 text-neutral-700 px-2 py-1 rounded transition-colors"
                >
                  + {preset}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Operational Controls & Pipeline (1 col) */}
        <div className="space-y-6">
          {/* Status Lifecycle & Priority Box */}
          <div className="bg-white p-6 rounded-xl border border-neutral-200/80 shadow-2xs space-y-5">
            <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-900 font-display pb-3 border-b border-neutral-100">
              Pipeline Management
            </h3>

            {/* Current Status & Transitions */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-neutral-700 font-display flex items-center justify-between">
                <span>Enquiry Status</span>
                <AdminBadge variant={status} label={status.replace(/_/g, ' ')} />
              </label>

              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as EnquiryStatus)}
                className="w-full bg-neutral-50 border border-neutral-300 rounded-lg p-2.5 text-xs font-display focus:outline-none focus:ring-1 focus:ring-terracotta"
              >
                <option value={enquiry.status}>Current: {ENQUIRY_STATUS_LABELS[enquiry.status] || enquiry.status}</option>
                {allowedTransitions.map((st) => (
                  <option key={st} value={st}>
                    → Move to: {ENQUIRY_STATUS_LABELS[st] || st}
                  </option>
                ))}
              </select>

              <div className="text-[11px] text-neutral-500 font-body">
                {allowedTransitions.length > 0 ? (
                  <span>Valid next steps: {allowedTransitions.join(', ')}</span>
                ) : (
                  <span>Terminal or stable state.</span>
                )}
              </div>
            </div>

            {/* Priority Selector */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-neutral-700 font-display flex items-center justify-between">
                <span>Priority Level</span>
                <AdminBadge variant={priority} label={priority} />
              </label>

              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as EnquiryPriority)}
                className="w-full bg-neutral-50 border border-neutral-300 rounded-lg p-2.5 text-xs font-display focus:outline-none focus:ring-1 focus:ring-terracotta"
              >
                <option value="LOW">Low</option>
                <option value="NORMAL">Normal</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent (Immediate Attention)</option>
              </select>
            </div>

            {/* Staff Assignment */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-neutral-700 font-display">
                Assigned Staff Member
              </label>

              <select
                value={assignedTo}
                onChange={(e) => handleStaffChange(e.target.value)}
                className="w-full bg-neutral-50 border border-neutral-300 rounded-lg p-2.5 text-xs font-display focus:outline-none focus:ring-1 focus:ring-terracotta"
              >
                <option value="">Unassigned</option>
                {STAFF_MEMBERS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} — {s.role}
                  </option>
                ))}
              </select>
            </div>

            {/* Save Button */}
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-terracotta hover:bg-terracotta-dark text-white text-xs font-bold rounded-lg font-display transition-colors shadow-2xs disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Saving...' : 'Update Lead Status'}
            </button>
          </div>

          {/* Follow-up & Contact Tracking Box */}
          <div className="bg-white p-6 rounded-xl border border-neutral-200/80 shadow-2xs space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-900 font-display pb-3 border-b border-neutral-100 flex items-center gap-2">
              <Clock className="h-4 w-4 text-terracotta" />
              Contact & Follow-up
            </h3>

            {/* Last Contacted */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-neutral-700 font-display">Last Contacted</label>
                <button
                  type="button"
                  onClick={handleMarkContactedNow}
                  className="text-[11px] font-bold text-terracotta hover:underline font-display"
                >
                  Mark Contacted Now
                </button>
              </div>
              <input
                type="datetime-local"
                value={lastContactedAt}
                onChange={(e) => setLastContactedAt(e.target.value)}
                className="w-full bg-neutral-50 border border-neutral-300 rounded-lg p-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-terracotta"
              />
            </div>

            {/* Next Follow-Up */}
            <div className="space-y-1.5 pt-2 border-t border-neutral-100">
              <label className="text-xs font-semibold text-neutral-700 font-display">Next Follow-Up Due</label>
              <input
                type="datetime-local"
                value={nextFollowUpAt}
                onChange={(e) => setNextFollowUpAt(e.target.value)}
                className="w-full bg-neutral-50 border border-neutral-300 rounded-lg p-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-terracotta"
              />

              <div className="flex items-center gap-1.5 pt-1">
                <span className="text-[10px] text-neutral-500 font-display">Quick set:</span>
                <button
                  type="button"
                  onClick={() => handleQuickFollowUp(1)}
                  className="text-[11px] bg-neutral-100 hover:bg-neutral-200 text-neutral-700 px-2 py-0.5 rounded font-display"
                >
                  +1 Day
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickFollowUp(3)}
                  className="text-[11px] bg-neutral-100 hover:bg-neutral-200 text-neutral-700 px-2 py-0.5 rounded font-display"
                >
                  +3 Days
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickFollowUp(7)}
                  className="text-[11px] bg-neutral-100 hover:bg-neutral-200 text-neutral-700 px-2 py-0.5 rounded font-display"
                >
                  +1 Week
                </button>
              </div>
            </div>
          </div>

          {/* Audit Trail Box */}
          <div className="bg-neutral-50 p-4 rounded-xl border border-neutral-200/70 text-xs font-mono text-neutral-600 space-y-1.5">
            <div className="flex justify-between">
              <span className="text-neutral-400">Created:</span>
              <span className="font-semibold">{new Date(enquiry.createdAt).toLocaleString('en-IN')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-400">Last Updated:</span>
              <span className="font-semibold">{new Date(enquiry.updatedAt).toLocaleString('en-IN')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-400">Enquiry ID:</span>
              <span className="font-semibold truncate max-w-[140px]">{enquiry.id}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
