import { NextRequest, NextResponse } from 'next/server';
import { projectIntelligenceService } from '@/src/domain/projects/services/projectIntelligenceService';
import { verifyInternalStaff } from '@/src/domain/auth/authorizationBoundary';
import { ensureSeedData } from '@/src/infrastructure/seed';

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ slug: string }> }
) {
  try {
    await ensureSeedData();
    const { slug } = await props.params;

    const auth = await verifyInternalStaff(request);
    const isInternalStaff = auth.authorized;

    const project = await projectIntelligenceService.getProjectBySlug(slug, isInternalStaff);
    if (!project) {
      return NextResponse.json(
        { error: `Project with slug '${slug}' not found` },
        { status: 404 }
      );
    }

    return NextResponse.json(project);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
