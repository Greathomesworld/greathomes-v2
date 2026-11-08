'use client';

import React, { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AdminPageHeader } from '@/src/components/admin/AdminPageHeader';
import { AdminBadge } from '@/src/components/admin/AdminBadge';
import { AdminLoadingState } from '@/src/components/admin/AdminLoadingState';
import { AdminErrorState } from '@/src/components/admin/AdminErrorState';
import { AdminConfirmDialog } from '@/src/components/admin/AdminConfirmDialog';
import { getAdminHeaders } from '@/src/lib/adminAuth';
import { Edit, RefreshCw, Calendar, MapPin, CheckCircle2, Archive, ArrowLeft, GitFork, Compass } from 'lucide-react';

interface LocationDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function LocationDetailPage(props: LocationDetailPageProps) {
  const params = use(props.params);
  const router = useRouter();
  const [location, setLocation] = useState<any | null>(null);
  const [parentName, setParentName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Transition dialog
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmType, setConfirmType] = useState<'PUBLISH' | 'ARCHIVE' | null>(null);
  const [transitionLoading, setTransitionLoading] = useState(false);

  const fetchDetail = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/admin/locations/${params.id}`, {
        headers: getAdminHeaders(),
      });
      if (!res.ok) {
        throw new Error('Location node not found.');
      }
      const data = await res.json();
      setLocation(data);

      // Fetch parent name if parent exists
      if (data.parentId) {
        const parentRes = await fetch(`/api/admin/locations/${data.parentId}`, {
          headers: getAdminHeaders(),
        });
        if (parentRes.ok) {
          const parentData = await parentRes.json();
          setParentName(parentData.name);
        }
      } else {
        setParentName(null);
      }
    } catch (err: any) {
      setError(err.message || 'Error fetching location details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetail();
  }, [params.id]);

  const handleTransition = async () => {
    if (!confirmType) return;
    try {
      setTransitionLoading(true);
      const url = `/api/admin/locations/${params.id}/${confirmType.toLowerCase()}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: getAdminHeaders(),
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.message || `Failed to transition status`);
      }

      setConfirmOpen(false);
      setConfirmType(null);
      fetchDetail();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setTransitionLoading(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      <AdminPageHeader
        title={location ? location.name : 'Location Details'}
        description="Verify geography tree attributes, GIS coordinates mapping, nested micro-regions, and publication state."
        breadcrumbs={[
          { label: 'Locations', href: '/admin/locations' },
          { label: location ? `${location.name} (${location.type})` : 'Node Details' },
        ]}
        primaryAction={{
          label: 'Edit Node',
          href: `/admin/locations/${params.id}/edit`,
          icon: <Edit className="h-4 w-4" />,
        }}
        secondaryActions={[
          {
            label: 'Refresh',
            onClick: fetchDetail,
            icon: <RefreshCw className="h-4 w-4" />,
          },
        ]}
      />

      <div className="px-6 max-w-5xl space-y-6">
        {loading && <AdminLoadingState message="Retrieving location node metadata..." />}

        {error && <AdminErrorState title="Failed to load location" error={error} onRetry={fetchDetail} />}

        {location && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-fade-in">
            {/* Hierarchy & GIS Coordinates Box */}
            <div className="space-y-6 md:col-span-1">
              <div className="bg-white border border-neutral-200 rounded-xl p-5 shadow-xs space-y-4">
                <div className="flex flex-col items-center text-center p-3 space-y-2 border-b border-neutral-100 pb-5">
                  <div className="h-14 w-14 rounded-full bg-terracotta/10 text-terracotta flex items-center justify-center font-bold text-xl">
                    <MapPin className="h-6 w-6" />
                  </div>
                  <h2 className="font-bold text-lg text-neutral-900 font-display leading-tight">{location.name}</h2>
                  <p className="text-xs text-neutral-500 font-mono">{location.slug}</p>
                  <div className="pt-2">
                    <AdminBadge variant={location.status} />
                  </div>
                </div>

                <div className="space-y-3.5 text-xs font-body">
                  <div className="flex justify-between items-center text-neutral-600">
                    <span>Hierarchy Tier:</span>
                    <span className="font-semibold uppercase text-neutral-800 bg-neutral-100 px-2 py-0.5 rounded font-display">
                      {location.type}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-neutral-600">
                    <span>Parent Node:</span>
                    <span className="font-semibold text-neutral-900 flex items-center gap-1">
                      <GitFork className="h-3.5 w-3.5 text-neutral-400" />
                      {parentName || <em className="text-neutral-400 font-normal">None (Root)</em>}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-neutral-600">
                    <span>Featured Spot:</span>
                    <AdminBadge variant={location.featured ? 'PUBLISHED' : 'DEFAULT'} label={location.featured ? 'YES' : 'NO'} />
                  </div>
                </div>
              </div>

              {/* Coordinates Mapping Panel */}
              <div className="bg-white border border-neutral-200 rounded-xl p-5 shadow-xs space-y-4">
                <div className="flex items-center gap-2 border-b border-neutral-100 pb-3">
                  <Compass className="h-4.5 w-4.5 text-neutral-500" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500 font-display">
                    GIS Mapping Coordinates
                  </h3>
                </div>
                <div className="grid grid-cols-2 gap-4 text-xs font-mono">
                  <div className="bg-neutral-50 p-3 rounded-lg border border-neutral-200/50">
                    <span className="text-[10px] text-neutral-400 uppercase font-display block">Latitude</span>
                    <span className="text-neutral-900 font-bold block pt-1">
                      {location.latitude !== null && location.latitude !== undefined ? location.latitude : '—'}
                    </span>
                  </div>
                  <div className="bg-neutral-50 p-3 rounded-lg border border-neutral-200/50">
                    <span className="text-[10px] text-neutral-400 uppercase font-display block">Longitude</span>
                    <span className="text-neutral-900 font-bold block pt-1">
                      {location.longitude !== null && location.longitude !== undefined ? location.longitude : '—'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Status Control Actions */}
              <div className="bg-white border border-neutral-200 rounded-xl p-5 shadow-xs space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500 font-display">
                  Lifecycle Controls
                </h3>
                <div className="flex flex-col gap-2">
                  {location.status !== 'PUBLISHED' && (
                    <button
                      onClick={() => {
                        setConfirmType('PUBLISH');
                        setConfirmOpen(true);
                      }}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg min-h-[44px] cursor-pointer"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      <span>Publish Node</span>
                    </button>
                  )}
                  {location.status !== 'ARCHIVED' && (
                    <button
                      onClick={() => {
                        setConfirmType('ARCHIVE');
                        setConfirmOpen(true);
                      }}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg min-h-[44px] cursor-pointer border border-rose-200"
                    >
                      <Archive className="h-4 w-4" />
                      <span>Archive Node</span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Narratives, Descriptions & Parent breadcrumbs */}
            <div className="md:col-span-2 space-y-6">
              <div className="bg-white border border-neutral-200 rounded-xl p-6 space-y-5 shadow-xs">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500 font-display mb-3">
                    Short Tagline
                  </h3>
                  <p className="text-sm font-semibold text-neutral-800 font-display leading-relaxed">
                    {location.shortDescription || 'No taglines descriptions provided for this node.'}
                  </p>
                </div>

                <div className="border-t border-neutral-100 pt-5">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500 font-display mb-3">
                    Detailed Narrative & Micro-Guides
                  </h3>
                  <div className="text-sm text-neutral-600 font-body whitespace-pre-wrap leading-relaxed">
                    {location.description || 'No detailed micro-guides recorded for this node.'}
                  </div>
                </div>
              </div>

              {/* Timestamps */}
              <div className="bg-white border border-neutral-200 rounded-xl p-5 shadow-xs text-xs text-neutral-500 font-body flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <span className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-neutral-400" />
                  <span>Created: {new Date(location.createdAt).toLocaleString()}</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-neutral-400" />
                  <span>Last Updated: {new Date(location.updatedAt).toLocaleString()}</span>
                </span>
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center pt-2">
          <Link
            href="/admin/locations"
            className="px-5 py-2.5 border border-neutral-300 bg-white rounded-lg text-neutral-700 hover:bg-neutral-50 transition-colors text-sm font-semibold flex items-center gap-2 min-h-[44px]"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Locations Tree</span>
          </Link>
        </div>
      </div>

      <AdminConfirmDialog
        isOpen={confirmOpen}
        title={confirmType === 'PUBLISH' ? 'Publish Location Node' : 'Archive Location Node'}
        message={
          confirmType === 'PUBLISH'
            ? `Are you sure you want to transition this location to PUBLISHED status? If this is an Area or Neighbourhood, valid latitude/longitude coordinates are required.`
            : `Are you sure you want to transition this location to ARCHIVED status? This removes it and any child locations from sitemaps and public discovery surfaces.`
        }
        confirmLabel={confirmType === 'PUBLISH' ? 'Publish Node' : 'Archive Node'}
        isDestructive={confirmType === 'ARCHIVE'}
        isLoading={transitionLoading}
        onConfirm={handleTransition}
        onCancel={() => {
          setConfirmOpen(false);
          setConfirmType(null);
        }}
      />
    </div>
  );
}
