'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AdminPageHeader } from '@/src/components/admin/AdminPageHeader';
import { AdminBadge } from '@/src/components/admin/AdminBadge';
import { AdminConfirmDialog } from '@/src/components/admin/AdminConfirmDialog';
import { AdminLoadingState } from '@/src/components/admin/AdminLoadingState';
import { AdminErrorState } from '@/src/components/admin/AdminErrorState';
import { getAdminHeaders } from '@/src/lib/adminAuth';
import { formatIndianPrice } from '@/src/components/discovery/formatters';
import {
  Building2,
  Home,
  IndianRupee,
  Sparkles,
  Image as ImageIcon,
  Edit3,
  Trash2,
  Plus,
  ArrowLeft,
  Link2,
  Unlink,
  ShieldCheck,
  Send,
  Eye,
  Archive,
  PauseCircle,
  PlayCircle,
  Check,
  Phone,
  Mail,
  Lock,
  Calendar,
  Clock,
  ChevronLeft,
  ChevronRight,
  Star,
} from 'lucide-react';
import { MediaDropzone } from '@/src/components/admin/media/MediaDropzone';
import { MediaPreviewGrid } from '@/src/components/admin/media/MediaPreviewGrid';


const VALID_LIFECYCLE_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['SUBMITTED'],
  SUBMITTED: ['UNDER_REVIEW', 'DRAFT'],
  UNDER_REVIEW: ['APPROVED', 'DRAFT', 'SUBMITTED'],
  APPROVED: ['PUBLISHED', 'DRAFT'],
  PUBLISHED: ['PAUSED', 'SOLD_RENTED', 'ARCHIVED'],
  PAUSED: ['PUBLISHED', 'SOLD_RENTED', 'ARCHIVED'],
  SOLD_RENTED: ['ARCHIVED'],
  ARCHIVED: ['DRAFT'],
};

