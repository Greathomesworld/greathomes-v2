import {
  propertySubmissionRepository,
  PropertySubmissionRepository,
  PartnerEligibilityStatus,
  SubmissionRecord,
  PropertySubmissionDomainError,
  CustomerSubmissionDetail,
  ListCustomerSubmissionsOptions,
  PaginatedCustomerSubmissionsResult,
  mapMediaAssetToSubmissionPhoto,
} from './repository.ts';
import {
  validateSubmissionForSubmit,
  validateConditionalPropertyRules,
  propertyDetailsPayloadSchema,
  createSubmissionSchema,
  updateSubmissionSchema,
  getCanonicalDeclarationForSource,
  mergeSubmissionPayloads,
  CANONICAL_AMENITY_SLUG_SET,
  curatedEditSchema,
  approveSubmissionSchema,
  rejectSubmissionSchema,
  deactivateSubmissionSchema,
  overrideSubmissionSchema,
  resolveDuplicateSchema,
  createChangeRequestSchema,
  resolveChangeRequestSchema,
} from './validation.ts';
import { hasCapability, type StaffCapability } from '../auth/capabilityModel.ts';
import type { StaffRole } from '../auth/roles.ts';

function assertStaffRoleCapability(actorRole: string, capability: StaffCapability): void {
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

export interface SubmissionProjectReference {
  id: string;
  locationId: string;
  name?: string;
}

export interface SubmissionLocationReference {
  id: string;
  name: string;
  parentId?: string | null;
}

export interface SubmissionReferenceLookup {
  findProjectById(id: string): Promise<SubmissionProjectReference | null>;
  findLocationById(id: string): Promise<SubmissionLocationReference | null>;
  listAmenityIdentifiers(): Promise<Set<string>>;
}

function createDefaultReferenceLookup(): SubmissionReferenceLookup {
  return {
    async findProjectById(id: string): Promise<SubmissionProjectReference | null> {
      const { projectRepository } = await import('../../infrastructure/repositories/projectProvider');
      const project = await projectRepository.findById(id);
      if (!project) return null;
      return {
        id: project.id,
        locationId: project.locationId,
        name: project.name,
      };
    },
    async findLocationById(id: string): Promise<SubmissionLocationReference | null> {
      const { locationRepository } = await import('../../infrastructure/repositories/locationProvider');
      const loc = await locationRepository.findById(id);
      if (!loc) return null;
      return {
        id: loc.id,
        name: loc.name,
        parentId: loc.parentId ?? null,
      };
    },
    async listAmenityIdentifiers(): Promise<Set<string>> {
      const allowed = new Set<string>(CANONICAL_AMENITY_SLUG_SET);
      try {
        const { amenityRepository } = await import('../../infrastructure/repositories/projectProvider');
        const all = await amenityRepository.findAll();
        for (const item of all) {
          if (item.id) allowed.add(item.id);
          if (item.slug) allowed.add(item.slug);
        }
      } catch {
        // Fallback to CANONICAL_AMENITY_SLUG_SET if amenity repository is not initialized
      }
      return allowed;
    },
  };
}

function extractZodIssues(err: unknown): {
  message: string;
  fieldErrors: Record<string, string>;
} {
  const issues =
    ((err as { issues?: Array<{ path?: Array<string | number>; message: string }> })?.issues) ||
    [];
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    if (Array.isArray(issue.path) && issue.path.length > 0) {
      // Strip leading "payload." prefix if present for clean client/API mapping
      const normalizedPath =
        issue.path[0] === 'payload' ? issue.path.slice(1).join('.') : issue.path.join('.');
      if (normalizedPath && !fieldErrors[normalizedPath]) {
        fieldErrors[normalizedPath] = issue.message;
      }
    }
  }
  return {
    message: issues.map((e) => e.message).join(', ') || 'Invalid input',
    fieldErrors,
  };
}

