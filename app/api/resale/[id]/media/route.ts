import { NextRequest, NextResponse } from 'next/server';
import { resaleListingService } from '@/src/domain/projects/services/resaleService';
import { verifyStaffCapability } from '@/src/domain/auth/capabilities';
import { ensureSeedData } from '@/src/infrastructure/seed';
import { revalidateResalePaths } from '@/src/lib/revalidateListingPaths';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    await ensureSeedData();
    const { id } = await context.params;
    const media = await resaleListingService.findMediaByListingId(id);
    return NextResponse.json({ success: true, data: media });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    await ensureSeedData();
    const auth = await verifyStaffCapability(req, 'listing.manageMedia');
    const authManage = await verifyStaffCapability(req, 'MANAGE_RESALE');
    if (!auth.authorized && !authManage.authorized) {
      return NextResponse.json({ success: false, error: 'Unauthorized to manage media' }, { status: 403 });
    }

    const { id } = await context.params;
    const body = await req.json();

    if (!body.url) {
      return NextResponse.json({ success: false, error: 'Media URL is required' }, { status: 400 });
    }

    const existingMedia = await resaleListingService.findMediaByListingId(id);
    const defaultSortOrder =
      typeof body.sortOrder === 'number' ? body.sortOrder : existingMedia.length;

    const media = await resaleListingService.addMedia(id, {
      mediaType: body.mediaType || 'IMAGE',
      category: body.category || 'EXTERIOR',
      url: body.url,
      altText: body.altText || null,
      caption: body.caption || null,
      sortOrder: defaultSortOrder,
      isFeatured: !!body.isFeatured,
    });

    const listing = await resaleListingService.getAdminListingById(id);
    revalidateResalePaths({
      id,
      slug: listing?.slug,
      projectSlug: listing?.project?.slug,
      locationSlug: listing?.location?.slug ?? listing?.project?.location?.slug,
    });

    return NextResponse.json({ success: true, data: media }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    await ensureSeedData();
    const auth = await verifyStaffCapability(req, 'listing.manageMedia');
    const authManage = await verifyStaffCapability(req, 'MANAGE_RESALE');
    if (!auth.authorized && !authManage.authorized) {
      return NextResponse.json({ success: false, error: 'Unauthorized to reorder media' }, { status: 403 });
    }

    const { id } = await context.params;
    const body = await req.json();
    const items = body.items as { id: string; sortOrder: number; isFeatured?: boolean }[];

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Expected items array with id and sortOrder' },
        { status: 400 }
      );
    }

    for (const item of items) {
      if (!item?.id || typeof item.sortOrder !== 'number') continue;
      await resaleListingService.updateMedia(item.id, {
        sortOrder: item.sortOrder,
        ...(item.isFeatured !== undefined ? { isFeatured: item.isFeatured } : {}),
      });
    }

    const updatedMedia = await resaleListingService.findMediaByListingId(id);
    const listing = await resaleListingService.getAdminListingById(id);
    revalidateResalePaths({
      id,
      slug: listing?.slug,
      projectSlug: listing?.project?.slug,
      locationSlug: listing?.location?.slug ?? listing?.project?.location?.slug,
    });

    return NextResponse.json({ success: true, data: updatedMedia });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
