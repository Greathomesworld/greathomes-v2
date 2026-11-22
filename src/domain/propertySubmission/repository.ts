import { getDb } from '../../db/client.ts';
import {
  propertySubmissions,
  propertySubmissionReviews,
  partnerAttestations,
  customerPartnerProfiles,
  mediaAssets,
  resaleListings,
  resaleListingMedia,
  resaleListingAmenities,
  rentalListings,
  rentalListingMedia,
  rentalListingAmenities,
  customers,
  amenities,
  projects,
  locations,
  propertySubmissionDuplicateFlags,
  propertySubmissionChangeRequests,
} from '../../db/schema.ts';
import { resaleListingRepository } from '../projects/repositories/resaleRepository.ts';
import { rentalListingRepository } from '../projects/repositories/rentalRepository.ts';
import { resaleListingService } from '../projects/services/resaleService.ts';
import { rentalListingService } from '../projects/services/rentalService.ts';
import { generateNewListingSlug } from '../projects/services/listingSlugGenerator.ts';
import { amenityRepository } from '../../infrastructure/repositories/projectProvider.ts';
import { auditService } from '../audit/auditService.ts';
import type { AuditAction } from '../audit/auditActions.ts';
import { notificationService } from '../customer/services/notificationService.ts';
import type { NotificationType } from '../customer/entities.ts';
import { customerRepository } from '../customer/repositories/index.ts';
import {
  detectAndRecordDuplicates,
  type DuplicateFlagRecord,
  type DuplicateResolutionStatus,
} from './duplicateDetection.ts';
import { revalidatePath } from 'next/cache';
import { eq, and, asc, desc, inArray, sql } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { normalizeMediaPublicUrl } from '../../lib/mediaUtils.ts';
import {
  PersistenceUnavailableError,
  isPersistenceUnavailableError,
} from '../../lib/persistenceGuard.ts';
import {
  getCanonicalDeclarationForSource,
  ListingSource,
  ListingType,
  MAX_SUBMISSION_PHOTOS,
  mergeSubmissionPayloads,
  SubmissionPhotoItem,
} from './validation.ts';
import { hasCapability, type StaffCapability } from '../auth/capabilityModel.ts';
import type { StaffRole } from '../auth/roles.ts';

function assertRepoStaffCapability(actorRole: string, capability: StaffCapability): void {
  if (capability === 'submission.override' && actorRole !== 'SUPER_ADMIN') {
    throw new PropertySubmissionDomainError(
      `Forbidden: role '${actorRole}' lacks capability '${capability}'.`,
      403
    );
  }
  if (!hasCapability(actorRole as StaffRole, capability)) {
    throw new PropertySubmissionDomainError(
      `Forbidden: role '${actorRole}' lacks capability '${capability}'.`,
      403
    );
  }
}

export interface CreateSubmissionInput {
  submitterCustomerId: string;
  listingType: ListingType;
  listingSource: ListingSource;
  payload?: Record<string, unknown>;
}

