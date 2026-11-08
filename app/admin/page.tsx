'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAdminAuth } from '@/src/components/admin/AdminAuthProvider';
import { AdminPageHeader } from '@/src/components/admin/AdminPageHeader';
import { AdminStatCard } from '@/src/components/admin/AdminStatCard';
import { AdminBadge } from '@/src/components/admin/AdminBadge';
import { AdminTable, ColumnDef } from '@/src/components/admin/AdminTable';
import { AdminDashboardSkeleton } from '@/src/components/admin/AdminDashboardSkeleton';
import { AdminErrorState } from '@/src/components/admin/AdminErrorState';
import { getAdminHeaders } from '@/src/lib/adminAuth';
import {
  Building2,
  Building,
  MapPin,
  Tag,
  KeyRound,
  MessageSquare,
  AlertCircle,
  ArrowRight,
  Plus,
  RefreshCw,
  Sliders,
  FileCheck2,
  Sparkles,
} from 'lucide-react';

interface DashboardData {
  metrics: {
    projectsTotal: number;
    projectsPublished: number;
    projectsDraft: number;
    developersTotal: number;
    locationsTotal: number;
    resaleTotal: number;
    resalePending: number;
    rentalTotal: number;
    rentalPending: number;
    enquiriesTotal: number;
  };
  attention: {
    draftProjects: any[];
    pendingResale: any[];
  };
  recentEnquiries: any[];
}

