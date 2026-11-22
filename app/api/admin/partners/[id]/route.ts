import { NextRequest, NextResponse } from 'next/server';
import { verifyStaffCapability } from '@/src/domain/auth/capabilities';
import { partnerService, PartnerDomainError } from '@/src/domain/customer/partnerService';
import { extractRequestContext, withCorrelationHeaders } from '@/src/lib/requestContext';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const { requestId } = extractRequestContext(req);
  const auth = await verifyStaffCapability(req, 'partner.read');

  if (!auth.authorized) {
    return withCorrelationHeaders(
      NextResponse.json(
        { success: false, error: auth.error || 'Forbidden' },
        { status: auth.statusCode || 403 }
      ),
      requestId
    );
  }

  try {
    const { id } = await props.params;
    const detail = await partnerService.getPartnerDetailForAdmin(id);
    return withCorrelationHeaders(
      NextResponse.json({
        success: true,
        ...detail,
      }),
      requestId
    );
  } catch (err: unknown) {
    if (err instanceof PartnerDomainError) {
      return withCorrelationHeaders(
        NextResponse.json({ success: false, error: err.message, code: err.code }, { status: err.statusCode }),
        requestId
      );
    }
    return withCorrelationHeaders(
      NextResponse.json({ success: false, error: 'Failed to load partner profile detail.' }, { status: 500 }),
      requestId
    );
  }
}
