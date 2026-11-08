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
    const items = await watchlistService.getLocationWatchlist(auth.customerId);
    const response = NextResponse.json({ success: true, items });
    return withCorrelationHeaders(response, requestId);
  } catch (error: any) {
    const response = NextResponse.json(
      { success: false, error: error.message || 'Failed to list location watchlist' },
      { status: 500 }
    );
    return withCorrelationHeaders(response, requestId);
  }
}

export async function POST(req: NextRequest) {
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
    const body = await req.json();
    const { locationId, enabled } = body;

    if (!locationId) {
      const response = NextResponse.json(
        { success: false, error: 'locationId is required' },
        { status: 400 }
      );
      return withCorrelationHeaders(response, requestId);
    }

    const watch = await watchlistService.watchLocation(auth.customerId, locationId, enabled !== false);
    const response = NextResponse.json({ success: true, watch }, { status: 201 });
    return withCorrelationHeaders(response, requestId);
  } catch (error: any) {
    const response = NextResponse.json(
      { success: false, error: error.message || 'Failed to watch location' },
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
    const { searchParams } = new URL(req.url);
    const locationId = searchParams.get('locationId');

    if (!locationId) {
      const response = NextResponse.json(
        { success: false, error: 'locationId is required' },
        { status: 400 }
      );
      return withCorrelationHeaders(response, requestId);
    }

    const unwatched = await watchlistService.unwatchLocation(auth.customerId, locationId);
    const response = NextResponse.json({ success: true, deleted: unwatched });
    return withCorrelationHeaders(response, requestId);
  } catch (error: any) {
    const response = NextResponse.json(
      { success: false, error: error.message || 'Failed to unwatch location' },
      { status: 400 }
    );
    return withCorrelationHeaders(response, requestId);
  }
}
