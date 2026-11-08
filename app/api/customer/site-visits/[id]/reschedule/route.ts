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
    const body = await req.json();

    if (!body.preferredDate || !body.preferredTimeWindow) {
      return NextResponse.json(
        { error: 'Preferred date and time window are required for rescheduling.' },
        { status: 400 }
      );
    }

    const updated = await siteVisitService.customerRequestReschedule(
      auth.customerId,
      id,
      body.preferredDate,
      body.preferredTimeWindow,
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
      { error: error.message || 'Failed to request reschedule' },
      { status: 400 }
    );
  }
}
