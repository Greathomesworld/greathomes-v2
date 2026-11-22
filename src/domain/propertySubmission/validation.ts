import { z } from 'zod';

export const listingTypeSchema = z.enum(['RESALE', 'RENTAL']);
export const listingSourceSchema = z.enum(['OWNER', 'PARTNER']);
export const propertyTypeSchema = z.enum(['APARTMENT', 'INDEPENDENT_HOUSE', 'PLOT']);
export const submissionStatusSchema = z.enum([
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'CHANGES_REQUESTED',
  'APPROVED',
  'PUBLISHED',
  'DEACTIVATED',
  'REJECTED',
  'WITHDRAWAL_REQUESTED',
  'WITHDRAWN',
]);

export type ListingType = z.infer<typeof listingTypeSchema>;
export type ListingSource = z.infer<typeof listingSourceSchema>;
export type SubmissionPropertyType = z.infer<typeof propertyTypeSchema>;
export type SubmissionStatus = z.infer<typeof submissionStatusSchema>;

export const CANONICAL_OWNER_DECLARATION_TEXT =
  'I hereby declare that I am the legal owner (or hold formal authorization) of this residential property and have the full authority to submit it for verification by Great Homes.';

export const CANONICAL_PARTNER_ATTESTATION_TEXT =
  'I hereby attest as an authorized Great Homes Partner that I have obtained explicit, verifiable consent from the legal property owner to submit this residential property for verification on their behalf.';

export const CANONICAL_OWNER_DECLARATION_VERSION = 'v1.0';
export const CANONICAL_PARTNER_ATTESTATION_VERSION = 'v1.0';
export const CANONICAL_ATTESTATION_VERSION = 'v1.0';

export const MIN_SUBMISSION_PHOTOS = 3;
export const MAX_SUBMISSION_PHOTOS = 15;
export const MAX_SUBMISSION_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export const ALLOWED_SUBMISSION_IMAGE_MIMES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/avif',
] as const;

export const SUBMISSION_PHOTO_CATEGORIES = [
  'Living Room',
  'Master Bedroom',
  'Kitchen',
  'Balcony / View',
  'Building Exterior',
  'Plot View',
  'Interior',
  'Bathroom',
  'Amenities',
  'Floor Plan',
  'Property',
  'Other',
] as const;

export type SubmissionPhotoCategory = (typeof SUBMISSION_PHOTO_CATEGORIES)[number];

export function normalizeSubmissionPhotoCategory(rawCategory?: string | null): string {
  const trimmed = (rawCategory || '').trim();
  if (!trimmed) return 'Living Room';
  const matched = SUBMISSION_PHOTO_CATEGORIES.find(
    (c) => c.toLowerCase() === trimmed.toLowerCase()
  );
  if (matched) return matched;
  // Disallow dangerous/bypass category names such as LOGO, AVATAR, DOCUMENT, BROCHURE
  const upper = trimmed.toUpperCase();
  if (
    upper.includes('LOGO') ||
    upper === 'AVATAR' ||
    upper === 'PROFILE' ||
    upper === 'BRAND' ||
    upper === 'DOCUMENT' ||
    upper === 'BROCHURE' ||
    upper === 'VIDEO'
  ) {
    return 'Property';
  }
  return trimmed.slice(0, 60);
}

export function getCanonicalDeclarationForSource(listingSource: ListingSource): {
  declarationText: string;
  attestationVersion: string;
} {
  if (listingSource === 'OWNER') {
    if (!CANONICAL_OWNER_DECLARATION_TEXT.trim() || !CANONICAL_OWNER_DECLARATION_VERSION.trim()) {
      throw new Error('Server canonical owner declaration configuration is missing or invalid.');
    }
    return {
      declarationText: CANONICAL_OWNER_DECLARATION_TEXT,
      attestationVersion: CANONICAL_OWNER_DECLARATION_VERSION,
    };
  }

  if (listingSource === 'PARTNER') {
    if (!CANONICAL_PARTNER_ATTESTATION_TEXT.trim() || !CANONICAL_PARTNER_ATTESTATION_VERSION.trim()) {
      throw new Error('Server canonical partner attestation configuration is missing or invalid.');
    }
    return {
      declarationText: CANONICAL_PARTNER_ATTESTATION_TEXT,
      attestationVersion: CANONICAL_PARTNER_ATTESTATION_VERSION,
    };
  }

  throw new Error(`Unsupported listing source for canonical declaration: ${String(listingSource)}`);
}

const FORBIDDEN_MEDIA_EXTENSION_REGEX = /\.(mp4|mov|avi|webm|mkv|m4v|pdf|doc|docx|xls|xlsx|ppt|pptx|zip|rar|svg)(\?.*)?$/i;
const FORBIDDEN_MEDIA_MIME_REGEX = /^(video|application|audio|text)\//i;
const ALLOWED_IMAGE_MIME_REGEX = /^image\/(jpeg|jpg|png|webp|avif)$/i;
const PERSISTED_SUBMISSION_PATH_REGEX = /^\/media\/submission\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+\/(public_wm\.webp|[^/?#]+\.(webp|jpg|jpeg|png|avif))$/i;

function getAllowedPersistedMediaOrigins(): Set<string> {
  const origins = new Set<string>([
    'https://pub-8e680bcad96e4b29adac1756755a344b.r2.dev',
    'https://media.greathomes.co.in',
  ]);
  const envBases = [
    process.env.MEDIA_PUBLIC_BASE_URL,
    process.env.NEXT_PUBLIC_MEDIA_BASE_URL,
    process.env.S3_PUBLIC_URL,
  ];
  for (const base of envBases) {
    if (!base) continue;
    try {
      const parsed = new URL(base.trim());
      if (parsed.protocol === 'https:') {
        origins.add(parsed.origin);
      }
    } catch {
      // Ignore malformed env values
    }
  }
  return origins;
}

/**
 * Validates that a submission photo URL references a server-persisted Great Homes
 * submission image object rather than an inline Base64 data URI, external third-party URL,
 * video, or document.
 */
export function isValidPersistedSubmissionPhotoUrl(
  url: string,
  mimeType?: string | null
): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed) return false;

  if (mimeType) {
    if (FORBIDDEN_MEDIA_MIME_REGEX.test(mimeType)) return false;
    if (mimeType.toLowerCase().trim() === 'image/svg+xml') return false;
    if (!ALLOWED_IMAGE_MIME_REGEX.test(mimeType)) return false;
  }

  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith('data:') ||
    lower.startsWith('blob:') ||
    lower.startsWith('javascript:') ||
    lower.startsWith('vbscript:')
  ) {
    return false;
  }

  if (trimmed.includes('..') || trimmed.includes('\\')) {
    return false;
  }

  if (FORBIDDEN_MEDIA_EXTENSION_REGEX.test(trimmed)) {
    return false;
  }

  // Local /uploads/media/submission/... paths permitted only in local dev / test sandbox
  if (trimmed.startsWith('/uploads/media/submission/')) {
    const isProduction = process.env.NODE_ENV === 'production';
    const localAllowed =
      !isProduction ||
      process.env.MEDIA_TEST_ISOLATED === 'true' ||
      process.env.ALLOW_LOCAL_STORAGE_IN_PRODUCTION === 'true';
    if (!localAllowed) {
      return false;
    }
    const strippedUploads = trimmed.slice('/uploads'.length);
    return PERSISTED_SUBMISSION_PATH_REGEX.test(strippedUploads);
  }

  if (trimmed.startsWith('/')) {
    return false;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:') {
      return false;
    }
    const allowedOrigins = getAllowedPersistedMediaOrigins();
    if (!allowedOrigins.has(parsed.origin)) {
      return false;
    }
    return PERSISTED_SUBMISSION_PATH_REGEX.test(parsed.pathname);
  } catch {
    return false;
  }
}

