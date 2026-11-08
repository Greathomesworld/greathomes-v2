import { NextRequest, NextResponse } from 'next/server';
import { siteVisitService } from '@/src/domain/siteVisit/services/siteVisitService';
import { checkRateLimit, createRateLimitResponse } from '@/src/lib/rateLimit';
import { extractRequestContext, withCorrelationHeaders } from '@/src/lib/requestContext';

export async function POST(req: NextRequest) {
  const { requestId, ipAddress } = extractRequestContext(req);

  const rateLimitKey = `site_visit_post_${ipAddress || 'anonymous'}`;
  const rateLimitResult = checkRateLimit(rateLimitKey, 60, 60000);

  if (!rateLimitResult.allowed) {
    return createRateLimitResponse(requestId, rateLimitResult);
  }

  try {
    const body = await req.json();

    if (!body.enquiryId) {
      return NextResponse.json(
        { success: false, message: 'Enquiry ID is required to schedule a site visit.' },
        { status: 400 }
      );
    }

    if (!body.preferredDate || !body.preferredTimeWindow) {
      return NextResponse.json(
        { success: false, message: 'Preferred date and time window are required for a site visit.' },
        { status: 400 }
      );
    }

    const visit = await siteVisitService.createSiteVisit(body.enquiryId, {
      customerId: body.customerId || null,
      projectId: body.projectId || null,
      configurationId: body.configurationId || null,
      listingId: body.listingId || null,
      visitType: body.visitType || 'IN_PERSON',
      preferredDate: body.preferredDate,
      preferredTimeWindow: body.preferredTimeWindow,
      buyerNote: body.buyerNote || body.message || null,
    }, req);

    const dto = await siteVisitService.mapToCustomerDto(visit);

    const response = NextResponse.json({
      success: true,
      message: 'Your site visit request has been received by Great Homes.',
      siteVisit: dto,
    }, { status: 201 });

    return withCorrelationHeaders(response, requestId);
  } catch (error: any) {
    console.error('Site Visit API error:', error);
    const response = NextResponse.json(
      { success: false, message: error?.message || 'Failed to create site visit request.' },
      { status: 500 }
    );
    return withCorrelationHeaders(response, requestId);
  }
}
