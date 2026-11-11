import { NextRequest, NextResponse } from 'next/server';
import {
  projectIntelligenceService,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
} from '@/src/domain/projects/services/projectIntelligenceService';
import { verifyStaffCapability } from '@/src/domain/auth/capabilities';
import { ensureSeedData } from '@/src/infrastructure/seed';

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

