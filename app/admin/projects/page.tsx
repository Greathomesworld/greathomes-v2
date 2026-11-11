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
import { Building2, Plus, RefreshCw, MapPin, Building, Eye, Edit3, Trash2, CheckCircle, Archive } from 'lucide-react';

export default function AdminProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<any[]>([]);
  const [developers, setDevelopers] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  
  const [statusFilter, setStatusFilter] = useState('ALL'); // lifecycleStatus filter
  const [stageFilter, setStageFilter] = useState('ALL'); // status (stage) filter
  const [developerFilter, setDeveloperFilter] = useState('ALL');
  const [locationFilter, setLocationFilter] = useState('ALL');
  
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });
  
  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [dialogAction, setDialogAction] = useState<'publish' | 'archive' | null>(null);
  const [dialogLoading, setDialogLoading] = useState(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch developers & locations for filters
      const [devsRes, locsRes] = await Promise.all([
        fetch('/api/admin/developers', { headers: getAdminHeaders() }),
        fetch('/api/admin/locations', { headers: getAdminHeaders() })
      ]);
      if (devsRes.ok) {
        const json = await devsRes.json();
        setDevelopers(json.items || []);
      }
      if (locsRes.ok) {
        const json = await locsRes.json();
        setLocations(json.items || []);
      }

      // Fetch projects
      await fetchProjects();
    } catch (err: any) {
      setError(err.message || 'Error fetching data');
      setLoading(false);
    }
  };

  const fetchProjects = async () => {
    try {
      setError(null);
      const params = new URLSearchParams({
        page: String(page),
        limit: '10',
      });
      if (statusFilter !== 'ALL') {
        params.append('lifecycleStatus', statusFilter);
      }
      if (stageFilter !== 'ALL') {
        params.append('status', stageFilter);
      }
      if (developerFilter !== 'ALL') {
        params.append('developerId', developerFilter);
      }
      if (locationFilter !== 'ALL') {
        params.append('locationId', locationFilter);
      }

      const res = await fetch(`/api/projects?${params.toString()}`, {
        headers: getAdminHeaders(),
      });

      if (!res.ok) {
        throw new Error(`Failed to load projects: ${res.statusText}`);
      }

      const json = await res.json();
      setProjects(json.data || []);
      if (json.pagination) {
        setPagination(json.pagination);
      }
    } catch (err: any) {
      setError(err.message || 'Error fetching projects');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [page, statusFilter, stageFilter, developerFilter, locationFilter]);

  const handleAction = async () => {
    if (!selectedProjectId || !dialogAction) return;
    try {
      setDialogLoading(true);
      if (dialogAction === 'publish') {
        const res = await fetch(`/api/projects/${selectedProjectId}/publish`, {
          method: 'POST',
          headers: getAdminHeaders(),
        });
        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || 'Failed to publish project');
        }
      } else if (dialogAction === 'archive') {
        const res = await fetch(`/api/projects/${selectedProjectId}`, {
          method: 'PATCH',
          headers: {
            ...getAdminHeaders(),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ lifecycleStatus: 'ARCHIVED' }),
        });
        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || 'Failed to archive project');
        }
      }
      setDialogOpen(false);
      fetchProjects();
    } catch (err: any) {
      alert(err.message || 'Operation failed');
    } finally {
      setDialogLoading(false);
    }
  };

  const filteredProjects = projects.filter(p => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      p.name?.toLowerCase().includes(q) ||
      p.slug?.toLowerCase().includes(q) ||
      p.developer?.name?.toLowerCase().includes(q) ||
      p.location?.name?.toLowerCase().includes(q)
    );
  });

  const columns: ColumnDef<any>[] = [
    {
      header: 'Project Name',
      cell: (item) => (
        <div>
          <p className="font-bold text-neutral-900 font-display">{item.name}</p>
          <p className="text-xs text-neutral-500 font-mono">{item.slug}</p>
        </div>
      ),
    },
    {
      header: 'Developer',
      cell: (item) => (
        <div className="flex items-center gap-1.5 text-neutral-700 font-medium">
          <Building className="h-3.5 w-3.5 text-neutral-400" />
          <span>{item.developer?.name || '—'}</span>
        </div>
      ),
    },
    {
      header: 'Location',
      cell: (item) => (
        <div className="flex items-center gap-1.5 text-neutral-700">
          <MapPin className="h-3.5 w-3.5 text-neutral-400" />
          <span>{item.location?.name || '—'}</span>
        </div>
      ),
    },
    {
      header: 'Pricing',
      cell: (item) => {
        const startingPrice = item.pricing?.startingPrice;
        const isPor = Boolean(item.priceOnRequest || item.pricing?.priceOnRequest);
        if (isPor) {
          return (
            <div className="space-y-0.5">
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200 font-display">
                Price on Request
              </span>
              {item.manualStartingPrice && item.manualStartingPrice > 0 && (
                <span className="block text-[11px] text-neutral-400 font-mono">
                  Ref: ₹{(item.manualStartingPrice / 100000).toFixed(1)} L
                </span>
              )}
            </div>
          );
        }
        if (!startingPrice) return <span className="text-neutral-500">On Request</span>;
        if (startingPrice >= 10000000) {
          return <span className="font-semibold text-neutral-950 font-display">₹{(startingPrice / 10000000).toFixed(2)} Cr+</span>;
        }
        return <span className="font-semibold text-neutral-950 font-display">₹{(startingPrice / 100000).toFixed(1)} L+</span>;
      }
    },
    {
      header: 'Status',
      cell: (item) => (
        <AdminBadge
          variant={item.lifecycleStatus === 'PUBLISHED' ? 'PUBLISHED' : item.lifecycleStatus === 'ARCHIVED' ? 'ARCHIVED' : 'DRAFT'}
        />
      ),
    },
    {
      header: 'Project Stage',
      cell: (item) => (
        <span className="text-xs uppercase font-mono text-neutral-600 bg-neutral-100 px-2 py-0.5 rounded">
          {item.status?.replace('_', ' ') || 'UPCOMING'}
        </span>
      ),
    },
    {
      header: 'RERA Status',
      cell: (item) => (
        <AdminBadge
          variant={item.rera?.status === 'VERIFIED' ? 'APPROVED' : item.rera?.status === 'PROVIDED' ? 'VERIFIED' : 'DRAFT'}
          label={item.rera?.status || 'NOT_PROVIDED'}
        />
      ),
    },
    {
      header: 'Actions',
      cell: (item) => (
        <div className="flex items-center gap-2">
          <Link href={`/admin/projects/${item.id}`} className="p-1 text-neutral-500 hover:text-indigo-600 hover:bg-neutral-50 rounded transition-colors" title="View Detail">
            <Eye className="h-4 w-4" />
          </Link>
          <Link href={`/admin/projects/${item.id}/edit`} className="p-1 text-neutral-500 hover:text-amber-600 hover:bg-neutral-50 rounded transition-colors" title="Edit Project">
            <Edit3 className="h-4 w-4" />
          </Link>
          {item.lifecycleStatus !== 'PUBLISHED' && (
            <button
              onClick={() => {
                setSelectedProjectId(item.id);
                setDialogAction('publish');
                setDialogOpen(true);
              }}
              className="p-1 text-neutral-500 hover:text-emerald-600 hover:bg-neutral-50 rounded transition-colors"
              title="Publish"
            >
              <CheckCircle className="h-4 w-4" />
            </button>
          )}
          {item.lifecycleStatus !== 'ARCHIVED' && (
            <button
              onClick={() => {
                setSelectedProjectId(item.id);
                setDialogAction('archive');
                setDialogOpen(true);
              }}
              className="p-1 text-neutral-500 hover:text-rose-600 hover:bg-neutral-50 rounded transition-colors"
              title="Archive"
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
        title="Residential Projects"
        description="Manage Great Homes residential property catalog, publication statuses, developer associations, and project intelligence."
        breadcrumbs={[{ label: 'Projects' }]}
        primaryAction={{
          label: 'Create Project',
          onClick: () => router.push('/admin/projects/new'),
          icon: <Plus className="h-4 w-4" />,
        }}
        secondaryActions={[
          {
            label: 'Refresh',
            onClick: fetchProjects,
            icon: <RefreshCw className="h-4 w-4" />,
          },
        ]}
      />

      <div className="px-6 space-y-4">
        <div className="flex flex-col gap-4 bg-white p-4 border border-neutral-200/80 rounded-xl shadow-2xs">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <AdminSearch
              placeholder="Search projects by name, slug, developer..."
              value={search}
              onChange={setSearch}
            />
            <AdminFilterBar
              filters={[
                {
                  key: 'lifecycleStatus',
                  label: 'Publication Status',
                  options: [
                    { label: 'All Statuses', value: 'ALL' },
                    { label: 'Draft', value: 'DRAFT' },
                    { label: 'Published', value: 'PUBLISHED' },
                    { label: 'Archived', value: 'ARCHIVED' },
                  ],
                  value: statusFilter,
                  onChange: setStatusFilter,
                },
                {
                  key: 'stage',
                  label: 'Project Stage',
                  options: [
                    { label: 'All Stages', value: 'ALL' },
                    { label: 'Upcoming', value: 'UPCOMING' },
                    { label: 'New Launch', value: 'NEW_LAUNCH' },
                    { label: 'Under Construction', value: 'UNDER_CONSTRUCTION' },
                    { label: 'Ready to Move', value: 'READY_TO_MOVE' },
                    { label: 'Completed', value: 'COMPLETED' },
                    { label: 'Sold Out', value: 'SOLD_OUT' },
                  ],
                  value: stageFilter,
                  onChange: setStageFilter,
                },
              ]}
              onReset={() => {
                setStatusFilter('ALL');
                setStageFilter('ALL');
                setDeveloperFilter('ALL');
                setLocationFilter('ALL');
              }}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-neutral-100 pt-4">
            <div>
              <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-1">Developer Filter</label>
              <select
                value={developerFilter}
                onChange={(e) => setDeveloperFilter(e.target.value)}
                className="w-full text-sm bg-neutral-50 border border-neutral-200 rounded-lg p-2 focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
              >
                <option value="ALL">All Developers</option>
                {developers.map(dev => (
                  <option key={dev.id} value={dev.id}>{dev.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-1">Location Filter</label>
              <select
                value={locationFilter}
                onChange={(e) => setLocationFilter(e.target.value)}
                className="w-full text-sm bg-neutral-50 border border-neutral-200 rounded-lg p-2 focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
              >
                <option value="ALL">All Locations</option>
                {locations.map(loc => (
                  <option key={loc.id} value={loc.id}>{loc.name} ({loc.type})</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {loading && <AdminLoadingState skeletonType="list" />}

        {error && <AdminErrorState title="Failed to load projects" error={error} onRetry={fetchProjects} />}

        {!loading && !error && (
          <>
            <AdminTable
              columns={columns}
              data={filteredProjects}
              keyExtractor={(item) => item.id}
              emptyMessage="No projects found matching the criteria."
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
        isOpen={dialogOpen}
        title={dialogAction === 'publish' ? 'Publish Project' : 'Archive Project'}
        message={
          dialogAction === 'publish'
            ? 'Are you sure you want to publish this project? It will become visible on the public consumer discovery pages.'
            : 'Are you sure you want to archive this project? It will be hidden from the public discovery portal.'
        }
        confirmLabel={dialogAction === 'publish' ? 'Yes, Publish' : 'Yes, Archive'}
        cancelLabel="Cancel"
        isDestructive={dialogAction === 'archive'}
        onConfirm={handleAction}
        onCancel={() => setDialogOpen(false)}
        isLoading={dialogLoading}
      />
    </div>
  );
}
