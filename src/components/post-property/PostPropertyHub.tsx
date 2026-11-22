'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import {
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  ShieldCheck,
  Loader2,
  Camera,
  MapPin,
  FileCheck2,
  FileText,
  Image as ImageIcon,
  SlidersHorizontal,
  EyeOff,
  Lock,
} from 'lucide-react';
import { useCustomerAuth } from '@/src/components/customer/CustomerAuthContext';
import {
  sanitizeInternalRedirectPath,
  type ListingType,
  type SubmissionPropertyType,
} from '@/src/domain/propertySubmission/validation';
import {
  buildSelectableKolkataLocations,
  type PostPropertyLocationOption,
} from '@/src/domain/locations/locationOptions';
import { QuickPostHeroForm } from './QuickPostHeroForm';
import { KolkataLineArt } from './KolkataLineArt';
import { PostPropertyFaqAccordion } from './PostPropertyFaqAccordion';
import { POST_PROPERTY_FAQS } from './postPropertyFaqData';

export interface PostPropertyStatsData {
  publishedProjects: number;
  verifiedListings: number;
  locationsCovered: number;
}

export interface RecentPostedPropertyItem {
  id: string;
  title: string;
  metaText: string;
  priceDisplay: string;
  dateLabel: string;
  href: string;
  imageUrl: string | null;
  listingType: 'RESALE' | 'RENTAL';
}

interface PostPropertyHubProps {
  initialLocations?: PostPropertyLocationOption[];
  stats?: PostPropertyStatsData;
  recentListings?: RecentPostedPropertyItem[];
}

interface QuickSelectionState {
  listingType: ListingType;
  propertyType: SubmissionPropertyType;
  locationKey: string;
}

