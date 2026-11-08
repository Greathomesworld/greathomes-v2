'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Scale,
  ArrowLeft,
  HelpCircle,
  ShieldCheck,
  Calendar,
  Layers,
  MapPin,
} from 'lucide-react';
import { LocationComparisonDTO } from '@/src/domain/locationComparison';
import { LocationComparisonHeader } from './LocationComparisonHeader';
import { LocationComparisonSelector } from './LocationComparisonSelector';
import { MarketOverviewTable } from './MarketOverviewTable';
import { SupplyComparisonTable } from './SupplyComparisonTable';
import { PricingComparisonTable } from './PricingComparisonTable';
import { ConfigurationComparisonTable } from './ConfigurationComparisonTable';
import { ReraComparisonTable } from './ReraComparisonTable';
import { ConnectivityComparisonTable } from './ConnectivityComparisonTable';
import { RecentActivityTable } from './RecentActivityTable';
import { HistoricalTrendsComparison } from './HistoricalTrendsComparison';
import { ComparisonEnquiryModal } from './ComparisonEnquiryModal';

interface LocationComparisonViewProps {
  initialData: LocationComparisonDTO;
}

export function LocationComparisonView({ initialData }: LocationComparisonViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [data, setData] = useState<LocationComparisonDTO>(initialData);
  const [isEnquiryOpen, setIsEnquiryOpen] = useState(false);

  // Sync state if initialData changes
  useEffect(() => {
    setData(initialData);
  }, [initialData]);

  const currentSlugs = data.locations.map((l) => l.slug);

  const handleRemoveLocation = (slugToRemove: string) => {
    const updated = currentSlugs.filter((s) => s !== slugToRemove);
    if (updated.length < 2) {
      router.push('/compare/locations');
    } else {
      router.push(`/compare/locations?locations=${updated.join(',')}`);
    }
  };

  const handleAddLocation = (slugToAdd: string) => {
    if (currentSlugs.includes(slugToAdd)) return;
    if (currentSlugs.length >= 4) return;
    const updated = [...currentSlugs, slugToAdd].sort();
    router.push(`/compare/locations?locations=${updated.join(',')}`);
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      {/* Breadcrumb & Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-6 border-b border-[#E5E5E0] dark:border-stone-800">
        <div>
          <Link
            href="/locations"
            className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100 transition-colors mb-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Locations Discovery</span>
          </Link>
          <h1 className="text-3xl sm:text-4xl font-display font-bold text-[#111111] dark:text-stone-100 tracking-tight">
            Location Benchmark & Comparison
          </h1>
          <p className="text-xs sm:text-sm text-stone-600 dark:text-stone-400 font-body mt-1 max-w-2xl">
            Side-by-side evaluation of {data.locations.length} residential corridors in Kolkata. Normalized telemetry derived from verified projects and official snapshots.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <LocationComparisonSelector
            currentSlugs={currentSlugs}
            onAddLocation={handleAddLocation}
            maxLocations={4}
          />

          <button
            type="button"
            onClick={() => setIsEnquiryOpen(true)}
            className="inline-flex items-center gap-1.5 text-xs font-display font-medium py-2.5 px-4 rounded bg-[#111111] text-white dark:bg-stone-100 dark:text-stone-900 hover:bg-stone-800 dark:hover:bg-white transition-colors touch-manipulation min-h-[44px]"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Get Advisory Assistance</span>
          </button>
        </div>
      </div>

      {/* Scope & Hierarchy Banner */}
      <div className="mb-8 p-4 rounded bg-stone-50 dark:bg-stone-900/60 border border-[#E5E5E0] dark:border-stone-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs font-body text-stone-600 dark:text-stone-400">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-[#218C5A] shrink-0" />
          <span>{data.comparisonScope.scopeDescription}</span>
        </div>
        <div className="flex items-center gap-1 text-[11px] font-mono text-stone-400 shrink-0">
          <Calendar className="w-3.5 h-3.5" />
          <span>Factual snapshot data as of current cycle</span>
        </div>
      </div>

      {/* Main Comparison Matrix Container */}
      <div className="border border-[#E5E5E0] dark:border-stone-800 rounded-lg overflow-hidden bg-white dark:bg-stone-950 shadow-xs mb-12">
        {/* Sticky-ready Column Headers */}
        <LocationComparisonHeader
          locations={data.locations}
          onRemoveLocation={handleRemoveLocation}
          canRemove={data.locations.length > 2}
        />

        {/* Section 1: Market Overview */}
        <section aria-labelledby="section-overview" className="border-b border-[#E5E5E0] dark:border-stone-800">
          <div className="p-4 sm:p-5 bg-stone-100/70 dark:bg-stone-900/80 border-b border-[#E5E5E0] dark:border-stone-800 flex items-center justify-between">
            <h2 id="section-overview" className="text-sm font-display font-bold uppercase tracking-wider text-[#111111] dark:text-stone-100">
              1. Market Overview & Aggregate Inventory
            </h2>
            <span className="text-[11px] font-mono text-stone-500">Live & Snapshot Data</span>
          </div>
          <MarketOverviewTable rows={data.matrix.overview} slugs={currentSlugs} />
        </section>

        {/* Section 2: Residential Supply */}
        <section aria-labelledby="section-supply" className="border-b border-[#E5E5E0] dark:border-stone-800">
          <div className="p-4 sm:p-5 bg-stone-100/70 dark:bg-stone-900/80 border-b border-[#E5E5E0] dark:border-stone-800 flex items-center justify-between">
            <h2 id="section-supply" className="text-sm font-display font-bold uppercase tracking-wider text-[#111111] dark:text-stone-100">
              2. Supply Metrics & Factual Change
            </h2>
            <span className="text-[11px] font-mono text-stone-500">Snapshot Comparisons</span>
          </div>
          <SupplyComparisonTable rows={data.matrix.supply} slugs={currentSlugs} />
        </section>

        {/* Section 3: Pricing Benchmarks (Basis Isolated) */}
        <section aria-labelledby="section-pricing" className="border-b border-[#E5E5E0] dark:border-stone-800">
          <div className="p-4 sm:p-5 bg-stone-100/70 dark:bg-stone-900/80 border-b border-[#E5E5E0] dark:border-stone-800 flex items-center justify-between">
            <h2 id="section-pricing" className="text-sm font-display font-bold uppercase tracking-wider text-[#111111] dark:text-stone-100">
              3. Pricing Benchmarks (Basis-Isolated)
            </h2>
            <span className="text-[11px] font-mono text-stone-500">Rate per Sq.Ft.</span>
          </div>
          <div className="p-4 sm:p-5">
            <PricingComparisonTable basisRows={data.matrix.pricing} slugs={currentSlugs} />
          </div>
        </section>

        {/* Section 4: Configuration Mix */}
        <section aria-labelledby="section-config" className="border-b border-[#E5E5E0] dark:border-stone-800">
          <div className="p-4 sm:p-5 bg-stone-100/70 dark:bg-stone-900/80 border-b border-[#E5E5E0] dark:border-stone-800 flex items-center justify-between">
            <h2 id="section-config" className="text-sm font-display font-bold uppercase tracking-wider text-[#111111] dark:text-stone-100">
              4. Configuration Distribution
            </h2>
            <span className="text-[11px] font-mono text-stone-500">Recorded Unit Types</span>
          </div>
          <ConfigurationComparisonTable rows={data.matrix.configurations} slugs={currentSlugs} />
        </section>

        {/* Section 5: RERA Compliance */}
        <section aria-labelledby="section-rera" className="border-b border-[#E5E5E0] dark:border-stone-800">
          <div className="p-4 sm:p-5 bg-stone-100/70 dark:bg-stone-900/80 border-b border-[#E5E5E0] dark:border-stone-800 flex items-center justify-between">
            <h2 id="section-rera" className="text-sm font-display font-bold uppercase tracking-wider text-[#111111] dark:text-stone-100">
              5. RERA Regulatory Verification
            </h2>
            <span className="text-[11px] font-mono text-stone-500">Official Compliance</span>
          </div>
          <ReraComparisonTable rows={data.matrix.rera} slugs={currentSlugs} />
        </section>

        {/* Section 6: Infrastructure & Connectivity */}
        <section aria-labelledby="section-connectivity" className="border-b border-[#E5E5E0] dark:border-stone-800">
          <div className="p-4 sm:p-5 bg-stone-100/70 dark:bg-stone-900/80 border-b border-[#E5E5E0] dark:border-stone-800 flex items-center justify-between">
            <h2 id="section-connectivity" className="text-sm font-display font-bold uppercase tracking-wider text-[#111111] dark:text-stone-100">
              6. Infrastructure & Proximity Benchmarks
            </h2>
            <span className="text-[11px] font-mono text-stone-500">Distances in KM</span>
          </div>
          <ConnectivityComparisonTable rows={data.matrix.connectivity} slugs={currentSlugs} />
        </section>

        {/* Section 7: Historical Trends Visualization */}
        <section aria-labelledby="section-history" className="border-b border-[#E5E5E0] dark:border-stone-800">
          <div className="p-4 sm:p-5 bg-stone-100/70 dark:bg-stone-900/80 border-b border-[#E5E5E0] dark:border-stone-800 flex items-center justify-between">
            <h2 id="section-history" className="text-sm font-display font-bold uppercase tracking-wider text-[#111111] dark:text-stone-100">
              7. Historical Market Trends (Telemetry)
            </h2>
            <span className="text-[11px] font-mono text-stone-500">Recorded Snapshots</span>
          </div>
          <div className="p-4 sm:p-6 bg-[#FAFAF8]/40 dark:bg-stone-950/40">
            <HistoricalTrendsComparison locations={data.locations} />
          </div>
        </section>

        {/* Section 8: Recent Market Activity */}
        <section aria-labelledby="section-activity">
          <div className="p-4 sm:p-5 bg-stone-100/70 dark:bg-stone-900/80 border-b border-[#E5E5E0] dark:border-stone-800 flex items-center justify-between">
            <h2 id="section-activity" className="text-sm font-display font-bold uppercase tracking-wider text-[#111111] dark:text-stone-100">
              8. Recent Market Activity & Verifications
            </h2>
            <span className="text-[11px] font-mono text-stone-500">Audit Stream</span>
          </div>
          <div className="p-4 sm:p-6">
            <RecentActivityTable locations={data.locations} />
          </div>
        </section>
      </div>

      {/* Bottom Advisory Banner */}
      <div className="p-6 sm:p-8 rounded-lg bg-white dark:bg-stone-900 border border-[#E5E5E0] dark:border-stone-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div>
          <span className="text-xs font-mono uppercase tracking-wider text-[#218C5A]">
            Great Homes Advisor
          </span>
          <h2 className="text-xl font-display font-bold text-[#111111] dark:text-stone-100 tracking-tight mt-1">
            Need in-depth perspective on these corridors?
          </h2>
          <p className="text-xs sm:text-sm text-stone-600 dark:text-stone-400 font-body mt-1 max-w-xl">
            Our property intelligence team can review master plans, ongoing transit developments, and project configurations for {data.locations.map((l) => l.name).join(', ')}.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsEnquiryOpen(true)}
          className="py-3 px-6 rounded bg-[#111111] text-white dark:bg-stone-100 dark:text-stone-900 font-display text-sm font-medium hover:bg-stone-800 dark:hover:bg-white transition-colors shrink-0 touch-manipulation min-h-[44px]"
        >
          Get Assistance Comparing These Locations
        </button>
      </div>

      {/* Advisory Enquiry Modal */}
      <ComparisonEnquiryModal
        locations={data.locations}
        isOpen={isEnquiryOpen}
        onClose={() => setIsEnquiryOpen(false)}
      />
    </div>
  );
}