export function sanitizeInternalRedirectPath(
  rawPath: string | null | undefined,
  fallback: string = '/post-property'
): string {
  if (!rawPath || typeof rawPath !== 'string') return fallback;
  const trimmed = rawPath.trim();
  if (!trimmed.startsWith('/')) return fallback;
  if (trimmed.startsWith('//') || trimmed.startsWith('/\\')) return fallback;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) return fallback;
  if (trimmed.includes('\0') || trimmed.includes('\r') || trimmed.includes('\n')) return fallback;
  return trimmed;
}

export const LEASE_DURATION_OPTIONS = [
  '6 Months',
  '11 Months',
  '12 Months',
  '24 Months',
  '36 Months',
] as const;

export const NOTICE_PERIOD_OPTIONS = [
  '15 Days',
  '1 Month',
  '2 Months',
  '3 Months',
] as const;

export type LeaseDurationOption = (typeof LEASE_DURATION_OPTIONS)[number];
export type NoticePeriodOption = (typeof NOTICE_PERIOD_OPTIONS)[number];

export interface CanonicalAmenityDefinition {
  slug: string;
  name: string;
  category:
    | 'OUTDOOR'
    | 'INDOOR'
    | 'CLUBHOUSE'
    | 'COMMUNITY'
    | 'FITNESS'
    | 'WELLNESS'
    | 'SECURITY'
    | 'ECO'
    | 'GENERAL';
  icon: string;
  applicablePropertyTypes: readonly SubmissionPropertyType[];
}

export const CANONICAL_RESIDENTIAL_AMENITIES: readonly CanonicalAmenityDefinition[] = [
  {
    slug: 'fitness-center',
    name: 'Fitness Center / Gymnasium',
    category: 'FITNESS',
    icon: 'dumbbell',
    applicablePropertyTypes: ['APARTMENT', 'INDEPENDENT_HOUSE'],
  },
  {
    slug: 'swimming-pool',
    name: 'Swimming Pool',
    category: 'WELLNESS',
    icon: 'waves',
    applicablePropertyTypes: ['APARTMENT', 'INDEPENDENT_HOUSE'],
  },
  {
    slug: 'clubhouse',
    name: 'Clubhouse',
    category: 'COMMUNITY',
    icon: 'building',
    applicablePropertyTypes: ['APARTMENT', 'INDEPENDENT_HOUSE', 'PLOT'],
  },
  {
    slug: 'landscaped-gardens',
    name: 'Landscaped Gardens',
    category: 'OUTDOOR',
    icon: 'trees',
    applicablePropertyTypes: ['APARTMENT', 'INDEPENDENT_HOUSE', 'PLOT'],
  },
  {
    slug: 'power-backup',
    name: '24x7 Power Backup',
    category: 'GENERAL',
    icon: 'zap',
    applicablePropertyTypes: ['APARTMENT', 'INDEPENDENT_HOUSE'],
  },
  {
    slug: 'security-cctv',
    name: '24x7 Security & CCTV',
    category: 'SECURITY',
    icon: 'shield-check',
    applicablePropertyTypes: ['APARTMENT', 'INDEPENDENT_HOUSE', 'PLOT'],
  },
  {
    slug: 'lift-elevator',
    name: 'Elevator / Lift',
    category: 'INDOOR',
    icon: 'arrow-up-down',
    applicablePropertyTypes: ['APARTMENT'],
  },
  {
    slug: 'intercom',
    name: 'Intercom Facility',
    category: 'SECURITY',
    icon: 'phone',
    applicablePropertyTypes: ['APARTMENT', 'INDEPENDENT_HOUSE'],
  },
  {
    slug: 'visitor-parking',
    name: 'Visitor Parking',
    category: 'GENERAL',
    icon: 'car',
    applicablePropertyTypes: ['APARTMENT', 'INDEPENDENT_HOUSE', 'PLOT'],
  },
  {
    slug: 'children-play-area',
    name: "Children's Play Area",
    category: 'OUTDOOR',
    icon: 'sparkles',
    applicablePropertyTypes: ['APARTMENT', 'INDEPENDENT_HOUSE', 'PLOT'],
  },
  {
    slug: 'rainwater-harvesting',
    name: 'Rainwater Harvesting',
    category: 'ECO',
    icon: 'droplets',
    applicablePropertyTypes: ['APARTMENT', 'INDEPENDENT_HOUSE', 'PLOT'],
  },
  {
    slug: 'fire-safety',
    name: 'Fire Safety Systems',
    category: 'SECURITY',
    icon: 'flame',
    applicablePropertyTypes: ['APARTMENT', 'INDEPENDENT_HOUSE'],
  },
] as const;

export const CANONICAL_AMENITY_SLUG_SET = new Set<string>(
  CANONICAL_RESIDENTIAL_AMENITIES.map((a) => a.slug)
);

export function getCanonicalAmenitiesForPropertyType(
  propertyType?: SubmissionPropertyType | null
): CanonicalAmenityDefinition[] {
  if (!propertyType) return [...CANONICAL_RESIDENTIAL_AMENITIES];
  return CANONICAL_RESIDENTIAL_AMENITIES.filter((a) =>
    a.applicablePropertyTypes.includes(propertyType)
  );
}

