import { NextRequest, NextResponse } from 'next/server';
import { marketIntelligenceDashboardService } from '@/src/domain/marketIntelligence/dashboard/marketIntelligenceDashboardService';

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const locationSlug = searchParams.get('location') || undefined;
    const scopeParam = searchParams.get('scope');
    const scope = scopeParam === 'DIRECT' ? 'DIRECT' : 'DESCENDANT';
    const basisParam = searchParams.get('basis');
    const basis = (basisParam === 'BUILT_UP_AREA' || basisParam === 'SUPER_BUILT_UP_AREA') ? basisParam : 'CARPET_AREA';

    const data = await marketIntelligenceDashboardService.getDashboardData({
      locationSlug,
      scope,
      basis,
    });

    const response = NextResponse.json({
      success: true,
      data,
    });

    response.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=1800');
    return response;
  } catch (error: any) {
    console.error('Market Dashboard API error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Internal server error while retrieving market intelligence.',
      },
      { status: 500 }
    );
  }
}
