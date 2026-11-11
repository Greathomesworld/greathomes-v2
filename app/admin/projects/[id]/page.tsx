'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AdminPageHeader } from '@/src/components/admin/AdminPageHeader';
import { AdminBadge } from '@/src/components/admin/AdminBadge';
import { AdminLoadingState } from '@/src/components/admin/AdminLoadingState';
import { AdminErrorState } from '@/src/components/admin/AdminErrorState';
import { AdminConfirmDialog } from '@/src/components/admin/AdminConfirmDialog';
import { getAdminHeaders } from '@/src/lib/adminAuth';
import {
  ArrowLeft, Edit3, CheckCircle, Archive, Globe, 
  Layers, ShieldCheck, Image as ImageIcon, HelpCircle, 
  Compass, Settings, Trash2, Plus, Sparkles, AlertCircle, Save,
  X, Loader2, Star, Trees, MapPin, ExternalLink, Play, Video, RotateCcw
} from 'lucide-react';
import { parseVideoUrl, getVideoThumbnail } from '@/src/lib/videoUtils';
import { MediaDropzone } from '@/src/components/admin/media/MediaDropzone';
import { MediaPreviewGrid } from '@/src/components/admin/media/MediaPreviewGrid';
import { TypologyFloorPlanControl } from '@/src/components/admin/typologies/TypologyFloorPlanControl';
import { ProjectFloorPlanViewer } from '@/src/components/projects/ProjectFloorPlanViewer';
import { ProjectLocationMap } from '@/src/components/projects/ProjectLocationMap';
import { isValidCoordinate, resolveProjectCoordinates } from '@/src/domain/projects/viewModels/projectLocationViewModel';
import { ProjectIntelligenceControl } from '@/src/components/admin/intelligence/ProjectIntelligenceControl';
import { parseIndianCurrencyPrice, parsePositiveAreaSqft } from '@/src/lib/priceUtils';

