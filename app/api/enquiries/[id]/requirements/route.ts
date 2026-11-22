import { NextRequest, NextResponse } from 'next/server';
import { ensureSeedData } from '@/src/infrastructure/seed';
import {
  enquiryService,
  EnquiryContinuationAuthError,
  EnquiryNotFoundError,
  EnquiryValidationError,
} from '@/src/domain/enquiry/services/enquiryService';
import type { UpdateEnquiryRequirementsRequestDto } from '@/src/domain/enquiry/dto/enquiryDto';
import { verifyCustomerAuth } from '@/src/domain/customer/customerAuth';
import { customerIntelligenceService } from '@/src/domain/visitorIntelligence/services/customerIntelligenceService';
import { extractCookiesFromRequest, isOptedOutRequest } from '@/src/domain/visitorIntelligence/validation';
import { extractRequestContext, withCorrelationHeaders } from '@/src/lib/requestContext';
import { isPersistenceUnavailableError } from '@/src/lib/persistenceGuard';
import {
  checkRateLimit,
  createRateLimitResponse,
  createRateLimitUnavailableResponse,
  isRateLimitUnavailableError,
} from '@/src/lib/rateLimit';

const ALLOWED_REQUIREMENTS_KEYS = new Set<string>([
  'preferredBhk',
  'propertyType',
  'budgetRange',
  'purchaseTimeline',
  'purchasePurpose',
  'siteVisitInterest',
  'additionalRequirements',
  'skipped',
]);

