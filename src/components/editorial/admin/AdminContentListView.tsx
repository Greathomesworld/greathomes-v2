'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { EditorialArticle, EditorialContentType, EditorialStatus } from '@/src/domain/editorial/entities';
import { FileText, Plus, Search, Filter, CheckCircle2, Clock, Archive, Send, FileEdit, ExternalLink } from 'lucide-react';

export function AdminContentListView() {
  const [articles, setArticles] = useState<EditorialArticle[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');
  const [selectedType, setSelectedType] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('');

  const fetchArticles = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedType) params.set('type', selectedType);
      if (selectedStatus) params.set('status', selectedStatus);
      if (search) params.set('search', search);

      const res = await fetch(`/api/admin/content?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setArticles(data.items || []);
      }
    } catch (err) {
      console.error('Failed to fetch admin articles:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchArticles();
  }, [selectedType, selectedStatus, search]);

  const handleAction = async (id: string, action: 'submit' | 'approve' | 'publish' | 'archive') => {
    try {
      const res = await fetch(`/api/admin/content/${id}/${action}`, { method: 'POST' });
      if (res.ok) {
        fetchArticles();
      }
    } catch (err) {
      console.error(`Action ${action} failed:`, err);
    }
  };

  const getStatusBadge = (status: EditorialStatus) => {
    switch (status) {
      case 'PUBLISHED':
        return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 font-display"><CheckCircle2 className="h-3 w-3" /> Published</span>;
      case 'APPROVED':
        return <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-800 font-display"><CheckCircle2 className="h-3 w-3" /> Approved</span>;
      case 'IN_REVIEW':
        return <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800 font-display"><Clock className="h-3 w-3" /> In Review</span>;
      case 'ARCHIVED':
        return <span className="inline-flex items-center gap-1 rounded-full bg-stone-200 px-2.5 py-0.5 text-xs font-semibold text-stone-700 font-display"><Archive className="h-3 w-3" /> Archived</span>;
      default:
        return <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-semibold text-stone-600 font-display"><FileEdit className="h-3 w-3" /> Draft</span>;
    }
  };

  return (
    <div className="min-h-screen bg-stone-50 py-8 text-[#111111]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-stone-200 pb-6">
          <div>
            <h1 className="font-editorial text-3xl font-bold text-[#111111]">Editorial Content Management</h1>
            <p className="font-body text-sm text-stone-600 mt-1">Manage, review, approve, and publish Great Homes buyer guides and project reviews.</p>
          </div>
          <Link
            href="/admin/content/new"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#E85D3F] px-4 py-2.5 font-display text-xs font-bold text-white shadow-xs hover:bg-[#d04e33]"
          >
            <Plus className="h-4 w-4" />
            <span>New Editorial Article</span>
          </Link>
        </div>

        {/* Filters */}
        <div className="mt-6 flex flex-col sm:flex-row items-center gap-4 bg-white p-4 rounded-xl border border-stone-200">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by title or slug..."
              className="w-full rounded-lg border border-stone-300 py-2 pl-9 pr-4 text-sm font-body focus:border-[#E85D3F] focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-3 w-full sm:w-auto font-display text-xs">
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="rounded-lg border border-stone-300 py-2 px-3 text-stone-700 bg-white"
            >
              <option value="">All Content Types</option>
              <option value="PROJECT_REVIEW">Project Reviews</option>
              <option value="BUYING_GUIDE">Buying Guides</option>
              <option value="LOCATION_GUIDE">Location Guides</option>
              <option value="DEVELOPER_STORY">Developer Stories</option>
              <option value="MARKET_GUIDE">Market Guides</option>
            </select>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="rounded-lg border border-stone-300 py-2 px-3 text-stone-700 bg-white"
            >
              <option value="">All Statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="IN_REVIEW">In Review</option>
              <option value="APPROVED">Approved</option>
              <option value="PUBLISHED">Published</option>
              <option value="ARCHIVED">Archived</option>
            </select>
          </div>
        </div>

        {/* Articles Table */}
        <div className="mt-6 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-xs">
          {loading ? (
            <div className="p-8 text-center font-display text-stone-500">Loading articles...</div>
          ) : articles.length === 0 ? (
            <div className="p-12 text-center">
              <FileText className="mx-auto h-12 w-12 text-stone-400" />
              <p className="mt-4 font-display font-semibold text-stone-700">No articles match your criteria.</p>
            </div>
          ) : (
            <table className="w-full text-left font-body text-xs">
              <thead className="border-b border-stone-200 bg-stone-50 font-display font-bold uppercase tracking-wider text-stone-500">
                <tr>
                  <th className="px-6 py-3.5">Title & Type</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5">Author</th>
                  <th className="px-6 py-3.5">Updated</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {articles.map((art) => (
                  <tr key={art.id} className="hover:bg-stone-50/80">
                    <td className="px-6 py-4">
                      <Link href={`/admin/content/${art.id}`} className="font-editorial text-sm font-bold text-[#111111] hover:text-[#E85D3F]">
                        {art.title}
                      </Link>
                      <div className="mt-0.5 font-display text-xs text-stone-500">{art.type} • /{art.slug}</div>
                    </td>
                    <td className="px-6 py-4">{getStatusBadge(art.status)}</td>
                    <td className="px-6 py-4 text-stone-600">{art.authorName}</td>
                    <td className="px-6 py-4 text-stone-500">{new Date(art.updatedAt).toLocaleDateString('en-IN')}</td>
                    <td className="px-6 py-4 text-right font-display font-semibold">
                      <div className="flex items-center justify-end gap-2">
                        {art.status === 'DRAFT' && (
                          <button onClick={() => handleAction(art.id, 'submit')} className="rounded px-2.5 py-1 text-amber-700 bg-amber-50 hover:bg-amber-100">
                            Submit
                          </button>
                        )}
                        {art.status === 'IN_REVIEW' && (
                          <button onClick={() => handleAction(art.id, 'approve')} className="rounded px-2.5 py-1 text-blue-700 bg-blue-50 hover:bg-blue-100">
                            Approve
                          </button>
                        )}
                        {(art.status === 'APPROVED' || art.status === 'IN_REVIEW' || art.status === 'DRAFT') && (
                          <button onClick={() => handleAction(art.id, 'publish')} className="rounded px-2.5 py-1 text-emerald-700 bg-emerald-50 hover:bg-emerald-100">
                            Publish
                          </button>
                        )}
                        {art.status === 'PUBLISHED' && (
                          <button onClick={() => handleAction(art.id, 'archive')} className="rounded px-2.5 py-1 text-stone-600 bg-stone-100 hover:bg-stone-200">
                            Archive
                          </button>
                        )}
                        {art.status === 'PUBLISHED' && (
                          <Link href={`/guides/${art.slug}`} target="_blank" className="p-1 text-stone-400 hover:text-stone-700">
                            <ExternalLink className="h-4 w-4" />
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