export function PostPropertyHub({
  initialLocations = [],
  stats,
  recentListings = [],
}: PostPropertyHubProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { customer, loading: authLoading, openAuthModal } = useCustomerAuth();

  const initialListingTypeParam = searchParams?.get('listingType');
  const initialPropertyTypeParam = searchParams?.get('propertyType');
  const initialLocationKeyParam =
    searchParams?.get('locationKey') ||
    (searchParams?.get('locality') === 'custom'
      ? 'custom'
      : searchParams?.get('locationId') || '');

  const [locations, setLocations] = useState<PostPropertyLocationOption[]>(initialLocations);

  // Hero Quick Form state (prefilled when returning via Change Selection from Page 2)
  const [quickListingType, setQuickListingType] = useState<ListingType>(
    initialListingTypeParam === 'RENTAL' ? 'RENTAL' : 'RESALE'
  );
  const [quickPropertyType, setQuickPropertyType] = useState<SubmissionPropertyType | ''>(
    initialPropertyTypeParam === 'APARTMENT' ||
      initialPropertyTypeParam === 'INDEPENDENT_HOUSE' ||
      initialPropertyTypeParam === 'PLOT'
      ? initialPropertyTypeParam
      : ''
  );
  const [quickLocationKey, setQuickLocationKey] = useState<string>(initialLocationKeyParam);
  const [quickFormErrors, setQuickFormErrors] = useState<{
    propertyType?: string;
    location?: string;
  }>({});
  const [pendingQuickSelection, setPendingQuickSelection] =
    useState<QuickSelectionState | null>(null);
  const [pendingAuthContinuation, setPendingAuthContinuation] = useState<'QUICK_FORM' | null>(null);
  const [isNavigatingToWizard, setIsNavigatingToWizard] = useState(false);
  const [failedListingImages, setFailedListingImages] = useState<Record<string, boolean>>({});

  // Sync quick form state if user clicks back/forward or navigates via Change Selection
  useEffect(() => {
    const paramListing = searchParams?.get('listingType');
    const paramProp = searchParams?.get('propertyType');
    const paramLocKey =
      searchParams?.get('locationKey') ||
      (searchParams?.get('locality') === 'custom'
        ? 'custom'
        : searchParams?.get('locationId') || '');

    if (paramListing === 'RENTAL' || paramListing === 'RESALE') {
      setQuickListingType(paramListing);
    }
    if (
      paramProp === 'APARTMENT' ||
      paramProp === 'INDEPENDENT_HOUSE' ||
      paramProp === 'PLOT'
    ) {
      setQuickPropertyType(paramProp);
    }
    if (paramLocKey) {
      setQuickLocationKey(paramLocKey);
    }
  }, [searchParams]);

  // Use SSR initialLocations directly; only fetch minimal locations on client if SSR list is empty
  useEffect(() => {
    if (initialLocations.length > 0) return;
    let active = true;
    async function syncLocations() {
      try {
        const res = await fetch('/api/locations?fields=minimal');
        if (!active || !res.ok) return;
        const data = await res.json();
        if (active && Array.isArray(data) && data.length > 0) {
          setLocations(buildSelectableKolkataLocations(data));
        }
      } catch {
        // Retain SSR initialLocations cleanly
      }
    }
    syncLocations();
    return () => {
      active = false;
    };
  }, [initialLocations.length]);

  const navigateToWizard = useCallback(
    (quickSelection?: QuickSelectionState | null) => {
      const params = new URLSearchParams();

      if (quickSelection) {
        params.set('listingType', quickSelection.listingType);
        params.set('propertyType', quickSelection.propertyType);
        if (quickSelection.locationKey === 'custom') {
          params.set('locality', 'custom');
        } else if (quickSelection.locationKey) {
          params.set('locationId', quickSelection.locationKey);
        }
      }

      const queryString = params.toString();
      const rawTarget = queryString ? `/post-property/new?${queryString}` : '/post-property/new';
      const target = sanitizeInternalRedirectPath(rawTarget, '/post-property/new');
      setIsNavigatingToWizard(true);
      router.push(target);
    },
    [router]
  );

  // Automatic continuation to Page 2 after OTP login completes without losing Page 1 selections
  useEffect(() => {
    if (!authLoading && customer && pendingAuthContinuation === 'QUICK_FORM') {
      const savedQuick = pendingQuickSelection;
      setPendingAuthContinuation(null);
      setPendingQuickSelection(null);
      navigateToWizard(savedQuick);
    }
  }, [authLoading, customer, pendingAuthContinuation, pendingQuickSelection, navigateToWizard]);

  const handleQuickFormSubmit = () => {
    const nextErrors: { propertyType?: string; location?: string } = {};
    if (!quickPropertyType) {
      nextErrors.propertyType = 'Please select a property type.';
    }
    if (!quickLocationKey) {
      nextErrors.location = 'Please select a Kolkata locality or choose custom entry.';
    }

    if (nextErrors.propertyType || nextErrors.location) {
      setQuickFormErrors(nextErrors);
      return;
    }

    setQuickFormErrors({});
    const quickSelection: QuickSelectionState = {
      listingType: quickListingType,
      propertyType: quickPropertyType as SubmissionPropertyType,
      locationKey: quickLocationKey,
    };

    if (!customer) {
      setPendingQuickSelection(quickSelection);
      setPendingAuthContinuation('QUICK_FORM');
      openAuthModal('login');
      return;
    }

    navigateToWizard(quickSelection);
  };

  const handleQuickPurposeShortcut = (purpose: ListingType) => {
    setQuickListingType(purpose);
    const formEl = document.getElementById('quick-post-form');
    if (formEl) {
      formEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const simpleSteps = [
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

  const wizardWorkflowSteps = [
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

  const showStats =
    Boolean(stats) &&
    ((stats?.publishedProjects ?? 0) > 0 ||
      (stats?.verifiedListings ?? 0) > 0 ||
      (stats?.locationsCovered ?? 0) > 0);

  return (
    <div className="min-h-screen bg-[#FAFAF8] text-[#111111]">
      {/* 1. Split Hero with Kolkata Architectural Line-Art + Quick Submission Form */}
      <section className="relative overflow-hidden border-b border-[#E5E0D8] bg-gradient-to-b from-[#F6F1E9] via-[#FAF7F2] to-[#FAFAF8] pt-6 pb-7 sm:pt-12 sm:pb-12">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 lg:gap-10 lg:items-center">
            {/* Left Proposition Column */}
            <div className="lg:col-span-7 flex flex-col justify-between">
              <div>
                <h1
                  className="font-editorial text-[34px] leading-[1.08] font-normal tracking-tight text-[#111111] sm:text-5xl lg:text-[54px] lg:leading-[1.06]"
                  style={{ textWrap: 'balance' }}
                >
                  Sell or Rent Your Property in Kolkata, Faster.
                </h1>

                <p className="mt-3 sm:mt-4 max-w-xl font-body text-sm sm:text-[17px] leading-relaxed text-[#4A4743]">
                  List your apartment, independent house, or plot on Great Homes and reach genuine,
                  verified buyers and tenants.
                </p>

                <ul className="mt-4 sm:mt-5 space-y-2 font-body text-sm sm:text-[15px] text-[#333333]">
                  <li className="flex items-center gap-2.5">
                    <Check className="h-4 w-4 shrink-0 text-[#E85D3F]" strokeWidth={2.4} aria-hidden="true" />
                    <span>Verified listings &amp; serious enquiries</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check className="h-4 w-4 shrink-0 text-[#E85D3F]" strokeWidth={2.4} aria-hidden="true" />
                    <span>Simple, guided submission</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <Check className="h-4 w-4 shrink-0 text-[#E85D3F]" strokeWidth={2.4} aria-hidden="true" />
                    <span>Your data stays private and secure</span>
                  </li>
                </ul>

                {/* Signed-in Session Status & Quick Shortcut (Separate rows on mobile, no orphan bullets) */}
                <div className="mt-4 text-xs sm:text-[13px] text-[#555555] font-body">
                  {authLoading ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-[#E85D3F]" />
                      <span>Checking session...</span>
                    </span>
                  ) : customer ? (
                    <div className="flex flex-col items-start gap-1 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-2.5 sm:gap-y-1">
                      <span className="font-medium text-[#111111]">
                        Signed in as {customer.name}
                      </span>
                      {customer.accountType && (
                        <>
                          <span aria-hidden="true" className="hidden sm:inline text-[#C5BFB7]">
                            ·
                          </span>
                          <span className="font-semibold text-[#4A4743]">
                            {customer.accountType === 'LISTING_PARTNER'
                              ? 'Listing Partner Account'
                              : 'Property Owner Account'}
                          </span>
                        </>
                      )}
                      <span aria-hidden="true" className="hidden sm:inline text-[#C5BFB7]">
                        ·
                      </span>
                      <Link
                        href="/my-properties"
                        className="font-display font-semibold text-[#E85D3F] hover:text-[#D44E32] hover:underline"
                      >
                        My Property Submissions →
                      </Link>
                    </div>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-[#555555]">
                      <Lock className="h-3.5 w-3.5 shrink-0 text-[#E85D3F]" aria-hidden="true" />
                      <span>Mobile OTP verification protects every submission</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Restrained Kolkata Skyline Visual */}
              <div className="mt-3 sm:mt-4 mb-0 lg:-mb-12 max-w-[540px]">
                <KolkataLineArt className="w-full" />
              </div>
            </div>

            {/* Right Compact Quick Submission Form */}
            <div className="lg:col-span-5 relative z-10">
              <QuickPostHeroForm
                locations={locations}
                listingType={quickListingType}
                onListingTypeChange={(val) => setQuickListingType(val)}
                propertyType={quickPropertyType}
                onPropertyTypeChange={(val) => {
                  setQuickPropertyType(val);
                  if (val && quickFormErrors.propertyType) {
                    setQuickFormErrors((prev) => ({ ...prev, propertyType: undefined }));
                  }
                }}
                selectedLocationKey={quickLocationKey}
                onLocationChange={(val) => {
                  setQuickLocationKey(val);
                  if (val && quickFormErrors.location) {
                    setQuickFormErrors((prev) => ({ ...prev, location: undefined }));
                  }
                }}
                onSubmit={handleQuickFormSubmit}
                errors={quickFormErrors}
                isSubmitting={isNavigatingToWizard}
                ctaLabel="Start Now"
              />
            </div>
          </div>
        </div>
      </section>

      {/* 2. Three-Step Explanation Section */}
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
          {simpleSteps.map((step, index) => {
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

                {index < simpleSteps.length - 1 && (
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

      {/* 3. Genuine Marketplace Statistics Strip (Server-Derived Only) */}
      {showStats && stats && (
        <section aria-label="Great Homes verified platform overview" className="mx-auto max-w-5xl px-4 py-4 sm:px-6 lg:px-8">
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

      {/* 4. Recently Posted Properties in Kolkata (Verified & Published Only) */}
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
                Every submitted property passes manual staff verification before appearing in public discovery.
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
            {recentListings.map((item) => {
              const showImg = Boolean(item.imageUrl) && !failedListingImages[item.id];
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  className="group flex items-center justify-between gap-2.5 sm:gap-5 rounded-xl border border-[#E5E0D8] bg-white p-3 sm:px-4 sm:py-3.5 transition hover:border-[#C5BFB7] hover:shadow-xs"
                >
                  <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0">
                    <div className="relative h-14 w-16 sm:h-15 sm:w-24 shrink-0 overflow-hidden rounded-lg bg-[#F5F2EC]">
                      {showImg ? (
                        <Image
                          src={item.imageUrl!}
                          alt={item.title}
                          fill
                          sizes="96px"
                          className="object-cover"
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          onError={() =>
                            setFailedListingImages((prev) => ({ ...prev, [item.id]: true }))
                          }
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-[#8D8881]">
                          <Building2 className="h-5 w-5" aria-hidden="true" />
                        </div>
                      )}
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
              );
            })}
          </div>
        )}
      </section>

      {/* 5. Verification Governance & Guided Submission Overview */}
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

          {/* Compact Guided Submission & Verification Overview */}
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
              {wizardWorkflowSteps.map((step) => {
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
            <button
              type="button"
              onClick={() => handleQuickPurposeShortcut('RESALE')}
              className="px-0 pr-4 sm:px-5 hover:text-[#111111] transition-colors cursor-pointer whitespace-nowrap"
            >
              Sell Property
            </button>
            <button
              type="button"
              onClick={() => handleQuickPurposeShortcut('RENTAL')}
              className="px-0 pr-4 sm:px-5 hover:text-[#111111] transition-colors cursor-pointer whitespace-nowrap"
            >
              Rent Property
            </button>
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
