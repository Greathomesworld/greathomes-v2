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
    const amenities = await rentalListingService.findAmenitiesByListingId(id);
    return NextResponse.json({ success: true, data: amenities });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    await ensureSeedData();
    const auth = await verifyStaffCapability(req, 'listing.manageAmenities');
    const authManage = await verifyStaffCapability(req, 'MANAGE_RENTAL');
    if (!auth.authorized && !authManage.authorized) {
      return NextResponse.json({ success: false, error: 'Unauthorized to manage amenities' }, { status: 403 });
    }

    const { id } = await context.params;
    const body = await req.json();

    if (!body.amenityId) {
      return NextResponse.json({ success: false, error: 'amenityId is required' }, { status: 400 });
    }

    await rentalListingService.associateAmenity(id, body.amenityId);
    const listing = await rentalListingService.getAdminListingById(id);
    revalidateRentalPaths({
      id,
      slug: listing?.slug,
      projectSlug: listing?.project?.slug,
      locationSlug: listing?.location?.slug ?? listing?.project?.location?.slug,
    });
    return NextResponse.json({ success: true, message: 'Amenity associated successfully' }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  try {
    await ensureSeedData();
    const auth = await verifyStaffCapability(req, 'listing.manageAmenities');
    const authManage = await verifyStaffCapability(req, 'MANAGE_RENTAL');
    if (!auth.authorized && !authManage.authorized) {
      return NextResponse.json({ success: false, error: 'Unauthorized to manage amenities' }, { status: 403 });
    }

    const { id } = await context.params;
    const { searchParams } = new URL(req.url);
    let amenityId = searchParams.get('amenityId');

    if (!amenityId) {
      try {
        const body = await req.json();
        amenityId = body.amenityId;
      } catch (e) {
        // no body
      }
    }

    if (!amenityId) {
      return NextResponse.json({ success: false, error: 'amenityId is required' }, { status: 400 });
    }

    await rentalListingService.removeAmenity(id, amenityId);
    const listing = await rentalListingService.getAdminListingById(id);
    revalidateRentalPaths({
      id,
      slug: listing?.slug,
      projectSlug: listing?.project?.slug,
      locationSlug: listing?.location?.slug ?? listing?.project?.location?.slug,
    });
    return NextResponse.json({ success: true, message: 'Amenity disassociated successfully' });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
