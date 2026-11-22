import { NextResponse } from 'next/server';
import { extractTrustedClientIp, withCorrelationHeaders } from '../../lib/requestContext.ts';

export function getCustomerOtpClientIp(request: Request): string {
  return extractTrustedClientIp(request.headers) || 'unknown';
}

export function customerOtpErrorResponse(error: any, requestId: string, fallbackMessage: string) {
  const status = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
  const publicMessage =
    status >= 500 && !error?.code
      ? fallbackMessage
      : (typeof error?.message === 'string' ? error.message : fallbackMessage);
  const response = NextResponse.json(
    {
      success: false,
      error: publicMessage,
      code: typeof error?.code === 'string' ? error.code : undefined,
    },
    { status, headers: { 'Cache-Control': 'no-store, max-age=0' } }
  );
  if (status === 429 && Number.isFinite(error?.retryAfterSeconds)) {
    response.headers.set('Retry-After', String(Math.max(1, Math.ceil(error.retryAfterSeconds))));
  }
  return withCorrelationHeaders(response, requestId);
}

export function setCustomerSessionCookie(response: NextResponse, token: string) {
  response.cookies.set('gh_customer_token', token, {
    path: '/',
    httpOnly: true,
    maxAge: 30 * 24 * 60 * 60,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
  return response;
}
