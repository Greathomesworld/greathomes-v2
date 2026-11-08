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
  props: { params: Promise<{ id: string; considerationId: string }> }
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
    const { id, considerationId } = await props.params;
    const body = await request.json();

    // Verify ownership: consideration must belong to requested project
    const all = await projectIntelligenceService.getConsiderationsByProjectId(id);
    const existing = all.find(c => c.id === considerationId);
    if (!existing) {
      return NextResponse.json({ error: 'Consideration not found in this project' }, { status: 404 });
    }

    const updated = await projectIntelligenceService.updateConsideration(considerationId, body, true);

    // Fetch project to revalidate public slug path
    const project = await projectIntelligenceService.getProjectById(id, true);
    if (project?.slug) {
      revalidatePath(`/projects/${project.slug}`);
    }
    revalidatePath(`/admin/projects/${id}`);

    // Record Audit Log
    const isVisibilityChange = body.isVisible !== undefined && Object.keys(body).length === 1;
    const action = isVisibilityChange
      ? 'PROJECT_CONSIDERATION_VISIBILITY_CHANGED'
      : 'PROJECT_CONSIDERATION_UPDATED';

    try {
      await auditService.record(request, auth, {
        action,
        resourceType: 'PROJECT_CONSIDERATION',
        resourceId: updated.id,
        resourceLabel: `${updated.section}: ${updated.title}`,
        before: existing as any,
        after: updated as any,
      });
    } catch (auditErr) {
      console.error('[Considerations API] Failed to log audit event:', auditErr);
    }

    return NextResponse.json(updated);
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

export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ id: string; considerationId: string }> }
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
    const { id, considerationId } = await props.params;

    // Verify ownership
    const all = await projectIntelligenceService.getConsiderationsByProjectId(id);
    const existing = all.find(c => c.id === considerationId);
    if (!existing) {
      return NextResponse.json({ error: 'Consideration not found in this project' }, { status: 404 });
    }

    await projectIntelligenceService.deleteConsideration(considerationId, true);

    // Fetch project to revalidate public slug path
    const project = await projectIntelligenceService.getProjectById(id, true);
    if (project?.slug) {
      revalidatePath(`/projects/${project.slug}`);
    }
    revalidatePath(`/admin/projects/${id}`);

    // Record Audit Log
    try {
      await auditService.record(request, auth, {
        action: 'PROJECT_CONSIDERATION_DELETED',
        resourceType: 'PROJECT_CONSIDERATION',
        resourceId: considerationId,
        resourceLabel: `${existing.section}: ${existing.title}`,
        before: existing as any,
      });
    } catch (auditErr) {
      console.error('[Considerations API] Failed to log audit event:', auditErr);
    }

    return NextResponse.json({ success: true });
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
