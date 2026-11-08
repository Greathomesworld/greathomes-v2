import { NextRequest, NextResponse } from 'next/server';
import { searchService } from '@/src/domain/search/searchService';
import { extractRequestContext, withCorrelationHeaders } from '@/src/lib/requestContext';
import { checkRateLimit, createRateLimitResponse } from '@/src/lib/rateLimit';

export async function GET(req: NextRequest) {
  const { requestId, ipAddress } = extractRequestContext(req);

  // Rate limiting: max 1000 search requests per minute per IP
  const rateLimitKey = `search_${ipAddress || 'anonymous'}`;
  const rateLimitResult = checkRateLimit(rateLimitKey, 1000, 60000);
  if (!rateLimitResult.allowed) {
    return createRateLimitResponse(requestId, rateLimitResult);
  }

  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q') || '';
    const mode = (searchParams.get('mode') || 'ALL').toUpperCase() as any;
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = Math.min(100, parseInt(searchParams.get('limit') || '20', 10));

    // Security length check
    if (q.length > 200) {
      const response = NextResponse.json(
        { success: false, message: 'Search query exceeds maximum allowed length of 200 characters.' },
        { status: 400 }
      );
      return withCorrelationHeaders(response, requestId);
    }

    const result = await searchService.search(q, mode, page, limit);
    const response = NextResponse.json({ success: true, ...result }, { status: 200 });
    return withCorrelationHeaders(response, requestId);
  } catch (error: any) {
    console.error('Search API error:', error);
    const response = NextResponse.json(
      { success: false, message: 'An unexpected error occurred while executing search.' },
      { status: 500 }
    );
    return withCorrelationHeaders(response, requestId);
  }
}
