import { NextRequest, NextResponse } from 'next/server';
import { verifyCustomerAuth } from '@/src/domain/customer/customerAuth';
import { notificationService } from '@/src/domain/customer/services/notificationService';
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
    const unreadCount = await notificationService.getUnreadCountDisplay(auth.customerId);
    const response = NextResponse.json({ success: true, unreadCount });
    return withCorrelationHeaders(response, requestId);
  } catch (error: any) {
    const response = NextResponse.json(
      { success: false, error: error.message || 'Failed to get unread notifications count' },
      { status: 500 }
    );
    return withCorrelationHeaders(response, requestId);
  }
}
