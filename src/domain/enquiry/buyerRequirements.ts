import type { EnquiryEntity } from './entities/enquiryEntity';

export const PREFERRED_BHK_OPTIONS = [
  { value: '1 BHK', label: '1 BHK' },
  { value: '2 BHK', label: '2 BHK' },
  { value: '3 BHK', label: '3 BHK' },
  { value: '4 BHK', label: '4 BHK' },
  { value: '5+ BHK', label: '5+ BHK' },
] as const;

export type PreferredBhkValue = (typeof PREFERRED_BHK_OPTIONS)[number]['value'];

export const PROPERTY_TYPE_OPTIONS = [
  { value: 'APARTMENT', label: 'Apartment' },
  { value: 'VILLA', label: 'Villa' },
  { value: 'INDEPENDENT_HOUSE', label: 'Independent House' },
  { value: 'DUPLEX', label: 'Duplex' },
  { value: 'PENTHOUSE', label: 'Penthouse' },
  { value: 'OTHER', label: 'Other' },
] as const;

export type BuyerPropertyTypeValue = (typeof PROPERTY_TYPE_OPTIONS)[number]['value'];

export interface BudgetRangeOption {
  value:
    | 'UNDER_30L'
    | '30L_50L'
    | '50L_75L'
    | '75L_1CR'
    | '1CR_1_5CR'
    | '1_5CR_2CR'
    | '2CR_PLUS'
    | 'FLEXIBLE';
  label: string;
  budgetMin: number | null;
  budgetMax: number | null;
}

export const BUDGET_RANGE_OPTIONS: readonly BudgetRangeOption[] = [
  { value: 'UNDER_30L', label: 'Under ₹30 Lakhs', budgetMin: null, budgetMax: 3_000_000 },
  { value: '30L_50L', label: '₹30–50 Lakhs', budgetMin: 3_000_000, budgetMax: 5_000_000 },
  { value: '50L_75L', label: '₹50–75 Lakhs', budgetMin: 5_000_000, budgetMax: 7_500_000 },
  { value: '75L_1CR', label: '₹75 Lakhs–₹1 Crore', budgetMin: 7_500_000, budgetMax: 10_000_000 },
  { value: '1CR_1_5CR', label: '₹1–1.5 Crore', budgetMin: 10_000_000, budgetMax: 15_000_000 },
  { value: '1_5CR_2CR', label: '₹1.5–2 Crore', budgetMin: 15_000_000, budgetMax: 20_000_000 },
  { value: '2CR_PLUS', label: '₹2 Crore+', budgetMin: 20_000_000, budgetMax: null },
  { value: 'FLEXIBLE', label: 'Flexible', budgetMin: null, budgetMax: null },
] as const;

export type BudgetRangeValue = BudgetRangeOption['value'];

export const BUYING_TIMELINE_OPTIONS = [
  { value: 'IMMEDIATE', label: 'Immediately' },
  { value: 'WITHIN_3_MONTHS', label: 'Within 3 months' },
  { value: '3_TO_6_MONTHS', label: '3–6 months' },
  { value: '6_TO_12_MONTHS', label: '6–12 months' },
  { value: 'JUST_EXPLORING', label: 'Just Exploring' },
] as const;

export type BuyingTimelineValue = (typeof BUYING_TIMELINE_OPTIONS)[number]['value'];

export const PURCHASE_PURPOSE_OPTIONS = [
  { value: 'SELF_USE', label: 'Self Use' },
  { value: 'INVESTMENT', label: 'Investment' },
  { value: 'RENTAL_INCOME', label: 'Rental Income' },
  { value: 'OTHER', label: 'Other' },
] as const;

export type PurchasePurposeValue = (typeof PURCHASE_PURPOSE_OPTIONS)[number]['value'];

export const ADDITIONAL_REQUIREMENT_SUGGESTIONS = [
  'Price',
  'Availability',
  'Floor plans',
  'Amenities',
  'Payment plans',
  'Offers',
  'Possession details',
  'Other questions',
] as const;

export const MAX_ADDITIONAL_REQUIREMENTS_LENGTH = 1500;

export type LeadCaptureStage = 'STEP1_CAPTURED' | 'STEP2_SUBMITTED' | 'STEP2_SKIPPED';
export type RequirementsStatus = 'INCOMPLETE' | 'SKIPPED' | 'PARTIAL' | 'COMPLETE';

export type SiteVisitDisplayState =
  | 'NONE'
  | 'INTEREST_EXPRESSED'
  | 'VISIT_SCHEDULED'
  | 'VISIT_COMPLETED';

