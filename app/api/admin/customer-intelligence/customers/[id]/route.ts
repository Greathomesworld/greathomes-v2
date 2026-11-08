import { NextRequest, NextResponse } from 'next/server';
import { ensureSeedData } from '@/src/infrastructure/seed';
import { verifyStaffCapability, hasCapability } from '@/src/domain/auth/capabilities';
import { customerIntelligenceService } from '@/src/domain/visitorIntelligence/services/customerIntelligenceService';
import { auditService } from '@/src/domain/audit/auditService';
import { extractRequestContext, withCorrelationHeaders } from '@/src/lib/requestContext';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { requestId } = extractRequestContext(req);
  const auth = await verifyStaffCapability(req, 'customer_intelligence.read');
  if (!auth.authorized || !auth.role) {
    return withCorrelationHeaders(
      NextResponse.json(
        { success: false, error: auth.error || 'Unauthorized' },
        { status: auth.status || auth.statusCode || 401 }
      ),
      requestId
    );
  }

  try {
    await ensureSeedData();
    const { id } = await context.params;
    const { searchParams } = new URL(req.url);
    const category = searchParams.get('category') || 'ALL';
    const canViewPii = hasCapability(auth.role, 'customer_intelligence.pii');

    const profile = await customerIntelligenceService.getCustomer360(
      id,
      {
        staffId: auth.staff?.id || 'staff',
        role: auth.role,
        canViewPii,
      },
      category
    );

    if (!profile) {
      return withCorrelationHeaders(
        NextResponse.json(
          { success: false, error: 'Customer profile not found' },
          { status: 404 }
        ),
        requestId
      );
    }

    await auditService.record(req, { id: auth.staff?.id, role: auth.role }, {
      action: 'CUSTOMER_INTELLIGENCE_VIEWED',
      resourceType: 'CUSTOMER_INTELLIGENCE',
      resourceId: id,
      resourceLabel: `Viewed Customer 360 profile for ${profile.customer.name} (${id})`,
      metadata: {
        customerId: id,
        piiRedacted: !canViewPii,
        timelineCategory: category,
      },
    });

    const response = NextResponse.json({
      success: true,
      data: profile,
      canViewPii,
    });
    response.headers.set('Cache-Control', 'no-store');
    return withCorrelationHeaders(response, requestId);
  } catch (error: any) {
    console.error('[CustomerIntelligence:CustomerDetail] Internal error:', error?.message || error);
    return withCorrelationHeaders(
      NextResponse.json(
        { success: false, error: 'Failed to load Customer 360 profile' },
        { status: 500 }
      ),
      requestId
    );
  }
}
