import { NextRequest, NextResponse } from 'next/server';
import { verifyStaffCapability } from '@/src/domain/auth/capabilities';
import { resaleListingService } from '@/src/domain/projects/services/resaleService';
import { ensureSeedData } from '@/src/infrastructure/seed';

export async function GET(req: NextRequest) {
  try {
    await ensureSeedData();

    // Check staff authorization: either listing.read or MANAGE_RESALE
    const authRead = await verifyStaffCapability(req, 'listing.read');
    const authManage = await verifyStaffCapability(req, 'MANAGE_RESALE');
    const isInternalStaff = authRead.authorized || authManage.authorized;

    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId') || undefined;
    const propertyType = searchParams.get('propertyType') || undefined;
    const lifecycleStatus = searchParams.get('lifecycleStatus') || undefined;
    const verificationStatus = searchParams.get('verificationStatus') || undefined;
    const listingPartyType = searchParams.get('listingPartyType') || undefined;
    const bedroomCountParam = searchParams.get('bedroomCount');
    const bedroomCount = bedroomCountParam ? parseInt(bedroomCountParam, 10) : undefined;
    const minPriceParam = searchParams.get('minPrice');
    const minPrice = minPriceParam ? parseFloat(minPriceParam) : undefined;
    const maxPriceParam = searchParams.get('maxPrice');
    const maxPrice = maxPriceParam ? parseFloat(maxPriceParam) : undefined;

    const filter: any = {
      projectId,
      propertyType,
      lifecycleStatus,
      verificationStatus,
      listingPartyType,
      bedroomCount: !isNaN(bedroomCount as number) ? bedroomCount : undefined,
      minPrice: !isNaN(minPrice as number) ? minPrice : undefined,
      maxPrice: !isNaN(maxPrice as number) ? maxPrice : undefined,
    };

    if (isInternalStaff) {
      const adminListings = await resaleListingService.listAdminListings(filter);
      return NextResponse.json({ success: true, data: adminListings, total: adminListings.length });
    }

    // Public list - strictly published listings only, private fields stripped
    const publicListings = await resaleListingService.listPublicListings(filter);
    return NextResponse.json({ success: true, data: publicListings, total: publicListings.length });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to retrieve resale listings' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  // Check authorization: listing.create or MANAGE_RESALE
  const authCreate = await verifyStaffCapability(req, 'listing.create');
  const authManage = await verifyStaffCapability(req, 'MANAGE_RESALE');
  if (!authCreate.authorized && !authManage.authorized) {
    return NextResponse.json(
      { success: false, error: authCreate.error || 'Unauthorized' },
      { status: authCreate.status || 401 }
    );
  }

  try {
    await ensureSeedData();
    const body = await req.json();
    const listing = await resaleListingService.createListing(body);
    return NextResponse.json({ success: true, data: listing }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create resale listing' },
      { status: error.name === 'ValidationError' ? 400 : 500 }
    );
  }
}
