import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import {
  projectIntelligenceService,
  ValidationError,
  DuplicateSlugError,
  NotFoundError,
} from '@/src/domain/projects/services/projectIntelligenceService';
import { verifyInternalStaff } from '@/src/domain/auth/authorizationBoundary';
import { verifyStaffCapability } from '@/src/domain/auth/capabilities';
import { ensureSeedData } from '@/src/infrastructure/seed';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    await ensureSeedData();
    const { id } = await props.params;

    const auth = await verifyInternalStaff(request);
    const isInternalStaff = auth.authorized;

    const project = await projectIntelligenceService.getProjectById(id, isInternalStaff);
    if (!project) {
      return NextResponse.json(
        { error: `Project with id '${id}' not found` },
        { status: 404 }
      );
    }

    return NextResponse.json(project);
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
  const auth = await verifyStaffCapability(request, 'project.update');
  if (!auth.authorized) {
    return NextResponse.json(
      { error: 'FORBIDDEN', message: auth.error || 'Unauthorized' },
      { status: auth.statusCode || 401 }
    );
  }

  try {
    await ensureSeedData();
    const { id } = await props.params;
    const body = await request.json();

    const existing = await projectIntelligenceService.getProjectById(id, true);
    const updated = await projectIntelligenceService.updateProject(id, body, true);

    const { revalidateProjectAndDeveloperPaths } = await import('@/src/lib/revalidateListingPaths');
    await revalidateProjectAndDeveloperPaths({
      projectId: id,
      projectSlug: updated.slug,
      previousProjectSlug: existing?.slug,
      developerId: updated.developerId,
      previousDeveloperId: existing?.developer?.id,
      developerSlug: existing?.developer?.slug,
      locationId: updated.locationId,
      previousLocationId: existing?.location?.id,
      locationSlug: existing?.location?.slug,
    });

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
