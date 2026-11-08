import { NextRequest, NextResponse } from 'next/server';
import { editorialService } from '@/src/domain/editorial/services/editorialService';

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    if (!slug) {
      return NextResponse.json({ error: 'Article slug is required' }, { status: 400 });
    }

    const article = await editorialService.getPublicArticleBySlug(slug);
    if (!article) {
      return NextResponse.json({ error: 'Editorial article not found or not published' }, { status: 404 });
    }

    const response = NextResponse.json(article);
    response.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=1800');
    return response;
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to fetch article', details: error.message }, { status: 500 });
  }
}
