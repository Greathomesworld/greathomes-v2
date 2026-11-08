'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminPageHeader } from '@/src/components/admin/AdminPageHeader';
import { getAdminHeaders } from '@/src/lib/adminAuth';
import { Building, Save, AlertTriangle, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function CreateDeveloperPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    shortDescription: '',
    description: '',
    websiteUrl: '',
    status: 'DRAFT',
    featured: false,
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [duplicateCandidates, setDuplicateCandidates] = useState<any[]>([]);

  // Automatically derive slug from name
  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const name = e.target.value;
    const derivedSlug = name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '') // remove special chars
      .replace(/\s+/g, '-')         // replace spaces with hyphens
      .replace(/-+/g, '-')          // replace multiple hyphens with single
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

  const handleSubmit = async (e: React.FormEvent, forceDuplicate = false) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setFieldErrors({});
    setDuplicateCandidates([]);

    try {
      const url = `/api/admin/developers${forceDuplicate ? '?allowPotentialDuplicate=true' : ''}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: getAdminHeaders(),
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const json = await res.json();
        if (json.error === 'VALIDATION_ERROR' && json.fields) {
          setFieldErrors(json.fields);
          throw new Error(json.message || 'Validation error');
        }
        if (json.error === 'POTENTIAL_DUPLICATE') {
          setDuplicateCandidates(json.candidates || []);
          throw new Error(json.message);
        }
        throw new Error(json.message || 'Failed to create developer profile');
      }

      const created = await res.json();
      router.push(`/admin/developers/${created.id}`);
    } catch (err: any) {
      setError(err.message || 'Error occurred while saving');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      <AdminPageHeader
        title="Create Developer Profile"
        description="Register a new builder or real estate developer in the master catalog."
        breadcrumbs={[
          { label: 'Developers', href: '/admin/developers' },
          { label: 'Create' },
        ]}
      />

      <div className="px-6 max-w-4xl">
        <form onSubmit={(e) => handleSubmit(e, false)} className="space-y-6">
          {error && (
            <div className="p-4 bg-rose-50 border border-rose-200 text-rose-900 rounded-xl text-xs space-y-2">
              <div className="flex items-center gap-2 font-bold font-display">
                <AlertTriangle className="h-4 w-4 text-rose-600" />
                <span>Error Saving Profile</span>
              </div>
              <p className="font-body">{error}</p>
            </div>
          )}

          {duplicateCandidates.length > 0 && (
            <div className="p-5 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl text-xs space-y-3">
              <div className="flex items-center gap-2 font-bold font-display">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <span>Potential Duplicate Brand Detected</span>
              </div>
              <p className="font-body">
                The name matches one or more existing developer records. Review candidates:
              </p>
              <ul className="list-disc pl-5 font-mono text-[11px] space-y-1">
                {duplicateCandidates.map((c) => (
                  <li key={c.id}>
                    <strong>{c.name}</strong> (slug: {c.slug})
                  </li>
                ))}
              </ul>
              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={(e) => handleSubmit(e, true)}
                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded font-medium cursor-pointer"
                >
                  Ignore & Save Anyway
                </button>
                <Link
                  href="/admin/developers"
                  className="px-3 py-1.5 bg-white border border-amber-300 rounded font-medium text-amber-800 hover:bg-amber-100"
                >
                  Cancel Creation
                </Link>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Identity Info Panel */}
            <div className="md:col-span-2 bg-white border border-neutral-200 rounded-xl p-6 space-y-5">
              <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-500 font-display">
                Identity & Connections
              </h2>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-neutral-700 font-display">
                  Developer Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleNameChange}
                  placeholder="e.g. Merlin Group"
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
                  placeholder="e.g. merlin-group"
                  required
                  className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-2 focus:ring-neutral-900 font-mono"
                />
                <p className="text-[11px] text-neutral-500">
                  Used for SEO routing: <code>/developers/merlin-group</code>
                </p>
                {fieldErrors.slug && (
                  <p className="text-[11px] text-rose-600 font-medium font-body">{fieldErrors.slug}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-neutral-700 font-display">
                  Official Website URL
                </label>
                <input
                  type="url"
                  name="websiteUrl"
                  value={formData.websiteUrl}
                  onChange={handleInputChange}
                  placeholder="e.g. https://www.merlingroup.org"
                  className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-2 focus:ring-neutral-900 font-mono"
                />
                {fieldErrors.websiteUrl && (
                  <p className="text-[11px] text-rose-600 font-medium font-body">{fieldErrors.websiteUrl}</p>
                )}
              </div>
            </div>

            {/* Publication Settings Panel */}
            <div className="bg-white border border-neutral-200 rounded-xl p-6 space-y-5">
              <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-500 font-display">
                Settings & Visibility
              </h2>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-neutral-700 font-display">
                  Initial Status
                </label>
                <select
                  name="status"
                  value={formData.status}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-2 focus:ring-neutral-900 font-display"
                >
                  <option value="DRAFT">Draft Profile</option>
                  <option value="PUBLISHED">Published Profile</option>
                  <option value="ARCHIVED">Archived Profile</option>
                </select>
              </div>

              <div className="flex items-center justify-between p-3.5 bg-neutral-50 rounded-lg border border-neutral-200/60">
                <div className="space-y-0.5">
                  <span className="text-xs font-bold text-neutral-800 font-display">Featured Partner</span>
                  <p className="text-[11px] text-neutral-500 font-body">Pin to featured lists</p>
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

            {/* Profile Content Panel */}
            <div className="md:col-span-3 bg-white border border-neutral-200 rounded-xl p-6 space-y-5">
              <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-500 font-display">
                Profile Narrative Description
              </h2>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-neutral-700 font-display">
                  Short One-Line Description
                </label>
                <input
                  type="text"
                  name="shortDescription"
                  value={formData.shortDescription}
                  onChange={handleInputChange}
                  placeholder="e.g. Premium luxury residential builder with 3 decades of heritage in East India."
                  maxLength={160}
                  className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-2 focus:ring-neutral-900 font-body"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-neutral-700 font-display">
                  Long Detailed Narrative / About
                </label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  rows={6}
                  placeholder="Write comprehensive developer bio, achievements, corporate values, and details..."
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
              <span>{loading ? 'Saving Profile...' : 'Save Developer Profile'}</span>
            </button>
            <Link
              href="/admin/developers"
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
