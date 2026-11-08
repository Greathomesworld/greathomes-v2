import { NextRequest, NextResponse } from 'next/server';
import { verifyInternalStaff } from '@/src/lib/auth';
import { siteVisitService } from '@/src/domain/siteVisit/services/siteVisitService';
import { SiteVisitStatus } from '@/src/domain/siteVisit/entities/siteVisitEntity';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await verifyInternalStaff(req);
  if (!auth.authorized && !auth.authenticated) {
    return NextResponse.json({ error: 'Unauthorized staff access' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await req.json();

    if (!body.status) {
      return NextResponse.json({ error: 'Status is required' }, { status: 400 });
    }

    const updated = await siteVisitService.updateAdminStatus(
      auth.staff || null,
      req,
      id,
      body.status as SiteVisitStatus,
      body.notes || body.staffNote
    );

    if (!updated) {
      return NextResponse.json({ error: 'Site visit not found or update failed' }, { status: 404 });
    }

    const response = NextResponse.json(updated);
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to update site visit status' }, { status: 400 });
  }
}
