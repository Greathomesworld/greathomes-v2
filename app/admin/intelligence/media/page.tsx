'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { AdminPageHeader } from '@/src/components/admin/AdminPageHeader';
import { AdminLoadingState } from '@/src/components/admin/AdminLoadingState';
import { AdminErrorState } from '@/src/components/admin/AdminErrorState';
import { AdminConfirmDialog } from '@/src/components/admin/AdminConfirmDialog';
import { MediaDropzone } from '@/src/components/admin/media/MediaDropzone';
import { getAdminHeaders } from '@/src/lib/adminAuth';
import {
  Image as ImageIcon,
  Plus,
  Trash2,
  Edit,
  Star,
  Search,
  Filter,
  ExternalLink,
  Layers,
  Building2,
  Tag,
  KeyRound,
  X,
  Save,
  Check,
  RefreshCw,
  Sparkles,
  Eye,
  FileText,
} from 'lucide-react';

type EntityType = 'PROJECT' | 'DEVELOPER' | 'RESALE' | 'RENTAL';

interface MediaItem {
  id: string;
  entityType: EntityType;
  entityId: string;
  entityName: string;
  entitySlug: string;
  mediaType: string;
  mimeType?: string;
  filename?: string;
  storageKey?: string;
  category: string;
  url: string;
  originalUrl?: string;
  thumbnailUrl?: string;
  webpUrl?: string;
  avifUrl?: string;
  watermarkedUrl?: string;
  watermarkApplied?: boolean;
  altText: string | null;
  caption: string | null;
  sortOrder: number;
  isFeatured: boolean;
  createdAt: string;
  updatedAt: string;
}

const PROJECT_CATEGORIES = [
  { value: 'EXTERIOR', label: 'Exterior Views' },
  { value: 'INTERIOR', label: 'Interior Living' },
  { value: 'AMENITIES', label: 'Amenities & Facilities' },
  { value: 'CLUBHOUSE', label: 'Clubhouse & Leisure' },
  { value: 'LOCATION', label: 'Location & Vicinity Map' },
  { value: 'FLOOR_PLANS', label: 'Floor Plans' },
  { value: 'MASTER_PLAN', label: 'Master Layout Plan' },
  { value: 'CONSTRUCTION', label: 'Construction Progress' },
  { value: 'OTHER', label: 'Other Visuals' },
];

const DEVELOPER_CATEGORIES = [
  { value: 'LOGO', label: 'Corporate Logo' },
  { value: 'BRAND', label: 'Brand Imagery' },
  { value: 'OFFICE', label: 'Headquarters / Office' },
  { value: 'EDITORIAL', label: 'Editorial / Leadership' },
];

const LISTING_CATEGORIES = [
  { value: 'EXTERIOR', label: 'Exterior' },
  { value: 'INTERIOR', label: 'Interior' },
  { value: 'FLOOR_PLANS', label: 'Floor Plan' },
  { value: 'AMENITIES', label: 'Amenities' },
  { value: 'OTHER', label: 'Other' },
];

