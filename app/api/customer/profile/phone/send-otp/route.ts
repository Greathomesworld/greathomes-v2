import { NextRequest, NextResponse } from 'next/server';
import { verifyCustomerAuth } from '@/src/domain/customer/customerAuth';
import { sendPhoneChangeOtp } from '@/src/domain/customer/customerOtp';
import { customerOtpErrorResponse } from '@/src/domain/customer/customerOtpHttp';
import { extractRequestContext, withCorrelationHeaders } from '@/src/lib/requestContext';

export async function POST(req: NextRequest) {
  const { requestId, ipAddress } = extractRequestContext(req);
  const ip = ipAddress || 'unknown';
  const auth = await verifyCustomerAuth(req);

  if (!auth.authorized || !auth.customerId) {
    const response = NextResponse.json(
      { success: false, error: auth.error || 'Unauthorized' },
      { status: auth.statusCode || 401 }
    );
    return withCorrelationHeaders(response, requestId);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return withCorrelationHeaders(
      NextResponse.json({ success: false, error: 'Invalid JSON request body.' }, { status: 400 }),
      requestId
    );
  }

  try {
    const result = await sendPhoneChangeOtp(auth.customerId, body?.phone, ip);
    const response = NextResponse.json({ success: true, ...result });
    response.headers.set('Cache-Control', 'no-store, max-age=0');
    return withCorrelationHeaders(response, requestId);
  } catch (error: unknown) {
    return customerOtpErrorResponse(error, requestId, 'Failed to send phone change OTP. Please try again.');
  }
}