export class PropertySubmissionService {
  private readonly repo: PropertySubmissionRepository;
  private readonly referenceLookup: SubmissionReferenceLookup;

  constructor(
    repo: PropertySubmissionRepository = propertySubmissionRepository,
    referenceLookup: SubmissionReferenceLookup = createDefaultReferenceLookup()
  ) {
    this.repo = repo;
    this.referenceLookup = referenceLookup;
  }

  private async getAllowedAmenityIdentifiers(payload: Record<string, unknown>): Promise<Set<string> | undefined> {
    const details = payload?.details as { amenities?: unknown } | undefined;
    if (!details || !Array.isArray(details.amenities) || details.amenities.length === 0) {
      return undefined;
    }
    return await this.referenceLookup.listAmenityIdentifiers();
  }

  private async validateLocationProjectCompatibility(locationInput: unknown): Promise<void> {
    if (!locationInput || typeof locationInput !== 'object') return;
    const loc = locationInput as {
      locationId?: string | null;
      locality?: string | null;
      projectId?: string | null;
      isCustomLocality?: boolean;
    };

    if (!loc.projectId) return;

    if (loc.isCustomLocality) {
      throw new PropertySubmissionDomainError(
        'A verified project cannot be linked when using a custom locality. Please clear the project selection or select a verified locality.',
        400,
        {
          'location.projectId':
            'A verified project cannot be linked when using a custom locality.',
        }
      );
    }

    const project = await this.referenceLookup.findProjectById(loc.projectId);
    if (!project) {
      throw new PropertySubmissionDomainError(
        'Selected residential project does not exist.',
        400,
        { 'location.projectId': 'Selected residential project does not exist.' }
      );
    }

    if (loc.locationId) {
      if (project.locationId === loc.locationId) {
        return;
      }

      // Allow hierarchical match if the project's location has an ancestor matching loc.locationId
      let cursorParentId: string | null | undefined = null;
      const projectLoc = await this.referenceLookup.findLocationById(project.locationId);
      cursorParentId = projectLoc?.parentId ?? null;
      let depth = 0;
      while (cursorParentId && depth < 4) {
        if (cursorParentId === loc.locationId) {
          return;
        }
        const parentLoc = await this.referenceLookup.findLocationById(cursorParentId);
        cursorParentId = parentLoc?.parentId ?? null;
        depth += 1;
      }

      throw new PropertySubmissionDomainError(
        'Selected residential project does not belong to the chosen locality.',
        400,
        {
          'location.projectId':
            'Selected residential project does not belong to the chosen locality.',
        }
      );
    }

    // If locationId was omitted (e.g., partial payload with locality string), verify locality name matches project's location
    if (loc.locality && loc.locality.trim().length > 0) {
      const projectLoc = await this.referenceLookup.findLocationById(project.locationId);
      if (
        projectLoc &&
        projectLoc.name.trim().toLowerCase() !== loc.locality.trim().toLowerCase()
      ) {
        throw new PropertySubmissionDomainError(
          'Selected residential project does not match the specified locality.',
          400,
          {
            'location.projectId':
              'Selected residential project does not match the specified locality.',
          }
        );
      }
    }
  }

  async getPartnerEligibility(customerId: string): Promise<PartnerEligibilityStatus> {
    if (!customerId || !customerId.trim()) {
      throw new PropertySubmissionDomainError('Authenticated customer identity is required.', 401);
    }
    return await this.repo.getPartnerEligibility(customerId.trim());
  }

