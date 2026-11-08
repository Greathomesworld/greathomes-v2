'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AdminPageHeader } from '@/src/components/admin/AdminPageHeader';
import { AdminTable, ColumnDef } from '@/src/components/admin/AdminTable';
import { AdminBadge } from '@/src/components/admin/AdminBadge';
import { AdminSearch } from '@/src/components/admin/AdminSearch';
import { AdminStatCard } from '@/src/components/admin/AdminStatCard';
import { AdminPagination } from '@/src/components/admin/AdminPagination';
import { AdminLoadingState } from '@/src/components/admin/AdminLoadingState';
import { AdminErrorState } from '@/src/components/admin/AdminErrorState';
import { AdminEmptyState } from '@/src/components/admin/AdminEmptyState';
import { getAdminHeaders } from '@/src/lib/adminAuth';
import { EnquiryEntity, EnquiryPriority, EnquiryStatus } from '@/src/domain/enquiry/entities/enquiryEntity';
import { AdminEnquiryMetricsDto } from '@/src/domain/enquiry/dto/enquiryDto';
import {
  MessageSquare,
  RefreshCw,
  Phone,
  Mail,
  Calendar,
  CheckCircle2,
  Clock,
  ArrowRight,
  Filter,
  UserCheck,
  Building2,
  Home,
  KeyRound,
  AlertTriangle,
  Flame,
  CheckCircle,
  HelpCircle,
} from 'lucide-react';

