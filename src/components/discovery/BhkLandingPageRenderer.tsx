'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ChevronRight, Building2, MapPin, CheckCircle2, ShieldCheck, ArrowRight, HelpCircle } from 'lucide-react';
import { BhkLandingData, EligibleBhkLandingEntry } from '@/src/domain/projects/services/bhkLandingService';
import { formatIndianPrice } from '@/src/components/discovery/formatters';
import { safeJsonLd } from '@/src/lib/safeJsonLd';
import { formatLocationWithCity } from '@/src/domain/seo/metadataBuilder';

interface BhkLandingPageRendererProps {
  data: BhkLandingData;
  jsonLd: Record<string, unknown>;
  relatedBhkLinks?: EligibleBhkLandingEntry[];
}

export function BhkLandingPageRenderer({
  data,
  jsonLd,
  relatedBhkLinks = [],
}: BhkLandingPageRendererProps) {
  const {
    bedroomCount,
    localitySlug,
    localityName,
    isCityLevel,
    projects,
    totalProjects,
    totalConfigurations,
    verifiedReraCount,
    minPrice,
    hasPriceOnRequestOnly,
  } = data;

  const locationWithCity = formatLocationWithCity(localityName, 'Kolkata');
  const projectWord = totalProjects === 1 ? 'Project' : 'Projects';
  const typologyWord = totalConfigurations === 1 ? 'Unit Typology' : 'Unit Typologies';

  const startingPriceStr =
    !hasPriceOnRequestOnly && minPrice ? formatIndianPrice(minPrice) : 'Price on Request';

  const priceSentence =
    !hasPriceOnRequestOnly && minPrice
      ? `Published starting prices currently begin at ${formatIndianPrice(minPrice)}.`
      : 'Current pricing is available on request from the developer or Great Homes advisors.';

  const reraAnswer =
    verifiedReraCount > 0
      ? `${verifiedReraCount} of the ${totalProjects} listed ${bedroomCount} BHK ${projectWord.toLowerCase()} in ${locationWithCity} carry verified WBRERA registration records published directly on their Great Homes project pages.`
      : `Great Homes displays official WBRERA registration status and developer disclosures on each individual project page for ${bedroomCount} BHK developments in ${locationWithCity}.`;

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-[#111111]">
      {/* Schema.org Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }}
      />

      {/* Breadcrumb Navigation */}
      <nav aria-label="Breadcrumb" className="border-b border-[#EAE6DF] bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5">
          <ol className="flex items-center space-x-2 text-xs font-body text-[#111111]/60">
            <li>
              <Link href="/" className="hover:text-[#111111] transition-colors">
                Home
              </Link>
            </li>
            <li>
              <ChevronRight className="w-3.5 h-3.5 text-[#111111]/40" />
            </li>
            <li>
              <Link href="/buy" className="hover:text-[#111111] transition-colors">
                Buy
              </Link>
            </li>
            <li>
              <ChevronRight className="w-3.5 h-3.5 text-[#111111]/40" />
            </li>
            <li className="text-[#111111] font-medium" aria-current="page">
              {bedroomCount} BHK Flats in {localityName}
            </li>
          </ol>
        </div>
      </nav>

      {/* Hero Header */}
      <header className="border-b border-[#EAE6DF] bg-white py-10 sm:py-14">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#F5F2EB] border border-[#E5DFD5] text-xs font-display font-medium text-[#111111] uppercase tracking-wider mb-4">
            <Building2 className="w-3.5 h-3.5 text-[#735A3A]" />
            Verified Residential Portfolio
          </div>
          <h1 className="text-3xl sm:text-5xl font-editorial tracking-tight text-[#111111] mb-3">
            {bedroomCount} BHK Flats in {localityName}
          </h1>
          <p className="text-sm sm:text-base font-body text-[#111111]/75 max-w-3xl leading-relaxed">
            Explore {totalProjects} verified residential {projectWord.toLowerCase()} offering{' '}
            {bedroomCount} BHK configurations across {locationWithCity}. Compare floor plans, RERA
            approvals, construction milestones, and transparent pricing intelligence.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-6 text-xs sm:text-sm font-display text-[#111111]/80">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-600" />
              <span>
                <strong>{totalProjects}</strong> Verified {projectWord}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#735A3A]" />
              <span>
                <strong>{totalConfigurations}</strong> {typologyWord}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-600" />
              <span>
                Starting from <strong>{startingPriceStr}</strong>
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Projects Grid Section */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-xl sm:text-2xl font-display font-bold text-[#111111]">
              Available {bedroomCount} BHK Projects
            </h2>
            <p className="text-xs sm:text-sm font-body text-[#111111]/60 mt-1">
              Curated by Great Homes intelligence specialists
            </p>
          </div>
          <div className="text-xs font-display text-[#111111]/60">
            Showing {projects.length} of {totalProjects} developments
          </div>
        </div>

        {projects.length === 0 ? (
          <div className="bg-white border border-[#EAE6DF] p-12 text-center max-w-lg mx-auto">
            <Building2 className="w-10 h-10 text-[#111111]/30 mx-auto mb-3" />
            <h3 className="text-base font-display font-semibold text-[#111111] mb-1">
              No Direct Inventory Available
            </h3>
            <p className="text-xs font-body text-[#111111]/60 mb-4">
              There are currently no active {bedroomCount} BHK configurations matching this specific micro-market.
            </p>
            <Link
              href="/projects"
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#111111] text-white text-xs font-display font-medium hover:bg-[#333333] transition-colors"
            >
              Browse All Kolkata Projects
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
            {projects.map((p) => {
              const heroMedia = p.media?.find((m) => m.isFeatured) || p.media?.[0];
              const hasPublicPrice =
                !p.pricing?.priceOnRequest &&
                Boolean(p.pricing?.startingPrice && p.pricing.startingPrice > 0);
              const priceDisplay = hasPublicPrice
                ? formatIndianPrice(p.pricing.startingPrice!)
                : 'Price on Request';
              const locationLabel = formatLocationWithCity(
                p.location?.name || localityName,
                'Kolkata'
              );
              const matchingBhkConfigs = (p.configurations || []).filter(
                (c) => c.bedroomCount === bedroomCount
              );

              return (
                <article
                  key={p.id}
                  className="group bg-white border border-[#EAE6DF] overflow-hidden flex flex-col hover:border-[#111111]/40 transition-all duration-300 hover:shadow-sm"
                >
                  {/* Project Image */}
                  <div className="relative aspect-[16/10] bg-[#EAE6DF] overflow-hidden">
                    {heroMedia?.url ? (
                      <Image
                        src={heroMedia.url}
                        alt={heroMedia.altText || `${p.name} flagship view`}
                        fill
                        className="object-cover group-hover:scale-105 transition-transform duration-500"
                        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[#111111]/20">
                        <Building2 className="w-12 h-12" />
                      </div>
                    )}
                    {p.featured && (
                      <span className="absolute top-3 left-3 px-2 py-0.5 bg-[#111111] text-white text-[10px] font-display font-semibold uppercase tracking-wider">
                        Featured
                      </span>
                    )}
                    {p.rera?.hasVerifiedReraBadge && (
                      <span className="absolute top-3 right-3 px-2 py-0.5 bg-emerald-700/90 backdrop-blur-xs text-white text-[10px] font-display font-medium flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3" />
                        RERA
                      </span>
                    )}
                  </div>

                  {/* Card Body */}
                  <div className="p-5 flex-1 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center gap-1.5 text-xs font-body text-[#111111]/60 mb-1">
                        <MapPin className="w-3.5 h-3.5 shrink-0 text-[#735A3A]" />
                        <span className="truncate">{locationLabel}</span>
                      </div>

                      <h3 className="text-lg font-display font-bold text-[#111111] group-hover:text-[#735A3A] transition-colors leading-snug">
                        <Link href={`/projects/${p.slug}`}>{p.name}</Link>
                      </h3>

                      {p.developer?.name && (
                        <p className="text-xs font-body text-[#111111]/70 mt-0.5">
                          By {p.developer.name}
                        </p>
                      )}

                      {/* Config summary pill */}
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        <span className="px-2 py-0.5 bg-[#F5F2EB] text-[#111111] text-[11px] font-display font-medium border border-[#E5DFD5]">
                          {bedroomCount} BHK ({matchingBhkConfigs.length} variant
                          {matchingBhkConfigs.length === 1 ? '' : 's'})
                        </span>
                        {p.status && (
                          <span className="px-2 py-0.5 bg-[#F5F5F5] text-[#111111]/70 text-[11px] font-body border border-[#E5E5E5]">
                            {p.status.replace(/_/g, ' ')}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Pricing & CTA */}
                    <div className="mt-5 pt-4 border-t border-[#F0EBE1] flex items-center justify-between">
                      <div>
                        <div className="text-[10px] font-display text-[#111111]/50 uppercase tracking-wider">
                          Starting Price
                        </div>
                        <div className="text-base font-display font-bold text-[#111111]">
                          {priceDisplay}
                        </div>
                      </div>

                      <Link
                        href={`/projects/${p.slug}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#111111] text-white text-xs font-display font-medium group-hover:bg-[#735A3A] transition-colors"
                      >
                        View Project
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {/* Contextual Related BHK & Locality Links */}
        {(relatedBhkLinks.length > 0 || !isCityLevel) && (
          <section className="mt-14 pt-10 border-t border-[#EAE6DF]">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-5">
              <div>
                <h2 className="text-lg sm:text-xl font-display font-bold text-[#111111]">
                  Explore Related Configurations &amp; Localities
                </h2>
                <p className="text-xs sm:text-sm font-body text-[#111111]/60 mt-0.5">
                  Compare other verified BHK options across Kolkata micro-markets
                </p>
              </div>
              {!isCityLevel && (
                <Link
                  href={`/locations/${localitySlug}`}
                  className="inline-flex items-center gap-1.5 text-xs font-display font-semibold text-[#735A3A] hover:text-[#111111] transition-colors"
                >
                  <span>Full {localityName} Locality Guide</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              )}
            </div>

            <div className="flex flex-wrap gap-2.5">
              {relatedBhkLinks.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="inline-flex items-center gap-2 px-3.5 py-2 bg-white border border-[#E5DFD5] hover:border-[#111111] text-xs font-display font-medium text-[#111111] transition-colors"
                >
                  <span>{item.label}</span>
                  <span className="text-[11px] text-[#111111]/50">({item.totalProjects})</span>
                </Link>
              ))}
              <Link
                href="/buy"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#F5F2EB] border border-[#E5DFD5] hover:border-[#111111] text-xs font-display font-semibold text-[#111111] transition-colors"
              >
                <span>All Properties for Sale</span>
                <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          </section>
        )}

        {/* FAQs Section */}
        <section className="mt-14 sm:mt-16 pt-10 border-t border-[#EAE6DF]">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-1.5 text-xs font-display font-semibold text-[#735A3A] uppercase tracking-wider mb-2">
              <HelpCircle className="w-3.5 h-3.5" />
              Frequently Asked Questions
            </div>
            <h2 className="text-2xl sm:text-3xl font-display font-bold text-[#111111] mb-6">
              Buying {bedroomCount} BHK Flats in {localityName}
            </h2>

            <div className="space-y-4">
              <div className="bg-white border border-[#EAE6DF] p-5 sm:p-6">
                <h3 className="text-sm sm:text-base font-display font-semibold text-[#111111] mb-2">
                  How many verified {bedroomCount} BHK projects are available in {localityName}?
                </h3>
                <p className="text-xs sm:text-sm font-body text-[#111111]/70 leading-relaxed">
                  Great Homes features {totalProjects} verified residential{' '}
                  {projectWord.toLowerCase()} offering {bedroomCount} BHK configurations in{' '}
                  {locationWithCity}, complete with floor plans, carpet area details, and developer
                  profiles.
                </p>
              </div>

              <div className="bg-white border border-[#EAE6DF] p-5 sm:p-6">
                <h3 className="text-sm sm:text-base font-display font-semibold text-[#111111] mb-2">
                  What is the price range for {bedroomCount} BHK flats in {localityName}?
                </h3>
                <p className="text-xs sm:text-sm font-body text-[#111111]/70 leading-relaxed">
                  Prices for {bedroomCount} BHK flats in {locationWithCity} vary by micro-location,
                  carpet area, and tower specification. {priceSentence}
                </p>
              </div>

              <div className="bg-white border border-[#EAE6DF] p-5 sm:p-6">
                <h3 className="text-sm sm:text-base font-display font-semibold text-[#111111] mb-2">
                  Are {bedroomCount} BHK projects in {localityName} RERA registered?
                </h3>
                <p className="text-xs sm:text-sm font-body text-[#111111]/70 leading-relaxed">
                  {reraAnswer}
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