const ISO_DATE_STRING_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function isValidIsoCalendarDate(value: string): boolean {
  if (!ISO_DATE_STRING_REGEX.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.toISOString().slice(0, 10) === value;
}

export const isoDateFieldSchema = z
  .string()
  .trim()
  .refine((val) => isValidIsoCalendarDate(val), {
    message: 'Date must be a valid YYYY-MM-DD calendar date.',
  });

export const leaseDurationSchema = z.enum(LEASE_DURATION_OPTIONS, {
  error: `Lease duration must be one of: ${LEASE_DURATION_OPTIONS.join(', ')}.`,
});

export const noticePeriodSchema = z.enum(NOTICE_PERIOD_OPTIONS, {
  error: `Notice period must be one of: ${NOTICE_PERIOD_OPTIONS.join(', ')}.`,
});

export const locationPayloadSchema = z.object({
  city: z.string().min(1, 'City is required').default('Kolkata'),
  locality: z.string().min(1, 'Locality is required'),
  locationId: z.string().optional().nullable(),
  address: z.string().min(1, 'Address is required'),
  projectId: z.string().uuid().optional().nullable(),
  projectName: z.string().optional().nullable(),
  isCustomLocality: z.boolean().optional().default(false),
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
});

export interface AreaHierarchyValidationResult {
  valid: boolean;
  fieldErrors: Record<string, string>;
  errors: string[];
}

export function validateAreaHierarchy(details?: {
  carpetArea?: number | null;
  builtUpArea?: number | null;
  superBuiltUpArea?: number | null;
} | null): AreaHierarchyValidationResult {
  const fieldErrors: Record<string, string> = {};
  const errors: string[] = [];

  if (!details) {
    return { valid: true, fieldErrors, errors };
  }

  const carpet =
    typeof details.carpetArea === 'number' && Number.isFinite(details.carpetArea)
      ? details.carpetArea
      : null;
  const builtUp =
    typeof details.builtUpArea === 'number' && Number.isFinite(details.builtUpArea)
      ? details.builtUpArea
      : null;
  const superBuiltUp =
    typeof details.superBuiltUpArea === 'number' && Number.isFinite(details.superBuiltUpArea)
      ? details.superBuiltUpArea
      : null;

  if (carpet !== null && builtUp !== null && carpet > builtUp) {
    const msg = 'Built-up area must be greater than or equal to carpet area.';
    fieldErrors['details.builtUpArea'] = msg;
    fieldErrors['details.carpetArea'] = 'Carpet area cannot exceed built-up area.';
    errors.push(msg);
  }

  if (builtUp !== null && superBuiltUp !== null && builtUp > superBuiltUp) {
    const msg = 'Super built-up area must be greater than or equal to built-up area.';
    fieldErrors['details.superBuiltUpArea'] = msg;
    if (!fieldErrors['details.builtUpArea']) {
      fieldErrors['details.builtUpArea'] = 'Built-up area cannot exceed super built-up area.';
    }
    errors.push(msg);
  }

  if (carpet !== null && superBuiltUp !== null && carpet > superBuiltUp) {
    const msg = 'Super built-up area must be greater than or equal to carpet area.';
    if (!fieldErrors['details.superBuiltUpArea']) {
      fieldErrors['details.superBuiltUpArea'] = msg;
    }
    if (!fieldErrors['details.carpetArea']) {
      fieldErrors['details.carpetArea'] = 'Carpet area cannot exceed super built-up area.';
    }
    if (builtUp === null) {
      errors.push(msg);
    }
  }

  return {
    valid: errors.length === 0,
    fieldErrors,
    errors,
  };
}

export const propertyDetailsPayloadSchema = z
  .object({
    configuration: z.string().optional().nullable(),
    bedroomCount: z.number().int().min(0).max(10).optional().nullable(),
    bathroomCount: z.number().int().min(0).max(10).optional().nullable(),
    balconies: z
      .number()
      .int('Balconies must be a whole number.')
      .min(0, 'Balconies cannot be negative.')
      .max(10, 'Balconies cannot exceed 10.')
      .optional()
      .nullable(),
    coveredParking: z
      .number()
      .int('Covered parking count must be a whole number.')
      .min(0, 'Covered parking count cannot be negative.')
      .max(10, 'Covered parking count cannot exceed 10.')
      .optional()
      .nullable(),
    openParking: z
      .number()
      .int('Open parking count must be a whole number.')
      .min(0, 'Open parking count cannot be negative.')
      .max(10, 'Open parking count cannot exceed 10.')
      .optional()
      .nullable(),
    propertyAgeYears: z
      .number()
      .int('Property age must be a whole number of years.')
      .min(0, 'Property age cannot be negative.')
      .max(100, 'Property age cannot exceed 100 years.')
      .optional()
      .nullable(),
    carpetArea: z.number().positive('Carpet area must be positive').max(100000).optional().nullable(),
    builtUpArea: z.number().positive('Built-up area must be positive').max(100000).optional().nullable(),
    superBuiltUpArea: z
      .number()
      .positive('Super built-up area must be positive')
      .max(100000)
      .optional()
      .nullable(),
    plotArea: z.number().positive('Plot area must be positive').max(500000).optional().nullable(),
    askingPrice: z.number().positive('Asking price must be positive').optional().nullable(),
    monthlyRent: z.number().positive('Monthly rent must be positive').optional().nullable(),
    securityDeposit: z.number().nonnegative().optional().nullable(),
    maintenance: z.number().nonnegative().optional().nullable(),
    furnishing: z.string().optional().nullable(),
    facing: z.string().optional().nullable(),
    floorCategory: z.string().optional().nullable(),
    totalFloors: z.number().int().min(1).max(120).optional().nullable(),
    possession: z.string().optional().nullable(),
    possessionDate: isoDateFieldSchema.optional().nullable(),
    availabilityDate: isoDateFieldSchema.optional().nullable(),
    leaseDuration: leaseDurationSchema.optional().nullable(),
    noticePeriod: noticePeriodSchema.optional().nullable(),
    amenities: z
      .array(z.string().trim().min(1, 'Amenity identifier cannot be empty.'))
      .max(30, 'Too many amenities selected.')
      .optional()
      .nullable(),
    description: z.string().max(2000).optional().nullable(),
  })
  .superRefine((details, ctx) => {
    const areaCheck = validateAreaHierarchy(details);
    if (!areaCheck.valid) {
      if (areaCheck.fieldErrors['details.builtUpArea']) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['builtUpArea'],
          message: areaCheck.fieldErrors['details.builtUpArea'],
        });
      }
      if (areaCheck.fieldErrors['details.superBuiltUpArea']) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['superBuiltUpArea'],
          message: areaCheck.fieldErrors['details.superBuiltUpArea'],
        });
      }
      if (
        !areaCheck.fieldErrors['details.builtUpArea'] &&
        !areaCheck.fieldErrors['details.superBuiltUpArea'] &&
        areaCheck.errors[0]
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['carpetArea'],
          message: areaCheck.errors[0],
        });
      }
    }
  });

