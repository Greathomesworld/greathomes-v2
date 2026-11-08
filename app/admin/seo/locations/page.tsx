'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import {
  Search,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  RefreshCw,
  MapPin,
  Globe,
  Code2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  Filter,
} from 'lucide-react';
import { evaluateEntitySeo, SeoAuditResult } from '@/src/domain/seo/auditEngine';

interface LocationSeoEligibilityDto {
  eligible: boolean;
  reason: string;
  index: boolean;
  follow: boolean;
  canonicalUrl: string;
  title: string;
  description: string;
}

interface LocationRecord {
  id: string;
  name: string;
  slug: string;
  type: 'STATE' | 'DISTRICT' | 'CITY' | 'DISCOVERY_REGION' | 'AREA' | 'NEIGHBOURHOOD' | string;
  parentId?: string | null;
  status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  shortDescription?: string | null;
  description?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  featured?: boolean;
  publishedProjectCount?: number;
  publishedChildCount?: number;
  seoEligibility?: LocationSeoEligibilityDto;
}

interface AuditedLocation {
  location: LocationRecord;
  canonicalUrl: string;
  computedTitle: string;
  rawDescription: string;
  hasGeoCoordinates: boolean;
  lifecycle: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  eligibilityReason: string;
  audit: SeoAuditResult;
}

const PAGE_SIZE = 25;
type StatusFilter = 'ALL' | 'PUBLISHED' | 'DRAFT' | 'ARCHIVED';

