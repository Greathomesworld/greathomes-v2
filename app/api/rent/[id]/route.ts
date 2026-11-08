import { NextRequest, NextResponse } from 'next/server';
import { rentalListingService } from '@/src/domain/projects/services/rentalService';
import { verifyStaffCapability } from '@/src/domain/auth/capabilities';
import { ensureSeedData } from '@/src/infrastructure/seed';
import { revalidateRentalPaths } from '@/src/lib/revalidateListingPaths';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    await ensureSeedData();
    const { id } = await context.params;

    const authRead = await verifyStaffCapability(req, 'listing.read');
    const authManage = await verifyStaffCapability(req, 'MANAGE_RENTAL');
    const isInternalStaff = authRead.authorized || authManage.authorized;

    if (isInternalStaff) {
      const adminListing = await rentalListingService.getAdminListingById(id);
      if (!adminListing) {
        return NextResponse.json({ success: false, error: 'Rental listing not found' }, { status: 404 });
      }
      return NextResponse.json({ success: true, data: adminListing });
    }

    // Public request
    const publicListing = await rentalListingService.getPublicListingById(id);
    if (!publicListing) {
      return NextResponse.json({ success: false, error: 'Rental listing not found or not published' }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: publicListing });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    await ensureSeedData();
    const authUpdate = await verifyStaffCapability(req, 'listing.update');
    const authManage = await verifyStaffCapability(req, 'MANAGE_RENTAL');
    if (!authUpdate.authorized && !authManage.authorized) {
      return NextResponse.json(
        { success: false, error: authUpdate.error || 'Unauthorized' },
        { status: authUpdate.status || 401 }
      );
    }

    const { id } = await context.params;
    const body = await req.json();

    const existing = await rentalListingService.getAdminListingById(id);
    const updated = await rentalListingService.updateListing(id, body);
    revalidateRentalPaths({
      id: updated.id,
      slug: updated.slug,
      projectSlug: updated.project?.slug,
      previousProjectSlug: existing?.project?.slug,
      locationSlug: updated.location?.slug ?? updated.project?.location?.slug,
      previousLocationSlug: existing?.location?.slug ?? existing?.project?.location?.slug,
    });
    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    const status = error.name === 'NotFoundError' ? 404 : error.name === 'ValidationError' ? 400 : 500;
    return NextResponse.json({ success: false, error: error.message }, { status });
  }
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  try {
    await ensureSeedData();
    const authArchive = await verifyStaffCapability(req, 'listing.archive');
    const authManage = await verifyStaffCapability(req, 'MANAGE_RENTAL');
    if (!authArchive.authorized && !authManage.authorized) {
      return NextResponse.json(
        { success: false, error: authArchive.error || 'Unauthorized' },
        { status: authArchive.status || 401 }
      );
    }

    const { id } = await context.params;
    const existing = await rentalListingService.getAdminListingById(id);
    const deleted = await rentalListingService.deleteListing(id);
    if (!deleted) {
      return NextResponse.json({ success: false, error: 'Rental listing not found' }, { status: 404 });
    }
    revalidateRentalPaths({
      id,
      slug: existing?.slug,
      projectSlug: existing?.project?.slug,
      locationSlug: existing?.location?.slug ?? existing?.project?.location?.slug,
    });
    return NextResponse.json({ success: true, message: 'Rental listing deleted successfully' });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
