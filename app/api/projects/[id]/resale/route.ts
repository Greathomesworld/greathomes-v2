import { NextRequest, NextResponse } from 'next/server';
import { resaleListingService } from '@/src/domain/projects/services/resaleService';
import { verifyStaffCapability } from '@/src/domain/auth/capabilities';
import { isPersistenceUnavailableError } from '@/src/lib/persistenceGuard';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const listings = await resaleListingService.getPublicListingsForProject(id);
    return NextResponse.json({ success: true, data: listings });
  } catch (error: any) {
    if (isPersistenceUnavailableError(error)) {
      return NextResponse.json(
        { success: false, code: 'PERSISTENCE_UNAVAILABLE', error: 'Resale listing service is temporarily unavailable.' },
        { status: 503 }
      );
    }
    console.error('[Project Resale GET] Unexpected error:', error?.message || 'Unknown error');
    return NextResponse.json({ success: false, error: 'Failed to fetch resale listings.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, context: RouteContext) {
  const { auditService } = await import('@/src/domain/audit/auditService');
  const authResult = await verifyStaffCapability(req, 'resale.create');
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
    const listing = await resaleListingService.createListing({
      ...body,
      projectId: id,
    });

    await auditService.record(req, authResult.staff ? { id: authResult.staff.id, role: authResult.role } : null, {
      action: 'CREATE_RESALE_LISTING',
      resourceType: 'RESALE_LISTING',
      resourceId: listing.id,
      success: true,
      metadata: { projectId: id, slug: listing.slug },
    });

    return NextResponse.json({ success: true, data: listing }, { status: 201 });
  } catch (error: any) {
    if (isPersistenceUnavailableError(error)) {
      return NextResponse.json(
        { success: false, code: 'PERSISTENCE_UNAVAILABLE', error: 'Resale listing service is temporarily unavailable.' },
        { status: 503 }
      );
    }
    if (error?.name === 'ValidationError') {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    console.error('[Project Resale POST] Unexpected error:', error?.message || 'Unknown error');
    return NextResponse.json({ success: false, error: 'Failed to create resale listing.' }, { status: 500 });
  }
}
