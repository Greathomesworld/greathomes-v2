'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Check, Loader2 } from 'lucide-react';
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
import { PostPropertyTrustTicker } from './PostPropertyTrustTicker';

export const POST_PROPERTY_PURPOSE_EVENT = 'gh:post-property-purpose';

interface PostPropertyHeroClientProps {
  initialLocations?: PostPropertyLocationOption[];
  skylineSlot: React.ReactNode;
}

interface QuickSelectionState {
  listingType: ListingType;
  propertyType: SubmissionPropertyType;
  locationKey: string;
}

export function PostPropertyHeroClient({
  initialLocations = [],
  skylineSlot,
}: PostPropertyHeroClientProps) {
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

  // Listen to Quick Links strip purpose shortcuts (Sell Property / Rent Property)
  useEffect(() => {
    const handlePurposeEvent = (event: Event) => {
      const customEvent = event as CustomEvent<ListingType>;
      if (customEvent.detail === 'RESALE' || customEvent.detail === 'RENTAL') {
        setQuickListingType(customEvent.detail);
      }
    };
    window.addEventListener(POST_PROPERTY_PURPOSE_EVENT, handlePurposeEvent);
    return () => {
      window.removeEventListener(POST_PROPERTY_PURPOSE_EVENT, handlePurposeEvent);
    };
  }, []);

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

  return (
    <section className="relative overflow-hidden border-b border-[#E5E0D8] bg-gradient-to-b from-[#F6F1E9] via-[#FAF7F2] to-[#FAFAF8] pt-3 pb-6 sm:pt-5 sm:pb-8 lg:pt-12 lg:pb-12">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-3.5 sm:gap-5 lg:grid-cols-12 lg:gap-10 lg:items-center">
          {/* Left Proposition Column (Illustration appears first on mobile; desktop remains unchanged) */}
          <div className="lg:col-span-7 flex flex-col justify-between">
            <div className="order-2 lg:order-1">
              <h1
                className="font-editorial text-[27px] leading-[1.1] font-normal tracking-tight text-[#111111] text-center sm:text-4xl lg:text-left lg:text-[54px] lg:leading-[1.06]"
                style={{ textWrap: 'balance' }}
              >
                Sell or Rent Your Property in Kolkata, Faster.
              </h1>

              <p className="hidden lg:block mt-4 max-w-xl font-body text-[17px] leading-relaxed text-[#4A4743]">
                List your apartment, independent house, or plot on Great Homes and reach genuine,
                verified buyers and tenants.
              </p>

              {/* Mobile Compact Vertical Trust Ticker (1000ms interval, upward loop) */}
              <div className="mt-2 lg:hidden">
                <PostPropertyTrustTicker />
              </div>

              {/* Desktop Static Trust List (Unchanged) */}
              <ul className="hidden lg:block mt-5 space-y-2 font-body text-[15px] text-[#333333]">
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

              {/* Signed-in Session Status & Quick Shortcut (OTP promotional branding removed) */}
              {(authLoading || customer) && (
                <div className="mt-2.5 lg:mt-4 text-xs sm:text-[13px] text-[#555555] font-body">
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
                  ) : null}
                </div>
              )}
            </div>

            {/* Mobile Kolkata Hero Illustration (< lg) + Desktop Kolkata Skyline SVG (lg: unchanged) */}
            <div className="order-1 mb-2.5 mx-auto w-full max-w-[320px] sm:max-w-[380px] lg:order-2 lg:mt-4 lg:mb-0 lg:-mb-12 lg:mx-0 lg:max-w-[540px]">
              <Image
                src="/assets/aistudio/kolkata_greathomes_hero_70pct_e2cb9440.webp"
                alt="Kolkata skyline with Victoria Memorial, Howrah Bridge, and tram"
                width={952}
                height={317}
                priority
                sizes="(max-width: 640px) 320px, 380px"
                referrerPolicy="no-referrer"
                className="block h-auto w-full lg:hidden"
              />
              <div className="hidden lg:block">{skylineSlot}</div>
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
  );
}
