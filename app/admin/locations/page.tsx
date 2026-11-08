'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AdminPageHeader } from '@/src/components/admin/AdminPageHeader';
import { AdminTable, ColumnDef } from '@/src/components/admin/AdminTable';
import { AdminBadge } from '@/src/components/admin/AdminBadge';
import { AdminSearch } from '@/src/components/admin/AdminSearch';
import { AdminFilterBar } from '@/src/components/admin/AdminFilterBar';
import { AdminLoadingState } from '@/src/components/admin/AdminLoadingState';
import { AdminErrorState } from '@/src/components/admin/AdminErrorState';
import { AdminConfirmDialog } from '@/src/components/admin/AdminConfirmDialog';
import { getAdminHeaders } from '@/src/lib/adminAuth';
import { MapPin, Plus, RefreshCw, Eye, Edit, CheckCircle2, Archive, GitFork } from 'lucide-react';

export default function AdminLocationsPage() {
  const router = useRouter();
  const [locations, setLocations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Confirmation dialog state
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{ type: 'PUBLISH' | 'ARCHIVE'; id: string; name: string } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchLocations = async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({
        type: typeFilter,
        status: statusFilter,
        search,
      });

      const res = await fetch(`/api/admin/locations?${params.toString()}`, {
        headers: getAdminHeaders(),
      });

      if (!res.ok) {
        throw new Error(`Failed to load locations: ${res.statusText}`);
      }

      const json = await res.json();
      setLocations(json.items || []);
    } catch (err: any) {
      setError(err.message || 'Error fetching locations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLocations();
  }, [typeFilter, statusFilter, search]);

  const handleLifecycleClick = (type: 'PUBLISH' | 'ARCHIVE', id: string, name: string) => {
    setConfirmAction({ type, id, name });
    setConfirmOpen(true);
  };

  const executeLifecycleTransition = async () => {
    if (!confirmAction) return;
    try {
      setActionLoading(true);
      const url = `/api/admin/locations/${confirmAction.id}/${confirmAction.type.toLowerCase()}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: getAdminHeaders(),
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.message || `Failed to ${confirmAction.type.toLowerCase()} location`);
      }

      setConfirmOpen(false);
      setConfirmAction(null);
      fetchLocations();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Build a lookup map to quickly resolve parent names in the table view
  const locationsMap = new Map(locations.map(l => [l.id, l]));

  const columns: ColumnDef<any>[] = [
    {
      header: 'Location Node',
      cell: (item) => (
        <div className="flex items-center gap-2.5">
          <MapPin className="h-4 w-4 text-terracotta shrink-0" />
          <div>
            <p className="font-bold text-neutral-900 font-display">{item.name}</p>
            <p className="text-xs text-neutral-500 font-mono">{item.slug}</p>
          </div>
        </div>
      ),
    },
    {
      header: 'Hierarchy Tier',
      cell: (item) => (
        <span className="text-xs font-semibold uppercase bg-neutral-100 text-neutral-800 px-2 py-0.5 rounded font-display tracking-wider">
          {item.type || 'CITY'}
        </span>
      ),
    },
    {
      header: 'Parent Node',
      cell: (item) => {
        const parent = item.parentId ? locationsMap.get(item.parentId) : null;
        return (
          <div className="flex items-center gap-1.5 text-xs text-neutral-600 font-medium">
            <GitFork className="h-3.5 w-3.5 text-neutral-400 shrink-0" />
            <span>{parent ? parent.name : <em className="text-neutral-400 font-normal">Root Node</em>}</span>
          </div>
        );
      },
    },
    {
      header: 'Publication Status',
      cell: (item) => <AdminBadge variant={item.status || 'DRAFT'} />,
    },
    {
      header: 'Featured',
      cell: (item) => (
        item.featured ? (
          <span className="text-[10px] font-bold text-terracotta bg-terracotta/10 px-2 py-0.5 rounded-full font-display uppercase tracking-wider">
            Featured
          </span>
        ) : (
          <span className="text-xs text-neutral-400 font-body">Standard</span>
        )
      ),
    },
    {
      header: 'Actions',
      cell: (item) => (
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <Link
            href={`/admin/locations/${item.id}`}
            className="p-1.5 text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 rounded-md transition-colors"
            title="View Detail"
          >
            <Eye className="h-4 w-4" />
          </Link>
          <Link
            href={`/admin/locations/${item.id}/edit`}
            className="p-1.5 text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 rounded-md transition-colors"
            title="Edit Node"
          >
            <Edit className="h-4 w-4" />
          </Link>
          {item.status !== 'PUBLISHED' && (
            <button
              onClick={() => handleLifecycleClick('PUBLISH', item.id, item.name)}
              className="p-1.5 text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 rounded-md transition-colors cursor-pointer"
              title="Publish Node"
            >
              <CheckCircle2 className="h-4 w-4" />
            </button>
          )}
          {item.status !== 'ARCHIVED' && (
            <button
              onClick={() => handleLifecycleClick('ARCHIVE', item.id, item.name)}
              className="p-1.5 text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-md transition-colors cursor-pointer"
              title="Archive Node"
            >
              <Archive className="h-4 w-4" />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6 pb-12">
      <AdminPageHeader
        title="Geography & Locations Hierarchy"
        description="Configure structured state, district, city, discovery region, area, and neighbourhood location nodes."
        breadcrumbs={[{ label: 'Locations' }]}
        primaryAction={{
          label: 'Create Location Node',
          href: '/admin/locations/create',
          icon: <Plus className="h-4 w-4" />,
        }}
        secondaryActions={[
          {
            label: 'Refresh List',
            onClick: fetchLocations,
            icon: <RefreshCw className="h-4 w-4" />,
          },
        ]}
      />

      <div className="px-6 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-white p-4 border border-neutral-200/80 rounded-xl shadow-2xs">
          <AdminSearch
            placeholder="Search locations by name, slug..."
            value={search}
            onChange={setSearch}
          />
          <AdminFilterBar
            filters={[
              {
                key: 'type',
                label: 'Tier / Type',
                options: [
                  { label: 'All Tiers', value: 'ALL' },
                  { label: 'State', value: 'STATE' },
                  { label: 'District', value: 'DISTRICT' },
                  { label: 'City', value: 'CITY' },
                  { label: 'Discovery Region', value: 'DISCOVERY_REGION' },
                  { label: 'Area', value: 'AREA' },
                  { label: 'Neighbourhood', value: 'NEIGHBOURHOOD' },
                ],
                value: typeFilter,
                onChange: setTypeFilter,
              },
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
              setTypeFilter('ALL');
              setStatusFilter('ALL');
              setSearch('');
            }}
          />
        </div>

        {loading && <AdminLoadingState message="Mapping locations hierarchy nodes..." />}

        {error && <AdminErrorState title="Failed to load locations hierarchy" error={error} onRetry={fetchLocations} />}

        {!loading && !error && (
          <AdminTable
            columns={columns}
            data={locations}
            keyExtractor={(item) => item.id}
            onRowClick={(item) => router.push(`/admin/locations/${item.id}`)}
            emptyMessage="No location nodes registered yet."
          />
        )}
      </div>

      <AdminConfirmDialog
        isOpen={confirmOpen}
        title={confirmAction?.type === 'PUBLISH' ? 'Publish Location Node?' : 'Archive Location Node?'}
        message={
          confirmAction?.type === 'PUBLISH'
            ? `Are you sure you want to publish '${confirmAction?.name}'? Parents must be published. Children will inherit the capability of active indexing.`
            : `Are you sure you want to archive '${confirmAction?.name}'? This hides the location and all nested descendants from public discovery views.`
        }
        confirmLabel={confirmAction?.type === 'PUBLISH' ? 'Publish Node' : 'Archive Node'}
        isDestructive={confirmAction?.type === 'ARCHIVE'}
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