export default function AdminEnquiriesPage() {
  const router = useRouter();

  const [enquiries, setEnquiries] = useState<EnquiryEntity[]>([]);
  const [metrics, setMetrics] = useState<AdminEnquiryMetricsDto | null>(null);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters state
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [priorityFilter, setPriorityFilter] = useState('ALL');
  const [contextFilter, setContextFilter] = useState('ALL');
  const [assignedFilter, setAssignedFilter] = useState('ALL');
  const [dateFilter, setDateFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

  const fetchMetrics = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/enquiries/metrics', {
        headers: getAdminHeaders(),
      });
      if (res.ok) {
        const json = await res.json();
        setMetrics(json.data);
      }
    } catch (e) {
      console.error('Failed to fetch metrics:', e);
    }
  }, []);

  const fetchEnquiries = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      if (priorityFilter !== 'ALL') params.set('priority', priorityFilter);
      if (contextFilter !== 'ALL') params.set('contextType', contextFilter);
      if (assignedFilter !== 'ALL') params.set('assignedTo', assignedFilter);
      if (dateFilter !== 'ALL') params.set('dateRange', dateFilter);
      params.set('sortBy', sortBy);
      params.set('sortOrder', sortOrder);
      params.set('page', String(page));
      params.set('limit', '15');

      const res = await fetch(`/api/admin/enquiries?${params.toString()}`, {
        headers: getAdminHeaders(),
      });

      if (!res.ok) {
        throw new Error(`Failed to load enquiries: ${res.statusText}`);
      }

      const json = await res.json();
      setEnquiries(json.data || []);
      setTotal(json.total || 0);
      setTotalPages(json.totalPages || 1);
    } catch (err: any) {
      setError(err.message || 'Error fetching enquiries');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, priorityFilter, contextFilter, assignedFilter, dateFilter, sortBy, sortOrder, page]);

  useEffect(() => {
    fetchMetrics();
    fetchEnquiries();
  }, [fetchMetrics, fetchEnquiries]);

  // Reset pagination on filter changes
  const handleFilterChange = (setter: React.Dispatch<React.SetStateAction<any>>, value: any) => {
    setter(value);
    setPage(1);
  };

  const getContextIcon = (type: string) => {
    switch (type) {
      case 'PROJECT':
      case 'CONFIGURATION':
        return <Building2 className="h-3.5 w-3.5 text-terracotta" />;
      case 'RESALE':
        return <Home className="h-3.5 w-3.5 text-blue-600" />;
      case 'RENTAL':
        return <KeyRound className="h-3.5 w-3.5 text-purple-600" />;
      default:
        return <MessageSquare className="h-3.5 w-3.5 text-neutral-600" />;
    }
  };

  const columns: ColumnDef<EnquiryEntity>[] = [
    {
      header: 'Buyer',
      cell: (item) => (
        <div>
          <div className="flex items-center gap-1.5">
            <p className="font-bold text-neutral-900 font-display text-sm">{item.buyerName}</p>
            {item.priority === 'URGENT' && (
              <span className="flex items-center text-xs font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">
                <Flame className="h-3 w-3 mr-0.5 fill-rose-600" />
                Urgent
              </span>
            )}
          </div>
          <div className="flex flex-col gap-0.5 text-xs text-neutral-500 font-mono mt-1">
            <span className="flex items-center gap-1.5 text-neutral-700">
              <Phone className="h-3 w-3 text-neutral-400" />
              {item.buyerPhone}
            </span>
            {item.buyerEmail && (
              <span className="flex items-center gap-1.5 text-neutral-600">
                <Mail className="h-3 w-3 text-neutral-400" />
                {item.buyerEmail}
              </span>
            )}
          </div>
        </div>
      ),
    },
    {
      header: 'Interest & Context',
      cell: (item) => (
        <div className="max-w-xs">
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-neutral-700 bg-neutral-100 px-2 py-0.5 rounded">
              {getContextIcon(item.contextType)}
              {item.contextType}
            </span>
            {item.source === 'BROCHURE_DOWNLOAD' && (
              <span className="text-[10px] font-bold text-indigo-800 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded-md flex items-center gap-1 font-display">
                <span>Brochure Download</span>
              </span>
            )}
            {item.requestSiteVisit && (
              <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full flex items-center gap-1 font-display">
                <CheckCircle2 className="h-2.5 w-2.5 text-emerald-600" />
                Visit Req.
              </span>
            )}
          </div>
          <p className="text-xs font-semibold text-neutral-900 font-display line-clamp-1">
            {item.projectName || item.listingTitle || item.projectSlug || 'General Inquiry'}
          </p>
          {(item.configuration || item.priceDisplay) && (
            <p className="text-[11px] text-neutral-500 font-body">
              {item.configuration ? `${item.configuration} ` : ''}
              {item.priceDisplay ? `• ${item.priceDisplay}` : ''}
            </p>
          )}
        </div>
      ),
    },
    {
      header: 'Status',
      cell: (item) => <AdminBadge variant={item.status} label={item.status.replace(/_/g, ' ')} />,
    },
    {
      header: 'Priority',
      cell: (item) => <AdminBadge variant={item.priority} label={item.priority} />,
    },
    {
      header: 'Assigned To',
      cell: (item) => (
        <div className="text-xs font-body">
          {item.assignedToName || item.assignedTo ? (
            <span className="inline-flex items-center gap-1 text-neutral-800 font-medium bg-neutral-50 border border-neutral-200 px-2 py-0.5 rounded">
              <UserCheck className="h-3 w-3 text-neutral-500" />
              {item.assignedToName || item.assignedTo}
            </span>
          ) : (
            <span className="text-neutral-400 italic text-[11px]">Unassigned</span>
          )}
        </div>
      ),
    },
    {
      header: 'Created / Follow-Up',
      cell: (item) => (
        <div className="text-xs text-neutral-600 font-mono space-y-0.5">
          <div className="flex items-center gap-1 text-neutral-500">
            <Calendar className="h-3 w-3" />
            <span>{item.createdAt ? new Date(item.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</span>
          </div>
          {item.nextFollowUpAt && (
            <div className="flex items-center gap-1 text-amber-700 font-semibold text-[11px]">
              <Clock className="h-3 w-3 text-amber-600" />
              <span>Next: {new Date(item.nextFollowUpAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span>
            </div>
          )}
        </div>
      ),
    },
    {
      header: 'Actions',
      cell: (item) => (
        <Link
          href={`/admin/enquiries/${item.id}`}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-terracotta hover:text-terracotta-dark bg-terracotta/5 hover:bg-terracotta/10 px-3 py-1.5 rounded-lg border border-terracotta/20 transition-colors font-display"
        >
          <span>View</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      ),
    },
  ];

  return (
    <div className="space-y-6 pb-16">
      <AdminPageHeader
        title="Enquiries"
        description="Manage buyer enquiries, property interest and follow-ups."
        breadcrumbs={[{ label: 'Operations' }, { label: 'Enquiries' }]}
        secondaryActions={[
          {
            label: 'Refresh',
            onClick: () => {
              fetchMetrics();
              fetchEnquiries();
            },
            icon: <RefreshCw className="h-4 w-4" />,
          },
        ]}
      />

      {/* KPI Metrics Cards */}
      <div className="px-6 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <AdminStatCard
          title="Total Enquiries"
          value={metrics ? metrics.total.toString() : '—'}
          subtext="Lifetime Leads"
          icon={<MessageSquare className="h-5 w-5 text-neutral-700" />}
        />
        <AdminStatCard
          title="New"
          value={metrics ? metrics.newCount.toString() : '—'}
          subtext="Uncontacted"
          icon={<Flame className="h-5 w-5 text-terracotta" />}
          badgeText={metrics && metrics.newCount > 0 ? `${metrics.newCount} pending` : undefined}
          badgeVariant="amber"
        />
        <AdminStatCard
          title="Contacted"
          value={metrics ? metrics.contactedCount.toString() : '—'}
          subtext="In Discussion"
          icon={<Phone className="h-5 w-5 text-sky-600" />}
        />
        <AdminStatCard
          title="Site Visits"
          value={metrics ? metrics.siteVisitsCount.toString() : '—'}
          subtext="Visit Requests"
          icon={<CheckCircle2 className="h-5 w-5 text-amber-600" />}
        />
        <AdminStatCard
          title="Qualified"
          value={metrics ? metrics.qualifiedCount.toString() : '—'}
          subtext="High Intent"
          icon={<CheckCircle className="h-5 w-5 text-indigo-600" />}
        />
        <AdminStatCard
          title="Converted"
          value={metrics ? metrics.convertedCount.toString() : '—'}
          subtext="Booked / Closed"
          icon={<CheckCircle2 className="h-5 w-5 text-emerald-600" />}
          badgeVariant="success"
        />
      </div>

      <div className="px-6 space-y-4">
        {/* Search and Quick Filters Bar */}
        <div className="bg-white p-4 border border-neutral-200/80 rounded-xl shadow-2xs space-y-3">
          <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
            <div className="w-full md:w-96">
              <AdminSearch
                placeholder="Search buyer, phone, email, project or listing..."
                value={search}
                onChange={(val) => handleFilterChange(setSearch, val)}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-end">
              {/* Status Filter */}
              <div className="flex items-center gap-1.5 text-xs text-neutral-600 font-display">
                <span>Status:</span>
                <select
                  value={statusFilter}
                  onChange={(e) => handleFilterChange(setStatusFilter, e.target.value)}
                  className="bg-neutral-50 border border-neutral-200 rounded-lg px-2.5 py-1.5 text-xs font-display focus:outline-none focus:ring-1 focus:ring-terracotta"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="NEW">New</option>
                  <option value="CONTACTED">Contacted</option>
                  <option value="QUALIFIED">Qualified</option>
                  <option value="SITE_VISIT_SCHEDULED">Site Visit Scheduled</option>
                  <option value="SITE_VISIT_COMPLETED">Site Visit Completed</option>
                  <option value="NEGOTIATION">Negotiation</option>
                  <option value="CONVERTED">Converted</option>
                  <option value="LOST">Lost</option>
                  <option value="CLOSED">Closed</option>
                </select>
              </div>

              {/* Priority Filter */}
              <div className="flex items-center gap-1.5 text-xs text-neutral-600 font-display">
                <span>Priority:</span>
                <select
                  value={priorityFilter}
                  onChange={(e) => handleFilterChange(setPriorityFilter, e.target.value)}
                  className="bg-neutral-50 border border-neutral-200 rounded-lg px-2.5 py-1.5 text-xs font-display focus:outline-none focus:ring-1 focus:ring-terracotta"
                >
                  <option value="ALL">All Priorities</option>
                  <option value="URGENT">Urgent</option>
                  <option value="HIGH">High</option>
                  <option value="NORMAL">Normal</option>
                  <option value="LOW">Low</option>
                </select>
              </div>

              {/* Context Filter */}
              <div className="flex items-center gap-1.5 text-xs text-neutral-600 font-display">
                <span>Context:</span>
                <select
                  value={contextFilter}
                  onChange={(e) => handleFilterChange(setContextFilter, e.target.value)}
                  className="bg-neutral-50 border border-neutral-200 rounded-lg px-2.5 py-1.5 text-xs font-display focus:outline-none focus:ring-1 focus:ring-terracotta"
                >
                  <option value="ALL">All Contexts</option>
                  <option value="PROJECT">Project</option>
                  <option value="CONFIGURATION">Configuration</option>
                  <option value="RESALE">Resale</option>
                  <option value="RENTAL">Rental</option>
                  <option value="GENERAL">General</option>
                </select>
              </div>

              {/* Assignment Filter */}
              <div className="flex items-center gap-1.5 text-xs text-neutral-600 font-display">
                <span>Assigned:</span>
                <select
                  value={assignedFilter}
                  onChange={(e) => handleFilterChange(setAssignedFilter, e.target.value)}
                  className="bg-neutral-50 border border-neutral-200 rounded-lg px-2.5 py-1.5 text-xs font-display focus:outline-none focus:ring-1 focus:ring-terracotta"
                >
                  <option value="ALL">All Staff</option>
                  <option value="UNASSIGNED">Unassigned</option>
                  <option value="ASSIGNED">Assigned</option>
                </select>
              </div>

              {/* Date Filter */}
              <div className="flex items-center gap-1.5 text-xs text-neutral-600 font-display">
                <span>Date:</span>
                <select
                  value={dateFilter}
                  onChange={(e) => handleFilterChange(setDateFilter, e.target.value)}
                  className="bg-neutral-50 border border-neutral-200 rounded-lg px-2.5 py-1.5 text-xs font-display focus:outline-none focus:ring-1 focus:ring-terracotta"
                >
                  <option value="ALL">All Time</option>
                  <option value="TODAY">Today</option>
                  <option value="7_DAYS">Last 7 Days</option>
                  <option value="30_DAYS">Last 30 Days</option>
                </select>
              </div>

              {/* Sorting */}
              <div className="flex items-center gap-1.5 text-xs text-neutral-600 font-display">
                <span>Sort:</span>
                <select
                  value={sortBy}
                  onChange={(e) => handleFilterChange(setSortBy, e.target.value)}
                  className="bg-neutral-50 border border-neutral-200 rounded-lg px-2.5 py-1.5 text-xs font-display focus:outline-none focus:ring-1 focus:ring-terracotta"
                >
                  <option value="createdAt">Newest First</option>
                  <option value="priority">Priority</option>
                  <option value="updatedAt">Recently Updated</option>
                  <option value="nextFollowUpAt">Next Follow-Up</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Content Table / States */}
        {loading && <AdminLoadingState message="Loading buyer enquiries..." />}

        {error && <AdminErrorState title="Failed to load enquiries" error={error} onRetry={fetchEnquiries} />}

        {!loading && !error && enquiries.length === 0 && (
          <AdminEmptyState
            title="No enquiries found"
            description="No buyer enquiries match the specified search keywords or active filter criteria."
            actionLabel="Reset Filters"
            onAction={() => {
              setSearch('');
              setStatusFilter('ALL');
              setPriorityFilter('ALL');
              setContextFilter('ALL');
              setAssignedFilter('ALL');
              setDateFilter('ALL');
              setSortBy('createdAt');
              setPage(1);
            }}
          />
        )}

        {!loading && !error && enquiries.length > 0 && (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block">
              <AdminTable
                columns={columns}
                data={enquiries}
                keyExtractor={(item) => item.id}
                emptyMessage="No customer enquiries found."
              />
            </div>

            {/* Mobile Responsive Cards */}
            <div className="md:hidden space-y-3">
              {enquiries.map((item) => (
                <div
                  key={item.id}
                  className="bg-white p-4 rounded-xl border border-neutral-200/80 shadow-2xs space-y-3"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-neutral-900 font-display">{item.buyerName}</h4>
                        {item.priority === 'URGENT' && (
                          <span className="text-[10px] font-bold text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">
                            Urgent
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-neutral-500 font-mono mt-1">
                        <span>{item.buyerPhone}</span>
                      </div>
                    </div>
                    <AdminBadge variant={item.status} label={item.status.replace(/_/g, ' ')} />
                  </div>

                  <div className="bg-neutral-50 p-2.5 rounded-lg border border-neutral-100 text-xs">
                    <div className="flex items-center gap-1.5 font-semibold text-neutral-800 font-display">
                      {getContextIcon(item.contextType)}
                      <span className="truncate">{item.projectName || item.listingTitle || 'General Enquiry'}</span>
                    </div>
                    {item.configuration && (
                      <p className="text-[11px] text-neutral-500 mt-0.5">{item.configuration}</p>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-xs pt-1 border-t border-neutral-100">
                    <div className="text-neutral-500 font-mono text-[11px]">
                      {item.createdAt ? new Date(item.createdAt).toLocaleDateString('en-IN') : 'Recent'}
                    </div>
                    <Link
                      href={`/admin/enquiries/${item.id}`}
                      className="inline-flex items-center gap-1 text-xs font-bold text-terracotta font-display"
                    >
                      <span>Manage</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            <AdminPagination
              currentPage={page}
              totalPages={totalPages}
              totalItems={total}
              pageSize={15}
              onPageChange={setPage}
            />
          </>
        )}
      </div>
    </div>
  );
}
