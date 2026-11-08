import { NextRequest, NextResponse } from 'next/server';
import { searchService } from '@/src/domain/search/searchService';
import { extractRequestContext, withCorrelationHeaders } from '@/src/lib/requestContext';

export async function GET(req: NextRequest) {
  const { requestId } = extractRequestContext(req);

  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q') || '';
    const rawMode = (searchParams.get('mode') || 'ALL').toUpperCase();
    const mode = (['ALL', 'PROJECTS', 'BUY', 'RENT'].includes(rawMode) ? rawMode : 'ALL') as
      | 'ALL'
      | 'PROJECTS'
      | 'BUY'
      | 'RENT';

    if (q.length > 100) {
      return NextResponse.json(
        {
          success: true,
          suggestions: { projects: [], locations: [], developers: [], resales: [], rentals: [] },
        },
        { status: 200 }
      );
    }

    const result = await searchService.search(q, mode, 1, 5);
    const response = NextResponse.json(
      {
        success: true,
        suggestions: result.suggestions,
      },
      { status: 200 }
    );
    response.headers.set('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=600');
    return withCorrelationHeaders(response, requestId);
  } catch (error: any) {
    console.error('Suggestions API error:', error);
    const response = NextResponse.json(
      { success: false, message: 'Failed to fetch suggestions.' },
      { status: 500 }
    );
    return withCorrelationHeaders(response, requestId);
  }
}
