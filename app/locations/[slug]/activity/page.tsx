import React from 'react';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, Activity, ArrowRight } from 'lucide-react';
import { locationService } from '@/src/domain/locations/services/locationService';
import { locationIntelligenceService } from '@/src/domain/marketIntelligence/services/locationIntelligenceService';
import { ensureSeedData } from '@/src/infrastructure/seed';
import { Breadcrumbs, BreadcrumbItem } from '@/src/components/navigation/Breadcrumbs';
import { MarketActivitySection } from '@/src/components/locations/MarketActivitySection';

interface LocationActivityPageProps {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ scope?: string }>;
}

export async function generateMetadata(
  props: LocationActivityPageProps
): Promise<Metadata> {
  const { slug } = await props.params;
  const normalizedSlug = slug.toLowerCase().trim();
  const location = await locationService.resolveLocationBySlug(normalizedSlug, { publishedOnly: true });

  if (!location || location.status !== 'PUBLISHED') {
    return {
      title: 'Market Activity | Great Homes',
      robots: { index: false, follow: true },
    };
  }

  return {
    title: `Market Activity & Timeline — ${location.name} | Great Homes`,
    description: `Factual chronological record of property publications, RERA confirmations, and market updates in ${location.name}.`,
    robots: {
      index: false,
      follow: true,
    },
  };
}

export default async function LocationActivityPage(props: LocationActivityPageProps) {
  await ensureSeedData();
  const { slug } = await props.params;
  const rawSearchParams = props.searchParams ? await props.searchParams : {};
  const normalizedSlug = slug.toLowerCase().trim();
  const scopeParam = rawSearchParams.scope === 'DIRECT' ? 'DIRECT' : 'DESCENDANT';

  const location = await locationService.resolveLocationBySlug(normalizedSlug, { publishedOnly: true });
  if (!location || location.status !== 'PUBLISHED') {
    notFound();
  }

  const intel = await locationIntelligenceService.getLocationIntelligence(normalizedSlug, {
    scope: scopeParam,
  });

  if (!intel) {
    notFound();
  }

  const path = await locationService.getLocationPath(location.id, { publishedOnly: true });

  const breadcrumbs: BreadcrumbItem[] = [
    { label: 'Home', href: '/' },
    { label: 'Locations', href: '/locations' },
    ...path.slice(0, -1).map((loc) => ({
      label: loc.name,
      href: `/locations/${loc.slug}`,
    })),
    { label: location.name, href: `/locations/${location.slug}` },
    { label: 'Market Activity', href: `/locations/${location.slug}/activity`, current: true },
  ];

  return (
    <div className="min-h-screen bg-[#FAFAF8] text-[#111111] pb-24">
      {/* Top Banner & Breadcrumbs */}
      <div className="bg-white border-b border-[rgba(17,17,17,0.08)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <Breadcrumbs items={breadcrumbs} />
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 space-y-8">
        {/* Navigation & Header */}
        <div className="space-y-4">
          <Link
            href={`/locations/${location.slug}`}
            className="inline-flex items-center gap-1.5 text-xs font-display font-medium text-[#111111]/60 hover:text-[#111111] transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Back to {location.name} Overview</span>
          </Link>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[rgba(17,17,17,0.05)] text-xs font-mono font-medium text-[#111111]/70 mb-2">
                <Activity className="w-3.5 h-3.5" />
                <span>Market Intelligence Feed</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-display font-bold text-[#111111] tracking-tight">
                {location.name} Market Activity
              </h1>
              <p className="text-xs sm:text-sm font-body text-[#111111]/60 mt-1">
                Factual timeline of property additions, RERA verifications, and project updates.
              </p>
            </div>

            {/* Scope Switcher */}
            <div className="inline-flex items-center p-1 rounded-lg bg-white border border-[rgba(17,17,17,0.1)] shrink-0 self-start sm:self-auto shadow-2xs">
              <Link
                href={`/locations/${location.slug}/activity?scope=DESCENDANT`}
                className={`px-3 py-1.5 rounded text-xs font-display font-medium transition-colors ${
                  scopeParam === 'DESCENDANT'
                    ? 'bg-[#111111] text-white'
                    : 'text-[#111111]/70 hover:text-[#111111]'
                }`}
              >
                Include Sub-areas
              </Link>
              <Link
                href={`/locations/${location.slug}/activity?scope=DIRECT`}
                className={`px-3 py-1.5 rounded text-xs font-display font-medium transition-colors ${
                  scopeParam === 'DIRECT'
                    ? 'bg-[#111111] text-white'
                    : 'text-[#111111]/70 hover:text-[#111111]'
                }`}
              >
                Direct Only
              </Link>
            </div>
          </div>
        </div>

        {/* Timeline Section Component */}
        <MarketActivitySection
          locationName={location.name}
          activity={intel.recentActivity}
        />

        {/* Action footer */}
        <div className="p-6 rounded-xl bg-white border border-[rgba(17,17,17,0.08)] flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-2xs">
          <div>
            <h3 className="text-sm font-display font-semibold text-[#111111]">
              Explore Complete Market Profile
            </h3>
            <p className="text-xs text-[#111111]/60 font-body mt-0.5">
              Review pricing trends, RERA coverage, connectivity, and active projects in {location.name}.
            </p>
          </div>
          <Link
            href={`/locations/${location.slug}`}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-[#111111] text-white text-xs font-display font-semibold hover:bg-black/90 transition-colors shrink-0"
          >
            <span>View {location.name} Page</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
