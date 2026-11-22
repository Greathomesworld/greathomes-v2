import React, { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight,
  Building2,
  Camera,
  CheckCircle2,
  EyeOff,
  FileCheck2,
  FileText,
  Image as ImageIcon,
  MapPin,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react';
import { getPostPropertyPage1Data } from '@/src/domain/postProperty/page1Data';
import { PostPropertyHeroClient } from '@/src/components/post-property/PostPropertyHeroClient';
import { KolkataLineArt } from '@/src/components/post-property/KolkataLineArt';
import { PostPropertyFaqAccordion } from '@/src/components/post-property/PostPropertyFaqAccordion';
import { POST_PROPERTY_FAQS } from '@/src/components/post-property/postPropertyFaqData';
import { RecentListingThumbnail } from '@/src/components/post-property/RecentListingThumbnail';
import { PostPropertyQuickPurposeButtons } from '@/src/components/post-property/PostPropertyQuickPurposeButtons';

export const revalidate = 60;

export const metadata: Metadata = {
  title: 'Post Property in Kolkata | Sell or Rent Verified Homes | Great Homes',
  description:
    'Sell or rent your Kolkata apartment, independent house, or residential plot on Great Homes with guided submission, verified listings, and complete contact privacy.',
};

const SIMPLE_STEPS = [
  {
    num: '01',
    title: 'Add Property Details',
    desc: 'Share basic information about your property, locality, and pricing.',
    icon: FileText,
  },
  {
    num: '02',
    title: 'Upload Property Photographs',
    desc: 'Add at least 3 clear photographs of your property.',
    icon: ImageIcon,
  },
  {
    num: '03',
    title: 'Submit for Verification',
    desc: 'Our team verifies and publishes your listing.',
    icon: CheckCircle2,
  },
];

const WIZARD_WORKFLOW_STEPS = [
  {
    num: '01',
    title: 'Location & Project',
    desc: 'Confirm your Kolkata locality, link to a residential project if applicable, and provide the address.',
    icon: MapPin,
  },
  {
    num: '02',
    title: 'Details & Pricing',
    desc: 'Provide accurate area measurements, configuration details, and asking price or monthly rent.',
    icon: SlidersHorizontal,
  },
  {
    num: '03',
    title: 'Property Photographs',
    desc: 'Attach 3 to 15 clear property photographs (JPEG, PNG, WebP, or AVIF images only).',
    icon: Camera,
  },
  {
    num: '04',
    title: 'Authority & Consent',
    desc: 'Confirm legal owner authority or attest to explicit owner consent as an approved agency partner.',
    icon: FileCheck2,
  },
  {
    num: '05',
    title: 'Review & Submit',
    desc: 'Verify your complete property summary before sending your submission into the review queue.',
    icon: Building2,
  },
  {
    num: '06',
    title: 'Great Homes Verification',
    desc: 'Our moderation team reviews every detail manually before publishing your listing publicly.',
    icon: ShieldCheck,
  },
];

export default async function PostPropertyEntryPage() {
  const { locationOptions, stats, recentListings } = await getPostPropertyPage1Data();

  const showStats =
    Boolean(stats) &&
    ((stats?.publishedProjects ?? 0) > 0 ||
      (stats?.verifiedListings ?? 0) > 0 ||
      (stats?.locationsCovered ?? 0) > 0);

  return (
    <div className="min-h-screen bg-[#FAFAF8] text-[#111111]">
      {/* 1. Split Hero with Server-Rendered Kolkata Architectural Line-Art + Interactive Quick Form */}
      <Suspense
        fallback={
          <div className="border-b border-[#E5E0D8] bg-[#FAF7F2] px-4 py-16 text-center text-sm text-[#6E6A65] font-body">
            Loading Great Homes Post Property Hub...
          </div>
        }
      >
        <PostPropertyHeroClient
          initialLocations={locationOptions}
          skylineSlot={<KolkataLineArt className="w-full" />}
        />
      </Suspense>

      {/* 2. Three-Step Explanation Section (Server-Rendered) */}
      <section className="mx-auto max-w-6xl px-4 pt-12 pb-10 sm:pt-14 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto">
          <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#111111]">
            Post Your Property in 3 Simple Steps
          </h2>
          <p className="mt-2 text-sm sm:text-[15px] text-[#6E6A65] font-body">
            A quick and transparent process to get your property listed on Great Homes.
          </p>
        </div>

        <div className="mt-9 grid grid-cols-1 gap-7 md:grid-cols-[1fr_auto_1fr_auto_1fr] md:items-start md:gap-4 max-w-5xl mx-auto">
          {SIMPLE_STEPS.map((step, index) => {
            const Icon = step.icon;
            return (
              <React.Fragment key={step.num}>
                <div className="text-center px-3">
                  <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[#FFF3EE] text-[#E85D3F]">
                    <Icon className="h-6 w-6 stroke-[1.75]" aria-hidden="true" />
                  </div>
                  <h3 className="mt-3.5 font-display text-base font-bold text-[#111111]">
                    {step.num}. {step.title}
                  </h3>
                  <p className="mt-1.5 text-xs sm:text-sm leading-relaxed text-[#555555] font-body max-w-xs mx-auto">
                    {step.desc}
                  </p>
                </div>

                {index < SIMPLE_STEPS.length - 1 && (
                  <div
                    className="hidden md:flex items-center justify-center pt-5 text-[#C5BFB7]"
                    aria-hidden="true"
                  >
                    <ArrowRight className="h-5 w-5" />
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>

        <div className="mt-8 text-center">
          <a
            href="#submission-governance"
            className="inline-flex min-h-[42px] items-center justify-center rounded-lg border border-[#D9D5D0] bg-white px-5 py-2 text-xs sm:text-sm font-semibold text-[#111111] transition hover:bg-[#F5F3F0] hover:border-[#ABA59E] font-display whitespace-nowrap"
          >
            Learn How It Works
          </a>
        </div>
      </section>

      {/* 3. Genuine Marketplace Statistics Strip (Server-Rendered) */}
      {showStats && stats && (
        <section
          aria-label="Great Homes verified platform overview"
          className="mx-auto max-w-5xl px-4 py-4 sm:px-6 lg:px-8"
        >
          <div className="rounded-2xl border border-[#E5E0D8] bg-white px-6 py-7 sm:px-8 sm:py-8">
            <div className="grid grid-cols-1 gap-6 divide-y divide-[#E5E0D8] sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-y-0 text-center">
              <div className="pb-4 sm:pb-0 sm:px-4">
                <div className="font-display text-3xl sm:text-[34px] font-bold tracking-tight text-[#111111] tabular-nums">
                  {stats.publishedProjects.toLocaleString('en-IN')}
                </div>
                <div className="mt-1 text-xs sm:text-sm text-[#555555] font-body">
                  Published residential projects in Kolkata
                </div>
              </div>

              <div className="py-4 sm:py-0 sm:px-4">
                <div className="font-display text-3xl sm:text-[34px] font-bold tracking-tight text-[#111111] tabular-nums">
                  {stats.verifiedListings.toLocaleString('en-IN')}
                </div>
                <div className="mt-1 text-xs sm:text-sm text-[#555555] font-body">
                  Verified resale &amp; rental homes
                </div>
              </div>

              <div className="pt-4 sm:pt-0 sm:px-4">
                <div className="font-display text-3xl sm:text-[34px] font-bold tracking-tight text-[#111111] tabular-nums">
                  {stats.locationsCovered.toLocaleString('en-IN')}
                </div>
                <div className="mt-1 text-xs sm:text-sm text-[#555555] font-body">
                  Kolkata localities covered
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* 4. Recently Posted Properties in Kolkata (Server-Rendered Cards + Leaf Thumbnail) */}
      <section className="mx-auto max-w-5xl px-4 pt-10 pb-10 sm:pt-12 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <h2 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-[#111111]">
            Recently Posted Properties in Kolkata
          </h2>
          <Link
            href="/buy?inventoryType=RESALE"
            className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-[#E85D3F] hover:text-[#D44E32] font-display whitespace-nowrap"
          >
            <span>View All Listings</span>
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>

        {recentListings.length === 0 ? (
          <div className="rounded-xl border border-[#E5E0D8] bg-white p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="font-display text-sm font-bold text-[#111111]">
                Verified Kolkata listings are curated continuously
              </p>
              <p className="mt-1 text-xs sm:text-sm text-[#6E6A65] font-body">
                Every submitted property passes manual staff verification before appearing in public
                discovery.
              </p>
            </div>
            <Link
              href="/projects"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#111111] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#262626] font-display whitespace-nowrap self-start sm:self-center"
            >
              <span>Explore Projects</span>
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {recentListings.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                className="group flex items-center justify-between gap-2.5 sm:gap-5 rounded-xl border border-[#E5E0D8] bg-white p-3 sm:px-4 sm:py-3.5 transition hover:border-[#C5BFB7] hover:shadow-xs"
              >
                <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0">
                  <div className="relative h-14 w-16 sm:h-15 sm:w-24 shrink-0 overflow-hidden rounded-lg bg-[#F5F2EC]">
                    <RecentListingThumbnail imageUrl={item.imageUrl} title={item.title} />
                  </div>

                  <div className="min-w-0">
                    <h3 className="font-display text-sm sm:text-[15px] font-bold text-[#111111] group-hover:text-[#E85D3F] transition-colors truncate">
                      {item.title}
                    </h3>
                    <p className="mt-0.5 text-xs text-[#6E6A65] font-body truncate">
                      {item.metaText}
                    </p>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-8 shrink-0 text-right">
                  <span className="font-display text-sm sm:text-[15px] font-bold text-[#111111] tabular-nums whitespace-nowrap">
                    {item.priceDisplay}
                  </span>
                  <span className="text-[11px] sm:text-xs text-[#6E6A65] font-body sm:w-20 tabular-nums whitespace-nowrap">
                    {item.dateLabel}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* 5. Verification Governance & Guided Submission Overview (Server-Rendered) */}
      <section
        id="submission-governance"
        className="border-t border-b border-[#E5E0D8] bg-[#F5F2EC] py-12 sm:py-14"
      >
        <div id="submission-paths" className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div className="max-w-2xl">
              <h2 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-[#111111]">
                How Verification &amp; Guided Submission Works
              </h2>
              <p className="mt-1.5 text-xs sm:text-sm text-[#555555] font-body">
                Account eligibility for Property Owners and approved Listing Partners is checked
                automatically before you begin. Every listing completes our five-step submission
                wizard and manual review before going live.
              </p>
            </div>
            <Link
              href="/my-properties"
              className="inline-flex min-h-[40px] items-center justify-center rounded-lg border border-[#D9D5D0] bg-white px-4 py-2 text-xs font-semibold text-[#111111] hover:bg-[#FAF8F5] font-display whitespace-nowrap self-start sm:self-auto"
            >
              My Property Submissions
            </Link>
          </div>

          <div className="mt-8 pt-6 border-t border-[#E5E0D8]">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h3 className="font-display text-base sm:text-lg font-bold text-[#111111]">
                Inside the Guided Property Submission Flow
              </h3>
              <span className="inline-flex items-center gap-1.5 text-xs text-[#6E6A65] font-body">
                <EyeOff className="h-3.5 w-3.5 text-[#E85D3F]" aria-hidden="true" />
                <span>Manual verification required before public listing</span>
              </span>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
              {WIZARD_WORKFLOW_STEPS.map((step) => {
                const Icon = step.icon;
                return (
                  <div
                    key={step.num}
                    className="rounded-xl border border-[#E5E0D8] bg-white p-4 flex flex-col justify-between"
                  >
                    <div className="flex items-center justify-between text-xs text-[#6E6A65] font-display">
                      <span className="font-bold text-[#E85D3F] tabular-nums">
                        {step.num === '06' ? 'Final Review' : `Step ${step.num}`}
                      </span>
                      <Icon className="h-4 w-4 text-[#6E6A65]" aria-hidden="true" />
                    </div>
                    <h4 className="mt-2 font-display text-sm font-bold text-[#111111]">
                      {step.num === '06' ? step.title : `${step.num}. ${step.title}`}
                    </h4>
                    <p className="mt-1 text-xs leading-relaxed text-[#555555] font-body">
                      {step.desc}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* 6. Frequently Asked Questions */}
      <section id="faqs" className="mx-auto max-w-5xl px-4 py-12 sm:py-14 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <h2 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-[#111111]">
            Frequently Asked Questions
          </h2>
          <Link
            href="/guides"
            className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-[#E85D3F] hover:text-[#D44E32] font-display whitespace-nowrap"
          >
            <span>Property Guides</span>
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>

        <PostPropertyFaqAccordion faqs={POST_PROPERTY_FAQS} />
      </section>

      {/* 7. Slim Quick Links Strip Directly Above Global Footer */}
      <section
        aria-label="Post property quick links"
        className="border-t border-[#E5E0D8] bg-[#F4F1EA] py-6"
      >
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <span className="font-display text-base font-bold text-[#111111]">Quick Links</span>
          <nav
            aria-label="Post Property quick navigation"
            className="flex flex-wrap items-center gap-y-2 text-xs sm:text-sm font-medium text-[#4A4743] font-body sm:divide-x sm:divide-[#D9D5D0]"
          >
            <a
              href="#faqs"
              className="pr-4 sm:pr-5 hover:text-[#111111] transition-colors whitespace-nowrap"
            >
              Post Property FAQs
            </a>
            <PostPropertyQuickPurposeButtons />
            <Link
              href="/guides"
              className="sm:pl-5 hover:text-[#111111] transition-colors whitespace-nowrap"
            >
              Property Guidelines
            </Link>
          </nav>
        </div>
      </section>
    </div>
  );
}
