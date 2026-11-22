import { NextRequest, NextResponse } from 'next/server';
import { verifyStaffCapability } from '@/src/domain/auth/capabilities';
import { editorialService } from '@/src/domain/editorial/services/editorialService';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await verifyStaffCapability(req, 'seo.publish');
  if (!auth.authorized) {
    return NextResponse.json(
      { error: auth.error || 'Forbidden' },
      { status: auth.statusCode || auth.status || 401 }
    );
  }

  try {
    const { id } = await params;
    const updated = await editorialService.publishArticle(auth.staff, req, id);
    if (!updated) {
      return NextResponse.json({ error: 'Article not found for publishing' }, { status: 404 });
    }

    const response = NextResponse.json(updated);
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (error: any) {
    console.error('[Admin Content Publish] Unexpected error:', error?.message || 'Unknown error');
    return NextResponse.json({ error: 'Failed to publish article' }, { status: 500 });
  }
}
