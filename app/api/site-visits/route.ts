import { NextRequest, NextResponse } from 'next/server';
import { siteVisitService } from '@/src/domain/siteVisit/services/siteVisitService';
import { isSiteVisitEnquiryNotFoundError } from '@/src/infrastructure/repositories/postgres/siteVisitRepositoryPostgres';
import { enquiryRepository } from '@/src/domain/enquiry/repositories/enquiryRepository';
import {
  verifyContinuationToken,
  type StoredContinuationRecord,
} from '@/src/domain/enquiry/services/enquiryContinuationToken';
import { verifyCustomerAuth } from '@/src/domain/customer/customerAuth';
import { verifyInternalStaff } from '@/src/domain/auth/authorizationBoundary';
import { hasCapability } from '@/src/domain/auth/capabilityModel';
import { isPersistenceUnavailableError } from '@/src/lib/persistenceGuard';
import {
  checkRateLimit,
  createRateLimitResponse,
  createRateLimitUnavailableResponse,
  isRateLimitUnavailableError,
} from '@/src/lib/rateLimit';
import { extractRequestContext, withCorrelationHeaders } from '@/src/lib/requestContext';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store, max-age=0' };
const ALLOWED_VISIT_TYPES = new Set(['IN_PERSON', 'VIRTUAL']);
const TERMINAL_ENQUIRY_STATUSES = new Set(['CLOSED', 'LOST', 'CONVERTED']);
const MAX_BUYER_NOTE_LENGTH = 1000;
const DATE_YYYY_MM_DD_RE = /^\d{4}-\d{2}-\d{2}$/;

function jsonNoStore(body: unknown, status: number, requestId: string) {
  const response = NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
  return withCorrelationHeaders(response, requestId);
}

function hasStaffCredentialCandidate(req: NextRequest): boolean {
  if (req.headers.get('x-staff-test-token')) return true;
  const cookie = req.headers.get('cookie') || '';
  return cookie.includes('gh_staff_session=');
}

function extractContinuationToken(req: NextRequest): string | null {
  const headerToken = req.headers.get('x-enquiry-token')?.trim();
  if (headerToken) return headerToken;

  // Allow Authorization: Bearer only when no staff session cookie/test token is present
  if (!hasStaffCredentialCandidate(req)) {
    const authHeader = req.headers.get('authorization')?.trim();
    if (authHeader && /^Bearer\s+/i.test(authHeader)) {
      const bearer = authHeader.replace(/^Bearer\s+/i, '').trim();
      if (bearer) return bearer;
    }
  }

  return null;
}

function isValidPreferredDate(value: string): boolean {
  if (!DATE_YYYY_MM_DD_RE.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return false;
  }
  // Allow 1 day timezone tolerance behind UTC so local IST same-day requests are accepted
  const minAllowedMs = Date.now() - 24 * 60 * 60 * 1000;
  const maxAllowedMs = Date.now() + 366 * 24 * 60 * 60 * 1000;
  return parsed.getTime() >= minAllowedMs && parsed.getTime() <= maxAllowedMs;
}

