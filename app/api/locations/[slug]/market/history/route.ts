import { NextRequest, NextResponse } from 'next/server';
import { locationService } from '@/src/domain/locations/services/locationService';
import { locationIntelligenceService } from '@/src/domain/marketIntelligence/services/locationIntelligenceService';
import { extractRequestContext, withCorrelationHeaders } from '@/src/lib/requestContext';

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { requestId } = extractRequestContext(req);
  const { slug } = await params;
  const { searchParams } = new URL(req.url);
  const scope = searchParams.get('scope') === 'DIRECT' ? 'DIRECT' : 'DESCENDANT';
  
  const location = await locationService.resolveLocationBySlug(slug, { publishedOnly: true });
  if (!location) {
    return withCorrelationHeaders(NextResponse.json({ error: 'Location not found' }, { status: 404 }), requestId);
  }

  const history = await locationIntelligenceService.getLocationHistory(location.id, scope);
  
  const response = NextResponse.json({ history });
  
  // Explicit Public Caching: 1 hour max-age, 24 hours stale-while-revalidate
  response.headers.set('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  
  return withCorrelationHeaders(response, requestId);
}
