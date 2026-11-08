import { NextRequest, NextResponse } from 'next/server';
import { verifyInternalStaff } from '@/src/lib/auth';
import { editorialService } from '@/src/domain/editorial/services/editorialService';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await verifyInternalStaff(req);
  if (!auth.authenticated) {
    return NextResponse.json({ error: 'Unauthorized staff access' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const updated = await editorialService.approveArticle(auth.staff, req, id);
    if (!updated) {
      return NextResponse.json({ error: 'Article not found for approval' }, { status: 404 });
    }

    const response = NextResponse.json(updated);
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to approve article', details: error.message }, { status: 500 });
  }
}