const BHK_VALUE_SET = new Set<string>(PREFERRED_BHK_OPTIONS.map((o) => o.value));
const PROPERTY_TYPE_SET = new Set<string>(PROPERTY_TYPE_OPTIONS.map((o) => o.value));
const BUDGET_RANGE_MAP = new Map<string, BudgetRangeOption>(
  BUDGET_RANGE_OPTIONS.map((o) => [o.value, o])
);
const TIMELINE_SET = new Set<string>(BUYING_TIMELINE_OPTIONS.map((o) => o.value));
const PURPOSE_SET = new Set<string>(PURCHASE_PURPOSE_OPTIONS.map((o) => o.value));

export function isValidPreferredBhk(value: string): value is PreferredBhkValue {
  return BHK_VALUE_SET.has(value);
}

export function isValidBuyerPropertyType(value: string): value is BuyerPropertyTypeValue {
  return PROPERTY_TYPE_SET.has(value);
}

export function isValidBudgetRange(value: string): value is BudgetRangeValue {
  return BUDGET_RANGE_MAP.has(value);
}

export function isValidBuyingTimeline(value: string): value is BuyingTimelineValue {
  return TIMELINE_SET.has(value);
}

export function isValidPurchasePurpose(value: string): value is PurchasePurposeValue {
  return PURPOSE_SET.has(value);
}

/**
 * Safely derives analytics min/max numeric bounds from a canonical budget range.
 * Flexible and open-ended boundaries return null so they are never misrepresented.
 */
export function resolveBudgetBounds(budgetRange?: string | null): {
  budgetRange: BudgetRangeValue | null;
  budgetLabel: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
} {
  if (!budgetRange) {
    return { budgetRange: null, budgetLabel: null, budgetMin: null, budgetMax: null };
  }
  const match = BUDGET_RANGE_MAP.get(budgetRange);
  if (!match) {
    return { budgetRange: null, budgetLabel: null, budgetMin: null, budgetMax: null };
  }
  return {
    budgetRange: match.value,
    budgetLabel: match.label,
    budgetMin: match.budgetMin,
    budgetMax: match.budgetMax,
  };
}

