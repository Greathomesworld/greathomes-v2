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
    const canViewPii = hasCapability(auth.role, 'customer_intelligence.pii');

    const parseBool = (val: string | null): boolean | undefined => {
      if (val === 'true' || val === '1') return true;
      if (val === 'false' || val === '0') return false;
      return undefined;
    };

    const filter = {
      search: searchParams.get('search') || undefined,
      status: (searchParams.get('status') as any) || undefined,
      hasEnquiry: parseBool(searchParams.get('hasEnquiry')),
      hasSiteVisit: parseBool(searchParams.get('hasSiteVisit')),
      hasSavedItems: parseBool(searchParams.get('hasSavedItems')),
      preferredLocation: searchParams.get('preferredLocation') || undefined,
      preferredBhk: searchParams.get('preferredBhk') || undefined,
      activeWithinDays: searchParams.get('activeWithinDays')
        ? Number(searchParams.get('activeWithinDays'))
        : undefined,
      sortBy: (searchParams.get('sortBy') as any) || 'lastActiveAt',
      sortOrder: (searchParams.get('sortOrder') as any) || 'desc',
      limit: searchParams.get('limit') ? Math.min(Number(searchParams.get('limit')), 200) : 50,
      offset: searchParams.get('offset') ? Math.max(Number(searchParams.get('offset')), 0) : 0,
    };

    const result = await customerIntelligenceService.listCustomers(filter, {
      staffId: auth.staff?.id || 'staff',
      role: auth.role,
      canViewPii,
    });

    await auditService.record(req, { id: auth.staff?.id, role: auth.role }, {
      action: 'CUSTOMER_INTELLIGENCE_VIEWED',
      resourceType: 'CUSTOMER_INTELLIGENCE',
      resourceId: 'directory',
      resourceLabel: `Viewed Customer 360 directory (${result.items.length} of ${result.total} customers)`,
      metadata: {
        piiRedacted: !canViewPii,
        search: canViewPii ? filter.search || null : filter.search ? '[REDACTED_NON_PII_SEARCH]' : null,
        hasEnquiry: filter.hasEnquiry ?? null,
        hasSiteVisit: filter.hasSiteVisit ?? null,
      },
    });

    const response = NextResponse.json({
      success: true,
      items: result.items,
      total: result.total,
      canViewPii,
    });
    response.headers.set('Cache-Control', 'no-store');
    return withCorrelationHeaders(response, requestId);
  } catch (error: any) {
    console.error('[CustomerIntelligence:Customers] Internal error:', error?.message || error);
    return withCorrelationHeaders(
      NextResponse.json(
        { success: false, error: 'Failed to load customer intelligence directory' },
        { status: 500 }
      ),
      requestId
    );
  }
}
