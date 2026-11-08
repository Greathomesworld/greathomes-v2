import { NextRequest, NextResponse } from 'next/server';
import { verifyCustomerOtp } from '@/src/domain/customer/customerOtp';
import { customerOtpErrorResponse, getCustomerOtpClientIp, setCustomerSessionCookie } from '@/src/domain/customer/customerOtpHttp';
import { customerIntelligenceService } from '@/src/domain/visitorIntelligence/services/customerIntelligenceService';
import { setVisitorSessionCookies } from '@/src/domain/visitorIntelligence/validation';
import { extractRequestContext, withCorrelationHeaders } from '@/src/lib/requestContext';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { requestId, ipAddress } = extractRequestContext(req);
  try {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return withCorrelationHeaders(NextResponse.json({ success: false, error: 'Enter the four-digit code.' }, { status: 400 }), requestId);
    }

    const result = await verifyCustomerOtp(body?.challengeId, body?.otp, getCustomerOtpClientIp(req));
    if (result.requiresProfileCompletion) {
      return withCorrelationHeaders(NextResponse.json({
        success: true,
        requiresProfileCompletion: true,
        challengeId: result.challengeId,
        maskedPhone: result.maskedPhone,
      }), requestId);
    }

    const response = NextResponse.json({
      success: true,
      requiresProfileCompletion: false,
      customer: result.customer,
    });
    setCustomerSessionCookie(response, result.token!);

    if (result.customer?.id) {
      try {
        const linked = await customerIntelligenceService.handleCustomerAuthenticated({
          req,
          customerId: result.customer.id,
          isNewProfile: false,
          ipAddress,
        });
        setVisitorSessionCookies(response, linked.visitorId, linked.sessionId);
      } catch {
        // Non-blocking telemetry link
      }
    }

    return withCorrelationHeaders(response, requestId);
  } catch (error: any) {
    return customerOtpErrorResponse(error, requestId, 'We could not verify that code. Please try again.');
  }
}
