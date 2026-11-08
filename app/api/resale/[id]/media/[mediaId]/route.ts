import { NextRequest, NextResponse } from 'next/server';
import { resaleListingService } from '@/src/domain/projects/services/resaleService';
import { verifyStaffCapability } from '@/src/domain/auth/capabilities';
import { ensureSeedData } from '@/src/infrastructure/seed';
import { revalidateResalePaths } from '@/src/lib/revalidateListingPaths';

interface RouteContext {
  params: Promise<{ id: string; mediaId: string }>;
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    await ensureSeedData();
    const auth = await verifyStaffCapability(req, 'listing.manageMedia');
    const authManage = await verifyStaffCapability(req, 'MANAGE_RESALE');
    if (!auth.authorized && !authManage.authorized) {
      return NextResponse.json({ success: false, error: 'Unauthorized to update media' }, { status: 403 });
    }

    const { id, mediaId } = await context.params;
    const body = await req.json();

    const updated = await resaleListingService.updateMedia(mediaId, body);
    if (!updated) {
      return NextResponse.json({ success: false, error: 'Media item not found' }, { status: 404 });
    }

    const listing = await resaleListingService.getAdminListingById(id);
    revalidateResalePaths({
      id,
      slug: listing?.slug,
      projectSlug: listing?.project?.slug,
      locationSlug: listing?.location?.slug ?? listing?.project?.location?.slug,
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  try {
    await ensureSeedData();
    const auth = await verifyStaffCapability(req, 'listing.manageMedia');
    const authManage = await verifyStaffCapability(req, 'MANAGE_RESALE');
    if (!auth.authorized && !authManage.authorized) {
      return NextResponse.json({ success: false, error: 'Unauthorized to remove media' }, { status: 403 });
    }

    const { id, mediaId } = await context.params;
    const removed = await resaleListingService.removeMedia(mediaId);
    if (!removed) {
      return NextResponse.json({ success: false, error: 'Media item not found' }, { status: 404 });
    }

    const listing = await resaleListingService.getAdminListingById(id);
    revalidateResalePaths({
      id,
      slug: listing?.slug,
      projectSlug: listing?.project?.slug,
      locationSlug: listing?.location?.slug ?? listing?.project?.location?.slug,
    });

    return NextResponse.json({ success: true, message: 'Media item removed successfully' });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
