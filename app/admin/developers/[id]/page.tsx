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
import { Edit, RefreshCw, Calendar, Globe, Building2, CheckCircle2, Archive, ArrowLeft, Image as ImageIcon, Plus, Trash2, Star, Save } from 'lucide-react';
import { MediaDropzone } from '@/src/components/admin/media/MediaDropzone';
import { MediaPreviewGrid } from '@/src/components/admin/media/MediaPreviewGrid';


interface DeveloperDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function DeveloperDetailPage(props: DeveloperDetailPageProps) {
  const params = use(props.params);
  const router = useRouter();
  const [developer, setDeveloper] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Developer Media states
  const [devMedia, setDevMedia] = useState<any[]>([]);
  const [newMediaUrl, setNewMediaUrl] = useState('');
  const [newMediaCategory, setNewMediaCategory] = useState<'LOGO' | 'BRAND' | 'OFFICE' | 'EDITORIAL'>('LOGO');
  const [newMediaFeatured, setNewMediaFeatured] = useState(false);
  const [addingMedia, setAddingMedia] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);

  // Transition controls
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmType, setConfirmType] = useState<'PUBLISH' | 'ARCHIVE' | null>(null);
  const [transitionLoading, setTransitionLoading] = useState(false);

  const fetchDevMedia = async () => {
    try {
      const res = await fetch(`/api/developers/${params.id}/media`, {
        headers: getAdminHeaders(),
      });
      if (res.ok) {
        const json = await res.json();
        setDevMedia(json.data || []);
      }
    } catch (e) {
      console.error('Error fetching developer media', e);
    }
  };

  const fetchDetail = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/admin/developers/${params.id}`, {
        headers: getAdminHeaders(),
      });
      if (!res.ok) {
        throw new Error('Developer profile not found.');
      }
      const data = await res.json();
      setDeveloper(data);
      await fetchDevMedia();
    } catch (err: any) {
      setError(err.message || 'Error fetching developer details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetail();
  }, [params.id]);

  const handleAddMedia = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMediaUrl.trim()) return;

    try {
      setAddingMedia(true);
      setMediaError(null);
      const res = await fetch(`/api/developers/${params.id}/media`, {
        method: 'POST',
        headers: getAdminHeaders(),
        body: JSON.stringify({
          url: newMediaUrl.trim(),
          category: newMediaCategory,
          isFeatured: newMediaFeatured,
          sortOrder: devMedia.length,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Failed to add media');
      }

      setNewMediaUrl('');
      await fetchDevMedia();
    } catch (err: any) {
      setMediaError(err.message || 'Failed to add media');
    } finally {
      setAddingMedia(false);
    }
  };

  const handleDeleteMedia = async (mediaId: string) => {
    if (!confirm('Are you sure you want to remove this media asset?')) return;
    try {
      const res = await fetch(`/api/developers/${params.id}/media/${mediaId}`, {
        method: 'DELETE',
        headers: getAdminHeaders(),
      });
      if (res.ok) {
        await fetchDevMedia();
      }
    } catch (err) {
      console.error('Failed to delete media', err);
    }
  };

  const handleToggleMediaFeatured = async (mediaId: string, currentFeatured: boolean) => {
    try {
      const res = await fetch(`/api/developers/${params.id}/media/${mediaId}`, {
        method: 'PATCH',
        headers: getAdminHeaders(),
        body: JSON.stringify({ isFeatured: !currentFeatured }),
      });
      if (res.ok) {
        await fetchDevMedia();
      }
    } catch (err) {
      console.error('Failed to toggle featured', err);
    }
  };

  const handleTransition = async () => {
    if (!confirmType) return;
    try {
      setTransitionLoading(true);
      const url = `/api/admin/developers/${params.id}/${confirmType.toLowerCase()}`;
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
        title={developer ? developer.name : 'Developer Profile'}
        description="Verify developer brand narratives, official portal web link connectivity, and associated real estate projects."
        breadcrumbs={[
          { label: 'Developers', href: '/admin/developers' },
          { label: developer ? developer.name : 'Profile Details' },
        ]}
        primaryAction={{
          label: 'Edit Profile',
          href: `/admin/developers/${params.id}/edit`,
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
        {loading && <AdminLoadingState message="Retrieving developer profile details..." />}

        {error && <AdminErrorState title="Failed to load developer" error={error} onRetry={fetchDetail} />}

        {developer && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-fade-in">
            {/* Identity & Status Summary Column */}
            <div className="space-y-6 md:col-span-1">
              <div className="bg-white border border-neutral-200 rounded-xl p-5 shadow-xs space-y-4">
                <div className="flex flex-col items-center text-center p-3 space-y-2 border-b border-neutral-100 pb-5">
                  <div className="h-16 w-16 rounded-xl bg-neutral-100 border border-neutral-200 flex items-center justify-center font-bold text-2xl font-display shadow-sm overflow-hidden shrink-0">
                    {developer.logoUrl ? (
                      <img src={developer.logoUrl} alt={developer.name} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="h-full w-full bg-neutral-900 text-white flex items-center justify-center rounded-xl">
                        {developer.name?.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <h2 className="font-bold text-lg text-neutral-900 font-display leading-tight">{developer.name}</h2>
                  <p className="text-xs text-neutral-500 font-mono tracking-tight">{developer.slug}</p>
                  <div className="pt-2">
                    <AdminBadge variant={developer.status} />
                  </div>
                </div>

                <div className="space-y-3.5 text-xs">
                  <div className="flex justify-between items-center text-neutral-600">
                    <span>Visibility Level:</span>
                    <span className="font-semibold text-neutral-900 uppercase">
                      {developer.status === 'PUBLISHED' ? 'Publicly Indexed' : 'Internal Draft'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-neutral-600">
                    <span>Featured Partner:</span>
                    <AdminBadge variant={developer.featured ? 'PUBLISHED' : 'DEFAULT'} label={developer.featured ? 'YES' : 'NO'} />
                  </div>
                  <div className="flex justify-between items-center text-neutral-600">
                    <span>Official Portal:</span>
                    {developer.websiteUrl ? (
                      <a
                        href={developer.websiteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-terracotta font-mono font-medium hover:underline truncate max-w-[150px]"
                      >
                        {developer.websiteUrl}
                      </a>
                    ) : (
                      <span className="text-neutral-400 font-mono">None</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Quick Lifecycle Controls */}
              <div className="bg-white border border-neutral-200 rounded-xl p-5 shadow-xs space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500 font-display">
                  Lifecycle Controls
                </h3>
                <div className="flex flex-col gap-2">
                  {developer.status !== 'PUBLISHED' && (
                    <button
                      onClick={() => {
                        setConfirmType('PUBLISH');
                        setConfirmOpen(true);
                      }}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg min-h-[44px] cursor-pointer"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      <span>Publish Brand Profile</span>
                    </button>
                  )}
                  {developer.status !== 'ARCHIVED' && (
                    <button
                      onClick={() => {
                        setConfirmType('ARCHIVE');
                        setConfirmOpen(true);
                      }}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg min-h-[44px] cursor-pointer border border-rose-200"
                    >
                      <Archive className="h-4 w-4" />
                      <span>Archive Brand Profile</span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Description, Projects, Timestamps Column */}
            <div className="md:col-span-2 space-y-6">
              <div className="bg-white border border-neutral-200 rounded-xl p-6 space-y-5 shadow-xs">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500 font-display mb-3">
                    Short Catchy Tagline Description
                  </h3>
                  <p className="text-sm font-semibold text-neutral-800 font-display leading-relaxed">
                    {developer.shortDescription || 'No taglines descriptions provided.'}
                  </p>
                </div>

                <div className="border-t border-neutral-100 pt-5">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500 font-display mb-3">
                    Brand Narrative Biography
                  </h3>
                  <div className="text-sm text-neutral-600 font-body whitespace-pre-wrap leading-relaxed">
                    {developer.description || 'No detailed corporate biographies recorded for this brand.'}
                  </div>
                </div>
              </div>

              {/* Brand Media & Logo Assets */}
              <div className="bg-white border border-neutral-200 rounded-xl p-6 space-y-4 shadow-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ImageIcon className="h-4 w-4 text-neutral-500" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500 font-display">
                      Brand Media & Corporate Assets
                    </h3>
                  </div>
                  <span className="text-xs font-mono font-semibold bg-neutral-100 text-neutral-700 px-2 py-0.5 rounded">
                    {devMedia.length} Visuals
                  </span>
                </div>

                {devMedia.length === 0 ? (
                  <p className="text-xs text-neutral-500 font-body py-2">
                    No logo or brand imagery assets attached yet. Upload official developer media below.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {devMedia.map((m) => (
                      <div key={m.id} className="relative group border border-neutral-200 rounded-lg overflow-hidden bg-neutral-50 flex flex-col justify-between">
                        <div className="aspect-video w-full bg-neutral-100 overflow-hidden relative flex items-center justify-center">
                          <img
                            src={m.url}
                            alt={m.category}
                            className={`w-full h-full ${
                              m.category === 'LOGO' || m.url?.endsWith('.svg')
                                ? 'object-contain p-3 bg-white'
                                : 'object-cover'
                            }`}
                          />
                          <div className="absolute top-1 left-1 flex items-center gap-1">
                            <span className="text-3xs font-mono font-bold bg-black/70 text-white px-1.5 py-0.5 rounded">
                              {m.category}
                            </span>
                            {m.isFeatured && (
                              <span className="text-3xs font-bold bg-emerald-600 text-white px-1.5 py-0.5 rounded flex items-center gap-0.5">
                                <Star className="h-2 w-2 fill-white" />
                                Hero
                              </span>
                            )}
                          </div>
                          <div className="absolute top-1 right-1 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              type="button"
                              onClick={() => handleToggleMediaFeatured(m.id, m.isFeatured)}
                              className="p-1 bg-white/90 hover:bg-amber-50 text-neutral-700 hover:text-amber-500 rounded shadow-xs"
                              title="Toggle featured hero"
                            >
                              <Star className={`h-3 w-3 ${m.isFeatured ? 'fill-amber-500 text-amber-500' : ''}`} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteMedia(m.id)}
                              className="p-1 bg-white/90 hover:bg-rose-50 text-rose-600 rounded shadow-xs"
                              title="Delete asset"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Drag and Drop Brand Upload */}
                <div className="pt-3 border-t border-neutral-100 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-neutral-700 uppercase tracking-wider font-display">
                      Upload Brand Assets / Logo
                    </h4>
                    <select
                      value={newMediaCategory}
                      onChange={(e) => setNewMediaCategory(e.target.value as any)}
                      className="text-xs bg-neutral-50 border border-neutral-200 rounded-lg p-1.5 font-display"
                    >
                      <option value="LOGO">Corporate Logo</option>
                      <option value="BRAND">Brand Imagery</option>
                      <option value="OFFICE">Headquarters</option>
                      <option value="EDITORIAL">Editorial</option>
                    </select>
                  </div>

                  <MediaDropzone
                    entityType="DEVELOPER"
                    entityId={params.id}
                    category={newMediaCategory}
                    watermarkMode="OFF"
                    title="Drag & Drop Brand Logo / Imagery"
                    subtitle="Drop vector SVG or lossless PNG/WebP/JPG logos & brand imagery here (never watermarked)"
                    onBatchComplete={() => {
                      fetchDetail();
                    }}
                  />
                </div>
              </div>

              {/* Related Projects Portfolios */}
              <div className="bg-white border border-neutral-200 rounded-xl p-6 space-y-4 shadow-xs">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500 font-display">
                    Associated Projects Portfolio
                  </h3>
                  <span className="text-xs font-mono font-semibold bg-neutral-100 text-neutral-700 px-2 py-0.5 rounded">
                    {developer.projects?.length ?? 0} Catalogued
                  </span>
                </div>

                {(!developer.projects || developer.projects.length === 0) ? (
                  <p className="text-xs text-neutral-500 font-body py-4 text-center">
                    No active residential projects are registered under this developer portfolio.
                  </p>
                ) : (
                  <div className="divide-y divide-neutral-100">
                    {developer.projects.map((proj: any) => (
                      <div key={proj.id} className="py-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-neutral-400" />
                          <span className="text-xs font-bold text-neutral-800 font-display">{proj.name}</span>
                        </div>
                        <AdminBadge variant={proj.isPublished || proj.lifecycleStatus === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT'} />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Audit Metadata Panel */}
              <div className="bg-white border border-neutral-200 rounded-xl p-5 shadow-xs text-xs text-neutral-500 font-body flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <span className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-neutral-400" />
                  <span>Created: {new Date(developer.createdAt).toLocaleString()}</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-neutral-400" />
                  <span>Last Updated: {new Date(developer.updatedAt).toLocaleString()}</span>
                </span>
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center pt-2">
          <Link
            href="/admin/developers"
            className="px-5 py-2.5 border border-neutral-300 bg-white rounded-lg text-neutral-700 hover:bg-neutral-50 transition-colors text-sm font-semibold flex items-center gap-2 min-h-[44px]"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Developer Directory</span>
          </Link>
        </div>
      </div>

      <AdminConfirmDialog
        isOpen={confirmOpen}
        title={confirmType === 'PUBLISH' ? 'Publish Developer Profile' : 'Archive Developer Profile'}
        message={
          confirmType === 'PUBLISH'
            ? `Are you sure you want to transition this brand to PUBLISHED status? This enables public indexing on search and sitemaps.`
            : `Are you sure you want to transition this brand to ARCHIVED status? This removes it from public discovery routes immediately.`
        }
        confirmLabel={confirmType === 'PUBLISH' ? 'Publish Brand' : 'Archive Brand'}
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
