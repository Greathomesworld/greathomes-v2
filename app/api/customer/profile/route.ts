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
    const profile = await customerService.getProfile(auth.customerId);
    const response = NextResponse.json({ success: true, profile });
    return withCorrelationHeaders(response, requestId);
  } catch (error: any) {
    const response = NextResponse.json(
      { success: false, error: error.message || 'Profile not found' },
      { status: 404 }
    );
    return withCorrelationHeaders(response, requestId);
  }
}

export async function PATCH(req: NextRequest) {
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
    const updated = await customerService.updateProfile(auth.customerId, {
      name: body.name,
      phone: body.phone,
      avatarUrl: body.avatarUrl,
    });

    const response = NextResponse.json({ success: true, profile: updated });
    return withCorrelationHeaders(response, requestId);
  } catch (error: any) {
    const response = NextResponse.json(
      { success: false, error: error.message || 'Failed to update profile' },
      { status: 400 }
    );
    return withCorrelationHeaders(response, requestId);
  }
}
