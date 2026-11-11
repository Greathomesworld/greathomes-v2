import { CreateEnquiryRequestDto, CreateEnquiryResponseDto, AdminEnquiryFilterDto, UpdateEnquiryRequestDto, AdminEnquiryMetricsDto, CustomerEnquiryDto } from '../dto/enquiryDto';
import { EnquiryEntity, isValidEnquiryStatusTransition, ENQUIRY_STATUS_LABELS } from '../entities/enquiryEntity';
import { EnquiryRepository, enquiryRepository as defaultEnquiryRepo } from '../repositories/enquiryRepository';
import { projectIntelligenceService } from '@/src/domain/projects/services/projectIntelligenceService';
import { resaleListingService } from '@/src/domain/projects/services/resaleService';
import { rentalService } from '@/src/domain/projects/services/rentalService';
import { resaleListingRepository, ResaleListingRepository } from '@/src/domain/projects/repositories/resaleRepository';
import { rentalListingRepository, RentalListingRepository } from '@/src/domain/projects/repositories/rentalRepository';
import { siteVisitService } from '@/src/domain/siteVisit/services/siteVisitService';
import { customerIntelligenceService } from '@/src/domain/visitorIntelligence/services/customerIntelligenceService';
import { formatIndianPrice } from '@/src/components/discovery/formatters';

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
    };
  }

  /**
   * Public enquiry submission handler with server-side entity resolution & site visit creation
   */
  async submitEnquiry(dto: CreateEnquiryRequestDto, req?: any): Promise<CreateEnquiryResponseDto> {
    if (!dto.name || !dto.name.trim()) {
      throw new EnquiryValidationError('Your name is required.');
    }

    const normalizedPhone = this.normalizePhone(dto.phone);

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

    // Step 2: Canonical mutex key based on normalized phone, contextType, and canonical entity ID
    const inFlightKey = `${normalizedPhone}:${dto.contextType}:${resolved.canonicalTargetId}`;

    const existingInFlight = inFlightEnquiries.get(inFlightKey);
    if (existingInFlight) {
      return await existingInFlight;
    }

    const executionPromise = this.executeSubmitEnquiry(dto, normalizedPhone, resolved, req);
    inFlightEnquiries.set(inFlightKey, executionPromise);
    try {
      return await executionPromise;
    } finally {
      inFlightEnquiries.delete(inFlightKey);
    }
  }

  private async executeSubmitEnquiry(
    dto: CreateEnquiryRequestDto,
    normalizedPhone: string,
    resolved: ResolvedEnquiryContext,
    req?: any
  ): Promise<CreateEnquiryResponseDto> {
    const validatedEmail = this.validateEmail(dto.email);
    const preferredContact = dto.preferredContact || 'WHATSAPP';
    const requestSiteVisit = Boolean(dto.requestSiteVisit);
    const message = dto.message?.trim() || null;

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
    } = resolved;

    // Duplicate submission protection: check if identical enquiry was submitted within the last 30 seconds
    try {
      const recentList = await this.repo.list({
        buyerPhone: normalizedPhone,
      });
      const duplicate = recentList.items.find(e => {
        const isSameTarget = listingId
          ? e.listingId === listingId
          : listingSlug
            ? (e.listingSlug === listingSlug || e.listingId === listingSlug)
            : (e.projectSlug === projectSlug && e.contextType === dto.contextType);
        const ageMs = Date.now() - new Date(e.createdAt).getTime();
        return isSameTarget && ageMs >= 0 && ageMs < 30000;
      });
      if (duplicate) {
        const existingRef = (duplicate.metadata as any)?.referenceNumber || `GH-ENQ-${duplicate.id.slice(-6)}`;
        return {
          success: true,
          message: 'Your enquiry has already been received. A Great Homes advisor will contact you shortly.',
          enquiryId: duplicate.id,
          referenceNumber: existingRef,
        };
      }
    } catch {
      // Non-blocking duplicate check
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

    const metadataObj = {
      referenceNumber,
      isProjectLevelRequirement,
      enquiryCategory: isProjectLevelRequirement
        ? (dto.contextType === 'RESALE' ? 'RESALE_REQUIREMENT' : 'RENTAL_REQUIREMENT')
        : 'SPECIFIC_LISTING',
      budgetMin: dto.budgetMin || null,
      budgetMax: dto.budgetMax || null,
      preferredBhk: dto.preferredBhk || null,
      propertyType: dto.propertyType || null,
      preferredLocationId: dto.preferredLocationId || null,
      purchaseTimeline: dto.purchaseTimeline || null,
      purpose: dto.purpose || null,
      marketingConsent: Boolean(dto.marketingConsent),
      customerId: dto.customerId || null,
      visitorId: resolvedVisitorId,
      sessionId: resolvedSessionId,
    };

    const createdEnquiry = await this.repo.create({
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
      status: requestSiteVisit ? 'SITE_VISIT_SCHEDULED' : 'NEW',
      priority: 'NORMAL',
      metadata: metadataObj,
    });

    let siteVisitId: string | undefined = undefined;
    let siteVisitStatus: string | undefined = undefined;

    // Handle site visit creation if requested
    if (requestSiteVisit && dto.preferredDate && dto.preferredTimeWindow) {
      const visit = await siteVisitService.createSiteVisit(
        createdEnquiry.id,
        {
          customerId: dto.customerId || null,
          projectId,
          configurationId,
          listingId,
          visitType: dto.visitType || 'IN_PERSON',
          preferredDate: dto.preferredDate,
          preferredTimeWindow: dto.preferredTimeWindow,
          buyerNote: dto.buyerNote || message,
        },
        req
      );
      siteVisitId = visit.id;
      siteVisitStatus = visit.status;
    }

    return {
      success: true,
      message:
        dto.source === 'BROCHURE_DOWNLOAD'
          ? 'Your brochure access is ready.'
          : requestSiteVisit
            ? 'Thank you. Your request has been received by Great Homes. Our team will contact you shortly to coordinate your site visit.'
            : 'Thank you. Your enquiry has been received. A Great Homes advisor will contact you shortly.',
      enquiryId: createdEnquiry.id,
      referenceNumber,
      siteVisitId,
      siteVisitStatus,
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
        siteVisitStatus: item.requestSiteVisit ? 'REQUESTED' : null,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      };
    });
  }

  /**
   * Admin: List enquiries with comprehensive server-side filtering, sorting & pagination
   */
  async getEnquiries(filter?: AdminEnquiryFilterDto): Promise<{ items: EnquiryEntity[]; total: number }> {
    return this.repo.list(filter);
  }

  /**
   * Admin: Get single enquiry by ID
   */
  async getEnquiryById(id: string): Promise<EnquiryEntity | null> {
    return this.repo.findById(id);
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

    return updated;
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
