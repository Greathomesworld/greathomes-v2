import { NextRequest, NextResponse } from 'next/server';
import { extractRequestContext, withCorrelationHeaders } from '@/src/lib/requestContext';

export async function POST(req: NextRequest) {
  const { requestId } = extractRequestContext(req);
  const response = NextResponse.json({
    success: false,
    code: 'PASSWORD_AUTH_RETIRED',
    error: 'Password-based customer authentication has been retired. Sign in with your mobile number and OTP.',
  }, { status: 410 });
  response.cookies.set('gh_customer_token', '', {
    path: '/',
    httpOnly: true,
    maxAge: 0,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
  return withCorrelationHeaders(response, requestId);
}
