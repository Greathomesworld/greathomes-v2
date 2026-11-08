import { NextRequest, NextResponse } from 'next/server';
import { verifyInternalStaff } from '@/src/lib/auth';
import { editorialService } from '@/src/domain/editorial/services/editorialService';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await verifyInternalStaff(req);
  if (!auth.authenticated) {
    return NextResponse.json({ error: 'Unauthorized staff access' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const article = await editorialService.getAdminArticleById(id);
    if (!article) {
      return NextResponse.json({ error: 'Article not found' }, { status: 404 });
    }

    const response = NextResponse.json(article);
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to fetch article', details: error.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await verifyInternalStaff(req);
  if (!auth.authenticated) {
    return NextResponse.json({ error: 'Unauthorized staff access' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await req.json();
    const updated = await editorialService.updateArticle(auth.staff, req, id, body);
    if (!updated) {
      return NextResponse.json({ error: 'Article not found for update' }, { status: 404 });
    }

    const response = NextResponse.json(updated);
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to update article', details: error.message }, { status: 500 });
  }
}
