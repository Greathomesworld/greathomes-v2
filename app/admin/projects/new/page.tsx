'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AdminPageHeader } from '@/src/components/admin/AdminPageHeader';
import { AdminLoadingState } from '@/src/components/admin/AdminLoadingState';
import { AdminErrorState } from '@/src/components/admin/AdminErrorState';
import { getAdminHeaders } from '@/src/lib/adminAuth';
import Link from 'next/link';
import { ArrowLeft, Save, Building, MapPin, DollarSign, Globe, FileText, Check, ExternalLink, AlertCircle } from 'lucide-react';
import { AdminProjectPinMap } from '@/src/components/admin/AdminProjectPinMap';

function formatCoordinates(lat: number, lng: number): string {
  const latDir = lat >= 0 ? 'N' : 'S';
  const lngDir = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(6)}° ${latDir}, ${Math.abs(lng).toFixed(6)}° ${lngDir}`;
}

export default function CreateProjectPage() {
  const router = useRouter();
  
  // Data lists
  const [developers, setDevelopers] = useState<any[]>([]);
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
  const [priceOnRequest, setPriceOnRequest] = useState(false);
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
  
  // RERA states
  const [reraStatus, setReraStatus] = useState('NOT_PROVIDED');
  const [reraRegistrationNumber, setReraRegistrationNumber] = useState('');

  const [saving, setSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [devsRes, locsRes] = await Promise.all([
          fetch('/api/admin/developers?limit=1000', { headers: getAdminHeaders() }),
          fetch('/api/admin/locations', { headers: getAdminHeaders() })
        ]);

        if (!devsRes.ok || !locsRes.ok) {
          throw new Error('Failed to load form lookup data (developers/locations)');
        }

        const devsData = await devsRes.json();
        const locsData = await locsRes.json();

        setDevelopers(devsData.items || []);
        // Only allow published locations
        setLocations((locsData.items || []).filter((loc: any) => loc.status === 'PUBLISHED'));
      } catch (err: any) {
        setError(err.message || 'Error loading lookup data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Slug auto-generation from Name
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
        priceOnRequest,
        shortDescription: shortDescription || null,
        description: description || null,
        projectArea: projectArea.trim() || null,
        towerCount: towerCount.trim() ? parseInt(towerCount, 10) : null,
        totalUnits: totalUnits.trim() ? parseInt(totalUnits, 10) : null,
        floors: floors.trim() || null,
        possession: possession.trim() || null,
        latitude: latitude !== null ? latitude : null,
        longitude: longitude !== null ? longitude : null,
        reraStatus,
        reraRegistrationNumber: reraRegistrationNumber || undefined,
        lifecycleStatus: 'DRAFT', // Always start as Draft
      };

      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: {
          ...getAdminHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create project.');
      }

      const project = await res.json();
      router.push(`/admin/projects/${project.id}`);
    } catch (err: any) {
      setValidationError(err.message || 'An error occurred while saving.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <AdminLoadingState message="Loading form lookups..." />;
  if (error) return <AdminErrorState title="Form Loading Error" error={error} />;

  return (
    <div className="space-y-6 pb-20">
      <AdminPageHeader
        title="Create Residential Project"
        description="Enter core project identity, select relationships, and configure snapshot details."
        breadcrumbs={[
          { label: 'Projects', href: '/admin/projects' },
          { label: 'New Project' },
        ]}
        secondaryActions={[
          {
            label: 'Back to List',
            onClick: () => router.push('/admin/projects'),
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
                  className="w-full text-sm bg-neutral-50 border border-neutral-200 rounded-lg p-2.5 pl-9 focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
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
                  className="w-full text-sm bg-neutral-50 border border-neutral-200 rounded-lg p-2.5 pl-9 focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
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
                className="w-full text-sm bg-neutral-50 border border-neutral-200 rounded-lg p-2.5 focus:outline-hidden focus:ring-1 focus:ring-indigo-500 font-body"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-600 mb-1">Detailed Description (Overview)</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={5}
                placeholder="Full storytelling marketing content details..."
                className="w-full text-sm bg-neutral-50 border border-neutral-200 rounded-lg p-2.5 focus:outline-hidden focus:ring-1 focus:ring-indigo-500 font-body"
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
                className="w-full text-sm bg-neutral-50 border border-neutral-200 rounded-lg p-2.5 focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
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
                className="w-full text-sm bg-neutral-50 border border-neutral-200 rounded-lg p-2.5 focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
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
                {priceOnRequest ? 'Internal Reference Starting Price (₹ INR, Optional)' : 'Starting Price (₹ INR)'}
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={startingPrice}
                  onChange={(e) => setStartingPrice(e.target.value)}
                  placeholder="e.g. 7500000"
                  className="w-full text-sm bg-neutral-50 border border-neutral-200 rounded-lg p-2.5 pl-8 focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                />
                <DollarSign className="absolute left-3 top-3 h-4 w-4 text-neutral-400" />
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-neutral-100">
            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={priceOnRequest}
                onChange={(e) => setPriceOnRequest(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-neutral-300 text-indigo-600 focus:ring-indigo-500"
              />
              <div>
                <span className="text-xs font-bold text-neutral-800 font-display block">
                  Mark Entire Project as Price on Request
                </span>
                <span className="text-[11px] text-neutral-500 font-body block mt-0.5">
                  When enabled, all public project surfaces and typologies display &ldquo;Price on Request&rdquo; while preserving internal reference prices for staff.
                </span>
              </div>
            </label>
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
                className="w-full text-sm bg-neutral-50 border border-neutral-200 rounded-lg p-2.5 focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-600 mb-1">Tower Count</label>
              <input
                type="number"
                value={towerCount}
                onChange={(e) => setTowerCount(e.target.value)}
                placeholder="e.g. 6"
                className="w-full text-sm bg-neutral-50 border border-neutral-200 rounded-lg p-2.5 focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-600 mb-1">Total Units</label>
              <input
                type="number"
                value={totalUnits}
                onChange={(e) => setTotalUnits(e.target.value)}
                placeholder="e.g. 450"
                className="w-full text-sm bg-neutral-50 border border-neutral-200 rounded-lg p-2.5 focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-600 mb-1">Floors</label>
              <input
                type="text"
                value={floors}
                onChange={(e) => setFloors(e.target.value)}
                placeholder="e.g. G+24"
                className="w-full text-sm bg-neutral-50 border border-neutral-200 rounded-lg p-2.5 focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-600 mb-1">Possession Text</label>
              <input
                type="text"
                value={possession}
                onChange={(e) => setPossession(e.target.value)}
                placeholder="e.g. Dec 2027"
                className="w-full text-sm bg-neutral-50 border border-neutral-200 rounded-lg p-2.5 focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>
        </div>

        {/* SECTION 6: RERA */}
        <div className="bg-white p-6 border border-neutral-200/80 rounded-xl space-y-4">
          <h2 className="text-sm font-bold text-neutral-800 uppercase tracking-wider font-display">6. Initial RERA Registry</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-neutral-600 mb-1">RERA Provision Status</label>
              <select
                value={reraStatus}
                onChange={(e) => setReraStatus(e.target.value)}
                className="w-full text-sm bg-neutral-50 border border-neutral-200 rounded-lg p-2.5 focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
              >
                <option value="NOT_PROVIDED">Not Provided</option>
                <option value="PROVIDED">Provided</option>
                <option value="VERIFIED">Verified (Protected action)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-600 mb-1">RERA Registration Number</label>
              <input
                type="text"
                value={reraRegistrationNumber}
                onChange={(e) => setReraRegistrationNumber(e.target.value)}
                placeholder="e.g. WBRERA/P/KOL/2023/000123"
                className="w-full text-sm bg-neutral-50 border border-neutral-200 rounded-lg p-2.5 focus:outline-hidden focus:ring-1 focus:ring-indigo-500 font-mono"
              />
            </div>
          </div>
        </div>

        {/* Action Bar */}
        <div className="flex items-center justify-end gap-3 pt-4">
          <button
            type="button"
            onClick={() => router.push('/admin/projects')}
            className="px-5 py-2.5 text-sm font-bold text-neutral-600 hover:text-neutral-900 border border-neutral-300 rounded-lg transition-colors font-display"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-1.5 px-6 py-2.5 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-neutral-300 rounded-lg transition-colors shadow-xs font-display"
          >
            <Save className="h-4 w-4" />
            {saving ? 'Creating Draft...' : 'Save Draft'}
          </button>
        </div>
      </form>
    </div>
  );
}
