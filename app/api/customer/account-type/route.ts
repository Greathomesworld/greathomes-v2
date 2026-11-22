import { NextRequest, NextResponse } from 'next/server';
import { verifyCustomerAuth } from '@/src/domain/customer/customerAuth';
import { partnerService, PartnerDomainError } from '@/src/domain/customer/partnerService';
import { extractRequestContext, withCorrelationHeaders } from '@/src/lib/requestContext';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { requestId } = extractRequestContext(req);
  const auth = await verifyCustomerAuth(req);

  if (!auth.authorized || !auth.customerId) {
    return withCorrelationHeaders(
      NextResponse.json(
        { success: false, error: auth.error || 'Customer authentication required.' },
        { status: auth.statusCode || 401 }
      ),
      requestId
    );
  }

  try {
    const detail = await partnerService.getCustomerPartnerStatusDetail(auth.customerId);
    return withCorrelationHeaders(
      NextResponse.json({
        success: true,
        accountType: detail.accountType,
        partnerStatus: detail.status === 'NONE' ? null : detail.status,
        eligible: detail.eligible,
        status: detail.status,
        message: detail.message,
        profile: detail.profile,
      }),
      requestId
    );
  } catch (err: unknown) {
    if (err instanceof PartnerDomainError) {
      return withCorrelationHeaders(
        NextResponse.json(
          {
            success: false,
            error: err.message,
            code: err.code,
          },
          { status: err.statusCode }
        ),
        requestId
      );
    }
    return withCorrelationHeaders(
      NextResponse.json(
        { success: false, error: 'Unable to load customer account type right now.' },
        { status: 500 }
      ),
      requestId
    );
  }
}

export async function POST(req: NextRequest) {
  const { requestId } = extractRequestContext(req);
  const auth = await verifyCustomerAuth(req);

  if (!auth.authorized || !auth.customerId) {
    return withCorrelationHeaders(
      NextResponse.json(
        { success: false, error: auth.error || 'Customer authentication required.' },
        { status: auth.statusCode || 401 }
      ),
      requestId
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return withCorrelationHeaders(
      NextResponse.json({ success: false, error: 'Invalid request payload.' }, { status: 400 }),
      requestId
    );
  }

  try {
    const result = await partnerService.completeCustomerAccountType(
      auth.customerId,
      {
        accountType: body?.accountType,
        agencyName: body?.agencyName,
        businessAddress: body?.businessAddress,
        locality: body?.locality,
        city: body?.city,
        agencyContactPhone: body?.agencyContactPhone,
        declarationAccepted: body?.declarationAccepted,
      },
      req
    );

    return withCorrelationHeaders(
      NextResponse.json({
        success: true,
        customer: result.customer,
        partnerStatus: result.partnerStatus,
      }),
      requestId
    );
  } catch (err: unknown) {
    if (err instanceof PartnerDomainError) {
      return withCorrelationHeaders(
        NextResponse.json(
          {
            success: false,
            error: err.message,
            code: err.code,
            fieldErrors: err.fieldErrors,
          },
          { status: err.statusCode }
        ),
        requestId
      );
    }
    return withCorrelationHeaders(
      NextResponse.json(
        { success: false, error: 'Unable to update account type right now.' },
        { status: 500 }
      ),
      requestId
    );
  }
}

export async function PATCH(req: NextRequest) {
  const { requestId } = extractRequestContext(req);
  const auth = await verifyCustomerAuth(req);

  if (!auth.authorized || !auth.customerId) {
    return withCorrelationHeaders(
      NextResponse.json(
        { success: false, error: auth.error || 'Customer authentication required.' },
        { status: auth.statusCode || 401 }
      ),
      requestId
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return withCorrelationHeaders(
      NextResponse.json({ success: false, error: 'Invalid request payload.' }, { status: 400 }),
      requestId
    );
  }

  try {
    const result = await partnerService.resubmitPartnerApplication(
      auth.customerId,
      {
        agencyName: body?.agencyName,
        businessAddress: body?.businessAddress,
        locality: body?.locality,
        city: body?.city,
        agencyContactPhone: body?.agencyContactPhone,
        declarationAccepted: body?.declarationAccepted,
      },
      req
    );

    return withCorrelationHeaders(
      NextResponse.json({
        success: true,
        profileId: result.profileId,
        status: result.status,
      }),
      requestId
    );
  } catch (err: unknown) {
    if (err instanceof PartnerDomainError) {
      return withCorrelationHeaders(
        NextResponse.json(
          {
            success: false,
            error: err.message,
            code: err.code,
            fieldErrors: err.fieldErrors,
          },
          { status: err.statusCode }
        ),
        requestId
      );
    }
    return withCorrelationHeaders(
      NextResponse.json(
        { success: false, error: 'Unable to resubmit partner application right now.' },
        { status: 500 }
      ),
      requestId
    );
  }
}
