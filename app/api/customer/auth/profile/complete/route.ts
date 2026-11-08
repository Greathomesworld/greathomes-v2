import { NextRequest, NextResponse } from 'next/server';
import { completeCustomerOtpProfile } from '@/src/domain/customer/customerOtp';
import { customerOtpErrorResponse, setCustomerSessionCookie } from '@/src/domain/customer/customerOtpHttp';
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
      return withCorrelationHeaders(NextResponse.json({ success: false, error: 'Complete the required profile fields.' }, { status: 400 }), requestId);
    }

    const result = await completeCustomerOtpProfile(body?.challengeId, body?.name, body?.email);
    const response = NextResponse.json({
      success: true,
      customer: result.customer,
    }, { status: 201 });
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
    return customerOtpErrorResponse(error, requestId, 'We could not complete your profile. Please try again.');
  }
}