export default function AdminDashboardPage() {
  const { role, hasCapability } = useAdminAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboard = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/admin/dashboard', {
        headers: getAdminHeaders(),
      });
      if (!res.ok) {
        throw new Error(`Server returned status ${res.status}`);
      }
      const json = await res.json();
      setData(json);
    } catch (err: any) {
      setError(err.message || 'Failed to load operational stats');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, []);

  const enquiryColumns: ColumnDef<any>[] = [
    {
      header: 'Buyer Name',
      accessorKey: 'buyerName',
      cell: (item) => (
        <div>
          <p className="font-semibold text-neutral-900 font-display">{item.buyerName}</p>
          <p className="text-xs text-neutral-500 font-mono">{item.buyerPhone}</p>
        </div>
      ),
    },
    {
      header: 'Context',
      cell: (item) => <AdminBadge variant="NEW" label={item.contextType} />,
    },
    {
      header: 'Target Entity',
      cell: (item) => (
        <span className="font-medium text-neutral-800">
          {item.projectName || item.listingTitle || item.projectSlug || '—'}
        </span>
      ),
    },
    {
      header: 'Preferred Contact',
      accessorKey: 'preferredContact',
      cell: (item) => (
        <span className="text-xs font-mono uppercase bg-neutral-100 px-2 py-0.5 rounded text-neutral-700">
          {item.preferredContact || 'WHATSAPP'}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6 pb-12">
      <AdminPageHeader
        title="Admin Workspace Overview"
        description="Internal operational dashboard for Great Homes property discovery, project intelligence, listings, and enquiries."
        secondaryActions={[
          {
            label: 'Refresh Data',
            onClick: fetchDashboard,
            icon: <RefreshCw className="h-4 w-4" />,
          },
        ]}
      />

      <div className="px-6 space-y-8">
        {loading && <AdminDashboardSkeleton />}

        {error && (
          <AdminErrorState
            title="Unable to load dashboard overview"
            error={error}
            onRetry={fetchDashboard}
          />
        )}

        {data && (
          <>
            {/* Operational Metrics Grid */}
            <div className="space-y-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-500 font-display">
                Key Performance Metrics
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <AdminStatCard
                  title="Total Projects"
                  value={data.metrics.projectsTotal}
                  subtext={`${data.metrics.projectsPublished} published · ${data.metrics.projectsDraft} draft`}
                  badgeText="Catalog"
                  icon={<Building2 className="h-5 w-5" />}
                />
                <AdminStatCard
                  title="Developers"
                  value={data.metrics.developersTotal}
                  subtext="Registered real estate developers"
                  badgeText="Partners"
                  icon={<Building className="h-5 w-5" />}
                />
                <AdminStatCard
                  title="Locations"
                  value={data.metrics.locationsTotal}
                  subtext="Active regions & micromarkets"
                  badgeText="Hierarchy"
                  icon={<MapPin className="h-5 w-5" />}
                />
                <AdminStatCard
                  title="Enquiries"
                  value={data.metrics.enquiriesTotal}
                  subtext="Submitted customer leads"
                  badgeText={data.metrics.enquiriesTotal > 0 ? 'Active' : 'No Leads'}
                  badgeVariant={data.metrics.enquiriesTotal > 0 ? 'success' : 'neutral'}
                  icon={<MessageSquare className="h-5 w-5" />}
                />
                <AdminStatCard
                  title="Resale Listings"
                  value={data.metrics.resaleTotal}
                  subtext={`${data.metrics.resalePending} pending review`}
                  badgeText="Marketplace"
                  badgeVariant={data.metrics.resalePending > 0 ? 'amber' : 'neutral'}
                  icon={<Tag className="h-5 w-5" />}
                />
                <AdminStatCard
                  title="Rental Listings"
                  value={data.metrics.rentalTotal}
                  subtext={`${data.metrics.rentalPending} pending review`}
                  badgeText="Marketplace"
                  badgeVariant={data.metrics.rentalPending > 0 ? 'amber' : 'neutral'}
                  icon={<KeyRound className="h-5 w-5" />}
                />
                <AdminStatCard
                  title="Project Intelligence"
                  value={data.metrics.projectsTotal}
                  subtext="RERA & Floor plan configurations"
                  badgeText="Verified"
                  icon={<Sliders className="h-5 w-5" />}
                />
                <AdminStatCard
                  title="RERA Verified"
                  value={data.metrics.projectsPublished}
                  subtext="Compliant project records"
                  badgeText="Compliant"
                  badgeVariant="success"
                  icon={<FileCheck2 className="h-5 w-5" />}
                />
              </div>
            </div>

            {/* Quick Actions Bar */}
            <div className="bg-white border border-neutral-200/80 rounded-xl p-5 shadow-xs space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500 font-display">
                Operational Quick Actions
              </h3>
              <div className="flex flex-wrap gap-3">
                {hasCapability('MANAGE_PROJECTS') && (
                  <Link
                    href="/admin/projects"
                    className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-neutral-900 text-white rounded-lg hover:bg-neutral-800 transition-colors shadow-2xs min-h-[44px]"
                  >
                    <Building2 className="h-4 w-4 text-terracotta" />
                    <span>Manage Projects</span>
                  </Link>
                )}
                {hasCapability('MANAGE_DEVELOPERS') && (
                  <Link
                    href="/admin/developers"
                    className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-white border border-neutral-300 text-neutral-800 rounded-lg hover:bg-neutral-50 transition-colors shadow-2xs min-h-[44px]"
                  >
                    <Building className="h-4 w-4" />
                    <span>Manage Developers</span>
                  </Link>
                )}
                {hasCapability('MANAGE_LOCATIONS') && (
                  <Link
                    href="/admin/locations"
                    className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-white border border-neutral-300 text-neutral-800 rounded-lg hover:bg-neutral-50 transition-colors shadow-2xs min-h-[44px]"
                  >
                    <MapPin className="h-4 w-4" />
                    <span>Manage Locations</span>
                  </Link>
                )}
                {hasCapability('VIEW_ENQUIRIES') && (
                  <Link
                    href="/admin/enquiries"
                    className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-white border border-neutral-300 text-neutral-800 rounded-lg hover:bg-neutral-50 transition-colors shadow-2xs min-h-[44px]"
                  >
                    <MessageSquare className="h-4 w-4" />
                    <span>View Customer Enquiries</span>
                  </Link>
                )}
                {hasCapability('MANAGE_SEO') && (
                  <Link
                    href="/admin/seo/projects"
                    className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-white border border-neutral-300 text-neutral-800 rounded-lg hover:bg-neutral-50 transition-colors shadow-2xs min-h-[44px]"
                  >
                    <Sparkles className="h-4 w-4" />
                    <span>SEO Management</span>
                  </Link>
                )}
              </div>
            </div>

            {/* Grid Layout: Needs Attention + Recent Enquiries */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Needs Attention Column */}
              <div className="bg-white border border-neutral-200/80 rounded-xl p-5 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-amber-600" />
                    <h3 className="text-sm font-bold text-neutral-900 font-display">
                      Items Requiring Attention
                    </h3>
                  </div>
                  <span className="text-xs text-neutral-500 font-mono">
                    {data.attention.draftProjects.length + data.attention.pendingResale.length} pending
                  </span>
                </div>

                {data.attention.draftProjects.length === 0 && data.attention.pendingResale.length === 0 ? (
                  <div className="p-6 text-center text-xs text-neutral-500 font-body bg-neutral-50 rounded-lg">
                    All projects and marketplace listings are published and up to date.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {data.attention.draftProjects.map((proj: any) => (
                      <div
                        key={proj.id}
                        className="flex items-center justify-between p-3.5 bg-neutral-50 border border-neutral-200/60 rounded-lg text-xs"
                      >
                        <div className="space-y-0.5">
                          <p className="font-semibold text-neutral-900 font-display">{proj.name}</p>
                          <p className="text-neutral-500 font-mono">Slug: {proj.slug}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <AdminBadge variant="DRAFT" label="Draft Project" />
                          <Link
                            href="/admin/projects"
                            className="p-1 text-neutral-400 hover:text-neutral-900"
                          >
                            <ArrowRight className="h-4 w-4" />
                          </Link>
                        </div>
                      </div>
                    ))}

                    {data.attention.pendingResale.map((res: any) => (
                      <div
                        key={res.id}
                        className="flex items-center justify-between p-3.5 bg-neutral-50 border border-neutral-200/60 rounded-lg text-xs"
                      >
                        <div className="space-y-0.5">
                          <p className="font-semibold text-neutral-900 font-display">
                            {res.configuration} Resale Listing
                          </p>
                          <p className="text-neutral-500">
                            Status: {res.lifecycleStatus}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <AdminBadge variant={res.lifecycleStatus} />
                          <Link
                            href="/admin/listings/resale"
                            className="p-1 text-neutral-400 hover:text-neutral-900"
                          >
                            <ArrowRight className="h-4 w-4" />
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Recent Enquiries Column */}
              <div className="bg-white border border-neutral-200/80 rounded-xl p-5 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-neutral-700" />
                    <h3 className="text-sm font-bold text-neutral-900 font-display">
                      Recent Buyer Enquiries
                    </h3>
                  </div>
                  <Link
                    href="/admin/enquiries"
                    className="text-xs font-semibold text-terracotta hover:underline font-display"
                  >
                    View All Enquiries
                  </Link>
                </div>

                <AdminTable
                  columns={enquiryColumns}
                  data={data.recentEnquiries}
                  keyExtractor={(item, index) => item.id || String(index)}
                  emptyMessage="No customer enquiries recorded yet."
                />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
