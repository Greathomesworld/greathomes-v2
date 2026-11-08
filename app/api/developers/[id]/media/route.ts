import { NextRequest, NextResponse } from 'next/server';
import { developerRepository, developerMediaRepository } from '@/src/infrastructure/repositories/developerProvider';
import { verifyStaffCapability } from '@/src/domain/auth/capabilities';
import { ensureSeedData } from '@/src/infrastructure/seed';
import { DeveloperMediaCategory } from '@/src/domain/developers/media';

interface RouteContext {
  params: Promise<{ id: string }>;
}

const VALID_DEVELOPER_CATEGORIES: DeveloperMediaCategory[] = ['LOGO', 'BRAND', 'OFFICE', 'EDITORIAL'];

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    await ensureSeedData();
    const { id } = await context.params;
    const { verifyInternalStaff } = await import('@/src/domain/auth/authorizationBoundary');
    const { isKnownTestDeveloperSlug } = await import('@/src/domain/developers/services/developerService');
    const auth = await verifyInternalStaff(req);

    const dev = await developerRepository.findById(id);
    if (!dev || (!auth.authorized && (dev.status !== 'PUBLISHED' || isKnownTestDeveloperSlug(dev.slug)))) {
      return NextResponse.json({ success: false, error: 'Developer not found' }, { status: 404 });
    }

    const media = await developerMediaRepository.findByDeveloperId(id);
    return NextResponse.json({ success: true, data: media });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    await ensureSeedData();
    const authMedia = await verifyStaffCapability(req, 'MANAGE_MEDIA');
    const authDev = await verifyStaffCapability(req, 'MANAGE_DEVELOPERS');
    if (!authMedia.authorized && !authDev.authorized) {
      return NextResponse.json({ success: false, error: 'Unauthorized to manage developer media' }, { status: 403 });
    }

    const { id } = await context.params;
    const dev = await developerRepository.findById(id);
    if (!dev) {
      return NextResponse.json({ success: false, error: 'Developer not found' }, { status: 404 });
    }

    const body = await req.json();

    if (!body.url || typeof body.url !== 'string' || !body.url.trim()) {
      return NextResponse.json({ success: false, error: 'Media URL is required' }, { status: 400 });
    }

    const category = body.category || 'LOGO';
    if (!VALID_DEVELOPER_CATEGORIES.includes(category)) {
      return NextResponse.json(
        { success: false, error: `Invalid category. Must be one of: ${VALID_DEVELOPER_CATEGORIES.join(', ')}` },
        { status: 400 }
      );
    }

    const created = await developerMediaRepository.create({
      developerId: id,
      mediaType: 'IMAGE',
      category,
      url: body.url.trim(),
      sortOrder: typeof body.sortOrder === 'number' ? body.sortOrder : 0,
      isFeatured: !!body.isFeatured,
    });

    const { revalidateDeveloperPaths } = await import('@/src/lib/revalidateListingPaths');
    revalidateDeveloperPaths({ slug: dev.slug });

    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
