import crypto from 'node:crypto';
import {
  CreateEnquiryRequestDto,
  CreateEnquiryResponseDto,
  AdminEnquiryFilterDto,
  UpdateEnquiryRequestDto,
  AdminEnquiryMetricsDto,
  CustomerEnquiryDto,
  UpdateEnquiryRequirementsRequestDto,
  UpdateEnquiryRequirementsResponseDto,
} from '../dto/enquiryDto';
import { EnquiryEntity, isValidEnquiryStatusTransition, ENQUIRY_STATUS_LABELS } from '../entities/enquiryEntity';
import { EnquiryRepository, enquiryRepository as defaultEnquiryRepo } from '../repositories/enquiryRepository';
import { projectIntelligenceService } from '@/src/domain/projects/services/projectIntelligenceService';
import { resaleListingService } from '@/src/domain/projects/services/resaleService';
import { rentalService } from '@/src/domain/projects/services/rentalService';
import { resaleListingRepository, ResaleListingRepository } from '@/src/domain/projects/repositories/resaleRepository';
import { rentalListingRepository, RentalListingRepository } from '@/src/domain/projects/repositories/rentalRepository';
import { customerIntelligenceService } from '@/src/domain/visitorIntelligence/services/customerIntelligenceService';
import { notificationService } from '@/src/domain/customer/services/notificationService';
import { auditService } from '@/src/domain/audit/auditService';
import { formatIndianPrice } from '@/src/components/discovery/formatters';
import {
  computeRequirementsCompleteness,
  isValidBudgetRange,
  isValidBuyerPropertyType,
  isValidBuyingTimeline,
  isValidPreferredBhk,
  isValidPurchasePurpose,
  MAX_ADDITIONAL_REQUIREMENTS_LENGTH,
  resolveBudgetBounds,
} from '../buyerRequirements';
import {
  canRotateContinuationOnIdempotentRetry,
  issueContinuationToken,
  sanitizeEnquiryForExposure,
  StoredContinuationRecord,
  verifyContinuationToken,
} from './enquiryContinuationToken';

export class EnquiryValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EnquiryValidationError';
  }
}

export class EnquiryNotFoundError extends Error {
  constructor(message: string = 'Enquiry not found.') {
    super(message);
    this.name = 'EnquiryNotFoundError';
  }
}

