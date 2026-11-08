import { NextRequest, NextResponse } from 'next/server';
import { developerRepository, developerMediaRepository } from '@/src/infrastructure/repositories/developerProvider';
import { verifyStaffCapability } from '@/src/domain/auth/capabilities';
import { ensureSeedData } from '@/src/infrastructure/seed';
import { DeveloperMediaCategory } from '@/src/domain/developers/media';

interface RouteContext {
  params: Promise<{ id: string; mediaId: string }>;
}

const VALID_DEVELOPER_CATEGORIES: DeveloperMediaCategory[] = ['LOGO', 'BRAND', 'OFFICE', 'EDITORIAL'];

export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    await ensureSeedData();
    const authMedia = await verifyStaffCapability(req, 'MANAGE_MEDIA');
    const authDev = await verifyStaffCapability(req, 'MANAGE_DEVELOPERS');
    if (!authMedia.authorized && !authDev.authorized) {
      return NextResponse.json({ success: false, error: 'Unauthorized to manage developer media' }, { status: 403 });
    }

    const { id, mediaId } = await context.params;
    const body = await req.json();

    if (body.category && !VALID_DEVELOPER_CATEGORIES.includes(body.category)) {
      return NextResponse.json(
        { success: false, error: `Invalid category. Must be one of: ${VALID_DEVELOPER_CATEGORIES.join(', ')}` },
        { status: 400 }
      );
    }

    const updated = await developerMediaRepository.update(mediaId, body);
    if (!updated) {
      return NextResponse.json({ success: false, error: 'Media item not found' }, { status: 404 });
    }

    const dev = await developerRepository.findById(id);
    if (dev?.slug) {
      const { revalidateDeveloperPaths } = await import('@/src/lib/revalidateListingPaths');
      revalidateDeveloperPaths({ slug: dev.slug });
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  try {
    await ensureSeedData();
    const authMedia = await verifyStaffCapability(req, 'MANAGE_MEDIA');
    const authDev = await verifyStaffCapability(req, 'MANAGE_DEVELOPERS');
    if (!authMedia.authorized && !authDev.authorized) {
      return NextResponse.json({ success: false, error: 'Unauthorized to remove developer media' }, { status: 403 });
    }

    const { id, mediaId } = await context.params;
    const dev = await developerRepository.findById(id);
    const deleted = await developerMediaRepository.delete(mediaId);
    if (!deleted) {
      return NextResponse.json({ success: false, error: 'Media item not found' }, { status: 404 });
    }

    if (dev?.slug) {
      const { revalidateDeveloperPaths } = await import('@/src/lib/revalidateListingPaths');
      revalidateDeveloperPaths({ slug: dev.slug });
    }

    return NextResponse.json({ success: true, message: 'Developer media item removed' });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
