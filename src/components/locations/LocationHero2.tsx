'use client';

import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight, ShieldCheck, Scale, Building2, Home, Key, Clock } from 'lucide-react';
import {
  PublicLocationIntelligenceLocationDto,
  MarketOverviewDto,
  ReraIntelligenceDto,
} from '@/src/domain/marketIntelligence/dto/locationIntelligenceDto';
import { MarketFreshnessInfo } from '@/src/domain/marketIntelligence/entities';
import { getLocationVisualTheme } from '@/src/domain/locations/locationRegionMapper';
import { WatchLocationButton } from '../customer/WatchLocationButton';
import { EnquiryTriggerButton } from '../enquiry/EnquiryTriggerButton';

interface LocationHero2Props {
  location: PublicLocationIntelligenceLocationDto;
  marketOverview: MarketOverviewDto;
  rera?: ReraIntelligenceDto;
  freshness?: MarketFreshnessInfo;
  activeScope: 'DIRECT' | 'DESCENDANT';
  hasChildLocations?: boolean;
}

export function LocationHero2({
  location,
  marketOverview,
  rera,
  freshness,
  activeScope,
  hasChildLocations = false,
}: LocationHero2Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const scopeLabelDirect = location.level === 'CITY' ? 'Direct City' : 'Direct Area';
  const scopeLabelDescendant = location.level === 'CITY' ? 'Including All Sub-areas' : 'Including Nearby Areas';

  const parentAreaSlug = location.breadcrumb?.find((b) => b.type === 'AREA' && b.slug !== location.slug)?.slug;
  const visualTheme = getLocationVisualTheme(location.slug, false);
  const fallbackParentVisual = parentAreaSlug ? getLocationVisualTheme(parentAreaSlug, false) : null;
  const heroImageUrl =
    visualTheme.imageUrl.includes('photo-1545324418-cc1a3fa10c00') && fallbackParentVisual
      ? fallbackParentVisual.imageUrl
      : visualTheme.imageUrl;

  const formattedDate = freshness?.dataAsOf
    ? new Date(freshness.dataAsOf).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : null;

  const handleScopeToggle = (scope: 'DIRECT' | 'DESCENDANT') => {
    const params = new URLSearchParams(searchParams.toString());
    if (scope === 'DIRECT') {
      params.set('scope', 'DIRECT');
    } else {
      params.delete('scope');
    }
    router.push(`/locations/${location.slug}${params.toString() ? `?${params.toString()}` : ''}`, { scroll: false });
  };

  return (
    <section
      id="overview"
      className="relative w-full min-w-0 bg-white border border-[rgba(17,17,17,0.08)] rounded-2xl overflow-hidden shadow-2xs"
    >
      <div className="p-5 sm:p-8 lg:p-10 space-y-6 sm:space-y-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-center">
          {/* Left Column: Headline & Controls */}
          <div className="lg:col-span-7 min-w-0 space-y-5">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-[#FAFAF8] text-[#111111] border border-[rgba(17,17,17,0.12)]">
                  {location.levelDisplay || location.level}
                </span>
                {location.city && (
                  <span className="text-xs text-neutral-500 font-medium">
                    in {location.city}
                  </span>
                )}
                <div className="inline-flex items-center gap-1 text-xs text-[#218C5A] font-medium bg-[#218C5A]/10 px-2.5 py-0.5 rounded-full border border-[#218C5A]/20">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Kolkata Location Guide</span>
                </div>
                {formattedDate && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-mono text-neutral-500">
                    <Clock className="w-3 h-3" />
                    <span>Updated {formattedDate}</span>
                  </span>
                )}
              </div>

              <h1 className="font-editorial text-3xl sm:text-4xl lg:text-5xl font-normal tracking-tight text-[#111111] leading-tight break-words">
                {location.name}
              </h1>

              <p className="text-sm sm:text-base lg:text-lg text-neutral-600 font-body leading-relaxed max-w-2xl">
                {location.description ||
                  `Explore residential projects, verified resale homes, rental properties and property intelligence across ${location.name}.`}
              </p>
            </div>

            {/* Scope Selector if child locations exist */}
            {hasChildLocations && (
              <div className="flex flex-wrap items-center gap-2 pt-0.5">
                <span className="text-xs font-medium text-neutral-500 uppercase tracking-wider">Scope:</span>
                <div className="inline-flex flex-wrap p-1 bg-[#FAFAF8] border border-[rgba(17,17,17,0.08)] rounded-xl max-w-full">
                  <button
                    type="button"
                    onClick={() => handleScopeToggle('DIRECT')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all cursor-pointer ${
                      activeScope === 'DIRECT'
                        ? 'bg-white text-[#111111] shadow-xs font-semibold'
                        : 'text-neutral-600 hover:text-[#111111]'
                    }`}
                  >
                    {scopeLabelDirect}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleScopeToggle('DESCENDANT')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all cursor-pointer ${
                      activeScope === 'DESCENDANT'
                        ? 'bg-white text-[#111111] shadow-xs font-semibold'
                        : 'text-neutral-600 hover:text-[#111111]'
                    }`}
                  >
                    {scopeLabelDescendant}
                  </button>
                </div>
              </div>
            )}

            {/* Primary Action Buttons */}
            <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 pt-1">
              <a
                href="#projects"
                className="inline-flex items-center gap-2 px-4 sm:px-5 py-2.5 rounded-xl bg-[#111111] text-white font-medium text-xs sm:text-sm hover:bg-[#222222] transition-colors shadow-xs cursor-pointer"
              >
                <span>Explore Projects</span>
                <ArrowRight className="w-4 h-4" />
              </a>

              <Link
                href={`/buy?inventoryType=RESALE&location=${location.slug}`}
                className="inline-flex items-center gap-1.5 px-3.5 sm:px-4 py-2.5 rounded-xl bg-white text-[#111111] border border-[rgba(17,17,17,0.15)] font-medium text-xs sm:text-sm hover:bg-[#FAFAF8] transition-colors cursor-pointer"
              >
                <span>Buy Resale</span>
              </Link>

              <Link
                href={`/rent?location=${location.slug}`}
                className="inline-flex items-center gap-1.5 px-3.5 sm:px-4 py-2.5 rounded-xl bg-white text-[#111111] border border-[rgba(17,17,17,0.15)] font-medium text-xs sm:text-sm hover:bg-[#FAFAF8] transition-colors cursor-pointer"
              >
                <span>Rent Home</span>
              </Link>

              <WatchLocationButton
                locationId={location.id}
                locationName={location.name}
                variant="outline"
                size="md"
              />

              <Link
                href={`/compare/locations?locations=${location.slug},${location.slug === 'new-town' ? 'rajarhat' : 'new-town'}`}
                className="inline-flex items-center gap-1.5 px-3.5 sm:px-4 py-2.5 rounded-xl bg-white text-[#111111] border border-[rgba(17,17,17,0.15)] font-medium text-xs sm:text-sm hover:bg-[#FAFAF8] transition-colors cursor-pointer min-h-[42px]"
                title="Compare with adjacent corridor"
              >
                <Scale className="w-4 h-4 text-stone-500" />
                <span>Compare</span>
              </Link>

              <EnquiryTriggerButton
                contextData={{
                  contextType: 'GENERAL',
                  title: `Enquiry for ${location.name}`,
                  locationName: location.name,
                }}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#E85D3F] text-white font-medium text-xs sm:text-sm hover:bg-[#d44d31] transition-colors shadow-2xs cursor-pointer min-h-[42px]"
              >
                <span>Get Price & Availability</span>
              </EnquiryTriggerButton>
            </div>
          </div>

          {/* Right Column: Optimized Hero Visual Photography */}
          <div className="lg:col-span-5 min-w-0">
            <div className="relative aspect-[16/10] sm:aspect-[4/3] rounded-xl overflow-hidden bg-neutral-900 border border-[rgba(17,17,17,0.12)] shadow-sm">
              <Image
                src={heroImageUrl}
                alt={`${location.name} residential neighbourhood in Kolkata`}
                fill
                priority
                sizes="(max-width: 1024px) 100vw, 42vw"
                referrerPolicy="no-referrer"
                className="object-cover opacity-90 hover:scale-105 transition-transform duration-500"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />

              <div className="absolute top-3 left-3">
                <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-display font-bold uppercase tracking-wider bg-white/95 text-[#111111] shadow-xs">
                  {visualTheme.badgeText}
                </span>
              </div>

              <div className="absolute bottom-3 left-3 right-3 p-3 bg-black/65 backdrop-blur-md rounded-lg border border-white/15 text-white">
                <div className="flex items-center justify-between text-xs gap-2">
                  <span className="text-neutral-200 font-medium truncate">
                    {activeScope === 'DIRECT' ? `${location.name} (Direct)` : `${location.name} Corridor`}
                  </span>
                  <span className="flex items-center gap-1 text-[#218C5A] font-semibold bg-[#218C5A]/20 px-2 py-0.5 rounded-md shrink-0 text-[11px]">
                    <ShieldCheck className="w-3 h-3" />
                    Verified Data
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Consolidated Market Snapshot Strip (replaces standalone MarketSnapshotSection + ExploreModesBar) */}
        <div
          id="market-snapshot"
          className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 pt-5 border-t border-[rgba(17,17,17,0.08)]"
        >
          <a
            href="#projects"
            className="p-3.5 sm:p-4 rounded-xl bg-[#FAFAF8] border border-[rgba(17,17,17,0.08)] hover:border-[rgba(17,17,17,0.2)] transition-all flex flex-col justify-between group"
          >
            <div className="flex items-center justify-between text-neutral-500 mb-1.5">
              <span className="text-[11px] font-display font-semibold uppercase tracking-wider group-hover:text-[#111111]">
                Published Projects
              </span>
              <Building2 className="w-4 h-4 text-[#E85D3F]" />
            </div>
            <div>
              <span className="block text-xl sm:text-2xl font-display font-bold text-[#111111]">
                {marketOverview.publishedProjects}
              </span>
              <span className="text-[11px] text-neutral-500 font-body">
                {marketOverview.readyToMoveProjects > 0
                  ? `${marketOverview.readyToMoveProjects} Ready • ${marketOverview.underConstructionProjects} Under Const.`
                  : 'Active residential developments'}
              </span>
            </div>
          </a>

          <a
            href="#resale"
            className="p-3.5 sm:p-4 rounded-xl bg-[#FAFAF8] border border-[rgba(17,17,17,0.08)] hover:border-[rgba(17,17,17,0.2)] transition-all flex flex-col justify-between group"
          >
            <div className="flex items-center justify-between text-neutral-500 mb-1.5">
              <span className="text-[11px] font-display font-semibold uppercase tracking-wider group-hover:text-[#111111]">
                Verified Resale
              </span>
              <Home className="w-4 h-4 text-[#111111]/70" />
            </div>
            <div>
              <span className="block text-xl sm:text-2xl font-display font-bold text-[#111111]">
                {marketOverview.resaleListings}
              </span>
              <span className="text-[11px] text-neutral-500 font-body">
                {(marketOverview.unverifiedResaleListings ?? 0) > 0
                  ? `+${marketOverview.unverifiedResaleListings} published (pending verification)`
                  : 'Verified resale homes'}
              </span>
            </div>
          </a>

          <a
            href="#rent"
            className="p-3.5 sm:p-4 rounded-xl bg-[#FAFAF8] border border-[rgba(17,17,17,0.08)] hover:border-[rgba(17,17,17,0.2)] transition-all flex flex-col justify-between group"
          >
            <div className="flex items-center justify-between text-neutral-500 mb-1.5">
              <span className="text-[11px] font-display font-semibold uppercase tracking-wider group-hover:text-[#111111]">
                Verified Rentals
              </span>
              <Key className="w-4 h-4 text-[#111111]/70" />
            </div>
            <div>
              <span className="block text-xl sm:text-2xl font-display font-bold text-[#111111]">
                {marketOverview.rentalListings}
              </span>
              <span className="text-[11px] text-neutral-500 font-body">
                {(marketOverview.unverifiedRentalListings ?? 0) > 0
                  ? `+${marketOverview.unverifiedRentalListings} published (pending verification)`
                  : 'Verified monthly rentals'}
              </span>
            </div>
          </a>

          <a
            href="#rera"
            className="p-3.5 sm:p-4 rounded-xl bg-[#FAFAF8] border border-[rgba(17,17,17,0.08)] hover:border-[rgba(17,17,17,0.2)] transition-all flex flex-col justify-between group"
          >
            <div className="flex items-center justify-between text-[#218C5A] mb-1.5">
              <span className="text-[11px] font-display font-semibold uppercase tracking-wider">
                RERA Verified
              </span>
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <span className="block text-xl sm:text-2xl font-display font-bold text-[#111111]">
                {rera ? rera.verifiedReraProjects : 0}
              </span>
              <span className="text-[11px] text-neutral-500 font-body">
                {rera && rera.verifiedPercentage !== 'NOT_AVAILABLE'
                  ? `${rera.verifiedPercentage}% of published projects`
                  : 'Regulatory registration status'}
              </span>
            </div>
          </a>
        </div>
      </div>
    </section>
  );
}
