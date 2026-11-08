import { NextRequest, NextResponse } from 'next/server';
import { sendCustomerOtp } from '@/src/domain/customer/customerOtp';
import { customerOtpErrorResponse, getCustomerOtpClientIp } from '@/src/domain/customer/customerOtpHttp';
import { extractRequestContext, withCorrelationHeaders } from '@/src/lib/requestContext';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { requestId } = extractRequestContext(req);
  try {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return withCorrelationHeaders(NextResponse.json({ success: false, error: 'Enter a valid mobile number.' }, { status: 400 }), requestId);
    }

    const result = await sendCustomerOtp(body?.phone, getCustomerOtpClientIp(req));
    const response = NextResponse.json({
      success: true,
      challengeId: result.challengeId,
      expiresInSeconds: result.expiresInSeconds,
      resendAfterSeconds: result.resendAfterSeconds,
      message: 'If the number is eligible for SMS delivery, an OTP has been sent.',
    });
    return withCorrelationHeaders(response, requestId);
  } catch (error: any) {
    return customerOtpErrorResponse(error, requestId, 'We could not send an OTP right now. Please try again later.');
  }
}