export const photoItemSchema = z
  .object({
    id: z.string().min(1, 'Photo ID is required'),
    url: z.string().min(1, 'Photo URL is required'),
    mimeType: z.string().optional().nullable(),
    filename: z.string().optional().nullable(),
    category: z.string().default('Living Room'),
    caption: z.string().max(200).optional().nullable(),
    sortOrder: z.number().int().min(0).default(0),
    isFeatured: z.boolean().default(false),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    fileSizeBytes: z.number().int().positive().optional(),
    watermarkApplied: z.boolean().optional(),
    storageKey: z.string().optional(),
  })
  .refine((item) => isValidPersistedSubmissionPhotoUrl(item.url, item.mimeType), {
    message:
      'Only server-uploaded Great Homes submission photographs (JPEG, PNG, WebP, AVIF) are permitted. Inline Base64 data URIs, external URLs, videos, and documents are strictly prohibited.',
  });

export type SubmissionPhotoItem = z.infer<typeof photoItemSchema>;

export const reorderSubmissionPhotosSchema = z.object({
  photoIds: z
    .array(z.string().trim().min(1, 'Photo ID cannot be empty.'))
    .min(1, 'At least one photo ID is required for reordering.')
    .max(MAX_SUBMISSION_PHOTOS, `Maximum ${MAX_SUBMISSION_PHOTOS} photographs can be ordered.`)
    .refine((ids) => new Set(ids).size === ids.length, {
      message: 'Duplicate photo IDs are not permitted when reordering.',
    }),
});

export const updateSubmissionPhotoMetadataSchema = z
  .object({
    isFeatured: z.boolean().optional(),
    category: z.string().trim().min(1, 'Category cannot be empty.').max(60).optional(),
    caption: z.string().trim().max(200, 'Caption cannot exceed 200 characters.').optional().nullable(),
  })
  .refine(
    (val) =>
      val.isFeatured !== undefined || val.category !== undefined || val.caption !== undefined,
    { message: 'At least one photo field (isFeatured, category, or caption) must be provided.' }
  );

export const consentPayloadSchema = z.object({
  ownerDeclarationAccepted: z.boolean().optional(),
  partnerAttestationAccepted: z.boolean().optional(),
  declarationText: z.string().optional(),
  attestationVersion: z.string().default(CANONICAL_ATTESTATION_VERSION),
  acceptedByCustomerId: z.string().optional(),
  acceptedAt: z.string().optional(),
});

export interface ConditionalPayloadValidationResult {
  valid: boolean;
  errors: Array<{ path?: string; message: string }>;
  fieldErrors: Record<string, string>;
}

/**
 * Validates property-type and listing-purpose conditional rules as well as cross-field area rules
 * against a complete or merged submission payload.
 */
