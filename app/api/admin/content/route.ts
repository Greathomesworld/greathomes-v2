import { NextRequest, NextResponse } from 'next/server';
import { verifyStaffCapability } from '@/src/domain/auth/capabilities';
import { editorialService } from '@/src/domain/editorial/services/editorialService';
import { EditorialContentType, EditorialStatus } from '@/src/domain/editorial/entities';

export async function GET(req: NextRequest) {
  const auth = await verifyStaffCapability(req, 'seo.read');
  if (!auth.authorized) {
    return NextResponse.json(
      { error: auth.error || 'Forbidden' },
      { status: auth.statusCode || auth.status || 401 }
    );
  }

  try {
    const { searchParams } = new URL(req.url);
    const type = (searchParams.get('type') as EditorialContentType) || undefined;
    const status = (searchParams.get('status') as EditorialStatus) || undefined;
    const search = searchParams.get('search') || undefined;
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)));
    const offset = Math.max(0, parseInt(searchParams.get('offset') || '0', 10));

    const result = await editorialService.listAdminArticles({ type, status, search, limit, offset });
    const response = NextResponse.json(result);
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (error: any) {
    console.error('[Admin Content GET] Unexpected error:', error?.message || 'Unknown error');
    return NextResponse.json({ error: 'Failed to list admin articles' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await verifyStaffCapability(req, 'seo.create');
  if (!auth.authorized) {
    return NextResponse.json(
      { error: auth.error || 'Forbidden' },
      { status: auth.statusCode || auth.status || 401 }
    );
  }

  try {
    const body = await req.json();
    if (!body.title || !body.slug || !body.excerpt || !body.body || !body.type) {
      return NextResponse.json({ error: 'Missing required article fields (title, slug, excerpt, body, type)' }, { status: 400 });
    }

    const created = await editorialService.createArticle(auth.staff, req, body);
    const response = NextResponse.json(created, { status: 201 });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (error: any) {
    console.error('[Admin Content POST] Unexpected error:', error?.message || 'Unknown error');
    return NextResponse.json({ error: 'Failed to create article' }, { status: 500 });
  }
}
