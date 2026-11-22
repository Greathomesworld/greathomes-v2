import { NextRequest, NextResponse } from 'next/server';
import { verifyStaffCapability } from '@/src/domain/auth/capabilities';
import { partnerService, PartnerDomainError } from '@/src/domain/customer/partnerService';
import { extractRequestContext, withCorrelationHeaders } from '@/src/lib/requestContext';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
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
    const sp = req.nextUrl.searchParams;
    const status = sp.get('status') || 'ALL';
    const search = sp.get('search') || undefined;
    const page = Number(sp.get('page') || '1') || 1;
    const limit = Number(sp.get('limit') || '25') || 25;

    const data = await partnerService.listPartnersForAdmin({
      status,
      search,
      page,
      limit,
    });

    return withCorrelationHeaders(
      NextResponse.json({
        success: true,
        ...data,
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
      NextResponse.json({ success: false, error: 'Failed to load partner applications.' }, { status: 500 }),
      requestId
    );
  }
}
