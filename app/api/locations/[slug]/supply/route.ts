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
    const { searchParams } = new URL(req.url);
    const scopeParam = searchParams.get('scope') === 'DIRECT' ? 'DIRECT' : 'DESCENDANT';

    const intelligence = await locationIntelligenceService.getLocationIntelligence(slug, { scope: scopeParam });
    if (!intelligence) {
      const res = NextResponse.json({ success: false, error: 'Location not found' }, { status: 404 });
      return withCorrelationHeaders(res, requestId);
    }

    const response = NextResponse.json(
      {
        success: true,
        location: {
          id: intelligence.location.id,
          name: intelligence.location.name,
          slug: intelligence.location.slug,
          type: intelligence.location.level,
        },
        supply: {
          totalProjects: intelligence.marketOverview.publishedProjects,
          publishedProjects: intelligence.marketOverview.publishedProjects,
          newLaunchProjects: intelligence.marketOverview.newLaunchProjects,
          underConstructionProjects: intelligence.marketOverview.underConstructionProjects,
          readyToMoveProjects: intelligence.marketOverview.readyToMoveProjects,
          completedProjects: intelligence.marketOverview.completedProjects,
          soldOutProjects: intelligence.marketOverview.soldOutProjects,
          resaleListingsCount: intelligence.marketOverview.resaleListings,
          rentalListingsCount: intelligence.marketOverview.rentalListings,
          configurationDistribution: intelligence.supply.projectConfigurationDistribution,
          projectConfigurationDistribution: intelligence.supply.projectConfigurationDistribution,
          resaleConfigurationDistribution: intelligence.supply.resaleConfigurationDistribution,
          rentalConfigurationDistribution: intelligence.supply.rentalConfigurationDistribution,
          scope: intelligence.scope,
        },
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
