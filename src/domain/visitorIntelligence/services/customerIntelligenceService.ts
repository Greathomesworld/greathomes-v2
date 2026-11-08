import crypto from 'crypto';
import type { NextRequest } from 'next/server';
import {
  AreaBasisType,
  AttributionSummaryDto,
  Customer360ProfileDto,
  CustomerDirectoryFilterDto,
  CustomerDirectoryItemDto,
  CustomerEnquirySummaryDto,
  CustomerIntentSummaryDto,
  CustomerSiteVisitSummaryDto,
  CustomerTimelineItemDto,
  EvidenceIndicatorDto,
  IngestTelemetryEventInput,
  VisitorDetailDto,
  VisitorDeviceClass,
  VisitorEventEntity,
  VisitorEventType,
  VisitorIntelligenceOverviewDto,
} from '../entities.ts';
import {
  extractCookiesFromRequest,
  hashVisitorIp,
  isOptedOutRequest,
  normalizeBrowserFamily,
  normalizeDeviceClass,
   redactSensitiveStringValue,
  sanitizeEventMetadata,
  sanitizeShortText,
  sanitizeUrlPath,
  validateAreaBasis,
  validateEntityType,
  validateEventType,
} from '../validation.ts';
import { visitorIntelligenceRepository } from '../repositories/visitorIntelligenceRepository.ts';
import {
  customerPreferenceRepository,
  customerRepository,
  locationWatchRepository,
  projectWatchRepository,
  recentlyViewedRepository,
  savedItemRepository,
} from '../../customer/repositories/index.ts';
import { customerService } from '../../customer/services/customerService.ts';
import { watchlistService } from '../../customer/services/watchlistService.ts';
import { enquiryRepository } from '../../enquiry/repositories/enquiryRepository.ts';
import { ENQUIRY_STATUS_LABELS, EnquiryEntity } from '../../enquiry/entities/enquiryEntity.ts';
import {
  siteVisitRepository,
  isMissingSiteVisitsRelationError,
} from '../../../infrastructure/repositories/postgres/siteVisitRepositoryPostgres.ts';
import { projectRepository } from '../../../infrastructure/repositories/memory/projectRepositoryMemory.ts';
import { locationRepository } from '../../../infrastructure/repositories/memory/locationRepositoryMemory.ts';
import { resaleListingRepository } from '../../projects/repositories/resaleRepository.ts';
import { rentalListingRepository } from '../../projects/repositories/rentalRepository.ts';

export interface TelemetryIngestionResult {
  accepted: boolean;
  optedOut?: boolean;
  deduplicated?: boolean;
  visitorId: string;
  sessionId: string;
  cookiesRotated: boolean;
  eventId?: string;
  error?: string;
}

export interface StaffViewerContext {
  staffId: string;
  role: string;
  canViewPii: boolean;
}

export function maskPhoneNumber(phone?: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return '****';
  return `+91 ••••• •${digits.slice(-4)}`;
}

export function maskEmailAddress(email?: string | null): string | null {
  if (!email) return null;
  const parts = email.split('@');
  if (parts.length !== 2) return '•••@•••';
  const [local, domain] = parts;
  const visible = local.slice(0, 2);
  return `${visible}•••@${domain}`;
}

export function maskCustomerName(name?: string | null): string {
  if (!name || !name.trim()) return 'Customer';
  return name
    .trim()
    .split(/\s+/)
    .map((part) => (part.length <= 1 ? `${part}•••` : `${part[0]}•••`))
    .join(' ');
}

export function redactMetadataForRole(
  metadata: Record<string, any> | null | undefined,
  canViewPii: boolean
): Record<string, any> {
  if (!metadata) return {};
  if (canViewPii) return metadata;
  const copy: Record<string, any> = {};
  for (const [k, v] of Object.entries(metadata)) {
    if (typeof v === 'string') {
      copy[k] = redactSensitiveStringValue(v);
    } else if (Array.isArray(v)) {
      copy[k] = v.map((item) =>
        typeof item === 'string' ? redactSensitiveStringValue(item) : item
      );
    } else {
      copy[k] = v;
    }
  }
  return copy;
}

function normalizePhone10(phone?: string | null): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

export class CustomerIntelligenceService {
  /**
   * Resolves a human-readable entity title and slug from canonical repositories
   */
  async resolveEntityLabel(
    entityType: string | null | undefined,
    entityId: string | null | undefined,
    fallbackSlug?: string | null
  ): Promise<{ title: string; slug: string | null; locationName?: string }> {
    if (!entityId) {
      return { title: fallbackSlug || 'Unknown', slug: fallbackSlug || null };
    }
    try {
      if (entityType === 'PROJECT') {
        const proj =
          (await projectRepository.findById(entityId)) ||
          (await projectRepository.findBySlug(entityId));
        if (proj) {
          let locName: string | undefined;
          if (proj.locationId) {
            const loc = await locationRepository.findById(proj.locationId);
            locName = loc?.name;
          }
          return { title: proj.name, slug: proj.slug, locationName: locName };
        }
      } else if (entityType === 'LOCATION') {
        const loc =
          (await locationRepository.findById(entityId)) ||
          (await locationRepository.findBySlug(entityId));
        if (loc) {
          return { title: loc.name, slug: loc.slug, locationName: loc.name };
        }
      } else if (entityType === 'RESALE_LISTING') {
        const listing =
          (await resaleListingRepository.findById(entityId)) ||
          (await resaleListingRepository.findBySlug(entityId));
        if (listing) {
          return {
            title: `${listing.bedroomCount} BHK ${listing.propertyType} Resale`,
            slug: listing.slug || listing.id,
          };
        }
      } else if (entityType === 'RENTAL_LISTING') {
        const listing =
          (await rentalListingRepository.findById(entityId)) ||
          (await rentalListingRepository.findBySlug(entityId));
        if (listing) {
          return {
            title: `${listing.bedroomCount} BHK ${listing.propertyType} Rental`,
            slug: listing.slug || listing.id,
          };
        }
      }
    } catch {
      // Safe fallback
    }
    return { title: fallbackSlug || entityId, slug: fallbackSlug || entityId };
  }

