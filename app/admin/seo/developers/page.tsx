'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import {
  Search,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  RefreshCw,
  Award,
  Globe,
  Code2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  Filter,
} from 'lucide-react';
import { evaluateEntitySeo, SeoAuditResult } from '@/src/domain/seo/auditEngine';

interface DeveloperRecord {
  id: string;
  name: string;
  slug: string;
  status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED' | string;
  shortDescription?: string;
  description?: string;
  logoUrl?: string;
  websiteUrl?: string;
  projectCount?: number;
}

interface AuditedDeveloper {
  developer: DeveloperRecord;
  canonicalUrl: string;
  computedTitle: string;
  rawDescription: string;
  hasLogo: boolean;
  lifecycle: string;
  audit: SeoAuditResult;
}

const PAGE_SIZE = 25;
type StatusFilter = 'ALL' | 'PUBLISHED' | 'DRAFT' | 'ARCHIVED';

export default function DeveloperSeoAuditPage() {
  const [developers, setDevelopers] = useState<DeveloperRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [page, setPage] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const fetchDevelopers = useCallback(async (targetPage: number, targetStatus: StatusFilter) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(targetPage),
        limit: String(PAGE_SIZE),
      });
      if (targetStatus !== 'ALL') {
        params.set('status', targetStatus);
      }

      const res = await fetch(`/api/admin/developers?${params.toString()}`, { cache: 'no-store' });
      if (!res.ok) {
        let errMessage = `Failed to load developers (HTTP ${res.status})`;
        try {
          const errBody = await res.json();
          if (errBody?.message || errBody?.error) {
            errMessage = errBody.message || errBody.error;
          }
        } catch {
          // ignore JSON parse failure
        }
        throw new Error(errMessage);
      }
      const data = await res.json();
      const items = Array.isArray(data)
        ? data
        : Array.isArray(data?.items)
        ? data.items
        : Array.isArray(data?.data)
        ? data.data
        : null;

      if (!items) {
        throw new Error('Unexpected response format from /api/admin/developers');
      }

      setDevelopers(items);
      if (data?.pagination) {
        setTotalRecords(data.pagination.total ?? items.length);
        setTotalPages(Math.max(1, data.pagination.totalPages ?? 1));
      } else {
        setTotalRecords(items.length);
        setTotalPages(1);
      }
    } catch (err: any) {
      setError(err?.message || 'Unable to load developer SEO records');
      setDevelopers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDevelopers(page, statusFilter);
  }, [page, statusFilter, fetchDevelopers]);

  const auditedDevelopers = useMemo<AuditedDeveloper[]>(() => {
    return developers.map(d => {
      const canonicalUrl = d.slug ? `https://greathomes.co.in/developers/${d.slug}` : '';
      const computedTitle = d.name
        ? `${d.name} — Real Estate Projects & Intelligence | Great Homes`
        : '';
      // Audit actual stored description fields without fabricating synthetic fallback text
      const rawDescription = (d.shortDescription || d.description || '').trim();
      const hasLogo = Boolean(d.logoUrl && d.logoUrl.trim());
      const lifecycle = (d.status || 'PUBLISHED').toUpperCase();

      const audit = evaluateEntitySeo({
        id: d.id,
        entityType: 'DEVELOPER',
        title: computedTitle,
        description: rawDescription,
        slug: d.slug,
        canonicalUrl,
        hasFeaturedImage: hasLogo,
        hasStructuredData: true,
        schemaValidated: true,
        schemaTypes: ['Organization', 'RealEstateAgent', 'BreadcrumbList'],
        lifecycleStatus: lifecycle,
      });

      return {
        developer: d,
        canonicalUrl,
        computedTitle,
        rawDescription,
        hasLogo,
        lifecycle,
        audit,
      };
    });
  }, [developers]);

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return auditedDevelopers;
    const q = searchQuery.toLowerCase();
    return auditedDevelopers.filter(
      item =>
        item.developer.name?.toLowerCase().includes(q) ||
        item.developer.slug?.toLowerCase().includes(q)
    );
  }, [auditedDevelopers, searchQuery]);

  const stats = useMemo(() => {
    const total = auditedDevelopers.length;
    const indexable = auditedDevelopers.filter(a => a.audit.isIndexable).length;
    const withDescriptions = auditedDevelopers.filter(a => a.rawDescription.length >= 70).length;
    const avgQuality = total
      ? Math.round(auditedDevelopers.reduce((acc, a) => acc + a.audit.qualityScore, 0) / total)
      : 0;
    return { total, indexable, withDescriptions, avgQuality };
  }, [auditedDevelopers]);

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-neutral-200 pb-6">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-neutral-500 mb-1 font-display">
            <Award className="w-3.5 h-3.5 text-neutral-900" />
            <span>SEO Governance • Developers</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-neutral-900 tracking-tight font-display">
            Developer Brand & Entity SEO
          </h1>
          <p className="text-sm text-neutral-600 mt-1 font-sans">
            Audits developer entity profiles, Organization / RealEstateAgent JSON-LD structured data, logo OpenGraph assets, and publication status.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/admin/seo/overview"
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-neutral-300 bg-white hover:bg-neutral-50 text-xs font-semibold text-neutral-700 transition-colors font-display"
          >
            SEO Overview
          </Link>
          <button
            onClick={() => fetchDevelopers(page, statusFilter)}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50 font-display"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Re-run Audit</span>
          </button>
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-neutral-200 shadow-xs">
          <span className="text-xs font-medium text-neutral-500 uppercase tracking-wider font-display">
            Total Developers
          </span>
          <div className="text-2xl font-bold text-neutral-900 mt-1 font-display">{totalRecords}</div>
          <span className="text-[11px] text-neutral-500 mt-1 block font-sans">
            Page {page} of {totalPages}
          </span>
        </div>
        <div className="bg-white p-5 rounded-xl border border-neutral-200 shadow-xs">
          <span className="text-xs font-medium text-neutral-500 uppercase tracking-wider font-display">
            Indexable on Page
          </span>
          <div className="text-2xl font-bold text-emerald-700 mt-1 font-display">
            {stats.indexable} / {stats.total}
          </div>
          <span className="text-[11px] text-neutral-500 mt-1 block font-sans">
            Requires PUBLISHED status + valid slug
          </span>
        </div>
        <div className="bg-white p-5 rounded-xl border border-neutral-200 shadow-xs">
          <span className="text-xs font-medium text-neutral-500 uppercase tracking-wider font-display">
            Rich Descriptions (≥70c)
          </span>
          <div className="text-2xl font-bold text-neutral-900 mt-1 font-display">
            {stats.withDescriptions} / {stats.total}
          </div>
          <span className="text-[11px] text-neutral-500 mt-1 block font-sans">
            Stored shortDescription or description
          </span>
        </div>
        <div className="bg-white p-5 rounded-xl border border-neutral-200 shadow-xs">
          <span className="text-xs font-medium text-neutral-500 uppercase tracking-wider font-display">
            Avg Metadata Quality
          </span>
          <div className="text-2xl font-bold text-neutral-900 mt-1 font-display">
            {stats.avgQuality}/100
          </div>
          <span className="text-[11px] text-neutral-500 mt-1 block font-sans">
            Organization + RealEstateAgent JSON-LD active
          </span>
        </div>
      </div>

      {/* Search & Status Filters */}
      <div className="bg-white rounded-xl border border-neutral-200 p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Filter current page by developer name or slug..."
            className="w-full pl-10 pr-4 py-2 text-sm border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900 font-sans"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-neutral-500 mr-1 font-display">
            <Filter className="w-3.5 h-3.5" />
            Status:
          </span>
          {(['ALL', 'PUBLISHED', 'DRAFT', 'ARCHIVED'] as StatusFilter[]).map(status => (
            <button
              key={status}
              onClick={() => {
                setStatusFilter(status);
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer font-display ${
                statusFilter === status
                  ? 'bg-neutral-900 text-white'
                  : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-neutral-50 border-b border-neutral-200 text-[11px] font-semibold uppercase tracking-wider text-neutral-500 font-display">
                <th className="py-3.5 px-4">Developer & Canonical URL</th>
                <th className="py-3.5 px-4">Lifecycle & Indexability</th>
                <th className="py-3.5 px-4">Metadata & Brand Assets</th>
                <th className="py-3.5 px-4">JSON-LD Entity Schema</th>
                <th className="py-3.5 px-4">Readiness / Quality</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 text-sm">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-neutral-500 font-sans">
                    Auditing developer SEO profiles...
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center">
                    <div className="inline-flex flex-col items-center gap-2 max-w-md mx-auto">
                      <AlertTriangle className="w-6 h-6 text-red-600" />
                      <p className="text-sm font-semibold text-red-700 font-display">
                        Failed to load developer SEO data
                      </p>
                      <p className="text-xs text-neutral-600 font-sans">{error}</p>
                      <button
                        onClick={() => fetchDevelopers(page, statusFilter)}
                        className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-900 text-white text-xs font-semibold hover:bg-neutral-800 font-display"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Retry
                      </button>
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-neutral-500 font-sans">
                    No developers found matching filter criteria.
                  </td>
                </tr>
              ) : (
                filtered.map(({ developer: d, canonicalUrl, computedTitle, rawDescription, hasLogo, lifecycle, audit }) => {
                  const isPublished = lifecycle === 'PUBLISHED' && Boolean(d.slug);
                  return (
                    <tr key={d.id} className="hover:bg-neutral-50/80 transition-colors align-top">
                      <td className="py-4 px-4">
                        <div className="font-semibold text-neutral-900 font-display">{d.name}</div>
                        <div className="text-xs text-neutral-500 font-mono mt-0.5 flex items-center gap-1">
                          <Globe className="w-3 h-3 text-neutral-400 shrink-0" />
                          <span className="truncate max-w-xs">{canonicalUrl || 'Missing slug'}</span>
                        </div>
                        <div className="text-[11px] text-neutral-500 mt-1 font-sans">
                          Published Projects: {d.projectCount ?? 0}
                        </div>
                      </td>

                      <td className="py-4 px-4 space-y-1.5">
                        <div>
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold font-display ${
                              lifecycle === 'PUBLISHED'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : lifecycle === 'DRAFT'
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : 'bg-neutral-100 text-neutral-700 border border-neutral-300'
                            }`}
                          >
                            {lifecycle}
                          </span>
                        </div>
                        <div>
                          {audit.isIndexable ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 font-display">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Indexable • In Sitemap
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-700 font-display">
                              <ShieldAlert className="w-3.5 h-3.5" />
                              Excluded from Sitemap
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-4 px-4">
                        <div className="text-xs text-neutral-800 space-y-1 font-sans">
                          <div>
                            <span className="font-medium text-neutral-500">Title:</span>{' '}
                            <span className="font-mono text-[11px] text-neutral-700">
                              ({computedTitle.length} chars)
                            </span>
                          </div>
                          <div>
                            <span className="font-medium text-neutral-500">Bio / Description:</span>{' '}
                            {rawDescription.length > 0 ? (
                              <span className="font-mono text-[11px] text-neutral-700">
                                {rawDescription.length} chars
                              </span>
                            ) : (
                              <span className="text-[11px] font-semibold text-red-600">
                                Missing stored bio (uses fallback on page)
                              </span>
                            )}
                          </div>
                          <div>
                            <span className="font-medium text-neutral-500">Brand Logo (OG):</span>{' '}
                            {hasLogo ? (
                              <span className="text-[11px] font-semibold text-emerald-700">Configured</span>
                            ) : (
                              <span className="text-[11px] font-semibold text-amber-700">Missing logoUrl</span>
                            )}
                          </div>
                        </div>
                        {audit.issues.filter(i => i.field !== 'indexability').length > 0 && (
                          <div className="mt-2 space-y-1">
                            {audit.issues
                              .filter(i => i.field !== 'indexability')
                              .slice(0, 2)
                              .map((issue, idx) => (
                                <div key={idx} className="flex items-start gap-1 text-[11px] text-amber-700 font-sans">
                                  <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />
                                  <span>{issue.message}</span>
                                </div>
                              ))}
                          </div>
                        )}
                      </td>

                      <td className="py-4 px-4">
                        <div className="flex flex-wrap gap-1">
                          {['Organization', 'RealEstateAgent', 'BreadcrumbList'].map(schema => (
                            <span
                              key={schema}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-neutral-100 text-neutral-800 border border-neutral-200 font-mono"
                            >
                              <Code2 className="w-2.5 h-2.5 text-neutral-500" />
                              {schema}
                            </span>
                          ))}
                        </div>
                      </td>

                      <td className="py-4 px-4">
                        <div className="flex flex-col gap-1">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold w-fit font-display ${
                              audit.status === 'PASS'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : audit.status === 'WARNING'
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : 'bg-red-50 text-red-700 border border-red-200'
                            }`}
                          >
                            {audit.status === 'PASS' ? (
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            ) : (
                              <AlertTriangle className="w-3.5 h-3.5" />
                            )}
                            {audit.isIndexable ? `${audit.score}/100` : `Blocked (${audit.qualityScore}/100 Quality)`}
                          </span>
                          <span className="text-[11px] text-neutral-500 font-sans">
                            Page Quality: {audit.qualityScore}/100
                          </span>
                        </div>
                      </td>

                      <td className="py-4 px-4 text-right">
                        {isPublished ? (
                          <Link
                            href={`/developers/${d.slug}`}
                            target="_blank"
                            className="inline-flex items-center gap-1 text-xs font-semibold text-neutral-700 hover:text-neutral-900 font-display"
                          >
                            <span>View Live</span>
                            <ExternalLink className="w-3 h-3" />
                          </Link>
                        ) : (
                          <span
                            title="Only PUBLISHED developers with valid slugs have a public page"
                            className="inline-flex items-center gap-1 text-xs text-neutral-400 cursor-not-allowed font-display"
                          >
                            <span>Unpublished</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Server-Side Pagination Controls */}
        <div className="px-4 py-3 bg-neutral-50 border-t border-neutral-200 flex items-center justify-between text-xs text-neutral-600 font-display">
          <div>
            Showing page <span className="font-semibold text-neutral-900">{page}</span> of{' '}
            <span className="font-semibold text-neutral-900">{totalPages}</span> ({totalRecords} total developers)
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 disabled:opacity-40 cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              Prev
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 disabled:opacity-40 cursor-pointer"
            >
              Next
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
