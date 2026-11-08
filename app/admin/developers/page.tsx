'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AdminPageHeader } from '@/src/components/admin/AdminPageHeader';
import { AdminTable, ColumnDef } from '@/src/components/admin/AdminTable';
import { AdminBadge } from '@/src/components/admin/AdminBadge';
import { AdminSearch } from '@/src/components/admin/AdminSearch';
import { AdminFilterBar } from '@/src/components/admin/AdminFilterBar';
import { AdminPagination } from '@/src/components/admin/AdminPagination';
import { AdminLoadingState } from '@/src/components/admin/AdminLoadingState';
import { AdminErrorState } from '@/src/components/admin/AdminErrorState';
import { AdminConfirmDialog } from '@/src/components/admin/AdminConfirmDialog';
import { getAdminHeaders } from '@/src/lib/adminAuth';
import { Building, Plus, RefreshCw, Eye, Edit, Globe, Calendar, CheckCircle2, Archive, Trash2 } from 'lucide-react';

export default function AdminDevelopersPage() {
  const router = useRouter();
  const [developers, setDevelopers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });

  // Confirmation dialogs
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{ type: 'PUBLISH' | 'ARCHIVE' | 'DELETE'; id: string; name: string } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchDevelopers = async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({
        page: String(page),
        limit: '10',
        status: statusFilter,
        search,
      });

      const res = await fetch(`/api/admin/developers?${params.toString()}`, {
        headers: getAdminHeaders(),
        cache: 'no-store',
      });

      if (!res.ok) {
        throw new Error(`Failed to load developers: ${res.statusText}`);
      }

      const json = await res.json();
      setDevelopers(json.items || []);
      if (json.pagination) {
        setPagination(json.pagination);
      }
    } catch (err: any) {
      setError(err.message || 'Error fetching developers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDevelopers();
  }, [page, statusFilter, search]);

  const handleLifecycleClick = (type: 'PUBLISH' | 'ARCHIVE' | 'DELETE', id: string, name: string) => {
    setConfirmAction({ type, id, name });
    setConfirmOpen(true);
  };

  const executeLifecycleTransition = async () => {
    if (!confirmAction) return;
    try {
      setActionLoading(true);
      if (confirmAction.type === 'DELETE') {
        const res = await fetch(`/api/admin/developers/${confirmAction.id}`, {
          method: 'DELETE',
          headers: getAdminHeaders(),
        });

        if (!res.ok) {
          const errJson = await res.json();
          throw new Error(errJson.message || 'Failed to delete developer.');
        }
      } else {
        const url = `/api/admin/developers/${confirmAction.id}/${confirmAction.type.toLowerCase()}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: getAdminHeaders(),
        });

        if (!res.ok) {
          const errJson = await res.json();
          throw new Error(errJson.message || `Failed to ${confirmAction.type.toLowerCase()} developer`);
        }
      }

      setConfirmOpen(false);
      setConfirmAction(null);
      fetchDevelopers();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const columns: ColumnDef<any>[] = [
    {
      header: 'Developer',
      cell: (item) => (
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-neutral-100 flex items-center justify-center font-bold text-neutral-800 font-display text-sm shrink-0 overflow-hidden border border-neutral-200">
            {item.logoUrl ? (
              <img src={item.logoUrl} alt={item.name} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              item.name?.slice(0, 2).toUpperCase()
            )}
          </div>
          <div>
            <p className="font-bold text-neutral-900 font-display">{item.name}</p>
            <p className="text-xs text-neutral-500 font-mono">{item.slug}</p>
          </div>
        </div>
      ),
    },
    {
      header: 'Status',
      cell: (item) => <AdminBadge variant={item.status || 'DRAFT'} />,
    },
    {
      header: 'Projects',
      cell: (item) => (
        <span className="font-semibold text-neutral-700 font-mono">
          {item.projectCount ?? 0}
        </span>
      ),
    },
    {
      header: 'Website',
      cell: (item) => (
        item.websiteUrl ? (
          <a
            href={item.websiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-terracotta hover:underline font-mono"
            onClick={(e) => e.stopPropagation()}
          >
            <Globe className="h-3.5 w-3.5" />
            <span className="max-w-[150px] truncate">{item.websiteUrl}</span>
          </a>
        ) : (
          <span className="text-xs text-neutral-400 font-mono">—</span>
        )
      ),
    },
    {
      header: 'Actions',
      cell: (item) => (
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <Link
            href={`/admin/developers/${item.id}`}
            className="p-1.5 text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 rounded-md transition-colors"
            title="View Details"
          >
            <Eye className="h-4 w-4" />
          </Link>
          <Link
            href={`/admin/developers/${item.id}/edit`}
            className="p-1.5 text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 rounded-md transition-colors"
            title="Edit Developer"
          >
            <Edit className="h-4 w-4" />
          </Link>
          {item.status !== 'PUBLISHED' && (
            <button
              onClick={() => handleLifecycleClick('PUBLISH', item.id, item.name)}
              className="p-1.5 text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 rounded-md transition-colors cursor-pointer"
              title="Publish Profile"
            >
              <CheckCircle2 className="h-4 w-4" />
            </button>
          )}
          {item.status !== 'ARCHIVED' && (
            <button
              onClick={() => handleLifecycleClick('ARCHIVE', item.id, item.name)}
              className="p-1.5 text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-md transition-colors cursor-pointer"
              title="Archive Profile"
            >
              <Archive className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={() => handleLifecycleClick('DELETE', item.id, item.name)}
            className="p-1.5 text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-md transition-colors cursor-pointer"
            title="Delete Profile"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6 pb-12">
      <AdminPageHeader
        title="Real Estate Developers"
        description="Verify and publish developer master profiles, website connections, logos, and canonical brand identities."
        breadcrumbs={[{ label: 'Developers' }]}
        primaryAction={{
          label: 'Create Developer',
          href: '/admin/developers/create',
          icon: <Plus className="h-4 w-4" />,
        }}
        secondaryActions={[
          {
            label: 'Refresh',
            onClick: fetchDevelopers,
            icon: <RefreshCw className="h-4 w-4" />,
          },
        ]}
      />

      <div className="px-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-4 border border-neutral-200/80 rounded-xl shadow-2xs animate-fade-in">
          <AdminSearch
            placeholder="Search developers by name or slug..."
            value={search}
            onChange={setSearch}
          />
          <AdminFilterBar
            filters={[
              {
                key: 'status',
                label: 'Status',
                options: [
                  { label: 'All Statuses', value: 'ALL' },
                  { label: 'Draft', value: 'DRAFT' },
                  { label: 'Published', value: 'PUBLISHED' },
                  { label: 'Archived', value: 'ARCHIVED' },
                ],
                value: statusFilter,
                onChange: setStatusFilter,
              },
            ]}
            onReset={() => {
              setStatusFilter('ALL');
              setSearch('');
            }}
          />
        </div>

        {loading && <AdminLoadingState skeletonType="list" />}

        {error && <AdminErrorState title="Failed to load developers" error={error} onRetry={fetchDevelopers} />}

        {!loading && !error && (
          <>
            <AdminTable
              columns={columns}
              data={developers}
              keyExtractor={(item) => item.id}
              onRowClick={(item) => router.push(`/admin/developers/${item.id}`)}
              emptyMessage="No developers matching criteria found."
            />
            <AdminPagination
              currentPage={page}
              totalPages={pagination.totalPages}
              totalItems={pagination.total}
              pageSize={10}
              onPageChange={setPage}
            />
          </>
        )}
      </div>

      <AdminConfirmDialog
        isOpen={confirmOpen}
        title={
          confirmAction?.type === 'PUBLISH'
            ? 'Publish Developer Profile?'
            : confirmAction?.type === 'ARCHIVE'
            ? 'Archive Developer Profile?'
            : 'Delete Developer Profile?'
        }
        message={
          confirmAction?.type === 'PUBLISH'
            ? `Are you sure you want to publish the profile for '${confirmAction?.name}'? This makes the developer visible on public pages.`
            : confirmAction?.type === 'ARCHIVE'
            ? `Are you sure you want to archive '${confirmAction?.name}'? This hides the brand and all associated projects from public discovery.`
            : `Are you sure you want to permanently delete '${confirmAction?.name}'? This operation is IRREVERSIBLE and uses a Protected Deletion strategy. If the developer has associated real estate projects, deletion will be blocked.`
        }
        confirmLabel={
          confirmAction?.type === 'PUBLISH'
            ? 'Publish Now'
            : confirmAction?.type === 'ARCHIVE'
            ? 'Archive Now'
            : 'Delete Permanently'
        }
        isDestructive={confirmAction?.type === 'ARCHIVE' || confirmAction?.type === 'DELETE'}
        isLoading={actionLoading}
        onConfirm={executeLifecycleTransition}
        onCancel={() => {
          setConfirmOpen(false);
          setConfirmAction(null);
        }}
      />
    </div>
  );
}