  async createDraft(
    customerId: string,
    input: { listingType: 'RESALE' | 'RENTAL'; listingSource: 'OWNER' | 'PARTNER'; payload?: Record<string, unknown> }
  ): Promise<SubmissionRecord> {
    if (!customerId || !customerId.trim()) {
      throw new PropertySubmissionDomainError('Authenticated customer identity is required.', 401);
    }
    const parsed = createSubmissionSchema.safeParse(input);
    if (!parsed.success) {
      const { message, fieldErrors } = extractZodIssues(parsed.error);
      throw new PropertySubmissionDomainError(
        `Invalid submission input: ${message}`,
        400,
        fieldErrors
      );
    }

    const candidatePayload: Record<string, unknown> = {
      ...(parsed.data.payload as Record<string, unknown>),
      listingType: parsed.data.listingType,
      listingSource: parsed.data.listingSource,
    };

    const allowedAmenities = await this.getAllowedAmenityIdentifiers(candidatePayload);
    const conditionalCheck = validateConditionalPropertyRules(candidatePayload, {
      allowedAmenityIdentifiers: allowedAmenities,
    });
    if (!conditionalCheck.valid) {
      throw new PropertySubmissionDomainError(
        `Invalid submission details: ${conditionalCheck.errors.map((e) => e.message).join(', ')}`,
        400,
        conditionalCheck.fieldErrors
      );
    }

    await this.validateLocationProjectCompatibility(candidatePayload.location);

    return await this.repo.createDraft({
      submitterCustomerId: customerId.trim(),
      listingType: parsed.data.listingType,
      listingSource: parsed.data.listingSource,
      payload: parsed.data.payload as Record<string, unknown>,
    });
  }

  async getSubmission(id: string, customerId: string): Promise<SubmissionRecord> {
    if (!customerId || !customerId.trim()) {
      throw new PropertySubmissionDomainError('Authenticated customer identity is required.', 401);
    }
    const detail = await this.repo.getSubmissionDetailForCustomer(id, customerId.trim());
    return detail.submission;
  }

  async getCustomerSubmissionDetail(
    id: string,
    customerId: string
  ): Promise<CustomerSubmissionDetail> {
    if (!customerId || !customerId.trim()) {
      throw new PropertySubmissionDomainError('Authenticated customer identity is required.', 401);
    }
    return await this.repo.getSubmissionDetailForCustomer(id, customerId.trim());
  }

  async getCustomerSubmissions(customerId: string): Promise<SubmissionRecord[]> {
    if (!customerId || !customerId.trim()) {
      throw new PropertySubmissionDomainError('Authenticated customer identity is required.', 401);
    }
    return await this.repo.getByCustomer(customerId.trim());
  }

  async getCustomerSubmissionsPaginated(
    customerId: string,
    options?: ListCustomerSubmissionsOptions
  ): Promise<PaginatedCustomerSubmissionsResult> {
    if (!customerId || !customerId.trim()) {
      throw new PropertySubmissionDomainError('Authenticated customer identity is required.', 401);
    }
    return await this.repo.listCustomerSubmissionsPaginated(customerId.trim(), options);
  }

