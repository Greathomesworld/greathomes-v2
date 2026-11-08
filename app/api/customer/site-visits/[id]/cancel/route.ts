import { NextRequest, NextResponse } from 'next/server';
import { verifyCustomerAuth } from '@/src/domain/customer/customerAuth';
import { siteVisitService } from '@/src/domain/siteVisit/services/siteVisitService';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await verifyCustomerAuth(req);
  if (!auth.authorized || !auth.customerId) {
    return NextResponse.json(
      { error: auth.error || 'Authentication required' },
      { status: auth.statusCode || 401 }
    );
  }

  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));

    const updated = await siteVisitService.customerCancelVisit(
      auth.customerId,
      id,
      body.reason,
      req
    );

    if (!updated) {
      return NextResponse.json(
        { error: 'Site visit request not found or not authorized' },
        { status: 404 }
      );
    }

    const response = NextResponse.json(updated);
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to cancel site visit' },
      { status: 400 }
    );
  }
}
