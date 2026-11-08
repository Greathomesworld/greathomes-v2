'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AdminPageHeader } from '@/src/components/admin/AdminPageHeader';
import { getAdminHeaders } from '@/src/lib/adminAuth';
import {
  Building2,
  Home,
  IndianRupee,
  Layers,
  Sparkles,
  Image as ImageIcon,
  UserCheck,
  ArrowLeft,
  Save,
  Plus,
  Trash2,
  MapPin,
} from 'lucide-react';
import { LocationMapPicker, CanonicalLocationOption } from '@/src/components/admin/maps/LocationMapPicker';

export default function NewResaleListingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState<any[]>([]);
  const [locations, setLocations] = useState<CanonicalLocationOption[]>([]);
  const [availableAmenities, setAvailableAmenities] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [isLinkedProject, setIsLinkedProject] = useState(true);
  const [projectId, setProjectId] = useState<string>('');
  const [locationId, setLocationId] = useState<string>('');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [propertyType, setPropertyType] = useState('APARTMENT');
  const [configuration, setConfiguration] = useState('');
  const [bedroomCount, setBedroomCount] = useState<number>(3);
  const [carpetArea, setCarpetArea] = useState<string>('');
  const [builtUpArea, setBuiltUpArea] = useState<string>('');
  const [superBuiltUpArea, setSuperBuiltUpArea] = useState<string>('');
  const [askingPrice, setAskingPrice] = useState<string>('');
  const [furnishing, setFurnishing] = useState('SEMI_FURNISHED');
  const [facing, setFacing] = useState('NORTH_EAST');
  const [floorCategory, setFloorCategory] = useState('MID_FLOOR');
  const [possession, setPossession] = useState('READY');
  const [possessionDate, setPossessionDate] = useState('');
  const [description, setDescription] = useState('');

  // Ownership & Identity
  const [listingPartyType, setListingPartyType] = useState<'OWNER' | 'LISTING_PARTNER'>('OWNER');
  const [ownerName, setOwnerName] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [brokerName, setBrokerName] = useState('');
  const [brokerPhone, setBrokerPhone] = useState('');
  const [brokerEmail, setBrokerEmail] = useState('');
  const [privatePhone, setPrivatePhone] = useState('');
  const [privateEmail, setPrivateEmail] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [source, setSource] = useState('ADMIN_PORTAL');
  const [crmId, setCrmId] = useState('');

  // Amenities & Media
  const [selectedAmenities, setSelectedAmenities] = useState<string[]>([]);
  const [mediaList, setMediaList] = useState<Array<{ url: string; caption: string; category: string; isFeatured: boolean }>>([
    { url: '', caption: '', category: 'INTERIOR', isFeatured: true },
  ]);

  useEffect(() => {
    // Load projects and locations
    const fetchDependencies = async () => {
      try {
        const [projRes, locRes, amenRes] = await Promise.all([
          fetch('/api/projects?limit=100', { headers: getAdminHeaders() }),
          fetch('/api/locations', { headers: getAdminHeaders() }),
          fetch('/api/admin/amenities', { headers: getAdminHeaders() }),
        ]);

        if (projRes.ok) {
          const pJson = await projRes.json();
          setProjects(pJson.data || []);
          if (pJson.data?.length > 0) {
            setProjectId(pJson.data[0].id);
          }
        }

        if (locRes.ok) {
          const lJson = await locRes.json();
          const locList = Array.isArray(lJson) ? lJson : lJson.data || [];
          setLocations(locList);
          if (locList.length > 0) {
            setLocationId(locList[0].id);
          }
        }

        if (amenRes.ok) {
          const aJson = await amenRes.json();
          setAvailableAmenities(aJson.data || []);
        }
      } catch (err) {
        console.error('Error fetching dependencies:', err);
      }
    };

    fetchDependencies();
  }, []);

  const toggleAmenity = (id: string) => {
    setSelectedAmenities(prev =>
      prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]
    );
  };

  const handleMediaChange = (index: number, field: string, value: any) => {
    const updated = [...mediaList];
    updated[index] = { ...updated[index], [field]: value };
    setMediaList(updated);
  };

  const addMediaRow = () => {
    setMediaList([...mediaList, { url: '', caption: '', category: 'INTERIOR', isFeatured: false }]);
  };

  const removeMediaRow = (index: number) => {
    setMediaList(mediaList.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!configuration.trim()) {
      setError('Property configuration is required (e.g., "3 BHK Executive").');
      return;
    }

    const priceNum = parseFloat(askingPrice);
    if (isNaN(priceNum) || priceNum <= 0) {
      setError('Valid total asking price is required.');
      return;
    }

    if (!isLinkedProject && !locationId) {
      setError('Canonical location is required for standalone listings.');
      return;
    }

    if (!isLinkedProject && ((latitude !== null && longitude === null) || (latitude === null && longitude !== null))) {
      setError('Both latitude and longitude must be provided together.');
      return;
    }

    try {
      setLoading(true);

      const payload = {
        projectId: isLinkedProject && projectId ? projectId : null,
        locationId: !isLinkedProject && locationId ? locationId : null,
        latitude: !isLinkedProject && latitude !== null ? latitude : null,
        longitude: !isLinkedProject && longitude !== null ? longitude : null,
        propertyType,
        configuration: configuration.trim(),
        bedroomCount: Number(bedroomCount),
        carpetArea: carpetArea ? parseFloat(carpetArea) : null,
        builtUpArea: builtUpArea ? parseFloat(builtUpArea) : null,
        superBuiltUpArea: superBuiltUpArea ? parseFloat(superBuiltUpArea) : null,
        askingPrice: priceNum,
        furnishing,
        facing,
        floorCategory,
        possession,
        possessionDate: possessionDate ? new Date(possessionDate) : null,
        description: description.trim() || null,
        listingPartyType,
        ownerName: listingPartyType === 'OWNER' ? ownerName || null : null,
        ownerPhone: listingPartyType === 'OWNER' ? ownerPhone || null : null,
        ownerEmail: listingPartyType === 'OWNER' ? ownerEmail || null : null,
        brokerName: listingPartyType === 'LISTING_PARTNER' ? brokerName || null : null,
        brokerPhone: listingPartyType === 'LISTING_PARTNER' ? brokerPhone || null : null,
        brokerEmail: listingPartyType === 'LISTING_PARTNER' ? brokerEmail || null : null,
        privatePhone: privatePhone || null,
        privateEmail: privateEmail || null,
        internalNotes: internalNotes || null,
        source: source || 'ADMIN_PORTAL',
        crmId: crmId || null,
      };

      const res = await fetch('/api/resale', {
        method: 'POST',
        headers: getAdminHeaders(),
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create resale listing');
      }

      const json = await res.json();
      const createdListing = json.data;

      // Associate Amenities
      if (createdListing?.id && selectedAmenities.length > 0) {
        for (const amenId of selectedAmenities) {
          await fetch(`/api/resale/${createdListing.id}/amenities`, {
            method: 'POST',
            headers: getAdminHeaders(),
            body: JSON.stringify({ amenityId: amenId }),
          }).catch(console.error);
        }
      }

      // Add valid Media
      if (createdListing?.id && mediaList.length > 0) {
        for (const m of mediaList) {
          if (m.url && m.url.trim()) {
            await fetch(`/api/resale/${createdListing.id}/media`, {
              method: 'POST',
              headers: getAdminHeaders(),
              body: JSON.stringify({
                mediaType: 'IMAGE',
                category: m.category,
                url: m.url.trim(),
                caption: m.caption.trim() || null,
                isFeatured: m.isFeatured,
              }),
            }).catch(console.error);
          }
        }
      }

      router.push(`/admin/listings/resale/${createdListing.id}`);
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 pb-20">
      <AdminPageHeader
        title="Create Resale Listing"
        description="Add a new residential resale listing with strict pricing bounds and verified owner or partner disclosures."
        breadcrumbs={[
          { label: 'Listings', href: '/admin/listings/resale' },
          { label: 'Resale', href: '/admin/listings/resale' },
          { label: 'New Listing' },
        ]}
        secondaryActions={[
          {
            label: 'Cancel',
            onClick: () => router.push('/admin/listings/resale'),
            icon: <ArrowLeft className="h-4 w-4" />,
          },
        ]}
      />

      <div className="max-w-4xl mx-auto px-6">
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm font-body">
            <strong className="font-semibold font-display">Validation Error: </strong>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* SECTION 1: IDENTITY & PARTY */}
          <div className="bg-white border border-neutral-200 rounded-xl p-6 shadow-2xs space-y-6">
            <div className="flex items-center gap-3 border-b border-neutral-100 pb-3">
              <UserCheck className="h-5 w-5 text-terracotta" />
              <h2 className="text-base font-bold text-neutral-900 font-display">
                1. Listing Party & Identification
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 font-display mb-1.5">
                  Listing Party Type *
                </label>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer text-sm font-body text-neutral-800">
                    <input
                      type="radio"
                      name="partyType"
                      checked={listingPartyType === 'OWNER'}
                      onChange={() => setListingPartyType('OWNER')}
                      className="text-terracotta focus:ring-terracotta"
                    />
                    <span>Owner Listed</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-sm font-body text-neutral-800">
                    <input
                      type="radio"
                      name="partyType"
                      checked={listingPartyType === 'LISTING_PARTNER'}
                      onChange={() => setListingPartyType('LISTING_PARTNER')}
                      className="text-terracotta focus:ring-terracotta"
                    />
                    <span>Listing Partner</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 font-display mb-1.5">
                  Property Classification *
                </label>
                <select
                  value={propertyType}
                  onChange={(e) => setPropertyType(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-lg text-sm text-neutral-800 font-body focus:ring-2 focus:ring-neutral-900"
                >
                  <option value="APARTMENT">Apartment</option>
                  <option value="PENTHOUSE">Penthouse</option>
                  <option value="VILLA">Villa</option>
                  <option value="INDEPENDENT_HOUSE">Independent House</option>
                  <option value="DUPLEX">Duplex</option>
                </select>
              </div>
            </div>

            {/* Owner or Broker Contact Information (Protected Admin Only) */}
            <div className="bg-neutral-50 p-4 rounded-xl border border-neutral-200/80 space-y-4">
              <p className="text-xs text-neutral-500 font-display uppercase tracking-wider font-semibold">
                Protected Contact Records (Internal Use Only — Never Exposed to Public API)
              </p>
              {listingPartyType === 'OWNER' ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 font-display mb-1">
                      Owner Name
                    </label>
                    <input
                      type="text"
                      value={ownerName}
                      onChange={(e) => setOwnerName(e.target.value)}
                      placeholder="e.g. Ramesh Chandra"
                      className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-lg text-sm text-neutral-800 font-body"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 font-display mb-1">
                      Owner Phone
                    </label>
                    <input
                      type="tel"
                      value={ownerPhone}
                      onChange={(e) => setOwnerPhone(e.target.value)}
                      placeholder="+919830012345"
                      className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-lg text-sm text-neutral-800 font-body font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 font-display mb-1">
                      Owner Email
                    </label>
                    <input
                      type="email"
                      value={ownerEmail}
                      onChange={(e) => setOwnerEmail(e.target.value)}
                      placeholder="owner@example.com"
                      className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-lg text-sm text-neutral-800 font-body"
                    />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 font-display mb-1">
                      Partner / Agency Name
                    </label>
                    <input
                      type="text"
                      value={brokerName}
                      onChange={(e) => setBrokerName(e.target.value)}
                      placeholder="e.g. Skyline Premier Realty"
                      className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-lg text-sm text-neutral-800 font-body"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 font-display mb-1">
                      Partner Phone
                    </label>
                    <input
                      type="tel"
                      value={brokerPhone}
                      onChange={(e) => setBrokerPhone(e.target.value)}
                      placeholder="+919830098765"
                      className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-lg text-sm text-neutral-800 font-body font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 font-display mb-1">
                      Partner Email
                    </label>
                    <input
                      type="email"
                      value={brokerEmail}
                      onChange={(e) => setBrokerEmail(e.target.value)}
                      placeholder="partner@example.com"
                      className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-lg text-sm text-neutral-800 font-body"
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 font-display mb-1">
                    Internal Source
                  </label>
                  <input
                    type="text"
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
                    placeholder="DIRECT_CALL / REFERRAL"
                    className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-lg text-sm text-neutral-800 font-body"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 font-display mb-1">
                    CRM Record ID
                  </label>
                  <input
                    type="text"
                    value={crmId}
                    onChange={(e) => setCrmId(e.target.value)}
                    placeholder="CRM-98432"
                    className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-lg text-sm text-neutral-800 font-body font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 font-display mb-1">
                    Internal Staff Notes
                  </label>
                  <input
                    type="text"
                    value={internalNotes}
                    onChange={(e) => setInternalNotes(e.target.value)}
                    placeholder="Private verification comments..."
                    className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-lg text-sm text-neutral-800 font-body"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 2: PROJECT ASSOCIATION */}
          <div className="bg-white border border-neutral-200 rounded-xl p-6 shadow-2xs space-y-6">
            <div className="flex items-center gap-3 border-b border-neutral-100 pb-3">
              <Building2 className="h-5 w-5 text-terracotta" />
              <h2 className="text-base font-bold text-neutral-900 font-display">
                2. Project Linkage & Context
              </h2>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => setIsLinkedProject(true)}
                  className={`px-4 py-2 text-xs font-semibold rounded-lg font-display transition-colors ${
                    isLinkedProject
                      ? 'bg-neutral-900 text-white'
                      : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                  }`}
                >
                  Link to Catalog Project
                </button>
                <button
                  type="button"
                  onClick={() => setIsLinkedProject(false)}
                  className={`px-4 py-2 text-xs font-semibold rounded-lg font-display transition-colors ${
                    !isLinkedProject
                      ? 'bg-neutral-900 text-white'
                      : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                  }`}
                >
                  Standalone / Unlinked Resale
                </button>
              </div>

              {isLinkedProject ? (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 font-display mb-1.5">
                      Select Associated Project *
                    </label>
                    <select
                      value={projectId}
                      onChange={(e) => setProjectId(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-lg text-sm text-neutral-800 font-body focus:ring-2 focus:ring-neutral-900"
                    >
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} {p.location ? `(${p.location.name})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  {(() => {
                    const selProj = projects.find((p) => p.id === projectId);
                    return selProj ? (
                      <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-200/80 text-xs font-body text-neutral-700 space-y-1">
                        <div className="flex items-center gap-1.5 font-display font-semibold text-neutral-900">
                          <MapPin className="h-3.5 w-3.5 text-terracotta" />
                          <span>Inherited Geographic Context</span>
                        </div>
                        <p className="text-neutral-600">
                          Location: <strong className="text-neutral-800">{selProj.location?.name || 'Kolkata'}</strong>
                          {selProj.developer ? ` · Developer: ${selProj.developer.name}` : ''}
                        </p>
                        <p className="text-neutral-500 text-[11px]">
                          Project-linked residences automatically resolve location taxonomy through the catalog project. Listing-level coordinate overrides are locked.
                        </p>
                      </div>
                    ) : null;
                  })()}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-200 text-xs text-neutral-600 font-body">
                    Listing will be created as an independent standalone residence in the secondary marketplace.
                  </div>

                  <LocationMapPicker
                    locationId={locationId}
                    latitude={latitude}
                    longitude={longitude}
                    onChangeLocation={(newLocId) => setLocationId(newLocId)}
                    onChangeCoordinates={({ latitude: newLat, longitude: newLng }) => {
                      setLatitude(newLat);
                      setLongitude(newLng);
                    }}
                    locations={locations}
                    error={error}
                  />
                </div>
              )}
            </div>
          </div>

          {/* SECTION 3: PROPERTY DETAILS */}
          <div className="bg-white border border-neutral-200 rounded-xl p-6 shadow-2xs space-y-6">
            <div className="flex items-center gap-3 border-b border-neutral-100 pb-3">
              <Home className="h-5 w-5 text-terracotta" />
              <h2 className="text-base font-bold text-neutral-900 font-display">
                3. Physical Residence Specifications
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 font-display mb-1.5">
                  BHK / Configuration Title *
                </label>
                <input
                  type="text"
                  value={configuration}
                  onChange={(e) => setConfiguration(e.target.value)}
                  placeholder="e.g. 3 BHK Executive"
                  required
                  className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-lg text-sm text-neutral-800 font-body focus:ring-2 focus:ring-neutral-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 font-display mb-1.5">
                  Bedroom Count *
                </label>
                <input
                  type="number"
                  min="0"
                  max="12"
                  value={bedroomCount}
                  onChange={(e) => setBedroomCount(parseInt(e.target.value, 10) || 0)}
                  className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-lg text-sm text-neutral-800 font-body font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 font-display mb-1.5">
                  Carpet Area (sq.ft.)
                </label>
                <input
                  type="number"
                  step="any"
                  value={carpetArea}
                  onChange={(e) => setCarpetArea(e.target.value)}
                  placeholder="e.g. 920"
                  className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-lg text-sm text-neutral-800 font-body font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 font-display mb-1.5">
                  Built-up Area (sq.ft.)
                </label>
                <input
                  type="number"
                  step="any"
                  value={builtUpArea}
                  onChange={(e) => setBuiltUpArea(e.target.value)}
                  placeholder="e.g. 1120"
                  className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-lg text-sm text-neutral-800 font-body font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 font-display mb-1.5">
                  Super Built-up Area (sq.ft.)
                </label>
                <input
                  type="number"
                  step="any"
                  value={superBuiltUpArea}
                  onChange={(e) => setSuperBuiltUpArea(e.target.value)}
                  placeholder="e.g. 1380"
                  className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-lg text-sm text-neutral-800 font-body font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 font-display mb-1.5">
                  Furnishing Status *
                </label>
                <select
                  value={furnishing}
                  onChange={(e) => setFurnishing(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-lg text-sm text-neutral-800 font-body focus:ring-2 focus:ring-neutral-900"
                >
                  <option value="UNFURNISHED">Unfurnished</option>
                  <option value="SEMI_FURNISHED">Semi Furnished</option>
                  <option value="FULLY_FURNISHED">Fully Furnished</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 font-display mb-1.5">
                  Balcony / Facing Direction *
                </label>
                <select
                  value={facing}
                  onChange={(e) => setFacing(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-lg text-sm text-neutral-800 font-body focus:ring-2 focus:ring-neutral-900"
                >
                  <option value="NORTH">North</option>
                  <option value="NORTH_EAST">North-East</option>
                  <option value="EAST">East</option>
                  <option value="SOUTH_EAST">South-East</option>
                  <option value="SOUTH">South</option>
                  <option value="SOUTH_WEST">South-West</option>
                  <option value="WEST">West</option>
                  <option value="NORTH_WEST">North-West</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 font-display mb-1.5">
                  Floor Category (Coarse Privacy Lock) *
                </label>
                <select
                  value={floorCategory}
                  onChange={(e) => setFloorCategory(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-lg text-sm text-neutral-800 font-body focus:ring-2 focus:ring-neutral-900"
                >
                  <option value="LOWER_FLOOR">Lower Floor (Ground - 4th)</option>
                  <option value="MID_FLOOR">Mid Floor (5th - 14th)</option>
                  <option value="HIGH_FLOOR">High Floor (15th+)</option>
                </select>
                <p className="text-[11px] text-neutral-400 font-body mt-1">
                  Exact floor number is strictly forbidden from public disclosure.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 font-display mb-1.5">
                  Possession Status *
                </label>
                <select
                  value={possession}
                  onChange={(e) => setPossession(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-lg text-sm text-neutral-800 font-body focus:ring-2 focus:ring-neutral-900"
                >
                  <option value="READY">Ready to Move</option>
                  <option value="UNDER_CONSTRUCTION">Under Construction</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 font-display mb-1.5">
                Editorial Description
              </label>
              <textarea
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="High-floor residence overlooking landscaped central spine, custom Italian modular kitchen, premium marble flooring..."
                className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-lg text-sm text-neutral-800 font-body focus:ring-2 focus:ring-neutral-900"
              />
            </div>
          </div>

          {/* SECTION 4: FINANCIAL GOVERNANCE */}
          <div className="bg-white border border-neutral-200 rounded-xl p-6 shadow-2xs space-y-6">
            <div className="flex items-center gap-3 border-b border-neutral-100 pb-3">
              <IndianRupee className="h-5 w-5 text-terracotta" />
              <h2 className="text-base font-bold text-neutral-900 font-display">
                4. Financial Governance (Single Asking Price Standard)
              </h2>
            </div>

            <div className="max-w-md">
              <label className="block text-xs font-semibold text-neutral-700 font-display mb-1.5">
                Total Asking Price (₹) *
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-neutral-400 font-display font-bold">
                  ₹
                </span>
                <input
                  type="number"
                  step="any"
                  value={askingPrice}
                  onChange={(e) => setAskingPrice(e.target.value)}
                  placeholder="e.g. 7500000"
                  required
                  className="w-full pl-8 pr-3 py-2 bg-white border border-neutral-300 rounded-lg text-base font-bold text-neutral-900 font-display font-mono focus:ring-2 focus:ring-neutral-900"
                />
              </div>
              <p className="text-xs text-neutral-500 font-body mt-2 leading-relaxed">
                <strong className="text-neutral-700">Strict Financial Rule:</strong> Only total asking price is permitted. Great Homes policy strictly prohibits configuring, computing, or exposing price/sq.ft or effective yields for secondary resale listings.
              </p>
            </div>
          </div>

          {/* SECTION 5: AMENITIES */}
          <div className="bg-white border border-neutral-200 rounded-xl p-6 shadow-2xs space-y-6">
            <div className="flex items-center gap-3 border-b border-neutral-100 pb-3">
              <Sparkles className="h-5 w-5 text-terracotta" />
              <h2 className="text-base font-bold text-neutral-900 font-display">
                5. Canonical Amenities Selection
              </h2>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
              {availableAmenities.map((amenity) => {
                const isSelected = selectedAmenities.includes(amenity.id);
                return (
                  <button
                    key={amenity.id}
                    type="button"
                    onClick={() => toggleAmenity(amenity.id)}
                    className={`flex items-center justify-between p-2.5 rounded-lg border text-xs font-medium font-body transition-colors cursor-pointer text-left ${
                      isSelected
                        ? 'border-neutral-900 bg-neutral-900 text-white'
                        : 'border-neutral-200 bg-neutral-50 text-neutral-700 hover:bg-neutral-100'
                    }`}
                  >
                    <span className="line-clamp-1">{amenity.name}</span>
                    {isSelected && <span className="ml-1 text-emerald-400">✓</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* SECTION 6: INITIAL MEDIA */}
          <div className="bg-white border border-neutral-200 rounded-xl p-6 shadow-2xs space-y-6">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <div className="flex items-center gap-3">
                <ImageIcon className="h-5 w-5 text-terracotta" />
                <h2 className="text-base font-bold text-neutral-900 font-display">
                  6. Residence Photography & Media
                </h2>
              </div>
              <button
                type="button"
                onClick={addMediaRow}
                className="inline-flex items-center gap-1 text-xs font-semibold text-neutral-900 hover:text-terracotta font-display cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Image URL</span>
              </button>
            </div>

            <div className="space-y-3">
              {mediaList.map((media, idx) => (
                <div key={idx} className="flex items-center gap-3 bg-neutral-50 p-3 rounded-lg border border-neutral-200">
                  <div className="flex-1">
                    <input
                      type="url"
                      placeholder="https://images.unsplash.com/..."
                      value={media.url}
                      onChange={(e) => handleMediaChange(idx, 'url', e.target.value)}
                      className="w-full px-3 py-1.5 bg-white border border-neutral-300 rounded text-xs text-neutral-800 font-mono"
                    />
                  </div>
                  <div className="w-36">
                    <select
                      value={media.category}
                      onChange={(e) => handleMediaChange(idx, 'category', e.target.value)}
                      className="w-full px-2 py-1.5 bg-white border border-neutral-300 rounded text-xs text-neutral-800 font-body"
                    >
                      <option value="INTERIOR">Interior</option>
                      <option value="EXTERIOR">Exterior</option>
                      <option value="LOBBY">Lobby</option>
                      <option value="AMENITIES">Amenities</option>
                      <option value="BALCONY_VIEW">Balcony View</option>
                    </select>
                  </div>
                  <div className="w-48">
                    <input
                      type="text"
                      placeholder="Caption (e.g. Master Bedroom)"
                      value={media.caption}
                      onChange={(e) => handleMediaChange(idx, 'caption', e.target.value)}
                      className="w-full px-3 py-1.5 bg-white border border-neutral-300 rounded text-xs text-neutral-800 font-body"
                    />
                  </div>
                  <label className="flex items-center gap-1.5 text-xs text-neutral-600 font-body whitespace-nowrap cursor-pointer">
                    <input
                      type="checkbox"
                      checked={media.isFeatured}
                      onChange={(e) => handleMediaChange(idx, 'isFeatured', e.target.checked)}
                      className="rounded text-terracotta"
                    />
                    <span>Featured</span>
                  </label>
                  {mediaList.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeMediaRow(idx)}
                      className="p-1.5 text-neutral-400 hover:text-rose-600 cursor-pointer"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* SUBMIT BUTTON */}
          <div className="flex items-center justify-end gap-4 pt-4 border-t border-neutral-200">
            <Link
              href="/admin/listings/resale"
              className="px-5 py-2.5 text-sm font-semibold text-neutral-700 bg-white border border-neutral-300 rounded-xl hover:bg-neutral-50 transition-colors font-display"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-semibold text-white bg-neutral-900 hover:bg-neutral-800 rounded-xl transition-colors font-display disabled:opacity-50 cursor-pointer shadow-sm"
            >
              <Save className="h-4 w-4" />
              <span>{loading ? 'Creating Listing...' : 'Create Resale Listing'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