export interface SubmissionRecord {
  id: string;
  submitterCustomerId: string;
  listingType: string;
  listingSource: string;
  submissionStatus: string;
  resaleListingId?: string | null;
  rentalListingId?: string | null;
  assignedReviewerId?: string | null;
  payload: unknown;
  originalPayload?: unknown;
  curatedPayload?: unknown;
  reviewChecklist?: unknown;
  contactConfirmed?: boolean;
  version?: number;
  submittedAt?: Date | null;
  reviewedAt?: Date | null;
  approvedAt?: Date | null;
  publishedAt?: Date | null;
  publishedByStaffId?: string | null;
  deactivatedAt?: Date | null;
  deactivatedByStaffId?: string | null;
  overrideReason?: string | null;
  overrideByStaffId?: string | null;
  overrideAt?: Date | null;
  withdrawnAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SubmissionReviewRecord {
  id: string;
  submissionId: string;
  staffUserId?: string | null;
  eventType: string;
  previousStatus?: string | null;
  newStatus: string;
  internalNote?: string | null;
  submitterFeedback?: string | null;
  metadata?: unknown;
  createdAt: Date;
}

export interface PartnerAttestationRecord {
  id: string;
  submissionId: string;
  partnerCustomerId: string;
  attestationVersion: string;
  declarationText: string;
  acceptedAt: Date;
}

export interface SubmissionChangeRequestRecord {
  id: string;
  submissionId: string;
  customerId: string;
  requestType: 'CORRECTION' | 'REMOVAL';
  reason: string;
  requestedChanges: Record<string, unknown> | null;
  status: 'PENDING' | 'APPROVED' | 'APPLIED' | 'REJECTED';
  staffResponse: string | null;
  resolvedByStaffId: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SubmissionMediaAssetRecord {
  id: string;
  entityType: 'SUBMISSION';
  entityId: string;
  filename: string;
  mimeType: string;
  category: string;
  mediaType: 'IMAGE';
  width: number;
  height: number;
  fileSizeBytes: number;
  storageProvider: 'local' | 's3';
  storageKey: string;
  url: string;
  originalUrl: string;
  thumbnailUrl?: string | null;
  webpUrl?: string | null;
  watermarkedUrl?: string | null;
  watermarkApplied: boolean;
  caption?: string | null;
  sortOrder: number;
  isFeatured: boolean;
  processingStatus: string;
  variants?: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AddSubmissionMediaInput {
  id: string;
  filename: string;
  mimeType: string;
  category: string;
  width: number;
  height: number;
  fileSizeBytes: number;
  storageProvider: 'local' | 's3';
  storageKey: string;
  url: string;
  originalUrl: string;
  thumbnailUrl?: string | null;
  webpUrl?: string | null;
  watermarkedUrl?: string | null;
  watermarkApplied: boolean;
  caption?: string | null;
  variants?: Record<string, unknown> | null;
}

export interface UpdateSubmissionMediaInput {
  isFeatured?: boolean;
  category?: string;
  caption?: string | null;
}

export interface PartnerEligibilityStatus {
  customerId: string;
  isPartner: boolean;
  status: 'ACTIVE' | 'PENDING' | 'REJECTED' | 'SUSPENDED' | 'REVOKED' | 'NONE';
  eligible: boolean;
  message: string;
}

export interface CustomerVisibleReviewEvent {
  id: string;
  submissionId: string;
  eventType: string;
  previousStatus: string | null;
  newStatus: string;
  submitterFeedback: string | null;
  createdAt: string;
}

export type SubmissionActivityEventType =
  | 'DRAFT_CREATED'
  | 'DRAFT_UPDATED'
  | 'SUBMITTED'
  | 'RESUBMITTED'
  | 'UNDER_REVIEW'
  | 'CHANGES_REQUESTED'
  | 'CURATED_EDITED'
  | 'APPROVED'
  | 'PUBLISHED'
  | 'DEACTIVATED'
  | 'REACTIVATED'
  | 'OVERRIDDEN'
  | 'REJECTED'
  | 'WITHDRAWN'
  | 'CHANGE_REQUEST_SUBMITTED'
  | 'CHANGE_REQUEST_RESOLVED';

export interface SubmissionActivityItem {
  id: string;
  eventType: SubmissionActivityEventType;
  label: string;
  description: string;
  previousStatus: string | null;
  newStatus: string;
  submitterFeedback: string | null;
  timestamp: string;
}

export interface CustomerSubmissionPermissions {
  canEdit: boolean;
  canResubmit: boolean;
  canWithdraw: boolean;
  canRequestCorrection: boolean;
  canRequestRemoval: boolean;
  isReadOnly: boolean;
}

export interface CustomerSubmissionSummary {
  id: string;
  referenceId: string;
  submitterCustomerId: string;
  listingType: 'RESALE' | 'RENTAL';
  listingSource: 'OWNER' | 'PARTNER';
  propertyType: 'APARTMENT' | 'INDEPENDENT_HOUSE' | 'PLOT' | null;
  submissionStatus: string;
  statusLabel: string;
  title: string;
  city: string;
  locality: string | null;
  locationId: string | null;
  projectId: string | null;
  projectName: string | null;
  configuration: string | null;
  priceLabel: string | null;
  coverPhotoUrl: string | null;
  photoCount: number;
  version: number;
  resaleListingId: string | null;
  rentalListingId: string | null;
  publishedListingSlug?: string | null;
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
  reviewedAt: string | null;
  approvedAt: string | null;
  publishedAt: string | null;
  deactivatedAt: string | null;
  withdrawnAt: string | null;
  lastActivityAt: string;
  latestFeedback: CustomerVisibleReviewEvent | null;
  activityTimeline: SubmissionActivityItem[];
  permissions: CustomerSubmissionPermissions;
  nextAction: string;
  payload: Record<string, unknown>;
}

export interface CustomerSubmissionDetail extends CustomerSubmissionSummary {
  submission: SubmissionRecord;
  photos: SubmissionPhotoItem[];
  reviews: CustomerVisibleReviewEvent[];
  changeRequests?: Array<{
    id: string;
    requestType: 'CORRECTION' | 'REMOVAL';
    reason: string;
    requestedChanges: Record<string, unknown> | null;
    status: string;
    staffResponse: string | null;
    resolvedAt: string | null;
    createdAt: string;
  }>;
}

export type CustomerSubmissionStatusFilter =
  | 'ALL'
  | 'DRAFT'
  | 'SUBMITTED_OR_REVIEW'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'CHANGES_REQUESTED'
  | 'APPROVED'
  | 'PUBLISHED'
  | 'DEACTIVATED'
  | 'WITHDRAWN_OR_CLOSED'
  | 'WITHDRAWN'
  | 'REJECTED';

export interface ListCustomerSubmissionsOptions {
  status?: string;
  page?: number;
  limit?: number;
  compact?: boolean;
}

export interface PaginatedCustomerSubmissionsResult {
  items: CustomerSubmissionSummary[];
  submissions: SubmissionRecord[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  countsByStatus: {
    ALL: number;
    DRAFT: number;
    SUBMITTED_OR_REVIEW: number;
    CHANGES_REQUESTED: number;
    APPROVED: number;
    PUBLISHED: number;
    DEACTIVATED: number;
    WITHDRAWN_OR_CLOSED: number;
  };
}

export class PropertySubmissionPersistenceError extends PersistenceUnavailableError {
  constructor(
    message: string = 'Property submission service is temporarily unavailable. Please try again later.'
  ) {
    super(message);
    this.name = 'PropertySubmissionPersistenceError';
  }
}

export class PropertySubmissionDomainError extends Error {
  public readonly statusCode: number;
  public readonly fieldErrors?: Record<string, string>;

  constructor(
    message: string,
    statusCode: number = 400,
    fieldErrors?: Record<string, string>
  ) {
    super(message);
    this.name = 'PropertySubmissionDomainError';
    this.statusCode = statusCode;
    this.fieldErrors = fieldErrors;
  }
}

export { isPersistenceUnavailableError };

type DbClient = NonNullable<ReturnType<typeof getDb>>;

type PropertySubmissionInsertRow = typeof propertySubmissions.$inferInsert &
  Partial<typeof propertySubmissions.$inferSelect>;
type PropertySubmissionUpdateRow = Partial<typeof propertySubmissions.$inferSelect>;
type PropertySubmissionReviewInsertRow = typeof propertySubmissionReviews.$inferInsert &
  Partial<typeof propertySubmissionReviews.$inferSelect>;
type PartnerAttestationInsertRow = typeof partnerAttestations.$inferInsert &
  Partial<typeof partnerAttestations.$inferSelect>;
type MediaAssetInsertRow = typeof mediaAssets.$inferInsert &
  Partial<typeof mediaAssets.$inferSelect>;
type MediaAssetUpdateRow = Partial<typeof mediaAssets.$inferSelect>;
type RentalListingInsertRow = typeof rentalListings.$inferInsert &
  Partial<typeof rentalListings.$inferSelect>;
type ResaleListingInsertRow = typeof resaleListings.$inferInsert &
  Partial<typeof resaleListings.$inferSelect>;
type DuplicateFlagUpdateRow = Partial<typeof propertySubmissionDuplicateFlags.$inferSelect>;
type ChangeRequestInsertRow = typeof propertySubmissionChangeRequests.$inferInsert &
  Partial<typeof propertySubmissionChangeRequests.$inferSelect>;
type ChangeRequestUpdateRow = Partial<typeof propertySubmissionChangeRequests.$inferSelect>;

const SUBMITTABLE_STATUSES: readonly string[] = ['DRAFT', 'CHANGES_REQUESTED'];
const WITHDRAWABLE_STATUSES: readonly string[] = ['DRAFT', 'SUBMITTED', 'CHANGES_REQUESTED'];

export interface PropertySubmissionRepositoryOptions {
  allowTestMemoryPersistence?: boolean;
  dbResolver?: () => ReturnType<typeof getDb>;
}

const memorySubmissions = new Map<string, SubmissionRecord>();
const memoryReviews = new Map<string, SubmissionReviewRecord[]>();
const memoryAttestations = new Map<string, PartnerAttestationRecord[]>();
const memoryPartnerProfiles = new Map<string, { id: string; customerId: string; status: string }>();
const memorySubmissionMedia = new Map<string, SubmissionMediaAssetRecord[]>();
const memoryDuplicateFlags = new Map<string, DuplicateFlagRecord[]>();
const memoryChangeRequests = new Map<string, SubmissionChangeRequestRecord[]>();
const memoryCustomerAccounts = new Map<
  string,
  { id: string; name?: string | null; phone?: string | null; email?: string | null; accountType?: string | null }
>();
const memorySubmissionLocks = new Map<string, Promise<void>>();

function safeRevalidateListingPaths(paths: string[]) {
  for (const p of paths) {
    try {
      revalidatePath(p);
    } catch {
      // Non-Next execution context (CLI verification scripts/unit tests)
    }
  }
}

async function safeAuditRecord(
  staffId: string | null,
  actorRole: string,
  action: AuditAction,
  resourceId: string,
  resourceLabel?: string | null,
  before?: unknown,
  after?: unknown,
  metadata?: Record<string, unknown>
) {
  try {
    await auditService.record(
      null,
      { id: staffId, role: actorRole },
      {
        action,
        resourceType: 'PROPERTY_SUBMISSION',
        resourceId,
        resourceLabel: resourceLabel ?? resourceId,
        before,
        after,
        metadata,
        success: true,
      }
    );
  } catch {
    // Non-blocking audit resilience when DB audit persistence is disabled in isolated memory tests
  }
}

async function safeCreateNotification(data: {
  customerId: string;
  type: NotificationType;
  title: string;
  message: string;
  resourceId: string;
  dedupKey: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    await notificationService.createNotification({
      customerId: data.customerId,
      type: data.type,
      title: data.title,
      message: data.message,
      resourceType: 'PROPERTY_SUBMISSION',
      resourceId: data.resourceId,
      dedupKey: data.dedupKey,
      metadata: data.metadata || null,
    });
  } catch {
    // Non-blocking in isolated unit tests or if email delivery provider is unconfigured
  }
}

function normalizeFloorCategoryForListing(rawFloor: unknown, propertyType: string): 'LOWER_FLOOR' | 'MID_FLOOR' | 'HIGH_FLOOR' | null {
  if (propertyType === 'PLOT') return null;
  if (rawFloor === null || rawFloor === undefined || rawFloor === '') {
    return propertyType === 'INDEPENDENT_HOUSE' ? null : 'MID_FLOOR';
  }
  const normalized = String(rawFloor).trim().toUpperCase();
  if (normalized === 'GROUND_FLOOR' || normalized === 'LOWER_FLOOR') return 'LOWER_FLOOR';
  if (normalized === 'HIGHER_FLOOR' || normalized === 'HIGH_FLOOR') return 'HIGH_FLOOR';
  if (normalized === 'MID_FLOOR') return 'MID_FLOOR';
  return propertyType === 'INDEPENDENT_HOUSE' ? null : 'MID_FLOOR';
}

function normalizeFurnishingForListing(rawFurnishing: unknown, propertyType: string): 'UNFURNISHED' | 'SEMI_FURNISHED' | 'FULLY_FURNISHED' | null {
  if (propertyType === 'PLOT') return null;
  const val = typeof rawFurnishing === 'string' ? rawFurnishing.trim().toUpperCase() : '';
  if (val === 'UNFURNISHED' || val === 'SEMI_FURNISHED' || val === 'FULLY_FURNISHED') {
    return val;
  }
  if (val === 'SEMI FURNISHED') return 'SEMI_FURNISHED';
  if (val === 'FULLY FURNISHED') return 'FULLY_FURNISHED';
  return 'SEMI_FURNISHED';
}

function normalizeFacingForListing(rawFacing: unknown): string {
  const allowed = new Set([
    'NORTH',
    'SOUTH',
    'EAST',
    'WEST',
    'NORTH_EAST',
    'NORTH_WEST',
    'SOUTH_EAST',
    'SOUTH_WEST',
    'UNKNOWN',
  ]);
  const val = typeof rawFacing === 'string' ? rawFacing.trim().toUpperCase().replace(/-/g, '_') : '';
  return allowed.has(val) ? val : 'UNKNOWN';
}

function normalizePossessionForListing(rawPossession: unknown): string {
  const val = typeof rawPossession === 'string' ? rawPossession.trim().toUpperCase() : '';
  if (val === 'READY_TO_MOVE' || val === 'READY') return 'READY';
  if (val === 'UNDER_CONSTRUCTION' || val === 'OCCUPIED' || val === 'AVAILABLE_FROM_DATE') return val;
  return 'READY';
}

function coarsenPublicCoordinate(rawCoord: unknown): number | null {
  const num = typeof rawCoord === 'number' ? rawCoord : typeof rawCoord === 'string' && rawCoord.trim() ? Number(rawCoord) : NaN;
  if (!Number.isFinite(num)) return null;
  return Math.round(num * 1000) / 1000;
}

function formatPlotAreaDisplay(area: unknown): string | null {
  const num = typeof area === 'number' ? area : typeof area === 'string' && area.trim() ? Number(area) : NaN;
  if (!Number.isFinite(num) || num <= 0) return null;
  return `${num.toLocaleString('en-IN', { maximumFractionDigits: 2 })} sq.ft`;
}

function deepMergeCuratedPayload(
  base: Record<string, unknown>,
  patch: {
    title?: string | null;
    description?: string | null;
    customLocalityDisplay?: string | null;
    customProjectDisplay?: string | null;
    location?: Record<string, unknown>;
    details?: Record<string, unknown>;
  }
): Record<string, unknown> {
  const next = { ...base };
  const nextLocation = {
    ...(typeof base.location === 'object' && base.location !== null ? (base.location as Record<string, unknown>) : {}),
    ...(patch.location || {}),
  };
  const nextDetails = {
    ...(typeof base.details === 'object' && base.details !== null ? (base.details as Record<string, unknown>) : {}),
    ...(patch.details || {}),
  };

  if (patch.title !== undefined) {
    nextDetails.title = patch.title;
  }
  if (patch.description !== undefined) {
    nextDetails.description = patch.description;
  }
  if (patch.customLocalityDisplay !== undefined) {
    nextLocation.customLocalityDisplay = patch.customLocalityDisplay;
    if (typeof patch.customLocalityDisplay === 'string' && patch.customLocalityDisplay.trim()) {
      nextLocation.locality = patch.customLocalityDisplay.trim();
    }
  }
  if (patch.customProjectDisplay !== undefined) {
    nextLocation.customProjectDisplay = patch.customProjectDisplay;
    if (typeof patch.customProjectDisplay === 'string' && patch.customProjectDisplay.trim()) {
      nextLocation.projectName = patch.customProjectDisplay.trim();
    }
  }

  next.location = nextLocation;
  next.details = nextDetails;
  return next;
}

async function withMemorySubmissionLock<T>(submissionId: string, fn: () => Promise<T>): Promise<T> {
  const prev = memorySubmissionLocks.get(submissionId) || Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const chained = prev.then(() => current, () => current);
  memorySubmissionLocks.set(submissionId, chained);
  await prev;
  try {
    return await fn();
  } finally {
    release();
    if (memorySubmissionLocks.get(submissionId) === chained) {
      memorySubmissionLocks.delete(submissionId);
    }
  }
}

export function mapMediaAssetToSubmissionPhoto(asset: SubmissionMediaAssetRecord): SubmissionPhotoItem {
  const normalizedUrl = normalizeMediaPublicUrl(asset.url) || asset.url;
  return {
    id: asset.id,
    url: normalizedUrl,
    mimeType: asset.mimeType,
    filename: asset.filename,
    category: asset.category,
    caption: asset.caption ?? null,
    sortOrder: asset.sortOrder,
    isFeatured: asset.isFeatured,
    width: asset.width,
    height: asset.height,
    fileSizeBytes: asset.fileSizeBytes,
    watermarkApplied: asset.watermarkApplied,
    storageKey: asset.storageKey,
  };
}

export type SubmissionMediaDbRowShape = Omit<typeof mediaAssets.$inferSelect, 'customerId'> & {
  customerId?: string | null;
};

function mapDbRowToSubmissionMediaRecord(
  row: SubmissionMediaDbRowShape
): SubmissionMediaAssetRecord {
  const normalizedUrl = normalizeMediaPublicUrl(row.url) || row.url;
  const normalizedOriginal = normalizeMediaPublicUrl(row.originalUrl) || row.originalUrl;
  return {
    id: row.id,
    entityType: 'SUBMISSION',
    entityId: row.entityId,
    filename: row.filename,
    mimeType: row.mimeType,
    category: row.category,
    mediaType: 'IMAGE',
    width: row.width,
    height: row.height,
    fileSizeBytes: row.fileSizeBytes,
    storageProvider: row.storageProvider === 's3' ? 's3' : 'local',
    storageKey: row.storageKey,
    url: normalizedUrl,
    originalUrl: normalizedOriginal,
    thumbnailUrl: row.thumbnailUrl ? normalizeMediaPublicUrl(row.thumbnailUrl) || row.thumbnailUrl : null,
    webpUrl: row.webpUrl ? normalizeMediaPublicUrl(row.webpUrl) || row.webpUrl : null,
    watermarkedUrl: row.watermarkedUrl
      ? normalizeMediaPublicUrl(row.watermarkedUrl) || row.watermarkedUrl
      : null,
    watermarkApplied: row.watermarkApplied,
    caption: row.caption ?? null,
    sortOrder: row.sortOrder,
    isFeatured: row.isFeatured,
    processingStatus: row.processingStatus,
    variants: (row.variants as Record<string, unknown> | null) || null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function evaluatePartnerEligibility(
  customerId: string,
  profile: { status: string } | null | undefined
): PartnerEligibilityStatus {
  if (!profile || !profile.status || profile.status === 'NONE') {
    return {
      customerId,
      isPartner: false,
      status: 'NONE',
      eligible: false,
      message:
        'You do not have a registered partner profile. Only verified Great Homes partners with an ACTIVE profile can submit properties on behalf of owners.',
    };
  }

  const normalized = profile.status.toUpperCase();
  if (normalized === 'ACTIVE') {
    return {
      customerId,
      isPartner: true,
      status: 'ACTIVE',
      eligible: true,
      message: 'Active partner profile verified.',
    };
  }

  if (normalized === 'PENDING') {
    return {
      customerId,
      isPartner: true,
      status: 'PENDING',
      eligible: false,
      message:
        'Your partner profile application is currently PENDING verification by Great Homes staff. You will be able to submit partner listings once approved.',
    };
  }

  if (normalized === 'REJECTED') {
    return {
      customerId,
      isPartner: true,
      status: 'REJECTED',
      eligible: false,
      message:
        'Your partner profile application was REJECTED. Please review staff feedback or reapply with valid credentials.',
    };
  }

  if (normalized === 'SUSPENDED') {
    return {
      customerId,
      isPartner: true,
      status: 'SUSPENDED',
      eligible: false,
      message:
        'Your partner profile is currently SUSPENDED and cannot submit new listings. Please contact Great Homes Partner Support.',
    };
  }

  return {
    customerId,
    isPartner: true,
    status: 'REVOKED',
    eligible: false,
    message:
      'Your partner profile authorization has been REVOKED and cannot submit listings on behalf of property owners.',
  };
}

export function sanitizeReviewForCustomer(
  review: SubmissionReviewRecord
): CustomerVisibleReviewEvent {
  // Strictly strip internalNote and staffUserId so internal moderation notes never reach customer payloads
  return {
    id: review.id,
    submissionId: review.submissionId,
    eventType: review.eventType,
    previousStatus: review.previousStatus ?? null,
    newStatus: review.newStatus,
    submitterFeedback:
      typeof review.submitterFeedback === 'string' && review.submitterFeedback.trim().length > 0
        ? review.submitterFeedback.trim()
        : null,
    createdAt:
      review.createdAt instanceof Date
        ? review.createdAt.toISOString()
        : new Date(review.createdAt).toISOString(),
  };
}

export function getSubmissionPermissions(status: string): CustomerSubmissionPermissions {
  const canEdit = SUBMITTABLE_STATUSES.includes(status);
  const canResubmit = status === 'CHANGES_REQUESTED';
  const canWithdraw = WITHDRAWABLE_STATUSES.includes(status);
  const canRequestCorrection = status === 'PUBLISHED' || status === 'DEACTIVATED';
  const canRequestRemoval = status === 'PUBLISHED';
  return {
    canEdit,
    canResubmit,
    canWithdraw,
    canRequestCorrection,
    canRequestRemoval,
    isReadOnly: !canEdit,
  };
}

export function getSubmissionStatusMeta(status: string): {
  statusLabel: string;
  nextAction: string;
} {
  switch (status) {
    case 'DRAFT':
      return {
        statusLabel: 'Draft Saved',
        nextAction:
          'Complete remaining property details and upload at least 3 photographs to submit for verification.',
      };
    case 'SUBMITTED':
      return {
        statusLabel: 'Submitted for Verification',
        nextAction:
          'Queued for Great Homes verification. Editing is locked while your submission is in the review queue.',
      };
    case 'UNDER_REVIEW':
      return {
        statusLabel: 'Under Verification Review',
        nextAction:
          'A Great Homes verification specialist is currently reviewing your property details and photographs.',
      };
    case 'CHANGES_REQUESTED':
      return {
        statusLabel: 'Changes Requested',
        nextAction:
          'Action required: Review the verification team feedback below, update your submission, and resubmit.',
      };
    case 'APPROVED':
      return {
        statusLabel: 'Approved — Pending Publication',
        nextAction:
          'Verified and approved by Great Homes. Queued for final publication onto the public catalog.',
      };
    case 'PUBLISHED':
      return {
        statusLabel: 'Published — Live on Great Homes',
        nextAction:
          'Your property is live on Great Homes. You can request a post-publication correction or listing removal below.',
      };
    case 'DEACTIVATED':
      return {
        statusLabel: 'Deactivated / Offline',
        nextAction:
          'This listing is currently paused and hidden from public search. Contact Great Homes or request a correction if updates are required.',
      };
    case 'REJECTED':
      return {
        statusLabel: 'Verification Declined',
        nextAction:
          'This submission did not meet Great Homes verification criteria and is closed.',
      };
    case 'WITHDRAWN':
    case 'WITHDRAWAL_REQUESTED':
      return {
        statusLabel: 'Withdrawn by Submitter',
        nextAction:
          'Withdrawn from the verification queue. This submission is closed and will not be published.',
      };
    default:
      return {
        statusLabel: status,
        nextAction: 'Refer to your submission status history for details.',
      };
  }
}

function formatIndianCurrencyShort(amount: number, isRental: boolean): string {
  if (!Number.isFinite(amount) || amount <= 0) return '';
  if (isRental) {
    return `₹${Math.round(amount).toLocaleString('en-IN')} / month`;
  }
  if (amount >= 10000000) {
    const cr = amount / 10000000;
    return `₹${cr.toFixed(cr % 1 === 0 ? 0 : 2)} Cr`;
  }
  if (amount >= 100000) {
    const lakh = amount / 100000;
    return `₹${lakh.toFixed(lakh % 1 === 0 ? 0 : 2)} Lakh`;
  }
  return `₹${Math.round(amount).toLocaleString('en-IN')}`;
}

export function buildCustomerActivityTimeline(
  submission: SubmissionRecord,
  reviews: SubmissionReviewRecord[]
): SubmissionActivityItem[] {
  const items: SubmissionActivityItem[] = [];
  const createdIso =
    submission.createdAt instanceof Date
      ? submission.createdAt.toISOString()
      : new Date(submission.createdAt).toISOString();
  const updatedIso =
    submission.updatedAt instanceof Date
      ? submission.updatedAt.toISOString()
      : new Date(submission.updatedAt).toISOString();

  items.push({
    id: `act_created_${submission.id}`,
    eventType: 'DRAFT_CREATED',
    label: 'Draft Created',
    description: `Initial ${submission.listingType === 'RENTAL' ? 'rental' : 'resale'} submission draft initialized.`,
    previousStatus: null,
    newStatus: 'DRAFT',
    submitterFeedback: null,
    timestamp: createdIso,
  });

  const sortedReviews = [...reviews].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  for (const rev of sortedReviews) {
    if (rev.eventType === 'INTERNAL_NOTE') continue; // Never expose internal notes
    const safe = sanitizeReviewForCustomer(rev);
    const isResubmit =
      rev.eventType === 'RESUBMITTED' ||
      (rev.previousStatus === 'CHANGES_REQUESTED' && rev.newStatus === 'SUBMITTED');

    if (isResubmit) {
      items.push({
        id: safe.id,
        eventType: 'RESUBMITTED',
        label: 'Resubmitted After Corrections',
        description:
          'Updated property details and photographs were resubmitted for Great Homes verification.',
        previousStatus: safe.previousStatus,
        newStatus: safe.newStatus,
        submitterFeedback: safe.submitterFeedback,
        timestamp: safe.createdAt,
      });
    } else if (rev.eventType === 'EDIT_CURATED') {
      items.push({
        id: safe.id,
        eventType: 'CURATED_EDITED',
        label: 'Public Presentation Curated',
        description: 'Great Homes verification team refined public listing formatting before publication.',
        previousStatus: safe.previousStatus,
        newStatus: safe.newStatus,
        submitterFeedback: null,
        timestamp: safe.createdAt,
      });
    } else if (rev.eventType === 'OVERRIDE') {
      items.push({
        id: safe.id,
        eventType: 'OVERRIDDEN',
        label: 'Administrative Status Update',
        description: safe.submitterFeedback || `Submission status updated to ${safe.newStatus}.`,
        previousStatus: safe.previousStatus,
        newStatus: safe.newStatus,
        submitterFeedback: safe.submitterFeedback,
        timestamp: safe.createdAt,
      });
    } else if (rev.eventType === 'CHANGE_REQUEST_RESOLVED') {
      items.push({
        id: safe.id,
        eventType: 'CHANGE_REQUEST_RESOLVED',
        label: 'Change Request Resolved',
        description: safe.submitterFeedback || 'Your post-publication request was reviewed by Great Homes.',
        previousStatus: safe.previousStatus,
        newStatus: safe.newStatus,
        submitterFeedback: safe.submitterFeedback,
        timestamp: safe.createdAt,
      });
    } else if (rev.newStatus === 'SUBMITTED' || rev.eventType === 'SUBMITTED') {
      items.push({
        id: safe.id,
        eventType: 'SUBMITTED',
        label: 'Submitted for Verification',
        description: 'Property submission completed and entered the Great Homes verification queue.',
        previousStatus: safe.previousStatus,
        newStatus: safe.newStatus,
        submitterFeedback: safe.submitterFeedback,
        timestamp: safe.createdAt,
      });
    } else if (rev.newStatus === 'UNDER_REVIEW' || rev.eventType === 'UNDER_REVIEW') {
      items.push({
        id: safe.id,
        eventType: 'UNDER_REVIEW',
        label: 'Verification In Progress',
        description: 'Assigned to Great Homes verification team for review.',
        previousStatus: safe.previousStatus,
        newStatus: safe.newStatus,
        submitterFeedback: safe.submitterFeedback,
        timestamp: safe.createdAt,
      });
    } else if (rev.newStatus === 'CHANGES_REQUESTED' || rev.eventType === 'CHANGES_REQUESTED') {
      items.push({
        id: safe.id,
        eventType: 'CHANGES_REQUESTED',
        label: 'Changes Requested by Verification Team',
        description:
          safe.submitterFeedback ||
          'Please review the requested adjustments and resubmit your property.',
        previousStatus: safe.previousStatus,
        newStatus: safe.newStatus,
        submitterFeedback: safe.submitterFeedback,
        timestamp: safe.createdAt,
      });
    } else if (rev.eventType === 'APPROVED' || rev.newStatus === 'APPROVED') {
      items.push({
        id: safe.id,
        eventType: 'APPROVED',
        label: 'Verified & Approved for Publication',
        description:
          safe.submitterFeedback ||
          'Property verified and approved by Great Homes, queued for catalog publication.',
        previousStatus: safe.previousStatus,
        newStatus: safe.newStatus,
        submitterFeedback: safe.submitterFeedback,
        timestamp: safe.createdAt,
      });
    } else if (rev.eventType === 'REACTIVATED') {
      items.push({
        id: safe.id,
        eventType: 'REACTIVATED',
        label: 'Listing Reactivated',
        description: 'Your listing has been restored and is live on Great Homes.',
        previousStatus: safe.previousStatus,
        newStatus: safe.newStatus,
        submitterFeedback: safe.submitterFeedback,
        timestamp: safe.createdAt,
      });
    } else if (rev.eventType === 'PUBLISHED' || rev.newStatus === 'PUBLISHED') {
      items.push({
        id: safe.id,
        eventType: 'PUBLISHED',
        label: 'Published Live on Great Homes',
        description:
          safe.submitterFeedback ||
          'Your verified listing is now live on Great Homes public discovery.',
        previousStatus: safe.previousStatus,
        newStatus: safe.newStatus,
        submitterFeedback: safe.submitterFeedback,
        timestamp: safe.createdAt,
      });
    } else if (rev.eventType === 'DEACTIVATED' || rev.newStatus === 'DEACTIVATED') {
      items.push({
        id: safe.id,
        eventType: 'DEACTIVATED',
        label: 'Listing Deactivated',
        description:
          safe.submitterFeedback ||
          'Listing was paused and removed from public discovery.',
        previousStatus: safe.previousStatus,
        newStatus: safe.newStatus,
        submitterFeedback: safe.submitterFeedback,
        timestamp: safe.createdAt,
      });
    } else if (rev.newStatus === 'REJECTED' || rev.eventType === 'REJECTED') {
      items.push({
        id: safe.id,
        eventType: 'REJECTED',
        label: 'Verification Declined',
        description:
          safe.submitterFeedback || 'Submission did not meet verification requirements.',
        previousStatus: safe.previousStatus,
        newStatus: safe.newStatus,
        submitterFeedback: safe.submitterFeedback,
        timestamp: safe.createdAt,
      });
    } else if (rev.newStatus === 'WITHDRAWN' || rev.eventType === 'WITHDRAWN') {
      items.push({
        id: safe.id,
        eventType: 'WITHDRAWN',
        label: 'Submission Withdrawn',
        description: 'Withdrawn by customer and removed from active verification queue.',
        previousStatus: safe.previousStatus,
        newStatus: safe.newStatus,
        submitterFeedback: safe.submitterFeedback,
        timestamp: safe.createdAt,
      });
    }
  }

  // If draft was updated after creation and is currently in DRAFT or CHANGES_REQUESTED, reflect latest draft save
  const createdMs = new Date(createdIso).getTime();
  const updatedMs = new Date(updatedIso).getTime();
  const lastEventMs =
    items.length > 0 ? new Date(items[items.length - 1].timestamp).getTime() : createdMs;

  if (
    updatedMs > createdMs &&
    updatedMs > lastEventMs &&
    (submission.submissionStatus === 'DRAFT' ||
      submission.submissionStatus === 'CHANGES_REQUESTED')
  ) {
    items.push({
      id: `act_updated_${submission.id}`,
      eventType: 'DRAFT_UPDATED',
      label: 'Draft Progress Saved',
      description: 'Property information or photographs updated in draft.',
      previousStatus: submission.submissionStatus,
      newStatus: submission.submissionStatus,
      submitterFeedback: null,
      timestamp: updatedIso,
    });
  }

  return items.sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
}

export function computeSubmissionSummary(
  submission: SubmissionRecord,
  mediaList: SubmissionMediaAssetRecord[],
  reviewList: SubmissionReviewRecord[],
  publishedListingSlug?: string | null
): CustomerSubmissionSummary {
  const effectiveSourcePayload =
    (submission.submissionStatus === 'PUBLISHED' || submission.submissionStatus === 'DEACTIVATED') &&
    typeof submission.curatedPayload === 'object' &&
    submission.curatedPayload !== null
      ? submission.curatedPayload
      : submission.payload;

  const rawPayload =
    typeof effectiveSourcePayload === 'object' && effectiveSourcePayload !== null
      ? { ...(effectiveSourcePayload as Record<string, unknown>) }
      : {};

  const sortedMedia = [...mediaList].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.createdAt.getTime() - b.createdAt.getTime()
  );

  let photos: SubmissionPhotoItem[] = [];
  if (sortedMedia.length > 0) {
    photos = sortedMedia.map(mapMediaAssetToSubmissionPhoto);
    rawPayload.photos = photos;
  } else if (Array.isArray(rawPayload.photos)) {
    photos = (rawPayload.photos as SubmissionPhotoItem[]).map((p, idx) => ({
      ...p,
      url: normalizeMediaPublicUrl(p.url) || p.url,
      sortOrder: typeof p.sortOrder === 'number' ? p.sortOrder : idx,
    }));
    rawPayload.photos = photos;
  }

  const featuredPhoto = photos.find((p) => p.isFeatured) || photos[0] || null;
  const coverPhotoUrl = featuredPhoto?.url || null;

  const listingType: 'RESALE' | 'RENTAL' =
    submission.listingType === 'RENTAL' ? 'RENTAL' : 'RESALE';
  const listingSource: 'OWNER' | 'PARTNER' =
    submission.listingSource === 'PARTNER' ? 'PARTNER' : 'OWNER';

  const rawPropType = rawPayload.propertyType;
  const propertyType: 'APARTMENT' | 'INDEPENDENT_HOUSE' | 'PLOT' | null =
    rawPropType === 'APARTMENT' ||
    rawPropType === 'INDEPENDENT_HOUSE' ||
    rawPropType === 'PLOT'
      ? rawPropType
      : null;

  const locationObj =
    typeof rawPayload.location === 'object' && rawPayload.location !== null
      ? (rawPayload.location as Record<string, unknown>)
      : {};
  const detailsObj =
    typeof rawPayload.details === 'object' && rawPayload.details !== null
      ? (rawPayload.details as Record<string, unknown>)
      : {};

  const city =
    typeof locationObj.city === 'string' && locationObj.city.trim().length > 0
      ? locationObj.city.trim()
      : 'Kolkata';
  const locality =
    typeof locationObj.locality === 'string' && locationObj.locality.trim().length > 0
      ? locationObj.locality.trim()
      : null;
  const locationId =
    typeof locationObj.locationId === 'string' && locationObj.locationId.trim().length > 0
      ? locationObj.locationId.trim()
      : null;
  const projectId =
    typeof locationObj.projectId === 'string' && locationObj.projectId.trim().length > 0
      ? locationObj.projectId.trim()
      : null;
  const projectName =
    typeof locationObj.projectName === 'string' && locationObj.projectName.trim().length > 0
      ? locationObj.projectName.trim()
      : null;

  const bedroomsNum =
    typeof detailsObj.bedroomCount === 'number'
      ? detailsObj.bedroomCount
      : typeof detailsObj.bedrooms === 'number'
      ? detailsObj.bedrooms
      : null;

  const configuration =
    typeof detailsObj.configuration === 'string' && detailsObj.configuration.trim().length > 0
      ? detailsObj.configuration.trim()
      : bedroomsNum && bedroomsNum > 0
      ? `${bedroomsNum} BHK`
      : null;

  const explicitTitle =
    typeof detailsObj.title === 'string' && detailsObj.title.trim().length >= 5
      ? detailsObj.title.trim()
      : null;

  const propTypeLabel =
    propertyType === 'APARTMENT'
      ? 'Apartment'
      : propertyType === 'INDEPENDENT_HOUSE'
      ? 'Independent House'
      : propertyType === 'PLOT'
      ? 'Residential Plot'
      : 'Residential Property';

  const purposeLabel = listingType === 'RENTAL' ? 'for Rent' : 'for Resale';

  let generatedTitle = explicitTitle;
  if (!generatedTitle) {
    const parts: string[] = [];
    const plotAreaVal = detailsObj.plotArea ?? detailsObj.plotAreaSqFt;
    if (propertyType === 'PLOT' && (typeof plotAreaVal === 'number' || typeof plotAreaVal === 'string')) {
      const formattedPlot = formatPlotAreaDisplay(plotAreaVal);
      if (formattedPlot) parts.push(formattedPlot);
    } else if (configuration) {
      parts.push(configuration);
    }
    parts.push(propTypeLabel);
    parts.push(purposeLabel);
    if (projectName) {
      parts.push(`at ${projectName}`);
    } else if (locality) {
      parts.push(`in ${locality}`);
    } else {
      parts.push(`in ${city}`);
    }
    generatedTitle = parts.join(' ');
  }

  let priceLabel: string | null = null;
  const askingVal = Number(detailsObj.askingPrice ?? detailsObj.expectedPrice ?? 0);
  const rentVal = Number(detailsObj.monthlyRent ?? 0);
  if (listingType === 'RESALE' && Number.isFinite(askingVal) && askingVal > 0) {
    priceLabel = formatIndianCurrencyShort(askingVal, false);
  } else if (listingType === 'RENTAL' && Number.isFinite(rentVal) && rentVal > 0) {
    priceLabel = formatIndianCurrencyShort(rentVal, true);
  }

  const sanitizedReviews = [...reviewList]
    .filter((r) => r.eventType !== 'INTERNAL_NOTE')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .map(sanitizeReviewForCustomer);

  const latestFeedback =
    sanitizedReviews.find(
      (r) =>
        (r.submitterFeedback && r.submitterFeedback.length > 0) ||
        r.newStatus === 'CHANGES_REQUESTED' ||
        r.newStatus === 'REJECTED' ||
        r.newStatus === 'APPROVED' ||
        r.newStatus === 'PUBLISHED' ||
        r.newStatus === 'DEACTIVATED'
    ) || null;

  const activityTimeline = buildCustomerActivityTimeline(submission, reviewList);
  const { statusLabel, nextAction } = getSubmissionStatusMeta(submission.submissionStatus);
  const permissions = getSubmissionPermissions(submission.submissionStatus);

  const createdAtIso =
    submission.createdAt instanceof Date
      ? submission.createdAt.toISOString()
      : new Date(submission.createdAt).toISOString();
  const updatedAtIso =
    submission.updatedAt instanceof Date
      ? submission.updatedAt.toISOString()
      : new Date(submission.updatedAt).toISOString();
  const submittedAtIso = submission.submittedAt
    ? submission.submittedAt instanceof Date
      ? submission.submittedAt.toISOString()
      : new Date(submission.submittedAt).toISOString()
    : null;
  const reviewedAtIso = submission.reviewedAt
    ? submission.reviewedAt instanceof Date
      ? submission.reviewedAt.toISOString()
      : new Date(submission.reviewedAt).toISOString()
    : null;
  const approvedAtIso = submission.approvedAt
    ? submission.approvedAt instanceof Date
      ? submission.approvedAt.toISOString()
      : new Date(submission.approvedAt).toISOString()
    : null;
  const publishedAtIso = submission.publishedAt
    ? submission.publishedAt instanceof Date
      ? submission.publishedAt.toISOString()
      : new Date(submission.publishedAt).toISOString()
    : null;
  const deactivatedAtIso = submission.deactivatedAt
    ? submission.deactivatedAt instanceof Date
      ? submission.deactivatedAt.toISOString()
      : new Date(submission.deactivatedAt).toISOString()
    : null;
  const withdrawnAtIso = submission.withdrawnAt
    ? submission.withdrawnAt instanceof Date
      ? submission.withdrawnAt.toISOString()
      : new Date(submission.withdrawnAt).toISOString()
    : null;

  const latestTimelineIso =
    activityTimeline.length > 0
      ? activityTimeline[activityTimeline.length - 1].timestamp
      : updatedAtIso;
  const lastActivityAt =
    new Date(latestTimelineIso).getTime() > new Date(updatedAtIso).getTime()
      ? latestTimelineIso
      : updatedAtIso;

  const shortSuffix = submission.id.replace(/^sub_/, '').slice(0, 8).toUpperCase();
  const referenceId = `GH-${shortSuffix}`;

  return {
    id: submission.id,
    referenceId,
    submitterCustomerId: submission.submitterCustomerId,
    listingType,
    listingSource,
    propertyType,
    submissionStatus: submission.submissionStatus,
    statusLabel,
    title: generatedTitle,
    city,
    locality,
    locationId,
    projectId,
    projectName,
    configuration,
    priceLabel: priceLabel || null,
    coverPhotoUrl,
    photoCount: photos.length,
    version: typeof submission.version === 'number' ? submission.version : 1,
    resaleListingId: submission.resaleListingId ?? null,
    rentalListingId: submission.rentalListingId ?? null,
    publishedListingSlug: publishedListingSlug ?? null,
    createdAt: createdAtIso,
    updatedAt: updatedAtIso,
    submittedAt: submittedAtIso,
    reviewedAt: reviewedAtIso,
    approvedAt: approvedAtIso,
    publishedAt: publishedAtIso,
    deactivatedAt: deactivatedAtIso,
    withdrawnAt: withdrawnAtIso,
    lastActivityAt,
    latestFeedback,
    activityTimeline,
    permissions,
    nextAction,
    payload: rawPayload,
  };
}

function resolveStatusFilterList(filter?: string): string[] | null {
  if (!filter || filter === 'ALL') return null;
  const normalized = filter.trim().toUpperCase();
  switch (normalized) {
    case 'DRAFT':
      return ['DRAFT'];
    case 'SUBMITTED_OR_REVIEW':
      return ['SUBMITTED', 'UNDER_REVIEW'];
    case 'SUBMITTED':
      return ['SUBMITTED'];
    case 'UNDER_REVIEW':
      return ['UNDER_REVIEW'];
    case 'CHANGES_REQUESTED':
      return ['CHANGES_REQUESTED'];
    case 'APPROVED':
      return ['APPROVED'];
    case 'PUBLISHED':
      return ['PUBLISHED'];
    case 'DEACTIVATED':
      return ['DEACTIVATED'];
    case 'WITHDRAWN_OR_CLOSED':
      return ['WITHDRAWN', 'WITHDRAWAL_REQUESTED', 'REJECTED'];
    case 'WITHDRAWN':
      return ['WITHDRAWN', 'WITHDRAWAL_REQUESTED'];
    case 'REJECTED':
      return ['REJECTED'];
    default:
      return null;
  }
}

export class PropertySubmissionRepository {
  private allowTestMemoryPersistence: boolean;
  private readonly dbResolver: () => ReturnType<typeof getDb>;
  private readonly inFlightTransitions = new Set<string>();

  constructor(options?: PropertySubmissionRepositoryOptions) {
    this.allowTestMemoryPersistence = Boolean(options?.allowTestMemoryPersistence);
    this.dbResolver = options?.dbResolver ?? (() => getDb());
    if (this.allowTestMemoryPersistence && this.isStrictTestEnvironment()) {
      resaleListingRepository.enableTestMemoryPersistence(true);
      rentalListingRepository.enableTestMemoryPersistence(true);
    }
  }

  static createForTesting(
    options?: Omit<PropertySubmissionRepositoryOptions, 'allowTestMemoryPersistence'>
  ): PropertySubmissionRepository {
    if (process.env.NODE_ENV !== 'test') {
      throw new PropertySubmissionPersistenceError(
        'In-memory test repository construction is strictly restricted to NODE_ENV=test.'
      );
    }
    return new PropertySubmissionRepository({
      ...options,
      allowTestMemoryPersistence: true,
    });
  }

  enableTestMemoryPersistence(enabled: boolean = true): void {
    if (enabled && !this.isStrictTestEnvironment()) {
      throw new PropertySubmissionPersistenceError(
        'In-memory persistence is permitted only in an explicit test environment (NODE_ENV=test).'
      );
    }
    this.allowTestMemoryPersistence = enabled;
    resaleListingRepository.enableTestMemoryPersistence(enabled);
    rentalListingRepository.enableTestMemoryPersistence(enabled);
  }

  private isStrictTestEnvironment(): boolean {
    if (process.env.NODE_ENV !== 'test') {
      return false;
    }
    if (
      process.env.VERCEL_ENV === 'production' ||
      process.env.VERCEL_ENV === 'preview'
    ) {
      return false;
    }
    return true;
  }

  private isTestMemoryActive(): boolean {
    return this.isStrictTestEnvironment() && this.allowTestMemoryPersistence === true;
  }

  private resolvePersistenceBackend(): { mode: 'postgres'; db: DbClient } | { mode: 'memory' } {
    // If explicit test memory persistence is active and no custom DB is forced, check whether DB is configured
    if (process.env.PERSISTENCE_PROVIDER === 'memory') {
      if (this.isTestMemoryActive()) {
        return { mode: 'memory' };
      }
      throw new PropertySubmissionPersistenceError(
        'Property submission service is temporarily unavailable. In-memory persistence is disabled outside isolated test execution.'
      );
    }

    let db: ReturnType<typeof getDb> = null;
    try {
      db = this.dbResolver();
    } catch {
      throw new PropertySubmissionPersistenceError(
        'Property submission service is temporarily unavailable. Database connection could not be established.'
      );
    }

    if (db) {
      return { mode: 'postgres', db };
    }

    if (this.isTestMemoryActive()) {
      return { mode: 'memory' };
    }

    throw new PropertySubmissionPersistenceError(
      'Property submission service is temporarily unavailable. PostgreSQL persistence is required.'
    );
  }

  private async runWithPersistenceGuard<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err: unknown) {
      if (
        err instanceof PropertySubmissionPersistenceError ||
        err instanceof PropertySubmissionDomainError
      ) {
        throw err;
      }
      // Never leak database credentials, SQL statements, or internal driver stack traces
      throw new PropertySubmissionPersistenceError(
        'Property submission service is temporarily unavailable. Please try again later.'
      );
    }
  }

  private cachedSchemaCaps: {
    caps: {
      hasExtendedSubmissionColumns: boolean;
      hasReviewMetadataColumn: boolean;
      hasDuplicateFlagsTable: boolean;
      hasChangeRequestsTable: boolean;
      hasExtendedListingColumns: boolean;
      hasMediaCustomerIdColumn: boolean;
      hasPartnerAttestationsTable: boolean;
    };
    expiresAt: number;
  } | null = null;
  private schemaCapsInFlight: Promise<{
    hasExtendedSubmissionColumns: boolean;
    hasReviewMetadataColumn: boolean;
    hasDuplicateFlagsTable: boolean;
    hasChangeRequestsTable: boolean;
    hasExtendedListingColumns: boolean;
    hasMediaCustomerIdColumn: boolean;
    hasPartnerAttestationsTable: boolean;
  }> | null = null;

  private async getSchemaCapabilities(dbOrTx: any) {
    const now = Date.now();
    if (this.cachedSchemaCaps && this.cachedSchemaCaps.expiresAt > now) {
      return this.cachedSchemaCaps.caps;
    }
    if (this.schemaCapsInFlight) {
      return this.schemaCapsInFlight;
    }

    const queryPromise = (async () => {
      try {
        const res: any = await dbOrTx.execute(sql`
          SELECT table_name, column_name
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND (
              (table_name = 'property_submissions' AND column_name = 'version')
              OR (table_name = 'property_submission_reviews' AND column_name = 'metadata')
              OR (table_name = 'property_submission_duplicate_flags' AND column_name = 'id')
              OR (table_name = 'property_submission_change_requests' AND column_name = 'id')
              OR (table_name = 'resale_listings' AND column_name = 'custom_locality_display')
              OR (table_name = 'media_assets' AND column_name = 'customer_id')
              OR (table_name = 'partner_attestations' AND column_name = 'id')
            )
        `);
        const rows: any[] = Array.isArray(res?.rows) ? res.rows : Array.isArray(res) ? res : [];
        const caps = {
          hasExtendedSubmissionColumns: rows.some(
            (r) => r.table_name === 'property_submissions' && r.column_name === 'version'
          ),
          hasReviewMetadataColumn: rows.some(
            (r) => r.table_name === 'property_submission_reviews' && r.column_name === 'metadata'
          ),
          hasDuplicateFlagsTable: rows.some(
            (r) => r.table_name === 'property_submission_duplicate_flags'
          ),
          hasChangeRequestsTable: rows.some(
            (r) => r.table_name === 'property_submission_change_requests'
          ),
          hasExtendedListingColumns: rows.some(
            (r) => r.table_name === 'resale_listings' && r.column_name === 'custom_locality_display'
          ),
          hasMediaCustomerIdColumn: rows.some(
            (r) => r.table_name === 'media_assets' && r.column_name === 'customer_id'
          ),
          hasPartnerAttestationsTable: rows.some(
            (r) => r.table_name === 'partner_attestations'
          ),
        };
        const allPresent =
          caps.hasExtendedSubmissionColumns &&
          caps.hasReviewMetadataColumn &&
          caps.hasDuplicateFlagsTable &&
          caps.hasChangeRequestsTable &&
          caps.hasExtendedListingColumns &&
          caps.hasMediaCustomerIdColumn &&
          caps.hasPartnerAttestationsTable;

        // 10-minute TTL once all schema capabilities are verified; 15s short TTL otherwise
        this.cachedSchemaCaps = {
          caps,
          expiresAt: Date.now() + (allPresent ? 10 * 60 * 1000 : 15_000),
        };
        return caps;
      } catch {
        return {
          hasExtendedSubmissionColumns: true,
          hasReviewMetadataColumn: true,
          hasDuplicateFlagsTable: true,
          hasChangeRequestsTable: true,
          hasExtendedListingColumns: true,
          hasMediaCustomerIdColumn: true,
          hasPartnerAttestationsTable: true,
        };
      } finally {
        this.schemaCapsInFlight = null;
      }
    })();

    this.schemaCapsInFlight = queryPromise;
    return queryPromise;
  }

  private getLegacyMediaAssetSelection() {
    return {
      id: mediaAssets.id,
      entityType: mediaAssets.entityType,
      entityId: mediaAssets.entityId,
      filename: mediaAssets.filename,
      mimeType: mediaAssets.mimeType,
      category: mediaAssets.category,
      mediaType: mediaAssets.mediaType,
      width: mediaAssets.width,
      height: mediaAssets.height,
      fileSizeBytes: mediaAssets.fileSizeBytes,
      storageProvider: mediaAssets.storageProvider,
      storageKey: mediaAssets.storageKey,
      url: mediaAssets.url,
      originalUrl: mediaAssets.originalUrl,
      thumbnailUrl: mediaAssets.thumbnailUrl,
      webpUrl: mediaAssets.webpUrl,
      avifUrl: mediaAssets.avifUrl,
      watermarkedUrl: mediaAssets.watermarkedUrl,
      watermarkApplied: mediaAssets.watermarkApplied,
      altText: mediaAssets.altText,
      caption: mediaAssets.caption,
      sortOrder: mediaAssets.sortOrder,
      isFeatured: mediaAssets.isFeatured,
      processingStatus: mediaAssets.processingStatus,
      variants: mediaAssets.variants,
      createdAt: mediaAssets.createdAt,
      updatedAt: mediaAssets.updatedAt,
    };
  }

  private async dbSelectMediaAssets(
    dbOrTx: any,
    whereCond: any,
    orderByClauses?: any[]
  ): Promise<SubmissionMediaDbRowShape[]> {
    const caps = await this.getSchemaCapabilities(dbOrTx);
    let query = caps.hasMediaCustomerIdColumn
      ? dbOrTx.select().from(mediaAssets).where(whereCond)
      : dbOrTx.select(this.getLegacyMediaAssetSelection()).from(mediaAssets).where(whereCond);
    if (orderByClauses && orderByClauses.length > 0) {
      query = query.orderBy(...orderByClauses);
    }
    return await query;
  }

  private async dbInsertMediaAsset(
    dbOrTx: any,
    values: MediaAssetInsertRow
  ): Promise<SubmissionMediaDbRowShape> {
    const caps = await this.getSchemaCapabilities(dbOrTx);
    if (caps.hasMediaCustomerIdColumn) {
      const [inserted] = await dbOrTx.insert(mediaAssets).values(values).returning();
      return inserted;
    }

    const now = new Date();
    const createdAtVal = values.createdAt ?? now;
    const updatedAtVal = values.updatedAt ?? createdAtVal;
    const variantsJson = values.variants ? JSON.stringify(values.variants) : null;

    const res: any = await dbOrTx.execute(sql`
      INSERT INTO media_assets (
        id, entity_type, entity_id, filename, mime_type, category, media_type,
        width, height, file_size_bytes, storage_provider, storage_key,
        url, original_url, thumbnail_url, webp_url, avif_url, watermarked_url,
        watermark_applied, alt_text, caption, sort_order, is_featured,
        processing_status, variants, created_at, updated_at
      ) VALUES (
        ${values.id}, ${values.entityType}, ${values.entityId},
        ${values.filename}, ${values.mimeType}, ${values.category},
        ${values.mediaType ?? 'IMAGE'}, ${values.width ?? 0}, ${values.height ?? 0},
        ${values.fileSizeBytes ?? 0}, ${values.storageProvider ?? 'local'}, ${values.storageKey},
        ${values.url}, ${values.originalUrl}, ${values.thumbnailUrl ?? null},
        ${values.webpUrl ?? null}, ${values.avifUrl ?? null}, ${values.watermarkedUrl ?? null},
        ${values.watermarkApplied ?? false}, ${values.altText ?? null}, ${values.caption ?? null},
        ${values.sortOrder ?? 0}, ${values.isFeatured ?? false}, ${values.processingStatus ?? 'READY'},
        ${variantsJson}::jsonb, ${createdAtVal}, ${updatedAtVal}
      )
      RETURNING
        id,
        entity_type AS "entityType",
        entity_id AS "entityId",
        filename,
        mime_type AS "mimeType",
        category,
        media_type AS "mediaType",
        width,
        height,
        file_size_bytes AS "fileSizeBytes",
        storage_provider AS "storageProvider",
        storage_key AS "storageKey",
        url,
        original_url AS "originalUrl",
        thumbnail_url AS "thumbnailUrl",
        webp_url AS "webpUrl",
        avif_url AS "avifUrl",
        watermarked_url AS "watermarkedUrl",
        watermark_applied AS "watermarkApplied",
        alt_text AS "altText",
        caption,
        sort_order AS "sortOrder",
        is_featured AS "isFeatured",
        processing_status AS "processingStatus",
        variants,
        created_at AS "createdAt",
        updated_at AS "updatedAt"
    `);
    const rows = Array.isArray(res?.rows) ? res.rows : Array.isArray(res) ? res : [];
    return (
      rows[0] || {
        ...values,
        mediaType: values.mediaType ?? 'IMAGE',
        width: values.width ?? 0,
        height: values.height ?? 0,
        fileSizeBytes: values.fileSizeBytes ?? 0,
        storageProvider: values.storageProvider ?? 'local',
        thumbnailUrl: values.thumbnailUrl ?? null,
        webpUrl: values.webpUrl ?? null,
        avifUrl: values.avifUrl ?? null,
        watermarkedUrl: values.watermarkedUrl ?? null,
        watermarkApplied: values.watermarkApplied ?? false,
        altText: values.altText ?? null,
        caption: values.caption ?? null,
        sortOrder: values.sortOrder ?? 0,
        isFeatured: values.isFeatured ?? false,
        processingStatus: values.processingStatus ?? 'READY',
        variants: values.variants ?? null,
        createdAt: createdAtVal,
        updatedAt: updatedAtVal,
      }
    );
  }

  private async dbUpdateMediaAssetsReturning(
    dbOrTx: any,
    whereCond: any,
    patch: MediaAssetUpdateRow
  ): Promise<SubmissionMediaDbRowShape[]> {
    const caps = await this.getSchemaCapabilities(dbOrTx);
    return caps.hasMediaCustomerIdColumn
      ? await dbOrTx.update(mediaAssets).set(patch).where(whereCond).returning()
      : await dbOrTx
          .update(mediaAssets)
          .set(patch)
          .where(whereCond)
          .returning(this.getLegacyMediaAssetSelection());
  }

  private getLegacySubmissionSelection() {
    return {
      id: propertySubmissions.id,
      submitterCustomerId: propertySubmissions.submitterCustomerId,
      listingType: propertySubmissions.listingType,
      listingSource: propertySubmissions.listingSource,
      submissionStatus: propertySubmissions.submissionStatus,
      resaleListingId: propertySubmissions.resaleListingId,
      rentalListingId: propertySubmissions.rentalListingId,
      payload: propertySubmissions.payload,
      submittedAt: propertySubmissions.submittedAt,
      reviewedAt: propertySubmissions.reviewedAt,
      approvedAt: propertySubmissions.approvedAt,
      withdrawnAt: propertySubmissions.withdrawnAt,
      createdAt: propertySubmissions.createdAt,
      updatedAt: propertySubmissions.updatedAt,
    };
  }

  private hydrateSubmissionRow(row: any): SubmissionRecord {
    const rawPayload =
      typeof row.payload === 'object' && row.payload !== null
        ? (row.payload as Record<string, any>)
        : {};
    const meta =
      typeof rawPayload.__ghSubMeta === 'object' && rawPayload.__ghSubMeta !== null
        ? (rawPayload.__ghSubMeta as Record<string, any>)
        : {};
    const { __ghSubMeta: _omit, ...cleanPayload } = rawPayload;

    return {
      id: row.id,
      submitterCustomerId: row.submitterCustomerId,
      listingType: row.listingType,
      listingSource: row.listingSource,
      submissionStatus: row.submissionStatus,
      resaleListingId: row.resaleListingId ?? null,
      rentalListingId: row.rentalListingId ?? null,
      assignedReviewerId: row.assignedReviewerId ?? meta.assignedReviewerId ?? null,
      payload: cleanPayload,
      originalPayload: row.originalPayload ?? meta.originalPayload ?? null,
      curatedPayload: row.curatedPayload ?? meta.curatedPayload ?? null,
      reviewChecklist: row.reviewChecklist ?? meta.reviewChecklist ?? {},
      contactConfirmed:
        row.contactConfirmed !== undefined
          ? Boolean(row.contactConfirmed)
          : Boolean(meta.contactConfirmed),
      version:
        typeof row.version === 'number'
          ? row.version
          : typeof meta.version === 'number'
            ? meta.version
            : 1,
      submittedAt: row.submittedAt ? new Date(row.submittedAt) : null,
      reviewedAt: row.reviewedAt ? new Date(row.reviewedAt) : null,
      approvedAt: row.approvedAt ? new Date(row.approvedAt) : null,
      publishedAt: row.publishedAt
        ? new Date(row.publishedAt)
        : meta.publishedAt
          ? new Date(meta.publishedAt)
          : null,
      publishedByStaffId: row.publishedByStaffId ?? meta.publishedByStaffId ?? null,
      deactivatedAt: row.deactivatedAt
        ? new Date(row.deactivatedAt)
        : meta.deactivatedAt
          ? new Date(meta.deactivatedAt)
          : null,
      deactivatedByStaffId: row.deactivatedByStaffId ?? meta.deactivatedByStaffId ?? null,
      overrideReason: row.overrideReason ?? meta.overrideReason ?? null,
      overrideByStaffId: row.overrideByStaffId ?? meta.overrideByStaffId ?? null,
      overrideAt: row.overrideAt
        ? new Date(row.overrideAt)
        : meta.overrideAt
          ? new Date(meta.overrideAt)
          : null,
      withdrawnAt: row.withdrawnAt ? new Date(row.withdrawnAt) : null,
      createdAt: row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt),
      updatedAt: row.updatedAt instanceof Date ? row.updatedAt : new Date(row.updatedAt),
    };
  }

  private async dbSelectSubmissions(
    dbOrTx: any,
    whereCond?: any,
    orderByClauses?: any[]
  ): Promise<SubmissionRecord[]> {
    const caps = await this.getSchemaCapabilities(dbOrTx);
    let query = caps.hasExtendedSubmissionColumns
      ? dbOrTx.select().from(propertySubmissions)
      : dbOrTx.select(this.getLegacySubmissionSelection()).from(propertySubmissions);
    if (whereCond) {
      query = query.where(whereCond);
    }
    if (orderByClauses && orderByClauses.length > 0) {
      query = query.orderBy(...orderByClauses);
    }
    const rows = await query;
    return rows.map((r: any) => this.hydrateSubmissionRow(r));
  }

  private async dbInsertSubmission(
    dbOrTx: any,
    values: PropertySubmissionInsertRow
  ): Promise<SubmissionRecord> {
    const caps = await this.getSchemaCapabilities(dbOrTx);
    if (caps.hasExtendedSubmissionColumns) {
      const [inserted] = await dbOrTx.insert(propertySubmissions).values(values).returning();
      return this.hydrateSubmissionRow(inserted);
    }

    const basePayload =
      typeof values.payload === 'object' && values.payload !== null
        ? (values.payload as Record<string, any>)
        : {};
    const { __ghSubMeta: _omit, ...cleanPayload } = basePayload;
    const packedPayload = {
      ...cleanPayload,
      __ghSubMeta: {
        assignedReviewerId: values.assignedReviewerId ?? null,
        originalPayload: values.originalPayload ?? null,
        curatedPayload: values.curatedPayload ?? null,
        reviewChecklist: values.reviewChecklist ?? {},
        contactConfirmed: Boolean(values.contactConfirmed),
        version: typeof values.version === 'number' ? values.version : 1,
        publishedAt: values.publishedAt ? values.publishedAt.toISOString() : null,
        publishedByStaffId: values.publishedByStaffId ?? null,
        deactivatedAt: values.deactivatedAt ? values.deactivatedAt.toISOString() : null,
        deactivatedByStaffId: values.deactivatedByStaffId ?? null,
        overrideReason: values.overrideReason ?? null,
        overrideByStaffId: values.overrideByStaffId ?? null,
        overrideAt: values.overrideAt ? values.overrideAt.toISOString() : null,
        duplicateFlags: [],
        changeRequests: [],
      },
    };

    const packedPayloadJson = JSON.stringify(packedPayload);
    const createdAtVal = values.createdAt ?? new Date();
    const updatedAtVal = values.updatedAt ?? createdAtVal;
    const insertRes: any = await dbOrTx.execute(sql`
      INSERT INTO property_submissions (
        id,
        submitter_customer_id,
        listing_type,
        listing_source,
        submission_status,
        resale_listing_id,
        rental_listing_id,
        payload,
        submitted_at,
        reviewed_at,
        approved_at,
        withdrawn_at,
        created_at,
        updated_at
      ) VALUES (
        ${values.id},
        ${values.submitterCustomerId},
        ${values.listingType},
        ${values.listingSource},
        ${values.submissionStatus},
        ${values.resaleListingId ?? null},
        ${values.rentalListingId ?? null},
        ${packedPayloadJson}::jsonb,
        ${values.submittedAt ?? null},
        ${values.reviewedAt ?? null},
        ${values.approvedAt ?? null},
        ${values.withdrawnAt ?? null},
        ${createdAtVal},
        ${updatedAtVal}
      )
      RETURNING
        id,
        submitter_customer_id AS "submitterCustomerId",
        listing_type AS "listingType",
        listing_source AS "listingSource",
        submission_status AS "submissionStatus",
        resale_listing_id AS "resaleListingId",
        rental_listing_id AS "rentalListingId",
        payload,
        submitted_at AS "submittedAt",
        reviewed_at AS "reviewedAt",
        approved_at AS "approvedAt",
        withdrawn_at AS "withdrawnAt",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
    `);
    const rows = Array.isArray(insertRes?.rows) ? insertRes.rows : Array.isArray(insertRes) ? insertRes : [];
    const inserted = rows[0] || {
      id: values.id,
      submitterCustomerId: values.submitterCustomerId,
      listingType: values.listingType,
      listingSource: values.listingSource,
      submissionStatus: values.submissionStatus,
      resaleListingId: values.resaleListingId ?? null,
      rentalListingId: values.rentalListingId ?? null,
      payload: packedPayload,
      submittedAt: values.submittedAt ?? null,
      reviewedAt: values.reviewedAt ?? null,
      approvedAt: values.approvedAt ?? null,
      withdrawnAt: values.withdrawnAt ?? null,
      createdAt: createdAtVal,
      updatedAt: updatedAtVal,
    };

    return this.hydrateSubmissionRow(inserted);
  }

  private async dbUpdateSubmission(
    dbOrTx: any,
    id: string,
    patch: Partial<PropertySubmissionUpdateRow> & { __ghSubMetaPatch?: Record<string, any> },
    options?: {
      customerId?: string;
      allowedStatuses?: string[];
      expectedVersion?: number;
    }
  ): Promise<SubmissionRecord[]> {
    const caps = await this.getSchemaCapabilities(dbOrTx);
    if (caps.hasExtendedSubmissionColumns && !patch.__ghSubMetaPatch) {
      const whereConditions: any[] = [eq(propertySubmissions.id, id)];
      if (options?.customerId) {
        whereConditions.push(eq(propertySubmissions.submitterCustomerId, options.customerId));
      }
      if (options?.allowedStatuses && options.allowedStatuses.length > 0) {
        whereConditions.push(
          inArray(propertySubmissions.submissionStatus, options.allowedStatuses)
        );
      }
      if (typeof options?.expectedVersion === 'number') {
        whereConditions.push(eq(propertySubmissions.version, options.expectedVersion));
      }

      const { __ghSubMetaPatch: _ignore, ...cleanPatch } = patch;
      const updatedRows = await dbOrTx
        .update(propertySubmissions)
        .set(cleanPatch)
        .where(and(...whereConditions))
        .returning();
      return updatedRows.map((r: any) => this.hydrateSubmissionRow(r));
    }

    const whereConditions: any[] = [eq(propertySubmissions.id, id)];
    if (options?.customerId) {
      whereConditions.push(eq(propertySubmissions.submitterCustomerId, options.customerId));
    }
    if (options?.allowedStatuses && options.allowedStatuses.length > 0) {
      whereConditions.push(
        inArray(propertySubmissions.submissionStatus, options.allowedStatuses)
      );
    }

    const existingRows = await dbOrTx
      .select(this.getLegacySubmissionSelection())
      .from(propertySubmissions)
      .where(and(...whereConditions));
    const currentRaw = existingRows[0];
    if (!currentRaw) {
      return [];
    }

    const hydratedCurrent = this.hydrateSubmissionRow(currentRaw);
    const currentVersion = typeof hydratedCurrent.version === 'number' ? hydratedCurrent.version : 1;
    if (
      typeof options?.expectedVersion === 'number' &&
      currentVersion !== options.expectedVersion
    ) {
      return [];
    }

    const existingPayloadRaw =
      typeof currentRaw.payload === 'object' && currentRaw.payload !== null
        ? (currentRaw.payload as Record<string, any>)
        : {};
    const existingMeta =
      typeof existingPayloadRaw.__ghSubMeta === 'object' && existingPayloadRaw.__ghSubMeta !== null
        ? (existingPayloadRaw.__ghSubMeta as Record<string, any>)
        : {};

    const nextBasePayload =
      patch.payload !== undefined && typeof patch.payload === 'object' && patch.payload !== null
        ? (patch.payload as Record<string, any>)
        : (hydratedCurrent.payload as Record<string, any>);
    const { __ghSubMeta: _omit, ...cleanNextPayload } = nextBasePayload;

    const nextVersion =
      typeof patch.version === 'number'
        ? patch.version
        : patch.version !== undefined
          ? currentVersion + 1
          : currentVersion;

    const nextMeta: Record<string, any> = {
      ...existingMeta,
      assignedReviewerId:
        patch.assignedReviewerId !== undefined
          ? patch.assignedReviewerId
          : hydratedCurrent.assignedReviewerId ?? null,
      originalPayload:
        patch.originalPayload !== undefined
          ? patch.originalPayload
          : hydratedCurrent.originalPayload ?? null,
      curatedPayload:
        patch.curatedPayload !== undefined
          ? patch.curatedPayload
          : hydratedCurrent.curatedPayload ?? null,
      reviewChecklist:
        patch.reviewChecklist !== undefined
          ? patch.reviewChecklist
          : hydratedCurrent.reviewChecklist ?? {},
      contactConfirmed:
        patch.contactConfirmed !== undefined
          ? Boolean(patch.contactConfirmed)
          : Boolean(hydratedCurrent.contactConfirmed),
      version: nextVersion,
      publishedAt:
        patch.publishedAt !== undefined
          ? patch.publishedAt
            ? patch.publishedAt.toISOString()
            : null
          : hydratedCurrent.publishedAt
            ? hydratedCurrent.publishedAt.toISOString()
            : null,
      publishedByStaffId:
        patch.publishedByStaffId !== undefined
          ? patch.publishedByStaffId
          : hydratedCurrent.publishedByStaffId ?? null,
      deactivatedAt:
        patch.deactivatedAt !== undefined
          ? patch.deactivatedAt
            ? patch.deactivatedAt.toISOString()
            : null
          : hydratedCurrent.deactivatedAt
            ? hydratedCurrent.deactivatedAt.toISOString()
            : null,
      deactivatedByStaffId:
        patch.deactivatedByStaffId !== undefined
          ? patch.deactivatedByStaffId
          : hydratedCurrent.deactivatedByStaffId ?? null,
      overrideReason:
        patch.overrideReason !== undefined
          ? patch.overrideReason
          : hydratedCurrent.overrideReason ?? null,
      overrideByStaffId:
        patch.overrideByStaffId !== undefined
          ? patch.overrideByStaffId
          : hydratedCurrent.overrideByStaffId ?? null,
      overrideAt:
        patch.overrideAt !== undefined
          ? patch.overrideAt
            ? patch.overrideAt.toISOString()
            : null
          : hydratedCurrent.overrideAt
            ? hydratedCurrent.overrideAt.toISOString()
            : null,
      ...(patch.__ghSubMetaPatch || {}),
    };

    const legacyUpdateValues: Record<string, any> = {
      payload: {
        ...cleanNextPayload,
        __ghSubMeta: nextMeta,
      },
      updatedAt: patch.updatedAt ?? new Date(),
    };
    if (patch.listingType !== undefined) legacyUpdateValues.listingType = patch.listingType;
    if (patch.listingSource !== undefined) legacyUpdateValues.listingSource = patch.listingSource;
    if (patch.submissionStatus !== undefined)
      legacyUpdateValues.submissionStatus = patch.submissionStatus;
    if (patch.resaleListingId !== undefined)
      legacyUpdateValues.resaleListingId = patch.resaleListingId;
    if (patch.rentalListingId !== undefined)
      legacyUpdateValues.rentalListingId = patch.rentalListingId;
    if (patch.submittedAt !== undefined) legacyUpdateValues.submittedAt = patch.submittedAt;
    if (patch.reviewedAt !== undefined) legacyUpdateValues.reviewedAt = patch.reviewedAt;
    if (patch.approvedAt !== undefined) legacyUpdateValues.approvedAt = patch.approvedAt;
    if (patch.withdrawnAt !== undefined) legacyUpdateValues.withdrawnAt = patch.withdrawnAt;

    const updatedRows = await dbOrTx
      .update(propertySubmissions)
      .set(legacyUpdateValues)
      .where(and(...whereConditions))
      .returning(this.getLegacySubmissionSelection());

    return updatedRows.map((r: any) => this.hydrateSubmissionRow(r));
  }

  private async dbSelectReviews(
    dbOrTx: any,
    submissionIds: string[]
  ): Promise<SubmissionReviewRecord[]> {
    if (submissionIds.length === 0) return [];
    const caps = await this.getSchemaCapabilities(dbOrTx);
    const whereCond =
      submissionIds.length === 1
        ? eq(propertySubmissionReviews.submissionId, submissionIds[0])
        : inArray(propertySubmissionReviews.submissionId, submissionIds);

    if (caps.hasReviewMetadataColumn) {
      return await dbOrTx
        .select()
        .from(propertySubmissionReviews)
        .where(whereCond)
        .orderBy(asc(propertySubmissionReviews.createdAt));
    }

    const rows = await dbOrTx
      .select({
        id: propertySubmissionReviews.id,
        submissionId: propertySubmissionReviews.submissionId,
        staffUserId: propertySubmissionReviews.staffUserId,
        eventType: propertySubmissionReviews.eventType,
        previousStatus: propertySubmissionReviews.previousStatus,
        newStatus: propertySubmissionReviews.newStatus,
        internalNote: propertySubmissionReviews.internalNote,
        submitterFeedback: propertySubmissionReviews.submitterFeedback,
        createdAt: propertySubmissionReviews.createdAt,
      })
      .from(propertySubmissionReviews)
      .where(whereCond)
      .orderBy(asc(propertySubmissionReviews.createdAt));

    return rows.map((r: any) => ({ ...r, metadata: null }));
  }

  private async dbInsertReview(
    dbOrTx: any,
    values: PropertySubmissionReviewInsertRow
  ): Promise<void> {
    const caps = await this.getSchemaCapabilities(dbOrTx);
    if (caps.hasReviewMetadataColumn) {
      await dbOrTx.insert(propertySubmissionReviews).values(values);
      return;
    }
    await dbOrTx.execute(sql`
      INSERT INTO property_submission_reviews (
        id,
        submission_id,
        staff_user_id,
        event_type,
        previous_status,
        new_status,
        internal_note,
        submitter_feedback,
        created_at
      ) VALUES (
        ${values.id},
        ${values.submissionId},
        ${values.staffUserId ?? null},
        ${values.eventType},
        ${values.previousStatus ?? null},
        ${values.newStatus},
        ${values.internalNote ?? null},
        ${values.submitterFeedback ?? null},
        ${values.createdAt ?? new Date()}
      )
    `);
  }

  private async dbSelectDuplicateFlags(
    dbOrTx: any,
    submissionId: string
  ): Promise<DuplicateFlagRecord[]> {
    const caps = await this.getSchemaCapabilities(dbOrTx);
    if (caps.hasDuplicateFlagsTable) {
      return await dbOrTx
        .select()
        .from(propertySubmissionDuplicateFlags)
        .where(eq(propertySubmissionDuplicateFlags.submissionId, submissionId))
        .orderBy(desc(propertySubmissionDuplicateFlags.confidenceScore));
    }
    const rows = await dbOrTx
      .select(this.getLegacySubmissionSelection())
      .from(propertySubmissions)
      .where(eq(propertySubmissions.id, submissionId));
    const rawMeta = (rows[0]?.payload as any)?.__ghSubMeta;
    const list: any[] = Array.isArray(rawMeta?.duplicateFlags) ? rawMeta.duplicateFlags : [];
    return list.map((df) => ({
      ...df,
      createdAt: df.createdAt ? new Date(df.createdAt) : new Date(),
      updatedAt: df.updatedAt ? new Date(df.updatedAt) : new Date(),
      resolvedAt: df.resolvedAt ? new Date(df.resolvedAt) : null,
    }));
  }

  private async dbSelectChangeRequests(
    dbOrTx: any,
    submissionId: string,
    customerId?: string
  ): Promise<SubmissionChangeRequestRecord[]> {
    const caps = await this.getSchemaCapabilities(dbOrTx);
    if (caps.hasChangeRequestsTable) {
      const whereCond = customerId
        ? and(
            eq(propertySubmissionChangeRequests.submissionId, submissionId),
            eq(propertySubmissionChangeRequests.customerId, customerId)
          )
        : eq(propertySubmissionChangeRequests.submissionId, submissionId);
      const rows = await dbOrTx
        .select()
        .from(propertySubmissionChangeRequests)
        .where(whereCond)
        .orderBy(desc(propertySubmissionChangeRequests.createdAt));
      return rows as SubmissionChangeRequestRecord[];
    }
    const rows = await dbOrTx
      .select(this.getLegacySubmissionSelection())
      .from(propertySubmissions)
      .where(eq(propertySubmissions.id, submissionId));
    const rawMeta = (rows[0]?.payload as any)?.__ghSubMeta;
    const list: any[] = Array.isArray(rawMeta?.changeRequests) ? rawMeta.changeRequests : [];
    return list
      .filter((cr) => !customerId || cr.customerId === customerId)
      .map((cr) => ({
        ...cr,
        createdAt: cr.createdAt ? new Date(cr.createdAt) : new Date(),
        updatedAt: cr.updatedAt ? new Date(cr.updatedAt) : new Date(),
        resolvedAt: cr.resolvedAt ? new Date(cr.resolvedAt) : null,
      }));
  }

  async getPartnerEligibility(customerId: string): Promise<PartnerEligibilityStatus> {
    const backend = this.resolvePersistenceBackend();
    if (backend.mode === 'memory') {
      const memProfile = memoryPartnerProfiles.get(customerId) || null;
      return evaluatePartnerEligibility(customerId, memProfile);
    }

    return await this.runWithPersistenceGuard(async () => {
      const [profile] = await backend.db
        .select({
          id: customerPartnerProfiles.id,
          customerId: customerPartnerProfiles.customerId,
          status: customerPartnerProfiles.status,
        })
        .from(customerPartnerProfiles)
        .where(eq(customerPartnerProfiles.customerId, customerId));

      return evaluatePartnerEligibility(customerId, profile || null);
    });
  }

  async setMemoryPartnerProfileForTesting(
    customerId: string,
    status: 'ACTIVE' | 'PENDING' | 'REJECTED' | 'SUSPENDED' | 'REVOKED' | null
  ): Promise<void> {
    if (!this.isTestMemoryActive()) {
      throw new PropertySubmissionPersistenceError(
        'Test memory profile seeding requires NODE_ENV=test and explicit test memory activation.'
      );
    }
    if (!status) {
      memoryPartnerProfiles.delete(customerId);
    } else {
      memoryPartnerProfiles.set(customerId, {
        id: `prof_${customerId}`,
        customerId,
        status,
      });
    }
  }

  async setMemoryCustomerAccountTypeForTesting(
    customerId: string,
    account: {
      accountType: 'OWNER' | 'LISTING_PARTNER' | null;
      name?: string | null;
      phone?: string | null;
      email?: string | null;
    } | null
  ): Promise<void> {
    if (!this.isTestMemoryActive()) {
      throw new PropertySubmissionPersistenceError(
        'Test memory customer seeding requires NODE_ENV=test and explicit test memory activation.'
      );
    }
    if (!account) {
      memoryCustomerAccounts.delete(customerId);
    } else {
      memoryCustomerAccounts.set(customerId, {
        id: customerId,
        name: account.name ?? 'Test Submitter',
        phone: account.phone ?? null,
        email: account.email ?? null,
        accountType: account.accountType,
      });
    }
  }

  getReviewsForTesting(submissionId: string): SubmissionReviewRecord[] {
    if (!this.isTestMemoryActive()) {
      throw new PropertySubmissionPersistenceError(
        'Test review inspection requires NODE_ENV=test and explicit test memory activation.'
      );
    }
    return [...(memoryReviews.get(submissionId) || [])];
  }

  getAttestationsForTesting(submissionId: string): PartnerAttestationRecord[] {
    if (!this.isTestMemoryActive()) {
      throw new PropertySubmissionPersistenceError(
        'Test attestation inspection requires NODE_ENV=test and explicit test memory activation.'
      );
    }
    return [...(memoryAttestations.get(submissionId) || [])];
  }

  clearMemoryForTesting(): void {
    if (!this.isTestMemoryActive()) {
      throw new PropertySubmissionPersistenceError(
        'Clearing test memory requires NODE_ENV=test and explicit test memory activation.'
      );
    }
    memorySubmissions.clear();
    memoryReviews.clear();
    memoryAttestations.clear();
    memoryPartnerProfiles.clear();
    memorySubmissionMedia.clear();
    memoryDuplicateFlags.clear();
    memoryChangeRequests.clear();
    memoryCustomerAccounts.clear();
    memorySubmissionLocks.clear();
    this.inFlightTransitions.clear();
  }

  private async assertCustomerAccountTypeMatchesSource(
    backend: { mode: 'postgres'; db: DbClient } | { mode: 'memory' },
    customerId: string,
    listingSource: ListingSource
  ): Promise<void> {
    let accountType: string | null | undefined = undefined;
    if (backend.mode === 'memory') {
      accountType =
        memoryCustomerAccounts.get(customerId)?.accountType ??
        (await customerRepository.findById(customerId))?.accountType ??
        null;
    } else {
      const cust = await customerRepository.findById(customerId);
      if (!cust) {
        throw new PropertySubmissionDomainError('Customer account not found.', 404);
      }
      accountType = cust.accountType ?? null;
    }

    if (accountType === 'OWNER' && listingSource === 'PARTNER') {
      throw new PropertySubmissionDomainError(
        'Owner accounts cannot submit Listing Partner properties. Complete partner onboarding first.',
        403
      );
    }
    if (accountType === 'LISTING_PARTNER' && listingSource === 'OWNER') {
      throw new PropertySubmissionDomainError(
        'Listing Partner accounts must submit properties under the PARTNER source.',
        403
      );
    }

    if (listingSource === 'PARTNER') {
      const partnerCheck = await this.getPartnerEligibility(customerId);
      if (!partnerCheck.eligible) {
        throw new PropertySubmissionDomainError(partnerCheck.message, 403);
      }
    }
  }

  setSubmissionStatusForTesting(id: string, status: string): void {
    if (!this.isTestMemoryActive()) {
      throw new PropertySubmissionPersistenceError(
        'Test submission status mutation requires NODE_ENV=test and explicit test memory activation.'
      );
    }
    const existing = memorySubmissions.get(id);
    if (!existing) {
      throw new PropertySubmissionDomainError('Submission not found in test memory', 404);
    }
    const now = new Date();
    memorySubmissions.set(id, {
      ...existing,
      submissionStatus: status,
      reviewedAt:
        status === 'UNDER_REVIEW' ||
        status === 'CHANGES_REQUESTED' ||
        status === 'APPROVED' ||
        status === 'REJECTED'
          ? now
          : existing.reviewedAt,
      approvedAt: status === 'APPROVED' ? now : existing.approvedAt,
      publishedAt: status === 'PUBLISHED' ? now : existing.publishedAt,
      deactivatedAt: status === 'DEACTIVATED' ? now : existing.deactivatedAt,
      withdrawnAt: status === 'WITHDRAWN' ? now : existing.withdrawnAt,
      updatedAt: now,
    });
  }

  addReviewEventForTesting(input: {
    submissionId: string;
    newStatus: string;
    eventType?: string;
    staffUserId?: string | null;
    internalNote?: string | null;
    submitterFeedback?: string | null;
    createdAt?: Date;
  }): SubmissionReviewRecord {
    if (!this.isTestMemoryActive()) {
      throw new PropertySubmissionPersistenceError(
        'Test review seeding requires NODE_ENV=test and explicit test memory activation.'
      );
    }
    const existing = memorySubmissions.get(input.submissionId);
    if (!existing) {
      throw new PropertySubmissionDomainError('Submission not found in test memory', 404);
    }
    const now = input.createdAt || new Date();
    const previousStatus = existing.submissionStatus;
    const rev: SubmissionReviewRecord = {
      id: `rev_${uuidv4()}`,
      submissionId: input.submissionId,
      staffUserId: input.staffUserId ?? null,
      eventType: input.eventType || input.newStatus,
      previousStatus,
      newStatus: input.newStatus,
      internalNote: input.internalNote ?? null,
      submitterFeedback: input.submitterFeedback ?? null,
      createdAt: now,
    };
    const list = memoryReviews.get(input.submissionId) || [];
    list.push(rev);
    memoryReviews.set(input.submissionId, list);

    memorySubmissions.set(input.submissionId, {
      ...existing,
      submissionStatus: input.newStatus,
      reviewedAt:
        input.newStatus === 'UNDER_REVIEW' ||
        input.newStatus === 'CHANGES_REQUESTED' ||
        input.newStatus === 'APPROVED' ||
        input.newStatus === 'REJECTED'
          ? now
          : existing.reviewedAt,
      approvedAt: input.newStatus === 'APPROVED' ? now : existing.approvedAt,
      publishedAt: input.newStatus === 'PUBLISHED' ? now : existing.publishedAt,
      deactivatedAt: input.newStatus === 'DEACTIVATED' ? now : existing.deactivatedAt,
      withdrawnAt: input.newStatus === 'WITHDRAWN' ? now : existing.withdrawnAt,
      updatedAt: now,
    });

    return rev;
  }

  async createDraft(input: CreateSubmissionInput): Promise<SubmissionRecord> {
    const backend = this.resolvePersistenceBackend();

    await this.assertCustomerAccountTypeMatchesSource(
      backend,
      input.submitterCustomerId,
      input.listingSource
    );

    const id = `sub_${uuidv4()}`;
    const now = new Date();
    const initialPayload: Record<string, unknown> = {
      listingType: input.listingType,
      listingSource: input.listingSource,
      ...(typeof input.payload === 'object' && input.payload !== null ? input.payload : {}),
    };

    if (backend.mode === 'memory') {
      const record: SubmissionRecord = {
        id,
        submitterCustomerId: input.submitterCustomerId,
        listingType: input.listingType,
        listingSource: input.listingSource,
        submissionStatus: 'DRAFT',
        resaleListingId: null,
        rentalListingId: null,
        assignedReviewerId: null,
        payload: initialPayload,
        originalPayload: null,
        curatedPayload: null,
        reviewChecklist: {},
        contactConfirmed: false,
        version: 1,
        submittedAt: null,
        reviewedAt: null,
        approvedAt: null,
        publishedAt: null,
        publishedByStaffId: null,
        deactivatedAt: null,
        deactivatedByStaffId: null,
        overrideReason: null,
        overrideByStaffId: null,
        overrideAt: null,
        withdrawnAt: null,
        createdAt: now,
        updatedAt: now,
      };
      memorySubmissions.set(id, record);
      return record;
    }

    return await this.runWithPersistenceGuard(async () => {
      const insertValues: PropertySubmissionInsertRow = {
        id,
        submitterCustomerId: input.submitterCustomerId,
        listingType: input.listingType,
        listingSource: input.listingSource,
        submissionStatus: 'DRAFT',
        payload: initialPayload,
        originalPayload: null,
        curatedPayload: null,
        reviewChecklist: {},
        contactConfirmed: false,
        version: 1,
        createdAt: now,
        updatedAt: now,
      };

      return await this.dbInsertSubmission(backend.db, insertValues);
    });
  }

  async getById(id: string, customerId?: string): Promise<SubmissionRecord | null> {
    const backend = this.resolvePersistenceBackend();
    if (backend.mode === 'memory') {
      const existing = memorySubmissions.get(id) || null;
      if (!existing) return null;
      if (customerId && existing.submitterCustomerId !== customerId) {
        return null;
      }
      return existing;
    }

    return await this.runWithPersistenceGuard(async () => {
      const conditions = [eq(propertySubmissions.id, id)];
      if (customerId) {
        conditions.push(eq(propertySubmissions.submitterCustomerId, customerId));
      }

      const [sub] = await this.dbSelectSubmissions(backend.db, and(...conditions));
      return sub || null;
    });
  }

  async getByCustomer(customerId: string): Promise<SubmissionRecord[]> {
    const backend = this.resolvePersistenceBackend();
    if (backend.mode === 'memory') {
      return Array.from(memorySubmissions.values())
        .filter((s) => s.submitterCustomerId === customerId)
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    }

    return await this.runWithPersistenceGuard(async () => {
      return await this.dbSelectSubmissions(
        backend.db,
        eq(propertySubmissions.submitterCustomerId, customerId),
        [desc(propertySubmissions.updatedAt)]
      );
    });
  }

  async getSubmissionDetailForCustomer(
    id: string,
    customerId: string
  ): Promise<CustomerSubmissionDetail> {
    const backend = this.resolvePersistenceBackend();
    if (backend.mode === 'memory') {
      const existing = memorySubmissions.get(id) || null;
      if (!existing || existing.submitterCustomerId !== customerId) {
        throw new PropertySubmissionDomainError('Submission not found or unauthorized', 404);
      }
      const mediaList = [...(memorySubmissionMedia.get(id) || [])].sort(
        (a, b) => a.sortOrder - b.sortOrder || a.createdAt.getTime() - b.createdAt.getTime()
      );
      const reviewList = [...(memoryReviews.get(id) || [])];
      const changeReqList = [...(memoryChangeRequests.get(id) || [])].sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
      );

      let publishedSlug: string | null = null;
      if (existing.resaleListingId) {
        const rl = await resaleListingRepository.findById(existing.resaleListingId);
        publishedSlug = rl?.slug ?? null;
      } else if (existing.rentalListingId) {
        const rl = await rentalListingRepository.findById(existing.rentalListingId);
        publishedSlug = rl?.slug ?? null;
      }

      const summary = computeSubmissionSummary(existing, mediaList, reviewList, publishedSlug);
      const photos = Array.isArray(summary.payload.photos)
        ? (summary.payload.photos as SubmissionPhotoItem[])
        : [];
      const sanitizedReviews = [...reviewList]
        .filter((r) => r.eventType !== 'INTERNAL_NOTE')
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .map(sanitizeReviewForCustomer);

      const hydratedSubmission: SubmissionRecord = {
        ...existing,
        payload: summary.payload,
      };

      return {
        ...summary,
        submission: hydratedSubmission,
        photos,
        reviews: sanitizedReviews,
        changeRequests: changeReqList.map((cr) => ({
          id: cr.id,
          requestType: cr.requestType,
          reason: cr.reason,
          requestedChanges: cr.requestedChanges,
          status: cr.status,
          staffResponse: cr.staffResponse,
          resolvedAt: cr.resolvedAt ? cr.resolvedAt.toISOString() : null,
          createdAt: cr.createdAt.toISOString(),
        })),
      };
    }

    return await this.runWithPersistenceGuard(async () => {
      const [sub] = await this.dbSelectSubmissions(
        backend.db,
        and(
          eq(propertySubmissions.id, id),
          eq(propertySubmissions.submitterCustomerId, customerId)
        )
      );

      if (!sub) {
        throw new PropertySubmissionDomainError('Submission not found or unauthorized', 404);
      }

      const [mediaRows, reviewRows, changeReqRows] = await Promise.all([
        this.dbSelectMediaAssets(
          backend.db,
          and(eq(mediaAssets.entityType, 'SUBMISSION'), eq(mediaAssets.entityId, id)),
          [asc(mediaAssets.sortOrder), asc(mediaAssets.createdAt)]
        ),
        this.dbSelectReviews(backend.db, [id]),
        this.dbSelectChangeRequests(backend.db, id),
      ]);

      let publishedSlug: string | null = null;
      if (sub.resaleListingId) {
        const [rl] = await backend.db
          .select({ slug: resaleListings.slug })
          .from(resaleListings)
          .where(eq(resaleListings.id, sub.resaleListingId))
          .limit(1);
        publishedSlug = rl?.slug ?? null;
      } else if (sub.rentalListingId) {
        const [rl] = await backend.db
          .select({ slug: rentalListings.slug })
          .from(rentalListings)
          .where(eq(rentalListings.id, sub.rentalListingId))
          .limit(1);
        publishedSlug = rl?.slug ?? null;
      }

      const mediaList = mediaRows.map(mapDbRowToSubmissionMediaRecord);
      const summary = computeSubmissionSummary(sub, mediaList, reviewRows, publishedSlug);
      const photos = Array.isArray(summary.payload.photos)
        ? (summary.payload.photos as SubmissionPhotoItem[])
        : [];
      const sanitizedReviews = [...reviewRows]
        .filter((r) => r.eventType !== 'INTERNAL_NOTE')
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .map(sanitizeReviewForCustomer);

      const hydratedSubmission: SubmissionRecord = {
        ...sub,
        payload: summary.payload,
      };

      return {
        ...summary,
        submission: hydratedSubmission,
        photos,
        reviews: sanitizedReviews,
        changeRequests: changeReqRows.map((cr) => ({
          id: cr.id,
          requestType: cr.requestType === 'REMOVAL' ? 'REMOVAL' : 'CORRECTION',
          reason: cr.reason,
          requestedChanges: (cr.requestedChanges as Record<string, unknown> | null) || null,
          status: cr.status,
          staffResponse: cr.staffResponse ?? null,
          resolvedAt: cr.resolvedAt ? cr.resolvedAt.toISOString() : null,
          createdAt: cr.createdAt.toISOString(),
        })),
      };
    });
  }

