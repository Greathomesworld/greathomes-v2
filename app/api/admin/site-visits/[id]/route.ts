import { NextRequest, NextResponse } from 'next/server';
import { verifyInternalStaff } from '@/src/lib/auth';
import { siteVisitService } from '@/src/domain/siteVisit/services/siteVisitService';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await verifyInternalStaff(req);
  if (!auth.authorized && !auth.authenticated) {
    return NextResponse.json({ error: 'Unauthorized staff access' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const visit = await siteVisitService.getAdminSiteVisitById(id);
    if (!visit) {
      return NextResponse.json({ error: 'Site visit not found' }, { status: 404 });
    }

    const response = NextResponse.json(visit);
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to fetch site visit detail', details: error.message }, { status: 500 });
  }
}
