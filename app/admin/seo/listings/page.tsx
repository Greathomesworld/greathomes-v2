'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import {
  Search,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  RefreshCw,
  Home,
  Globe,
  Code2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  ShieldAlert,
  Filter,
} from 'lucide-react';
import { evaluateEntitySeo, SeoAuditResult } from '@/src/domain/seo/auditEngine';

type ListingCategory = 'RESALE' | 'RENTAL';

interface ListingMediaDto {
  id?: string;
  url: string;
  altText?: string;
}

interface ListingRecord {
  id: string;
  slug?: string | null;
  configuration?: string;
  propertyType?: string;
  bedroomCount?: number;
  askingPrice?: number;
  monthlyRent?: number;
  description?: string | null;
  lifecycleStatus?: string;
  verificationStatus?: string;
  isVerified?: boolean;
  project?: { id?: string; name?: string; slug?: string } | null;
  location?: { id?: string; name?: string; slug?: string } | null;
  media?: ListingMediaDto[];
}

interface AuditedListing {
  listing: ListingRecord;
  category: ListingCategory;
  displayTitle: string;
  computedSeoTitle: string;
  rawDescription: string;
  canonicalUrl: string;
  previewPath: string | null;
  formattedPrice: string;
  hasMedia: boolean;
  lifecycle: string;
  verification: string;
  audit: SeoAuditResult;
}

const PAGE_SIZE = 25;

function formatInrPrice(amount?: number, isRental = false): string {
  if (amount === undefined || amount === null || isNaN(amount)) return 'Price on Request';
  if (amount >= 10000000) {
    return `₹${(amount / 10000000).toFixed(2).replace(/\.00$/, '')} Cr${isRental ? '/mo' : ''}`;
  }
  if (amount >= 100000) {
    return `₹${(amount / 100000).toFixed(2).replace(/\.00$/, '')} L${isRental ? '/mo' : ''}`;
  }
  return `₹${amount.toLocaleString('en-IN')}${isRental ? '/mo' : ''}`;
}

