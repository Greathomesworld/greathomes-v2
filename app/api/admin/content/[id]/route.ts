import { NextRequest, NextResponse } from 'next/server';
import { verifyStaffCapability } from '@/src/domain/auth/capabilities';
import { editorialService } from '@/src/domain/editorial/services/editorialService';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await verifyStaffCapability(req, 'seo.read');
  if (!auth.authorized) {
    return NextResponse.json(
      { error: auth.error || 'Forbidden' },
      { status: auth.statusCode || auth.status || 401 }
    );
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
    console.error('[Admin Content Detail GET] Unexpected error:', error?.message || 'Unknown error');
    return NextResponse.json({ error: 'Failed to fetch article' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await verifyStaffCapability(req, 'seo.update');
  if (!auth.authorized) {
    return NextResponse.json(
      { error: auth.error || 'Forbidden' },
      { status: auth.statusCode || auth.status || 401 }
    );
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
    console.error('[Admin Content Detail PATCH] Unexpected error:', error?.message || 'Unknown error');
    return NextResponse.json({ error: 'Failed to update article' }, { status: 500 });
  }
}
