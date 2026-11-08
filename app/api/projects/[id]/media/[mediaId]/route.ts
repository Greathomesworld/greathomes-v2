import { NextRequest, NextResponse } from 'next/server';
import {
  projectIntelligenceService,
  ValidationError,
  NotFoundError,
} from '@/src/domain/projects/services/projectIntelligenceService';
import { verifyStaffCapability } from '@/src/domain/auth/capabilities';
import { ensureSeedData } from '@/src/infrastructure/seed';

export async function PATCH(
  request: NextRequest,
  props: { params: Promise<{ id: string; mediaId: string }> }
) {
  const auth = await verifyStaffCapability(request, 'MANAGE_MEDIA');
  if (!auth.authorized) {
    return NextResponse.json(
      { error: auth.error || 'Unauthorized' },
      { status: auth.status || 401 }
    );
  }

  try {
    await ensureSeedData();
    const { id, mediaId } = await props.params;
    const body = await request.json();

    const updated = await projectIntelligenceService.updateMedia(mediaId, body, true);
    const { revalidateProjectAndDeveloperPaths } = await import('@/src/lib/revalidateListingPaths');
    await revalidateProjectAndDeveloperPaths({ projectId: id });
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
  props: { params: Promise<{ id: string; mediaId: string }> }
) {
  const auth = await verifyStaffCapability(request, 'MANAGE_MEDIA');
  if (!auth.authorized) {
    return NextResponse.json(
      { error: auth.error || 'Unauthorized' },
      { status: auth.status || 401 }
    );
  }

  try {
    await ensureSeedData();
    const { id, mediaId } = await props.params;

    const success = await projectIntelligenceService.deleteMedia(mediaId, true);
    const { revalidateProjectAndDeveloperPaths } = await import('@/src/lib/revalidateListingPaths');
    await revalidateProjectAndDeveloperPaths({ projectId: id });
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
