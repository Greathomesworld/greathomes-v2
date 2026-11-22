import type {
  ListingType,
  SubmissionPropertyType,
  ListingSource,
} from '@/src/domain/propertySubmission/validation';

export type InternalWizardStepNumber = 1 | 2 | 3 | 4 | 5 | 6;
export type VisibleWizardStepNumber = 1 | 2 | 3 | 4 | 5;

export interface VisibleWizardStepMeta {
  visibleStep: VisibleWizardStepNumber;
  internalStep: InternalWizardStepNumber;
  title: string;
  shortTitle: string;
  description: string;
}

export const VISIBLE_WIZARD_STEPS: readonly VisibleWizardStepMeta[] = [
  {
    visibleStep: 1,
    internalStep: 2,
    title: 'Location & Project',
    shortTitle: 'Location & Project',
    description:
      'Confirm your Kolkata locality, link a residential project if applicable, and provide the address for staff verification.',
  },
  {
    visibleStep: 2,
    internalStep: 3,
    title: 'Details & Pricing',
    shortTitle: 'Details & Pricing',
    description:
      'Provide accurate configuration, area measurements, and transparent asking price or rental terms.',
  },
  {
    visibleStep: 3,
    internalStep: 4,
    title: 'Property Photographs',
    shortTitle: 'Photographs',
    description:
      'Upload 3 to 15 clear photographs (images only; JPEG, PNG, WebP, or AVIF) and choose your cover image.',
  },
  {
    visibleStep: 4,
    internalStep: 5,
    title: 'Authority & Consent',
    shortTitle: 'Authority / Consent',
    description:
      'Confirm your legal authority as property owner or attest to explicit owner consent as an active partner.',
  },
  {
    visibleStep: 5,
    internalStep: 6,
    title: 'Review & Submit',
    shortTitle: 'Review & Submit',
    description:
      'Verify your complete property summary before submitting to the Great Homes verification queue.',
  },
] as const;

export function toVisibleStep(internalStep: InternalWizardStepNumber): VisibleWizardStepNumber {
  if (internalStep <= 2) return 1;
  if (internalStep >= 6) return 5;
  return (internalStep - 1) as VisibleWizardStepNumber;
}

export function toInternalStep(visibleStep: VisibleWizardStepNumber): InternalWizardStepNumber {
  const clamped = Math.min(5, Math.max(1, visibleStep));
  return (clamped + 1) as InternalWizardStepNumber;
}

export function clampVisibleInternalStep(
  computedStep: InternalWizardStepNumber
): InternalWizardStepNumber {
  return computedStep < 2 ? 2 : computedStep;
}

export interface Page2EntryParamsInput {
  draftId?: string | null;
  listingType?: string | null;
  propertyType?: string | null;
  locationId?: string | null;
  locality?: string | null;
}

export interface Page2EntryParamsResolution {
  requiresRedirectToPage1: boolean;
  isDraftFlow: boolean;
  listingType: ListingType;
  propertyType: SubmissionPropertyType;
  isCustomLocality: boolean;
  locationId: string | null;
}

export function resolvePage2EntryParams(
  input: Page2EntryParamsInput
): Page2EntryParamsResolution {
  const trimmedDraftId = typeof input.draftId === 'string' ? input.draftId.trim() : '';
  if (trimmedDraftId.length > 0) {
    return {
      requiresRedirectToPage1: false,
      isDraftFlow: true,
      listingType: 'RESALE',
      propertyType: 'APARTMENT',
      isCustomLocality: false,
      locationId: null,
    };
  }

  const rawListingType = typeof input.listingType === 'string' ? input.listingType.trim() : '';
  const rawPropertyType = typeof input.propertyType === 'string' ? input.propertyType.trim() : '';
  const rawLocality = typeof input.locality === 'string' ? input.locality.trim() : '';
  const rawLocationId = typeof input.locationId === 'string' ? input.locationId.trim() : '';

  const validListingType = rawListingType === 'RESALE' || rawListingType === 'RENTAL';
  const validPropertyType =
    rawPropertyType === 'APARTMENT' ||
    rawPropertyType === 'INDEPENDENT_HOUSE' ||
    rawPropertyType === 'PLOT';
  const isCustomLocality = rawLocality === 'custom';
  const validLocationSelection = isCustomLocality || rawLocationId.length > 0;

  if (!validListingType || !validPropertyType || !validLocationSelection) {
    return {
      requiresRedirectToPage1: true,
      isDraftFlow: false,
      listingType: 'RESALE',
      propertyType: 'APARTMENT',
      isCustomLocality: false,
      locationId: null,
    };
  }

  return {
    requiresRedirectToPage1: false,
    isDraftFlow: false,
    listingType: rawListingType as ListingType,
    propertyType: rawPropertyType as SubmissionPropertyType,
    isCustomLocality,
    locationId: isCustomLocality ? null : rawLocationId,
  };
}

/**
 * Derives submission source exclusively from server-verified customer accountType
 * (never trusting ?source=... URL parameter as authorization).
 */
export function deriveSubmissionSourceFromAccountType(
  accountType?: 'OWNER' | 'LISTING_PARTNER' | null
): ListingSource {
  return accountType === 'LISTING_PARTNER' ? 'PARTNER' : 'OWNER';
}
