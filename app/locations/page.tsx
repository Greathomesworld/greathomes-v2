import React from 'react';
import Link from 'next/link';
import { Metadata } from 'next';
import { Building2, ChevronRight, Compass, Home, Key, MapPin } from 'lucide-react';
import { marketIntelligenceService } from '@/src/domain/marketIntelligence/services/marketIntelligenceService';
import { Breadcrumbs } from '@/src/components/navigation/Breadcrumbs';
import { LocationsDirectoryClient } from '@/src/components/locations/LocationsDirectoryClient';
import { GreatHomesIllustration } from '@/src/components/illustrations/GreatHomesIllustration';
import { safeJsonLd } from '@/src/lib/safeJsonLd';
import { buildPageMetadata } from '@/src/domain/seo/metadataBuilder';

export const revalidate = 300;

export const metadata: Metadata = buildPageMetadata({
  title: 'Residential Areas in Kolkata | Locality Guide',
  description:
    'Explore Kolkata residential areas and neighbourhoods. Compare New Town, Rajarhat, Salt Lake, Ballygunge, connectivity and homes on Great Homes.',
  canonicalPath: '/locations',
});

export default async function LocationsDirectoryPage() {
  const summary = await marketIntelligenceService
    .getDirectoryIntelligenceSummary()
    .catch(() => ({
      totals: {
        areasCount: 0,
        neighbourhoodsCount: 0,
        featuredAreasCount: 0,
        publishedProjectsCount: 0,
        verifiedResaleCount: 0,
        verifiedRentalCount: 0,
        unverifiedResaleCount: 0,
        unverifiedRentalCount: 0,
      },
      areas: [],
      neighbourhoods: [],
      mappableProjects: [],
      citiesAndMunicipalities: [],
      corridorCounts: {},
    }));

  const breadcrumbItems = [
    { label: 'Home', href: '/' },
    { label: 'Locations', current: true },
  ];

  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        name: 'Residential Areas in Kolkata | Locality Guide – Great Homes',
        description:
          'Explore Kolkata residential areas and neighbourhoods. Compare New Town, Rajarhat, Salt Lake, Ballygunge, connectivity and homes on Great Homes.',
        url: 'https://www.greathomes.co.in/locations',
        mainEntity: {
          '@type': 'ItemList',
          numberOfItems: summary.areas.length,
          itemListElement: summary.areas.map((area, idx) => ({
            '@type': 'ListItem',
            position: idx + 1,
            name: area.name,
            url: `https://www.greathomes.co.in/locations/${area.slug}`,
          })),
        },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Home',
            item: 'https://www.greathomes.co.in',
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: 'Locations',
            item: 'https://www.greathomes.co.in/locations',
          },
        ],
      },
    ],
  };

  return (
    <div className="min-h-screen bg-[#FAFAF8] text-[#111111] w-full min-w-0 overflow-x-hidden">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(structuredData) }}
      />

      <div className="bg-white border-b border-[rgba(17,17,17,0.08)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <Breadcrumbs items={breadcrumbItems} />
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10 w-full min-w-0">
        <div className="space-y-12 sm:space-y-14 pb-16">
          {/* 1. SERVER-RENDERED EDITORIAL HERO & COVERAGE SUMMARY (OUTSIDE SUSPENSE) */}
          <section className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-center">
              {/* Left Hero Copy */}
              <div className="lg:col-span-7 space-y-4">
                <div className="inline-flex items-center gap-1.5 text-xs text-[#218C5A] font-display font-semibold bg-[#218C5A]/10 px-3 py-1 rounded-full border border-[#218C5A]/20">
                  <Compass className="w-3.5 h-3.5" />
                  <span>Kolkata Location &amp; Neighbourhood Guide</span>
                </div>

                <h1 className="text-3xl sm:text-4xl lg:text-[46px] font-editorial font-normal text-[#111111] tracking-tight leading-[1.12]">
                  Explore <span className="text-[#E85D3F]">Kolkata&apos;s</span> Residential Corridors &amp; Neighbourhoods
                </h1>

                <p className="text-sm sm:text-base lg:text-[17px] font-body text-[#111111]/75 leading-relaxed max-w-2xl">
                  Discover the best residential locations across Kolkata. Compare neighbourhoods, explore connectivity, discover residential projects and find verified resale and rental opportunities.
                </p>
              </div>

              {/* Right Hero Architectural Skyline Illustration */}
              <div className="lg:col-span-5 hidden sm:flex justify-end">
                <div className="w-full max-w-[460px] h-[170px] sm:h-[195px] rounded-2xl bg-gradient-to-b from-[#F7F3EB] to-[#FAFAF8] border border-[rgba(17,17,17,0.06)] overflow-hidden flex items-center justify-center px-4 py-2 relative shadow-2xs">
                  <GreatHomesIllustration
                    id="LOCATION_DISCOVERY"
                    size="FEATURE"
                    className="w-full h-full object-contain opacity-95"
                  />
                </div>
              </div>
            </div>

            {/* 2. FACTUAL COVERAGE SUMMARY METRICS STRIP */}
            <div
              aria-label="Kolkata Location Coverage Summary"
              className="bg-[#F6F2EC] border border-[rgba(17,17,17,0.08)] rounded-2xl p-4 sm:p-5 grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 shadow-2xs"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-full bg-[#E85D3F]/12 border border-[#E85D3F]/20 flex items-center justify-center text-[#E85D3F] shrink-0">
                  <MapPin className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <span className="block text-xl sm:text-2xl font-display font-bold text-[#111111] leading-tight">
                    {summary.totals.areasCount}
                  </span>
                  <span className="block text-xs font-body text-[#111111]/70 truncate">
                    Key Residential Areas ({summary.totals.neighbourhoodsCount} Micro-Markets)
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-full bg-[#E85D3F]/12 border border-[#E85D3F]/20 flex items-center justify-center text-[#E85D3F] shrink-0">
                  <Building2 className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <span className="block text-xl sm:text-2xl font-display font-bold text-[#111111] leading-tight">
                    {summary.totals.publishedProjectsCount}
                  </span>
                  <span className="block text-xs font-body text-[#111111]/70 truncate">
                    Published Residential Projects
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-full bg-[#E85D3F]/12 border border-[#E85D3F]/20 flex items-center justify-center text-[#E85D3F] shrink-0">
                  <Home className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <span className="block text-xl sm:text-2xl font-display font-bold text-[#111111] leading-tight">
                    {summary.totals.verifiedResaleCount}
                  </span>
                  <span className="block text-xs font-body text-[#111111]/70 truncate">
                    Verified Resale Homes
                    {summary.totals.unverifiedResaleCount > 0
                      ? ` (+${summary.totals.unverifiedResaleCount} Unverified)`
                      : ''}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-full bg-[#E85D3F]/12 border border-[#E85D3F]/20 flex items-center justify-center text-[#E85D3F] shrink-0">
                  <Key className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <span className="block text-xl sm:text-2xl font-display font-bold text-[#111111] leading-tight">
                    {summary.totals.verifiedRentalCount}
                  </span>
                  <span className="block text-xs font-body text-[#111111]/70 truncate">
                    Verified Rental Homes
                    {summary.totals.unverifiedRentalCount > 0
                      ? ` (+${summary.totals.unverifiedRentalCount} Unverified)`
                      : ''}
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* 3-6. SSR-RENDERED LOCATION DIRECTORY + INTERACTIVE FILTERS & MAP (URL SYNC ISOLATED IN SUSPENSE) */}
          <LocationsDirectoryClient summary={summary} />

          {/* 7. SERVER-RENDERED CITIES & MUNICIPALITIES SECTION */}
          {summary.citiesAndMunicipalities.length > 0 && (
            <section
              aria-labelledby="cities-municipalities-heading"
              className="pt-8 border-t border-[rgba(17,17,17,0.08)]"
            >
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-center">
                <div className="lg:col-span-4 flex items-start gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-[#E85D3F]/10 border border-[#E85D3F]/20 flex items-center justify-center text-[#E85D3F] shrink-0 mt-0.5">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h2
                      id="cities-municipalities-heading"
                      className="text-lg sm:text-xl font-display font-bold text-[#111111] tracking-tight"
                    >
                      Cities &amp; Municipalities
                    </h2>
                    <p className="text-xs font-body text-[#111111]/65 mt-0.5 leading-relaxed">
                      Discover properties across key cities and districts in the Kolkata Metropolitan Region.
                    </p>
                  </div>
                </div>

                <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {summary.citiesAndMunicipalities.map(city => (
                    <div
                      key={city.id}
                      className="p-4 rounded-xl border border-[rgba(17,17,17,0.08)] bg-white hover:border-[rgba(17,17,17,0.25)] hover:shadow-sm transition-all flex flex-col justify-between gap-2 shadow-2xs"
                    >
                      <Link
                        href={`/locations/${city.slug}`}
                        className="flex items-center justify-between gap-3 group"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-full bg-[#FDECE8] flex items-center justify-center text-[#E85D3F] shrink-0">
                            <MapPin className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <h3 className="text-sm sm:text-base font-display font-bold text-[#111111] group-hover:text-[#E85D3F] transition-colors truncate">
                              {city.name}
                            </h3>
                            <span className="block text-[11px] font-body text-[#111111]/55 truncate">
                              {city.subtitle}
                            </span>
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-[#111111]/40 group-hover:text-[#E85D3F] group-hover:translate-x-0.5 transition-all shrink-0" />
                      </Link>

                      {city.childTowns.length > 0 && (
                        <div className="pt-2 border-t border-[rgba(17,17,17,0.06)] flex flex-wrap items-center gap-1">
                          <span className="text-[10px] font-display text-[#111111]/45 mr-0.5">
                            Includes:
                          </span>
                          {city.childTowns.map(t => (
                            <Link
                              key={t.slug}
                              href={`/locations/${t.slug}`}
                              className="text-[11px] font-display font-medium text-[#E85D3F] hover:underline"
                            >
                              {t.name}
                            </Link>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