export default function CentralMediaAdminPage() {
  const [activeTab, setActiveTab] = useState<EntityType>('PROJECT');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mediaList, setMediaList] = useState<MediaItem[]>([]);
  const [viewWatermarked, setViewWatermarked] = useState(true);
  const [reprocessingId, setReprocessingId] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Entities for dropdown selection in Add Modal & Filters
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [developers, setDevelopers] = useState<{ id: string; name: string }[]>([]);
  const [resaleListings, setResaleListings] = useState<{ id: string; title: string }[]>([]);
  const [rentalListings, setRentalListings] = useState<{ id: string; title: string }[]>([]);

  // Filter states
  const [selectedEntityId, setSelectedEntityId] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [featuredOnly, setFeaturedOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Add Modal State
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addEntityId, setAddEntityId] = useState('');
  const [addCategory, setAddCategory] = useState('EXTERIOR');
  const [addWatermarkMode, setAddWatermarkMode] = useState<'AUTO' | 'ON' | 'OFF'>('AUTO');
  const [addMethod, setAddMethod] = useState<'DROPZONE' | 'URL'>('DROPZONE');
  const [addUrl, setAddUrl] = useState('');
  const [addAltText, setAddAltText] = useState('');
  const [addCaption, setAddCaption] = useState('');
  const [addSortOrder, setAddSortOrder] = useState('0');
  const [addFeatured, setAddFeatured] = useState(false);
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Replace Modal State
  const [replaceModalOpen, setReplaceModalOpen] = useState(false);
  const [itemToReplace, setItemToReplace] = useState<MediaItem | null>(null);

  // Edit Modal State
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MediaItem | null>(null);
  const [editCategory, setEditCategory] = useState('');
  const [editUrl, setEditUrl] = useState('');
  const [editAltText, setEditAltText] = useState('');
  const [editCaption, setEditCaption] = useState('');
  const [editSortOrder, setEditSortOrder] = useState('0');
  const [editFeatured, setEditFeatured] = useState(false);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Delete Dialog State
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<MediaItem | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  useEffect(() => {
    const fetchEntities = async () => {
      try {
        const headers = getAdminHeaders();
        const [projRes, devRes, resaleRes, rentRes] = await Promise.all([
          fetch('/api/projects?limit=100', { headers }).then((r) => r.json()).catch(() => ({ data: [] })),
          fetch('/api/developers?limit=100', { headers }).then((r) => r.json()).catch(() => ({ data: [] })),
          fetch('/api/resale?limit=100', { headers }).then((r) => r.json()).catch(() => ({ data: [] })),
          fetch('/api/rent?limit=100', { headers }).then((r) => r.json()).catch(() => ({ data: [] })),
        ]);

        setProjects((projRes.data || []).map((p: any) => ({ id: p.id, name: p.name })));
        setDevelopers((devRes.data || []).map((d: any) => ({ id: d.id, name: d.name })));
        setResaleListings((resaleRes.data || []).map((r: any) => ({ id: r.id, title: r.slug || r.id })));
        setRentalListings((rentRes.data || []).map((r: any) => ({ id: r.id, title: r.slug || r.id })));
      } catch (e) {
        console.error('Error fetching entities for media management', e);
      }
    };

    fetchEntities();
  }, []);

  const fetchMedia = async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      params.set('entityType', activeTab);
      if (selectedEntityId) params.set('entityId', selectedEntityId);
      if (selectedCategory !== 'ALL') params.set('category', selectedCategory);
      if (featuredOnly) params.set('featured', 'true');
      if (searchQuery) params.set('search', searchQuery);

      const res = await fetch(`/api/admin/media?${params.toString()}`, {
        headers: getAdminHeaders(),
      });
      if (!res.ok) {
        throw new Error('Failed to load media assets.');
      }
      const json = await res.json();
      setMediaList(json.data || json.items || []);
    } catch (err: any) {
      setError(err.message || 'Error fetching media records');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setSelectedEntityId('');
    setSelectedCategory('ALL');
    fetchMedia();
  }, [activeTab]);

  useEffect(() => {
    fetchMedia();
  }, [selectedEntityId, selectedCategory, featuredOnly]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchMedia();
  };

  const currentCategoryOptions = useMemo(() => {
    if (activeTab === 'DEVELOPER') return DEVELOPER_CATEGORIES;
    if (activeTab === 'RESALE' || activeTab === 'RENTAL') return LISTING_CATEGORIES;
    return PROJECT_CATEGORIES;
  }, [activeTab]);

  const openAddModal = () => {
    setAddUrl('');
    setAddCaption('');
    setAddAltText('');
    setAddSortOrder('0');
    setAddFeatured(false);
    setAddError(null);
    setAddCategory(currentCategoryOptions[0]?.value || 'EXTERIOR');
    setAddWatermarkMode(activeTab === 'DEVELOPER' ? 'OFF' : 'AUTO');

    if (activeTab === 'PROJECT') setAddEntityId(projects[0]?.id || '');
    else if (activeTab === 'DEVELOPER') setAddEntityId(developers[0]?.id || '');
    else if (activeTab === 'RESALE') setAddEntityId(resaleListings[0]?.id || '');
    else if (activeTab === 'RENTAL') setAddEntityId(rentalListings[0]?.id || '');

    setAddModalOpen(true);
  };

  const openReplaceModal = (item: MediaItem) => {
    setItemToReplace(item);
    setReplaceModalOpen(true);
  };

  const openEditModal = (item: MediaItem) => {
    setEditingItem(item);
    setEditCategory(item.category);
    setEditUrl(item.url);
    setEditAltText(item.altText || '');
    setEditCaption(item.caption || '');
    setEditSortOrder(String(item.sortOrder));
    setEditFeatured(item.isFeatured);
    setEditError(null);
    setEditModalOpen(true);
  };

  const handleReprocess = async (item: MediaItem) => {
    try {
      setReprocessingId(item.id);
      const res = await fetch(`/api/admin/media/${item.id}/reprocess`, {
        method: 'POST',
        headers: getAdminHeaders(),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to reprocess media asset');
      }
      setSuccessMessage(`Asset "${item.caption || item.id}" reprocessed successfully from original source!`);
      setTimeout(() => setSuccessMessage(null), 4000);
      await fetchMedia();
    } catch (err: any) {
      alert(err.message || 'Error reprocessing media asset');
    } finally {
      setReprocessingId(null);
    }
  };

  const handleCreateMedia = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addEntityId) {
      setAddError('Please select a target entity.');
      return;
    }
    if (!addUrl.trim()) {
      setAddError('Media URL is required.');
      return;
    }

    try {
      setAddSubmitting(true);
      setAddError(null);

      let targetUrl = '';
      let payload: any = {
        category: addCategory,
        url: addUrl.trim(),
        sortOrder: parseInt(addSortOrder, 10) || 0,
        isFeatured: addFeatured,
      };

      if (activeTab === 'PROJECT') {
        targetUrl = `/api/projects/${addEntityId}/media`;
        payload.altText = addAltText.trim() || null;
        payload.caption = addCaption.trim() || null;
        payload.mediaType = 'IMAGE';
      } else if (activeTab === 'DEVELOPER') {
        targetUrl = `/api/developers/${addEntityId}/media`;
        payload.mediaType = addCategory === 'LOGO' ? 'LOGO' : 'IMAGE';
      } else if (activeTab === 'RESALE') {
        targetUrl = `/api/resale/${addEntityId}/media`;
        payload.altText = addAltText.trim() || null;
        payload.caption = addCaption.trim() || null;
        payload.mediaType = 'IMAGE';
      } else if (activeTab === 'RENTAL') {
        targetUrl = `/api/rent/${addEntityId}/media`;
        payload.altText = addAltText.trim() || null;
        payload.caption = addCaption.trim() || null;
        payload.mediaType = 'IMAGE';
      }

      const res = await fetch(targetUrl, {
        method: 'POST',
        headers: getAdminHeaders(),
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Failed to create media item.');
      }

      setAddModalOpen(false);
      await fetchMedia();
    } catch (err: any) {
      setAddError(err.message || 'Error creating media item');
    } finally {
      setAddSubmitting(false);
    }
  };

  const handleUpdateMedia = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;
    if (!editUrl.trim()) {
      setEditError('Media URL cannot be empty.');
      return;
    }

    try {
      setEditSubmitting(true);
      setEditError(null);

      const res = await fetch(`/api/admin/media/${editingItem.id}`, {
        method: 'PATCH',
        headers: getAdminHeaders(),
        body: JSON.stringify({
          category: editCategory,
          altText: editAltText.trim() || null,
          caption: editCaption.trim() || null,
          sortOrder: parseInt(editSortOrder, 10) || 0,
          isFeatured: editFeatured,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Failed to update media item.');
      }

      setEditModalOpen(false);
      await fetchMedia();
    } catch (err: any) {
      setEditError(err.message || 'Error updating media item');
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleToggleFeatured = async (item: MediaItem) => {
    try {
      const res = await fetch(`/api/admin/media/${item.id}/featured`, {
        method: 'PATCH',
        headers: getAdminHeaders(),
        body: JSON.stringify({ isFeatured: !item.isFeatured }),
      });

      if (res.ok) {
        await fetchMedia();
      }
    } catch (err) {
      console.error('Failed to toggle featured flag', err);
    }
  };

  const openDeleteDialog = (item: MediaItem) => {
    setItemToDelete(item);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!itemToDelete) return;
    try {
      setDeleteSubmitting(true);
      const res = await fetch(`/api/admin/media/${itemToDelete.id}`, {
        method: 'DELETE',
        headers: getAdminHeaders(),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Failed to delete media asset.');
      }

      setDeleteDialogOpen(false);
      await fetchMedia();
    } catch (err: any) {
      alert(err.message || 'Error deleting media asset');
    } finally {
      setDeleteSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 pb-20 font-body">
      <AdminPageHeader
        title="Central Media Asset Hub"
        description="Oversee, upload, optimize, categorize, and watermarking photography, floor plans, developer logos, and listing assets across Great Homes."
        breadcrumbs={[
          { label: 'Project Intelligence', href: '/admin/intelligence/configurations' },
          { label: 'Media Assets' },
        ]}
        primaryAction={{
          label: 'Upload Media',
          onClick: openAddModal,
          icon: <Plus className="h-4 w-4" />,
        }}
      />

      {/* Success Notification Banner */}
      {successMessage && (
        <div className="mx-6 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-center gap-2 animate-in fade-in">
          <Check className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Domain Navigation Tabs & View Mode */}
      <div className="px-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2 bg-neutral-100 dark:bg-slate-800 p-1 border border-neutral-200 dark:border-slate-700 rounded-xl overflow-x-auto w-full sm:w-fit">
          {[
            { key: 'PROJECT', label: 'Project Media', icon: <Building2 className="h-4 w-4" /> },
            { key: 'DEVELOPER', label: 'Developer Brands', icon: <Layers className="h-4 w-4" /> },
            { key: 'RESALE', label: 'Resale Listings', icon: <Tag className="h-4 w-4" /> },
            { key: 'RENTAL', label: 'Rental Listings', icon: <KeyRound className="h-4 w-4" /> },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as EntityType)}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-colors font-display ${
                activeTab === tab.key
                  ? 'bg-white dark:bg-slate-900 text-neutral-900 dark:text-white shadow-xs'
                  : 'text-neutral-500 hover:text-neutral-800 dark:hover:text-slate-200 hover:bg-neutral-50'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Dual View Toggle */}
        <div className="inline-flex rounded-lg p-0.5 bg-neutral-100 dark:bg-slate-800 border border-neutral-200 dark:border-slate-700">
          <button
            type="button"
            onClick={() => setViewWatermarked(true)}
            className={`px-3 py-1.5 rounded-md font-body text-xs font-medium transition-colors flex items-center gap-1.5 ${
              viewWatermarked
                ? 'bg-white dark:bg-slate-900 text-[#FF5E00] shadow-xs'
                : 'text-neutral-600 dark:text-slate-400 hover:text-neutral-900'
            }`}
          >
            <Sparkles className="w-3 h-3" /> Public Preview (Watermarked)
          </button>
          <button
            type="button"
            onClick={() => setViewWatermarked(false)}
            className={`px-3 py-1.5 rounded-md font-body text-xs font-medium transition-colors flex items-center gap-1.5 ${
              !viewWatermarked
                ? 'bg-white dark:bg-slate-900 text-neutral-900 dark:text-white shadow-xs'
                : 'text-neutral-600 dark:text-slate-400 hover:text-neutral-900'
            }`}
          >
            <Eye className="w-3 h-3" /> Original Source
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="px-6">
        <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
            {/* Search Input */}
            <form onSubmit={handleSearchSubmit} className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search captions, filenames, or alt text..."
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-neutral-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#FF5E00] text-neutral-800"
              />
            </form>

            {/* Target Entity Filter */}
            <select
              value={selectedEntityId}
              onChange={(e) => setSelectedEntityId(e.target.value)}
              className="py-1.5 px-3 text-xs bg-white border border-neutral-200 rounded-lg text-neutral-700 focus:outline-none focus:ring-1 focus:ring-[#FF5E00]"
            >
              <option value="">All {activeTab.toLowerCase()}s</option>
              {activeTab === 'PROJECT' &&
                projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              {activeTab === 'DEVELOPER' &&
                developers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              {activeTab === 'RESALE' &&
                resaleListings.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title}
                  </option>
                ))}
              {activeTab === 'RENTAL' &&
                rentalListings.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title}
                  </option>
                ))}
            </select>

            {/* Category Filter */}
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="py-1.5 px-3 text-xs bg-white border border-neutral-200 rounded-lg text-neutral-700 focus:outline-none focus:ring-1 focus:ring-[#FF5E00]"
            >
              <option value="ALL">All Categories</option>
              {currentCategoryOptions.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.label}
                </option>
              ))}
            </select>
          </div>

          {/* Featured Toggle */}
          <label className="flex items-center gap-1.5 text-xs font-semibold text-neutral-600 cursor-pointer select-none bg-white border border-neutral-200 px-3 py-1.5 rounded-lg shadow-2xs">
            <input
              type="checkbox"
              checked={featuredOnly}
              onChange={(e) => setFeaturedOnly(e.target.checked)}
              className="rounded text-[#FF5E00] focus:ring-[#FF5E00] h-3.5 w-3.5"
            />
            <span>Hero / Featured Only</span>
          </label>
        </div>
      </div>

      {/* Media Asset Grid */}
      <div className="px-6">
        {loading ? (
          <AdminLoadingState message="Loading media asset records..." />
        ) : error ? (
          <AdminErrorState title="Failed to load media assets" error={error} onRetry={fetchMedia} />
        ) : mediaList.length === 0 ? (
          <div className="bg-white border border-neutral-200 rounded-xl p-12 text-center shadow-xs">
            <ImageIcon className="h-10 w-10 text-neutral-300 mx-auto mb-3" />
            <h3 className="text-base font-bold text-neutral-800 font-display">No media assets found</h3>
            <p className="text-xs text-neutral-500 font-body mt-1 max-w-sm mx-auto">
              No images or media assets match your active filters. Click &ldquo;Upload Media&rdquo; above to link photography.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
            {mediaList.map((item) => {
              const displayUrl =
                viewWatermarked && item.watermarkedUrl ? item.watermarkedUrl : item.url;
              const isPdf = item.mediaType === 'DOCUMENT' || item.url?.endsWith('.pdf');
              const isLogoOrSvg =
                item.category === 'LOGO' ||
                item.entityType === 'DEVELOPER' ||
                item.mimeType === 'image/svg+xml' ||
                displayUrl?.endsWith('.svg');
              const isSingleDerivative =
                Boolean(item.watermarkApplied) &&
                (!item.originalUrl ||
                  item.originalUrl === item.watermarkedUrl ||
                  item.originalUrl === item.url ||
                  item.originalUrl.endsWith('public_wm.webp'));

              return (
                <div
                  key={item.id}
                  className="bg-white border border-neutral-200 rounded-xl overflow-hidden shadow-xs hover:shadow-md transition-shadow group flex flex-col justify-between"
                >
                  {/* Image Container with Badges */}
                  <div className="relative aspect-video w-full bg-neutral-100 overflow-hidden flex items-center justify-center">
                    {isPdf ? (
                      <div className="flex flex-col items-center justify-center p-4 text-center">
                        <FileText className="w-10 h-10 text-rose-500 mb-2" />
                        <span className="text-xs font-mono text-neutral-600 truncate max-w-[180px]">
                          {item.caption || 'PDF Document'}
                        </span>
                      </div>
                    ) : (
                      <img
                        src={displayUrl}
                        alt={item.altText || item.caption || item.entityName}
                        className={`w-full h-full group-hover:scale-102 transition-transform duration-300 ${
                          isLogoOrSvg ? 'object-contain p-4 bg-white' : 'object-cover'
                        }`}
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                      />
                    )}

                    {/* Top Overlay Badges */}
                    <div className="absolute top-2 left-2 flex items-center gap-1.5">
                      <span className="text-2xs font-bold uppercase tracking-wider bg-black/70 text-white px-2 py-0.5 rounded backdrop-blur-xs font-mono">
                        {item.category?.replace('_', ' ')}
                      </span>
                      {item.isFeatured && (
                        <span className="text-2xs font-bold uppercase bg-emerald-600 text-white px-2 py-0.5 rounded shadow-xs flex items-center gap-1 font-display">
                          <Star className="h-2.5 w-2.5 fill-white" />
                          Hero
                        </span>
                      )}
                    </div>

                    {/* Watermark Pill */}
                    {item.watermarkApplied && viewWatermarked && (
                      <span className="absolute bottom-2 left-2 text-2xs font-mono bg-black/60 text-white px-1.5 py-0.5 rounded backdrop-blur-xs flex items-center gap-1">
                        <Sparkles className="w-2.5 h-2.5 text-orange-400" /> Great Homes Watermark
                      </span>
                    )}

                    {/* Quick Action Overlay Buttons */}
                    <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleToggleFeatured(item)}
                        className={`p-1.5 rounded-lg shadow-xs transition-colors ${
                          item.isFeatured
                            ? 'bg-[#FF5E00] text-white'
                            : 'bg-white/90 text-neutral-600 hover:text-[#FF5E00]'
                        }`}
                        title={item.isFeatured ? 'Unset hero image' : 'Mark as hero image'}
                      >
                        <Star className={`h-3.5 w-3.5 ${item.isFeatured ? 'fill-white' : ''}`} />
                      </button>

                      {!isSingleDerivative && !isPdf && !isLogoOrSvg && (
                        <button
                          onClick={() => handleReprocess(item)}
                          disabled={reprocessingId === item.id}
                          className="p-1.5 bg-white/90 text-neutral-700 hover:text-emerald-600 rounded-lg shadow-xs transition-colors"
                          title="Reprocess asset from original immutable source"
                        >
                          <RefreshCw
                            className={`h-3.5 w-3.5 ${
                              reprocessingId === item.id ? 'animate-spin text-emerald-600' : ''
                            }`}
                          />
                        </button>
                      )}

                      <button
                        onClick={() => openReplaceModal(item)}
                        className="p-1.5 bg-white/90 text-neutral-700 hover:text-blue-600 rounded-lg shadow-xs transition-colors"
                        title="Replace image asset"
                      >
                        <Layers className="h-3.5 w-3.5" />
                      </button>

                      <button
                        onClick={() => openEditModal(item)}
                        className="p-1.5 bg-white/90 text-neutral-700 hover:text-indigo-600 rounded-lg shadow-xs transition-colors"
                        title="Edit metadata"
                      >
                        <Edit className="h-3.5 w-3.5" />
                      </button>

                      <button
                        onClick={() => openDeleteDialog(item)}
                        className="p-1.5 bg-white/90 text-neutral-700 hover:text-rose-600 rounded-lg shadow-xs transition-colors"
                        title="Delete asset"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Metadata Body */}
                  <div className="p-3.5 space-y-2 flex-1 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between text-2xs text-neutral-500 mb-1">
                        <span className="font-semibold truncate max-w-[160px] text-neutral-800 font-display">
                          {item.entityName}
                        </span>
                        <span className="font-mono bg-neutral-100 px-1.5 py-0.5 rounded text-neutral-600">
                          Order #{item.sortOrder}
                        </span>
                      </div>

                      {item.caption && (
                        <p className="text-xs font-semibold text-neutral-800 line-clamp-1">
                          {item.caption}
                        </p>
                      )}

                      {item.altText && (
                        <p className="text-2xs text-neutral-500 line-clamp-1 italic">
                          Alt: &ldquo;{item.altText}&rdquo;
                        </p>
                      )}
                    </div>

                    <div className="pt-2 border-t border-neutral-100 flex items-center justify-between text-2xs text-neutral-400">
                      <span className="truncate max-w-[180px] font-mono">{displayUrl}</span>
                      <a
                        href={displayUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-neutral-500 hover:text-[#FF5E00]"
                        title="Open full image in new tab"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add Media Modal with Universal Dropzone */}
      {addModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-neutral-200 rounded-2xl shadow-2xl w-full max-w-xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-5 h-5 text-[#FF5E00]" />
                <h3 className="text-base font-bold text-neutral-900 font-display">
                  Upload Media to {activeTab.toLowerCase()}
                </h3>
              </div>
              <button
                onClick={() => setAddModalOpen(false)}
                className="text-neutral-400 hover:text-neutral-600 p-1 rounded-lg"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {addError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700">
                {addError}
              </div>
            )}

            {/* Target Entity & Category Selectors */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-2xs font-bold uppercase tracking-wider text-neutral-600 mb-1">
                  Target {activeTab.toLowerCase()} *
                </label>
                <select
                  value={addEntityId}
                  onChange={(e) => setAddEntityId(e.target.value)}
                  className="w-full text-xs bg-neutral-50 border border-neutral-200 rounded-lg p-2 focus:ring-1 focus:ring-[#FF5E00]"
                >
                  {activeTab === 'PROJECT' &&
                    projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  {activeTab === 'DEVELOPER' &&
                    developers.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  {activeTab === 'RESALE' &&
                    resaleListings.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.title}
                      </option>
                    ))}
                  {activeTab === 'RENTAL' &&
                    rentalListings.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.title}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-2xs font-bold uppercase tracking-wider text-neutral-600 mb-1">
                  Asset Category *
                </label>
                <select
                  value={addCategory}
                  onChange={(e) => setAddCategory(e.target.value)}
                  className="w-full text-xs bg-neutral-50 border border-neutral-200 rounded-lg p-2 focus:ring-1 focus:ring-[#FF5E00]"
                >
                  {currentCategoryOptions.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Upload Method Switcher */}
            <div className="flex border-b border-neutral-200 text-xs">
              <button
                type="button"
                onClick={() => setAddMethod('DROPZONE')}
                className={`pb-2 px-3 font-semibold border-b-2 transition-colors ${
                  addMethod === 'DROPZONE'
                    ? 'border-[#FF5E00] text-[#FF5E00]'
                    : 'border-transparent text-neutral-500 hover:text-neutral-800'
                }`}
              >
                Drag & Drop / Browse
              </button>
              <button
                type="button"
                onClick={() => setAddMethod('URL')}
                className={`pb-2 px-3 font-semibold border-b-2 transition-colors ${
                  addMethod === 'URL'
                    ? 'border-[#FF5E00] text-[#FF5E00]'
                    : 'border-transparent text-neutral-500 hover:text-neutral-800'
                }`}
              >
                External URL
              </button>
            </div>

            {addMethod === 'DROPZONE' ? (
              <div className="space-y-3">
                <MediaDropzone
                  entityType={activeTab}
                  entityId={addEntityId}
                  category={addCategory}
                  watermarkMode={addWatermarkMode}
                  onBatchComplete={() => {
                    fetchMedia();
                    setTimeout(() => setAddModalOpen(false), 800);
                  }}
                />

                <div className="flex items-center justify-between text-xs text-neutral-500 pt-2 border-t border-neutral-100">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-neutral-700">Watermark:</span>
                    <select
                      value={addWatermarkMode}
                      onChange={(e) => setAddWatermarkMode(e.target.value as any)}
                      className="text-xs bg-neutral-100 border border-neutral-200 rounded px-2 py-0.5"
                    >
                      <option value="AUTO">Auto (Brand Safe)</option>
                      <option value="ON">Always On</option>
                      <option value="OFF">Off</option>
                    </select>
                  </div>
                </div>
              </div>
            ) : (
              <form onSubmit={handleCreateMedia} className="space-y-3">
                <div>
                  <label className="block text-2xs font-bold uppercase tracking-wider text-neutral-600 mb-1">
                    Image / Document URL *
                  </label>
                  <input
                    type="url"
                    value={addUrl}
                    onChange={(e) => setAddUrl(e.target.value)}
                    placeholder="https://images.unsplash.com/..."
                    required
                    className="w-full text-xs bg-neutral-50 border border-neutral-200 rounded-lg p-2 focus:ring-1 focus:ring-[#FF5E00]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-2xs font-bold uppercase tracking-wider text-neutral-600 mb-1">
                      Caption (Display)
                    </label>
                    <input
                      type="text"
                      value={addCaption}
                      onChange={(e) => setAddCaption(e.target.value)}
                      placeholder="e.g. Master Bedroom View"
                      className="w-full text-xs bg-neutral-50 border border-neutral-200 rounded-lg p-2 focus:ring-1 focus:ring-[#FF5E00]"
                    />
                  </div>
                  <div>
                    <label className="block text-2xs font-bold uppercase tracking-wider text-neutral-600 mb-1">
                      Alt Text (SEO)
                    </label>
                    <input
                      type="text"
                      value={addAltText}
                      onChange={(e) => setAddAltText(e.target.value)}
                      placeholder="e.g. Spacious modern living room"
                      className="w-full text-xs bg-neutral-50 border border-neutral-200 rounded-lg p-2 focus:ring-1 focus:ring-[#FF5E00]"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setAddModalOpen(false)}
                    className="px-4 py-2 text-xs font-semibold border border-neutral-200 rounded-lg hover:bg-neutral-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={addSubmitting}
                    className="px-4 py-2 text-xs font-semibold bg-[#FF5E00] hover:bg-[#E05300] text-white rounded-lg transition-colors flex items-center gap-1.5"
                  >
                    {addSubmitting ? 'Saving...' : 'Save Media Asset'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Replace Asset Modal */}
      {replaceModalOpen && itemToReplace && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-neutral-200 rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <h3 className="text-sm font-bold text-neutral-900 font-display">
                Replace Asset &ldquo;{itemToReplace.caption || itemToReplace.id}&rdquo;
              </h3>
              <button
                onClick={() => setReplaceModalOpen(false)}
                className="text-neutral-400 hover:text-neutral-600 p-1"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs text-neutral-500">
              Upload a new image file to replace this asset. Existing references (including floor plan assignments) will be preserved seamlessly without broken links.
            </p>

            <MediaDropzone
              entityType={itemToReplace.entityType}
              entityId={itemToReplace.entityId}
              category={itemToReplace.category}
              replaceAssetId={itemToReplace.id}
              multiple={false}
              title="Drop Replacement Asset"
              subtitle="Select new file from device to replace this asset in-place"
              onUploadSuccess={async () => {
                setReplaceModalOpen(false);
                fetchMedia();
              }}
            />
          </div>
        </div>
      )}

      {/* Edit Metadata Modal */}
      {editModalOpen && editingItem && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-neutral-200 rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <h3 className="text-sm font-bold text-neutral-900 font-display">
                Edit Media Metadata
              </h3>
              <button
                onClick={() => setEditModalOpen(false)}
                className="text-neutral-400 hover:text-neutral-600 p-1"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {editError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700">
                {editError}
              </div>
            )}

            <form onSubmit={handleUpdateMedia} className="space-y-3">
              <div>
                <label className="block text-2xs font-bold uppercase tracking-wider text-neutral-600 mb-1">
                  Category
                </label>
                <select
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value)}
                  className="w-full text-xs bg-neutral-50 border border-neutral-200 rounded-lg p-2"
                >
                  {currentCategoryOptions.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-2xs font-bold uppercase tracking-wider text-neutral-600 mb-1">
                  Caption
                </label>
                <input
                  type="text"
                  value={editCaption}
                  onChange={(e) => setEditCaption(e.target.value)}
                  className="w-full text-xs bg-neutral-50 border border-neutral-200 rounded-lg p-2"
                />
              </div>

              <div>
                <label className="block text-2xs font-bold uppercase tracking-wider text-neutral-600 mb-1">
                  Alt Text (Accessibility & SEO)
                </label>
                <input
                  type="text"
                  value={editAltText}
                  onChange={(e) => setEditAltText(e.target.value)}
                  className="w-full text-xs bg-neutral-50 border border-neutral-200 rounded-lg p-2"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-2xs font-bold uppercase tracking-wider text-neutral-600 mb-1">
                    Sort Order
                  </label>
                  <input
                    type="number"
                    value={editSortOrder}
                    onChange={(e) => setEditSortOrder(e.target.value)}
                    className="w-full text-xs bg-neutral-50 border border-neutral-200 rounded-lg p-2"
                  />
                </div>
                <div className="flex items-end pb-2">
                  <label className="flex items-center gap-2 text-xs font-semibold text-neutral-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editFeatured}
                      onChange={(e) => setEditFeatured(e.target.checked)}
                      className="rounded text-[#FF5E00] focus:ring-[#FF5E00] h-4 w-4"
                    />
                    <span>Hero Image</span>
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => setEditModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold border border-neutral-200 rounded-lg hover:bg-neutral-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editSubmitting}
                  className="px-4 py-2 text-xs font-semibold bg-[#FF5E00] hover:bg-[#E05300] text-white rounded-lg transition-colors"
                >
                  {editSubmitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AdminConfirmDialog
        isOpen={deleteDialogOpen}
        onCancel={() => setDeleteDialogOpen(false)}
        onConfirm={handleConfirmDelete}
        title="Delete Media Asset"
        message="Are you sure you want to permanently delete this media asset? This action will check for active references (such as configuration floor plans) before deleting."
        confirmLabel={deleteSubmitting ? 'Deleting...' : 'Delete Asset'}
        isDestructive={true}
      />
    </div>
  );
}
