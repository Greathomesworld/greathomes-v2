import { NextRequest, NextResponse } from 'next/server';
import { ensureSeedData } from '@/src/infrastructure/seed';
import {
  projectRepository,
  projectMediaRepository,
} from '@/src/infrastructure/repositories/projectProvider';
import { mediaRepository } from '@/src/domain/media/repositories/mediaRepository';
import { getStorageProvider } from '@/src/domain/media/storage/storageProvider';
import {
  enquiryService,
  EnquiryValidationError,
} from '@/src/domain/enquiry/services/enquiryService';
import { verifyCustomerAuth } from '@/src/domain/customer/customerAuth';
import { customerIntelligenceService } from '@/src/domain/visitorIntelligence/services/customerIntelligenceService';
import {
  extractCookiesFromRequest,
  isOptedOutRequest,
  setVisitorSessionCookies,
} from '@/src/domain/visitorIntelligence/validation';
import { extractRequestContext, withCorrelationHeaders } from '@/src/lib/requestContext';
import { checkRateLimit, createRateLimitResponse } from '@/src/lib/rateLimit';
import { createBrochureDownloadToken } from '@/src/lib/brochureToken';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Short-window in-memory idempotency cache (15s) to prevent accidental double-click duplicate leads
const recentBrochureRequests = new Map<
  string,
  { enquiryId: string; referenceNumber: string; timestamp: number }
>();

