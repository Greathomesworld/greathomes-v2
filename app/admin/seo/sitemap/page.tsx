'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  FileCode2,
  CheckCircle2,
  ShieldAlert,
  RefreshCw,
  ExternalLink,
  Globe,
  Info,
  AlertTriangle,
  Lock,
} from 'lucide-react';

interface SitemapCategorySummary {
  category: string;
  routePattern: string;
  eligibilityRule: string;
  totalRecords: number;
  includedInSitemap: number;
  excludedFromSitemap: number;
  exclusionBreakdown: string[];
  sampleUrls: string[];
}

const STATIC_SITEMAP_ROUTES = [
  'https://greathomes.co.in',
  'https://greathomes.co.in/projects',
  'https://greathomes.co.in/buy',
  'https://greathomes.co.in/rent',
  'https://greathomes.co.in/developers',
  'https://greathomes.co.in/locations',
  'https://greathomes.co.in/market',
  'https://greathomes.co.in/guides',
  'https://greathomes.co.in/reviews',
];

async function fetchAllProjectsForSitemapAudit(): Promise<any[]> {
  const firstRes = await fetch('/api/projects?page=1&limit=50', { cache: 'no-store' });
  if (!firstRes.ok) throw new Error(`Projects API failed (${firstRes.status})`);
  const firstData = await firstRes.json();
  const items: any[] = Array.isArray(firstData?.data) ? [...firstData.data] : [];
  const totalPages = firstData?.pagination?.totalPages || 1;

  if (totalPages > 1) {
    const promises = [];
    for (let p = 2; p <= totalPages; p++) {
      promises.push(
        fetch(`/api/projects?page=${p}&limit=50`, { cache: 'no-store' }).then(r =>
          r.ok ? r.json() : { data: [] }
        )
      );
    }
    const pages = await Promise.all(promises);
    for (const pg of pages) {
      if (Array.isArray(pg?.data)) items.push(...pg.data);
    }
  }
  return items;
}

