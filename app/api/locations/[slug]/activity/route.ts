import { NextRequest, NextResponse } from 'next/server';
import { locationIntelligenceService } from '@/src/domain/marketIntelligence/services/locationIntelligenceService';
import { locationService } from '@/src/domain/locations/services/locationService';
import { extractRequestContext, withCorrelationHeaders } from '@/src/lib/requestContext';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { requestId } = extractRequestContext(req);
  try {
    const { slug } = await params;
    if (!slug) {
      const res = NextResponse.json({ success: false, error: 'Location slug is required' }, { status: 400 });
      return withCorrelationHeaders(res, requestId);
    }

    const { searchParams } = new URL(req.url);
    const limitParam = parseInt(searchParams.get('limit') || '10', 10);
    const limit = isNaN(limitParam) ? 10 : Math.min(Math.max(1, limitParam), 20); // Bounded 1 - 20
    const rawScope = searchParams.get('scope');
    const scope = rawScope?.toUpperCase() === 'DIRECT' ? 'DIRECT' : 'DESCENDANT';

    const location = await locationService.resolveLocationBySlug(slug, { publishedOnly: true });
    if (!location) {
      const res = NextResponse.json({ success: false, error: 'Location not found or not published' }, { status: 404 });
      return withCorrelationHeaders(res, requestId);
    }

    const recentActivity = await locationIntelligenceService.getRecentActivityIntelligence(location.id, limit, scope);

    const response = NextResponse.json(
      {
        success: true,
        location: {
          id: location.id,
          name: location.name,
          slug: location.slug,
          type: location.type,
          canonicalPath: `/locations/${location.slug}`,
        },
        scope,
        recentActivity,
      },
      {
        headers: { 'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=1800' },
      }
    );

    return withCorrelationHeaders(response, requestId);
  } catch (err: any) {
    const res = NextResponse.json({ success: false, error: err.message || 'Internal Server Error' }, { status: 500 });
    return withCorrelationHeaders(res, requestId);
  }
}