  async updateDraft(
    id: string,
    customerId: string,
    input: { payload: Record<string, unknown>; expectedVersion?: number }
  ): Promise<SubmissionRecord> {
    if (!customerId || !customerId.trim()) {
      throw new PropertySubmissionDomainError('Authenticated customer identity is required.', 401);
    }
    const parsed = updateSubmissionSchema.safeParse(input);
    if (!parsed.success) {
      const { message, fieldErrors } = extractZodIssues(parsed.error);
      throw new PropertySubmissionDomainError(
        `Invalid update payload: ${message}`,
        400,
        fieldErrors
      );
    }

    const normalizedCustomerId = customerId.trim();
    const existing = await this.repo.getById(id, normalizedCustomerId);
    if (!existing) {
      throw new PropertySubmissionDomainError('Submission not found or unauthorized', 404);
    }

    if (!['DRAFT', 'CHANGES_REQUESTED'].includes(existing.submissionStatus)) {
      throw new PropertySubmissionDomainError(
        `Cannot update submission in status ${existing.submissionStatus}`,
        400
      );
    }

    const existingPayloadObj =
      typeof existing.payload === 'object' && existing.payload !== null
        ? (existing.payload as Record<string, unknown>)
        : {};
    const patchPayload = parsed.data.payload as Record<string, unknown>;

    const nextListingType =
      typeof patchPayload.listingType === 'string'
        ? patchPayload.listingType
        : existing.listingType;
    const nextListingSource =
      typeof patchPayload.listingSource === 'string'
        ? patchPayload.listingSource
        : existing.listingSource;

    const mergedCandidate: Record<string, unknown> = {
      ...mergeSubmissionPayloads(existingPayloadObj, patchPayload),
      listingType: nextListingType,
      listingSource: nextListingSource,
    };

    // Re-validate merged details so partial updates cannot violate cross-field rules against saved fields
    if (mergedCandidate.details) {
      const mergedDetailsCheck = propertyDetailsPayloadSchema.safeParse(mergedCandidate.details);
      if (!mergedDetailsCheck.success) {
        const { message, fieldErrors } = extractZodIssues(mergedDetailsCheck.error);
        const prefixedErrors: Record<string, string> = {};
        for (const [k, v] of Object.entries(fieldErrors)) {
          prefixedErrors[k.startsWith('details.') ? k : `details.${k}`] = v;
        }
        throw new PropertySubmissionDomainError(
          `Invalid update payload: ${message}`,
          400,
          prefixedErrors
        );
      }
    }

    const allowedAmenities = await this.getAllowedAmenityIdentifiers(mergedCandidate);
    const conditionalCheck = validateConditionalPropertyRules(mergedCandidate, {
      allowedAmenityIdentifiers: allowedAmenities,
    });
    if (!conditionalCheck.valid) {
      throw new PropertySubmissionDomainError(
        `Invalid update payload: ${conditionalCheck.errors.map((e) => e.message).join(', ')}`,
        400,
        conditionalCheck.fieldErrors
      );
    }

    await this.validateLocationProjectCompatibility(mergedCandidate.location);

    return await this.repo.updateDraft(
      id,
      normalizedCustomerId,
      patchPayload,
      parsed.data.expectedVersion
    );
  }

  async submitForReview(
    id: string,
    customerId: string,
    overridePayload?: Record<string, unknown>
  ): Promise<SubmissionRecord> {
    if (!customerId || !customerId.trim()) {
      throw new PropertySubmissionDomainError('Authenticated customer identity is required.', 401);
    }
    const normalizedCustomerId = customerId.trim();
    const sub = await this.repo.getById(id, normalizedCustomerId);
    if (!sub) {
      throw new PropertySubmissionDomainError('Submission not found or unauthorized', 404);
    }

    if (!['DRAFT', 'CHANGES_REQUESTED'].includes(sub.submissionStatus)) {
      throw new PropertySubmissionDomainError(
        `Cannot submit property from status ${sub.submissionStatus}`,
        409
      );
    }

    const existingPayloadObj =
      typeof sub.payload === 'object' && sub.payload !== null
        ? { ...(sub.payload as Record<string, unknown>) }
        : {};

    // Ensure authoritative persisted media_assets populate payload.photos if present
    const mediaAssetsList = await this.repo.listSubmissionMedia(id, normalizedCustomerId);
    if (mediaAssetsList.length > 0) {
      existingPayloadObj.photos = mediaAssetsList.map(mapMediaAssetToSubmissionPhoto);
    }

    const candidatePayload = overridePayload
      ? mergeSubmissionPayloads(existingPayloadObj, overridePayload)
      : existingPayloadObj;
    if (mediaAssetsList.length > 0) {
      candidatePayload.photos = mediaAssetsList.map(mapMediaAssetToSubmissionPhoto);
    }

    const allowedAmenities = await this.getAllowedAmenityIdentifiers(candidatePayload);
    const validationResult = validateSubmissionForSubmit(candidatePayload, {
      allowedAmenityIdentifiers: allowedAmenities,
    });
    if (!validationResult.success || !validationResult.data) {
      throw new PropertySubmissionDomainError(
        `Submission validation failed: ${
          validationResult.errors?.map((e: { message: string }) => e.message).join(', ') || 'Unknown error'
        }`,
        400,
        validationResult.fieldErrors
      );
    }

    await this.validateLocationProjectCompatibility(validationResult.data.location);

    // Server-controlled canonical legal declaration and version (client-supplied text/version is ignored)
    const canonicalDeclaration = getCanonicalDeclarationForSource(
      validationResult.data.listingSource
    );

    const authoritativePayload: Record<string, unknown> = {
      ...validationResult.data,
      consent:
        validationResult.data.listingSource === 'PARTNER'
          ? {
              ownerDeclarationAccepted: false,
              partnerAttestationAccepted: true,
              declarationText: canonicalDeclaration.declarationText,
              attestationVersion: canonicalDeclaration.attestationVersion,
              acceptedByCustomerId: normalizedCustomerId,
            }
          : {
              ownerDeclarationAccepted: true,
              partnerAttestationAccepted: false,
              declarationText: canonicalDeclaration.declarationText,
              attestationVersion: canonicalDeclaration.attestationVersion,
              acceptedByCustomerId: normalizedCustomerId,
            },
    };

    return await this.repo.submitForReview(id, normalizedCustomerId, authoritativePayload, {
      declarationText: canonicalDeclaration.declarationText,
      version: canonicalDeclaration.attestationVersion,
    });
  }