function deriveStorageKeyFromUrl(url: string): string {
  const cleanUrl = url.split('?')[0].trim();
  if (cleanUrl.startsWith('/uploads/')) {
    return cleanUrl.replace(/^\/uploads\//, '');
  }
  const mediaIdx = cleanUrl.indexOf('media/');
  if (mediaIdx >= 0) {
    return cleanUrl.slice(mediaIdx);
  }
  return cleanUrl.replace(/^\/+/, '');
}

export async function POST(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const { requestId, ipAddress } = extractRequestContext(req);

  // Rate limiting: max 20 brochure requests per minute per IP
  const rateLimitKey = `brochure_request_${ipAddress || 'anonymous'}`;
  const rateLimitResult = checkRateLimit(rateLimitKey, 20, 60000);
  if (!rateLimitResult.allowed) {
    return createRateLimitResponse(requestId, rateLimitResult);
  }

  try {
    await ensureSeedData();
    const { id } = await props.params;

    // 1. Guard request payload size & parse JSON
    const rawText = await req.text();
    if (rawText.length > 16 * 1024) {
      return withCorrelationHeaders(
        NextResponse.json(
          { success: false, message: 'Request payload is too large.' },
          { status: 413 }
        ),
        requestId
      );
    }

    let body: any = {};
    try {
      body = rawText ? JSON.parse(rawText) : {};
    } catch {
      return withCorrelationHeaders(
        NextResponse.json(
          { success: false, message: 'Invalid JSON request payload.' },
          { status: 400 }
        ),
        requestId
      );
    }

    // 2. Independent server-side field validation
    const rawName = typeof body.name === 'string' ? body.name.trim() : '';
    if (!rawName || rawName.length < 2) {
      return withCorrelationHeaders(
        NextResponse.json(
          { success: false, message: 'Please enter your full name (at least 2 characters).' },
          { status: 400 }
        ),
        requestId
      );
    }
    if (rawName.length > 120) {
      return withCorrelationHeaders(
        NextResponse.json(
          { success: false, message: 'Full name cannot exceed 120 characters.' },
          { status: 400 }
        ),
        requestId
      );
    }

    const rawPhone = typeof body.phone === 'string' ? body.phone.trim() : '';
    const normalizedPhone = enquiryService.normalizePhone(rawPhone);

    // Email is explicitly optional; empty string / null / undefined must be accepted and never turned into a fake email
    const rawEmail =
      typeof body.email === 'string' && body.email.trim().length > 0
        ? body.email.trim()
        : undefined;
    const validatedEmail = enquiryService.validateEmail(rawEmail);

    // Marketing consent is separate and optional, defaulting to false
    const marketingConsent = Boolean(body.marketingConsent === true);

    // 3. Resolve canonical project record server-side
    let project = await projectRepository.findById(id);
    if (!project) {
      project = await projectRepository.findBySlug(id);
    }
    if (!project) {
      return withCorrelationHeaders(
        NextResponse.json(
          { success: false, message: 'The requested project could not be found.' },
          { status: 404 }
        ),
        requestId
      );
    }

    // 4. Verify project is eligible for public brochure access
    const isPublished = project.lifecycleStatus
      ? project.lifecycleStatus === 'PUBLISHED'
      : project.isPublished !== false;
    if (!isPublished) {
      return withCorrelationHeaders(
        NextResponse.json(
          { success: false, message: 'This project is not currently available for public brochure access.' },
          { status: 404 }
        ),
        requestId
      );
    }

    // 5. Verify project has a valid, accessible brochure
    const projectMediaList = await projectMediaRepository.findByProjectId(project.id);
    const brochureMediaList = projectMediaList
      .filter(
        (m) =>
          (m.category || '').toUpperCase() === 'BROCHURE' &&
          m.url &&
          m.url.trim().length > 0
      )
      .sort((a, b) => {
        const timeA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const timeB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return timeB - timeA || a.sortOrder - b.sortOrder;
      });

    const activeBrochure = brochureMediaList[0] || null;
    if (!activeBrochure) {
      return withCorrelationHeaders(
        NextResponse.json(
          { success: false, message: 'No brochure is currently available for this project.' },
          { status: 404 }
        ),
        requestId
      );
    }

    // Verify underlying file exists in storage before recording lead or issuing access
    const storage = getStorageProvider();
    let storageKey = deriveStorageKeyFromUrl(activeBrochure.url);
    if (activeBrochure.mediaId) {
      const asset = await mediaRepository.findById(activeBrochure.mediaId);
      if (asset?.storageKey) {
        storageKey = asset.storageKey;
      }
    }
    const fileExists = await storage.exists(storageKey);
    if (!fileExists) {
      return withCorrelationHeaders(
        NextResponse.json(
          { success: false, message: 'The brochure document for this project is temporarily unavailable.' },
          { status: 404 }
        ),
        requestId
      );
    }

    // 6. Verify customer session & visitor attribution (Scenario A, B, C, D)
    const auth = await verifyCustomerAuth(req);
    if (!auth.authorized || !auth.customerId) {
      return withCorrelationHeaders(
        NextResponse.json(
          {
            success: false,
            error: 'Authentication required. Please verify your mobile number to download this brochure.',
            code: 'CUSTOMER_AUTH_REQUIRED',
          },
          { status: 401 }
        ),
        requestId
      );
    }
    const verifiedCustomerId = auth.customerId;

    const cookies = extractCookiesFromRequest(req);
    const optedOut = isOptedOutRequest(req);
    const rawVisitorId = optedOut ? null : cookies.visitorId || null;
    const rawSessionId = optedOut ? null : cookies.sessionId || null;

    const sourcePage =
      typeof body.sourcePage === 'string' && body.sourcePage.startsWith('/')
        ? body.sourcePage.slice(0, 200)
        : `/projects/${project.slug}`;

    const safeAttribution = optedOut
      ? { visitorId: null, sessionId: null, rotated: false }
      : await customerIntelligenceService.resolveSafeEnquiryAttribution({
          visitorId: rawVisitorId,
          sessionId: rawSessionId,
          authenticatedCustomerId: verifiedCustomerId,
          req,
          sourcePage,
          ipAddress,
        });

    const visitorId = safeAttribution.visitorId;
    const sessionId = safeAttribution.sessionId;

    // 7. Persist lead (with 15-second double-click idempotency guard)
    const dedupeKey = `${project.id}::${normalizedPhone}`;
    const nowMs = Date.now();
    const recentEntry = recentBrochureRequests.get(dedupeKey);

    let enquiryId: string;
    let referenceNumber: string;

    if (recentEntry && nowMs - recentEntry.timestamp < 15000) {
      enquiryId = recentEntry.enquiryId;
      referenceNumber = recentEntry.referenceNumber;
    } else {
      const result = await enquiryService.submitEnquiry(
        {
          contextType: 'PROJECT',
          projectSlug: project.slug,
          name: rawName,
          phone: normalizedPhone,
          email: validatedEmail || undefined,
          preferredContact: 'WHATSAPP',
          requestSiteVisit: false,
          message: `Brochure download requested for ${project.name}.`,
          source: 'BROCHURE_DOWNLOAD',
          sourcePage,
          marketingConsent,
          customerId: verifiedCustomerId || undefined,
          visitorId: visitorId || undefined,
          sessionId: sessionId || undefined,
        },
        req
      );

      if (!result.success || !result.enquiryId) {
        return withCorrelationHeaders(
          NextResponse.json(
            {
              success: false,
              message: 'Unable to record your brochure request at this moment. Please try again.',
            },
            { status: 500 }
          ),
          requestId
        );
      }

      enquiryId = result.enquiryId;
      referenceNumber = result.referenceNumber || `GH-ENQ-${enquiryId.slice(-6).toUpperCase()}`;
      recentBrochureRequests.set(dedupeKey, {
        enquiryId,
        referenceNumber,
        timestamp: nowMs,
      });
    }

    // 8. Issue short-lived signed download authorization token bound to project + active brochure + enquiry
    const brochureIdentifier = activeBrochure.mediaId || activeBrochure.id;
    const token = createBrochureDownloadToken(
      {
        projectId: project.id,
        brochureId: brochureIdentifier,
        enquiryId,
      },
      600 // 10 minutes
    );

    const downloadUrl = `/api/projects/${project.id}/brochure/download?token=${encodeURIComponent(
      token
    )}&download=1`;

    const displayName =
      (activeBrochure.caption && activeBrochure.caption.trim()) ||
      (activeBrochure.altText && activeBrochure.altText.trim()) ||
      `${project.name.replace(/[^a-zA-Z0-9_-]/g, '_')}_Brochure.pdf`;

    const response = NextResponse.json(
      {
        success: true,
        message: 'Your brochure access is ready.',
        enquiryId,
        referenceNumber,
        downloadUrl,
        filename: displayName.endsWith('.pdf') ? displayName : `${displayName}.pdf`,
      },
      { status: 201 }
    );

    if (!optedOut && safeAttribution.rotated && visitorId && sessionId) {
      setVisitorSessionCookies(response, visitorId, sessionId);
    }

    // Non-blocking first-party conversion telemetry
    if (!optedOut) {
      try {
        const ingested = await customerIntelligenceService.ingestEvent(
          req,
          {
            visitorId,
            sessionId,
            eventType: 'BROCHURE_REQUEST_SUBMITTED',
            pagePath: sourcePage,
            entityType: 'PROJECT',
            entityId: project.id,
            entitySlug: project.slug,
            metadata: {
              enquiryId,
              referenceNumber,
              source: 'BROCHURE_DOWNLOAD',
              marketingConsent,
            },
          },
          verifiedCustomerId,
          ipAddress
        );
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
      return withCorrelationHeaders(
        NextResponse.json(
          { success: false, message: error.message },
          { status: 400 }
        ),
        requestId
      );
    }
    console.error('Brochure request error:', error);
    return withCorrelationHeaders(
      NextResponse.json(
        {
          success: false,
          message:
            'An unexpected error occurred while processing your brochure request. Please try again.',
        },
        { status: 500 }
      ),
      requestId
    );
  }
}
