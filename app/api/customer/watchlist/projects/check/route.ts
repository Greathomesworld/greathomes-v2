import { NextRequest, NextResponse } from 'next/server';
import { verifyCustomerAuth } from '@/src/domain/customer/customerAuth';
import { watchlistService } from '@/src/domain/customer/services/watchlistService';
import { extractRequestContext, withCorrelationHeaders } from '@/src/lib/requestContext';

export async function GET(req: NextRequest) {
  const { requestId } = extractRequestContext(req);
  const auth = await verifyCustomerAuth(req);

  if (!auth.authorized || !auth.customerId) {
    const response = NextResponse.json(
      { success: false, error: auth.error || 'Unauthorized' },
      { status: auth.statusCode || 401 }
    );
    return withCorrelationHeaders(response, requestId);
  }

  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId');

    if (!projectId) {
      const response = NextResponse.json(
        { success: false, error: 'projectId is required' },
        { status: 400 }
      );
      return withCorrelationHeaders(response, requestId);
    }

    const watched = await watchlistService.checkProjectWatch(auth.customerId, projectId);
    const response = NextResponse.json({ success: true, watched });
    return withCorrelationHeaders(response, requestId);
  } catch (error: any) {
    const response = NextResponse.json(
      { success: false, error: error.message || 'Failed to check project watch status' },
      { status: 400 }
    );
    return withCorrelationHeaders(response, requestId);
  }
}
