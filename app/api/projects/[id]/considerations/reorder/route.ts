import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import {
  projectIntelligenceService,
  ValidationError,
  NotFoundError,
} from '@/src/domain/projects/services/projectIntelligenceService';
import { verifyStaffCapability } from '@/src/domain/auth/capabilities';
import { ensureSeedData } from '@/src/infrastructure/seed';
import { auditService } from '@/src/domain/audit/auditService';

export async function PATCH(
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
    const body = await request.json();

    const { section, orderedIds } = body;
    if (!section || !Array.isArray(orderedIds)) {
      return NextResponse.json(
        { error: 'Section and orderedIds array are required' },
        { status: 400 }
      );
    }

    await projectIntelligenceService.reorderConsiderations(id, section, orderedIds, true);

    // Fetch project to revalidate public slug path
    const project = await projectIntelligenceService.getProjectById(id, true);
    if (project?.slug) {
      revalidatePath(`/projects/${project.slug}`);
    }
    revalidatePath(`/admin/projects/${id}`);

    // Record Audit Log
    try {
      await auditService.record(request, auth, {
        action: 'PROJECT_CONSIDERATION_REORDERED',
        resourceType: 'PROJECT_CONSIDERATION',
        resourceId: id,
        resourceLabel: `Reordered ${section} considerations`,
        after: { section, orderedIds } as any,
      });
    } catch (auditErr) {
      console.error('[Considerations API] Failed to log audit event:', auditErr);
    }

    return NextResponse.json({ success: true });
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
