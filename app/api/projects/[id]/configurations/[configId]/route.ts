import { NextRequest, NextResponse } from 'next/server';
import {
  projectIntelligenceService,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
} from '@/src/domain/projects/services/projectIntelligenceService';
import { verifyStaffCapability } from '@/src/domain/auth/capabilities';
import { ensureSeedData } from '@/src/infrastructure/seed';
import { auditService } from '@/src/domain/audit/auditService';
import { revalidateProjectLifecyclePaths } from '@/src/lib/revalidateListingPaths';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function PATCH(
  request: NextRequest,
  props: { params: Promise<{ id: string; configId: string }> }
) {
  const auth = await verifyStaffCapability(request, 'MANAGE_CONFIGURATIONS');
  if (!auth.authorized) {
    return NextResponse.json(
      { error: auth.error || 'Unauthorized' },
      { status: auth.status || auth.statusCode || 401 }
    );
  }

  try {
    await ensureSeedData();
    const { id, configId } = await props.params;
    const body = await request.json();

    const updated = await projectIntelligenceService.updateConfiguration(configId, body, true, id);

    await auditService.record(
      request,
      auth.staff ? { id: auth.staff.id, role: auth.role || auth.staff.role } : { role: auth.role || 'ADMIN' },
      {
        action: 'UPDATE',
        resourceType: 'PROJECT_CONFIGURATION',
        resourceId: configId,
        resourceLabel: updated.name,
        after: {
          name: updated.name,
          availability: updated.availability,
          priceOnRequest: updated.priceOnRequest,
        },
        metadata: { projectId: id },
      }
    );

    await revalidateProjectLifecyclePaths({
      projectId: id,
      bedroomCounts: updated.bedroomCount != null ? [updated.bedroomCount] : undefined,
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    if (error instanceof UnauthorizedError || error?.name === 'UnauthorizedError') {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
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
  props: { params: Promise<{ id: string; configId: string }> }
) {
  const auth = await verifyStaffCapability(request, 'MANAGE_CONFIGURATIONS');
  if (!auth.authorized) {
    return NextResponse.json(
      { error: auth.error || 'Unauthorized' },
      { status: auth.status || auth.statusCode || 401 }
    );
  }

  try {
    await ensureSeedData();
    const { id, configId } = await props.params;

    const success = await projectIntelligenceService.deleteConfiguration(configId, true, id);

    if (success) {
      await auditService.record(
        request,
        auth.staff ? { id: auth.staff.id, role: auth.role || auth.staff.role } : { role: auth.role || 'ADMIN' },
        {
          action: 'DELETE',
          resourceType: 'PROJECT_CONFIGURATION',
          resourceId: configId,
          metadata: { projectId: id },
        }
      );
      await revalidateProjectLifecyclePaths({ projectId: id });
    }

    return NextResponse.json({ success });
  } catch (error: any) {
    if (error instanceof UnauthorizedError || error?.name === 'UnauthorizedError') {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
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

