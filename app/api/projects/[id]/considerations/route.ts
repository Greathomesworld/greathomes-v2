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

    const considerations = await projectIntelligenceService.getConsiderationsByProjectId(id);
    return NextResponse.json(considerations);
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

    const consideration = await projectIntelligenceService.createConsideration(id, body, true);

    // Fetch project to revalidate public slug path
    const project = await projectIntelligenceService.getProjectById(id, true);
    if (project?.slug) {
      revalidatePath(`/projects/${project.slug}`);
    }
    revalidatePath(`/admin/projects/${id}`);

    // Record Audit Log
    try {
      await auditService.record(request, auth, {
        action: 'PROJECT_CONSIDERATION_CREATED',
        resourceType: 'PROJECT_CONSIDERATION',
        resourceId: consideration.id,
        resourceLabel: `${consideration.section}: ${consideration.title}`,
        after: consideration as any,
      });
    } catch (auditErr) {
      console.error('[Considerations API] Failed to log audit event:', auditErr);
    }

    return NextResponse.json(consideration, { status: 201 });
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
