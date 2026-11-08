import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { ensureSeedData } from '@/src/infrastructure/seed';
import { verifyCustomerAuth } from '@/src/domain/customer/customerAuth';
import { customerIntelligenceService } from '@/src/domain/visitorIntelligence/services/customerIntelligenceService';
import { visitorIntelligenceRepository } from '@/src/domain/visitorIntelligence/repositories/visitorIntelligenceRepository';
import {
  extractCookiesFromRequest,
  isOptedOutRequest,
  SESSION_COOKIE_NAME,
  setVisitorSessionCookies,
  TELEMETRY_OPT_OUT_COOKIE_NAME,
  VISITOR_COOKIE_MAX_AGE_SECONDS,
  VISITOR_COOKIE_NAME,
} from '@/src/domain/visitorIntelligence/validation';
import { extractRequestContext, withCorrelationHeaders } from '@/src/lib/requestContext';
import { checkRateLimit, createRateLimitResponse } from '@/src/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { requestId } = extractRequestContext(req);
  const cookies = extractCookiesFromRequest(req);
  const optedOut = isOptedOutRequest(req);
  const visitorId = cookies.visitorId || crypto.randomUUID();
  const sessionId = cookies.sessionId || crypto.randomUUID();

  const response = NextResponse.json({
    visitorId: optedOut ? null : visitorId,
    sessionId: optedOut ? null : sessionId,
    optedOut,
  });

  if (!optedOut && (!cookies.visitorId || !cookies.sessionId)) {
    setVisitorSessionCookies(response, visitorId, sessionId);
  }

  return withCorrelationHeaders(response, requestId);
}

export async function POST(req: NextRequest) {
  const { requestId, ipAddress } = extractRequestContext(req);

  // Rate limit: max 120 telemetry calls per minute per IP
  const rateLimitKey = `telemetry_post_${ipAddress || 'anonymous'}`;
  const rateLimitResult = checkRateLimit(rateLimitKey, 120, 60_000);
  if (!rateLimitResult.allowed) {
    return createRateLimitResponse(requestId, rateLimitResult);
  }

  try {
    await ensureSeedData();

    const rawText = await req.text();
    if (rawText.length > 8192) {
      return withCorrelationHeaders(
        NextResponse.json(
          { accepted: false, error: 'Telemetry payload exceeds 8KB limit.' },
          { status: 400 }
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
          { accepted: false, error: 'Invalid JSON payload.' },
          { status: 400 }
        ),
        requestId
      );
    }

    // Handle explicit privacy opt-out toggle
    if (body?.action === 'SET_OPT_OUT') {
      const optOut = Boolean(body.optOut);
      const cookies = extractCookiesFromRequest(req);
      let anonymousRecordsPurged = false;

      if (optOut && cookies.visitorId) {
        try {
          const purgeResult = await visitorIntelligenceRepository.anonymizeOrDeleteUnlinkedVisitor(
            cookies.visitorId
          );
          anonymousRecordsPurged = purgeResult.deleted;
        } catch {
          // Non-blocking cleanup on opt-out
        }
      }

      const response = NextResponse.json({
        accepted: true,
        optedOut: optOut,
        anonymousRecordsPurged,
      });
      const secure = process.env.NODE_ENV === 'production';
      if (optOut) {
        response.cookies.set(TELEMETRY_OPT_OUT_COOKIE_NAME, '1', {
          path: '/',
          httpOnly: false,
          maxAge: VISITOR_COOKIE_MAX_AGE_SECONDS,
          sameSite: 'lax',
          secure,
        });
        // Rotate/clear active visitor & session cookies on opt-out
        response.cookies.set(VISITOR_COOKIE_NAME, '', { path: '/', maxAge: 0 });
        response.cookies.set(SESSION_COOKIE_NAME, '', { path: '/', maxAge: 0 });
      } else {
        response.cookies.set(TELEMETRY_OPT_OUT_COOKIE_NAME, '0', {
          path: '/',
          httpOnly: false,
          maxAge: 0,
          sameSite: 'lax',
          secure,
        });
        const newVisitorId = crypto.randomUUID();
        const newSessionId = crypto.randomUUID();
        setVisitorSessionCookies(response, newVisitorId, newSessionId);
      }
      return withCorrelationHeaders(response, requestId);
    }

    // Non-blocking customer session verification
    let authenticatedCustomerId: string | null = null;
    try {
      const auth = await verifyCustomerAuth(req);
      if (auth.authorized && auth.customerId) {
        authenticatedCustomerId = auth.customerId;
      }
    } catch {
      // Proceed as anonymous visitor
    }

    const result = await customerIntelligenceService.ingestEvent(
      req,
      body,
      authenticatedCustomerId,
      ipAddress
    );

    if (result.optedOut) {
      return withCorrelationHeaders(
        NextResponse.json({ accepted: false, optedOut: true }, { status: 202 }),
        requestId
      );
    }

    if (!result.accepted) {
      return withCorrelationHeaders(
        NextResponse.json(
          { accepted: false, error: result.error || 'Rejected telemetry event.' },
          { status: 400 }
        ),
        requestId
      );
    }

    const response = NextResponse.json(
      {
        accepted: true,
        deduplicated: Boolean(result.deduplicated),
        visitorId: result.visitorId,
        sessionId: result.sessionId,
        eventId: result.eventId,
      },
      { status: 202 }
    );

    setVisitorSessionCookies(response, result.visitorId, result.sessionId);
    return withCorrelationHeaders(response, requestId);
  } catch (error: any) {
    return withCorrelationHeaders(
      NextResponse.json(
        { accepted: false, error: error?.message || 'Telemetry error' },
        { status: 500 }
      ),
      requestId
    );
  }
}