export default function LocationSeoAuditPage() {
  const [locations, setLocations] = useState<LocationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [page, setPage] = useState(1);

  const fetchLocations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/locations', { cache: 'no-store' });
      if (!res.ok) {
        let errMessage = `Failed to load locations (HTTP ${res.status})`;
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
        throw new Error('Unexpected response format from /api/admin/locations');
      }
      setLocations(items);
    } catch (err: any) {
      setError(err?.message || 'Unable to load location SEO records');
      setLocations([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLocations();
  }, [fetchLocations]);

  const auditedLocations = useMemo<AuditedLocation[]>(() => {
    return locations.map(loc => {
      const canonicalUrl =
        loc.seoEligibility?.canonicalUrl ||
        (loc.slug ? `https://greathomes.co.in/locations/${loc.slug}` : '');
      const computedTitle =
        loc.seoEligibility?.title ||
        (loc.name
          ? `${loc.name} — Residential Projects & Location Intelligence | Great Homes`
          : '');
      // Evaluate real stored description without synthetic fallback inflation
      const rawDescription = (loc.shortDescription || loc.description || '').trim();
      const hasGeoCoordinates =
        loc.latitude !== null &&
        loc.latitude !== undefined &&
        loc.longitude !== null &&
        loc.longitude !== undefined;

      const lifecycle: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED' =
        loc.status === 'DRAFT' || loc.status === 'ARCHIVED' || loc.status === 'PUBLISHED'
          ? loc.status
          : 'DRAFT';

      const projectCount = loc.publishedProjectCount ?? 0;
      const childCount = loc.publishedChildCount ?? 0;
      const hasMeaningfulContent = rawDescription.length >= 20;

      // Determine indexability using locationSeoService eligibility rules
      const isEligible =
        loc.seoEligibility !== undefined
          ? Boolean(loc.seoEligibility.index)
          : lifecycle === 'PUBLISHED' && (projectCount > 0 || childCount > 0 || hasMeaningfulContent);

      const eligibilityReason =
        loc.seoEligibility?.reason ||
        (lifecycle !== 'PUBLISHED'
          ? lifecycle
          : projectCount > 0
          ? 'SUFFICIENT_PROJECT_DEPTH'
          : childCount > 0 || hasMeaningfulContent
          ? 'SUFFICIENT_CONTENT'
          : 'INSUFFICIENT_CONTENT');

      const exclusionReasons: string[] = [];
      if (lifecycle !== 'PUBLISHED') {
        exclusionReasons.push(`Location status is ${lifecycle} (must be PUBLISHED)`);
      } else if (!isEligible) {
        exclusionReasons.push(
          `Thin locality (${eligibilityReason}: 0 published projects, 0 published child areas, and <20 chars description) — emitted as noindex, follow`
        );
      }

      const audit = evaluateEntitySeo({
        id: loc.id,
        entityType: 'LOCATION',
        title: computedTitle,
        description: rawDescription,
        slug: loc.slug,
        canonicalUrl,
        hasFeaturedImage: Boolean(loc.featured),
        hasStructuredData: true,
        schemaValidated: true,
        schemaTypes: ['Place', 'BreadcrumbList'],
        lifecycleStatus: lifecycle,
        isEligible,
        exclusionReasons,
      });

      return {
        location: loc,
        canonicalUrl,
        computedTitle,
        rawDescription,
        hasGeoCoordinates,
        lifecycle,
        eligibilityReason,
        audit,
      };
    });
  }, [locations]);

  const filtered = useMemo(() => {
    return auditedLocations.filter(item => {
      if (typeFilter !== 'ALL' && item.location.type !== typeFilter) return false;
      if (statusFilter !== 'ALL' && item.lifecycle !== statusFilter) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        item.location.name?.toLowerCase().includes(q) ||
        item.location.slug?.toLowerCase().includes(q) ||
        item.location.type?.toLowerCase().includes(q)
      );
    });
  }, [auditedLocations, searchQuery, typeFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginated = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, currentPage]);

  const stats = useMemo(() => {
    const total = auditedLocations.length;
    const published = auditedLocations.filter(a => a.lifecycle === 'PUBLISHED').length;
    const indexable = auditedLocations.filter(a => a.audit.isIndexable).length;
    const excluded = total - indexable;
    const avgQuality = total
      ? Math.round(auditedLocations.reduce((acc, a) => acc + a.audit.qualityScore, 0) / total)
      : 0;
    return { total, published, indexable, excluded, avgQuality };
  }, [auditedLocations]);

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-neutral-200 pb-6">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-neutral-500 mb-1 font-display">
            <MapPin className="w-3.5 h-3.5 text-neutral-900" />
            <span>SEO Governance • Locations & Corridors</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-neutral-900 tracking-tight font-display">
            Location Hierarchy & Sitemap Eligibility Audit
          </h1>
          <p className="text-sm text-neutral-600 mt-1 font-sans">
            Audits LocationStatus (PUBLISHED / DRAFT / ARCHIVED), thin-page noindex protection, Place + GeoCoordinates JSON-LD, and stored editorial descriptions.
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
            onClick={fetchLocations}
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
            Total Locations
          </span>
          <div className="text-2xl font-bold text-neutral-900 mt-1 font-display">{stats.total}</div>
          <span className="text-[11px] text-neutral-500 mt-1 block font-sans">
            {stats.published} PUBLISHED in hierarchy
          </span>
        </div>
        <div className="bg-white p-5 rounded-xl border border-neutral-200 shadow-xs">
          <span className="text-xs font-medium text-neutral-500 uppercase tracking-wider font-display">
            Indexable (In Sitemap)
          </span>
          <div className="text-2xl font-bold text-emerald-700 mt-1 font-display">
            {stats.indexable}
          </div>
          <span className="text-[11px] text-neutral-500 mt-1 block font-sans">
            Passes LocationSeoService depth check
          </span>
        </div>
        <div className="bg-white p-5 rounded-xl border border-neutral-200 shadow-xs">
          <span className="text-xs font-medium text-neutral-500 uppercase tracking-wider font-display">
            Excluded / Noindex
          </span>
          <div className="text-2xl font-bold text-amber-700 mt-1 font-display">
            {stats.excluded}
          </div>
          <span className="text-[11px] text-neutral-500 mt-1 block font-sans">
            Draft, Archived, or Thin (0 projects & &lt;20c bio)
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
            Uninflated stored description quality
          </span>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-neutral-200 p-4 space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search locations by name, slug, or level..."
              className="w-full pl-10 pr-4 py-2 text-sm border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900 font-sans"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-neutral-500 mr-1 font-display">
              <Filter className="w-3.5 h-3.5" />
              Status:
            </span>
            {(['ALL', 'PUBLISHED', 'DRAFT', 'ARCHIVED'] as StatusFilter[]).map(st => (
              <button
                key={st}
                onClick={() => {
                  setStatusFilter(st);
                  setPage(1);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer font-display ${
                  statusFilter === st
                    ? 'bg-neutral-900 text-white'
                    : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-neutral-100">
          <span className="text-xs font-semibold text-neutral-500 mr-1 font-display">
            Hierarchy Level:
          </span>
          {['ALL', 'STATE', 'DISTRICT', 'CITY', 'DISCOVERY_REGION', 'AREA', 'NEIGHBOURHOOD'].map(t => (
            <button
              key={t}
              onClick={() => {
                setTypeFilter(t);
                setPage(1);
              }}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer font-display ${
                typeFilter === t
                  ? 'bg-neutral-800 text-white'
                  : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
              }`}
            >
              {t.replace('_', ' ')}
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
                <th className="py-3.5 px-4">Location & Canonical URL</th>
                <th className="py-3.5 px-4">Lifecycle & Sitemap Eligibility</th>
                <th className="py-3.5 px-4">Depth Signals & Stored Description</th>
                <th className="py-3.5 px-4">JSON-LD Place Schema</th>
                <th className="py-3.5 px-4">Readiness / Quality</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 text-sm">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-neutral-500 font-sans">
                    Auditing location hierarchy and SEO eligibility...
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center">
                    <div className="inline-flex flex-col items-center gap-2 max-w-md mx-auto">
                      <AlertTriangle className="w-6 h-6 text-red-600" />
                      <p className="text-sm font-semibold text-red-700 font-display">
                        Failed to load location SEO data
                      </p>
                      <p className="text-xs text-neutral-600 font-sans">{error}</p>
                      <button
                        onClick={fetchLocations}
                        className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-900 text-white text-xs font-semibold hover:bg-neutral-800 font-display"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Retry
                      </button>
                    </div>
                  </td>
                </tr>
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-neutral-500 font-sans">
                    No locations found matching filter criteria.
                  </td>
                </tr>
              ) : (
                paginated.map(({ location: loc, canonicalUrl, rawDescription, hasGeoCoordinates, lifecycle, eligibilityReason, audit }) => {
                  const isPublished = lifecycle === 'PUBLISHED' && Boolean(loc.slug);
                  return (
                    <tr key={loc.id} className="hover:bg-neutral-50/80 transition-colors align-top">
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-neutral-900 font-display">{loc.name}</span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-neutral-100 text-neutral-700 uppercase font-display">
                            {loc.type?.replace('_', ' ')}
                          </span>
                        </div>
                        <div className="text-xs text-neutral-500 font-mono mt-0.5 flex items-center gap-1">
                          <Globe className="w-3 h-3 text-neutral-400 shrink-0" />
                          <span className="truncate max-w-xs">{canonicalUrl}</span>
                        </div>
                      </td>

                      <td className="py-4 px-4 space-y-1.5">
                        <div className="flex items-center gap-1.5">
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
                          <span className="text-[10px] font-mono text-neutral-500">
                            {eligibilityReason}
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
                              Excluded (noindex / not in sitemap)
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-4 px-4">
                        <div className="text-xs text-neutral-800 space-y-1 font-sans">
                          <div className="flex items-center gap-3">
                            <span>
                              <strong className="font-semibold">{loc.publishedProjectCount ?? 0}</strong> projects
                            </span>
                            <span>•</span>
                            <span>
                              <strong className="font-semibold">{loc.publishedChildCount ?? 0}</strong> sub-localities
                            </span>
                          </div>
                          <div>
                            <span className="font-medium text-neutral-500">Stored Description:</span>{' '}
                            {rawDescription.length > 0 ? (
                              <span className="font-mono text-[11px] text-neutral-700">
                                {rawDescription.length} chars
                              </span>
                            ) : (
                              <span className="text-[11px] font-semibold text-red-600">
                                Empty (0 chars)
                              </span>
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
                        <div className="flex flex-col gap-1">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-neutral-100 text-neutral-800 w-fit font-mono">
                            <Code2 className="w-3.5 h-3.5 text-neutral-600" />
                            Place + BreadcrumbList
                          </span>
                          <span className="text-[11px] text-neutral-500 font-sans">
                            {hasGeoCoordinates ? 'GeoCoordinates attached' : 'No lat/lng coordinates'}
                          </span>
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
                            href={`/locations/${loc.slug}`}
                            target="_blank"
                            className="inline-flex items-center gap-1 text-xs font-semibold text-neutral-700 hover:text-neutral-900 font-display"
                          >
                            <span>View Live</span>
                            <ExternalLink className="w-3 h-3" />
                          </Link>
                        ) : (
                          <span
                            title="Only PUBLISHED locations have a public route"
                            className="inline-flex items-center gap-1 text-xs text-neutral-400 cursor-not-allowed font-display"
                          >
                            <span>{lifecycle}</span>
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

        {/* Pagination Controls */}
        <div className="px-4 py-3 bg-neutral-50 border-t border-neutral-200 flex items-center justify-between text-xs text-neutral-600 font-display">
          <div>
            Showing page <span className="font-semibold text-neutral-900">{currentPage}</span> of{' '}
            <span className="font-semibold text-neutral-900">{totalPages}</span> ({filtered.length} matching locations)
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 disabled:opacity-40 cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              Prev
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
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
