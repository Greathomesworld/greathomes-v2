import { NextRequest, NextResponse } from 'next/server';
import { rentalListingService } from '@/src/domain/projects/services/rentalService';
import { verifyStaffCapability } from '@/src/domain/auth/capabilities';
import { isPersistenceUnavailableError } from '@/src/lib/persistenceGuard';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const listings = await rentalListingService.getPublicListingsForProject(id);
    return NextResponse.json({ success: true, count: listings.length, listings });
  } catch (err: any) {
    if (isPersistenceUnavailableError(err)) {
      return NextResponse.json(
        { success: false, code: 'PERSISTENCE_UNAVAILABLE', error: 'Rental listing service is temporarily unavailable.' },
        { status: 503 }
      );
    }
    console.error('[Project Rent GET] Unexpected error:', err?.message || 'Unknown error');
    return NextResponse.json({ success: false, error: 'Failed to fetch rental listings.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, context: RouteContext) {
  const { auditService } = await import('@/src/domain/audit/auditService');
  const authResult = await verifyStaffCapability(req, 'rental.create');
  if (!authResult.authorized) {
    return NextResponse.json(
      { success: false, error: authResult.error || 'Forbidden' },
      { status: authResult.statusCode || authResult.status || 401 }
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON request body.' }, { status: 400 });
  }

  try {
    const { id } = await context.params;
    const listing = await rentalListingService.createListing({
      ...body,
      projectId: id,
    });
    await auditService.record(req, authResult.staff ? { id: authResult.staff.id, role: authResult.role } : null, {
      action: 'CREATE_RENTAL_LISTING',
      resourceType: 'RENTAL_LISTING',
      resourceId: listing.id,
      success: true,
      metadata: { projectId: id, slug: listing.slug },
    });
    return NextResponse.json({ success: true, listing }, { status: 201 });
  } catch (err: any) {
    if (isPersistenceUnavailableError(err)) {
      return NextResponse.json(
        { success: false, code: 'PERSISTENCE_UNAVAILABLE', error: 'Rental listing service is temporarily unavailable.' },
        { status: 503 }
      );
    }
    if (err?.name === 'ValidationError') {
      return NextResponse.json({ success: false, error: err.message }, { status: 400 });
    }
    console.error('[Project Rent POST] Unexpected error:', err?.message || 'Unknown error');
    return NextResponse.json({ success: false, error: 'Failed to create rental listing.' }, { status: 500 });
  }
}
