'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  AlertCircle,
  Loader2,
  MapPin,
  ShieldCheck,
  EyeOff,
  Home,
  LandPlot,
  FileText,
  Pencil,
  Info,
  ChevronDown,
} from 'lucide-react';
import { useCustomerAuth } from '@/src/components/customer/CustomerAuthContext';
import { safeFetchJson } from '@/src/lib/safeApiFetch';
import {
  buildSelectableKolkataLocations,
  type PostPropertyLocationOption,
} from '@/src/domain/locations/locationOptions';
import type { PostPropertyProjectOption } from '@/src/domain/postProperty/page1Data';
import {
  ListingType,
  ListingSource,
  SubmissionPropertyType,
  PropertySubmissionPayload,
  CANONICAL_OWNER_DECLARATION_TEXT,
  CANONICAL_PARTNER_ATTESTATION_TEXT,
  CANONICAL_ATTESTATION_VERSION,
  CANONICAL_RESIDENTIAL_AMENITIES,
  LEASE_DURATION_OPTIONS,
  NOTICE_PERIOD_OPTIONS,
  LeaseDurationOption,
  NoticePeriodOption,
  MAX_SUBMISSION_PHOTOS,
  MAX_SUBMISSION_IMAGE_SIZE_BYTES,
  SUBMISSION_PHOTO_CATEGORIES,
  getCanonicalAmenitiesForPropertyType,
  validateAreaHierarchy,
  validateWizardStep,
  computeHighestReachedWizardStep,
} from '@/src/domain/propertySubmission/validation';
import {
  AccountEligibilityPanel,
  evaluateBeforeYouStartState,
  type PartnerEligibilityState,
} from './AccountEligibilityPanel';
import {
  VISIBLE_WIZARD_STEPS,
  type InternalWizardStepNumber,
  toVisibleStep,
  resolvePage2EntryParams,
  deriveSubmissionSourceFromAccountType,
  clampVisibleInternalStep,
} from './wizardStepMapping';

function WizardStepLoadingFallback() {
  return (
    <div className="mt-6 rounded-xl border border-[#E5E0D8] bg-[#FAFAF8] p-8 flex items-center justify-center gap-2.5 text-sm text-[#6E6A65] font-body">
      <Loader2 className="h-4 w-4 animate-spin text-[#E85D3F]" />
      <span>Loading step...</span>
    </div>
  );
}

const PhotographsStep = dynamic(
  () => import('./steps/PhotographsStep').then((mod) => mod.PhotographsStep),
  { ssr: false, loading: () => <WizardStepLoadingFallback /> }
);

const AuthorityConsentStep = dynamic(
  () => import('./steps/AuthorityConsentStep').then((mod) => mod.AuthorityConsentStep),
  { ssr: false, loading: () => <WizardStepLoadingFallback /> }
);

const ReviewSubmitStep = dynamic(
  () => import('./steps/ReviewSubmitStep').then((mod) => mod.ReviewSubmitStep),
  { ssr: false, loading: () => <WizardStepLoadingFallback /> }
);

interface LocationItem {
  id: string;
  name: string;
  slug: string;
  type: string;
  parentId?: string | null;
  featured?: boolean;
  status?: string;
}

interface ProjectItem {
  id: string;
  name: string;
  slug: string;
  locationId?: string;
  propertyType?: string;
}

interface AmenityOption {
  id: string;
  slug: string;
  name: string;
  category: string;
  applicablePropertyTypes: readonly SubmissionPropertyType[];
}

export interface UploadQueueItem {
  id: string;
  filename: string;
  sizeBytes: number;
  status: 'uploading' | 'error';
  progress: number;
  errorMessage?: string;
  previewUrl: string;
  file: File;
  category: string;
  caption: string;
}

export const PHOTO_UPLOAD_SERVICE_UNAVAILABLE_MESSAGE =
  'The photo upload service is temporarily unavailable. Please try again.';

export type SubmissionPhotoItem = NonNullable<PropertySubmissionPayload['photos']>[number];

export interface PhotoUploadXhrInput {
  status: number;
  contentType: string | null;
  responseText: string;
}

export type PhotoUploadXhrOutcome =
  | {
      ok: true;
      photos: SubmissionPhotoItem[];
      asset?: unknown;
      errorMessage?: undefined;
      code?: undefined;
      isTemporaryUnavailable?: undefined;
    }
  | {
      ok: false;
      photos?: undefined;
      asset?: undefined;
      errorMessage: string;
      code?: string;
      isTemporaryUnavailable?: boolean;
    };

export function parsePhotoUploadXhrResponse(
  input: PhotoUploadXhrInput
): PhotoUploadXhrOutcome {
  const status = Number(input.status) || 0;
  const contentType = (input.contentType || '').toLowerCase().trim();
  const rawBody = typeof input.responseText === 'string' ? input.responseText.trim() : '';

  const looksLikeHtml =
    contentType.includes('text/html') ||
    /^<!doctype\s+html/i.test(rawBody) ||
    /^<html[\s>]/i.test(rawBody) ||
    (rawBody.startsWith('<') && /<\/html>/i.test(rawBody));

  if (looksLikeHtml) {
    return {
      ok: false,
      errorMessage: PHOTO_UPLOAD_SERVICE_UNAVAILABLE_MESSAGE,
      code: 'HTML_OR_WARMUP_RESPONSE',
      isTemporaryUnavailable: true,
    };
  }

  if (!rawBody) {
    return {
      ok: false,
      errorMessage: PHOTO_UPLOAD_SERVICE_UNAVAILABLE_MESSAGE,
      code: 'EMPTY_RESPONSE_BODY',
      isTemporaryUnavailable: true,
    };
  }

  if (contentType && !contentType.includes('application/json')) {
    return {
      ok: false,
      errorMessage: PHOTO_UPLOAD_SERVICE_UNAVAILABLE_MESSAGE,
      code: 'UNEXPECTED_CONTENT_TYPE',
      isTemporaryUnavailable: true,
    };
  }

  let data: any = null;
  try {
    data = JSON.parse(rawBody);
  } catch {
    data = null;
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return {
      ok: false,
      errorMessage: PHOTO_UPLOAD_SERVICE_UNAVAILABLE_MESSAGE,
      code: 'MALFORMED_JSON_RESPONSE',
      isTemporaryUnavailable: true,
    };
  }

  if (
    status >= 200 &&
    status < 300 &&
    data.success === true &&
    Array.isArray(data.photos)
  ) {
    return {
      ok: true,
      photos: data.photos as SubmissionPhotoItem[],
      asset: data.asset,
    };
  }

  const serverErrorText =
    typeof data.error === 'string' && data.error.trim().length > 0
      ? data.error.trim()
      : null;
  const serverErrorCode =
    typeof data.code === 'string' && data.code.trim().length > 0
      ? data.code.trim()
      : undefined;

  if (
    serverErrorCode === 'STORAGE_UNAVAILABLE' ||
    serverErrorCode === 'PERSISTENCE_UNAVAILABLE' ||
    status === 502 ||
    status === 503 ||
    status === 504
  ) {
    return {
      ok: false,
      errorMessage: serverErrorText || PHOTO_UPLOAD_SERVICE_UNAVAILABLE_MESSAGE,
      code: serverErrorCode || 'STORAGE_UNAVAILABLE',
      isTemporaryUnavailable: true,
    };
  }

  if (status >= 400 && status < 500) {
    return {
      ok: false,
      errorMessage:
        serverErrorText ||
        'Photograph could not be uploaded. Please check the file and try again.',
      code: serverErrorCode,
    };
  }

  if (status >= 500) {
    return {
      ok: false,
      errorMessage: serverErrorText || PHOTO_UPLOAD_SERVICE_UNAVAILABLE_MESSAGE,
      code: serverErrorCode,
      isTemporaryUnavailable: true,
    };
  }

  return {
    ok: false,
    errorMessage: serverErrorText || PHOTO_UPLOAD_SERVICE_UNAVAILABLE_MESSAGE,
    code: serverErrorCode || 'INVALID_SUCCESS_PAYLOAD',
    isTemporaryUnavailable: true,
  };
}

export function shouldShowPhotoGalleryEmptyState(
  confirmedPhotosCount: number,
  uploadQueueCount: number
): boolean {
  return (Number(confirmedPhotosCount) || 0) === 0 && (Number(uploadQueueCount) || 0) === 0;
}

export interface FileIdentityLike {
  name: string;
  size: number;
  lastModified?: number;
  type?: string;
}

export function getUploadFileIdentityKey(file: FileIdentityLike): string {
  const normalizedName = (file.name || '').trim();
  const size = Number(file.size) || 0;
  const lastModified = typeof file.lastModified === 'number' ? file.lastModified : 0;
  const normalizedMime = (file.type || '').trim().toLowerCase();
  return `${normalizedName}::${size}::${lastModified}::${normalizedMime}`;
}

export function isDuplicateUploadQueueFile(
  candidate: FileIdentityLike,
  existingQueue: ReadonlyArray<{ file: FileIdentityLike; status: 'uploading' | 'error' }>,
  alreadySelectedInBatch: ReadonlyArray<FileIdentityLike> = []
): boolean {
  const candidateKey = getUploadFileIdentityKey(candidate);
  for (const item of existingQueue) {
    if (
      (item.status === 'uploading' || item.status === 'error') &&
      getUploadFileIdentityKey(item.file) === candidateKey
    ) {
      return true;
    }
  }
  for (const batchFile of alreadySelectedInBatch) {
    if (getUploadFileIdentityKey(batchFile) === candidateKey) {
      return true;
    }
  }
  return false;
}

function sanitizeDetailsForSelection(
  details: PropertySubmissionPayload['details'] | undefined,
  propertyType: SubmissionPropertyType,
  listingType: ListingType
): NonNullable<PropertySubmissionPayload['details']> {
  const next = { ...(details || {}) };

  if (propertyType === 'PLOT') {
    delete next.bedroomCount;
    delete next.bathroomCount;
    delete next.balconies;
    delete next.floorCategory;
    delete next.totalFloors;
    delete next.furnishing;
    delete next.carpetArea;
    delete next.builtUpArea;
    delete next.superBuiltUpArea;
    delete next.coveredParking;
    delete next.openParking;
    delete next.propertyAgeYears;
    next.configuration = 'Residential Plot';
  } else {
    delete next.plotArea;
    if (propertyType === 'INDEPENDENT_HOUSE') {
      if (!next.floorCategory) {
        delete next.floorCategory;
      }
    } else if (!next.floorCategory) {
      next.floorCategory = 'MID_FLOOR';
    }
    if (!next.bedroomCount) {
      next.bedroomCount = 3;
      next.configuration = '3 BHK';
    }
    if (!next.bathroomCount) {
      next.bathroomCount = 2;
    }
    if (!next.furnishing) {
      next.furnishing = 'SEMI_FURNISHED';
    }
  }

  if (listingType === 'RESALE') {
    delete next.monthlyRent;
    delete next.securityDeposit;
    delete next.leaseDuration;
    delete next.noticePeriod;
    delete next.availabilityDate;
  } else {
    delete next.askingPrice;
    delete next.possessionDate;
  }

  if (Array.isArray(next.amenities)) {
    const allowedSlugs = new Set(
      getCanonicalAmenitiesForPropertyType(propertyType).map((a) => a.slug)
    );
    next.amenities = next.amenities.filter((slug) => allowedSlugs.has(slug));
  }

  return next;
}

function formatIndianCurrency(value?: number | null): string {
  if (!value || !Number.isFinite(value) || value <= 0) return '—';
  if (value >= 10_000_000) {
    return `₹${(value / 10_000_000).toFixed(2).replace(/\.00$/, '')} Crore`;
  }
  if (value >= 100_000) {
    return `₹${(value / 100_000).toFixed(2).replace(/\.00$/, '')} Lakh`;
  }
  return `₹${value.toLocaleString('en-IN')}`;
}

function formatPropertyTypeDisplay(propertyType: SubmissionPropertyType): string {
  switch (propertyType) {
    case 'APARTMENT':
      return 'Apartment';
    case 'INDEPENDENT_HOUSE':
      return 'Independent House';
    case 'PLOT':
      return 'Residential Plot';
    default:
      return 'Property';
  }
}

export interface PostPropertyWizardProps {
  initialLocations?: PostPropertyLocationOption[];
  initialProjects?: PostPropertyProjectOption[];
  initialProjectsLocationId?: string | null;
}