function extractContinuationToken(req: NextRequest): string | null {
  const headerToken = req.headers.get('x-enquiry-token')?.trim();
  if (headerToken) return headerToken;

  const authHeader = req.headers.get('authorization')?.trim();
  if (authHeader && /^Bearer\s+/i.test(authHeader)) {
    const bearer = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (bearer) return bearer;
  }

  return null;
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { requestId, ipAddress } = extractRequestContext(req);
  const { id } = await context.params;
  const enquiryId = typeof id === 'string' ? id.trim() : '';

  if (!enquiryId || enquiryId.length > 128) {
    const response = NextResponse.json(
      { success: false, code: 'INVALID_ENQUIRY_ID', message: 'Invalid enquiry identifier.' },
      { status: 400 }
    );
    response.headers.set('Cache-Control', 'no-store');
    return withCorrelationHeaders(response, requestId);
  }

  // Dual fail-closed rate limiting: per-IP + per-target-enquiry brute-force protection
  try {
    const ipRate = await checkRateLimit(`enquiry_req_patch_${ipAddress || 'anonymous'}`, 60, 60000);
    if (!ipRate.allowed) {
      return createRateLimitResponse(requestId, ipRate);
    }

    const targetRate = await checkRateLimit(`enquiry_req_target_${enquiryId}`, 20, 60000);
    if (!targetRate.allowed) {
      return createRateLimitResponse(requestId, targetRate);
    }
  } catch (err) {
    if (isRateLimitUnavailableError(err)) {
      return createRateLimitUnavailableResponse(requestId);
    }
    throw err;
  }

  try {
    await ensureSeedData();

    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      const response = NextResponse.json(
        { success: false, code: 'INVALID_JSON', message: 'Invalid JSON request payload.' },
        { status: 400 }
      );
      response.headers.set('Cache-Control', 'no-store');
      return withCorrelationHeaders(response, requestId);
    }

    if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
      const response = NextResponse.json(
        { success: false, code: 'INVALID_BODY', message: 'Request body must be a JSON object.' },
        { status: 400 }
      );
      response.headers.set('Cache-Control', 'no-store');
      return withCorrelationHeaders(response, requestId);
    }

    const bodyRecord = rawBody as Record<string, unknown>;
    const forbiddenFields = Object.keys(bodyRecord).filter(
      (key) => !ALLOWED_REQUIREMENTS_KEYS.has(key)
    );
    if (forbiddenFields.length > 0) {
      const response = NextResponse.json(
        {
          success: false,
          code: 'FORBIDDEN_FIELDS',
          message: 'One or more fields cannot be updated through this endpoint.',
        },
        { status: 400 }
      );
      response.headers.set('Cache-Control', 'no-store');
      return withCorrelationHeaders(response, requestId);
    }

    const continuationToken = extractContinuationToken(req);

    // Optional verified customer session for actor consistency verification
    let verifiedCustomerId: string | null = null;
    try {
      const auth = await verifyCustomerAuth(req);
      if (auth.authorized && auth.customerId) {
        verifiedCustomerId = auth.customerId;
      }
    } catch {
      // Unauthenticated buyer continuation is allowed with a valid continuation token
    }

    const allowlistedDto: UpdateEnquiryRequirementsRequestDto = {
      preferredBhk: bodyRecord.preferredBhk as string | null | undefined,
      propertyType: bodyRecord.propertyType as string | null | undefined,
      budgetRange: bodyRecord.budgetRange as string | null | undefined,
      purchaseTimeline: bodyRecord.purchaseTimeline as string | null | undefined,
      purchasePurpose: bodyRecord.purchasePurpose as string | null | undefined,
      siteVisitInterest: bodyRecord.siteVisitInterest as boolean | undefined,
      additionalRequirements: bodyRecord.additionalRequirements as string | null | undefined,
      skipped: bodyRecord.skipped as boolean | undefined,
    };

    const result = await enquiryService.updateBuyerRequirements(
      enquiryId,
      continuationToken,
      allowlistedDto,
      { authenticatedCustomerId: verifiedCustomerId }
    );

    // Non-blocking privacy-safe telemetry (zero tokens or PII)
    const optedOut = isOptedOutRequest(req);
    if (!optedOut) {
      try {
        const cookies = extractCookiesFromRequest(req);
        await customerIntelligenceService.ingestEvent(
          req,
          {
            visitorId: cookies.visitorId,
            sessionId: cookies.sessionId,
            eventType: 'ENQUIRY_STEP_COMPLETED',
            pagePath: '/projects',
            entityType: 'ENQUIRY',
            entityId: result.enquiryId,
            metadata: {
              step: 2,
              flowMode: 'LEAD_FIRST_PROJECT',
              action: allowlistedDto.skipped ? 'SKIPPED' : 'SUBMITTED',
              requirementsStatus: result.requirementsStatus,
              providedCount: result.providedCount,
            },
          },
          verifiedCustomerId,
          ipAddress
        );
      } catch {
        // Non-blocking telemetry
      }
    }

    const response = NextResponse.json(result, { status: 200 });
    response.headers.set('Cache-Control', 'no-store');
    return withCorrelationHeaders(response, requestId);
  } catch (error: any) {
    if (error instanceof EnquiryContinuationAuthError) {
      const response = NextResponse.json(
        { success: false, code: error.code, message: error.message },
        { status: error.statusCode }
      );
      response.headers.set('Cache-Control', 'no-store');
      return withCorrelationHeaders(response, requestId);
    }
    if (error instanceof EnquiryValidationError) {
      const response = NextResponse.json(
        { success: false, code: 'VALIDATION_ERROR', message: error.message },
        { status: 400 }
      );
      response.headers.set('Cache-Control', 'no-store');
      return withCorrelationHeaders(response, requestId);
    }
    if (error instanceof EnquiryNotFoundError) {
      const response = NextResponse.json(
        { success: false, code: 'ENQUIRY_NOT_FOUND', message: error.message },
        { status: 404 }
      );
      response.headers.set('Cache-Control', 'no-store');
      return withCorrelationHeaders(response, requestId);
    }
    if (isRateLimitUnavailableError(error)) {
      return createRateLimitUnavailableResponse(requestId);
    }
    if (isPersistenceUnavailableError(error)) {
      const response = NextResponse.json(
        {
          success: false,
          code: 'PERSISTENCE_UNAVAILABLE',
          message: error.message,
        },
        { status: 503 }
      );
      response.headers.set('Cache-Control', 'no-store');
      return withCorrelationHeaders(response, requestId);
    }

    console.error('Enquiry requirements update API error:', error?.message || 'Unexpected error');
    const response = NextResponse.json(
      {
        success: false,
        code: 'INTERNAL_ERROR',
        message: 'Unable to save requirements right now. Your contact details are already saved.',
      },
      { status: 500 }
    );
    response.headers.set('Cache-Control', 'no-store');
    return withCorrelationHeaders(response, requestId);
  }
}
