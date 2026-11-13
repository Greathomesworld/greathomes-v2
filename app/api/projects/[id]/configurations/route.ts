import { NextRequest, NextResponse } from 'next/server';
import {
  projectIntelligenceService,
  ValidationError,
  DuplicateConfigurationError,
  NotFoundError,
  UnauthorizedError,
} from '@/src/domain/projects/services/projectIntelligenceService';
import { verifyStaffCapability } from '@/src/domain/auth/capabilities';
import { ensureSeedData } from '@/src/infrastructure/seed';
import { auditService } from '@/src/domain/audit/auditService';
import { revalidateProjectLifecyclePaths } from '@/src/lib/revalidateListingPaths';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    await ensureSeedData();
    const { id } = await props.params;

    const configurations = await projectIntelligenceService.getConfigurationsByProjectId(id);
    return NextResponse.json(configurations);
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
  const auth = await verifyStaffCapability(request, 'MANAGE_CONFIGURATIONS');
  if (!auth.authorized) {
    return NextResponse.json(
      { error: auth.error || 'Unauthorized' },
      { status: auth.status || auth.statusCode || 401 }
    );
  }

  try {
    await ensureSeedData();
    const { id } = await props.params;
    const body = await request.json();

    const configuration = await projectIntelligenceService.createConfiguration(id, body, true);

    await auditService.record(
      request,
      auth.staff ? { id: auth.staff.id, role: auth.role || auth.staff.role } : { role: auth.role || 'ADMIN' },
      {
        action: 'CREATE',
        resourceType: 'PROJECT_CONFIGURATION',
        resourceId: configuration.id,
        resourceLabel: configuration.name,
        after: {
          name: configuration.name,
          availability: configuration.availability,
          priceOnRequest: configuration.priceOnRequest,
        },
        metadata: { projectId: id },
      }
    );

    await revalidateProjectLifecyclePaths({
      projectId: id,
      bedroomCounts: configuration.bedroomCount != null ? [configuration.bedroomCount] : undefined,
    });

    return NextResponse.json(configuration, { status: 201 });
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
    if (error instanceof DuplicateConfigurationError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

