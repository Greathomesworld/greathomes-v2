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

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    await ensureSeedData();
    const { id } = await props.params;

    const project = await projectIntelligenceService.getProjectById(id, true);
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }
    return NextResponse.json(project.faqs);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

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
    const body = await request.json();

    const faq = await projectIntelligenceService.createFaq(
      id,
      {
        ...body,
        isPublished: body.isPublished !== false,
      },
      true
    );

    // Revalidate affected routes
    const project = await projectIntelligenceService.getProjectById(id, true);
    if (project?.slug) {
      revalidatePath(`/projects/${project.slug}`);
    }
    revalidatePath(`/admin/projects/${id}`);
    revalidatePath('/admin/intelligence/faqs');

    // Audit log
    try {
      await auditService.record(request, auth.staff || auth, {
        action: 'PROJECT_FAQ_CREATED',
        resourceType: 'PROJECT_FAQ',
        resourceId: faq.id,
        resourceLabel: faq.question,
        after: faq as any,
      });
    } catch (auditErr) {
      console.error('[Project FAQ POST] Audit log error:', auditErr);
    }

    return NextResponse.json(faq, { status: 201 });
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