export default function RentalDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [listing, setListing] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Lookups
  const [allAmenities, setAllAmenities] = useState<any[]>([]);
  const [allProjects, setAllProjects] = useState<any[]>([]);

  // Action states
  const [actionLoading, setActionLoading] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [transitionConfirm, setTransitionConfirm] = useState<{ open: boolean; targetStatus: string } | null>(null);

  // Media add modal state
  const [showAddMedia, setShowAddMedia] = useState(false);
  const [mediaUrl, setMediaUrl] = useState('');
  const [mediaCategory, setMediaCategory] = useState('INTERIOR');
  const [mediaCaption, setMediaCaption] = useState('');
  const [mediaFeatured, setMediaFeatured] = useState(false);

  // Amenity add modal state
  const [showAddAmenity, setShowAddAmenity] = useState(false);
  const [selectedAmenityId, setSelectedAmenityId] = useState('');

  // Project link modal state
  const [showLinkProject, setShowLinkProject] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState('');

  const fetchListing = async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch(`/api/rent/${id}`, {
        headers: getAdminHeaders(),
      });

      if (!res.ok) {
        throw new Error(`Failed to load rental listing: ${res.statusText}`);
      }

      const json = await res.json();
      setListing(json.data);
    } catch (err: any) {
      setError(err.message || 'Error loading rental listing');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) {
      fetchListing();
    }
  }, [id]);

  useEffect(() => {
    const loadLookups = async () => {
      try {
        const [amenRes, projRes] = await Promise.all([
          fetch('/api/admin/amenities', { headers: getAdminHeaders() }),
          fetch('/api/projects?limit=100', { headers: getAdminHeaders() }),
        ]);
        if (amenRes.ok) {
          const aJson = await amenRes.json();
          setAllAmenities(aJson.data || []);
        }
        if (projRes.ok) {
          const pJson = await projRes.json();
          setAllProjects(pJson.data || []);
        }
      } catch (e) {
        console.error('Error loading lookups', e);
      }
    };
    loadLookups();
  }, []);

  const handleLifecycleTransition = async (status: string) => {
    try {
      setActionLoading(true);
      const res = await fetch(`/api/rent/${id}/status`, {
        method: 'POST',
        headers: getAdminHeaders(),
        body: JSON.stringify({
          action: 'transition',
          status,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Transition failed');
      }

      setTransitionConfirm(null);
      await fetchListing();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleVerificationToggle = async () => {
    try {
      setActionLoading(true);
      const targetStatus = listing.verificationStatus === 'VERIFIED' ? 'UNVERIFIED' : 'VERIFIED';
      const res = await fetch(`/api/rent/${id}/status`, {
        method: 'POST',
        headers: getAdminHeaders(),
        body: JSON.stringify({
          action: 'verify',
          status: targetStatus,
          verifiedBy: 'Great Homes Lease Desk',
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Verification update failed');
      }

      await fetchListing();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleLinkProject = async () => {
    if (!selectedProjectId) return;
    try {
      setActionLoading(true);
      const res = await fetch(`/api/rent/${id}`, {
        method: 'PATCH',
        headers: getAdminHeaders(),
        body: JSON.stringify({ projectId: selectedProjectId }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to link project');
      }
      setShowLinkProject(false);
      await fetchListing();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleUnlinkProject = async () => {
    if (!confirm('Decouple this listing from the catalog project?')) return;
    try {
      setActionLoading(true);
      const res = await fetch(`/api/rent/${id}`, {
        method: 'PATCH',
        headers: getAdminHeaders(),
        body: JSON.stringify({ projectId: null }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to unlink project');
      }
      await fetchListing();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddMedia = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mediaUrl.trim()) return;
    try {
      setActionLoading(true);
      const res = await fetch(`/api/rent/${id}/media`, {
        method: 'POST',
        headers: getAdminHeaders(),
        body: JSON.stringify({
          mediaType: 'IMAGE',
          category: mediaCategory,
          url: mediaUrl.trim(),
          caption: mediaCaption.trim() || null,
          isFeatured: mediaFeatured,
        }),
      });
      if (!res.ok) throw new Error('Failed to add media');
      setShowAddMedia(false);
      setMediaUrl('');
      setMediaCaption('');
      setMediaFeatured(false);
      await fetchListing();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRemoveMedia = async (mediaId: string) => {
    try {
      const res = await fetch(`/api/rent/${id}/media/${mediaId}`, {
        method: 'DELETE',
        headers: getAdminHeaders(),
      });
      if (!res.ok) throw new Error('Failed to remove media');
      await fetchListing();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleMoveMedia = async (index: number, direction: 'left' | 'right') => {
    const currentMedia = [...(listing?.media || [])];
    const targetIndex = direction === 'left' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= currentMedia.length) return;

    const swapped = [...currentMedia];
    const [moved] = swapped.splice(index, 1);
    swapped.splice(targetIndex, 0, moved);

    const items = swapped.map((m: any, idx: number) => ({
      id: m.id,
      sortOrder: idx,
    }));

    try {
      setActionLoading(true);
      const res = await fetch(`/api/rent/${id}/media`, {
        method: 'PATCH',
        headers: getAdminHeaders(),
        body: JSON.stringify({ items }),
      });
      if (!res.ok) throw new Error('Failed to reorder media');
      await fetchListing();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleSetFeaturedMedia = async (mediaId: string) => {
    try {
      setActionLoading(true);
      const res = await fetch(`/api/rent/${id}/media/${mediaId}`, {
        method: 'PATCH',
        headers: getAdminHeaders(),
        body: JSON.stringify({ isFeatured: true }),
      });
      if (!res.ok) throw new Error('Failed to update featured photo');
      await fetchListing();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddAmenity = async () => {
    if (!selectedAmenityId) return;
    try {
      setActionLoading(true);
      const res = await fetch(`/api/rent/${id}/amenities`, {
        method: 'POST',
        headers: getAdminHeaders(),
        body: JSON.stringify({ amenityId: selectedAmenityId }),
      });
      if (!res.ok) throw new Error('Failed to associate amenity');
      setShowAddAmenity(false);
      setSelectedAmenityId('');
      await fetchListing();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRemoveAmenity = async (amenityId: string) => {
    try {
      const res = await fetch(`/api/rent/${id}/amenities?amenityId=${amenityId}`, {
        method: 'DELETE',
        headers: getAdminHeaders(),
      });
      if (!res.ok) throw new Error('Failed to disassociate amenity');
      await fetchListing();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDeleteListing = async () => {
    try {
      setActionLoading(true);
      const res = await fetch(`/api/rent/${id}`, {
        method: 'DELETE',
        headers: getAdminHeaders(),
      });
      if (!res.ok) throw new Error('Failed to delete listing');
      router.push('/admin/listings/rent');
    } catch (err: any) {
      alert(err.message);
      setActionLoading(false);
    }
  };

  if (loading) {
    return <AdminLoadingState message="Loading rental residence profile..." />;
  }

  if (error || !listing) {
    return <AdminErrorState title="Listing Not Found" error={error || 'Unable to retrieve listing'} onRetry={fetchListing} />;
  }

  const allowedTransitions = VALID_LIFECYCLE_TRANSITIONS[listing.lifecycleStatus] || [];
  const currentAmenityIds = new Set((listing.amenities || []).map((a: any) => a.id));
  const candidateAmenities = allAmenities.filter(a => !currentAmenityIds.has(a.id));

  return (
    <div className="space-y-6 pb-24">
      {/* HEADER */}
      <AdminPageHeader
        title={`${listing.bedroomCount} BHK ${listing.propertyType?.replace(/_/g, ' ')} for Rent`}
        description={
          listing.project
            ? `Part of ${listing.project.name} (${listing.project.location?.name || 'Kolkata'})`
            : 'Standalone / Unlinked Rental Residence'
        }
        breadcrumbs={[
          { label: 'Listings', href: '/admin/listings/resale' },
          { label: 'Rent', href: '/admin/listings/rent' },
          { label: listing.configuration || 'Details' },
        ]}
        primaryAction={{
          label: 'Edit Listing',
          onClick: () => router.push(`/admin/listings/rent/${id}/edit`),
          icon: <Edit3 className="h-4 w-4" />,
        }}
        secondaryActions={[
          {
            label: 'Back to List',
            onClick: () => router.push('/admin/listings/rent'),
            icon: <ArrowLeft className="h-4 w-4" />,
          },
        ]}
      />

      <div className="max-w-6xl mx-auto px-6 space-y-6">
        {/* TOP STATUS & ACTION BAR */}
        <div className="bg-white border border-neutral-200/80 rounded-xl p-5 shadow-2xs flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs text-neutral-500 font-display font-semibold uppercase tracking-wider">
              Status:
            </span>
            <AdminBadge variant={listing.lifecycleStatus} size="md" />

            <span className="text-neutral-300">|</span>

            <span className="text-xs text-neutral-500 font-display font-semibold uppercase tracking-wider">
              Verification:
            </span>
            <AdminBadge
              variant={listing.verificationStatus === 'VERIFIED' ? 'VERIFIED' : 'UNVERIFIED'}
              label={listing.verificationStatus}
              size="md"
            />
            {listing.verifiedAt && (
              <span className="text-xs text-neutral-400 font-mono">
                ({new Date(listing.verifiedAt).toLocaleDateString('en-IN')})
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {listing.lifecycleStatus === 'PUBLISHED' && (
              <Link
                href={`/rent/${listing.slug || listing.id}`}
                target="_blank"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold font-display border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-700 transition-colors"
              >
                <Eye className="h-3.5 w-3.5" />
                <span>View Public Page</span>
              </Link>
            )}

            {/* Verification Button */}
            <button
              onClick={handleVerificationToggle}
              disabled={actionLoading}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold font-display transition-colors cursor-pointer border ${
                listing.verificationStatus === 'VERIFIED'
                  ? 'border-amber-300 text-amber-800 bg-amber-50 hover:bg-amber-100'
                  : 'border-emerald-300 text-emerald-800 bg-emerald-50 hover:bg-emerald-100'
              }`}
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>{listing.verificationStatus === 'VERIFIED' ? 'Mark Unverified' : 'Verify Listing'}</span>
            </button>

            {/* Lifecycle Transitions */}
            {allowedTransitions.map((nextStatus) => (
              <button
                key={nextStatus}
                onClick={() => setTransitionConfirm({ open: true, targetStatus: nextStatus })}
                disabled={actionLoading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold font-display bg-neutral-900 text-white hover:bg-neutral-800 transition-colors cursor-pointer shadow-2xs"
              >
                {nextStatus === 'SUBMITTED' && <Send className="h-3.5 w-3.5" />}
                {nextStatus === 'UNDER_REVIEW' && <Eye className="h-3.5 w-3.5" />}
                {nextStatus === 'APPROVED' && <Check className="h-3.5 w-3.5" />}
                {nextStatus === 'PUBLISHED' && <PlayCircle className="h-3.5 w-3.5" />}
                {nextStatus === 'PAUSED' && <PauseCircle className="h-3.5 w-3.5" />}
                {nextStatus === 'ARCHIVED' && <Archive className="h-3.5 w-3.5" />}
                <span>Move to {nextStatus.replace(/_/g, ' ')}</span>
              </button>
            ))}

            <button
              onClick={() => setDeleteConfirmOpen(true)}
              className="p-2 text-neutral-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
              title="Delete Listing"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* MAIN GRID */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* LEFT 2 COLS */}
          <div className="lg:col-span-2 space-y-6">
            {/* FINANCIAL STRUCTURE & LEASE TERMS */}
            <div className="bg-white border border-neutral-200/80 rounded-xl p-6 shadow-2xs space-y-5">
              <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
                <div className="flex items-center gap-2.5">
                  <IndianRupee className="h-5 w-5 text-terracotta" />
                  <h3 className="font-bold text-neutral-900 font-display">Financial Terms & Deposit</h3>
                </div>
                <span className="text-[11px] font-mono uppercase bg-neutral-100 px-2 py-0.5 rounded text-neutral-600">
                  Fixed Lease Rates
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                <div>
                  <span className="text-xs text-neutral-500 font-display uppercase tracking-wider block mb-1">
                    Monthly Rent
                  </span>
                  <span className="text-2xl font-extrabold text-neutral-900 font-display">
                    {formatIndianPrice(listing.monthlyRent)}
                  </span>
                  <span className="text-xs text-neutral-400 font-body block mt-0.5">per month</span>
                </div>

                <div>
                  <span className="text-xs text-neutral-500 font-display uppercase tracking-wider block mb-1">
                    Security Deposit
                  </span>
                  <span className="text-2xl font-bold text-neutral-800 font-display font-mono">
                    {listing.securityDeposit ? formatIndianPrice(listing.securityDeposit) : '—'}
                  </span>
                  <span className="text-xs text-neutral-400 font-body block mt-0.5">refundable deposit</span>
                </div>

                <div>
                  <span className="text-xs text-neutral-500 font-display uppercase tracking-wider block mb-1">
                    Maintenance
                  </span>
                  <span className="text-xl font-bold text-neutral-800 font-display font-mono">
                    {listing.maintenance ? `${formatIndianPrice(listing.maintenance)} / mo` : 'Included'}
                  </span>
                  <span className="text-xs text-neutral-400 font-body block mt-0.5">society charges</span>
                </div>
              </div>

              {/* Lease parameters */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-neutral-100">
                <div>
                  <span className="text-xs text-neutral-500 font-body block">Lease Duration</span>
                  <span className="text-sm font-semibold text-neutral-900 font-body">
                    {listing.leaseDuration || '11 Months'}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-neutral-500 font-body block">Notice Period</span>
                  <span className="text-sm font-semibold text-neutral-900 font-body">
                    {listing.noticePeriod || '1 Month'}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-neutral-500 font-body block">Availability</span>
                  <span className="text-sm font-semibold text-neutral-900 font-mono">
                    {listing.availabilityDate ? new Date(listing.availabilityDate).toLocaleDateString('en-IN') : 'Immediate'}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-neutral-500 font-body block">Possession</span>
                  <span className="text-sm font-semibold text-neutral-900 font-body">
                    {listing.possession?.replace(/_/g, ' ') || 'Ready'}
                  </span>
                </div>
              </div>

              {/* Physical attributes */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-3 border-t border-neutral-100">
                <div>
                  <span className="text-xs text-neutral-500 font-body block">Carpet Area</span>
                  <span className="text-sm font-bold text-neutral-900 font-mono">
                    {listing.carpetArea ? `${listing.carpetArea} sq.ft.` : '—'}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-neutral-500 font-body block">Furnishing</span>
                  <span className="text-sm font-semibold text-neutral-900 font-body">
                    {listing.furnishing?.replace(/_/g, ' ')}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-neutral-500 font-body block">Balcony Facing</span>
                  <span className="text-sm font-semibold text-neutral-900 font-body">
                    {listing.facing?.replace(/_/g, ' ')}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-neutral-500 font-body block">Floor Category</span>
                  <span className="text-sm font-semibold text-neutral-900 font-body">
                    {listing.floorCategory?.replace(/_/g, ' ')}
                  </span>
                </div>
              </div>

              {listing.description && (
                <div className="pt-4 border-t border-neutral-100">
                  <span className="text-xs text-neutral-500 font-display uppercase tracking-wider block mb-1">
                    Editorial Description
                  </span>
                  <p className="text-sm text-neutral-700 font-body leading-relaxed whitespace-pre-line">
                    {listing.description}
                  </p>
                </div>
              )}
            </div>

            {/* MEDIA GALLERY */}
            <div className="bg-white border border-neutral-200/80 rounded-xl p-6 shadow-2xs space-y-4">
              <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
                <div className="flex items-center gap-2.5">
                  <ImageIcon className="h-5 w-5 text-terracotta" />
                  <h3 className="font-bold text-neutral-900 font-display">
                    Rental Photography ({listing.media?.length || 0})
                  </h3>
                </div>
                <button
                  onClick={() => setShowAddMedia(true)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-neutral-900 hover:text-terracotta font-display cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add Image</span>
                </button>
              </div>

              {listing.media?.length === 0 ? (
                <p className="text-xs text-neutral-400 italic font-body py-4 text-center">
                  No photography uploaded yet. Add images to attract verified prospective tenants.
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {listing.media?.map((m: any, idx: number) => (
                    <div
                      key={m.id}
                      className="group relative rounded-lg border border-neutral-200 overflow-hidden bg-neutral-50 flex flex-col justify-between"
                    >
                      <div className="relative">
                        <img
                          src={m.url}
                          alt={m.altText || 'Rental photo'}
                          referrerPolicy="no-referrer"
                          className="w-full h-36 object-cover group-hover:scale-105 transition-transform duration-200"
                        />
                        <span className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/70 text-white text-[10px] font-mono font-bold">
                          #{idx + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveMedia(m.id)}
                          className="absolute top-2 right-2 p-1.5 bg-black/65 text-white rounded-md hover:bg-rose-600 transition-colors cursor-pointer"
                          title="Remove photo"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      <div className="p-2.5 space-y-2 bg-white flex-1 flex flex-col justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-600 font-display truncate">
                              {m.category?.replace(/_/g, ' ')}
                            </span>
                            {m.isFeatured && (
                              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded font-display shrink-0">
                                Featured
                              </span>
                            )}
                          </div>
                          {m.caption && (
                            <p className="text-xs text-neutral-700 font-body line-clamp-1">{m.caption}</p>
                          )}
                        </div>

                        <div className="flex items-center justify-between gap-1 pt-2 border-t border-neutral-100">
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              disabled={idx === 0 || actionLoading}
                              onClick={() => handleMoveMedia(idx, 'left')}
                              className="p-1 rounded border border-neutral-200 text-neutral-600 hover:bg-neutral-100 disabled:opacity-35 cursor-pointer"
                              title="Move earlier in gallery"
                            >
                              <ChevronLeft className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={idx === (listing.media?.length || 1) - 1 || actionLoading}
                              onClick={() => handleMoveMedia(idx, 'right')}
                              className="p-1 rounded border border-neutral-200 text-neutral-600 hover:bg-neutral-100 disabled:opacity-35 cursor-pointer"
                              title="Move later in gallery"
                            >
                              <ChevronRight className="h-3.5 w-3.5" />
                            </button>
                          </div>

                          {!m.isFeatured && (
                            <button
                              type="button"
                              disabled={actionLoading}
                              onClick={() => handleSetFeaturedMedia(m.id)}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-neutral-200 text-[10px] font-display font-semibold text-neutral-700 hover:bg-amber-50 hover:border-amber-300 hover:text-amber-800 cursor-pointer"
                              title="Set as featured photo"
                            >
                              <Star className="h-3 w-3" />
                              <span>Set Featured</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* AMENITIES */}
            <div className="bg-white border border-neutral-200/80 rounded-xl p-6 shadow-2xs space-y-4">
              <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
                <div className="flex items-center gap-2.5">
                  <Sparkles className="h-5 w-5 text-terracotta" />
                  <h3 className="font-bold text-neutral-900 font-display">
                    Associated Amenities ({listing.amenities?.length || 0})
                  </h3>
                </div>
                <button
                  onClick={() => setShowAddAmenity(true)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-neutral-900 hover:text-terracotta font-display cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Attach Amenity</span>
                </button>
              </div>

              {listing.amenities?.length === 0 ? (
                <p className="text-xs text-neutral-400 italic font-body py-4 text-center">
                  No amenities associated with this rental listing.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {listing.amenities?.map((a: any) => (
                    <span
                      key={a.id}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-200 bg-neutral-50 text-xs font-medium text-neutral-800 font-body"
                    >
                      <span>{a.name}</span>
                      <button
                        onClick={() => handleRemoveAmenity(a.id)}
                        className="text-neutral-400 hover:text-rose-600 p-0.5 cursor-pointer"
                        title="Remove amenity"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT COL: PROJECT & PRIVATE CONTACTS */}
          <div className="space-y-6">
            {/* PROJECT CONTEXT CARD */}
            <div className="bg-white border border-neutral-200/80 rounded-xl p-5 shadow-2xs space-y-4">
              <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-terracotta" />
                  <h4 className="font-bold text-neutral-900 font-display text-sm">Project Linkage</h4>
                </div>
                {listing.project ? (
                  <button
                    onClick={handleUnlinkProject}
                    disabled={actionLoading}
                    className="inline-flex items-center gap-1 text-xs text-neutral-500 hover:text-rose-600 font-display cursor-pointer"
                  >
                    <Unlink className="h-3 w-3" />
                    <span>Unlink</span>
                  </button>
                ) : (
                  <button
                    onClick={() => setShowLinkProject(true)}
                    disabled={actionLoading}
                    className="inline-flex items-center gap-1 text-xs text-neutral-900 hover:text-terracotta font-display font-semibold cursor-pointer"
                  >
                    <Link2 className="h-3.5 w-3.5" />
                    <span>Link to Project</span>
                  </button>
                )}
              </div>

              {listing.project ? (
                <div className="space-y-2">
                  <Link
                    href={`/admin/projects/${listing.project.id}`}
                    className="text-sm font-bold text-neutral-900 hover:text-terracotta transition-colors font-display block"
                  >
                    {listing.project.name}
                  </Link>
                  <p className="text-xs text-neutral-500 font-body">
                    Location: <strong className="text-neutral-700">{listing.project.location?.name || 'Kolkata'}</strong>
                  </p>
                  <div className="pt-2">
                    <Link
                      href={`/admin/projects/${listing.project.id}`}
                      className="text-xs text-terracotta hover:underline font-semibold font-display"
                    >
                      View Master Project Details →
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="bg-neutral-50 p-3 rounded-lg border border-neutral-200/60 text-xs text-neutral-600 font-body space-y-2">
                  <p>This residence is standalone and operates independently in the secondary rental marketplace.</p>
                  <p className="text-neutral-700">
                    Canonical Location: <strong className="font-display text-neutral-900">{listing.location?.name || 'Unassigned'}</strong>
                  </p>
                  {listing.latitude && listing.longitude ? (
                    <p className="text-neutral-700">
                      Private Coordinates: <strong className="font-mono text-neutral-800">{Number(listing.latitude).toFixed(6)}°, {Number(listing.longitude).toFixed(6)}°</strong>
                    </p>
                  ) : (
                    <p className="text-neutral-500 italic">No custom coordinates set (using location centroid).</p>
                  )}
                </div>
              )}
            </div>

            {/* OWNERSHIP & PROTECTED STAFF INFORMATION */}
            <div className="bg-white border border-neutral-200/80 rounded-xl p-5 shadow-2xs space-y-4">
              <div className="flex items-center gap-2 border-b border-neutral-100 pb-3">
                <Lock className="h-4 w-4 text-amber-600" />
                <h4 className="font-bold text-neutral-900 font-display text-sm">Protected Staff Records</h4>
              </div>

              <div className="space-y-3">
                <div>
                  <span className="text-xs text-neutral-500 font-body block">Listing Party</span>
                  <span className="text-xs font-bold text-neutral-900 font-display uppercase tracking-wider">
                    {listing.listingPartyType === 'OWNER' ? 'Owner Listed' : 'Listing Partner'}
                  </span>
                </div>

                {listing.listingPartyType === 'OWNER' ? (
                  <div className="space-y-2 pt-2 border-t border-neutral-100">
                    <div>
                      <span className="text-xs text-neutral-500 font-body block">Landlord Name</span>
                      <span className="text-sm font-medium text-neutral-800 font-body">
                        {listing.ownerName || '—'}
                      </span>
                    </div>
                    <div>
                      <span className="text-xs text-neutral-500 font-body block">Landlord Phone</span>
                      <span className="text-xs font-semibold text-neutral-900 font-mono flex items-center gap-1.5 mt-0.5">
                        <Phone className="h-3 w-3 text-neutral-400" />
                        {listing.ownerPhone || '—'}
                      </span>
                    </div>
                    <div>
                      <span className="text-xs text-neutral-500 font-body block">Landlord Email</span>
                      <span className="text-xs text-neutral-700 font-body flex items-center gap-1.5 mt-0.5">
                        <Mail className="h-3 w-3 text-neutral-400" />
                        {listing.ownerEmail || '—'}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2 pt-2 border-t border-neutral-100">
                    <div>
                      <span className="text-xs text-neutral-500 font-body block">Partner Name</span>
                      <span className="text-sm font-medium text-neutral-800 font-body">
                        {listing.brokerName || '—'}
                      </span>
                    </div>
                    <div>
                      <span className="text-xs text-neutral-500 font-body block">Partner Phone</span>
                      <span className="text-xs font-semibold text-neutral-900 font-mono flex items-center gap-1.5 mt-0.5">
                        <Phone className="h-3 w-3 text-neutral-400" />
                        {listing.brokerPhone || '—'}
                      </span>
                    </div>
                    <div>
                      <span className="text-xs text-neutral-500 font-body block">Partner Email</span>
                      <span className="text-xs text-neutral-700 font-body flex items-center gap-1.5 mt-0.5">
                        <Mail className="h-3 w-3 text-neutral-400" />
                        {listing.brokerEmail || '—'}
                      </span>
                    </div>
                  </div>
                )}

                {(listing.internalNotes || listing.crmId || listing.source) && (
                  <div className="space-y-2 pt-3 border-t border-neutral-100 text-xs">
                    {listing.source && (
                      <div>
                        <span className="text-neutral-500 font-body">Lead Source: </span>
                        <span className="font-semibold text-neutral-800">{listing.source}</span>
                      </div>
                    )}
                    {listing.crmId && (
                      <div>
                        <span className="text-neutral-500 font-body">CRM ID: </span>
                        <span className="font-mono text-neutral-800">{listing.crmId}</span>
                      </div>
                    )}
                    {listing.internalNotes && (
                      <div>
                        <span className="text-neutral-500 font-body block">Internal Notes:</span>
                        <p className="text-neutral-700 italic bg-neutral-50 p-2 rounded border border-neutral-200 mt-1">
                          {listing.internalNotes}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* TIMESTAMPS & RECORD AUDIT */}
            <div className="bg-neutral-50 border border-neutral-200/80 rounded-xl p-4 text-xs space-y-1.5 text-neutral-600 font-mono">
              <div>
                <span className="text-neutral-400">ID: </span>
                <span>{listing.id}</span>
              </div>
              <div>
                <span className="text-neutral-400">Created: </span>
                <span>{new Date(listing.createdAt).toLocaleString('en-IN')}</span>
              </div>
              <div>
                <span className="text-neutral-400">Updated: </span>
                <span>{new Date(listing.updatedAt).toLocaleString('en-IN')}</span>
              </div>
              {listing.verifiedBy && (
                <div>
                  <span className="text-neutral-400">Verified By: </span>
                  <span className="text-neutral-800 font-semibold">{listing.verifiedBy}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* MODAL: ADD MEDIA */}
      {showAddMedia && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white border border-neutral-200 rounded-2xl shadow-xl max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-neutral-100">
              <h3 className="text-base font-bold text-neutral-900 font-display">Add Rental Photography</h3>
              <button
                type="button"
                onClick={() => setShowAddMedia(false)}
                className="text-neutral-400 hover:text-neutral-600 p-1"
              >
                <span>✕</span>
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 font-display mb-1">
                Category
              </label>
              <select
                value={mediaCategory}
                onChange={(e) => setMediaCategory(e.target.value)}
                className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg text-xs"
              >
                <option value="INTERIOR">Interior</option>
                <option value="EXTERIOR">Exterior</option>
                <option value="LOBBY">Lobby</option>
                <option value="AMENITIES">Amenities</option>
                <option value="BALCONY_VIEW">Balcony View</option>
              </select>
            </div>

            <MediaDropzone
              entityType="RENTAL"
              entityId={id as string}
              category={mediaCategory}
              title="Drag & Drop Rental Images"
              subtitle="Drop photos here to upload with Great Homes watermarking & WebP optimization"
              onBatchComplete={() => {
                fetchListing();
                setShowAddMedia(false);
              }}
            />
          </div>
        </div>
      )}

      {/* MODAL: ATTACH AMENITY */}
      {showAddAmenity && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white border border-neutral-200 rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-base font-bold text-neutral-900 font-display">Attach Canonical Amenity</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 font-display mb-1">
                  Select Amenity
                </label>
                <select
                  value={selectedAmenityId}
                  onChange={(e) => setSelectedAmenityId(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-lg text-xs"
                >
                  <option value="">-- Choose Amenity --</option>
                  {candidateAmenities.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.category})
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddAmenity(false)}
                  className="px-4 py-2 text-xs font-semibold text-neutral-600 bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!selectedAmenityId || actionLoading}
                  onClick={handleAddAmenity}
                  className="px-4 py-2 text-xs font-semibold text-white bg-neutral-900 hover:bg-neutral-800 rounded-lg disabled:opacity-50"
                >
                  {actionLoading ? 'Attaching...' : 'Attach Amenity'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: LINK TO PROJECT */}
      {showLinkProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white border border-neutral-200 rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-base font-bold text-neutral-900 font-display">Link Listing to Catalog Project</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 font-display mb-1">
                  Select Project
                </label>
                <select
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-lg text-xs"
                >
                  <option value="">-- Choose Project --</option>
                  {allProjects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} {p.location ? `(${p.location.name})` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowLinkProject(false)}
                  className="px-4 py-2 text-xs font-semibold text-neutral-600 bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!selectedProjectId || actionLoading}
                  onClick={handleLinkProject}
                  className="px-4 py-2 text-xs font-semibold text-white bg-neutral-900 hover:bg-neutral-800 rounded-lg disabled:opacity-50"
                >
                  {actionLoading ? 'Linking...' : 'Confirm Link'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM DIALOG: LIFECYCLE TRANSITION */}
      <AdminConfirmDialog
        isOpen={!!transitionConfirm}
        title={`Transition to ${transitionConfirm?.targetStatus.replace(/_/g, ' ')}`}
        message={`Are you sure you want to transition this rental listing from "${listing.lifecycleStatus}" to "${transitionConfirm?.targetStatus}"? This controls visibility across the rental discovery feeds.`}
        confirmLabel={`Move to ${transitionConfirm?.targetStatus.replace(/_/g, ' ')}`}
        cancelLabel="Cancel"
        onConfirm={() => transitionConfirm && handleLifecycleTransition(transitionConfirm.targetStatus)}
        onCancel={() => setTransitionConfirm(null)}
        isLoading={actionLoading}
      />

      {/* CONFIRM DIALOG: DELETE */}
      <AdminConfirmDialog
        isOpen={deleteConfirmOpen}
        title="Delete Rental Listing"
        message="Are you sure you want to permanently delete this rental listing? All associated lease terms, media, and amenity records will also be erased."
        confirmLabel="Delete Listing"
        cancelLabel="Cancel"
        isDestructive={true}
        onConfirm={handleDeleteListing}
        onCancel={() => setDeleteConfirmOpen(false)}
        isLoading={actionLoading}
      />
    </div>
  );
}