  /**
   * Validates and persists a first-party behavioral event
   */
  async ingestEvent(
    req: Request | NextRequest,
    rawBody: any,
    authenticatedCustomerId?: string | null,
    ipAddress?: string | null
  ): Promise<TelemetryIngestionResult> {
    const cookies = extractCookiesFromRequest(req);
    let visitorId =
      cookies.visitorId ||
      (typeof rawBody?.visitorId === 'string' && rawBody.visitorId.length <= 64
        ? rawBody.visitorId
        : '') ||
      crypto.randomUUID();
    let sessionId =
      cookies.sessionId ||
      (typeof rawBody?.sessionId === 'string' && rawBody.sessionId.length <= 64
        ? rawBody.sessionId
        : '') ||
      crypto.randomUUID();

    if (isOptedOutRequest(req) || rawBody?.optOut === true) {
      return {
        accepted: false,
        optedOut: true,
        visitorId,
        sessionId,
        cookiesRotated: false,
      };
    }

    const eventType = validateEventType(rawBody?.eventType);
    if (!eventType) {
      return {
        accepted: false,
        visitorId,
        sessionId,
        cookiesRotated: false,
        error: 'Invalid or unsupported telemetry eventType.',
      };
    }

    const entityType = validateEntityType(rawBody?.entityType);
    if (rawBody?.entityType !== undefined && rawBody?.entityType !== null && !entityType && rawBody?.entityType !== '') {
      return {
        accepted: false,
        visitorId,
        sessionId,
        cookiesRotated: false,
        error: 'Invalid entityType.',
      };
    }

    const areaBasis = validateAreaBasis(rawBody?.areaBasis);
    if (rawBody?.areaBasis !== undefined && rawBody?.areaBasis !== null && !areaBasis && rawBody?.areaBasis !== '') {
      return {
        accepted: false,
        visitorId,
        sessionId,
        cookiesRotated: false,
        error: 'Invalid areaBasis. Must be CARPET, BUILT_UP, or SUPER_BUILT_UP.',
      };
    }

    const metadataCheck = sanitizeEventMetadata(rawBody?.metadata);
    if (!metadataCheck.valid) {
      return {
        accepted: false,
        visitorId,
        sessionId,
        cookiesRotated: false,
        error: metadataCheck.error,
      };
    }

    const pagePath = sanitizeUrlPath(rawBody?.pagePath, 500) || '/';
    const pageTitle = sanitizeShortText(rawBody?.pageTitle, 200);
    const referrerUrl = sanitizeShortText(rawBody?.referrerUrl, 500);
    const utmSource = sanitizeShortText(rawBody?.utmSource, 120);
    const utmMedium = sanitizeShortText(rawBody?.utmMedium, 120);
    const utmCampaign = sanitizeShortText(rawBody?.utmCampaign, 160);
    const utmTerm = sanitizeShortText(rawBody?.utmTerm, 160);
    const utmContent = sanitizeShortText(rawBody?.utmContent, 160);
    const entityId = sanitizeShortText(rawBody?.entityId, 128);
    const entitySlug = sanitizeShortText(rawBody?.entitySlug, 220);
    const clientEventId = sanitizeShortText(rawBody?.clientEventId, 128);
    const durationSeconds =
      typeof rawBody?.durationSeconds === 'number' &&
      Number.isFinite(rawBody.durationSeconds) &&
      rawBody.durationSeconds >= 0
        ? Math.min(Math.round(rawBody.durationSeconds), 86400)
        : null;

    const userAgent = req.headers.get('user-agent');
    const deviceClass: VisitorDeviceClass = rawBody?.deviceClass
      ? normalizeDeviceClass(String(rawBody.deviceClass))
      : normalizeDeviceClass(userAgent);
    const browserFamily = normalizeBrowserFamily(userAgent);
    const ipHash = hashVisitorIp(ipAddress);

    let cookiesRotated = false;
    const effectiveCustomerId = authenticatedCustomerId || null;

    // Check existing visitor to prevent both shared-device cross-customer contamination
    // AND unauthenticated spoofing/replay of an already customer-linked visitorId!
    let existingVisitor = await visitorIntelligenceRepository.findVisitorById(visitorId);
    if (
      existingVisitor &&
      existingVisitor.customerId &&
      existingVisitor.customerId !== effectiveCustomerId
    ) {
      visitorId = crypto.randomUUID();
      sessionId = crypto.randomUUID();
      cookiesRotated = true;
      existingVisitor = null;
    }

    // Check if session exists or belongs to a different visitor or different customer
    let existingSession = await visitorIntelligenceRepository.findSessionById(sessionId);
    if (
      existingSession &&
      (existingSession.visitorId !== visitorId ||
        (existingSession.customerId && existingSession.customerId !== effectiveCustomerId))
    ) {
      sessionId = crypto.randomUUID();
      cookiesRotated = true;
      existingSession = null;
    }

    // Ensure visitor row exists WITHOUT incrementing sessionCount until deduplication check passes
    await visitorIntelligenceRepository.upsertVisitor({
      id: visitorId,
      customerId: effectiveCustomerId,
      utmSource,
      utmMedium,
      utmCampaign,
      utmTerm,
      utmContent,
      referrerUrl,
      landingPath: pagePath,
      deviceClass,
      browserFamily,
      ipHash,
      incrementSessionCount: false,
    });

    if (effectiveCustomerId) {
      const linkResult = await visitorIntelligenceRepository.linkVisitorToCustomer(
        visitorId,
        effectiveCustomerId
      );
      if (linkResult.conflictDifferentCustomer) {
        visitorId = crypto.randomUUID();
        sessionId = crypto.randomUUID();
        cookiesRotated = true;
        existingVisitor = null;
        existingSession = null;
        await visitorIntelligenceRepository.upsertVisitor({
          id: visitorId,
          customerId: effectiveCustomerId,
          utmSource,
          utmMedium,
          utmCampaign,
          utmTerm,
          utmContent,
          referrerUrl,
          landingPath: pagePath,
          deviceClass,
          browserFamily,
          ipHash,
          incrementSessionCount: false,
        });
      }
    }

    // Ensure session row exists WITHOUT incrementing counters before recordEvent deduplication
    await visitorIntelligenceRepository.upsertSession({
      id: sessionId,
      visitorId,
      customerId: effectiveCustomerId,
      utmSource,
      utmMedium,
      utmCampaign,
      utmTerm,
      utmContent,
      referrerUrl,
      entryPath: pagePath,
      exitPath: pagePath,
      deviceClass,
      browserFamily,
      ipHash,
      incrementPageViews: false,
      incrementEvents: false,
      durationSeconds: durationSeconds ?? undefined,
    });

    const recorded = await visitorIntelligenceRepository.recordEvent({
      visitorId,
      sessionId,
      customerId: effectiveCustomerId,
      eventType,
      pagePath,
      pageTitle,
      entityType,
      entityId,
      entitySlug,
      areaBasis,
      durationSeconds,
      clientEventId,
      metadata: metadataCheck.sanitized,
    });

    // Only increment visitor & session counters when the event is NOT a duplicate!
    if (!recorded.deduplicated) {
      const updatedSession = await visitorIntelligenceRepository.upsertSession({
        id: sessionId,
        visitorId,
        customerId: effectiveCustomerId,
        utmSource,
        utmMedium,
        utmCampaign,
        utmTerm,
        utmContent,
        referrerUrl,
        entryPath: pagePath,
        exitPath: pagePath,
        deviceClass,
        browserFamily,
        ipHash,
        incrementPageViews: eventType === 'PAGE_VIEW',
        incrementEvents: true,
        durationSeconds: durationSeconds ?? undefined,
      });

      // Only the single atomic request that transitions a session's eventCount from 0 -> 1
      // may increment the visitor's sessionCount, and only when the visitor already had a prior session.
      if (updatedSession.eventCount === 1) {
        const visitorSessions = await visitorIntelligenceRepository.listSessionsByVisitorId(
          visitorId,
          2
        );
        const hasPriorSession = visitorSessions.some((s) => s.id !== sessionId);
        if (hasPriorSession) {
          await visitorIntelligenceRepository.upsertVisitor({
            id: visitorId,
            customerId: effectiveCustomerId,
            landingPath: pagePath,
            deviceClass,
            browserFamily,
            ipHash,
            incrementSessionCount: true,
          });
        }
      }
    }

    // If customer is authenticated and viewing a property, automatically keep recently_viewed in sync
    if (effectiveCustomerId && entityId && !recorded.deduplicated) {
      try {
        if (eventType === 'PROJECT_VIEW') {
          await recentlyViewedRepository.recordView(effectiveCustomerId, 'PROJECT', entityId);
        } else if (eventType === 'RESALE_LISTING_VIEW') {
          await recentlyViewedRepository.recordView(effectiveCustomerId, 'RESALE_LISTING', entityId);
        } else if (eventType === 'RENTAL_LISTING_VIEW') {
          await recentlyViewedRepository.recordView(effectiveCustomerId, 'RENTAL_LISTING', entityId);
        }
      } catch {
        // Non-fatal
      }
    }

    return {
      accepted: true,
      deduplicated: recorded.deduplicated,
      visitorId,
      sessionId,
      cookiesRotated,
      eventId: recorded.event.id,
    };
  }

  /**
   * Prevents unauthenticated or cross-customer enquiry attribution poisoning AND guarantees
   * that every non-null visitorId and sessionId referenced by an enquiry exists in
   * `visitors` and `visitor_sessions` BEFORE the enquiry row is inserted.
   *
   * If telemetry opt-out is active or if attribution persistence encounters a database error,
   * safely falls back to `{ visitorId: null, sessionId: null, rotated: false }` so enquiry
   * submission remains reliable without violating foreign-key constraints.
   */
  async resolveSafeEnquiryAttribution(params: {
    visitorId: string | null;
    sessionId: string | null;
    authenticatedCustomerId: string | null;
    req?: Request | NextRequest | null;
    sourcePage?: string | null;
    ipAddress?: string | null;
  }): Promise<{
    visitorId: string | null;
    sessionId: string | null;
    rotated: boolean;
  }> {
    if (params.req && isOptedOutRequest(params.req)) {
      return { visitorId: null, sessionId: null, rotated: false };
    }

    let visitorId =
      typeof params.visitorId === 'string' && params.visitorId.trim().length > 0
        ? params.visitorId.trim()
        : null;
    let sessionId =
      typeof params.sessionId === 'string' && params.sessionId.trim().length > 0
        ? params.sessionId.trim()
        : null;

    if (!visitorId && !sessionId) {
      return { visitorId: null, sessionId: null, rotated: false };
    }

    const effectiveCustomerId = params.authenticatedCustomerId || null;
    let rotated = false;

    try {
      if (visitorId && visitorId.length > 64) {
        visitorId = crypto.randomUUID();
        rotated = true;
      }
      if (sessionId && sessionId.length > 64) {
        sessionId = crypto.randomUUID();
        rotated = true;
      }

      // A session row requires a non-null parent visitorId
      if (sessionId && !visitorId) {
        visitorId = crypto.randomUUID();
        rotated = true;
      }

      if (visitorId) {
        const existingVisitor = await visitorIntelligenceRepository.findVisitorById(visitorId);
        if (
          existingVisitor &&
          existingVisitor.customerId &&
          existingVisitor.customerId !== effectiveCustomerId
        ) {
          visitorId = crypto.randomUUID();
          if (sessionId) {
            sessionId = crypto.randomUUID();
          }
          rotated = true;
        }
      }

      if (sessionId && !rotated) {
        const existingSession = await visitorIntelligenceRepository.findSessionById(sessionId);
        if (
          existingSession &&
          ((visitorId && existingSession.visitorId !== visitorId) ||
            (existingSession.customerId &&
              existingSession.customerId !== effectiveCustomerId))
        ) {
          sessionId = crypto.randomUUID();
          rotated = true;
        }
      }

      const userAgent = params.req?.headers?.get('user-agent') || null;
      const deviceClass = normalizeDeviceClass(userAgent);
      const browserFamily = normalizeBrowserFamily(userAgent);
      const ipHash = hashVisitorIp(params.ipAddress);
      const landingPath = sanitizeUrlPath(params.sourcePage, 500) || '/';

      if (visitorId) {
        await visitorIntelligenceRepository.upsertVisitor({
          id: visitorId,
          customerId: effectiveCustomerId,
          landingPath,
          deviceClass,
          browserFamily,
          ipHash,
          incrementSessionCount: false,
        });

        if (effectiveCustomerId) {
          const linkResult = await visitorIntelligenceRepository.linkVisitorToCustomer(
            visitorId,
            effectiveCustomerId
          );
          if (linkResult.conflictDifferentCustomer) {
            visitorId = crypto.randomUUID();
            if (sessionId) {
              sessionId = crypto.randomUUID();
            }
            rotated = true;
            await visitorIntelligenceRepository.upsertVisitor({
              id: visitorId,
              customerId: effectiveCustomerId,
              landingPath,
              deviceClass,
              browserFamily,
              ipHash,
              incrementSessionCount: false,
            });
          }
        }
      }

      if (sessionId && visitorId) {
        await visitorIntelligenceRepository.upsertSession({
          id: sessionId,
          visitorId,
          customerId: effectiveCustomerId,
          entryPath: landingPath,
          exitPath: landingPath,
          deviceClass,
          browserFamily,
          ipHash,
          incrementPageViews: false,
          incrementEvents: false,
        });
      }

      return { visitorId, sessionId, rotated };
    } catch {
      // Safe fallback: if attribution persistence fails, clear visitor/session attribution
      // so the customer's enquiry still succeeds without foreign-key violations.
      return { visitorId: null, sessionId: null, rotated: false };
    }
  }

