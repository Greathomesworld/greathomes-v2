import { NextRequest, NextResponse } from 'next/server';
import {
  projectIntelligenceService,
  ValidationError,
  NotFoundError,
} from '@/src/domain/projects/services/projectIntelligenceService';
import { verifyStaffCapability } from '@/src/domain/auth/capabilities';
import { ensureSeedData } from '@/src/infrastructure/seed';

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    await ensureSeedData();
    const { id } = await props.params;

    const seo = await projectIntelligenceService.getSeoByProjectId(id);
    return NextResponse.json(seo || { metaTitle: '', metaDescription: '', canonicalUrl: '' });
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
  const auth = await verifyStaffCapability(request, 'MANAGE_SEO');
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

    const seo = await projectIntelligenceService.upsertSeo(id, body, true);
    return NextResponse.json(seo);
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

export async function PATCH(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  return POST(request, props);
}
