import { NextRequest, NextResponse } from 'next/server';
import { verifyInternalStaff } from '@/src/lib/auth';
import { siteVisitService } from '@/src/domain/siteVisit/services/siteVisitService';
import { SiteVisitStatus } from '@/src/domain/siteVisit/entities/siteVisitEntity';

export async function GET(req: NextRequest) {
  const auth = await verifyInternalStaff(req);
  if (!auth.authorized && !auth.authenticated) {
    return NextResponse.json({ error: 'Unauthorized staff access' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const status = (searchParams.get('status') as SiteVisitStatus) || undefined;
    const projectId = searchParams.get('projectId') || undefined;
    const listingId = searchParams.get('listingId') || undefined;
    const assignedTo = searchParams.get('assignedTo') || undefined;
    const fromDate = searchParams.get('fromDate') || undefined;
    const toDate = searchParams.get('toDate') || undefined;
    const search = searchParams.get('search') || undefined;
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)));
    const offset = Math.max(0, parseInt(searchParams.get('offset') || '0', 10));

    const result = await siteVisitService.listAdminSiteVisits({
      status,
      projectId,
      listingId,
      assignedTo,
      fromDate,
      toDate,
      search,
      limit,
      offset,
    });

    const response = NextResponse.json(result);
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to list admin site visits', details: error.message }, { status: 500 });
  }
}