  async listCustomerSubmissionsPaginated(
    customerId: string,
    options?: ListCustomerSubmissionsOptions
  ): Promise<PaginatedCustomerSubmissionsResult> {
    const rawPage = Number(options?.page ?? 1);
    const rawLimit = Number(options?.limit ?? 12);
    const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;
    const limit =
      Number.isFinite(rawLimit) && rawLimit >= 1 ? Math.min(Math.floor(rawLimit), 50) : 12;
    const statusFilterList = resolveStatusFilterList(options?.status);

    const backend = this.resolvePersistenceBackend();

    if (backend.mode === 'memory') {
      const allForCustomer = Array.from(memorySubmissions.values())
        .filter((s) => s.submitterCustomerId === customerId)
        .sort(
          (a, b) =>
            b.updatedAt.getTime() - a.updatedAt.getTime() ||
            b.createdAt.getTime() - a.createdAt.getTime()
        );

      const countsByStatus = {
        ALL: allForCustomer.length,
        DRAFT: allForCustomer.filter((s) => s.submissionStatus === 'DRAFT').length,
        SUBMITTED_OR_REVIEW: allForCustomer.filter(
          (s) => s.submissionStatus === 'SUBMITTED' || s.submissionStatus === 'UNDER_REVIEW'
        ).length,
        CHANGES_REQUESTED: allForCustomer.filter((s) => s.submissionStatus === 'CHANGES_REQUESTED')
          .length,
        APPROVED: allForCustomer.filter((s) => s.submissionStatus === 'APPROVED').length,
        PUBLISHED: allForCustomer.filter((s) => s.submissionStatus === 'PUBLISHED').length,
        DEACTIVATED: allForCustomer.filter((s) => s.submissionStatus === 'DEACTIVATED').length,
        WITHDRAWN_OR_CLOSED: allForCustomer.filter(
          (s) =>
            s.submissionStatus === 'WITHDRAWN' ||
            s.submissionStatus === 'WITHDRAWAL_REQUESTED' ||
            s.submissionStatus === 'REJECTED'
        ).length,
      };

      const filtered = statusFilterList
        ? allForCustomer.filter((s) => statusFilterList.includes(s.submissionStatus))
        : allForCustomer;

      const total = filtered.length;
      const totalPages = Math.max(1, Math.ceil(total / limit));
      const offset = (page - 1) * limit;
      const pagedRecords = filtered.slice(offset, offset + limit);

      const items = await Promise.all(
        pagedRecords.map(async (sub) => {
          const mediaList = memorySubmissionMedia.get(sub.id) || [];
          const reviewList = memoryReviews.get(sub.id) || [];
          let slug: string | null = null;
          if (sub.resaleListingId) {
            slug = (await resaleListingRepository.findById(sub.resaleListingId))?.slug ?? null;
          } else if (sub.rentalListingId) {
            slug = (await rentalListingRepository.findById(sub.rentalListingId))?.slug ?? null;
          }
          return computeSubmissionSummary(sub, mediaList, reviewList, slug);
        })
      );

      const hydratedSubmissions = pagedRecords.map((sub, idx) => ({
        ...sub,
        payload: items[idx].payload,
      }));

      return {
        items,
        submissions: hydratedSubmissions,
        pagination: {
          total,
          page,
          limit,
          totalPages,
        },
        countsByStatus,
      };
    }

    return await this.runWithPersistenceGuard(async () => {
      const compact = Boolean(options?.compact);
      const caps = await this.getSchemaCapabilities(backend.db);

      const pageWhere = statusFilterList
        ? and(
            eq(propertySubmissions.submitterCustomerId, customerId),
            inArray(propertySubmissions.submissionStatus, statusFilterList)
          )
        : eq(propertySubmissions.submitterCustomerId, customerId);

      const offset = (page - 1) * limit;

      // Run lightweight SQL GROUP BY counts and projected LIMIT/OFFSET page query in parallel
      // Explicitly omit heavy originalPayload, curatedPayload, reviewChecklist JSONB columns
      const dashboardSelection = caps.hasExtendedSubmissionColumns
        ? {
            id: propertySubmissions.id,
            submitterCustomerId: propertySubmissions.submitterCustomerId,
            listingType: propertySubmissions.listingType,
            listingSource: propertySubmissions.listingSource,
            submissionStatus: propertySubmissions.submissionStatus,
            resaleListingId: propertySubmissions.resaleListingId,
            rentalListingId: propertySubmissions.rentalListingId,
            assignedReviewerId: propertySubmissions.assignedReviewerId,
            payload: propertySubmissions.payload,
            contactConfirmed: propertySubmissions.contactConfirmed,
            version: propertySubmissions.version,
            submittedAt: propertySubmissions.submittedAt,
            reviewedAt: propertySubmissions.reviewedAt,
            approvedAt: propertySubmissions.approvedAt,
            publishedAt: propertySubmissions.publishedAt,
            publishedByStaffId: propertySubmissions.publishedByStaffId,
            deactivatedAt: propertySubmissions.deactivatedAt,
            deactivatedByStaffId: propertySubmissions.deactivatedByStaffId,
            overrideReason: propertySubmissions.overrideReason,
            overrideByStaffId: propertySubmissions.overrideByStaffId,
            overrideAt: propertySubmissions.overrideAt,
            withdrawnAt: propertySubmissions.withdrawnAt,
            createdAt: propertySubmissions.createdAt,
            updatedAt: propertySubmissions.updatedAt,
          }
        : this.getLegacySubmissionSelection();

      const [statusCountRows, rawPagedRows] = await Promise.all([
        backend.db
          .select({
            status: propertySubmissions.submissionStatus,
            count: sql<number>`count(*)::int`,
          })
          .from(propertySubmissions)
          .where(eq(propertySubmissions.submitterCustomerId, customerId))
          .groupBy(propertySubmissions.submissionStatus),

        backend.db
          .select(dashboardSelection)
          .from(propertySubmissions)
          .where(pageWhere)
          .orderBy(desc(propertySubmissions.updatedAt), desc(propertySubmissions.createdAt))
          .limit(limit)
          .offset(offset),
      ]);

      const rawCountMap = new Map<string, number>();
      let totalAll = 0;
      for (const row of statusCountRows) {
        const cnt = Number(row.count) || 0;
        rawCountMap.set(row.status, cnt);
        totalAll += cnt;
      }

      const countsByStatus = {
        ALL: totalAll,
        DRAFT: rawCountMap.get('DRAFT') || 0,
        SUBMITTED_OR_REVIEW:
          (rawCountMap.get('SUBMITTED') || 0) + (rawCountMap.get('UNDER_REVIEW') || 0),
        CHANGES_REQUESTED: rawCountMap.get('CHANGES_REQUESTED') || 0,
        APPROVED: rawCountMap.get('APPROVED') || 0,
        PUBLISHED: rawCountMap.get('PUBLISHED') || 0,
        DEACTIVATED: rawCountMap.get('DEACTIVATED') || 0,
        WITHDRAWN_OR_CLOSED:
          (rawCountMap.get('WITHDRAWN') || 0) +
          (rawCountMap.get('WITHDRAWAL_REQUESTED') || 0) +
          (rawCountMap.get('REJECTED') || 0),
      };

      const total = statusFilterList
        ? statusFilterList.reduce((acc, st) => acc + (rawCountMap.get(st) || 0), 0)
        : totalAll;
      const totalPages = Math.max(1, Math.ceil(total / limit));
      const pagedRecords = rawPagedRows.map((r: any) => this.hydrateSubmissionRow(r));

      if (pagedRecords.length === 0) {
        return {
          items: [],
          submissions: [],
          pagination: {
            total,
            page,
            limit,
            totalPages,
          },
          countsByStatus,
        };
      }

      const pagedIds = pagedRecords.map((s) => s.id);
      // In compact mode, only fetch reviews for cards that surface feedback badges (CHANGES_REQUESTED / REJECTED / DEACTIVATED);
      // full activity timeline is lazy-loaded via GET /api/customer/submissions/:id when expanded.
      const reviewTargetIds = compact
        ? pagedRecords
            .filter((s) =>
              ['CHANGES_REQUESTED', 'REJECTED', 'DEACTIVATED'].includes(s.submissionStatus)
            )
            .map((s) => s.id)
        : pagedIds;

      const resaleIds = pagedRecords
        .map((s) => s.resaleListingId)
        .filter((x): x is string => Boolean(x));
      const rentalIds = pagedRecords
        .map((s) => s.rentalListingId)
        .filter((x): x is string => Boolean(x));

      const [allMediaRows, allReviewRows, resaleSlugRows, rentalSlugRows] = await Promise.all([
        this.dbSelectMediaAssets(
          backend.db,
          and(
            eq(mediaAssets.entityType, 'SUBMISSION'),
            inArray(mediaAssets.entityId, pagedIds)
          ),
          [asc(mediaAssets.sortOrder), asc(mediaAssets.createdAt)]
        ),
        reviewTargetIds.length > 0
          ? this.dbSelectReviews(backend.db, reviewTargetIds)
          : Promise.resolve([]),
        resaleIds.length > 0
          ? backend.db
              .select({ id: resaleListings.id, slug: resaleListings.slug })
              .from(resaleListings)
              .where(inArray(resaleListings.id, resaleIds))
          : Promise.resolve([]),
        rentalIds.length > 0
          ? backend.db
              .select({ id: rentalListings.id, slug: rentalListings.slug })
              .from(rentalListings)
              .where(inArray(rentalListings.id, rentalIds))
          : Promise.resolve([]),
      ]);

      const resaleSlugMap = new Map<string, string | null>(
        resaleSlugRows.map((r) => [r.id, r.slug ?? null])
      );
      const rentalSlugMap = new Map<string, string | null>(
        rentalSlugRows.map((r) => [r.id, r.slug ?? null])
      );

      const mediaBySubmissionId = new Map<string, SubmissionMediaAssetRecord[]>();
      for (const row of allMediaRows) {
        const mapped = mapDbRowToSubmissionMediaRecord(row);
        const list = mediaBySubmissionId.get(row.entityId) || [];
        list.push(mapped);
        mediaBySubmissionId.set(row.entityId, list);
      }

      const reviewsBySubmissionId = new Map<string, SubmissionReviewRecord[]>();
      for (const row of allReviewRows) {
        const list = reviewsBySubmissionId.get(row.submissionId) || [];
        list.push(row);
        reviewsBySubmissionId.set(row.submissionId, list);
      }

      const items = pagedRecords.map((sub) => {
        const publishedSlug = sub.resaleListingId
          ? resaleSlugMap.get(sub.resaleListingId) ?? null
          : sub.rentalListingId
          ? rentalSlugMap.get(sub.rentalListingId) ?? null
          : null;
        return computeSubmissionSummary(
          sub,
          mediaBySubmissionId.get(sub.id) || [],
          reviewsBySubmissionId.get(sub.id) || [],
          publishedSlug
        );
      });

      const hydratedSubmissions = compact
        ? []
        : pagedRecords.map((sub, idx) => ({
            ...sub,
            payload: items[idx].payload,
          }));

      return {
        items,
        submissions: hydratedSubmissions,
        pagination: {
          total,
          page,
          limit,
          totalPages,
        },
        countsByStatus,
      };
    });
  }

