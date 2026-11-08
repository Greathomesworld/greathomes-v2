'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminPageHeader } from '@/src/components/admin/AdminPageHeader';
import { getAdminHeaders } from '@/src/lib/adminAuth';
import { Save, AlertTriangle, ArrowLeft, HelpCircle } from 'lucide-react';
import Link from 'next/link';

export default function CreateLocationPage() {
  const router = useRouter();
  const [parentOptions, setParentOptions] = useState<any[]>([]);
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    type: 'CITY',
    parentId: '',
    description: '',
    shortDescription: '',
    latitude: '',
    longitude: '',
    status: 'DRAFT',
    featured: false,
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const fetchParentOptions = async () => {
      try {
        const res = await fetch('/api/admin/locations', {
          headers: getAdminHeaders(),
        });
        if (res.ok) {
          const json = await res.json();
          setParentOptions(json.items || []);
        }
      } catch (err) {
        console.error('Failed to load parent options', err);
      }
    };
    fetchParentOptions();
  }, []);

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const name = e.target.value;
    const derivedSlug = name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();

    setFormData(prev => ({ ...prev, name, slug: derivedSlug }));
    if (fieldErrors.name) setFieldErrors(prev => { const copy = { ...prev }; delete copy.name; return copy; });
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (fieldErrors[name]) setFieldErrors(prev => { const copy = { ...prev }; delete copy[name]; return copy; });
  };

  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = e.target;
    setFormData(prev => ({ ...prev, [name]: checked }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setFieldErrors({});

    // Process optional numbers
    const payload = {
      ...formData,
      parentId: formData.parentId || null,
      latitude: formData.latitude ? parseFloat(formData.latitude) : null,
      longitude: formData.longitude ? parseFloat(formData.longitude) : null,
    };

    try {
      const res = await fetch('/api/admin/locations', {
        method: 'POST',
        headers: getAdminHeaders(),
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const json = await res.json();
        if (json.error === 'VALIDATION_ERROR' && json.fields) {
          setFieldErrors(json.fields);
          throw new Error(json.message || 'Validation error');
        }
        throw new Error(json.message || 'Failed to create location node');
      }

      const created = await res.json();
      router.push(`/admin/locations/${created.id}`);
    } catch (err: any) {
      setError(err.message || 'An error occurred while saving the location');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      <AdminPageHeader
        title="Create Geography Node"
        description="Add a new node to the master sitemap geography tree."
        breadcrumbs={[
          { label: 'Locations', href: '/admin/locations' },
          { label: 'Create Node' },
        ]}
      />

      <div className="px-6 max-w-4xl">
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="p-4 bg-rose-50 border border-rose-200 text-rose-900 rounded-xl text-xs space-y-2">
              <div className="flex items-center gap-2 font-bold font-display">
                <AlertTriangle className="h-4 w-4 text-rose-600" />
                <span>Error Saving Location Node</span>
              </div>
              <p className="font-body">{error}</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Identity & Hierarchy Form Panel */}
            <div className="md:col-span-2 bg-white border border-neutral-200 rounded-xl p-6 space-y-5">
              <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-500 font-display">
                Identity & Hierarchy Placement
              </h2>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-neutral-700 font-display">
                  Location Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleNameChange}
                  placeholder="e.g. Rajarhat"
                  required
                  className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-2 focus:ring-neutral-900 font-body"
                />
                {fieldErrors.name && (
                  <p className="text-[11px] text-rose-600 font-medium font-body">{fieldErrors.name}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-neutral-700 font-display">
                  Canonical URL Slug <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  name="slug"
                  value={formData.slug}
                  onChange={handleInputChange}
                  placeholder="e.g. rajarhat"
                  required
                  className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-2 focus:ring-neutral-900 font-mono"
                />
                {fieldErrors.slug && (
                  <p className="text-[11px] text-rose-600 font-medium font-body">{fieldErrors.slug}</p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-neutral-700 font-display">
                    Hierarchy Tier Level <span className="text-rose-500">*</span>
                  </label>
                  <select
                    name="type"
                    value={formData.type}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-2 focus:ring-neutral-900 font-display"
                  >
                    <option value="STATE">State</option>
                    <option value="DISTRICT">District</option>
                    <option value="CITY">City</option>
                    <option value="DISCOVERY_REGION">Discovery Region</option>
                    <option value="AREA">Area</option>
                    <option value="NEIGHBOURHOOD">Neighbourhood</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-neutral-700 font-display">
                    Parent Location Node
                  </label>
                  <select
                    name="parentId"
                    value={formData.parentId}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-2 focus:ring-neutral-900 font-display"
                  >
                    <option value="">Root Level (No Parent)</option>
                    {parentOptions.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.name} ({opt.type})
                      </option>
                    ))}
                  </select>
                  {fieldErrors.parentId && (
                    <p className="text-[11px] text-rose-600 font-medium font-body">{fieldErrors.parentId}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Publication Panel */}
            <div className="bg-white border border-neutral-200 rounded-xl p-6 space-y-5">
              <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-500 font-display">
                Settings & Visibilities
              </h2>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-neutral-700 font-display">
                  Publish Status
                </label>
                <select
                  name="status"
                  value={formData.status}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-2 focus:ring-neutral-900 font-display"
                >
                  <option value="DRAFT">Draft Node</option>
                  <option value="PUBLISHED">Published Node</option>
                  <option value="ARCHIVED">Archived Node</option>
                </select>
              </div>

              <div className="flex items-center justify-between p-3.5 bg-neutral-50 rounded-lg border border-neutral-200/60">
                <div className="space-y-0.5">
                  <span className="text-xs font-bold text-neutral-800 font-display">Featured Node</span>
                  <p className="text-[11px] text-neutral-500 font-body">Promote on homepage</p>
                </div>
                <input
                  type="checkbox"
                  name="featured"
                  checked={formData.featured}
                  onChange={handleCheckboxChange}
                  className="h-4.5 w-4.5 text-neutral-900 rounded focus:ring-neutral-900 cursor-pointer"
                />
              </div>
            </div>

            {/* Geography & Coordinates Panel */}
            <div className="md:col-span-3 bg-white border border-neutral-200 rounded-xl p-6 space-y-5">
              <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-500 font-display">
                Geography & GIS Mapping
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-neutral-700 font-display">
                    Latitude Coordinate
                  </label>
                  <input
                    type="number"
                    step="0.000001"
                    name="latitude"
                    value={formData.latitude}
                    onChange={handleInputChange}
                    placeholder="e.g. 22.5726"
                    className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-2 focus:ring-neutral-900 font-mono"
                  />
                  {fieldErrors.latitude && (
                    <p className="text-[11px] text-rose-600 font-medium font-body">{fieldErrors.latitude}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-neutral-700 font-display">
                    Longitude Coordinate
                  </label>
                  <input
                    type="number"
                    step="0.000001"
                    name="longitude"
                    value={formData.longitude}
                    onChange={handleInputChange}
                    placeholder="e.g. 88.3639"
                    className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-2 focus:ring-neutral-900 font-mono"
                  />
                  {fieldErrors.longitude && (
                    <p className="text-[11px] text-rose-600 font-medium font-body">{fieldErrors.longitude}</p>
                  )}
                </div>
              </div>
              <p className="text-[11px] text-neutral-500 flex items-center gap-1 font-body">
                <HelpCircle className="h-3.5 w-3.5 text-neutral-400" />
                <span>Areas & Neighbourhood tiers require valid coordinates before they can be successfully published.</span>
              </p>
            </div>

            {/* Narrative & Descriptions */}
            <div className="md:col-span-3 bg-white border border-neutral-200 rounded-xl p-6 space-y-5">
              <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-500 font-display">
                Location Descriptions
              </h2>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-neutral-700 font-display">
                  Short Tagline
                </label>
                <input
                  type="text"
                  name="shortDescription"
                  value={formData.shortDescription}
                  onChange={handleInputChange}
                  placeholder="e.g. Fast-growing IT hub with superior infrastructure and gated townships."
                  maxLength={160}
                  className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-2 focus:ring-neutral-900 font-body"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-neutral-700 font-display">
                  Long Detailed Narrative / Guide
                </label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  rows={4}
                  placeholder="Write comprehensive guide and micromanagement highlights..."
                  className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-2 focus:ring-neutral-900 font-body"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 bg-neutral-900 text-white rounded-lg hover:bg-neutral-800 transition-colors shadow-xs flex items-center gap-2 font-semibold text-sm cursor-pointer min-h-[44px]"
            >
              <Save className="h-4 w-4 text-terracotta" />
              <span>{loading ? 'Saving Node...' : 'Save Location Node'}</span>
            </button>
            <Link
              href="/admin/locations"
              className="px-5 py-2.5 border border-neutral-300 bg-white rounded-lg text-neutral-700 hover:bg-neutral-50 transition-colors text-sm font-semibold flex items-center gap-2 min-h-[44px]"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Cancel</span>
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
