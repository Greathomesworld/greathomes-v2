import { NextRequest, NextResponse } from 'next/server';
import { ensureSeedData } from '@/src/infrastructure/seed';
import { verifyStaffCapability, hasCapability } from '@/src/domain/auth/capabilities';
import { customerIntelligenceService } from '@/src/domain/visitorIntelligence/services/customerIntelligenceService';
import { auditService } from '@/src/domain/audit/auditService';
import { extractRequestContext, withCorrelationHeaders } from '@/src/lib/requestContext';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
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
    const canViewPii = hasCapability(auth.role, 'customer_intelligence.pii');
    const overview = await customerIntelligenceService.getOverview({ canViewPii });

    await auditService.record(
      req,
      { id: auth.staff?.id, role: auth.role },
      {
        action: 'CUSTOMER_INTELLIGENCE_VIEWED',
        resourceType: 'CUSTOMER_INTELLIGENCE',
        resourceId: 'overview',
        resourceLabel: 'Viewed Visitor & Customer 360 overview',
        metadata: {
          piiRedacted: !canViewPii,
        },
      }
    );

    const response = NextResponse.json({
      success: true,
      data: overview,
      canViewPii,
    });
    response.headers.set('Cache-Control', 'no-store');
    return withCorrelationHeaders(response, requestId);
  } catch (error: any) {
    console.error('[CustomerIntelligence:Overview] Internal error:', error?.message || error);
    return withCorrelationHeaders(
      NextResponse.json(
        { success: false, error: 'Failed to load intelligence overview' },
        { status: 500 }
      ),
      requestId
    );
  }
}
