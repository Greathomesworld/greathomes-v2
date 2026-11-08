import { NextRequest, NextResponse } from 'next/server';
import { editorialService } from '@/src/domain/editorial/services/editorialService';
import { EditorialContentType } from '@/src/domain/editorial/entities';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const type = (searchParams.get('type') as EditorialContentType) || undefined;
    const projectId = searchParams.get('projectId') || undefined;
    const developerId = searchParams.get('developerId') || undefined;
    const locationId = searchParams.get('locationId') || undefined;
    const search = searchParams.get('search') || undefined;
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));
    const offset = Math.max(0, parseInt(searchParams.get('offset') || '0', 10));

    const result = await editorialService.getPublicArticles({
      type,
      projectId,
      developerId,
      locationId,
      search,
      limit,
      offset,
    });

    const response = NextResponse.json(result);
    response.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=1800');
    return response;
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to fetch public editorial content', details: error.message }, { status: 500 });
  }
}
