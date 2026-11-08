import { NextRequest, NextResponse } from 'next/server';
import { locationComparisonService } from '@/src/domain/locationComparison';
import { extractRequestContext, withCorrelationHeaders } from '@/src/lib/requestContext';
import { MetricScope } from '@/src/domain/marketIntelligence/types';
import { PriceBasisType } from '@/src/domain/locationComparison/locationComparisonTypes';

export async function GET(req: NextRequest) {
  const { requestId } = extractRequestContext(req);

  try {
    const { searchParams } = new URL(req.url);
    const locationsParam = searchParams.get('locations') || searchParams.get('ids');

    if (!locationsParam) {
      const response = NextResponse.json(
        {
          success: false,
          error: 'locations query parameter is required (comma-separated slugs or IDs, 2 to 4 locations).',
        },
        { status: 400 }
      );
      return withCorrelationHeaders(response, requestId);
    }

    const scopeParam = searchParams.get('scope');
    const scope: MetricScope = scopeParam === 'DIRECT' ? 'DIRECT' : 'DESCENDANT';

    const basisParam = searchParams.get('basis') as PriceBasisType | null;

    const result = await locationComparisonService.compareLocations(locationsParam, {
      scope,
      priceBasis: basisParam || undefined,
    });

    if (!result.success || !result.data) {
      const response = NextResponse.json(
        {
          success: false,
          error: result.error || 'Failed to compare locations.',
        },
        { status: result.statusCode || 400 }
      );
      return withCorrelationHeaders(response, requestId);
    }

    const response = NextResponse.json(
      {
        success: true,
        mode: 'LOCATIONS',
        ...result.data,
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
        },
      }
    );

    return withCorrelationHeaders(response, requestId);
  } catch (error: any) {
    const response = NextResponse.json(
      {
        success: false,
        error: error.message || 'An unexpected error occurred while comparing locations.',
      },
      { status: 500 }
    );
    return withCorrelationHeaders(response, requestId);
  }
}
