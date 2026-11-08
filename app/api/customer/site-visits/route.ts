import { NextRequest, NextResponse } from 'next/server';
import { verifyCustomerAuth } from '@/src/domain/customer/customerAuth';
import { siteVisitService } from '@/src/domain/siteVisit/services/siteVisitService';

export async function GET(req: NextRequest) {
  const auth = await verifyCustomerAuth(req);
  if (!auth.authorized || !auth.customerId) {
    return NextResponse.json(
      { error: auth.error || 'Authentication required' },
      { status: auth.statusCode || 401 }
    );
  }

  try {
    const visits = await siteVisitService.getCustomerSiteVisits(auth.customerId);
    const response = NextResponse.json({ items: visits, total: visits.length });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to fetch customer site visits', details: error.message },
      { status: 500 }
    );
  }
}