function formatCoordinates(lat: number, lng: number): string {
  const latDir = lat >= 0 ? 'N' : 'S';
  const lngDir = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(6)}° ${latDir}, ${Math.abs(lng).toFixed(6)}° ${lngDir}`;
}


export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { id } = params;

  const [project, setProject] = useState<any>(null);
  const [allAmenities, setAllAmenities] = useState<any[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'configs' | 'media' | 'rera' | 'faqs' | 'seo' | 'amenities' | 'intelligence'>('overview');

  // Sub-items forms
  const [savingSub, setSavingSub] = useState(false);
  const [subError, setSubError] = useState<string | null>(null);
  const [deletingConfigId, setDeletingConfigId] = useState<string | null>(null);

  // Floor Plan viewer modal states
  const [isFloorPlanViewerOpen, setIsFloorPlanViewerOpen] = useState(false);
  const [viewerConfigId, setViewerConfigId] = useState<string | null>(null);

  // Edit Configuration modal states
  const [editingConfig, setEditingConfig] = useState<any | null>(null);
  const [editConfigName, setEditConfigName] = useState('');
  const [editConfigBhk, setEditConfigBhk] = useState('');
  const [editConfigPrice, setEditConfigPrice] = useState('');
  const [editConfigPriceOnRequest, setEditConfigPriceOnRequest] = useState(false);
  const [editConfigPriceBasis, setEditConfigPriceBasis] = useState('CARPET_AREA');
  const [editConfigCarpet, setEditConfigCarpet] = useState('');
  const [editConfigBuiltUp, setEditConfigBuiltUp] = useState('');
  const [editConfigSuperBuiltUp, setEditConfigSuperBuiltUp] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editFieldErrors, setEditFieldErrors] = useState<Record<string, string>>({});

  // New config form states
  const [newConfigName, setNewConfigName] = useState('');
  const [newConfigBhk, setNewConfigBhk] = useState('');
  const [newConfigPrice, setNewConfigBhkPrice] = useState('');
  const [newConfigPriceOnRequest, setNewConfigPriceOnRequest] = useState(false);
  const [newConfigPriceBasis, setNewConfigPriceBasis] = useState('CARPET_AREA');
  const [newConfigCarpet, setNewConfigCarpet] = useState('');
  const [newConfigBuiltUp, setNewConfigBuiltUp] = useState('');
  const [newConfigSuperBuiltUp, setNewConfigSuperBuiltUp] = useState('');
  const [addFieldErrors, setAddFieldErrors] = useState<Record<string, string>>({});

  // New FAQ states
  const [newFaqQuestion, setNewFaqQuestion] = useState('');
  const [newFaqAnswer, setNewFaqAnswer] = useState('');
  const [newFaqSortOrder, setNewFaqSortOrder] = useState('0');
  const [newFaqIsPublished, setNewFaqIsPublished] = useState(true);

  // Edit FAQ states
  const [editingFaq, setEditingFaq] = useState<any | null>(null);
  const [editFaqQuestion, setEditFaqQuestion] = useState('');
  const [editFaqAnswer, setEditFaqAnswer] = useState('');
  const [editFaqSortOrder, setEditFaqSortOrder] = useState('0');
  const [editFaqIsPublished, setEditFaqIsPublished] = useState(true);
  const [isSavingEditFaq, setIsSavingEditFaq] = useState(false);
  const [editFaqError, setEditFaqError] = useState<string | null>(null);

  // Delete FAQ state
  const [deletingFaqItem, setDeletingFaqItem] = useState<any | null>(null);
  const [isDeletingFaq, setIsDeletingFaq] = useState(false);

  // New Media states
  const [newMediaUrl, setNewMediaUrl] = useState('');
  const [newMediaCategory, setNewMediaCategory] = useState('EXTERIOR');
  const [newMediaAlt, setNewMediaAlt] = useState('');
  const [newMediaCaption, setNewMediaCaption] = useState('');
  const [newMediaSortOrder, setNewMediaSortOrder] = useState('0');
  const [newMediaFeatured, setNewMediaFeatured] = useState(false);

  // Walkthrough Video management states
  const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);
  const [videoFormUrl, setVideoFormUrl] = useState('');
  const [videoFormTitle, setVideoFormTitle] = useState('Project Walkthrough');
  const [videoFormCaption, setVideoFormCaption] = useState('');
  const [isEditingVideo, setIsEditingVideo] = useState(false);
  const [editingVideoId, setEditingVideoId] = useState<string | null>(null);
  const [isSavingVideo, setIsSavingVideo] = useState(false);
  const [videoFormError, setVideoFormError] = useState<string | null>(null);
  const [isVideoDeleteDialogOpen, setIsVideoDeleteDialogOpen] = useState(false);
  const [isDeletingVideo, setIsDeletingVideo] = useState(false);

  // Live preview verification & failure handling states
  const [previewStatus, setPreviewStatus] = useState<'idle' | 'id_extracted' | 'loading' | 'ready' | 'error'>('idle');
  const [previewErrorMessage, setPreviewErrorMessage] = useState<string | null>(null);
  const [previewRetryKey, setPreviewRetryKey] = useState(0);

  // New Amenity state
  const [selectedAmenityId, setSelectedAmenityId] = useState('');
  const [newAmenityIsFeatured, setNewAmenityIsFeatured] = useState(false);

  // RERA management states
  const [reraStatus, setReraStatus] = useState('NOT_PROVIDED');
  const [reraRegistrationNumber, setReraRegistrationNumber] = useState('');
  const [reraAuthority, setReraAuthority] = useState('WBRERA');
  const [reraInternalNotes, setReraInternalNotes] = useState('');

  // SEO states
  const [seoTitle, setSeoTitle] = useState('');
  const [seoDescription, setSeoDescription] = useState('');
  const [seoCanonicalUrl, setSeoCanonicalUrl] = useState('');

  // Confirmation dialogs
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogAction, setDialogAction] = useState<'publish' | 'archive' | null>(null);
  const [dialogLoading, setDialogLoading] = useState(false);

  const fetchProjectData = async (silent = false) => {
    try {
      if (!silent) {
        setLoading(true);
      }
      setError(null);
      
      const res = await fetch(`/api/projects/${id}`, {
        headers: getAdminHeaders(),
        cache: 'no-store',
      });
      if (!res.ok) {
        throw new Error(`Failed to load project with ID: ${id}`);
      }
      const data = await res.json();
      setProject(data);

      // Pre-fill RERA state
      setReraStatus(data.rera?.status || 'NOT_PROVIDED');
      setReraRegistrationNumber(data.rera?.registrationNumber || '');
      setReraAuthority(data.rera?.authority || 'WBRERA');

      // Fetch all canonical master amenities for attachment dropdown
      try {
        const amenRes = await fetch('/api/admin/amenities', { headers: getAdminHeaders() });
        if (amenRes.ok) {
          const amenJson = await amenRes.json();
          setAllAmenities(amenJson.data || []);
        }
      } catch (aErr) {
        console.warn('Failed to load master amenities list:', aErr);
      }

      // Fetch existing SEO details
      const seoRes = await fetch(`/api/projects/${id}/seo`, { headers: getAdminHeaders() });
      if (seoRes.ok) {
        const seoData = await seoRes.json();
        setSeoTitle(seoData.metaTitle || '');
        setSeoDescription(seoData.metaDescription || '');
        setSeoCanonicalUrl(seoData.canonicalUrl || '');
      }
    } catch (err: any) {
      setError(err.message || 'Error loading project detail');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjectData();
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const tabParam = urlParams.get('tab');
      if (
        tabParam &&
        ['overview', 'configs', 'media', 'rera', 'faqs', 'seo', 'amenities', 'intelligence'].includes(tabParam)
      ) {
        setActiveTab(tabParam as any);
      }
    }
  }, [id]);

  const handleLifecycleAction = async () => {
    if (!dialogAction) return;
    try {
      setDialogLoading(true);
      setSubError(null);

      if (dialogAction === 'publish') {
        const res = await fetch(`/api/projects/${id}/publish`, {
          method: 'POST',
          headers: getAdminHeaders(),
        });
        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || 'Failed to publish project');
        }
      } else if (dialogAction === 'archive') {
        const res = await fetch(`/api/projects/${id}`, {
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
      fetchProjectData();
    } catch (err: any) {
      setSubError(err.message || 'Action failed.');
    } finally {
      setDialogLoading(false);
    }
  };

  // Add configuration submit
  const handleAddConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSub(true);
    setSubError(null);
    setAddFieldErrors({});

    try {
      const fieldErrs: Record<string, string> = {};
      if (!newConfigName.trim()) {
        fieldErrs.name = 'Configuration name is required.';
      }

      let parsedPrice: number | null = null;
      if (newConfigPrice.trim() !== '') {
        parsedPrice = parseIndianCurrencyPrice(newConfigPrice);
        if (parsedPrice === null) {
          fieldErrs.price = 'Please enter a valid price (e.g. 8500000 or 85,00,000).';
        }
      } else if (newConfigPriceOnRequest) {
        parsedPrice = 0;
      } else {
        fieldErrs.price = 'Please enter a valid price (e.g. 8500000 or 85,00,000) or enable Price on Request.';
      }

      const carpetVal = parsePositiveAreaSqft(newConfigCarpet);
      if (carpetVal === null) {
        fieldErrs.carpetArea = 'Carpet Area is mandatory and must be greater than 0.';
      }

      let builtUpVal: number | null = null;
      if (newConfigBuiltUp.trim() !== '') {
        builtUpVal = parsePositiveAreaSqft(newConfigBuiltUp);
        if (builtUpVal === null) {
          fieldErrs.builtUpArea = 'Built-up Area must be a valid number greater than 0.';
        }
      } else if (newConfigPriceBasis === 'BUILT_UP_AREA') {
        fieldErrs.builtUpArea = 'Built-up Area is required when price basis is set to Built-up Area.';
      }

      let superBuiltUpVal: number | null = null;
      if (newConfigSuperBuiltUp.trim() !== '') {
        superBuiltUpVal = parsePositiveAreaSqft(newConfigSuperBuiltUp);
        if (superBuiltUpVal === null) {
          fieldErrs.superBuiltUpArea = 'Super Built-up Area must be a valid number greater than 0.';
        }
      } else if (newConfigPriceBasis === 'SUPER_BUILT_UP_AREA') {
        fieldErrs.superBuiltUpArea = 'Super Built-up Area is required when price basis is set to Super Built-up Area.';
      }

      let bhkVal: number | null = null;
      if (newConfigBhk.trim() !== '') {
        const parsedBhk = Number(newConfigBhk.trim());
        if (!Number.isInteger(parsedBhk) || parsedBhk < 0) {
          fieldErrs.bedroomCount = 'Bedroom count must be a non-negative whole number.';
        } else {
          bhkVal = parsedBhk;
        }
      }

      if (Object.keys(fieldErrs).length > 0) {
        setAddFieldErrors(fieldErrs);
        throw new Error(Object.values(fieldErrs)[0]);
      }

      const body = {
        name: newConfigName.trim(),
        bedroomCount: bhkVal,
        price: parsedPrice,
        priceOnRequest: newConfigPriceOnRequest,
        priceBasis: newConfigPriceBasis,
        carpetArea: carpetVal,
        builtUpArea: builtUpVal,
        superBuiltUpArea: superBuiltUpVal,
      };

      const res = await fetch(`/api/projects/${id}/configurations`, {
        method: 'POST',
        headers: {
          ...getAdminHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to add typology.');
      }

      // Reset form & reload
      setNewConfigName('');
      setNewConfigBhk('');
      setNewConfigBhkPrice('');
      setNewConfigPriceOnRequest(false);
      setNewConfigCarpet('');
      setNewConfigBuiltUp('');
      setNewConfigSuperBuiltUp('');
      setAddFieldErrors({});
      await fetchProjectData(true);
    } catch (err: any) {
      setSubError(err.message || 'Failed to add typology.');
    } finally {
      setSavingSub(false);
    }
  };

  // Open edit configuration modal
  const handleOpenEditConfig = (config: any) => {
    setEditingConfig(config);
    setEditConfigName(config.name || '');
    setEditConfigBhk(config.bedroomCount != null ? config.bedroomCount.toString() : '');
    setEditConfigPrice(config.price != null && config.price > 0 ? config.price.toString() : '');
    setEditConfigPriceOnRequest(Boolean(config.priceOnRequest));
    setEditConfigPriceBasis(config.priceBasis || 'CARPET_AREA');
    setEditConfigCarpet(config.carpetArea != null ? config.carpetArea.toString() : '');
    setEditConfigBuiltUp(config.builtUpArea != null ? config.builtUpArea.toString() : '');
    setEditConfigSuperBuiltUp(config.superBuiltUpArea != null ? config.superBuiltUpArea.toString() : '');
    setEditError(null);
    setEditFieldErrors({});
  };

  // Submit edit configuration
  const handleUpdateConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingConfig) return;

    setIsSavingEdit(true);
    setEditError(null);
    setEditFieldErrors({});

    try {
      const fieldErrs: Record<string, string> = {};
      if (!editConfigName.trim()) {
        fieldErrs.name = 'Configuration name is required.';
      }

      let parsedPrice: number | undefined = undefined;
      if (editConfigPrice.trim() !== '') {
        const p = parseIndianCurrencyPrice(editConfigPrice);
        if (p === null) {
          fieldErrs.price = 'Please enter a valid price (e.g. 8500000 or 85,00,000).';
        } else {
          parsedPrice = p;
        }
      } else if (!editConfigPriceOnRequest) {
        fieldErrs.price = 'A valid positive price is required when Price on Request is disabled.';
      }

      const carpetVal = parsePositiveAreaSqft(editConfigCarpet);
      if (carpetVal === null) {
        fieldErrs.carpetArea = 'Carpet Area is mandatory and must be greater than 0.';
      }

      let builtUpVal: number | null = null;
      if (editConfigBuiltUp.trim() !== '') {
        builtUpVal = parsePositiveAreaSqft(editConfigBuiltUp);
        if (builtUpVal === null) {
          fieldErrs.builtUpArea = 'Built-up Area must be a valid number greater than 0.';
        }
      } else if (editConfigPriceBasis === 'BUILT_UP_AREA') {
        fieldErrs.builtUpArea = 'Built-up Area is required when price basis is set to Built-up Area.';
      }

      let superBuiltUpVal: number | null = null;
      if (editConfigSuperBuiltUp.trim() !== '') {
        superBuiltUpVal = parsePositiveAreaSqft(editConfigSuperBuiltUp);
        if (superBuiltUpVal === null) {
          fieldErrs.superBuiltUpArea = 'Super Built-up Area must be a valid number greater than 0.';
        }
      } else if (editConfigPriceBasis === 'SUPER_BUILT_UP_AREA') {
        fieldErrs.superBuiltUpArea = 'Super Built-up Area is required when price basis is set to Super Built-up Area.';
      }

      let bhkVal: number | null = null;
      if (editConfigBhk.trim() !== '') {
        const parsedBhk = Number(editConfigBhk.trim());
        if (!Number.isInteger(parsedBhk) || parsedBhk < 0) {
          fieldErrs.bedroomCount = 'Bedroom count must be a non-negative whole number.';
        } else {
          bhkVal = parsedBhk;
        }
      }

      if (Object.keys(fieldErrs).length > 0) {
        setEditFieldErrors(fieldErrs);
        throw new Error(Object.values(fieldErrs)[0]);
      }

      const body: Record<string, any> = {
        name: editConfigName.trim(),
        bedroomCount: bhkVal,
        priceOnRequest: editConfigPriceOnRequest,
        priceBasis: editConfigPriceBasis,
        carpetArea: carpetVal,
        builtUpArea: builtUpVal,
        superBuiltUpArea: superBuiltUpVal,
      };
      if (parsedPrice !== undefined) {
        body.price = parsedPrice;
      }

      const res = await fetch(`/api/projects/${id}/configurations/${editingConfig.id}`, {
        method: 'PATCH',
        headers: {
          ...getAdminHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Failed to update configuration.');
      }

      // Immediately update local project state so changes reflect without delay
      setProject((prev: any) => {
        if (!prev || !Array.isArray(prev.configurations)) return prev;
        return {
          ...prev,
          configurations: prev.configurations.map((c: any) =>
            c.id === editingConfig.id
              ? {
                  ...c,
                  ...data,
                  floorPlans: c.floorPlans || [],
                }
              : c
          ),
        };
      });

      setEditingConfig(null);
      setEditFieldErrors({});
      await fetchProjectData(true);
    } catch (err: any) {
      setEditError(err.message || 'Failed to update configuration.');
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Delete configuration
  const handleDeleteConfig = async (configId: string) => {
    if (!confirm('Are you sure you want to delete this typology?')) return;
    try {
      setDeletingConfigId(configId);
      const res = await fetch(`/api/projects/${id}/configurations/${configId}`, {
        method: 'DELETE',
        headers: getAdminHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete configuration');
      }
      await fetchProjectData(true);
    } catch (err: any) {
      alert(err.message || 'Failed to delete configuration');
    } finally {
      setDeletingConfigId(null);
    }
  };

  const handleDeleteFaq = async (faqId: string) => {
    if (!confirm('Are you sure you want to delete this FAQ?')) return;
    try {
      const res = await fetch(`/api/projects/${id}/faqs/${faqId}`, {
        method: 'DELETE',
        headers: getAdminHeaders(),
      });
      if (!res.ok) throw new Error('Failed to delete FAQ');
      fetchProjectData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Add FAQ submit
  const handleAddFaq = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSub(true);
    setSubError(null);

    try {
      const res = await fetch(`/api/projects/${id}/faqs`, {
        method: 'POST',
        headers: {
          ...getAdminHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          question: newFaqQuestion.trim(),
          answer: newFaqAnswer.trim(),
          sortOrder: parseInt(newFaqSortOrder, 10) || 0,
          isPublished: newFaqIsPublished,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to add FAQ.');
      }

      setNewFaqQuestion('');
      setNewFaqAnswer('');
      setNewFaqSortOrder('0');
      setNewFaqIsPublished(true);
      fetchProjectData();
    } catch (err: any) {
      setSubError(err.message);
    } finally {
      setSavingSub(false);
    }
  };

  // Open Edit FAQ
  const handleOpenEditFaq = (faq: any) => {
    setEditingFaq(faq);
    setEditFaqQuestion(faq.question);
    setEditFaqAnswer(faq.answer);
    setEditFaqSortOrder(faq.sortOrder?.toString() || '0');
    setEditFaqIsPublished(faq.isPublished !== false);
    setEditFaqError(null);
  };

  // Save Edit FAQ
  const handleSaveEditFaq = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingFaq) return;
    setIsSavingEditFaq(true);
    setEditFaqError(null);

    try {
      const res = await fetch(`/api/projects/${id}/faqs/${editingFaq.id}`, {
        method: 'PATCH',
        headers: {
          ...getAdminHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          question: editFaqQuestion.trim(),
          answer: editFaqAnswer.trim(),
          sortOrder: parseInt(editFaqSortOrder, 10) || 0,
          isPublished: editFaqIsPublished,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to update FAQ.');
      }

      setEditingFaq(null);
      fetchProjectData();
    } catch (err: any) {
      setEditFaqError(err.message);
    } finally {
      setIsSavingEditFaq(false);
    }
  };

  // Delete FAQ
  const handleConfirmDeleteFaq = async () => {
    if (!deletingFaqItem) return;
    setIsDeletingFaq(true);
    try {
      const res = await fetch(`/api/projects/${id}/faqs/${deletingFaqItem.id}`, {
        method: 'DELETE',
        headers: getAdminHeaders(),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to delete FAQ');
      }
      setDeletingFaqItem(null);
      fetchProjectData();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsDeletingFaq(false);
    }
  };

  // Add media submit
  const handleAddMedia = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSub(true);
    setSubError(null);

    try {
      const res = await fetch(`/api/projects/${id}/media`, {
        method: 'POST',
        headers: {
          ...getAdminHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: newMediaUrl,
          category: newMediaCategory,
          altText: newMediaAlt || null,
          caption: newMediaCaption || null,
          sortOrder: parseInt(newMediaSortOrder, 10) || 0,
          isFeatured: newMediaFeatured,
          mediaType: 'IMAGE',
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to upload/link media.');
      }

      setNewMediaUrl('');
      setNewMediaAlt('');
      setNewMediaCaption('');
      setNewMediaSortOrder('0');
      setNewMediaFeatured(false);
      fetchProjectData();
    } catch (err: any) {
      setSubError(err.message);
    } finally {
      setSavingSub(false);
    }
  };

  // Delete media
  const handleDeleteMedia = async (mediaId: string) => {
    if (!confirm('Are you sure you want to remove this media?')) return;
    try {
      const res = await fetch(`/api/projects/${id}/media/${mediaId}`, {
        method: 'DELETE',
        headers: getAdminHeaders(),
      });
      if (!res.ok) throw new Error('Failed to delete media');
      fetchProjectData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Walkthrough video resolution and management
  const walkthroughVideo = project?.media?.find((m: any) =>
    m.category === 'WALKTHROUGH' || m.mediaType === 'VIDEO'
  ) || null;

  const parsedExistingVideo = parseVideoUrl(walkthroughVideo?.url);
  const parsedFormVideo = parseVideoUrl(videoFormUrl);

  const openAddVideoModal = () => {
    setVideoFormUrl('');
    setVideoFormTitle(`${project?.name || 'Project'} Walkthrough`);
    setVideoFormCaption('');
    setIsEditingVideo(false);
    setEditingVideoId(null);
    setVideoFormError(null);
    setPreviewStatus('idle');
    setPreviewErrorMessage(null);
    setPreviewRetryKey((k) => k + 1);
    setIsVideoModalOpen(true);
  };

  const openEditVideoModal = (existingMedia: any) => {
    setVideoFormUrl(existingMedia.url || '');
    setVideoFormTitle(existingMedia.altText || `${project?.name || 'Project'} Walkthrough`);
    setVideoFormCaption(existingMedia.caption || '');
    setIsEditingVideo(true);
    setEditingVideoId(existingMedia.id);
    setVideoFormError(null);
    const parsed = parseVideoUrl(existingMedia.url);
    setPreviewStatus(parsed.isValid ? 'id_extracted' : 'idle');
    setPreviewErrorMessage(null);
    setPreviewRetryKey((k) => k + 1);
    setIsVideoModalOpen(true);
  };

  // Sync videoFormUrl with preview verification states
  useEffect(() => {
    if (!isVideoModalOpen) return;
    const parsed = parseVideoUrl(videoFormUrl);
    if (!parsed.isValid) {
      setPreviewStatus('idle');
      setPreviewErrorMessage(null);
    } else {
      setPreviewStatus('id_extracted');
      setPreviewErrorMessage(null);
    }
  }, [videoFormUrl, isVideoModalOpen, previewRetryKey]);

  // YouTube postMessage event listener to catch Error 153, 150, 100, 101 or ready states
  useEffect(() => {
    if (!isVideoModalOpen) return;

    const handleMessage = (event: MessageEvent) => {
      if (!event.origin.includes('youtube.com') && !event.origin.includes('youtube-nocookie.com')) {
        return;
      }
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (!data) return;

        if (data.event === 'onError') {
          const code = Number(data.info ?? data.data);
          let msg = 'YouTube embed restricted. The video owner may have disabled playback in embedded players.';
          if (code === 153 || code === 150 || code === 101) {
            msg = `YouTube Error ${code}: Playback in embedded players has been restricted by the owner.`;
          } else if (code === 100) {
            msg = 'YouTube video not found, private, or has been removed.';
          } else if (code === 2) {
            msg = 'Invalid YouTube video ID or configuration parameter.';
          }
          setPreviewStatus('error');
          setPreviewErrorMessage(msg);
        } else if (data.event === 'onReady' || data.event === 'initialDelivery') {
          setPreviewStatus((prev) => (prev === 'error' ? 'error' : 'ready'));
        }
      } catch {
        // Ignore non-json messages
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [isVideoModalOpen]);

  const handleSaveVideo = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseVideoUrl(videoFormUrl);
    if (!parsed.isValid) {
      setVideoFormError(parsed.error || 'Please provide a valid YouTube, Vimeo, or hosted MP4 video URL.');
      return;
    }

    if (!videoFormTitle.trim()) {
      setVideoFormError('Video title / accessible label is required.');
      return;
    }

    try {
      setIsSavingVideo(true);
      setVideoFormError(null);

      if (isEditingVideo && editingVideoId) {
        // PATCH existing media record
        const res = await fetch(`/api/projects/${id}/media/${editingVideoId}`, {
          method: 'PATCH',
          headers: {
            ...getAdminHeaders(),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            url: videoFormUrl.trim(),
            altText: videoFormTitle.trim(),
            caption: videoFormCaption.trim() || null,
            mediaType: 'VIDEO',
            category: 'WALKTHROUGH',
          }),
        });

        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || 'Failed to update walkthrough video.');
        }
      } else {
        // POST new media record
        const res = await fetch(`/api/projects/${id}/media`, {
          method: 'POST',
          headers: {
            ...getAdminHeaders(),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            mediaType: 'VIDEO',
            category: 'WALKTHROUGH',
            url: videoFormUrl.trim(),
            altText: videoFormTitle.trim(),
            caption: videoFormCaption.trim() || null,
            sortOrder: 0,
            isFeatured: false,
          }),
        });

        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || 'Failed to save walkthrough video.');
        }
      }

      setIsVideoModalOpen(false);
      await fetchProjectData();
    } catch (err: any) {
      setVideoFormError(err.message || 'An error occurred while saving the video.');
    } finally {
      setIsSavingVideo(false);
    }
  };

  const handleConfirmDeleteVideo = async () => {
    if (!walkthroughVideo?.id) return;
    try {
      setIsDeletingVideo(true);
      const res = await fetch(`/api/projects/${id}/media/${walkthroughVideo.id}`, {
        method: 'DELETE',
        headers: getAdminHeaders(),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to delete walkthrough video.');
      }
      setIsVideoDeleteDialogOpen(false);
      await fetchProjectData();
    } catch (err: any) {
      alert(err.message || 'Failed to delete walkthrough video.');
    } finally {
      setIsDeletingVideo(false);
    }
  };

  // Update RERA
  const handleUpdateRera = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSub(true);
    setSubError(null);

    try {
      const res = await fetch(`/api/projects/${id}/rera`, {
        method: 'POST',
        headers: {
          ...getAdminHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: reraStatus,
          registrationNumber: reraRegistrationNumber,
          authority: reraAuthority,
          internalNotes: reraInternalNotes || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update RERA metadata.');
      }

      alert('RERA records updated successfully.');
      fetchProjectData();
    } catch (err: any) {
      setSubError(err.message);
    } finally {
      setSavingSub(false);
    }
  };

  // Update SEO
  const handleUpdateSeo = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSub(true);
    setSubError(null);

    try {
      const res = await fetch(`/api/projects/${id}/seo`, {
        method: 'POST',
        headers: {
          ...getAdminHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          metaTitle: seoTitle,
          metaDescription: seoDescription,
          canonicalUrl: seoCanonicalUrl,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update SEO tags.');
      }

      alert('SEO metadata tags saved successfully.');
      fetchProjectData();
    } catch (err: any) {
      setSubError(err.message);
    } finally {
      setSavingSub(false);
    }
  };

  // Toggle Amenity Featured Status
  const handleToggleFeaturedAmenity = async (amenityId: string, currentIsFeatured: boolean) => {
    try {
      setSavingSub(true);
      const res = await fetch(`/api/projects/${id}/amenities`, {
        method: 'POST',
        headers: {
          ...getAdminHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amenityId,
          isFeatured: !currentIsFeatured,
          sortOrder: 0,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update feature status');
      }

      fetchProjectData();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSavingSub(false);
    }
  };

  // Attach Amenity
  const handleAttachAmenity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAmenityId) return;
    setSavingSub(true);
    setSubError(null);

    try {
      const res = await fetch(`/api/projects/${id}/amenities`, {
        method: 'POST',
        headers: {
          ...getAdminHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amenityId: selectedAmenityId,
          isFeatured: newAmenityIsFeatured,
          sortOrder: 0,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to attach amenity');
      }

      setSelectedAmenityId('');
      setNewAmenityIsFeatured(false);
      fetchProjectData();
    } catch (err: any) {
      setSubError(err.message);
    } finally {
      setSavingSub(false);
    }
  };

  // Remove Amenity
  const handleRemoveAmenity = async (amenityId: string) => {
    try {
      const res = await fetch(`/api/projects/${id}/amenities?amenityId=${amenityId}`, {
        method: 'DELETE',
        headers: getAdminHeaders(),
      });
      if (!res.ok) throw new Error('Failed to dissociate amenity');
      fetchProjectData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  if (loading) return <AdminLoadingState skeletonType="detail" />;
  if (error) return <AdminErrorState title="Failed to load project record" error={error} onRetry={fetchProjectData} />;

  const isPublished = project.lifecycleStatus === 'PUBLISHED';
  const isArchived = project.lifecycleStatus === 'ARCHIVED';

  return (
    <div className="space-y-6 pb-20 font-body">
      <AdminPageHeader
        title={project.name}
        description={`Manage typology levels, verified RERA states, galleries, FAQs, and SEO tags.`}
        breadcrumbs={[
          { label: 'Projects', href: '/admin/projects' },
          { label: project.name },
        ]}
        primaryAction={{
          label: 'Edit Details',
          onClick: () => router.push(`/admin/projects/${id}/edit`),
          icon: <Edit3 className="h-4 w-4" />,
        }}
        secondaryActions={[
          {
            label: 'Back to Catalog',
            onClick: () => router.push('/admin/projects'),
            icon: <ArrowLeft className="h-4 w-4" />,
          },
          ...(isPublished
            ? [
                {
                  label: 'View Live Portal',
                  onClick: () => window.open(`/projects/${project.slug}`, '_blank'),
                  icon: <Globe className="h-4 w-4" />,
                },
              ]
            : []),
        ]}
      />

      <div className="px-6 grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left Column: Fast Overview Sidebar */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white border border-neutral-200/80 rounded-xl p-5 space-y-4 shadow-2xs">
            <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-wider font-display">System State</h3>
            <div className="flex flex-col gap-2">
              <div className="flex justify-between items-center py-1.5 border-b border-neutral-100">
                <span className="text-xs font-medium text-neutral-500">Lifecycle</span>
                <AdminBadge variant={project.lifecycleStatus} />
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-neutral-100">
                <span className="text-xs font-medium text-neutral-500">Stage</span>
                <span className="text-xs uppercase font-mono bg-neutral-100 px-2 py-0.5 rounded text-neutral-700">
                  {project.status?.replace('_', ' ')}
                </span>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-neutral-100">
                <span className="text-xs font-medium text-neutral-500">Property</span>
                <span className="text-xs uppercase font-mono text-neutral-700">{project.propertyType}</span>
              </div>
              <div className="flex justify-between items-center py-1.5">
                <span className="text-xs font-medium text-neutral-500">Public Pricing</span>
                {project.priceOnRequest ? (
                  <span className="text-[10px] font-bold uppercase font-display bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded">
                    Project PoR
                  </span>
                ) : project.pricing?.priceOnRequest ? (
                  <span className="text-[10px] font-bold uppercase font-display bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded">
                    All Configs PoR
                  </span>
                ) : (
                  <span className="text-[10px] font-bold uppercase font-display bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded">
                    Publicly Priced
                  </span>
                )}
              </div>
            </div>

            {/* Lifecycle Transitions */}
            <div className="pt-2 flex flex-col gap-2">
              {!isPublished && (
                <button
                  onClick={() => {
                    setDialogAction('publish');
                    setDialogOpen(true);
                  }}
                  className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors font-display"
                >
                  <CheckCircle className="h-3.5 w-3.5" />
                  Publish Project
                </button>
              )}
              {!isArchived && (
                <button
                  onClick={() => {
                    setDialogAction('archive');
                    setDialogOpen(true);
                  }}
                  className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 border border-rose-200 hover:border-rose-300 rounded-lg transition-colors font-display"
                >
                  <Archive className="h-3.5 w-3.5" />
                  Archive Project
                </button>
              )}
            </div>
          </div>

          {/* Snapshot Summary */}
          <div className="bg-white border border-neutral-200/80 rounded-xl p-5 space-y-3 shadow-2xs">
            <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-wider font-display">Canonical Snapshot</h3>
            <div className="space-y-2 text-xs">
              <p className="flex justify-between"><span className="text-neutral-500">Project Area:</span> <span className="font-semibold text-neutral-800">{project.snapshot?.projectArea ?? project.projectArea ?? '—'}</span></p>
              <p className="flex justify-between"><span className="text-neutral-500">Towers:</span> <span className="font-semibold text-neutral-800">{project.snapshot?.towerCount ?? project.towerCount ?? '—'}</span></p>
              <p className="flex justify-between"><span className="text-neutral-500">Units:</span> <span className="font-semibold text-neutral-800">{project.snapshot?.totalUnits ?? project.totalUnits ?? '—'}</span></p>
              <p className="flex justify-between"><span className="text-neutral-500">Floors:</span> <span className="font-semibold text-neutral-800">{project.snapshot?.floors ?? project.floors ?? '—'}</span></p>
              <p className="flex justify-between"><span className="text-neutral-500">Possession:</span> <span className="font-semibold text-neutral-800">{project.snapshot?.possession ?? project.possession ?? '—'}</span></p>
            </div>
          </div>
        </div>

        {/* Right Column: Tabbed Management Screens */}
        <div className="lg:col-span-3 space-y-6">
          {/* Tab Selection */}
          <div className="flex items-center gap-1 bg-neutral-100 p-1 border border-neutral-200 rounded-xl overflow-x-auto">
            {[
              { key: 'overview', label: 'Overview', icon: <Compass className="h-3.5 w-3.5" /> },
              { key: 'intelligence', label: 'Project Intelligence', icon: <Sparkles className="h-3.5 w-3.5 text-amber-500" /> },
              { key: 'configs', label: 'Typologies', icon: <Layers className="h-3.5 w-3.5" /> },
              { key: 'rera', label: 'RERA Registry', icon: <ShieldCheck className="h-3.5 w-3.5" /> },
              { key: 'media', label: 'Gallery', icon: <ImageIcon className="h-3.5 w-3.5" /> },
              { key: 'amenities', label: 'Amenities', icon: <Sparkles className="h-3.5 w-3.5" /> },
              { key: 'faqs', label: 'FAQs', icon: <HelpCircle className="h-3.5 w-3.5" /> },
              { key: 'seo', label: 'SEO tags', icon: <Settings className="h-3.5 w-3.5" /> },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => {
                  setActiveTab(tab.key as any);
                  setSubError(null);
                }}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold whitespace-nowrap rounded-lg transition-colors font-display ${
                  activeTab === tab.key
                    ? 'bg-white text-neutral-900 shadow-xs'
                    : 'text-neutral-500 hover:text-neutral-800 hover:bg-neutral-50'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>

          {subError && (
            <div className="flex items-start gap-2 p-4 bg-rose-50 border border-rose-200 text-rose-700 text-sm font-medium rounded-lg">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{subError}</span>
            </div>
          )}

          {/* TAB 1: Overview */}
          {activeTab === 'overview' && (
            <div className="bg-white border border-neutral-200/80 rounded-xl p-6 space-y-6 shadow-2xs">
              <div className="space-y-2">
                <h4 className="text-sm font-bold text-neutral-800 uppercase tracking-wider font-display">Storytelling Descriptions</h4>
                <div className="space-y-4">
                  <div>
                    <h5 className="text-xs font-semibold text-neutral-400">Short Pitch</h5>
                    <p className="text-sm text-neutral-800 bg-neutral-50 p-3 rounded-lg border border-neutral-100">{project.shortDescription || 'No short description provided.'}</p>
                  </div>
                  <div>
                    <h5 className="text-xs font-semibold text-neutral-400">Full Copy (HTML Sanity Safe)</h5>
                    <p className="text-sm text-neutral-800 bg-neutral-50 p-4 rounded-lg border border-neutral-100 whitespace-pre-wrap">{project.description || 'No long description provided.'}</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-neutral-100 pt-6">
                <div>
                  <h5 className="text-xs font-semibold text-neutral-400">Developer Relationship</h5>
                  <p className="text-sm font-bold text-neutral-800 font-display">{project.developer?.name || 'Unassigned'}</p>
                  <p className="text-xs text-neutral-500 font-mono">ID: {project.developer?.id || '—'}</p>
                </div>
                <div>
                  <h5 className="text-xs font-semibold text-neutral-400">Canonical Location Master</h5>
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className="text-sm font-bold text-neutral-800 font-display">
                      {project.location ? `${project.location.name} (${project.location.type})` : 'Unassigned'}
                    </p>
                    {project.location?.id && (
                      <Link
                        href={`/admin/locations/${project.location.id}`}
                        className="text-xs text-indigo-600 hover:text-indigo-800 font-bold font-display inline-flex items-center gap-1"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    )}
                  </div>
                  <p className="text-xs text-neutral-500 font-mono">ID: {project.location?.id || '—'}</p>
                </div>
              </div>

              {/* CANONICAL LOCATION COORDINATES & MAP PREVIEW */}
              {(() => {
                const resolved = resolveProjectCoordinates(project, project.location);

                return (
                  <div className="border-t border-neutral-100 pt-6 space-y-4">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-indigo-600" />
                        <h5 className="text-xs font-bold text-neutral-800 uppercase tracking-wider font-display">
                          Project Location Pin &amp; Coordinates Preview
                        </h5>
                      </div>
                      <div className="flex items-center gap-2">
                        {resolved.source === 'PROJECT' && (
                          <span className="text-[10px] font-bold text-indigo-800 bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 rounded-full uppercase font-mono">
                            Project Override Pin
                          </span>
                        )}
                        {resolved.source === 'LOCATION' && (
                          <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full uppercase font-mono">
                            Location Master Default
                          </span>
                        )}
                        <Link
                          href={`/admin/projects/${project.id}/edit`}
                          className="text-xs font-bold text-indigo-600 hover:text-indigo-800 font-display flex items-center gap-1 transition-colors"
                        >
                          <Edit3 className="h-3 w-3" />
                          Edit Pin / Form
                        </Link>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Left Column: Coordinates breakdown */}
                      <div className="space-y-3">
                        {resolved.hasValidCoordinates && resolved.latitude !== null && resolved.longitude !== null ? (
                          <div className="bg-neutral-50 border border-neutral-200/90 rounded-xl p-4 space-y-3">
                            <div className="grid grid-cols-2 gap-3 text-xs">
                              <div>
                                <span className="text-neutral-500 block font-medium">Active Latitude</span>
                                <span className="font-mono font-bold text-neutral-900 text-sm">
                                  {resolved.latitude.toFixed(6)}
                                </span>
                              </div>
                              <div>
                                <span className="text-neutral-500 block font-medium">Active Longitude</span>
                                <span className="font-mono font-bold text-neutral-900 text-sm">
                                  {resolved.longitude.toFixed(6)}
                                </span>
                              </div>
                            </div>
                            <div className="pt-2 border-t border-neutral-200/70 flex items-center justify-between text-xs">
                              <span className="font-mono text-neutral-600">
                                {formatCoordinates(resolved.latitude, resolved.longitude)}
                              </span>
                              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 uppercase font-mono">
                                {resolved.source === 'PROJECT' ? 'Verified Project GIS' : 'Verified Location Master'}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="bg-amber-50 border border-amber-200/90 rounded-xl p-4 space-y-2">
                            <div className="flex items-start gap-2.5 text-xs">
                              <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                              <div>
                                <p className="font-bold text-amber-900">Coordinates Missing</p>
                                <p className="text-amber-800 mt-0.5 leading-relaxed">
                                  Neither a project pin override nor Location Master coordinates are set.
                                </p>
                              </div>
                            </div>
                            <div className="pt-2">
                              <Link
                                href={`/admin/projects/${project.id}/edit`}
                                className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-950 bg-amber-200/80 hover:bg-amber-300 px-3 py-1.5 rounded-lg transition-colors font-display"
                              >
                                <Edit3 className="h-3.5 w-3.5" />
                                Add Project Pin in Form
                              </Link>
                            </div>
                          </div>
                        )}

                        {project.location?.path && (
                          <div className="text-xs text-neutral-600 bg-white border border-neutral-200/80 rounded-lg p-3 space-y-1">
                            <span className="text-[11px] font-semibold text-neutral-400 block uppercase font-display">Hierarchy Breadcrumb</span>
                            <span className="font-mono text-neutral-800 font-semibold">
                              {Array.isArray(project.location.path)
                                ? project.location.path.map((node: any) => typeof node === 'object' ? node.name : String(node)).join(' > ')
                                : String(project.location.path)}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Right Column: Read-Only CARTO Map Preview */}
                      <div>
                        {resolved.hasValidCoordinates && resolved.latitude !== null && resolved.longitude !== null ? (
                          <div className="rounded-xl overflow-hidden border border-neutral-200 shadow-2xs h-64 bg-neutral-100">
                            <ProjectLocationMap
                              coordinates={{
                                latitude: resolved.latitude,
                                longitude: resolved.longitude,
                              }}
                              projectName={project.name}
                              locationName={project.location?.name || project.name}
                              className="h-full w-full"
                            />
                          </div>
                        ) : (
                          <div className="h-64 rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-6 flex flex-col items-center justify-center text-center space-y-2">
                            <MapPin className="h-8 w-8 text-neutral-300" />
                            <p className="text-xs font-bold text-neutral-700 font-display">Map Preview Unavailable</p>
                            <p className="text-xs text-neutral-500 max-w-xs leading-relaxed">
                              Assign geographic coordinates to enable spatial map preview.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* TAB: Project Intelligence */}
          {activeTab === 'intelligence' && (
            <ProjectIntelligenceControl
              projectId={id as string}
              project={project}
              onRefresh={fetchProjectData}
            />
          )}

          {/* TAB 2: Configurations / Typologies */}
          {activeTab === 'configs' && (
            <div className="space-y-8">
              {/* Attached Typologies Card */}
              <div className="bg-white border border-neutral-200/80 rounded-xl p-6 space-y-5 shadow-2xs">
                <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
                  <div>
                    <h4 className="text-sm font-bold text-neutral-800 uppercase tracking-wider font-display">Attached Typologies & Configurations</h4>
                    <p className="text-xs text-neutral-500 mt-0.5 font-sans">Manage floor plan layouts, area specifications, and pricing basis for this project.</p>
                  </div>
                  <span className="text-xs font-bold px-2.5 py-1 bg-neutral-100 text-neutral-700 rounded-full font-mono border border-neutral-200">
                    {project.configurations?.length || 0} Total
                  </span>
                </div>

                {project.configurations?.length === 0 ? (
                  <p className="text-sm text-neutral-500 py-6 text-center bg-neutral-50 rounded-lg border border-dashed border-neutral-200">
                    No typologies attached yet. Published projects require at least one typography configuration.
                  </p>
                ) : (
                  <>
                    {/* Desktop Table View */}
                    <div className="hidden md:block overflow-x-auto">
                      <table className="w-full text-left text-sm border-collapse table-fixed">
                        <thead>
                          <tr className="border-b border-neutral-200/80 text-[11px] font-bold text-neutral-400 uppercase tracking-wider font-display bg-neutral-50/60">
                            <th className="py-3.5 px-3 w-[16%] font-bold text-neutral-500 tracking-wider">Name</th>
                            <th className="py-3.5 px-2 w-[7%] text-center font-bold text-neutral-500 tracking-wider">BHK</th>
                            <th className="py-3.5 px-3 w-[18%] font-bold text-neutral-500 tracking-wider">Areas</th>
                            <th className="py-3.5 px-3 w-[11%] font-bold text-neutral-500 tracking-wider">Price Basis</th>
                            <th className="py-3.5 px-3 w-[12%] font-bold text-neutral-500 tracking-wider">Price</th>
                            <th className="py-3.5 px-3 w-[11%] font-bold text-neutral-500 tracking-wider">Effective Rate</th>
                            <th className="py-3.5 px-3 w-[16%] font-bold text-neutral-500 tracking-wider">Floor Plans</th>
                            <th className="py-3.5 px-2 w-[9%] text-right font-bold text-neutral-500 tracking-wider">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-100">
                          {project.configurations.map((config: any) => (
                            <tr key={config.id} className="hover:bg-neutral-50/40 transition-colors align-top border-b border-neutral-100/50">
                              <td className="py-4 px-3 w-[16%] min-w-0">
                                <span className="font-bold text-neutral-900 font-display text-sm block leading-snug break-words">{config.name}</span>
                              </td>
                              <td className="py-4 px-2 w-[7%] text-center">
                                <span className="inline-flex items-center justify-center px-2 py-0.5 text-xs font-bold text-neutral-700 bg-neutral-100 rounded-md border border-neutral-200/80 font-display">
                                  {config.bedroomCount ? `${config.bedroomCount} BHK` : '—'}
                                </span>
                              </td>
                              <td className="py-4 px-3 w-[18%] min-w-0">
                                <div className="space-y-1 text-xs font-sans">
                                  {config.carpetArea ? (
                                    <div className="flex items-center gap-2">
                                      <span className="w-11 text-[11px] font-medium text-neutral-400 uppercase tracking-wider shrink-0">Carpet</span>
                                      <span className="font-semibold text-neutral-800 font-mono">{config.carpetArea.toLocaleString('en-IN')} <span className="text-[10px] text-neutral-500 font-normal">sq.ft.</span></span>
                                    </div>
                                  ) : null}
                                  {config.builtUpArea ? (
                                    <div className="flex items-center gap-2">
                                      <span className="w-11 text-[11px] font-medium text-neutral-400 uppercase tracking-wider shrink-0">Built</span>
                                      <span className="font-semibold text-neutral-800 font-mono">{config.builtUpArea.toLocaleString('en-IN')} <span className="text-[10px] text-neutral-500 font-normal">sq.ft.</span></span>
                                    </div>
                                  ) : null}
                                  {config.superBuiltUpArea ? (
                                    <div className="flex items-center gap-2">
                                      <span className="w-11 text-[11px] font-medium text-neutral-400 uppercase tracking-wider shrink-0">Super</span>
                                      <span className="font-semibold text-neutral-800 font-mono">{config.superBuiltUpArea.toLocaleString('en-IN')} <span className="text-[10px] text-neutral-500 font-normal">sq.ft.</span></span>
                                    </div>
                                  ) : null}
                                  {!config.carpetArea && !config.builtUpArea && !config.superBuiltUpArea && (
                                    <span className="text-neutral-400 font-mono">—</span>
                                  )}
                                </div>
                              </td>
                              <td className="py-4 px-3 w-[11%]">
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-neutral-100 text-neutral-600 border border-neutral-200/80 font-mono whitespace-nowrap">
                                  {config.priceBasis === 'CARPET_AREA' ? 'Carpet Area' : config.priceBasis === 'BUILT_UP_AREA' ? 'Built-Up Area' : config.priceBasis === 'SUPER_BUILT_UP_AREA' ? 'Super Built' : config.priceBasis || '—'}
                                </span>
                              </td>
                              <td className="py-4 px-3 w-[12%] whitespace-nowrap">
                                <div className="space-y-1">
                                  <span className="font-bold text-sm text-neutral-900 font-display block">
                                    {config.price && config.price > 0 ? `₹${config.price.toLocaleString('en-IN')}` : '—'}
                                  </span>
                                  {(config.priceOnRequest || project.priceOnRequest) && (
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200 font-display">
                                      {project.priceOnRequest ? 'Project PoR' : 'Price on Request'}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="py-4 px-3 w-[11%] whitespace-nowrap">
                                <span className="text-xs font-medium text-neutral-500 font-mono">
                                  {config.effectivePricePerSqft && config.effectivePricePerSqft > 0 ? `₹${config.effectivePricePerSqft.toLocaleString('en-IN')}/sq.ft.` : '—'}
                                </span>
                              </td>
                              <td className="py-4 px-3 w-[16%] min-w-0">
                                <TypologyFloorPlanControl
                                  projectId={project.id}
                                  projectName={project.name}
                                  configuration={config}
                                  projectMedia={project.media || []}
                                  onUpdated={() => fetchProjectData(true)}
                                  onOpenViewer={(configId) => {
                                    setViewerConfigId(configId);
                                    setIsFloorPlanViewerOpen(true);
                                  }}
                                />
                              </td>
                              <td className="py-4 px-2 w-[9%] text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleOpenEditConfig(config)}
                                    className="p-1.5 text-neutral-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition min-w-[36px] min-h-[36px] flex items-center justify-center"
                                    title="Edit typology"
                                    aria-label="Edit typology"
                                  >
                                    <Edit3 className="h-4 w-4" />
                                  </button>
                                  <button
                                    type="button"
                                    disabled={deletingConfigId === config.id}
                                    onClick={() => handleDeleteConfig(config.id)}
                                    className="p-1.5 text-neutral-500 hover:text-rose-600 hover:bg-rose-50 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition min-w-[36px] min-h-[36px] flex items-center justify-center"
                                    title="Remove typology"
                                    aria-label="Remove typology"
                                  >
                                    {deletingConfigId === config.id ? (
                                      <Loader2 className="h-4 w-4 animate-spin text-rose-500" />
                                    ) : (
                                      <Trash2 className="h-4 w-4" />
                                    )}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Mobile Card Stacked View */}
                    <div className="md:hidden divide-y divide-neutral-200/80 -mx-6 -mb-6">
                      {project.configurations.map((config: any) => (
                        <div key={config.id} className="p-4 space-y-3 bg-white">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-neutral-100 text-neutral-700 font-display mb-1">
                                {config.bedroomCount ? `${config.bedroomCount} BHK` : 'Typology'}
                              </span>
                              <h5 className="text-base font-bold text-neutral-900 font-display">{config.name}</h5>
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleOpenEditConfig(config)}
                                className="p-2 text-neutral-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition min-w-[44px] min-h-[44px] flex items-center justify-center"
                                title="Edit typology"
                              >
                                <Edit3 className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                disabled={deletingConfigId === config.id}
                                onClick={() => handleDeleteConfig(config.id)}
                                className="p-2 text-neutral-500 hover:text-rose-600 hover:bg-rose-50 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition min-w-[44px] min-h-[44px] flex items-center justify-center"
                                title="Remove typology"
                              >
                                {deletingConfigId === config.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin text-rose-500" />
                                ) : (
                                  <Trash2 className="h-4 w-4" />
                                )}
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2 text-xs bg-neutral-50 p-3 rounded-lg border border-neutral-100">
                            <div>
                              <span className="text-[10px] uppercase text-neutral-400 font-sans block">Price ({config.priceBasis || 'Basis'})</span>
                              <span className="font-bold text-neutral-900 text-sm font-display block">
                                {config.price && config.price > 0 ? `₹${config.price.toLocaleString('en-IN')}` : '—'}
                              </span>
                              {(config.priceOnRequest || project.priceOnRequest) && (
                                <span className="inline-flex items-center mt-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200 font-display">
                                  {project.priceOnRequest ? 'Project PoR' : 'Price on Request'}
                                </span>
                              )}
                            </div>
                            <div>
                              <span className="text-[10px] uppercase text-neutral-400 font-sans block">Effective Rate</span>
                              <span className="font-semibold text-neutral-700 font-mono">
                                {config.effectivePricePerSqft && config.effectivePricePerSqft > 0 ? `₹${config.effectivePricePerSqft.toLocaleString('en-IN')}/sq.ft.` : '—'}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 text-xs text-neutral-600 font-mono pt-1">
                            {config.carpetArea && <span>Carpet: <strong>{config.carpetArea} sq.ft.</strong></span>}
                            {config.builtUpArea && <span>Built: <strong>{config.builtUpArea} sq.ft.</strong></span>}
                            {config.superBuiltUpArea && <span>Super: <strong>{config.superBuiltUpArea} sq.ft.</strong></span>}
                          </div>

                          <div className="pt-1">
                            <TypologyFloorPlanControl
                              projectId={project.id}
                              projectName={project.name}
                              configuration={config}
                              projectMedia={project.media || []}
                              onUpdated={fetchProjectData}
                              onOpenViewer={(configId) => {
                                setViewerConfigId(configId);
                                setIsFloorPlanViewerOpen(true);
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Add Typology Form */}
              <form onSubmit={handleAddConfig} className="bg-white border border-neutral-200/80 rounded-xl p-6 space-y-5 shadow-2xs">
                <div className="flex items-center justify-between pb-2 border-b border-neutral-100">
                  <div>
                    <h4 className="text-sm font-bold text-neutral-800 uppercase tracking-wider font-display">Add Typology / Configuration</h4>
                    <p className="text-xs text-neutral-500 mt-0.5 font-sans">Define a new bedroom layout, area specifications, and base pricing.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-600 mb-1 font-display">
                      Config Name <span className="text-rose-500">*</span>
                    </label>
                    <input type="text" value={newConfigName} onChange={(e) => setNewConfigName(e.target.value)} placeholder="e.g. 3 BHK Luxury" className="w-full text-sm bg-neutral-50 border border-neutral-200 rounded-lg p-2.5 focus:bg-white focus:border-indigo-500 focus:outline-hidden transition" required />
                    {addFieldErrors.name && <p className="text-[11px] text-rose-600 mt-1">{addFieldErrors.name}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-600 mb-1 font-display">Bedroom Count (BHK)</label>
                    <input type="number" min="0" step="1" value={newConfigBhk} onChange={(e) => setNewConfigBhk(e.target.value)} placeholder="e.g. 3" className="w-full text-sm bg-neutral-50 border border-neutral-200 rounded-lg p-2.5 focus:bg-white focus:border-indigo-500 focus:outline-hidden transition" />
                    {addFieldErrors.bedroomCount && <p className="text-[11px] text-rose-600 mt-1">{addFieldErrors.bedroomCount}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-600 mb-1 font-display">
                      Price Basis <span className="text-rose-500">*</span>
                    </label>
                    <select value={newConfigPriceBasis} onChange={(e) => setNewConfigPriceBasis(e.target.value)} className="w-full text-sm bg-neutral-50 border border-neutral-200 rounded-lg p-2.5 focus:bg-white focus:border-indigo-500 focus:outline-hidden transition">
                      <option value="CARPET_AREA">Carpet Area</option>
                      <option value="BUILT_UP_AREA">Built-up Area</option>
                      <option value="SUPER_BUILT_UP_AREA">Super Built-up Area</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-600 mb-1 font-display">
                      {newConfigPriceOnRequest ? 'Internal Price (₹ INR, Optional)' : 'Price (₹ INR)'}{' '}
                      {!newConfigPriceOnRequest && <span className="text-rose-500">*</span>}
                    </label>
                    <input
                      type="text"
                      value={newConfigPrice}
                      onChange={(e) => setNewConfigBhkPrice(e.target.value)}
                      placeholder={newConfigPriceOnRequest ? 'Optional internal reference price' : 'e.g. 85,00,000'}
                      className="w-full text-sm bg-neutral-50 border border-neutral-200 rounded-lg p-2.5 focus:bg-white focus:border-indigo-500 focus:outline-hidden transition font-mono"
                      required={!newConfigPriceOnRequest}
                    />
                    {addFieldErrors.price && <p className="text-[11px] text-rose-600 mt-1">{addFieldErrors.price}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-600 mb-1 font-display">
                      Carpet Area (sq.ft.) <span className="text-rose-500">*</span>
                    </label>
                    <input type="number" step="any" min="0.01" value={newConfigCarpet} onChange={(e) => setNewConfigCarpet(e.target.value)} placeholder="e.g. 1045" className="w-full text-sm bg-neutral-50 border border-neutral-200 rounded-lg p-2.5 focus:bg-white focus:border-indigo-500 focus:outline-hidden transition" required />
                    {addFieldErrors.carpetArea && <p className="text-[11px] text-rose-600 mt-1">{addFieldErrors.carpetArea}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-600 mb-1 font-display">
                      Built-up Area (sq.ft.){' '}
                      {newConfigPriceBasis === 'BUILT_UP_AREA' && <span className="text-rose-500">*</span>}
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0.01"
                      value={newConfigBuiltUp}
                      onChange={(e) => setNewConfigBuiltUp(e.target.value)}
                      placeholder="e.g. 1210"
                      className="w-full text-sm bg-neutral-50 border border-neutral-200 rounded-lg p-2.5 focus:bg-white focus:border-indigo-500 focus:outline-hidden transition"
                      required={newConfigPriceBasis === 'BUILT_UP_AREA'}
                    />
                    {addFieldErrors.builtUpArea && <p className="text-[11px] text-rose-600 mt-1">{addFieldErrors.builtUpArea}</p>}
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-neutral-600 mb-1 font-display">
                      Super Built-up Area (sq.ft.){' '}
                      {newConfigPriceBasis === 'SUPER_BUILT_UP_AREA' && <span className="text-rose-500">*</span>}
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0.01"
                      value={newConfigSuperBuiltUp}
                      onChange={(e) => setNewConfigSuperBuiltUp(e.target.value)}
                      placeholder="e.g. 1420"
                      className="w-full text-sm bg-neutral-50 border border-neutral-200 rounded-lg p-2.5 focus:bg-white focus:border-indigo-500 focus:outline-hidden transition"
                      required={newConfigPriceBasis === 'SUPER_BUILT_UP_AREA'}
                    />
                    {addFieldErrors.superBuiltUpArea && <p className="text-[11px] text-rose-600 mt-1">{addFieldErrors.superBuiltUpArea}</p>}
                  </div>
                  <div className="sm:col-span-2 lg:col-span-4 pt-1">
                    <label className="flex items-start gap-2.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={newConfigPriceOnRequest}
                        onChange={(e) => setNewConfigPriceOnRequest(e.target.checked)}
                        className="mt-0.5 h-4 w-4 rounded border-neutral-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <div>
                        <span className="text-xs font-bold text-neutral-800 font-display block">
                          Mark Typology as Price on Request
                        </span>
                        <span className="text-[11px] text-neutral-500 font-sans block">
                          Public visitors will see &ldquo;Price on Request&rdquo; for this typology. Any internal price entered above is preserved for staff only.
                        </span>
                      </div>
                    </label>
                  </div>
                </div>

                <div className="flex items-center justify-end pt-2 border-t border-neutral-100">
                  <button type="submit" disabled={savingSub} className="flex items-center gap-1.5 px-5 py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-neutral-300 rounded-lg transition-colors font-display shadow-xs min-h-[40px]">
                    <Plus className="h-4 w-4" />
                    {savingSub ? 'Saving Typology...' : 'Add Typology Configuration'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* TAB 3: RERA Registry */}
          {activeTab === 'rera' && (
            <form onSubmit={handleUpdateRera} className="bg-white border border-neutral-200/80 rounded-xl p-6 space-y-4 shadow-2xs">
              <h4 className="text-sm font-bold text-neutral-800 uppercase tracking-wider font-display">RERA Registration Authority & Verification</h4>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-neutral-500 mb-1">RERA Status *</label>
                  <select value={reraStatus} onChange={(e) => setReraStatus(e.target.value)} className="w-full text-sm bg-neutral-50 border border-neutral-200 rounded-lg p-2.5 focus:outline-hidden">
                    <option value="NOT_PROVIDED">Not Provided</option>
                    <option value="PROVIDED">Provided / Pending</option>
                    <option value="VERIFIED">Verified (Only internal authorized staff may verify)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-500 mb-1">RERA Registration Number</label>
                  <input type="text" value={reraRegistrationNumber} onChange={(e) => setReraRegistrationNumber(e.target.value)} placeholder="e.g. HIRA/P/KOL/2020/000123" className="w-full text-sm bg-neutral-50 border border-neutral-200 rounded-lg p-2.5 focus:outline-hidden font-mono" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-500 mb-1">RERA Authority</label>
                  <input type="text" value={reraAuthority} onChange={(e) => setReraAuthority(e.target.value)} placeholder="e.g. WBRERA" className="w-full text-sm bg-neutral-50 border border-neutral-200 rounded-lg p-2.5 focus:outline-hidden" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-500 mb-1">Internal Verification Notes (Private)</label>
                  <input type="text" value={reraInternalNotes} onChange={(e) => setReraInternalNotes(e.target.value)} placeholder="Verified via WBRERA portal registry lookup..." className="w-full text-sm bg-neutral-50 border border-neutral-200 rounded-lg p-2.5 focus:outline-hidden" />
                </div>
              </div>

              <div className="border-t border-neutral-100 pt-4 flex justify-end">
                <button type="submit" disabled={savingSub} className="flex items-center gap-1.5 px-5 py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-neutral-300 rounded-lg transition-colors font-display">
                  <Save className="h-4 w-4" />
                  {savingSub ? 'Saving RERA Records...' : 'Save RERA Record'}
                </button>
              </div>
            </form>
          )}

          {/* TAB 4: Gallery / Media */}
          {activeTab === 'media' && (
            <div className="space-y-6">
              {/* Walkthrough Video Management Card */}
              <div className="bg-white border border-neutral-200/80 rounded-xl p-6 space-y-5 shadow-2xs">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-neutral-100">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-lg bg-red-50 text-[#E5484D] flex items-center justify-center shrink-0">
                      <Video className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-neutral-800 uppercase tracking-wider font-display">
                          Walkthrough Video
                        </h4>
                        {walkthroughVideo ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full font-mono">
                            ACTIVE
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold px-2 py-0.5 bg-neutral-100 text-neutral-500 rounded-full font-mono">
                            NOT LINKED
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-neutral-500 mt-0.5 font-body">
                        Cinematic video tour rendered in the public project hero and dedicated walkthrough presentation.
                      </p>
                    </div>
                  </div>

                  {!walkthroughVideo && (
                    <button
                      type="button"
                      onClick={openAddVideoModal}
                      className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-bold rounded-lg shadow-2xs transition font-display shrink-0"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add Walkthrough Video
                    </button>
                  )}
                </div>

                {!walkthroughVideo ? (
                  <div className="p-8 text-center bg-neutral-50/60 rounded-xl border border-dashed border-neutral-200 space-y-3">
                    <div className="w-12 h-12 rounded-full bg-red-50 text-[#E5484D] flex items-center justify-center mx-auto">
                      <Video className="h-6 w-6" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-bold text-neutral-800 font-display">
                        No Walkthrough Video Linked
                      </p>
                      <p className="text-xs text-neutral-500 max-w-md mx-auto font-body">
                        Add an external video link from YouTube, Vimeo, or a hosted MP4 video to enable the interactive video tour button on the public portal.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={openAddVideoModal}
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-bold rounded-lg shadow-2xs transition font-display"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add Walkthrough Video
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                    {/* Video Preview */}
                    <div className="lg:col-span-7 space-y-2">
                      <div className="relative aspect-video w-full rounded-xl overflow-hidden border border-neutral-200 bg-neutral-950 shadow-xs">
                        {parsedExistingVideo.isValid && parsedExistingVideo.provider === 'MP4' ? (
                          <video
                            src={parsedExistingVideo.embedUrl || walkthroughVideo.url}
                            controls
                            className="w-full h-full object-contain"
                          />
                        ) : parsedExistingVideo.isValid && parsedExistingVideo.embedUrl ? (
                          <iframe
                            src={parsedExistingVideo.embedUrl}
                            title={walkthroughVideo.altText || 'Project Walkthrough'}
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                            allowFullScreen
                            referrerPolicy="strict-origin-when-cross-origin"
                            className="w-full h-full border-0"
                          />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center text-neutral-400 space-y-2">
                            <AlertCircle className="h-8 w-8 text-amber-500" />
                            <p className="text-xs font-semibold text-neutral-200 font-display">Video URL cannot be embedded</p>
                            <p className="text-[11px] text-neutral-400 font-body max-w-xs">{parsedExistingVideo.error || 'Please update the link to a supported format.'}</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Video Details & Actions */}
                    <div className="lg:col-span-5 space-y-4 font-body">
                      <div className="space-y-3 p-4 bg-neutral-50/80 rounded-xl border border-neutral-200/80">
                        <div>
                          <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider font-mono">
                            Video Title / Accessible Label
                          </span>
                          <h5 className="text-sm font-bold text-neutral-900 font-display mt-0.5">
                            {walkthroughVideo.altText || 'Project Walkthrough'}
                          </h5>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider font-mono">
                            Provider:
                          </span>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-bold rounded-md bg-white border border-neutral-200 text-neutral-800 font-mono">
                            {parsedExistingVideo.providerLabel}
                          </span>
                        </div>

                        {walkthroughVideo.caption && (
                          <div>
                            <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider font-mono">
                              Caption / Description
                            </span>
                            <p className="text-xs text-neutral-600 font-body mt-0.5">
                              {walkthroughVideo.caption}
                            </p>
                          </div>
                        )}

                        <div>
                          <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider font-mono">
                            Saved URL
                          </span>
                          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-neutral-600 font-mono bg-white p-2 rounded-lg border border-neutral-200 overflow-hidden">
                            <span className="truncate flex-1" title={walkthroughVideo.url}>
                              {walkthroughVideo.url}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => openEditVideoModal(walkthroughVideo)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-neutral-50 text-neutral-800 border border-neutral-200 rounded-lg text-xs font-bold transition shadow-2xs font-display"
                        >
                          <Edit3 className="h-3.5 w-3.5 text-neutral-500" />
                          Edit Video
                        </button>

                        <a
                          href={walkthroughVideo.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-neutral-50 text-neutral-800 border border-neutral-200 rounded-lg text-xs font-bold transition shadow-2xs font-display"
                        >
                          <ExternalLink className="h-3.5 w-3.5 text-neutral-500" />
                          Open Link
                        </a>

                        <button
                          type="button"
                          onClick={() => setIsVideoDeleteDialogOpen(true)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-rose-50 text-rose-600 hover:text-rose-700 border border-rose-200 rounded-lg text-xs font-bold transition shadow-2xs font-display ml-auto"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Universal Drag & Drop Upload Section */}
              <div className="bg-white border border-neutral-200/80 rounded-xl p-6 space-y-4 shadow-2xs">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-neutral-800 uppercase tracking-wider font-display">
                    Upload Project Imagery & Floor Plans
                  </h4>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-neutral-500 font-semibold">Category:</span>
                    <select
                      value={newMediaCategory}
                      onChange={(e) => setNewMediaCategory(e.target.value)}
                      className="text-xs bg-neutral-50 border border-neutral-200 rounded-lg p-1.5 focus:outline-hidden"
                    >
                      <option value="EXTERIOR">Exterior</option>
                      <option value="INTERIOR">Interior</option>
                      <option value="AMENITIES">Amenities</option>
                      <option value="CLUBHOUSE">Clubhouse</option>
                      <option value="LOCATION">Location Map</option>
                      <option value="FLOOR_PLANS">Floor Plan</option>
                      <option value="MASTER_PLAN">Master Plan</option>
                      <option value="CONSTRUCTION">Construction Update</option>
                      <option value="WALKTHROUGH">Walkthrough Video</option>
                      <option value="OTHER">Other</option>
                    </select>
                  </div>
                </div>

                <MediaDropzone
                  entityType="PROJECT"
                  entityId={id as string}
                  category={newMediaCategory}
                  title="Drag & Drop Project Photography"
                  subtitle="Drop images here to automatically generate WebP, AVIF, and Great Homes watermarked derivatives"
                  onBatchComplete={() => {
                    fetchProjectData();
                  }}
                />
              </div>

              {/* Gallery Grid with Reordering & Hero Management */}
              <div className="bg-white border border-neutral-200/80 rounded-xl p-6 space-y-4 shadow-2xs">
                <h4 className="text-sm font-bold text-neutral-800 uppercase tracking-wider font-display">
                  Project Gallery Assets ({project.media?.length || 0})
                </h4>
                <MediaPreviewGrid
                  items={project.media || []}
                  onItemsChange={(updated) => {
                    setProject((prev: any) => ({ ...prev, media: updated }));
                  }}
                  onDeleteItem={(mediaId) => handleDeleteMedia(mediaId)}
                  onEditItem={(item) => {
                    if (item.category === 'WALKTHROUGH' || item.mediaType === 'VIDEO') {
                      openEditVideoModal(item);
                    }
                  }}
                />
              </div>
            </div>
          )}

          {/* TAB 5: Features & Amenities */}
          {activeTab === 'amenities' && (
            <div className="space-y-8 font-body">
              {/* SECTION A: Project Highlights / Featured Amenities */}
              <div className="bg-white border border-neutral-200/80 rounded-xl p-6 space-y-5 shadow-2xs">
                <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    <div>
                      <h4 className="text-sm font-bold text-neutral-800 uppercase tracking-wider font-display">
                        Section A: Project Highlights / Featured Amenities
                      </h4>
                      <p className="text-xs text-neutral-500 mt-0.5 font-sans">
                        Prominently featured amenities rendered in the hero section and highlights grid on public project pages.
                      </p>
                    </div>
                  </div>
                  <span className="text-xs font-bold px-2.5 py-1 bg-amber-50 text-amber-700 rounded-full font-mono border border-amber-200/80">
                    {project.amenities?.filter((a: any) => a.isFeatured).length || 0} Featured
                  </span>
                </div>

                {project.amenities?.filter((a: any) => a.isFeatured).length === 0 ? (
                  <div className="p-6 text-center bg-amber-50/40 rounded-xl border border-dashed border-amber-200/80 space-y-2">
                    <Star className="h-8 w-8 text-amber-400 mx-auto" />
                    <p className="text-xs font-bold text-neutral-700 font-display">
                      No amenities marked as Featured Highlights yet
                    </p>
                    <p className="text-xs text-neutral-500 max-w-md mx-auto">
                      Mark key amenities (e.g. Swimming Pool, Clubhouse, Fitness Center) as Featured Highlights below to feature them prominently on the live portal.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {project.amenities
                      ?.filter((item: any) => item.isFeatured)
                      .map((item: any) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between p-3.5 bg-gradient-to-r from-amber-50/60 to-white border border-amber-200/80 rounded-xl shadow-2xs"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <Star className="h-4 w-4 text-amber-500 fill-amber-500 shrink-0" />
                            <div className="min-w-0">
                              <span className="text-xs font-bold text-neutral-900 font-display block truncate">
                                {item.name}
                              </span>
                              <span className="text-[10px] uppercase font-mono font-semibold text-amber-700 block">
                                {item.category || 'FEATURED'}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => handleToggleFeaturedAmenity(item.id, true)}
                              disabled={savingSub}
                              className="px-2 py-1 text-[10px] font-bold text-neutral-600 hover:text-amber-700 hover:bg-amber-100/80 border border-neutral-200 rounded-md transition font-display"
                              title="Unfeature Highlight"
                            >
                              Unfeature
                            </button>
                            <button
                              onClick={() => handleRemoveAmenity(item.id)}
                              className="p-1.5 text-neutral-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition"
                              title="Detach from Project"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>

              {/* SECTION B: All Associated Project Amenities */}
              <div className="bg-white border border-neutral-200/80 rounded-xl p-6 space-y-5 shadow-2xs">
                <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
                  <div className="flex items-center gap-2">
                    <Trees className="h-4 w-4 text-indigo-600" />
                    <div>
                      <h4 className="text-sm font-bold text-neutral-800 uppercase tracking-wider font-display">
                        Section B: All Associated Project Amenities ({project.amenities?.length || 0})
                      </h4>
                      <p className="text-xs text-neutral-500 mt-0.5 font-sans">
                        Complete canonical amenity registry attached to this project enclave. Toggle the star to feature/unfeature.
                      </p>
                    </div>
                  </div>
                </div>

                {project.amenities?.length === 0 ? (
                  <p className="text-sm text-neutral-500 py-6 text-center bg-neutral-50 rounded-lg border border-dashed border-neutral-200">
                    No amenities associated with this project yet. Use the form below to attach master amenities.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {project.amenities?.map((item: any) => (
                      <div
                        key={item.id}
                        className={`flex items-center justify-between p-3.5 rounded-xl border transition-colors ${
                          item.isFeatured
                            ? 'bg-amber-50/30 border-amber-200'
                            : 'bg-neutral-50/60 border-neutral-200/80'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <button
                            type="button"
                            onClick={() => handleToggleFeaturedAmenity(item.id, Boolean(item.isFeatured))}
                            disabled={savingSub}
                            className={`p-1.5 rounded-lg border transition-colors shrink-0 ${
                              item.isFeatured
                                ? 'bg-amber-100 border-amber-300 text-amber-600'
                                : 'bg-white border-neutral-200 text-neutral-400 hover:text-amber-500 hover:bg-amber-50'
                            }`}
                            title={item.isFeatured ? 'Unfeature Highlight' : 'Mark as Featured Highlight'}
                          >
                            <Star
                              className={`h-3.5 w-3.5 ${
                                item.isFeatured ? 'fill-amber-500 text-amber-500' : ''
                              }`}
                            />
                          </button>
                          <div className="min-w-0">
                            <span className="text-xs font-bold text-neutral-900 font-display block truncate">
                              {item.name}
                            </span>
                            <span className="text-[10px] uppercase font-mono text-neutral-500 block">
                              {item.category || 'GENERAL'} {item.isFeatured ? '• FEATURED' : ''}
                            </span>
                          </div>
                        </div>

                        <button
                          onClick={() => handleRemoveAmenity(item.id)}
                          className="p-1.5 text-neutral-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition shrink-0"
                          title="Detach amenity"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Attach Master Amenity Form */}
              <form
                onSubmit={handleAttachAmenity}
                className="bg-white border border-neutral-200/80 rounded-xl p-6 space-y-4 shadow-2xs"
              >
                <div>
                  <h4 className="text-sm font-bold text-neutral-800 uppercase tracking-wider font-display">
                    Attach Master Amenity
                  </h4>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    Select an unattached amenity from the canonical master taxonomy to attach to this project.
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-end gap-4">
                  <div className="grow">
                    <label className="block text-xs font-semibold text-neutral-600 mb-1 font-display">
                      Select Master Amenity *
                    </label>
                    <select
                      value={selectedAmenityId}
                      onChange={(e) => setSelectedAmenityId(e.target.value)}
                      className="w-full text-sm bg-neutral-50 border border-neutral-200 rounded-lg p-2.5 focus:bg-white focus:border-indigo-500 focus:outline-hidden transition font-display"
                      required
                    >
                      <option value="">-- Choose Master Amenity --</option>
                      {allAmenities
                        .filter((am) => !project.amenities?.some((pAm: any) => pAm.id === am.id))
                        .map((am) => (
                          <option key={am.id} value={am.id}>
                            {am.name} ({am.category})
                          </option>
                        ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-2 pb-2">
                    <input
                      type="checkbox"
                      id="check-featured-new"
                      checked={newAmenityIsFeatured}
                      onChange={(e) => setNewAmenityIsFeatured(e.target.checked)}
                      className="h-4 w-4 text-indigo-600 border-neutral-300 rounded focus:ring-indigo-500 cursor-pointer"
                    />
                    <label
                      htmlFor="check-featured-new"
                      className="text-xs font-semibold text-neutral-700 cursor-pointer font-display select-none"
                    >
                      Mark as Featured Highlight
                    </label>
                  </div>

                  <button
                    type="submit"
                    disabled={savingSub || !selectedAmenityId}
                    className="flex items-center gap-1.5 px-5 py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-neutral-300 rounded-lg transition-colors font-display shrink-0 min-h-[42px]"
                  >
                    <Plus className="h-4 w-4" />
                    {savingSub ? 'Attaching...' : 'Attach to Project'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* TAB 6: FAQs */}
          {activeTab === 'faqs' && (
            <div className="space-y-6">
              {/* FAQ lists */}
              <div className="bg-white border border-neutral-200/80 rounded-xl p-6 space-y-4 shadow-2xs">
                <h4 className="text-sm font-bold text-neutral-800 uppercase tracking-wider font-display">Project FAQ list</h4>
                {project.faqs?.length === 0 ? (
                  <p className="text-sm text-neutral-500 py-4">No FAQs configured yet.</p>
                ) : (
                  <div className="space-y-4">
                    {project.faqs.map((faq: any) => (
                      <div key={faq.id} className="p-4 bg-neutral-50 border border-neutral-200/60 rounded-xl flex justify-between items-start gap-4">
                        <div className="space-y-1">
                          <p className="font-bold text-neutral-900 text-sm font-display">Q. {faq.question}</p>
                          <p className="text-sm text-neutral-600">A. {faq.answer}</p>
                        </div>
                        <button onClick={() => handleDeleteFaq(faq.id)} className="p-1 text-rose-600 hover:bg-rose-100 rounded shrink-0">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Add form */}
              <form onSubmit={handleAddFaq} className="bg-white border border-neutral-200/80 rounded-xl p-6 space-y-4 shadow-2xs">
                <h4 className="text-sm font-bold text-neutral-800 uppercase tracking-wider font-display">Add FAQ Question</h4>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-500 mb-1">Question *</label>
                    <input type="text" value={newFaqQuestion} onChange={(e) => setNewFaqQuestion(e.target.value)} placeholder="e.g. What is the possession date of Merlin Rise?" className="w-full text-sm bg-neutral-50 border border-neutral-200 rounded-lg p-2.5 focus:outline-hidden" required />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-500 mb-1">Answer *</label>
                    <textarea value={newFaqAnswer} onChange={(e) => setNewFaqAnswer(e.target.value)} placeholder="e.g. Possession of Phase 1 of Merlin Rise starts in Dec 2027." rows={3} className="w-full text-sm bg-neutral-50 border border-neutral-200 rounded-lg p-2.5 focus:outline-hidden" required />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-500 mb-1">Sort Order</label>
                    <input type="number" value={newFaqSortOrder} onChange={(e) => setNewFaqSortOrder(e.target.value)} className="w-2/12 text-sm bg-neutral-50 border border-neutral-200 rounded-lg p-2 focus:outline-hidden" />
                  </div>
                </div>
                <button type="submit" disabled={savingSub} className="flex items-center gap-1 px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-neutral-300 rounded-lg transition-colors font-display">
                  <Plus className="h-3.5 w-3.5" />
                  {savingSub ? 'Creating FAQ...' : 'Add FAQ'}
                </button>
              </form>
            </div>
          )}

          {/* TAB 7: SEO Tags */}
          {activeTab === 'seo' && (
            <form onSubmit={handleUpdateSeo} className="bg-white border border-neutral-200/80 rounded-xl p-6 space-y-4 shadow-2xs">
              <h4 className="text-sm font-bold text-neutral-800 uppercase tracking-wider font-display">SEO Meta tags Override Console</h4>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-neutral-500 mb-1">Meta Title</label>
                  <input type="text" value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} placeholder="e.g. Merlin Rise Kolkata - Luxury Apartments at Rajarhat New Town" className="w-full text-sm bg-neutral-50 border border-neutral-200 rounded-lg p-2.5 focus:outline-hidden" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-500 mb-1">Meta Description</label>
                  <textarea value={seoDescription} onChange={(e) => setSeoDescription(e.target.value)} placeholder="Explore Merlin Rise in Rajarhat Kolkata. Starting ₹55 L onwards. Get brochure, floor plans, pricing summaries, and verified RERA details." rows={3} className="w-full text-sm bg-neutral-50 border border-neutral-200 rounded-lg p-2.5 focus:outline-hidden" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-500 mb-1">Canonical URL tag Override</label>
                  <input type="url" value={seoCanonicalUrl} onChange={(e) => setSeoCanonicalUrl(e.target.value)} placeholder="https://greathomes.co.in/projects/merlin-rise" className="w-full text-sm bg-neutral-50 border border-neutral-200 rounded-lg p-2.5 focus:outline-hidden font-mono" />
                </div>
              </div>

              <div className="border-t border-neutral-100 pt-4 flex justify-end">
                <button type="submit" disabled={savingSub} className="flex items-center gap-1.5 px-5 py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-neutral-300 rounded-lg transition-colors font-display">
                  <Save className="h-4 w-4" />
                  {savingSub ? 'Saving SEO Overrides...' : 'Save Overrides'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      <AdminConfirmDialog
        isOpen={dialogOpen}
        title={dialogAction === 'publish' ? 'Publish Project' : 'Archive Project'}
        message={
          dialogAction === 'publish'
            ? 'Are you sure you want to publish this project? All validations including name, slug, developer, location, configuration, and media will be performed before finalizing.'
            : 'Are you sure you want to archive this project? It will be immediately hidden from all public consumer-facing listings.'
        }
        confirmLabel={dialogAction === 'publish' ? 'Confirm and Publish' : 'Confirm and Archive'}
        cancelLabel="Cancel"
        isDestructive={dialogAction === 'archive'}
        onConfirm={handleLifecycleAction}
        onCancel={() => setDialogOpen(false)}
        isLoading={dialogLoading}
      />

      {/* Public Floor Plan Viewer Modal for Instant Regression Testing */}
      <ProjectFloorPlanViewer
        isOpen={isFloorPlanViewerOpen}
        onClose={() => setIsFloorPlanViewerOpen(false)}
        configurations={project?.configurations || []}
        mediaList={project?.media || []}
        projectName={project?.name || 'Project'}
        activeConfigurationId={viewerConfigId}
      />

      {/* Edit Configuration Modal */}
      {editingConfig && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-neutral-200 pb-4">
              <div>
                <h3 className="text-base font-bold text-neutral-900 font-display">Edit Typology / Configuration</h3>
                <p className="text-xs text-neutral-500 font-sans">Update pricing, areas, and specifications for {editingConfig.name}</p>
              </div>
              <button
                onClick={() => setEditingConfig(null)}
                className="p-1 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {editError && (
              <div className="flex items-center gap-2 p-3 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{editError}</span>
              </div>
            )}

            <form onSubmit={handleUpdateConfig} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-neutral-500 mb-1">
                    Configuration Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={editConfigName}
                    onChange={(e) => setEditConfigName(e.target.value)}
                    placeholder="e.g. 3 BHK Luxury Suite"
                    className={`w-full text-sm bg-neutral-50 border ${
                      editFieldErrors.name ? 'border-rose-400' : 'border-neutral-200'
                    } rounded-lg p-2.5 focus:outline-hidden`}
                    required
                  />
                  {editFieldErrors.name && (
                    <p className="text-[11px] text-rose-600 mt-1">{editFieldErrors.name}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-500 mb-1">Bedroom Count (BHK)</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={editConfigBhk}
                    onChange={(e) => setEditConfigBhk(e.target.value)}
                    placeholder="e.g. 3"
                    className={`w-full text-sm bg-neutral-50 border ${
                      editFieldErrors.bedroomCount ? 'border-rose-400' : 'border-neutral-200'
                    } rounded-lg p-2.5 focus:outline-hidden`}
                  />
                  {editFieldErrors.bedroomCount && (
                    <p className="text-[11px] text-rose-600 mt-1">{editFieldErrors.bedroomCount}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-500 mb-1">
                    Price Basis <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={editConfigPriceBasis}
                    onChange={(e) => setEditConfigPriceBasis(e.target.value)}
                    className="w-full text-sm bg-neutral-50 border border-neutral-200 rounded-lg p-2.5 focus:outline-hidden"
                  >
                    <option value="CARPET_AREA">Carpet Area</option>
                    <option value="BUILT_UP_AREA">Built-up Area</option>
                    <option value="SUPER_BUILT_UP_AREA">Super Built-up Area</option>
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-neutral-500 mb-1">
                    {editConfigPriceOnRequest ? 'Internal Reference Price (₹ INR, Preserved)' : 'Price (₹ INR)'}{' '}
                    {!editConfigPriceOnRequest && <span className="text-rose-500">*</span>}
                  </label>
                  <input
                    type="text"
                    value={editConfigPrice}
                    onChange={(e) => setEditConfigPrice(e.target.value)}
                    placeholder={editConfigPriceOnRequest ? 'Optional internal reference price' : 'e.g. 85,00,000'}
                    className={`w-full text-sm bg-neutral-50 border ${
                      editFieldErrors.price ? 'border-rose-400' : 'border-neutral-200'
                    } rounded-lg p-2.5 focus:outline-hidden font-mono`}
                    required={!editConfigPriceOnRequest}
                  />
                  {editFieldErrors.price && (
                    <p className="text-[11px] text-rose-600 mt-1">{editFieldErrors.price}</p>
                  )}
                  <div className="mt-2.5 p-2.5 rounded-lg bg-neutral-50 border border-neutral-200/80">
                    <label className="flex items-start gap-2.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={editConfigPriceOnRequest}
                        onChange={(e) => setEditConfigPriceOnRequest(e.target.checked)}
                        className="mt-0.5 h-4 w-4 rounded border-neutral-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <div>
                        <span className="text-xs font-bold text-neutral-800 font-display block">
                          Mark Typology as Price on Request
                        </span>
                        <span className="text-[11px] text-neutral-500 font-sans block">
                          Public visitors will see &ldquo;Price on Request&rdquo; while the internal reference price is preserved in the database.
                        </span>
                      </div>
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-500 mb-1">
                    Carpet Area (sq.ft.) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0.01"
                    value={editConfigCarpet}
                    onChange={(e) => setEditConfigCarpet(e.target.value)}
                    placeholder="e.g. 1045"
                    className={`w-full text-sm bg-neutral-50 border ${
                      editFieldErrors.carpetArea ? 'border-rose-400' : 'border-neutral-200'
                    } rounded-lg p-2.5 focus:outline-hidden`}
                    required
                  />
                  {editFieldErrors.carpetArea && (
                    <p className="text-[11px] text-rose-600 mt-1">{editFieldErrors.carpetArea}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-500 mb-1">
                    Built-up Area (sq.ft.){' '}
                    {editConfigPriceBasis === 'BUILT_UP_AREA' && <span className="text-rose-500">*</span>}
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0.01"
                    value={editConfigBuiltUp}
                    onChange={(e) => setEditConfigBuiltUp(e.target.value)}
                    placeholder="e.g. 1210"
                    className={`w-full text-sm bg-neutral-50 border ${
                      editFieldErrors.builtUpArea ? 'border-rose-400' : 'border-neutral-200'
                    } rounded-lg p-2.5 focus:outline-hidden`}
                    required={editConfigPriceBasis === 'BUILT_UP_AREA'}
                  />
                  {editFieldErrors.builtUpArea && (
                    <p className="text-[11px] text-rose-600 mt-1">{editFieldErrors.builtUpArea}</p>
                  )}
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-neutral-500 mb-1">
                    Super Built-up Area (sq.ft.){' '}
                    {editConfigPriceBasis === 'SUPER_BUILT_UP_AREA' && <span className="text-rose-500">*</span>}
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0.01"
                    value={editConfigSuperBuiltUp}
                    onChange={(e) => setEditConfigSuperBuiltUp(e.target.value)}
                    placeholder="e.g. 1420"
                    className={`w-full text-sm bg-neutral-50 border ${
                      editFieldErrors.superBuiltUpArea ? 'border-rose-400' : 'border-neutral-200'
                    } rounded-lg p-2.5 focus:outline-hidden`}
                    required={editConfigPriceBasis === 'SUPER_BUILT_UP_AREA'}
                  />
                  {editFieldErrors.superBuiltUpArea && (
                    <p className="text-[11px] text-rose-600 mt-1">{editFieldErrors.superBuiltUpArea}</p>
                  )}
                </div>
              </div>

              <div className="border-t border-neutral-200 pt-4 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditingConfig(null)}
                  className="px-4 py-2 text-xs font-bold text-neutral-700 bg-white hover:bg-neutral-100 border border-neutral-300 rounded-lg transition font-display"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit}
                  className="flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-neutral-300 rounded-lg transition font-display"
                >
                  {isSavingEdit ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Saving Changes...</span>
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      <span>Save Changes</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Walkthrough Video Modal */}
      {isVideoModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-6 max-h-[92vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-neutral-200 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-red-50 text-[#E5484D] flex items-center justify-center">
                  <Video className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-neutral-900 font-display">
                    {isEditingVideo ? 'Edit Walkthrough Video' : 'Add Walkthrough Video'}
                  </h3>
                  <p className="text-xs text-neutral-500 font-sans">
                    Enter a valid YouTube, Vimeo, or hosted MP4 video URL
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsVideoModalOpen(false)}
                className="p-1 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {videoFormError && (
              <div className="flex items-center gap-2 p-3 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{videoFormError}</span>
              </div>
            )}

            <form onSubmit={handleSaveVideo} className="space-y-4 font-body">
              {/* Video URL */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-neutral-700 font-display">
                    Video URL *
                  </label>
                  {parsedFormVideo.isValid ? (
                    previewStatus === 'ready' ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 rounded-full font-mono">
                        <CheckCircle className="h-3 w-3 text-emerald-600" />
                        Embed preview verified
                      </span>
                    ) : previewStatus === 'error' ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200/80 px-2 py-0.5 rounded-full font-mono">
                        <AlertCircle className="h-3 w-3 text-amber-600" />
                        Embedding restricted (External link only)
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700 bg-blue-50 border border-blue-200/80 px-2 py-0.5 rounded-full font-mono">
                        <Video className="h-3 w-3 text-blue-600" />
                        {parsedFormVideo.providerLabel} ID detected ({parsedFormVideo.videoId || 'Valid'})
                      </span>
                    )
                  ) : videoFormUrl.trim().length > 0 ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-red-700 bg-red-50 border border-red-200/80 px-2 py-0.5 rounded-full font-mono">
                      <AlertCircle className="h-3 w-3 text-red-600" />
                      Invalid URL syntax
                    </span>
                  ) : null}
                </div>
                <input
                  type="url"
                  value={videoFormUrl}
                  onChange={(e) => {
                    setVideoFormUrl(e.target.value);
                    setVideoFormError(null);
                  }}
                  placeholder="e.g. https://www.youtube.com/watch?v=... or https://vimeo.com/... or https://.../tour.mp4"
                  className="w-full text-xs font-mono bg-neutral-50 border border-neutral-200 rounded-lg p-2.5 focus:outline-hidden focus:border-neutral-400"
                  required
                />
                <p className="text-[11px] text-neutral-500 mt-1">
                  Supports YouTube watch & share links, Vimeo video links, and direct hosted .mp4 files.
                </p>
              </div>

              {/* Live Preview Container */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-neutral-700 font-display">
                    Live Preview
                  </label>
                  {parsedFormVideo.isValid && (
                    <span className="text-[10px] text-neutral-400 font-mono">
                      {previewStatus === 'ready' ? 'Interactive Player' : previewStatus === 'error' ? 'Embed Blocked by Provider' : 'Loading Player...'}
                    </span>
                  )}
                </div>
                <div className="relative aspect-video w-full rounded-xl overflow-hidden border border-neutral-200 bg-neutral-900 shadow-inner flex items-center justify-center">
                  {parsedFormVideo.isValid ? (
                    previewStatus === 'error' ? (
                      <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center bg-neutral-900 text-neutral-200 space-y-3">
                        <div className="w-10 h-10 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center">
                          <AlertCircle className="h-5 w-5" />
                        </div>
                        <div className="space-y-1 max-w-sm">
                          <p className="text-xs font-bold text-neutral-100 font-display">
                            Video Embedding Restricted
                          </p>
                          <p className="text-[11px] text-neutral-400 font-body leading-relaxed">
                            {previewErrorMessage || `${parsedFormVideo.providerLabel} prevents inline player embedding for this video.`}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              setPreviewStatus('id_extracted');
                              setPreviewErrorMessage(null);
                              setPreviewRetryKey((k) => k + 1);
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-neutral-200 bg-neutral-800 hover:bg-neutral-700 rounded-md border border-neutral-700 transition font-display"
                          >
                            <RotateCcw className="h-3 w-3" />
                            Retry Preview
                          </button>
                          <a
                            href={parsedFormVideo.watchUrl || parsedFormVideo.originalUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-md shadow-2xs transition font-display"
                          >
                            <ExternalLink className="h-3 w-3" />
                            Open on {parsedFormVideo.providerLabel}
                          </a>
                        </div>
                        <p className="text-[10px] text-neutral-500 font-body">
                          You can still save this video. It will open safely for visitors via external link.
                        </p>
                      </div>
                    ) : parsedFormVideo.provider === 'MP4' ? (
                      <video
                        key={`mp4-${previewRetryKey}-${parsedFormVideo.originalUrl}`}
                        src={parsedFormVideo.embedUrl || videoFormUrl}
                        controls
                        className="w-full h-full object-contain"
                        onLoadedData={() => setPreviewStatus('ready')}
                        onError={() => {
                          setPreviewStatus('error');
                          setPreviewErrorMessage('Failed to load hosted MP4 file.');
                        }}
                      />
                    ) : (
                      <iframe
                        key={`iframe-${previewRetryKey}-${parsedFormVideo.embedUrl}`}
                        src={parsedFormVideo.embedUrl!}
                        title={videoFormTitle || 'Video Live Preview'}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        allowFullScreen
                        referrerPolicy="strict-origin-when-cross-origin"
                        className="w-full h-full border-0"
                        onLoad={() => {
                          setTimeout(() => {
                            setPreviewStatus((prev) => (prev === 'error' ? 'error' : 'ready'));
                          }, 500);
                        }}
                        onError={() => {
                          setPreviewStatus('error');
                          setPreviewErrorMessage(`Failed to load ${parsedFormVideo.providerLabel} embed player.`);
                        }}
                      />
                    )
                  ) : (
                    <div className="p-6 text-center text-neutral-400 space-y-1">
                      <Video className="h-8 w-8 text-neutral-600 mx-auto" />
                      <p className="text-xs font-medium text-neutral-300">
                        {videoFormUrl.trim().length > 0
                          ? parsedFormVideo.error || 'Invalid video link'
                          : 'Enter a valid video URL above to see the live preview'}
                      </p>
                      <p className="text-[11px] text-neutral-500">
                        YouTube, Vimeo, and MP4 links will embed securely here.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Video Title / Accessible Label */}
              <div>
                <label className="block text-xs font-semibold text-neutral-700 font-display mb-1">
                  Video Title / Accessible Label *
                </label>
                <input
                  type="text"
                  value={videoFormTitle}
                  onChange={(e) => setVideoFormTitle(e.target.value)}
                  placeholder="e.g. Project Walkthrough & Architectural Tour"
                  className="w-full text-sm bg-neutral-50 border border-neutral-200 rounded-lg p-2.5 focus:outline-hidden focus:border-neutral-400"
                  required
                />
                <p className="text-[11px] text-neutral-500 mt-1">
                  Used as the modal heading on the live project page and accessible screen reader label.
                </p>
              </div>

              {/* Caption / Description */}
              <div>
                <label className="block text-xs font-semibold text-neutral-700 font-display mb-1">
                  Caption / Description (Optional)
                </label>
                <textarea
                  value={videoFormCaption}
                  onChange={(e) => setVideoFormCaption(e.target.value)}
                  placeholder="e.g. Complete walkthrough showcasing towers, luxury clubhouse, landscaped greens, and sample show apartments."
                  rows={2}
                  className="w-full text-sm bg-neutral-50 border border-neutral-200 rounded-lg p-2.5 focus:outline-hidden focus:border-neutral-400 resize-none"
                />
              </div>

              {/* Actions */}
              <div className="border-t border-neutral-200 pt-4 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsVideoModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-neutral-700 bg-white hover:bg-neutral-100 border border-neutral-300 rounded-lg transition font-display"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingVideo || !parsedFormVideo.isValid || !videoFormTitle.trim()}
                  className="flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-neutral-900 hover:bg-neutral-800 disabled:bg-neutral-300 rounded-lg transition font-display"
                >
                  {isSavingVideo ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Saving Video...</span>
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      <span>
                        {isEditingVideo
                          ? previewStatus === 'error'
                            ? 'Update Walkthrough (External)'
                            : 'Update Video'
                          : previewStatus === 'error'
                            ? 'Save Walkthrough (External)'
                            : 'Save Walkthrough Video'}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Walkthrough Video Confirmation Dialog */}
      <AdminConfirmDialog
        isOpen={isVideoDeleteDialogOpen}
        title="Delete Walkthrough Video"
        message={`Are you sure you want to remove the walkthrough video "${walkthroughVideo?.altText || 'Project Walkthrough'}"? This will remove the video tour from the public hero and presentation section.`}
        confirmLabel="Confirm and Delete"
        cancelLabel="Cancel"
        isDestructive={true}
        onConfirm={handleConfirmDeleteVideo}
        onCancel={() => setIsVideoDeleteDialogOpen(false)}
        isLoading={isDeletingVideo}
      />
    </div>
  );
}
