import { NextRequest, NextResponse } from 'next/server';
import { ensureSeedData } from '@/src/infrastructure/seed';
import { enquiryService, EnquiryValidationError } from '@/src/domain/enquiry/services/enquiryService';
import { verifyCustomerAuth } from '@/src/domain/customer/customerAuth';
import { customerIntelligenceService } from '@/src/domain/visitorIntelligence/services/customerIntelligenceService';
import { extractCookiesFromRequest, isOptedOutRequest, setVisitorSessionCookies } from '@/src/domain/visitorIntelligence/validation';
import { extractRequestContext, withCorrelationHeaders } from '@/src/lib/requestContext';
import { checkRateLimit, createRateLimitResponse } from '@/src/lib/rateLimit';

export async function POST(req: NextRequest) {
  const { requestId, ipAddress } = extractRequestContext(req);

  // Rate limiting: max 100 enquiry submissions per minute per IP
  const rateLimitKey = `enquiry_post_${ipAddress || 'anonymous'}`;
  const rateLimitResult = checkRateLimit(rateLimitKey, 100, 60000);

  if (!rateLimitResult.allowed) {
    return createRateLimitResponse(requestId, rateLimitResult);
  }

  try {
    await ensureSeedData();
    const body = await req.json();

    // Strip client-provided private/sensitive/internal fields before submitting
    // Never trust client-sent customerId; only attach server-verified customerId
    const sanitizedBody = { ...body };
    delete sanitizedBody.ownerPhone;
    delete sanitizedBody.ownerEmail;
    delete sanitizedBody.crmId;
    delete sanitizedBody.internalNotes;
    delete sanitizedBody.assignedTo;
    delete sanitizedBody.assignedToName;
    delete sanitizedBody.staffRole;
    delete sanitizedBody.verification;
    delete sanitizedBody.customerId;

    // Verify customer session server-side
    let verifiedCustomerId: string | null = null;
    try {
      const auth = await verifyCustomerAuth(req);
      if (auth.authorized && auth.customerId) {
        verifiedCustomerId = auth.customerId;
      }
    } catch {
      // Unauthenticated submission allowed
    }

    const cookies = extractCookiesFromRequest(req);
    const optedOut = isOptedOutRequest(req);
    const rawVisitorId = optedOut ? null : cookies.visitorId || sanitizedBody.visitorId || null;
    const rawSessionId = optedOut ? null : cookies.sessionId || sanitizedBody.sessionId || null;

    const safeAttribution = optedOut
      ? { visitorId: null, sessionId: null, rotated: false }
      : await customerIntelligenceService.resolveSafeEnquiryAttribution({
          visitorId: rawVisitorId,
          sessionId: rawSessionId,
          authenticatedCustomerId: verifiedCustomerId,
          req,
          sourcePage: sanitizedBody.sourcePage || '/',
          ipAddress,
        });

    const visitorId = safeAttribution.visitorId;
    const sessionId = safeAttribution.sessionId;

    sanitizedBody.customerId = verifiedCustomerId || undefined;
    sanitizedBody.visitorId = visitorId || undefined;
    sanitizedBody.sessionId = sessionId || undefined;

    const result = await enquiryService.submitEnquiry(sanitizedBody, req);
    const response = NextResponse.json(result, { status: 201 });

    if (!optedOut && safeAttribution.rotated && visitorId && sessionId) {
      setVisitorSessionCookies(response, visitorId, sessionId);
    }

    // Record telemetry event for enquiry and optional site visit if not opted out
    if (!optedOut) {
      try {
        const entityType =
          sanitizedBody.contextType === 'RESALE'
            ? 'RESALE_LISTING'
            : sanitizedBody.contextType === 'RENTAL'
            ? 'RENTAL_LISTING'
            : sanitizedBody.contextType === 'PROJECT' || sanitizedBody.contextType === 'CONFIGURATION'
            ? 'PROJECT'
            : 'ENQUIRY';
        const entitySlug = sanitizedBody.projectSlug || sanitizedBody.listingSlug || null;

        const ingested = await customerIntelligenceService.ingestEvent(
          req,
          {
            visitorId,
            sessionId,
            eventType: 'ENQUIRY_SUBMITTED',
            pagePath: sanitizedBody.sourcePage || '/',
            entityType,
            entityId: result.enquiryId,
            entitySlug,
            metadata: {
              contextType: sanitizedBody.contextType,
              referenceNumber: result.referenceNumber,
              requestSiteVisit: Boolean(sanitizedBody.requestSiteVisit),
              preferredBhk: sanitizedBody.preferredBhk || null,
            },
          },
          verifiedCustomerId,
          ipAddress
        );

        if (sanitizedBody.requestSiteVisit && result.siteVisitId) {
          await customerIntelligenceService.ingestEvent(
            req,
            {
              visitorId: ingested.visitorId,
              sessionId: ingested.sessionId,
              eventType: 'SITE_VISIT_REQUESTED',
              pagePath: sanitizedBody.sourcePage || '/',
              entityType: 'SITE_VISIT',
              entityId: result.siteVisitId,
              entitySlug,
              metadata: {
                enquiryId: result.enquiryId,
                visitType: sanitizedBody.visitType || 'IN_PERSON',
              },
            },
            verifiedCustomerId,
            ipAddress
          );
        }

        if (ingested.visitorId && ingested.sessionId) {
          setVisitorSessionCookies(response, ingested.visitorId, ingested.sessionId);
        }
      } catch {
        // Non-blocking telemetry
      }
    }

    return withCorrelationHeaders(response, requestId);
  } catch (error: any) {
    if (error instanceof EnquiryValidationError) {
      const response = NextResponse.json(
        { success: false, message: error.message },
        { status: 400 }
      );
      return withCorrelationHeaders(response, requestId);
    }
    console.error('Enquiry API error:', error);
    const response = NextResponse.json(
      { success: false, message: error?.message || 'An unexpected error occurred while processing your enquiry. Please try again.' },
      { status: 500 }
    );
    return withCorrelationHeaders(response, requestId);
  }
}