  /**
   * Links an anonymous first-party visitor/session to a newly OTP-authenticated customer.
   * Preserves shared-device isolation (rotates visitor/session cookies if prior visitor belonged to a different customer).
   */
  async handleCustomerAuthenticated(params: {
    req: Request | NextRequest;
    customerId: string;
    isNewProfile?: boolean;
    ipAddress?: string | null;
  }): Promise<{
    visitorId: string;
    sessionId: string;
    cookiesRotated: boolean;
    backfilledEvents: number;
  }> {
    const cookies = extractCookiesFromRequest(params.req);
    let visitorId = cookies.visitorId || crypto.randomUUID();
    let sessionId = cookies.sessionId || crypto.randomUUID();
    let cookiesRotated = !cookies.visitorId || !cookies.sessionId;
    let backfilledEvents = 0;

    const userAgent = params.req.headers.get('user-agent');
    const deviceClass = normalizeDeviceClass(userAgent);
    const browserFamily = normalizeBrowserFamily(userAgent);
    const ipHash = hashVisitorIp(params.ipAddress);

    // Ensure visitor exists before linking
    await visitorIntelligenceRepository.upsertVisitor({
      id: visitorId,
      deviceClass,
      browserFamily,
      ipHash,
      landingPath: '/',
    });

    const linkResult = await visitorIntelligenceRepository.linkVisitorToCustomer(
      visitorId,
      params.customerId
    );

    if (linkResult.conflictDifferentCustomer) {
      // Shared device where previous visitor was linked to another customer!
      // Rotate to a clean visitor & session for the new customer.
      visitorId = crypto.randomUUID();
      sessionId = crypto.randomUUID();
      cookiesRotated = true;
      await visitorIntelligenceRepository.upsertVisitor({
        id: visitorId,
        customerId: params.customerId,
        deviceClass,
        browserFamily,
        ipHash,
        landingPath: '/',
        incrementSessionCount: true,
      });
    } else {
      backfilledEvents = linkResult.backfilledEvents;

      // Sync prior anonymous property views from this visitor into recently_viewed
      try {
        const priorEvents = await visitorIntelligenceRepository.listEvents({
          visitorId,
          limit: 50,
        });
        for (const ev of priorEvents.slice().reverse()) {
          if (!ev.entityId) continue;
          if (ev.eventType === 'PROJECT_VIEW') {
            await recentlyViewedRepository.recordView(params.customerId, 'PROJECT', ev.entityId);
          } else if (ev.eventType === 'RESALE_LISTING_VIEW') {
            await recentlyViewedRepository.recordView(params.customerId, 'RESALE_LISTING', ev.entityId);
          } else if (ev.eventType === 'RENTAL_LISTING_VIEW') {
            await recentlyViewedRepository.recordView(params.customerId, 'RENTAL_LISTING', ev.entityId);
          }
        }
      } catch {
        // Non-fatal
      }
    }

    await visitorIntelligenceRepository.upsertSession({
      id: sessionId,
      visitorId,
      customerId: params.customerId,
      entryPath: '/',
      exitPath: '/',
      deviceClass,
      browserFamily,
      ipHash,
      incrementEvents: true,
    });

    await visitorIntelligenceRepository.recordEvent({
      visitorId,
      sessionId,
      customerId: params.customerId,
      eventType: 'OTP_VERIFIED',
      pagePath: '/account',
      metadata: {
        isNewProfile: Boolean(params.isNewProfile),
        linkedPriorEvents: backfilledEvents,
      },
    });

    if (params.isNewProfile) {
      await visitorIntelligenceRepository.recordEvent({
        visitorId,
        sessionId,
        customerId: params.customerId,
        eventType: 'PROFILE_COMPLETED',
        pagePath: '/account',
        metadata: {},
      });
    }

    return {
      visitorId,
      sessionId,
      cookiesRotated,
      backfilledEvents,
    };
  }

  /**
   * Builds explainable, factual evidence indicators (never opaque 0-100 or speculative AI scores)
   */
  private buildEvidenceIndicators(params: {
    hasOtpPhone: boolean;
    enquiryCount: number;
    siteVisitCount: number;
    savedCount: number;
    watchedLocationsCount: number;
    watchedProjectsCount: number;
    comparisonCount: number;
    repeatedViews: Array<{ title: string; count: number }>;
    sessionCount: number;
    startedUnsubmitEnquiryCount: number;
  }): EvidenceIndicatorDto[] {
    const indicators: EvidenceIndicatorDto[] = [];

    if (params.siteVisitCount > 0) {
      indicators.push({
        code: 'SITE_VISIT_REQUESTED',
        label: 'Site visit requested',
        detail: `${params.siteVisitCount} site visit${params.siteVisitCount > 1 ? 's' : ''} requested or scheduled`,
        tone: 'emerald',
      });
    }

    if (params.enquiryCount > 0) {
      indicators.push({
        code: 'ENQUIRY_SUBMITTED',
        label: 'Enquiry submitted',
        detail: `${params.enquiryCount} verified property enquir${params.enquiryCount > 1 ? 'ies' : 'y'} submitted`,
        tone: 'emerald',
      });
    }

    if (params.repeatedViews.length > 0) {
      const top = params.repeatedViews[0];
      indicators.push({
        code: 'REPEATED_VIEWS',
        label: 'Repeated property views',
        detail: `Viewed ${top.title} ${top.count} times`,
        tone: 'amber',
      });
    }

    if (params.savedCount > 0 || params.watchedProjectsCount > 0) {
      const totalShortlisted = params.savedCount + params.watchedProjectsCount;
      indicators.push({
        code: 'SAVED_PROPERTY',
        label: 'Saved property',
        detail: `${totalShortlisted} home${totalShortlisted > 1 ? 's' : ''} saved or watched`,
        tone: 'amber',
      });
    }

    if (params.watchedLocationsCount > 0) {
      indicators.push({
        code: 'WATCHED_LOCATION',
        label: 'Watched micro-market',
        detail: `Monitoring ${params.watchedLocationsCount} Kolkata locality${params.watchedLocationsCount > 1 ? 'ies' : ''}`,
        tone: 'slate',
      });
    }

    if (params.comparisonCount > 0) {
      indicators.push({
        code: 'PROPERTY_COMPARISON',
        label: 'Compared properties',
        detail: `Used side-by-side comparison ${params.comparisonCount} time${params.comparisonCount > 1 ? 's' : ''}`,
        tone: 'slate',
      });
    }

    if (params.enquiryCount === 0 && params.startedUnsubmitEnquiryCount > 0) {
      indicators.push({
        code: 'ENQUIRY_STARTED_UNSUBMITTED',
        label: 'Opened enquiry form (unsubmitted)',
        detail: `Opened enquiry dialog ${params.startedUnsubmitEnquiryCount} time${params.startedUnsubmitEnquiryCount > 1 ? 's' : ''} without submitting`,
        tone: 'amber',
      });
    }

    if (params.sessionCount > 1) {
      indicators.push({
        code: 'RETURNING_VISITOR',
        label: 'Returning visitor',
        detail: `${params.sessionCount} browsing sessions recorded`,
        tone: 'slate',
      });
    }

    if (params.hasOtpPhone) {
      indicators.push({
        code: 'OTP_VERIFIED_MOBILE',
        label: 'OTP-verified mobile',
        detail: 'Authenticated via first-party mobile OTP',
        tone: 'emerald',
      });
    }

    return indicators;
  }

