import { NextRequest, NextResponse } from 'next/server';
import { verifyCustomerAuth } from '@/src/domain/customer/customerAuth';
import { customerService } from '@/src/domain/customer/services/customerService';
import { partnerService } from '@/src/domain/customer/partnerService';
import { extractRequestContext, withCorrelationHeaders } from '@/src/lib/requestContext';

export async function GET(req: NextRequest) {
  const { requestId } = extractRequestContext(req);
  const auth = await verifyCustomerAuth(req);

  if (!auth.authorized || !auth.customerId) {
    const response = NextResponse.json(
      {
        authenticated: false,
        error: auth.error || 'Unauthorized',
      },
      { status: auth.statusCode || 401 }
    );
    response.headers.set('Cache-Control', 'no-store, max-age=0');
    return withCorrelationHeaders(response, requestId);
  }

  try {
    const customer = await customerService.getProfile(auth.customerId);

    // Authoritative, uncached partner eligibility included directly for LISTING_PARTNER sessions
    // so Page 2 eliminates the sequential /api/customer/auth/me -> /api/customer/partner-status waterfall.
    let partnerEligibility: {
      accountType: string | null;
      isPartner: boolean;
      status: string | null;
      eligible: boolean;
      message: string | null;
      profile: Record<string, unknown> | null;
    } | null = null;

    if (customer.accountType === 'LISTING_PARTNER') {
      try {
        const detail = await partnerService.getCustomerPartnerStatusDetail(auth.customerId);
        partnerEligibility = {
          accountType: detail.accountType,
          isPartner: detail.isPartner,
          status: detail.status,
          eligible: detail.eligible,
          message: detail.message,
          profile: detail.profile as Record<string, unknown> | null,
        };
      } catch {
        // Non-fatal: client falls back to /api/customer/partner-status if needed
        partnerEligibility = null;
      }
    }

    const response = NextResponse.json({
      authenticated: true,
      customer,
      partnerEligibility,
    });
    response.headers.set('Cache-Control', 'no-store, max-age=0');
    return withCorrelationHeaders(response, requestId);
  } catch (error: any) {
    const response = NextResponse.json(
      {
        authenticated: false,
        error: error.message || 'Customer profile not found',
      },
      { status: 404 }
    );
    response.headers.set('Cache-Control', 'no-store, max-age=0');
    return withCorrelationHeaders(response, requestId);
  }
}
