import { NextRequest, NextResponse } from 'next/server';
import { verifyCustomerAuth } from '@/src/domain/customer/customerAuth';
import { customerService } from '@/src/domain/customer/services/customerService';
import { extractRequestContext, withCorrelationHeaders } from '@/src/lib/requestContext';

export async function GET(req: NextRequest) {
  const { requestId } = extractRequestContext(req);
  const auth = await verifyCustomerAuth(req);

  if (!auth.authorized || !auth.customerId) {
    // For unauthenticated users, isSaved is simply false, don't error
    const response = NextResponse.json({ saved: false, authenticated: false });
    return withCorrelationHeaders(response, requestId);
  }

  try {
    const { searchParams } = new URL(req.url);
    const resourceType = searchParams.get('resourceType') as any;
    const resourceId = searchParams.get('resourceId');

    if (!resourceType || !resourceId) {
      const response = NextResponse.json(
        { error: 'resourceType and resourceId are required' },
        { status: 400 }
      );
      return withCorrelationHeaders(response, requestId);
    }

    const saved = await customerService.isItemSaved(auth.customerId, resourceType, resourceId);
    const response = NextResponse.json({ saved, authenticated: true });
    return withCorrelationHeaders(response, requestId);
  } catch (error: any) {
    const response = NextResponse.json(
      { error: error.message || 'Failed to check saved state' },
      { status: 500 }
    );
    return withCorrelationHeaders(response, requestId);
  }
}
