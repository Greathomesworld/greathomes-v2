'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { AdminPageHeader } from '@/src/components/admin/AdminPageHeader';
import { AdminTable, ColumnDef } from '@/src/components/admin/AdminTable';
import { AdminFilterBar, FilterOption } from '@/src/components/admin/AdminFilterBar';
import { AdminBadge } from '@/src/components/admin/AdminBadge';
import { AdminSearch } from '@/src/components/admin/AdminSearch';
import { useAdminAuth } from '@/src/components/admin/AdminAuthProvider';
import { getAdminHeaders } from '@/src/lib/adminAuth';
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Eye,
  RefreshCw,
} from 'lucide-react';
import { AUDIT_ACTIONS } from '@/src/domain/audit/auditActions';
import { AUDIT_RESOURCES } from '@/src/domain/audit/auditResources';

interface AuditLogDto {
  id: string;
  actorStaffId: string | null;
  actorRole: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  resourceLabel: string | null;
  timestamp: string;
  requestId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  before: Record<string, any> | null;
  after: Record<string, any> | null;
  metadata: Record<string, any> | null;
  success: boolean;
  failureReason: string | null;
  createdAt: string;
}

export default function AdminAuditPage() {
  const { hasCapability } = useAdminAuth();

  const [auditLogs, setAuditLogs] = useState<AuditLogDto[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Pagination
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAction, setSelectedAction] = useState('ALL');
  const [selectedResourceType, setSelectedResourceType] = useState('ALL');
  const [selectedSuccess, setSelectedSuccess] = useState('ALL');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);

  // Detail modal
  const [selectedLog, setSelectedLog] = useState<AuditLogDto | null>(null);

  const fetchAuditLogs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (searchQuery.trim()) params.append('search', searchQuery.trim());
      if (selectedAction !== 'ALL') params.append('action', selectedAction);
      if (selectedResourceType !== 'ALL') params.append('resourceType', selectedResourceType);
      if (selectedSuccess !== 'ALL') params.append('success', selectedSuccess === 'SUCCESS' ? 'true' : 'false');
      params.append('page', page.toString());
      params.append('pageSize', pageSize.toString());

      const res = await fetch(`/api/admin/audit?${params.toString()}`, {
        headers: getAdminHeaders(),
      });

      if (!res.ok) {
        if (res.status === 403) {
          setError('Access Denied: You lack permissions (audit.read) to view the administrative audit trail.');
        } else {
          setError('Failed to load audit logs.');
        }
        setAuditLogs([]);
        setLoading(false);
        return;
      }

      const data = await res.json();
      setAuditLogs(data.data || []);
      setTotal(data.pagination?.total || 0);
    } catch {
      setError('A network error occurred while loading audit records.');
    } finally {
      setLoading(false);
    }
  }, [searchQuery, selectedAction, selectedResourceType, selectedSuccess, page, pageSize]);

  useEffect(() => {
    fetchAuditLogs();
  }, [fetchAuditLogs]);

  const filterOptions: FilterOption[] = [
    {
      key: 'action',
      label: 'Action',
      value: selectedAction,
      onChange: (val) => {
        setSelectedAction(val);
        setPage(1);
      },
      options: [
        { label: 'All Actions', value: 'ALL' },
        ...AUDIT_ACTIONS.map((a) => ({ label: a, value: a })),
      ],
    },
    {
      key: 'resourceType',
      label: 'Resource',
      value: selectedResourceType,
      onChange: (val) => {
        setSelectedResourceType(val);
        setPage(1);
      },
      options: [
        { label: 'All Resources', value: 'ALL' },
        ...AUDIT_RESOURCES.map((r) => ({ label: r, value: r })),
      ],
    },
    {
      key: 'success',
      label: 'Status',
      value: selectedSuccess,
      onChange: (val) => {
        setSelectedSuccess(val);
        setPage(1);
      },
      options: [
        { label: 'All Statuses', value: 'ALL' },
        { label: 'Successful', value: 'SUCCESS' },
        { label: 'Failed', value: 'FAILED' },
      ],
    },
  ];

  const columns: ColumnDef<AuditLogDto>[] = [
    {
      header: 'Timestamp',
      cell: (row) => (
        <div className="flex flex-col text-xs text-neutral-600">
          <span className="font-medium text-neutral-900">
            {new Date(row.timestamp).toLocaleDateString()}
          </span>
          <span className="text-neutral-500 font-mono text-[11px]">
            {new Date(row.timestamp).toLocaleTimeString()}
          </span>
        </div>
      ),
    },
    {
      header: 'Actor & Role',
      cell: (row) => (
        <div className="flex flex-col text-xs space-y-1">
          <span className="font-medium text-neutral-900">{row.actorStaffId || 'System'}</span>
          <AdminBadge variant={row.actorRole} size="sm" />
        </div>
      ),
    },
    {
      header: 'Action',
      cell: (row) => (
        <AdminBadge
          label={row.action}
          variant={
            row.action.includes('CREATE') || row.action.includes('PUBLISH') || row.action.includes('VERIFY')
              ? 'APPROVED'
              : row.action.includes('DELETE') || row.action.includes('REVOKE') || row.action.includes('DISABLE')
              ? 'ARCHIVED'
              : 'DRAFT'
          }
          size="sm"
        />
      ),
    },
    {
      header: 'Resource',
      cell: (row) => (
        <div className="flex flex-col text-xs">
          <span className="font-semibold text-neutral-900">{row.resourceType}</span>
          {row.resourceLabel && (
            <span className="text-neutral-500 truncate max-w-[200px]" title={row.resourceLabel}>
              {row.resourceLabel}
            </span>
          )}
        </div>
      ),
    },
    {
      header: 'Status',
      cell: (row) => (
        row.success ? (
          <span className="inline-flex items-center gap-1 text-emerald-700 text-xs font-medium">
            <CheckCircle2 className="h-3.5 w-3.5" /> Success
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-rose-700 text-xs font-medium" title={row.failureReason || undefined}>
            <XCircle className="h-3.5 w-3.5" /> Failed
          </span>
        )
      ),
    },
    {
      header: 'Request ID',
      cell: (row) => (
        <span className="font-mono text-[11px] text-neutral-500">
          {row.requestId || '—'}
        </span>
      ),
    },
    {
      header: 'Actions',
      cell: (row) => (
        <button
          onClick={() => setSelectedLog(row)}
          className="p-1.5 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-neutral-700 hover:text-neutral-900 transition-colors"
          title="Inspect Audit Entry"
        >
          <Eye className="h-4 w-4" />
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Audit Logs & Administrative Accountability"
        description="Append-only server-generated audit records for accountability, security forensics, and compliance."
        primaryAction={{
          label: 'Refresh Audit Trail',
          icon: <RefreshCw className="h-4 w-4" />,
          onClick: fetchAuditLogs,
        }}
      />

      {/* Filters & Search */}
      <div className="bg-white border border-neutral-200 rounded-xl p-4 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="w-full md:w-80">
            <AdminSearch
              value={searchQuery}
              onChange={(v) => {
                setSearchQuery(v);
                setPage(1);
              }}
              placeholder="Search actions, resources, labels..."
            />
          </div>
          <div className="w-full md:w-auto">
            <AdminFilterBar
              filters={filterOptions}
              onReset={() => {
                setSelectedAction('ALL');
                setSelectedResourceType('ALL');
                setSelectedSuccess('ALL');
                setSearchQuery('');
                setPage(1);
              }}
            />
          </div>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm">
          {error}
        </div>
      )}

      {/* Table */}
      <AdminTable
        columns={columns}
        data={auditLogs}
        isLoading={loading}
        keyExtractor={(item) => item.id}
        emptyMessage="No audit log records found matching the criteria."
      />

      {/* Detail Modal / Inspector */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-neutral-200 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-neutral-200 pb-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-terracotta/10 flex items-center justify-center text-terracotta">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-neutral-900 font-display">Audit Entry Details</h3>
                  <p className="text-xs font-mono text-neutral-500">{selectedLog.id}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                className="text-neutral-500 hover:text-neutral-900 p-1.5 rounded-lg bg-neutral-100"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div className="bg-neutral-50 p-3 rounded-xl border border-neutral-200">
                <span className="text-neutral-500 block mb-1">Timestamp</span>
                <span className="font-medium text-neutral-900">{new Date(selectedLog.timestamp).toLocaleString()}</span>
              </div>
              <div className="bg-neutral-50 p-3 rounded-xl border border-neutral-200">
                <span className="text-neutral-500 block mb-1">Action & Resource</span>
                <span className="font-semibold text-neutral-900">{selectedLog.action} on {selectedLog.resourceType}</span>
              </div>
              <div className="bg-neutral-50 p-3 rounded-xl border border-neutral-200">
                <span className="text-neutral-500 block mb-1">Actor Staff ID / Role</span>
                <span className="font-medium text-neutral-900">{selectedLog.actorStaffId || 'System'} ({selectedLog.actorRole})</span>
              </div>
              <div className="bg-neutral-50 p-3 rounded-xl border border-neutral-200">
                <span className="text-neutral-500 block mb-1">Request ID</span>
                <span className="font-mono text-neutral-900">{selectedLog.requestId || '—'}</span>
              </div>
            </div>

            {selectedLog.resourceLabel && (
              <div className="bg-neutral-50 p-3 rounded-xl border border-neutral-200 text-xs">
                <span className="text-neutral-500 block mb-1">Resource Label / ID</span>
                <span className="text-neutral-900 font-medium">{selectedLog.resourceLabel} ({selectedLog.resourceId || 'N/A'})</span>
              </div>
            )}

            {/* Before / After Diff Inspector */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-neutral-50 p-4 rounded-xl border border-neutral-200">
                <h4 className="text-xs font-bold text-neutral-700 uppercase tracking-wider mb-2 font-display">Before State</h4>
                <pre className="text-[11px] font-mono text-neutral-700 bg-white p-3 rounded-lg border border-neutral-200 overflow-x-auto max-h-48">
                  {selectedLog.before ? JSON.stringify(selectedLog.before, null, 2) : 'No before snapshot'}
                </pre>
              </div>
              <div className="bg-neutral-50 p-4 rounded-xl border border-neutral-200">
                <h4 className="text-xs font-bold text-neutral-700 uppercase tracking-wider mb-2 font-display">After State</h4>
                <pre className="text-[11px] font-mono text-neutral-700 bg-white p-3 rounded-lg border border-neutral-200 overflow-x-auto max-h-48">
                  {selectedLog.after ? JSON.stringify(selectedLog.after, null, 2) : 'No after snapshot'}
                </pre>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedLog(null)}
                className="px-4 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-medium transition-colors cursor-pointer"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