export function validateConditionalPropertyRules(
  payload: Partial<PropertySubmissionPayload> | Record<string, unknown>,
  options?: { allowedAmenityIdentifiers?: Set<string> }
): ConditionalPayloadValidationResult {
  const errors: Array<{ path?: string; message: string }> = [];
  const fieldErrors: Record<string, string> = {};

  const recordError = (path: string, message: string) => {
    errors.push({ path, message });
    if (!fieldErrors[path]) {
      fieldErrors[path] = message;
    }
  };

  const propType = payload.propertyType as SubmissionPropertyType | undefined;
  const listType = payload.listingType as ListingType | undefined;
  const loc = payload.location as
    | {
        locationId?: string | null;
        projectId?: string | null;
        isCustomLocality?: boolean;
      }
    | undefined;
  const details = (payload.details || undefined) as
    | z.infer<typeof propertyDetailsPayloadSchema>
    | undefined;

  if (loc?.isCustomLocality && loc?.projectId) {
    recordError(
      'location.projectId',
      'A verified project cannot be linked when using a custom locality. Please clear the project selection or select a verified locality.'
    );
  }

  if (details) {
    // 1. Cross-field area hierarchy check
    const areaCheck = validateAreaHierarchy(details);
    if (!areaCheck.valid) {
      for (const [key, msg] of Object.entries(areaCheck.fieldErrors)) {
        fieldErrors[key] = msg;
      }
      for (const msg of areaCheck.errors) {
        errors.push({ path: 'details', message: msg });
      }
    }

    // 2. Listing-purpose conditional rules (RESALE vs RENTAL)
    if (listType === 'RESALE') {
      if (details.monthlyRent !== undefined && details.monthlyRent !== null) {
        recordError(
          'details.monthlyRent',
          'Monthly rent is only applicable to RENTAL submissions.'
        );
      }
      if (details.securityDeposit !== undefined && details.securityDeposit !== null) {
        recordError(
          'details.securityDeposit',
          'Security deposit is only applicable to RENTAL submissions.'
        );
      }
      if (details.leaseDuration !== undefined && details.leaseDuration !== null) {
        recordError(
          'details.leaseDuration',
          'Lease duration is only applicable to RENTAL submissions.'
        );
      }
      if (details.noticePeriod !== undefined && details.noticePeriod !== null) {
        recordError(
          'details.noticePeriod',
          'Notice period is only applicable to RENTAL submissions.'
        );
      }
      if (details.availabilityDate !== undefined && details.availabilityDate !== null) {
        recordError(
          'details.availabilityDate',
          'Availability date is only applicable to RENTAL submissions.'
        );
      }
    } else if (listType === 'RENTAL') {
      if (details.askingPrice !== undefined && details.askingPrice !== null) {
        recordError(
          'details.askingPrice',
          'Asking price is only applicable to RESALE submissions.'
        );
      }
      if (details.possessionDate !== undefined && details.possessionDate !== null) {
        recordError(
          'details.possessionDate',
          'Possession date is only applicable to RESALE submissions.'
        );
      }
    }

    // 3. Property-type conditional rules (PLOT vs APARTMENT / INDEPENDENT_HOUSE)
    if (propType === 'PLOT') {
      if (details.bedroomCount !== undefined && details.bedroomCount !== null) {
        recordError(
          'details.bedroomCount',
          'Bedroom count is not applicable to residential plots.'
        );
      }
      if (details.bathroomCount !== undefined && details.bathroomCount !== null) {
        recordError(
          'details.bathroomCount',
          'Bathroom count is not applicable to residential plots.'
        );
      }
      if (details.balconies !== undefined && details.balconies !== null) {
        recordError('details.balconies', 'Balcony count is not applicable to residential plots.');
      }
      if (details.floorCategory !== undefined && details.floorCategory !== null) {
        recordError(
          'details.floorCategory',
          'Floor category is not applicable to residential plots.'
        );
      }
      if (details.totalFloors !== undefined && details.totalFloors !== null) {
        recordError(
          'details.totalFloors',
          'Total building floors is not applicable to residential plots.'
        );
      }
      if (details.furnishing !== undefined && details.furnishing !== null) {
        recordError(
          'details.furnishing',
          'Furnishing status is not applicable to residential plots.'
        );
      }
      if (details.carpetArea !== undefined && details.carpetArea !== null) {
        recordError('details.carpetArea', 'Carpet area is not applicable to residential plots.');
      }
      if (details.builtUpArea !== undefined && details.builtUpArea !== null) {
        recordError('details.builtUpArea', 'Built-up area is not applicable to residential plots.');
      }
      if (details.superBuiltUpArea !== undefined && details.superBuiltUpArea !== null) {
        recordError(
          'details.superBuiltUpArea',
          'Super built-up area is not applicable to residential plots.'
        );
      }
      if (details.coveredParking !== undefined && details.coveredParking !== null) {
        recordError(
          'details.coveredParking',
          'Covered parking is not applicable to residential plots.'
        );
      }
      if (details.openParking !== undefined && details.openParking !== null) {
        recordError('details.openParking', 'Open parking is not applicable to residential plots.');
      }
      if (details.propertyAgeYears !== undefined && details.propertyAgeYears !== null) {
        recordError(
          'details.propertyAgeYears',
          'Building age is not applicable to residential plots.'
        );
      }
    }

    // 4. Structured amenities validation (canonical identifiers only, no arbitrary free-text)
    if (Array.isArray(details.amenities) && details.amenities.length > 0) {
      const allowedSet = options?.allowedAmenityIdentifiers || CANONICAL_AMENITY_SLUG_SET;
      const applicableForType = propType
        ? new Set(getCanonicalAmenitiesForPropertyType(propType).map((a) => a.slug))
        : null;

      for (const amenityIdentifier of details.amenities) {
        if (!allowedSet.has(amenityIdentifier)) {
          recordError(
            'details.amenities',
            `Invalid amenity "${amenityIdentifier}". Only canonical Great Homes amenities are permitted.`
          );
          break;
        }
        if (
          applicableForType &&
          CANONICAL_AMENITY_SLUG_SET.has(amenityIdentifier) &&
          !applicableForType.has(amenityIdentifier)
        ) {
          recordError(
            'details.amenities',
            `Amenity "${amenityIdentifier}" is not applicable to property type ${propType}.`
          );
          break;
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    fieldErrors,
  };
}

export const propertySubmissionPayloadSchema = z.object({
  listingType: listingTypeSchema,
  listingSource: listingSourceSchema,
  propertyType: propertyTypeSchema,
  location: locationPayloadSchema.optional(),
  details: propertyDetailsPayloadSchema.optional(),
  photos: z
    .array(photoItemSchema)
    .max(MAX_SUBMISSION_PHOTOS, `Maximum ${MAX_SUBMISSION_PHOTOS} property photographs are permitted.`)
    .default([]),
  consent: consentPayloadSchema.optional(),
});

export type PropertySubmissionPayload = z.infer<typeof propertySubmissionPayloadSchema>;

export const locationPatchSchema = z.object({
  city: z.string().optional(),
  locality: z.string().optional(),
  locationId: z.string().optional().nullable(),
  address: z.string().optional(),
  projectId: z.string().uuid().optional().nullable(),
  projectName: z.string().optional().nullable(),
  isCustomLocality: z.boolean().optional(),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
});

const submissionPhotosPatchSchema = z
  .array(photoItemSchema)
  .max(MAX_SUBMISSION_PHOTOS, `Maximum ${MAX_SUBMISSION_PHOTOS} property photographs are permitted.`)
  .optional();

export const createSubmissionSchema = z.object({
  listingType: listingTypeSchema,
  listingSource: listingSourceSchema,
  payload: propertySubmissionPayloadSchema
    .omit({ photos: true, location: true })
    .partial()
    .extend({
      location: locationPatchSchema.optional(),
      photos: submissionPhotosPatchSchema,
    })
    .default({}),
});

export const updateSubmissionSchema = z.object({
  expectedVersion: z.number().int().positive().optional(),
  payload: propertySubmissionPayloadSchema
    .omit({ photos: true, location: true })
    .partial()
    .extend({
      location: locationPatchSchema.optional(),
      photos: submissionPhotosPatchSchema,
    }),
});

export function mergeSubmissionPayloads(
  existingPayload: Record<string, unknown>,
  patchPayload: Record<string, unknown>
): Record<string, unknown> {
  const existingLocation =
    typeof existingPayload.location === 'object' && existingPayload.location !== null
      ? (existingPayload.location as Record<string, unknown>)
      : undefined;
  const patchLocation =
    typeof patchPayload.location === 'object' && patchPayload.location !== null
      ? (patchPayload.location as Record<string, unknown>)
      : undefined;

  const existingDetails =
    typeof existingPayload.details === 'object' && existingPayload.details !== null
      ? (existingPayload.details as Record<string, unknown>)
      : undefined;
  const patchDetails =
    typeof patchPayload.details === 'object' && patchPayload.details !== null
      ? (patchPayload.details as Record<string, unknown>)
      : undefined;

  const existingConsent =
    typeof existingPayload.consent === 'object' && existingPayload.consent !== null
      ? (existingPayload.consent as Record<string, unknown>)
      : undefined;
  const patchConsent =
    typeof patchPayload.consent === 'object' && patchPayload.consent !== null
      ? (patchPayload.consent as Record<string, unknown>)
      : undefined;

  const merged: Record<string, unknown> = {
    ...existingPayload,
    ...patchPayload,
  };

  if (existingLocation || patchLocation) {
    merged.location = {
      ...(existingLocation || {}),
      ...(patchLocation || {}),
    };
  }

  if (existingDetails || patchDetails) {
    const mergedDetails: Record<string, unknown> = {
      ...(existingDetails || {}),
      ...(patchDetails || {}),
    };

    const effectivePropertyType =
      typeof merged.propertyType === 'string' ? merged.propertyType : undefined;
    const effectiveListingType =
      typeof merged.listingType === 'string' ? merged.listingType : undefined;
    const hasExplicitPatchKey = (key: string) =>
      Boolean(patchDetails && Object.prototype.hasOwnProperty.call(patchDetails, key));

    if (effectivePropertyType === 'PLOT') {
      const plotIncompatibleKeys = [
        'bedroomCount',
        'bathroomCount',
        'balconies',
        'floorCategory',
        'totalFloors',
        'furnishing',
        'carpetArea',
        'builtUpArea',
        'superBuiltUpArea',
        'coveredParking',
        'openParking',
        'propertyAgeYears',
      ];
      for (const key of plotIncompatibleKeys) {
        if (!hasExplicitPatchKey(key)) {
          delete mergedDetails[key];
        }
      }
    } else if (effectivePropertyType === 'INDEPENDENT_HOUSE') {
      if (!hasExplicitPatchKey('floorCategory')) {
        delete mergedDetails.floorCategory;
      }
    }

    if (effectiveListingType === 'RESALE') {
      for (const key of [
        'monthlyRent',
        'securityDeposit',
        'leaseDuration',
        'noticePeriod',
        'availabilityDate',
      ]) {
        if (!hasExplicitPatchKey(key)) {
          delete mergedDetails[key];
        }
      }
    } else if (effectiveListingType === 'RENTAL') {
      for (const key of ['askingPrice', 'possessionDate']) {
        if (!hasExplicitPatchKey(key)) {
          delete mergedDetails[key];
        }
      }
    }

    merged.details = mergedDetails;
  }

  if (existingConsent || patchConsent) {
    merged.consent = {
      ...(existingConsent || {}),
      ...(patchConsent || {}),
    };
  }

  if (patchPayload.photos === undefined && existingPayload.photos !== undefined) {
    merged.photos = existingPayload.photos;
  }

  return merged;
}

export interface StepValidationResult {
  valid: boolean;
  errors: string[];
  fieldErrors?: Record<string, string>;
}

export function validateWizardStep(
  step: 1 | 2 | 3 | 4 | 5 | 6,
  payload: Partial<PropertySubmissionPayload> | any
): StepValidationResult {
  const errors: string[] = [];
  const fieldErrors: Record<string, string> = {};
  if (!payload || typeof payload !== 'object') {
    return { valid: false, errors: ['Submission data is required.'] };
  }

  if (step === 1) {
    if (!listingTypeSchema.safeParse(payload.listingType).success) {
      errors.push('Please select a valid listing purpose (Resale or Rental).');
    }
    if (!propertyTypeSchema.safeParse(payload.propertyType).success) {
      errors.push('Please select a valid property type (Apartment, Independent House, or Plot).');
    }
    if (!listingSourceSchema.safeParse(payload.listingSource).success) {
      errors.push('Please select a valid submission source (Owner or Partner).');
    }
    return { valid: errors.length === 0, errors, fieldErrors };
  }

  if (step === 2) {
    const loc = payload.location;
    if (!loc?.city || !String(loc.city).trim()) {
      errors.push('City is required.');
      fieldErrors['location.city'] = 'City is required.';
    }
    if (!loc?.locality || !String(loc.locality).trim()) {
      errors.push('Locality is required.');
      fieldErrors['location.locality'] = 'Locality is required.';
    }
    if (!loc?.address || String(loc.address).trim().length < 3) {
      errors.push('Complete street address or landmark is required.');
      fieldErrors['location.address'] = 'Complete street address or landmark is required.';
    }
    if (loc?.isCustomLocality && loc?.projectId) {
      const msg =
        'A verified project cannot be linked when using a custom locality. Please clear the project selection or select a verified locality.';
      errors.push(msg);
      fieldErrors['location.projectId'] = msg;
    }
    return { valid: errors.length === 0, errors, fieldErrors };
  }

  if (step === 3) {
    const details = payload.details || {};
    const propType = payload.propertyType;
    const listType = payload.listingType;

    // Validate structured detail schema fields first
    const detailsSchemaResult = propertyDetailsPayloadSchema.safeParse(details);
    if (!detailsSchemaResult.success) {
      const issues =
        (detailsSchemaResult.error as {
          issues?: Array<{ path?: Array<string | number>; message: string }>;
        }).issues || [];
      for (const issue of issues) {
        const key = issue.path?.length ? `details.${issue.path.join('.')}` : 'details';
        if (!fieldErrors[key]) {
          fieldErrors[key] = issue.message;
        }
        if (!errors.includes(issue.message)) {
          errors.push(issue.message);
        }
      }
    }

    if (propType === 'PLOT') {
      const area = Number(details.plotArea || details.carpetArea || 0);
      if (!Number.isFinite(area) || area <= 0) {
        const msg = 'Plot area (sq. ft.) must be a positive number.';
        errors.push(msg);
        fieldErrors['details.plotArea'] = msg;
      }
    } else {
      const beds = Number(details.bedroomCount ?? 0);
      if (!Number.isInteger(beds) || beds < 1) {
        const msg = 'Bedroom count is required for apartments and independent houses.';
        errors.push(msg);
        fieldErrors['details.bedroomCount'] = msg;
      }
      const area = Number(
        details.carpetArea || details.builtUpArea || details.superBuiltUpArea || 0
      );
      if (!Number.isFinite(area) || area <= 0) {
        const msg = 'Carpet area or built-up area (sq. ft.) must be a positive number.';
        errors.push(msg);
        fieldErrors['details.carpetArea'] = msg;
      }

      const areaHierarchy = validateAreaHierarchy(details);
      if (!areaHierarchy.valid) {
        for (const [key, msg] of Object.entries(areaHierarchy.fieldErrors)) {
          if (!fieldErrors[key]) fieldErrors[key] = msg;
        }
        for (const msg of areaHierarchy.errors) {
          if (!errors.includes(msg)) errors.push(msg);
        }
      }
    }

    if (listType === 'RESALE') {
      const price = Number(details.askingPrice || 0);
      if (!Number.isFinite(price) || price <= 0) {
        const msg = 'Asking price is required for resale properties.';
        errors.push(msg);
        fieldErrors['details.askingPrice'] = msg;
      }
    } else if (listType === 'RENTAL') {
      const rent = Number(details.monthlyRent || 0);
      if (!Number.isFinite(rent) || rent <= 0) {
        const msg = 'Monthly rent is required for rental properties.';
        errors.push(msg);
        fieldErrors['details.monthlyRent'] = msg;
      }
    }

    const conditionalResult = validateConditionalPropertyRules({
      listingType: listType,
      propertyType: propType,
      details,
    });
    if (!conditionalResult.valid) {
      for (const [key, msg] of Object.entries(conditionalResult.fieldErrors)) {
        if (!fieldErrors[key]) fieldErrors[key] = msg;
      }
      for (const err of conditionalResult.errors) {
        if (!errors.includes(err.message)) errors.push(err.message);
      }
    }

    return { valid: errors.length === 0, errors, fieldErrors };
  }

  if (step === 4) {
    const photos = Array.isArray(payload.photos) ? payload.photos : [];
    if (photos.length < MIN_SUBMISSION_PHOTOS) {
      errors.push('Minimum 3 property photographs are required before continuing.');
    }
    if (photos.length > MAX_SUBMISSION_PHOTOS) {
      errors.push(`Maximum ${MAX_SUBMISSION_PHOTOS} property photographs are permitted.`);
    }
    for (const p of photos) {
      const parsedPhoto = photoItemSchema.safeParse(p);
      if (!parsedPhoto.success) {
        const issues = (parsedPhoto.error as any).issues || (parsedPhoto.error as any).errors || [];
        errors.push(
          issues[0]?.message ||
            'Only server-uploaded Great Homes submission photographs (JPEG, PNG, WebP, AVIF) are permitted. Inline Base64 data URIs, external URLs, videos, and documents are strictly prohibited.'
        );
        break;
      }
    }
    return { valid: errors.length === 0, errors, fieldErrors };
  }

  if (step === 5) {
    const consent = payload.consent || {};
    if (payload.listingSource === 'OWNER' && !consent.ownerDeclarationAccepted) {
      errors.push('Owner authority declaration must be confirmed before proceeding.');
    }
    if (payload.listingSource === 'PARTNER' && !consent.partnerAttestationAccepted) {
      errors.push('Partner owner-consent attestation must be confirmed before proceeding.');
    }
    return { valid: errors.length === 0, errors, fieldErrors };
  }

  if (step === 6) {
    const fullResult = validateSubmissionForSubmit(payload);
    if (!fullResult.success) {
      return {
        valid: false,
        errors: fullResult.errors?.map((e: any) => e.message) || ['Submission validation failed.'],
        fieldErrors: fullResult.fieldErrors,
      };
    }
    return { valid: true, errors: [], fieldErrors: {} };
  }

  return { valid: false, errors: ['Unknown wizard step.'] };
}

export function computeHighestReachedWizardStep(
  payload: Partial<PropertySubmissionPayload> | any,
  options?: {
    isReadOnly?: boolean;
    rawPersistedPayload?: Record<string, unknown> | null;
  }
): 1 | 2 | 3 | 4 | 5 | 6 {
  if (options?.isReadOnly) {
    return 6;
  }
  if (!payload || typeof payload !== 'object') {
    return 1;
  }

  if (
    options?.rawPersistedPayload &&
    !propertyTypeSchema.safeParse(options.rawPersistedPayload.propertyType).success
  ) {
    return 1;
  }

  if (!validateWizardStep(1, payload).valid) {
    return 1;
  }

  if (!validateWizardStep(2, payload).valid) {
    if (payload.listingSource === 'PARTNER') {
      return 1;
    }
    return 2;
  }

  if (!validateWizardStep(3, payload).valid) {
    return 3;
  }

  if (!validateWizardStep(4, payload).valid) {
    return 4;
  }

  if (!validateWizardStep(5, payload).valid) {
    return 5;
  }

  if (!validateWizardStep(6, payload).valid) {
    return 5;
  }

  return 6;
}

export function validateSubmissionForSubmit(
  payload: any,
  options?: { allowedAmenityIdentifiers?: Set<string> }
) {
  const result = propertySubmissionPayloadSchema.safeParse(payload);
  if (!result.success) {
    const issues = (result.error as any).issues || (result.error as any).errors || [];
    const fieldErrors: Record<string, string> = {};
    for (const issue of issues) {
      if (Array.isArray(issue.path) && issue.path.length > 0) {
        const key = issue.path.join('.');
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      }
    }
    return { success: false, errors: issues, fieldErrors };
  }

  const data = result.data;

  // Rule: Minimum 3 and Maximum 15 property photographs
  if (!data.photos || data.photos.length < MIN_SUBMISSION_PHOTOS) {
    return {
      success: false,
      errors: [{ message: 'Minimum 3 property photographs are required for final submission.' }],
    };
  }
  if (data.photos.length > MAX_SUBMISSION_PHOTOS) {
    return {
      success: false,
      errors: [{ message: `Maximum ${MAX_SUBMISSION_PHOTOS} property photographs are permitted.` }],
    };
  }

  // Rule: Location & Details required (must be non-empty after trimming whitespace)
  if (
    !data.location?.city?.trim() ||
    !data.location?.locality?.trim() ||
    !data.location?.address?.trim()
  ) {
    return {
      success: false,
      errors: [{ message: 'Complete location information (city, locality, address) is required.' }],
    };
  }

  // Rule: Conditional & Cross-field validation (areas, amenities, propertyType, listingType)
  const conditionalCheck = validateConditionalPropertyRules(data, options);
  if (!conditionalCheck.valid) {
    return {
      success: false,
      errors: conditionalCheck.errors,
      fieldErrors: conditionalCheck.fieldErrors,
    };
  }

  // Rule: Property details & pricing check
  const details = data.details || {};
  if (data.propertyType === 'PLOT') {
    const area = Number(details.plotArea || 0);
    if (!Number.isFinite(area) || area <= 0) {
      return {
        success: false,
        errors: [{ message: 'Plot area must be provided for plot submissions.' }],
        fieldErrors: { 'details.plotArea': 'Plot area must be provided for plot submissions.' },
      };
    }
  } else {
    const area = Number(details.carpetArea || details.builtUpArea || details.superBuiltUpArea || 0);
    if (!Number.isFinite(area) || area <= 0) {
      return {
        success: false,
        errors: [{ message: 'Carpet or built-up area is required for residential properties.' }],
        fieldErrors: {
          'details.carpetArea': 'Carpet or built-up area is required for residential properties.',
        },
      };
    }
  }

  if (data.listingType === 'RESALE') {
    const askingPrice = Number(details.askingPrice || 0);
    if (!Number.isFinite(askingPrice) || askingPrice <= 0) {
      return {
        success: false,
        errors: [{ message: 'Valid asking price is required for resale submissions.' }],
        fieldErrors: { 'details.askingPrice': 'Valid asking price is required for resale submissions.' },
      };
    }
  } else if (data.listingType === 'RENTAL') {
    const monthlyRent = Number(details.monthlyRent || 0);
    if (!Number.isFinite(monthlyRent) || monthlyRent <= 0) {
      return {
        success: false,
        errors: [{ message: 'Valid monthly rent is required for rental submissions.' }],
        fieldErrors: {
          'details.monthlyRent': 'Valid monthly rent is required for rental submissions.',
        },
      };
    }
  }

  // Rule: Consent verification (strictly per listingSource; cannot interchange owner and partner consent)
  if (data.listingSource === 'OWNER' && data.consent?.ownerDeclarationAccepted !== true) {
    return {
      success: false,
      errors: [{ message: 'Owner declaration authority must be accepted.' }],
    };
  }
  if (data.listingSource === 'PARTNER' && data.consent?.partnerAttestationAccepted !== true) {
    return {
      success: false,
      errors: [{ message: 'Partner owner consent attestation must be accepted.' }],
    };
  }

  let canonicalDeclaration: { declarationText: string; attestationVersion: string };
  try {
    canonicalDeclaration = getCanonicalDeclarationForSource(data.listingSource);
  } catch (err: any) {
    return {
      success: false,
      errors: [{ message: err?.message || 'Server canonical legal declaration is missing or invalid.' }],
    };
  }

  // Normalize amenities deduplication cleanly
  const normalizedDetails = data.details
    ? {
        ...data.details,
        amenities: Array.isArray(data.details.amenities)
          ? Array.from(new Set(data.details.amenities))
          : data.details.amenities,
      }
    : undefined;

  // Overwrite any client-supplied legal text or version with authoritative server values
  const authoritativeData: PropertySubmissionPayload = {
    ...data,
    details: normalizedDetails,
    consent:
      data.listingSource === 'PARTNER'
        ? {
            ownerDeclarationAccepted: false,
            partnerAttestationAccepted: true,
            declarationText: canonicalDeclaration.declarationText,
            attestationVersion: canonicalDeclaration.attestationVersion,
          }
        : {
            ownerDeclarationAccepted: true,
            partnerAttestationAccepted: false,
            declarationText: canonicalDeclaration.declarationText,
            attestationVersion: canonicalDeclaration.attestationVersion,
          },
  };

  return { success: true, data: authoritativeData };
}

export const VERIFICATION_CHECKLIST_KEYS = [
  'ownershipClaimReviewed',
  'mediaQualityChecked',
  'locationVerified',
  'pricingReviewed',
  'duplicateChecked',
  'contactConfirmed',
] as const;

export const verificationChecklistSchema = z.record(z.string(), z.boolean()).optional();

export const curatedLocationPatchSchema = z.object({
  city: z.string().trim().min(1).max(100).optional(),
  locality: z.string().trim().min(1).max(120).optional(),
  locationId: z.string().optional().nullable(),
  projectId: z.string().uuid().optional().nullable(),
  projectName: z.string().trim().max(150).optional().nullable(),
  isCustomLocality: z.boolean().optional(),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
});

export const curatedDetailsPatchSchema = propertyDetailsPayloadSchema.extend({
  title: z.string().trim().min(5).max(200).optional().nullable(),
  customLocalityDisplay: z.string().trim().max(120).optional().nullable(),
  customProjectDisplay: z.string().trim().max(150).optional().nullable(),
});

export const curatedEditSchema = z
  .object({
    title: z.string().trim().min(5).max(200).optional().nullable(),
    description: z.string().trim().max(2000).optional().nullable(),
    customLocalityDisplay: z.string().trim().max(120).optional().nullable(),
    customProjectDisplay: z.string().trim().max(150).optional().nullable(),
    location: curatedLocationPatchSchema.optional(),
    details: curatedDetailsPatchSchema.optional(),
  })
  .refine(
    (val) =>
      val.title !== undefined ||
      val.description !== undefined ||
      val.customLocalityDisplay !== undefined ||
      val.customProjectDisplay !== undefined ||
      val.location !== undefined ||
      val.details !== undefined,
    { message: 'At least one curated field update must be provided.' }
  );

export const approveSubmissionSchema = z.object({
  contactConfirmed: z.boolean().optional(),
  checklist: verificationChecklistSchema,
  internalNote: z.string().trim().max(2000).optional(),
  submitterFeedback: z.string().trim().max(1000).optional(),
});

export const rejectSubmissionSchema = z.object({
  reason: z.string().trim().min(5, 'Rejection reason must be at least 5 characters.').max(2000),
  internalNote: z.string().trim().max(2000).optional(),
});

export const deactivateSubmissionSchema = z.object({
  reason: z.string().trim().min(5, 'Deactivation reason must be at least 5 characters.').max(2000),
  internalNote: z.string().trim().max(2000).optional(),
});

export const overrideSubmissionSchema = z.object({
  targetStatus: z.enum([
    'UNDER_REVIEW',
    'CHANGES_REQUESTED',
    'APPROVED',
    'REJECTED',
    'PUBLISHED',
    'DEACTIVATED',
  ]),
  reason: z.string().trim().min(5, 'Override reason must be at least 5 characters.').max(2000),
  submitterFeedback: z.string().trim().max(1000).optional(),
  internalNote: z.string().trim().max(2000).optional(),
  contactConfirmed: z.boolean().optional(),
  checklist: verificationChecklistSchema,
});

export const resolveDuplicateSchema = z.object({
  resolutionStatus: z.enum(['OPEN', 'CONFIRMED_DUPLICATE', 'DISMISSED']),
  resolutionNote: z.string().trim().max(1000).optional().nullable(),
});

export const createChangeRequestSchema = z.object({
  requestType: z.enum(['CORRECTION', 'REMOVAL']),
  reason: z
    .string()
    .trim()
    .min(10, 'Please explain the requested correction or removal in at least 10 characters.')
    .max(2000),
  requestedChanges: z.record(z.string(), z.unknown()).optional().nullable(),
});

export const resolveChangeRequestSchema = z.object({
  status: z.enum(['APPROVED', 'APPLIED', 'REJECTED']),
  staffResponse: z
    .string()
    .trim()
    .min(3, 'Staff response is required when resolving a change request.')
    .max(2000),
  deactivateListing: z.boolean().optional(),
});

