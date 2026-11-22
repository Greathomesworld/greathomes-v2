import { NextRequest, NextResponse } from 'next/server';
import { verifyCustomerAuth } from '@/src/domain/customer/customerAuth';
import { customerService } from '@/src/domain/customer/services/customerService';
import { partnerService, PartnerDomainError } from '@/src/domain/customer/partnerService';
import { isPersistenceUnavailableError } from '@/src/domain/propertySubmission/repository';
import { extractRequestContext, withCorrelationHeaders } from '@/src/lib/requestContext';

export async function GET(req: NextRequest) {
  const { requestId } = extractRequestContext(req);
  const auth = await verifyCustomerAuth(req);

  if (!auth.authorized || !auth.customerId) {
    const response = NextResponse.json(
      { success: false, error: auth.error || 'Customer authentication required.' },
      { status: auth.statusCode || 401 }
    );
    return withCorrelationHeaders(response, requestId);
  }

  try {
    const customer = await customerService.getProfile(auth.customerId);
    const detail = await partnerService.getCustomerPartnerStatusDetail(auth.customerId);

    const response = NextResponse.json({
      success: true,
      customerId: customer.id,
      phone: customer.phone,
      accountType: detail.accountType,
      isPartner: detail.isPartner,
      status: detail.status,
      eligible: detail.eligible,
      message: detail.message,
      profile: detail.profile,
    });
    return withCorrelationHeaders(response, requestId);
  } catch (err: unknown) {
    if (err instanceof PartnerDomainError) {
      return withCorrelationHeaders(
        NextResponse.json({ success: false, error: err.message, code: err.code }, { status: err.statusCode }),
        requestId
      );
    }
    if (isPersistenceUnavailableError(err)) {
      const response = NextResponse.json(
        {
          success: false,
          error: 'Partner verification service is temporarily unavailable. Please try again later.',
        },
        { status: 503 }
      );
      return withCorrelationHeaders(response, requestId);
    }
    const statusCode =
      err && typeof err === 'object' && 'statusCode' in err && typeof (err as { statusCode?: unknown }).statusCode === 'number'
        ? (err as { statusCode: number }).statusCode
        : 500;
    const message = err instanceof Error ? err.message : 'Unable to verify partner eligibility.';
    const response = NextResponse.json(
      { success: false, error: message },
      { status: statusCode }
    );
    return withCorrelationHeaders(response, requestId);
  }
}