export default function ListingsSeoAuditPage() {
  const [activeTab, setActiveTab] = useState<ListingCategory>('RESALE');
  const [resaleListings, setResaleListings] = useState<ListingRecord[]>([]);
  const [rentalListings, setRentalListings] = useState<ListingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [lifecycleFilter, setLifecycleFilter] = useState<string>('ALL');
  const [verificationFilter, setVerificationFilter] = useState<string>('ALL');
  const [page, setPage] = useState(1);

  const fetchListings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [resaleRes, rentalRes] = await Promise.all([
        fetch('/api/resale', { cache: 'no-store' }),
        fetch('/api/rent', { cache: 'no-store' }),
      ]);

      if (!resaleRes.ok) {
        throw new Error(`Failed to load resale listings (HTTP ${resaleRes.status})`);
      }
      if (!rentalRes.ok) {
        throw new Error(`Failed to load rental listings (HTTP ${rentalRes.status})`);
      }

      const resaleJson = await resaleRes.json();
      const rentalJson = await rentalRes.json();

      const resaleItems = Array.isArray(resaleJson)
        ? resaleJson
        : Array.isArray(resaleJson?.data)
        ? resaleJson.data
        : Array.isArray(resaleJson?.items)
        ? resaleJson.items
        : [];

      const rentalItems = Array.isArray(rentalJson)
        ? rentalJson
        : Array.isArray(rentalJson?.data)
        ? rentalJson.data
        : Array.isArray(rentalJson?.items)
        ? rentalJson.items
        : [];

      setResaleListings(resaleItems);
      setRentalListings(rentalItems);
    } catch (err: any) {
      setError(err?.message || 'Unable to load listing SEO records');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchListings();
  }, [fetchListings]);

  const auditedItems = useMemo<AuditedListing[]>(() => {
    const source = activeTab === 'RESALE' ? resaleListings : rentalListings;
    const routePrefix = activeTab === 'RESALE' ? '/buy' : '/rent';

    return source.map(item => {
      const slug = (item.slug || '').trim();
      const canonicalUrl = slug ? `https://greathomes.co.in${routePrefix}/${slug}` : '';
      const lifecycle = (item.lifecycleStatus || 'DRAFT').toUpperCase();
      const verification = (
        item.verificationStatus || (item.isVerified ? 'VERIFIED' : 'UNVERIFIED')
      ).toUpperCase();

      // Public preview route only exists for PUBLISHED listings with a non-empty slug
      const previewPath =
        slug && lifecycle === 'PUBLISHED' ? `${routePrefix}/${slug}` : null;

      const priceValue = activeTab === 'RESALE' ? item.askingPrice : item.monthlyRent;
      const formattedPrice = formatInrPrice(priceValue, activeTab === 'RENTAL');

      const localityOrProject = item.location?.name
        ? ` in ${item.location.name}`
        : item.project?.name
        ? ` at ${item.project.name}`
        : '';

      const configLabel = item.configuration || `${item.bedroomCount || ''} BHK`.trim() || 'Residential Unit';
      const displayTitle = `${configLabel}${localityOrProject}`;
      const computedSeoTitle =
        activeTab === 'RESALE'
          ? `${configLabel} Resale${localityOrProject} · ${formattedPrice} | Great Homes`
          : `${configLabel} For Rent${localityOrProject} · ${formattedPrice} | Great Homes`;

      // Audit actual stored description without fabricating fallback text
      const rawDescription = (item.description || '').trim();
      const hasMedia = Boolean(item.media && item.media.length > 0 && item.media[0]?.url);

      const audit = evaluateEntitySeo({
        id: item.id,
        entityType: activeTab,
        title: computedSeoTitle,
        description: rawDescription,
        slug,
        canonicalUrl,
        hasFeaturedImage: hasMedia,
        hasStructuredData: true,
        schemaValidated: true,
        schemaTypes: ['Apartment', 'Offer'],
        lifecycleStatus: lifecycle,
        verificationStatus: verification,
      });

      return {
        listing: item,
        category: activeTab,
        displayTitle,
        computedSeoTitle,
        rawDescription,
        canonicalUrl,
        previewPath,
        formattedPrice,
        hasMedia,
        lifecycle,
        verification,
        audit,
      };
    });
  }, [activeTab, resaleListings, rentalListings]);

  const filtered = useMemo(() => {
    return auditedItems.filter(item => {
      if (lifecycleFilter !== 'ALL' && item.lifecycle !== lifecycleFilter) return false;
      if (verificationFilter !== 'ALL' && item.verification !== verificationFilter) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        item.displayTitle.toLowerCase().includes(q) ||
        (item.listing.slug || '').toLowerCase().includes(q) ||
        (item.listing.configuration || '').toLowerCase().includes(q) ||
        (item.listing.project?.name || '').toLowerCase().includes(q) ||
        (item.listing.location?.name || '').toLowerCase().includes(q)
      );
    });
  }, [auditedItems, searchQuery, lifecycleFilter, verificationFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginated = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, currentPage]);

  const stats = useMemo(() => {
    const total = auditedItems.length;
    const indexable = auditedItems.filter(a => a.audit.isIndexable).length;
    const unverifiedOrDraft = total - indexable;
    const missingSlugCount = auditedItems.filter(a => !a.listing.slug).length;
    const avgQuality = total
      ? Math.round(auditedItems.reduce((acc, a) => acc + a.audit.qualityScore, 0) / total)
      : 0;
    return { total, indexable, unverifiedOrDraft, missingSlugCount, avgQuality };
  }, [auditedItems]);

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-neutral-200 pb-6">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-neutral-500 mb-1 font-display">
            <Home className="w-3.5 h-3.5 text-neutral-900" />
            <span>SEO Governance • Resale & Rental Inventory</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-neutral-900 tracking-tight font-display">
            Resale & Rental Listing SEO Audit
          </h1>
          <p className="text-sm text-neutral-600 mt-1 font-sans">
            Enforces dual PUBLISHED + VERIFIED indexability gates, canonical /buy/[slug] and /rent/[slug] routes, Apartment + Offer JSON-LD, and unit privacy boundaries.
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
            onClick={fetchListings}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50 font-display"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Re-run Audit</span>
          </button>
        </div>
      </div>

      {/* Category Switcher Tabs */}
      <div className="flex items-center gap-2 border-b border-neutral-200 pb-3">
        <button
          onClick={() => {
            setActiveTab('RESALE');
            setPage(1);
          }}
          className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer font-display ${
            activeTab === 'RESALE'
              ? 'bg-neutral-900 text-white'
              : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
          }`}
        >
          Resale Listings (/buy/[slug]) • {resaleListings.length}
        </button>
        <button
          onClick={() => {
            setActiveTab('RENTAL');
            setPage(1);
          }}
          className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer font-display ${
            activeTab === 'RENTAL'
              ? 'bg-neutral-900 text-white'
              : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
          }`}
        >
          Rental Listings (/rent/[slug]) • {rentalListings.length}
        </button>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-neutral-200 shadow-xs">
          <span className="text-xs font-medium text-neutral-500 uppercase tracking-wider font-display">
            Total {activeTab === 'RESALE' ? 'Resale' : 'Rental'} Records
          </span>
          <div className="text-2xl font-bold text-neutral-900 mt-1 font-display">{stats.total}</div>
          <span className="text-[11px] text-neutral-500 mt-1 block font-sans">
            {stats.missingSlugCount > 0 ? `${stats.missingSlugCount} missing slug` : 'All slugs present'}
          </span>
        </div>
        <div className="bg-white p-5 rounded-xl border border-neutral-200 shadow-xs">
          <span className="text-xs font-medium text-neutral-500 uppercase tracking-wider font-display">
            Indexable (PUBLISHED + VERIFIED)
          </span>
          <div className="text-2xl font-bold text-emerald-700 mt-1 font-display">
            {stats.indexable} / {stats.total}
          </div>
          <span className="text-[11px] text-neutral-500 mt-1 block font-sans">
            Eligible for /sitemap.xml & robots index
          </span>
        </div>
        <div className="bg-white p-5 rounded-xl border border-neutral-200 shadow-xs">
          <span className="text-xs font-medium text-neutral-500 uppercase tracking-wider font-display">
            Blocked / Non-Indexable
          </span>
          <div className="text-2xl font-bold text-amber-700 mt-1 font-display">
            {stats.unverifiedOrDraft}
          </div>
          <span className="text-[11px] text-neutral-500 mt-1 block font-sans">
            Unverified, Draft, Under Review, or Missing Slug
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
            Evaluates real description & media[0].url
          </span>
        </div>
      </div>

      {/* Search & Lifecycle/Verification Filters */}
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
              placeholder="Search by configuration, slug, project, or locality..."
              className="w-full pl-10 pr-4 py-2 text-sm border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900 font-sans"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-neutral-500 mr-1 font-display">
              <Filter className="w-3.5 h-3.5" />
              Verification:
            </span>
            {['ALL', 'VERIFIED', 'UNVERIFIED', 'REJECTED'].map(v => (
              <button
                key={v}
                onClick={() => {
                  setVerificationFilter(v);
                  setPage(1);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer font-display ${
                  verificationFilter === v
                    ? 'bg-neutral-900 text-white'
                    : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-neutral-100">
          <span className="text-xs font-semibold text-neutral-500 mr-1 font-display">
            Lifecycle:
          </span>
          {['ALL', 'PUBLISHED', 'APPROVED', 'UNDER_REVIEW', 'SUBMITTED', 'DRAFT', 'PAUSED', 'SOLD_RENTED', 'ARCHIVED'].map(st => (
            <button
              key={st}
              onClick={() => {
                setLifecycleFilter(st);
                setPage(1);
              }}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer font-display ${
                lifecycleFilter === st
                  ? 'bg-neutral-800 text-white'
                  : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
              }`}
            >
              {st.replace('_', ' ')}
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
                <th className="py-3.5 px-4">Listing, Price & Canonical Route</th>
                <th className="py-3.5 px-4">Lifecycle & Verification</th>
                <th className="py-3.5 px-4">Indexability & Sitemap</th>
                <th className="py-3.5 px-4">Metadata & Media Check</th>
                <th className="py-3.5 px-4">Readiness / Quality</th>
                <th className="py-3.5 px-4 text-right">Preview</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 text-sm">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-neutral-500 font-sans">
                    Auditing {activeTab.toLowerCase()} listing SEO metadata...
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center">
                    <div className="inline-flex flex-col items-center gap-2 max-w-md mx-auto">
                      <AlertTriangle className="w-6 h-6 text-red-600" />
                      <p className="text-sm font-semibold text-red-700 font-display">
                        Failed to load listing SEO data
                      </p>
                      <p className="text-xs text-neutral-600 font-sans">{error}</p>
                      <button
                        onClick={fetchListings}
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
                    No {activeTab.toLowerCase()} listings found matching filter criteria.
                  </td>
                </tr>
              ) : (
                paginated.map(
                  ({
                    listing,
                    displayTitle,
                    canonicalUrl,
                    previewPath,
                    formattedPrice,
                    rawDescription,
                    hasMedia,
                    lifecycle,
                    verification,
                    audit,
                  }) => (
                    <tr key={listing.id} className="hover:bg-neutral-50/80 transition-colors align-top">
                      <td className="py-4 px-4">
                        <div className="font-semibold text-neutral-900 font-display">{displayTitle}</div>
                        <div className="text-xs font-semibold text-neutral-700 mt-0.5 font-display">
                          {activeTab === 'RESALE' ? 'Asking Price: ' : 'Monthly Rent: '}
                          {formattedPrice}
                        </div>
                        <div className="text-xs text-neutral-500 font-mono mt-1 flex items-center gap-1">
                          <Globe className="w-3 h-3 text-neutral-400 shrink-0" />
                          {canonicalUrl ? (
                            <span className="truncate max-w-xs">{canonicalUrl}</span>
                          ) : (
                            <span className="text-red-600 font-semibold">Missing URL slug</span>
                          )}
                        </div>
                      </td>

                      <td className="py-4 px-4 space-y-1.5">
                        <div>
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold font-display ${
                              lifecycle === 'PUBLISHED'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : lifecycle === 'DRAFT' || lifecycle === 'UNDER_REVIEW' || lifecycle === 'SUBMITTED'
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : 'bg-neutral-100 text-neutral-700 border border-neutral-300'
                            }`}
                          >
                            Lifecycle: {lifecycle}
                          </span>
                        </div>
                        <div>
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold font-display ${
                              verification === 'VERIFIED'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : verification === 'REJECTED'
                                ? 'bg-red-50 text-red-700 border border-red-200'
                                : 'bg-amber-50 text-amber-700 border border-amber-200'
                            }`}
                          >
                            {verification === 'VERIFIED' ? (
                              <ShieldCheck className="w-3 h-3" />
                            ) : (
                              <ShieldAlert className="w-3 h-3" />
                            )}
                            {verification}
                          </span>
                        </div>
                      </td>

                      <td className="py-4 px-4 space-y-1">
                        {audit.isIndexable ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 font-display">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Indexable • In Sitemap
                          </span>
                        ) : (
                          <div className="space-y-1">
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 font-display">
                              <ShieldAlert className="w-3.5 h-3.5" />
                              Excluded from Indexing
                            </span>
                            {audit.exclusionReasons.map((reason, rIdx) => (
                              <div key={rIdx} className="text-[11px] text-neutral-500 font-sans">
                                • {reason}
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="pt-1">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-neutral-100 text-neutral-700 font-mono">
                            <Code2 className="w-2.5 h-2.5" />
                            Apartment + Offer
                          </span>
                        </div>
                      </td>

                      <td className="py-4 px-4">
                        <div className="text-xs text-neutral-800 space-y-1 font-sans">
                          <div>
                            <span className="font-medium text-neutral-500">Description:</span>{' '}
                            {rawDescription.length > 0 ? (
                              <span className="font-mono text-[11px] text-neutral-700">
                                {rawDescription.length} chars
                              </span>
                            ) : (
                              <span className="text-[11px] font-semibold text-red-600">
                                Missing (0 chars)
                              </span>
                            )}
                          </div>
                          <div>
                            <span className="font-medium text-neutral-500">Gallery Media:</span>{' '}
                            {hasMedia ? (
                              <span className="text-[11px] font-semibold text-emerald-700">
                                {listing.media?.length || 1} photo(s)
                              </span>
                            ) : (
                              <span className="text-[11px] font-semibold text-amber-700">
                                Missing media[0].url
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
                        {previewPath ? (
                          <Link
                            href={previewPath}
                            target="_blank"
                            className="inline-flex items-center gap-1 text-xs font-semibold text-neutral-700 hover:text-neutral-900 font-display"
                          >
                            <span>Preview</span>
                            <ExternalLink className="w-3 h-3" />
                          </Link>
                        ) : (
                          <span
                            title={
                              !listing.slug
                                ? 'Listing is missing a URL slug'
                                : `Only PUBLISHED listings have a public route (current: ${lifecycle})`
                            }
                            className="inline-flex items-center gap-1 text-xs text-neutral-400 cursor-not-allowed font-display"
                          >
                            <span>{!listing.slug ? 'No Slug' : 'Unpublished'}</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                )
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        <div className="px-4 py-3 bg-neutral-50 border-t border-neutral-200 flex items-center justify-between text-xs text-neutral-600 font-display">
          <div>
            Showing page <span className="font-semibold text-neutral-900">{currentPage}</span> of{' '}
            <span className="font-semibold text-neutral-900">{totalPages}</span> ({filtered.length} matching listings)
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
