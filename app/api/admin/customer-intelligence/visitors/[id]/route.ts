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
    const canViewPii = hasCapability(auth.role, 'customer_intelligence.pii');

    const detail = await customerIntelligenceService.getVisitorDetail(id, {
      staffId: auth.staff?.id || 'staff',
      role: auth.role,
      canViewPii,
    });

    if (!detail) {
      return withCorrelationHeaders(
        NextResponse.json(
          { success: false, error: 'Visitor record not found' },
          { status: 404 }
        ),
        requestId
      );
    }

    await auditService.record(req, { id: auth.staff?.id, role: auth.role }, {
      action: 'CUSTOMER_INTELLIGENCE_VIEWED',
      resourceType: 'VISITOR_INTELLIGENCE',
      resourceId: id,
      resourceLabel: `Viewed Visitor 360 session timeline (${id})`,
      metadata: {
        visitorId: id,
        linkedCustomerId: detail.visitor.customerId,
        piiRedacted: !canViewPii,
      },
    });

    const response = NextResponse.json({
      success: true,
      data: detail,
    });
    response.headers.set('Cache-Control', 'no-store');
    return withCorrelationHeaders(response, requestId);
  } catch (error: any) {
    console.error('[CustomerIntelligence:VisitorDetail] Internal error:', error?.message || error);
    return withCorrelationHeaders(
      NextResponse.json(
        { success: false, error: 'Failed to load visitor detail' },
        { status: 500 }
      ),
      requestId
    );
  }
}
