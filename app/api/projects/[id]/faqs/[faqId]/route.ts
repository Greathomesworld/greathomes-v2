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
  props: { params: Promise<{ id: string; faqId: string }> }
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
    const { id, faqId } = await props.params;
    const body = await request.json();

    // Capture existing state for audit log comparison
    const existing = await projectIntelligenceService.getFaqById(faqId);
    if (!existing) {
      return NextResponse.json({ error: `FAQ with id '${faqId}' not found` }, { status: 404 });
    }

    const updated = await projectIntelligenceService.updateFaq(faqId, body, true);

    // Revalidate paths
    const project = await projectIntelligenceService.getProjectById(id, true);
    if (project?.slug) {
      revalidatePath(`/projects/${project.slug}`);
    }
    revalidatePath(`/admin/projects/${id}`);
    revalidatePath('/admin/intelligence/faqs');

    // Audit log
    try {
      await auditService.record(request, auth.staff || auth, {
        action: 'PROJECT_FAQ_UPDATED',
        resourceType: 'PROJECT_FAQ',
        resourceId: updated.id,
        resourceLabel: updated.question,
        before: existing as any,
        after: updated as any,
      });
    } catch (auditErr) {
      console.error('[Project FAQ PATCH] Audit log error:', auditErr);
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
  props: { params: Promise<{ id: string; faqId: string }> }
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
    const { id, faqId } = await props.params;

    const existing = await projectIntelligenceService.getFaqById(faqId);
    if (!existing) {
      return NextResponse.json({ error: `FAQ with id '${faqId}' not found` }, { status: 404 });
    }

    const success = await projectIntelligenceService.deleteFaq(faqId, true);

    // Revalidate paths
    const project = await projectIntelligenceService.getProjectById(id, true);
    if (project?.slug) {
      revalidatePath(`/projects/${project.slug}`);
    }
    revalidatePath(`/admin/projects/${id}`);
    revalidatePath('/admin/intelligence/faqs');

    // Audit log
    try {
      await auditService.record(request, auth.staff || auth, {
        action: 'PROJECT_FAQ_DELETED',
        resourceType: 'PROJECT_FAQ',
        resourceId: faqId,
        resourceLabel: existing.question,
        before: existing as any,
      });
    } catch (auditErr) {
      console.error('[Project FAQ DELETE] Audit log error:', auditErr);
    }

    return NextResponse.json({ success });
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
