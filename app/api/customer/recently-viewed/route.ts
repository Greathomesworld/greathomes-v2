import { NextRequest, NextResponse } from 'next/server';
import { verifyCustomerAuth } from '@/src/domain/customer/customerAuth';
import { customerService } from '@/src/domain/customer/services/customerService';
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
    const limit = Math.min(20, parseInt(searchParams.get('limit') || '20', 10));

    const items = await customerService.listRecentlyViewed(auth.customerId, limit);
    const response = NextResponse.json({ success: true, items });
    return withCorrelationHeaders(response, requestId);
  } catch (error: any) {
    const response = NextResponse.json(
      { success: false, error: error.message || 'Failed to list recently viewed' },
      { status: 500 }
    );
    return withCorrelationHeaders(response, requestId);
  }
}

export async function POST(req: NextRequest) {
  const { requestId } = extractRequestContext(req);
  const auth = await verifyCustomerAuth(req);

  if (!auth.authorized || !auth.customerId) {
    // If not authenticated, do not error; simply ignore recording silently
    const response = NextResponse.json({ success: false, authenticated: false });
    return withCorrelationHeaders(response, requestId);
  }

  try {
    const body = await req.json();
    const { resourceType, resourceId } = body;

    if (!resourceType || !resourceId) {
      const response = NextResponse.json(
        { success: false, error: 'resourceType and resourceId are required' },
        { status: 400 }
      );
      return withCorrelationHeaders(response, requestId);
    }

    const recorded = await customerService.recordRecentlyViewed(
      auth.customerId,
      resourceType,
      resourceId
    );

    const response = NextResponse.json({ success: true, item: recorded });
    return withCorrelationHeaders(response, requestId);
  } catch (error: any) {
    const response = NextResponse.json(
      { success: false, error: error.message || 'Failed to record view' },
      { status: 400 }
    );
    return withCorrelationHeaders(response, requestId);
  }
}

export async function DELETE(req: NextRequest) {
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
    const cleared = await customerService.clearRecentlyViewed(auth.customerId);
    const response = NextResponse.json({ success: true, cleared });
    return withCorrelationHeaders(response, requestId);
  } catch (error: any) {
    const response = NextResponse.json(
      { success: false, error: error.message || 'Failed to clear recently viewed' },
      { status: 500 }
    );
    return withCorrelationHeaders(response, requestId);
  }
}
