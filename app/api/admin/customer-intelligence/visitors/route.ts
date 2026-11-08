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
    const { searchParams } = new URL(req.url);
    const onlyAnonymous = searchParams.get('onlyAnonymous') === 'true';
    const limit = searchParams.get('limit') ? Math.min(Number(searchParams.get('limit')), 200) : 50;
    const offset = searchParams.get('offset') ? Math.max(Number(searchParams.get('offset')), 0) : 0;
    const canViewPii = hasCapability(auth.role, 'customer_intelligence.pii');

    const result = await customerIntelligenceService.listVisitors({
      onlyAnonymous,
      limit,
      offset,
    });

    await auditService.record(
      req,
      { id: auth.staff?.id, role: auth.role },
      {
        action: 'CUSTOMER_INTELLIGENCE_VIEWED',
        resourceType: 'VISITOR_INTELLIGENCE',
        resourceId: 'visitors_list',
        resourceLabel: `Viewed Visitor Intelligence directory (${result.items.length} shown)`,
        metadata: {
          onlyAnonymous,
          piiRedacted: !canViewPii,
        },
      }
    );

    const response = NextResponse.json({
      success: true,
      items: result.items,
      total: result.total,
      canViewPii,
    });
    response.headers.set('Cache-Control', 'no-store');
    return withCorrelationHeaders(response, requestId);
  } catch (error: any) {
    console.error('[CustomerIntelligence:Visitors] Internal error:', error?.message || error);
    return withCorrelationHeaders(
      NextResponse.json(
        { success: false, error: 'Failed to load visitors' },
        { status: 500 }
      ),
      requestId
    );
  }
}
