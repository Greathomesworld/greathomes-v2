'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { EditorialContentType } from '@/src/domain/editorial/entities';
import { Save, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

interface AdminContentEditorViewProps {
  initialData?: any;
}

export function AdminContentEditorView({ initialData }: AdminContentEditorViewProps) {
  const router = useRouter();
  const [formData, setFormData] = useState({
    title: initialData?.title || '',
    slug: initialData?.slug || '',
    type: initialData?.type || 'BUYING_GUIDE',
    excerpt: initialData?.excerpt || '',
    body: initialData?.body || '',
    authorName: initialData?.authorName || 'Great Homes Editorial Team',
    authorRole: initialData?.authorRole || 'Editorial Team',
    featuredImage: initialData?.featuredImage || '',
    seoTitle: initialData?.seoTitle || '',
    seoDescription: initialData?.seoDescription || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditing = !!initialData?.id;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const url = isEditing ? `/api/admin/content/${initialData.id}` : '/api/admin/content';
      const method = isEditing ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save article');
      }

      router.push('/admin/content');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-50 py-8 text-[#111111]">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <Link href="/admin/content" className="inline-flex items-center gap-1 font-display text-xs font-semibold text-stone-500 hover:text-stone-800 mb-6">
          <ArrowLeft className="h-4 w-4" /> Back to Content List
        </Link>

        <form onSubmit={handleSubmit} className="space-y-6 bg-white p-8 rounded-xl border border-stone-200 shadow-xs">
          <h1 className="font-editorial text-2xl font-bold text-[#111111]">
            {isEditing ? 'Edit Editorial Article' : 'Create New Editorial Article'}
          </h1>

          {error && (
            <div className="rounded-lg bg-red-50 p-4 font-body text-xs text-red-800 border border-red-200">
              {error}
            </div>
          )}

          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <label className="block font-display text-xs font-bold text-stone-700">Article Title *</label>
              <input
                type="text"
                required
                value={formData.title}
                onChange={(e) => {
                  const title = e.target.value;
                  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
                  setFormData((prev) => ({ ...prev, title, slug: isEditing ? prev.slug : slug }));
                }}
                className="mt-1 w-full rounded-lg border border-stone-300 p-2.5 font-body text-sm"
              />
            </div>

            <div>
              <label className="block font-display text-xs font-bold text-stone-700">URL Slug *</label>
              <input
                type="text"
                required
                value={formData.slug}
                onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                className="mt-1 w-full rounded-lg border border-stone-300 p-2.5 font-body text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block font-display text-xs font-bold text-stone-700">Content Type *</label>
            <select
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value as EditorialContentType })}
              className="mt-1 w-full rounded-lg border border-stone-300 p-2.5 font-display text-sm bg-white"
            >
              <option value="PROJECT_REVIEW">Project Review</option>
              <option value="BUYING_GUIDE">Buying Guide</option>
              <option value="LOCATION_GUIDE">Location Guide</option>
              <option value="DEVELOPER_STORY">Developer Story</option>
              <option value="MARKET_GUIDE">Market Guide</option>
            </select>
          </div>

          <div>
            <label className="block font-display text-xs font-bold text-stone-700">Excerpt / Summary *</label>
            <textarea
              required
              rows={2}
              value={formData.excerpt}
              onChange={(e) => setFormData({ ...formData, excerpt: e.target.value })}
              className="mt-1 w-full rounded-lg border border-stone-300 p-2.5 font-body text-sm"
            />
          </div>

          <div>
            <label className="block font-display text-xs font-bold text-stone-700">Article Body (Markdown) *</label>
            <textarea
              required
              rows={12}
              value={formData.body}
              onChange={(e) => setFormData({ ...formData, body: e.target.value })}
              className="mt-1 w-full rounded-lg border border-stone-300 p-2.5 font-mono text-xs"
            />
          </div>

          <div className="border-t border-stone-200 pt-6 grid gap-6 sm:grid-cols-2">
            <div>
              <label className="block font-display text-xs font-bold text-stone-700">SEO Title</label>
              <input
                type="text"
                value={formData.seoTitle}
                onChange={(e) => setFormData({ ...formData, seoTitle: e.target.value })}
                className="mt-1 w-full rounded-lg border border-stone-300 p-2.5 font-body text-sm"
              />
            </div>

            <div>
              <label className="block font-display text-xs font-bold text-stone-700">SEO Meta Description</label>
              <input
                type="text"
                value={formData.seoDescription}
                onChange={(e) => setFormData({ ...formData, seoDescription: e.target.value })}
                className="mt-1 w-full rounded-lg border border-stone-300 p-2.5 font-body text-sm"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 border-t border-stone-200 pt-6">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-[#E85D3F] px-6 py-2.5 font-display text-xs font-bold text-white hover:bg-[#d04e33]"
            >
              <Save className="h-4 w-4" />
              <span>{saving ? 'Saving...' : 'Save Article'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
