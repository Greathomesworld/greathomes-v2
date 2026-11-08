import { NextRequest, NextResponse } from 'next/server';
import { verifyCustomerAuth } from '@/src/domain/customer/customerAuth';
import { customerPreferenceRepository } from '@/src/domain/customer/repositories/index';
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
    const prefs = await customerPreferenceRepository.findByCustomerId(auth.customerId);
    
    // Fallback/defaults if no preferences exist
    const defaultPrefs = {
      emailAlertsEnabled: prefs?.emailAlertsEnabled ?? true,
      inAppAlertsEnabled: prefs?.inAppAlertsEnabled ?? true,
      newLaunchAlerts: prefs?.newLaunchAlerts ?? true,
      priceDropAlerts: prefs?.priceDropAlerts ?? true,
      projectStatusAlerts: prefs?.projectStatusAlerts ?? true,
      reraAlerts: prefs?.reraAlerts ?? true,
      priceChangeAlerts: prefs?.priceChangeAlerts ?? true,
      configurationAlerts: prefs?.configurationAlerts ?? true,
      locationAlerts: prefs?.locationAlerts ?? true,
      resaleAlerts: prefs?.resaleAlerts ?? true,
      rentalAlerts: prefs?.rentalAlerts ?? true,
      marketingEmailsEnabled: prefs?.marketingEmailsEnabled ?? false,
    };

    const response = NextResponse.json({ success: true, preferences: defaultPrefs });
    return withCorrelationHeaders(response, requestId);
  } catch (error: any) {
    const response = NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch alert preferences' },
      { status: 500 }
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
    
    // Exclude arbitrary JSON, only allow the supported alert preferences
    const allowedKeys = [
      'emailAlertsEnabled',
      'inAppAlertsEnabled',
      'newLaunchAlerts',
      'priceDropAlerts',
      'projectStatusAlerts',
      'reraAlerts',
      'priceChangeAlerts',
      'configurationAlerts',
      'locationAlerts',
      'resaleAlerts',
      'rentalAlerts',
      'marketingEmailsEnabled',
    ];

    const patchData: any = {};
    for (const key of allowedKeys) {
      if (body[key] !== undefined) {
        patchData[key] = Boolean(body[key]);
      }
    }

    const updated = await customerPreferenceRepository.upsert(auth.customerId, patchData);
    const response = NextResponse.json({ success: true, preferences: updated });
    return withCorrelationHeaders(response, requestId);
  } catch (error: any) {
    const response = NextResponse.json(
      { success: false, error: error.message || 'Failed to update alert preferences' },
      { status: 400 }
    );
    return withCorrelationHeaders(response, requestId);
  }
}
