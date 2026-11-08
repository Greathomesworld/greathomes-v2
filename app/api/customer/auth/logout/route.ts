import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { revokeCustomerSession } from '@/src/domain/customer/customerAuth';
import { isOptedOutRequest, setVisitorSessionCookies } from '@/src/domain/visitorIntelligence/validation';
import { extractRequestContext, withCorrelationHeaders } from '@/src/lib/requestContext';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const { requestId } = extractRequestContext(req);
  const token = req.cookies.get('gh_customer_token')?.value || null;
  let revokeFailed = false;

  try {
    await revokeCustomerSession(token);
  } catch {
    // Always clear the browser cookie even if the database is temporarily unavailable.
    revokeFailed = true;
  }

  const response = NextResponse.json({
    success: !revokeFailed,
    message: revokeFailed ? 'Signed out in this browser. Server-side session revocation could not be confirmed.' : 'Logged out successfully',
  }, { status: revokeFailed ? 503 : 200 });

  response.cookies.set('gh_customer_token', '', {
    path: '/',
    httpOnly: true,
    maxAge: 0,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });

  // Rotate visitor & session cookies on logout so shared-device anonymous browsing does not attach to the logged-out customer
  if (!isOptedOutRequest(req)) {
    setVisitorSessionCookies(response, crypto.randomUUID(), crypto.randomUUID());
  }

  return withCorrelationHeaders(response, requestId);
}