export function formatBuyerPropertyType(value?: string | null): string | null {
  if (!value) return null;
  const found = PROPERTY_TYPE_OPTIONS.find((o) => o.value === value);
  if (found) return found.label;
  if (value === 'FLAT') return 'Flat';
  if (value === 'PLOT') return 'Plot';
  return value
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatBuyingTimeline(value?: string | null): string | null {
  if (!value) return null;
  const found = BUYING_TIMELINE_OPTIONS.find((o) => o.value === value);
  if (found) return found.label;
  if (value === 'MORE_THAN_12_MONTHS') return 'More than 12 months';
  if (value === 'NOT_DECIDED') return 'Not Decided';
  return value.replace(/_/g, ' ');
}

export function formatPurchasePurpose(value?: string | null): string | null {
  if (!value) return null;
  const found = PURCHASE_PURPOSE_OPTIONS.find((o) => o.value === value);
  if (found) return found.label;
  if (value === 'FAMILY_USE') return 'Family Use';
  return value.replace(/_/g, ' ');
}

function formatRupeesCompact(amount: number): string {
  if (amount >= 10_000_000) {
    const cr = amount / 10_000_000;
    return `₹${Number.isInteger(cr) ? cr : cr.toFixed(2).replace(/\.?0+$/, '')} Cr`;
  }
  if (amount >= 100_000) {
    const l = amount / 100_000;
    return `₹${Number.isInteger(l) ? l : l.toFixed(1).replace(/\.?0+$/, '')} Lakhs`;
  }
  return `₹${amount.toLocaleString('en-IN')}`;
}

export function formatBudgetDisplay(metadata?: Record<string, any> | null): string | null {
  if (!metadata) return null;
  if (typeof metadata.budgetRange === 'string' && BUDGET_RANGE_MAP.has(metadata.budgetRange)) {
    return BUDGET_RANGE_MAP.get(metadata.budgetRange)!.label;
  }
  const min = typeof metadata.budgetMin === 'number' && metadata.budgetMin > 0 ? metadata.budgetMin : null;
  const max = typeof metadata.budgetMax === 'number' && metadata.budgetMax > 0 ? metadata.budgetMax : null;
  if (min && max) return `${formatRupeesCompact(min)} – ${formatRupeesCompact(max)}`;
  if (min) return `${formatRupeesCompact(min)}+`;
  if (max) return `Under ${formatRupeesCompact(max)}`;
  return null;
}

export interface RequirementsCompletenessSummary {
  providedCount: number;
  totalOptionalFields: number;
  percentage: number;
  hasAnyRequirements: boolean;
  requirementsStatus: RequirementsStatus;
  captureStage: LeadCaptureStage | null;
  captureStatusLabel: string;
  providedFields: string[];
}

export function computeRequirementsCompleteness(enquiry: {
  message?: string | null;
  requestSiteVisit?: boolean;
  metadata?: Record<string, any> | null;
}): RequirementsCompletenessSummary {
  const meta = enquiry.metadata || {};
  const providedFields: string[] = [];

  if (typeof meta.preferredBhk === 'string' && meta.preferredBhk.trim()) {
    providedFields.push('preferredBhk');
  }
  if (typeof meta.propertyType === 'string' && meta.propertyType.trim()) {
    providedFields.push('propertyType');
  }
  if (
    (typeof meta.budgetRange === 'string' && meta.budgetRange.trim()) ||
    (typeof meta.budgetMin === 'number' && meta.budgetMin > 0) ||
    (typeof meta.budgetMax === 'number' && meta.budgetMax > 0)
  ) {
    providedFields.push('budget');
  }
  if (typeof meta.purchaseTimeline === 'string' && meta.purchaseTimeline.trim()) {
    providedFields.push('purchaseTimeline');
  }
  const purposeVal = meta.purchasePurpose || meta.purpose;
  if (typeof purposeVal === 'string' && purposeVal.trim()) {
    providedFields.push('purchasePurpose');
  }
  if (meta.siteVisitInterest === true || enquiry.requestSiteVisit === true) {
    providedFields.push('siteVisitInterest');
  }
  if (typeof enquiry.message === 'string' && enquiry.message.trim()) {
    providedFields.push('additionalRequirements');
  }

  const totalOptionalFields = 7;
  const providedCount = providedFields.length;
  const percentage = Math.round((providedCount / totalOptionalFields) * 100);
  const hasAnyRequirements = providedCount > 0;

  const rawStage = meta.leadCaptureStage as LeadCaptureStage | undefined;
  const captureStage: LeadCaptureStage | null =
    rawStage === 'STEP1_CAPTURED' || rawStage === 'STEP2_SUBMITTED' || rawStage === 'STEP2_SKIPPED'
      ? rawStage
      : null;

  let requirementsStatus: RequirementsStatus;
  if (providedCount === totalOptionalFields) {
    requirementsStatus = 'COMPLETE';
  } else if (providedCount > 0) {
    requirementsStatus = 'PARTIAL';
  } else if (captureStage === 'STEP2_SKIPPED' || meta.requirementsStatus === 'SKIPPED') {
    requirementsStatus = 'SKIPPED';
  } else {
    requirementsStatus = 'INCOMPLETE';
  }

  let captureStatusLabel: string;
  if (captureStage === 'STEP2_SUBMITTED') {
    captureStatusLabel =
      providedCount === 0
        ? 'Submitted (No preferences selected)'
        : providedCount === totalOptionalFields
          ? 'Requirements Complete'
          : 'Requirements Submitted (Partial)';
  } else if (captureStage === 'STEP2_SKIPPED') {
    captureStatusLabel = 'Skipped at Step 2';
  } else if (captureStage === 'STEP1_CAPTURED') {
    captureStatusLabel = 'Step 1 Only (Requirements Incomplete)';
  } else {
    captureStatusLabel = hasAnyRequirements ? 'Requirements Provided' : 'Not Provided';
  }

  return {
    providedCount,
    totalOptionalFields,
    percentage,
    hasAnyRequirements,
    requirementsStatus,
    captureStage,
    captureStatusLabel,
    providedFields,
  };
}

/**
 * Classifies site visit state cleanly so mere interest is never conflated with a scheduled visit.
 */
export function classifySiteVisitState(enquiry: Pick<EnquiryEntity, 'status' | 'siteVisitId' | 'requestSiteVisit' | 'metadata'>): {
  state: SiteVisitDisplayState;
  label: string;
} {
  if (enquiry.status === 'SITE_VISIT_COMPLETED') {
    return { state: 'VISIT_COMPLETED', label: 'Visit Completed' };
  }
  if (Boolean(enquiry.siteVisitId) || enquiry.status === 'SITE_VISIT_SCHEDULED') {
    return { state: 'VISIT_SCHEDULED', label: 'Visit Scheduled' };
  }
  if (enquiry.requestSiteVisit || enquiry.metadata?.siteVisitInterest === true) {
    return { state: 'INTEREST_EXPRESSED', label: 'Interest Expressed' };
  }
  return { state: 'NONE', label: 'No Site Visit Interest' };
}
