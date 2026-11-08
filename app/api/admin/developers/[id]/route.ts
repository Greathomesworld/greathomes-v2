import { NextRequest, NextResponse } from 'next/server';
import { verifyStaffCapability } from '@/src/domain/auth/capabilities';
import { developerService, ValidationError, DuplicateSlugError, NotFoundError } from '@/src/domain/developers/services/developerService';
import { ensureSeedData } from '@/src/infrastructure/seed';
import { auditService } from '@/src/domain/audit/auditService';

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await verifyStaffCapability(req, 'developer.read');
  if (!auth.authorized) {
    return NextResponse.json(
      { error: 'FORBIDDEN', message: auth.error || 'Unauthorized' },
      { status: auth.statusCode || 401 }
    );
  }

  try {
    await ensureSeedData();
    const developer = await developerService.getPublicDeveloperDtoById(params.id, true);
    if (!developer) {
      return NextResponse.json({ error: 'NOT_FOUND', message: 'Developer not found' }, { status: 404 });
    }

    return NextResponse.json(developer);
  } catch (error: any) {
    return NextResponse.json(
      { error: 'SERVER_ERROR', message: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await verifyStaffCapability(req, 'developer.update');
  if (!auth.authorized) {
    return NextResponse.json(
      { error: 'FORBIDDEN', message: auth.error || 'Unauthorized' },
      { status: auth.statusCode || 401 }
    );
  }

  try {
    await ensureSeedData();
    const body = await req.json();
    const existing = await developerService.getPublicDeveloperDtoById(params.id, true);
    if (body.seo !== undefined && typeof body.seo === 'object' && body.seo !== null) {
      developerService.validateDeveloperSeoInput(body.seo);
    }

    const updated = await developerService.updateDeveloper(params.id, body);

    if (body.seo !== undefined && typeof body.seo === 'object' && body.seo !== null) {
      await developerService.upsertDeveloperSeo(params.id, body.seo);
    }

    await auditService.record(req, auth.staff, {
      action: 'UPDATE',
      resourceType: 'DEVELOPER',
      resourceId: params.id,
      resourceLabel: updated.name,
      before: existing ? { name: existing.name, slug: existing.slug, websiteUrl: existing.websiteUrl } : null,
      after: { name: updated.name, slug: updated.slug, websiteUrl: updated.websiteUrl },
      success: true,
    });
    const { revalidateDeveloperPaths } = await import('@/src/lib/revalidateListingPaths');
    revalidateDeveloperPaths({ slug: updated.slug, previousSlug: existing?.slug });

    const finalDev = await developerService.getPublicDeveloperDtoById(params.id, true);
    return NextResponse.json(finalDev || updated);
  } catch (error: any) {
    if (error instanceof NotFoundError) {
      return NextResponse.json({ error: 'NOT_FOUND', message: error.message }, { status: 404 });
    }
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: 'VALIDATION_ERROR', message: error.message }, { status: 400 });
    }
    if (error instanceof DuplicateSlugError) {
      return NextResponse.json({ error: 'DUPLICATE_SLUG', message: error.message }, { status: 409 });
    }
    return NextResponse.json(
      { error: 'SERVER_ERROR', message: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await verifyStaffCapability(req, 'developer.delete');
  if (!auth.authorized) {
    return NextResponse.json(
      { error: 'FORBIDDEN', message: auth.error || 'Unauthorized' },
      { status: auth.statusCode || 401 }
    );
  }

  try {
    await ensureSeedData();
    const existing = await developerService.getPublicDeveloperDtoById(params.id, true);
    if (!existing) {
      return NextResponse.json({ error: 'NOT_FOUND', message: 'Developer not found' }, { status: 404 });
    }

    const success = await developerService.deleteDeveloper(params.id);
    if (!success) {
      return NextResponse.json({ error: 'DELETE_FAILED', message: 'Failed to delete developer' }, { status: 500 });
    }

    await auditService.record(req, auth.staff, {
      action: 'DELETE',
      resourceType: 'DEVELOPER',
      resourceId: params.id,
      resourceLabel: existing.name,
      before: { name: existing.name, slug: existing.slug, websiteUrl: existing.websiteUrl },
      after: null,
      success: true,
    });

    const { revalidateDeveloperPaths } = await import('@/src/lib/revalidateListingPaths');
    revalidateDeveloperPaths({ slug: existing.slug });

    return NextResponse.json({ success: true, message: 'Developer profile deleted successfully.' });
  } catch (error: any) {
    if (error instanceof NotFoundError) {
      return NextResponse.json({ error: 'NOT_FOUND', message: error.message }, { status: 404 });
    }
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: 'VALIDATION_ERROR', message: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: 'SERVER_ERROR', message: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
