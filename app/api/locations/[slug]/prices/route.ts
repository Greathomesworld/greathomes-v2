import { NextRequest, NextResponse } from 'next/server';
import { locationIntelligenceService } from '@/src/domain/marketIntelligence/services/locationIntelligenceService';
import { extractRequestContext, withCorrelationHeaders } from '@/src/lib/requestContext';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { requestId } = extractRequestContext(req);
  try {
    const { slug } = await params;
    const { searchParams } = new URL(req.url);
    const scopeParam = searchParams.get('scope') === 'DIRECT' ? 'DIRECT' : 'DESCENDANT';

    const intelligence = await locationIntelligenceService.getLocationIntelligence(slug, { scope: scopeParam });
    if (!intelligence) {
      const res = NextResponse.json({ success: false, error: 'Location not found' }, { status: 404 });
      return withCorrelationHeaders(res, requestId);
    }

    const priceMetrics = Object.entries(intelligence.pricing.newBooking).map(([basis, metrics]: [string, any]) => ({
      priceBasis: basis === 'carpetArea' ? 'CARPET_AREA' : basis === 'builtUpArea' ? 'BUILT_UP_AREA' : 'SUPER_BUILT_UP_AREA',
      minRatePerSqft: metrics.minRatePerSqft,
      maxRatePerSqft: metrics.maxRatePerSqft,
      medianRatePerSqft: metrics.medianRatePerSqft,
      avgRatePerSqft: metrics.avgRatePerSqft,
      sampleCount: metrics.sampleCount,
    }));

    const response = NextResponse.json(
      {
        success: true,
        location: {
          id: intelligence.location.id,
          name: intelligence.location.name,
          slug: intelligence.location.slug,
          type: intelligence.location.level,
        },
        priceMetrics,
        pricing: intelligence.pricing,
        freshness: intelligence.freshness,
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
