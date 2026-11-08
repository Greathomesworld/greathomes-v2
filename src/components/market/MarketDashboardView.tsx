'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { MarketDashboardDTO } from '@/src/domain/marketIntelligence/dashboard/marketIntelligenceDashboardService';
import { SupplyTrendChart } from '@/src/components/locations/SupplyTrendChart';
import { PricingTrendChart } from '@/src/components/locations/PricingTrendChart';
import { ConfigurationMixChart } from '@/src/components/locations/ConfigurationMixChart';
import { ReraCoverageChart } from '@/src/components/locations/ReraCoverageChart';
import { 
  Building2, 
  Home, 
  KeyRound, 
  ShieldCheck, 
  MapPin, 
  ArrowRight, 
  TrendingUp, 
  Clock, 
  ExternalLink,
  SlidersHorizontal,
  FileText
} from 'lucide-react';

interface MarketDashboardViewProps {
  initialData: MarketDashboardDTO;
}

export function MarketDashboardView({ initialData }: MarketDashboardViewProps) {
  const [data, setData] = useState<MarketDashboardDTO>(initialData);
  const [basis, setBasis] = useState<'CARPET_AREA' | 'BUILT_UP_AREA' | 'SUPER_BUILT_UP_AREA'>(data.pricing.basis);
  const [selectedLocation, setSelectedLocation] = useState<string>('kolkata');
  const [scope, setScope] = useState<'DESCENDANT' | 'DIRECT'>('DESCENDANT');
  const [isLoading, setIsLoading] = useState(false);

  const handleFilterChange = async (newLoc: string, newBasis: 'CARPET_AREA' | 'BUILT_UP_AREA' | 'SUPER_BUILT_UP_AREA', newScope: 'DESCENDANT' | 'DIRECT') => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/market?location=${newLoc}&basis=${newBasis}&scope=${newScope}`);
      const json = await res.json();
      if (json.success && json.data) {
        setData(json.data);
      }
    } catch (e) {
      console.error('Failed to update dashboard data', e);
    } finally {
      setIsLoading(false);
    }
  };

  const formatPrice = (val: number | null) => {
    if (val === null || val === undefined) return '—';
    return `₹${val.toLocaleString('en-IN')}`;
  };

  return (
    <div className="min-h-screen bg-[#FAFAF8] dark:bg-stone-950 text-[#111111] dark:text-stone-100 font-body">
      {/* 1. Hero */}
      <section className="relative pt-16 pb-12 px-6 lg:px-12 border-b border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-2 text-xs text-stone-500 dark:text-stone-400 mb-4 font-mono">
            <span>Kolkata Residential Market</span>
            <span aria-hidden="true">·</span>
            <span>Canonical Intelligence</span>
            <span aria-hidden="true">·</span>
            <span>Verified 7 Oct 2026</span>
          </div>
          <h1 className="text-3xl md:text-5xl font-editorial font-bold text-[#111111] dark:text-stone-100 tracking-tight max-w-3xl">
            Kolkata Residential Market Intelligence
          </h1>
          <p className="mt-4 text-base md:text-lg text-stone-600 dark:text-stone-300 max-w-2xl font-body leading-relaxed">
            Explore residential supply, pricing, configurations, RERA coverage and recent market activity across Kolkata with Great Homes.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link
              href="/compare/locations"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-[#111111] text-white dark:bg-stone-100 dark:text-stone-900 text-sm font-display font-medium hover:bg-stone-800 dark:hover:bg-white transition-colors"
            >
              <span>Compare Locations</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
            <a
              href="#markets"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-lg border border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-300 text-sm font-display font-medium hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors"
            >
              <span>Explore Locations</span>
            </a>
          </div>
        </div>
      </section>

      {/* Filter Controls Bar */}
      <div className="sticky top-0 z-30 bg-white/90 dark:bg-stone-900/90 backdrop-blur-md border-b border-stone-200 dark:border-stone-800 px-6 lg:px-12 py-4">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-stone-500">Location:</span>
              <select
                value={selectedLocation}
                onChange={(e) => {
                  setSelectedLocation(e.target.value);
                  handleFilterChange(e.target.value, basis, scope);
                }}
                className="bg-stone-100 dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded px-3 py-1.5 text-xs font-medium text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-1 focus:ring-[#111111]"
              >
                <option value="kolkata">Kolkata (All Areas)</option>
                {data.locations.map(loc => (
                  <option key={loc.id} value={loc.slug}>{loc.name}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-stone-500">Scope:</span>
              <select
                value={scope}
                onChange={(e) => {
                  const s = e.target.value as 'DESCENDANT' | 'DIRECT';
                  setScope(s);
                  handleFilterChange(selectedLocation, basis, s);
                }}
                className="bg-stone-100 dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded px-3 py-1.5 text-xs font-medium text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-1 focus:ring-[#111111]"
              >
                <option value="DESCENDANT">Including Nearby Areas</option>
                <option value="DIRECT">Direct Only</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-stone-500">Pricing Basis:</span>
              <select
                value={basis}
                onChange={(e) => {
                  const b = e.target.value as any;
                  setBasis(b);
                  handleFilterChange(selectedLocation, b, scope);
                }}
                className="bg-stone-100 dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded px-3 py-1.5 text-xs font-medium text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-1 focus:ring-[#111111]"
              >
                <option value="CARPET_AREA">Carpet Area</option>
                <option value="BUILT_UP_AREA">Built-Up Area</option>
                <option value="SUPER_BUILT_UP_AREA">Super Built-Up Area</option>
              </select>
            </div>
          </div>

          <div className="text-xs text-stone-500 dark:text-stone-400 font-mono flex items-center gap-2">
            {isLoading ? <span>Updating metrics...</span> : <span>Data Freshness: {data.freshness.lastUpdated}</span>}
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-6 lg:px-12 py-12 space-y-16">
        {/* 2. Market Snapshot */}
        <section>
          <div className="mb-6">
            <h2 className="text-2xl font-display font-bold text-[#111111] dark:text-stone-100">
              01. Market Snapshot
            </h2>
            <p className="text-sm text-stone-600 dark:text-stone-400 mt-1">
              High-level verified residential indicators across Kolkata.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-5 shadow-sm">
              <div className="text-stone-500 dark:text-stone-400 text-xs font-medium uppercase tracking-wider">Projects</div>
              <div className="text-2xl font-display font-bold text-[#111111] dark:text-stone-100 mt-2 tabular-nums">
                {data.overview.publishedProjects}
              </div>
              <div className="text-xs text-stone-500 mt-1">Published active</div>
            </div>

            <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-5 shadow-sm">
              <div className="text-stone-500 dark:text-stone-400 text-xs font-medium uppercase tracking-wider">Resale Homes</div>
              <div className="text-2xl font-display font-bold text-[#111111] dark:text-stone-100 mt-2 tabular-nums">
                {data.overview.resaleHomes}
              </div>
              <div className="text-xs text-stone-500 mt-1">Market listings</div>
            </div>

            <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-5 shadow-sm">
              <div className="text-stone-500 dark:text-stone-400 text-xs font-medium uppercase tracking-wider">Rental Homes</div>
              <div className="text-2xl font-display font-bold text-[#111111] dark:text-stone-100 mt-2 tabular-nums">
                {data.overview.rentalHomes}
              </div>
              <div className="text-xs text-stone-500 mt-1">Verified rentals</div>
            </div>

            <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-5 shadow-sm">
              <div className="text-stone-500 dark:text-stone-400 text-xs font-medium uppercase tracking-wider">RERA Verified</div>
              <div className="text-2xl font-display font-bold text-[#218C5A] dark:text-emerald-400 mt-2 tabular-nums">
                {data.overview.reraVerifiedProjects}
              </div>
              <div className="text-xs text-stone-500 mt-1">Registered status</div>
            </div>

            <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-5 shadow-sm">
              <div className="text-stone-500 dark:text-stone-400 text-xs font-medium uppercase tracking-wider">RERA Provided</div>
              <div className="text-2xl font-display font-bold text-[#111111] dark:text-stone-100 mt-2 tabular-nums">
                {data.overview.reraProvidedProjects}
              </div>
              <div className="text-xs text-stone-500 mt-1">Documents provided</div>
            </div>

            <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-5 shadow-sm">
              <div className="text-stone-500 dark:text-stone-400 text-xs font-medium uppercase tracking-wider">Locations</div>
              <div className="text-2xl font-display font-bold text-[#111111] dark:text-stone-100 mt-2 tabular-nums">
                {data.overview.locationsCovered}
              </div>
              <div className="text-xs text-stone-500 mt-1">Active corridors</div>
            </div>
          </div>
        </section>

        {/* 3. Explore Residential Markets (Location Snapshot Grid) */}
        <section id="markets">
          <div className="flex flex-col md:flex-row md:items-end justify-between mb-6 gap-4">
            <div>
              <h2 className="text-2xl font-display font-bold text-[#111111] dark:text-stone-100">
                02. Explore Residential Markets
              </h2>
              <p className="text-sm text-stone-600 dark:text-stone-400 mt-1">
                Factual supply and RERA breakdown by Kolkata growth corridor.
              </p>
            </div>
            <Link
              href="/compare/locations"
              className="inline-flex items-center gap-1.5 text-xs font-display font-medium text-[#111111] dark:text-stone-200 hover:underline"
            >
              <span>Compare multiple locations</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-800/50 text-xs font-medium text-stone-500 uppercase tracking-wider">
                    <th className="py-3.5 px-6">Location</th>
                    <th className="py-3.5 px-6">Type</th>
                    <th className="py-3.5 px-6 text-right">Projects</th>
                    <th className="py-3.5 px-6 text-right">Resale</th>
                    <th className="py-3.5 px-6 text-right">Rent</th>
                    <th className="py-3.5 px-6 text-right">RERA Verified</th>
                    <th className="py-3.5 px-6">Latest Data</th>
                    <th className="py-3.5 px-6 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-200 dark:divide-stone-800 text-sm">
                  {data.locations.map(loc => (
                    <tr key={loc.id} className="hover:bg-stone-50/50 dark:hover:bg-stone-800/30 transition-colors">
                      <td className="py-4 px-6 font-display font-semibold text-[#111111] dark:text-stone-100">
                        {loc.name}
                      </td>
                      <td className="py-4 px-6 text-xs text-stone-500 font-mono uppercase">
                        {loc.type}
                      </td>
                      <td className="py-4 px-6 text-right tabular-nums font-mono font-medium">
                        {loc.projectsCount}
                      </td>
                      <td className="py-4 px-6 text-right tabular-nums font-mono text-stone-600 dark:text-stone-400">
                        {loc.resaleCount}
                      </td>
                      <td className="py-4 px-6 text-right tabular-nums font-mono text-stone-600 dark:text-stone-400">
                        {loc.rentalCount}
                      </td>
                      <td className="py-4 px-6 text-right tabular-nums font-mono text-[#218C5A] font-medium">
                        {loc.reraVerifiedCount}
                      </td>
                      <td className="py-4 px-6 text-xs text-stone-500 font-mono">
                        {loc.latestDataDate}
                      </td>
                      <td className="py-4 px-6 text-right">
                        <Link
                          href={`/locations/${loc.slug}`}
                          className="inline-flex items-center gap-1 text-xs font-display font-medium text-[#111111] dark:text-stone-200 bg-stone-100 dark:bg-stone-800 px-3 py-1.5 rounded hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors"
                        >
                          <span>View Location</span>
                          <ExternalLink className="w-3 h-3" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* 4. Supply & Pricing Intelligence */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Supply Intelligence */}
          <section className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-6 shadow-sm">
            <h2 className="text-xl font-display font-bold text-[#111111] dark:text-stone-100 mb-2">
              03. Supply Intelligence
            </h2>
            <p className="text-sm text-stone-600 dark:text-stone-400 mb-6">
              Active residential inventory distribution across the market scope.
            </p>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-lg bg-stone-50 dark:bg-stone-800/50">
                <span className="text-sm font-medium text-stone-700 dark:text-stone-300">Published Projects</span>
                <span className="text-lg font-mono font-bold text-[#111111] dark:text-stone-100 tabular-nums">
                  {data.supply.publishedProjects}
                </span>
              </div>
              <div className="flex items-center justify-between p-4 rounded-lg bg-stone-50 dark:bg-stone-800/50">
                <span className="text-sm font-medium text-stone-700 dark:text-stone-300">Resale Homes</span>
                <span className="text-lg font-mono font-bold text-[#111111] dark:text-stone-100 tabular-nums">
                  {data.supply.resaleListingsCount}
                </span>
              </div>
              <div className="flex items-center justify-between p-4 rounded-lg bg-stone-50 dark:bg-stone-800/50">
                <span className="text-sm font-medium text-stone-700 dark:text-stone-300">Rental Listings</span>
                <span className="text-lg font-mono font-bold text-[#111111] dark:text-stone-100 tabular-nums">
                  {data.supply.rentalListingsCount}
                </span>
              </div>
            </div>

            {data.supply.trendNote && (
              <div className="mt-4 text-xs text-stone-500 font-mono">
                {data.supply.trendNote}
              </div>
            )}
          </section>

          {/* Price Intelligence */}
          <section className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xl font-display font-bold text-[#111111] dark:text-stone-100">
                04. Price Intelligence
              </h2>
              <span className="text-xs font-mono uppercase bg-stone-100 dark:bg-stone-800 px-2.5 py-1 rounded text-stone-700 dark:text-stone-300">
                {basis.replace(/_/g, ' ')}
              </span>
            </div>
            <p className="text-sm text-stone-600 dark:text-stone-400 mb-6">
              Isolated factual pricing metrics per square foot.
            </p>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-lg bg-stone-50 dark:bg-stone-800/50">
                <div className="text-xs text-stone-500 uppercase font-medium">Minimum</div>
                <div className="text-lg font-mono font-bold text-[#111111] dark:text-stone-100 mt-1 tabular-nums">
                  {formatPrice(data.pricing.minPrice)}
                </div>
                <div className="text-xs text-stone-400">{data.pricing.unit}</div>
              </div>

              <div className="p-4 rounded-lg bg-stone-50 dark:bg-stone-800/50">
                <div className="text-xs text-stone-500 uppercase font-medium">Median</div>
                <div className="text-lg font-mono font-bold text-[#111111] dark:text-stone-100 mt-1 tabular-nums">
                  {formatPrice(data.pricing.medianPrice)}
                </div>
                <div className="text-xs text-stone-400">{data.pricing.unit}</div>
              </div>

              <div className="p-4 rounded-lg bg-stone-50 dark:bg-stone-800/50">
                <div className="text-xs text-stone-500 uppercase font-medium">Average</div>
                <div className="text-lg font-mono font-bold text-[#111111] dark:text-stone-100 mt-1 tabular-nums">
                  {formatPrice(data.pricing.averagePrice)}
                </div>
                <div className="text-xs text-stone-400">{data.pricing.unit}</div>
              </div>

              <div className="p-4 rounded-lg bg-stone-50 dark:bg-stone-800/50">
                <div className="text-xs text-stone-500 uppercase font-medium">Maximum</div>
                <div className="text-lg font-mono font-bold text-[#111111] dark:text-stone-100 mt-1 tabular-nums">
                  {formatPrice(data.pricing.maxPrice)}
                </div>
                <div className="text-xs text-stone-400">{data.pricing.unit}</div>
              </div>
            </div>
          </section>
        </div>

        {/* 5. Configuration Mix & RERA Coverage */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <section className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-6 shadow-sm">
            <h2 className="text-xl font-display font-bold text-[#111111] dark:text-stone-100 mb-2">
              05. Configuration Distribution
            </h2>
            <p className="text-sm text-stone-600 dark:text-stone-400 mb-6">
              Factual breakdown of bedroom configurations across published projects.
            </p>
            <ConfigurationMixChart history={data.trends.history || []} />
          </section>

          <section className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-6 shadow-sm">
            <h2 className="text-xl font-display font-bold text-[#111111] dark:text-stone-100 mb-2">
              06. RERA Coverage
            </h2>
            <p className="text-sm text-stone-600 dark:text-stone-400 mb-6">
              Regulatory compliance verification status across residential inventory.
            </p>
            <ReraCoverageChart history={data.trends.history || []} />
          </section>
        </div>

        {/* 6. Historical Trends */}
        <section className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-6 shadow-sm">
          <h2 className="text-xl font-display font-bold text-[#111111] dark:text-stone-100 mb-2">
            07. Historical Market Trends
          </h2>
          <p className="text-sm text-stone-600 dark:text-stone-400 mb-6">
            Recorded historical snapshots of pricing and supply progression.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <h3 className="text-sm font-semibold text-stone-700 dark:text-stone-300 mb-4">Supply Trend</h3>
              <SupplyTrendChart history={data.trends.history || []} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-stone-700 dark:text-stone-300 mb-4">Pricing Trend</h3>
              <PricingTrendChart history={data.trends.history || []} />
            </div>
          </div>
        </section>

        {/* 7. Recent Market Activity */}
        <section className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-display font-bold text-[#111111] dark:text-stone-100">
                08. Recent Market Activity
              </h2>
              <p className="text-sm text-stone-600 dark:text-stone-400 mt-1">
                Factual chronological events recorded across Kolkata.
              </p>
            </div>
          </div>

          {data.recentActivity.length === 0 ? (
            <div className="text-center py-8 text-stone-400 text-sm font-mono">
              No recent market activity events recorded in this scope.
            </div>
          ) : (
            <div className="space-y-4">
              {data.recentActivity.map(ev => (
                <div key={ev.id} className="flex items-start justify-between p-4 rounded-lg bg-stone-50 dark:bg-stone-800/50 border border-stone-200/60 dark:border-stone-800">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded bg-stone-200 dark:bg-stone-700 text-stone-800 dark:text-stone-200 font-mono">
                        {ev.locationName}
                      </span>
                      <span className="text-xs text-stone-500 font-mono">{ev.eventDate}</span>
                    </div>
                    <p className="text-sm font-medium text-[#111111] dark:text-stone-100">
                      {ev.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 8. Methodology & Data Notes */}
        <section className="bg-stone-100 dark:bg-stone-900/60 border border-stone-200 dark:border-stone-800 rounded-xl p-6">
          <h2 className="text-lg font-display font-bold text-[#111111] dark:text-stone-100 mb-3">
            Know Before You Buy / Data Notes
          </h2>
          <div className="text-xs text-stone-600 dark:text-stone-400 space-y-2 font-body leading-relaxed">
            <p>• Market data is based on verified and public Great Homes records without predictive extrapolation or investment sentiment scoring.</p>
            <p>• Pricing is strictly separated by area basis (Carpet Area, Built-Up Area, Super Built-Up Area) and never averaged across inconsistent baselines.</p>
            <p>• RERA Verified status indicates official regulatory registration, distinct from provided documentation under review.</p>
            <p>• Missing metric values are reported as unavailable and are never synthetically estimated or filled.</p>
          </div>
        </section>
      </main>
    </div>
  );
}
