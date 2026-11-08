import { NextRequest, NextResponse } from 'next/server';
import { verifyInternalStaff } from '@/src/domain/auth/authorizationBoundary';
import { developerService, NotFoundError } from '@/src/domain/developers/services/developerService';
import { ensureSeedData } from '@/src/infrastructure/seed';

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await verifyInternalStaff(req);
  if (!auth.authorized) {
    return NextResponse.json(
      { error: auth.error || 'Unauthorized' },
      { status: auth.statusCode || 401 }
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
    return NextResponse.json(
      { error: 'SERVER_ERROR', message: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
