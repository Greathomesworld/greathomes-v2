import { NextRequest, NextResponse } from 'next/server';
import { verifyStaffCapability } from '@/src/domain/auth/capabilities';
import { extractRequestContext, withCorrelationHeaders } from '@/src/lib/requestContext';
import { auditDataQuality } from '@/src/domain/marketIntelligence/validation/dataQualityChecker';
import { getDb } from '@/src/db/client';
import { projects, resaleListings, rentalListings, locations } from '@/src/db/schema';

export async function GET(req: NextRequest) {
  const { requestId } = extractRequestContext(req);

  const auth = await verifyStaffCapability(req, 'location.read');
  if (!auth.authorized) {
    const res = NextResponse.json(
      { success: false, error: 'FORBIDDEN', message: auth.error || 'Unauthorized' },
      { status: auth.statusCode || 401 }
    );
    return withCorrelationHeaders(res, requestId);
  }

  try {
    const db = getDb();
    if (!db) {
      const res = NextResponse.json({ success: false, error: 'Database unavailable' }, { status: 500 });
      return withCorrelationHeaders(res, requestId);
    }

    const [projRows, resaleRows, rentalRows, locationRows] = await Promise.all([
      db.select().from(projects),
      db.select().from(resaleListings),
      db.select().from(rentalListings),
      db.select().from(locations),
    ]);

    const issues = auditDataQuality({
      projects: projRows,
      resaleListings: resaleRows,
      rentalListings: rentalRows,
      locations: locationRows,
    });

    const response = NextResponse.json({
      success: true,
      dataQuality: {
        totalIssues: issues.length,
        criticalCount: issues.filter(i => i.severity === 'CRITICAL').length,
        warningCount: issues.filter(i => i.severity === 'WARNING').length,
        issues,
      },
    });

    return withCorrelationHeaders(response, requestId);
  } catch (err: any) {
    const res = NextResponse.json({ success: false, error: err.message || 'Internal Server Error' }, { status: 500 });
    return withCorrelationHeaders(res, requestId);
  }
}