  async updateDraft(
    id: string,
    customerId: string,
    payload: Record<string, unknown>,
    expectedVersion?: number
  ): Promise<SubmissionRecord> {
    const backend = this.resolvePersistenceBackend();
    const existing = await this.getById(id, customerId);
    if (!existing) {
      throw new PropertySubmissionDomainError('Submission not found or unauthorized', 404);
    }

    if (!SUBMITTABLE_STATUSES.includes(existing.submissionStatus)) {
      throw new PropertySubmissionDomainError(
        `Cannot update submission in status ${existing.submissionStatus}`,
        400
      );
    }

    const currentVersion = typeof existing.version === 'number' ? existing.version : 1;
    if (typeof expectedVersion === 'number' && currentVersion !== expectedVersion) {
      throw new PropertySubmissionDomainError(
        'This draft was modified in another session or tab. Please reload the latest version and try again.',
        409
      );
    }

    const rawSource =
      typeof payload?.listingSource === 'string' ? payload.listingSource : existing.listingSource;
    const nextListingSource: ListingSource = rawSource === 'PARTNER' ? 'PARTNER' : 'OWNER';

    await this.assertCustomerAccountTypeMatchesSource(backend, customerId, nextListingSource);

    const existingPayloadObj =
      typeof existing.payload === 'object' && existing.payload !== null
        ? (existing.payload as Record<string, unknown>)
        : {};

    const nextListingType =
      typeof payload?.listingType === 'string' ? payload.listingType : existing.listingType;

    const mergedPayload: Record<string, unknown> = {
      ...mergeSubmissionPayloads(existingPayloadObj, payload),
      listingType: nextListingType,
      listingSource: nextListingSource,
    };

    const now = new Date();
    if (backend.mode === 'memory') {
      const latest = memorySubmissions.get(id);
      if (
        !latest ||
        latest.submitterCustomerId !== customerId ||
        !SUBMITTABLE_STATUSES.includes(latest.submissionStatus)
      ) {
        throw new PropertySubmissionDomainError(
          `Cannot update submission in status ${latest?.submissionStatus || 'UNKNOWN'}`,
          400
        );
      }
      const latestVer = typeof latest.version === 'number' ? latest.version : 1;
      if (typeof expectedVersion === 'number' && latestVer !== expectedVersion) {
        throw new PropertySubmissionDomainError(
          'This draft was modified in another session or tab. Please reload the latest version and try again.',
          409
        );
      }
      const updated: SubmissionRecord = {
        ...latest,
        listingType: nextListingType,
        listingSource: nextListingSource,
        payload: mergedPayload,
        version: latestVer + 1,
        updatedAt: now,
      };
      memorySubmissions.set(id, updated);
      return updated;
    }

    return await this.runWithPersistenceGuard(async () => {
      const updateValues: PropertySubmissionUpdateRow = {
        listingType: nextListingType,
        listingSource: nextListingSource,
        payload: mergedPayload,
        version:
          typeof expectedVersion === 'number'
            ? expectedVersion + 1
            : sql`${propertySubmissions.version} + 1` as unknown as number,
        updatedAt: now,
      };

      const updatedRows = await this.dbUpdateSubmission(backend.db, id, updateValues, {
        customerId,
        allowedStatuses: [...SUBMITTABLE_STATUSES],
        expectedVersion,
      });

      if (updatedRows.length !== 1 || !updatedRows[0]) {
        throw new PropertySubmissionDomainError(
          typeof expectedVersion === 'number'
            ? 'Draft version conflict: another update was saved. Please reload the latest version.'
            : 'Cannot update submission because its status has changed or it is unauthorized.',
          409
        );
      }

      return updatedRows[0];
    });
  }

  async submitForReview(
    id: string,
    customerId: string,
    validatedPayload: Record<string, unknown>,
    _partnerConsent?: { declarationText?: string; version?: string }
  ): Promise<SubmissionRecord> {
    const backend = this.resolvePersistenceBackend();

    if (this.inFlightTransitions.has(id)) {
      throw new PropertySubmissionDomainError(
        'Cannot submit property: a concurrent status transition is already in progress.',
        409
      );
    }

    this.inFlightTransitions.add(id);
    try {
      const existing = await this.getById(id, customerId);
      if (!existing) {
        throw new PropertySubmissionDomainError('Submission not found or unauthorized', 404);
      }

      if (!SUBMITTABLE_STATUSES.includes(existing.submissionStatus)) {
        throw new PropertySubmissionDomainError(
          `Cannot submit property from status ${existing.submissionStatus}`,
          409
        );
      }

      const rawSource =
        typeof validatedPayload?.listingSource === 'string'
          ? validatedPayload.listingSource
          : existing.listingSource;
      const effectiveSource: ListingSource = rawSource === 'PARTNER' ? 'PARTNER' : 'OWNER';

      await this.assertCustomerAccountTypeMatchesSource(backend, customerId, effectiveSource);

      let canonicalDeclaration: { declarationText: string; attestationVersion: string };
      try {
        canonicalDeclaration = getCanonicalDeclarationForSource(effectiveSource);
      } catch (err: unknown) {
        const msg =
          err instanceof Error
            ? err.message
            : 'Server canonical legal declaration configuration is invalid.';
        throw new PropertySubmissionDomainError(msg, 500);
      }

      const now = new Date();
      const effectiveListingType =
        typeof validatedPayload?.listingType === 'string'
          ? validatedPayload.listingType
          : existing.listingType;

      const authoritativePayload: Record<string, unknown> = {
        ...validatedPayload,
        listingType: effectiveListingType,
        listingSource: effectiveSource,
        consent:
          effectiveSource === 'PARTNER'
            ? {
                ownerDeclarationAccepted: false,
                partnerAttestationAccepted: true,
                declarationText: canonicalDeclaration.declarationText,
                attestationVersion: canonicalDeclaration.attestationVersion,
                acceptedByCustomerId: customerId,
                acceptedAt: now.toISOString(),
              }
            : {
                ownerDeclarationAccepted: true,
                partnerAttestationAccepted: false,
                declarationText: canonicalDeclaration.declarationText,
                attestationVersion: canonicalDeclaration.attestationVersion,
                acceptedByCustomerId: customerId,
                acceptedAt: now.toISOString(),
              },
      };

      let resultRecord: SubmissionRecord;
      if (backend.mode === 'memory') {
        const current = memorySubmissions.get(id);
        if (!current || current.submitterCustomerId !== customerId) {
          throw new PropertySubmissionDomainError('Submission not found or unauthorized', 404);
        }
        if (!SUBMITTABLE_STATUSES.includes(current.submissionStatus)) {
          throw new PropertySubmissionDomainError(
            `Cannot submit property from status ${current.submissionStatus}`,
            409
          );
        }

        const previousStatus = current.submissionStatus;
        const eventType = previousStatus === 'CHANGES_REQUESTED' ? 'RESUBMITTED' : 'SUBMITTED';
        const updated: SubmissionRecord = {
          ...current,
          listingType: effectiveListingType,
          listingSource: effectiveSource,
          submissionStatus: 'SUBMITTED',
          payload: authoritativePayload,
          originalPayload: current.originalPayload ?? authoritativePayload,
          version: (typeof current.version === 'number' ? current.version : 1) + 1,
          submittedAt: now,
          updatedAt: now,
        };
        memorySubmissions.set(id, updated);

        const revList = memoryReviews.get(id) || [];
        revList.push({
          id: `rev_${uuidv4()}`,
          submissionId: id,
          eventType,
          previousStatus,
          newStatus: 'SUBMITTED',
          createdAt: now,
        });
        memoryReviews.set(id, revList);

        if (effectiveSource === 'PARTNER') {
          const attList = memoryAttestations.get(id) || [];
          attList.push({
            id: `att_${uuidv4()}`,
            submissionId: id,
            partnerCustomerId: customerId,
            attestationVersion: canonicalDeclaration.attestationVersion,
            declarationText: canonicalDeclaration.declarationText,
            acceptedAt: now,
          });
          memoryAttestations.set(id, attList);
        }

        try {
          await detectAndRecordDuplicates({
            memorySubmissions,
            memoryDuplicateFlags,
            submissionId: id,
            submitterCustomerId: customerId,
            listingType: effectiveListingType,
            payload: authoritativePayload,
          });
        } catch {
          // Non-blocking duplicate detection
        }

        resultRecord = updated;
      } else {
        resultRecord = await this.runWithPersistenceGuard(async () => {
          return await backend.db.transaction(async (tx) => {
            const [currentInTx] = await this.dbSelectSubmissions(
              tx,
              and(
                eq(propertySubmissions.id, id),
                eq(propertySubmissions.submitterCustomerId, customerId)
              )
            );

            if (!currentInTx) {
              throw new PropertySubmissionDomainError('Submission not found or unauthorized', 404);
            }

            if (!SUBMITTABLE_STATUSES.includes(currentInTx.submissionStatus)) {
              throw new PropertySubmissionDomainError(
                `Cannot submit property from status ${currentInTx.submissionStatus}`,
                409
              );
            }

            const updateValues: PropertySubmissionUpdateRow = {
              listingType: effectiveListingType,
              listingSource: effectiveSource,
              submissionStatus: 'SUBMITTED',
              payload: authoritativePayload,
              originalPayload: (currentInTx.originalPayload as Record<string, unknown> | null) ?? authoritativePayload,
              version: (currentInTx.version ?? 1) + 1,
              submittedAt: now,
              updatedAt: now,
            };

            const updatedRows = await this.dbUpdateSubmission(tx, id, updateValues, {
              customerId,
              allowedStatuses: [...SUBMITTABLE_STATUSES],
            });

            if (updatedRows.length !== 1 || !updatedRows[0]) {
              throw new PropertySubmissionDomainError(
                'Cannot submit property: status transition rejected because submission is no longer in an editable status.',
                409
              );
            }

            const updated = updatedRows[0];

            const eventType =
              currentInTx.submissionStatus === 'CHANGES_REQUESTED' ? 'RESUBMITTED' : 'SUBMITTED';
            const reviewValues: PropertySubmissionReviewInsertRow = {
              id: `rev_${uuidv4()}`,
              submissionId: id,
              eventType,
              previousStatus: currentInTx.submissionStatus,
              newStatus: 'SUBMITTED',
              createdAt: now,
            };
            await this.dbInsertReview(tx, reviewValues);

            if (effectiveSource === 'PARTNER') {
              const txCaps = await this.getSchemaCapabilities(tx);
              if (txCaps.hasPartnerAttestationsTable) {
                const attestationValues: PartnerAttestationInsertRow = {
                  id: `att_${uuidv4()}`,
                  submissionId: id,
                  partnerCustomerId: customerId,
                  attestationVersion: canonicalDeclaration.attestationVersion,
                  declarationText: canonicalDeclaration.declarationText,
                  acceptedAt: now,
                };
                await tx.insert(partnerAttestations).values(attestationValues);
              }
            }

            return updated;
          });
        });

        try {
          const flagged = await detectAndRecordDuplicates({
            db: backend.db,
            submissionId: id,
            submitterCustomerId: customerId,
            listingType: effectiveListingType,
            payload: authoritativePayload,
          });
          if (flagged.length > 0) {
            const caps = await this.getSchemaCapabilities(backend.db);
            if (!caps.hasDuplicateFlagsTable) {
              await this.dbUpdateSubmission(backend.db, id, {
                __ghSubMetaPatch: { duplicateFlags: flagged },
              });
            }
          }
        } catch {
          // Non-blocking duplicate detection
        }
      }

      await safeAuditRecord(
        null,
        'CUSTOMER',
        'SUBMIT',
        id,
        id,
        { status: existing.submissionStatus },
        { status: 'SUBMITTED', version: resultRecord.version }
      );
      await safeCreateNotification({
        customerId,
        type: 'SUBMISSION_STATUS_CHANGED',
        title: 'Property Submission Received',
        message: 'Your property listing is in the Great Homes verification queue.',
        resourceId: id,
        dedupKey: `sub_submitted_${id}_v${resultRecord.version ?? 1}`,
        metadata: { submissionId: id, status: 'SUBMITTED' },
      });

      return resultRecord;
    } finally {
      this.inFlightTransitions.delete(id);
    }
  }

  async withdraw(id: string, customerId: string): Promise<SubmissionRecord> {
    const backend = this.resolvePersistenceBackend();

    if (this.inFlightTransitions.has(id)) {
      throw new PropertySubmissionDomainError(
        'Cannot withdraw submission: a concurrent status transition is already in progress.',
        409
      );
    }

    this.inFlightTransitions.add(id);
    try {
      const existing = await this.getById(id, customerId);
      if (!existing) {
        throw new PropertySubmissionDomainError('Submission not found or unauthorized', 404);
      }

      if (!WITHDRAWABLE_STATUSES.includes(existing.submissionStatus)) {
        throw new PropertySubmissionDomainError(
          `Cannot withdraw submission in status ${existing.submissionStatus}`,
          409
        );
      }

      const now = new Date();
      let updatedRecord: SubmissionRecord;
      if (backend.mode === 'memory') {
        const current = memorySubmissions.get(id);
        if (!current || current.submitterCustomerId !== customerId) {
          throw new PropertySubmissionDomainError('Submission not found or unauthorized', 404);
        }
        if (!WITHDRAWABLE_STATUSES.includes(current.submissionStatus)) {
          throw new PropertySubmissionDomainError(
            `Cannot withdraw submission in status ${current.submissionStatus}`,
            409
          );
        }

        const previousStatus = current.submissionStatus;
        const updated: SubmissionRecord = {
          ...current,
          submissionStatus: 'WITHDRAWN',
          version: (typeof current.version === 'number' ? current.version : 1) + 1,
          withdrawnAt: now,
          updatedAt: now,
        };
        memorySubmissions.set(id, updated);

        const revList = memoryReviews.get(id) || [];
        revList.push({
          id: `rev_${uuidv4()}`,
          submissionId: id,
          eventType: 'WITHDRAWN',
          previousStatus,
          newStatus: 'WITHDRAWN',
          createdAt: now,
        });
        memoryReviews.set(id, revList);

        updatedRecord = updated;
      } else {
        updatedRecord = await this.runWithPersistenceGuard(async () => {
          return await backend.db.transaction(async (tx) => {
            const [currentInTx] = await this.dbSelectSubmissions(
              tx,
              and(
                eq(propertySubmissions.id, id),
                eq(propertySubmissions.submitterCustomerId, customerId)
              )
            );

            if (!currentInTx) {
              throw new PropertySubmissionDomainError('Submission not found or unauthorized', 404);
            }

            if (!WITHDRAWABLE_STATUSES.includes(currentInTx.submissionStatus)) {
              throw new PropertySubmissionDomainError(
                `Cannot withdraw submission in status ${currentInTx.submissionStatus}`,
                409
              );
            }

            const withdrawValues: PropertySubmissionUpdateRow = {
              submissionStatus: 'WITHDRAWN',
              version: (currentInTx.version ?? 1) + 1,
              withdrawnAt: now,
              updatedAt: now,
            };

            const updatedRows = await this.dbUpdateSubmission(tx, id, withdrawValues, {
              customerId,
              allowedStatuses: [...WITHDRAWABLE_STATUSES],
            });

            if (updatedRows.length !== 1 || !updatedRows[0]) {
              throw new PropertySubmissionDomainError(
                'Cannot withdraw submission: status transition rejected because submission status changed concurrently.',
                409
              );
            }

            const updated = updatedRows[0];

            const reviewValues: PropertySubmissionReviewInsertRow = {
              id: `rev_${uuidv4()}`,
              submissionId: id,
              eventType: 'WITHDRAWN',
              previousStatus: currentInTx.submissionStatus,
              newStatus: 'WITHDRAWN',
              createdAt: now,
            };
            await this.dbInsertReview(tx, reviewValues);

            return updated;
          });
        });
      }

      await safeAuditRecord(
        null,
        'CUSTOMER',
        'STATUS_CHANGED',
        id,
        id,
        { status: existing.submissionStatus },
        { status: 'WITHDRAWN' }
      );
      await safeCreateNotification({
        customerId,
        type: 'SUBMISSION_STATUS_CHANGED',
        title: 'Property Submission Withdrawn',
        message: 'Your property submission has been withdrawn from the verification queue.',
        resourceId: id,
        dedupKey: `sub_withdrawn_${id}_v${updatedRecord.version ?? 1}`,
        metadata: { submissionId: id, status: 'WITHDRAWN' },
      });

      return updatedRecord;
    } finally {
      this.inFlightTransitions.delete(id);
    }
  }

  async listSubmissionMedia(
    submissionId: string,
    customerId: string
  ): Promise<SubmissionMediaAssetRecord[]> {
    const backend = this.resolvePersistenceBackend();
    const submission = await this.getById(submissionId, customerId);
    if (!submission) {
      throw new PropertySubmissionDomainError('Submission not found or unauthorized', 404);
    }

    if (backend.mode === 'memory') {
      const list = memorySubmissionMedia.get(submissionId) || [];
      return [...list].sort(
        (a, b) => a.sortOrder - b.sortOrder || a.createdAt.getTime() - b.createdAt.getTime()
      );
    }

    return await this.runWithPersistenceGuard(async () => {
      const rows = await this.dbSelectMediaAssets(
        backend.db,
        and(eq(mediaAssets.entityType, 'SUBMISSION'), eq(mediaAssets.entityId, submissionId)),
        [asc(mediaAssets.sortOrder), asc(mediaAssets.createdAt)]
      );

      return rows.map(mapDbRowToSubmissionMediaRecord);
    });
  }

