import { NextRequest, NextResponse } from 'next/server';
import { extractRequestContext, withCorrelationHeaders } from '@/src/lib/requestContext';

const startTime = Date.now();

export async function GET(req: NextRequest) {
  const { requestId } = extractRequestContext(req);
  const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);

  const body = {
    status: 'ok',
    service: 'Great Homes V2',
    timestamp: new Date().toISOString(),
    uptimeSeconds,
    env: process.env.NODE_ENV || 'development',
  };

  const response = NextResponse.json(body, { status: 200 });
  return withCorrelationHeaders(response, requestId);
}
