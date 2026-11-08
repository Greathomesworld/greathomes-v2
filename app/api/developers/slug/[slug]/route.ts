import { NextRequest, NextResponse } from 'next/server';
import { developerService } from '@/src/domain/developers/services/developerService';
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

    const developer = await developerService.getPublicDeveloperDtoBySlug(slug, isInternalStaff);
    if (!developer) {
      return NextResponse.json(
        { error: `Developer with slug '${slug}' not found` },
        { status: 404 }
      );
    }

    return NextResponse.json(developer);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
