'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AdminPageHeader } from '@/src/components/admin/AdminPageHeader';
import { AdminTable, ColumnDef } from '@/src/components/admin/AdminTable';
import { AdminBadge } from '@/src/components/admin/AdminBadge';
import { AdminSearch } from '@/src/components/admin/AdminSearch';
import { AdminFilterBar, FilterOption } from '@/src/components/admin/AdminFilterBar';
import { AdminPagination } from '@/src/components/admin/AdminPagination';
import { AdminConfirmDialog } from '@/src/components/admin/AdminConfirmDialog';
import { AdminLoadingState } from '@/src/components/admin/AdminLoadingState';
import { AdminErrorState } from '@/src/components/admin/AdminErrorState';
import { getAdminHeaders } from '@/src/lib/adminAuth';
import { formatIndianPrice } from '@/src/components/discovery/formatters';
import { Plus, RefreshCw, Eye, Edit3, Trash2, ArrowUpDown } from 'lucide-react';

export default function AdminResalePage() {
  const router = useRouter();
  const [listings, setListings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search & Filter state
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [propertyTypeFilter, setPropertyTypeFilter] = useState('ALL');
  const [bhkFilter, setBhkFilter] = useState('ALL');
  const [partyFilter, setPartyFilter] = useState('ALL');
  const [verificationFilter, setVerificationFilter] = useState('ALL');
  const [projectLinkFilter, setProjectLinkFilter] = useState('ALL');

  // Sorting state
  const [sortField, setSortField] = useState<'updatedAt' | 'askingPrice' | 'bedroomCount'>('updatedAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Delete dialog state
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchListings = async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch('/api/resale', {
        headers: getAdminHeaders(),
      });

      if (!res.ok) {
        throw new Error(`Failed to load resale listings: ${res.statusText}`);
      }

      const json = await res.json();
      setListings(json.data || []);
    } catch (err: any) {
      setError(err.message || 'Error fetching resale listings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchListings();
  }, []);

  const confirmDelete = async () => {
    if (!deleteId) return;
    try {
      setIsDeleting(true);
      const res = await fetch(`/api/resale/${deleteId}`, {
        method: 'DELETE',
        headers: getAdminHeaders(),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete listing');
      }
      setDeleteId(null);
      await fetchListings();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsDeleting(false);
    }
  };

  // Filter options configuration for AdminFilterBar
  const filters: FilterOption[] = [
    {
      key: 'status',
      label: 'Status',
      value: statusFilter,
      onChange: (val) => { setStatusFilter(val); setCurrentPage(1); },
      options: [
        { label: 'All Statuses', value: 'ALL' },
        { label: 'Draft', value: 'DRAFT' },
        { label: 'Submitted', value: 'SUBMITTED' },
        { label: 'Under Review', value: 'UNDER_REVIEW' },
        { label: 'Approved', value: 'APPROVED' },
        { label: 'Published', value: 'PUBLISHED' },
        { label: 'Paused', value: 'PAUSED' },
        { label: 'Sold', value: 'SOLD_RENTED' },
        { label: 'Archived', value: 'ARCHIVED' },
      ],
    },
    {
      key: 'propertyType',
      label: 'Property Type',
      value: propertyTypeFilter,
      onChange: (val) => { setPropertyTypeFilter(val); setCurrentPage(1); },
      options: [
        { label: 'All Types', value: 'ALL' },
        { label: 'Apartment', value: 'APARTMENT' },
        { label: 'Penthouse', value: 'PENTHOUSE' },
        { label: 'Villa', value: 'VILLA' },
        { label: 'Independent House', value: 'INDEPENDENT_HOUSE' },
        { label: 'Duplex', value: 'DUPLEX' },
      ],
    },
    {
      key: 'bhk',
      label: 'BHK',
      value: bhkFilter,
      onChange: (val) => { setBhkFilter(val); setCurrentPage(1); },
      options: [
        { label: 'All BHKs', value: 'ALL' },
        { label: '1 BHK', value: '1' },
        { label: '2 BHK', value: '2' },
        { label: '3 BHK', value: '3' },
        { label: '4 BHK', value: '4' },
        { label: '5+ BHK', value: '5' },
      ],
    },
    {
      key: 'party',
      label: 'Listing Party',
      value: partyFilter,
      onChange: (val) => { setPartyFilter(val); setCurrentPage(1); },
      options: [
        { label: 'All Parties', value: 'ALL' },
        { label: 'Owner Listed', value: 'OWNER' },
        { label: 'Listing Partner', value: 'LISTING_PARTNER' },
      ],
    },
    {
      key: 'verification',
      label: 'Verification',
      value: verificationFilter,
      onChange: (val) => { setVerificationFilter(val); setCurrentPage(1); },
      options: [
        { label: 'All Verification', value: 'ALL' },
        { label: 'Verified', value: 'VERIFIED' },
        { label: 'Unverified', value: 'UNVERIFIED' },
      ],
    },
    {
      key: 'projectLink',
      label: 'Project Linkage',
      value: projectLinkFilter,
      onChange: (val) => { setProjectLinkFilter(val); setCurrentPage(1); },
      options: [
        { label: 'All (Linked & Unlinked)', value: 'ALL' },
        { label: 'Linked to Project', value: 'LINKED' },
        { label: 'Standalone / Unlinked', value: 'UNLINKED' },
      ],
    },
  ];

  const resetFilters = () => {
    setStatusFilter('ALL');
    setPropertyTypeFilter('ALL');
    setBhkFilter('ALL');
    setPartyFilter('ALL');
    setVerificationFilter('ALL');
    setProjectLinkFilter('ALL');
    setSearch('');
    setCurrentPage(1);
  };

  // Filtered & Sorted listings
  const filteredAndSorted = useMemo(() => {
    let result = listings.filter((l) => {
      // Search text query
      if (search) {
        const q = search.toLowerCase();
        const matchesQuery =
          l.configuration?.toLowerCase().includes(q) ||
          l.propertyType?.toLowerCase().includes(q) ||
          l.project?.name?.toLowerCase().includes(q) ||
          l.project?.location?.name?.toLowerCase().includes(q) ||
          l.ownerName?.toLowerCase().includes(q) ||
          l.brokerName?.toLowerCase().includes(q) ||
          l.slug?.toLowerCase().includes(q);
        if (!matchesQuery) return false;
      }

      // Status filter
      if (statusFilter !== 'ALL' && l.lifecycleStatus !== statusFilter) return false;

      // Property type filter
      if (propertyTypeFilter !== 'ALL' && l.propertyType !== propertyTypeFilter) return false;

      // BHK filter
      if (bhkFilter !== 'ALL') {
        const bhkNum = parseInt(bhkFilter, 10);
        if (bhkNum === 5) {
          if (l.bedroomCount < 5) return false;
        } else if (l.bedroomCount !== bhkNum) {
          return false;
        }
      }

      // Party filter
      if (partyFilter !== 'ALL' && l.listingPartyType !== partyFilter) return false;

      // Verification filter
      if (verificationFilter !== 'ALL' && l.verificationStatus !== verificationFilter) return false;

      // Project link filter
      if (projectLinkFilter === 'LINKED' && !l.projectId && !l.project) return false;
      if (projectLinkFilter === 'UNLINKED' && (l.projectId || l.project)) return false;

      return true;
    });

    // Sort
    result.sort((a, b) => {
      let valA: any;
      let valB: any;
      if (sortField === 'askingPrice') {
        valA = a.askingPrice || 0;
        valB = b.askingPrice || 0;
      } else if (sortField === 'bedroomCount') {
        valA = a.bedroomCount || 0;
        valB = b.bedroomCount || 0;
      } else {
        valA = new Date(a.updatedAt || a.createdAt || 0).getTime();
        valB = new Date(b.updatedAt || b.createdAt || 0).getTime();
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [listings, search, statusFilter, propertyTypeFilter, bhkFilter, partyFilter, verificationFilter, projectLinkFilter, sortField, sortOrder]);

  // Paginated items
  const paginatedListings = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredAndSorted.slice(start, start + pageSize);
  }, [filteredAndSorted, currentPage, pageSize]);

  const totalPages = Math.ceil(filteredAndSorted.length / pageSize) || 1;

  const toggleSort = (field: 'updatedAt' | 'askingPrice' | 'bedroomCount') => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const columns: ColumnDef<any>[] = [
    {
      header: 'Listing',
      cell: (item) => (
        <div className="max-w-xs">
          <Link
            href={`/admin/listings/resale/${item.id}`}
            className="font-bold text-neutral-900 font-display hover:text-terracotta transition-colors line-clamp-1"
          >
            {item.bedroomCount} BHK {item.propertyType?.replace(/_/g, ' ') || 'Resale'}
          </Link>
          <p className="text-xs text-neutral-500 font-mono mt-0.5 line-clamp-1">
            {item.configuration} {item.carpetArea ? `• ${item.carpetArea} sq.ft. carpet` : ''}
          </p>
        </div>
      ),
    },
    {
      header: 'Property Type',
      cell: (item) => (
        <span className="text-xs text-neutral-700 font-medium font-body uppercase tracking-wider">
          {item.propertyType?.replace(/_/g, ' ') || '—'}
        </span>
      ),
    },
    {
      header: 'BHK',
      cell: (item) => (
        <span className="text-xs font-semibold text-neutral-800 font-display">
          {item.bedroomCount} BHK
        </span>
      ),
    },
    {
      header: 'Project',
      cell: (item) => (
        <div>
          {item.project ? (
            <Link
              href={`/admin/projects/${item.project.id}`}
              className="text-xs font-semibold text-neutral-900 hover:text-terracotta transition-colors font-display line-clamp-1"
            >
              {item.project.name}
            </Link>
          ) : (
            <span className="text-xs text-neutral-400 italic font-body">Standalone / Unlinked</span>
          )}
        </div>
      ),
    },
    {
      header: 'Location',
      cell: (item) => (
        <span className="text-xs text-neutral-600 font-body">
          {item.project?.location?.name || 'Kolkata'}
        </span>
      ),
    },
    {
      header: 'Asking Price',
      cell: (item) => (
        <span className="font-bold text-neutral-900 font-display">
          {item.askingPrice ? formatIndianPrice(item.askingPrice) : '—'}
        </span>
      ),
    },
    {
      header: 'Listing Party',
      cell: (item) => (
        <span className="text-xs text-neutral-700 font-medium font-body">
          {item.listingPartyType === 'OWNER' ? 'Owner Listed' : 'Listing Partner'}
        </span>
      ),
    },
    {
      header: 'Verification',
      cell: (item) => (
        <AdminBadge
          variant={item.verificationStatus === 'VERIFIED' ? 'VERIFIED' : 'UNVERIFIED'}
          label={item.verificationStatus || 'UNVERIFIED'}
        />
      ),
    },
    {
      header: 'Status',
      cell: (item) => <AdminBadge variant={item.lifecycleStatus || 'DRAFT'} />,
    },
    {
      header: 'Updated',
      cell: (item) => (
        <span className="text-xs text-neutral-500 font-mono">
          {item.updatedAt ? new Date(item.updatedAt).toLocaleDateString('en-IN') : '—'}
        </span>
      ),
    },
    {
      header: 'Actions',
      cell: (item) => (
        <div className="flex items-center gap-1.5">
          <Link
            href={`/admin/listings/resale/${item.id}`}
            title="View Details"
            className="p-1.5 text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 rounded-md transition-colors"
          >
            <Eye className="h-4 w-4" />
          </Link>
          <Link
            href={`/admin/listings/resale/${item.id}/edit`}
            title="Edit Listing"
            className="p-1.5 text-neutral-500 hover:text-amber-600 hover:bg-amber-50 rounded-md transition-colors"
          >
            <Edit3 className="h-4 w-4" />
          </Link>
          <button
            onClick={() => setDeleteId(item.id)}
            title="Delete Listing"
            className="p-1.5 text-neutral-500 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors cursor-pointer"
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
        title="Resale Marketplace Listings"
        description="Operational management of verified secondary market residential listings with strict pricing and privacy boundaries."
        breadcrumbs={[{ label: 'Listings', href: '/admin/listings/resale' }, { label: 'Resale' }]}
        primaryAction={{
          label: 'Create Resale Listing',
          onClick: () => router.push('/admin/listings/resale/new'),
          icon: <Plus className="h-4 w-4" />,
        }}
        secondaryActions={[
          {
            label: 'Refresh',
            onClick: fetchListings,
            icon: <RefreshCw className="h-4 w-4" />,
          },
        ]}
      />

      <div className="px-6 space-y-4">
        {/* Search & Filters */}
        <div className="bg-white p-4 border border-neutral-200/80 rounded-xl shadow-2xs space-y-3">
          <AdminSearch
            placeholder="Search resale listings by BHK, configuration, project, location, or party..."
            value={search}
            onChange={(val) => { setSearch(val); setCurrentPage(1); }}
          />
          <div className="border-t border-neutral-100 pt-2">
            <AdminFilterBar filters={filters} onReset={resetFilters} />
          </div>
        </div>

        {/* Content States */}
        {loading && <AdminLoadingState message="Loading resale marketplace listings..." />}

        {error && <AdminErrorState title="Failed to load listings" error={error} onRetry={fetchListings} />}

        {!loading && !error && (
          <div className="bg-white border border-neutral-200/80 rounded-xl shadow-2xs overflow-hidden">
            <AdminTable
              columns={columns}
              data={paginatedListings}
              keyExtractor={(item) => item.id}
              emptyMessage="No resale listings found matching your criteria."
            />
            <div className="border-t border-neutral-100 px-4 py-2">
              <AdminPagination
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={filteredAndSorted.length}
                pageSize={pageSize}
                onPageChange={setCurrentPage}
              />
            </div>
          </div>
        )}
      </div>

      <AdminConfirmDialog
        isOpen={!!deleteId}
        title="Delete Resale Listing"
        message="Are you sure you want to permanently delete this resale listing? Associated media links and amenity mappings will also be removed. This action cannot be undone."
        confirmLabel="Delete Listing"
        cancelLabel="Cancel"
        isDestructive={true}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteId(null)}
        isLoading={isDeleting}
      />
    </div>
  );
}