  async addSubmissionMediaWithAtomicCap(
    submissionId: string,
    customerId: string,
    asset: AddSubmissionMediaInput,
    maxPhotos: number = MAX_SUBMISSION_PHOTOS
  ): Promise<{ asset: SubmissionMediaAssetRecord; assets: SubmissionMediaAssetRecord[] }> {
    const backend = this.resolvePersistenceBackend();

    if (backend.mode === 'memory') {
      return await withMemorySubmissionLock(submissionId, async () => {
        const current = memorySubmissions.get(submissionId);
        if (!current || current.submitterCustomerId !== customerId) {
          throw new PropertySubmissionDomainError('Submission not found or unauthorized', 404);
        }
        if (!SUBMITTABLE_STATUSES.includes(current.submissionStatus)) {
          throw new PropertySubmissionDomainError(
            `Cannot modify photographs for submission in status ${current.submissionStatus}`,
            409
          );
        }

        const existingList = [...(memorySubmissionMedia.get(submissionId) || [])].sort(
          (a, b) => a.sortOrder - b.sortOrder || a.createdAt.getTime() - b.createdAt.getTime()
        );
        if (existingList.length >= maxPhotos) {
          throw new PropertySubmissionDomainError(
            `Maximum ${maxPhotos} property photographs are permitted per submission.`,
            400
          );
        }

        const now = new Date();
        const sortOrder = existingList.length;
        const isFeatured = existingList.length === 0 || !existingList.some((m) => m.isFeatured);
        const created: SubmissionMediaAssetRecord = {
          id: asset.id,
          entityType: 'SUBMISSION',
          entityId: submissionId,
          filename: asset.filename,
          mimeType: asset.mimeType,
          category: asset.category,
          mediaType: 'IMAGE',
          width: asset.width,
          height: asset.height,
          fileSizeBytes: asset.fileSizeBytes,
          storageProvider: asset.storageProvider,
          storageKey: asset.storageKey,
          url: normalizeMediaPublicUrl(asset.url) || asset.url,
          originalUrl: normalizeMediaPublicUrl(asset.originalUrl) || asset.originalUrl,
          thumbnailUrl: asset.thumbnailUrl || null,
          webpUrl: asset.webpUrl || null,
          watermarkedUrl: asset.watermarkedUrl || null,
          watermarkApplied: asset.watermarkApplied,
          caption: asset.caption ?? null,
          sortOrder,
          isFeatured,
          processingStatus: 'READY',
          variants: asset.variants || null,
          createdAt: now,
          updatedAt: now,
        };

        const nextList = [...existingList, created];
        memorySubmissionMedia.set(submissionId, nextList);

        const existingPayload =
          typeof current.payload === 'object' && current.payload !== null
            ? (current.payload as Record<string, unknown>)
            : {};
        memorySubmissions.set(submissionId, {
          ...current,
          payload: {
            ...existingPayload,
            photos: nextList.map(mapMediaAssetToSubmissionPhoto),
          },
          updatedAt: now,
        });

        return { asset: created, assets: nextList };
      });
    }

    return await this.runWithPersistenceGuard(async () => {

      return await backend.db.transaction(async (tx) => {
        await tx.execute(
          sql`SELECT id FROM property_submissions WHERE id = ${submissionId} AND submitter_customer_id = ${customerId} FOR UPDATE`
        );

        const [current] = await this.dbSelectSubmissions(
          tx,
          and(
            eq(propertySubmissions.id, submissionId),
            eq(propertySubmissions.submitterCustomerId, customerId)
          )
        );

        if (!current) {
          throw new PropertySubmissionDomainError('Submission not found or unauthorized', 404);
        }
        if (!SUBMITTABLE_STATUSES.includes(current.submissionStatus)) {
          throw new PropertySubmissionDomainError(
            `Cannot modify photographs for submission in status ${current.submissionStatus}`,
            409
          );
        }

        const existingRows = await this.dbSelectMediaAssets(
          tx,
          and(eq(mediaAssets.entityType, 'SUBMISSION'), eq(mediaAssets.entityId, submissionId)),
          [asc(mediaAssets.sortOrder), asc(mediaAssets.createdAt)]
        );

        if (existingRows.length >= maxPhotos) {
          throw new PropertySubmissionDomainError(
            `Maximum ${maxPhotos} property photographs are permitted per submission.`,
            400
          );
        }

        const now = new Date();
        const sortOrder = existingRows.length;
        const isFeatured = existingRows.length === 0 || !existingRows.some((m) => m.isFeatured);

        const insertMediaValues: MediaAssetInsertRow = {
          id: asset.id,
          entityType: 'SUBMISSION',
          entityId: submissionId,
          filename: asset.filename,
          mimeType: asset.mimeType,
          category: asset.category,
          mediaType: 'IMAGE',
          width: asset.width,
          height: asset.height,
          fileSizeBytes: asset.fileSizeBytes,
          storageProvider: asset.storageProvider,
          storageKey: asset.storageKey,
          url: asset.url,
          originalUrl: asset.originalUrl,
          thumbnailUrl: asset.thumbnailUrl || null,
          webpUrl: asset.webpUrl || null,
          watermarkedUrl: asset.watermarkedUrl || null,
          watermarkApplied: asset.watermarkApplied,
          caption: asset.caption ?? null,
          sortOrder,
          isFeatured,
          processingStatus: 'READY',
          variants: asset.variants || null,
          createdAt: now,
          updatedAt: now,
        };

        const inserted = await this.dbInsertMediaAsset(tx, insertMediaValues);

        const createdRecord = mapDbRowToSubmissionMediaRecord(inserted);
        const nextAssets = [...existingRows.map(mapDbRowToSubmissionMediaRecord), createdRecord];

        const existingPayload =
          typeof current.payload === 'object' && current.payload !== null
            ? (current.payload as Record<string, unknown>)
            : {};

        const subUpdateValues: PropertySubmissionUpdateRow = {
          payload: {
            ...existingPayload,
            photos: nextAssets.map(mapMediaAssetToSubmissionPhoto),
          },
          updatedAt: now,
        };

        await this.dbUpdateSubmission(tx, submissionId, subUpdateValues);

        return { asset: createdRecord, assets: nextAssets };
      });
    });
  }

  async reorderSubmissionMedia(
    submissionId: string,
    customerId: string,
    orderedMediaIds: string[]
  ): Promise<SubmissionMediaAssetRecord[]> {
    const backend = this.resolvePersistenceBackend();

    if (backend.mode === 'memory') {
      return await withMemorySubmissionLock(submissionId, async () => {
        const current = memorySubmissions.get(submissionId);
        if (!current || current.submitterCustomerId !== customerId) {
          throw new PropertySubmissionDomainError('Submission not found or unauthorized', 404);
        }
        if (!SUBMITTABLE_STATUSES.includes(current.submissionStatus)) {
          throw new PropertySubmissionDomainError(
            `Cannot reorder photographs for submission in status ${current.submissionStatus}`,
            409
          );
        }

        const existingList = memorySubmissionMedia.get(submissionId) || [];
        if (existingList.length !== orderedMediaIds.length) {
          throw new PropertySubmissionDomainError(
            'Reorder list must include every uploaded photograph for this submission.',
            400
          );
        }

        const byId = new Map(existingList.map((m) => [m.id, m]));
        const now = new Date();
        const reordered: SubmissionMediaAssetRecord[] = [];
        for (let i = 0; i < orderedMediaIds.length; i++) {
          const item = byId.get(orderedMediaIds[i]);
          if (!item) {
            throw new PropertySubmissionDomainError(
              `Photograph "${orderedMediaIds[i]}" does not belong to this submission.`,
              400
            );
          }
          reordered.push({ ...item, sortOrder: i, updatedAt: now });
        }

        memorySubmissionMedia.set(submissionId, reordered);
        const existingPayload =
          typeof current.payload === 'object' && current.payload !== null
            ? (current.payload as Record<string, unknown>)
            : {};
        memorySubmissions.set(submissionId, {
          ...current,
          payload: {
            ...existingPayload,
            photos: reordered.map(mapMediaAssetToSubmissionPhoto),
          },
          updatedAt: now,
        });

        return reordered;
      });
    }

    return await this.runWithPersistenceGuard(async () => {

      return await backend.db.transaction(async (tx) => {
        await tx.execute(
          sql`SELECT id FROM property_submissions WHERE id = ${submissionId} AND submitter_customer_id = ${customerId} FOR UPDATE`
        );

        const [current] = await this.dbSelectSubmissions(
          tx,
          and(
            eq(propertySubmissions.id, submissionId),
            eq(propertySubmissions.submitterCustomerId, customerId)
          )
        );

        if (!current) {
          throw new PropertySubmissionDomainError('Submission not found or unauthorized', 404);
        }
        if (!SUBMITTABLE_STATUSES.includes(current.submissionStatus)) {
          throw new PropertySubmissionDomainError(
            `Cannot reorder photographs for submission in status ${current.submissionStatus}`,
            409
          );
        }

        const existingRows = await this.dbSelectMediaAssets(
          tx,
          and(eq(mediaAssets.entityType, 'SUBMISSION'), eq(mediaAssets.entityId, submissionId))
        );

        if (existingRows.length !== orderedMediaIds.length) {
          throw new PropertySubmissionDomainError(
            'Reorder list must include every uploaded photograph for this submission.',
            400
          );
        }

        const byId = new Map(existingRows.map((r) => [r.id, r]));
        const now = new Date();
        const reordered: SubmissionMediaAssetRecord[] = [];

        for (let i = 0; i < orderedMediaIds.length; i++) {
          const mediaId = orderedMediaIds[i];
          if (!byId.has(mediaId)) {
            throw new PropertySubmissionDomainError(
              `Photograph "${mediaId}" does not belong to this submission.`,
              400
            );
          }
          const mediaReorderValues: MediaAssetUpdateRow = {
            sortOrder: i,
            updatedAt: now,
          };
          const [updatedRow] = await this.dbUpdateMediaAssetsReturning(
            tx,
            and(
              eq(mediaAssets.id, mediaId),
              eq(mediaAssets.entityType, 'SUBMISSION'),
              eq(mediaAssets.entityId, submissionId)
            ),
            mediaReorderValues
          );
          reordered.push(mapDbRowToSubmissionMediaRecord(updatedRow));
        }

        const existingPayload =
          typeof current.payload === 'object' && current.payload !== null
            ? (current.payload as Record<string, unknown>)
            : {};

        const subReorderUpdate: PropertySubmissionUpdateRow = {
          payload: {
            ...existingPayload,
            photos: reordered.map(mapMediaAssetToSubmissionPhoto),
          },
          updatedAt: now,
        };

        await this.dbUpdateSubmission(tx, submissionId, subReorderUpdate);

        return reordered;
      });
    });
  }

  async updateSubmissionMediaAsset(
    submissionId: string,
    customerId: string,
    mediaId: string,
    patch: UpdateSubmissionMediaInput
  ): Promise<SubmissionMediaAssetRecord[]> {
    const backend = this.resolvePersistenceBackend();

    if (backend.mode === 'memory') {
      return await withMemorySubmissionLock(submissionId, async () => {
        const current = memorySubmissions.get(submissionId);
        if (!current || current.submitterCustomerId !== customerId) {
          throw new PropertySubmissionDomainError('Submission not found or unauthorized', 404);
        }
        if (!SUBMITTABLE_STATUSES.includes(current.submissionStatus)) {
          throw new PropertySubmissionDomainError(
            `Cannot update photograph for submission in status ${current.submissionStatus}`,
            409
          );
        }

        const existingList = [...(memorySubmissionMedia.get(submissionId) || [])].sort(
          (a, b) => a.sortOrder - b.sortOrder || a.createdAt.getTime() - b.createdAt.getTime()
        );
        const targetIndex = existingList.findIndex((m) => m.id === mediaId);
        if (targetIndex === -1) {
          throw new PropertySubmissionDomainError('Photograph not found for this submission.', 404);
        }

        const now = new Date();
        const updatedList = existingList.map((m) => {
          if (m.id === mediaId) {
            return {
              ...m,
              isFeatured: patch.isFeatured === true ? true : m.isFeatured,
              category: patch.category !== undefined ? patch.category : m.category,
              caption: patch.caption !== undefined ? patch.caption : m.caption,
              updatedAt: now,
            };
          }
          return patch.isFeatured === true ? { ...m, isFeatured: false, updatedAt: now } : m;
        });

        memorySubmissionMedia.set(submissionId, updatedList);
        const existingPayload =
          typeof current.payload === 'object' && current.payload !== null
            ? (current.payload as Record<string, unknown>)
            : {};
        memorySubmissions.set(submissionId, {
          ...current,
          payload: {
            ...existingPayload,
            photos: updatedList.map(mapMediaAssetToSubmissionPhoto),
          },
          updatedAt: now,
        });

        return updatedList;
      });
    }

    return await this.runWithPersistenceGuard(async () => {

      return await backend.db.transaction(async (tx) => {
        await tx.execute(
          sql`SELECT id FROM property_submissions WHERE id = ${submissionId} AND submitter_customer_id = ${customerId} FOR UPDATE`
        );

        const [current] = await this.dbSelectSubmissions(
          tx,
          and(
            eq(propertySubmissions.id, submissionId),
            eq(propertySubmissions.submitterCustomerId, customerId)
          )
        );

        if (!current) {
          throw new PropertySubmissionDomainError('Submission not found or unauthorized', 404);
        }
        if (!SUBMITTABLE_STATUSES.includes(current.submissionStatus)) {
          throw new PropertySubmissionDomainError(
            `Cannot update photograph for submission in status ${current.submissionStatus}`,
            409
          );
        }

        const [target] = await this.dbSelectMediaAssets(
          tx,
          and(
            eq(mediaAssets.id, mediaId),
            eq(mediaAssets.entityType, 'SUBMISSION'),
            eq(mediaAssets.entityId, submissionId)
          )
        );

        if (!target) {
          throw new PropertySubmissionDomainError('Photograph not found for this submission.', 404);
        }

        const now = new Date();
        if (patch.isFeatured === true) {
          const resetFeaturedValues: MediaAssetUpdateRow = {
            isFeatured: false,
            updatedAt: now,
          };
          await tx
            .update(mediaAssets)
            .set(resetFeaturedValues)
            .where(
              and(eq(mediaAssets.entityType, 'SUBMISSION'), eq(mediaAssets.entityId, submissionId))
            );
        }

        const updateFields: MediaAssetUpdateRow = {
          updatedAt: now,
        };
        if (patch.isFeatured === true) updateFields.isFeatured = true;
        if (patch.category !== undefined) updateFields.category = patch.category;
        if (patch.caption !== undefined) updateFields.caption = patch.caption;

        await tx
          .update(mediaAssets)
          .set(updateFields)
          .where(
            and(
              eq(mediaAssets.id, mediaId),
              eq(mediaAssets.entityType, 'SUBMISSION'),
              eq(mediaAssets.entityId, submissionId)
            )
          );

        const refreshedRows = await this.dbSelectMediaAssets(
          tx,
          and(eq(mediaAssets.entityType, 'SUBMISSION'), eq(mediaAssets.entityId, submissionId)),
          [asc(mediaAssets.sortOrder), asc(mediaAssets.createdAt)]
        );

        const refreshedAssets = refreshedRows.map(mapDbRowToSubmissionMediaRecord);
        const existingPayload =
          typeof current.payload === 'object' && current.payload !== null
            ? (current.payload as Record<string, unknown>)
            : {};

        const subPatchUpdate: PropertySubmissionUpdateRow = {
          payload: {
            ...existingPayload,
            photos: refreshedAssets.map(mapMediaAssetToSubmissionPhoto),
          },
          updatedAt: now,
        };

        await this.dbUpdateSubmission(tx, submissionId, subPatchUpdate);

        return refreshedAssets;
      });
    });
  }

  async deleteSubmissionMediaAsset(
    submissionId: string,
    customerId: string,
    mediaId: string
  ): Promise<{
    deletedAsset: SubmissionMediaAssetRecord;
    remainingAssets: SubmissionMediaAssetRecord[];
    remainingReferencesCount: number;
  }> {
    const backend = this.resolvePersistenceBackend();

    if (backend.mode === 'memory') {
      return await withMemorySubmissionLock(submissionId, async () => {
        const current = memorySubmissions.get(submissionId);
        if (!current || current.submitterCustomerId !== customerId) {
          throw new PropertySubmissionDomainError('Submission not found or unauthorized', 404);
        }
        if (!SUBMITTABLE_STATUSES.includes(current.submissionStatus)) {
          throw new PropertySubmissionDomainError(
            `Cannot delete photograph for submission in status ${current.submissionStatus}`,
            409
          );
        }

        const existingList = [...(memorySubmissionMedia.get(submissionId) || [])].sort(
          (a, b) => a.sortOrder - b.sortOrder || a.createdAt.getTime() - b.createdAt.getTime()
        );
        const deleted = existingList.find((m) => m.id === mediaId);
        if (!deleted) {
          throw new PropertySubmissionDomainError('Photograph not found for this submission.', 404);
        }

        const now = new Date();
        let remaining = existingList
          .filter((m) => m.id !== mediaId)
          .map((m, idx) => ({ ...m, sortOrder: idx, updatedAt: now }));

        if (remaining.length > 0 && !remaining.some((m) => m.isFeatured)) {
          remaining = remaining.map((m, idx) =>
            idx === 0 ? { ...m, isFeatured: true, updatedAt: now } : m
          );
        }

        memorySubmissionMedia.set(submissionId, remaining);

        let refCount = 0;
        for (const list of memorySubmissionMedia.values()) {
          for (const item of list) {
            if (item.storageKey === deleted.storageKey) refCount += 1;
          }
        }

        const existingPayload =
          typeof current.payload === 'object' && current.payload !== null
            ? (current.payload as Record<string, unknown>)
            : {};
        memorySubmissions.set(submissionId, {
          ...current,
          payload: {
            ...existingPayload,
            photos: remaining.map(mapMediaAssetToSubmissionPhoto),
          },
          updatedAt: now,
        });

        return {
          deletedAsset: deleted,
          remainingAssets: remaining,
          remainingReferencesCount: refCount,
        };
      });
    }

    return await this.runWithPersistenceGuard(async () => {

      return await backend.db.transaction(async (tx) => {
        await tx.execute(
          sql`SELECT id FROM property_submissions WHERE id = ${submissionId} AND submitter_customer_id = ${customerId} FOR UPDATE`
        );

        const [current] = await this.dbSelectSubmissions(
          tx,
          and(
            eq(propertySubmissions.id, submissionId),
            eq(propertySubmissions.submitterCustomerId, customerId)
          )
        );

        if (!current) {
          throw new PropertySubmissionDomainError('Submission not found or unauthorized', 404);
        }
        if (!SUBMITTABLE_STATUSES.includes(current.submissionStatus)) {
          throw new PropertySubmissionDomainError(
            `Cannot delete photograph for submission in status ${current.submissionStatus}`,
            409
          );
        }

        const [targetRow] = await this.dbSelectMediaAssets(
          tx,
          and(
            eq(mediaAssets.id, mediaId),
            eq(mediaAssets.entityType, 'SUBMISSION'),
            eq(mediaAssets.entityId, submissionId)
          )
        );

        if (!targetRow) {
          throw new PropertySubmissionDomainError('Photograph not found for this submission.', 404);
        }

        const deletedAsset = mapDbRowToSubmissionMediaRecord(targetRow);

        await tx
          .delete(mediaAssets)
          .where(
            and(
              eq(mediaAssets.id, mediaId),
              eq(mediaAssets.entityType, 'SUBMISSION'),
              eq(mediaAssets.entityId, submissionId)
            )
          );

        const remainingRows = await this.dbSelectMediaAssets(
          tx,
          and(eq(mediaAssets.entityType, 'SUBMISSION'), eq(mediaAssets.entityId, submissionId)),
          [asc(mediaAssets.sortOrder), asc(mediaAssets.createdAt)]
        );

        const now = new Date();
        const needsFeaturedPromotion =
          remainingRows.length > 0 && !remainingRows.some((r) => r.isFeatured);

        const remainingAssets: SubmissionMediaAssetRecord[] = [];
        for (let i = 0; i < remainingRows.length; i++) {
          const row = remainingRows[i];
          const nextFeatured = needsFeaturedPromotion ? i === 0 : row.isFeatured;
          if (row.sortOrder !== i || row.isFeatured !== nextFeatured) {
            const mediaDeleteReorderValues: MediaAssetUpdateRow = {
              sortOrder: i,
              isFeatured: nextFeatured,
              updatedAt: now,
            };
            const [updatedRow] = await this.dbUpdateMediaAssetsReturning(
              tx,
              eq(mediaAssets.id, row.id),
              mediaDeleteReorderValues
            );
            remainingAssets.push(mapDbRowToSubmissionMediaRecord(updatedRow));
          } else {
            remainingAssets.push(mapDbRowToSubmissionMediaRecord(row));
          }
        }

        const refCountRes = await tx
          .select({ cnt: sql<number>`count(*)::int` })
          .from(mediaAssets)
          .where(eq(mediaAssets.storageKey, deletedAsset.storageKey));
        const remainingReferencesCount = Number(refCountRes[0]?.cnt ?? 0);

        const existingPayload =
          typeof current.payload === 'object' && current.payload !== null
            ? (current.payload as Record<string, unknown>)
            : {};

        const subDeleteUpdate: PropertySubmissionUpdateRow = {
          payload: {
            ...existingPayload,
            photos: remainingAssets.map(mapMediaAssetToSubmissionPhoto),
          },
          updatedAt: now,
        };

        await this.dbUpdateSubmission(tx, submissionId, subDeleteUpdate);

        return {
          deletedAsset,
          remainingAssets,
          remainingReferencesCount,
        };
      });
    });
  }

  private mapStaffQueueItem(s: SubmissionRecord, nowMs: number) {
    const effective = ((s.curatedPayload || s.payload || {}) as Record<string, any>);
    const location = (effective.location || {}) as Record<string, any>;
    const details = (effective.details || {}) as Record<string, any>;
    const submittedMs = s.submittedAt ? new Date(s.submittedAt).getTime() : new Date(s.createdAt).getTime();
    const queueAgeHours = Math.max(0, Math.round((nowMs - submittedMs) / (1000 * 60 * 60)));
    const slaStatus =
      s.submissionStatus === 'SUBMITTED' || s.submissionStatus === 'UNDER_REVIEW'
        ? queueAgeHours > 48
          ? 'BREACHED'
          : queueAgeHours > 24
          ? 'WARNING'
          : 'ON_TRACK'
        : 'ON_TRACK';

    const priceNum =
      s.listingType === 'RENTAL'
        ? Number(details.monthlyRent ?? 0)
        : Number(details.askingPrice ?? details.expectedPrice ?? 0);
    const priceLabel =
      Number.isFinite(priceNum) && priceNum > 0
        ? formatIndianCurrencyShort(priceNum, s.listingType === 'RENTAL')
        : null;

    const assignedReviewerId =
      s.assignedReviewerId ??
      (typeof (s.payload as any)?.assignedReviewerId === 'string'
        ? (s.payload as any).assignedReviewerId
        : null);

    return {
      id: s.id,
      referenceId: `GH-${s.id.replace(/^sub_/, '').slice(0, 8).toUpperCase()}`,
      submitterCustomerId: s.submitterCustomerId,
      listingType: s.listingType,
      listingSource: s.listingSource,
      propertyType: effective.propertyType || null,
      submissionStatus: s.submissionStatus,
      title:
        details.title ||
        effective.title ||
        `${effective.propertyType || 'Property'} in ${location.locality || location.city || 'Kolkata'}`,
      city: location.city || 'Kolkata',
      locality: location.customLocalityDisplay || location.locality || null,
      projectName: location.customProjectDisplay || location.projectName || effective.projectName || null,
      priceLabel,
      assignedReviewerId,
      contactConfirmed: Boolean(s.contactConfirmed),
      version: typeof s.version === 'number' ? s.version : 1,
      queueAgeHours,
      slaStatus,
      createdAt: s.createdAt instanceof Date ? s.createdAt.toISOString() : new Date(s.createdAt).toISOString(),
      updatedAt: s.updatedAt instanceof Date ? s.updatedAt.toISOString() : new Date(s.updatedAt).toISOString(),
      submittedAt: s.submittedAt
        ? s.submittedAt instanceof Date
          ? s.submittedAt.toISOString()
          : new Date(s.submittedAt).toISOString()
        : null,
      publishedAt: s.publishedAt
        ? s.publishedAt instanceof Date
          ? s.publishedAt.toISOString()
          : new Date(s.publishedAt).toISOString()
        : null,
      deactivatedAt: s.deactivatedAt
        ? s.deactivatedAt instanceof Date
          ? s.deactivatedAt.toISOString()
          : new Date(s.deactivatedAt).toISOString()
        : null,
    };
  }

