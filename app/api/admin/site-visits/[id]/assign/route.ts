import { NextRequest, NextResponse } from 'next/server';
import { verifyInternalStaff } from '@/src/lib/auth';
import { siteVisitService } from '@/src/domain/siteVisit/services/siteVisitService';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await verifyInternalStaff(req);
  if (!auth.authorized && !auth.authenticated) {
    return NextResponse.json({ error: 'Unauthorized staff access' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await req.json();

    if (!body.staffId || !body.staffName) {
      return NextResponse.json({ error: 'staffId and staffName are required' }, { status: 400 });
    }

    const updated = await siteVisitService.assignStaff(
      auth.staff || null,
      req,
      id,
      body.staffId,
      body.staffName
    );

    if (!updated) {
      return NextResponse.json({ error: 'Site visit not found' }, { status: 404 });
    }

    const response = NextResponse.json(updated);
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to assign staff' }, { status: 400 });
  }
}