export default function SitemapGovernancePage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [developers, setDevelopers] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [resaleListings, setResaleListings] = useState<any[]>([]);
  const [rentalListings, setRentalListings] = useState<any[]>([]);

  const loadGovernanceData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [projItems, devRes, locRes, resaleRes, rentalRes] = await Promise.all([
        fetchAllProjectsForSitemapAudit(),
        fetch('/api/admin/developers?page=1&limit=1000', { cache: 'no-store' }),
        fetch('/api/admin/locations', { cache: 'no-store' }),
        fetch('/api/resale', { cache: 'no-store' }),
        fetch('/api/rent', { cache: 'no-store' }),
      ]);

      const devJson = devRes.ok ? await devRes.json() : { items: [] };
      const locJson = locRes.ok ? await locRes.json() : { items: [] };
      const resaleJson = resaleRes.ok ? await resaleRes.json() : { data: [] };
      const rentalJson = rentalRes.ok ? await rentalRes.json() : { data: [] };

      setProjects(projItems);
      setDevelopers(Array.isArray(devJson?.items) ? devJson.items : []);
      setLocations(Array.isArray(locJson?.items) ? locJson.items : []);
      setResaleListings(Array.isArray(resaleJson?.data) ? resaleJson.data : []);
      setRentalListings(Array.isArray(rentalJson?.data) ? rentalJson.data : []);
    } catch (err: any) {
      setError(err?.message || 'Failed to compute sitemap governance breakdown');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadGovernanceData();
  }, [loadGovernanceData]);

  const summaries = useMemo<SitemapCategorySummary[]>(() => {
    // 1. Projects
    const eligibleProjects = projects.filter(
      p => p.lifecycleStatus === 'PUBLISHED' && Boolean(p.slug && p.slug.trim())
    );
    const draftProjects = projects.filter(p => p.lifecycleStatus === 'DRAFT').length;
    const archivedProjects = projects.filter(p => p.lifecycleStatus === 'ARCHIVED').length;

    // 2. Developers
    const eligibleDevelopers = developers.filter(
      d => (d.status || 'PUBLISHED') === 'PUBLISHED' && Boolean(d.slug && d.slug.trim())
    );
    const nonPubDevelopers = developers.length - eligibleDevelopers.length;

    // 3. Locations
    const eligibleLocations = locations.filter(loc => {
      if (loc.seoEligibility !== undefined) return Boolean(loc.seoEligibility.index);
      const rawDesc = (loc.shortDescription || loc.description || '').trim();
      return (
        loc.status === 'PUBLISHED' &&
        ((loc.publishedProjectCount ?? 0) > 0 ||
          (loc.publishedChildCount ?? 0) > 0 ||
          rawDesc.length >= 20)
      );
    });
    const draftLocations = locations.filter(l => l.status === 'DRAFT').length;
    const archivedLocations = locations.filter(l => l.status === 'ARCHIVED').length;
    const thinPublishedLocations =
      locations.filter(l => l.status === 'PUBLISHED').length - eligibleLocations.length;

    // 4. Resale
    const eligibleResale = resaleListings.filter(
      r =>
        r.lifecycleStatus === 'PUBLISHED' &&
        (r.verificationStatus === 'VERIFIED' || r.isVerified === true) &&
        Boolean(r.slug && r.slug.trim())
    );
    const unverifiedPublishedResale = resaleListings.filter(
      r =>
        r.lifecycleStatus === 'PUBLISHED' &&
        r.verificationStatus !== 'VERIFIED' &&
        !r.isVerified
    ).length;
    const nonPubResale = resaleListings.filter(r => r.lifecycleStatus !== 'PUBLISHED').length;
    const missingSlugResale = resaleListings.filter(r => !r.slug || !r.slug.trim()).length;

    // 5. Rental
    const eligibleRental = rentalListings.filter(
      r =>
        r.lifecycleStatus === 'PUBLISHED' &&
        (r.verificationStatus === 'VERIFIED' || r.isVerified === true) &&
        Boolean(r.slug && r.slug.trim())
    );
    const unverifiedPublishedRental = rentalListings.filter(
      r =>
        r.lifecycleStatus === 'PUBLISHED' &&
        r.verificationStatus !== 'VERIFIED' &&
        !r.isVerified
    ).length;
    const nonPubRental = rentalListings.filter(r => r.lifecycleStatus !== 'PUBLISHED').length;
    const missingSlugRental = rentalListings.filter(r => !r.slug || !r.slug.trim()).length;

    return [
      {
        category: 'Static & Core Intelligence Directories',
        routePattern: '/, /projects, /buy, /rent, /developers, /locations, /market, /guides, /reviews',
        eligibilityRule: 'Publicly accessible top-level discovery and editorial hubs',
        totalRecords: STATIC_SITEMAP_ROUTES.length,
        includedInSitemap: STATIC_SITEMAP_ROUTES.length,
        excludedFromSitemap: 0,
        exclusionBreakdown: [],
        sampleUrls: STATIC_SITEMAP_ROUTES.slice(0, 4),
      },
      {
        category: 'Residential Projects',
        routePattern: 'https://greathomes.co.in/projects/[slug]',
        eligibilityRule: 'lifecycleStatus === PUBLISHED && non-empty slug (paginated without 50-record cap)',
        totalRecords: projects.length,
        includedInSitemap: eligibleProjects.length,
        excludedFromSitemap: projects.length - eligibleProjects.length,
        exclusionBreakdown: [
          ...(draftProjects > 0 ? [`${draftProjects} DRAFT project(s)`] : []),
          ...(archivedProjects > 0 ? [`${archivedProjects} ARCHIVED project(s)`] : []),
        ],
        sampleUrls: eligibleProjects.slice(0, 3).map(p => `https://greathomes.co.in/projects/${p.slug}`),
      },
      {
        category: 'Project Resale Inventory Pages',
        routePattern: 'https://greathomes.co.in/projects/[slug]/resale',
        eligibilityRule:
          'lifecycleStatus === PUBLISHED && non-empty slug (indexable across all inventory tiers, including 0 listings)',
        totalRecords: projects.length,
        includedInSitemap: eligibleProjects.length,
        excludedFromSitemap: projects.length - eligibleProjects.length,
        exclusionBreakdown: [
          ...(draftProjects > 0 ? [`${draftProjects} DRAFT project resale route(s)`] : []),
          ...(archivedProjects > 0 ? [`${archivedProjects} ARCHIVED project resale route(s)`] : []),
        ],
        sampleUrls: eligibleProjects
          .slice(0, 3)
          .map(p => `https://greathomes.co.in/projects/${p.slug}/resale`),
      },
      {
        category: 'Project Rental Inventory Pages',
        routePattern: 'https://greathomes.co.in/projects/[slug]/rent',
        eligibilityRule:
          'lifecycleStatus === PUBLISHED && non-empty slug (indexable across all inventory tiers, including 0 listings)',
        totalRecords: projects.length,
        includedInSitemap: eligibleProjects.length,
        excludedFromSitemap: projects.length - eligibleProjects.length,
        exclusionBreakdown: [
          ...(draftProjects > 0 ? [`${draftProjects} DRAFT project rental route(s)`] : []),
          ...(archivedProjects > 0 ? [`${archivedProjects} ARCHIVED project rental route(s)`] : []),
        ],
        sampleUrls: eligibleProjects
          .slice(0, 3)
          .map(p => `https://greathomes.co.in/projects/${p.slug}/rent`),
      },
      {
        category: 'Real Estate Developers',
        routePattern: 'https://greathomes.co.in/developers/[slug]',
        eligibilityRule: 'status === PUBLISHED && non-empty slug',
        totalRecords: developers.length,
        includedInSitemap: eligibleDevelopers.length,
        excludedFromSitemap: nonPubDevelopers,
        exclusionBreakdown: nonPubDevelopers > 0 ? [`${nonPubDevelopers} non-published developer(s)`] : [],
        sampleUrls: eligibleDevelopers.slice(0, 3).map(d => `https://greathomes.co.in/developers/${d.slug}`),
      },
      {
        category: 'Locations & Micro-Markets',
        routePattern: 'https://greathomes.co.in/locations/[slug]',
        eligibilityRule:
          'status === PUBLISHED && (publishedProjects > 0 || publishedChildren > 0 || description >= 20 chars)',
        totalRecords: locations.length,
        includedInSitemap: eligibleLocations.length,
        excludedFromSitemap: locations.length - eligibleLocations.length,
        exclusionBreakdown: [
          ...(draftLocations > 0 ? [`${draftLocations} DRAFT location(s)`] : []),
          ...(archivedLocations > 0 ? [`${archivedLocations} ARCHIVED location(s)`] : []),
          ...(thinPublishedLocations > 0
            ? [`${thinPublishedLocations} thin PUBLISHED locality/localities (noindex, follow)`]
            : []),
        ],
        sampleUrls: eligibleLocations.slice(0, 3).map(l => `https://greathomes.co.in/locations/${l.slug}`),
      },
      {
        category: 'Resale Listings',
        routePattern: 'https://greathomes.co.in/buy/[slug]',
        eligibilityRule: 'lifecycleStatus === PUBLISHED && verificationStatus === VERIFIED && non-empty slug',
        totalRecords: resaleListings.length,
        includedInSitemap: eligibleResale.length,
        excludedFromSitemap: resaleListings.length - eligibleResale.length,
        exclusionBreakdown: [
          ...(unverifiedPublishedResale > 0
            ? [`${unverifiedPublishedResale} PUBLISHED but UNVERIFIED listing(s) (noindex)`]
            : []),
          ...(nonPubResale > 0 ? [`${nonPubResale} non-published listing(s)`] : []),
          ...(missingSlugResale > 0 ? [`${missingSlugResale} listing(s) missing slug`] : []),
        ],
        sampleUrls: eligibleResale.slice(0, 3).map(r => `https://greathomes.co.in/buy/${r.slug}`),
      },
      {
        category: 'Rental Listings',
        routePattern: 'https://greathomes.co.in/rent/[slug]',
        eligibilityRule: 'lifecycleStatus === PUBLISHED && verificationStatus === VERIFIED && non-empty slug',
        totalRecords: rentalListings.length,
        includedInSitemap: eligibleRental.length,
        excludedFromSitemap: rentalListings.length - eligibleRental.length,
        exclusionBreakdown: [
          ...(unverifiedPublishedRental > 0
            ? [`${unverifiedPublishedRental} PUBLISHED but UNVERIFIED listing(s) (noindex)`]
            : []),
          ...(nonPubRental > 0 ? [`${nonPubRental} non-published listing(s)`] : []),
          ...(missingSlugRental > 0 ? [`${missingSlugRental} listing(s) missing slug`] : []),
        ],
        sampleUrls: eligibleRental.slice(0, 3).map(r => `https://greathomes.co.in/rent/${r.slug}`),
      },
    ];
  }, [projects, developers, locations, resaleListings, rentalListings]);

  const totalIncluded = useMemo(
    () => summaries.reduce((acc, s) => acc + s.includedInSitemap, 0),
    [summaries]
  );
  const totalExcluded = useMemo(
    () => summaries.reduce((acc, s) => acc + s.excludedFromSitemap, 0),
    [summaries]
  );

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-neutral-200 pb-6">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-neutral-500 mb-1 font-display">
            <FileCode2 className="w-3.5 h-3.5 text-neutral-900" />
            <span>SEO Governance • Sitemap & Robots</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-neutral-900 tracking-tight font-display">
            Sitemap & Indexing Eligibility Governance
          </h1>
          <p className="text-sm text-neutral-600 mt-1 font-sans">
            Deterministic inclusion and exclusion rules governing <code className="font-mono text-xs">/sitemap.xml</code> and <code className="font-mono text-xs">/robots.txt</code>.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/sitemap.xml"
            target="_blank"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-neutral-300 bg-white hover:bg-neutral-50 text-xs font-semibold text-neutral-800 transition-colors font-display"
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Open /sitemap.xml</span>
            <ExternalLink className="w-3 h-3" />
          </Link>
          <Link
            href="/robots.txt"
            target="_blank"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-neutral-300 bg-white hover:bg-neutral-50 text-xs font-semibold text-neutral-800 transition-colors font-display"
          >
            <span>Open /robots.txt</span>
            <ExternalLink className="w-3 h-3" />
          </Link>
          <button
            onClick={loadGovernanceData}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50 font-display"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Recalculate</span>
          </button>
        </div>
      </div>

      {/* Important Governance Distinction Notice */}
      <div className="bg-blue-50/80 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
        <Info className="w-5 h-5 text-blue-700 shrink-0 mt-0.5" />
        <div className="text-xs text-blue-900 space-y-1 font-sans leading-relaxed">
          <div className="font-semibold font-display text-sm">
            Sitemap Inclusion vs. Live Google Indexation
          </div>
          <p>
            Inclusion in <code className="font-mono">https://greathomes.co.in/sitemap.xml</code> reflects{' '}
            <strong>Great Homes publication & verification eligibility</strong> (e.g., <code className="font-mono">PUBLISHED</code> lifecycle, <code className="font-mono">VERIFIED</code> listing status, non-empty canonical slug, and minimum location content depth). Sitemap inclusion does not guarantee immediate Google indexing, which is determined asynchronously by Googlebot crawl scheduling.
          </p>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl border border-red-200 bg-red-50 flex items-center gap-3 text-xs text-red-800">
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-xl border border-neutral-200 shadow-xs">
          <span className="text-xs font-medium text-neutral-500 uppercase tracking-wider font-display">
            URLs Included in /sitemap.xml
          </span>
          <div className="text-2xl font-bold text-emerald-700 mt-1 font-display">
            {loading ? '...' : totalIncluded}
          </div>
          <span className="text-[11px] text-neutral-500 mt-1 block font-sans">
            Canonical, deduplicated https://greathomes.co.in URLs
          </span>
        </div>

        <div className="bg-white p-5 rounded-xl border border-neutral-200 shadow-xs">
          <span className="text-xs font-medium text-neutral-500 uppercase tracking-wider font-display">
            Records Excluded by Governance
          </span>
          <div className="text-2xl font-bold text-amber-700 mt-1 font-display">
            {loading ? '...' : totalExcluded}
          </div>
          <span className="text-[11px] text-neutral-500 mt-1 block font-sans">
            Protected from thin/draft/unverified indexation
          </span>
        </div>

        <div className="bg-white p-5 rounded-xl border border-neutral-200 shadow-xs">
          <span className="text-xs font-medium text-neutral-500 uppercase tracking-wider font-display">
            Robots.txt Disallow Rules
          </span>
          <div className="text-sm font-mono font-bold text-neutral-900 mt-2 flex flex-wrap gap-1.5">
            <span className="px-2 py-0.5 rounded bg-neutral-100 border border-neutral-200">/api/</span>
            <span className="px-2 py-0.5 rounded bg-neutral-100 border border-neutral-200">/admin/</span>
            <span className="px-2 py-0.5 rounded bg-neutral-100 border border-neutral-200">/account/</span>
          </div>
          <span className="text-[11px] text-neutral-500 mt-1.5 block font-sans">
            Private staff & customer routes blocked from crawlers
          </span>
        </div>
      </div>

      {/* Category Sitemap Eligibility Table */}
      <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden shadow-xs">
        <div className="px-6 py-4 border-b border-neutral-200">
          <h2 className="text-base font-bold text-neutral-900 font-display">
            Sitemap Eligibility & Exclusion Breakdown by Route Family
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-neutral-50 border-b border-neutral-200 text-[11px] font-semibold uppercase tracking-wider text-neutral-500 font-display">
                <th className="py-3.5 px-4">Route Family & Pattern</th>
                <th className="py-3.5 px-4">Governance Rule</th>
                <th className="py-3.5 px-4">Included</th>
                <th className="py-3.5 px-4">Excluded</th>
                <th className="py-3.5 px-4">Exclusion Breakdown & Sample Canonical URLs</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 text-sm">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-neutral-500 font-sans">
                    Evaluating sitemap inclusion rules across repositories...
                  </td>
                </tr>
              ) : (
                summaries.map(row => (
                  <tr key={row.category} className="hover:bg-neutral-50/80 transition-colors align-top">
                    <td className="py-4 px-4">
                      <div className="font-semibold text-neutral-900 font-display">{row.category}</div>
                      <div className="text-xs font-mono text-neutral-500 mt-0.5">{row.routePattern}</div>
                    </td>
                    <td className="py-4 px-4 text-xs text-neutral-700 font-mono max-w-xs">
                      {row.eligibilityRule}
                    </td>
                    <td className="py-4 px-4">
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 font-display">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {row.includedInSitemap} / {row.totalRecords}
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      {row.excludedFromSitemap > 0 ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 font-display">
                          <ShieldAlert className="w-3.5 h-3.5" />
                          {row.excludedFromSitemap}
                        </span>
                      ) : (
                        <span className="text-xs text-neutral-400 font-display">0</span>
                      )}
                    </td>
                    <td className="py-4 px-4 space-y-2">
                      {row.exclusionBreakdown.length > 0 && (
                        <div className="space-y-0.5">
                          {row.exclusionBreakdown.map((reason, idx) => (
                            <div key={idx} className="text-xs text-amber-800 font-sans flex items-center gap-1.5">
                              <Lock className="w-3 h-3 text-amber-600 shrink-0" />
                              <span>{reason}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {row.sampleUrls.length > 0 && (
                        <div className="space-y-0.5 pt-1">
                          {row.sampleUrls.map(u => (
                            <div key={u} className="text-[11px] font-mono text-neutral-500 truncate max-w-md">
                              {u}
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