  async listSubmissionsForStaff(options: {
    status?: string;
    propertyType?: string;
    listingPurpose?: string;
    listingSource?: string;
    assignedReviewerId?: string;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<{ items: any[]; total: number; page: number; limit: number; countsByStatus: Record<string, number> }> {
    const page = options.page || 1;
    const limit = options.limit || 20;
    const nowMs = Date.now();

    const applyFilters = (rows: SubmissionRecord[]) => {
      let filtered = rows;
      if (!options.status || options.status === 'ALL') {
        filtered = filtered.filter((s) => s.submissionStatus !== 'DRAFT');
      } else {
        filtered = filtered.filter((s) => s.submissionStatus === options.status);
      }
      if (options.propertyType && options.propertyType !== 'ALL') {
        filtered = filtered.filter((s) => {
          const eff = ((s.curatedPayload || s.payload || {}) as Record<string, any>);
          return eff.propertyType === options.propertyType;
        });
      }
      if (options.listingPurpose && options.listingPurpose !== 'ALL') {
        filtered = filtered.filter((s) => s.listingType === options.listingPurpose);
      }
      if (options.listingSource && options.listingSource !== 'ALL') {
        filtered = filtered.filter((s) => s.listingSource === options.listingSource);
      }
      if (options.assignedReviewerId) {
        filtered = filtered.filter(
          (s) =>
            s.assignedReviewerId === options.assignedReviewerId ||
            (s.payload as any)?.assignedReviewerId === options.assignedReviewerId
        );
      }
      if (options.search) {
        const q = options.search.trim().toLowerCase();
        if (q) {
          filtered = filtered.filter(
            (s) =>
              s.id.toLowerCase().includes(q) ||
              `gh-${s.id.replace(/^sub_/, '').slice(0, 8)}`.toLowerCase().includes(q) ||
              JSON.stringify(s.curatedPayload || s.payload).toLowerCase().includes(q)
          );
        }
      }
      return filtered;
    };

    const computeCounts = (rows: SubmissionRecord[]): Record<string, number> => {
      const nonDraftCount = rows.filter((s) => s.submissionStatus !== 'DRAFT').length;
      const countsByStatus: Record<string, number> = {
        ALL: nonDraftCount,
        SUBMITTED: 0,
        UNDER_REVIEW: 0,
        CHANGES_REQUESTED: 0,
        APPROVED: 0,
        PUBLISHED: 0,
        DEACTIVATED: 0,
        REJECTED: 0,
        WITHDRAWN: 0,
        DRAFT: 0,
      };
      for (const s of rows) {
        countsByStatus[s.submissionStatus] = (countsByStatus[s.submissionStatus] || 0) + 1;
      }
      return countsByStatus;
    };

    const backend = this.resolvePersistenceBackend();
    if (backend.mode === 'memory') {
      const allRows = Array.from(memorySubmissions.values()).sort(
        (a, b) =>
          (b.submittedAt?.getTime() || b.createdAt.getTime()) -
          (a.submittedAt?.getTime() || a.createdAt.getTime())
      );
      const filtered = applyFilters(allRows);
      const total = filtered.length;
      const startIndex = (page - 1) * limit;
      const paginated = filtered.slice(startIndex, startIndex + limit);

      return {
        items: paginated.map((s) => this.mapStaffQueueItem(s, nowMs)),
        total,
        page,
        limit,
        countsByStatus: computeCounts(allRows),
      };
    }

    return await this.runWithPersistenceGuard(async () => {
      const allRows = await this.dbSelectSubmissions(
        backend.db,
        undefined,
        [desc(propertySubmissions.submittedAt), desc(propertySubmissions.createdAt)]
      );
      const filtered = applyFilters(allRows);
      const total = filtered.length;
      const startIndex = (page - 1) * limit;
      const paginated = filtered.slice(startIndex, startIndex + limit);

      return {
        items: paginated.map((s) => this.mapStaffQueueItem(s, nowMs)),
        total,
        page,
        limit,
        countsByStatus: computeCounts(allRows),
      };
    });
  }

  async getSubmissionDetailForStaff(submissionId: string) {
    const backend = this.resolvePersistenceBackend();
    if (backend.mode === 'memory') {
      const sub = memorySubmissions.get(submissionId);
      if (!sub) throw new PropertySubmissionDomainError('Submission not found', 404);
      const reviews = memoryReviews.get(submissionId) || [];
      const media = memorySubmissionMedia.get(submissionId) || [];
      const attestation = memoryAttestations.get(submissionId)?.[0] || null;
      const dupFlags = memoryDuplicateFlags.get(submissionId) || [];
      const changeReqs = memoryChangeRequests.get(submissionId) || [];
      const submitterAcct =
        memoryCustomerAccounts.get(sub.submitterCustomerId) ||
        (await customerRepository.findById(sub.submitterCustomerId)) ||
        null;
      const payload = (sub.payload || {}) as Record<string, any>;
      const originalPayload = (sub.originalPayload || sub.payload || {}) as Record<string, any>;
      const curatedPayload = (sub.curatedPayload || null) as Record<string, any> | null;
      const effectivePayload = (curatedPayload || originalPayload) as Record<string, any>;
      const reviewChecklist =
        ((sub.reviewChecklist as Record<string, boolean> | null) ||
          (payload.reviewChecklist as Record<string, boolean> | null) ||
          {});

      let publishedListingSlug: string | null = null;
      if (sub.resaleListingId) {
        publishedListingSlug = (await resaleListingRepository.findById(sub.resaleListingId))?.slug ?? null;
      } else if (sub.rentalListingId) {
        publishedListingSlug = (await rentalListingRepository.findById(sub.rentalListingId))?.slug ?? null;
      }

      return {
        submission: sub,
        payload,
        originalPayload,
        curatedPayload,
        effectivePayload,
        photos: media.map(mapMediaAssetToSubmissionPhoto),
        mediaAssets: media,
        reviews: reviews.map((r) => ({
          id: r.id,
          submissionId: r.submissionId,
          staffUserId: r.staffUserId || null,
          eventType: r.eventType,
          previousStatus: r.previousStatus || null,
          newStatus: r.newStatus,
          internalNote: r.internalNote || null,
          submitterFeedback: r.submitterFeedback || null,
          metadata: r.metadata || null,
          createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : new Date(r.createdAt).toISOString(),
        })),
        attestation,
        assignedReviewerId: sub.assignedReviewerId ?? payload.assignedReviewerId ?? null,
        reviewChecklist,
        contactConfirmed: Boolean(sub.contactConfirmed || reviewChecklist.contactConfirmed),
        version: typeof sub.version === 'number' ? sub.version : 1,
        publishedAt: sub.publishedAt ? new Date(sub.publishedAt).toISOString() : null,
        publishedByStaffId: sub.publishedByStaffId ?? null,
        deactivatedAt: sub.deactivatedAt ? new Date(sub.deactivatedAt).toISOString() : null,
        deactivatedByStaffId: sub.deactivatedByStaffId ?? null,
        overrideReason: sub.overrideReason ?? null,
        overrideByStaffId: sub.overrideByStaffId ?? null,
        overrideAt: sub.overrideAt ? new Date(sub.overrideAt).toISOString() : null,
        publishedListingSlug,
        duplicateFlags: dupFlags.map((df) => ({
          ...df,
          createdAt: df.createdAt.toISOString(),
          updatedAt: df.updatedAt.toISOString(),
          resolvedAt: df.resolvedAt ? df.resolvedAt.toISOString() : null,
        })),
        changeRequests: changeReqs.map((cr) => ({
          ...cr,
          createdAt: cr.createdAt.toISOString(),
          updatedAt: cr.updatedAt.toISOString(),
          resolvedAt: cr.resolvedAt ? cr.resolvedAt.toISOString() : null,
        })),
        submitter: submitterAcct
          ? {
              id: submitterAcct.id,
              name: submitterAcct.name || null,
              phone: submitterAcct.phone || null,
              email: submitterAcct.email || null,
              accountType: submitterAcct.accountType || null,
            }
          : {
              id: sub.submitterCustomerId,
              name: null,
              phone: null,
              email: null,
              accountType: sub.listingSource === 'PARTNER' ? 'LISTING_PARTNER' : 'OWNER',
            },
      };
    }

    return await this.runWithPersistenceGuard(async () => {
      const [sub] = await this.dbSelectSubmissions(
        backend.db,
        eq(propertySubmissions.id, submissionId)
      );
      if (!sub) throw new PropertySubmissionDomainError('Submission not found', 404);

      const caps = await this.getSchemaCapabilities(backend.db);
      const [reviews, media, attestations, dupFlags, changeReqs, customerRows] = await Promise.all([
        this.dbSelectReviews(backend.db, [submissionId]),
        this.dbSelectMediaAssets(
          backend.db,
          and(eq(mediaAssets.entityType, 'SUBMISSION'), eq(mediaAssets.entityId, submissionId)),
          [asc(mediaAssets.sortOrder), asc(mediaAssets.createdAt)]
        ),
        caps.hasPartnerAttestationsTable
          ? backend.db
              .select()
              .from(partnerAttestations)
              .where(eq(partnerAttestations.submissionId, submissionId))
              .limit(1)
          : Promise.resolve([]),
        this.dbSelectDuplicateFlags(backend.db, submissionId),
        this.dbSelectChangeRequests(backend.db, submissionId),
        customerRepository.findById(sub.submitterCustomerId),
      ]);

      let publishedListingSlug: string | null = null;
      if (sub.resaleListingId) {
        const [rl] = await backend.db
          .select({ slug: resaleListings.slug })
          .from(resaleListings)
          .where(eq(resaleListings.id, sub.resaleListingId))
          .limit(1);
        publishedListingSlug = rl?.slug ?? null;
      } else if (sub.rentalListingId) {
        const [rl] = await backend.db
          .select({ slug: rentalListings.slug })
          .from(rentalListings)
          .where(eq(rentalListings.id, sub.rentalListingId))
          .limit(1);
        publishedListingSlug = rl?.slug ?? null;
      }

      const payload = (sub.payload || {}) as Record<string, any>;
      const originalPayload = (sub.originalPayload || sub.payload || {}) as Record<string, any>;
      const curatedPayload = (sub.curatedPayload || null) as Record<string, any> | null;
      const effectivePayload = (curatedPayload || originalPayload) as Record<string, any>;
      const reviewChecklist =
        ((sub.reviewChecklist as Record<string, boolean> | null) ||
          (payload.reviewChecklist as Record<string, boolean> | null) ||
          {});
      const submitter = customerRows || null;

      return {
        submission: sub,
        payload,
        originalPayload,
        curatedPayload,
        effectivePayload,
        photos: media.map(mapDbRowToSubmissionMediaRecord).map(mapMediaAssetToSubmissionPhoto),
        mediaAssets: media.map(mapDbRowToSubmissionMediaRecord),
        reviews: reviews.map((r) => ({
          id: r.id,
          submissionId: r.submissionId,
          staffUserId: r.staffUserId || null,
          eventType: r.eventType,
          previousStatus: r.previousStatus || null,
          newStatus: r.newStatus,
          internalNote: r.internalNote || null,
          submitterFeedback: r.submitterFeedback || null,
          metadata: r.metadata || null,
          createdAt: r.createdAt.toISOString(),
        })),
        attestation: attestations[0] || null,
        assignedReviewerId: sub.assignedReviewerId ?? payload.assignedReviewerId ?? null,
        reviewChecklist,
        contactConfirmed: Boolean(sub.contactConfirmed || reviewChecklist.contactConfirmed),
        version: typeof sub.version === 'number' ? sub.version : 1,
        publishedAt: sub.publishedAt ? sub.publishedAt.toISOString() : null,
        publishedByStaffId: sub.publishedByStaffId ?? null,
        deactivatedAt: sub.deactivatedAt ? sub.deactivatedAt.toISOString() : null,
        deactivatedByStaffId: sub.deactivatedByStaffId ?? null,
        overrideReason: sub.overrideReason ?? null,
        overrideByStaffId: sub.overrideByStaffId ?? null,
        overrideAt: sub.overrideAt ? sub.overrideAt.toISOString() : null,
        publishedListingSlug,
        duplicateFlags: dupFlags.map((df) => ({
          ...df,
          createdAt: df.createdAt.toISOString(),
          updatedAt: df.updatedAt.toISOString(),
          resolvedAt: df.resolvedAt ? df.resolvedAt.toISOString() : null,
        })),
        changeRequests: changeReqs.map((cr) => ({
          ...cr,
          createdAt: cr.createdAt.toISOString(),
          updatedAt: cr.updatedAt.toISOString(),
          resolvedAt: cr.resolvedAt ? cr.resolvedAt.toISOString() : null,
        })),
        submitter: submitter
          ? {
              id: submitter.id,
              name: submitter.name,
              phone: submitter.phone,
              email: submitter.email,
              accountType: submitter.accountType,
            }
          : null,
      };
    });
  }

  async startReview(submissionId: string, staffId: string, actorRole: string) {
    assertRepoStaffCapability(actorRole, 'submission.review');
    const detail = await this.getSubmissionDetailForStaff(submissionId);
    const currentStatus = detail.submission.submissionStatus;
    if (!['SUBMITTED', 'UNDER_REVIEW', 'CHANGES_REQUESTED'].includes(currentStatus)) {
      throw new PropertySubmissionDomainError(
        `Cannot start verification review when submission is in status '${currentStatus}'.`,
        409
      );
    }
    const newStatus = 'UNDER_REVIEW';
    const reviewId = `rev_${uuidv4()}`;
    const now = new Date();
    const assignedReviewerId = detail.submission.assignedReviewerId ?? staffId;

    const backend = this.resolvePersistenceBackend();
    if (backend.mode === 'memory') {
      const sub = memorySubmissions.get(submissionId)!;
      memorySubmissions.set(submissionId, {
        ...sub,
        submissionStatus: newStatus,
        assignedReviewerId,
        version: (typeof sub.version === 'number' ? sub.version : 1) + 1,
        updatedAt: now,
        reviewedAt: now,
      });
      const revs = memoryReviews.get(submissionId) || [];
      revs.push({
        id: reviewId,
        submissionId,
        staffUserId: staffId,
        eventType: 'UNDER_REVIEW',
        previousStatus: currentStatus,
        newStatus,
        createdAt: now,
      });
      memoryReviews.set(submissionId, revs);
    } else {
      await this.runWithPersistenceGuard(async () => {
        await backend.db.transaction(async (tx) => {
          const reviewUpdate: PropertySubmissionUpdateRow = {
            submissionStatus: newStatus,
            assignedReviewerId,
            version: (typeof detail.submission.version === 'number' ? detail.submission.version : 1) + 1,
            reviewedAt: now,
            updatedAt: now,
          };
          await this.dbUpdateSubmission(tx, submissionId, reviewUpdate);
          const reviewInsert: PropertySubmissionReviewInsertRow = {
            id: reviewId,
            submissionId,
            staffUserId: staffId,
            eventType: 'UNDER_REVIEW',
            previousStatus: currentStatus,
            newStatus,
            createdAt: now,
          };
          await this.dbInsertReview(tx, reviewInsert);
        });
      });
    }

    await safeAuditRecord(
      staffId,
      actorRole,
      'START_REVIEW',
      submissionId,
      submissionId,
      { status: currentStatus },
      { status: newStatus, assignedReviewerId }
    );
    await safeCreateNotification({
      customerId: detail.submission.submitterCustomerId,
      type: 'SUBMISSION_STATUS_CHANGED',
      title: 'Verification Review Started',
      message: 'A Great Homes verification specialist has started reviewing your submission.',
      resourceId: submissionId,
      dedupKey: `sub_review_${submissionId}_${reviewId}`,
      metadata: { submissionId, status: newStatus },
    });

    return { success: true, submissionStatus: newStatus };
  }

  async requestChanges(
    submissionId: string,
    staffId: string,
    actorRole: string,
    input: { submitterFeedback: string; internalNote?: string; checklist?: Record<string, boolean> }
  ) {
    assertRepoStaffCapability(actorRole, 'submission.requestChanges');
    const detail = await this.getSubmissionDetailForStaff(submissionId);
    const currentStatus = detail.submission.submissionStatus;
    if (!['SUBMITTED', 'UNDER_REVIEW', 'APPROVED'].includes(currentStatus)) {
      throw new PropertySubmissionDomainError(
        `Cannot request changes from status '${currentStatus}'.`,
        409
      );
    }
    const newStatus = 'CHANGES_REQUESTED';
    const reviewId = `rev_${uuidv4()}`;
    const now = new Date();

    const mergedChecklist = {
      ...(detail.reviewChecklist || {}),
      ...(input.checklist || {}),
    };
    const nextContactConfirmed =
      typeof input.checklist?.contactConfirmed === 'boolean'
        ? input.checklist.contactConfirmed
        : Boolean(detail.submission.contactConfirmed);

    const backend = this.resolvePersistenceBackend();
    if (backend.mode === 'memory') {
      const sub = memorySubmissions.get(submissionId)!;
      memorySubmissions.set(submissionId, {
        ...sub,
        submissionStatus: newStatus,
        reviewChecklist: mergedChecklist,
        contactConfirmed: nextContactConfirmed,
        version: (typeof sub.version === 'number' ? sub.version : 1) + 1,
        reviewedAt: now,
        updatedAt: now,
      });
      const revs = memoryReviews.get(submissionId) || [];
      revs.push({
        id: reviewId,
        submissionId,
        staffUserId: staffId,
        eventType: 'CHANGES_REQUESTED',
        previousStatus: currentStatus,
        newStatus,
        submitterFeedback: input.submitterFeedback,
        internalNote: input.internalNote || null,
        createdAt: now,
      });
      memoryReviews.set(submissionId, revs);
    } else {
      await this.runWithPersistenceGuard(async () => {
        await backend.db.transaction(async (tx) => {
          const changesReqUpdate: PropertySubmissionUpdateRow = {
            submissionStatus: newStatus,
            reviewChecklist: mergedChecklist,
            contactConfirmed: nextContactConfirmed,
            version: (typeof detail.submission.version === 'number' ? detail.submission.version : 1) + 1,
            reviewedAt: now,
            updatedAt: now,
          };
          await this.dbUpdateSubmission(tx, submissionId, changesReqUpdate);
          const changesReqReview: PropertySubmissionReviewInsertRow = {
            id: reviewId,
            submissionId,
            staffUserId: staffId,
            eventType: 'CHANGES_REQUESTED',
            previousStatus: currentStatus,
            newStatus,
            submitterFeedback: input.submitterFeedback,
            internalNote: input.internalNote || null,
            createdAt: now,
          };
          await this.dbInsertReview(tx, changesReqReview);
        });
      });
    }

    await safeAuditRecord(
      staffId,
      actorRole,
      'REQUEST_CHANGES',
      submissionId,
      submissionId,
      { status: currentStatus },
      { status: newStatus, submitterFeedback: input.submitterFeedback }
    );
    await safeCreateNotification({
      customerId: detail.submission.submitterCustomerId,
      type: 'SUBMISSION_STATUS_CHANGED',
      title: 'Changes Requested for Your Listing',
      message: input.submitterFeedback,
      resourceId: submissionId,
      dedupKey: `sub_changes_${submissionId}_${reviewId}`,
      metadata: { submissionId, status: newStatus },
    });

    return { success: true, submissionStatus: newStatus };
  }

  async addInternalNote(submissionId: string, staffId: string, actorRole: string, internalNote: string) {
    assertRepoStaffCapability(actorRole, 'submission.manageNotes');
    const detail = await this.getSubmissionDetailForStaff(submissionId);
    const reviewId = `rev_${uuidv4()}`;
    const now = new Date();

    const backend = this.resolvePersistenceBackend();
    if (backend.mode === 'memory') {
      const revs = memoryReviews.get(submissionId) || [];
      revs.push({
        id: reviewId,
        submissionId,
        staffUserId: staffId,
        eventType: 'INTERNAL_NOTE',
        previousStatus: detail.submission.submissionStatus,
        newStatus: detail.submission.submissionStatus,
        internalNote,
        createdAt: now,
      });
      memoryReviews.set(submissionId, revs);
    } else {
      await this.runWithPersistenceGuard(async () => {
        const noteReview: PropertySubmissionReviewInsertRow = {
          id: reviewId,
          submissionId,
          staffUserId: staffId,
          eventType: 'INTERNAL_NOTE',
          previousStatus: detail.submission.submissionStatus,
          newStatus: detail.submission.submissionStatus,
          internalNote,
          createdAt: now,
        };
        await this.dbInsertReview(backend.db, noteReview);
      });
    }

    await safeAuditRecord(
      staffId,
      actorRole,
      'ADD_NOTE',
      submissionId,
      submissionId,
      null,
      { reviewId }
    );
    return { success: true, reviewId };
  }

  async assignReviewer(submissionId: string, staffId: string, actorRole: string, reviewerId: string) {
    assertRepoStaffCapability(actorRole, 'submission.assign');
    const detail = await this.getSubmissionDetailForStaff(submissionId);
    const previousReviewerId = detail.assignedReviewerId ?? null;
    const now = new Date();
    const reviewId = `rev_${uuidv4()}`;

    const backend = this.resolvePersistenceBackend();
    if (backend.mode === 'memory') {
      const sub = memorySubmissions.get(submissionId)!;
      memorySubmissions.set(submissionId, {
        ...sub,
        assignedReviewerId: reviewerId,
        updatedAt: now,
      });
      const revs = memoryReviews.get(submissionId) || [];
      revs.push({
        id: reviewId,
        submissionId,
        staffUserId: staffId,
        eventType: 'INTERNAL_NOTE',
        previousStatus: sub.submissionStatus,
        newStatus: sub.submissionStatus,
        internalNote: `Assigned reviewer ${reviewerId}`,
        createdAt: now,
      });
      memoryReviews.set(submissionId, revs);
    } else {
      await this.runWithPersistenceGuard(async () => {
        await backend.db.transaction(async (tx) => {
          const assignUpdate: PropertySubmissionUpdateRow = {
            assignedReviewerId: reviewerId,
            updatedAt: now,
          };
          await this.dbUpdateSubmission(tx, submissionId, assignUpdate);
          const assignReview: PropertySubmissionReviewInsertRow = {
            id: reviewId,
            submissionId,
            staffUserId: staffId,
            eventType: 'INTERNAL_NOTE',
            previousStatus: detail.submission.submissionStatus,
            newStatus: detail.submission.submissionStatus,
            internalNote: `Assigned reviewer ${reviewerId}`,
            createdAt: now,
          };
          await this.dbInsertReview(tx, assignReview);
        });
      });
    }

    await safeAuditRecord(
      staffId,
      actorRole,
      'ASSIGN_REVIEWER',
      submissionId,
      submissionId,
      { assignedReviewerId: previousReviewerId },
      { assignedReviewerId: reviewerId }
    );

    return { success: true, assignedReviewerId: reviewerId };
  }

  async updateChecklist(
    submissionId: string,
    staffId: string,
    actorRole: string,
    input: { checklist?: Record<string, boolean>; contactConfirmed?: boolean }
  ) {
    assertRepoStaffCapability(actorRole, 'submission.review');
    const detail = await this.getSubmissionDetailForStaff(submissionId);
    const now = new Date();
    const mergedChecklist: Record<string, boolean> = {
      ...(detail.reviewChecklist || {}),
      ...(input.checklist || {}),
    };
    if (typeof input.contactConfirmed === 'boolean') {
      mergedChecklist.contactConfirmed = input.contactConfirmed;
    }
    const nextContactConfirmed =
      typeof input.contactConfirmed === 'boolean'
        ? input.contactConfirmed
        : typeof mergedChecklist.contactConfirmed === 'boolean'
        ? mergedChecklist.contactConfirmed
        : Boolean(detail.submission.contactConfirmed);

    const backend = this.resolvePersistenceBackend();
    if (backend.mode === 'memory') {
      const sub = memorySubmissions.get(submissionId)!;
      memorySubmissions.set(submissionId, {
        ...sub,
        reviewChecklist: mergedChecklist,
        contactConfirmed: nextContactConfirmed,
        updatedAt: now,
      });
    } else {
      await this.runWithPersistenceGuard(async () => {
        const checklistUpdate: PropertySubmissionUpdateRow = {
          reviewChecklist: mergedChecklist,
          contactConfirmed: nextContactConfirmed,
          updatedAt: now,
        };
        await this.dbUpdateSubmission(backend.db, submissionId, checklistUpdate);
      });
    }

    await safeAuditRecord(
      staffId,
      actorRole,
      'REVIEW',
      submissionId,
      submissionId,
      { contactConfirmed: detail.contactConfirmed },
      { reviewChecklist: mergedChecklist, contactConfirmed: nextContactConfirmed }
    );

    return {
      success: true,
      reviewChecklist: mergedChecklist,
      contactConfirmed: nextContactConfirmed,
    };
  }

  async editCuratedData(
    submissionId: string,
    staffId: string,
    actorRole: string,
    patch: {
      title?: string | null;
      description?: string | null;
      customLocalityDisplay?: string | null;
      customProjectDisplay?: string | null;
      location?: Record<string, unknown>;
      details?: Record<string, unknown>;
    }
  ) {
    assertRepoStaffCapability(actorRole, 'submission.editCurated');
    const detail = await this.getSubmissionDetailForStaff(submissionId);
    const currentStatus = detail.submission.submissionStatus;
    if (currentStatus === 'DRAFT' || currentStatus === 'WITHDRAWN' || currentStatus === 'REJECTED') {
      throw new PropertySubmissionDomainError(
        `Cannot edit curated data for submission in status '${currentStatus}'.`,
        409
      );
    }

    const baseCurated =
      (detail.curatedPayload as Record<string, unknown> | null) ||
      (detail.originalPayload as Record<string, unknown> | null) ||
      (detail.payload as Record<string, unknown>);
    const nextCurated = deepMergeCuratedPayload(baseCurated, patch);
    const now = new Date();
    const reviewId = `rev_${uuidv4()}`;
    let nextVersion = (detail.version ?? 1) + 1;

    const backend = this.resolvePersistenceBackend();
    if (backend.mode === 'memory') {
      const sub = memorySubmissions.get(submissionId)!;
      const preservedOriginal = sub.originalPayload ?? sub.payload;
      nextVersion = (typeof sub.version === 'number' ? sub.version : 1) + 1;
      memorySubmissions.set(submissionId, {
        ...sub,
        originalPayload: preservedOriginal,
        curatedPayload: nextCurated,
        version: nextVersion,
        updatedAt: now,
      });
      const revs = memoryReviews.get(submissionId) || [];
      revs.push({
        id: reviewId,
        submissionId,
        staffUserId: staffId,
        eventType: 'EDIT_CURATED',
        previousStatus: currentStatus,
        newStatus: currentStatus,
        internalNote: 'Staff edited curated listing presentation while preserving original submission.',
        metadata: { before: baseCurated, after: nextCurated },
        createdAt: now,
      });
      memoryReviews.set(submissionId, revs);
    } else {
      await this.runWithPersistenceGuard(async () => {
        await backend.db.transaction(async (tx) => {
          const curatedUpdate: PropertySubmissionUpdateRow = {
            originalPayload: detail.submission.originalPayload ?? detail.submission.payload,
            curatedPayload: nextCurated,
            version: (typeof detail.submission.version === 'number' ? detail.submission.version : 1) + 1,
            updatedAt: now,
          };
          const [updated] = await this.dbUpdateSubmission(
            tx,
            submissionId,
            curatedUpdate
          );
          if (updated) nextVersion = updated.version;

          const curatedReview: PropertySubmissionReviewInsertRow = {
            id: reviewId,
            submissionId,
            staffUserId: staffId,
            eventType: 'EDIT_CURATED',
            previousStatus: currentStatus,
            newStatus: currentStatus,
            internalNote: 'Staff edited curated listing presentation while preserving original submission.',
            metadata: { before: baseCurated, after: nextCurated },
            createdAt: now,
          };
          await this.dbInsertReview(tx, curatedReview);
        });
      });
    }

    await safeAuditRecord(
      staffId,
      actorRole,
      'EDIT_CURATED',
      submissionId,
      submissionId,
      baseCurated,
      nextCurated
    );

    return {
      success: true,
      curatedPayload: nextCurated,
      originalPayload: detail.submission.originalPayload ?? detail.submission.payload,
      version: nextVersion,
    };
  }

  async approveSubmission(
    submissionId: string,
    staffId: string,
    actorRole: string,
    input?: {
      contactConfirmed?: boolean;
      checklist?: Record<string, boolean>;
      internalNote?: string;
      submitterFeedback?: string;
    }
  ) {
    assertRepoStaffCapability(actorRole, 'submission.approve');
    const detail = await this.getSubmissionDetailForStaff(submissionId);
    const currentStatus = detail.submission.submissionStatus;
    if (currentStatus !== 'SUBMITTED' && currentStatus !== 'UNDER_REVIEW') {
      throw new PropertySubmissionDomainError(
        `Cannot approve submission in status '${currentStatus}'. Must be SUBMITTED or UNDER_REVIEW.`,
        409
      );
    }
    const mediaList = await this.listSubmissionMedia(
      submissionId,
      detail.submission.submitterCustomerId
    );
    if (mediaList.length < 3) {
      throw new PropertySubmissionDomainError('Minimum 3 photographs are required for approval.', 400);
    }
    if (mediaList.length > 15) {
      throw new PropertySubmissionDomainError('Maximum 15 photographs are permitted.', 400);
    }

    const mergedChecklist: Record<string, boolean> = {
      ...(detail.reviewChecklist || {}),
      ...(input?.checklist || {}),
    };
    if (typeof input?.contactConfirmed === 'boolean') {
      mergedChecklist.contactConfirmed = input.contactConfirmed;
    }

    const effectiveContactConfirmed =
      input?.contactConfirmed === true ||
      mergedChecklist.contactConfirmed === true ||
      Boolean(detail.submission.contactConfirmed);

    if (!effectiveContactConfirmed) {
      throw new PropertySubmissionDomainError(
        'Direct verification confirmation with the submitter (contactConfirmed) is required before approving this submission.',
        400
      );
    }

    const newStatus = 'APPROVED';
    const reviewId = `rev_${uuidv4()}`;
    const now = new Date();

    const backend = this.resolvePersistenceBackend();
    if (backend.mode === 'memory') {
      const sub = memorySubmissions.get(submissionId)!;
      memorySubmissions.set(submissionId, {
        ...sub,
        submissionStatus: newStatus,
        reviewChecklist: { ...mergedChecklist, contactConfirmed: true },
        contactConfirmed: true,
        version: (typeof sub.version === 'number' ? sub.version : 1) + 1,
        approvedAt: now,
        reviewedAt: now,
        updatedAt: now,
      });
      const revs = memoryReviews.get(submissionId) || [];
      revs.push({
        id: reviewId,
        submissionId,
        staffUserId: staffId,
        eventType: 'APPROVED',
        previousStatus: currentStatus,
        newStatus,
        internalNote: input?.internalNote || null,
        submitterFeedback: input?.submitterFeedback || null,
        createdAt: now,
      });
      memoryReviews.set(submissionId, revs);
    } else {
      await this.runWithPersistenceGuard(async () => {
        await backend.db.transaction(async (tx) => {
          const approveUpdate: PropertySubmissionUpdateRow = {
            submissionStatus: newStatus,
            reviewChecklist: { ...mergedChecklist, contactConfirmed: true },
            contactConfirmed: true,
            version: (typeof detail.submission.version === 'number' ? detail.submission.version : 1) + 1,
            approvedAt: now,
            reviewedAt: now,
            updatedAt: now,
          };
          await this.dbUpdateSubmission(tx, submissionId, approveUpdate);

          const approveReview: PropertySubmissionReviewInsertRow = {
            id: reviewId,
            submissionId,
            staffUserId: staffId,
            eventType: 'APPROVED',
            previousStatus: currentStatus,
            newStatus,
            internalNote: input?.internalNote || null,
            submitterFeedback: input?.submitterFeedback || null,
            createdAt: now,
          };
          await this.dbInsertReview(tx, approveReview);
        });
      });
    }

    await safeAuditRecord(
      staffId,
      actorRole,
      'APPROVE',
      submissionId,
      submissionId,
      { status: currentStatus },
      { status: newStatus, contactConfirmed: true }
    );
    await safeCreateNotification({
      customerId: detail.submission.submitterCustomerId,
      type: 'SUBMISSION_STATUS_CHANGED',
      title: 'Listing Approved for Publication',
      message: 'Your submission passed Great Homes verification and is queued for public catalog publication.',
      resourceId: submissionId,
      dedupKey: `sub_approved_${submissionId}_${reviewId}`,
      metadata: { submissionId, status: newStatus },
    });

    return { success: true, submissionStatus: newStatus };
  }

  async rejectSubmission(
    submissionId: string,
    staffId: string,
    actorRole: string,
    input: { reason: string; internalNote?: string }
  ) {
    assertRepoStaffCapability(actorRole, 'submission.reject');
    const detail = await this.getSubmissionDetailForStaff(submissionId);
    const currentStatus = detail.submission.submissionStatus;
    if (currentStatus === 'PUBLISHED' || currentStatus === 'REJECTED') {
      throw new PropertySubmissionDomainError(
        `Cannot reject submission in status '${currentStatus}'.`,
        409
      );
    }

    const newStatus = 'REJECTED';
    const reviewId = `rev_${uuidv4()}`;
    const now = new Date();

    const backend = this.resolvePersistenceBackend();
    if (backend.mode === 'memory') {
      const sub = memorySubmissions.get(submissionId)!;
      memorySubmissions.set(submissionId, {
        ...sub,
        submissionStatus: newStatus,
        version: (typeof sub.version === 'number' ? sub.version : 1) + 1,
        reviewedAt: now,
        updatedAt: now,
      });
      const revs = memoryReviews.get(submissionId) || [];
      revs.push({
        id: reviewId,
        submissionId,
        staffUserId: staffId,
        eventType: 'REJECTED',
        previousStatus: currentStatus,
        newStatus,
        submitterFeedback: input.reason,
        internalNote: input.internalNote || null,
        createdAt: now,
      });
      memoryReviews.set(submissionId, revs);
    } else {
      await this.runWithPersistenceGuard(async () => {
        await backend.db.transaction(async (tx) => {
          const rejectUpdate: PropertySubmissionUpdateRow = {
            submissionStatus: newStatus,
            version: (typeof detail.submission.version === 'number' ? detail.submission.version : 1) + 1,
            reviewedAt: now,
            updatedAt: now,
          };
          await this.dbUpdateSubmission(tx, submissionId, rejectUpdate);

          const rejectReview: PropertySubmissionReviewInsertRow = {
            id: reviewId,
            submissionId,
            staffUserId: staffId,
            eventType: 'REJECTED',
            previousStatus: currentStatus,
            newStatus,
            submitterFeedback: input.reason,
            internalNote: input.internalNote || null,
            createdAt: now,
          };
          await this.dbInsertReview(tx, rejectReview);
        });
      });
    }

    await safeAuditRecord(
      staffId,
      actorRole,
      'REJECT',
      submissionId,
      submissionId,
      { status: currentStatus },
      { status: newStatus, reason: input.reason }
    );
    await safeCreateNotification({
      customerId: detail.submission.submitterCustomerId,
      type: 'SUBMISSION_STATUS_CHANGED',
      title: 'Submission Verification Declined',
      message: input.reason,
      resourceId: submissionId,
      dedupKey: `sub_rejected_${submissionId}_${reviewId}`,
      metadata: { submissionId, status: newStatus },
    });

    return { success: true, submissionStatus: newStatus };
  }

  private mapListingMediaCategory(rawCategory: string): 'HERO' | 'EXTERIOR' | 'INTERIOR' | 'LIVING' | 'BEDROOM' | 'KITCHEN' | 'BALCONY' | 'AMENITY' | 'GALLERY' {
    const upper = (rawCategory || '').trim().toUpperCase().replace(/\s+/g, '_');
    const valid = new Set(['HERO', 'EXTERIOR', 'INTERIOR', 'LIVING', 'BEDROOM', 'KITCHEN', 'BALCONY', 'AMENITY', 'GALLERY']);
    if (valid.has(upper)) return upper as any;
    if (upper.includes('LIVING')) return 'LIVING';
    if (upper.includes('BED')) return 'BEDROOM';
    if (upper.includes('KITCHEN')) return 'KITCHEN';
    if (upper.includes('BALCONY')) return 'BALCONY';
    if (upper.includes('EXTERIOR') || upper.includes('PLOT') || upper.includes('BUILDING') || upper.includes('STREET')) {
      return 'EXTERIOR';
    }
    if (upper.includes('AMENIT')) return 'AMENITY';
    return 'GALLERY';
  }

  async publishSubmission(
    submissionId: string,
    staffId: string,
    actorRole: string,
    options?: {
      skipApprovedCheckForOverride?: boolean;
      overrideReason?: string;
    }
  ) {
    if (!options?.skipApprovedCheckForOverride) {
      assertRepoStaffCapability(actorRole, 'submission.publish');
    }
    const detail = await this.getSubmissionDetailForStaff(submissionId);
    const subData = detail.submission;
    const currentStatus = subData.submissionStatus;

    if (!options?.skipApprovedCheckForOverride && currentStatus !== 'APPROVED') {
      throw new PropertySubmissionDomainError(
        `Cannot publish submission in status '${currentStatus}'. Must be APPROVED first.`,
        409
      );
    }

    if (!options?.skipApprovedCheckForOverride && !detail.contactConfirmed) {
      throw new PropertySubmissionDomainError(
        'Cannot publish submission until direct contact with the owner/partner is confirmed (contactConfirmed).',
        400
      );
    }

    const mediaList = await this.listSubmissionMedia(submissionId, subData.submitterCustomerId);
    if (mediaList.length < 3) {
      throw new PropertySubmissionDomainError('Minimum 3 photographs are required for publication.', 400);
    }
    if (mediaList.length > 15) {
      throw new PropertySubmissionDomainError('Maximum 15 photographs are permitted.', 400);
    }

    const effectivePayload = (detail.effectivePayload || detail.payload || {}) as Record<string, any>;
    const locationObj = (effectivePayload.location || {}) as Record<string, any>;
    const detailsObj = (effectivePayload.details || {}) as Record<string, any>;

    const listingPurpose = String(
      effectivePayload.listingType || effectivePayload.listingPurpose || subData.listingType || 'RESALE'
    ).toUpperCase();
    const rawPropertyType = String(effectivePayload.propertyType || '').toUpperCase();
    if (!['APARTMENT', 'INDEPENDENT_HOUSE', 'PLOT'].includes(rawPropertyType)) {
      throw new PropertySubmissionDomainError(
        `Invalid propertyType '${rawPropertyType}'. Must be APARTMENT, INDEPENDENT_HOUSE, or PLOT.`,
        400
      );
    }

    const isPlot = rawPropertyType === 'PLOT';
    const isHouse = rawPropertyType === 'INDEPENDENT_HOUSE';

    const plotAreaNum = Number(detailsObj.plotArea ?? 0);
    const carpetAreaNum = Number(detailsObj.carpetArea ?? 0);
    const builtUpAreaNum = Number(detailsObj.builtUpArea ?? 0);
    const superBuiltUpAreaNum = Number(detailsObj.superBuiltUpArea ?? 0);

    if (isPlot) {
      if (!Number.isFinite(plotAreaNum) || plotAreaNum <= 0) {
        throw new PropertySubmissionDomainError('Plot area (> 0) is required to publish a PLOT listing.', 400);
      }
    } else {
      const hasAnyArea =
        (Number.isFinite(carpetAreaNum) && carpetAreaNum > 0) ||
        (Number.isFinite(builtUpAreaNum) && builtUpAreaNum > 0) ||
        (Number.isFinite(superBuiltUpAreaNum) && superBuiltUpAreaNum > 0);
      if (!hasAnyArea) {
        throw new PropertySubmissionDomainError(
          'Carpet, built-up, or super built-up area (> 0) is required to publish a residential listing.',
          400
        );
      }
    }

    const askingPriceNum = Number(detailsObj.askingPrice ?? detailsObj.expectedPrice ?? 0);
    const monthlyRentNum = Number(detailsObj.monthlyRent ?? 0);
    if (listingPurpose === 'RENTAL') {
      if (!Number.isFinite(monthlyRentNum) || monthlyRentNum <= 0) {
        throw new PropertySubmissionDomainError('Valid monthlyRent (> 0) is required for RENTAL publication.', 400);
      }
    } else {
      if (!Number.isFinite(askingPriceNum) || askingPriceNum <= 0) {
        throw new PropertySubmissionDomainError('Valid askingPrice (> 0) is required for RESALE publication.', 400);
      }
    }

    const bedroomCountVal: number | null = isPlot
      ? null
      : Number.isInteger(Number(detailsObj.bedroomCount ?? detailsObj.bedrooms)) &&
        Number(detailsObj.bedroomCount ?? detailsObj.bedrooms) > 0
      ? Number(detailsObj.bedroomCount ?? detailsObj.bedrooms)
      : 1;

    const configurationVal: string | null = isPlot
      ? null
      : typeof detailsObj.configuration === 'string' && detailsObj.configuration.trim().length > 0
      ? detailsObj.configuration.trim()
      : `${bedroomCountVal} BHK`;

    const furnishingVal = normalizeFurnishingForListing(detailsObj.furnishing, rawPropertyType);
    const floorCategoryVal = normalizeFloorCategoryForListing(detailsObj.floorCategory, rawPropertyType);
    const facingVal = normalizeFacingForListing(detailsObj.facing);
    const possessionVal = normalizePossessionForListing(detailsObj.possession);

    const listingPartyType: 'OWNER' | 'LISTING_PARTNER' =
      subData.listingSource === 'PARTNER' ? 'LISTING_PARTNER' : 'OWNER';
    const listingPartyDisplayName =
      listingPartyType === 'LISTING_PARTNER' ? 'Listing Partner' : 'Owner Listed';

    const customLocalityDisplay =
      typeof locationObj.customLocalityDisplay === 'string' && locationObj.customLocalityDisplay.trim()
        ? locationObj.customLocalityDisplay.trim()
        : typeof locationObj.locality === 'string' && locationObj.locality.trim()
        ? locationObj.locality.trim()
        : null;
    const customProjectDisplay =
      typeof locationObj.customProjectDisplay === 'string' && locationObj.customProjectDisplay.trim()
        ? locationObj.customProjectDisplay.trim()
        : !locationObj.projectId &&
          typeof locationObj.projectName === 'string' &&
          locationObj.projectName.trim()
        ? locationObj.projectName.trim()
        : null;

    const projectIdVal =
      typeof locationObj.projectId === 'string' && locationObj.projectId.trim()
        ? locationObj.projectId.trim()
        : null;
    const locationIdVal =
      typeof locationObj.locationId === 'string' && locationObj.locationId.trim()
        ? locationObj.locationId.trim()
        : null;

    const coarsenedLat = coarsenPublicCoordinate(locationObj.latitude);
    const coarsenedLng = coarsenPublicCoordinate(locationObj.longitude);

    const now = new Date();
    const reviewId = `rev_${uuidv4()}`;
    const eventType = options?.overrideReason ? 'OVERRIDE' : 'PUBLISHED';
    const backend = this.resolvePersistenceBackend();

    let createdOrUpdatedListingId =
      listingPurpose === 'RENTAL' ? subData.rentalListingId || null : subData.resaleListingId || null;
    let finalSlug = '';

    const submitterName = detail.submitter?.name || effectivePayload.submitterName || null;
    const submitterPhone = detail.submitter?.phone || effectivePayload.submitterPhone || null;
    const submitterEmail = detail.submitter?.email || effectivePayload.submitterEmail || null;

    if (backend.mode === 'memory') {
      const sub = memorySubmissions.get(submissionId)!;
      if (!createdOrUpdatedListingId) {
        createdOrUpdatedListingId = `list_${uuidv4()}`;
      }

      const existingSlug =
        listingPurpose === 'RENTAL'
          ? (await rentalListingRepository.findById(createdOrUpdatedListingId))?.slug
          : (await resaleListingRepository.findById(createdOrUpdatedListingId))?.slug;

      finalSlug =
        existingSlug ||
        (await generateNewListingSlug({
          projectName: customProjectDisplay || locationObj.projectName || null,
          locationName: customLocalityDisplay || locationObj.locality || locationObj.city || null,
          bedroomCount: bedroomCountVal,
          propertyType: rawPropertyType,
          plotArea: isPlot ? plotAreaNum : null,
          listingType: listingPurpose === 'RENTAL' ? 'rental' : 'resale',
          checkExists: async (candidateSlug) => {
            if (listingPurpose === 'RENTAL') {
              return Boolean(await rentalListingRepository.findBySlug(candidateSlug));
            }
            return Boolean(await resaleListingRepository.findBySlug(candidateSlug));
          },
        }));

      const commonPrivate = {
        listingPartyType,
        listingPartyDisplayName,
        ownerName: listingPartyType === 'OWNER' ? submitterName : null,
        ownerPhone: listingPartyType === 'OWNER' ? submitterPhone : null,
        ownerEmail: listingPartyType === 'OWNER' ? submitterEmail : null,
        brokerName: listingPartyType === 'LISTING_PARTNER' ? submitterName : null,
        brokerPhone: listingPartyType === 'LISTING_PARTNER' ? submitterPhone : null,
        brokerEmail: listingPartyType === 'LISTING_PARTNER' ? submitterEmail : null,
        privatePhone: submitterPhone,
        privateEmail: submitterEmail,
        source: `SUBMISSION:${submissionId}`,
        lifecycleStatus: 'PUBLISHED' as const,
        verificationStatus: 'VERIFIED' as const,
        verifiedAt: now,
        verifiedBy: staffId,
      };

      const rawAmenityRefs = Array.isArray(detailsObj.amenities)
        ? detailsObj.amenities.map((x: unknown) => String(x).trim()).filter(Boolean)
        : [];
      const resolvedAmenityIds: string[] = [];
      for (const ref of rawAmenityRefs) {
        const slugCandidate = ref
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '');
        let found =
          (await amenityRepository.findBySlug(slugCandidate)) ||
          (await amenityRepository.findBySlug(ref)) ||
          (await amenityRepository.findByIds([ref]))[0] ||
          null;
        if (!found) {
          found = await amenityRepository.create({
            name: ref,
            slug: slugCandidate || `amenity-${uuidv4().slice(0, 8)}`,
            category: 'LIFESTYLE',
            icon: null,
          });
        }
        resolvedAmenityIds.push(found.id);
      }

      if (listingPurpose === 'RENTAL') {
        const existingRental = await rentalListingRepository.findById(createdOrUpdatedListingId);
        const rentalPayload: any = {
          id: createdOrUpdatedListingId,
          slug: finalSlug,
          projectId: projectIdVal,
          locationId: locationIdVal,
          latitude: coarsenedLat,
          longitude: coarsenedLng,
          propertyType: rawPropertyType,
          configuration: configurationVal,
          bedroomCount: bedroomCountVal,
          carpetArea: !isPlot && carpetAreaNum > 0 ? carpetAreaNum : null,
          builtUpArea: !isPlot && builtUpAreaNum > 0 ? builtUpAreaNum : null,
          superBuiltUpArea: !isPlot && superBuiltUpAreaNum > 0 ? superBuiltUpAreaNum : null,
          plotArea: isPlot || (isHouse && plotAreaNum > 0) ? Number(plotAreaNum.toFixed(2)) : null,
          monthlyRent: monthlyRentNum,
          maintenance: Number(detailsObj.maintenance ?? 0) > 0 ? Number(detailsObj.maintenance) : null,
          securityDeposit:
            Number(detailsObj.securityDeposit ?? 0) >= 0 && detailsObj.securityDeposit !== undefined
              ? Number(detailsObj.securityDeposit)
              : null,
          furnishing: furnishingVal,
          facing: facingVal,
          floorCategory: floorCategoryVal,
          possession: possessionVal,
          availabilityDate: detailsObj.availabilityDate ? new Date(detailsObj.availabilityDate) : null,
          leaseDuration: detailsObj.leaseDuration || null,
          noticePeriod: detailsObj.noticePeriod || null,
          description: detailsObj.description || 'Verified Great Homes rental listing.',
          customLocalityDisplay,
          customProjectDisplay,
          ...commonPrivate,
        };
        if (existingRental) {
          await rentalListingRepository.update(createdOrUpdatedListingId, rentalPayload);
        } else {
          await rentalListingRepository.create(rentalPayload);
        }

        const oldMedia = await rentalListingRepository.findMediaByListingId(createdOrUpdatedListingId);
        for (const om of oldMedia) {
          await rentalListingRepository.removeMedia(om.id);
        }
        for (let idx = 0; idx < mediaList.length; idx++) {
          const m = mediaList[idx];
          await rentalListingRepository.addMedia({
            rentalListingId: createdOrUpdatedListingId,
            mediaType: 'IMAGE',
            category: this.mapListingMediaCategory(m.category) as any,
            url: m.watermarkedUrl || m.url,
            altText: m.caption || `${rawPropertyType} photo ${idx + 1}`,
            caption: m.caption ?? null,
            sortOrder: m.sortOrder ?? idx,
            isFeatured: Boolean(m.isFeatured || idx === 0),
          });
        }

        const oldAmenities = await rentalListingRepository.findAmenitiesByListingId(createdOrUpdatedListingId);
        for (const oa of oldAmenities) {
          await rentalListingRepository.removeAmenity(createdOrUpdatedListingId, oa.id);
        }
        for (const amenityId of resolvedAmenityIds) {
          await rentalListingRepository.associateAmenity(createdOrUpdatedListingId, amenityId);
        }
      } else {
        const existingResale = await resaleListingRepository.findById(createdOrUpdatedListingId);
        const resalePayload: any = {
          id: createdOrUpdatedListingId,
          slug: finalSlug,
          projectId: projectIdVal,
          locationId: locationIdVal,
          latitude: coarsenedLat,
          longitude: coarsenedLng,
          propertyType: rawPropertyType,
          configuration: configurationVal,
          bedroomCount: bedroomCountVal,
          carpetArea: !isPlot && carpetAreaNum > 0 ? carpetAreaNum : null,
          builtUpArea: !isPlot && builtUpAreaNum > 0 ? builtUpAreaNum : null,
          superBuiltUpArea: !isPlot && superBuiltUpAreaNum > 0 ? superBuiltUpAreaNum : null,
          plotArea: isPlot || (isHouse && plotAreaNum > 0) ? Number(plotAreaNum.toFixed(2)) : null,
          askingPrice: askingPriceNum,
          furnishing: furnishingVal,
          facing: facingVal,
          floorCategory: floorCategoryVal,
          possession: possessionVal,
          possessionDate: detailsObj.possessionDate ? new Date(detailsObj.possessionDate) : null,
          description: detailsObj.description || 'Verified Great Homes resale listing.',
          customLocalityDisplay,
          customProjectDisplay,
          ...commonPrivate,
        };
        if (existingResale) {
          await resaleListingRepository.update(createdOrUpdatedListingId, resalePayload);
        } else {
          await resaleListingRepository.create(resalePayload);
        }

        const oldMedia = await resaleListingRepository.findMediaByListingId(createdOrUpdatedListingId);
        for (const om of oldMedia) {
          await resaleListingRepository.removeMedia(om.id);
        }
        for (let idx = 0; idx < mediaList.length; idx++) {
          const m = mediaList[idx];
          await resaleListingRepository.addMedia({
            resaleListingId: createdOrUpdatedListingId,
            mediaType: 'IMAGE',
            category: this.mapListingMediaCategory(m.category) as any,
            url: m.watermarkedUrl || m.url,
            altText: m.caption || `${rawPropertyType} photo ${idx + 1}`,
            caption: m.caption ?? null,
            sortOrder: m.sortOrder ?? idx,
            isFeatured: Boolean(m.isFeatured || idx === 0),
          });
        }

        const oldAmenities = await resaleListingRepository.findAmenitiesByListingId(createdOrUpdatedListingId);
        for (const oa of oldAmenities) {
          await resaleListingRepository.removeAmenity(createdOrUpdatedListingId, oa.id);
        }
        for (const amenityId of resolvedAmenityIds) {
          await resaleListingRepository.associateAmenity(createdOrUpdatedListingId, amenityId);
        }
      }

      memorySubmissions.set(submissionId, {
        ...sub,
        submissionStatus: 'PUBLISHED',
        resaleListingId: listingPurpose === 'RESALE' ? createdOrUpdatedListingId : sub.resaleListingId,
        rentalListingId: listingPurpose === 'RENTAL' ? createdOrUpdatedListingId : sub.rentalListingId,
        publishedAt: sub.publishedAt ?? now,
        publishedByStaffId: sub.publishedByStaffId ?? staffId,
        overrideReason: options?.overrideReason ?? sub.overrideReason ?? null,
        overrideByStaffId: options?.overrideReason ? staffId : sub.overrideByStaffId ?? null,
        overrideAt: options?.overrideReason ? now : sub.overrideAt ?? null,
        version: (typeof sub.version === 'number' ? sub.version : 1) + 1,
        updatedAt: now,
      });

      const revs = memoryReviews.get(submissionId) || [];
      revs.push({
        id: reviewId,
        submissionId,
        staffUserId: staffId,
        eventType,
        previousStatus: currentStatus,
        newStatus: 'PUBLISHED',
        submitterFeedback: options?.overrideReason || null,
        internalNote: options?.overrideReason
          ? `SUPER_ADMIN override publication: ${options.overrideReason}`
          : null,
        createdAt: now,
      });
      memoryReviews.set(submissionId, revs);
    } else {
      await this.runWithPersistenceGuard(async () => {
        await backend.db.transaction(async (tx) => {
          const [projRow] = projectIdVal
            ? await tx
                .select({
                  id: projects.id,
                  name: projects.name,
                  slug: projects.slug,
                  locationId: projects.locationId,
                })
                .from(projects)
                .where(eq(projects.id, projectIdVal))
                .limit(1)
            : [];

          const effectiveLocationId = locationIdVal || projRow?.locationId || null;
          const [locRow] = effectiveLocationId
            ? await tx
                .select({
                  id: locations.id,
                  name: locations.name,
                  slug: locations.slug,
                })
                .from(locations)
                .where(eq(locations.id, effectiveLocationId))
                .limit(1)
            : [];

          if (!createdOrUpdatedListingId) {
            createdOrUpdatedListingId = `list_${uuidv4()}`;
          }

          const txCaps = await this.getSchemaCapabilities(tx);

          if (listingPurpose === 'RENTAL') {
            const [existingRow] = await tx
              .select({ id: rentalListings.id, slug: rentalListings.slug })
              .from(rentalListings)
              .where(eq(rentalListings.id, createdOrUpdatedListingId))
              .limit(1);

            finalSlug =
              existingRow?.slug ||
              (await generateNewListingSlug({
                projectName: projRow?.name || customProjectDisplay || locationObj.projectName || null,
                projectSlug: projRow?.slug || null,
                locationName: locRow?.name || customLocalityDisplay || locationObj.locality || null,
                locationSlug: locRow?.slug || null,
                bedroomCount: bedroomCountVal,
                propertyType: rawPropertyType,
                plotArea: isPlot ? plotAreaNum : null,
                listingType: 'rental',
                checkExists: async (candidateSlug) => {
                  const [found] = await tx
                    .select({ id: rentalListings.id })
                    .from(rentalListings)
                    .where(sql`LOWER(BTRIM(${rentalListings.slug})) = LOWER(${candidateSlug})`)
                    .limit(1);
                  return Boolean(found);
                },
              }));

            const rentalValues: Partial<RentalListingInsertRow> = {
              slug: finalSlug,
              projectId: projRow?.id ?? null,
              locationId: locRow?.id ?? null,
              latitude: coarsenedLat !== null ? String(coarsenedLat) : null,
              longitude: coarsenedLng !== null ? String(coarsenedLng) : null,
              propertyType: rawPropertyType,
              configuration: txCaps.hasExtendedListingColumns
                ? configurationVal
                : configurationVal || (isPlot ? 'Residential Plot' : 'Residential Unit'),
              bedroomCount: txCaps.hasExtendedListingColumns
                ? bedroomCountVal
                : bedroomCountVal ?? 0,
              carpetArea: !isPlot && carpetAreaNum > 0 ? carpetAreaNum.toFixed(2) : null,
              builtUpArea: !isPlot && builtUpAreaNum > 0 ? builtUpAreaNum.toFixed(2) : null,
              superBuiltUpArea: !isPlot && superBuiltUpAreaNum > 0 ? superBuiltUpAreaNum.toFixed(2) : null,
              monthlyRent: monthlyRentNum.toFixed(2),
              maintenance:
                Number(detailsObj.maintenance ?? 0) > 0 ? Number(detailsObj.maintenance).toFixed(2) : null,
              securityDeposit:
                detailsObj.securityDeposit !== undefined &&
                detailsObj.securityDeposit !== null &&
                Number(detailsObj.securityDeposit) >= 0
                  ? Number(detailsObj.securityDeposit).toFixed(2)
                  : null,
              furnishing: txCaps.hasExtendedListingColumns
                ? furnishingVal
                : furnishingVal || 'UNFURNISHED',
              facing: facingVal,
              floorCategory: txCaps.hasExtendedListingColumns
                ? floorCategoryVal
                : floorCategoryVal || 'LOW',
              possession: possessionVal,
              availabilityDate: detailsObj.availabilityDate ? new Date(detailsObj.availabilityDate) : null,
              leaseDuration: detailsObj.leaseDuration || null,
              noticePeriod: detailsObj.noticePeriod || null,
              description: detailsObj.description || 'Verified Great Homes rental listing.',
              listingPartyType,
              listingPartyDisplayName,
              ownerName: listingPartyType === 'OWNER' ? submitterName : null,
              ownerPhone: listingPartyType === 'OWNER' ? submitterPhone : null,
              ownerEmail: listingPartyType === 'OWNER' ? submitterEmail : null,
              brokerName: listingPartyType === 'LISTING_PARTNER' ? submitterName : null,
              brokerPhone: listingPartyType === 'LISTING_PARTNER' ? submitterPhone : null,
              brokerEmail: listingPartyType === 'LISTING_PARTNER' ? submitterEmail : null,
              privatePhone: submitterPhone,
              privateEmail: submitterEmail,
              source: `SUBMISSION:${submissionId}`,
              lifecycleStatus: 'PUBLISHED',
              verificationStatus: 'VERIFIED',
              verifiedAt: now,
              verifiedBy: staffId,
              updatedAt: now,
            };

            if (txCaps.hasExtendedListingColumns) {
              rentalValues.plotArea =
                isPlot || (isHouse && plotAreaNum > 0) ? plotAreaNum.toFixed(2) : null;
              rentalValues.customLocalityDisplay = customLocalityDisplay;
              rentalValues.customProjectDisplay = customProjectDisplay;
            }

            if (existingRow) {
              await tx
                .update(rentalListings)
                .set(rentalValues as Partial<typeof rentalListings.$inferSelect>)
                .where(eq(rentalListings.id, createdOrUpdatedListingId));
            } else if (txCaps.hasExtendedListingColumns) {
              const rentalInsertRow = {
                id: createdOrUpdatedListingId,
                ...rentalValues,
                createdAt: now,
              } as RentalListingInsertRow;
              await tx.insert(rentalListings).values(rentalInsertRow);
            } else {
              await tx.execute(sql`
                INSERT INTO rental_listings (
                  id, slug, project_id, location_id, latitude, longitude,
                  property_type, configuration, bedroom_count, carpet_area,
                  built_up_area, super_built_up_area, monthly_rent, maintenance,
                  security_deposit, furnishing, facing, floor_category, possession,
                  availability_date, lease_duration, notice_period, description,
                  listing_party_type, listing_party_display_name, owner_name,
                  owner_phone, owner_email, broker_name, broker_phone, broker_email,
                  private_phone, private_email, source, lifecycle_status,
                  verification_status, verified_at, verified_by, created_at, updated_at
                ) VALUES (
                  ${createdOrUpdatedListingId}, ${rentalValues.slug ?? null},
                  ${rentalValues.projectId ?? null}, ${rentalValues.locationId ?? null},
                  ${rentalValues.latitude ?? null}, ${rentalValues.longitude ?? null},
                  ${rentalValues.propertyType}, ${rentalValues.configuration},
                  ${rentalValues.bedroomCount}, ${rentalValues.carpetArea ?? null},
                  ${rentalValues.builtUpArea ?? null}, ${rentalValues.superBuiltUpArea ?? null},
                  ${rentalValues.monthlyRent}, ${rentalValues.maintenance ?? null},
                  ${rentalValues.securityDeposit ?? null}, ${rentalValues.furnishing},
                  ${rentalValues.facing}, ${rentalValues.floorCategory},
                  ${rentalValues.possession}, ${rentalValues.availabilityDate ?? null},
                  ${rentalValues.leaseDuration ?? null}, ${rentalValues.noticePeriod ?? null},
                  ${rentalValues.description ?? null}, ${rentalValues.listingPartyType},
                  ${rentalValues.listingPartyDisplayName ?? null}, ${rentalValues.ownerName ?? null},
                  ${rentalValues.ownerPhone ?? null}, ${rentalValues.ownerEmail ?? null},
                  ${rentalValues.brokerName ?? null}, ${rentalValues.brokerPhone ?? null},
                  ${rentalValues.brokerEmail ?? null}, ${rentalValues.privatePhone ?? null},
                  ${rentalValues.privateEmail ?? null}, ${rentalValues.source ?? null},
                  ${rentalValues.lifecycleStatus}, ${rentalValues.verificationStatus},
                  ${rentalValues.verifiedAt ?? null}, ${rentalValues.verifiedBy ?? null},
                  ${now}, ${rentalValues.updatedAt ?? now}
                )
              `);
            }

            await tx
              .delete(rentalListingMedia)
              .where(eq(rentalListingMedia.rentalListingId, createdOrUpdatedListingId));
            if (mediaList.length > 0) {
              await tx.insert(rentalListingMedia).values(
                mediaList.map((m, idx) => ({
                  id: `rlm_${uuidv4()}`,
                  rentalListingId: createdOrUpdatedListingId!,
                  mediaType: 'IMAGE',
                  category: this.mapListingMediaCategory(m.category),
                  url: m.watermarkedUrl || m.url,
                  altText: m.caption || `${rawPropertyType} photo ${idx + 1}`,
                  caption: m.caption ?? null,
                  sortOrder: m.sortOrder ?? idx,
                  isFeatured: m.isFeatured || idx === 0,
                  createdAt: now,
                  updatedAt: now,
                }))
              );
            }

            await tx
              .delete(rentalListingAmenities)
              .where(eq(rentalListingAmenities.rentalListingId, createdOrUpdatedListingId));
            const rawAmenityRefs = Array.isArray(detailsObj.amenities)
              ? detailsObj.amenities.map((x: unknown) => String(x).trim()).filter(Boolean)
              : [];
            if (rawAmenityRefs.length > 0) {
              const allAmenities = await tx.select().from(amenities);
              const matchedIds = allAmenities
                .filter((a) => rawAmenityRefs.includes(a.id) || rawAmenityRefs.includes(a.slug))
                .map((a) => a.id);
              if (matchedIds.length > 0) {
                await tx.insert(rentalListingAmenities).values(
                  matchedIds.map((amenityId) => ({
                    id: `rla_${uuidv4()}`,
                    rentalListingId: createdOrUpdatedListingId!,
                    amenityId,
                  }))
                );
              }
            }
          } else {
            const [existingRow] = await tx
              .select({ id: resaleListings.id, slug: resaleListings.slug })
              .from(resaleListings)
              .where(eq(resaleListings.id, createdOrUpdatedListingId))
              .limit(1);

            finalSlug =
              existingRow?.slug ||
              (await generateNewListingSlug({
                projectName: projRow?.name || customProjectDisplay || locationObj.projectName || null,
                projectSlug: projRow?.slug || null,
                locationName: locRow?.name || customLocalityDisplay || locationObj.locality || null,
                locationSlug: locRow?.slug || null,
                bedroomCount: bedroomCountVal,
                propertyType: rawPropertyType,
                plotArea: isPlot ? plotAreaNum : null,
                listingType: 'resale',
                checkExists: async (candidateSlug) => {
                  const [found] = await tx
                    .select({ id: resaleListings.id })
                    .from(resaleListings)
                    .where(sql`LOWER(BTRIM(${resaleListings.slug})) = LOWER(${candidateSlug})`)
                    .limit(1);
                  return Boolean(found);
                },
              }));

            const resaleValues: Partial<ResaleListingInsertRow> = {
              slug: finalSlug,
              projectId: projRow?.id ?? null,
              locationId: locRow?.id ?? null,
              latitude: coarsenedLat !== null ? String(coarsenedLat) : null,
              longitude: coarsenedLng !== null ? String(coarsenedLng) : null,
              propertyType: rawPropertyType,
              configuration: txCaps.hasExtendedListingColumns
                ? configurationVal
                : configurationVal || (isPlot ? 'Residential Plot' : 'Residential Unit'),
              bedroomCount: txCaps.hasExtendedListingColumns
                ? bedroomCountVal
                : bedroomCountVal ?? 0,
              carpetArea: !isPlot && carpetAreaNum > 0 ? carpetAreaNum.toFixed(2) : null,
              builtUpArea: !isPlot && builtUpAreaNum > 0 ? builtUpAreaNum.toFixed(2) : null,
              superBuiltUpArea: !isPlot && superBuiltUpAreaNum > 0 ? superBuiltUpAreaNum.toFixed(2) : null,
              askingPrice: askingPriceNum.toFixed(2),
              furnishing: txCaps.hasExtendedListingColumns
                ? furnishingVal
                : furnishingVal || 'UNFURNISHED',
              facing: facingVal,
              floorCategory: txCaps.hasExtendedListingColumns
                ? floorCategoryVal
                : floorCategoryVal || 'LOW',
              possession: possessionVal,
              possessionDate: detailsObj.possessionDate ? new Date(detailsObj.possessionDate) : null,
              description: detailsObj.description || 'Verified Great Homes resale listing.',
              listingPartyType,
              listingPartyDisplayName,
              ownerName: listingPartyType === 'OWNER' ? submitterName : null,
              ownerPhone: listingPartyType === 'OWNER' ? submitterPhone : null,
              ownerEmail: listingPartyType === 'OWNER' ? submitterEmail : null,
              brokerName: listingPartyType === 'LISTING_PARTNER' ? submitterName : null,
              brokerPhone: listingPartyType === 'LISTING_PARTNER' ? submitterPhone : null,
              brokerEmail: listingPartyType === 'LISTING_PARTNER' ? submitterEmail : null,
              privatePhone: submitterPhone,
              privateEmail: submitterEmail,
              source: `SUBMISSION:${submissionId}`,
              lifecycleStatus: 'PUBLISHED',
              verificationStatus: 'VERIFIED',
              verifiedAt: now,
              verifiedBy: staffId,
              updatedAt: now,
            };

            if (txCaps.hasExtendedListingColumns) {
              resaleValues.plotArea =
                isPlot || (isHouse && plotAreaNum > 0) ? plotAreaNum.toFixed(2) : null;
              resaleValues.customLocalityDisplay = customLocalityDisplay;
              resaleValues.customProjectDisplay = customProjectDisplay;
            }

            if (existingRow) {
              await tx
                .update(resaleListings)
                .set(resaleValues as Partial<typeof resaleListings.$inferSelect>)
                .where(eq(resaleListings.id, createdOrUpdatedListingId));
            } else if (txCaps.hasExtendedListingColumns) {
              const resaleInsertRow = {
                id: createdOrUpdatedListingId,
                ...resaleValues,
                createdAt: now,
              } as ResaleListingInsertRow;
              await tx.insert(resaleListings).values(resaleInsertRow);
            } else {
              await tx.execute(sql`
                INSERT INTO resale_listings (
                  id, slug, project_id, location_id, latitude, longitude,
                  property_type, configuration, bedroom_count, carpet_area,
                  built_up_area, super_built_up_area, asking_price, furnishing,
                  facing, floor_category, possession, possession_date, description,
                  listing_party_type, listing_party_display_name, owner_name,
                  owner_phone, owner_email, broker_name, broker_phone, broker_email,
                  private_phone, private_email, source, lifecycle_status,
                  verification_status, verified_at, verified_by, created_at, updated_at
                ) VALUES (
                  ${createdOrUpdatedListingId}, ${resaleValues.slug ?? null},
                  ${resaleValues.projectId ?? null}, ${resaleValues.locationId ?? null},
                  ${resaleValues.latitude ?? null}, ${resaleValues.longitude ?? null},
                  ${resaleValues.propertyType}, ${resaleValues.configuration},
                  ${resaleValues.bedroomCount}, ${resaleValues.carpetArea ?? null},
                  ${resaleValues.builtUpArea ?? null}, ${resaleValues.superBuiltUpArea ?? null},
                  ${resaleValues.askingPrice}, ${resaleValues.furnishing},
                  ${resaleValues.facing}, ${resaleValues.floorCategory},
                  ${resaleValues.possession}, ${resaleValues.possessionDate ?? null},
                  ${resaleValues.description ?? null}, ${resaleValues.listingPartyType},
                  ${resaleValues.listingPartyDisplayName ?? null}, ${resaleValues.ownerName ?? null},
                  ${resaleValues.ownerPhone ?? null}, ${resaleValues.ownerEmail ?? null},
                  ${resaleValues.brokerName ?? null}, ${resaleValues.brokerPhone ?? null},
                  ${resaleValues.brokerEmail ?? null}, ${resaleValues.privatePhone ?? null},
                  ${resaleValues.privateEmail ?? null}, ${resaleValues.source ?? null},
                  ${resaleValues.lifecycleStatus}, ${resaleValues.verificationStatus},
                  ${resaleValues.verifiedAt ?? null}, ${resaleValues.verifiedBy ?? null},
                  ${now}, ${resaleValues.updatedAt ?? now}
                )
              `);
            }

            await tx
              .delete(resaleListingMedia)
              .where(eq(resaleListingMedia.resaleListingId, createdOrUpdatedListingId));
            if (mediaList.length > 0) {
              await tx.insert(resaleListingMedia).values(
                mediaList.map((m, idx) => ({
                  id: `rsm_${uuidv4()}`,
                  resaleListingId: createdOrUpdatedListingId!,
                  mediaType: 'IMAGE',
                  category: this.mapListingMediaCategory(m.category),
                  url: m.watermarkedUrl || m.url,
                  altText: m.caption || `${rawPropertyType} photo ${idx + 1}`,
                  caption: m.caption ?? null,
                  sortOrder: m.sortOrder ?? idx,
                  isFeatured: m.isFeatured || idx === 0,
                  createdAt: now,
                  updatedAt: now,
                }))
              );
            }

            await tx
              .delete(resaleListingAmenities)
              .where(eq(resaleListingAmenities.resaleListingId, createdOrUpdatedListingId));
            const rawAmenityRefs = Array.isArray(detailsObj.amenities)
              ? detailsObj.amenities.map((x: unknown) => String(x).trim()).filter(Boolean)
              : [];
            if (rawAmenityRefs.length > 0) {
              const allAmenities = await tx.select().from(amenities);
              const matchedIds = allAmenities
                .filter((a) => rawAmenityRefs.includes(a.id) || rawAmenityRefs.includes(a.slug))
                .map((a) => a.id);
              if (matchedIds.length > 0) {
                await tx.insert(resaleListingAmenities).values(
                  matchedIds.map((amenityId) => ({
                    id: `rsa_${uuidv4()}`,
                    resaleListingId: createdOrUpdatedListingId!,
                    amenityId,
                  }))
                );
              }
            }
          }

          const updateSubValues: PropertySubmissionUpdateRow = {
            submissionStatus: 'PUBLISHED',
            publishedAt: subData.publishedAt ?? now,
            publishedByStaffId: subData.publishedByStaffId ?? staffId,
            version: (typeof subData.version === 'number' ? subData.version : 1) + 1,
            updatedAt: now,
          };
          if (listingPurpose === 'RENTAL') {
            updateSubValues.rentalListingId = createdOrUpdatedListingId;
          } else {
            updateSubValues.resaleListingId = createdOrUpdatedListingId;
          }
          if (options?.overrideReason) {
            updateSubValues.overrideReason = options.overrideReason;
            updateSubValues.overrideByStaffId = staffId;
            updateSubValues.overrideAt = now;
          }

          await this.dbUpdateSubmission(tx, submissionId, updateSubValues);

          const publishReview: PropertySubmissionReviewInsertRow = {
            id: reviewId,
            submissionId,
            staffUserId: staffId,
            eventType,
            previousStatus: currentStatus,
            newStatus: 'PUBLISHED',
            submitterFeedback: options?.overrideReason || null,
            internalNote: options?.overrideReason
              ? `SUPER_ADMIN override publication: ${options.overrideReason}`
              : null,
            createdAt: now,
          };
          await this.dbInsertReview(tx, publishReview);
        });
      });
    }

    resaleListingService.invalidatePublishedCache();
    rentalListingService.invalidatePublishedCache();
    safeRevalidateListingPaths([
      '/',
      '/buy',
      '/rent',
      '/locations',
      listingPurpose === 'RENTAL' ? `/rent/${finalSlug}` : `/buy/${finalSlug}`,
    ]);

    await safeAuditRecord(
      staffId,
      actorRole,
      options?.overrideReason ? 'OVERRIDE' : 'PUBLISH',
      submissionId,
      finalSlug || submissionId,
      { status: currentStatus },
      { status: 'PUBLISHED', listingId: createdOrUpdatedListingId, slug: finalSlug },
      options?.overrideReason ? { overrideReason: options.overrideReason } : undefined
    );
    await safeCreateNotification({
      customerId: subData.submitterCustomerId,
      type: 'SUBMISSION_PUBLISHED',
      title: 'Your Property Listing Is Live',
      message: 'Great Homes has published your verified property onto the public catalog.',
      resourceId: submissionId,
      dedupKey: `sub_published_${submissionId}_${createdOrUpdatedListingId}`,
      metadata: {
        submissionId,
        listingId: createdOrUpdatedListingId,
        slug: finalSlug,
        status: 'PUBLISHED',
      },
    });

    return {
      success: true,
      submissionStatus: 'PUBLISHED',
      listingId: createdOrUpdatedListingId,
      slug: finalSlug,
    };
  }

  async deactivateListing(
    submissionId: string,
    staffId: string,
    actorRole: string,
    reason: string,
    internalNote?: string
  ) {
    assertRepoStaffCapability(actorRole, 'submission.deactivate');
    const detail = await this.getSubmissionDetailForStaff(submissionId);
    const currentStatus = detail.submission.submissionStatus;
    if (currentStatus !== 'PUBLISHED') {
      throw new PropertySubmissionDomainError('Only published submissions can be deactivated.', 409);
    }
    const reviewId = `rev_${uuidv4()}`;
    const now = new Date();
    const backend = this.resolvePersistenceBackend();

    if (backend.mode === 'memory') {
      const sub = memorySubmissions.get(submissionId)!;
      memorySubmissions.set(submissionId, {
        ...sub,
        submissionStatus: 'DEACTIVATED',
        deactivatedAt: now,
        deactivatedByStaffId: staffId,
        version: (typeof sub.version === 'number' ? sub.version : 1) + 1,
        updatedAt: now,
      });
      if (sub.resaleListingId) {
        await resaleListingRepository.update(sub.resaleListingId, { lifecycleStatus: 'PAUSED' } as any);
      }
      if (sub.rentalListingId) {
        await rentalListingRepository.update(sub.rentalListingId, { lifecycleStatus: 'PAUSED' } as any);
      }
      const revs = memoryReviews.get(submissionId) || [];
      revs.push({
        id: reviewId,
        submissionId,
        staffUserId: staffId,
        eventType: 'DEACTIVATED',
        previousStatus: currentStatus,
        newStatus: 'DEACTIVATED',
        submitterFeedback: reason,
        internalNote: internalNote || null,
        createdAt: now,
      });
      memoryReviews.set(submissionId, revs);
    } else {
      await this.runWithPersistenceGuard(async () => {
        await backend.db.transaction(async (tx) => {
          const deactivateUpdate: PropertySubmissionUpdateRow = {
            submissionStatus: 'DEACTIVATED',
            deactivatedAt: now,
            deactivatedByStaffId: staffId,
            version: (typeof detail.submission.version === 'number' ? detail.submission.version : 1) + 1,
            updatedAt: now,
          };
          await this.dbUpdateSubmission(tx, submissionId, deactivateUpdate);

          if (detail.submission.resaleListingId) {
            const resalePause: Partial<typeof resaleListings.$inferSelect> = {
              lifecycleStatus: 'PAUSED',
              updatedAt: now,
            };
            await tx
              .update(resaleListings)
              .set(resalePause)
              .where(eq(resaleListings.id, detail.submission.resaleListingId));
          }
          if (detail.submission.rentalListingId) {
            const rentalPause: Partial<typeof rentalListings.$inferSelect> = {
              lifecycleStatus: 'PAUSED',
              updatedAt: now,
            };
            await tx
              .update(rentalListings)
              .set(rentalPause)
              .where(eq(rentalListings.id, detail.submission.rentalListingId));
          }

          const deactivateReview: PropertySubmissionReviewInsertRow = {
            id: reviewId,
            submissionId,
            staffUserId: staffId,
            eventType: 'DEACTIVATED',
            previousStatus: currentStatus,
            newStatus: 'DEACTIVATED',
            submitterFeedback: reason,
            internalNote: internalNote || null,
            createdAt: now,
          };
          await this.dbInsertReview(tx, deactivateReview);
        });
      });
    }

    resaleListingService.invalidatePublishedCache();
    rentalListingService.invalidatePublishedCache();
    safeRevalidateListingPaths(['/', '/buy', '/rent', '/locations']);

    await safeAuditRecord(
      staffId,
      actorRole,
      'DEACTIVATE',
      submissionId,
      submissionId,
      { status: currentStatus },
      { status: 'DEACTIVATED', reason }
    );
    await safeCreateNotification({
      customerId: detail.submission.submitterCustomerId,
      type: 'LISTING_DEACTIVATED',
      title: 'Listing Deactivated',
      message: reason,
      resourceId: submissionId,
      dedupKey: `sub_deactivated_${submissionId}_${reviewId}`,
      metadata: { submissionId, status: 'DEACTIVATED' },
    });

    return { success: true, submissionStatus: 'DEACTIVATED' };
  }

  async reactivateListing(submissionId: string, staffId: string, actorRole: string) {
    assertRepoStaffCapability(actorRole, 'submission.reactivate');
    const detail = await this.getSubmissionDetailForStaff(submissionId);
    const currentStatus = detail.submission.submissionStatus;
    if (currentStatus !== 'DEACTIVATED') {
      throw new PropertySubmissionDomainError('Only deactivated submissions can be reactivated.', 409);
    }
    const reviewId = `rev_${uuidv4()}`;
    const now = new Date();
    const backend = this.resolvePersistenceBackend();

    if (backend.mode === 'memory') {
      const sub = memorySubmissions.get(submissionId)!;
      memorySubmissions.set(submissionId, {
        ...sub,
        submissionStatus: 'PUBLISHED',
        version: (typeof sub.version === 'number' ? sub.version : 1) + 1,
        updatedAt: now,
      });
      if (sub.resaleListingId) {
        await resaleListingRepository.update(sub.resaleListingId, { lifecycleStatus: 'PUBLISHED' } as any);
      }
      if (sub.rentalListingId) {
        await rentalListingRepository.update(sub.rentalListingId, { lifecycleStatus: 'PUBLISHED' } as any);
      }
      const revs = memoryReviews.get(submissionId) || [];
      revs.push({
        id: reviewId,
        submissionId,
        staffUserId: staffId,
        eventType: 'REACTIVATED',
        previousStatus: currentStatus,
        newStatus: 'PUBLISHED',
        createdAt: now,
      });
      memoryReviews.set(submissionId, revs);
    } else {
      await this.runWithPersistenceGuard(async () => {
        await backend.db.transaction(async (tx) => {
          const reactivateUpdate: PropertySubmissionUpdateRow = {
            submissionStatus: 'PUBLISHED',
            version: (typeof detail.submission.version === 'number' ? detail.submission.version : 1) + 1,
            updatedAt: now,
          };
          await this.dbUpdateSubmission(tx, submissionId, reactivateUpdate);

          if (detail.submission.resaleListingId) {
            const resalePub: Partial<typeof resaleListings.$inferSelect> = {
              lifecycleStatus: 'PUBLISHED',
              updatedAt: now,
            };
            await tx
              .update(resaleListings)
              .set(resalePub)
              .where(eq(resaleListings.id, detail.submission.resaleListingId));
          }
          if (detail.submission.rentalListingId) {
            const rentalPub: Partial<typeof rentalListings.$inferSelect> = {
              lifecycleStatus: 'PUBLISHED',
              updatedAt: now,
            };
            await tx
              .update(rentalListings)
              .set(rentalPub)
              .where(eq(rentalListings.id, detail.submission.rentalListingId));
          }

          const reactivateReview: PropertySubmissionReviewInsertRow = {
            id: reviewId,
            submissionId,
            staffUserId: staffId,
            eventType: 'REACTIVATED',
            previousStatus: currentStatus,
            newStatus: 'PUBLISHED',
            createdAt: now,
          };
          await this.dbInsertReview(tx, reactivateReview);
        });
      });
    }

    resaleListingService.invalidatePublishedCache();
    rentalListingService.invalidatePublishedCache();
    safeRevalidateListingPaths(['/', '/buy', '/rent', '/locations']);

    await safeAuditRecord(
      staffId,
      actorRole,
      'REACTIVATE',
      submissionId,
      submissionId,
      { status: currentStatus },
      { status: 'PUBLISHED' }
    );
    await safeCreateNotification({
      customerId: detail.submission.submitterCustomerId,
      type: 'SUBMISSION_PUBLISHED',
      title: 'Listing Reactivated',
      message: 'Your verified Great Homes listing has been reactivated and is live again.',
      resourceId: submissionId,
      dedupKey: `sub_reactivated_${submissionId}_${reviewId}`,
      metadata: { submissionId, status: 'PUBLISHED' },
    });

    return { success: true, submissionStatus: 'PUBLISHED' };
  }

  async overrideSubmission(
    submissionId: string,
    staffId: string,
    actorRole: string,
    input: {
      targetStatus:
        | 'UNDER_REVIEW'
        | 'CHANGES_REQUESTED'
        | 'APPROVED'
        | 'REJECTED'
        | 'PUBLISHED'
        | 'DEACTIVATED';
      reason: string;
      submitterFeedback?: string;
      internalNote?: string;
      contactConfirmed?: boolean;
      checklist?: Record<string, boolean>;
    }
  ) {
    if (actorRole !== 'SUPER_ADMIN') {
      throw new PropertySubmissionDomainError(
        'Only SUPER_ADMIN may execute a workflow override.',
        403
      );
    }
    const reasonTrimmed = (input.reason || '').trim();
    if (reasonTrimmed.length < 5) {
      throw new PropertySubmissionDomainError(
        'Override reason must be at least 5 characters.',
        400
      );
    }

    const detail = await this.getSubmissionDetailForStaff(submissionId);
    const currentStatus = detail.submission.submissionStatus;

    if (input.targetStatus === 'PUBLISHED') {
      return await this.publishSubmission(submissionId, staffId, actorRole, {
        skipApprovedCheckForOverride: true,
        overrideReason: reasonTrimmed,
      });
    }

    if (input.targetStatus === 'DEACTIVATED') {
      if (!detail.submission.resaleListingId && !detail.submission.rentalListingId) {
        throw new PropertySubmissionDomainError(
          'Cannot override to DEACTIVATED when no live public listing has been published.',
          400
        );
      }
    }

    const mediaList = await this.listSubmissionMedia(
      submissionId,
      detail.submission.submitterCustomerId
    );
    if (input.targetStatus === 'APPROVED') {
      if (mediaList.length < 3 || mediaList.length > 15) {
        throw new PropertySubmissionDomainError(
          'Override to APPROVED cannot bypass the 3–15 photograph requirement.',
          400
        );
      }
    }

    const now = new Date();
    const reviewId = `rev_${uuidv4()}`;
    const mergedChecklist = {
      ...(detail.reviewChecklist || {}),
      ...(input.checklist || {}),
    };
    const nextContactConfirmed =
      typeof input.contactConfirmed === 'boolean'
        ? input.contactConfirmed
        : Boolean(detail.submission.contactConfirmed);

    const backend = this.resolvePersistenceBackend();
    if (backend.mode === 'memory') {
      const sub = memorySubmissions.get(submissionId)!;
      memorySubmissions.set(submissionId, {
        ...sub,
        submissionStatus: input.targetStatus,
        reviewChecklist: mergedChecklist,
        contactConfirmed: nextContactConfirmed,
        overrideReason: reasonTrimmed,
        overrideByStaffId: staffId,
        overrideAt: now,
        approvedAt: input.targetStatus === 'APPROVED' ? sub.approvedAt ?? now : sub.approvedAt,
        deactivatedAt:
          input.targetStatus === 'DEACTIVATED' ? now : sub.deactivatedAt,
        deactivatedByStaffId:
          input.targetStatus === 'DEACTIVATED' ? staffId : sub.deactivatedByStaffId,
        version: (typeof sub.version === 'number' ? sub.version : 1) + 1,
        updatedAt: now,
      });
      if (input.targetStatus === 'DEACTIVATED') {
        if (sub.resaleListingId) {
          await resaleListingRepository.update(sub.resaleListingId, { lifecycleStatus: 'PAUSED' } as any);
        }
        if (sub.rentalListingId) {
          await rentalListingRepository.update(sub.rentalListingId, { lifecycleStatus: 'PAUSED' } as any);
        }
      }
      const revs = memoryReviews.get(submissionId) || [];
      revs.push({
        id: reviewId,
        submissionId,
        staffUserId: staffId,
        eventType: 'OVERRIDE',
        previousStatus: currentStatus,
        newStatus: input.targetStatus,
        submitterFeedback: input.submitterFeedback || reasonTrimmed,
        internalNote: input.internalNote || `SUPER_ADMIN override: ${reasonTrimmed}`,
        createdAt: now,
      });
      memoryReviews.set(submissionId, revs);
    } else {
      await this.runWithPersistenceGuard(async () => {
        await backend.db.transaction(async (tx) => {
          const updateData: PropertySubmissionUpdateRow = {
            submissionStatus: input.targetStatus,
            reviewChecklist: mergedChecklist,
            contactConfirmed: nextContactConfirmed,
            overrideReason: reasonTrimmed,
            overrideByStaffId: staffId,
            overrideAt: now,
            version: (typeof detail.submission.version === 'number' ? detail.submission.version : 1) + 1,
            updatedAt: now,
          };
          if (input.targetStatus === 'APPROVED') {
            updateData.approvedAt = detail.submission.approvedAt ?? now;
          }
          if (input.targetStatus === 'DEACTIVATED') {
            updateData.deactivatedAt = now;
            updateData.deactivatedByStaffId = staffId;
            if (detail.submission.resaleListingId) {
              const resalePause: Partial<typeof resaleListings.$inferSelect> = {
                lifecycleStatus: 'PAUSED',
                updatedAt: now,
              };
              await tx
                .update(resaleListings)
                .set(resalePause)
                .where(eq(resaleListings.id, detail.submission.resaleListingId));
            }
            if (detail.submission.rentalListingId) {
              const rentalPause: Partial<typeof rentalListings.$inferSelect> = {
                lifecycleStatus: 'PAUSED',
                updatedAt: now,
              };
              await tx
                .update(rentalListings)
                .set(rentalPause)
                .where(eq(rentalListings.id, detail.submission.rentalListingId));
            }
          }

          await this.dbUpdateSubmission(tx, submissionId, updateData);

          const overrideReview: PropertySubmissionReviewInsertRow = {
            id: reviewId,
            submissionId,
            staffUserId: staffId,
            eventType: 'OVERRIDE',
            previousStatus: currentStatus,
            newStatus: input.targetStatus,
            submitterFeedback: input.submitterFeedback || reasonTrimmed,
            internalNote: input.internalNote || `SUPER_ADMIN override: ${reasonTrimmed}`,
            createdAt: now,
          };
          await this.dbInsertReview(tx, overrideReview);
        });
      });
    }

    if (input.targetStatus === 'DEACTIVATED') {
      resaleListingService.invalidatePublishedCache();
      rentalListingService.invalidatePublishedCache();
      safeRevalidateListingPaths(['/', '/buy', '/rent', '/locations']);
    }

    await safeAuditRecord(
      staffId,
      actorRole,
      'OVERRIDE',
      submissionId,
      submissionId,
      { status: currentStatus },
      { status: input.targetStatus, overrideReason: reasonTrimmed }
    );
    await safeCreateNotification({
      customerId: detail.submission.submitterCustomerId,
      type:
        input.targetStatus === 'DEACTIVATED'
          ? 'LISTING_DEACTIVATED'
          : 'SUBMISSION_STATUS_CHANGED',
      title: 'Submission Status Updated',
      message: input.submitterFeedback || reasonTrimmed,
      resourceId: submissionId,
      dedupKey: `sub_override_${submissionId}_${reviewId}`,
      metadata: { submissionId, status: input.targetStatus },
    });

    return {
      success: true,
      submissionStatus: input.targetStatus,
      overrideReason: reasonTrimmed,
    };
  }

  async resolveDuplicateFlag(
    submissionId: string,
    flagId: string,
    staffId: string,
    actorRole: string,
    input: {
      resolutionStatus: DuplicateResolutionStatus;
      resolutionNote?: string | null;
    }
  ) {
    assertRepoStaffCapability(actorRole, 'submission.resolveDuplicate');
    const backend = this.resolvePersistenceBackend();
    const now = new Date();

    if (backend.mode === 'memory') {
      const list = memoryDuplicateFlags.get(submissionId) || [];
      const idx = list.findIndex((f) => f.id === flagId);
      if (idx === -1) {
        throw new PropertySubmissionDomainError('Duplicate flag not found.', 404);
      }
      const prev = list[idx];
      const updated: DuplicateFlagRecord = {
        ...prev,
        resolutionStatus: input.resolutionStatus,
        resolutionNote: input.resolutionNote ?? null,
        resolvedByStaffId: staffId,
        resolvedAt: now,
        updatedAt: now,
      };
      list[idx] = updated;
      memoryDuplicateFlags.set(submissionId, list);
      await safeAuditRecord(
        staffId,
        actorRole,
        'RESOLVE_DUPLICATE',
        submissionId,
        flagId,
        { resolutionStatus: prev.resolutionStatus },
        { resolutionStatus: input.resolutionStatus, resolutionNote: input.resolutionNote ?? null }
      );
      return { success: true, duplicateFlag: updated };
    }

    return await this.runWithPersistenceGuard(async () => {
      const caps = await this.getSchemaCapabilities(backend.db);
      if (!caps.hasDuplicateFlagsTable) {
        const list = await this.dbSelectDuplicateFlags(backend.db, submissionId);
        const idx = list.findIndex((f) => f.id === flagId);
        if (idx === -1) {
          throw new PropertySubmissionDomainError('Duplicate flag not found.', 404);
        }
        const prev = list[idx];
        const updated: DuplicateFlagRecord = {
          ...prev,
          resolutionStatus: input.resolutionStatus,
          resolutionNote: input.resolutionNote ?? null,
          resolvedByStaffId: staffId,
          resolvedAt: now,
          updatedAt: now,
        };
        const nextList = [...list];
        nextList[idx] = updated;
        await this.dbUpdateSubmission(backend.db, submissionId, {
          updatedAt: now,
          __ghSubMetaPatch: { duplicateFlags: nextList },
        });
        await safeAuditRecord(
          staffId,
          actorRole,
          'RESOLVE_DUPLICATE',
          submissionId,
          flagId,
          { resolutionStatus: prev.resolutionStatus },
          { resolutionStatus: input.resolutionStatus, resolutionNote: input.resolutionNote ?? null }
        );
        return { success: true, duplicateFlag: updated };
      }

      const [existing] = await backend.db
        .select()
        .from(propertySubmissionDuplicateFlags)
        .where(
          and(
            eq(propertySubmissionDuplicateFlags.id, flagId),
            eq(propertySubmissionDuplicateFlags.submissionId, submissionId)
          )
        );
      if (!existing) {
        throw new PropertySubmissionDomainError('Duplicate flag not found.', 404);
      }

      const dupUpdate: DuplicateFlagUpdateRow = {
        resolutionStatus: input.resolutionStatus,
        resolutionNote: input.resolutionNote ?? null,
        resolvedByStaffId: staffId,
        resolvedAt: now,
        updatedAt: now,
      };
      const [updated] = await backend.db
        .update(propertySubmissionDuplicateFlags)
        .set(dupUpdate)
        .where(eq(propertySubmissionDuplicateFlags.id, flagId))
        .returning();

      await safeAuditRecord(
        staffId,
        actorRole,
        'RESOLVE_DUPLICATE',
        submissionId,
        flagId,
        { resolutionStatus: existing.resolutionStatus },
        { resolutionStatus: input.resolutionStatus, resolutionNote: input.resolutionNote ?? null }
      );

      return { success: true, duplicateFlag: updated };
    });
  }

  async createChangeRequest(
    submissionId: string,
    customerId: string,
    input: {
      requestType: 'CORRECTION' | 'REMOVAL';
      reason: string;
      requestedChanges?: Record<string, unknown> | null;
    }
  ) {
    const existing = await this.getById(submissionId, customerId);
    if (!existing) {
      throw new PropertySubmissionDomainError('Submission not found or unauthorized', 404);
    }

    if (input.requestType === 'REMOVAL' && existing.submissionStatus !== 'PUBLISHED') {
      throw new PropertySubmissionDomainError(
        'Removal requests can only be submitted for currently PUBLISHED listings.',
        409
      );
    }
    if (
      input.requestType === 'CORRECTION' &&
      existing.submissionStatus !== 'PUBLISHED' &&
      existing.submissionStatus !== 'DEACTIVATED'
    ) {
      throw new PropertySubmissionDomainError(
        'Post-publication correction requests are only applicable to PUBLISHED or DEACTIVATED listings.',
        409
      );
    }

    const reqId = `cr_${uuidv4()}`;
    const now = new Date();
    const record: SubmissionChangeRequestRecord = {
      id: reqId,
      submissionId,
      customerId,
      requestType: input.requestType,
      reason: input.reason.trim(),
      requestedChanges: input.requestedChanges ?? null,
      status: 'PENDING',
      staffResponse: null,
      resolvedByStaffId: null,
      resolvedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    const backend = this.resolvePersistenceBackend();
    if (backend.mode === 'memory') {
      const list = memoryChangeRequests.get(submissionId) || [];
      list.unshift(record);
      memoryChangeRequests.set(submissionId, list);
    } else {
      await this.runWithPersistenceGuard(async () => {
        const caps = await this.getSchemaCapabilities(backend.db);
        if (!caps.hasChangeRequestsTable) {
          const existingReqs = await this.dbSelectChangeRequests(backend.db, submissionId);
          await this.dbUpdateSubmission(backend.db, submissionId, {
            updatedAt: now,
            __ghSubMetaPatch: { changeRequests: [record, ...existingReqs] },
          });
          return;
        }
        const crInsert: ChangeRequestInsertRow = {
          id: record.id,
          submissionId: record.submissionId,
          customerId: record.customerId,
          requestType: record.requestType,
          reason: record.reason,
          requestedChanges: record.requestedChanges,
          status: 'PENDING',
          createdAt: now,
          updatedAt: now,
        };
        await backend.db.insert(propertySubmissionChangeRequests).values(crInsert);
      });
    }

    await safeAuditRecord(
      null,
      'CUSTOMER',
      'CREATE',
      submissionId,
      reqId,
      null,
      { requestType: record.requestType, reason: record.reason }
    );

    return record;
  }

  async listCustomerChangeRequests(submissionId: string, customerId: string) {
    const existing = await this.getById(submissionId, customerId);
    if (!existing) {
      throw new PropertySubmissionDomainError('Submission not found or unauthorized', 404);
    }

    const backend = this.resolvePersistenceBackend();
    if (backend.mode === 'memory') {
      return [...(memoryChangeRequests.get(submissionId) || [])].sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
      );
    }

    return await this.runWithPersistenceGuard(async () => {
      return await this.dbSelectChangeRequests(backend.db, submissionId, customerId);
    });
  }

  async resolveChangeRequest(
    submissionId: string,
    requestId: string,
    staffId: string,
    actorRole: string,
    input: {
      status: 'APPROVED' | 'APPLIED' | 'REJECTED';
      staffResponse: string;
      deactivateListing?: boolean;
    }
  ) {
    assertRepoStaffCapability(actorRole, 'submission.editCurated');
    const detail = await this.getSubmissionDetailForStaff(submissionId);
    const now = new Date();
    const reviewId = `rev_${uuidv4()}`;
    const backend = this.resolvePersistenceBackend();

    let updatedReq: any;
    let requestType: 'CORRECTION' | 'REMOVAL' = 'CORRECTION';

    if (backend.mode === 'memory') {
      const list = memoryChangeRequests.get(submissionId) || [];
      const idx = list.findIndex((cr) => cr.id === requestId);
      if (idx === -1) {
        throw new PropertySubmissionDomainError('Change request not found.', 404);
      }
      requestType = list[idx].requestType;
      updatedReq = {
        ...list[idx],
        status: input.status,
        staffResponse: input.staffResponse.trim(),
        resolvedByStaffId: staffId,
        resolvedAt: now,
        updatedAt: now,
      };
      list[idx] = updatedReq;
      memoryChangeRequests.set(submissionId, list);

      const revs = memoryReviews.get(submissionId) || [];
      revs.push({
        id: reviewId,
        submissionId,
        staffUserId: staffId,
        eventType: 'CHANGE_REQUEST_RESOLVED',
        previousStatus: detail.submission.submissionStatus,
        newStatus: detail.submission.submissionStatus,
        submitterFeedback: `${requestType} request ${input.status.toLowerCase()}: ${input.staffResponse.trim()}`,
        createdAt: now,
      });
      memoryReviews.set(submissionId, revs);
    } else {
      await this.runWithPersistenceGuard(async () => {
        await backend.db.transaction(async (tx) => {
          const caps = await this.getSchemaCapabilities(tx);
          if (!caps.hasChangeRequestsTable) {
            const list = await this.dbSelectChangeRequests(tx, submissionId);
            const idx = list.findIndex((cr) => cr.id === requestId);
            if (idx === -1) {
              throw new PropertySubmissionDomainError('Change request not found.', 404);
            }
            requestType = list[idx].requestType === 'REMOVAL' ? 'REMOVAL' : 'CORRECTION';
            updatedReq = {
              ...list[idx],
              status: input.status,
              staffResponse: input.staffResponse.trim(),
              resolvedByStaffId: staffId,
              resolvedAt: now,
              updatedAt: now,
            };
            const nextList = [...list];
            nextList[idx] = updatedReq;
            await this.dbUpdateSubmission(tx, submissionId, {
              updatedAt: now,
              __ghSubMetaPatch: { changeRequests: nextList },
            });
          } else {
            const [existingReq] = await tx
              .select()
              .from(propertySubmissionChangeRequests)
              .where(
                and(
                  eq(propertySubmissionChangeRequests.id, requestId),
                  eq(propertySubmissionChangeRequests.submissionId, submissionId)
                )
              );
            if (!existingReq) {
              throw new PropertySubmissionDomainError('Change request not found.', 404);
            }
            requestType = existingReq.requestType === 'REMOVAL' ? 'REMOVAL' : 'CORRECTION';

            const crUpdate: ChangeRequestUpdateRow = {
              status: input.status,
              staffResponse: input.staffResponse.trim(),
              resolvedByStaffId: staffId,
              resolvedAt: now,
              updatedAt: now,
            };
            const [saved] = await tx
              .update(propertySubmissionChangeRequests)
              .set(crUpdate)
              .where(eq(propertySubmissionChangeRequests.id, requestId))
              .returning();
            updatedReq = saved;
          }

          const crReview: PropertySubmissionReviewInsertRow = {
            id: reviewId,
            submissionId,
            staffUserId: staffId,
            eventType: 'CHANGE_REQUEST_RESOLVED',
            previousStatus: detail.submission.submissionStatus,
            newStatus: detail.submission.submissionStatus,
            submitterFeedback: `${requestType} request ${input.status.toLowerCase()}: ${input.staffResponse.trim()}`,
            createdAt: now,
          };
          await this.dbInsertReview(tx, crReview);
        });
      });
    }

    const shouldDeactivate =
      (requestType === 'REMOVAL' &&
        (input.status === 'APPROVED' || input.status === 'APPLIED') &&
        input.deactivateListing !== false) ||
      Boolean(input.deactivateListing);

    if (shouldDeactivate && detail.submission.submissionStatus === 'PUBLISHED') {
      await this.deactivateListing(
        submissionId,
        staffId,
        actorRole,
        input.staffResponse.trim()
      );
    }

    const auditAction: AuditAction =
      requestType === 'REMOVAL' ? 'RESOLVE_REMOVAL' : 'RESOLVE_CORRECTION';

    await safeAuditRecord(
      staffId,
      actorRole,
      auditAction,
      submissionId,
      requestId,
      { status: 'PENDING' },
      { status: input.status, staffResponse: input.staffResponse.trim() }
    );
    await safeCreateNotification({
      customerId: detail.submission.submitterCustomerId,
      type: 'CHANGE_REQUEST_UPDATED',
      title:
        requestType === 'REMOVAL'
          ? 'Listing Removal Request Updated'
          : 'Listing Correction Request Updated',
      message: input.staffResponse.trim(),
      resourceId: submissionId,
      dedupKey: `sub_cr_${requestId}_${input.status}`,
      metadata: { submissionId, requestId, requestType, status: input.status },
    });

    return { success: true, changeRequest: updatedReq };
  }
}

export const propertySubmissionRepository = new PropertySubmissionRepository();
