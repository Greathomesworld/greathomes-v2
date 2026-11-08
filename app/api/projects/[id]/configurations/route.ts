import { NextRequest, NextResponse } from 'next/server';
import {
  projectIntelligenceService,
  ValidationError,
  DuplicateConfigurationError,
  NotFoundError,
} from '@/src/domain/projects/services/projectIntelligenceService';
import { verifyInternalStaff } from '@/src/domain/auth/authorizationBoundary';
import { ensureSeedData } from '@/src/infrastructure/seed';

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
  const auth = await verifyInternalStaff(request);
  if (!auth.authorized) {
    return NextResponse.json(
      { error: auth.error || 'Unauthorized' },
      { status: auth.statusCode || 401 }
    );
  }

  try {
    await ensureSeedData();
    const { id } = await props.params;
    const body = await request.json();

    const configuration = await projectIntelligenceService.createConfiguration(id, body, true);
    return NextResponse.json(configuration, { status: 201 });
  } catch (error: any) {
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