export class EnquiryContinuationAuthError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(
    message: string = 'Invalid or expired enquiry session.',
    statusCode: number = 403,
    code: string = 'INVALID_CONTINUATION_TOKEN'
  ) {
    super(message);
    this.name = 'EnquiryContinuationAuthError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

// In-process map to serialize concurrent duplicate submissions within the same Node runtime
const inFlightEnquiries = new Map<string, Promise<CreateEnquiryResponseDto>>();

interface ResolvedEnquiryContext {
  canonicalTargetId: string;
  projectId: string | null;
  projectSlug: string | null;
  projectName: string | null;
  configurationId: string | null;
  listingId: string | null;
  listingSlug: string | null;
  listingTitle: string | null;
  configuration: string | null;
  propertyType: string | null;
  priceDisplay: string | null;
  locationName: string | null;
  isProjectLevelRequirement: boolean;
  listingPartyType?: string | null;
  listingSource?: string | null;
}

export class EnquiryService {
  constructor(
    private repo: EnquiryRepository = defaultEnquiryRepo,
    private projectService = projectIntelligenceService,
    private resaleService = resaleListingService,
    private rentService = rentalService,
    private resaleRepo: ResaleListingRepository = resaleListingRepository,
    private rentalRepo: RentalListingRepository = rentalListingRepository
  ) {}

  /**
   * Normalizes and validates Indian phone numbers
   */
  normalizePhone(rawPhone: string): string {
    if (!rawPhone) {
      throw new EnquiryValidationError('Mobile phone number is required.');
    }

    const cleaned = rawPhone.replace(/[\s\-().]/g, '');
    const match = cleaned.match(/^(?:\+91|91|0)?([6-9]\d{9})$/);
    if (!match) {
      throw new EnquiryValidationError('Please enter a valid 10-digit mobile number.');
    }

    return `+91${match[1]}`;
  }

  /**
   * Validates optional email syntax
   */
  validateEmail(email?: string): string | null {
    if (!email || !email.trim()) return null;
    const trimmed = email.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmed)) {
      throw new EnquiryValidationError('Please enter a valid email address.');
    }
    return trimmed;
  }



  /**
   * Resolves canonical entity identity before acquiring the in-flight mutex.
   * Ensures that ID and slug aliases for the same property or project resolve
   * to the exact same canonical database ID.
   */
  private async resolveEnquiryContext(dto: CreateEnquiryRequestDto): Promise<ResolvedEnquiryContext> {
    let projectId: string | null = null;
    let projectSlug: string | null = null;
    let projectName: string | null = null;
    let configurationId: string | null = dto.configurationId || null;
    let listingId: string | null = null;
    let listingSlug: string | null = null;
    let listingTitle: string | null = null;
    let configuration: string | null = null;
    let propertyType: string | null = dto.propertyType || null;
    let priceDisplay: string | null = null;
    let locationName: string | null = null;
    let isProjectLevelRequirement = false;
    let listingPartyType: string | null = null;
    let listingSource: string | null = null;
    let canonicalTargetId: string;

    if (dto.contextType === 'PROJECT' || dto.contextType === 'CONFIGURATION') {
      const projectTarget = dto.projectSlug || dto.projectId;
      if (!projectTarget) {
        throw new EnquiryValidationError('Project identifier is required for project enquiry.');
      }
      const project = dto.projectId
        ? await this.projectService.getProjectById(dto.projectId)
        : await this.projectService.getProjectBySlug(dto.projectSlug!);
      if (!project) {
        throw new EnquiryValidationError('The requested project could not be found or is not available.');
      }
      projectId = project.id;
      projectSlug = project.slug;
      projectName = project.name;
      locationName = project.location?.name ?? null;
      propertyType = propertyType || project.propertyType;
      priceDisplay = project.pricing?.startingPrice ? formatIndianPrice(project.pricing.startingPrice) : 'Price on Request';
      canonicalTargetId = project.id;

      if (dto.configurationId) {
        const conf = project.configurations?.find((c) => c.id === dto.configurationId);
        if (!conf) {
          throw new EnquiryValidationError('The requested configuration does not exist for this project.');
        }
        configurationId = conf.id;
        configuration = conf.name || (conf.bedroomCount ? `${conf.bedroomCount} BHK` : null);
        if (conf.priceOnRequest || project.priceOnRequest || !conf.price || conf.price <= 0) {
          priceDisplay = 'Price on Request';
        } else {
          priceDisplay = formatIndianPrice(conf.price);
        }
      }
    } else if (dto.contextType === 'RESALE') {
      if (dto.listingId || dto.listingSlug) {
        // Specific resale listing enquiry (query strictly Resale repository, never Rental)
        let rawListing = dto.listingId ? await this.resaleRepo.findById(dto.listingId) : null;
        if (!rawListing && dto.listingSlug) {
          rawListing = await this.resaleRepo.findBySlugOrId(dto.listingSlug);
        }
        if (!rawListing || rawListing.lifecycleStatus !== 'PUBLISHED') {
          throw new EnquiryValidationError('The requested resale listing could not be found or is not available for enquiry.');
        }

        // If parent project is associated, enforce parent project exists and is PUBLISHED
        let parentProject = null;
        if (rawListing.projectId) {
          parentProject = await this.projectService.getProjectById(rawListing.projectId, false);
          if (!parentProject) {
            throw new EnquiryValidationError('The project for this resale listing is not currently available for enquiry.');
          }
        }

        listingId = rawListing.id;
        listingSlug = rawListing.slug || rawListing.id;
        configuration = rawListing.configuration;
        propertyType = propertyType || rawListing.propertyType;
        priceDisplay = formatIndianPrice(rawListing.askingPrice);
        listingTitle = `${rawListing.bedroomCount} BHK ${rawListing.propertyType} Resale`;
        canonicalTargetId = rawListing.id;
        const rawPartyType = String((rawListing as any).listingPartyType || 'OWNER').toUpperCase();
        const isPartnerListing = rawPartyType === 'PARTNER' || rawPartyType === 'LISTING_PARTNER';
        listingPartyType = isPartnerListing ? 'PARTNER' : 'OWNER';
        listingSource = isPartnerListing
          ? 'PARTNER_SUBMITTED_PROPERTY'
          : 'OWNER_SUBMITTED_PROPERTY';

        if (parentProject) {
          projectId = parentProject.id;
          projectSlug = parentProject.slug;
          projectName = parentProject.name;
          locationName = parentProject.location?.name ?? null;
        } else if (rawListing.projectId) {
          projectId = rawListing.projectId;
        }
      } else if (dto.projectSlug || dto.projectId) {
        // Project-level resale requirement / availability alert
        isProjectLevelRequirement = true;
        const project = dto.projectId
          ? await this.projectService.getProjectById(dto.projectId, false)
          : await this.projectService.getProjectBySlug(dto.projectSlug!, false);
        if (!project || project.lifecycleStatus !== 'PUBLISHED') {
          throw new EnquiryValidationError('The requested project could not be found or is not available.');
        }
        projectId = project.id;
        projectSlug = project.slug;
        projectName = project.name;
        locationName = project.location?.name ?? null;
        propertyType = propertyType || project.propertyType;
        listingTitle = `${project.name} — Resale Requirement`;
        configuration = dto.preferredBhk || project.configurationsSummary || null;
        canonicalTargetId = project.id;

        if (dto.budgetMin || dto.budgetMax) {
          const min = dto.budgetMin ? formatIndianPrice(dto.budgetMin) : 'Under';
          const max = dto.budgetMax ? formatIndianPrice(dto.budgetMax) : '';
          priceDisplay = dto.budgetMin && dto.budgetMax ? `${min} – ${max}` : `${min} ${max}`.trim();
        } else if (project.pricing?.startingPrice) {
          priceDisplay = `Project from ${formatIndianPrice(project.pricing.startingPrice)}`;
        }
      } else {
        throw new EnquiryValidationError('Resale listing reference or project identifier is required.');
      }
    } else if (dto.contextType === 'RENTAL') {
      if (dto.listingId || dto.listingSlug) {
        // Specific rental listing enquiry (query strictly Rental repository, never Resale)
        let rawListing = dto.listingId ? await this.rentalRepo.findById(dto.listingId) : null;
        if (!rawListing && dto.listingSlug) {
          rawListing = await this.rentalRepo.findBySlugOrId(dto.listingSlug);
        }
        if (!rawListing || rawListing.lifecycleStatus !== 'PUBLISHED') {
          throw new EnquiryValidationError('The requested rental listing could not be found or is not available for enquiry.');
        }

        // If parent project is associated, enforce parent project exists and is PUBLISHED
        let parentProject = null;
        if (rawListing.projectId) {
          parentProject = await this.projectService.getProjectById(rawListing.projectId, false);
          if (!parentProject) {
            throw new EnquiryValidationError('The project for this rental listing is not currently available for enquiry.');
          }
        }

        listingId = rawListing.id;
        listingSlug = rawListing.slug || rawListing.id;
        configuration = rawListing.configuration;
        propertyType = propertyType || rawListing.propertyType;
        priceDisplay = `${formatIndianPrice(rawListing.monthlyRent)} / month`;
        listingTitle = `${rawListing.bedroomCount} BHK ${rawListing.propertyType} For Rent`;
        canonicalTargetId = rawListing.id;
        const rawPartyType = String((rawListing as any).listingPartyType || 'OWNER').toUpperCase();
        const isPartnerListing = rawPartyType === 'PARTNER' || rawPartyType === 'LISTING_PARTNER';
        listingPartyType = isPartnerListing ? 'PARTNER' : 'OWNER';
        listingSource = isPartnerListing
          ? 'PARTNER_SUBMITTED_PROPERTY'
          : 'OWNER_SUBMITTED_PROPERTY';

        if (parentProject) {
          projectId = parentProject.id;
          projectSlug = parentProject.slug;
          projectName = parentProject.name;
          locationName = parentProject.location?.name ?? null;
        } else if (rawListing.projectId) {
          projectId = rawListing.projectId;
        }
      } else if (dto.projectSlug || dto.projectId) {
        // Project-level rental requirement / availability alert
        isProjectLevelRequirement = true;
        const project = dto.projectId
          ? await this.projectService.getProjectById(dto.projectId, false)
          : await this.projectService.getProjectBySlug(dto.projectSlug!, false);
        if (!project || project.lifecycleStatus !== 'PUBLISHED') {
          throw new EnquiryValidationError('The requested project could not be found or is not available.');
        }
        projectId = project.id;
        projectSlug = project.slug;
        projectName = project.name;
        locationName = project.location?.name ?? null;
        propertyType = propertyType || project.propertyType;
        listingTitle = `${project.name} — Rental Requirement`;
        configuration = dto.preferredBhk || project.configurationsSummary || null;
        canonicalTargetId = project.id;

        if (dto.budgetMin || dto.budgetMax) {
          const min = dto.budgetMin ? `₹${dto.budgetMin.toLocaleString('en-IN')}` : 'Up to';
          const max = dto.budgetMax ? `₹${dto.budgetMax.toLocaleString('en-IN')}` : '';
          priceDisplay = `${dto.budgetMin && dto.budgetMax ? `${min} – ${max}` : `${min} ${max}`.trim()} / month`;
        }
      } else {
        throw new EnquiryValidationError('Rental listing reference or project identifier is required.');
      }
    } else if (dto.contextType === 'GENERAL') {
      projectName = 'Great Homes Discovery';
      canonicalTargetId = 'general';
    } else {
      throw new EnquiryValidationError('Invalid enquiry context type.');
    }

    return {
      canonicalTargetId,
      projectId,
      projectSlug,
      projectName,
      configurationId,
      listingId,
      listingSlug,
      listingTitle,
      configuration,
      propertyType,
      priceDisplay,
      locationName,
      isProjectLevelRequirement,
      listingPartyType,
      listingSource,
    };
  }

  /**
   * Derives a bounded, server-controlled SHA-256 idempotency key.
   * Never trusts raw client strings directly as storage keys or across actors/phones/listings.
   */
  private extractValidatedClientIdempotencyKey(dto: CreateEnquiryRequestDto, req?: any): string | null {
    const rawHeader =
      typeof req?.headers?.get === 'function'
        ? req.headers.get('x-idempotency-key')
        : req?.headers?.['x-idempotency-key'];
    const candidate =
      typeof dto.idempotencyKey === 'string'
        ? dto.idempotencyKey
        : typeof rawHeader === 'string'
          ? rawHeader
          : '';
    const trimmed = candidate.trim();
    if (!trimmed || trimmed.length > 128) return null;
    if (!/^[a-zA-Z0-9_\-:.]{1,128}$/.test(trimmed)) return null;
    return trimmed;
  }

  private deriveServerIdempotencyKey(params: {
    customerId?: string | null;
    normalizedPhone: string;
    contextType: string;
    canonicalTargetId: string;
    configurationId?: string | null;
    requestSiteVisit: boolean;
    explicitClientKey?: string | null;
  }): string {
    const actorScope = params.customerId ? `cust:${params.customerId}` : 'anon';
    const baseParts = [
      actorScope,
      params.normalizedPhone,
      params.contextType,
      params.canonicalTargetId,
      params.configurationId || '',
    ];

    const payload = params.explicitClientKey
      ? ['gh_enq_client_v1', ...baseParts, params.explicitClientKey].join('|')
      : [
          'gh_enq_win30_v1',
          ...baseParts,
          params.requestSiteVisit ? 'sv' : 'std',
          String(Math.floor(Date.now() / 30000)),
        ].join('|');

    return crypto.createHash('sha256').update(payload).digest('hex');
  }

  /**
   * Public enquiry submission handler with server-side entity resolution & durable idempotency
   */
  async submitEnquiry(dto: CreateEnquiryRequestDto, req?: any): Promise<CreateEnquiryResponseDto> {
    if (!dto.name || !dto.name.trim()) {
      throw new EnquiryValidationError('Your name is required.');
    }
    const trimmedName = dto.name.trim();
    if (trimmedName.length < 2) {
      throw new EnquiryValidationError('Please enter a valid full name (at least 2 characters).');
    }
    if (trimmedName.length > 120) {
      throw new EnquiryValidationError('Name must be 120 characters or fewer.');
    }

    const normalizedPhone = this.normalizePhone(dto.phone);

    if (typeof dto.message === 'string' && dto.message.trim().length > MAX_ADDITIONAL_REQUIREMENTS_LENGTH) {
      throw new EnquiryValidationError(
        `Additional requirements must be ${MAX_ADDITIONAL_REQUIREMENTS_LENGTH} characters or fewer.`
      );
    }

    // Validate budget
    if (dto.budgetMin !== undefined && dto.budgetMin !== null && dto.budgetMin < 0) {
      throw new EnquiryValidationError('Minimum budget must be a positive number.');
    }
    if (
      dto.budgetMin !== undefined &&
      dto.budgetMin !== null &&
      dto.budgetMax !== undefined &&
      dto.budgetMax !== null &&
      dto.budgetMax < dto.budgetMin
    ) {
      throw new EnquiryValidationError('Maximum budget must be greater than or equal to minimum budget.');
    }

    // Step 1: Canonical identity resolution BEFORE acquiring the in-flight mutex
    const resolved = await this.resolveEnquiryContext(dto);
    const explicitClientKey = this.extractValidatedClientIdempotencyKey(dto, req);
    const idempotencyKey = this.deriveServerIdempotencyKey({
      customerId: dto.customerId || null,
      normalizedPhone,
      contextType: dto.contextType,
      canonicalTargetId: resolved.canonicalTargetId,
      configurationId: resolved.configurationId,
      requestSiteVisit: Boolean(dto.requestSiteVisit),
      explicitClientKey,
    });

    // Step 2: Canonical local mutex fast-path key
    const inFlightKey = `${normalizedPhone}:${dto.contextType}:${resolved.canonicalTargetId}:${idempotencyKey}`;

    const existingInFlight = inFlightEnquiries.get(inFlightKey);
    if (existingInFlight) {
      const firstResult = await existingInFlight;
      return {
        ...firstResult,
        deduplicated: true,
      };
    }

    const executionPromise = this.executeSubmitEnquiry(
      dto,
      normalizedPhone,
      resolved,
      idempotencyKey,
      explicitClientKey,
      req
    );
    inFlightEnquiries.set(inFlightKey, executionPromise);
    try {
      return await executionPromise;
    } finally {
      inFlightEnquiries.delete(inFlightKey);
    }
  }

  private async buildDuplicateResponse(
    existing: EnquiryEntity,
    recoveryContext?: {
      explicitClientKey: string | null;
      requestCustomerId: string | null;
      wantsContinuation: boolean;
    }
  ): Promise<CreateEnquiryResponseDto> {
    const existingRef =
      (existing.metadata as any)?.referenceNumber || `GH-ENQ-${existing.id.slice(-6).toUpperCase()}`;

    let continuationToken: string | undefined;
    let continuationExpiresAt: string | undefined;

    if (recoveryContext?.wantsContinuation) {
      if (typeof this.repo.rotateContinuationTokenAtomic === 'function') {
        let pendingRawToken: string | undefined;
        let pendingExpiresAt: string | undefined;
        const atomicResult = await this.repo.rotateContinuationTokenAtomic(existing.id, (locked) => {
          const eligibility = canRotateContinuationOnIdempotentRetry({
            existing: locked,
            explicitClientKey: recoveryContext.explicitClientKey,
            requestCustomerId: recoveryContext.requestCustomerId,
          });
          if (!eligibility.eligible) {
            return { eligible: false };
          }
          const rotated = issueContinuationToken(
            eligibility.existingExpiresAt,
            eligibility.nextRotationCount ?? 1
          );
          pendingRawToken = rotated.rawToken;
          pendingExpiresAt = rotated.record.expiresAt;
          return {
            eligible: true,
            nextMetadata: {
              ...(locked.metadata || {}),
              _continuation: rotated.record,
            },
          };
        });
        if (atomicResult.rotated && atomicResult.updated && pendingRawToken) {
          continuationToken = pendingRawToken;
          continuationExpiresAt = pendingExpiresAt;
        }
      } else {
        const eligibility = canRotateContinuationOnIdempotentRetry({
          existing,
          explicitClientKey: recoveryContext.explicitClientKey,
          requestCustomerId: recoveryContext.requestCustomerId,
        });

        if (eligibility.eligible) {
          const rotated = issueContinuationToken(
            eligibility.existingExpiresAt,
            eligibility.nextRotationCount ?? 1
          );
          const mergedMetadata = {
            ...(existing.metadata || {}),
            _continuation: rotated.record,
          };
          const updated = await this.repo.update(existing.id, {
            metadata: mergedMetadata,
          });
          if (updated) {
            continuationToken = rotated.rawToken;
            continuationExpiresAt = rotated.record.expiresAt;
          }
        }
      }
    }

    return {
      success: true,
      message: 'Your enquiry has already been received. A Great Homes advisor will contact you shortly.',
      enquiryId: existing.id,
      referenceNumber: existingRef,
      projectName: existing.projectName || existing.listingTitle || null,
      siteVisitId: existing.siteVisitId || undefined,
      siteVisitStatus: existing.siteVisitId ? 'REQUESTED' : undefined,
      deduplicated: true,
      continuationToken,
      continuationExpiresAt,
    };
  }

  private sanitizeCtaSource(raw?: string): string | null {
    if (!raw || typeof raw !== 'string') return null;
    const trimmed = raw.trim().toUpperCase();
    if (!trimmed || trimmed.length > 64) return null;
    if (!/^[A-Z0-9_\-]+$/.test(trimmed)) return null;
    return trimmed;
  }

  private async executeSubmitEnquiry(
    dto: CreateEnquiryRequestDto,
    normalizedPhone: string,
    resolved: ResolvedEnquiryContext,
    idempotencyKey: string,
    explicitClientKey: string | null,
    req?: any
  ): Promise<CreateEnquiryResponseDto> {
    const hasExplicitClientKey = Boolean(explicitClientKey);
    const isLeadFirstFlow = dto.flowMode === 'LEAD_FIRST_PROJECT';
    const validatedEmail = this.validateEmail(dto.email);
    const preferredContact = dto.preferredContact || 'WHATSAPP';
    const requestSiteVisit = Boolean(dto.requestSiteVisit);
    const message = dto.message?.trim() || null;
    const ctaSource = this.sanitizeCtaSource(dto.ctaSource);

    const {
      projectId,
      projectSlug,
      projectName,
      configurationId,
      listingId,
      listingSlug,
      listingTitle,
      configuration,
      propertyType,
      priceDisplay,
      locationName,
      isProjectLevelRequirement,
      listingPartyType,
      listingSource,
    } = resolved;

    // Fast-path durable idempotency check
    if (typeof this.repo.findByIdempotencyKey === 'function') {
      const existingByKey = await this.repo.findByIdempotencyKey(idempotencyKey);
      if (existingByKey) {
        return await this.buildDuplicateResponse(existingByKey, {
          explicitClientKey,
          requestCustomerId: dto.customerId || null,
          wantsContinuation: isLeadFirstFlow,
        });
      }
    }

    // Rolling 30-second duplicate check across 30s bucket edges (when client did not supply a distinct key)
    if (!hasExplicitClientKey) {
      try {
        const recentList = await this.repo.list({
          buyerPhone: normalizedPhone,
        });
        const duplicate = recentList.items.find((e) => {
          const sameActor = (e.customerId ?? null) === (dto.customerId ?? null);
          const isSameTarget = listingId
            ? e.listingId === listingId
            : listingSlug
              ? e.listingSlug === listingSlug || e.listingId === listingSlug
              : e.projectSlug === projectSlug && e.contextType === dto.contextType;
          const ageMs = Date.now() - new Date(e.createdAt).getTime();
          return sameActor && isSameTarget && ageMs >= 0 && ageMs < 30000;
        });
        if (duplicate) {
          return await this.buildDuplicateResponse(duplicate);
        }
      } catch (err: any) {
        if (err?.code === 'PERSISTENCE_UNAVAILABLE') {
          throw err;
        }
        // Non-blocking fallback check; atomic DB idempotency still guarantees uniqueness
      }
    }

    // Ensure any referenced visitorId and sessionId exist in PostgreSQL before enquiry insert,
    // and rotate/clear attribution safely on customer conflict or database failure.
    let resolvedVisitorId: string | null = dto.visitorId || null;
    let resolvedSessionId: string | null = dto.sessionId || null;
    if (resolvedVisitorId || resolvedSessionId) {
      const safeAttribution = await customerIntelligenceService.resolveSafeEnquiryAttribution({
        visitorId: resolvedVisitorId,
        sessionId: resolvedSessionId,
        authenticatedCustomerId: dto.customerId || null,
        req: req || null,
        sourcePage: dto.sourcePage || null,
      });
      resolvedVisitorId = safeAttribution.visitorId;
      resolvedSessionId = safeAttribution.sessionId;
    }

    // Generate safe reference number
    const refSuffix = Math.floor(100000 + Math.random() * 900000);
    const referenceNumber = `GH-ENQ-${refSuffix}`;

    const issuedContinuation = isLeadFirstFlow ? issueContinuationToken() : null;
    const budgetBounds = dto.budgetRange ? resolveBudgetBounds(dto.budgetRange) : null;

    const siteVisitInput =
      requestSiteVisit && dto.preferredDate && dto.preferredTimeWindow
        ? {
            visitType: dto.visitType || 'IN_PERSON',
            preferredDate: dto.preferredDate,
            preferredTimeWindow: dto.preferredTimeWindow,
            buyerNote: dto.buyerNote || message,
          }
        : null;

    const metadataObj: Record<string, any> = {
      referenceNumber,
      isProjectLevelRequirement,
      enquiryCategory: isProjectLevelRequirement
        ? (dto.contextType === 'RESALE' ? 'RESALE_REQUIREMENT' : 'RENTAL_REQUIREMENT')
        : 'SPECIFIC_LISTING',
      listingPartyType: listingPartyType || null,
      listingSource:
        listingSource ||
        (dto.contextType === 'RESALE'
          ? 'EXISTING_RESALE_PROPERTY'
          : dto.contextType === 'RENTAL'
            ? 'EXISTING_RENTAL_PROPERTY'
            : 'PROJECT_PROPERTY'),
      budgetRange: budgetBounds?.budgetRange ?? null,
      budgetMin: budgetBounds ? budgetBounds.budgetMin : (dto.budgetMin ?? null),
      budgetMax: budgetBounds ? budgetBounds.budgetMax : (dto.budgetMax ?? null),
      preferredBhk: dto.preferredBhk || null,
      propertyType: dto.propertyType || null,
      preferredLocationId: dto.preferredLocationId || null,
      purchaseTimeline: dto.purchaseTimeline || null,
      purpose: dto.purpose || null,
      purchasePurpose: dto.purpose || null,
      siteVisitInterest: requestSiteVisit,
      marketingConsent: Boolean(dto.marketingConsent),
      ctaSource: ctaSource || null,
      flowMode: isLeadFirstFlow ? 'LEAD_FIRST_PROJECT' : 'STANDARD',
      customerId: dto.customerId || null,
      visitorId: resolvedVisitorId,
      sessionId: resolvedSessionId,
    };

    if (isLeadFirstFlow) {
      metadataObj.leadCaptureStage = 'STEP1_CAPTURED';
      metadataObj.requirementsStatus = 'INCOMPLETE';
      metadataObj.requirementsProvidedCount = 0;
      if (issuedContinuation) {
        metadataObj._continuation = issuedContinuation.record;
      }
    }

    // Site visit status is promoted to SITE_VISIT_SCHEDULED ONLY when an actual
    // scheduled visit (date + time window) is created — never for interest alone.
    const initialStatus: 'SITE_VISIT_SCHEDULED' | 'NEW' = siteVisitInput
      ? 'SITE_VISIT_SCHEDULED'
      : 'NEW';

    const enquiryInput = {
      contextType: dto.contextType,
      customerId: dto.customerId || null,
      visitorId: resolvedVisitorId,
      sessionId: resolvedSessionId,
      projectId,
      projectSlug,
      projectName,
      configurationId,
      listingId,
      listingSlug,
      listingTitle,
      configuration,
      propertyType,
      priceDisplay,
      locationName,
      buyerName: dto.name.trim(),
      buyerPhone: normalizedPhone,
      buyerEmail: validatedEmail,
      preferredContact,
      requestSiteVisit,
      message,
      source: dto.source || 'WEB_PORTAL',
      sourcePage: dto.sourcePage || undefined,
      status: initialStatus,
      priority: 'NORMAL' as const,
      idempotencyKey,
      metadata: metadataObj,
    };

    const idempotentResult = await this.repo.createIdempotent(enquiryInput, {
      siteVisit: siteVisitInput,
    });

    if (!idempotentResult.created) {
      return await this.buildDuplicateResponse(idempotentResult.enquiry, {
        explicitClientKey,
        requestCustomerId: dto.customerId || null,
        wantsContinuation: isLeadFirstFlow,
      });
    }

    const createdEnquiry = idempotentResult.enquiry;
    const siteVisitId = idempotentResult.siteVisit?.id;
    const siteVisitStatus = idempotentResult.siteVisit?.status;

    // Emit audit and customer notification strictly AFTER durable commit for newly created enquiries only
    if (siteVisitId && req) {
      try {
        await auditService.record(req, null, {
          action: 'CREATE_SITE_VISIT',
          resourceType: 'SITE_VISIT',
          resourceId: siteVisitId,
          success: true,
          metadata: {
            enquiryId: createdEnquiry.id,
            preferredDate: dto.preferredDate,
            visitType: dto.visitType || 'IN_PERSON',
          },
        });
      } catch {
        // Non-blocking audit hook
      }
    }

    if (createdEnquiry.customerId) {
      try {
        await notificationService.createNotification({
          customerId: createdEnquiry.customerId,
          type: 'ENQUIRY_RECEIVED',
          title: 'Enquiry Received',
          message: `Your enquiry for ${createdEnquiry.listingTitle || createdEnquiry.projectName || 'property'} (Ref: ${referenceNumber}) has been received.`,
          resourceType: createdEnquiry.contextType === 'RESALE' ? 'RESALE_LISTING' : createdEnquiry.contextType === 'RENTAL' ? 'RENTAL_LISTING' : 'PROJECT',
          resourceId: createdEnquiry.listingId || createdEnquiry.projectId || createdEnquiry.id,
          projectId: createdEnquiry.projectId || null,
          metadata: {
            enquiryId: createdEnquiry.id,
            referenceNumber,
          },
        });
      } catch {
        // Non-blocking notification hook
      }
    }

    return {
      success: true,
      message:
        dto.source === 'BROCHURE_DOWNLOAD'
          ? 'Your brochure access is ready.'
          : siteVisitId
            ? 'Thank you. Your request has been received by Great Homes. Our team will contact you shortly to coordinate your site visit.'
            : 'Thank you. Your enquiry has been received. A Great Homes advisor will contact you shortly.',
      enquiryId: createdEnquiry.id,
      referenceNumber,
      projectName: createdEnquiry.projectName || createdEnquiry.listingTitle || null,
      siteVisitId,
      siteVisitStatus,
      deduplicated: false,
      continuationToken: issuedContinuation?.rawToken,
      continuationExpiresAt: issuedContinuation?.record.expiresAt,
    };
  }

  /**
   * Public Step 2 Buyer Requirements update for an enquiry created during Step 1.
   * Enforces cryptographic continuation token verification, expiry, enquiry state guard,
   * strict allowlisted fields, safe metadata merge, and non-PII response.
   */
  async updateBuyerRequirements(
    enquiryId: string,
    rawContinuationToken: string | null | undefined,
    dto: UpdateEnquiryRequirementsRequestDto,
    options?: {
      authenticatedCustomerId?: string | null;
      nowMs?: number;
    }
  ): Promise<UpdateEnquiryRequirementsResponseDto> {
    if (!enquiryId || typeof enquiryId !== 'string' || !enquiryId.trim()) {
      throw new EnquiryContinuationAuthError('Invalid or expired enquiry session.', 403, 'INVALID_CONTINUATION_TOKEN');
    }

    const trimmedId = enquiryId.trim();
    const isSkipped = Boolean(dto.skipped);

    // Strictly validate optional allowlisted Step 2 fields upfront before acquiring row lock
    let preferredBhk: string | null | undefined = undefined;
    if (dto.preferredBhk !== undefined) {
      if (dto.preferredBhk === null || dto.preferredBhk === '') {
        preferredBhk = null;
      } else if (typeof dto.preferredBhk === 'string' && isValidPreferredBhk(dto.preferredBhk.trim())) {
        preferredBhk = dto.preferredBhk.trim();
      } else {
        throw new EnquiryValidationError('Invalid preferred BHK option.');
      }
    }

    let propertyType: string | null | undefined = undefined;
    if (dto.propertyType !== undefined) {
      if (dto.propertyType === null || dto.propertyType === '') {
        propertyType = null;
      } else if (typeof dto.propertyType === 'string' && isValidBuyerPropertyType(dto.propertyType.trim())) {
        propertyType = dto.propertyType.trim();
      } else {
        throw new EnquiryValidationError('Invalid property type option.');
      }
    }

    let budgetRangeUpdate:
      | {
          budgetRange: string | null;
          budgetMin: number | null;
          budgetMax: number | null;
        }
      | undefined = undefined;
    if (dto.budgetRange !== undefined) {
      if (dto.budgetRange === null || dto.budgetRange === '') {
        budgetRangeUpdate = { budgetRange: null, budgetMin: null, budgetMax: null };
      } else if (typeof dto.budgetRange === 'string' && isValidBudgetRange(dto.budgetRange.trim())) {
        const bounds = resolveBudgetBounds(dto.budgetRange.trim());
        budgetRangeUpdate = {
          budgetRange: bounds.budgetRange,
          budgetMin: bounds.budgetMin,
          budgetMax: bounds.budgetMax,
        };
      } else {
        throw new EnquiryValidationError('Invalid budget option.');
      }
    }

    let purchaseTimeline: string | null | undefined = undefined;
    if (dto.purchaseTimeline !== undefined) {
      if (dto.purchaseTimeline === null || dto.purchaseTimeline === '') {
        purchaseTimeline = null;
      } else if (typeof dto.purchaseTimeline === 'string' && isValidBuyingTimeline(dto.purchaseTimeline.trim())) {
        purchaseTimeline = dto.purchaseTimeline.trim();
      } else {
        throw new EnquiryValidationError('Invalid buying timeline option.');
      }
    }

    let purchasePurpose: string | null | undefined = undefined;
    if (dto.purchasePurpose !== undefined) {
      if (dto.purchasePurpose === null || dto.purchasePurpose === '') {
        purchasePurpose = null;
      } else if (typeof dto.purchasePurpose === 'string' && isValidPurchasePurpose(dto.purchasePurpose.trim())) {
        purchasePurpose = dto.purchasePurpose.trim();
      } else {
        throw new EnquiryValidationError('Invalid purchase purpose option.');
      }
    }

    let siteVisitInterest: boolean | undefined = undefined;
    if (dto.siteVisitInterest !== undefined) {
      if (typeof dto.siteVisitInterest !== 'boolean') {
        throw new EnquiryValidationError('Invalid site visit interest value.');
      }
      siteVisitInterest = dto.siteVisitInterest;
    }

    let additionalRequirements: string | null | undefined = undefined;
    if (dto.additionalRequirements !== undefined) {
      if (dto.additionalRequirements === null) {
        additionalRequirements = null;
      } else if (typeof dto.additionalRequirements === 'string') {
        const cleaned = dto.additionalRequirements.replace(/\u0000/g, '').trim();
        if (cleaned.length > MAX_ADDITIONAL_REQUIREMENTS_LENGTH) {
          throw new EnquiryValidationError(
            `Additional requirements must be ${MAX_ADDITIONAL_REQUIREMENTS_LENGTH} characters or fewer.`
          );
        }
        additionalRequirements = cleaned.length > 0 ? cleaned : null;
      } else {
        throw new EnquiryValidationError('Additional requirements must be text.');
      }
    }

    // Verify access + merge allowlisted fields atomically against the locked enquiry row
    let computedStage = 'STEP2_SUBMITTED' as 'STEP2_SKIPPED' | 'STEP2_SUBMITTED';
    let computedCompleteness: ReturnType<typeof computeRequirementsCompleteness> | null = null;
    let computedReferenceNumber = '';

    const verifyAndBuildPatch = (locked: EnquiryEntity) => {
      // If enquiry belongs to a verified customer and a DIFFERENT customer session is authenticated, block.
      if (
        locked.customerId &&
        options?.authenticatedCustomerId &&
        locked.customerId !== options.authenticatedCustomerId
      ) {
        throw new EnquiryContinuationAuthError(
          'Invalid or expired enquiry session.',
          403,
          'INVALID_CONTINUATION_TOKEN'
        );
      }

      const storedRecord = (locked.metadata as Record<string, any> | null | undefined)?._continuation as
        | StoredContinuationRecord
        | undefined;

      const verification = verifyContinuationToken(rawContinuationToken, storedRecord, options?.nowMs);
      if (!verification.valid) {
        if ('reason' in verification && verification.reason === 'EXPIRED') {
          throw new EnquiryContinuationAuthError(
            'Your enquiry session has expired. Your contact details have already been saved.',
            401,
            'CONTINUATION_TOKEN_EXPIRED'
          );
        }
        throw new EnquiryContinuationAuthError(
          'Invalid or expired enquiry session.',
          403,
          'INVALID_CONTINUATION_TOKEN'
        );
      }

      computedReferenceNumber =
        (locked.metadata as any)?.referenceNumber || `GH-ENQ-${locked.id.slice(-6).toUpperCase()}`;

      // Safe shallow-merge onto the fresh locked metadata preserving all unrelated keys
      const mergedMeta: Record<string, any> =
        locked.metadata && typeof locked.metadata === 'object' ? { ...locked.metadata } : {};

      if (preferredBhk !== undefined) mergedMeta.preferredBhk = preferredBhk;
      if (propertyType !== undefined) mergedMeta.propertyType = propertyType;
      if (budgetRangeUpdate !== undefined) {
        mergedMeta.budgetRange = budgetRangeUpdate.budgetRange;
        mergedMeta.budgetMin = budgetRangeUpdate.budgetMin;
        mergedMeta.budgetMax = budgetRangeUpdate.budgetMax;
      }
      if (purchaseTimeline !== undefined) mergedMeta.purchaseTimeline = purchaseTimeline;
      if (purchasePurpose !== undefined) {
        mergedMeta.purchasePurpose = purchasePurpose;
        mergedMeta.purpose = purchasePurpose;
      }
      if (siteVisitInterest !== undefined) {
        mergedMeta.siteVisitInterest = siteVisitInterest;
      }

      const nextMessage = additionalRequirements !== undefined ? additionalRequirements : locked.message;
      const nextRequestSiteVisit =
        siteVisitInterest !== undefined ? siteVisitInterest : locked.requestSiteVisit;

      const previewCompleteness = computeRequirementsCompleteness({
        message: nextMessage,
        requestSiteVisit: nextRequestSiteVisit,
        metadata: {
          ...mergedMeta,
          leadCaptureStage: isSkipped ? 'STEP2_SKIPPED' : 'STEP2_SUBMITTED',
        },
      });

      const nextStage: 'STEP2_SKIPPED' | 'STEP2_SUBMITTED' =
        isSkipped && !previewCompleteness.hasAnyRequirements ? 'STEP2_SKIPPED' : 'STEP2_SUBMITTED';

      mergedMeta.leadCaptureStage = nextStage;
      mergedMeta.requirementsStatus = previewCompleteness.requirementsStatus;
      mergedMeta.requirementsProvidedCount = previewCompleteness.providedCount;
      mergedMeta.requirementsUpdatedAt = new Date().toISOString();

      computedStage = nextStage;
      computedCompleteness = previewCompleteness;

      return {
        metadata: mergedMeta,
        ...(preferredBhk !== undefined && !locked.configurationId ? { configuration: preferredBhk } : {}),
        ...(propertyType !== undefined && propertyType !== null ? { propertyType } : {}),
        ...(additionalRequirements !== undefined ? { message: additionalRequirements } : {}),
        ...(siteVisitInterest !== undefined ? { requestSiteVisit: siteVisitInterest } : {}),
      };
    };

    let updated: EnquiryEntity | null = null;
    if (typeof this.repo.updateBuyerRequirementsAtomic === 'function') {
      // Pre-check token before state-lock error leaks status to unauthenticated callers
      const preCheck = await this.repo.findById(trimmedId);
      if (!preCheck) {
        throw new EnquiryContinuationAuthError(
          'Invalid or expired enquiry session.',
          403,
          'INVALID_CONTINUATION_TOKEN'
        );
      }
      if (
        preCheck.customerId &&
        options?.authenticatedCustomerId &&
        preCheck.customerId !== options.authenticatedCustomerId
      ) {
        throw new EnquiryContinuationAuthError(
          'Invalid or expired enquiry session.',
          403,
          'INVALID_CONTINUATION_TOKEN'
        );
      }
      const preStored = (preCheck.metadata as Record<string, any> | null | undefined)?._continuation as
        | StoredContinuationRecord
        | undefined;
      const preVerify = verifyContinuationToken(rawContinuationToken, preStored, options?.nowMs);
      if (!preVerify.valid) {
        if ('reason' in preVerify && preVerify.reason === 'EXPIRED') {
          throw new EnquiryContinuationAuthError(
            'Your enquiry session has expired. Your contact details have already been saved.',
            401,
            'CONTINUATION_TOKEN_EXPIRED'
          );
        }
        throw new EnquiryContinuationAuthError(
          'Invalid or expired enquiry session.',
          403,
          'INVALID_CONTINUATION_TOKEN'
        );
      }

      const atomicResult = await this.repo.updateBuyerRequirementsAtomic(
        trimmedId,
        ['NEW', 'RECEIVED'],
        verifyAndBuildPatch
      );
      if (atomicResult.outcome === 'NOT_FOUND') {
        throw new EnquiryContinuationAuthError(
          'Invalid or expired enquiry session.',
          403,
          'INVALID_CONTINUATION_TOKEN'
        );
      }
      if (atomicResult.outcome === 'STATE_LOCKED') {
        throw new EnquiryContinuationAuthError(
          'This enquiry is already being processed by our advisory team and can no longer be modified.',
          409,
          'ENQUIRY_STATE_LOCKED'
        );
      }
      updated = atomicResult.enquiry;
    } else {
      const existing = await this.repo.findById(trimmedId);
      if (!existing) {
        throw new EnquiryContinuationAuthError(
          'Invalid or expired enquiry session.',
          403,
          'INVALID_CONTINUATION_TOKEN'
        );
      }
      const patch = verifyAndBuildPatch(existing);
      if (existing.status !== 'NEW' && existing.status !== 'RECEIVED') {
        throw new EnquiryContinuationAuthError(
          'This enquiry is already being processed by our advisory team and can no longer be modified.',
          409,
          'ENQUIRY_STATE_LOCKED'
        );
      }
      updated = await this.repo.update(existing.id, patch);
      if (!updated) {
        throw new EnquiryNotFoundError('Failed to save your requirements.');
      }
    }

    const finalCompleteness = computedCompleteness!;

    return {
      success: true,
      message:
        computedStage === 'STEP2_SKIPPED'
          ? 'Your enquiry is confirmed. Our team will reach out to assist you.'
          : 'Your requirements have been saved to your enquiry.',
      enquiryId: updated.id,
      referenceNumber: computedReferenceNumber,
      requirementsStatus: finalCompleteness.requirementsStatus,
      providedCount: finalCompleteness.providedCount,
      totalOptionalFields: finalCompleteness.totalOptionalFields,
    };
  }

  /**
   * Customer lists their own enquiries (strictly verified customerId only; never unverified phone matches)
   */
  async getCustomerEnquiries(customerId: string): Promise<CustomerEnquiryDto[]> {
    const matchedRes = await this.repo.list({ customerId, limit: 100 });
    const matched = matchedRes.items;

    return matched.map((item) => {
      let referenceNumber = `GH-ENQ-${item.id.slice(-6).toUpperCase()}`;
      if (item.metadata && item.metadata.referenceNumber) {
        referenceNumber = item.metadata.referenceNumber;
      }

      const siteVisitStatus = item.siteVisitId
        ? item.status === 'SITE_VISIT_COMPLETED'
          ? 'COMPLETED'
          : 'REQUESTED'
        : item.requestSiteVisit || item.metadata?.siteVisitInterest === true
          ? 'INTEREST_EXPRESSED'
          : null;

      return {
        id: item.id,
        referenceNumber,
        contextType: item.contextType,
        propertyName: item.projectName || item.listingTitle || null,
        propertySlug: item.projectSlug || item.listingSlug || null,
        listingSlug: item.listingSlug || null,
        configuration: item.configuration || null,
        priceDisplay: item.priceDisplay || null,
        locationName: item.locationName || null,
        status: item.status,
        statusLabel: ENQUIRY_STATUS_LABELS[item.status] || item.status,
        message: item.message || null,
        siteVisitId: item.siteVisitId || null,
        siteVisitStatus,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      };
    });
  }

  /**
   * Admin: List enquiries with comprehensive server-side filtering, sorting & pagination
   */
  async getEnquiries(filter?: AdminEnquiryFilterDto): Promise<{ items: EnquiryEntity[]; total: number }> {
    const res = await this.repo.list(filter);
    return {
      items: res.items.map((item) => sanitizeEnquiryForExposure(item)),
      total: res.total,
    };
  }

  /**
   * Admin: Get single enquiry by ID
   */
  async getEnquiryById(id: string): Promise<EnquiryEntity | null> {
    const item = await this.repo.findById(id);
    return item ? sanitizeEnquiryForExposure(item) : null;
  }

  /**
   * Admin: Update enquiry status, priority, staff assignment, notes, follow-up
   */
  async updateEnquiry(id: string, updateData: UpdateEnquiryRequestDto): Promise<EnquiryEntity> {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new EnquiryNotFoundError(`Enquiry '${id}' not found.`);
    }

    // Validate lifecycle status transition if status is changing
    if (updateData.status && updateData.status !== existing.status) {
      const isValid = isValidEnquiryStatusTransition(existing.status, updateData.status);
      if (!isValid) {
        throw new EnquiryValidationError(
          `Invalid status transition from '${existing.status}' to '${updateData.status}'.`
        );
      }
    }

    const updated = await this.repo.update(id, {
      status: updateData.status,
      priority: updateData.priority,
      assignedTo: updateData.assignedTo,
      assignedToName: updateData.assignedToName,
      internalNotes: updateData.internalNotes,
      lastContactedAt: updateData.lastContactedAt ? new Date(updateData.lastContactedAt) : (updateData.lastContactedAt === null ? null : undefined),
      nextFollowUpAt: updateData.nextFollowUpAt ? new Date(updateData.nextFollowUpAt) : (updateData.nextFollowUpAt === null ? null : undefined),
      siteVisitId: updateData.siteVisitId,
      requestSiteVisit: updateData.requestSiteVisit,
    });

    if (!updated) {
      throw new EnquiryNotFoundError(`Failed to update enquiry '${id}'.`);
    }

    return sanitizeEnquiryForExposure(updated);
  }

  /**
   * Admin: Delete enquiry
   */
  async deleteEnquiry(id: string): Promise<boolean> {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new EnquiryNotFoundError(`Enquiry '${id}' not found.`);
    }
    return this.repo.delete(id);
  }

  /**
   * Admin: Get aggregated KPI metrics
   */
  async getMetrics(): Promise<AdminEnquiryMetricsDto> {
    return this.repo.getMetrics();
  }
}

export const enquiryService = new EnquiryService();
