import { NextRequest, NextResponse } from 'next/server';
import {
  projectIntelligenceService,
  ValidationError,
  NotFoundError,
} from '@/src/domain/projects/services/projectIntelligenceService';
import { verifyStaffCapability } from '@/src/domain/auth/capabilities';
import { ensureSeedData } from '@/src/infrastructure/seed';
import { auditService } from '@/src/domain/audit/auditService';

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const auth = await verifyStaffCapability(request, 'MANAGE_PROJECTS');
  if (!auth.authorized) {
    return NextResponse.json(
      { error: auth.error || 'Unauthorized' },
      { status: auth.status || 401 }
    );
  }

  try {
    await ensureSeedData();
    const { id } = await props.params;

    const publishedProject = await projectIntelligenceService.publishProject(id, true);
    await auditService.record(request, auth.staff, {
      action: 'PUBLISH',
      resourceType: 'PROJECT',
      resourceId: id,
      resourceLabel: publishedProject.name,
      after: { lifecycleStatus: publishedProject.lifecycleStatus, status: publishedProject.status },
      success: true,
    });

    const { revalidateProjectAndDeveloperPaths } = await import('@/src/lib/revalidateListingPaths');
    await revalidateProjectAndDeveloperPaths({
      projectId: id,
      projectSlug: publishedProject.slug,
      developerId: publishedProject.developerId,
      locationId: publishedProject.locationId,
    });

    return NextResponse.json(publishedProject);
  } catch (error: any) {
    if (error instanceof NotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
