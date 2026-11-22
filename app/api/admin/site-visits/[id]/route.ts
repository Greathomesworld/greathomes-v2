import { NextRequest, NextResponse } from 'next/server';
import { verifyStaffCapability } from '@/src/domain/auth/capabilities';
import { siteVisitService } from '@/src/domain/siteVisit/services/siteVisitService';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await verifyStaffCapability(req, 'enquiry.read');
  if (!auth.authorized) {
    return NextResponse.json(
      { error: auth.error || 'Forbidden' },
      { status: auth.statusCode || auth.status || 401 }
    );
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
    console.error('[Admin Site Visit Detail GET] Unexpected error:', error?.message || 'Unknown error');
    return NextResponse.json({ error: 'Failed to fetch site visit detail' }, { status: 500 });
  }
}