  async withdraw(id: string, customerId: string): Promise<SubmissionRecord> {
    if (!customerId || !customerId.trim()) {
      throw new PropertySubmissionDomainError('Authenticated customer identity is required.', 401);
    }
    return await this.repo.withdraw(id, customerId.trim());
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
  }) {
    return await this.repo.listSubmissionsForStaff(options);
  }

  async getSubmissionDetailForStaff(submissionId: string) {
    if (!submissionId || !submissionId.trim()) {
      throw new PropertySubmissionDomainError('Submission identifier is required.', 400);
    }
    return await this.repo.getSubmissionDetailForStaff(submissionId.trim());
  }

  async startReview(submissionId: string, staffId: string, actorRole: string) {
    assertStaffRoleCapability(actorRole, 'submission.review');
    return await this.repo.startReview(submissionId, staffId, actorRole);
  }

  async requestChanges(
    submissionId: string,
    staffId: string,
    actorRole: string,
    input: { submitterFeedback: string; internalNote?: string; checklist?: Record<string, boolean> }
  ) {
    assertStaffRoleCapability(actorRole, 'submission.requestChanges');
    if (!input.submitterFeedback || !input.submitterFeedback.trim()) {
      throw new PropertySubmissionDomainError('Customer-visible correction feedback is required.', 400);
    }
    return await this.repo.requestChanges(submissionId, staffId, actorRole, {
      ...input,
      submitterFeedback: input.submitterFeedback.trim(),
      internalNote: input.internalNote?.trim(),
    });
  }

  async addInternalNote(submissionId: string, staffId: string, actorRole: string, internalNote: string) {
    assertStaffRoleCapability(actorRole, 'submission.manageNotes');
    if (!internalNote || !internalNote.trim()) {
      throw new PropertySubmissionDomainError('Internal note text is required.', 400);
    }
    return await this.repo.addInternalNote(submissionId, staffId, actorRole, internalNote.trim());
  }

  async assignReviewer(submissionId: string, staffId: string, actorRole: string, reviewerId: string) {
    assertStaffRoleCapability(actorRole, 'submission.assign');
    if (!reviewerId || !reviewerId.trim()) {
      throw new PropertySubmissionDomainError('Reviewer identifier is required.', 400);
    }
    return await this.repo.assignReviewer(submissionId, staffId, actorRole, reviewerId.trim());
  }

  async updateChecklist(
    submissionId: string,
    staffId: string,
    actorRole: string,
    input: { checklist?: Record<string, boolean>; contactConfirmed?: boolean }
  ) {
    assertStaffRoleCapability(actorRole, 'submission.review');
    return await this.repo.updateChecklist(submissionId, staffId, actorRole, input);
  }

  async editCuratedData(
    submissionId: string,
    staffId: string,
    actorRole: string,
    rawPatch: unknown
  ) {
    assertStaffRoleCapability(actorRole, 'submission.editCurated');
    const parsed = curatedEditSchema.safeParse(rawPatch);
    if (!parsed.success) {
      const { message, fieldErrors } = extractZodIssues(parsed.error);
      throw new PropertySubmissionDomainError(
        `Invalid curated edit input: ${message}`,
        400,
        fieldErrors
      );
    }
    if (parsed.data.location) {
      await this.validateLocationProjectCompatibility(parsed.data.location);
    }
    return await this.repo.editCuratedData(submissionId, staffId, actorRole, parsed.data as any);
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
    assertStaffRoleCapability(actorRole, 'submission.approve');
    const parsed = approveSubmissionSchema.safeParse(input || {});
    if (!parsed.success) {
      const { message, fieldErrors } = extractZodIssues(parsed.error);
      throw new PropertySubmissionDomainError(
        `Invalid approval payload: ${message}`,
        400,
        fieldErrors
      );
    }
    return await this.repo.approveSubmission(submissionId, staffId, actorRole, parsed.data);
  }

  async rejectSubmission(
    submissionId: string,
    staffId: string,
    actorRole: string,
    input: { reason: string; internalNote?: string }
  ) {
    assertStaffRoleCapability(actorRole, 'submission.reject');
    const parsed = rejectSubmissionSchema.safeParse(input);
    if (!parsed.success) {
      const { message, fieldErrors } = extractZodIssues(parsed.error);
      throw new PropertySubmissionDomainError(
        `Invalid rejection input: ${message}`,
        400,
        fieldErrors
      );
    }
    return await this.repo.rejectSubmission(submissionId, staffId, actorRole, {
      reason: parsed.data.reason,
      internalNote: parsed.data.internalNote,
    });
  }

  async publishSubmission(submissionId: string, staffId: string, actorRole: string) {
    assertStaffRoleCapability(actorRole, 'submission.publish');
    return await this.repo.publishSubmission(submissionId, staffId, actorRole);
  }

  async deactivateListing(
    submissionId: string,
    staffId: string,
    actorRole: string,
    reason: string,
    internalNote?: string
  ) {
    assertStaffRoleCapability(actorRole, 'submission.deactivate');
    const parsed = deactivateSubmissionSchema.safeParse({ reason, internalNote });
    if (!parsed.success) {
      const { message, fieldErrors } = extractZodIssues(parsed.error);
      throw new PropertySubmissionDomainError(
        `Invalid deactivation input: ${message}`,
        400,
        fieldErrors
      );
    }
    return await this.repo.deactivateListing(
      submissionId,
      staffId,
      actorRole,
      parsed.data.reason,
      parsed.data.internalNote
    );
  }

  async reactivateListing(submissionId: string, staffId: string, actorRole: string) {
    assertStaffRoleCapability(actorRole, 'submission.reactivate');
    return await this.repo.reactivateListing(submissionId, staffId, actorRole);
  }

  async overrideSubmission(
    submissionId: string,
    staffId: string,
    actorRole: string,
    rawInput: unknown
  ) {
    assertStaffRoleCapability(actorRole, 'submission.override');
    const parsed = overrideSubmissionSchema.safeParse(rawInput);
    if (!parsed.success) {
      const { message, fieldErrors } = extractZodIssues(parsed.error);
      throw new PropertySubmissionDomainError(
        `Invalid override input: ${message}`,
        400,
        fieldErrors
      );
    }
    return await this.repo.overrideSubmission(submissionId, staffId, actorRole, {
      targetStatus: parsed.data.targetStatus,
      reason: parsed.data.reason,
      submitterFeedback: parsed.data.submitterFeedback,
      internalNote: parsed.data.internalNote,
      contactConfirmed: parsed.data.contactConfirmed,
      checklist: parsed.data.checklist,
    });
  }

  async resolveDuplicateFlag(
    submissionId: string,
    flagId: string,
    staffId: string,
    actorRole: string,
    rawInput: unknown
  ) {
    assertStaffRoleCapability(actorRole, 'submission.resolveDuplicate');
    const parsed = resolveDuplicateSchema.safeParse(rawInput);
    if (!parsed.success) {
      const { message, fieldErrors } = extractZodIssues(parsed.error);
      throw new PropertySubmissionDomainError(
        `Invalid duplicate resolution input: ${message}`,
        400,
        fieldErrors
      );
    }
    return await this.repo.resolveDuplicateFlag(submissionId, flagId, staffId, actorRole, {
      resolutionStatus: parsed.data.resolutionStatus,
      resolutionNote: parsed.data.resolutionNote,
    });
  }

  async createChangeRequest(submissionId: string, customerId: string, rawInput: unknown) {
    if (!customerId || !customerId.trim()) {
      throw new PropertySubmissionDomainError('Authenticated customer identity is required.', 401);
    }
    const parsed = createChangeRequestSchema.safeParse(rawInput);
    if (!parsed.success) {
      const { message, fieldErrors } = extractZodIssues(parsed.error);
      throw new PropertySubmissionDomainError(
        `Invalid change request input: ${message}`,
        400,
        fieldErrors
      );
    }
    return await this.repo.createChangeRequest(submissionId, customerId.trim(), {
      requestType: parsed.data.requestType,
      reason: parsed.data.reason,
      requestedChanges: parsed.data.requestedChanges,
    });
  }

  async listCustomerChangeRequests(submissionId: string, customerId: string) {
    if (!customerId || !customerId.trim()) {
      throw new PropertySubmissionDomainError('Authenticated customer identity is required.', 401);
    }
    return await this.repo.listCustomerChangeRequests(submissionId, customerId.trim());
  }

  async resolveChangeRequest(
    submissionId: string,
    requestId: string,
    staffId: string,
    actorRole: string,
    rawInput: unknown
  ) {
    const reqType =
      rawInput && typeof rawInput === 'object' && 'requestType' in rawInput
        ? String((rawInput as Record<string, unknown>).requestType || '').toUpperCase()
        : '';
    if (reqType === 'REMOVAL') {
      assertStaffRoleCapability(actorRole, 'submission.resolveRemoval');
    } else if (reqType === 'CORRECTION') {
      assertStaffRoleCapability(actorRole, 'submission.resolveCorrection');
    } else if (
      !hasCapability(actorRole as StaffRole, 'submission.resolveCorrection') &&
      !hasCapability(actorRole as StaffRole, 'submission.resolveRemoval')
    ) {
      throw new PropertySubmissionDomainError(
        `Forbidden: role '${actorRole}' lacks capability 'submission.resolveCorrection'.`,
        403
      );
    }
    const parsed = resolveChangeRequestSchema.safeParse(rawInput);
    if (!parsed.success) {
      const { message, fieldErrors } = extractZodIssues(parsed.error);
      throw new PropertySubmissionDomainError(
        `Invalid change request resolution: ${message}`,
        400,
        fieldErrors
      );
    }
    return await this.repo.resolveChangeRequest(submissionId, requestId, staffId, actorRole, {
      status: parsed.data.status,
      staffResponse: parsed.data.staffResponse,
      deactivateListing: parsed.data.deactivateListing,
    });
  }
}

export const propertySubmissionService = new PropertySubmissionService();
