
import { NextRequest, NextResponse } from 'next/server';
import { recommendationService } from '@/src/domain/projects/services/recommendationService';
import { verifyInternalStaff } from '@/src/domain/auth/authorizationBoundary';
import { ensureSeedData } from '@/src/infrastructure/seed';

export async function GET(request: NextRequest) {
  try {
    await ensureSeedData();
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '5', 10);
    
    // Auth Check: Extract customer ID if available for personalization
    // In real app, this would use a session/token. For now, simulate.
    const authHeader = request.headers.get('Authorization');
    const customerId = authHeader ? 'mock-customer-id' : undefined;

    const recommendations = await recommendationService.getRecommendations({
        limit,
        customerId
    });

    return NextResponse.json({
      data: recommendations,
      pagination: { total: recommendations.length }
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
