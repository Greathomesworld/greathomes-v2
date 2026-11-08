'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AdminPageHeader } from '@/src/components/admin/AdminPageHeader';
import { AdminLoadingState } from '@/src/components/admin/AdminLoadingState';
import { AdminErrorState } from '@/src/components/admin/AdminErrorState';
import { getAdminHeaders } from '@/src/lib/adminAuth';
import Link from 'next/link';
import {
  ArrowLeft,
  Save,
  Building,
  MapPin,
  DollarSign,
  ExternalLink,
  AlertCircle,
  FileText,
  Upload,
  Trash2,
  RefreshCw,
  Download,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { AdminProjectPinMap } from '@/src/components/admin/AdminProjectPinMap';

interface AdminBrochureInfo {
  available: boolean;
  projectMediaId: string | null;
  mediaId: string | null;
  filename: string | null;
  fileSizeBytes: number | null;
  updatedAt: string | null;
  previewUrl: string | null;
  downloadUrl: string | null;
}

function formatFileSize(bytes?: number | null): string | null {
  if (bytes === undefined || bytes === null || isNaN(bytes) || bytes <= 0) return null;
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function formatCoordinates(lat: number, lng: number): string {
  const latDir = lat >= 0 ? 'N' : 'S';
  const lngDir = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(6)}° ${latDir}, ${Math.abs(lng).toFixed(6)}° ${lngDir}`;
}

export default function EditProjectPage() {
  const params = useParams();
  const router = useRouter();
  const { id } = params;
  
  // Data lists
  const [developers, setDevelopers] = useState<any[]>([]);
  const [developerSearch, setDeveloperSearch] = useState('');
  const [locations, setLocations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [developerId, setDeveloperId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [propertyType, setPropertyType] = useState('APARTMENT');
  const [status, setStatus] = useState('UNDER_CONSTRUCTION');
  const [startingPrice, setStartingPrice] = useState('');
  const [shortDescription, setShortDescription] = useState('');
  const [description, setDescription] = useState('');
  
  // Snapshot states
  const [projectArea, setProjectArea] = useState('');
  const [towerCount, setTowerCount] = useState('');
  const [totalUnits, setTotalUnits] = useState('');
  const [floors, setFloors] = useState('');
  const [possession, setPossession] = useState('');

  // Coordinates state
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);

  // Brochure management state
  const [brochure, setBrochure] = useState<AdminBrochureInfo>({
    available: false,
    projectMediaId: null,
    mediaId: null,
    filename: null,
    fileSizeBytes: null,
    updatedAt: null,
    previewUrl: null,
    downloadUrl: null,
  });
  const [brochureUploading, setBrochureUploading] = useState(false);
  const [brochureRemoving, setBrochureRemoving] = useState(false);
  const [brochureDownloading, setBrochureDownloading] = useState(false);
  const [brochureError, setBrochureError] = useState<string | null>(null);
  const [brochureSuccess, setBrochureSuccess] = useState<string | null>(null);
  const brochureFileInputRef = useRef<HTMLInputElement>(null);

  const [saving, setSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [projectRes, devsRes, locsRes, brochureRes] = await Promise.all([
          fetch(`/api/projects/${id}`, { headers: getAdminHeaders() }),
          fetch('/api/admin/developers?limit=1000', { headers: getAdminHeaders() }),
          fetch('/api/admin/locations', { headers: getAdminHeaders() }),
          fetch(`/api/admin/projects/${id}/brochure`, { headers: getAdminHeaders() }).catch(() => null),
        ]);

        if (!projectRes.ok) {
          throw new Error(`Project with ID ${id} not found.`);
        }
        if (!devsRes.ok || !locsRes.ok) {
          throw new Error('Failed to load lookup lists.');
        }

        const projectData = await projectRes.json();
        const devsData = await devsRes.json();
        const locsData = await locsRes.json();

        if (brochureRes && brochureRes.ok) {
          const bData = await brochureRes.json();
          if (bData?.brochure) {
            setBrochure(bData.brochure);
          }
        } else if (projectData.brochure) {
          setBrochure({
            available: Boolean(projectData.brochure.available),
            projectMediaId: projectData.brochure.projectMediaId || null,
            mediaId: projectData.brochure.mediaId || null,
            filename: projectData.brochure.displayName || null,
            fileSizeBytes: null,
            updatedAt: projectData.brochure.updatedAt || null,
            previewUrl: projectData.brochure.available ? `/api/projects/${projectData.id}/brochure/download` : null,
            downloadUrl: projectData.brochure.available ? `/api/projects/${projectData.id}/brochure/download?download=1` : null,
          });
        }

        const rawDevs: any[] = devsData.items || [];
        const assignedDevId = projectData.developer?.id;

        // Guarantee assigned developer is preserved in select options
        if (assignedDevId && !rawDevs.some((d: any) => d.id === assignedDevId)) {
          if (projectData.developer) {
            rawDevs.unshift({
              id: projectData.developer.id,
              name: projectData.developer.name,
              slug: projectData.developer.slug,
              status: projectData.developer.status || 'PUBLISHED',
            });
          }
        }

        setDevelopers(rawDevs);
        // Only allow published locations
        setLocations((locsData.items || []).filter((loc: any) => loc.status === 'PUBLISHED'));

        // Load project values
        setName(projectData.name || '');
        setSlug(projectData.slug || '');
        setDeveloperId(assignedDevId || '');
        setLocationId(projectData.location?.id || '');
        setPropertyType(projectData.propertyType || 'APARTMENT');
        setStatus(projectData.status || 'UNDER_CONSTRUCTION');
        setStartingPrice(projectData.startingPrice ? String(projectData.startingPrice) : '');
        setShortDescription(projectData.shortDescription || '');
        setDescription(projectData.description || '');
        
        // Snapshot attributes
        setProjectArea(projectData.snapshot?.projectArea ?? projectData.projectArea ?? '');
        setTowerCount(projectData.snapshot?.towerCount != null ? String(projectData.snapshot.towerCount) : (projectData.towerCount != null ? String(projectData.towerCount) : ''));
        setTotalUnits(projectData.snapshot?.totalUnits != null ? String(projectData.snapshot.totalUnits) : (projectData.totalUnits != null ? String(projectData.totalUnits) : ''));
        setFloors(projectData.snapshot?.floors ?? projectData.floors ?? '');
        setPossession(projectData.snapshot?.possession ?? projectData.possession ?? '');

        // Load project coordinate overrides
        const rawLat = projectData.projectLatitude ?? (projectData.isProjectOverride ? projectData.latitude : null);
        const rawLng = projectData.projectLongitude ?? (projectData.isProjectOverride ? projectData.longitude : null);
        setLatitude(rawLat !== undefined && rawLat !== null && !isNaN(Number(rawLat)) ? Number(rawLat) : null);
        setLongitude(rawLng !== undefined && rawLng !== null && !isNaN(Number(rawLng)) ? Number(rawLng) : null);
      } catch (err: any) {
        setError(err.message || 'Error loading lookup data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [id]);

  const handleBrochureFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (brochureFileInputRef.current) {
      brochureFileInputRef.current.value = '';
    }
    if (!file) return;

    setBrochureError(null);
    setBrochureSuccess(null);

    const isPdfMime = file.type.toLowerCase() === 'application/pdf';
    const isPdfExt = file.name.toLowerCase().endsWith('.pdf');
    if (!isPdfMime || !isPdfExt) {
      setBrochureError('Invalid file format. Only PDF documents (.pdf) are allowed for project brochures.');
      return;
    }

    if (file.size <= 0 || file.size > 10 * 1024 * 1024) {
      setBrochureError('Brochure PDF file size must not exceed 10 MB.');
      return;
    }

    try {
      setBrochureUploading(true);
      const wasReplacing = brochure.available;

      const formData = new FormData();
      formData.append('file', file);
      formData.append('category', 'BROCHURE');
      formData.append('entityType', 'PROJECT');
      formData.append('entityId', String(id));
      formData.append('caption', file.name);
      formData.append('altText', `${name || 'Project'} Official Brochure`);
      formData.append('isFeatured', 'false');

      const uploadHeaders = { ...getAdminHeaders() } as Record<string, string>;
      delete uploadHeaders['Content-Type'];

      const res = await fetch('/api/admin/media/upload', {
        method: 'POST',
        headers: uploadHeaders,
        body: formData,
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to upload project brochure.');
      }

      // Refresh canonical brochure state from admin endpoint
      const refreshRes = await fetch(`/api/admin/projects/${id}/brochure`, {
        headers: getAdminHeaders(),
      });
      if (refreshRes.ok) {
        const refreshJson = await refreshRes.json();
        if (refreshJson?.brochure) {
          setBrochure(refreshJson.brochure);
        }
      } else {
        setBrochure({
          available: true,
          projectMediaId: json.projectMedia?.id || json.data?.id || null,
          mediaId: json.media?.id || json.data?.id || null,
          filename: file.name,
          fileSizeBytes: file.size,
          updatedAt: new Date().toISOString(),
          previewUrl: `/api/projects/${id}/brochure/download`,
          downloadUrl: `/api/projects/${id}/brochure/download?download=1`,
        });
      }

      setBrochureSuccess(
        wasReplacing
          ? `Project brochure replaced successfully with "${file.name}".`
          : `Project brochure "${file.name}" uploaded and associated with this project.`
      );
    } catch (err: any) {
      setBrochureError(
        err.message ||
          'Failed to upload brochure. Any previously associated brochure remains intact.'
      );
    } finally {
      setBrochureUploading(false);
    }
  };

  const handleViewOrDownloadBrochure = async () => {
    if (!brochure.available) return;
    setBrochureError(null);
    try {
      setBrochureDownloading(true);
      const res = await fetch(`/api/projects/${id}/brochure/download?download=1`, {
        headers: getAdminHeaders(),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Unable to download the current project brochure.');
      }
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = brochure.filename || `${slug || 'project'}_brochure.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
    } catch (err: any) {
      setBrochureError(err.message || 'Failed to download brochure.');
    } finally {
      setBrochureDownloading(false);
    }
  };

  const handleRemoveBrochure = async () => {
    if (!brochure.available || brochureRemoving) return;
    setBrochureError(null);
    setBrochureSuccess(null);

    try {
      setBrochureRemoving(true);
      const res = await fetch(`/api/admin/projects/${id}/brochure`, {
        method: 'DELETE',
        headers: getAdminHeaders(),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to remove project brochure.');
      }

      setBrochure({
        available: false,
        projectMediaId: null,
        mediaId: null,
        filename: null,
        fileSizeBytes: null,
        updatedAt: null,
        previewUrl: null,
        downloadUrl: null,
      });
      setBrochureSuccess('Project brochure removed. It is no longer offered on the public project page.');
    } catch (err: any) {
      setBrochureError(err.message || 'Failed to remove project brochure.');
    } finally {
      setBrochureRemoving(false);
    }
  };

  const slugify = (text: string) => {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setName(val);
    setSlug(slugify(val));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);
    setSaving(true);

    if (!name.trim()) {
      setValidationError("Project Name is required.");
      setSaving(false);
      return;
    }
    if (!slug.trim()) {
      setValidationError("URL Slug is required.");
      setSaving(false);
      return;
    }
    if (!developerId) {
      setValidationError("Please select a Developer.");
      setSaving(false);
      return;
    }
    if (!locationId) {
      setValidationError("Please select a Location.");
      setSaving(false);
      return;
    }

    try {
      const body = {
        name,
        slug,
        developerId,
        locationId,
        propertyType,
        status,
        startingPrice: startingPrice ? parseFloat(startingPrice) : undefined,
        shortDescription: shortDescription || null,
        description: description || null,
        projectArea: projectArea.trim() || null,
        towerCount: towerCount.trim() ? parseInt(towerCount, 10) : null,
        totalUnits: totalUnits.trim() ? parseInt(totalUnits, 10) : null,
        floors: floors.trim() || null,
        possession: possession.trim() || null,
        latitude: latitude !== null ? latitude : null,
        longitude: longitude !== null ? longitude : null,
      };

      const res = await fetch(`/api/projects/${id}`, {
        method: 'PATCH',
        headers: {
          ...getAdminHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update project.');
      }

      router.push(`/admin/projects/${id}`);
    } catch (err: any) {
      setValidationError(err.message || 'An error occurred while saving.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <AdminLoadingState message="Loading project records..." />;
  if (error) return <AdminErrorState title="Error Loading Record" error={error} />;

  return (
    <div className="space-y-6 pb-20">
      <AdminPageHeader
        title={`Edit: ${name}`}
        description="Modify core project identity, snap-shot attributes, and spatial locations."
        breadcrumbs={[
          { label: 'Projects', href: '/admin/projects' },
          { label: name, href: `/admin/projects/${id}` },
          { label: 'Edit Project' },
        ]}
        secondaryActions={[
          {
            label: 'Cancel & Back',
            onClick: () => router.push(`/admin/projects/${id}`),
            icon: <ArrowLeft className="h-4 w-4" />,
          },
        ]}
      />

      <form onSubmit={handleSubmit} className="px-6 max-w-4xl space-y-6">
        {validationError && (
          <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 text-sm font-medium rounded-lg">
            {validationError}
          </div>
        )}

        {/* SECTION 1: Identity */}
        <div className="bg-white p-6 border border-neutral-200/80 rounded-xl space-y-4">
          <h2 className="text-sm font-bold text-neutral-800 uppercase tracking-wider font-display">1. Project Identity</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-neutral-600 mb-1">Project Name *</label>
              <input
                type="text"
                value={name}
                onChange={handleNameChange}
                placeholder="e.g. Merlin Rise"
                className="w-full text-sm bg-neutral-50 border border-neutral-200 rounded-lg p-2.5 focus:outline-hidden focus:ring-1 focus:ring-indigo-500 font-body"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-600 mb-1">URL Slug (URL-Safe) *</label>
              <input
                type="text"
                value={slug}
                onChange={(e) => setSlug(slugify(e.target.value))}
                placeholder="e.g. merlin-rise"
                className="w-full text-sm bg-neutral-50 border border-neutral-200 rounded-lg p-2.5 focus:outline-hidden focus:ring-1 focus:ring-indigo-500 font-mono"
                required
              />
            </div>
          </div>
        </div>

        {/* SECTION 2: Relationships */}
        <div className="bg-white p-6 border border-neutral-200/80 rounded-xl space-y-4">
          <h2 className="text-sm font-bold text-neutral-800 uppercase tracking-wider font-display">2. Developer & Location Relations</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-neutral-600 mb-1">Developer *</label>
              <div className="relative">
                <select
                  value={developerId}
                  onChange={(e) => setDeveloperId(e.target.value)}
                  className="w-full text-sm bg-neutral-50 border border-neutral-200 rounded-lg p-2.5 pl-9 focus:outline-hidden"
                  required
                >
                  <option value="">-- Select Developer --</option>
                  {developers.map(dev => (
                    <option key={dev.id} value={dev.id}>{dev.name} ({dev.status})</option>
                  ))}
                </select>
                <Building className="absolute left-3 top-3 h-4 w-4 text-neutral-400" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-600 mb-1">Canonical Location *</label>
              <div className="relative">
                <select
                  value={locationId}
                  onChange={(e) => setLocationId(e.target.value)}
                  className="w-full text-sm bg-neutral-50 border border-neutral-200 rounded-lg p-2.5 pl-9 focus:outline-hidden"
                  required
                >
                  <option value="">-- Select Published Location --</option>
                  {locations.map(loc => (
                    <option key={loc.id} value={loc.id}>{loc.name} ({loc.type})</option>
                  ))}
                </select>
                <MapPin className="absolute left-3 top-3 h-4 w-4 text-neutral-400" />
              </div>
            </div>
          </div>

          {/* INTERACTIVE PROJECT MAP PIN & COORDINATES EDITOR */}
          <div className="mt-4 pt-4 border-t border-neutral-100">
            <AdminProjectPinMap
              projectLat={latitude}
              projectLng={longitude}
              locationMaster={locations.find(loc => loc.id === locationId) || null}
              onCoordinatesChange={(newLat, newLng) => {
                setLatitude(newLat);
                setLongitude(newLng);
              }}
            />
          </div>
        </div>

        {/* SECTION 3: Content Model */}
        <div className="bg-white p-6 border border-neutral-200/80 rounded-xl space-y-4">
          <h2 className="text-sm font-bold text-neutral-800 uppercase tracking-wider font-display">3. Project Descriptions</h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-neutral-600 mb-1">Short Description</label>
              <input
                type="text"
                value={shortDescription}
                onChange={(e) => setShortDescription(e.target.value)}
                placeholder="A high-level elevator pitch summary of the property..."
                className="w-full text-sm bg-neutral-50 border border-neutral-200 rounded-lg p-2.5 focus:outline-hidden font-body"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-600 mb-1">Detailed Description (Overview)</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={5}
                placeholder="Full storytelling marketing content details..."
                className="w-full text-sm bg-neutral-50 border border-neutral-200 rounded-lg p-2.5 focus:outline-hidden font-body"
              />
            </div>
          </div>
        </div>

        {/* SECTION 4: Construction & Classification */}
        <div className="bg-white p-6 border border-neutral-200/80 rounded-xl space-y-4">
          <h2 className="text-sm font-bold text-neutral-800 uppercase tracking-wider font-display">4. Stage, Status & Starting Price</h2>
          
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-neutral-600 mb-1">Property Typology *</label>
              <select
                value={propertyType}
                onChange={(e) => setPropertyType(e.target.value)}
                className="w-full text-sm bg-neutral-50 border border-neutral-200 rounded-lg p-2.5 focus:outline-hidden"
              >
                <option value="APARTMENT">Apartment</option>
                <option value="FLAT">Flat</option>
                <option value="VILLA">Villa</option>
                <option value="INDEPENDENT_HOUSE">Independent House</option>
                <option value="PLOT">Plot</option>
                <option value="DUPLEX">Duplex</option>
                <option value="PENTHOUSE">Penthouse</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-600 mb-1">Project Stage *</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full text-sm bg-neutral-50 border border-neutral-200 rounded-lg p-2.5 focus:outline-hidden"
              >
                <option value="UPCOMING">Upcoming</option>
                <option value="NEW_LAUNCH">New Launch</option>
                <option value="UNDER_CONSTRUCTION">Under Construction</option>
                <option value="READY_TO_MOVE">Ready to Move</option>
                <option value="COMPLETED">Completed</option>
                <option value="SOLD_OUT">Sold Out</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-600 mb-1">
                Manual Fallback Starting Price (₹ INR)
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={startingPrice}
                  onChange={(e) => setStartingPrice(e.target.value)}
                  placeholder="e.g. 7500000"
                  className="w-full text-sm bg-neutral-50 border border-neutral-200 rounded-lg p-2.5 pl-8 focus:outline-hidden"
                />
                <DollarSign className="absolute left-3 top-3 h-4 w-4 text-neutral-400" />
              </div>
              <p className="text-[11px] text-neutral-500 mt-1">
                Note: When active typologies exist, the lowest typology price automatically determines public starting prices. This manual value serves as fallback for upcoming projects without typologies.
              </p>
            </div>
          </div>
        </div>

        {/* SECTION 5: Snapshot */}
        <div className="bg-white p-6 border border-neutral-200/80 rounded-xl space-y-4">
          <h2 className="text-sm font-bold text-neutral-800 uppercase tracking-wider font-display">5. Project Snapshot Attributes</h2>
          
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-neutral-600 mb-1">Project Area</label>
              <input
                type="text"
                value={projectArea}
                onChange={(e) => setProjectArea(e.target.value)}
                placeholder="e.g. 5.5 Acres"
                className="w-full text-sm bg-neutral-50 border border-neutral-200 rounded-lg p-2.5 focus:outline-hidden"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-600 mb-1">Tower Count</label>
              <input
                type="number"
                value={towerCount}
                onChange={(e) => setTowerCount(e.target.value)}
                placeholder="e.g. 6"
                className="w-full text-sm bg-neutral-50 border border-neutral-200 rounded-lg p-2.5 focus:outline-hidden"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-600 mb-1">Total Units</label>
              <input
                type="number"
                value={totalUnits}
                onChange={(e) => setTotalUnits(e.target.value)}
                placeholder="e.g. 450"
                className="w-full text-sm bg-neutral-50 border border-neutral-200 rounded-lg p-2.5 focus:outline-hidden"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-600 mb-1">Floors</label>
              <input
                type="text"
                value={floors}
                onChange={(e) => setFloors(e.target.value)}
                placeholder="e.g. G+24"
                className="w-full text-sm bg-neutral-50 border border-neutral-200 rounded-lg p-2.5 focus:outline-hidden"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-600 mb-1">Possession Text</label>
              <input
                type="text"
                value={possession}
                onChange={(e) => setPossession(e.target.value)}
                placeholder="e.g. Dec 2027"
                className="w-full text-sm bg-neutral-50 border border-neutral-200 rounded-lg p-2.5 focus:outline-hidden"
              />
            </div>
          </div>
        </div>

        {/* SECTION 6: Project Brochure (PDF Document) */}
        <div
          id="admin-project-brochure-section"
          className="bg-white p-6 border border-neutral-200/80 rounded-xl space-y-4"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-neutral-800 uppercase tracking-wider font-display">
                6. Project Brochure (PDF)
              </h2>
              <p className="text-xs text-neutral-500 font-body mt-0.5">
                Used on the public project detail page. Buyers submit their contact details before receiving authorized access to this project&apos;s brochure.
              </p>
            </div>
            <div>
              {brochure.available ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold font-display bg-emerald-50 text-emerald-800 border border-emerald-200">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  Brochure Available
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold font-display bg-neutral-100 text-neutral-600 border border-neutral-200">
                  <FileText className="h-3.5 w-3.5 text-neutral-400" />
                  No Brochure Uploaded
                </span>
              )}
            </div>
          </div>

          <input
            ref={brochureFileInputRef}
            type="file"
            accept="application/pdf,.pdf"
            onChange={handleBrochureFileSelect}
            className="hidden"
            aria-label="Upload project brochure PDF"
          />

          {brochureError && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium rounded-lg flex items-center gap-2 font-body">
              <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
              <span>{brochureError}</span>
            </div>
          )}

          {brochureSuccess && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium rounded-lg flex items-center gap-2 font-body">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>{brochureSuccess}</span>
            </div>
          )}

          {brochure.available ? (
            <div className="p-4 bg-neutral-50 border border-neutral-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
                  <FileText className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-neutral-900 font-display truncate">
                    {brochure.filename || `${name || 'Project'} Official Brochure.pdf`}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500 font-body mt-0.5">
                    <span>PDF Document</span>
                    {formatFileSize(brochure.fileSizeBytes) && (
                      <>
                        <span>•</span>
                        <span>{formatFileSize(brochure.fileSizeBytes)}</span>
                      </>
                    )}
                    {brochure.updatedAt && (
                      <>
                        <span>•</span>
                        <span>
                          Updated{' '}
                          {new Date(brochure.updatedAt).toLocaleDateString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleViewOrDownloadBrochure}
                  disabled={brochureDownloading || brochureUploading || brochureRemoving}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold font-display text-neutral-800 bg-white hover:bg-neutral-100 border border-neutral-300 rounded-lg transition-colors disabled:opacity-50"
                >
                  {brochureDownloading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="h-3.5 w-3.5 text-neutral-600" />
                  )}
                  <span>{brochureDownloading ? 'Downloading...' : 'View / Download'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => brochureFileInputRef.current?.click()}
                  disabled={brochureUploading || brochureRemoving}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold font-display text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors disabled:opacity-50"
                >
                  {brochureUploading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  <span>{brochureUploading ? 'Replacing...' : 'Replace PDF'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleRemoveBrochure}
                  disabled={brochureUploading || brochureRemoving}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold font-display text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors disabled:opacity-50"
                >
                  {brochureRemoving ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                  <span>{brochureRemoving ? 'Removing...' : 'Remove'}</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="p-5 bg-neutral-50 border border-dashed border-neutral-300 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-neutral-800 font-display">
                  Upload Project Brochure (PDF)
                </p>
                <p className="text-xs text-neutral-500 font-body">
                  Accepts verified PDF files up to 10 MB. When no brochure is attached, the download button is hidden on the public project page.
                </p>
              </div>
              <button
                type="button"
                onClick={() => brochureFileInputRef.current?.click()}
                disabled={brochureUploading}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-bold font-display text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-neutral-300 rounded-lg transition-colors shrink-0 shadow-2xs"
              >
                {brochureUploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                <span>{brochureUploading ? 'Uploading PDF...' : 'Upload Brochure PDF'}</span>
              </button>
            </div>
          )}
        </div>

        {/* Action Bar */}
        <div className="flex items-center justify-end gap-3 pt-4">
          <button
            type="button"
            onClick={() => router.push(`/admin/projects/${id}`)}
            className="px-5 py-2.5 text-sm font-bold text-neutral-600 hover:text-neutral-900 border border-neutral-300 rounded-lg transition-colors font-display"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || brochureUploading || brochureRemoving}
            className="flex items-center gap-1.5 px-6 py-2.5 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-neutral-300 rounded-lg transition-colors shadow-xs font-display"
          >
            <Save className="h-4 w-4" />
            {saving ? 'Saving Project...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  );
}
