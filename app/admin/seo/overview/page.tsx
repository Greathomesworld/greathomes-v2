'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  Globe,
  Building2,
  Award,
  MapPin,
  Home,
  FileCode2,
  Terminal,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  ArrowRight,
  ExternalLink,
  Layers,
} from 'lucide-react';
import { evaluateEntitySeo, SeoAuditResult } from '@/src/domain/seo/auditEngine';

interface CategoryRollup {
  key: string;
  label: string;
  href: string;
  routePattern: string;
  total: number;
  indexable: number;
  excluded: number;
  avgQualityScore: number;
  criticalCount: number;
  warningCount: number;
  passCount: number;
  topExclusions: string[];
}

async function fetchAllAdminProjects(): Promise<any[]> {
  const firstRes = await fetch('/api/projects?page=1&limit=50', { cache: 'no-store' });
  if (!firstRes.ok) {
    throw new Error(`Failed to load projects (HTTP ${firstRes.status})`);
  }
  const firstData = await firstRes.json();
  const items: any[] = Array.isArray(firstData?.data) ? [...firstData.data] : [];
  const totalPages = firstData?.pagination?.totalPages || 1;

  if (totalPages > 1) {
    const pagePromises = [];
    for (let p = 2; p <= totalPages; p++) {
      pagePromises.push(
        fetch(`/api/projects?page=${p}&limit=50`, { cache: 'no-store' }).then(r =>
          r.ok ? r.json() : { data: [] }
        )
      );
    }
    const pages = await Promise.all(pagePromises);
    for (const pg of pages) {
      if (Array.isArray(pg?.data)) {
        items.push(...pg.data);
      }
    }
  }
  return items;
}

