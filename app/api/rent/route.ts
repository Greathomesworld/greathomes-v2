import { NextRequest, NextResponse } from 'next/server';
import { verifyStaffCapability } from '@/src/domain/auth/capabilities';
import { rentalListingService } from '@/src/domain/projects/services/rentalService';
import { ensureSeedData } from '@/src/infrastructure/seed';
import { isPersistenceUnavailableError } from '@/src/lib/persistenceGuard';
import { auditService } from '@/src/domain/audit/auditService';

export async function GET(req: NextRequest) {
  try {
    await ensureSeedData();

    // Check staff authorization: either listing.read or MANAGE_RENTAL
    const authRead = await verifyStaffCapability(req, 'listing.read');
    const authManage = await verifyStaffCapability(req, 'MANAGE_RENTAL');
    const isInternalStaff = authRead.authorized || authManage.authorized;

    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId') || undefined;
    const propertyType = searchParams.get('propertyType') || undefined;
    const lifecycleStatus = searchParams.get('lifecycleStatus') || undefined;
    const verificationStatus = searchParams.get('verificationStatus') || undefined;
    const listingPartyType = searchParams.get('listingPartyType') || undefined;
    const bedroomCountParam = searchParams.get('bedroomCount');
    const bedroomCount = bedroomCountParam ? parseInt(bedroomCountParam, 10) : undefined;
    const minRentParam = searchParams.get('minRent');
    const minRent = minRentParam ? parseFloat(minRentParam) : undefined;
    const maxRentParam = searchParams.get('maxRent');
    const maxRent = maxRentParam ? parseFloat(maxRentParam) : undefined;

    const filter: any = {
      projectId,
      propertyType,
      lifecycleStatus,
      verificationStatus,
      listingPartyType,
      bedroomCount: !isNaN(bedroomCount as number) ? bedroomCount : undefined,
      minRent: !isNaN(minRent as number) ? minRent : undefined,
      maxRent: !isNaN(maxRent as number) ? maxRent : undefined,
    };

    if (isInternalStaff) {
      const adminListings = await rentalListingService.listAdminListings(filter);
      return NextResponse.json({ success: true, data: adminListings, total: adminListings.length });
    }

    // Public list - strictly published listings only, private fields stripped
    const publicListings = await rentalListingService.listPublicListings(filter);
    return NextResponse.json({ success: true, data: publicListings, total: publicListings.length });
  } catch (error: any) {
    if (isPersistenceUnavailableError(error)) {
      return NextResponse.json(
        { success: false, code: 'PERSISTENCE_UNAVAILABLE', error: 'Rental listing service is temporarily unavailable.' },
        { status: 503 }
      );
    }
    console.error('[Rent GET] Unexpected error:', error?.message || 'Unknown error');
    return NextResponse.json(
      { success: false, error: 'Failed to retrieve rental listings' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const authCreate = await verifyStaffCapability(req, 'listing.create');
  const authManage = await verifyStaffCapability(req, 'MANAGE_RENTAL');
  if (!authCreate.authorized && !authManage.authorized) {
    return NextResponse.json(
      { success: false, error: authCreate.error || 'Unauthorized' },
      { status: authCreate.status || 401 }
    );
  }

  try {
    await ensureSeedData();
    const body = await req.json();
    const listing = await rentalListingService.createListing(body);
    const staffActor = authCreate.authorized ? authCreate.staff : authManage.staff;
    await auditService.record(req, staffActor ? { id: staffActor.id, role: staffActor.role } : null, {
      action: 'CREATE_RENTAL_LISTING',
      resourceType: 'RENTAL_LISTING',
      resourceId: listing.id,
      success: true,
      metadata: { slug: listing.slug, projectId: listing.projectId },
    });
    return NextResponse.json({ success: true, data: listing }, { status: 201 });
  } catch (error: any) {
    if (isPersistenceUnavailableError(error)) {
      return NextResponse.json(
        { success: false, code: 'PERSISTENCE_UNAVAILABLE', error: 'Rental listing service is temporarily unavailable.' },
        { status: 503 }
      );
    }
    if (error?.name === 'ValidationError') {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    console.error('[Rent POST] Unexpected error:', error?.message || 'Unknown error');
    return NextResponse.json(
      { success: false, error: 'Failed to create rental listing' },
      { status: 500 }
    );
  }
}
