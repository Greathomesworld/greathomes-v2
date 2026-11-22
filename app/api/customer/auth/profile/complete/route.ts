import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { completeCustomerOtpProfile } from '@/src/domain/customer/customerOtp';
import { PartnerDomainError } from '@/src/domain/customer/partnerService';
import { customerOtpErrorResponse, setCustomerSessionCookie } from '@/src/domain/customer/customerOtpHttp';
import { customerIntelligenceService } from '@/src/domain/visitorIntelligence/services/customerIntelligenceService';
import { setVisitorSessionCookies } from '@/src/domain/visitorIntelligence/validation';
import { extractRequestContext, withCorrelationHeaders } from '@/src/lib/requestContext';
import {
  checkRateLimit,
  createRateLimitResponse,
  createRateLimitUnavailableResponse,
  isRateLimitUnavailableError,
} from '@/src/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function hashRateLimitKey(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex').slice(0, 32);
}

export async function POST(req: NextRequest) {
  const { requestId, ipAddress } = extractRequestContext(req);
  const ipBucket = ipAddress || 'anonymous';

  try {
    try {
      const ipLimit = await checkRateLimit(
        `customer_profile_complete_ip_${ipBucket}`,
        ipAddress ? 15 : 10,
        15 * 60 * 1000
      );
      if (!ipLimit.allowed) {
        return createRateLimitResponse(requestId, ipLimit);
      }
    } catch (err) {
      if (isRateLimitUnavailableError(err)) {
        return createRateLimitUnavailableResponse(requestId);
      }
      throw err;
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      return withCorrelationHeaders(
        NextResponse.json({ success: false, error: 'Complete the required profile fields.' }, { status: 400 }),
        requestId
      );
    }

    if (typeof body?.challengeId === 'string' && body.challengeId.trim()) {
      try {
        const challengeLimit = await checkRateLimit(
          `customer_profile_complete_ch_${hashRateLimitKey(body.challengeId.trim())}`,
          10,
          15 * 60 * 1000
        );
        if (!challengeLimit.allowed) {
          return createRateLimitResponse(requestId, challengeLimit);
        }
      } catch (err) {
        if (isRateLimitUnavailableError(err)) {
          return createRateLimitUnavailableResponse(requestId);
        }
        throw err;
      }
    }

    const result = await completeCustomerOtpProfile(
      body?.challengeId,
      body?.name,
      body?.email,
      {
        accountType: body?.accountType,
        agencyName: body?.agencyName,
        businessAddress: body?.businessAddress,
        locality: body?.locality,
        city: body?.city,
        agencyContactPhone: body?.agencyContactPhone,
        declarationAccepted: body?.declarationAccepted,
      }
    );
    const response = NextResponse.json(
      {
        success: true,
        customer: result.customer,
      },
      { status: 201 }
    );
    setCustomerSessionCookie(response, result.token);

    if (result.customer?.id) {
      try {
        const linked = await customerIntelligenceService.handleCustomerAuthenticated({
          req,
          customerId: result.customer.id,
          isNewProfile: true,
          ipAddress,
        });
        setVisitorSessionCookies(response, linked.visitorId, linked.sessionId);
      } catch {
        // Non-blocking telemetry link
      }
    }

    return withCorrelationHeaders(response, requestId);
  } catch (error: any) {
    if (isRateLimitUnavailableError(error)) {
      return createRateLimitUnavailableResponse(requestId);
    }
    if (error instanceof PartnerDomainError) {
      return withCorrelationHeaders(
        NextResponse.json(
          {
            success: false,
            error: error.message,
            code: error.code,
            fieldErrors: error.fieldErrors,
          },
          { status: error.statusCode }
        ),
        requestId
      );
    }
    return customerOtpErrorResponse(error, requestId, 'We could not complete your profile. Please try again.');
  }
}