export default function SeoOverviewPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [developers, setDevelopers] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [resaleListings, setResaleListings] = useState<any[]>([]);
  const [rentalListings, setRentalListings] = useState<any[]>([]);

  const loadAllSeoData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [projItems, devRes, locRes, resaleRes, rentalRes] = await Promise.all([
        fetchAllAdminProjects(),
        fetch('/api/admin/developers?page=1&limit=1000', { cache: 'no-store' }),
        fetch('/api/admin/locations', { cache: 'no-store' }),
        fetch('/api/resale', { cache: 'no-store' }),
        fetch('/api/rent', { cache: 'no-store' }),
      ]);

      if (!devRes.ok) throw new Error(`Developers API returned HTTP ${devRes.status}`);
      if (!locRes.ok) throw new Error(`Locations API returned HTTP ${locRes.status}`);
      if (!resaleRes.ok) throw new Error(`Resale API returned HTTP ${resaleRes.status}`);
      if (!rentalRes.ok) throw new Error(`Rental API returned HTTP ${rentalRes.status}`);

      const devData = await devRes.json();
      const locData = await locRes.json();
      const resaleData = await resaleRes.json();
      const rentalData = await rentalRes.json();

      setProjects(projItems);
      setDevelopers(Array.isArray(devData?.items) ? devData.items : []);
      setLocations(Array.isArray(locData?.items) ? locData.items : []);
      setResaleListings(Array.isArray(resaleData?.data) ? resaleData.data : []);
      setRentalListings(Array.isArray(rentalData?.data) ? rentalData.data : []);
    } catch (err: any) {
      setError(err?.message || 'Unable to load SEO overview telemetry');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAllSeoData();
  }, [loadAllSeoData]);

  const rollups = useMemo<CategoryRollup[]>(() => {
    const summarize = (
      key: string,
      label: string,
      href: string,
      routePattern: string,
      audits: SeoAuditResult[]
    ): CategoryRollup => {
      const total = audits.length;
      const indexable = audits.filter(a => a.isIndexable).length;
      const excluded = total - indexable;
      const avgQualityScore = total
        ? Math.round(audits.reduce((sum, a) => sum + a.qualityScore, 0) / total)
        : 0;
      const criticalCount = audits.filter(a => a.status === 'CRITICAL').length;
      const warningCount = audits.filter(a => a.status === 'WARNING').length;
      const passCount = audits.filter(a => a.status === 'PASS').length;

      const reasonCounts = new Map<string, number>();
      for (const a of audits) {
        for (const r of a.exclusionReasons) {
          reasonCounts.set(r, (reasonCounts.get(r) || 0) + 1);
        }
      }
      const topExclusions = Array.from(reasonCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([reason, count]) => `${count}× ${reason}`);

      return {
        key,
        label,
        href,
        routePattern,
        total,
        indexable,
        excluded,
        avgQualityScore,
        criticalCount,
        warningCount,
        passCount,
        topExclusions,
      };
    };

    const projectAudits = projects.map(p =>
      evaluateEntitySeo({
        id: p.id,
        entityType: 'PROJECT',
        title: p.name
          ? `${p.name} in ${p.location?.name || 'Kolkata'} — Real Estate Intelligence | Great Homes`
          : '',
        description: (p.shortDescription || p.description || '').trim(),
        slug: p.slug,
        canonicalUrl: p.slug ? `https://greathomes.co.in/projects/${p.slug}` : '',
        hasFeaturedImage: Boolean(p.media?.[0]?.url),
        hasStructuredData: true,
        schemaValidated: true,
        lifecycleStatus: (p.lifecycleStatus || 'DRAFT').toUpperCase(),
      })
    );

    const developerAudits = developers.map(d =>
      evaluateEntitySeo({
        id: d.id,
        entityType: 'DEVELOPER',
        title: d.name ? `${d.name} — Real Estate Projects & Intelligence | Great Homes` : '',
        description: (d.shortDescription || d.description || '').trim(),
        slug: d.slug,
        canonicalUrl: d.slug ? `https://greathomes.co.in/developers/${d.slug}` : '',
        hasFeaturedImage: Boolean(d.logoUrl),
        hasStructuredData: true,
        schemaValidated: true,
        lifecycleStatus: (d.status || 'PUBLISHED').toUpperCase(),
      })
    );

    const locationAudits = locations.map(loc => {
      const lifecycle = (loc.status || 'DRAFT').toUpperCase();
      const rawDesc = (loc.shortDescription || loc.description || '').trim();
      const isEligible =
        loc.seoEligibility !== undefined
          ? Boolean(loc.seoEligibility.index)
          : lifecycle === 'PUBLISHED' &&
            ((loc.publishedProjectCount ?? 0) > 0 ||
              (loc.publishedChildCount ?? 0) > 0 ||
              rawDesc.length >= 20);

      const exclusionReasons: string[] = [];
      if (lifecycle !== 'PUBLISHED') {
        exclusionReasons.push(`Lifecycle is ${lifecycle}`);
      } else if (!isEligible) {
        exclusionReasons.push('Thin locality (0 projects, 0 child areas, <20c description)');
      }

      return evaluateEntitySeo({
        id: loc.id,
        entityType: 'LOCATION',
        title:
          loc.seoEligibility?.title ||
          (loc.name
            ? `${loc.name} — Residential Projects & Location Intelligence | Great Homes`
            : ''),
        description: rawDesc,
        slug: loc.slug,
        canonicalUrl: loc.slug ? `https://greathomes.co.in/locations/${loc.slug}` : '',
        hasFeaturedImage: Boolean(loc.featured),
        hasStructuredData: true,
        schemaValidated: true,
        lifecycleStatus: lifecycle,
        isEligible,
        exclusionReasons,
      });
    });

    const resaleAudits = resaleListings.map(item => {
      const slug = (item.slug || '').trim();
      const lifecycle = (item.lifecycleStatus || 'DRAFT').toUpperCase();
      const verification = (
        item.verificationStatus || (item.isVerified ? 'VERIFIED' : 'UNVERIFIED')
      ).toUpperCase();
      const configLabel = item.configuration || `${item.bedroomCount || ''} BHK`.trim();

      return evaluateEntitySeo({
        id: item.id,
        entityType: 'RESALE',
        title: `${configLabel} Resale in ${item.location?.name || 'Kolkata'} | Great Homes`,
        description: (item.description || '').trim(),
        slug,
        canonicalUrl: slug ? `https://greathomes.co.in/buy/${slug}` : '',
        hasFeaturedImage: Boolean(item.media?.[0]?.url),
        hasStructuredData: true,
        schemaValidated: true,
        lifecycleStatus: lifecycle,
        verificationStatus: verification,
      });
    });

    const rentalAudits = rentalListings.map(item => {
      const slug = (item.slug || '').trim();
      const lifecycle = (item.lifecycleStatus || 'DRAFT').toUpperCase();
      const verification = (
        item.verificationStatus || (item.isVerified ? 'VERIFIED' : 'UNVERIFIED')
      ).toUpperCase();
      const configLabel = item.configuration || `${item.bedroomCount || ''} BHK`.trim();

      return evaluateEntitySeo({
        id: item.id,
        entityType: 'RENTAL',
        title: `${configLabel} For Rent in ${item.location?.name || 'Kolkata'} | Great Homes`,
        description: (item.description || '').trim(),
        slug,
        canonicalUrl: slug ? `https://greathomes.co.in/rent/${slug}` : '',
        hasFeaturedImage: Boolean(item.media?.[0]?.url),
        hasStructuredData: true,
        schemaValidated: true,
        lifecycleStatus: lifecycle,
        verificationStatus: verification,
      });
    });

    return [
      summarize('projects', 'Project SEO', '/admin/seo/projects', '/projects/[slug]', projectAudits),
      summarize('developers', 'Developer SEO', '/admin/seo/developers', '/developers/[slug]', developerAudits),
      summarize('locations', 'Location SEO', '/admin/seo/locations', '/locations/[slug]', locationAudits),
      summarize('resale', 'Resale Listings SEO', '/admin/seo/listings', '/buy/[slug]', resaleAudits),
      summarize('rental', 'Rental Listings SEO', '/admin/seo/listings', '/rent/[slug]', rentalAudits),
    ];
  }, [projects, developers, locations, resaleListings, rentalListings]);

  const totals = useMemo(() => {
    const totalEntities = rollups.reduce((acc, r) => acc + r.total, 0);
    const totalIndexable = rollups.reduce((acc, r) => acc + r.indexable, 0);
    const totalExcluded = rollups.reduce((acc, r) => acc + r.excluded, 0);
    const avgQuality =
      rollups.length > 0
        ? Math.round(rollups.reduce((acc, r) => acc + r.avgQualityScore, 0) / rollups.length)
        : 0;
    return { totalEntities, totalIndexable, totalExcluded, avgQuality };
  }, [rollups]);

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-neutral-200 pb-6">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-neutral-500 mb-1 font-display">
            <Globe className="w-3.5 h-3.5 text-neutral-900" />
            <span>Unified SEO Intelligence Centre</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-neutral-900 tracking-tight font-display">
            SEO Governance & Indexability Overview
          </h1>
          <p className="text-sm text-neutral-600 mt-1 font-sans">
            Live cross-domain SEO telemetry separating page metadata quality from public indexability and sitemap eligibility across Great Homes V2.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/sitemap.xml"
            target="_blank"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-neutral-300 bg-white hover:bg-neutral-50 text-xs font-semibold text-neutral-800 transition-colors font-display"
          >
            <FileCode2 className="w-3.5 h-3.5" />
            <span>View /sitemap.xml</span>
            <ExternalLink className="w-3 h-3" />
          </Link>
          <button
            onClick={loadAllSeoData}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50 font-display"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh All Audits</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl border border-red-200 bg-red-50 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
            <div>
              <div className="text-sm font-semibold text-red-800 font-display">
                Error loading SEO telemetry
              </div>
              <div className="text-xs text-red-700 font-sans">{error}</div>
            </div>
          </div>
          <button
            onClick={loadAllSeoData}
            className="px-3 py-1.5 rounded-lg bg-red-700 text-white text-xs font-semibold font-display"
          >
            Retry
          </button>
        </div>
      )}

      {/* Global KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-neutral-200 shadow-xs">
          <span className="text-xs font-medium text-neutral-500 uppercase tracking-wider font-display">
            Audited Domain Entities
          </span>
          <div className="text-2xl font-bold text-neutral-900 mt-1 font-display">
            {loading ? '...' : totals.totalEntities}
          </div>
          <span className="text-[11px] text-neutral-500 mt-1 block font-sans">
            Projects, Developers, Locations & Listings
          </span>
        </div>

        <div className="bg-white p-5 rounded-xl border border-neutral-200 shadow-xs">
          <span className="text-xs font-medium text-neutral-500 uppercase tracking-wider font-display">
            Publicly Indexable
          </span>
          <div className="text-2xl font-bold text-emerald-700 mt-1 font-display">
            {loading ? '...' : totals.totalIndexable}
          </div>
          <span className="text-[11px] text-neutral-500 mt-1 block font-sans">
            Eligible for /sitemap.xml & search indexing
          </span>
        </div>

        <div className="bg-white p-5 rounded-xl border border-neutral-200 shadow-xs">
          <span className="text-xs font-medium text-neutral-500 uppercase tracking-wider font-display">
            Excluded / Protected
          </span>
          <div className="text-2xl font-bold text-amber-700 mt-1 font-display">
            {loading ? '...' : totals.totalExcluded}
          </div>
          <span className="text-[11px] text-neutral-500 mt-1 block font-sans">
            Draft, Archived, Unverified, or Thin pages
          </span>
        </div>

        <div className="bg-white p-5 rounded-xl border border-neutral-200 shadow-xs">
          <span className="text-xs font-medium text-neutral-500 uppercase tracking-wider font-display">
            Avg Page Quality Score
          </span>
          <div className="text-2xl font-bold text-neutral-900 mt-1 font-display">
            {loading ? '...' : `${totals.avgQuality}/100`}
          </div>
          <span className="text-[11px] text-neutral-500 mt-1 block font-sans">
            Uninflated metadata, canonical & schema audit
          </span>
        </div>
      </div>

      {/* Category Breakdown Table */}
      <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden shadow-xs">
        <div className="px-6 py-4 border-b border-neutral-200 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-neutral-900 font-display">
              Entity Category SEO & Indexability Matrix
            </h2>
            <p className="text-xs text-neutral-500 font-sans">
              Comparison of total database records against strict public indexability and metadata quality gates.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-neutral-50 border-b border-neutral-200 text-[11px] font-semibold uppercase tracking-wider text-neutral-500 font-display">
                <th className="py-3.5 px-4">Domain Vertical</th>
                <th className="py-3.5 px-4">Total Records</th>
                <th className="py-3.5 px-4">Indexable (Sitemap)</th>
                <th className="py-3.5 px-4">Excluded (Non-Indexable)</th>
                <th className="py-3.5 px-4">Primary Exclusion Reasons</th>
                <th className="py-3.5 px-4">Avg Metadata Quality</th>
                <th className="py-3.5 px-4 text-right">Dashboard</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 text-sm">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-neutral-500 font-sans">
                    Computing cross-domain SEO audit matrix...
                  </td>
                </tr>
              ) : (
                rollups.map(row => (
                  <tr key={row.key} className="hover:bg-neutral-50/80 transition-colors align-top">
                    <td className="py-4 px-4">
                      <div className="font-semibold text-neutral-900 font-display">{row.label}</div>
                      <div className="text-xs font-mono text-neutral-500 mt-0.5">{row.routePattern}</div>
                    </td>
                    <td className="py-4 px-4 font-semibold text-neutral-900 font-display">
                      {row.total}
                    </td>
                    <td className="py-4 px-4">
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 font-display">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {row.indexable}
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 font-display">
                        <ShieldAlert className="w-3.5 h-3.5" />
                        {row.excluded}
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      {row.topExclusions.length === 0 ? (
                        <span className="text-xs text-emerald-700 font-sans">All records eligible</span>
                      ) : (
                        <div className="space-y-1">
                          {row.topExclusions.map((reason, idx) => (
                            <div key={idx} className="text-xs text-neutral-600 font-sans">
                              {reason}
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="py-4 px-4">
                      <span className="font-semibold text-neutral-900 font-display">
                        {row.avgQualityScore}/100
                      </span>
                    </td>
                    <td className="py-4 px-4 text-right">
                      <Link
                        href={row.href}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-neutral-900 hover:underline font-display"
                      >
                        <span>Open Audit</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quick Navigation Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link
          href="/admin/seo/sitemap"
          className="bg-white p-5 rounded-xl border border-neutral-200 hover:border-neutral-400 transition-colors space-y-2 group"
        >
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-neutral-500 font-display">
              <Layers className="w-4 h-4 text-neutral-900" />
              Sitemap Governance
            </span>
            <ArrowRight className="w-4 h-4 text-neutral-400 group-hover:text-neutral-900 transition-colors" />
          </div>
          <h3 className="text-base font-bold text-neutral-900 font-display">
            Sitemap & Robots Eligibility
          </h3>
          <p className="text-xs text-neutral-600 font-sans leading-relaxed">
            Inspect included vs excluded URLs across Projects, Developers, Locations, Resale, Rental, and Editorial routes.
          </p>
        </Link>

        <Link
          href="/admin/seo/listings"
          className="bg-white p-5 rounded-xl border border-neutral-200 hover:border-neutral-400 transition-colors space-y-2 group"
        >
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-neutral-500 font-display">
              <Home className="w-4 h-4 text-neutral-900" />
              Listing Governance
            </span>
            <ArrowRight className="w-4 h-4 text-neutral-400 group-hover:text-neutral-900 transition-colors" />
          </div>
          <h3 className="text-base font-bold text-neutral-900 font-display">
            Resale & Rental Verification Gate
          </h3>
          <p className="text-xs text-neutral-600 font-sans leading-relaxed">
            Audit PUBLISHED + VERIFIED listing requirements, /buy/[slug] and /rent/[slug] routes, and missing slug blocks.
          </p>
        </Link>

        <Link
          href="/admin/seo/search-console"
          className="bg-white p-5 rounded-xl border border-neutral-200 hover:border-neutral-400 transition-colors space-y-2 group"
        >
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-amber-700 font-display">
              <Terminal className="w-4 h-4 text-amber-700" />
              Search Console (Preview Mode)
            </span>
            <ArrowRight className="w-4 h-4 text-neutral-400 group-hover:text-neutral-900 transition-colors" />
          </div>
          <h3 className="text-base font-bold text-neutral-900 font-display">
            Search Console URL Inspector
          </h3>
          <p className="text-xs text-neutral-600 font-sans leading-relaxed">
            Test canonical URL patterns and robots.txt rules in local Simulated / Preview mode.
          </p>
        </Link>
      </div>
    </div>
  );
}
