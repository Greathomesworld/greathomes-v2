'use client';

import React, { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { AdminPageHeader } from '@/src/components/admin/AdminPageHeader';
import { AdminLoadingState } from '@/src/components/admin/AdminLoadingState';
import { AdminErrorState } from '@/src/components/admin/AdminErrorState';
import { getAdminHeaders } from '@/src/lib/adminAuth';
import { Save, AlertTriangle, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

interface EditDeveloperPageProps {
  params: Promise<{ id: string }>;
}

export default function EditDeveloperPage(props: EditDeveloperPageProps) {
  const params = use(props.params);
  const router = useRouter();

  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    shortDescription: '',
    description: '',
    websiteUrl: '',
    status: 'DRAFT',
    featured: false,
    seo: {
      metaTitle: '',
      metaDescription: '',
      canonicalUrl: '',
    },
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const fetchDeveloper = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`/api/admin/developers/${params.id}`, {
          headers: getAdminHeaders(),
        });
        if (!res.ok) throw new Error('Developer profile not found');
        const data = await res.json();
        setFormData({
          name: data.name || '',
          slug: data.slug || '',
          shortDescription: data.shortDescription || '',
          description: data.description || '',
          websiteUrl: data.websiteUrl || '',
          status: data.status || 'DRAFT',
          featured: data.featured || false,
          seo: {
            metaTitle: data.seo?.metaTitle || '',
            metaDescription: data.seo?.metaDescription || '',
            canonicalUrl: data.seo?.canonicalUrl || '',
          },
        });
      } catch (err: any) {
        setError(err.message || 'Error loading developer profile');
      } finally {
        setLoading(false);
      }
    };
    fetchDeveloper();
  }, [params.id]);

  const handleSeoChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      seo: { ...prev.seo, [name]: value },
    }));
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
    setSaving(true);
    setError(null);
    setFieldErrors({});

    try {
      const res = await fetch(`/api/admin/developers/${params.id}`, {
        method: 'PATCH',
        headers: getAdminHeaders(),
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const json = await res.json();
        if (json.error === 'VALIDATION_ERROR' && json.fields) {
          setFieldErrors(json.fields);
          throw new Error(json.message || 'Validation error');
        }
        throw new Error(json.message || 'Failed to update developer profile');
      }

      router.push(`/admin/developers/${params.id}`);
    } catch (err: any) {
      setError(err.message || 'Error occurred while saving modifications');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      <AdminPageHeader
        title="Edit Developer Profile"
        description="Modify developer identity, branding web links, and biographical details."
        breadcrumbs={[
          { label: 'Developers', href: '/admin/developers' },
          { label: formData.name || 'Profile Details', href: `/admin/developers/${params.id}` },
          { label: 'Edit Profile' },
        ]}
      />

      <div className="px-6 max-w-4xl">
        {loading && <AdminLoadingState message="Retrieving developer record data..." />}

        {error && !saving && (
          <AdminErrorState title="Failed to load profile for edit" error={error} onRetry={() => window.location.reload()} />
        )}

        {!loading && (
          <form onSubmit={handleSubmit} className="space-y-6 animate-fade-in">
            {error && saving && (
              <div className="p-4 bg-rose-50 border border-rose-200 text-rose-900 rounded-xl text-xs space-y-2">
                <div className="flex items-center gap-2 font-bold font-display">
                  <AlertTriangle className="h-4 w-4 text-rose-600" />
                  <span>Error Saving Profile Changes</span>
                </div>
                <p className="font-body">{error}</p>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Identity Column */}
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
                    onChange={handleInputChange}
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
                    Used for URL routing: <code>/developers/merlin-group</code>
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

              {/* Settings Column */}
              <div className="bg-white border border-neutral-200 rounded-xl p-6 space-y-5">
                <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-500 font-display">
                  Settings & Visibility
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

              {/* Narrative Content */}
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

              {/* Search Engine Optimization (SEO) */}
              <div className="md:col-span-3 bg-white border border-neutral-200 rounded-xl p-6 space-y-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-500 font-display">
                    Search Engine Optimization (SEO)
                  </h2>
                  <span className="text-[11px] text-neutral-400 font-body">Optional page-level metadata overrides</span>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-neutral-700 font-display">
                      Custom Meta Title
                    </label>
                    <span className="text-[11px] text-neutral-400 font-mono">
                      {(formData.seo?.metaTitle || '').length}/60 chars
                    </span>
                  </div>
                  <input
                    type="text"
                    name="metaTitle"
                    value={formData.seo?.metaTitle || ''}
                    onChange={handleSeoChange}
                    placeholder="e.g. Ambuja Neotia Projects in Kolkata | Great Homes"
                    maxLength={60}
                    className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-2 focus:ring-neutral-900 font-body"
                  />
                  <p className="text-[11px] text-neutral-500 font-body">Overrides default &quot;{formData.name || 'Developer'} Projects in Kolkata | Great Homes&quot;</p>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-neutral-700 font-display">
                      Custom Meta Description
                    </label>
                    <span className="text-[11px] text-neutral-400 font-mono">
                      {(formData.seo?.metaDescription || '').length}/160 chars
                    </span>
                  </div>
                  <textarea
                    name="metaDescription"
                    value={formData.seo?.metaDescription || ''}
                    onChange={handleSeoChange}
                    rows={3}
                    placeholder="e.g. Explore Ambuja Neotia's premier residential complexes, commercial developments, and active locations across Eastern India."
                    maxLength={160}
                    className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-2 focus:ring-neutral-900 font-body"
                  />
                  <p className="text-[11px] text-neutral-500 font-body">Overrides default short description / narrative bio in search engine snippets.</p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-neutral-700 font-display">
                    Canonical URL Override
                  </label>
                  <input
                    type="text"
                    name="canonicalUrl"
                    value={formData.seo?.canonicalUrl || ''}
                    onChange={handleSeoChange}
                    placeholder={`e.g. https://greathomes.co.in/developers/${formData.slug || 'developer-slug'} or /developers/${formData.slug || 'developer-slug'}`}
                    className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-2 focus:ring-neutral-900 font-body"
                  />
                  <p className="text-[11px] text-neutral-500 font-body">Leave blank to use default canonical URL. Accepts https://greathomes.co.in/developers/[slug] or /developers/[slug].</p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2.5 bg-neutral-900 text-white rounded-lg hover:bg-neutral-800 transition-colors shadow-xs flex items-center gap-2 font-semibold text-sm cursor-pointer min-h-[44px]"
              >
                <Save className="h-4 w-4 text-terracotta" />
                <span>{saving ? 'Saving Profile Mod...' : 'Save Profile Changes'}</span>
              </button>
              <Link
                href={`/admin/developers/${params.id}`}
                className="px-5 py-2.5 border border-neutral-300 bg-white rounded-lg text-neutral-700 hover:bg-neutral-50 transition-colors text-sm font-semibold flex items-center gap-2 min-h-[44px]"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Cancel</span>
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