export async function POST(req: NextRequest) {
  const { requestId, ipAddress } = extractRequestContext(req);

  const rateLimitKey = `site_visit_post_${ipAddress || 'anonymous'}`;
  try {
    const rateLimitResult = await checkRateLimit(rateLimitKey, 30, 60000);
    if (!rateLimitResult.allowed) {
      return createRateLimitResponse(requestId, rateLimitResult);
    }
  } catch (err) {
    if (isRateLimitUnavailableError(err)) {
      return createRateLimitUnavailableResponse(requestId);
    }
    throw err;
  }

  try {
    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      return jsonNoStore(
        { success: false, code: 'INVALID_JSON', message: 'Invalid JSON request payload.' },
        400,
        requestId
      );
    }

    if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
      return jsonNoStore(
        { success: false, code: 'INVALID_BODY', message: 'Request body must be a JSON object.' },
        400,
        requestId
      );
    }

    const body = rawBody as Record<string, unknown>;
    const enquiryId = typeof body.enquiryId === 'string' ? body.enquiryId.trim() : '';

    if (!enquiryId || enquiryId.length > 128) {
      return jsonNoStore(
        { success: false, code: 'VALIDATION_ERROR', message: 'A valid enquiry ID is required to schedule a site visit.' },
        400,
        requestId
      );
    }

    // Per-target enquiry rate limit to prevent brute force / flooding
    try {
      const targetRate = await checkRateLimit(`site_visit_target_${enquiryId}`, 15, 60000);
      if (!targetRate.allowed) {
        return createRateLimitResponse(requestId, targetRate);
      }
    } catch (err) {
      if (isRateLimitUnavailableError(err)) {
        return createRateLimitUnavailableResponse(requestId);
      }
      throw err;
    }

    const preferredDate = typeof body.preferredDate === 'string' ? body.preferredDate.trim() : '';
    const preferredTimeWindow =
      typeof body.preferredTimeWindow === 'string' ? body.preferredTimeWindow.trim() : '';

    if (!preferredDate || !preferredTimeWindow) {
      return jsonNoStore(
        {
          success: false,
          code: 'VALIDATION_ERROR',
          message: 'Preferred date and time window are required for a site visit.',
        },
        400,
        requestId
      );
    }

    if (!isValidPreferredDate(preferredDate)) {
      return jsonNoStore(
        {
          success: false,
          code: 'VALIDATION_ERROR',
          message: 'Preferred date must be a valid upcoming date in YYYY-MM-DD format.',
        },
        400,
        requestId
      );
    }

    if (preferredTimeWindow.length > 80) {
      return jsonNoStore(
        {
          success: false,
          code: 'VALIDATION_ERROR',
          message: 'Preferred time window is too long.',
        },
        400,
        requestId
      );
    }

    const rawVisitType =
      body.visitType === undefined || body.visitType === null
        ? 'IN_PERSON'
        : typeof body.visitType === 'string'
          ? body.visitType.trim().toUpperCase()
          : '';
    if (!ALLOWED_VISIT_TYPES.has(rawVisitType)) {
      return jsonNoStore(
        {
          success: false,
          code: 'VALIDATION_ERROR',
          message: 'Visit type must be IN_PERSON or VIRTUAL.',
        },
        400,
        requestId
      );
    }

    const rawNote = body.buyerNote ?? body.message ?? null;
    let buyerNote: string | null = null;
    if (rawNote !== null && rawNote !== undefined) {
      if (typeof rawNote !== 'string') {
        return jsonNoStore(
          { success: false, code: 'VALIDATION_ERROR', message: 'Buyer note must be text.' },
          400,
          requestId
        );
      }
      const cleanedNote = rawNote.replace(/\u0000/g, '').trim();
      if (cleanedNote.length > MAX_BUYER_NOTE_LENGTH) {
        return jsonNoStore(
          {
            success: false,
            code: 'VALIDATION_ERROR',
            message: `Buyer note must be ${MAX_BUYER_NOTE_LENGTH} characters or fewer.`,
          },
          400,
          requestId
        );
      }
      buyerNote = cleanedNote || null;
    }

    const rawIdempotencyKey =
      (typeof body.idempotencyKey === 'string' ? body.idempotencyKey.trim() : '') ||
      req.headers.get('x-idempotency-key')?.trim() ||
      null;
    if (rawIdempotencyKey && rawIdempotencyKey.length > 128) {
      return jsonNoStore(
        { success: false, code: 'VALIDATION_ERROR', message: 'Invalid idempotency key.' },
        400,
        requestId
      );
    }

    // -------------------------------------------------------------------------
    // Authentication & Ownership / Authorization Boundary
    // Allowed callers:
    //   1. Authenticated internal staff with 'enquiry.manageSiteVisit' capability
    //   2. Verified customer session owning the parent enquiry
    //   3. Valid enquiry continuation token matching the parent enquiry
    // -------------------------------------------------------------------------
    let isAuthorizedStaff = false;
    if (hasStaffCredentialCandidate(req)) {
      const staffAuth = await verifyInternalStaff(req);
      if (staffAuth.authorized && staffAuth.role) {
        if (!hasCapability(staffAuth.role, 'enquiry.manageSiteVisit')) {
          return jsonNoStore(
            {
              success: false,
              code: 'FORBIDDEN',
              message: `Forbidden: role '${staffAuth.role}' does not have capability 'enquiry.manageSiteVisit'.`,
            },
            403,
            requestId
          );
        }
        isAuthorizedStaff = true;
      } else if (staffAuth.statusCode === 503) {
        return jsonNoStore(
          { success: false, code: 'AUTH_UNAVAILABLE', message: 'Authentication is temporarily unavailable.' },
          503,
          requestId
        );
      }
    }

    let verifiedCustomerId: string | null = null;
    if (!isAuthorizedStaff) {
      try {
        const customerAuth = await verifyCustomerAuth(req);
        if (customerAuth.authorized && customerAuth.customerId) {
          verifiedCustomerId = customerAuth.customerId;
        }
      } catch {
        // Customer auth absent or invalid; continuation token may still authorize anonymous enquiry
      }
    }

    const continuationToken = !isAuthorizedStaff ? extractContinuationToken(req) : null;

    if (!isAuthorizedStaff && !verifiedCustomerId && !continuationToken) {
      return jsonNoStore(
        {
          success: false,
          code: 'UNAUTHORIZED',
          message: 'Authentication or a valid enquiry session token is required to schedule a site visit.',
        },
        401,
        requestId
      );
    }

    const parentEnquiry = await enquiryRepository.findById(enquiryId);
    if (!parentEnquiry) {
      if (isAuthorizedStaff) {
        return jsonNoStore(
          { success: false, code: 'ENQUIRY_NOT_FOUND', message: 'Enquiry not found.' },
          404,
          requestId
        );
      }
      // Uniform 403 prevents enquiry ID enumeration by non-staff callers
      return jsonNoStore(
        {
          success: false,
          code: 'FORBIDDEN',
          message: 'You are not authorized to schedule a site visit for this enquiry.',
        },
        403,
        requestId
      );
    }

    if (!isAuthorizedStaff) {
      // Cross-customer session mismatch is always blocked
      if (
        parentEnquiry.customerId &&
        verifiedCustomerId &&
        parentEnquiry.customerId !== verifiedCustomerId
      ) {
        return jsonNoStore(
          {
            success: false,
            code: 'FORBIDDEN',
            message: 'You are not authorized to schedule a site visit for this enquiry.',
          },
          403,
          requestId
        );
      }

      const ownsByCustomerSession =
        Boolean(parentEnquiry.customerId) &&
        Boolean(verifiedCustomerId) &&
        parentEnquiry.customerId === verifiedCustomerId;

      if (!ownsByCustomerSession) {
        // Require valid continuation token (covers anonymous enquiries or token-authorized continuation)
        const storedRecord = (
          parentEnquiry.metadata as Record<string, unknown> | null | undefined
        )?._continuation as StoredContinuationRecord | undefined;
        const tokenCheck = verifyContinuationToken(continuationToken, storedRecord);
        if (!tokenCheck.valid) {
          if ('reason' in tokenCheck && tokenCheck.reason === 'EXPIRED') {
            return jsonNoStore(
              {
                success: false,
                code: 'CONTINUATION_TOKEN_EXPIRED',
                message: 'Your enquiry session has expired. Please sign in or submit a new request.',
              },
              401,
              requestId
            );
          }
          return jsonNoStore(
            {
              success: false,
              code: 'FORBIDDEN',
              message: 'You are not authorized to schedule a site visit for this enquiry.',
            },
            403,
            requestId
          );
        }
      }
    }

    // Reject client attempts to spoof a different customerId
    if (
      body.customerId !== undefined &&
      body.customerId !== null &&
      String(body.customerId).trim() !== '' &&
      String(body.customerId).trim() !== (parentEnquiry.customerId || '')
    ) {
      return jsonNoStore(
        {
          success: false,
          code: 'FORBIDDEN',
          message: 'Customer attribution cannot be overridden by the request payload.',
        },
        403,
        requestId
      );
    }

    // Reject scheduling against closed/terminal enquiries
    if (TERMINAL_ENQUIRY_STATUSES.has(String(parentEnquiry.status || '').toUpperCase())) {
      return jsonNoStore(
        {
          success: false,
          code: 'ENQUIRY_STATE_LOCKED',
          message: 'This enquiry is closed and can no longer accept new site visit requests.',
        },
        409,
        requestId
      );
    }

    // Always derive attribution strictly from the verified server-side parent enquiry
    const { siteVisit: visit, created } = await siteVisitService.createSiteVisitWithMeta(
      parentEnquiry.id,
      {
        customerId: parentEnquiry.customerId || null,
        projectId: parentEnquiry.projectId || null,
        configurationId: parentEnquiry.configurationId || null,
        listingId: parentEnquiry.listingId || null,
        visitType: rawVisitType as 'IN_PERSON' | 'VIRTUAL',
        preferredDate,
        preferredTimeWindow,
        buyerNote,
        idempotencyKey: rawIdempotencyKey,
      },
      req
    );

    const dto = await siteVisitService.mapToCustomerDto(visit);

    return jsonNoStore(
      {
        success: true,
        deduplicated: !created,
        message: 'Your site visit request has been received by Great Homes.',
        siteVisit: dto,
      },
      created ? 201 : 200,
      requestId
    );
  } catch (error: any) {
    if (isRateLimitUnavailableError(error)) {
      return createRateLimitUnavailableResponse(requestId);
    }
    if (isSiteVisitEnquiryNotFoundError(error)) {
      return jsonNoStore(
        { success: false, code: 'ENQUIRY_NOT_FOUND', message: 'Enquiry not found.' },
        404,
        requestId
      );
    }
    if (isPersistenceUnavailableError(error)) {
      return jsonNoStore(
        {
          success: false,
          code: 'PERSISTENCE_UNAVAILABLE',
          message: 'Site visit service is temporarily unavailable. Please try again shortly.',
        },
        503,
        requestId
      );
    }
    console.error('[SiteVisit POST] Unexpected error:', error?.message || 'Unknown error');
    return jsonNoStore(
      { success: false, code: 'INTERNAL_ERROR', message: 'Failed to create site visit request.' },
      500,
      requestId
    );
  }
}


