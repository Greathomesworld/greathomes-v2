import { NextRequest, NextResponse } from 'next/server';
import { verifyInternalStaff } from '@/src/lib/auth';
import { editorialService } from '@/src/domain/editorial/services/editorialService';
import { EditorialContentType, EditorialStatus } from '@/src/domain/editorial/entities';

export async function GET(req: NextRequest) {
  const auth = await verifyInternalStaff(req);
  if (!auth.authenticated) {
    return NextResponse.json({ error: 'Unauthorized staff access' }, { status: 401 });
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
    return NextResponse.json({ error: 'Failed to list admin articles', details: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await verifyInternalStaff(req);
  if (!auth.authenticated) {
    return NextResponse.json({ error: 'Unauthorized staff access' }, { status: 401 });
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
    return NextResponse.json({ error: 'Failed to create article', details: error.message }, { status: 500 });
  }
}