  /**
   * Computes the Admin Visitor & Customer 360 Overview Dashboard
   */
  async getOverview(staff?: { canViewPii?: boolean }): Promise<VisitorIntelligenceOverviewDto> {
    const canViewPii = staff?.canViewPii ?? true;
    const repoStats = await visitorIntelligenceRepository.getOverviewStats();
    const { total: totalCustomers } = await customerRepository.list({ limit: 1 });
    const allEnquiries = await enquiryRepository.list({ limit: 1000 });
    let allVisits: any[] = [];
    try {
      allVisits = await siteVisitRepository.list({ limit: 1000 });
    } catch (err: any) {
      if (isMissingSiteVisitsRelationError(err)) {
        allVisits = [];
      } else {
        throw err;
      }
    }

    const customersWithEnquiries = new Set<string>();
    const visitorsWithEnquiries = new Set<string>();
    for (const enq of allEnquiries.items) {
      const cid = enq.customerId || enq.metadata?.customerId;
      if (cid) customersWithEnquiries.add(cid);
      if (enq.visitorId) visitorsWithEnquiries.add(enq.visitorId);
    }

    const customersWithSiteVisits = new Set<string>();
    for (const v of allVisits) {
      if (v.customerId) customersWithSiteVisits.add(v.customerId);
    }

    // Enrich top viewed projects, listings, and locations
    const topViewedProjects = await Promise.all(
      repoStats.topProjectsRaw.map(async (item) => {
        const resolved = await this.resolveEntityLabel('PROJECT', item.entityId, item.entitySlug);
        return {
          entityId: item.entityId,
          title: resolved.title,
          slug: resolved.slug,
          views: item.views,
          uniqueVisitors: item.uniqueVisitors,
        };
      })
    );

    const topViewedListings = await Promise.all(
      repoStats.topListingsRaw.map(async (item) => {
        const resolved = await this.resolveEntityLabel(item.entityType, item.entityId, item.entitySlug);
        return {
          entityId: item.entityId,
          entityType: item.entityType,
          title: resolved.title,
          slug: resolved.slug,
          views: item.views,
          uniqueVisitors: item.uniqueVisitors,
        };
      })
    );

    const topLocations = await Promise.all(
      repoStats.topLocationsRaw.map(async (item) => {
        const resolved = await this.resolveEntityLabel('LOCATION', item.entityId, item.entitySlug);
        return {
          locationId: item.entityId,
          name: resolved.title,
          slug: resolved.slug,
          views: item.views,
          uniqueVisitors: item.uniqueVisitors,
        };
      })
    );

    const totalVisitors = Math.max(repoStats.totalVisitors, 1);
    const enquiriesVisitorsCount = Math.max(
      visitorsWithEnquiries.size,
      customersWithEnquiries.size,
      allEnquiries.total > 0 ? Math.min(allEnquiries.total, repoStats.totalVisitors) : 0
    );
    const siteVisitCount = Math.max(
      customersWithSiteVisits.size,
      allVisits.length > 0 ? Math.min(allVisits.length, repoStats.totalVisitors) : 0
    );

    const funnel = [
      {
        stage: 'VISITORS',
        label: '1. Total Visitors',
        count: repoStats.totalVisitors,
        conversionRateFromPrevious: 100,
        conversionRateFromTop: 100,
      },
      {
        stage: 'PROPERTY_VIEWS',
        label: '2. Viewed Properties',
        count: repoStats.visitorsWithPropertyViews,
        conversionRateFromPrevious: Math.round((repoStats.visitorsWithPropertyViews / totalVisitors) * 100),
        conversionRateFromTop: Math.round((repoStats.visitorsWithPropertyViews / totalVisitors) * 100),
      },
      {
        stage: 'SEARCH_FILTER',
        label: '3. Searched / Filtered',
        count: repoStats.visitorsWithSearchFilter,
        conversionRateFromPrevious:
          repoStats.visitorsWithPropertyViews > 0
            ? Math.round((repoStats.visitorsWithSearchFilter / repoStats.visitorsWithPropertyViews) * 100)
            : 0,
        conversionRateFromTop: Math.round((repoStats.visitorsWithSearchFilter / totalVisitors) * 100),
      },
      {
        stage: 'SHORTLISTED',
        label: '4. Saved / Watched / Compared',
        count: repoStats.visitorsWithShortlist,
        conversionRateFromPrevious:
          repoStats.visitorsWithSearchFilter > 0
            ? Math.round((repoStats.visitorsWithShortlist / repoStats.visitorsWithSearchFilter) * 100)
            : 0,
        conversionRateFromTop: Math.round((repoStats.visitorsWithShortlist / totalVisitors) * 100),
      },
      {
        stage: 'OTP_VERIFIED',
        label: '5. OTP-Authenticated Customers',
        count: Math.max(repoStats.authenticatedVisitors, totalCustomers),
        conversionRateFromPrevious:
          repoStats.visitorsWithShortlist > 0
            ? Math.min(
                100,
                Math.round(
                  (Math.max(repoStats.authenticatedVisitors, totalCustomers) /
                    repoStats.visitorsWithShortlist) *
                    100
                )
              )
            : 0,
        conversionRateFromTop: Math.min(
          100,
          Math.round((Math.max(repoStats.authenticatedVisitors, totalCustomers) / totalVisitors) * 100)
        ),
      },
      {
        stage: 'ENQUIRIES',
        label: '6. Submitted Enquiries',
        count: allEnquiries.total,
        conversionRateFromPrevious:
          Math.max(repoStats.authenticatedVisitors, totalCustomers) > 0
            ? Math.min(
                100,
                Math.round(
                  (enquiriesVisitorsCount /
                    Math.max(repoStats.authenticatedVisitors, totalCustomers)) *
                    100
                )
              )
            : 0,
        conversionRateFromTop: Math.min(100, Math.round((enquiriesVisitorsCount / totalVisitors) * 100)),
      },
      {
        stage: 'SITE_VISITS',
        label: '7. Site Visits Requested',
        count: allVisits.length,
        conversionRateFromPrevious:
          allEnquiries.total > 0 ? Math.min(100, Math.round((allVisits.length / allEnquiries.total) * 100)) : 0,
        conversionRateFromTop: Math.min(100, Math.round((siteVisitCount / totalVisitors) * 100)),
      },
    ];

    const topSearchFilters = repoStats.topSearchFilters.map((f) => ({
      label: canViewPii ? f.label : redactSensitiveStringValue(f.label),
      count: f.count,
    }));

    return {
      kpis: {
        totalVisitors: repoStats.totalVisitors,
        anonymousVisitors: repoStats.anonymousVisitors,
        authenticatedVisitors: repoStats.authenticatedVisitors,
        returningVisitors: repoStats.returningVisitors,
        totalCustomers,
        totalSessions: repoStats.totalSessions,
        totalPropertyViews: repoStats.totalPropertyViews,
        totalSearches: repoStats.totalSearches,
        totalShortlists: repoStats.totalShortlists,
        totalComparisons: repoStats.totalComparisons,
        customersWithEnquiries: customersWithEnquiries.size,
        customersWithSiteVisits: customersWithSiteVisits.size,
      },
      funnel,
      topViewedProjects,
      topViewedListings,
      topLocations,
      topSearchFilters,
      trafficSources: repoStats.trafficSources,
      deviceBreakdown: repoStats.deviceBreakdown,
    };
  }

