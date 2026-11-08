import { NextRequest, NextResponse } from 'next/server';
import {
  developerService,
  NotFoundError,
} from '@/src/domain/developers/services/developerService';
import { verifyInternalStaff } from '@/src/domain/auth/authorizationBoundary';
import { ensureSeedData } from '@/src/infrastructure/seed';

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    await ensureSeedData();
    const { id } = await props.params;
    const auth = await verifyInternalStaff(request);
    const isInternalStaff = auth.authorized;

    const projects = await developerService.getDeveloperPublicProjects(id, isInternalStaff);
    return NextResponse.json(projects);
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
