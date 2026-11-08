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
    const preferences = await customerService.getPreferences(auth.customerId);
    const response = NextResponse.json({ success: true, preferences });
    return withCorrelationHeaders(response, requestId);
  } catch (error: any) {
    const response = NextResponse.json(
      { success: false, error: error.message || 'Failed to get preferences' },
      { status: 500 }
    );
    return withCorrelationHeaders(response, requestId);
  }
}

export async function PUT(req: NextRequest) {
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
    const updated = await customerService.updatePreferences(auth.customerId, {
      preferredMode: body.preferredMode,
      preferredLocations: body.preferredLocations,
      preferredBhk: body.preferredBhk,
      preferredPropertyTypes: body.preferredPropertyTypes,
      budgetMin: body.budgetMin,
      budgetMax: body.budgetMax,
      emailAlertsEnabled: body.emailAlertsEnabled,
      newLaunchAlerts: body.newLaunchAlerts,
      priceDropAlerts: body.priceDropAlerts,
    });

    const response = NextResponse.json({ success: true, preferences: updated });
    return withCorrelationHeaders(response, requestId);
  } catch (error: any) {
    const response = NextResponse.json(
      { success: false, error: error.message || 'Failed to update preferences' },
      { status: 400 }
    );
    return withCorrelationHeaders(response, requestId);
  }
}