export function PostPropertyWizard({
  initialLocations = [],
  initialProjects = [],
  initialProjectsLocationId = null,
}: PostPropertyWizardProps = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { customer, partnerEligibility, loading: authLoading, openAuthModal, refresh } =
    useCustomerAuth();

  const requestedDraftId = searchParams?.get('draftId') || searchParams?.get('id') || null;
  const page2Entry = useMemo(
    () =>
      resolvePage2EntryParams({
        draftId: requestedDraftId,
        listingType: searchParams?.get('listingType'),
        propertyType: searchParams?.get('propertyType'),
        locationId: searchParams?.get('locationId'),
        locality: searchParams?.get('locality'),
      }),
    [requestedDraftId, searchParams]
  );

  // Security: never trust ?source= in URL as authorization; derive strictly from verified customer accountType
  const initialDerivedSource = deriveSubmissionSourceFromAccountType(customer?.accountType);

  // Redirect back to Page 1 cleanly if entering new flow with missing/invalid required selections
  useEffect(() => {
    if (page2Entry.requiresRedirectToPage1) {
      router.replace('/post-property');
    }
  }, [page2Entry.requiresRedirectToPage1, router]);

  // Internal step state preserves steps 1..6 while UI starts at visible step 1 (internal step 2)
  const [currentStep, setCurrentStep] = useState<InternalWizardStepNumber>(2);
  const [highestReachedStep, setHighestReachedStep] = useState<InternalWizardStepNumber>(2);
  const [hasConfirmedBeforeStart, setHasConfirmedBeforeStart] = useState<boolean>(
    Boolean(requestedDraftId)
  );
  const wizardStepContainerRef = useRef<HTMLDivElement | null>(null);

  const [wizardState, setWizardState] = useState<PropertySubmissionPayload>(() => ({
    listingType: page2Entry.listingType,
    listingSource: initialDerivedSource,
    propertyType: page2Entry.propertyType,
    location: {
      city: 'Kolkata',
      locality: '',
      locationId: null,
      address: '',
      projectId: null,
      projectName: '',
      isCustomLocality: page2Entry.isCustomLocality,
      latitude: null,
      longitude: null,
    },
    details: sanitizeDetailsForSelection(
      {
        configuration: '3 BHK',
        bedroomCount: 3,
        bathroomCount: 2,
        balconies: undefined,
        coveredParking: undefined,
        openParking: undefined,
        propertyAgeYears: undefined,
        carpetArea: undefined,
        builtUpArea: undefined,
        superBuiltUpArea: undefined,
        plotArea: undefined,
        askingPrice: undefined,
        monthlyRent: undefined,
        securityDeposit: undefined,
        maintenance: undefined,
        furnishing: 'SEMI_FURNISHED',
        facing: 'EAST',
        floorCategory: page2Entry.propertyType === 'APARTMENT' ? 'MID_FLOOR' : undefined,
        totalFloors: undefined,
        possession: 'READY_TO_MOVE',
        possessionDate: undefined,
        availabilityDate: undefined,
        leaseDuration: undefined,
        noticePeriod: undefined,
        amenities: [],
        description: '',
      },
      page2Entry.propertyType,
      page2Entry.listingType
    ),
    photos: [],
    consent: {
      ownerDeclarationAccepted: false,
      partnerAttestationAccepted: false,
      declarationText:
        initialDerivedSource === 'PARTNER'
          ? CANONICAL_PARTNER_ATTESTATION_TEXT
          : CANONICAL_OWNER_DECLARATION_TEXT,
      attestationVersion: CANONICAL_ATTESTATION_VERSION,
    },
  }));

  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [stepErrors, setStepErrors] = useState<string[]>([]);
  const [apiError, setApiError] = useState<string | null>(null);

  // Server-verified partner eligibility + profile details
  const [partnerStatus, setPartnerStatus] = useState<PartnerEligibilityState>({
    checking: false,
    checked: false,
    eligible: false,
    status: null,
    message: null,
    profile: null,
  });

  // Reference data from existing APIs
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [ssrLocationOptions] = useState<PostPropertyLocationOption[]>(initialLocations);
  const [projects, setProjects] = useState<ProjectItem[]>(initialProjects);
  const initialProjectsConsumedRef = useRef<boolean>(false);
  const amenitiesFetchedRef = useRef<boolean>(false);
  const [amenitiesCatalog, setAmenitiesCatalog] = useState<AmenityOption[]>(
    () =>
      CANONICAL_RESIDENTIAL_AMENITIES.map((a) => ({
        id: a.slug,
        slug: a.slug,
        name: a.name,
        category: a.category,
        applicablePropertyTypes: a.applicablePropertyTypes,
      }))
  );
  const [loadingReferenceData, setLoadingReferenceData] = useState(false);
  const [loadingLocalityProjects, setLoadingLocalityProjects] = useState(false);
  const [projectResetNotice, setProjectResetNotice] = useState<string | null>(null);
  const [invalidUrlLocationNotice, setInvalidUrlLocationNotice] = useState(false);

  // Step 4 (Visible Step 3) photo upload state
  const [photoCategoryInput, setPhotoCategoryInput] = useState<string>(
    SUBMISSION_PHOTO_CATEGORIES[0]
  );
  const [photoCaptionInput, setPhotoCaptionInput] = useState('');
  const [photoUploadError, setPhotoUploadError] = useState<string | null>(null);
  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([]);
  const [isDraggingPhotos, setIsDraggingPhotos] = useState(false);
  const [mutatingPhotoId, setMutatingPhotoId] = useState<string | null>(null);

  const previewUrlsRef = useRef<Set<string>>(new Set());
  const draftSyncPromiseRef = useRef<Promise<string | null> | null>(null);
  const hasAppliedUrlLocationRef = useRef<boolean>(false);
  const hydratedProjectPairRef = useRef<{
    locationId: string | null;
    projectId: string | null;
  } | null>(null);

  useEffect(() => {
    const urls = previewUrlsRef.current;
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, []);

  // Draft resume, CHANGES_REQUESTED correction & read-only inspection state
  const [isHydratingDraft, setIsHydratingDraft] = useState<boolean>(Boolean(requestedDraftId));
  const [draftHydrationError, setDraftHydrationError] = useState<string | null>(null);
  const [loadedSubmissionStatus, setLoadedSubmissionStatus] = useState<string>('DRAFT');
  const [loadedReferenceId, setLoadedReferenceId] = useState<string | null>(null);
  const [loadedLatestFeedback, setLoadedLatestFeedback] = useState<{
    submitterFeedback: string | null;
    createdAt: string;
    newStatus: string;
  } | null>(null);
  const [loadedActivityTimeline, setLoadedActivityTimeline] = useState<
    Array<{
      id: string;
      label: string;
      description: string;
      previousStatus: string | null;
      newStatus: string;
      timestamp: string;
    }>
  >([]);
  const [loadedPermissions, setLoadedPermissions] = useState<{
    canEdit: boolean;
    canResubmit: boolean;
    canWithdraw: boolean;
    isReadOnly: boolean;
  }>({
    canEdit: true,
    canResubmit: false,
    canWithdraw: true,
    isReadOnly: false,
  });
  const [loadedNextAction, setLoadedNextAction] = useState<string | null>(null);
  const [loadedVersion, setLoadedVersion] = useState<number | null>(null);
  const [versionConflict, setVersionConflict] = useState<boolean>(false);
  const [draftSavedBanner, setDraftSavedBanner] = useState<string | null>(null);

  // Final submission state
  const [isSyncingDraft, setIsSyncingDraft] = useState(false);
  const [isSubmittingFinal, setIsSubmittingFinal] = useState(false);
  const [submittedRecord, setSubmittedRecord] = useState<{
    id: string;
    submissionStatus: string;
    submittedAt: string;
    listingType: string;
    listingSource: string;
  } | null>(null);

  const selectableLocations = useMemo(
    () =>
      locations.length > 0
        ? buildSelectableKolkataLocations(locations)
        : ssrLocationOptions,
    [locations, ssrLocationOptions]
  );

  // Check server partner status whenever authenticated customer is a LISTING_PARTNER
  const checkPartnerStatusOnServer = useCallback(async (): Promise<boolean> => {
    setPartnerStatus((prev) => ({ ...prev, checking: true, message: null }));
    try {
      const result = await safeFetchJson<any>('/api/customer/partner-status', {
        cache: 'no-store',
      });
      if (!result.ok || !result.data?.success) {
        setPartnerStatus({
          checking: false,
          checked: true,
          eligible: false,
          status: 'ERROR',
          message: result.error || 'Could not verify partner eligibility.',
          profile: null,
        });
        return false;
      }
      const data = result.data;
      const isEligible = Boolean(data.eligible && data.status === 'ACTIVE');
      setPartnerStatus({
        checking: false,
        checked: true,
        eligible: isEligible,
        status: data.status || 'NONE',
        message: data.message || null,
        profile: data.profile || null,
      });
      return isEligible;
    } catch {
      setPartnerStatus({
        checking: false,
        checked: true,
        eligible: false,
        status: 'NETWORK_ERROR',
        message: 'Network error while verifying partner eligibility.',
        profile: null,
      });
      return false;
    }
  }, []);

  useEffect(() => {
    if (authLoading || !customer) return;
    if (customer.accountType === 'LISTING_PARTNER') {
      if (partnerEligibility && partnerEligibility.isPartner) {
        const isEligible = Boolean(
          partnerEligibility.eligible && partnerEligibility.status === 'ACTIVE'
        );
        setPartnerStatus({
          checking: false,
          checked: true,
          eligible: isEligible,
          status: partnerEligibility.status || 'NONE',
          message: partnerEligibility.message || null,
          profile: (partnerEligibility.profile as any) || null,
        });
      } else {
        void checkPartnerStatusOnServer();
      }
    } else {
      setPartnerStatus({
        checking: false,
        checked: true,
        eligible: customer.accountType === 'OWNER',
        status: null,
        message: null,
        profile: null,
      });
    }
  }, [authLoading, customer, partnerEligibility, checkPartnerStatusOnServer]);

  // Hydrate existing submission when ?draftId={id} is supplied (Draft always overrides query params)
  useEffect(() => {
    if (!requestedDraftId) {
      setIsHydratingDraft(false);
      setDraftHydrationError(null);
      return;
    }
    if (authLoading) return;
    if (!customer) {
      setIsHydratingDraft(false);
      return;
    }

    let active = true;
    async function hydrateExistingSubmission() {
      setIsHydratingDraft(true);
      setDraftHydrationError(null);
      setApiError(null);

      try {
        const result = await safeFetchJson<any>(
          `/api/customer/submissions/${encodeURIComponent(requestedDraftId!)}`,
          {
            method: 'GET',
            cache: 'no-store',
          }
        );

        if (!active) return;

        if (!result.ok || !result.data?.success || !result.data?.submission) {
          setDraftHydrationError(
            result.error ||
              'This property submission could not be found or you do not have permission to access it.'
          );
          return;
        }
        const data = result.data;

        const sub = data.submission;
        const payload =
          typeof sub.payload === 'object' && sub.payload !== null
            ? (sub.payload as Record<string, any>)
            : {};
        const loc =
          typeof payload.location === 'object' && payload.location !== null
            ? (payload.location as Record<string, any>)
            : {};
        const det =
          typeof payload.details === 'object' && payload.details !== null
            ? (payload.details as Record<string, any>)
            : {};
        const con =
          typeof payload.consent === 'object' && payload.consent !== null
            ? (payload.consent as Record<string, any>)
            : {};

        const persistedPhotos = Array.isArray(data.photos)
          ? data.photos
          : Array.isArray(payload.photos)
          ? payload.photos
          : [];

        const hydratedListingType: ListingType =
          sub.listingType === 'RENTAL' ? 'RENTAL' : 'RESALE';
        const hydratedListingSource: ListingSource =
          sub.listingSource === 'PARTNER' ? 'PARTNER' : 'OWNER';
        const hydratedPropertyType: SubmissionPropertyType =
          payload.propertyType === 'INDEPENDENT_HOUSE' || payload.propertyType === 'PLOT'
            ? payload.propertyType
            : 'APARTMENT';

        const hydratedLocationId =
          typeof loc.locationId === 'string' && loc.locationId.trim().length > 0
            ? loc.locationId.trim()
            : null;
        const hydratedProjectId =
          typeof loc.projectId === 'string' && loc.projectId.trim().length > 0
            ? loc.projectId.trim()
            : null;

        hydratedProjectPairRef.current = {
          locationId: hydratedLocationId,
          projectId: hydratedProjectId,
        };

        setSubmissionId(String(sub.id));
        setLoadedVersion(typeof sub.version === 'number' ? sub.version : 1);
        setVersionConflict(false);
        setLoadedSubmissionStatus(String(sub.submissionStatus || 'DRAFT'));
        setLoadedReferenceId(String(data.summary?.referenceId || sub.id));
        setLoadedLatestFeedback(data.latestFeedback || null);
        setLoadedActivityTimeline(
          Array.isArray(data.activityTimeline) ? data.activityTimeline : []
        );
        const canEditStatus = ['DRAFT', 'CHANGES_REQUESTED'].includes(
          String(sub.submissionStatus || 'DRAFT')
        );
        setLoadedPermissions(
          data.permissions || {
            canEdit: canEditStatus,
            canResubmit: sub.submissionStatus === 'CHANGES_REQUESTED',
            canWithdraw: ['DRAFT', 'SUBMITTED', 'CHANGES_REQUESTED'].includes(
              String(sub.submissionStatus || 'DRAFT')
            ),
            isReadOnly: !canEditStatus,
          }
        );
        setLoadedNextAction(data.nextAction || null);

        const hydratedWizardPayload: PropertySubmissionPayload = {
          listingType: hydratedListingType,
          listingSource: hydratedListingSource,
          propertyType: hydratedPropertyType,
          location: {
            city: typeof loc.city === 'string' && loc.city.trim() ? loc.city.trim() : 'Kolkata',
            locality: typeof loc.locality === 'string' ? loc.locality : '',
            locationId: hydratedLocationId,
            address: typeof loc.address === 'string' ? loc.address : '',
            projectId: hydratedProjectId,
            projectName: typeof loc.projectName === 'string' ? loc.projectName : '',
            isCustomLocality: Boolean(loc.isCustomLocality),
            coordinates: loc.coordinates,
          } as any,
          details: sanitizeDetailsForSelection(
            {
              configuration:
                det.configuration ||
                (typeof det.bedrooms === 'number' ? `${det.bedrooms} BHK` : '3 BHK'),
              bedroomCount: det.bedroomCount ?? det.bedrooms ?? 3,
              bathroomCount: det.bathroomCount ?? det.bathrooms ?? 2,
              balconies: det.balconies ?? undefined,
              coveredParking: det.coveredParking ?? undefined,
              openParking: det.openParking ?? undefined,
              propertyAgeYears: det.propertyAgeYears ?? undefined,
              carpetArea: det.carpetArea ?? det.carpetAreaSqFt ?? undefined,
              builtUpArea: det.builtUpArea ?? det.builtUpAreaSqFt ?? undefined,
              superBuiltUpArea: det.superBuiltUpArea ?? det.superBuiltUpAreaSqFt ?? undefined,
              plotArea: det.plotArea ?? det.plotAreaSqFt ?? undefined,
              askingPrice: det.askingPrice ?? det.expectedPrice ?? undefined,
              monthlyRent: det.monthlyRent ?? undefined,
              securityDeposit: det.securityDeposit ?? undefined,
              maintenance: det.maintenance ?? det.maintenanceCharges ?? undefined,
              furnishing: det.furnishing ?? det.furnishingStatus ?? 'SEMI_FURNISHED',
              facing: det.facing || 'EAST',
              floorCategory:
                det.floorCategory ??
                det.floorNumber ??
                (hydratedPropertyType === 'APARTMENT' ? 'MID_FLOOR' : undefined),
              totalFloors: det.totalFloors ?? undefined,
              possession: det.possession ?? det.possessionStatus ?? 'READY_TO_MOVE',
              possessionDate: det.possessionDate ?? undefined,
              availabilityDate: det.availabilityDate ?? undefined,
              leaseDuration: det.leaseDuration ?? undefined,
              noticePeriod: det.noticePeriod ?? undefined,
              amenities: Array.isArray(det.amenities) ? det.amenities : [],
              description: typeof det.description === 'string' ? det.description : '',
            },
            hydratedPropertyType,
            hydratedListingType
          ),
          photos: persistedPhotos,
          consent: {
            ownerDeclarationAccepted: Boolean(con.ownerDeclarationAccepted),
            partnerAttestationAccepted: Boolean(con.partnerAttestationAccepted),
            declarationText:
              typeof con.declarationText === 'string' && con.declarationText.trim()
                ? con.declarationText
                : hydratedListingSource === 'PARTNER'
                ? CANONICAL_PARTNER_ATTESTATION_TEXT
                : CANONICAL_OWNER_DECLARATION_TEXT,
            attestationVersion:
              typeof con.attestationVersion === 'string' && con.attestationVersion.trim()
                ? con.attestationVersion
                : CANONICAL_ATTESTATION_VERSION,
          },
        };

        setWizardState(hydratedWizardPayload);

        const computedHighestStep = computeHighestReachedWizardStep(hydratedWizardPayload, {
          isReadOnly: !canEditStatus,
          rawPersistedPayload: payload,
        });
        const clampedHighest = clampVisibleInternalStep(computedHighestStep);
        setHighestReachedStep(clampedHighest);
        setCurrentStep(!canEditStatus ? 6 : clampedHighest);
        setHasConfirmedBeforeStart(true);
      } catch {
        if (active) {
          setDraftHydrationError(
            'Unable to load your saved property submission right now. Please check your connection and try again.'
          );
        }
      } finally {
        if (active) {
          setIsHydratingDraft(false);
        }
      }
    }

    hydrateExistingSubmission();
    return () => {
      active = false;
    };
  }, [requestedDraftId, authLoading, customer]);

  // Derive listingSource strictly from customer.accountType for new submissions
  useEffect(() => {
    if (requestedDraftId || submissionId || !customer?.accountType) return;
    const expectedSource = deriveSubmissionSourceFromAccountType(customer.accountType);
    setWizardState((prev) => {
      if (prev.listingSource === expectedSource) return prev;
      return {
        ...prev,
        listingSource: expectedSource,
        consent: {
          ...prev.consent,
          attestationVersion: CANONICAL_ATTESTATION_VERSION,
          declarationText:
            expectedSource === 'PARTNER'
              ? CANONICAL_PARTNER_ATTESTATION_TEXT
              : CANONICAL_OWNER_DECLARATION_TEXT,
        },
      };
    });
  }, [requestedDraftId, submissionId, customer?.accountType]);

  // Fallback client fetch for locations only when SSR initialLocations are absent
  useEffect(() => {
    if (ssrLocationOptions.length > 0) return;
    let active = true;
    async function fetchLocationsMinimal() {
      setLoadingReferenceData(true);
      try {
        const locRes = await fetch('/api/locations?fields=minimal');
        if (active && locRes.ok) {
          const locData = await locRes.json();
          if (Array.isArray(locData)) {
            setLocations(locData);
          }
        }
      } catch {
        // Non-fatal; custom locality remains available
      } finally {
        if (active) setLoadingReferenceData(false);
      }
    }
    fetchLocationsMinimal();
    return () => {
      active = false;
    };
  }, [ssrLocationOptions.length]);

  // Lazy-load canonical amenities from server only when entering Step 2 (Details & Pricing)
  useEffect(() => {
    if (currentStep < 3 || amenitiesFetchedRef.current) return;
    amenitiesFetchedRef.current = true;
    let active = true;
    async function fetchAmenitiesCatalog() {
      try {
        const amenRes = await fetch('/api/amenities');
        if (active && amenRes.ok) {
          const amenData = await amenRes.json();
          if (Array.isArray(amenData?.data) && amenData.data.length > 0) {
            setAmenitiesCatalog(amenData.data);
          }
        }
      } catch {
        // Non-fatal; built-in CANONICAL_RESIDENTIAL_AMENITIES remains active
      }
    }
    fetchAmenitiesCatalog();
    return () => {
      active = false;
    };
  }, [currentStep]);

  // Resolve ?locationId=... query preselection cleanly once canonical locations load (never overriding drafts)
  useEffect(() => {
    if (
      requestedDraftId ||
      page2Entry.isCustomLocality ||
      !page2Entry.locationId ||
      hasAppliedUrlLocationRef.current ||
      selectableLocations.length === 0
    ) {
      return;
    }

    hasAppliedUrlLocationRef.current = true;
    const matched =
      selectableLocations.find((l) => l.id === page2Entry.locationId) ||
      locations.find((l) => l.id === page2Entry.locationId);

    if (!matched) {
      setInvalidUrlLocationNotice(true);
      return;
    }

    setInvalidUrlLocationNotice(false);
    setWizardState((prev) => {
      if (
        prev.location?.locationId ||
        prev.location?.locality ||
        prev.location?.isCustomLocality
      ) {
        return prev;
      }
      return {
        ...prev,
        location: {
          ...(prev.location || {
            city: 'Kolkata',
            locality: '',
            address: '',
            isCustomLocality: false,
          }),
          locality: matched.name,
          locationId: matched.id,
          isCustomLocality: false,
          projectId: null,
          projectName: '',
        },
      };
    });
  }, [requestedDraftId, page2Entry.isCustomLocality, page2Entry.locationId, locations, selectableLocations]);

  const selectedLocationId = wizardState.location?.locationId || null;
  const isCustomLocalityMode = Boolean(wizardState.location?.isCustomLocality);

  // Locality-filtered project fetch whenever selected verified locality changes
  useEffect(() => {
    let active = true;
    if (isCustomLocalityMode || !selectedLocationId) {
      setProjects([]);
      setLoadingLocalityProjects(false);
      return;
    }

    // Reuse SSR-preloaded projects on first render for matching initial locationId
    if (
      !initialProjectsConsumedRef.current &&
      initialProjectsLocationId &&
      selectedLocationId === initialProjectsLocationId
    ) {
      initialProjectsConsumedRef.current = true;
      setProjects(initialProjects);
      setLoadingLocalityProjects(false);
      return;
    }
    initialProjectsConsumedRef.current = true;

    async function fetchProjectsForLocality() {
      setLoadingLocalityProjects(true);
      try {
        const res = await fetch(
          `/api/projects?locationId=${encodeURIComponent(selectedLocationId!)}&limit=50&fields=minimal`
        );
        if (active && res.ok) {
          const projData = await res.json();
          const list: ProjectItem[] = Array.isArray(projData?.data) ? projData.data : [];
          setProjects(list);

          setWizardState((prev) => {
            const currentProjId = prev.location?.projectId;
            if (!currentProjId) return prev;
            const stillCompatible = list.some((p) => p.id === currentProjId);
            if (stillCompatible) return prev;

            if (
              list.length === 0 &&
              hydratedProjectPairRef.current &&
              hydratedProjectPairRef.current.locationId === prev.location?.locationId &&
              hydratedProjectPairRef.current.projectId === currentProjId
            ) {
              return prev;
            }

            setProjectResetNotice(
              'Previously selected project was cleared because it does not belong to the chosen locality.'
            );
            return {
              ...prev,
              location: {
                ...(prev.location || {
                  city: 'Kolkata',
                  locality: '',
                  address: '',
                  isCustomLocality: false,
                }),
                projectId: null,
                projectName: '',
              },
            };
          });
        }
      } catch {
        if (active) setProjects([]);
      } finally {
        if (active) setLoadingLocalityProjects(false);
      }
    }

    fetchProjectsForLocality();
    return () => {
      active = false;
    };
  }, [selectedLocationId, isCustomLocalityMode]);

  const visibleStep = toVisibleStep(currentStep);
  const highestVisibleStep = toVisibleStep(highestReachedStep);
  const activeVisibleMeta = useMemo(
    () =>
      VISIBLE_WIZARD_STEPS.find((s) => s.visibleStep === visibleStep) ||
      VISIBLE_WIZARD_STEPS[0],
    [visibleStep]
  );
  const nextVisibleMeta = useMemo(
    () => VISIBLE_WIZARD_STEPS.find((s) => s.visibleStep === visibleStep + 1) || null,
    [visibleStep]
  );

  const hasActiveUploads = useMemo(
    () => uploadQueue.some((item) => item.status === 'uploading'),
    [uploadQueue]
  );
  const isMutatingGallery = Boolean(mutatingPhotoId);

  const eligibilityEvaluation = evaluateBeforeYouStartState({
    authLoading,
    customer,
    partnerStatus,
  });

  // Sync or create draft on server without creating duplicates or clobbering server-managed media_assets
  const syncDraftWithServer = async (): Promise<string | null> => {
    if (!customer) return null;
    if (draftSyncPromiseRef.current) {
      return await draftSyncPromiseRef.current;
    }

    const runSync = async (): Promise<string | null> => {
      setIsSyncingDraft(true);
      setApiError(null);

      const { photos: _omitPhotos, ...payloadWithoutPhotos } = wizardState;
      const sanitizedWithoutPhotos = {
        ...payloadWithoutPhotos,
        details: sanitizeDetailsForSelection(
          wizardState.details,
          wizardState.propertyType,
          wizardState.listingType
        ),
      };

      try {
        if (!submissionId) {
          const result = await safeFetchJson<any>('/api/customer/submissions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              listingType: sanitizedWithoutPhotos.listingType,
              listingSource: sanitizedWithoutPhotos.listingSource,
              payload: sanitizedWithoutPhotos,
            }),
          });
          if (!result.ok || !result.data?.success || !result.data?.submission?.id) {
            if (result.status === 403 && customer?.accountType === 'LISTING_PARTNER') {
              void checkPartnerStatusOnServer();
            }
            throw new Error(result.error || 'Could not initialize property submission draft.');
          }
          const data = result.data;
          const createdId = String(data.submission.id);
          setSubmissionId(createdId);
          if (typeof data.submission.version === 'number') {
            setLoadedVersion(data.submission.version);
          }
          setVersionConflict(false);
          return createdId;
        } else {
          const result = await safeFetchJson<any>(`/api/customer/submissions/${submissionId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              payload: sanitizedWithoutPhotos,
              expectedVersion: loadedVersion ?? undefined,
            }),
          });
          if (result.status === 409) {
            setVersionConflict(true);
            throw new Error(
              result.error ||
                'This submission was updated in another session or tab. Please reload the latest version before saving changes.'
            );
          }
          if (!result.ok || !result.data?.success) {
            if (result.status === 403 && customer?.accountType === 'LISTING_PARTNER') {
              void checkPartnerStatusOnServer();
            }
            throw new Error(result.error || 'Could not update property submission draft.');
          }
          const data = result.data;
          setVersionConflict(false);
          if (typeof data.submission?.version === 'number') {
            setLoadedVersion(data.submission.version);
          }
          const serverPhotos = data.submission?.payload?.photos;
          if (Array.isArray(serverPhotos)) {
            setWizardState((prev) => ({ ...prev, photos: serverPhotos }));
          }
          return submissionId;
        }
      } catch (err: any) {
        setApiError(err?.message || 'Unable to sync submission state with the server.');
        return null;
      } finally {
        setIsSyncingDraft(false);
        draftSyncPromiseRef.current = null;
      }
    };

    const promise = runSync();
    draftSyncPromiseRef.current = promise;
    return await promise;
  };

  const handleNextStep = async () => {
    setStepErrors([]);
    setApiError(null);

    if (!customer) {
      openAuthModal('login');
      return;
    }

    if (currentStep === 4 && hasActiveUploads) {
      setStepErrors(['Please wait until all photograph uploads finish before continuing.']);
      return;
    }

    const sanitizedPayload: PropertySubmissionPayload = {
      ...wizardState,
      details: sanitizeDetailsForSelection(
        wizardState.details,
        wizardState.propertyType,
        wizardState.listingType
      ),
    };

    // Always satisfy internal Step 1 validation cleanly (using carried Page 1 choices + verified source)
    const step1Check = validateWizardStep(1, sanitizedPayload);
    if (!step1Check.valid) {
      setStepErrors(step1Check.errors);
      return;
    }

    // Use already-verified partner eligibility on step transitions (server endpoints strictly enforce RBAC
    // on POST/PUT/submit and any 403 triggers an authoritative partner-status refresh).
    if (sanitizedPayload.listingSource === 'PARTNER' && partnerStatus.checked && !partnerStatus.eligible) {
      setStepErrors([
        'Partner submission requires an ACTIVE Great Homes Partner Profile verified on the server.',
      ]);
      return;
    }

    // Validate current visible step rules (internal step 2..6)
    const validation = validateWizardStep(currentStep, sanitizedPayload);
    if (!validation.valid) {
      setStepErrors(validation.errors);
      return;
    }

    const syncedId = await syncDraftWithServer();
    if (!syncedId) {
      return;
    }

    const nextInternalStep = Math.min(6, currentStep + 1) as InternalWizardStepNumber;
    setCurrentStep(nextInternalStep);
    setHighestReachedStep((prev) => (nextInternalStep > prev ? nextInternalStep : prev));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handlePreviousStep = () => {
    setStepErrors([]);
    setApiError(null);
    if (currentStep > 2) {
      setCurrentStep((currentStep - 1) as InternalWizardStepNumber);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleJumpToStep = (targetInternalStep: InternalWizardStepNumber) => {
    const safeTarget = clampVisibleInternalStep(targetInternalStep);
    if (safeTarget <= highestReachedStep && !submittedRecord) {
      if (loadedPermissions.canEdit && safeTarget > currentStep) {
        const sanitizedPayload: PropertySubmissionPayload = {
          ...wizardState,
          details: sanitizeDetailsForSelection(
            wizardState.details,
            wizardState.propertyType,
            wizardState.listingType
          ),
        };
        for (let stepNum = 1; stepNum < safeTarget; stepNum += 1) {
          const check = validateWizardStep(
            stepNum as InternalWizardStepNumber,
            sanitizedPayload
          );
          if (!check.valid) {
            setStepErrors(check.errors);
            setCurrentStep(clampVisibleInternalStep(stepNum as InternalWizardStepNumber));
            window.scrollTo({ top: 0, behavior: 'smooth' });
            return;
          }
        }
      }
      setStepErrors([]);
      setApiError(null);
      setCurrentStep(safeTarget);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Server-backed binary upload for Photographs step
  const uploadQueueItemToServer = (activeId: string, item: UploadQueueItem): Promise<void> => {
    return new Promise((resolve) => {
      const formData = new FormData();
      formData.append('file', item.file);
      formData.append('category', item.category);
      if (item.caption.trim()) {
        formData.append('caption', item.caption.trim());
      }

      const xhr = new XMLHttpRequest();
      xhr.open('POST', `/api/customer/submissions/${encodeURIComponent(activeId)}/media`);
      xhr.timeout = 60000;

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && event.total > 0) {
          const pct = Math.min(99, Math.round((event.loaded / event.total) * 100));
          setUploadQueue((prev) =>
            prev.map((q) => (q.id === item.id ? { ...q, progress: pct } : q))
          );
        }
      };

      xhr.onload = () => {
        const contentType = xhr.getResponseHeader
          ? xhr.getResponseHeader('content-type')
          : null;
        const outcome = parsePhotoUploadXhrResponse({
          status: xhr.status,
          contentType,
          responseText: xhr.responseText || '',
        });

        if (outcome.ok) {
          URL.revokeObjectURL(item.previewUrl);
          previewUrlsRef.current.delete(item.previewUrl);
          setUploadQueue((prev) => prev.filter((q) => q.id !== item.id));
          setWizardState((prev) => {
            const incoming = outcome.photos || [];
            const existing = prev.photos || [];
            // Guard against out-of-order responses during bounded concurrent uploads
            const mergedById = new Map<string, SubmissionPhotoItem>();
            for (const p of existing) {
              mergedById.set(p.id, p);
            }
            for (const p of incoming) {
              mergedById.set(p.id, p);
            }
            const merged = Array.from(mergedById.values()).sort(
              (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
            );
            return {
              ...prev,
              photos: merged,
            };
          });
          resolve();
          return;
        }

        setUploadQueue((prev) =>
          prev.map((q) =>
            q.id === item.id
              ? { ...q, status: 'error', progress: 0, errorMessage: outcome.errorMessage }
              : q
          )
        );
        resolve();
      };

      xhr.onerror = () => {
        setUploadQueue((prev) =>
          prev.map((q) =>
            q.id === item.id
              ? {
                  ...q,
                  status: 'error',
                  progress: 0,
                  errorMessage: 'Network connection lost during upload. Please retry.',
                }
              : q
          )
        );
        resolve();
      };

      xhr.ontimeout = () => {
        setUploadQueue((prev) =>
          prev.map((q) =>
            q.id === item.id
              ? {
                  ...q,
                  status: 'error',
                  progress: 0,
                  errorMessage:
                    'Photo upload timed out. Please check your connection and try again.',
                }
              : q
          )
        );
        resolve();
      };

      xhr.send(formData);
    });
  };

  const enqueuePhotoFiles = async (rawFiles: FileList | File[]) => {
    setPhotoUploadError(null);
    setStepErrors([]);

    if (!customer) {
      openAuthModal('login');
      return;
    }

    const selectedFiles = Array.from(rawFiles || []);
    if (selectedFiles.length === 0) return;

    const currentTotalCount =
      (wizardState.photos?.length || 0) +
      uploadQueue.filter((q) => q.status === 'uploading').length;
    const remainingCapacity = MAX_SUBMISSION_PHOTOS - currentTotalCount;

    if (remainingCapacity <= 0) {
      setPhotoUploadError(
        `Maximum ${MAX_SUBMISSION_PHOTOS} property photographs reached. Remove a photograph before uploading another.`
      );
      return;
    }

    const filesToQueue: File[] = [];
    for (const file of selectedFiles) {
      if (isDuplicateUploadQueueFile(file, uploadQueue, filesToQueue)) {
        setPhotoUploadError(
          `Skipped "${file.name}": This photograph is already in the upload queue. Use Retry on a failed upload or dismiss it first.`
        );
        continue;
      }

      if (
        file.type.startsWith('video/') ||
        file.type.startsWith('application/') ||
        file.type === 'image/svg+xml' ||
        /\.(mp4|mov|avi|webm|mkv|m4v|pdf|doc|docx|svg)$/i.test(file.name)
      ) {
        setPhotoUploadError(
          `Rejected "${file.name}": Only JPEG, PNG, WebP, and AVIF photographs are permitted. Videos, documents, and SVGs are strictly prohibited.`
        );
        continue;
      }

      if (!/^image\/(jpeg|jpg|png|webp|avif)$/i.test(file.type)) {
        setPhotoUploadError(
          `Rejected "${file.name}": Unsupported format. Only JPEG, PNG, WebP, and AVIF images are allowed.`
        );
        continue;
      }

      if (file.size <= 0) {
        setPhotoUploadError(`Rejected "${file.name}": File is empty.`);
        continue;
      }

      if (file.size > MAX_SUBMISSION_IMAGE_SIZE_BYTES) {
        setPhotoUploadError(
          `Rejected "${file.name}": Image exceeds the 10 MB maximum file size limit.`
        );
        continue;
      }

      if (filesToQueue.length >= remainingCapacity) {
        setPhotoUploadError(
          `Only ${remainingCapacity} more photograph${
            remainingCapacity === 1 ? '' : 's'
          } can be added (maximum ${MAX_SUBMISSION_PHOTOS} per property).`
        );
        break;
      }

      filesToQueue.push(file);
    }

    if (filesToQueue.length === 0) return;

    const activeId = await syncDraftWithServer();
    if (!activeId) return;

    const captionVal = photoCaptionInput.trim();
    const categoryVal = photoCategoryInput || SUBMISSION_PHOTO_CATEGORIES[0];

    const items: UploadQueueItem[] = filesToQueue.map((file, idx) => {
      const previewUrl = URL.createObjectURL(file);
      previewUrlsRef.current.add(previewUrl);
      return {
        id: `q_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 7)}`,
        filename: file.name,
        sizeBytes: file.size,
        status: 'uploading',
        progress: 5,
        previewUrl,
        file,
        category: categoryVal,
        caption: captionVal,
      };
    });

    setUploadQueue((prev) => [...prev, ...items]);
    if (captionVal) {
      setPhotoCaptionInput('');
    }

    // Safe bounded concurrency (2 workers) backed by atomic DB row lock (SELECT ... FOR UPDATE)
    const PHOTO_UPLOAD_CONCURRENCY = 2;
    let nextIndex = 0;
    const workerCount = Math.min(PHOTO_UPLOAD_CONCURRENCY, items.length);
    await Promise.all(
      Array.from({ length: workerCount }, async () => {
        while (nextIndex < items.length) {
          const currentIndex = nextIndex;
          nextIndex += 1;
          await uploadQueueItemToServer(activeId, items[currentIndex]);
        }
      })
    );
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      await enqueuePhotoFiles(files);
    }
    e.target.value = '';
  };

  const handleDropPhotos = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingPhotos(false);
    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
      await enqueuePhotoFiles(e.dataTransfer.files);
    }
  };

  const handleRetryUpload = async (queueId: string) => {
    const target = uploadQueue.find((q) => q.id === queueId);
    if (!target || target.status === 'uploading') return;
    const activeId = await syncDraftWithServer();
    if (!activeId) return;
    const resetItem: UploadQueueItem = {
      ...target,
      status: 'uploading',
      progress: 5,
      errorMessage: undefined,
    };
    setUploadQueue((prev) => prev.map((q) => (q.id === queueId ? resetItem : q)));
    await uploadQueueItemToServer(activeId, resetItem);
  };

  const handleDismissUpload = (queueId: string) => {
    setUploadQueue((prev) => {
      const target = prev.find((q) => q.id === queueId);
      if (target) {
        URL.revokeObjectURL(target.previewUrl);
        previewUrlsRef.current.delete(target.previewUrl);
      }
      return prev.filter((q) => q.id !== queueId);
    });
  };

  const handleSetFeaturedPhoto = async (photoId: string) => {
    if (!submissionId || mutatingPhotoId) return;
    setPhotoUploadError(null);
    setMutatingPhotoId(photoId);
    try {
      const result = await safeFetchJson<any>(
        `/api/customer/submissions/${encodeURIComponent(submissionId)}/media/${encodeURIComponent(photoId)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isFeatured: true }),
        }
      );
      if (!result.ok || !result.data?.success || !Array.isArray(result.data?.photos)) {
        throw new Error(result.error || 'Could not update cover photograph.');
      }
      setWizardState((prev) => ({ ...prev, photos: result.data.photos }));
    } catch (err: any) {
      setPhotoUploadError(err?.message || 'Could not update cover photograph.');
    } finally {
      setMutatingPhotoId(null);
    }
  };

  const handleMovePhoto = async (index: number, direction: 'UP' | 'DOWN') => {
    if (!submissionId || mutatingPhotoId) return;
    const list = [...(wizardState.photos || [])];
    const targetIndex = direction === 'UP' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= list.length) return;

    const movingId = list[index].id;
    const temp = list[index];
    list[index] = list[targetIndex];
    list[targetIndex] = temp;
    const photoIds = list.map((item) => item.id);

    setPhotoUploadError(null);
    setMutatingPhotoId(movingId);
    try {
      const result = await safeFetchJson<any>(
        `/api/customer/submissions/${encodeURIComponent(submissionId)}/media`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ photoIds }),
        }
      );
      if (!result.ok || !result.data?.success || !Array.isArray(result.data?.photos)) {
        throw new Error(result.error || 'Could not reorder photographs.');
      }
      setWizardState((prev) => ({ ...prev, photos: result.data.photos }));
    } catch (err: any) {
      setPhotoUploadError(err?.message || 'Could not reorder photographs.');
    } finally {
      setMutatingPhotoId(null);
    }
  };

  const handleRemovePhoto = async (photoId: string) => {
    if (!submissionId || mutatingPhotoId) return;
    setPhotoUploadError(null);
    setMutatingPhotoId(photoId);
    try {
      const result = await safeFetchJson<any>(
        `/api/customer/submissions/${encodeURIComponent(submissionId)}/media/${encodeURIComponent(photoId)}`,
        {
          method: 'DELETE',
        }
      );
      if (!result.ok || !result.data?.success || !Array.isArray(result.data?.photos)) {
        throw new Error(result.error || 'Could not delete photograph.');
      }
      setWizardState((prev) => ({ ...prev, photos: result.data.photos }));
    } catch (err: any) {
      setPhotoUploadError(err?.message || 'Could not delete photograph.');
    } finally {
      setMutatingPhotoId(null);
    }
  };

  const handleFinalSubmit = async () => {
    if (isSubmittingFinal || submittedRecord) return;
    setStepErrors([]);
    setApiError(null);

    if (!customer) {
      openAuthModal('login');
      return;
    }

    if (hasActiveUploads || isMutatingGallery) {
      setStepErrors([
        'Please wait for photograph uploads and updates to complete before submitting.',
      ]);
      return;
    }

    const sanitizedPayload: PropertySubmissionPayload = {
      ...wizardState,
      details: sanitizeDetailsForSelection(
        wizardState.details,
        wizardState.propertyType,
        wizardState.listingType
      ),
    };

    const fullValidation = validateWizardStep(6, sanitizedPayload);
    if (!fullValidation.valid) {
      setStepErrors(fullValidation.errors);
      return;
    }

    setIsSubmittingFinal(true);
    try {
      const activeId = await syncDraftWithServer();
      if (!activeId) {
        setIsSubmittingFinal(false);
        return;
      }

      const { photos: _omitPhotos, ...submitPayloadWithoutPhotos } = sanitizedPayload;
      const result = await safeFetchJson<any>(`/api/customer/submissions/${activeId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload: submitPayloadWithoutPhotos }),
      });

      if (!result.ok || !result.data?.success || !result.data?.submission) {
        if (result.status === 403 && customer?.accountType === 'LISTING_PARTNER') {
          void checkPartnerStatusOnServer();
        }
        throw new Error(result.error || 'Final submission validation failed on the server.');
      }
      const data = result.data;

      setSubmittedRecord({
        id: data.submission.id,
        submissionStatus: data.submission.submissionStatus,
        submittedAt: data.submission.submittedAt || new Date().toISOString(),
        listingType: data.submission.listingType,
        listingSource: data.submission.listingSource,
      });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: any) {
      setApiError(
        err?.message ||
          'We could not complete your submission. Your entered details have been preserved—please review and try again.'
      );
    } finally {
      setIsSubmittingFinal(false);
    }
  };

  const handleOwnerDeclarationChange = useCallback((accepted: boolean) => {
    setWizardState((prev) => ({
      ...prev,
      consent: {
        ...prev.consent,
        ownerDeclarationAccepted: accepted,
        declarationText: CANONICAL_OWNER_DECLARATION_TEXT,
        attestationVersion: CANONICAL_ATTESTATION_VERSION,
      },
    }));
  }, []);

  const handlePartnerAttestationChange = useCallback((accepted: boolean) => {
    setWizardState((prev) => ({
      ...prev,
      consent: {
        ...prev.consent,
        partnerAttestationAccepted: accepted,
        declarationText: CANONICAL_PARTNER_ATTESTATION_TEXT,
        attestationVersion: CANONICAL_ATTESTATION_VERSION,
      },
    }));
  }, []);

  const handleSaveDraftOnly = async () => {
    setDraftSavedBanner(null);
    setStepErrors([]);
    setApiError(null);

    if (!customer) {
      openAuthModal('login');
      return;
    }

    if (!loadedPermissions.canEdit) {
      setApiError(
        `This submission is currently in status ${loadedSubmissionStatus} and cannot be modified.`
      );
      return;
    }

    const syncedId = await syncDraftWithServer();
    if (syncedId) {
      setDraftSavedBanner(
        `Draft progress saved (${syncedId}). You can resume this draft anytime from My Property Submissions.`
      );
    }
  };

  // Missing / Invalid Page 1 Query Params Redirect Screen
  if (page2Entry.requiresRedirectToPage1) {
    return (
      <div className="min-h-[70vh] bg-[#FAFAF8] py-16 px-4 sm:px-6 lg:px-8 flex items-center justify-center">
        <div className="mx-auto max-w-md rounded-2xl border border-[#E5E0D8] bg-white p-7 text-center shadow-2xs">
          <Loader2 className="mx-auto h-7 w-7 animate-spin text-[#E85D3F]" />
          <h1 className="mt-4 font-display text-lg font-bold text-[#111111]">
            Start with Your Listing Basics
          </h1>
          <p className="mt-2 text-sm text-[#555555] font-body">
            Please choose Sell or Rent, your property type, and Kolkata locality first so we can
            prepare your property submission.
          </p>
          <Link
            href="/post-property"
            className="mt-6 inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#E85D3F] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#D44E32] font-display"
          >
            <span>Go to Post Property</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    );
  }

  // Confirmed Submission Screen (only after HTTP 200 SUBMITTED)
  if (submittedRecord) {
    return (
      <div className="min-h-screen bg-[#FAFAF8] py-14 pb-24 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl rounded-2xl border border-[#E5E0D8] bg-white p-6 sm:p-10 shadow-2xs">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[#EBF7F0] text-[#218C5A]">
            <CheckCircle2 className="h-6 w-6" />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-[#6E6A65] font-display">
            <span>Status: {submittedRecord.submissionStatus}</span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">Reference: {submittedRecord.id}</span>
          </div>

          <h1 className="mt-2 font-editorial text-3xl sm:text-4xl text-[#111111]">
            Property Submitted for Great Homes Verification
          </h1>

          <p className="mt-3 text-sm sm:text-base leading-relaxed text-[#4A4743] font-body">
            Thank you, <span className="font-semibold text-[#111111]">{customer?.name}</span>. Your{' '}
            {wizardState.listingType === 'RENTAL' ? 'rental' : 'resale'} submission for{' '}
            <span className="font-semibold text-[#111111]">
              {wizardState.location?.locality}, {wizardState.location?.city}
            </span>{' '}
            has been recorded and queued for review.
          </p>

          <div className="mt-6 rounded-xl border border-[#E5E0D8] bg-[#FAFAF8] p-5">
            <div className="flex items-start gap-3">
              <EyeOff className="mt-0.5 h-5 w-5 shrink-0 text-[#E85D3F]" />
              <div className="text-xs sm:text-sm text-[#333333] font-body">
                <p className="font-display font-bold text-[#111111]">
                  Important: Your property is not yet publicly published
                </p>
                <p className="mt-1 leading-relaxed text-[#555555]">
                  Every submission undergoes manual verification by the Great Homes property
                  moderation team. Your listing will only appear in public discovery after our team
                  verifies the details, photographs, and ownership/partner consent.
                </p>
              </div>
            </div>
          </div>

          <dl className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 border-t border-[#E5E0D8] pt-6 text-sm font-body">
            <div>
              <dt className="text-xs text-[#6E6A65] font-display">Submission Reference</dt>
              <dd className="mt-1 font-mono text-xs sm:text-sm font-semibold text-[#111111] tabular-nums">
                {submittedRecord.id}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[#6E6A65] font-display">Verification Queue Status</dt>
              <dd className="mt-1 font-semibold text-[#218C5A]">
                {submittedRecord.submissionStatus} (Pending Staff Review)
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[#6E6A65] font-display">Listing Purpose &amp; Type</dt>
              <dd className="mt-1 font-medium text-[#111111]">
                {wizardState.listingType === 'RENTAL' ? 'Rent' : 'Sell'} ·{' '}
                {formatPropertyTypeDisplay(wizardState.propertyType)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[#6E6A65] font-display">Submission Source</dt>
              <dd className="mt-1 font-medium text-[#111111]">{wizardState.listingSource}</dd>
            </div>
          </dl>

          <div className="mt-8 flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-3 pt-6 border-t border-[#E5E0D8]">
            <Link
              href="/my-properties"
              className="min-h-[46px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#E85D3F] px-5 py-3 text-sm font-semibold text-white hover:bg-[#D44E32] font-display whitespace-nowrap"
            >
              <span>Manage in My Property Submissions</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/post-property"
              className="min-h-[46px] inline-flex items-center justify-center gap-2 rounded-xl border border-[#D9D5D0] bg-white px-5 py-3 text-sm font-semibold text-[#111111] hover:bg-[#F5F3F0] font-display whitespace-nowrap"
            >
              <span>Return to Post Property Hub</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const featuredPhoto =
    (wizardState.photos || []).find((p) => p.isFeatured) || (wizardState.photos || [])[0] || null;

  // Derived locality display for the compact "Your Listing" summary bar
  const resolvedLocalityDisplay = wizardState.location?.locality
    ? `${wizardState.location.locality}, ${wizardState.location?.city || 'Kolkata'}`
    : wizardState.location?.isCustomLocality
    ? `Custom Locality, ${wizardState.location?.city || 'Kolkata'}`
    : loadingReferenceData
    ? 'Resolving locality...'
    : 'Select locality in Step 1';

  const changeSelectionHref = (() => {
    const params = new URLSearchParams();
    params.set('listingType', wizardState.listingType);
    params.set('propertyType', wizardState.propertyType);
    if (wizardState.location?.isCustomLocality) {
      params.set('locationKey', 'custom');
    } else if (wizardState.location?.locationId) {
      params.set('locationKey', wizardState.location.locationId);
    }
    return `/post-property?${params.toString()}#quick-post-form`;
  })();

  // Select binding value supports locationId cleanly as well as legacy drafts with only locality name
  const selectedLocationDropdownValue =
    wizardState.location?.locationId ||
    selectableLocations.find(
      (l) =>
        wizardState.location?.locality &&
        l.name.toLowerCase() === wizardState.location.locality.toLowerCase()
    )?.id ||
    '';

  const PropertyTypeSummaryIcon =
    wizardState.propertyType === 'INDEPENDENT_HOUSE'
      ? Home
      : wizardState.propertyType === 'PLOT'
      ? LandPlot
      : Building2;

  const showWizardContent =
    eligibilityEvaluation.canAccessWizard &&
    !isHydratingDraft &&
    !draftHydrationError;

  return (
    <div className="min-h-screen bg-[#FAFAF8] pb-24 pt-6 sm:pt-9">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 space-y-6">
        {/* Top Breadcrumb & Subtle Utility Links */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <nav
            aria-label="Breadcrumb"
            className="flex flex-wrap items-center gap-2 text-xs sm:text-sm text-[#6E6A65] font-body"
          >
            <Link href="/" className="hover:text-[#111111] transition-colors">
              Home
            </Link>
            <span aria-hidden="true" className="text-[#C5BFB7]">
              &gt;
            </span>
            <Link href="/post-property" className="hover:text-[#111111] transition-colors">
              Post Property
            </Link>
            <span aria-hidden="true" className="text-[#C5BFB7]">
              &gt;
            </span>
            <span className="font-medium text-[#111111]">Submit Your Property</span>
          </nav>

          <div className="flex flex-wrap items-center gap-3 text-xs text-[#6E6A65] font-body">
            {submissionId && (
              <span className="font-mono text-[#111111] tabular-nums">
                Ref: {loadedReferenceId || submissionId.slice(0, 12)}
              </span>
            )}
            <Link
              href="/my-properties"
              className="font-display font-semibold text-[#E85D3F] hover:underline whitespace-nowrap"
            >
              My Property Submissions
            </Link>
          </div>
        </div>

        {/* Page Editorial Header */}
        <header className="max-w-3xl">
          <h1 className="font-editorial text-[32px] leading-[1.08] tracking-tight text-[#111111] sm:text-[42px]">
            Let&apos;s Get Your Property Listed
          </h1>
          <p className="mt-2 text-sm sm:text-base leading-relaxed text-[#555555] font-body">
            We&apos;ll guide you through each step. Your property will be reviewed by our team before
            it appears publicly.
          </p>
        </header>

        {/* Contextual Account Introduction ("Before You Start") */}
        <AccountEligibilityPanel
          customer={customer}
          authLoading={authLoading}
          openAuthModal={openAuthModal}
          refreshCustomer={refresh}
          partnerStatus={partnerStatus}
          onRetryPartnerStatus={checkPartnerStatusOnServer}
          hasStartedWizard={hasConfirmedBeforeStart}
          isDraftResume={Boolean(requestedDraftId)}
          isReadOnlySubmission={loadedPermissions.isReadOnly}
          onContinue={() => {
            setHasConfirmedBeforeStart(true);
            window.setTimeout(() => {
              wizardStepContainerRef.current?.scrollIntoView({
                behavior: 'smooth',
                block: 'start',
              });
            }, 60);
          }}
        />

        {/* Draft Hydration Loading State */}
        {eligibilityEvaluation.canAccessWizard && isHydratingDraft && (
          <div className="rounded-2xl border border-[#E5E0D8] bg-white p-10 text-center shadow-2xs">
            <Loader2 className="mx-auto h-7 w-7 animate-spin text-[#E85D3F]" />
            <p className="mt-3 text-sm font-semibold text-[#111111] font-display">
              Loading Your Saved Property Submission...
            </p>
            <p className="mt-1 text-xs text-[#6E6A65] font-body">
              Restoring saved property details, photographs, and verification status.
            </p>
          </div>
        )}

        {/* Draft Hydration Error State */}
        {eligibilityEvaluation.canAccessWizard && !isHydratingDraft && draftHydrationError && (
          <div className="rounded-2xl border border-[#C84B31]/30 bg-white p-8 text-center shadow-2xs">
            <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[#FFF5F2] text-[#C84B31]">
              <AlertCircle className="h-6 w-6" />
            </div>
            <h2 className="mt-4 font-display text-2xl font-bold text-[#111111]">
              Submission Not Available
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-[#555555] font-body max-w-lg mx-auto">
              {draftHydrationError}
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/my-properties"
                className="min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#111111] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#2A2A2A] font-display"
              >
                <span>Go to My Property Submissions</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/post-property"
                className="min-h-[44px] inline-flex items-center justify-center rounded-xl border border-[#D9D5D0] bg-white px-5 py-2.5 text-sm font-semibold text-[#111111] hover:bg-[#F5F3F0] font-display"
              >
                Start a Fresh Submission
              </Link>
            </div>
          </div>
        )}

        {/* Main Property Submission Workspace (Strictly Gated Behind Account Eligibility) */}
        {showWizardContent && (
          <div ref={wizardStepContainerRef} className="space-y-6">
            {/* Compact Read-Only Carried-Forward Summary ("Your Listing") */}
            <div className="rounded-2xl border border-[#E5E0D8] bg-white px-5 py-3.5 shadow-2xs">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2.5">
                  <span className="font-display text-sm font-bold text-[#111111]">
                    Your Listing
                  </span>

                  <span
                    aria-hidden="true"
                    className="hidden sm:inline-block h-5 w-px bg-[#E5E0D8]"
                  />

                  <span className="inline-flex items-center gap-2 rounded-lg bg-[#FFF3EE] px-3 py-1 text-xs sm:text-sm font-semibold text-[#C84B31] font-display">
                    {wizardState.listingType === 'RENTAL' ? 'Rent' : 'Sell'}
                  </span>

                  <span className="inline-flex items-center gap-2 text-xs sm:text-sm font-medium text-[#111111] font-body">
                    <PropertyTypeSummaryIcon
                      className="h-4 w-4 text-[#6E6A65] shrink-0"
                      aria-hidden="true"
                    />
                    <span>{formatPropertyTypeDisplay(wizardState.propertyType)}</span>
                  </span>

                  <span className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium text-[#111111] font-body">
                    <MapPin className="h-4 w-4 text-[#6E6A65] shrink-0" aria-hidden="true" />
                    <span>{resolvedLocalityDisplay}</span>
                  </span>
                </div>

                {!submissionId && !requestedDraftId && (
                  <Link
                    href={changeSelectionHref}
                    className="inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-xl border border-[#D9D5D0] bg-white px-3.5 py-1.5 text-xs font-semibold text-[#111111] transition hover:bg-[#F5F3F0] font-display whitespace-nowrap self-start sm:self-auto"
                  >
                    <Pencil className="h-3.5 w-3.5 text-[#555555]" aria-hidden="true" />
                    <span>Change Selection</span>
                  </Link>
                )}
              </div>
            </div>

            {/* Draft Saved Notice */}
            {draftSavedBanner && (
              <div
                role="status"
                className="rounded-xl border border-[#1E7B4E]/30 bg-[#F2FBF6] p-4 flex flex-wrap items-center justify-between gap-3"
              >
                <div className="flex items-center gap-2.5 text-xs sm:text-sm text-[#145335] font-body">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-[#1E7B4E]" />
                  <span>{draftSavedBanner}</span>
                </div>
                <Link
                  href="/my-properties"
                  className="text-xs font-semibold text-[#145335] underline font-display"
                >
                  View in My Properties →
                </Link>
              </div>
            )}

            {/* CHANGES_REQUESTED Feedback Banner */}
            {loadedSubmissionStatus === 'CHANGES_REQUESTED' && (
              <div
                role="region"
                aria-label="Verification Team Feedback"
                className="rounded-2xl border border-[#C84B31]/40 bg-[#FFF6F3] p-5 sm:p-6"
              >
                <div className="flex items-start gap-3">
                  <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-[#C84B31]" />
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h2 className="font-display text-sm sm:text-base font-bold text-[#111111]">
                        Changes Requested by Great Homes Verification Team
                      </h2>
                      {loadedLatestFeedback?.createdAt && (
                        <span className="text-xs text-[#6E6A65] font-body tabular-nums">
                          Reviewed{' '}
                          {new Date(loadedLatestFeedback.createdAt).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                            timeZone: 'Asia/Kolkata',
                          })}
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-xs sm:text-sm leading-relaxed text-[#222222] font-body">
                      {loadedLatestFeedback?.submitterFeedback ||
                        'Please review and update your property details and photographs, then resubmit on Step 5.'}
                    </p>
                    <p className="mt-2 text-xs text-[#6E6A65] font-body">
                      Update the relevant steps below and click{' '}
                      <span className="font-semibold text-[#111111]">
                        Resubmit Property for Verification
                      </span>{' '}
                      in Step 5.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Optimistic Concurrency Conflict Banner (HTTP 409) */}
            {versionConflict && submissionId && (
              <div
                role="alert"
                className="rounded-2xl border border-[#C84B31]/40 bg-[#FFF5F2] p-5 sm:p-6"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-display text-xs font-bold uppercase tracking-wider text-[#C84B31]">
                      Concurrent Update Detected (Version Conflict)
                    </p>
                    <p className="mt-1 text-xs sm:text-sm text-[#333333] font-body">
                      This draft was modified in another browser tab or by a status update. Reload
                      the latest saved state to continue editing safely without overwriting changes.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      window.location.href = `/post-property/new?draftId=${encodeURIComponent(
                        submissionId
                      )}`;
                    }}
                    className="min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#111111] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#2A2A2A] font-display shrink-0 cursor-pointer"
                  >
                    <span>Reload Latest Draft</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* Read-Only Banner for Non-Editable Submissions */}
            {!loadedPermissions.canEdit && (
              <div
                role="region"
                aria-label="Read-Only Submission Status"
                className="rounded-2xl border border-[#E5E0D8] bg-white p-5 sm:p-6"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-display text-xs font-bold uppercase tracking-wider text-[#E85D3F]">
                      Status: {loadedSubmissionStatus} · Read-Only Summary
                    </p>
                    <p className="mt-1 text-xs sm:text-sm text-[#333333] font-body">
                      {loadedNextAction ||
                        'This submission is locked from editing in its current verification stage.'}
                    </p>
                  </div>
                  <Link
                    href="/my-properties"
                    className="min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#111111] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#2A2A2A] font-display shrink-0"
                  >
                    <span>Back to My Property Submissions</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            )}

            {/* 5-Step Connected Progress Stepper */}
            <nav aria-label="Property Submission Progress" className="pt-1">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#6E6A65] font-display mb-4">
                <span className="font-bold text-[#111111] tabular-nums">
                  Step {visibleStep} of 5: {activeVisibleMeta.title}
                </span>
                <span className="tabular-nums">
                  {Math.round((visibleStep / 5) * 100)}% Complete
                </span>
              </div>

              <div className="relative">
                {/* Connecting horizontal hairline behind step circles */}
                <div
                  aria-hidden="true"
                  className="absolute left-[10%] right-[10%] top-[18px] h-px bg-[#E0DBD3]"
                />
                <ol className="relative grid grid-cols-5 gap-1 sm:gap-3">
                  {VISIBLE_WIZARD_STEPS.map((item) => {
                    const isActive = item.visibleStep === visibleStep;
                    const isCompleted = item.visibleStep < visibleStep;
                    const isReachable = item.visibleStep <= highestVisibleStep;

                    return (
                      <li key={item.visibleStep} className="flex flex-col items-center text-center">
                        <button
                          type="button"
                          disabled={!isReachable}
                          aria-current={isActive ? 'step' : undefined}
                          aria-label={`Step ${item.visibleStep} of 5: ${item.shortTitle}`}
                          onClick={() => handleJumpToStep(item.internalStep)}
                          className={`group flex flex-col items-center focus-visible:outline-none ${
                            isReachable ? 'cursor-pointer' : 'cursor-not-allowed'
                          }`}
                        >
                          <span
                            className={`flex h-9 w-9 items-center justify-center rounded-full border text-xs sm:text-sm font-display font-bold tabular-nums transition ${
                              isActive
                                ? 'border-[#E85D3F] bg-[#E85D3F] text-white shadow-[0_0_0_4px_rgba(232,93,63,0.16)]'
                                : isCompleted
                                ? 'border-[#218C5A] bg-[#EBF7F0] text-[#218C5A] group-hover:bg-[#DCF1E5]'
                                : isReachable
                                ? 'border-[#C5BFB7] bg-white text-[#111111] group-hover:border-[#111111]'
                                : 'border-[#E5E0D8] bg-white text-[#8D8881]'
                            }`}
                          >
                            {isCompleted ? (
                              <Check className="h-4 w-4" aria-hidden="true" />
                            ) : (
                              item.visibleStep
                            )}
                          </span>

                          <span
                            className={`mt-2 hidden sm:block font-display text-xs leading-tight transition ${
                              isActive
                                ? 'font-bold text-[#E85D3F]'
                                : isCompleted || isReachable
                                ? 'font-semibold text-[#111111]'
                                : 'font-medium text-[#8D8881]'
                            }`}
                          >
                            {item.shortTitle}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ol>

                {nextVisibleMeta && (
                  <p className="mt-2.5 text-center text-[11px] text-[#6E6A65] font-body sm:hidden">
                    Up next: <span className="font-medium text-[#111111]">{nextVisibleMeta.title}</span>
                  </p>
                )}
              </div>
            </nav>

            {/* Active Step Card Container */}
            <div className="rounded-2xl border border-[#E5E0D8] bg-white p-5 sm:p-8 shadow-2xs">
              {/* Step Kicker, Heading & Subtitle */}
              <div className="border-b border-[#F0EDE8] pb-5">
                <span className="inline-flex items-center rounded-lg bg-[#FFF3EE] px-3 py-1 text-xs font-bold text-[#E85D3F] font-display tabular-nums">
                  Step 0{visibleStep} of 05
                </span>
                <h2 className="mt-2.5 font-display text-2xl sm:text-3xl font-bold text-[#111111]">
                  {activeVisibleMeta.title}
                </h2>
                <p className="mt-1.5 text-sm text-[#555555] font-body">
                  {activeVisibleMeta.description}
                </p>
              </div>

              {/* Validation & Server Error Alerts */}
              {(stepErrors.length > 0 || apiError) && (
                <div
                  role="alert"
                  className="mt-6 rounded-xl border border-[#E85D3F]/40 bg-[#FFF5F2] p-4"
                >
                  <div className="flex items-start gap-2.5">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#E85D3F]" />
                    <div className="text-xs sm:text-sm text-[#111111] font-body">
                      <p className="font-display font-bold text-[#111111]">
                        Please resolve the following before continuing:
                      </p>
                      <ul className="mt-1.5 list-disc pl-4 space-y-1 text-[#4A4743]">
                        {stepErrors.map((err, idx) => (
                          <li key={idx}>{err}</li>
                        ))}
                        {apiError && <li>{apiError}</li>}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {/* ================================================================= */}
              {/* VISIBLE STEP 1 (Internal Step 2): LOCATION & PROJECT MAPPING      */}
              {/* ================================================================= */}
              {currentStep === 2 && (
                <div className="mt-6 grid grid-cols-1 gap-7 lg:grid-cols-12 lg:items-start">
                  <div className="lg:col-span-8 space-y-6">
                    {invalidUrlLocationNotice && (
                      <div
                        role="status"
                        className="rounded-xl border border-[#E5D3B3] bg-[#FFFDF7] px-4 py-3 text-xs sm:text-sm text-[#7C4A03] font-body flex items-start gap-2.5"
                      >
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#B45309]" />
                        <span>
                          Your previous locality selection could not be matched to a listed
                          locality. Please choose a Kolkata locality below or switch to custom
                          entry.
                        </span>
                      </div>
                    )}

                    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                      <div>
                        <label
                          htmlFor="wizard-city"
                          className="block font-display text-xs font-bold uppercase tracking-wider text-[#555555]"
                        >
                          City *
                        </label>
                        <input
                          id="wizard-city"
                          type="text"
                          value={wizardState.location?.city || 'Kolkata'}
                          onChange={(e) =>
                            setWizardState((prev) => ({
                              ...prev,
                              location: {
                                ...(prev.location || {
                                  city: 'Kolkata',
                                  locality: '',
                                  address: '',
                                  isCustomLocality: false,
                                }),
                                city: e.target.value,
                              },
                            }))
                          }
                          className="mt-2 w-full min-h-[46px] rounded-xl border border-[#D9D5D0] bg-white px-4 py-2.5 text-base sm:text-sm text-[#111111] outline-none focus:border-[#E85D3F]"
                        />
                      </div>

                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <label
                            htmlFor="wizard-locality"
                            className="block font-display text-xs font-bold uppercase tracking-wider text-[#555555]"
                          >
                            Locality / Area *
                          </label>
                          <button
                            type="button"
                            onClick={() => {
                              setProjectResetNotice(null);
                              setInvalidUrlLocationNotice(false);
                              setWizardState((prev) => {
                                const nextIsCustom = !prev.location?.isCustomLocality;
                                const hadProjectId = Boolean(prev.location?.projectId);
                                if (nextIsCustom && hadProjectId) {
                                  setProjectResetNotice(
                                    'Verified project selection was cleared for custom locality mode.'
                                  );
                                }
                                return {
                                  ...prev,
                                  location: {
                                    ...(prev.location || {
                                      city: 'Kolkata',
                                      locality: '',
                                      address: '',
                                      isCustomLocality: false,
                                    }),
                                    isCustomLocality: nextIsCustom,
                                    locationId: null,
                                    projectId: nextIsCustom ? null : prev.location?.projectId ?? null,
                                    projectName:
                                      nextIsCustom && hadProjectId ? '' : prev.location?.projectName,
                                  },
                                };
                              });
                            }}
                            className="text-xs font-semibold text-[#E85D3F] hover:underline font-display cursor-pointer whitespace-nowrap"
                          >
                            {wizardState.location?.isCustomLocality
                              ? 'Select Listed Locality'
                              : 'Enter Custom Locality'}
                          </button>
                        </div>

                        {!wizardState.location?.isCustomLocality &&
                        selectableLocations.length > 0 ? (
                          <div className="relative mt-2">
                            <select
                              id="wizard-locality"
                              value={selectedLocationDropdownValue}
                              onChange={(e) => {
                                const selectedId = e.target.value;
                                const matchedLoc = selectableLocations.find(
                                  (l) => l.id === selectedId
                                );
                                const nextLocId = matchedLoc?.id || null;
                                setProjectResetNotice(null);
                                setInvalidUrlLocationNotice(false);
                                setWizardState((prev) => {
                                  const prevProjId = prev.location?.projectId || null;
                                  const prevMatchedProj = prevProjId
                                    ? projects.find((p) => p.id === prevProjId)
                                    : null;
                                  const keepProject =
                                    prevProjId &&
                                    nextLocId &&
                                    prevMatchedProj?.locationId === nextLocId;
                                  if (prevProjId && !keepProject) {
                                    setProjectResetNotice(
                                      'Project selection was cleared because the selected locality changed.'
                                    );
                                  }
                                  return {
                                    ...prev,
                                    location: {
                                      ...(prev.location || {
                                        city: 'Kolkata',
                                        locality: '',
                                        address: '',
                                        isCustomLocality: false,
                                      }),
                                      locality: matchedLoc?.name || '',
                                      locationId: nextLocId,
                                      projectId: keepProject ? prevProjId : null,
                                      projectName: keepProject ? prev.location?.projectName : '',
                                    },
                                  };
                                });
                              }}
                              className="w-full min-h-[46px] appearance-none rounded-xl border border-[#D9D5D0] bg-white pl-4 pr-10 py-2.5 text-base sm:text-sm text-[#111111] outline-none focus:border-[#E85D3F] cursor-pointer"
                            >
                              <option value="">Select a Kolkata Locality...</option>
                              {selectableLocations.map((loc) => (
                                <option key={loc.id} value={loc.id}>
                                  {loc.label}
                                </option>
                              ))}
                            </select>
                            <ChevronDown
                              className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6E6A65]"
                              aria-hidden="true"
                            />
                          </div>
                        ) : (
                          <input
                            id="wizard-locality"
                            type="text"
                            placeholder="e.g., Ballygunge, New Town Action Area I, Salt Lake..."
                            value={wizardState.location?.locality || ''}
                            onChange={(e) =>
                              setWizardState((prev) => ({
                                ...prev,
                                location: {
                                  ...(prev.location || {
                                    city: 'Kolkata',
                                    locality: '',
                                    address: '',
                                    isCustomLocality: false,
                                  }),
                                  locality: e.target.value,
                                  locationId: null,
                                  projectId: null,
                                },
                              }))
                            }
                            className="mt-2 w-full min-h-[46px] rounded-xl border border-[#D9D5D0] bg-white px-4 py-2.5 text-base sm:text-sm text-[#111111] outline-none focus:border-[#E85D3F]"
                          />
                        )}
                      </div>
                    </div>

                    {/* Project / Society Mapping */}
                    <div>
                      <label
                        htmlFor="wizard-project"
                        className="block font-display text-xs font-bold uppercase tracking-wider text-[#555555]"
                      >
                        Project / Society{' '}
                        <span className="font-normal normal-case tracking-normal text-[#6E6A65]">
                          (Optional)
                        </span>
                      </label>
                      <p className="mt-1 text-xs text-[#6E6A65] font-body">
                        {isCustomLocalityMode
                          ? 'Custom localities list as standalone properties. Add your building or society name below if applicable.'
                          : selectedLocationId
                          ? `Link your property to a registered project in ${wizardState.location?.locality || 'the selected locality'}, or enter a building name.`
                          : 'Select a locality above to see matching residential projects, or enter a building name.'}
                      </p>

                      <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="relative">
                          <select
                            id="wizard-project"
                            disabled={isCustomLocalityMode || !selectedLocationId || loadingLocalityProjects}
                            value={wizardState.location?.projectId || ''}
                            onChange={(e) => {
                              const projId = e.target.value || null;
                              const matchedProj = projects.find((p) => p.id === projId);
                              setProjectResetNotice(null);
                              setWizardState((prev) => ({
                                ...prev,
                                location: {
                                  ...(prev.location || {
                                    city: 'Kolkata',
                                    locality: '',
                                    address: '',
                                    isCustomLocality: false,
                                  }),
                                  projectId: projId,
                                  projectName: matchedProj
                                    ? matchedProj.name
                                    : projId === null
                                    ? ''
                                    : prev.location?.projectName,
                                },
                              }));
                            }}
                            className="w-full min-h-[46px] appearance-none rounded-xl border border-[#D9D5D0] bg-white pl-4 pr-10 py-2.5 text-base sm:text-sm text-[#111111] outline-none focus:border-[#E85D3F] disabled:bg-[#F5F3F0] disabled:text-[#6E6A65] disabled:cursor-not-allowed"
                          >
                            {isCustomLocalityMode ? (
                              <option value="">Standalone / Custom Locality</option>
                            ) : !selectedLocationId ? (
                              <option value="">Select a locality first</option>
                            ) : loadingLocalityProjects ? (
                              <option value="">Loading projects...</option>
                            ) : (
                              <option value="">Select a project / society</option>
                            )}
                            {!isCustomLocalityMode &&
                              selectedLocationId &&
                              projects.map((proj) => (
                                <option key={proj.id} value={proj.id}>
                                  {proj.name}
                                </option>
                              ))}
                          </select>
                          <ChevronDown
                            className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6E6A65]"
                            aria-hidden="true"
                          />
                        </div>

                        <input
                          id="wizard-project-name"
                          type="text"
                          placeholder="Or type building / society name (optional)"
                          value={wizardState.location?.projectName || ''}
                          onChange={(e) =>
                            setWizardState((prev) => ({
                              ...prev,
                              location: {
                                ...(prev.location || {
                                  city: 'Kolkata',
                                  locality: '',
                                  address: '',
                                  isCustomLocality: false,
                                }),
                                projectName: e.target.value,
                              },
                            }))
                          }
                          className="w-full min-h-[46px] rounded-xl border border-[#D9D5D0] bg-white px-4 py-2.5 text-base sm:text-sm text-[#111111] outline-none focus:border-[#E85D3F]"
                        />
                      </div>

                      {projectResetNotice && (
                        <p className="mt-1.5 text-xs text-[#E85D3F] font-body" role="status">
                          {projectResetNotice}
                        </p>
                      )}
                      {!isCustomLocalityMode &&
                        selectedLocationId &&
                        !loadingLocalityProjects &&
                        (projects.length > 0 ? (
                          <p className="mt-1.5 text-xs text-[#6E6A65] font-body">
                            {projects.length} registered{' '}
                            {projects.length === 1 ? 'project' : 'projects'} available in{' '}
                            {wizardState.location?.locality || 'this locality'}.
                          </p>
                        ) : (
                          <p className="mt-1.5 text-xs text-[#6E6A65] font-body">
                            No pre-listed projects found in{' '}
                            {wizardState.location?.locality || 'this locality'}. Enter a building
                            name if applicable or continue as a standalone home.
                          </p>
                        ))}
                      {(loadingReferenceData || loadingLocalityProjects) && (
                        <p className="mt-1.5 text-xs text-[#6E6A65] font-body">
                          Loading Kolkata localities and residential projects...
                        </p>
                      )}
                    </div>

                    {/* Street Address & Landmark (Required for Verification) */}
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <label
                          htmlFor="wizard-address"
                          className="block font-display text-xs font-bold uppercase tracking-wider text-[#555555]"
                        >
                          Full Address &amp; Landmark *
                        </label>
                        <span className="text-[11px] text-[#6E6A65] font-body tabular-nums">
                          {(wizardState.location?.address || '').length} / 250
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-[#6E6A65] font-body">
                        Used only by the Great Homes verification team. Your exact address is never
                        displayed publicly.
                      </p>
                      <textarea
                        id="wizard-address"
                        rows={3}
                        maxLength={250}
                        placeholder="e.g., Block / Premises, Street Name, Nearest Landmark (will not be shown publicly)"
                        value={wizardState.location?.address || ''}
                        onChange={(e) =>
                          setWizardState((prev) => ({
                            ...prev,
                            location: {
                              ...(prev.location || {
                                city: 'Kolkata',
                                locality: '',
                                address: '',
                                isCustomLocality: false,
                              }),
                              address: e.target.value,
                            },
                          }))
                        }
                        className="mt-2 w-full rounded-xl border border-[#D9D5D0] bg-white px-4 py-3 text-base sm:text-sm text-[#111111] outline-none focus:border-[#E85D3F]"
                      />
                    </div>
                  </div>

                  {/* Subtle Warm Guidance Panel (Right Rail on Desktop) */}
                  <aside
                    aria-label="Location guidance"
                    className="lg:col-span-4 rounded-2xl border border-[#ECE6DE] bg-[#FAFAF8] p-5"
                  >
                    <div className="flex items-center gap-2 text-[#111111]">
                      <Info className="h-4 w-4 text-[#E85D3F] shrink-0" aria-hidden="true" />
                      <h3 className="font-display text-sm font-bold">Quick Tips</h3>
                    </div>
                    <ul className="mt-3.5 space-y-2.5 text-xs sm:text-sm text-[#4A4743] font-body">
                      <li className="flex items-start gap-2">
                        <Check
                          className="mt-0.5 h-4 w-4 shrink-0 text-[#E85D3F]"
                          aria-hidden="true"
                        />
                        <span>Confirm the correct Kolkata locality so buyers find your home easily.</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Check
                          className="mt-0.5 h-4 w-4 shrink-0 text-[#E85D3F]"
                          aria-hidden="true"
                        />
                        <span>Link to a residential project or society, if applicable.</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Check
                          className="mt-0.5 h-4 w-4 shrink-0 text-[#E85D3F]"
                          aria-hidden="true"
                        />
                        <span>Provide a street address or nearby landmark for verification.</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Check
                          className="mt-0.5 h-4 w-4 shrink-0 text-[#E85D3F]"
                          aria-hidden="true"
                        />
                        <span>Exact flat or house numbers are never shown publicly.</span>
                      </li>
                    </ul>
                  </aside>
                </div>
              )}

              {/* ================================================================= */}
              {/* VISIBLE STEP 2 (Internal Step 3): DETAILS & PRICING               */}
              {/* ================================================================= */}
              {currentStep === 3 && (
                <div className="mt-6 space-y-8">
                  {wizardState.propertyType !== 'PLOT' ? (
                    <div>
                      <h3 className="font-display text-base font-bold text-[#111111]">
                        Residential Configuration &amp; Area
                      </h3>
                      <p className="mt-1 text-xs text-[#6E6A65] font-body">
                        Provide accurate configuration and area measurements for your{' '}
                        {wizardState.propertyType === 'APARTMENT'
                          ? 'apartment'
                          : 'independent house'}
                        .
                      </p>

                      <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-3">
                        <div>
                          <label
                            htmlFor="wizard-bedrooms"
                            className="block font-display text-xs font-bold uppercase tracking-wider text-[#555555]"
                          >
                            Bedrooms (BHK) *
                          </label>
                          <select
                            id="wizard-bedrooms"
                            value={wizardState.details?.bedroomCount ?? 3}
                            onChange={(e) => {
                              const count = parseInt(e.target.value, 10);
                              setWizardState((prev) => ({
                                ...prev,
                                details: {
                                  ...prev.details,
                                  bedroomCount: count,
                                  configuration: `${count} BHK`,
                                },
                              }));
                            }}
                            className="mt-2 w-full min-h-[46px] rounded-xl border border-[#D9D5D0] bg-white px-4 py-2.5 text-base sm:text-sm text-[#111111] outline-none focus:border-[#E85D3F]"
                          >
                            {[1, 2, 3, 4, 5, 6].map((n) => (
                              <option key={n} value={n}>
                                {n} BHK ({n} Bedroom{n > 1 ? 's' : ''})
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label
                            htmlFor="wizard-bathrooms"
                            className="block font-display text-xs font-bold uppercase tracking-wider text-[#555555]"
                          >
                            Bathrooms *
                          </label>
                          <select
                            id="wizard-bathrooms"
                            value={wizardState.details?.bathroomCount ?? 2}
                            onChange={(e) =>
                              setWizardState((prev) => ({
                                ...prev,
                                details: {
                                  ...prev.details,
                                  bathroomCount: parseInt(e.target.value, 10),
                                },
                              }))
                            }
                            className="mt-2 w-full min-h-[46px] rounded-xl border border-[#D9D5D0] bg-white px-4 py-2.5 text-base sm:text-sm text-[#111111] outline-none focus:border-[#E85D3F]"
                          >
                            {[1, 2, 3, 4, 5, 6].map((n) => (
                              <option key={n} value={n}>
                                {n} Bathroom{n > 1 ? 's' : ''}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label
                            htmlFor="wizard-furnishing"
                            className="block font-display text-xs font-bold uppercase tracking-wider text-[#555555]"
                          >
                            Furnishing Status
                          </label>
                          <select
                            id="wizard-furnishing"
                            value={wizardState.details?.furnishing || 'SEMI_FURNISHED'}
                            onChange={(e) =>
                              setWizardState((prev) => ({
                                ...prev,
                                details: { ...prev.details, furnishing: e.target.value },
                              }))
                            }
                            className="mt-2 w-full min-h-[46px] rounded-xl border border-[#D9D5D0] bg-white px-4 py-2.5 text-base sm:text-sm text-[#111111] outline-none focus:border-[#E85D3F]"
                          >
                            <option value="UNFURNISHED">Unfurnished</option>
                            <option value="SEMI_FURNISHED">Semi-Furnished</option>
                            <option value="FULLY_FURNISHED">Fully Furnished</option>
                          </select>
                        </div>
                      </div>

                      {/* Area Measurements with Live Cross-Field Validation */}
                      {(() => {
                        const liveAreaCheck = validateAreaHierarchy(wizardState.details);
                        const carpetErr = liveAreaCheck.fieldErrors['details.carpetArea'];
                        const builtUpErr = liveAreaCheck.fieldErrors['details.builtUpArea'];
                        const superBuiltUpErr = liveAreaCheck.fieldErrors['details.superBuiltUpArea'];

                        return (
                          <div className="mt-5">
                            <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
                              <div>
                                <label
                                  htmlFor="wizard-carpet-area"
                                  className="block font-display text-xs font-bold uppercase tracking-wider text-[#555555]"
                                >
                                  Carpet Area (sq. ft.) *
                                </label>
                                <input
                                  id="wizard-carpet-area"
                                  type="number"
                                  min={1}
                                  aria-invalid={Boolean(carpetErr)}
                                  placeholder="e.g., 1250"
                                  value={wizardState.details?.carpetArea ?? ''}
                                  onChange={(e) =>
                                    setWizardState((prev) => ({
                                      ...prev,
                                      details: {
                                        ...prev.details,
                                        carpetArea: e.target.value
                                          ? Number(e.target.value)
                                          : undefined,
                                      },
                                    }))
                                  }
                                  className={`mt-2 w-full min-h-[46px] rounded-xl border bg-white px-4 py-2.5 text-base sm:text-sm text-[#111111] outline-none tabular-nums ${
                                    carpetErr
                                      ? 'border-[#E85D3F] focus:border-[#E85D3F]'
                                      : 'border-[#D9D5D0] focus:border-[#E85D3F]'
                                  }`}
                                />
                                {carpetErr && (
                                  <p className="mt-1.5 text-xs text-[#E85D3F] font-body" role="alert">
                                    {carpetErr}
                                  </p>
                                )}
                              </div>

                              <div>
                                <label
                                  htmlFor="wizard-builtup-area"
                                  className="block font-display text-xs font-bold uppercase tracking-wider text-[#555555]"
                                >
                                  Built-Up Area (sq. ft.)
                                </label>
                                <input
                                  id="wizard-builtup-area"
                                  type="number"
                                  min={1}
                                  aria-invalid={Boolean(builtUpErr)}
                                  placeholder="e.g., 1480"
                                  value={wizardState.details?.builtUpArea ?? ''}
                                  onChange={(e) =>
                                    setWizardState((prev) => ({
                                      ...prev,
                                      details: {
                                        ...prev.details,
                                        builtUpArea: e.target.value
                                          ? Number(e.target.value)
                                          : undefined,
                                      },
                                    }))
                                  }
                                  className={`mt-2 w-full min-h-[46px] rounded-xl border bg-white px-4 py-2.5 text-base sm:text-sm text-[#111111] outline-none tabular-nums ${
                                    builtUpErr
                                      ? 'border-[#E85D3F] focus:border-[#E85D3F]'
                                      : 'border-[#D9D5D0] focus:border-[#E85D3F]'
                                  }`}
                                />
                                {builtUpErr && (
                                  <p className="mt-1.5 text-xs text-[#E85D3F] font-body" role="alert">
                                    {builtUpErr}
                                  </p>
                                )}
                              </div>

                              <div>
                                <label
                                  htmlFor="wizard-super-area"
                                  className="block font-display text-xs font-bold uppercase tracking-wider text-[#555555]"
                                >
                                  Super Built-Up Area (sq. ft.)
                                </label>
                                <input
                                  id="wizard-super-area"
                                  type="number"
                                  min={1}
                                  aria-invalid={Boolean(superBuiltUpErr)}
                                  placeholder="e.g., 1650"
                                  value={wizardState.details?.superBuiltUpArea ?? ''}
                                  onChange={(e) =>
                                    setWizardState((prev) => ({
                                      ...prev,
                                      details: {
                                        ...prev.details,
                                        superBuiltUpArea: e.target.value
                                          ? Number(e.target.value)
                                          : undefined,
                                      },
                                    }))
                                  }
                                  className={`mt-2 w-full min-h-[46px] rounded-xl border bg-white px-4 py-2.5 text-base sm:text-sm text-[#111111] outline-none tabular-nums ${
                                    superBuiltUpErr
                                      ? 'border-[#E85D3F] focus:border-[#E85D3F]'
                                      : 'border-[#D9D5D0] focus:border-[#E85D3F]'
                                  }`}
                                />
                                {superBuiltUpErr && (
                                  <p className="mt-1.5 text-xs text-[#E85D3F] font-body" role="alert">
                                    {superBuiltUpErr}
                                  </p>
                                )}
                              </div>
                            </div>
                            <p className="mt-1.5 text-xs text-[#6E6A65] font-body">
                              When multiple areas are provided, measurements must follow Carpet &le;
                              Built-Up &le; Super Built-Up.
                            </p>
                          </div>
                        );
                      })()}

                      {/* Floor, Facing & Possession */}
                      <div
                        className={`mt-5 grid grid-cols-1 gap-5 ${
                          wizardState.propertyType === 'INDEPENDENT_HOUSE'
                            ? 'sm:grid-cols-2 lg:grid-cols-4'
                            : 'sm:grid-cols-3'
                        }`}
                      >
                        {wizardState.propertyType === 'APARTMENT' ? (
                          <div>
                            <label
                              htmlFor="wizard-floor-category"
                              className="block font-display text-xs font-bold uppercase tracking-wider text-[#555555]"
                            >
                              Floor Level Category
                            </label>
                            <select
                              id="wizard-floor-category"
                              value={wizardState.details?.floorCategory || 'MID_FLOOR'}
                              onChange={(e) =>
                                setWizardState((prev) => ({
                                  ...prev,
                                  details: { ...prev.details, floorCategory: e.target.value },
                                }))
                              }
                              className="mt-2 w-full min-h-[46px] rounded-xl border border-[#D9D5D0] bg-white px-4 py-2.5 text-base sm:text-sm text-[#111111] outline-none focus:border-[#E85D3F]"
                            >
                              <option value="GROUND_FLOOR">Ground Floor</option>
                              <option value="LOWER_FLOOR">Lower Floor (1st – 4th)</option>
                              <option value="MID_FLOOR">Mid Floor (5th – 12th)</option>
                              <option value="HIGHER_FLOOR">Higher Floor (13th+)</option>
                            </select>
                          </div>
                        ) : (
                          <>
                            <div>
                              <label
                                htmlFor="wizard-total-floors"
                                className="block font-display text-xs font-bold uppercase tracking-wider text-[#555555]"
                              >
                                Total Building Storeys
                              </label>
                              <input
                                id="wizard-total-floors"
                                type="number"
                                min={1}
                                max={10}
                                placeholder="e.g., 2 (G+1)"
                                value={wizardState.details?.totalFloors ?? ''}
                                onChange={(e) =>
                                  setWizardState((prev) => ({
                                    ...prev,
                                    details: {
                                      ...prev.details,
                                      totalFloors: e.target.value
                                        ? Number(e.target.value)
                                        : undefined,
                                    },
                                  }))
                                }
                                className="mt-2 w-full min-h-[46px] rounded-xl border border-[#D9D5D0] bg-white px-4 py-2.5 text-base sm:text-sm text-[#111111] outline-none focus:border-[#E85D3F] tabular-nums"
                              />
                            </div>
                            <div>
                              <label
                                htmlFor="wizard-house-floor-category"
                                className="block font-display text-xs font-bold uppercase tracking-wider text-[#555555]"
                              >
                                Floor Level (Optional)
                              </label>
                              <select
                                id="wizard-house-floor-category"
                                value={wizardState.details?.floorCategory || ''}
                                onChange={(e) =>
                                  setWizardState((prev) => ({
                                    ...prev,
                                    details: {
                                      ...prev.details,
                                      floorCategory: e.target.value || undefined,
                                    },
                                  }))
                                }
                                className="mt-2 w-full min-h-[46px] rounded-xl border border-[#D9D5D0] bg-white px-4 py-2.5 text-base sm:text-sm text-[#111111] outline-none focus:border-[#E85D3F]"
                              >
                                <option value="">Not Applicable / Entire House</option>
                                <option value="GROUND_FLOOR">Ground Floor</option>
                                <option value="LOWER_FLOOR">Lower Floor (1st – 4th)</option>
                                <option value="MID_FLOOR">Mid Floor (5th – 12th)</option>
                                <option value="HIGHER_FLOOR">Higher Floor (13th+)</option>
                              </select>
                            </div>
                          </>
                        )}

                        <div>
                          <label
                            htmlFor="wizard-facing"
                            className="block font-display text-xs font-bold uppercase tracking-wider text-[#555555]"
                          >
                            Primary Facing
                          </label>
                          <select
                            id="wizard-facing"
                            value={wizardState.details?.facing || 'EAST'}
                            onChange={(e) =>
                              setWizardState((prev) => ({
                                ...prev,
                                details: { ...prev.details, facing: e.target.value },
                              }))
                            }
                            className="mt-2 w-full min-h-[46px] rounded-xl border border-[#D9D5D0] bg-white px-4 py-2.5 text-base sm:text-sm text-[#111111] outline-none focus:border-[#E85D3F]"
                          >
                            <option value="EAST">East</option>
                            <option value="SOUTH">South</option>
                            <option value="SOUTH_EAST">South-East</option>
                            <option value="NORTH">North</option>
                            <option value="NORTH_EAST">North-East</option>
                            <option value="WEST">West</option>
                            <option value="SOUTH_WEST">South-West</option>
                            <option value="NORTH_WEST">North-West</option>
                          </select>
                        </div>

                        <div>
                          <label
                            htmlFor="wizard-possession"
                            className="block font-display text-xs font-bold uppercase tracking-wider text-[#555555]"
                          >
                            Possession Status
                          </label>
                          <select
                            id="wizard-possession"
                            value={wizardState.details?.possession || 'READY_TO_MOVE'}
                            onChange={(e) =>
                              setWizardState((prev) => ({
                                ...prev,
                                details: { ...prev.details, possession: e.target.value },
                              }))
                            }
                            className="mt-2 w-full min-h-[46px] rounded-xl border border-[#D9D5D0] bg-white px-4 py-2.5 text-base sm:text-sm text-[#111111] outline-none focus:border-[#E85D3F]"
                          >
                            <option value="READY_TO_MOVE">Ready to Move</option>
                            <option value="UNDER_CONSTRUCTION">Under Construction</option>
                          </select>
                        </div>
                      </div>

                      {/* Structured Building & Parking Attributes */}
                      <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
                        <div>
                          <label
                            htmlFor="wizard-balconies"
                            className="block font-display text-xs font-bold uppercase tracking-wider text-[#555555]"
                          >
                            Balconies
                          </label>
                          <select
                            id="wizard-balconies"
                            value={wizardState.details?.balconies ?? ''}
                            onChange={(e) =>
                              setWizardState((prev) => ({
                                ...prev,
                                details: {
                                  ...prev.details,
                                  balconies:
                                    e.target.value === '' ? undefined : parseInt(e.target.value, 10),
                                },
                              }))
                            }
                            className="mt-2 w-full min-h-[46px] rounded-xl border border-[#D9D5D0] bg-white px-4 py-2.5 text-base sm:text-sm text-[#111111] outline-none focus:border-[#E85D3F] tabular-nums"
                          >
                            <option value="">Select...</option>
                            {[0, 1, 2, 3, 4, 5, 6].map((n) => (
                              <option key={n} value={n}>
                                {n === 0 ? '0 (No Balcony)' : `${n} Balcon${n > 1 ? 'ies' : 'y'}`}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label
                            htmlFor="wizard-covered-parking"
                            className="block font-display text-xs font-bold uppercase tracking-wider text-[#555555]"
                          >
                            Covered Parking
                          </label>
                          <select
                            id="wizard-covered-parking"
                            value={wizardState.details?.coveredParking ?? ''}
                            onChange={(e) =>
                              setWizardState((prev) => ({
                                ...prev,
                                details: {
                                  ...prev.details,
                                  coveredParking:
                                    e.target.value === '' ? undefined : parseInt(e.target.value, 10),
                                },
                              }))
                            }
                            className="mt-2 w-full min-h-[46px] rounded-xl border border-[#D9D5D0] bg-white px-4 py-2.5 text-base sm:text-sm text-[#111111] outline-none focus:border-[#E85D3F] tabular-nums"
                          >
                            <option value="">Select...</option>
                            {[0, 1, 2, 3, 4, 5].map((n) => (
                              <option key={n} value={n}>
                                {n === 0 ? 'None' : `${n} Covered`}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label
                            htmlFor="wizard-open-parking"
                            className="block font-display text-xs font-bold uppercase tracking-wider text-[#555555]"
                          >
                            Open Parking
                          </label>
                          <select
                            id="wizard-open-parking"
                            value={wizardState.details?.openParking ?? ''}
                            onChange={(e) =>
                              setWizardState((prev) => ({
                                ...prev,
                                details: {
                                  ...prev.details,
                                  openParking:
                                    e.target.value === '' ? undefined : parseInt(e.target.value, 10),
                                },
                              }))
                            }
                            className="mt-2 w-full min-h-[46px] rounded-xl border border-[#D9D5D0] bg-white px-4 py-2.5 text-base sm:text-sm text-[#111111] outline-none focus:border-[#E85D3F] tabular-nums"
                          >
                            <option value="">Select...</option>
                            {[0, 1, 2, 3, 4, 5].map((n) => (
                              <option key={n} value={n}>
                                {n === 0 ? 'None' : `${n} Open`}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label
                            htmlFor="wizard-property-age"
                            className="block font-display text-xs font-bold uppercase tracking-wider text-[#555555]"
                          >
                            Property Age (Years)
                          </label>
                          <input
                            id="wizard-property-age"
                            type="number"
                            min={0}
                            max={100}
                            placeholder="e.g., 2 (0 if New)"
                            value={wizardState.details?.propertyAgeYears ?? ''}
                            onChange={(e) =>
                              setWizardState((prev) => ({
                                ...prev,
                                details: {
                                  ...prev.details,
                                  propertyAgeYears:
                                    e.target.value === '' ? undefined : parseInt(e.target.value, 10),
                                },
                              }))
                            }
                            className="mt-2 w-full min-h-[46px] rounded-xl border border-[#D9D5D0] bg-white px-4 py-2.5 text-base sm:text-sm text-[#111111] outline-none focus:border-[#E85D3F] tabular-nums"
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Plot-Specific Specifications */
                    <div>
                      <h3 className="font-display text-base font-bold text-[#111111]">
                        Residential Plot Specifications
                      </h3>
                      <p className="mt-1 text-xs text-[#6E6A65] font-body">
                        Plot-specific land measurements and orientation (apartment bedroom, balcony,
                        and floor fields are excluded for plots).
                      </p>

                      <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-3">
                        <div>
                          <label
                            htmlFor="wizard-plot-area"
                            className="block font-display text-xs font-bold uppercase tracking-wider text-[#555555]"
                          >
                            Plot Area (sq. ft.) *
                          </label>
                          <input
                            id="wizard-plot-area"
                            type="number"
                            min={300}
                            step="0.01"
                            placeholder="e.g., 2160.50 (approx. 3 Cottah)"
                            value={wizardState.details?.plotArea ?? ''}
                            onChange={(e) =>
                              setWizardState((prev) => ({
                                ...prev,
                                details: {
                                  ...prev.details,
                                  plotArea: e.target.value ? Number(e.target.value) : undefined,
                                  configuration: 'Residential Plot',
                                },
                              }))
                            }
                            className="mt-2 w-full min-h-[46px] rounded-xl border border-[#D9D5D0] bg-white px-4 py-2.5 text-base sm:text-sm text-[#111111] outline-none focus:border-[#E85D3F] tabular-nums"
                          />
                          {wizardState.details?.plotArea && wizardState.details.plotArea > 0 && (
                            <p className="mt-1 text-xs text-[#6E6A65] font-body tabular-nums">
                              Approx. {(wizardState.details.plotArea / 720).toFixed(2)} Cottah
                              (Kolkata standard)
                            </p>
                          )}
                        </div>

                        <div>
                          <label
                            htmlFor="wizard-plot-facing"
                            className="block font-display text-xs font-bold uppercase tracking-wider text-[#555555]"
                          >
                            Plot Road Facing
                          </label>
                          <select
                            id="wizard-plot-facing"
                            value={wizardState.details?.facing || 'EAST'}
                            onChange={(e) =>
                              setWizardState((prev) => ({
                                ...prev,
                                details: { ...prev.details, facing: e.target.value },
                              }))
                            }
                            className="mt-2 w-full min-h-[46px] rounded-xl border border-[#D9D5D0] bg-white px-4 py-2.5 text-base sm:text-sm text-[#111111] outline-none focus:border-[#E85D3F]"
                          >
                            <option value="EAST">East</option>
                            <option value="SOUTH">South</option>
                            <option value="NORTH">North</option>
                            <option value="WEST">West</option>
                            <option value="CORNER_PLOT">Corner Plot (Dual Road)</option>
                          </select>
                        </div>

                        <div>
                          <label
                            htmlFor="wizard-plot-possession"
                            className="block font-display text-xs font-bold uppercase tracking-wider text-[#555555]"
                          >
                            Possession Readiness
                          </label>
                          <select
                            id="wizard-plot-possession"
                            value={wizardState.details?.possession || 'READY_TO_MOVE'}
                            onChange={(e) =>
                              setWizardState((prev) => ({
                                ...prev,
                                details: { ...prev.details, possession: e.target.value },
                              }))
                            }
                            className="mt-2 w-full min-h-[46px] rounded-xl border border-[#D9D5D0] bg-white px-4 py-2.5 text-base sm:text-sm text-[#111111] outline-none focus:border-[#E85D3F]"
                          >
                            <option value="READY_TO_MOVE">Immediate Possession</option>
                            <option value="UNDER_CONSTRUCTION">Gated Layout Under Development</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Pricing & Conditional Lease / Possession Timeline Section */}
                  <div className="border-t border-[#F0EDE8] pt-6">
                    <h3 className="font-display text-base font-bold text-[#111111]">
                      {wizardState.listingType === 'RESALE'
                        ? 'Resale Asking Price & Handover Timeline'
                        : 'Rental Commercial Terms & Lease Schedule'}
                    </h3>

                    {wizardState.listingType === 'RESALE' ? (
                      <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2">
                        <div>
                          <label
                            htmlFor="wizard-asking-price"
                            className="block font-display text-xs font-bold uppercase tracking-wider text-[#555555]"
                          >
                            Expected Asking Price (₹ INR) *
                          </label>
                          <input
                            id="wizard-asking-price"
                            type="number"
                            min={100000}
                            step={50000}
                            placeholder="e.g., 14500000 (for ₹1.45 Cr)"
                            value={wizardState.details?.askingPrice ?? ''}
                            onChange={(e) =>
                              setWizardState((prev) => ({
                                ...prev,
                                details: {
                                  ...prev.details,
                                  askingPrice: e.target.value ? Number(e.target.value) : undefined,
                                },
                              }))
                            }
                            className="mt-2 w-full min-h-[46px] rounded-xl border border-[#D9D5D0] bg-white px-4 py-2.5 text-base sm:text-sm text-[#111111] outline-none focus:border-[#E85D3F] tabular-nums"
                          />
                          <p className="mt-1.5 text-xs font-semibold text-[#E85D3F] font-display tabular-nums">
                            Formatted Display: {formatIndianCurrency(wizardState.details?.askingPrice)}
                          </p>
                        </div>

                        <div>
                          <label
                            htmlFor="wizard-possession-date"
                            className="block font-display text-xs font-bold uppercase tracking-wider text-[#555555]"
                          >
                            Expected Possession Date (Optional)
                          </label>
                          <input
                            id="wizard-possession-date"
                            type="date"
                            value={wizardState.details?.possessionDate ?? ''}
                            onChange={(e) =>
                              setWizardState((prev) => ({
                                ...prev,
                                details: {
                                  ...prev.details,
                                  possessionDate: e.target.value || undefined,
                                },
                              }))
                            }
                            className="mt-2 w-full min-h-[46px] rounded-xl border border-[#D9D5D0] bg-white px-4 py-2.5 text-base sm:text-sm text-[#111111] outline-none focus:border-[#E85D3F] tabular-nums"
                          />
                          <p className="mt-1.5 text-xs text-[#6E6A65] font-body">
                            {wizardState.details?.possession === 'UNDER_CONSTRUCTION'
                              ? 'Recommended for under-construction residences.'
                              : 'Leave blank if ready for immediate handover.'}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-4 space-y-5">
                        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
                          <div>
                            <label
                              htmlFor="wizard-monthly-rent"
                              className="block font-display text-xs font-bold uppercase tracking-wider text-[#555555]"
                            >
                              Monthly Rent (₹ / month) *
                            </label>
                            <input
                              id="wizard-monthly-rent"
                              type="number"
                              min={1000}
                              placeholder="e.g., 45000"
                              value={wizardState.details?.monthlyRent ?? ''}
                              onChange={(e) =>
                                setWizardState((prev) => ({
                                  ...prev,
                                  details: {
                                    ...prev.details,
                                    monthlyRent: e.target.value
                                      ? Number(e.target.value)
                                      : undefined,
                                  },
                                }))
                              }
                              className="mt-2 w-full min-h-[46px] rounded-xl border border-[#D9D5D0] bg-white px-4 py-2.5 text-base sm:text-sm text-[#111111] outline-none focus:border-[#E85D3F] tabular-nums"
                            />
                            <p className="mt-1.5 text-xs font-semibold text-[#E85D3F] font-display tabular-nums">
                              Formatted Display:{' '}
                              {wizardState.details?.monthlyRent
                                ? `${formatIndianCurrency(wizardState.details.monthlyRent)} / month`
                                : '—'}
                            </p>
                          </div>

                          <div>
                            <label
                              htmlFor="wizard-deposit"
                              className="block font-display text-xs font-bold uppercase tracking-wider text-[#555555]"
                            >
                              Security Deposit (₹)
                            </label>
                            <input
                              id="wizard-deposit"
                              type="number"
                              min={0}
                              placeholder="e.g., 135000"
                              value={wizardState.details?.securityDeposit ?? ''}
                              onChange={(e) =>
                                setWizardState((prev) => ({
                                  ...prev,
                                  details: {
                                    ...prev.details,
                                    securityDeposit: e.target.value
                                      ? Number(e.target.value)
                                      : undefined,
                                  },
                                }))
                              }
                              className="mt-2 w-full min-h-[46px] rounded-xl border border-[#D9D5D0] bg-white px-4 py-2.5 text-base sm:text-sm text-[#111111] outline-none focus:border-[#E85D3F] tabular-nums"
                            />
                            {wizardState.details?.securityDeposit !== undefined &&
                              wizardState.details.securityDeposit > 0 && (
                                <p className="mt-1.5 text-xs text-[#6E6A65] font-display tabular-nums">
                                  {formatIndianCurrency(wizardState.details.securityDeposit)}
                                </p>
                              )}
                          </div>

                          <div>
                            <label
                              htmlFor="wizard-maintenance"
                              className="block font-display text-xs font-bold uppercase tracking-wider text-[#555555]"
                            >
                              Monthly Maintenance (₹)
                            </label>
                            <input
                              id="wizard-maintenance"
                              type="number"
                              min={0}
                              placeholder="e.g., 4500"
                              value={wizardState.details?.maintenance ?? ''}
                              onChange={(e) =>
                                setWizardState((prev) => ({
                                  ...prev,
                                  details: {
                                    ...prev.details,
                                    maintenance: e.target.value
                                      ? Number(e.target.value)
                                      : undefined,
                                  },
                                }))
                              }
                              className="mt-2 w-full min-h-[46px] rounded-xl border border-[#D9D5D0] bg-white px-4 py-2.5 text-base sm:text-sm text-[#111111] outline-none focus:border-[#E85D3F] tabular-nums"
                            />
                            {wizardState.details?.maintenance !== undefined &&
                              wizardState.details.maintenance > 0 && (
                                <p className="mt-1.5 text-xs text-[#6E6A65] font-display tabular-nums">
                                  {formatIndianCurrency(wizardState.details.maintenance)} / month
                                </p>
                              )}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
                          <div>
                            <label
                              htmlFor="wizard-lease-duration"
                              className="block font-display text-xs font-bold uppercase tracking-wider text-[#555555]"
                            >
                              Lease Duration
                            </label>
                            <select
                              id="wizard-lease-duration"
                              value={wizardState.details?.leaseDuration ?? ''}
                              onChange={(e) =>
                                setWizardState((prev) => ({
                                  ...prev,
                                  details: {
                                    ...prev.details,
                                    leaseDuration: (e.target.value || undefined) as
                                      | LeaseDurationOption
                                      | undefined,
                                  },
                                }))
                              }
                              className="mt-2 w-full min-h-[46px] rounded-xl border border-[#D9D5D0] bg-white px-4 py-2.5 text-base sm:text-sm text-[#111111] outline-none focus:border-[#E85D3F]"
                            >
                              <option value="">Select lease term...</option>
                              {LEASE_DURATION_OPTIONS.map((term) => (
                                <option key={term} value={term}>
                                  {term}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label
                              htmlFor="wizard-notice-period"
                              className="block font-display text-xs font-bold uppercase tracking-wider text-[#555555]"
                            >
                              Notice Period
                            </label>
                            <select
                              id="wizard-notice-period"
                              value={wizardState.details?.noticePeriod ?? ''}
                              onChange={(e) =>
                                setWizardState((prev) => ({
                                  ...prev,
                                  details: {
                                    ...prev.details,
                                    noticePeriod: (e.target.value || undefined) as
                                      | NoticePeriodOption
                                      | undefined,
                                  },
                                }))
                              }
                              className="mt-2 w-full min-h-[46px] rounded-xl border border-[#D9D5D0] bg-white px-4 py-2.5 text-base sm:text-sm text-[#111111] outline-none focus:border-[#E85D3F]"
                            >
                              <option value="">Select notice period...</option>
                              {NOTICE_PERIOD_OPTIONS.map((np) => (
                                <option key={np} value={np}>
                                  {np}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label
                              htmlFor="wizard-availability-date"
                              className="block font-display text-xs font-bold uppercase tracking-wider text-[#555555]"
                            >
                              Available From Date
                            </label>
                            <input
                              id="wizard-availability-date"
                              type="date"
                              value={wizardState.details?.availabilityDate ?? ''}
                              onChange={(e) =>
                                setWizardState((prev) => ({
                                  ...prev,
                                  details: {
                                    ...prev.details,
                                    availabilityDate: e.target.value || undefined,
                                  },
                                }))
                              }
                              className="mt-2 w-full min-h-[46px] rounded-xl border border-[#D9D5D0] bg-white px-4 py-2.5 text-base sm:text-sm text-[#111111] outline-none focus:border-[#E85D3F] tabular-nums"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Structured Canonical Amenities Selection */}
                  <div className="border-t border-[#F0EDE8] pt-6">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h3 className="font-display text-base font-bold text-[#111111]">
                          Residential Amenities
                        </h3>
                        <p className="mt-0.5 text-xs text-[#6E6A65] font-body">
                          Select verified building or layout amenities available with this{' '}
                          {wizardState.propertyType === 'PLOT' ? 'residential plot' : 'property'}.
                        </p>
                      </div>
                      <span className="text-xs font-semibold text-[#555555] font-display tabular-nums">
                        {(wizardState.details?.amenities || []).length} selected
                      </span>
                    </div>

                    <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                      {amenitiesCatalog
                        .filter((item) =>
                          item.applicablePropertyTypes.includes(wizardState.propertyType)
                        )
                        .map((amenity) => {
                          const selectedAmenities = wizardState.details?.amenities || [];
                          const isSelected = selectedAmenities.includes(amenity.slug);
                          return (
                            <button
                              key={amenity.slug}
                              type="button"
                              aria-pressed={isSelected}
                              onClick={() =>
                                setWizardState((prev) => {
                                  const current = prev.details?.amenities || [];
                                  const updated = current.includes(amenity.slug)
                                    ? current.filter((s) => s !== amenity.slug)
                                    : [...current, amenity.slug];
                                  return {
                                    ...prev,
                                    details: {
                                      ...prev.details,
                                      amenities: updated,
                                    },
                                  };
                                })
                              }
                              className={`flex items-center justify-between gap-2 rounded-xl border px-3.5 py-2.5 text-left text-xs sm:text-sm font-body transition cursor-pointer min-h-[44px] ${
                                isSelected
                                  ? 'border-[#111111] bg-[#111111] text-white font-medium'
                                  : 'border-[#D9D5D0] bg-white text-[#111111] hover:border-[#9A9690]'
                              }`}
                            >
                              <span className="truncate">{amenity.name}</span>
                              {isSelected && <Check className="h-4 w-4 shrink-0 text-[#E85D3F]" />}
                            </button>
                          );
                        })}
                    </div>
                  </div>

                  {/* Property Description */}
                  <div className="border-t border-[#F0EDE8] pt-6">
                    <label
                      htmlFor="wizard-description"
                      className="block font-display text-xs font-bold uppercase tracking-wider text-[#555555]"
                    >
                      Property Highlights &amp; Notes (Optional)
                    </label>
                    <textarea
                      id="wizard-description"
                      rows={3}
                      maxLength={2000}
                      placeholder="Describe natural light, ventilation, parking availability, or key highlights..."
                      value={wizardState.details?.description || ''}
                      onChange={(e) =>
                        setWizardState((prev) => ({
                          ...prev,
                          details: { ...prev.details, description: e.target.value },
                        }))
                      }
                      className="mt-2 w-full rounded-xl border border-[#D9D5D0] bg-white px-4 py-3 text-base sm:text-sm text-[#111111] outline-none focus:border-[#E85D3F]"
                    />
                  </div>
                </div>
              )}

              {/* ================================================================= */}
              {/* VISIBLE STEP 3 (Internal Step 4): PROPERTY PHOTOGRAPHS            */}
              {/* ================================================================= */}
              {currentStep === 4 && (
                <PhotographsStep
                  photos={wizardState.photos || []}
                  photoUploadError={photoUploadError}
                  photoCategoryInput={photoCategoryInput}
                  onPhotoCategoryChange={setPhotoCategoryInput}
                  photoCaptionInput={photoCaptionInput}
                  onPhotoCaptionChange={setPhotoCaptionInput}
                  isDraggingPhotos={isDraggingPhotos}
                  onDraggingChange={setIsDraggingPhotos}
                  onFileInputChange={handleFileInputChange}
                  onDropPhotos={handleDropPhotos}
                  uploadQueue={uploadQueue}
                  onRetryUpload={handleRetryUpload}
                  onDismissUpload={handleDismissUpload}
                  isMutatingGallery={isMutatingGallery}
                  onSetFeaturedPhoto={handleSetFeaturedPhoto}
                  onMovePhoto={handleMovePhoto}
                  onRemovePhoto={handleRemovePhoto}
                />
              )}

              {/* ================================================================= */}
              {/* VISIBLE STEP 4 (Internal Step 5): AUTHORITY & CONSENT             */}
              {/* ================================================================= */}
              {currentStep === 5 && (
                <AuthorityConsentStep
                  customerName={customer?.name}
                  customerPhone={customer?.phone}
                  listingSource={wizardState.listingSource}
                  ownerDeclarationAccepted={Boolean(wizardState.consent?.ownerDeclarationAccepted)}
                  partnerAttestationAccepted={Boolean(
                    wizardState.consent?.partnerAttestationAccepted
                  )}
                  onOwnerDeclarationChange={handleOwnerDeclarationChange}
                  onPartnerAttestationChange={handlePartnerAttestationChange}
                />
              )}

              {/* ================================================================= */}
              {/* VISIBLE STEP 5 (Internal Step 6): REVIEW & SUBMIT                 */}
              {/* ================================================================= */}
              {currentStep === 6 && (
                <ReviewSubmitStep
                  wizardState={wizardState}
                  customerName={customer?.name}
                  canEdit={loadedPermissions.canEdit}
                  amenitiesCatalog={amenitiesCatalog}
                  featuredPhoto={featuredPhoto}
                  loadedActivityTimeline={loadedActivityTimeline}
                  onJumpToStep={handleJumpToStep}
                />
              )}

              {/* Step Action Footer (Back / Save as Draft / Next or Final Submit) */}
              <div className="mt-8 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-[#E5E0D8] pt-6">
                <div className="flex items-center">
                  {visibleStep > 1 ? (
                    <button
                      type="button"
                      onClick={handlePreviousStep}
                      disabled={isSyncingDraft || isSubmittingFinal}
                      className="w-full sm:w-auto min-h-[46px] inline-flex items-center justify-center gap-2 rounded-xl border border-[#D9D5D0] bg-white px-5 py-2.5 text-sm font-semibold text-[#111111] transition hover:bg-[#F5F3F0] disabled:opacity-50 font-display cursor-pointer whitespace-nowrap"
                    >
                      <ArrowLeft className="h-4 w-4 shrink-0" />
                      <span>Back</span>
                    </button>
                  ) : (
                    <div />
                  )}
                </div>

                {!loadedPermissions.canEdit ? (
                  <Link
                    href="/my-properties"
                    className="w-full sm:w-auto min-h-[46px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#111111] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#2A2A2A] font-display whitespace-nowrap"
                  >
                    <span>Return to My Property Submissions</span>
                    <ArrowRight className="h-4 w-4 shrink-0" />
                  </Link>
                ) : (
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                    <button
                      type="button"
                      onClick={handleSaveDraftOnly}
                      disabled={isSyncingDraft || isSubmittingFinal}
                      className="w-full sm:w-auto min-h-[46px] inline-flex items-center justify-center gap-2 rounded-xl border border-[#D9D5D0] bg-white px-5 py-2.5 text-sm font-semibold text-[#111111] transition hover:bg-[#F5F3F0] disabled:opacity-50 font-display cursor-pointer whitespace-nowrap"
                    >
                      {isSyncingDraft ? (
                        <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                      ) : (
                        <FileText className="h-4 w-4 text-[#555555] shrink-0" />
                      )}
                      <span>{isSyncingDraft ? 'Saving Draft...' : 'Save as Draft'}</span>
                    </button>

                    {visibleStep < 5 ? (
                      <button
                        type="button"
                        onClick={handleNextStep}
                        disabled={
                          isSyncingDraft ||
                          partnerStatus.checking ||
                          hasActiveUploads ||
                          isMutatingGallery
                        }
                        className="w-full sm:w-auto min-h-[46px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#E85D3F] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#D44E32] disabled:opacity-50 font-display cursor-pointer whitespace-nowrap"
                      >
                        {isSyncingDraft || hasActiveUploads ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                            <span>
                              {hasActiveUploads
                                ? 'Uploading Photographs...'
                                : 'Validating Step...'}
                            </span>
                          </>
                        ) : (
                          <>
                            <span>
                              {nextVisibleMeta
                                ? `Next: ${nextVisibleMeta.shortTitle}`
                                : 'Continue'}
                            </span>
                            <ArrowRight className="h-4 w-4 shrink-0" />
                          </>
                        )}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleFinalSubmit}
                        disabled={
                          isSubmittingFinal ||
                          isSyncingDraft ||
                          hasActiveUploads ||
                          isMutatingGallery
                        }
                        className="w-full sm:w-auto min-h-[46px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#E85D3F] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#D44E32] disabled:opacity-50 font-display cursor-pointer whitespace-nowrap"
                      >
                        {isSubmittingFinal ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                            <span>
                              {loadedSubmissionStatus === 'CHANGES_REQUESTED'
                                ? 'Resubmitting Property...'
                                : 'Submitting for Verification...'}
                            </span>
                          </>
                        ) : (
                          <>
                            <ShieldCheck className="h-4 w-4 shrink-0" />
                            <span>
                              {loadedSubmissionStatus === 'CHANGES_REQUESTED'
                                ? 'Resubmit Property for Verification'
                                : 'Submit Property for Verification'}
                            </span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
