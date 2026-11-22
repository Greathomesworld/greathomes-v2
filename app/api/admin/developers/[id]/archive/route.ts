import { NextRequest, NextResponse } from 'next/server';
import { verifyStaffCapability } from '@/src/domain/auth/capabilities';
import { developerService, NotFoundError } from '@/src/domain/developers/services/developerService';
import { ensureSeedData } from '@/src/infrastructure/seed';

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await verifyStaffCapability(req, 'developer.archive');
  if (!auth.authorized) {
    return NextResponse.json(
      { error: auth.error || 'Forbidden' },
      { status: auth.statusCode || auth.status || 401 }
    );
  }

  try {
    await ensureSeedData();
    const updated = await developerService.archiveDeveloper(params.id);
    const { revalidateDeveloperPaths } = await import('@/src/lib/revalidateListingPaths');
    revalidateDeveloperPaths({ slug: updated.slug });

    return NextResponse.json(updated);
  } catch (error: any) {
    if (error instanceof NotFoundError) {
      return NextResponse.json({ error: 'NOT_FOUND', message: error.message }, { status: 404 });
    }
    console.error('[Admin Developer Archive] Unexpected error:', error?.message || 'Unknown error');
    return NextResponse.json(
      { error: 'SERVER_ERROR', message: 'Failed to archive developer.' },
      { status: 500 }
    );
  }
}
