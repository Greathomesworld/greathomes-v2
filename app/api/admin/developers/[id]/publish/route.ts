import { NextRequest, NextResponse } from 'next/server';
import { verifyInternalStaff } from '@/src/domain/auth/authorizationBoundary';
import { developerService, ValidationError, NotFoundError } from '@/src/domain/developers/services/developerService';
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
    const developer = await developerService.getDeveloperById(params.id);
    if (!developer) {
      return NextResponse.json({ error: 'NOT_FOUND', message: 'Developer not found' }, { status: 404 });
    }

    // Explicit Lifecycle Validation for PUBLISHED status
    const fields: Record<string, string> = {};
    if (!developer.name || !developer.name.trim()) {
      fields.name = 'Developer name is required for publication.';
    }
    if (!developer.shortDescription || !developer.shortDescription.trim()) {
      fields.shortDescription = 'A short description is required for public discovery.';
    }
    if (!developer.slug || !developer.slug.trim()) {
      fields.slug = 'A URL-safe canonical slug is required for indexing.';
    }

    if (Object.keys(fields).length > 0) {
      return NextResponse.json(
        {
          error: 'VALIDATION_ERROR',
          message: 'Developer profile is incomplete and cannot be published.',
          fields,
        },
        { status: 400 }
      );
    }

    const updated = await developerService.updateDeveloper(params.id, { status: 'PUBLISHED' });
    const { revalidateDeveloperPaths } = await import('@/src/lib/revalidateListingPaths');
    revalidateDeveloperPaths({ slug: updated.slug });

    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json(
      { error: 'SERVER_ERROR', message: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
