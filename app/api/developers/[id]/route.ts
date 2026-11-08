import { NextRequest, NextResponse } from 'next/server';
import {
  developerService,
  ValidationError,
  NotFoundError,
  DuplicateSlugError,
} from '@/src/domain/developers/services/developerService';
import { verifyInternalStaff } from '@/src/domain/auth/authorizationBoundary';
import { verifyStaffCapability } from '@/src/domain/auth/capabilities';
import { auditService } from '@/src/domain/audit/auditService';
import { ensureSeedData } from '@/src/infrastructure/seed';

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    await ensureSeedData();
    const { id } = await props.params;
    const auth = await verifyInternalStaff(request);
    const isInternalStaff = auth.authorized;

    const developer = await developerService.getPublicDeveloperDtoById(id, isInternalStaff);
    if (!developer) {
      return NextResponse.json(
        { error: `Developer with id '${id}' not found` },
        { status: 404 }
      );
    }

    return NextResponse.json(developer);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const auth = await verifyStaffCapability(request, 'developer.update');
  if (!auth.authorized) {
    return NextResponse.json(
      { error: auth.error || 'Unauthorized' },
      { status: auth.statusCode || auth.status || 401 }
    );
  }

  try {
    await ensureSeedData();
    const { id } = await props.params;
    const body = await request.json();

    const existing = await developerService.getDeveloperById(id);
    if (body.seo !== undefined && typeof body.seo === 'object' && body.seo !== null) {
      developerService.validateDeveloperSeoInput(body.seo);
    }

    const updated = await developerService.updateDeveloper(id, body);

    if (body.seo !== undefined && typeof body.seo === 'object' && body.seo !== null) {
      await developerService.upsertDeveloperSeo(id, body.seo);
    }

    await auditService.record(request, auth.staff, {
      action: 'UPDATE',
      resourceType: 'DEVELOPER',
      resourceId: id,
      resourceLabel: updated.name,
      before: existing ? { name: existing.name, slug: existing.slug, websiteUrl: existing.websiteUrl, status: existing.status } : null,
      after: { name: updated.name, slug: updated.slug, websiteUrl: updated.websiteUrl, status: updated.status },
      success: true,
    });

    const { revalidateDeveloperPaths } = await import('@/src/lib/revalidateListingPaths');
    revalidateDeveloperPaths({ slug: updated.slug, previousSlug: existing?.slug });

    return NextResponse.json(updated);
  } catch (error: any) {
    if (error instanceof NotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof DuplicateSlugError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const auth = await verifyStaffCapability(request, 'developer.delete');
  if (!auth.authorized) {
    return NextResponse.json(
      { error: auth.error || 'Unauthorized' },
      { status: auth.statusCode || auth.status || 401 }
    );
  }

  try {
    await ensureSeedData();
    const { id } = await props.params;
    const existing = await developerService.getDeveloperById(id);
    const archived = await developerService.archiveDeveloper(id);

    await auditService.record(request, auth.staff, {
      action: 'ARCHIVE',
      resourceType: 'DEVELOPER',
      resourceId: id,
      resourceLabel: archived.name,
      before: existing ? { name: existing.name, slug: existing.slug, status: existing.status } : null,
      after: { name: archived.name, slug: archived.slug, status: archived.status },
      success: true,
    });

    const { revalidateDeveloperPaths } = await import('@/src/lib/revalidateListingPaths');
    revalidateDeveloperPaths({ slug: archived.slug, previousSlug: existing?.slug });

    return NextResponse.json({
      success: true,
      message: 'Developer archived successfully',
      developer: archived,
    });
  } catch (error: any) {
    if (error instanceof NotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
