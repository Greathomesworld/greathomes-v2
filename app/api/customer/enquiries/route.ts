import { NextRequest, NextResponse } from 'next/server';
import { verifyCustomerAuth } from '@/src/domain/customer/customerAuth';
import { enquiryService } from '@/src/domain/enquiry/services/enquiryService';

export async function GET(req: NextRequest) {
  const auth = await verifyCustomerAuth(req);
  if (!auth.authorized || !auth.customerId) {
    return NextResponse.json(
      { error: auth.error || 'Authentication required' },
      { status: auth.statusCode || 401 }
    );
  }

  try {
    const enquiries = await enquiryService.getCustomerEnquiries(auth.customerId);
    const response = NextResponse.json({ items: enquiries, total: enquiries.length });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to fetch customer enquiries', details: error.message },
      { status: 500 }
    );
  }
}
