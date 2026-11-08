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

    const location = await locationService.resolveLocationBySlug(slug, { publishedOnly: true });
    if (!location) {
      const res = NextResponse.json({ success: false, error: 'Location not found or not published' }, { status: 404 });
      return withCorrelationHeaders(res, requestId);
    }

    const connectivity = await locationIntelligenceService.getConnectivityIntelligence(location);

    const response = NextResponse.json(
      {
        success: true,
        location: {
          id: location.id,
          name: location.name,
          slug: location.slug,
          type: location.type,
          latitude: location.latitude !== undefined && location.latitude !== null ? Number(location.latitude) : null,
          longitude: location.longitude !== undefined && location.longitude !== null ? Number(location.longitude) : null,
        },
        connectivity,
      },
      {
        headers: { 'Cache-Control': 'public, max-age=60, s-maxage=300' },
      }
    );

    return withCorrelationHeaders(response, requestId);
  } catch (err: any) {
    const res = NextResponse.json({ success: false, error: err.message || 'Internal Server Error' }, { status: 500 });
    return withCorrelationHeaders(res, requestId);
  }
}