  /**
   * Lists OTP-authenticated customers with batched 360 signals and strict role-aware PII masking
   */
  async listCustomers(
    filter: CustomerDirectoryFilterDto,
    staff: StaffViewerContext
  ): Promise<{ items: CustomerDirectoryItemDto[]; total: number }> {
    const { items: rawCustomers } = await customerRepository.list({
      search: filter.search,
      allowPiiSearch: Boolean(staff.canViewPii),
      status: filter.status as any,
      limit: 250,
      offset: 0,
    });

    const customerIds = rawCustomers.map((c) => c.id);
    const [batchedIntel, allEnquiries, allVisits] = await Promise.all([
      visitorIntelligenceRepository.getBatchedCustomerIntelligence(customerIds),
      enquiryRepository.list({ limit: 1000 }),
      siteVisitRepository.list({ limit: 1000 }).catch((err: any) => {
        if (isMissingSiteVisitsRelationError(err)) return [];
        throw err;
      }),
    ]);

    // Cache entity label resolutions across the batch to avoid N+1 entity lookups
    const labelCache = new Map<string, Promise<{ title: string; slug: string | null; locationName?: string }>>();
    const getCachedLabel = (type: string | null | undefined, id: string | null | undefined) => {
      const key = `${type || ''}:${id || ''}`;
      if (!labelCache.has(key)) {
        labelCache.set(key, this.resolveEntityLabel(type, id));
      }
      return labelCache.get(key)!;
    };

    const directoryItems: CustomerDirectoryItemDto[] = [];

    for (const cust of rawCustomers) {
      const [prefs, savedItems, projectWatches, locationWatches, recentlyViewed] = await Promise.all([
        customerPreferenceRepository.findByCustomerId(cust.id),
        savedItemRepository.listByCustomer(cust.id),
        projectWatchRepository.listByCustomer(cust.id),
        locationWatchRepository.listByCustomer(cust.id),
        recentlyViewedRepository.listByCustomer(cust.id, 30),
      ]);

      const linkedVisitors = batchedIntel.visitorsByCustomer.get(cust.id) || [];
      const custEvents = batchedIntel.eventsByCustomer.get(cust.id) || [];

      const linkedVisitorById = new Map(linkedVisitors.map((v) => [v.id, v]));
      const custPhone10 = normalizePhone10(cust.phone);

      const verifiedEnquiries = allEnquiries.items.filter((e) => {
        if (e.customerId === cust.id || e.metadata?.customerId === cust.id) {
          return true;
        }
        if (!e.customerId && e.visitorId && linkedVisitorById.has(e.visitorId)) {
          const lv = linkedVisitorById.get(e.visitorId)!;
          const withinPreAuthWindow =
            !lv.linkedAt || e.createdAt.getTime() <= lv.linkedAt.getTime() + 5000;
          const phoneConsistent =
            !custPhone10 || !e.buyerPhone || normalizePhone10(e.buyerPhone) === custPhone10;
          return withinPreAuthWindow && phoneConsistent;
        }
        return false;
      });

      const custVisits = allVisits.filter(
        (v) =>
          v.customerId === cust.id ||
          verifiedEnquiries.some((e) => e.id === v.enquiryId)
      );

      const activeProjectWatches = projectWatches.filter((w: any) => w.enabled);
      const activeLocationWatches = locationWatches.filter((w: any) => w.enabled);

      const sessionCount = linkedVisitors.reduce((sum, v) => sum + (v.sessionCount || 1), 0);
      const propertyViewEvents = custEvents.filter((e) =>
        ['PROJECT_VIEW', 'RESALE_LISTING_VIEW', 'RENTAL_LISTING_VIEW'].includes(e.eventType)
      );
      const recentViewsSum = recentlyViewed.reduce((sum: number, r: any) => sum + (r.viewCount || 1), 0);
      const propertyViewCount = Math.max(propertyViewEvents.length, recentViewsSum);

      const comparisonCount = custEvents.filter((e) =>
        ['COMPARE_ADDED', 'COMPARE_VIEWED'].includes(e.eventType)
      ).length;
      const startedUnsubmitEnquiryCount = custEvents.filter(
        (e) => e.eventType === 'ENQUIRY_MODAL_OPENED'
      ).length;

      const repeatedViews: Array<{ title: string; count: number }> = [];
      for (const rv of recentlyViewed) {
        if (rv.viewCount >= 2) {
          const resolved = await getCachedLabel(rv.resourceType, rv.resourceId);
          repeatedViews.push({ title: resolved.title, count: rv.viewCount });
        }
      }

      const preferredLocationsSet = new Set<string>(prefs?.preferredLocations || []);
      for (const lw of activeLocationWatches) {
        const resolved = await getCachedLabel('LOCATION', lw.locationId);
        if (resolved.title && resolved.title !== lw.locationId) {
          preferredLocationsSet.add(resolved.title);
        }
      }
      for (const enq of verifiedEnquiries) {
        if (enq.locationName) preferredLocationsSet.add(enq.locationName);
      }

      const preferredBhkSet = new Set<string>(
        (prefs?.preferredBhk || []).map((b: any) =>
          typeof b === 'number' ? `${b} BHK` : String(b)
        )
      );
      for (const enq of verifiedEnquiries) {
        if (enq.configuration) preferredBhkSet.add(enq.configuration);
        if (enq.metadata?.preferredBhk) preferredBhkSet.add(String(enq.metadata.preferredBhk));
      }

      let lastActiveMs = cust.updatedAt.getTime();
      for (const v of linkedVisitors) {
        if (v.lastSeenAt.getTime() > lastActiveMs) lastActiveMs = v.lastSeenAt.getTime();
      }
      for (const ev of custEvents) {
        if (ev.occurredAt.getTime() > lastActiveMs) lastActiveMs = ev.occurredAt.getTime();
      }
      for (const enq of verifiedEnquiries) {
        if (enq.createdAt.getTime() > lastActiveMs) lastActiveMs = enq.createdAt.getTime();
      }

      if (filter.hasEnquiry === true && verifiedEnquiries.length === 0) continue;
      if (filter.hasEnquiry === false && verifiedEnquiries.length > 0) continue;
      if (filter.hasSiteVisit === true && custVisits.length === 0) continue;
      if (filter.hasSiteVisit === false && custVisits.length > 0) continue;
      if (
        filter.hasSavedItems === true &&
        savedItems.length === 0 &&
        activeProjectWatches.length === 0
      ) {
        continue;
      }
      if (filter.preferredLocation) {
        const locQuery = filter.preferredLocation.toLowerCase();
        const hasLoc = Array.from(preferredLocationsSet).some((l) =>
          l.toLowerCase().includes(locQuery)
        );
        if (!hasLoc) continue;
      }
      if (filter.preferredBhk) {
        const bhkQuery = filter.preferredBhk.toLowerCase();
        const hasBhk = Array.from(preferredBhkSet).some((b) =>
          b.toLowerCase().includes(bhkQuery)
        );
        if (!hasBhk) continue;
      }
      if (filter.activeWithinDays && filter.activeWithinDays > 0) {
        const cutoff = Date.now() - filter.activeWithinDays * 24 * 60 * 60 * 1000;
        if (lastActiveMs < cutoff) continue;
      }

      const evidenceIndicators = this.buildEvidenceIndicators({
        hasOtpPhone: Boolean(cust.phone),
        enquiryCount: verifiedEnquiries.length,
        siteVisitCount: custVisits.length,
        savedCount: savedItems.length,
        watchedLocationsCount: activeLocationWatches.length,
        watchedProjectsCount: activeProjectWatches.length,
        comparisonCount,
        repeatedViews,
        sessionCount,
        startedUnsubmitEnquiryCount,
      });

      const firstVisitor = linkedVisitors[linkedVisitors.length - 1] || linkedVisitors[0];

      directoryItems.push({
        id: cust.id,
        name: staff.canViewPii ? cust.name : maskCustomerName(cust.name),
        phone: staff.canViewPii ? cust.phone || null : maskPhoneNumber(cust.phone),
        email: (staff.canViewPii ? cust.email : maskEmailAddress(cust.email)) || '•••@•••',
        status: cust.status,
        createdAt: cust.createdAt.toISOString(),
        lastActiveAt: new Date(lastActiveMs).toISOString(),
        linkedVisitorCount: linkedVisitors.length,
        sessionCount,
        propertyViewCount,
        savedCount: savedItems.length,
        watchedProjectsCount: activeProjectWatches.length,
        watchedLocationsCount: activeLocationWatches.length,
        enquiryCount: verifiedEnquiries.length,
        siteVisitCount: custVisits.length,
        preferredMode: prefs?.preferredMode || 'ALL',
        preferredLocations: Array.from(preferredLocationsSet),
        preferredBhk: Array.from(preferredBhkSet),
        budgetMin: prefs?.budgetMin ?? null,
        budgetMax: prefs?.budgetMax ?? null,
        firstTouchSource: firstVisitor?.firstUtmSource || null,
        evidenceIndicators,
      });
    }

    const sortBy = filter.sortBy || 'lastActiveAt';
    const sortOrder = filter.sortOrder || 'desc';
    const dir = sortOrder === 'asc' ? 1 : -1;

    directoryItems.sort((a, b) => {
      if (sortBy === 'createdAt') {
        return (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * dir;
      }
      if (sortBy === 'enquiryCount') {
        return (a.enquiryCount - b.enquiryCount) * dir;
      }
      if (sortBy === 'propertyViewCount') {
        return (a.propertyViewCount - b.propertyViewCount) * dir;
      }
      return (new Date(a.lastActiveAt).getTime() - new Date(b.lastActiveAt).getTime()) * dir;
    });

    const total = directoryItems.length;
    const offset = filter.offset || 0;
    const limit = filter.limit || 50;

    return {
      items: directoryItems.slice(offset, offset + limit),
      total,
    };
  }

  /**
   * Maps an EnquiryEntity to CustomerEnquirySummaryDto with role-aware message redaction
   */
  private mapEnquirySummary(
    enq: EnquiryEntity,
    associationType: 'VERIFIED_CUSTOMER_SESSION' | 'VERIFIED_VISITOR_LINEAGE' | 'PHONE_MATCH_CANDIDATE',
    associationReason: string,
    canViewPii = true
  ): CustomerEnquirySummaryDto {
    const referenceNumber =
      enq.metadata?.referenceNumber || `GH-ENQ-${enq.id.slice(-6).toUpperCase()}`;
    return {
      id: enq.id,
      referenceNumber,
      contextType: enq.contextType,
      propertyName: enq.projectName || enq.listingTitle || 'Great Homes Discovery',
      propertySlug: enq.projectSlug || enq.listingSlug || null,
      configuration: enq.configuration || null,
      priceDisplay: enq.priceDisplay || null,
      locationName: enq.locationName || null,
      status: enq.status,
      statusLabel: ENQUIRY_STATUS_LABELS[enq.status] || enq.status,
      priority: enq.priority,
      assignedTo: enq.assignedTo || null,
      assignedToName: enq.assignedToName || null,
      nextFollowUpAt: enq.nextFollowUpAt ? enq.nextFollowUpAt.toISOString() : null,
      requestSiteVisit: enq.requestSiteVisit,
      siteVisitId: enq.siteVisitId || null,
      message: canViewPii
        ? enq.message || null
        : enq.message
        ? '[Redacted — requires PII access]'
        : null,
      createdAt: enq.createdAt.toISOString(),
      associationType,
      associationReason,
    };
  }

  /**
   * Builds the full Customer 360 Profile + Unified Timeline + CRM Context
   */
  async getCustomer360(
    customerId: string,
    staff: StaffViewerContext,
    timelineCategory?: string
  ): Promise<Customer360ProfileDto | null> {
    const cust = await customerRepository.findById(customerId);
    if (!cust) return null;

    const [
      prefs,
      savedItems,
      watchedProjects,
      watchedLocations,
      recentlyViewed,
      linkedVisitors,
      custEvents,
      custSessions,
      allEnquiries,
      allVisits,
    ] = await Promise.all([
      customerService.getPreferences(customerId),
      customerService.listSavedItems(customerId),
      watchlistService.getProjectWatchlist(customerId),
      watchlistService.getLocationWatchlist(customerId),
      customerService.listRecentlyViewed(customerId, 25),
      visitorIntelligenceRepository.listVisitorsByCustomerId(customerId),
      visitorIntelligenceRepository.listEvents({ customerId, limit: 250 }),
      visitorIntelligenceRepository.listSessionsByCustomerId(customerId, 50),
      enquiryRepository.list({ limit: 500 }),
      siteVisitRepository.list({ limit: 500 }).catch((err: any) => {
        if (isMissingSiteVisitsRelationError(err)) return [];
        throw err;
      }),
    ]);

    const linkedVisitorById = new Map(linkedVisitors.map((v) => [v.id, v]));
    const custPhone10 = normalizePhone10(cust.phone);

    // Separate verified enquiries from unverified phone-matched historical enquiry candidates
    const verifiedEnquiries: CustomerEnquirySummaryDto[] = [];
    const phoneMatchedEnquiryCandidates: CustomerEnquirySummaryDto[] = [];

    for (const enq of allEnquiries.items) {
      if (enq.customerId === customerId || enq.metadata?.customerId === customerId) {
        verifiedEnquiries.push(
          this.mapEnquirySummary(
            enq,
            'VERIFIED_CUSTOMER_SESSION',
            'Submitted during an authenticated OTP customer session',
            staff.canViewPii
          )
        );
      } else if (!enq.customerId && enq.visitorId && linkedVisitorById.has(enq.visitorId)) {
        const linkedVis = linkedVisitorById.get(enq.visitorId)!;
        const withinPreAuthWindow =
          !linkedVis.linkedAt || enq.createdAt.getTime() <= linkedVis.linkedAt.getTime() + 5000;
        const phoneConsistent =
          !custPhone10 || !enq.buyerPhone || normalizePhone10(enq.buyerPhone) === custPhone10;

        if (withinPreAuthWindow && phoneConsistent) {
          verifiedEnquiries.push(
            this.mapEnquirySummary(
              enq,
              'VERIFIED_VISITOR_LINEAGE',
              `Submitted from linked first-party visitor cookie (${enq.visitorId.slice(0, 8)}…) prior to OTP linking`,
              staff.canViewPii
            )
          );
        } else if (custPhone10 && normalizePhone10(enq.buyerPhone) === custPhone10) {
          phoneMatchedEnquiryCandidates.push(
            this.mapEnquirySummary(
              enq,
              'PHONE_MATCH_CANDIDATE',
              'Phone-matched enquiry candidate (unauthenticated post-link session — isolated from verified account)',
              staff.canViewPii
            )
          );
        }
      } else if (custPhone10 && normalizePhone10(enq.buyerPhone) === custPhone10 && !enq.customerId) {
        phoneMatchedEnquiryCandidates.push(
          this.mapEnquirySummary(
            enq,
            'PHONE_MATCH_CANDIDATE',
            'Phone-matched historical enquiry candidate (unverified anonymous session — not exposed in self-service customer account)',
            staff.canViewPii
          )
        );
      }
    }

    const verifiedEnquiryIds = new Set(verifiedEnquiries.map((e) => e.id));
    const custVisitsRaw = allVisits.filter(
      (v) => v.customerId === customerId || verifiedEnquiryIds.has(v.enquiryId)
    );

    const siteVisits: CustomerSiteVisitSummaryDto[] = await Promise.all(
      custVisitsRaw.map(async (v) => {
        let projectName = 'Great Homes Property';
        if (v.projectId) {
          const resolved = await this.resolveEntityLabel('PROJECT', v.projectId);
          projectName = resolved.title;
        }
        return {
          id: v.id,
          enquiryId: v.enquiryId,
          projectId: v.projectId || null,
          projectName,
          visitType: v.visitType,
          status: v.status,
          preferredDate: v.preferredDate,
          preferredTimeWindow: v.preferredTimeWindow,
          confirmedDate:
            (v as any).confirmedDate ||
            (v.confirmedAt ? new Date(v.confirmedAt).toISOString().split('T')[0] : null),
          confirmedTimeWindow:
            (v as any).confirmedTimeWindow || (v.status === 'CONFIRMED' ? v.preferredTimeWindow : null),
          assignedStaffName: v.assignedToName || (v as any).assignedStaffName || null,
          createdAt: v.createdAt.toISOString(),
        };
      })
    );

    // Attribution summary
    const sortedVisitorsAsc = [...linkedVisitors].sort(
      (a, b) => a.firstSeenAt.getTime() - b.firstSeenAt.getTime()
    );
    const firstVisitor = sortedVisitorsAsc[0];
    const latestVisitor = sortedVisitorsAsc[sortedVisitorsAsc.length - 1];
    const latestSession = custSessions[0];

    const devicesUsed = Array.from(
      new Set(
        [
          ...linkedVisitors.map((v) => v.deviceClass),
          ...custSessions.map((s) => s.deviceClass),
        ].filter(Boolean)
      )
    );

    const attribution: AttributionSummaryDto = {
      firstTouch: {
        utmSource: firstVisitor?.firstUtmSource || null,
        utmMedium: firstVisitor?.firstUtmMedium || null,
        utmCampaign: firstVisitor?.firstUtmCampaign || null,
        referrerUrl: firstVisitor?.firstReferrerUrl || null,
        landingPath: firstVisitor?.firstLandingPath || null,
        firstSeenAt: (firstVisitor?.firstSeenAt || cust.createdAt).toISOString(),
      },
      latestTouch: {
        utmSource: latestSession?.utmSource || latestVisitor?.firstUtmSource || null,
        utmMedium: latestSession?.utmMedium || latestVisitor?.firstUtmMedium || null,
        utmCampaign: latestSession?.utmCampaign || latestVisitor?.firstUtmCampaign || null,
        referrerUrl: latestSession?.referrerUrl || latestVisitor?.firstReferrerUrl || null,
        landingPath: latestVisitor?.lastLandingPath || latestSession?.entryPath || null,
        lastSeenAt: (latestVisitor?.lastSeenAt || cust.updatedAt).toISOString(),
      },
      totalSessions: Math.max(
        custSessions.length,
        linkedVisitors.reduce((s, v) => s + v.sessionCount, 0)
      ),
      linkedVisitorIds: linkedVisitors.map((v) => v.id),
      devicesUsed,
    };

    // Observed behavioral signals & strict areaBasis separation
    const locationCounts = new Map<string, number>();
    const bhkCounts = new Map<string, number>();
    const propTypeCounts = new Map<string, number>();
    const areaBasisMap = new Map<
      AreaBasisType,
      { eventCount: number; minSqft: number | null; maxSqft: number | null }
    >();
    let observedMinPrice: number | null = null;
    let observedMaxPrice: number | null = null;

    for (const rv of recentlyViewed) {
      if (rv.resource.locationName) {
        locationCounts.set(
          rv.resource.locationName,
          (locationCounts.get(rv.resource.locationName) || 0) + rv.viewCount
        );
      }
    }

    for (const ev of custEvents) {
      const meta = ev.metadata || {};
      if (typeof meta.location === 'string' && meta.location.trim()) {
        locationCounts.set(meta.location, (locationCounts.get(meta.location) || 0) + 1);
      }
      if (typeof meta.locationName === 'string' && meta.locationName.trim()) {
        locationCounts.set(meta.locationName, (locationCounts.get(meta.locationName) || 0) + 1);
      }
      const bhkVal = meta.bhk || meta.bedroomCount || meta.configuration;
      if (bhkVal) {
        const label = typeof bhkVal === 'number' ? `${bhkVal} BHK` : String(bhkVal);
        bhkCounts.set(label, (bhkCounts.get(label) || 0) + 1);
      }
      if (typeof meta.propertyType === 'string' && meta.propertyType.trim()) {
        propTypeCounts.set(
          meta.propertyType,
          (propTypeCounts.get(meta.propertyType) || 0) + 1
        );
      }
      if (typeof meta.minPrice === 'number' && meta.minPrice > 0) {
        observedMinPrice =
          observedMinPrice === null ? meta.minPrice : Math.min(observedMinPrice, meta.minPrice);
      }
      if (typeof meta.maxPrice === 'number' && meta.maxPrice > 0) {
        observedMaxPrice =
          observedMaxPrice === null ? meta.maxPrice : Math.max(observedMaxPrice, meta.maxPrice);
      }
      if (typeof meta.price === 'number' && meta.price > 0) {
        observedMinPrice =
          observedMinPrice === null ? meta.price : Math.min(observedMinPrice, meta.price);
        observedMaxPrice =
          observedMaxPrice === null ? meta.price : Math.max(observedMaxPrice, meta.price);
      }

      // Preserve strict separation between CARPET, BUILT_UP, and SUPER_BUILT_UP
      const basis = ev.areaBasis || validateAreaBasis(meta.areaBasis);
      if (basis) {
        const curr = areaBasisMap.get(basis) || {
          eventCount: 0,
          minSqft: null,
          maxSqft: null,
        };
        curr.eventCount += 1;
        const sqft =
          typeof meta.areaSqft === 'number'
            ? meta.areaSqft
            : typeof meta.carpetArea === 'number' && basis === 'CARPET'
            ? meta.carpetArea
            : typeof meta.builtUpArea === 'number' && basis === 'BUILT_UP'
            ? meta.builtUpArea
            : typeof meta.superBuiltUpArea === 'number' && basis === 'SUPER_BUILT_UP'
            ? meta.superBuiltUpArea
            : null;
        if (sqft && sqft > 0) {
          curr.minSqft = curr.minSqft === null ? sqft : Math.min(curr.minSqft, sqft);
          curr.maxSqft = curr.maxSqft === null ? sqft : Math.max(curr.maxSqft, sqft);
        }
        areaBasisMap.set(basis, curr);
      }
    }

    const repeatedPropertyViews = recentlyViewed
      .filter((rv) => rv.viewCount >= 2)
      .map((rv) => ({
        entityType: rv.resourceType,
        entityId: rv.resourceId,
        title: rv.resource.title,
        slug: rv.resource.slug,
        viewCount: rv.viewCount,
        lastViewedAt: rv.lastViewedAt,
      }));

    const comparisonCount = custEvents.filter((e) =>
      ['COMPARE_ADDED', 'COMPARE_VIEWED'].includes(e.eventType)
    ).length;
    const searchCount = custEvents.filter((e) =>
      ['SEARCH_EXECUTED', 'FILTER_APPLIED'].includes(e.eventType)
    ).length;
    const propertyViewEventsCount = custEvents.filter((e) =>
      ['PROJECT_VIEW', 'RESALE_LISTING_VIEW', 'RENTAL_LISTING_VIEW'].includes(e.eventType)
    ).length;
    const totalPropertyViews = Math.max(
      propertyViewEventsCount,
      recentlyViewed.reduce((s, r) => s + r.viewCount, 0)
    );
    const startedUnsubmitEnquiryCount = custEvents.filter(
      (e) => e.eventType === 'ENQUIRY_MODAL_OPENED'
    ).length;

    const evidenceIndicators = this.buildEvidenceIndicators({
      hasOtpPhone: Boolean(cust.phone),
      enquiryCount: verifiedEnquiries.length,
      siteVisitCount: siteVisits.length,
      savedCount: savedItems.length,
      watchedLocationsCount: watchedLocations.length,
      watchedProjectsCount: watchedProjects.length,
      comparisonCount,
      repeatedViews: repeatedPropertyViews.map((r) => ({
        title: r.title,
        count: r.viewCount,
      })),
      sessionCount: attribution.totalSessions,
      startedUnsubmitEnquiryCount,
    });

    const intent: CustomerIntentSummaryDto = {
      explicitChoices: {
        preferredMode: prefs.preferredMode || 'ALL',
        preferredLocations: prefs.preferredLocations || [],
        preferredBhk: (prefs.preferredBhk || []).map((b: any) =>
          typeof b === 'number' ? `${b} BHK` : String(b)
        ),
        preferredPropertyTypes: prefs.preferredPropertyTypes || [],
        budgetMin: prefs.budgetMin,
        budgetMax: prefs.budgetMax,
        savedResourcesCount: savedItems.length,
        watchedLocations: watchedLocations.map((w) => w.locationName || w.locationId),
        watchedProjects: watchedProjects.map((w) => w.project?.title || w.projectId),
      },
      observedSignals: {
        mostViewedLocations: Array.from(locationCounts.entries())
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 5),
        mostSearchedBhk: Array.from(bhkCounts.entries())
          .map(([bhk, count]) => ({ bhk, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 5),
        mostViewedPropertyTypes: Array.from(propTypeCounts.entries())
          .map(([propertyType, count]) => ({ propertyType, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 5),
        observedPriceRange: {
          minPrice: observedMinPrice,
          maxPrice: observedMaxPrice,
        },
        areaBasisBreakdown: Array.from(areaBasisMap.entries()).map(([areaBasis, stats]) => ({
          areaBasis,
          eventCount: stats.eventCount,
          minSqft: stats.minSqft,
          maxSqft: stats.maxSqft,
        })),
        comparisonCount,
        repeatedPropertyViews,
      },
      evidenceIndicators,
    };

    // Build unified chronological timeline
    const timeline = await this.buildUnifiedCustomerTimeline({
      events: custEvents,
      savedItems,
      watchedProjects,
      watchedLocations,
      verifiedEnquiries,
      siteVisits,
      categoryFilter: timelineCategory,
      canViewPii: staff.canViewPii,
    });

    let lastActiveMs = cust.updatedAt.getTime();
    if (timeline.length > 0) {
      const topTime = new Date(timeline[0].occurredAt).getTime();
      if (topTime > lastActiveMs) lastActiveMs = topTime;
    }

    return {
      customer: {
        id: cust.id,
        name: staff.canViewPii ? cust.name : maskCustomerName(cust.name),
        phone: staff.canViewPii ? cust.phone || null : maskPhoneNumber(cust.phone),
        email: (staff.canViewPii ? cust.email : maskEmailAddress(cust.email)) || '•••@•••',
        phoneMasked: maskPhoneNumber(cust.phone),
        emailMasked: maskEmailAddress(cust.email),
        piiRedacted: !staff.canViewPii,
        status: cust.status,
        createdAt: cust.createdAt.toISOString(),
        lastActiveAt: new Date(lastActiveMs).toISOString(),
      },
      summaryCounts: {
        sessions: attribution.totalSessions,
        propertyViews: totalPropertyViews,
        searchesAndFilters: searchCount,
        comparisons: comparisonCount,
        savedItems: savedItems.length,
        watchedProjects: watchedProjects.length,
        watchedLocations: watchedLocations.length,
        verifiedEnquiries: verifiedEnquiries.length,
        phoneMatchedEnquiryCandidates: phoneMatchedEnquiryCandidates.length,
        siteVisits: siteVisits.length,
      },
      attribution,
      intent,
      preferences: prefs,
      savedItems,
      watchedProjects,
      watchedLocations,
      recentlyViewed,
      verifiedEnquiries,
      phoneMatchedEnquiryCandidates,
      siteVisits,
      linkedVisitors: linkedVisitors.map((v) => ({
        ...v,
        firstSeenAt: v.firstSeenAt.toISOString(),
        lastSeenAt: v.lastSeenAt.toISOString(),
        linkedAt: v.linkedAt ? v.linkedAt.toISOString() : null,
      })),
      sessions: custSessions.map((s) => ({
        ...s,
        startedAt: s.startedAt.toISOString(),
        lastActivityAt: s.lastActivityAt.toISOString(),
      })),
      timeline,
    };
  }

  /**
   * Composes events, saved items, watches, enquiries, and site visits into a single chronological timeline
   */
  private async buildUnifiedCustomerTimeline(params: {
    events: VisitorEventEntity[];
    savedItems: any[];
    watchedProjects: any[];
    watchedLocations: any[];
    verifiedEnquiries: CustomerEnquirySummaryDto[];
    siteVisits: CustomerSiteVisitSummaryDto[];
    categoryFilter?: string;
    canViewPii: boolean;
  }): Promise<CustomerTimelineItemDto[]> {
    const items: CustomerTimelineItemDto[] = [];

    for (const ev of params.events) {
      const mapped = await this.mapEventToTimelineItem(ev, params.canViewPii);
      items.push(mapped);
    }

    for (const enq of params.verifiedEnquiries) {
      items.push({
        id: `tl-enq-${enq.id}`,
        occurredAt: enq.createdAt,
        category: 'ENQUIRIES_VISITS',
        eventType: 'ENQUIRY_SUBMITTED',
        title: `Submitted ${enq.contextType} Enquiry (${enq.referenceNumber})`,
        subtitle: `${enq.propertyName}${enq.configuration ? ` • ${enq.configuration}` : ''}${enq.priceDisplay ? ` • ${enq.priceDisplay}` : ''}`,
        entityType: enq.contextType === 'PROJECT' ? 'PROJECT' : 'ENQUIRY',
        entityId: enq.id,
        entitySlug: enq.propertySlug,
        areaBasis: null,
        visitorId: null,
        sessionId: null,
        isPreAuthAnonymous: enq.associationType === 'VERIFIED_VISITOR_LINEAGE',
        metadata: {
          status: enq.statusLabel,
          associationReason: enq.associationReason,
        },
      });
    }

    for (const sv of params.siteVisits) {
      items.push({
        id: `tl-sv-${sv.id}`,
        occurredAt: sv.createdAt,
        category: 'ENQUIRIES_VISITS',
        eventType: 'SITE_VISIT_REQUESTED',
        title: `Site Visit (${sv.visitType.replace('_', ' ')}) — ${sv.projectName}`,
        subtitle: `Preferred: ${sv.preferredDate} (${sv.preferredTimeWindow}) • Status: ${sv.status}`,
        entityType: 'SITE_VISIT',
        entityId: sv.id,
        entitySlug: null,
        areaBasis: null,
        visitorId: null,
        sessionId: null,
        isPreAuthAnonymous: false,
        metadata: {
          enquiryId: sv.enquiryId,
          status: sv.status,
        },
      });
    }

    items.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());

    if (
      params.categoryFilter &&
      params.categoryFilter !== 'ALL'
    ) {
      return items.filter((item) => item.category === params.categoryFilter);
    }

    return items;
  }

  private async mapEventToTimelineItem(
    ev: VisitorEventEntity,
    canViewPii = true
  ): Promise<CustomerTimelineItemDto> {
    let category: CustomerTimelineItemDto['category'] = 'PROPERTY_VIEWS';
    let title = ev.eventType.replace(/_/g, ' ');
    let subtitle = ev.pagePath || null;

    const safeMeta = redactMetadataForRole(ev.metadata, canViewPii);

    const resolved = ev.entityId
      ? await this.resolveEntityLabel(ev.entityType, ev.entityId, ev.entitySlug)
      : { title: ev.entitySlug || '', slug: ev.entitySlug || null };

    switch (ev.eventType) {
      case 'PROJECT_VIEW':
        category = 'PROPERTY_VIEWS';
        title = `Viewed Project: ${resolved.title || ev.pageTitle || ev.pagePath}`;
        subtitle = [
          resolved.locationName ? `In ${resolved.locationName}` : null,
          ev.areaBasis ? `Area Basis: ${ev.areaBasis.replace(/_/g, ' ')}` : null,
          ev.durationSeconds ? `${ev.durationSeconds}s dwell time` : null,
        ]
          .filter(Boolean)
          .join(' • ');
        break;
      case 'RESALE_LISTING_VIEW':
        category = 'PROPERTY_VIEWS';
        title = `Viewed Resale Listing: ${resolved.title || ev.pageTitle || ev.pagePath}`;
        subtitle = ev.areaBasis ? `Area Basis: ${ev.areaBasis.replace(/_/g, ' ')}` : ev.pagePath;
        break;
      case 'RENTAL_LISTING_VIEW':
        category = 'PROPERTY_VIEWS';
        title = `Viewed Rental Listing: ${resolved.title || ev.pageTitle || ev.pagePath}`;
        subtitle = ev.pagePath;
        break;
      case 'LOCATION_VIEW':
        category = 'PROPERTY_VIEWS';
        title = `Explored Micro-Market: ${resolved.title || ev.pageTitle || ev.pagePath}`;
        subtitle = ev.pagePath;
        break;
      case 'DEVELOPER_VIEW':
        category = 'PROPERTY_VIEWS';
        title = `Viewed Developer Profile: ${ev.pageTitle || ev.entitySlug || ev.pagePath}`;
        subtitle = ev.pagePath;
        break;
      case 'PAGE_VIEW':
        category = 'PROPERTY_VIEWS';
        title = `Visited Page: ${ev.pageTitle || ev.pagePath}`;
        subtitle = ev.pagePath;
        break;
      case 'SEARCH_EXECUTED':
      case 'FILTER_APPLIED': {
        category = 'SEARCH_FILTERS';
        title = ev.eventType === 'SEARCH_EXECUTED' ? 'Executed Property Search' : 'Applied Discovery Filters';
        const parts: string[] = [];
        if (safeMeta?.query) parts.push(`Query: "${safeMeta.query}"`);
        if (safeMeta?.location) parts.push(`Locality: ${safeMeta.location}`);
        if (safeMeta?.bhk) parts.push(`BHK: ${safeMeta.bhk}`);
        if (safeMeta?.propertyType) parts.push(`Type: ${safeMeta.propertyType}`);
        if (ev.areaBasis) parts.push(`Area Basis: ${ev.areaBasis}`);
        subtitle = parts.join(' • ') || ev.pagePath;
        break;
      }
      case 'ITEM_SAVED':
      case 'ITEM_UNSAVED':
        category = 'SHORTLIST_COMPARE';
        title = `${ev.eventType === 'ITEM_SAVED' ? 'Saved' : 'Removed'} Property: ${resolved.title}`;
        break;
      case 'PROJECT_WATCHED':
      case 'PROJECT_UNWATCHED':
        category = 'SHORTLIST_COMPARE';
        title = `${ev.eventType === 'PROJECT_WATCHED' ? 'Started Watching' : 'Unwatched'} Project: ${resolved.title}`;
        break;
      case 'LOCATION_WATCHED':
      case 'LOCATION_UNWATCHED':
        category = 'SHORTLIST_COMPARE';
        title = `${ev.eventType === 'LOCATION_WATCHED' ? 'Started Watching' : 'Unwatched'} Micro-Market: ${resolved.title}`;
        break;
      case 'COMPARE_ADDED':
      case 'COMPARE_REMOVED':
      case 'COMPARE_VIEWED':
        category = 'SHORTLIST_COMPARE';
        title =
          ev.eventType === 'COMPARE_VIEWED'
            ? 'Opened Side-by-Side Property Comparison'
            : `${ev.eventType === 'COMPARE_ADDED' ? 'Added to' : 'Removed from'} Comparison: ${resolved.title}`;
        break;
      case 'ENQUIRY_MODAL_OPENED':
      case 'ENQUIRY_STEP_COMPLETED':
      case 'ENQUIRY_SUBMITTED':
      case 'SITE_VISIT_REQUESTED':
        category = 'ENQUIRIES_VISITS';
        title =
          ev.eventType === 'ENQUIRY_MODAL_OPENED'
            ? `Opened Enquiry Dialog${resolved.title ? ` for ${resolved.title}` : ''}`
            : ev.eventType === 'ENQUIRY_STEP_COMPLETED'
            ? `Completed Enquiry Form Step${safeMeta?.step ? ` (${safeMeta.step})` : ''}`
            : ev.eventType === 'SITE_VISIT_REQUESTED'
            ? `Requested Site Visit${resolved.title ? `: ${resolved.title}` : ''}`
            : `Submitted Enquiry${resolved.title ? `: ${resolved.title}` : ''}`;
        break;
      case 'OTP_REQUESTED':
      case 'OTP_VERIFIED':
      case 'PROFILE_COMPLETED':
      case 'PREFERENCES_UPDATED':
        category = 'AUTH_SESSION';
        title =
          ev.eventType === 'OTP_VERIFIED'
            ? 'Verified Mobile Number via OTP'
            : ev.eventType === 'PROFILE_COMPLETED'
            ? 'Completed Customer Account Profile'
            : ev.eventType === 'PREFERENCES_UPDATED'
            ? 'Updated Property Discovery Preferences'
            : 'Requested Mobile OTP Code';
        break;
    }

    return {
      id: ev.id,
      occurredAt: ev.occurredAt.toISOString(),
      category,
      eventType: ev.eventType,
      title,
      subtitle,
      entityType: ev.entityType,
      entityId: ev.entityId,
      entitySlug: ev.entitySlug || resolved.slug,
      areaBasis: ev.areaBasis,
      visitorId: ev.visitorId,
      sessionId: ev.sessionId,
      isPreAuthAnonymous: Boolean(ev.metadata?.backfilledFromAnonymous),
      metadata: safeMeta,
    };
  }

  /**
   * Lists anonymous or linked visitors for the Visitor Analytics tab
   */
  async listVisitors(params?: {
    onlyAnonymous?: boolean;
    limit?: number;
    offset?: number;
  }) {
    const res = await visitorIntelligenceRepository.listVisitors(params);
    return {
      total: res.total,
      items: res.items.map((v) => ({
        ...v,
        firstSeenAt: v.firstSeenAt.toISOString(),
        lastSeenAt: v.lastSeenAt.toISOString(),
        linkedAt: v.linkedAt ? v.linkedAt.toISOString() : null,
      })),
    };
  }

  /**
   * Retrieves a single anonymous/linked visitor's sessions, events, and linked enquiries
   */
  async getVisitorDetail(
    visitorId: string,
    staff: StaffViewerContext
  ): Promise<VisitorDetailDto | null> {
    const visitor = await visitorIntelligenceRepository.findVisitorById(visitorId);
    if (!visitor) return null;

    const [sessions, events, enquiriesRes] = await Promise.all([
      visitorIntelligenceRepository.listSessionsByVisitorId(visitorId, 50),
      visitorIntelligenceRepository.listEvents({ visitorId, limit: 200 }),
      enquiryRepository.list({ visitorId, limit: 50 }),
    ]);

    let linkedCustomer: VisitorDetailDto['linkedCustomer'] = null;
    if (visitor.customerId) {
      const cust = await customerRepository.findById(visitor.customerId);
      if (cust) {
        linkedCustomer = {
          id: cust.id,
          name: staff.canViewPii ? cust.name : maskCustomerName(cust.name),
          phoneMasked: staff.canViewPii ? cust.phone || null : maskPhoneNumber(cust.phone),
        };
      }
    }

    const enquiries = enquiriesRes.items.map((e) =>
      this.mapEnquirySummary(
        e,
        'VERIFIED_VISITOR_LINEAGE',
        'Submitted from this first-party visitor cookie',
        staff.canViewPii
      )
    );

    return {
      visitor: {
        ...visitor,
        firstSeenAt: visitor.firstSeenAt.toISOString(),
        lastSeenAt: visitor.lastSeenAt.toISOString(),
        linkedAt: visitor.linkedAt ? visitor.linkedAt.toISOString() : null,
      },
      linkedCustomer,
      sessions: sessions.map((s) => ({
        ...s,
        startedAt: s.startedAt.toISOString(),
        lastActivityAt: s.lastActivityAt.toISOString(),
      })),
      events: events.map((ev) => ({
        ...ev,
        metadata: redactMetadataForRole(ev.metadata, staff.canViewPii),
        occurredAt: ev.occurredAt.toISOString(),
      })),
      enquiries,
    };
  }
}

export const customerIntelligenceService = new CustomerIntelligenceService();
