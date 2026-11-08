'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AdminPageHeader } from '@/src/components/admin/AdminPageHeader';
import { AdminLoadingState } from '@/src/components/admin/AdminLoadingState';
import { AdminErrorState } from '@/src/components/admin/AdminErrorState';
import { getAdminHeaders } from '@/src/lib/adminAuth';
import {
  Building2,
  Home,
  IndianRupee,
  UserCheck,
  ArrowLeft,
  Save,
  MapPin,
} from 'lucide-react';
import { LocationMapPicker, CanonicalLocationOption } from '@/src/components/admin/maps/LocationMapPicker';

export default function EditRentalListingPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [initialLoading, setInitialLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [locations, setLocations] = useState<CanonicalLocationOption[]>([]);

  // Form State
  const [isLinkedProject, setIsLinkedProject] = useState(true);
  const [projectId, setProjectId] = useState<string>('');
  const [locationId, setLocationId] = useState<string>('');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [propertyType, setPropertyType] = useState('APARTMENT');
  const [configuration, setConfiguration] = useState('');
  const [bedroomCount, setBedroomCount] = useState<number>(2);
  const [carpetArea, setCarpetArea] = useState<string>('');
  const [builtUpArea, setBuiltUpArea] = useState<string>('');
  const [superBuiltUpArea, setSuperBuiltUpArea] = useState<string>('');

  // Financial
  const [monthlyRent, setMonthlyRent] = useState<string>('');
  const [maintenance, setMaintenance] = useState<string>('');
  const [securityDeposit, setSecurityDeposit] = useState<string>('');

  // Specs & Terms
  const [furnishing, setFurnishing] = useState('SEMI_FURNISHED');
  const [facing, setFacing] = useState('EAST');
  const [floorCategory, setFloorCategory] = useState('MID_FLOOR');
  const [possession, setPossession] = useState('READY');
  const [availabilityDate, setAvailabilityDate] = useState('');
  const [leaseDuration, setLeaseDuration] = useState('11 Months');
  const [noticePeriod, setNoticePeriod] = useState('1 Month');
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
  const [source, setSource] = useState('');
  const [crmId, setCrmId] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        setInitialLoading(true);
        const [listingRes, projRes, locRes] = await Promise.all([
          fetch(`/api/rent/${id}`, { headers: getAdminHeaders() }),
          fetch('/api/projects?limit=100', { headers: getAdminHeaders() }),
          fetch('/api/locations', { headers: getAdminHeaders() }),
        ]);

        if (!listingRes.ok) {
          throw new Error('Failed to load rental listing for editing');
        }

        const lJson = await listingRes.json();
        const l = lJson.data;

        if (projRes.ok) {
          const pJson = await projRes.json();
          setProjects(pJson.data || []);
        }

        if (locRes.ok) {
          const locJson = await locRes.json();
          setLocations(Array.isArray(locJson) ? locJson : locJson.data || []);
        }

        // Prepopulate
        setIsLinkedProject(!!l.projectId || !!l.project);
        setProjectId(l.projectId || l.project?.id || '');
        setLocationId(l.locationId || l.location?.id || '');
        setLatitude(l.latitude !== undefined && l.latitude !== null ? parseFloat(l.latitude) : null);
        setLongitude(l.longitude !== undefined && l.longitude !== null ? parseFloat(l.longitude) : null);
        setPropertyType(l.propertyType || 'APARTMENT');
        setConfiguration(l.configuration || '');
        setBedroomCount(l.bedroomCount || 0);
        setCarpetArea(l.carpetArea?.toString() || '');
        setBuiltUpArea(l.builtUpArea?.toString() || '');
        setSuperBuiltUpArea(l.superBuiltUpArea?.toString() || '');

        setMonthlyRent(l.monthlyRent?.toString() || '');
        setMaintenance(l.maintenance?.toString() || '');
        setSecurityDeposit(l.securityDeposit?.toString() || '');

        setFurnishing(l.furnishing || 'SEMI_FURNISHED');
        setFacing(l.facing || 'EAST');
        setFloorCategory(l.floorCategory || 'MID_FLOOR');
        setPossession(l.possession || 'READY');
        setAvailabilityDate(l.availabilityDate ? l.availabilityDate.split('T')[0] : '');
        setLeaseDuration(l.leaseDuration || '11 Months');
        setNoticePeriod(l.noticePeriod || '1 Month');
        setDescription(l.description || '');

        setListingPartyType(l.listingPartyType || 'OWNER');
        setOwnerName(l.ownerName || '');
        setOwnerPhone(l.ownerPhone || '');
        setOwnerEmail(l.ownerEmail || '');
        setBrokerName(l.brokerName || '');
        setBrokerPhone(l.brokerPhone || '');
        setBrokerEmail(l.brokerEmail || '');
        setPrivatePhone(l.privatePhone || '');
        setPrivateEmail(l.privateEmail || '');
        setInternalNotes(l.internalNotes || '');
        setSource(l.source || '');
        setCrmId(l.crmId || '');
      } catch (err: any) {
        setError(err.message || 'Error fetching rental details');
      } finally {
        setInitialLoading(false);
      }
    };

    if (id) {
      fetchData();
    }
  }, [id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const rentNum = parseFloat(monthlyRent);
    if (isNaN(rentNum) || rentNum <= 0) {
      setError('A valid positive monthly rent is required.');
      return;
    }

    if (!isLinkedProject && !locationId) {
      setError('A canonical Location must be selected for standalone rental listings.');
      return;
    }

    if (!isLinkedProject && ((latitude !== null && longitude === null) || (latitude === null && longitude !== null))) {
      setError('Both latitude and longitude must be provided together.');
      return;
    }

    try {
      setSaving(true);

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
        monthlyRent: rentNum,
        maintenance: maintenance ? parseFloat(maintenance) : null,
        securityDeposit: securityDeposit ? parseFloat(securityDeposit) : null,
        furnishing,
        facing,
        floorCategory,
        possession,
        availabilityDate: availabilityDate ? new Date(availabilityDate) : null,
        leaseDuration: leaseDuration.trim() || null,
        noticePeriod: noticePeriod.trim() || null,
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
        source: source || null,
        crmId: crmId || null,
      };

      const res = await fetch(`/api/rent/${id}`, {
        method: 'PATCH',
        headers: getAdminHeaders(),
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update rental listing');
      }

      router.push(`/admin/listings/rent/${id}`);
    } catch (err: any) {
      setError(err.message || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  if (initialLoading) {
    return <AdminLoadingState message="Loading rental listing for edit..." />;
  }

  if (error && !configuration) {
    return <AdminErrorState title="Error Loading Listing" error={error} onRetry={() => router.refresh()} />;
  }

  return (
    <div className="space-y-6 pb-20">
      <AdminPageHeader
        title={`Edit Rental: ${configuration}`}
        description="Update rental specifications, lease terms, or private landlord contacts."
        breadcrumbs={[
          { label: 'Listings', href: '/admin/listings/resale' },
          { label: 'Rent', href: '/admin/listings/rent' },
          { label: configuration, href: `/admin/listings/rent/${id}` },
          { label: 'Edit' },
        ]}
        secondaryActions={[
          {
            label: 'Cancel',
            onClick: () => router.push(`/admin/listings/rent/${id}`),
            icon: <ArrowLeft className="h-4 w-4" />,
          },
        ]}
      />

      <div className="max-w-4xl mx-auto px-6">
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm font-body">
            <strong className="font-semibold font-display">Update Error: </strong>
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

            {/* Contacts */}
            <div className="bg-neutral-50 p-4 rounded-xl border border-neutral-200/80 space-y-4">
              <p className="text-xs text-neutral-500 font-display uppercase tracking-wider font-semibold">
                Protected Contact Records (Internal Use Only — Never Exposed to Public API)
              </p>
              {listingPartyType === 'OWNER' ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 font-display mb-1">
                      Landlord Name
                    </label>
                    <input
                      type="text"
                      value={ownerName}
                      onChange={(e) => setOwnerName(e.target.value)}
                      placeholder="e.g. Alok Ganguly"
                      className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-lg text-sm text-neutral-800 font-body"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 font-display mb-1">
                      Landlord Phone
                    </label>
                    <input
                      type="tel"
                      value={ownerPhone}
                      onChange={(e) => setOwnerPhone(e.target.value)}
                      placeholder="+919831122334"
                      className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-lg text-sm text-neutral-800 font-body font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 font-display mb-1">
                      Landlord Email
                    </label>
                    <input
                      type="email"
                      value={ownerEmail}
                      onChange={(e) => setOwnerEmail(e.target.value)}
                      placeholder="landlord@example.com"
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
                      placeholder="e.g. City Prime Leasing"
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
                      placeholder="leasing@example.com"
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
                    placeholder="DIRECT_LANDLORD"
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
                    placeholder="CRM-RENT-441"
                    className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-lg text-sm text-neutral-800 font-body font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 font-display mb-1">
                    Internal Notes
                  </label>
                  <input
                    type="text"
                    value={internalNotes}
                    onChange={(e) => setInternalNotes(e.target.value)}
                    placeholder="Tenancy comments..."
                    className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-lg text-sm text-neutral-800 font-body"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 2: PROJECT LINKAGE */}
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
                  Standalone / Unlinked Rental
                </button>
              </div>

              {isLinkedProject ? (
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 font-display mb-1.5">
                    Select Associated Project
                  </label>
                  <select
                    value={projectId}
                    onChange={(e) => setProjectId(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-lg text-sm text-neutral-800 font-body focus:ring-2 focus:ring-neutral-900"
                  >
                    <option value="">-- Select Project --</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} {p.location ? `(${p.location.name})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-200 text-xs text-neutral-600 font-body">
                    Rental operates as an independent residence in the rental discovery feed.
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

          {/* SECTION 3: PHYSICAL SPECIFICATIONS */}
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
                  Configuration Title *
                </label>
                <input
                  type="text"
                  value={configuration}
                  onChange={(e) => setConfiguration(e.target.value)}
                  placeholder="e.g. 2 BHK Semi Furnished"
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
                  placeholder="e.g. 650"
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
                  placeholder="e.g. 790"
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
                  Balcony / Facing Direction
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
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 font-display mb-1.5">
                  Availability Date
                </label>
                <input
                  type="date"
                  value={availabilityDate}
                  onChange={(e) => setAvailabilityDate(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-lg text-sm text-neutral-800 font-body font-mono"
                />
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
                  <option value="READY">Ready for Occupancy</option>
                  <option value="UNDER_CONSTRUCTION">Under Renovation / Finishing</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 font-display mb-1.5">
                  Standard Lease Duration
                </label>
                <input
                  type="text"
                  value={leaseDuration}
                  onChange={(e) => setLeaseDuration(e.target.value)}
                  placeholder="e.g. 11 Months"
                  className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-lg text-sm text-neutral-800 font-body"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 font-display mb-1.5">
                  Notice Period
                </label>
                <input
                  type="text"
                  value={noticePeriod}
                  onChange={(e) => setNoticePeriod(e.target.value)}
                  placeholder="e.g. 1 Month"
                  className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-lg text-sm text-neutral-800 font-body"
                />
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
                placeholder="Sunlit residence..."
                className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-lg text-sm text-neutral-800 font-body focus:ring-2 focus:ring-neutral-900"
              />
            </div>
          </div>

          {/* SECTION 4: FINANCIAL STRUCTURE */}
          <div className="bg-white border border-neutral-200 rounded-xl p-6 shadow-2xs space-y-6">
            <div className="flex items-center gap-3 border-b border-neutral-100 pb-3">
              <IndianRupee className="h-5 w-5 text-terracotta" />
              <h2 className="text-base font-bold text-neutral-900 font-display">
                4. Rental Financial Structure (No Derived Yields)
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 font-display mb-1.5">
                  Monthly Rent (₹ / month) *
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-neutral-400 font-display font-bold">
                    ₹
                  </span>
                  <input
                    type="number"
                    step="any"
                    value={monthlyRent}
                    onChange={(e) => setMonthlyRent(e.target.value)}
                    placeholder="e.g. 28000"
                    required
                    className="w-full pl-8 pr-3 py-2 bg-white border border-neutral-300 rounded-lg text-base font-bold text-neutral-900 font-display font-mono focus:ring-2 focus:ring-neutral-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 font-display mb-1.5">
                  Monthly Maintenance (₹ / month)
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-neutral-400 font-display font-bold">
                    ₹
                  </span>
                  <input
                    type="number"
                    step="any"
                    value={maintenance}
                    onChange={(e) => setMaintenance(e.target.value)}
                    placeholder="e.g. 3500"
                    className="w-full pl-8 pr-3 py-2 bg-white border border-neutral-300 rounded-lg text-sm text-neutral-800 font-body font-mono focus:ring-2 focus:ring-neutral-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 font-display mb-1.5">
                  Security Deposit (₹)
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-neutral-400 font-display font-bold">
                    ₹
                  </span>
                  <input
                    type="number"
                    step="any"
                    value={securityDeposit}
                    onChange={(e) => setSecurityDeposit(e.target.value)}
                    placeholder="e.g. 56000"
                    className="w-full pl-8 pr-3 py-2 bg-white border border-neutral-300 rounded-lg text-sm text-neutral-800 font-body font-mono focus:ring-2 focus:ring-neutral-900"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* SUBMIT BUTTON */}
          <div className="flex items-center justify-end gap-4 pt-4 border-t border-neutral-200">
            <Link
              href={`/admin/listings/rent/${id}`}
              className="px-5 py-2.5 text-sm font-semibold text-neutral-700 bg-white border border-neutral-300 rounded-xl hover:bg-neutral-50 transition-colors font-display"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-semibold text-white bg-neutral-900 hover:bg-neutral-800 rounded-xl transition-colors font-display disabled:opacity-50 cursor-pointer shadow-sm"
            >
              <Save className="h-4 w-4" />
              <span>{saving ? 'Saving Changes...' : 'Save Changes'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
