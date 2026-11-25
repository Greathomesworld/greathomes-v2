'use client';

import React, { Suspense, useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
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

export const POST_PROPERTY_PURPOSE_EVENT = 'gh:post-property-purpose';

interface PostPropertyHeroClientProps {
  initialLocations?: PostPropertyLocationOption[];
}

interface QuickSelectionState {
  listingType: ListingType;
  propertyType: SubmissionPropertyType;
  locationKey: string;
}

interface ParsedUrlQuickParams {
  listingType?: ListingType;
  propertyType?: SubmissionPropertyType;
  locationKey?: string;
}

/**
 * Isolated URL search-param synchronizer wrapped in `<Suspense fallback={null}>`
 * so `useSearchParams()` never suspends the Hero H1 or quick submission form during SSR.
 */
function PostPropertyUrlParamSync({
  onSync,
}: {
  onSync: (params: ParsedUrlQuickParams) => void;
}) {
  const searchParams = useSearchParams();
  const listingParam = searchParams?.get('listingType') || '';
  const propertyParam = searchParams?.get('propertyType') || '';
  const locationKeyParam =
    searchParams?.get('locationKey') ||
    (searchParams?.get('locality') === 'custom'
      ? 'custom'
      : searchParams?.get('locationId') || '');

  useEffect(() => {
    const parsed: ParsedUrlQuickParams = {};
    if (listingParam === 'RENTAL' || listingParam === 'RESALE') {
      parsed.listingType = listingParam;
    }
    if (
      propertyParam === 'APARTMENT' ||
      propertyParam === 'INDEPENDENT_HOUSE' ||
      propertyParam === 'PLOT'
    ) {
      parsed.propertyType = propertyParam;
    }
    if (locationKeyParam) {
      parsed.locationKey = locationKeyParam;
    }
    if (parsed.listingType || parsed.propertyType || parsed.locationKey) {
      onSync(parsed);
    }
  }, [listingParam, propertyParam, locationKeyParam, onSync]);

  return null;
}

/**
 * Lightweight client leaf for signed-in session status and My Property Submissions shortcut.
 */
export function PostPropertySessionStatus() {
  const { customer, loading: authLoading } = useCustomerAuth();

  if (!authLoading && !customer) {
    return null;
  }

  return (
    <div className="mt-2.5 lg:mt-4 text-xs sm:text-[13px] text-[#555555] font-body">
      {authLoading ? (
        <span className="inline-flex items-center gap-1.5">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-[#E85D3F]" />
          <span>Checking session...</span>
        </span>
      ) : customer ? (
        <div className="flex flex-col items-start gap-1 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-2.5 sm:gap-y-1">
          <span className="font-medium text-[#111111]">Signed in as {customer.name}</span>
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
  );
}

/**
 * Interactive quick property submission form controller for `/post-property`.
 * Preserves URL param hydration, Quick Links purpose shortcuts, OTP auth continuation,
 * and guided wizard redirection without blocking SSR of the Hero section or H1.
 */
export function PostPropertyHeroClient({
  initialLocations = [],
}: PostPropertyHeroClientProps) {
  const router = useRouter();
  const { customer, loading: authLoading, openAuthModal } = useCustomerAuth();

  const [locations, setLocations] = useState<PostPropertyLocationOption[]>(initialLocations);
  const [quickListingType, setQuickListingType] = useState<ListingType>('RESALE');
  const [quickPropertyType, setQuickPropertyType] = useState<SubmissionPropertyType | ''>('');
  const [quickLocationKey, setQuickLocationKey] = useState<string>('');
  const [quickFormErrors, setQuickFormErrors] = useState<{
    propertyType?: string;
    location?: string;
  }>({});
  const [pendingQuickSelection, setPendingQuickSelection] =
    useState<QuickSelectionState | null>(null);
  const [pendingAuthContinuation, setPendingAuthContinuation] = useState<'QUICK_FORM' | null>(null);
  const [isNavigatingToWizard, setIsNavigatingToWizard] = useState(false);

  const handleUrlParamSync = useCallback((parsed: ParsedUrlQuickParams) => {
    if (parsed.listingType) {
      setQuickListingType(parsed.listingType);
    }
    if (parsed.propertyType) {
      setQuickPropertyType(parsed.propertyType);
    }
    if (parsed.locationKey) {
      setQuickLocationKey(parsed.locationKey);
    }
  }, []);

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
    <>
      <Suspense fallback={null}>
        <PostPropertyUrlParamSync onSync={handleUrlParamSync} />
      </Suspense>
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
    </>
  );
}
